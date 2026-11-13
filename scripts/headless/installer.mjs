import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCurrentNodeEntrypoint } from "../../desktop/node-host-runtime.mjs";
import { createHeadlessServiceManager } from "./service-manager.mjs";
import { createHeadlessUpdateRunner, installHeadlessPayload } from "./update-runner.mjs";

const modulePath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(modulePath), "../..");
const actions = new Set(["install", "status", "start", "stop", "restart", "update", "rollback", "uninstall"]);

function integer(value, fallback, { name, minimum, maximum }) {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return parsed;
}

function defaultInstallRoot(platform, homeDirectory) {
  if (platform === "darwin") return path.join(homeDirectory, "Library", "Application Support", "One Person Lab", "Headless");
  if (platform === "linux") return path.join(homeDirectory, ".local", "share", "one-person-lab", "headless");
  return path.join(homeDirectory, "OnePersonLab", "Headless");
}

function readbackAddress(address) {
  return address.includes(":") ? `[${address}]` : address;
}

function assertLoopbackAddress(address) {
  if (!["127.0.0.1", "::1", "localhost"].includes(address.toLowerCase())) {
    throw new Error("Standalone Headless requires a loopback host until authenticated remote access is available");
  }
}

function optionalAbsolutePath(value, name) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || /[\0\r\n]/.test(value) || !path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute single-line path`);
  }
  return path.resolve(value);
}

async function installationRecord(installRoot) {
  return JSON.parse(await readFile(path.join(installRoot, "installation.json"), "utf8"));
}

async function waitForReadback({ baseUrl, fetch, sleep, timeoutMs, strict }) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  do {
    try {
      const readyResponse = await fetch(`${baseUrl}/readyz`);
      const ready = await readyResponse.json();
      if (!readyResponse.ok || ready.status !== "ready" || ready.appServerAvailable !== true) {
        throw new Error(`Headless readiness returned ${readyResponse.status}: ${ready.status ?? "unknown"}`);
      }
      const stateResponse = await fetch(`${baseUrl}/api/opl/state?profile=fast`);
      const appState = await stateResponse.json();
      if (!stateResponse.ok || appState?.readback?.exitCode !== 0 || !appState.app_state || typeof appState.app_state !== "object") {
        throw new Error(`OPL App state readback returned ${stateResponse.status} without owner state`);
      }
      return {
        status: "ready",
        ready,
        appState: {
          profile: appState.profile ?? "fast",
          surfaceKind: appState.app_state.surface_kind ?? appState.app_state.app_state?.surface_kind ?? null,
          readback: {
            exitCode: appState.readback.exitCode,
            timedOut: appState.readback.timedOut === true
          }
        }
      };
    } catch (error) {
      lastError = error;
    }
    if (Date.now() < deadline) await sleep(250);
  } while (Date.now() < deadline);
  if (strict) throw lastError ?? new Error("Headless readback timed out");
  return { status: "unavailable", message: lastError?.message ?? "Headless service is unavailable" };
}

function updateArguments(updateRunner, installRoot, operation) {
  return JSON.stringify([updateRunner, operation, "--install-root", installRoot]);
}

export function createHeadlessInstaller({
  platform = process.platform,
  homeDirectory = os.homedir(),
  sourceRoot = repositoryRoot,
  installRoot = defaultInstallRoot(platform, homeDirectory),
  nodeExecutable,
  env = process.env,
  fetch = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  createServiceManager = createHeadlessServiceManager,
  createUpdateRunner = createHeadlessUpdateRunner,
  installPayload = installHeadlessPayload,
  readbackTimeoutMs = 20_000
} = {}) {
  const source = path.resolve(sourceRoot);
  const root = path.resolve(installRoot);
  const nodeEntrypoint = nodeExecutable ?? resolveCurrentNodeEntrypoint({ env });
  const address = (env.OPL_HEADLESS_HOST ?? "127.0.0.1").trim();
  if (!address) throw new Error("OPL_HEADLESS_HOST must not be empty");
  assertLoopbackAddress(address);
  const port = integer(env.OPL_HEADLESS_PORT, 4178, { name: "OPL_HEADLESS_PORT", minimum: 1, maximum: 65_535 });
  const timeoutMs = integer(readbackTimeoutMs, 20_000, { name: "readbackTimeoutMs", minimum: 100, maximum: 120_000 });
  const current = path.join(root, "current");
  const headlessEntry = path.join(current, "scripts", "headless", "run.mjs");
  const updateRunner = path.join(current, "scripts", "headless", "update-runner.mjs");
  const baseUrl = `http://${readbackAddress(address)}:${port}`;

  function assertPlatform() {
    if (platform === "win32") throw new Error("Standalone Headless installation is not qualified for Windows");
    if (platform !== "darwin" && platform !== "linux") throw new Error(`Unsupported Headless installer platform: ${platform}`);
  }

  async function serviceManager() {
    const record = await installationRecord(root);
    const serviceEnvironment = {
      PATH: env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      CODEX_HOME: optionalAbsolutePath(env.CODEX_HOME, "CODEX_HOME"),
      OPL_APP_OPL_BIN: optionalAbsolutePath(env.OPL_APP_OPL_BIN, "OPL_APP_OPL_BIN"),
      OPL_APP_REPO_ROOT: optionalAbsolutePath(env.OPL_APP_REPO_ROOT, "OPL_APP_REPO_ROOT"),
      OPL_APP_STATE_TIMEOUT_MS: String(timeoutMs),
      OPL_CODEX_BIN: optionalAbsolutePath(env.OPL_CODEX_BIN, "OPL_CODEX_BIN"),
      OPL_HEADLESS_HOST: address,
      OPL_HEADLESS_PORT: String(port),
      OPL_HEADLESS_INSTALL_ROOT: root,
      OPL_STUDIO_CODEX_CWD: path.resolve(env.OPL_HEADLESS_WORKSPACE_ROOT ?? homeDirectory),
      OPL_WEBUI_ROOT: path.join(current, "dist", "webui"),
      OPL_NATIVE_APP_UPDATE_CARRIER: "standalone_headless_webui",
      OPL_NATIVE_APP_UPDATE_EXECUTABLE: path.resolve(nodeEntrypoint),
      OPL_NATIVE_APP_UPDATE_STATUS_ARGS_JSON: updateArguments(updateRunner, root, "status"),
      OPL_NATIVE_APP_UPDATE_CHECK_ARGS_JSON: updateArguments(updateRunner, root, "check"),
      OPL_NATIVE_APP_UPDATE_APPLY_ARGS_JSON: updateArguments(updateRunner, root, "apply"),
      OPL_NATIVE_APP_UPDATE_RESTART_ARGS_JSON: updateArguments(updateRunner, root, "restart")
    };
    return {
      manager: createServiceManager({
        platform,
        homeDirectory,
        nodeExecutable: path.resolve(nodeEntrypoint),
        headlessEntry,
        serviceEnvironment
      }),
      record
    };
  }

  async function readback(strict) {
    return waitForReadback({ baseUrl, fetch, sleep, timeoutMs: strict ? timeoutMs : Math.min(timeoutMs, 1_000), strict });
  }

  return {
    async run(action) {
      if (!actions.has(action)) throw new Error(`Unknown Headless installer action: ${action}`);
      assertPlatform();
      if (action === "install") {
        const installed = await installPayload({ sourceRoot: source, installRoot: root });
        const service = await serviceManager();
        const native = await service.manager.run("install");
        return {
          schema: "opl_headless_installer_result.v1",
          action,
          status: "installed",
          version: installed.version,
          installRoot: root,
          service: native,
          readback: await readback(true)
        };
      }
      const service = await serviceManager();
      if (action === "status") {
        return {
          schema: "opl_headless_installer_result.v1",
          action,
          status: "inspected",
          version: service.record.version,
          installRoot: root,
          service: await service.manager.run("status"),
          readback: await readback(false)
        };
      }
      if (action === "uninstall") {
        const native = await service.manager.run("uninstall");
        await rm(root, { recursive: true, force: true });
        return { schema: "opl_headless_installer_result.v1", action, status: "uninstalled", service: native };
      }
      if (action === "update" || action === "rollback") {
        const operation = action === "rollback" ? "rollback" : "apply";
        const successState = action === "rollback" ? "rolled_back" : "applied";
        const update = await createUpdateRunner({ installRoot: root, sourceRoot: source }).perform(operation);
        let native = null;
        let freshReadback = null;
        if (update.state === successState) {
          native = await service.manager.run("restart");
          freshReadback = await readback(true);
        }
        return {
          schema: "opl_headless_installer_result.v1",
          action,
          status: update.state === successState ? (action === "rollback" ? "rolled_back" : "updated") : `not_${action}`,
          version: update.state === successState ? update.targetVersion : service.record.version,
          update,
          service: native,
          readback: freshReadback
        };
      }
      const native = await service.manager.run(action);
      return {
        schema: "opl_headless_installer_result.v1",
        action,
        status: action === "stop" ? "stopped" : action === "start" ? "started" : "restarted",
        service: native,
        readback: action === "stop" ? null : await readback(true)
      };
    }
  };
}

function parseArguments(argv) {
  const [action, ...rest] = argv;
  if (!actions.has(action)) {
    throw new Error("Usage: install-headless.mjs <install|status|start|stop|restart|update|rollback|uninstall> [options]");
  }
  const options = {};
  const env = { ...process.env };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!value) throw new Error(`Missing value for ${flag ?? "option"}`);
    if (flag === "--source") options.sourceRoot = value;
    else if (flag === "--install-root") options.installRoot = value;
    else if (flag === "--host") env.OPL_HEADLESS_HOST = value;
    else if (flag === "--port") env.OPL_HEADLESS_PORT = value;
    else if (flag === "--workspace") env.OPL_HEADLESS_WORKSPACE_ROOT = value;
    else if (flag === "--readback-timeout-ms") options.readbackTimeoutMs = Number(value);
    else throw new Error(`Unknown installer option: ${flag}`);
  }
  return { action, options: { ...options, env } };
}

export async function main(argv = process.argv.slice(2)) {
  const { action, options } = parseArguments(argv);
  const result = await createHeadlessInstaller(options).run(action);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
