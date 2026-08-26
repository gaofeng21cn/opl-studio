import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const FULL_RUNTIME_RESOURCE_DIR = "opl-studio-full-runtime";
const FULL_RUNTIME_MANIFEST = "full-package-manifest.json";
const STANDARD_BOOTSTRAP_RESOURCE_DIR = "opl-framework-bootstrap";
const STANDARD_BOOTSTRAP_MANIFEST = "manifest.json";
const STANDARD_BOOTSTRAP_INSTALLER = "opl-install.sh";
const INSTALL_MARKER = ".opl-studio-full-runtime-installed.json";
const ACTIVE_RUNTIME_DIR = "current";
const ACTIVE_RUNTIME_POINTER = "current.json";
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

function validSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
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

function runtimeRoot(homeDir) {
  return path.join(homeDir, "Library", "Application Support", "opl-studio", "runtime");
}

function runtimeHome(homeDir) {
  return path.join(runtimeRoot(homeDir), ACTIVE_RUNTIME_DIR);
}

function pointerPath(homeDir) {
  return path.join(runtimeRoot(homeDir), ACTIVE_RUNTIME_POINTER);
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

function resolvePayload(resourcesPath) {
  const resourceRoot = path.join(resourcesPath, FULL_RUNTIME_RESOURCE_DIR);
  const manifestPath = path.join(resourceRoot, "manifest", FULL_RUNTIME_MANIFEST);
  const manifest = readJsonRecord(manifestPath);
  if (!manifest) return null;
  if (
    manifest.carrier?.schema !== "opl_app_full_payload_carrier_profile.v1"
    || manifest.carrier?.carrier_id !== "opl-studio"
    || manifest.carrier?.runtime_resource_dir !== FULL_RUNTIME_RESOURCE_DIR
    || manifest.carrier?.runtime_install_root_template !== "~/Library/Application Support/opl-studio/runtime/current"
    || manifest.carrier?.codex_carrier !== "opl_codex_native"
    || manifest.carrier?.full_runtime_codex_payload_allowed !== false
  ) {
    throw new Error("Studio Full runtime carrier manifest does not match the App-owned contract");
  }
  const version = typeof manifest.version === "string" ? manifest.version.trim() : "";
  if (!version) throw new Error("Studio Full runtime manifest is missing a version");
  const payloadRoot = path.join(resourceRoot, "runtime", ACTIVE_RUNTIME_DIR);
  if (!isUsableRuntime(payloadRoot)) {
    throw new Error("Studio Full runtime payload is incomplete");
  }
  assertRuntimePackageRoot(path.join(payloadRoot, "opl"));
  return { version, payloadRoot, manifestPath, manifestSha256: sha256File(manifestPath) };
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
    || manifest.aionui_standard_payload_preparation !== false
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

function markerMatches(target, manifestSha256) {
  return readJsonRecord(path.join(target, INSTALL_MARKER))?.manifest_sha256 === manifestSha256;
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

async function installPayload({ payload, target, platform }) {
  if (isUsableRuntime(target) && markerMatches(target, payload.manifestSha256)) return;
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const suffix = `${process.pid}-${Date.now()}`;
  const temporary = `${target}.tmp-${suffix}`;
  const previous = `${target}.previous-${suffix}`;
  await fs.promises.rm(temporary, { recursive: true, force: true });
  await fs.promises.rm(previous, { recursive: true, force: true });
  await fs.promises.cp(payload.payloadRoot, temporary, {
    recursive: true,
    dereference: false,
    preserveTimestamps: true
  });
  await makeOwnerWritable(temporary);
  await removeQuarantine(temporary, platform);
  await fs.promises.writeFile(path.join(temporary, INSTALL_MARKER), `${JSON.stringify({
    version: payload.version,
    manifest_sha256: payload.manifestSha256,
    installed_at: new Date().toISOString()
  }, null, 2)}\n`, "utf8");
  try {
    if (fs.existsSync(target)) await fs.promises.rename(target, previous);
    await fs.promises.rename(temporary, target);
    await fs.promises.rm(previous, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(target) && fs.existsSync(previous)) await fs.promises.rename(previous, target);
    await fs.promises.rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

function writePointer(homeDir, runtime, version, manifestSha256, source) {
  const target = pointerPath(homeDir);
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
    OPL_FAMILY_RUNTIME_PROVIDER: env.OPL_FAMILY_RUNTIME_PROVIDER?.trim() || "temporal",
    OPL_MODULE_PATH_MEDAUTOSCIENCE: path.join(runtime, "modules", "mas"),
    OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS: path.join(runtime, "modules", "mas-scholar-skills"),
    OPL_MODULE_PATH_MEDAUTOGRANT: path.join(runtime, "modules", "mag"),
    OPL_MODULE_PATH_REDCUBE: path.join(runtime, "modules", "rca"),
    OPL_MODULE_PATH_OPLMETAAGENT: path.join(runtime, "modules", "meta-agent"),
    OPL_MODULE_PATH_OPLBOOKFORGE: path.join(runtime, "modules", "bookforge"),
    OPL_FLOW_REPO_ROOT: path.join(runtime, "modules", "opl-flow")
  };
  if (!env.OPL_TEMPORAL_ADDRESS?.trim() && !env.TEMPORAL_ADDRESS?.trim() && !env.OPL_TEMPORAL_SERVICE_START_COMMAND?.trim()) {
    result.OPL_TEMPORAL_ADDRESS = "127.0.0.1:7233";
    result.OPL_TEMPORAL_ADDRESS_SOURCE = "packaged_local_default";
  }
  const hermes = path.join(runtime, "bin", "hermes");
  if (fs.existsSync(hermes)) result.OPL_HERMES_BIN = hermes;
  return result;
}

function installedFrameworkRoot(homeDir) {
  return path.join(homeDir, ".opl", "one-person-lab");
}

function installedFrameworkEnvironment(homeDir, env) {
  const frameworkRoot = installedFrameworkRoot(homeDir);
  const oplBin = path.join(homeDir, ".local", "bin", "opl");
  if (!fs.existsSync(path.join(frameworkRoot, "package.json")) || !fs.existsSync(oplBin)) return null;
  return {
    ...env,
    PATH: uniquePathEntries([path.dirname(oplBin), env.PATH, ...SYSTEM_PATH_ENTRIES]).join(path.delimiter),
    OPL_APP_OPL_BIN: oplBin,
    OPL_FRAMEWORK_PACKAGE_ROOT: frameworkRoot,
    OPL_FRAMEWORK_UPDATE_TARGET_ROOT: frameworkRoot
  };
}

function installedFrameworkIdentity(homeDir) {
  return readJsonRecord(path.join(installedFrameworkRoot(homeDir), ".opl-framework-installed-source-identity.json"));
}

function frameworkAtRef(homeDir, frameworkRef) {
  const identity = installedFrameworkIdentity(homeDir);
  return installedFrameworkEnvironment(homeDir, {}) !== null
    && identity?.schema === "opl_framework_installed_source_identity.v1"
    && identity.framework_sha === frameworkRef;
}

function runBootstrapInstaller(installerPath, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/bash", [installerPath, "--headless", "--skip-packages"], {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-24_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-24_000); });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      const detail = stderr.trim() || stdout.trim() || `exit ${signal ?? code ?? "unknown"}`;
      reject(new Error(`Studio Standard Framework bootstrap failed: ${detail}`));
    });
  });
}

function installedRuntimeVersion(runtime) {
  const value = readJsonRecord(path.join(runtime, INSTALL_MARKER))?.version;
  return typeof value === "string" && value.trim() ? value.trim() : ACTIVE_RUNTIME_DIR;
}

export function activateInstalledStudioRuntime({ homeDir = os.homedir(), env = process.env } = {}) {
  const target = runtimeHome(homeDir);
  if (!isUsableRuntime(target)) return null;
  assertRuntimePackageRoot(path.join(target, "opl"));
  const marker = readJsonRecord(path.join(target, INSTALL_MARKER));
  return {
    version: installedRuntimeVersion(target),
    runtimeHome: target,
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
  platform = process.platform
} = {}) {
  if (!isPackaged) return activateInstalledStudioRuntime({ homeDir, env });
  const payload = resolvePayload(resourcesPath);
  if (payload) {
    const target = runtimeHome(homeDir);
    await installPayload({ payload, target, platform });
    writePointer(homeDir, target, payload.version, payload.manifestSha256, "packaged_payload");
    return {
      version: payload.version,
      runtimeHome: target,
      manifestSha256: payload.manifestSha256,
      source: "packaged_payload",
      env: buildRuntimeEnvironment(target, env)
    };
  }

  const installed = activateInstalledStudioRuntime({ homeDir, env });
  if (installed) return installed;
  const standard = resolveStandardBootstrap(resourcesPath);
  if (!standard) return null;
  if (!frameworkAtRef(homeDir, standard.manifest.framework_ref)) {
    await runBootstrapInstaller(standard.installerPath, { ...env, HOME: homeDir });
  }
  const installedEnv = installedFrameworkEnvironment(homeDir, env);
  if (!installedEnv || !frameworkAtRef(homeDir, standard.manifest.framework_ref)) {
    throw new Error("Studio Standard Framework bootstrap completed without the exact App-owned Framework identity");
  }
  return {
    version: standard.manifest.framework_ref,
    runtimeHome: installedFrameworkRoot(homeDir),
    manifestSha256: sha256File(standard.manifestPath),
    source: "packaged_standard_bootstrap",
    env: installedEnv
  };
}
