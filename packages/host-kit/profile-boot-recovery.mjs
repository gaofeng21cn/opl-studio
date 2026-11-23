import fs from "node:fs";
import path from "node:path";

export const PROFILE_RECOVERY_SCHEMA = "opl_dsh_profile_recovery.v1";

export function recoveryFilePath(profileDir) {
  return path.join(profileDir, "profile-boot-recovery.json");
}

function writeAtomicPrivate(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, content, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

/** Read current `@gaofeng21cn/*` native profile overrides without touching non-OPL packages. */
export function readProfileOplOverrides(profileDir) {
  if (!profileDir) return {};
  try {
    const manifestPath = path.join(profileDir, "package.json");
    if (!fs.existsSync(manifestPath)) return {};
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const deps = manifest?.dependencies;
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) return {};
    return Object.fromEntries(
      Object.entries(deps).filter(([name, version]) =>
        name.startsWith("@gaofeng21cn/") && typeof version === "string" && version.length > 0
      )
    );
  } catch {
    return {};
  }
}

/**
 * Isolate failing OPL plugin overrides on crash so the signed bundled baseline
 * can recover startup without trapping the user on a broken launch.
 */
export function quarantineProfileOverrides(profileDir, error, { now = Date.now } = {}) {
  if (!profileDir) return null;
  const manifestPath = path.join(profileDir, "package.json");
  if (!fs.existsSync(manifestPath)) return null;
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  const deps = manifest?.dependencies;
  if (!deps || typeof deps !== "object" || Array.isArray(deps)) return null;

  const quarantinedPackages = {};
  for (const [name, version] of Object.entries(deps)) {
    if (name.startsWith("@gaofeng21cn/") && typeof version === "string") {
      quarantinedPackages[name] = version;
      delete deps[name];
    }
  }
  if (!Object.keys(quarantinedPackages).length) return null;

  const stamp = now();
  writeAtomicPrivate(path.join(profileDir, `package.json.quarantined.${stamp}`), raw);
  writeAtomicPrivate(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const record = {
    schema: PROFILE_RECOVERY_SCHEMA,
    recoveredAt: new Date(stamp).toISOString(),
    quarantinedPackages,
    reason: String(error?.message || error || "host_boot_failed").slice(0, 500)
  };
  writeAtomicPrivate(recoveryFilePath(profileDir), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function readProfileBootRecovery(profileDir) {
  if (!profileDir) return null;
  try {
    const file = recoveryFilePath(profileDir);
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.schema !== PROFILE_RECOVERY_SCHEMA || typeof parsed.quarantinedPackages !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearProfileBootRecovery(profileDir) {
  if (!profileDir) return;
  try {
    fs.unlinkSync(recoveryFilePath(profileDir));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
