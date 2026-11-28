import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { resolveHostNode } from "./node-host-runtime.mjs";
import { codexOfflineSeedEnvironment } from "./codex-offline-seed.mjs";
import { safeDesktopErrorMessage } from "../packages/host-kit/official-profile.mjs";

const FULL_RUNTIME_RESOURCE_DIR = "opl-studio-full-runtime";
const FULL_RUNTIME_MANIFEST = "full-package-manifest.json";
const OFFLINE_SEED_SCHEMA = "opl_full_offline_seed.v1";
const OFFLINE_SEED_FORMAT = "tar.zst";
const OFFLINE_SEED_RELATIVE_PATH = "opl-offline-seed.tar.zst";
const STANDARD_BOOTSTRAP_RESOURCE_DIR = "opl-framework-bootstrap";
const STANDARD_BOOTSTRAP_MANIFEST = "manifest.json";
const STANDARD_BOOTSTRAP_INSTALLER = "opl-install.sh";
const INSTALL_MARKER = ".opl-studio-full-runtime-installed.json";
const ACTIVE_RUNTIME_DIR = "current";
const ACTIVE_RUNTIME_POINTER = "current.json";
const OFFICIAL_PROFILE_INTENT = ".official-profile-first-install-intent.json";
const OFFICIAL_PROFILE_ATTEMPT = ".official-profile-first-install-attempt.json";
const OFFICIAL_PROFILE_COMPLETE = ".official-profile-first-install-complete";
const SYSTEM_PATH_ENTRIES = process.platform === "win32"
  ? []
  : ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

function readJsonRecord(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function sha256FileStream(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function validSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

async function extractOfflineSeedArchive(archivePath, targetDir) {
  await fs.promises.mkdir(targetDir, { recursive: true });
  const tarChild = spawn("tar", ["-xf", "-", "-C", targetDir], { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  tarChild.stderr.setEncoding("utf8");
  tarChild.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitPromise = new Promise((resolve, reject) => {
    tarChild.once("error", reject);
    tarChild.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Studio Full offline seed tar extraction failed (${signal ?? `exit ${code}`}): ${stderr.trim() || "corrupt archive"}`));
    });
  });
  const ignoreStdinError = () => {};
  tarChild.stdin.on("error", ignoreStdinError);
  try {
    await Promise.all([
      exitPromise,
      pipeline(fs.createReadStream(archivePath), zlib.createZstdDecompress(), tarChild.stdin)
    ]);
  } catch (error) {
    if (tarChild.exitCode === null && tarChild.signalCode === null) {
      tarChild.kill("SIGKILL");
    }
    await exitPromise.catch(() => {});
    throw error;
  } finally {
    tarChild.stdin.off("error", ignoreStdinError);
  }
}

function uniquePathEntries(values) {
  const seen = new Set();
  const entries = [];
  for (const value of values) {
    for (const entry of String(value ?? "").split(path.delimiter)) {
      const normalized = entry.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      entries.push(normalized);
    }
  }
  return entries;
}

function resolvePythonBin(runtimeHome) {
  const root = path.join(runtimeHome, "python");
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("cpython-"))
      .map((entry) => path.join(root, entry.name, "bin"))
      .filter((entry) => fs.existsSync(entry))
      .sort()
      .reverse()[0] ?? null;
  } catch {
    return null;
  }
}

function runtimeRoot(homeDir, identity = "preview") {
  if (identity === "stable") return path.join(homeDir, "Library", "Application Support", "OPL", "runtime");
  return path.join(homeDir, "Library", "Application Support", "opl-studio", "runtime");
}

function runtimeHome(homeDir, identity) {
  return path.join(runtimeRoot(homeDir, identity), ACTIVE_RUNTIME_DIR);
}

function pointerPath(homeDir, identity) {
  return path.join(runtimeRoot(homeDir, identity), ACTIVE_RUNTIME_POINTER);
}

function assertRuntimePackageRoot(packageRoot) {
  const packageJson = readJsonRecord(path.join(packageRoot, "package.json"));
  if (packageJson?.name !== "opl-framework") {
    throw new Error("Studio Full runtime does not contain the opl-framework Package");
  }
}

function isUsableRuntime(candidate) {
  try {
    return fs.statSync(candidate).isDirectory()
      && fs.statSync(path.join(candidate, "bin", "opl")).isFile()
      && fs.statSync(path.join(candidate, "opl")).isDirectory();
  } catch {
    return false;
  }
}

async function resolvePayload(resourcesPath, identity) {
  const resourceRoot = path.join(resourcesPath, FULL_RUNTIME_RESOURCE_DIR);
  const manifestPath = path.join(resourceRoot, "manifest", FULL_RUNTIME_MANIFEST);
  const manifest = readJsonRecord(manifestPath);
  if (!manifest) return null;
  if (
    manifest.carrier?.schema !== "opl_app_full_payload_carrier_profile.v1"
    || manifest.carrier?.carrier_id !== "opl-studio"
    || manifest.carrier?.runtime_resource_dir !== FULL_RUNTIME_RESOURCE_DIR
    || manifest.carrier?.runtime_install_root_template !== (identity === "stable" ? "~/Library/Application Support/OPL/runtime/current" : "~/Library/Application Support/opl-studio/runtime/current")
    || manifest.carrier?.codex_carrier !== "opl_codex_native"
    || manifest.carrier?.full_runtime_codex_payload_allowed !== false
  ) {
    throw new Error("Studio Full runtime carrier manifest does not match the App-owned contract");
  }
  const version = typeof manifest.version === "string" ? manifest.version.trim() : "";
  if (!version) throw new Error("Studio Full runtime manifest is missing a version");
  const markerName = identity === "stable" ? ".opl-full-runtime-installed.json" : INSTALL_MARKER;
  const manifestSha256 = sha256File(manifestPath);

  if (manifest.offline_seed !== undefined) {
    const seed = manifest.offline_seed;
    if (
      !seed
      || typeof seed !== "object"
      || Array.isArray(seed)
      || seed.schema !== OFFLINE_SEED_SCHEMA
      || seed.format !== OFFLINE_SEED_FORMAT
      || typeof seed.relative_path !== "string"
      || seed.relative_path !== OFFLINE_SEED_RELATIVE_PATH
      || !Number.isSafeInteger(seed.size_bytes)
      || seed.size_bytes <= 0
      || !validSha256(seed.sha256)
    ) {
      throw new Error("Studio Full offline seed manifest metadata is invalid");
    }
    const resolvedResourceRoot = path.resolve(resourceRoot);
    const archivePath = path.resolve(resolvedResourceRoot, seed.relative_path);
    if (!archivePath.startsWith(`${resolvedResourceRoot}${path.sep}`)) {
      throw new Error("Studio Full offline seed archive path escapes the runtime resource directory");
    }
    let stat = null;
    try {
      stat = fs.statSync(archivePath);
    } catch {
      stat = null;
    }
    if (!stat?.isFile()) {
      throw new Error("Studio Full offline seed archive is missing");
    }
    if (stat.size !== seed.size_bytes) {
      throw new Error(`Studio Full offline seed archive size mismatch: expected ${seed.size_bytes}, got ${stat.size}`);
    }
    const actualSha256 = await sha256FileStream(archivePath);
    if (actualSha256 !== seed.sha256.toLowerCase()) {
      throw new Error("Studio Full offline seed archive sha256 mismatch");
    }
    return {
      kind: "offline_seed_archive",
      version,
      archivePath,
      manifestPath,
      manifestSha256,
      markerName
    };
  }

  const payloadRoot = path.join(resourceRoot, "runtime", ACTIVE_RUNTIME_DIR);
  if (!isUsableRuntime(payloadRoot)) {
    throw new Error("Studio Full runtime payload is incomplete");
  }
  assertRuntimePackageRoot(path.join(payloadRoot, "opl"));
  return { kind: "directory", version, payloadRoot, manifestPath, manifestSha256, markerName };
}

function resolveStandardBootstrap(resourcesPath) {
  const resourceRoot = path.join(resourcesPath, STANDARD_BOOTSTRAP_RESOURCE_DIR);
  const manifestPath = path.join(resourceRoot, STANDARD_BOOTSTRAP_MANIFEST);
  const manifest = readJsonRecord(manifestPath);
  if (!manifest) return null;
  if (
    manifest.schema !== "opl_studio_standard_framework_bootstrap.v1"
    || typeof manifest.framework_ref !== "string"
    || !/^[0-9a-f]{40}$/.test(manifest.framework_ref)
    || manifest.installer_path !== "resources/opl-framework-bootstrap/opl-install.sh"
    || !validSha256(manifest.installer_sha256)
    || !Number.isSafeInteger(manifest.installer_size_bytes)
    || manifest.installer_size_bytes <= 0
    || manifest.active_shell_adopted !== false
  ) {
    throw new Error("Studio Standard Framework bootstrap manifest does not match the App-owned contract");
  }
  const installerPath = path.join(resourceRoot, STANDARD_BOOTSTRAP_INSTALLER);
  const stat = fs.statSync(installerPath);
  if (!stat.isFile() || stat.size !== manifest.installer_size_bytes || sha256File(installerPath) !== manifest.installer_sha256) {
    throw new Error("Studio Standard Framework bootstrap installer does not match its App-owned manifest");
  }
  return { manifest, manifestPath, installerPath };
}

function markerMatches(target, manifestSha256, markerName = INSTALL_MARKER) {
  return readJsonRecord(path.join(target, markerName))?.manifest_sha256 === manifestSha256;
}

async function makeOwnerWritable(root) {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    const stat = await fs.promises.lstat(current);
    if (stat.isSymbolicLink()) continue;
    if ((stat.mode & 0o200) === 0) await fs.promises.chmod(current, stat.mode | 0o200);
    if (stat.isDirectory()) {
      for (const entry of await fs.promises.readdir(current)) pending.push(path.join(current, entry));
    }
  }
}

async function removeQuarantine(root, platform) {
  if (platform !== "darwin") return;
  const result = await new Promise((resolve) => {
    const child = spawn("xattr", ["-dr", "com.apple.quarantine", root], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => resolve({ status: -1, stdout, stderr: `${stderr}${error.message}` }));
    child.once("exit", (status) => resolve({ status, stdout, stderr }));
  });
  const detail = `${result.stderr ?? ""}${result.stdout ?? ""}`;
  if (result.status !== 0 && !/No such xattr/i.test(detail)) {
    throw new Error(`Failed to remove quarantine from Studio Full runtime: ${detail.trim()}`);
  }
}

function parseStableSemver(value) {
  const match = typeof value === "string" ? value.trim().match(/^(\d+)\.(\d+)\.(\d+)$/) : null;
  return match ? match.slice(1).map(Number) : null;
}

function isStrictlyNewerVersion(candidate, baseline) {
  const left = parseStableSemver(candidate);
  const right = parseStableSemver(baseline);
  if (!left || !right) return false;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i];
  }
  return false;
}

function shouldPreservePendingFramework(target, payloadRoot) {
  const pendingRoot = path.join(target, "opl.pending");
  const pendingMeta = readJsonRecord(path.join(target, "opl.pending.json"));
  const pendingPkg = readJsonRecord(path.join(pendingRoot, "package.json"));
  const incomingPkg = readJsonRecord(path.join(payloadRoot, "opl", "package.json"));
  return pendingMeta?.surface_kind === "opl_framework_pending_generation.v1"
    && pendingPkg?.name === "opl-framework"
    && isStrictlyNewerVersion(pendingPkg.version, incomingPkg?.version);
}

async function installPayload({ payload, target, platform }) {
  if (isUsableRuntime(target) && markerMatches(target, payload.manifestSha256, payload.markerName)) return;
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const suffix = `${process.pid}-${Date.now()}`;
  const temporary = `${target}.tmp-${suffix}`;
  const previous = `${target}.previous-${suffix}`;
  await fs.promises.rm(temporary, { recursive: true, force: true });
  await fs.promises.rm(previous, { recursive: true, force: true });
  try {
    let incomingRoot;
    if (payload.kind === "offline_seed_archive") {
      await extractOfflineSeedArchive(payload.archivePath, temporary);
      if (!isUsableRuntime(temporary)) {
        throw new Error("Studio Full runtime offline seed payload is incomplete");
      }
      assertRuntimePackageRoot(path.join(temporary, "opl"));
      incomingRoot = temporary;
    } else {
      await fs.promises.cp(payload.payloadRoot, temporary, {
        recursive: true,
        dereference: false,
        verbatimSymlinks: true,
        mode: fs.constants.COPYFILE_FICLONE,
        preserveTimestamps: true
      });
      incomingRoot = payload.payloadRoot;
    }
    await makeOwnerWritable(temporary);
    // Native Package installations live in their owner-managed carriers, outside
    // this bootstrap seed. Never merge old seed modules/skills into new bytes.
    // Keep a staged Framework activation transaction only when it is strictly
    // newer than the incoming Full payload, and copy it after makeOwnerWritable
    // so its file modes and integrity digest stay unchanged.
    if (shouldPreservePendingFramework(target, incomingRoot)) {
      for (const name of ["opl.pending", "opl.pending.json"]) {
        const current = path.join(target, name);
        if (!fs.existsSync(current)) continue;
        await fs.promises.cp(current, path.join(temporary, name), {
          recursive: true, dereference: false, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE, preserveTimestamps: true
        });
      }
    }
    await removeQuarantine(temporary, platform);
    await fs.promises.writeFile(path.join(temporary, payload.markerName ?? INSTALL_MARKER), `${JSON.stringify({
      version: payload.version,
      manifest_sha256: payload.manifestSha256,
      installed_at: new Date().toISOString(),
      ...(payload.kind === "offline_seed_archive" ? { source_kind: "offline_seed_archive" } : {})
    }, null, 2)}\n`, "utf8");
    if (fs.existsSync(target)) await fs.promises.rename(target, previous);
    await fs.promises.rename(temporary, target);
    await fs.promises.rm(previous, { recursive: true, force: true }).catch(() => {});
  } catch (error) {
    if (!fs.existsSync(target) && fs.existsSync(previous)) await fs.promises.rename(previous, target);
    await fs.promises.rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

function writePointer(homeDir, runtime, version, manifestSha256, source, identity) {
  const target = pointerPath(homeDir, identity);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({
    runtime_version: version,
    runtime_home: runtime,
    manifest_sha256: manifestSha256,
    activated_at: new Date().toISOString(),
    source
  }, null, 2)}\n`, "utf8");
}

function buildRuntimeEnvironment(runtime, env) {
  const frameworkRoot = path.join(runtime, "opl");
  const pythonBin = resolvePythonBin(runtime);
  const runtimePath = uniquePathEntries([
    path.join(runtime, "bin"),
    path.join(runtime, "node", "bin"),
    path.join(runtime, "uv", "bin"),
    pythonBin,
    ...SYSTEM_PATH_ENTRIES,
    env.PATH
  ]).join(path.delimiter);
  const result = {
    ...env,
    PATH: runtimePath,
    OPL_APP_OPL_BIN: path.join(runtime, "bin", "opl"),
    OPL_FULL_RUNTIME_HOME: runtime,
    OPL_FRAMEWORK_PACKAGE_ROOT: frameworkRoot,
    OPL_FRAMEWORK_UPDATE_TARGET_ROOT: frameworkRoot,
    OPL_PACKAGED_SKILLS_ROOT: path.join(runtime, "skills"),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: path.join(runtime, "modules", "mas"),
    OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS: path.join(runtime, "modules", "mas-scholar-skills"),
    OPL_MODULE_PATH_MEDAUTOGRANT: path.join(runtime, "modules", "mag"),
    OPL_MODULE_PATH_REDCUBE: path.join(runtime, "modules", "rca"),
    OPL_MODULE_PATH_OPLMETAAGENT: path.join(runtime, "modules", "meta-agent"),
    OPL_MODULE_PATH_OPLBOOKFORGE: path.join(runtime, "modules", "bookforge"),
    OPL_FLOW_REPO_ROOT: path.join(runtime, "modules", "opl-flow")
  };
  const hermes = path.join(runtime, "bin", "hermes");
  if (fs.existsSync(hermes)) result.OPL_HERMES_BIN = hermes;
  return codexOfflineSeedEnvironment(runtime, result);
}

function installedFrameworkRoot(homeDir) {
  return path.join(homeDir, ".opl", "one-person-lab");
}

function installedFrameworkEnvironment(homeDir, env) {
  const frameworkRoot = installedFrameworkRoot(homeDir);
  const oplBin = path.join(homeDir, ".local", "bin", "opl");
  if (readJsonRecord(path.join(frameworkRoot, "package.json"))?.name !== "opl-framework" || !fs.existsSync(oplBin)) return null;
  return {
    ...env,
    PATH: uniquePathEntries([path.dirname(oplBin), env.PATH, ...SYSTEM_PATH_ENTRIES]).join(path.delimiter),
    OPL_APP_OPL_BIN: oplBin,
    OPL_FRAMEWORK_PACKAGE_ROOT: frameworkRoot,
    OPL_FRAMEWORK_UPDATE_TARGET_ROOT: frameworkRoot
  };
}

function installedFrameworkIdentity(homeDir) {
  const root = installedFrameworkRoot(homeDir);
  // Framework's updater replaces the install marker with its own source receipt.
  // Consume that receipt; never recreate an installer-owned identity on its behalf.
  const source = readJsonRecord(path.join(root, ".opl-framework-source.json"));
  if (source?.surface_kind === "opl_framework_runtime_source"
    && source.authority_boundary?.owner === "one-person-lab"
    && /^[0-9a-f]{40}$/.test(source.source_head_sha ?? "")) {
    return { framework_sha: source.source_head_sha, ownerUpdated: true };
  }
  return readJsonRecord(path.join(root, ".opl-framework-installed-source-identity.json"));
}

function officialProfileStateDirectory(homeDir, env) {
  if (env.OPL_STATE_DIR?.trim()) return path.resolve(env.OPL_STATE_DIR);
  const data = env.OPL_DATA_DIR?.trim();
  return data
    ? path.join(path.resolve(data), "opl", "state")
    : path.join(homeDir, "Library", "Application Support", "OPL", "state");
}

/**
 * The Standard installer creates the Framework runtime before the packaged
 * App can capture its first-install admission. Persist the admission before
 * that installer runs so the runtime itself is not mistaken for an existing
 * user installation on the first Stable launch.
 */
export function captureStableOfficialProfileIntent({ homeDir = os.homedir(), env = process.env, platform = process.platform } = {}) {
  if (platform !== "darwin") return { status: "skipped", reason: "non_macos" };
  const stateDir = officialProfileStateDirectory(homeDir, env);
  const completePath = path.join(stateDir, OFFICIAL_PROFILE_COMPLETE);
  const attemptPath = path.join(stateDir, OFFICIAL_PROFILE_ATTEMPT);
  const intentPath = path.join(stateDir, OFFICIAL_PROFILE_INTENT);
  if ([completePath, attemptPath, intentPath].some((file) => fs.existsSync(file))) {
    return { status: "skipped", reason: "existing_official_profile_marker", stateDir };
  }
  const existingRuntime = [
    path.join(homeDir, ".opl", "one-person-lab"),
    path.join(homeDir, "Library", "Application Support", "OPL", "runtime", "current"),
    path.join(homeDir, "Library", "Application Support", "opl-studio", "runtime", "current")
  ].some((file) => fs.existsSync(file));
  if (existingRuntime || fs.existsSync(stateDir)) {
    return { status: "skipped", reason: "existing_owner_runtime_or_preferences", stateDir };
  }
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(intentPath, `${JSON.stringify({
      schema: "opl_studio_official_profile_first_install_intent.v1",
      intent: "first_install",
      captured_before_runtime_bootstrap: true,
      recorded_at: new Date().toISOString()
    })}\n`, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  return { status: "captured", stateDir, intentPath };
}

function frameworkAtRef(homeDir, frameworkRef) {
  const identity = installedFrameworkIdentity(homeDir);
  return installedFrameworkEnvironment(homeDir, {}) !== null
    && identity?.schema === "opl_framework_installed_source_identity.v1"
    && identity.framework_sha === frameworkRef;
}

function supportsV2Runtime(env) {
  return new Promise((resolve) => {
    const child = spawn(env.OPL_APP_OPL_BIN, ["--version", "--json"], {
      env, stdio: ["ignore", "pipe", "ignore"]
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-32_000); });
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
    child.once("error", () => { clearTimeout(timer); resolve(false); });
    child.once("close", (code) => {
      clearTimeout(timer);
      try {
        if (code !== 0) return resolve(false);
        const info = JSON.parse(output);
        const major = Number.parseFloat(String(info?.api_version ?? "0"));
        resolve(typeof info?.version === "string" && (major >= 2 || (Array.isArray(info?.features) && info.features.includes("pack.ensure"))));
      } catch {
        resolve(false);
      }
    });
  });
}

async function supportsRuntimeActivation(env) {
  if (await supportsV2Runtime(env)) return true;
  return new Promise((resolve) => {
    const child = spawn(env.OPL_APP_OPL_BIN, ["help", "update", "activate", "--json"], {
      env, stdio: ["ignore", "pipe", "ignore"]
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-32_000); });
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
    child.once("error", () => { clearTimeout(timer); resolve(false); });
    child.once("close", (code) => {
      clearTimeout(timer);
      try { resolve(code === 0 && JSON.parse(output).help?.command === "update activate"); }
      catch { resolve(false); }
    });
  });
}

/** Ephemeral App diagnostics; installation and retry authority remain with Framework. */
export function desktopBootstrapFailure(error, env = process.env) {
  const seen = new Set();
  const describe = (value, depth = 0) => {
    if (value && typeof value === "object") {
      if (seen.has(value)) return { message: "[Circular cause]" };
      seen.add(value);
    }
    const read = (key) => { try { return value?.[key]; } catch { return undefined; } };
    const text = (item) => { try { return Buffer.isBuffer(item) ? item.toString("utf8") : String(item); } catch { return "Unavailable error detail"; } };
    const safe = (item, maxLength = 1024) => safeDesktopErrorMessage(text(item), env, { maxLines: 8, maxLength });
    const detail = { message: safe(read("message") ?? value) };
    const code = read("code");
    if (typeof code === "string" && /^[a-z_][a-z0-9_]{0,79}$/i.test(code)) detail.code = safe(code, 80);
    const exitCode = read("exitCode");
    if (Number.isInteger(exitCode)) detail.exitCode = exitCode;
    const signal = read("signal");
    if (typeof signal === "string" && /^SIG[A-Z0-9]{1,16}$/.test(signal)) detail.signal = signal;
    const stderr = read("stderr");
    if (typeof stderr === "string" || Buffer.isBuffer(stderr)) detail.stderr = safe(stderr, depth ? 1024 : 2048);
    const cause = read("cause");
    if (cause !== undefined && depth < 2) detail.cause = describe(cause, depth + 1);
    return detail;
  };
  return { status: "framework_bootstrap_failed", error: describe(error) };
}

export function bootstrapProgressStage(line) {
  if (line.includes('Preparing One Person Lab managed Node.js')) return 'preparing_node';
  if (/^==> (?:Cloning|Downloading|Updating) One Person Lab/.test(line)) return 'preparing_framework';
  if (line.includes('==> Installing OPL CLI')) return 'installing_framework';
  if (line.includes('==> Preparing the local background-service runtime')) return 'preparing_services';
  if (line.includes('==> Running complete One Person Lab setup')) return 'configuring_components';
  if (line.includes('==> Inspecting OPL system state')) return 'checking_components';
  return null;
}

function runBootstrapInstaller(installerPath, env, args = ["--headless", "--skip-packages"], onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/bash", [installerPath, ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let pending = '';
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-24_000);
      pending = `${pending}${chunk}`;
      const lines = pending.split(/\r?\n/); pending = lines.pop().slice(-4096);
      for (const line of lines) { const stage = bootstrapProgressStage(line); if (stage) onProgress({ stage, source: 'network' }); }
    });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-24_000); });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      const detail = stderr.trim() || stdout.trim() || `exit ${signal ?? code ?? "unknown"}`;
      reject(Object.assign(new Error(`Studio Standard Framework bootstrap failed: ${detail}`), {
        exitCode: code, signal, stderr
      }));
    });
  });
}

function installedRuntimeVersion(runtime) {
  const value = readJsonRecord(path.join(runtime, INSTALL_MARKER))?.version;
  return typeof value === "string" && value.trim() ? value.trim() : ACTIVE_RUNTIME_DIR;
}

function executableFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function resolveManagedNodeExecutable({ runtimeHome, homeDir, platform = process.platform } = {}) {
  const nodeName = platform === "win32" ? "node.exe" : "node";
  const runtimeNode = path.join(runtimeHome, "node", "bin", nodeName);
  if (executableFile(runtimeNode)) {
    try { return resolveHostNode({ nodeExecutable: runtimeNode }).command; } catch {}
  }

  const toolchainRoot = path.join(homeDir, ".opl", "toolchain");
  try {
    const candidates = fs.readdirSync(toolchainRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(toolchainRoot, entry.name, "bin", nodeName))
      .filter(executableFile)
      .sort()
      .reverse();
    for (const candidate of candidates) {
      try { return resolveHostNode({ nodeExecutable: candidate }).command; } catch {}
    }
    return null;
  } catch {
    return null;
  }
}

export function activateInstalledStudioRuntime({ homeDir = os.homedir(), env = process.env, identity = "preview" } = {}) {
  const target = runtimeHome(homeDir, identity);
  if (!isUsableRuntime(target)) return null;
  assertRuntimePackageRoot(path.join(target, "opl"));
  const marker = readJsonRecord(path.join(target, identity === "stable" ? ".opl-full-runtime-installed.json" : INSTALL_MARKER));
  return {
    version: marker?.version ?? installedRuntimeVersion(target),
    runtimeHome: target,
    nodeExecutable: resolveManagedNodeExecutable({ runtimeHome: target, homeDir, platform: process.platform }),
    manifestSha256: typeof marker?.manifest_sha256 === "string" ? marker.manifest_sha256 : null,
    source: "installed_runtime",
    env: buildRuntimeEnvironment(target, env)
  };
}

export async function ensureStudioDesktopRuntime({
  isPackaged,
  resourcesPath = process.resourcesPath,
  homeDir = os.homedir(),
  env = process.env,
  platform = process.platform,
  identity = "preview",
  onProgress = () => {}
} = {}) {
  if (env.OPL_APP_OPL_BIN || env.OPL_COMMAND || env.OPL_FRAMEWORK_PACKAGE_ROOT) return null;
  if (!isPackaged) return activateInstalledStudioRuntime({ homeDir, env, identity });
  const payload = await resolvePayload(resourcesPath, identity);
  if (payload) {
    // A different verified Full generation must be adopted at this cold-start
    // boundary. An older CLI supporting activation says nothing about whether
    // its wrappers, Node or runtime files contain the current App's fixes.
    const target = runtimeHome(homeDir, identity);
    if (isUsableRuntime(target) && markerMatches(target, payload.manifestSha256, payload.markerName)) {
      return activateInstalledStudioRuntime({ homeDir, env, identity });
    }
    onProgress({ stage: 'installing_offline_runtime', source: 'bundled' });
    await installPayload({ payload, target, platform });
    writePointer(homeDir, target, payload.version, payload.manifestSha256, "packaged_payload", identity);
    return {
      version: payload.version,
      runtimeHome: target,
      nodeExecutable: resolveManagedNodeExecutable({ runtimeHome: target, homeDir, platform }),
      manifestSha256: payload.manifestSha256,
      source: "packaged_payload",
      env: buildRuntimeEnvironment(target, env)
    };
  }

  const installed = activateInstalledStudioRuntime({ homeDir, env, identity });
  if (installed && await supportsRuntimeActivation(installed.env)) return installed;
  if (identity === "stable") {
    const previewInstalled = activateInstalledStudioRuntime({ homeDir, env, identity:"preview" });
    if (previewInstalled && await supportsRuntimeActivation(previewInstalled.env)) return previewInstalled;
  }
  const standard = resolveStandardBootstrap(resourcesPath);
  if (!standard) return null;
  const frameworkIdentity = installedFrameworkIdentity(homeDir);
  const existingManagedIdentity = (frameworkIdentity?.schema === "opl_framework_installed_source_identity.v1" || frameworkIdentity?.ownerUpdated)
    && /^[0-9a-f]{40}$/.test(frameworkIdentity.framework_sha ?? "")
    && installedFrameworkEnvironment(homeDir, env) !== null;
  const existingManagedRuntime = existingManagedIdentity && (
    frameworkIdentity.ownerUpdated || frameworkIdentity.framework_sha === standard.manifest.framework_ref
    || fs.existsSync(path.join(installedFrameworkRoot(homeDir), ".git"))
    || fs.lstatSync(installedFrameworkRoot(homeDir)).isSymbolicLink()
    || await supportsRuntimeActivation(installedFrameworkEnvironment(homeDir, env))
  );
  if (!existingManagedRuntime) {
    if (identity === "stable") captureStableOfficialProfileIntent({ homeDir, env, platform });
    onProgress({ stage: 'preparing_framework', source: 'network' });
    await runBootstrapInstaller(standard.installerPath, { ...env, HOME: homeDir }, undefined, onProgress);
  }
  const installedEnv = installedFrameworkEnvironment(homeDir, env);
  if (!installedEnv || (!existingManagedRuntime && !frameworkAtRef(homeDir, standard.manifest.framework_ref))) {
    throw new Error("Studio Standard Framework bootstrap completed without the exact App-owned Framework identity");
  }
  return {
    version: installedFrameworkIdentity(homeDir).framework_sha,
    runtimeHome: installedFrameworkRoot(homeDir),
    nodeExecutable: resolveManagedNodeExecutable({ runtimeHome: installedFrameworkRoot(homeDir), homeDir, platform }),
    manifestSha256: sha256File(standard.manifestPath),
    source: "packaged_standard_bootstrap",
    env: installedEnv
  };
}

// Reuse the frozen Framework installer for Node-only security maintenance.
// Existing Framework source, Packages and system Node remain with their owners.
export async function ensureDesktopHostNode({ runtime, resourcesPath, homeDir = os.homedir(), env = process.env, platform = process.platform } = {}) {
  const effectiveEnv = runtime?.env ?? env;
  try { return resolveHostNode({ nodeExecutable: runtime?.nodeExecutable, env: effectiveEnv }); }
  catch (cause) {
    const standard = resourcesPath && resolveStandardBootstrap(resourcesPath);
    if (!standard) throw cause;
    await runBootstrapInstaller(standard.installerPath, { ...effectiveEnv, HOME: homeDir }, ["--headless", "--ensure-node"]);
    const nodeExecutable = resolveManagedNodeExecutable({ runtimeHome: runtime?.runtimeHome ?? installedFrameworkRoot(homeDir), homeDir, platform });
    return resolveHostNode({ nodeExecutable, env: effectiveEnv });
  }
}
