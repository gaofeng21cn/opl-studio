import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { readProfileManifest } from "@deepseek-ai/dsh-app-boot";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { bundleManifest, runPluginCommand, runProfilePnpm, saveManifest, viewProfilePackage } from "@deepseek-ai/dsh-plugin-manager/operations";
import semver from "semver";
import { ThreadAdapterError } from "@gaofeng21cn/opl-host-contracts/thread-error";

const name = "billion-context";
const registry = "https://registry.npmjs.org/";
const PENDING_FILE = "billion-context-pending.json";

export function readPendingContextOperation(dshProfileDir) {
  if (!dshProfileDir) return null;
  const filePath = path.join(dshProfileDir, PENDING_FILE);
  try {
    if (!existsSync(filePath)) return null;
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    if (data?.schema !== "opl_billion_context_pending.v1") return null;
    if (!["update", "remove"].includes(data.operation)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearPendingContextOperation(dshProfileDir) {
  if (!dshProfileDir) return;
  try {
    rmSync(path.join(dshProfileDir, PENDING_FILE), { force: true });
  } catch {
    // Best-effort cleanup.
  }
}

export async function cancelPendingContextOperation({ dshProfileDir: dir }) {
  if (!dir) return;
  const pending = readPendingContextOperation(dir);
  await withFileLock(path.join(dir, "package.json"), async () => {
    if (pending?.operation === "remove" && pending.previousEnabled !== false) {
      await saveBundleSelection(dir, true);
    }
    clearPendingContextOperation(dir);
  }, { waitMs: 10000 });
}

async function writePendingContextOperation(dshProfileDir, payload) {
  const filePath = path.join(dshProfileDir, PENDING_FILE);
  await writeFileAtomic(filePath, JSON.stringify(payload, null, 2) + "\n", { mode: 0o600 });
}

export function hasContextUpdate(available, installed) {
  return Boolean(semver.valid(available) && semver.valid(installed) && semver.gt(available, installed));
}

export function readContextPlugin({ dshProfileDir, dshInstallAnchor }) {
  if (!dshProfileDir) return { enabled: false, version: null, entry: null };
  const manifest = readProfileManifest("opl-studio", dshProfileDir);
  const enabled = manifest.dsh?.profile?.bundles?.includes(name) === true;
  if (!Object.hasOwn(manifest.dependencies ?? {}, name)) return { enabled, version: null, entry: null };
  const metadata = bundleManifest(name, dshProfileDir, dshInstallAnchor);
  const entry = path.join(dshProfileDir, "node_modules", name, "dist", "index.js");
  return { enabled, version: metadata?.version ?? null, entry: metadata && existsSync(entry) ? entry : null };
}

async function saveBundleSelection(dir, enabled) {
  const manifest = readProfileManifest("opl-studio", dir);
  const profile = manifest.dsh?.profile;
  const bundles = profile?.bundles ?? [];
  if (bundles.includes(name) === enabled) return;
  const next = enabled ? [...bundles, name] : bundles.filter(bundle => bundle !== name);
  await saveManifest(dir, { ...manifest, dsh: { ...manifest.dsh, profile: { ...profile, bundles: next } } });
}

export async function setContextPluginEnabled(options, enabled) {
  const dir = options.dshProfileDir;
  await withFileLock(path.join(dir, "package.json"), async () => {
    if (enabled && !readContextPlugin(options).entry)
      throw new ThreadAdapterError("billion_context_not_installed", "Install Billion Context in Software Center first", {}, 409);
    await saveBundleSelection(dir, enabled);
  }, { waitMs: 10000 });
}

async function lookupLatestCompatibleVersion(dir, installAnchor) {
  const command = process.execPath;
  const require = createRequire(installAnchor);
  const args = [path.join(path.dirname(require.resolve("pnpm")), "bin", "pnpm.mjs")];
  const lookup = await viewProfilePackage(dir, name + "@latest", {
    command, args, registry, fields: ["name", "version", "engines"], timeoutMs: 15000
  });
  if (lookup.exitCode !== 0) throw new ThreadAdapterError("dsh_plugin_registry_unavailable", "Could not check the upstream Billion Context release", {}, 502);
  const metadata = JSON.parse(lookup.stdout);
  if (metadata.name !== name || !semver.valid(metadata.version) || semver.prerelease(metadata.version)
    || (metadata.engines?.node && !semver.satisfies(process.versions.node, metadata.engines.node))) {
    throw new ThreadAdapterError("dsh_plugin_incompatible", "The upstream Billion Context release is incompatible", {}, 409);
  }
  return { command, args, version: metadata.version };
}

export async function stageContextPluginOperation({ dshProfileDir: dir, dshInstallAnchor: installAnchor }, operation, current) {
  if (!dir) throw new ThreadAdapterError("dsh_profile_unavailable", "The active DSH profile is unavailable", {}, 503);
  if (operation === "remove") {
    await withFileLock(path.join(dir, "package.json"), async () => {
      const existingPending = readPendingContextOperation(dir);
      const previousEnabled = existingPending?.operation === "remove" && typeof existingPending.previousEnabled === "boolean"
        ? existingPending.previousEnabled
        : readProfileManifest("opl-studio", dir).dsh?.profile?.bundles?.includes(name) === true;
      await writePendingContextOperation(dir, {
        schema: "opl_billion_context_pending.v1",
        operation: "remove",
        targetVersion: null,
        previousEnabled,
        requestedAt: new Date().toISOString()
      });
      await saveBundleSelection(dir, false);
    }, { waitMs: 10000 });
    return { staged: true, availableVersion: null };
  }
  const { version } = await lookupLatestCompatibleVersion(dir, installAnchor);
  if (!current || !semver.gt(version, current)) {
    return { staged: false, availableVersion: version };
  }
  await withFileLock(path.join(dir, "package.json"), async () => {
    await writePendingContextOperation(dir, {
      schema: "opl_billion_context_pending.v1",
      operation: "update",
      targetVersion: version,
      requestedAt: new Date().toISOString()
    });
  }, { waitMs: 10000 });
  return { staged: true, availableVersion: version };
}

export async function applyPendingContextOperation({ dshProfileDir: dir, dshInstallAnchor: installAnchor, dshHome: home }) {
  const pending = readPendingContextOperation(dir);
  if (!pending) return { applied: false };
  const command = process.execPath;
  const require = createRequire(installAnchor);
  const args = [path.join(path.dirname(require.resolve("pnpm")), "bin", "pnpm.mjs")];
  const profile = { profile: "opl-studio", dir, installAnchor, home, cwd: path.dirname(installAnchor) };
  try {
    if (pending.operation === "remove") {
      await withFileLock(path.join(dir, "package.json"), async () => {
        const result = await runProfilePnpm(profile, ["remove", name], {
          command, args, execution: "service", idleTimeoutMs: 60000
        });
        if (result.exitCode !== 0) throw new ThreadAdapterError("dsh_plugin_remove_failed", "Billion Context could not be removed", {}, 502);
        await saveBundleSelection(dir, false);
      }, { waitMs: 120000 });
      return { applied: true, operation: "remove" };
    }
    const targetVersion = pending.targetVersion;
    if (!targetVersion || !semver.valid(targetVersion)) {
      return { applied: false, error: new Error("Invalid staged Billion Context target version") };
    }
    const result = await runPluginCommand(profile, [
      "add", "--save-exact", "--ignore-scripts", "--registry=" + registry, `${name}@${targetVersion}`
    ], {
      command, args, execution: "service", activateNewBundles: false,
      expected: { name, version: targetVersion }, idleTimeoutMs: 120000, lockWaitMs: 120000
    });
    if (result.exitCode !== 0) throw new ThreadAdapterError("dsh_plugin_install_failed", "Billion Context could not be updated", {}, 502);
    return { applied: true, operation: "update", version: targetVersion };
  } catch (error) {
    return { applied: false, error };
  } finally {
    // Always clear pending state so a failed transition cannot trigger an infinite boot loop.
    clearPendingContextOperation(dir);
  }
}

export async function manageContextPlugin({ dshProfileDir: dir, dshInstallAnchor: installAnchor, dshHome: home }, operation, current) {
  const profile = { profile: "opl-studio", dir, installAnchor, home, cwd: path.dirname(installAnchor) };
  if (operation === "remove") {
    const command = process.execPath;
    const require = createRequire(installAnchor);
    const args = [path.join(path.dirname(require.resolve("pnpm")), "bin", "pnpm.mjs")];
    await withFileLock(path.join(dir, "package.json"), async () => {
      const result = await runProfilePnpm(profile, ["remove", name], {
        command, args, execution: "service", idleTimeoutMs: 60000
      });
      if (result.exitCode !== 0) throw new ThreadAdapterError("dsh_plugin_remove_failed", "Billion Context could not be removed", {}, 502);
      await saveBundleSelection(dir, false);
      clearPendingContextOperation(dir);
    }, { waitMs: 120000 });
    return null;
  }
  const { command, args, version } = await lookupLatestCompatibleVersion(dir, installAnchor);
  if (operation === "check" || (current && !semver.gt(version, current))) return version;
  const result = await runPluginCommand(profile, [
    "add", "--save-exact", "--ignore-scripts", "--registry=" + registry, name + "@" + version
  ], {
    command, args, execution: "service", activateNewBundles: false,
    expected: { name, version }, idleTimeoutMs: 120000, lockWaitMs: 120000
  });
  if (result.exitCode !== 0) throw new ThreadAdapterError("dsh_plugin_install_failed", "Billion Context could not be installed", {}, 502);
  clearPendingContextOperation(dir);
  return version;
}
