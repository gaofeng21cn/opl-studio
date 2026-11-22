import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { readProfileManifest } from "@deepseek-ai/dsh-app-boot";
import { withFileLock } from "@deepseek-ai/dsh-atomic-write";
import { bundleManifest, runPluginCommand, runProfilePnpm, saveManifest, viewProfilePackage } from "@deepseek-ai/dsh-plugin-manager/operations";
import semver from "semver";
import { ThreadAdapterError } from "@gaofeng21cn/opl-host-contracts/thread-error";

const name = "billion-context";
const registry = "https://registry.npmjs.org/";

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

export async function manageContextPlugin({ dshProfileDir: dir, dshInstallAnchor: installAnchor, dshHome: home }, operation, current) {
  const command = process.execPath;
  const require = createRequire(installAnchor);
  const args = [path.join(path.dirname(require.resolve("pnpm")), "bin", "pnpm.mjs")];
  const profile = { profile: "opl-studio", dir, installAnchor, home, cwd: path.dirname(installAnchor) };
  if (operation === "remove") {
    await withFileLock(path.join(dir, "package.json"), async () => {
      const result = await runProfilePnpm(profile, ["remove", name], {
        command, args, execution: "service", idleTimeoutMs: 60000
      });
      if (result.exitCode !== 0) throw new ThreadAdapterError("dsh_plugin_remove_failed", "Billion Context could not be removed", {}, 502);
      await saveBundleSelection(dir, false);
    }, { waitMs: 120000 });
    return null;
  }
  const lookup = await viewProfilePackage(dir, name + "@latest", {
    command, args, registry, fields: ["name", "version", "engines"], timeoutMs: 15000
  });
  if (lookup.exitCode !== 0) throw new ThreadAdapterError("dsh_plugin_registry_unavailable", "Could not check the upstream Billion Context release", {}, 502);
  const metadata = JSON.parse(lookup.stdout);
  if (metadata.name !== name || !semver.valid(metadata.version) || semver.prerelease(metadata.version)
    || (metadata.engines?.node && !semver.satisfies(process.versions.node, metadata.engines.node))) {
    throw new ThreadAdapterError("dsh_plugin_incompatible", "The upstream Billion Context release is incompatible", {}, 409);
  }
  if (operation === "check" || (current && !semver.gt(metadata.version, current))) return metadata.version;
  const result = await runPluginCommand(profile, [
    "add", "--save-exact", "--ignore-scripts", "--registry=" + registry, name + "@" + metadata.version
  ], {
    command, args, execution: "service", activateNewBundles: false,
    expected: { name, version: metadata.version }, idleTimeoutMs: 120000, lockWaitMs: 120000
  });
  if (result.exitCode !== 0) throw new ThreadAdapterError("dsh_plugin_install_failed", "Billion Context could not be installed", {}, 502);
  return metadata.version;
}
