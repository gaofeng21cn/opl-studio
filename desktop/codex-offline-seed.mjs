import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// This only projects a packaged first-install input. Framework still performs
// staging, protocol verification, activation and all subsequent updates.
export function codexOfflineSeedEnvironment(runtimeRoot, env) {
  const manifestPath = path.join(runtimeRoot, "manifest", "full-package-manifest.json");
  if (!fs.existsSync(manifestPath)) return env;
  const seed = JSON.parse(fs.readFileSync(manifestPath, "utf8")).codex_offline_seed;
  if (!seed) return env; // Older Full packages have no seed contract.
  if (seed.schema !== "opl_full_codex_offline_seed.v1" || !/^\d+\.\d+\.\d+$/.test(seed.version ?? "")
    || seed.installation_owner !== "one-person-lab") throw new Error("Invalid Full Codex offline seed identity");
  const result = { ...env };
  for (const [kind, key] of [["package", "OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL"], ["platform", "OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL"]]) {
    const archive = seed.archives?.[kind];
    if (archive?.path !== `runtime-payloads/codex-cli/${seed.version}/${kind}.tgz`
      || !/^[a-f0-9]{64}$/.test(archive.sha256 ?? "")) throw new Error("Invalid Full Codex seed archive identity");
    const file = path.join(runtimeRoot, archive.path);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size !== archive.size_bytes
      || !fs.realpathSync(file).startsWith(fs.realpathSync(runtimeRoot) + path.sep)
      || crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== archive.sha256) {
      throw new Error("Full Codex offline seed archive does not match its manifest");
    }
    result[key] = file;
  }
  return result;
}

function executableFile(file) {
  try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; }
}

async function installCodexRuntime({ opl, executable }) {
  const result = await opl.executeAction({ actionId: "codex_install", dryRun: false, payload: { confirmed: true } });
  if (result.status !== "executed" && result.status !== "no_op") throw new Error("Framework could not initialize the Codex runtime");
  const activation = await opl.runManagedUpdate("activate");
  const binary = activation.runtime_activation?.codex?.runtime_binary_path;
  if (!path.isAbsolute(binary ?? "") || !executable(binary)) throw new Error("Framework did not activate a usable Codex executable");
  return binary;
}

function hasCodexSeed(env) {
  return Boolean(env.OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL && env.OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL);
}

function hasConfiguredCodex(env, managedBinary, executable) {
  if (env.CODEX_APP_SERVER_COMMAND) return true;
  const selected = env.OPL_CODEX_BIN || env.CODEX_CLI_PATH || env.CODEX_BIN;
  return selected && path.resolve(selected) !== managedBinary && executable(selected);
}

// Pending updates are optional at launch. Packaged first-install inputs must
// still reach Framework when update activation fails or automatic updates are off.
export async function prepareDesktopCodexRuntime({ env, opl, activatePending = true, refreshUpdates = false, firstInstall = false, onProgress = () => {}, executable = executableFile }) {
  let activationStatus = 'disabled';
  let activatedCodexPath;
  let currentnessError;
  if (refreshUpdates) {
    // Run before any Host/plugin/App Server loads runtime bytes. Native owners
    // select updates; periodic maintenance is not the launch gate.
    try {
      await opl.runManagedUpdate('check');
      const result = await opl.runManagedUpdate('apply');
      if (!['completed', 'skipped'].includes(result.managed_update?.execution?.status)) {
        throw Object.assign(new Error('Framework cold-start update did not complete'), { code: 'startup_update_incomplete' });
      }
    } catch (error) { currentnessError = error.code ?? 'startup_update_failed'; }
  }
  let activation;
  try {
    activation = activatePending ? await opl.runManagedUpdate('activate') : await opl.readCodexRuntime?.();
    if (activatePending) activationStatus = activation?.runtime_activation?.status ?? 'unknown';
  } catch (error) {
    activationStatus = error.code ?? 'failed';
    // A failed pending generation can coexist with an older usable current.
    if (activatePending && opl.readCodexRuntime) {
      try { activation = await opl.readCodexRuntime(); } catch { /* Keep the activation error. */ }
    }
  }
  const codex = activation?.runtime_activation?.codex;
  if (typeof codex?.runtime_binary_path === 'string' && path.isAbsolute(codex.runtime_binary_path) && executable(codex.runtime_binary_path)) {
    activatedCodexPath = codex.runtime_binary_path;
  }
  const bundled = hasCodexSeed(env);
  if (!activatedCodexPath && !hasConfiguredCodex(env, codex?.managed_binary_path, executable)
    && (bundled || (firstInstall && !env.OPL_FULL_RUNTIME_HOME))) {
    onProgress({ stage: 'preparing_codex', source: bundled ? 'bundled' : 'network' });
    try {
      activatedCodexPath = await installCodexRuntime({ opl, executable });
    } catch (error) {
      if (bundled) throw error;
      currentnessError = error.code ?? 'codex_install_failed';
      onProgress({ stage: 'preparing_codex', status: 'failed', source: 'network' });
    }
  }
  return { activationStatus: currentnessError ?? activationStatus, activatedCodexPath };
}
