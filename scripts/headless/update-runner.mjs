import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { realpathSync } from "node:fs";
import { access, cp, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { restartLoadedHeadlessService } from "./service-manager.mjs";

const modulePath = fileURLToPath(import.meta.url);
const operations = new Set(["status", "check", "apply", "rollback", "restart"]);
const installRecordName = "installation.json";
const executeFile = promisify(execFile);

function sameFile(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}

function absolute(value, name) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return path.resolve(value);
}

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function parseVersion(value, name) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (!match) throw new Error(`${name} must be a semantic version`);
  return { raw: value, core: match.slice(1, 4).map(Number), prerelease: match[4]?.split(".") ?? [] };
}

function compareIdentifiers(left, right) {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
  if (leftNumber !== null && rightNumber !== null) return Math.sign(leftNumber - rightNumber);
  if (leftNumber !== null) return -1;
  if (rightNumber !== null) return 1;
  return left.localeCompare(right);
}

function compareVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue, "version");
  const right = parseVersion(rightValue, "version");
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) return Math.sign(left.core[index] - right.core[index]);
  }
  if (!left.prerelease.length && !right.prerelease.length) return 0;
  if (!left.prerelease.length) return 1;
  if (!right.prerelease.length) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const compared = compareIdentifiers(left.prerelease[index], right.prerelease[index]);
    if (compared !== 0) return compared;
  }
  return 0;
}

async function sourceVersion(sourceRoot) {
  const packageJson = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8"));
  return parseVersion(packageJson.version, "package.json version").raw;
}

async function readInstallRecord(installRoot) {
  const value = JSON.parse(await readFile(path.join(installRoot, installRecordName), "utf8"));
  if (value?.schema !== "opl_headless_installation.v1") throw new Error("Headless installation record is invalid");
  parseVersion(value.version, "installed version");
  absolute(value.sourceRoot, "installed sourceRoot");
  return value;
}

function payloadFilter(sourceRoot) {
  return (candidate) => {
    const relative = path.relative(sourceRoot, candidate);
    if (!relative) return true;
    const segments = relative.split(path.sep);
    return !segments.includes("fixtures") && !segments.includes("node_modules") && !candidate.endsWith(".test.mjs");
  };
}

async function validatePayload(root) {
  for (const required of [
    "package.json",
    "package-lock.json",
    "plugins",
    path.join("desktop", "official-profile.mjs"),
    path.join("desktop", "node-host-runtime.mjs"),
    path.join("desktop", "node-host-policy.json"),
    path.join("src", "host", "packaged-host-smoke.mjs"),
    path.join("dist", "webui", "index.html"),
    path.join("scripts", "headless", "run.mjs"),
    path.join("scripts", "headless", "service-manager.mjs"),
    path.join("scripts", "headless", "update-runner.mjs"),
    path.join("scripts", "install-headless.mjs"),
    path.join("src", "host", "http-host.mjs")
  ]) {
    await access(path.join(root, required));
  }
}

export async function installHeadlessPayload({ sourceRoot, installRoot }) {
  const source = absolute(sourceRoot, "sourceRoot");
  const root = absolute(installRoot, "installRoot");
  if (source === root || source.startsWith(`${root}${path.sep}`)) {
    throw new Error("sourceRoot must be outside installRoot");
  }
  await validatePayload(source);
  const version = await sourceVersion(source);
  const previousRecord = await readInstallRecord(root).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  const current = path.join(root, "current");
  const previous = path.join(root, "previous");
  const staging = path.join(root, `.staging-${process.pid}-${Date.now()}`);
  const recordPath = path.join(root, installRecordName);
  const recordStaging = `${recordPath}.staging-${process.pid}`;
  await mkdir(staging, { recursive: true });
  try {
    for (const relative of ["package.json", "package-lock.json", "plugins", "desktop/official-profile.mjs", "desktop/node-host-runtime.mjs", "desktop/node-host-policy.json"]) {
      const destination = path.join(staging, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(source, relative), destination, { recursive: true, dereference: true, filter: payloadFilter(source) });
    }
    await cp(path.join(source, "dist", "webui"), path.join(staging, "dist", "webui"), {
      recursive: true,
      filter: payloadFilter(source)
    });
    await cp(path.join(source, "scripts", "headless"), path.join(staging, "scripts", "headless"), {
      recursive: true,
      filter: payloadFilter(source)
    });
    await cp(path.join(source, "scripts", "install-headless.mjs"), path.join(staging, "scripts", "install-headless.mjs"));
    await cp(path.join(source, "src", "host"), path.join(staging, "src", "host"), {
      recursive: true,
      filter: payloadFilter(source)
    });
    await validatePayload(staging);
    // Match the OCI/guest Host closure: install the locked production graph in
    // its new location, including the built local DSH plugins. Never retain a
    // dependency link into the developer checkout.
    const execution = { cwd: staging, env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" }, maxBuffer: 1024 * 1024 };
    await executeFile("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { ...execution, timeout: 180_000 });
    const smoke = await executeFile(process.execPath, ["src/host/packaged-host-smoke.mjs"], { ...execution, timeout: 60_000 });
    if (!smoke.stdout.includes("OPL_PACKAGED_HOST_READY")) throw new Error("Installed Headless Host dependency smoke did not complete");
    const record = {
      schema: "opl_headless_installation.v1",
      version,
      sourceRoot: source,
      currentPath: current,
      installedAt: new Date().toISOString()
    };
    await writeFile(recordStaging, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rm(previous, { recursive: true, force: true });
    const hadCurrent = await exists(current);
    if (hadCurrent) await rename(current, previous);
    try {
      await rename(staging, current);
      await rename(recordStaging, recordPath);
    } catch (error) {
      await rm(current, { recursive: true, force: true });
      if (hadCurrent && await exists(previous)) await rename(previous, current);
      throw error;
    }
    return { version, previousVersion: previousRecord?.version ?? null, currentPath: current, record };
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(recordStaging, { force: true });
  }
}

async function rollbackHeadlessPayload(installRoot, installed) {
  const root = absolute(installRoot, "installRoot");
  const current = path.join(root, "current");
  const previous = path.join(root, "previous");
  if (!await exists(previous)) return null;
  await validatePayload(current);
  await validatePayload(previous);

  const targetVersion = await sourceVersion(previous);
  const staging = path.join(root, `.rollback-${process.pid}-${Date.now()}`);
  const recordPath = path.join(root, installRecordName);
  const recordStaging = `${recordPath}.rollback-${process.pid}`;
  const nextRecord = {
    ...installed,
    version: targetVersion,
    currentPath: current,
    rolledBackAt: new Date().toISOString()
  };
  await writeFile(recordStaging, `${JSON.stringify(nextRecord, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

  try {
    await rename(current, staging);
    try {
      await rename(previous, current);
      try {
        await rename(staging, previous);
      } catch (error) {
        await rename(current, previous);
        throw error;
      }
    } catch (error) {
      await rename(staging, current);
      throw error;
    }
    try {
      await rename(recordStaging, recordPath);
    } catch (error) {
      await rename(previous, staging);
      await rename(current, previous);
      await rename(staging, current);
      throw error;
    }
    return { currentVersion: installed.version, targetVersion };
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(recordStaging, { force: true });
  }
}

function result(state, fields = {}) {
  return {
    schema: "opl_native_app_updater.v1",
    supported: true,
    state,
    restartRequired: false,
    ...fields
  };
}

function unsupported(reasonCode, fields = {}) {
  return { ...result("unsupported", fields), supported: false, reasonCode };
}

function scheduleDetachedRestart() {
  const child = spawn(process.execPath, [modulePath, "__restart-helper"], {
    detached: true,
    shell: false,
    stdio: "ignore"
  });
  child.unref();
}

export function createHeadlessUpdateRunner({
  installRoot,
  sourceRoot,
  scheduleRestart = scheduleDetachedRestart
}) {
  const root = absolute(installRoot, "installRoot");

  async function versions() {
    const installed = await readInstallRecord(root);
    const source = absolute(sourceRoot ?? installed.sourceRoot, "sourceRoot");
    return { installed, source, targetVersion: await sourceVersion(source) };
  }

  async function availability() {
    const values = await versions();
    const comparison = compareVersions(values.targetVersion, values.installed.version);
    if (comparison < 0) {
      return { values, response: unsupported("target_version_not_newer", {
        currentVersion: values.installed.version,
        targetVersion: values.targetVersion
      }) };
    }
    if (comparison === 0) {
      return { values, response: result("not_available", {
        currentVersion: values.installed.version,
        targetVersion: values.targetVersion
      }) };
    }
    return { values, response: result("available", {
      currentVersion: values.installed.version,
      targetVersion: values.targetVersion
    }) };
  }

  return {
    async perform(operation) {
      if (!operations.has(operation)) return unsupported("unsupported_update_operation");
      try {
        if (operation === "status") {
          const installed = await readInstallRecord(root);
          return result("idle", { currentVersion: installed.version });
        }
        if (operation === "restart") {
          await scheduleRestart();
          return result("restart_scheduled", { accepted: true });
        }
        if (operation === "rollback") {
          const installed = await readInstallRecord(root);
          const rolledBack = await rollbackHeadlessPayload(root, installed);
          if (!rolledBack) {
            return unsupported("rollback_unavailable", { currentVersion: installed.version });
          }
          return result("rolled_back", {
            ...rolledBack,
            restartRequired: true,
            accepted: true
          });
        }
        const checked = await availability();
        if (operation === "check" || checked.response.state !== "available") return checked.response;
        const installed = await installHeadlessPayload({ sourceRoot: checked.values.source, installRoot: root });
        return result("applied", {
          currentVersion: checked.values.installed.version,
          targetVersion: installed.version,
          restartRequired: true,
          accepted: true
        });
      } catch (error) {
        return result("error", {
          accepted: false,
          errorCode: error.code === "ENOENT" ? "update_source_unavailable" : "headless_update_failed",
          message: error.message
        });
      }
    }
  };
}

function parseArguments(argv) {
  const [operation, ...rest] = argv;
  if (!operations.has(operation)) throw new Error("Headless updater requires status, check, apply, rollback, or restart");
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!value || !["--install-root", "--source"].includes(flag)) throw new Error(`Unknown updater argument: ${flag ?? "missing"}`);
    options[flag === "--install-root" ? "installRoot" : "sourceRoot"] = value;
  }
  if (!options.installRoot) throw new Error("--install-root is required");
  return { operation, ...options };
}

export async function main(argv = process.argv.slice(2)) {
  if (argv[0] === "__restart-helper") {
    await new Promise((resolve) => setTimeout(resolve, 750));
    await restartLoadedHeadlessService();
    return;
  }
  const { operation, ...options } = parseArguments(argv);
  const response = await createHeadlessUpdateRunner(options).perform(operation);
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

if (process.argv[1] && sameFile(process.argv[1], modulePath)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      schema: "opl_native_app_updater.v1",
      supported: true,
      state: "error",
      restartRequired: false,
      errorCode: "headless_update_runner_failed",
      message: error.message
    })}\n`);
    process.exitCode = 1;
  });
}
