import fs from "node:fs/promises";
import path from "node:path";
import semver from "semver";

function blocked(code) {
  return Object.assign(new Error(code), { code });
}

async function readVersion(root) {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    if (pkg.name === "opl-framework" && semver.valid(pkg.version)) return pkg.version;
  } catch { /* An unreadable version cannot qualify an automatic replacement. */ }
  throw blocked("framework_update_version_unverified");
}

function assertForwardVersion(current, target) {
  if (!semver.valid(target)) throw blocked("framework_update_version_unverified");
  if (semver.lt(target, current)) throw blocked("framework_update_downgrade_blocked");
}

// This is a caller compatibility check, not an updater. All staging, integrity
// verification, activation, locks and receipts remain Framework-owned.
export async function frameworkUpdateEnvironment(env, { operation, plan } = {}) {
  const root = env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT;
  if (!root || !path.isAbsolute(root) || root !== env.OPL_FRAMEWORK_PACKAGE_ROOT) {
    throw blocked("framework_update_target_unbound");
  }
  const current = await readVersion(root);
  if (operation === "activate") {
    let pending;
    try { pending = JSON.parse(await fs.readFile(`${root}.pending.json`, "utf8")); }
    catch (error) {
      if (error.code === "ENOENT") return env;
      throw blocked("framework_pending_generation_unverified");
    }
    if (pending.surface_kind !== "opl_framework_pending_generation.v1"
      || pending.target_root !== root || pending.pending_root !== `${root}.pending`) {
      throw blocked("framework_pending_generation_unverified");
    }
    assertForwardVersion(current, await readVersion(pending.pending_root));
    return env;
  }
  const base = plan?.managed_update?.components?.find((item) => item.component_id === "opl_base");
  const source = base?.current?.opl_framework_runtime;
  if (!source || source.target_root !== root) throw blocked("framework_update_target_unverified");
  if (!source.update_available || source.target_is_developer_checkout) return env;
  // Explicit archives/sources remain manual owner operations: the channel's
  // projected version cannot qualify unrelated user-selected bytes.
  if (source.source_archive_configured || source.source_root_configured) {
    throw blocked("framework_update_version_unverified");
  }
  assertForwardVersion(current, source.channel_version);
  if (!/^ghcr\.io\/[^\s@]+$/.test(source.channel_artifact ?? "")
    || !/^sha256:[0-9a-f]{64}$/.test(source.channel_artifact_digest ?? "")) {
    throw blocked("framework_update_artifact_unverified");
  }
  const repository = source.channel_artifact.replace(/:[^/:]+$/, "");
  // Bind apply to the inspected immutable artifact, even if the channel moves.
  return { ...env, OPL_FRAMEWORK_ARTIFACT_REF: `${repository}@${source.channel_artifact_digest}` };
}
