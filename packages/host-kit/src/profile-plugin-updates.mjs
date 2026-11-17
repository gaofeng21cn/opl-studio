import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createRuntimeResolution, evaluatePluginCompatibility, initProfile, loadOptionalPatches, loadProfile, readProfileManifest, resolveProfileDir, writeProfileBundles } from "@deepseek-ai/dsh-app-boot";
import { entryListSchema } from "@deepseek-ai/cordis-plugin-include";
import * as yaml from "js-yaml";
import { runPluginCommand, viewProfilePackage } from "@deepseek-ai/dsh-plugin-manager/operations";
import { classifyInstallFailure } from "@deepseek-ai/dsh-plugin-manager";
import semver from "semver";

const profile = "opl-studio";

const REGISTRY_URL = "https://npm.pkg.github.com";
const REGISTRY_HOST = "//npm.pkg.github.com/";
const LEGACY_SCOPE = "@one-person-lab/";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function isPublishableManifest(manifest) {
  return manifest?.name?.startsWith("@gaofeng21cn/")
    && manifest.private !== true
    && manifest.publishConfig?.registry === REGISTRY_URL
    && typeof manifest.version === "string"
    && typeof manifest.engines?.dsh === "string";
}

/** Discover publishable DSH packages from the package metadata that owns them. */
export function discoverPublishablePackages({ installAnchor, sourceRoot = process.cwd(), profilePackages = [] } = {}) {
  const candidates = new Map();
  const pluginRoot = path.join(sourceRoot, "plugins");
  if (!installAnchor && fs.existsSync(pluginRoot)) {
    for (const entry of fs.readdirSync(pluginRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(pluginRoot, entry.name, "package.json");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = readJson(manifestPath);
      if (isPublishableManifest(manifest)) candidates.set(manifest.name, manifest);
    }
  }
  if (installAnchor) {
    const carrierPackage = readJson(installAnchor);
    const carrierRequire = createRequire(installAnchor);
    for (const name of Object.keys(carrierPackage.dependencies ?? {})) {
      if (!name.startsWith("@gaofeng21cn/")) continue;
      try {
        const manifest = readJson(carrierRequire.resolve(`${name}/package.json`));
        if (isPublishableManifest(manifest)) candidates.set(name, manifest);
      } catch {
        // A missing optional carrier package is not an update candidate.
      }
    }
    for (const entry of profilePackages) {
      const manifest = readJson(path.join(entry.packageDir, "package.json"));
      if (isPublishableManifest(manifest)) candidates.set(manifest.name, manifest);
    }
  }
  return [...candidates.keys()].sort();
}

/**
 * Ensure the profile directory has an .npmrc that routes @gaofeng21cn to
 * GitHub Packages. If a token is provided, it is written as the _authToken
 * for that registry host. If the .npmrc already contains correct scope and
 * host entries, only the token line is updated (or added).
 */
export function ensureProfileNpmrc(dir, token) {
  const npmrcPath = path.join(dir, ".npmrc");
  const scopeLine = `@gaofeng21cn:registry=${REGISTRY_URL}`;

  let existing = "";
  try { existing = fs.readFileSync(npmrcPath, "utf8"); } catch {}
  const lines = existing.split("\n").filter(Boolean);
  const existingTokenLine = lines.find(line => line.startsWith(`${REGISTRY_HOST}:_authToken=`));
  const tokenLine = token ? `${REGISTRY_HOST}:_authToken=${token}` : existingTokenLine;
  const withoutManaged = lines.filter(l =>
    !l.startsWith("@gaofeng21cn:registry=") &&
    !l.startsWith("@one-person-lab:registry=") &&
    !l.startsWith(`${REGISTRY_HOST}:_authToken=`));

  const updated = [...withoutManaged, scopeLine, ...(tokenLine ? [tokenLine] : [])];
  fs.writeFileSync(npmrcPath, updated.join("\n") + "\n", { mode: 0o600 });
  fs.chmodSync(npmrcPath, 0o600);
}

/** Retire renamed overrides only after their replacement is available in this carrier/profile. */
export async function retireLegacyOverrides({ installAnchor, home, names, cwd = process.cwd(), run = runPluginCommand }) {
  const dir = resolveProfileDir(profile, home);
  const manifest = readJson(path.join(dir, "package.json"));
  const available = createRequire(path.join(dir, "package.json"));
  const carrier = createRequire(installAnchor);
  const retired = names.filter(name => name.startsWith("@gaofeng21cn/opl-")).map(name => {
    const old = LEGACY_SCOPE + name.slice("@gaofeng21cn/".length);
    if (!Object.hasOwn(manifest.dependencies ?? {}, old)) return null;
    try { available.resolve(`${name}/package.json`); }
    catch { carrier.resolve(`${name}/package.json`); }
    return old;
  }).filter(Boolean);
  if (retired.length) {
    const result = await run({ profile, dir, installAnchor, home, cwd }, ["remove", ...retired], {
      execution: "service", outputBytes: 16384, lockWaitMs: 120000, lookupTimeoutMs: 30000,
      idleTimeoutMs: 60000, activateNewBundles: false, onOutput: text => process.stderr.write(text)
    });
    if (result.exitCode !== 0 || result.timedOut) throw new Error(`Native DSH scope migration failed; inspect ${result.logPath}`);
  }
  const selected = readProfileManifest(profile, dir);
  const bundles = selected.dsh?.profile?.bundles ?? [];
  const migratedBundles = [...new Set(bundles.map(name => {
    if (!name.startsWith(LEGACY_SCOPE)) return name;
    const replacement = "@gaofeng21cn/" + name.slice(LEGACY_SCOPE.length);
    return names.includes(replacement) ? replacement : name;
  }))];
  if (JSON.stringify(bundles) !== JSON.stringify(migratedBundles)) writeProfileBundles(dir, selected, migratedBundles);
  const patchFile = path.join(dir, "cordis.patch.yml");
  const patches = loadOptionalPatches(profile, patchFile);
  let changed = false;
  const visit = entries => { for (const entry of entries ?? []) {
    if (typeof entry.name === "string" && entry.name.startsWith(LEGACY_SCOPE)) {
      const replacement = "@gaofeng21cn/" + entry.name.slice(LEGACY_SCOPE.length);
      if (names.some(name => replacement === name || replacement.startsWith(name + "/"))) {
        entry.name = replacement; changed = true;
      }
    }
    visit(entry.insert);
    if (entry.group && Array.isArray(entry.config)) visit(entry.config);
  } };
  visit(patches);
  if (changed) {
    const temporary = `${patchFile}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, yaml.dump(patches, { schema: entryListSchema, noRefs: true }), { mode: 0o600 });
      fs.renameSync(temporary, patchFile);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  return { removedLegacyOverrides: retired, profileChanged: retired.length > 0 || changed
    || JSON.stringify(bundles) !== JSON.stringify(migratedBundles) };
}

/** Resolve published versions against the selected carrier using DSH's own metadata admission. */
export async function resolveRegistryVersions(names, dir, installAnchor, view = viewProfilePackage) {
  const carrierRequire = createRequire(installAnchor);
  const profileRequire = createRequire(path.join(dir, "package.json"));
  const readManifest = name => {
    try { return readJson(profileRequire.resolve(`${name}/package.json`)); }
    catch { return readJson(carrierRequire.resolve(`${name}/package.json`)); }
  };
  const runtimeVersion = readManifest("@deepseek-ai/dsh-app-boot").version;
  const query = async (spec, fields) => {
    const result = await view(dir, spec, { registry: REGISTRY_URL, fields, timeoutMs: 15000 });
    if (result.exitCode !== 0 || result.timedOut) {
      const reason = classifyInstallFailure({ log: result.stderr + result.stdout, cause: result.cause, timedOut: result.timedOut });
      throw Object.assign(new Error("Registry lookup failed"), { code: reason });
    }
    try { return JSON.parse(result.stdout); }
    catch { throw Object.assign(new Error("Registry returned invalid JSON"), { code: "invalid_registry_response" }); }
  };
  const resolved = {};
  for (const name of names) {
    try {
      const baseline = readManifest(name).version;
      const answer = await query(name, ["versions"]);
      const listed = Array.isArray(answer) ? answer : typeof answer === "string" ? [answer] : answer?.versions;
      if (!Array.isArray(listed)) throw Object.assign(new Error("Registry returned no versions"), { code: "invalid_registry_response" });
      const versions = listed.filter(version => semver.valid(version) && semver.satisfies(version, "^" + baseline)).sort(semver.rcompare);
      let selected;
      for (const version of versions) {
        const manifest = await query(name + "@" + version, ["name", "version", "engines", "peerDependencies"]);
        if (manifest?.name !== name || manifest.version !== version) throw Object.assign(new Error("Registry package identity mismatch"), { code: "invalid_registry_response" });
        if (!evaluatePluginCompatibility(manifest, {}, runtimeVersion)) { selected = version; break; }
      }
      resolved[name] = selected ? { version: selected, available: true } : { available: false, reason: "no_compatible_version" };
    } catch (error) {
      resolved[name] = { available: false, reason: error.code ?? "registry_lookup_failed" };
    }
  }
  return resolved;
}

export function normalizePluginNames(names, available) {
  return names.map(name => {
    const full = name.startsWith("@") ? name : `@gaofeng21cn/${name}`;
    if (!available.includes(full)) throw new Error(`Not a publishable plugin: ${name}`);
    return full;
  });
}

export async function checkRegistryUpdates({ installAnchor, home, names, cwd = process.cwd(), view = viewProfilePackage } = {}) {
  const dir = resolveProfileDir(profile, home);
  initProfile(dir, []);
  const snapshot = await inspectProfile({ installAnchor, home });
  const available = discoverPublishablePackages({ installAnchor, profilePackages: snapshot.overrides });
  const selected = normalizePluginNames(names ?? available, available);
  const current = Object.fromEntries(snapshot.overrides.map(item => [item.name, item.version]));
  const resolved = await resolveRegistryVersions(selected, dir, installAnchor, view);
  const carrierRequire = createRequire(installAnchor);
  const baselineVersion = name => {
    try { return JSON.parse(fs.readFileSync(carrierRequire.resolve(`${name}/package.json`), "utf8")).version; }
    catch { return undefined; }
  };
  const plugins = Object.fromEntries(selected.map(name => {
    const installed = current[name] ?? baselineVersion(name) ?? null;
    const candidate = resolved[name]?.available ? resolved[name].version : null;
    const updateAvailable = Boolean(candidate && installed && semver.gt(candidate, installed));
    return [name, {
      installed,
      available: candidate,
      state: resolved[name]?.available === false ? "unavailable" : updateAvailable ? "update_available" : "current",
      reason: resolved[name]?.reason
    }];
  }));
  return { schema: "opl_dsh_plugin_updates.v1", profile, plugins, checkedAt: new Date().toISOString(), cwd };
}

export async function updateRegistryPlugins({ installAnchor, home, names, all = false, token, cwd = process.cwd(),
  view = viewProfilePackage, run = runPluginCommand } = {}) {
  if (!all && !names?.length) throw new Error("Specify all or at least one plugin");
  const dir = resolveProfileDir(profile, home);
  initProfile(dir, []);
  ensureProfileNpmrc(dir, token);
  const projection = await checkRegistryUpdates({ installAnchor, home, names: all ? undefined : names, cwd, view });
  const toInstall = Object.entries(projection.plugins).filter(([, value]) => value.state === "update_available");
  const failures = Object.fromEntries(Object.entries(projection.plugins).filter(([, value]) => value.state === "unavailable").map(([name, value]) => [name, value.reason]));
  if (!toInstall.length) {
    const migration = await retireLegacyOverrides({ installAnchor, home,
      names: Object.entries(projection.plugins).filter(([, value]) => value.state === "current").map(([name]) => name), cwd, run });
    return { operation: "update-registry", application: migration.profileChanged ? "restart-required"
      : Object.keys(failures).length ? "update-check-failed" : "current", installed: {}, failures, ...migration, profile, home };
  }
  const addArgs = ["add", "--save-exact", ...toInstall.map(([name, value]) => `${name}@${value.available}`)];
  const result = await run({ profile, dir, installAnchor, home, cwd }, addArgs, {
    execution: "service", outputBytes: 16384, lockWaitMs: 120000, lookupTimeoutMs: 30000,
    idleTimeoutMs: 60000, activateNewBundles: false, onOutput: text => process.stderr.write(text),
    env: token ? { NODE_AUTH_TOKEN: token } : {}
  });
  if (result.exitCode !== 0 || result.timedOut) throw new Error(`Native DSH package operation failed; inspect ${result.logPath}`);
  const saved = new Map((await inspectProfile({ installAnchor, home })).overrides.map(item => [item.name, item.version]));
  const installed = {};
  for (const [name, value] of toInstall) {
    if (saved.get(name) === value.available) installed[name] = value.available;
    else failures[name] = "installed_version_mismatch";
  }
  const migration = await retireLegacyOverrides({ installAnchor, home, names: Object.keys(installed), cwd, run });
  return { operation: "update-registry", application: Object.keys(installed).length ? "restart-required" : "update-check-failed", installed, failures, ...migration, profile, home };
}

export async function inspectProfile({ installAnchor, home }) {
  const loaded = loadProfile(profile, profile, installAnchor, home);
  const resolution = await createRuntimeResolution({ installAnchor, profile: loaded, home });
  const require = createRequire(path.join(loaded.dir, "package.json"));
  const local = resolution.localPackageNames.map(name => {
    const manifestPath = require.resolve(`${name}/package.json`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath));
    return { name, version: manifest.version, packageDir: path.dirname(manifestPath), scope: "profile" };
  });
  return { profile, home, installAnchor, skippedBundles: loaded.skippedBundles,
    overrides: local };
}

