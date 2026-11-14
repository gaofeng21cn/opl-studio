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

export async function ensureFullCodexFirstInstall({ env, opl, executable = file => {
  try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; }
} }) {
  if (!env.OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL || !env.OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL) return null;
  if (env.CODEX_APP_SERVER_COMMAND || [env.OPL_CODEX_BIN, env.CODEX_CLI_PATH, env.CODEX_BIN].filter(Boolean).some(executable)) return null;
  const result = await opl.executeAction({ actionId: "codex_install", dryRun: false, payload: { confirmed: true } });
  if (result.status !== "executed" && result.status !== "no_op") throw new Error("Framework could not initialize the Full Codex offline seed");
  const activation = await opl.runManagedUpdate("activate");
  const binary = activation.runtime_activation?.codex?.runtime_binary_path;
  if (!path.isAbsolute(binary ?? "") || !executable(binary)) throw new Error("Framework did not activate a usable Codex executable");
  return binary;
}
