import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { ThreadAdapterError } from "@gaofeng21cn/opl-host-contracts/thread-error";

export const DSH_CUA_SERVER_NAME = "dsh_cua";
const SETTINGS_FILE = "opl-computer-use.json";
const CUA_HOME_DIR = "opl-cua-mcp";
const CUA_PROFILE_NAME = "cua-mcp";
const CUA_MCP_PACKAGE = "@deepseek-ai/dsh-cua-mcp";
const CUA_SETTINGS_MODES = new Set(["elicit", "allow"]);
const APP_ID_PATTERN = /^[a-f0-9]{64}$/;

const PERMISSION_COPY = {
  en: {
    instruction: "Drag {application} to the list above to allow {permission}",
    backLabel: "Back",
    finderLabel: "Show in Finder",
    unavailableMessage: "Application unavailable. Enable Computer Use again and retry.",
    settingsMessage: "Open System Settings > Privacy & Security > {permission} manually.",
    accessibility: "Accessibility",
    screenRecording: "Screen Recording"
  },
  zh: {
    instruction: "将 {application} 拖入上方列表以允许{permission}",
    backLabel: "返回",
    finderLabel: "在 Finder 中显示",
    unavailableMessage: "找不到此应用。请重新启用 Computer Use 后重试",
    settingsMessage: "请手动打开系统设置 > 隐私与安全性 > {permission}",
    accessibility: "辅助功能",
    screenRecording: "屏幕录制"
  }
};

function createStudioRequire(installAnchor) {
  if (installAnchor) {
    try {
      return createRequire(installAnchor);
    } catch {
      // Fallback to module location below.
    }
  }
  return createRequire(import.meta.url);
}

function preferUnpackedPath(candidatePath) {
  const unpacked = candidatePath.replace(/([\\/])app\.asar(?=[\\/])/u, "$1app.asar.unpacked");
  if (unpacked !== candidatePath && fs.existsSync(unpacked)) {
    return unpacked;
  }
  return candidatePath;
}

export function resolveDshCliEntry({ installAnchor } = {}) {
  try {
    const req = createStudioRequire(installAnchor);
    const pkgPath = req.resolve("@deepseek-ai/dsh/package.json");
    const entry = preferUnpackedPath(path.join(path.dirname(pkgPath), "lib", "bin.js"));
    return fs.existsSync(entry) ? entry : null;
  } catch {
    return null;
  }
}

export function resolveBundledCuaHelper({
  installAnchor,
  platform = process.platform,
  arch = process.arch
} = {}) {
  if (platform !== "darwin") return null;
  try {
    const req = createStudioRequire(installAnchor);
    const pkgPath = req.resolve("@deepseek-ai/dsh-cua-macos/package.json");
    const pkgRoot = path.dirname(pkgPath).replace(/([\\/])app\.asar(?=[\\/])/u, "$1app.asar.unpacked");
    const targetArch = arch === "arm64" ? "arm64" : "x64";
    const binDir = path.join(pkgRoot, "native", "bin", `darwin-${targetArch}`);
    const current = JSON.parse(fs.readFileSync(path.join(binDir, "current.json"), "utf8"));
    const bundle = typeof current?.bundle === "string" && current.bundle.trim() ? current.bundle.trim() : null;
    if (!bundle) return null;
    const helperAppPath = path.join(binDir, bundle, "DSH Computer Use.app");
    const helperPath = path.join(helperAppPath, "Contents", "MacOS", "dsh-cua-native");
    if (!fs.existsSync(helperPath)) return null;
    return { helperPath, helperAppPath, bundle };
  } catch {
    return null;
  }
}

export function resolveCuaHome(dshHome) {
  return dshHome ? path.join(dshHome, CUA_HOME_DIR) : null;
}

export function resolveCuaProfileDir(dshHome) {
  const cuaHome = resolveCuaHome(dshHome);
  return cuaHome ? path.join(cuaHome, "profiles", CUA_PROFILE_NAME) : null;
}

export function resolveCuaWorkspace(dshHome) {
  const cuaHome = resolveCuaHome(dshHome);
  return cuaHome ? path.join(cuaHome, "workspace") : null;
}

export function ensureCuaMcpProfile(dshHome) {
  const cuaHome = resolveCuaHome(dshHome);
  if (!cuaHome) return null;
  const profileDir = resolveCuaProfileDir(dshHome);
  const workspace = resolveCuaWorkspace(dshHome);
  const storages = path.join(cuaHome, "storages");
  fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });
  fs.mkdirSync(storages, { recursive: true, mode: 0o700 });
  const manifestPath = path.join(profileDir, "package.json");
  const expected = JSON.stringify({
    name: "dsh-profile-cua-mcp",
    private: true,
    dependencies: {},
    dsh: {
      profile: {
        bundles: [CUA_MCP_PACKAGE]
      }
    }
  }, null, 2) + "\n";
  let existing = null;
  try {
    existing = fs.readFileSync(manifestPath, "utf8");
  } catch {
    // Missing or unreadable manifest will be recreated below.
  }
  if (existing !== expected) {
    const tmp = `${manifestPath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, expected, { mode: 0o600 });
    fs.renameSync(tmp, manifestPath);
  }
  return { cuaHome, profileDir, workspace, storages };
}

export function defaultComputerUseSettings(platform = process.platform) {
  return {
    enabled: platform === "darwin",
    consentMode: "elicit"
  };
}

export function readComputerUseSettings(dshHome, platform = process.platform) {
  const defaults = defaultComputerUseSettings(platform);
  if (!dshHome) return defaults;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dshHome, SETTINGS_FILE), "utf8"));
    return {
      enabled: typeof parsed?.enabled === "boolean" ? parsed.enabled : defaults.enabled,
      consentMode: CUA_SETTINGS_MODES.has(parsed?.consentMode) ? parsed.consentMode : defaults.consentMode
    };
  } catch {
    return defaults;
  }
}

export async function writeComputerUseSettings(dshHome, { enabled, consentMode }, platform = process.platform) {
  if (!dshHome) {
    throw new ThreadAdapterError("dsh_home_unavailable", "Studio DSH home is unavailable", {}, 503);
  }
  const current = readComputerUseSettings(dshHome, platform);
  const next = {
    enabled: typeof enabled === "boolean" ? enabled : current.enabled,
    consentMode: consentMode === undefined ? current.consentMode : consentMode
  };
  if (!CUA_SETTINGS_MODES.has(next.consentMode)) {
    throw new ThreadAdapterError("invalid_request", `Unsupported Computer Use consent mode: ${String(next.consentMode)}`, {}, 400);
  }
  await mkdir(dshHome, { recursive: true, mode: 0o700 });
  await writeFileAtomic(path.join(dshHome, SETTINGS_FILE), JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  return next;
}

export function codexArgsWithComputerUse(baseArgs, config) {
  if (!config?.enabled || !config.cuaHome || !config.dshCliEntry || !config.command) {
    return [...baseArgs];
  }
  const consentMode = CUA_SETTINGS_MODES.has(config.consentMode) ? config.consentMode : "elicit";
  const workspace = config.workspace || path.join(config.cuaHome, "workspace");
  const args = [
    ...baseArgs,
    "-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.command=${JSON.stringify(config.command)}`,
    "-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.args=${JSON.stringify([config.dshCliEntry, "--profile", CUA_PROFILE_NAME])}`,
    "-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.env.DSH_HOME=${JSON.stringify(config.cuaHome)}`,
    "-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.env.DSH_CUA_CONSENT=${JSON.stringify(consentMode)}`,
    "-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.env.DSH_CUA_WORKSPACE=${JSON.stringify(workspace)}`,
    "-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.env.ELECTRON_RUN_AS_NODE="1"`,
    "-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.required=false`,
    "-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.startup_timeout_sec=30`,
    "-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.tool_timeout_sec=120`,
    "-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.enabled_tools=${JSON.stringify(["cua_get_api_reference", "cua_run_code", "cua_reset"])}`,
    "-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.omit_tools_from=${JSON.stringify(["code_mode", "deferred"])}`,
    "-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.tools.cua_run_code.output_token_limit=25000`
  ];
  if (consentMode === "allow") {
    args.push("-c", `mcp_servers.${DSH_CUA_SERVER_NAME}.tools.cua_run_code.approval_mode="approve"`);
  }
  return args;
}

function buildPermissionParams(method, permission, locale = "en") {
  const language = String(locale).toLowerCase().replace(/-.*/, "");
  const copy = PERMISSION_COPY[language] ?? PERMISSION_COPY.en;
  const permissionLabel = copy[permission] ?? permission;
  const settingsMessage = copy.settingsMessage.replace("{permission}", permissionLabel);
  if (method === "openPermissionSettings") {
    return { permission, settingsMessage };
  }
  return {
    permission,
    settingsMessage,
    pollIntervalMs: 1000,
    instruction: copy.instruction.replace("{permission}", permissionLabel),
    backLabel: copy.backLabel,
    finderLabel: copy.finderLabel,
    unavailableMessage: copy.unavailableMessage
  };
}

async function ensureRuntimeDirectory() {
  const uid = process.getuid();
  const directory = `/tmp/dsh-cua-${uid}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== uid) {
    throw new ThreadAdapterError("cua_runtime_directory_invalid", "Native CUA runtime directory must be owned by current user", {}, 500);
  }
  return directory;
}

export async function callNativeHelper(helperPath, method, params = {}, { timeoutMs = 15_000 } = {}) {
  if (!helperPath) {
    throw new ThreadAdapterError("cua_helper_unavailable", "Bundled DSH Computer Use helper is unavailable", {}, 503);
  }
  const realHelper = await realpath(helperPath);
  const runtimeKey = createHash("sha256").update(await readFile(realHelper)).digest("hex");
  const directory = await ensureRuntimeDirectory();
  const startup = spawnSync(
    realHelper,
    ["--ensure-shared", "--runtime-key", runtimeKey, "--runtime-directory", directory, "--startup-timeout-ms", "10000"],
    { encoding: "utf8", timeout: 12_000 }
  );
  if (startup.status !== 0) {
    throw new ThreadAdapterError(
      "cua_helper_start_failed",
      startup.stderr?.trim() || startup.error?.message || "Failed to launch DSH Computer Use helper",
      {},
      503
    );
  }
  const socketPath = path.join(directory, `${runtimeKey}.sock`);
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    const rpcId = `studio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new ThreadAdapterError("cua_helper_timeout", `Native CUA request ${method} timed out`, {}, 504));
    }, timeoutMs);
    let buffer = "";
    let handshaken = false;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.end();
      fn(value);
    };
    socket.on("connect", () => {
      socket.write(JSON.stringify({
        type: "hello",
        protocol: 1,
        runtimeKey,
        config: {
          maxRequestBytes: 1048576,
          maxResponseBytes: 33554432,
          axTimeoutMs: 5000,
          textEventIntervalMs: 10,
          maxClickHoldMs: 5000,
          screenshotTimeoutMs: 10000,
          timeoutMs: 10000,
          graceMs: 1000,
          recentActivityWindowMs: "off"
        }
      }) + "\n");
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (!handshaken && msg?.type === "ready") {
          handshaken = true;
          socket.write(JSON.stringify({ id: rpcId, method, params }) + "\n");
        } else if (handshaken && msg?.id === rpcId) {
          if (msg.error) {
            finish(reject, new ThreadAdapterError("cua_helper_error", msg.error.message || "Native CUA request failed", { rpcError: msg.error }, 502));
          } else {
            finish(resolve, msg.result);
          }
          return;
        }
      }
    });
    socket.on("error", (error) => {
      finish(reject, new ThreadAdapterError("cua_helper_socket_error", error.message, {}, 503));
    });
  });
}

export async function inspectNativePermissions({ helper, platform = process.platform, nativeControl } = {}) {
  if (platform !== "darwin") {
    return {
      status: "unsupported",
      accessibility: false,
      screenRecording: false,
      helperAppPath: null,
      helperBundle: null,
      error: null
    };
  }
  if (!helper?.helperPath) {
    return {
      status: "unavailable",
      accessibility: false,
      screenRecording: false,
      helperAppPath: null,
      helperBundle: null,
      error: "Bundled DSH Computer Use helper is unavailable"
    };
  }
  try {
    const result = nativeControl?.inspectPermissions
      ? await nativeControl.inspectPermissions(helper.helperPath)
      : await callNativeHelper(helper.helperPath, "permissionStatus", {});
    const accessibility = result?.accessibility === true;
    const screenRecording = result?.screenRecording === true;
    return {
      status: accessibility && screenRecording ? "ready" : "permission_required",
      accessibility,
      screenRecording,
      helperAppPath: result?.launchApplication?.path ?? helper.helperAppPath,
      helperBundle: helper.bundle ?? null,
      error: null
    };
  } catch (error) {
    return {
      status: "unavailable",
      accessibility: false,
      screenRecording: false,
      helperAppPath: helper.helperAppPath,
      helperBundle: helper.bundle ?? null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function requestNativePermission({ helper, permission, locale = "en", nativeControl } = {}) {
  if (permission !== "accessibility" && permission !== "screenRecording") {
    throw new ThreadAdapterError("invalid_request", `Unknown macOS permission: ${String(permission)}`, {}, 400);
  }
  if (!helper?.helperPath) {
    throw new ThreadAdapterError("cua_helper_unavailable", "Bundled DSH Computer Use helper is unavailable", {}, 503);
  }
  const params = buildPermissionParams("requestPermission", permission, locale);
  if (nativeControl?.requestPermission) {
    return await nativeControl.requestPermission(helper.helperPath, params);
  }
  return await callNativeHelper(helper.helperPath, "requestPermission", params, { timeoutMs: 65_000 });
}

export async function openNativePermissionSettings({ helper, permission, locale = "en", nativeControl } = {}) {
  if (permission !== "accessibility" && permission !== "screenRecording") {
    throw new ThreadAdapterError("invalid_request", `Unknown macOS permission: ${String(permission)}`, {}, 400);
  }
  if (!helper?.helperPath) {
    throw new ThreadAdapterError("cua_helper_unavailable", "Bundled DSH Computer Use helper is unavailable", {}, 503);
  }
  const params = buildPermissionParams("openPermissionSettings", permission, locale);
  if (nativeControl?.openSettings) {
    return await nativeControl.openSettings(helper.helperPath, params);
  }
  return await callNativeHelper(helper.helperPath, "openPermissionSettings", params);
}

async function resolveStorageUnitLocation(dshHome) {
  const cuaHome = resolveCuaHome(dshHome);
  const profileDir = resolveCuaProfileDir(dshHome);
  if (!cuaHome || !profileDir) return null;
  let realProfileDir;
  try {
    realProfileDir = await realpath(profileDir);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  const unitName = `cua_permissions_${createHash("sha256").update(realProfileDir).digest("hex")}`;
  return {
    cuaHome,
    realProfileDir,
    unitName,
    filePath: path.join(cuaHome, "storages", `${unitName}.json`)
  };
}

function readUnitState(filePath, unitName) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const global = parsed?.global;
    if (global && typeof global === "object" && typeof global.applications === "object" && global.applications !== null) {
      return {
        migrated: typeof global.migrated === "boolean" ? global.migrated : true,
        applications: global.applications
      };
    }
  } catch {
    // Missing or unreadable unit defaults to empty state.
  }
  return { migrated: true, applications: {} };
}

async function writeUnitState(location, state) {
  await mkdir(path.dirname(location.filePath), { recursive: true, mode: 0o700 });
  const document = {
    unit: { name: location.unitName, version: 1 },
    global: state,
    tables: {}
  };
  await writeFileAtomic(location.filePath, JSON.stringify(document, null, 2) + "\n", { mode: 0o600 });
}

export async function readSavedAppPermissions(dshHome) {
  const location = await resolveStorageUnitLocation(dshHome);
  if (!location || !fs.existsSync(location.filePath)) {
    return { allowedApps: [], blockedApps: [] };
  }
  return await withFileLock(path.join(location.realProfileDir, "cua-permissions"), async () => {
    const state = readUnitState(location.filePath, location.unitName);
    const allowedApps = [];
    const blockedApps = [];
    for (const app of Object.values(state.applications)) {
      if (app?.always) {
        allowedApps.push(app.always);
      } else if (app?.sessions && typeof app.sessions === "object") {
        const denied = Object.values(app.sessions).find((session) => session?.decision === "deny");
        if (denied?.identity) {
          blockedApps.push(denied.identity);
        }
      }
    }
    return { allowedApps, blockedApps };
  }, { waitMs: 10_000 });
}

export async function revokeSavedAppPermission(dshHome, appId) {
  if (typeof appId !== "string" || !APP_ID_PATTERN.test(appId)) {
    throw new ThreadAdapterError("invalid_request", "Invalid Computer Use application identity", {}, 400);
  }
  const location = await resolveStorageUnitLocation(dshHome);
  if (!location) return;
  await withFileLock(path.join(location.realProfileDir, `cua-application-${appId}`), async () => {
    await withFileLock(path.join(location.realProfileDir, "cua-permissions"), async () => {
      if (!fs.existsSync(location.filePath)) return;
      const state = readUnitState(location.filePath, location.unitName);
      const app = state.applications[appId];
      if (!app) return;
      const sessions = Object.fromEntries(
        Object.entries(app.sessions ?? {}).map(([sessionId, session]) => [
          sessionId,
          { ...session, decision: "deny", revision: (session?.revision ?? 0) + 1 }
        ])
      );
      state.applications[appId] = {
        revoked: (app.revoked ?? 0) + 1,
        sessions
      };
      await writeUnitState(location, state);
    }, { waitMs: 10_000 });
  }, { waitMs: 10_000 });
}

export async function retrySavedAppPermission(dshHome, appId) {
  if (typeof appId !== "string" || !APP_ID_PATTERN.test(appId)) {
    throw new ThreadAdapterError("invalid_request", "Invalid Computer Use application identity", {}, 400);
  }
  const location = await resolveStorageUnitLocation(dshHome);
  if (!location) return;
  await withFileLock(path.join(location.realProfileDir, "cua-permissions"), async () => {
    if (!fs.existsSync(location.filePath)) return;
    const state = readUnitState(location.filePath, location.unitName);
    const app = state.applications[appId];
    if (!app?.sessions || !Object.values(app.sessions).some((session) => session?.decision === "deny")) {
      return;
    }
    const sessions = Object.fromEntries(
      Object.entries(app.sessions).map(([sessionId, session]) => [
        sessionId,
        session?.decision === "deny"
          ? { ...session, decision: "ask", revision: (session?.revision ?? 0) + 1 }
          : session
      ])
    );
    state.applications[appId] = { ...app, sessions };
    await writeUnitState(location, state);
  }, { waitMs: 10_000 });
}
