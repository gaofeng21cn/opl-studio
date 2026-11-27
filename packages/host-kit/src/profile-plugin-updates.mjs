import fs from "node:fs";
import path from "node:path";
import { listDshSourcePackages } from "./dsh-source-packages.mjs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createRuntimeResolution, evaluatePluginCompatibility, initProfile, loadOptionalPatches, loadProfile, readProfileManifest, resolveProfileDir, writeProfileBundles } from "@deepseek-ai/dsh-app-boot";
import { stringifyEntryYaml } from "@deepseek-ai/cordis-plugin-include";
import { runPluginCommand, runProfilePnpm, viewProfilePackage } from "@deepseek-ai/dsh-plugin-manager/operations";
import { classifyInstallFailure } from "@deepseek-ai/dsh-plugin-manager";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import semver from "semver";
import {
  readInstalledExternalPackageManifest,
  readUserExternalDshPlugins,
  removeUserExternalDshPlugin,
  upsertUserExternalDshPlugin,
  validateExternalDshPackageName
} from "../dsh-plugin-catalog.mjs";

const NPM_PUBLIC_REGISTRY = "https://registry.npmjs.org/";

const profile = "opl-studio";

const REGISTRY_URL = "https://npm.pkg.github.com";
const REGISTRY_HOST = "//npm.pkg.github.com/";
const LEGACY_SCOPE = "@one-person-lab/";
export const PUBLIC_FEED_URL = "https://github.com/gaofeng21cn/opl-studio/releases/download/dsh-plugins-latest/dsh-plugin-index.json";

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

/** Resolve bundled pnpm inside the packaged carrier so users do not need global pnpm. */
export function resolveBundledPnpm(installAnchor) {
  if (!installAnchor) return {};
  try {
    let cursor = path.dirname(path.resolve(installAnchor));
    while (true) {
      const candidate = path.join(cursor, "node_modules", "pnpm", "bin", "pnpm.mjs");
      if (fs.existsSync(candidate)) return { command: process.execPath, args: [candidate] };
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    const require = createRequire(installAnchor);
    const pnpmBin = path.join(path.dirname(require.resolve("pnpm")), "bin", "pnpm.mjs");
    if (fs.existsSync(pnpmBin)) {
      return { command: process.execPath, args: [pnpmBin] };
    }
  } catch {
    // Fall back to system pnpm in developer environments without a local pnpm package.
  }
  return {};
}

function isAllowedTarballUrl(rawUrl, allowLoopbackHttp = false) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol === "http:") {
      return allowLoopbackHttp && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
    }
    if (parsed.protocol !== "https:") return false;
    return parsed.hostname === "github.com" || parsed.hostname.endsWith(".githubusercontent.com");
  } catch {
    return false;
  }
}

function isLoopbackHttpFeed(feedUrl) {
  try {
    const parsed = new URL(feedUrl);
    return parsed.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function parseIntegrity(integrity) {
  if (typeof integrity !== "string") return null;
  const match = integrity.trim().match(/^(sha512|sha256)-([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return { algorithm: match[1], digestBase64: match[2] };
}

function matchesIntegrity(buffer, parsedIntegrity) {
  const actual = createHash(parsedIntegrity.algorithm).update(buffer).digest("base64");
  const actualBytes = Buffer.from(actual, "base64");
  const expectedBytes = Buffer.from(parsedIntegrity.digestBase64, "base64");
  return actualBytes.length === expectedBytes.length && actualBytes.equals(expectedBytes);
}

export function hasProfileRegistryToken(dir, env = process.env) {
  if (env.GITHUB_TOKEN || env.NODE_AUTH_TOKEN) return true;
  try {
    const existing = fs.readFileSync(path.join(dir, ".npmrc"), "utf8");
    return existing.split("\n").some((line) => {
      if (!line.startsWith(`${REGISTRY_HOST}:_authToken=`)) return false;
      return line.slice(`${REGISTRY_HOST}:_authToken=`.length).trim().length > 0;
    });
  } catch {
    return false;
  }
}

/** Discover publishable DSH packages from the package metadata that owns them. */
export function discoverPublishablePackages({ installAnchor, sourceRoot = process.cwd(), profilePackages = [] } = {}) {
  const candidates = new Map();
  if (!installAnchor) {
    for (const { manifest } of listDshSourcePackages(sourceRoot)) {
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
  const pnpmExec = resolveBundledPnpm(installAnchor);
  const retired = names.filter(name => name.startsWith("@gaofeng21cn/opl-")).map(name => {
    const old = LEGACY_SCOPE + name.slice("@gaofeng21cn/".length);
    if (!Object.hasOwn(manifest.dependencies ?? {}, old)) return null;
    try { available.resolve(`${name}/package.json`); }
    catch { carrier.resolve(`${name}/package.json`); }
    return old;
  }).filter(Boolean);
  if (retired.length) {
    const result = await run({ profile, dir, installAnchor, home, cwd }, ["remove", ...retired], {
      ...pnpmExec,
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
  const bundlesChanged = JSON.stringify(bundles) !== JSON.stringify(migratedBundles);
  if (bundlesChanged) writeProfileBundles(dir, selected, migratedBundles);
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
    await writeFileAtomic(patchFile, stringifyEntryYaml(patches, { lineWidth: -1 }), { mode: 0o600 });
  }
  return { removedLegacyOverrides: retired, profileChanged: retired.length > 0 || changed || bundlesChanged };
}

function readPackageMetadataResolvers(dir, installAnchor) {
  const carrierRequire = createRequire(installAnchor);
  const profileRequire = createRequire(path.join(dir, "package.json"));
  const readManifest = name => {
    try { return readJson(profileRequire.resolve(`${name}/package.json`)); }
    catch { return readJson(carrierRequire.resolve(`${name}/package.json`)); }
  };
  return { readManifest, runtimeVersion: readManifest("@deepseek-ai/dsh-app-boot").version };
}

/** Resolve published versions from the anonymous public release feed with DSH metadata admission. */
export async function resolvePublicFeedVersions(names, dir, installAnchor, { feedUrl = process.env.OPL_DSH_PLUGIN_FEED_URL || PUBLIC_FEED_URL, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const { readManifest, runtimeVersion } = readPackageMetadataResolvers(dir, installAnchor);
  const allowLoopbackHttp = isLoopbackHttpFeed(feedUrl);
  let response;
  try {
    response = await fetchImpl(feedUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError" || error?.code === "ETIMEDOUT";
    throw Object.assign(new Error("Public DSH plugin feed request failed"), { code: timedOut ? "timeout" : "network" });
  }
  if (!response?.ok) {
    throw Object.assign(new Error(`Public DSH plugin feed returned HTTP ${response?.status}`), {
      code: response?.status === 404 ? "feed_unavailable" : "network"
    });
  }
  let feed;
  try {
    feed = await response.json();
  } catch {
    throw Object.assign(new Error("Public DSH plugin feed returned invalid JSON"), { code: "invalid_feed_response" });
  }
  if (feed?.schema !== "opl_dsh_plugin_public_feed.v1" || typeof feed.plugins !== "object" || feed.plugins === null || Array.isArray(feed.plugins)) {
    throw Object.assign(new Error("Public DSH plugin feed schema is invalid"), { code: "invalid_feed_response" });
  }
  const resolved = {};
  for (const name of names) {
    const baseline = readManifest(name).version;
    const entries = Array.isArray(feed.plugins[name]) ? feed.plugins[name] : [];
    const compatibleCandidates = entries
      .filter(entry => entry && typeof entry.version === "string"
        && semver.valid(entry.version)
        && !semver.prerelease(entry.version)
        && semver.satisfies(entry.version, "^" + baseline))
      .sort((left, right) => semver.rcompare(left.version, right.version));
    let selected = null;
    for (const entry of compatibleCandidates) {
      if (typeof entry.tarballUrl !== "string" || !isAllowedTarballUrl(entry.tarballUrl, allowLoopbackHttp)) continue;
      if (!parseIntegrity(entry.integrity)) continue;
      const manifest = {
        name,
        version: entry.version,
        engines: entry.engines,
        peerDependencies: entry.peerDependencies
      };
      if (!evaluatePluginCompatibility(manifest, {}, runtimeVersion)) {
        selected = entry;
        break;
      }
    }
    resolved[name] = selected
      ? { available: true, version: selected.version, tarballUrl: selected.tarballUrl, integrity: selected.integrity, source: "public_feed" }
      : { available: false, reason: "no_compatible_version" };
  }
  return resolved;
}

/** Download and integrity-verify a public DSH plugin tarball before handing it to DSH pnpm. */
export async function downloadVerifiedPluginTarball({ name, version, tarballUrl, integrity, cacheDir, fetchImpl = fetch, allowLoopbackHttp = false, timeoutMs = 60000 }) {
  if (!isAllowedTarballUrl(tarballUrl, allowLoopbackHttp)) {
    throw Object.assign(new Error(`Untrusted tarball URL for ${name}`), { code: "invalid_tarball_url" });
  }
  const parsedIntegrity = parseIntegrity(integrity);
  if (!parsedIntegrity) {
    throw Object.assign(new Error(`Invalid tarball integrity digest for ${name}`), { code: "integrity_mismatch" });
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  const digestHexPrefix = createHash("sha256").update(integrity).digest("hex").slice(0, 12);
  const safeName = name.replace(/^@/, "").replaceAll("/", "-");
  const destination = path.join(cacheDir, `${safeName}-${version}-${digestHexPrefix}.tgz`);
  if (fs.existsSync(destination)) {
    const existing = fs.readFileSync(destination);
    if (matchesIntegrity(existing, parsedIntegrity)) return destination;
    fs.rmSync(destination, { force: true });
  }
  let response;
  try {
    response = await fetchImpl(tarballUrl, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError" || error?.code === "ETIMEDOUT";
    throw Object.assign(new Error(`Tarball download failed for ${name}`), { code: timedOut ? "timeout" : "network" });
  }
  if (!response?.ok) {
    throw Object.assign(new Error(`Tarball download failed for ${name} (HTTP ${response?.status})`), { code: "network" });
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!matchesIntegrity(bytes, parsedIntegrity)) {
    throw Object.assign(new Error(`Tarball integrity mismatch for ${name}@${version}`), { code: "integrity_mismatch" });
  }
  await writeFileAtomic(destination, bytes, { mode: 0o600 });
  return destination;
}

/** Resolve published versions against the selected carrier using DSH's own metadata admission. */
export async function resolveRegistryVersions(names, dir, installAnchor, view = viewProfilePackage) {
  const { readManifest, runtimeVersion } = readPackageMetadataResolvers(dir, installAnchor);
  const pnpmExec = resolveBundledPnpm(installAnchor);
  const query = async (spec, fields) => {
    const result = await view(dir, spec, { ...pnpmExec, registry: REGISTRY_URL, fields, timeoutMs: 15000 });
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
      const versions = listed.filter(version => semver.valid(version) && !semver.prerelease(version) && semver.satisfies(version, "^" + baseline)).sort(semver.rcompare);
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

async function resolveUpdatePlan({ installAnchor, home, names, view, token, feedUrl, fetchImpl }) {
  const dir = resolveProfileDir(profile, home);
  initProfile(dir, []);
  const snapshot = await inspectProfile({ installAnchor, home });
  const available = discoverPublishablePackages({ installAnchor, profilePackages: snapshot.overrides });
  const selected = normalizePluginNames(names ?? available, available);
  const current = Object.fromEntries(snapshot.overrides.map(item => [item.name, item.version]));
  const useRegistryOnly = Boolean(view || token);
  let resolved;
  let source = "github_packages";
  if (useRegistryOnly) {
    resolved = await resolveRegistryVersions(selected, dir, installAnchor, view);
  } else {
    try {
      resolved = await resolvePublicFeedVersions(selected, dir, installAnchor, { feedUrl, fetchImpl });
      source = "public_feed";
    } catch (error) {
      if (hasProfileRegistryToken(dir)) {
        resolved = await resolveRegistryVersions(selected, dir, installAnchor);
        source = "github_packages";
      } else {
        const reason = error.code ?? "feed_unavailable";
        resolved = Object.fromEntries(selected.map(name => [name, { available: false, reason }]));
        source = "public_feed";
      }
    }
  }
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
  return { dir, source, resolved, plugins };
}

export async function checkRegistryUpdates({ installAnchor, home, names, cwd = process.cwd(), view, token, feedUrl, fetchImpl } = {}) {
  const plan = await resolveUpdatePlan({ installAnchor, home, names, view, token, feedUrl, fetchImpl });
  return { schema: "opl_dsh_plugin_updates.v1", profile, source: plan.source, plugins: plan.plugins, checkedAt: new Date().toISOString(), cwd };
}

export async function updateRegistryPlugins({ installAnchor, home, names, all = false, token, cwd = process.cwd(),
  view, run = runPluginCommand, feedUrl, fetchImpl } = {}) {
  if (!all && !names?.length) throw new Error("Specify all or at least one plugin");
  const dir = resolveProfileDir(profile, home);
  initProfile(dir, []);
  if (token) ensureProfileNpmrc(dir, token);
  const plan = await resolveUpdatePlan({ installAnchor, home, names: all ? undefined : names, view, token, feedUrl, fetchImpl });
  const toInstall = Object.entries(plan.plugins).filter(([, value]) => value.state === "update_available");
  const failures = Object.fromEntries(Object.entries(plan.plugins).filter(([, value]) => value.state === "unavailable").map(([name, value]) => [name, value.reason]));
  if (!toInstall.length) {
    const migration = await retireLegacyOverrides({ installAnchor, home,
      names: Object.entries(plan.plugins).filter(([, value]) => value.state === "current").map(([name]) => name), cwd, run });
    return { operation: "update-registry", application: migration.profileChanged ? "restart-required"
      : Object.keys(failures).length ? "update-check-failed" : "current", installed: {}, failures, ...migration, profile, home };
  }
  const pnpmExec = resolveBundledPnpm(installAnchor);
  const usePublicFeed = plan.source === "public_feed" && !view && !token;
  let addArgs;
  const acceptedTargets = [];
  if (usePublicFeed) {
    const resolvedFeedUrl = feedUrl || process.env.OPL_DSH_PLUGIN_FEED_URL || PUBLIC_FEED_URL;
    const allowLoopbackHttp = isLoopbackHttpFeed(resolvedFeedUrl);
    const cacheDir = path.join(home, "cache", "dsh-plugins");
    const tarballPaths = [];
    for (const [name, value] of toInstall) {
      const target = plan.resolved[name];
      try {
        const filePath = await downloadVerifiedPluginTarball({
          name,
          version: value.available,
          tarballUrl: target.tarballUrl,
          integrity: target.integrity,
          cacheDir,
          fetchImpl,
          allowLoopbackHttp
        });
        tarballPaths.push(filePath);
        acceptedTargets.push([name, value]);
      } catch (error) {
        failures[name] = error.code ?? "tarball_download_failed";
      }
    }
    if (!acceptedTargets.length) {
      return { operation: "update-registry", application: "update-check-failed", installed: {}, failures, profile, home };
    }
    addArgs = ["add", ...tarballPaths];
  } else {
    ensureProfileNpmrc(dir, token);
    acceptedTargets.push(...toInstall);
    addArgs = ["add", "--save-exact", ...acceptedTargets.map(([name, value]) => `${name}@${value.available}`)];
  }
  const result = await run({ profile, dir, installAnchor, home, cwd }, addArgs, {
    ...pnpmExec,
    execution: "service", outputBytes: 16384, lockWaitMs: 120000, lookupTimeoutMs: 30000,
    idleTimeoutMs: 60000, activateNewBundles: false, onOutput: text => process.stderr.write(text),
    env: token ? { NODE_AUTH_TOKEN: token } : {}
  });
  if (result.exitCode !== 0 || result.timedOut) throw new Error(`Native DSH package operation failed; inspect ${result.logPath}`);
  const saved = new Map((await inspectProfile({ installAnchor, home })).overrides.map(item => [item.name, item.version]));
  const installed = {};
  for (const [name, value] of acceptedTargets) {
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

function externalUpstreamUrl(metadata) {
  if (typeof metadata?.homepage === "string" && /^https?:\/\//i.test(metadata.homepage)) return metadata.homepage;
  const repoUrl = typeof metadata?.repository === "string" ? metadata.repository : metadata?.repository?.url;
  if (typeof repoUrl === "string") {
    const normalized = repoUrl.replace(/^git\+/, "").replace(/\.git$/, "");
    if (/^https?:\/\//i.test(normalized)) return normalized;
  }
  return undefined;
}

function externalPermissionsForManifest(metadata) {
  const hasClient = Boolean(metadata?.dsh?.client);
  return {
    zh: [
      ...(hasClient ? ["向 OPL App 界面槽位注册扩展组件（以 PluginErrorBoundary 隔离）"] : ["在 DSH 服务进程内运行扩展能力"]),
      "从 npm 安装且全程禁用生命周期脚本（--ignore-scripts）",
      "启用、停用、更新与卸载需重启应用后生效"
    ],
    en: [
      ...(hasClient ? ["Registers client UI extensions inside PluginErrorBoundary"] : ["Runs extension services inside the DSH host"]),
      "Installed from npm with lifecycle scripts disabled (--ignore-scripts)",
      "Changes take effect after restarting the app"
    ]
  };
}

async function setExternalBundleActiveInProfile(dir, packageName, enabled) {
  const manifest = readProfileManifest(profile, dir);
  const current = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : [];
  const next = enabled
    ? (current.includes(packageName) ? current : [...current, packageName])
    : current.filter(name => name !== packageName);
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    writeProfileBundles(dir, manifest, next);
  }
}

async function lookupExternalNpmDshRelease({
  dir,
  installAnchor,
  packageName,
  view = viewProfilePackage,
  registry = NPM_PUBLIC_REGISTRY
}) {
  const pnpmExec = resolveBundledPnpm(installAnchor);
  const command = pnpmExec.command ?? process.execPath;
  const args = pnpmExec.args ?? [];
  const lookup = await view(dir, `${packageName}@latest`, {
    command,
    args,
    registry,
    fields: ["name", "version", "description", "engines", "dsh", "homepage", "repository"],
    timeoutMs: 15000
  });
  if (lookup.exitCode !== 0) {
    throw Object.assign(new Error(`Could not inspect ${packageName} on npm`), { code: "dsh_plugin_registry_unavailable" });
  }
  const metadata = typeof lookup.stdout === "string" ? JSON.parse(lookup.stdout) : lookup.stdout;
  if (!metadata || metadata.name !== packageName || !semver.valid(metadata.version) || semver.prerelease(metadata.version)) {
    throw Object.assign(new Error(`Invalid npm metadata returned for ${packageName}`), { code: "dsh_plugin_incompatible" });
  }
  if (!metadata.dsh || typeof metadata.dsh !== "object") {
    throw Object.assign(new Error(`${packageName} does not declare a DSH plugin manifest ("dsh" field missing)`), { code: "dsh_plugin_incompatible" });
  }
  if (metadata.engines?.node && !semver.satisfies(process.versions.node, metadata.engines.node)) {
    throw Object.assign(new Error(`${packageName}@${metadata.version} is incompatible with Node ${process.versions.node}`), { code: "dsh_plugin_incompatible" });
  }
  if (installAnchor) {
    const { runtimeVersion } = readPackageMetadataResolvers(dir, installAnchor);
    const compat = evaluatePluginCompatibility(metadata, {}, runtimeVersion);
    if (compat && !compat.exempted) {
      throw Object.assign(new Error(`${packageName}@${metadata.version} is incompatible with DSH ${runtimeVersion}`), { code: "dsh_plugin_incompatible" });
    }
  }
  return { command, args, metadata };
}

/**
 * Executes pending external npm plugin removals during cold boot before DSH loads the profile.
 */
export async function applyPendingExternalPluginRemovalsOnBoot({
  dir,
  installAnchor,
  home,
  cwd = process.cwd(),
  runRemove = runProfilePnpm
}) {
  if (!dir) return { removed: [], failed: [] };
  const pendingRemovals = Object.entries(readUserExternalDshPlugins(dir))
    .filter(([, record]) => record.pendingOperation === "remove");
  if (pendingRemovals.length === 0) return { removed: [], failed: [] };
  const pnpmExec = resolveBundledPnpm(installAnchor);
  const profileCtx = { profile, dir, installAnchor, home, cwd };
  const removed = [];
  const failed = [];
  for (const [packageName] of pendingRemovals) {
    try {
      const applied = await withFileLock(path.join(dir, "package.json"), async () => {
        if (readUserExternalDshPlugins(dir)[packageName]?.pendingOperation !== "remove") return false;
        await setExternalBundleActiveInProfile(dir, packageName, false);
        const manifest = readProfileManifest(profile, dir);
        if (Object.hasOwn(manifest.dependencies ?? {}, packageName)) {
          const result = await runRemove(profileCtx, ["remove", packageName], {
            command: pnpmExec.command ?? process.execPath,
            args: pnpmExec.args ?? [],
            execution: "service",
            outputBytes: 16384,
            idleTimeoutMs: 60000
          });
          if (result.exitCode !== 0 || result.timedOut) {
            throw Object.assign(new Error(`Could not remove ${packageName}`), { code: "dsh_plugin_remove_failed" });
          }
        } else if (readInstalledExternalPackageManifest(dir, packageName)) {
          // A previous pnpm run detached the dependency but left usable package files.
          // Let reconciliation retry the filesystem cleanup before dropping the record.
          return false;
        }
        await removeUserExternalDshPlugin(dir, packageName);
        return true;
      }, { waitMs: 120000 });
      if (applied) removed.push(packageName);
    } catch {
      failed.push(packageName);
    }
  }
  return { removed, failed };
}

/**
 * Manages open community/external npm DSH plugins inside the DSH profile with strict
 * package name validation, compatibility admission, --ignore-scripts execution, and activity history.
 */
export async function manageExternalNpmDshPlugin({
  home,
  installAnchor,
  dir: explicitDir,
  packageName: rawPackageName,
  operation,
  activeAtBoot = false,
  cwd = process.cwd(),
  view = viewProfilePackage,
  run = runPluginCommand,
  runRemove = runProfilePnpm
}) {
  const packageName = validateExternalDshPackageName(rawPackageName);
  const dir = explicitDir ?? resolveProfileDir(profile, home);
  if (!dir) throw Object.assign(new Error("DSH profile directory is unavailable"), { code: "dsh_profile_unavailable" });
  initProfile(dir, []);
  const profileCtx = { profile, dir, installAnchor, home, cwd };
  const existing = readUserExternalDshPlugins(dir)[packageName];
  const installedManifest = readInstalledExternalPackageManifest(dir, packageName);
  const installedVersion = installedManifest?.version ?? existing?.installedVersion ?? null;

  if (operation === "enable" || operation === "disable") {
    const nextEnabled = operation === "enable";
    if (!installedManifest && nextEnabled) {
      throw Object.assign(new Error(`${packageName} is not installed`), { code: "dsh_plugin_not_installed" });
    }
    await withFileLock(path.join(dir, "package.json"), async () => {
      const current = readUserExternalDshPlugins(dir)[packageName];
      await setExternalBundleActiveInProfile(dir, packageName, nextEnabled);
      await upsertUserExternalDshPlugin(dir, {
        ...current,
        packageName,
        enabled: nextEnabled,
        installedVersion: readInstalledExternalPackageManifest(dir, packageName)?.version ?? current?.installedVersion ?? installedVersion
      });
    }, { waitMs: 10000 });
    return {
      operation,
      packageName,
      version: installedVersion,
      restartRequired: nextEnabled !== activeAtBoot,
      record: readUserExternalDshPlugins(dir)[packageName]
    };
  }

  if (operation === "cancel_pending") {
    return withFileLock(path.join(dir, "package.json"), async () => {
      const current = readUserExternalDshPlugins(dir)[packageName];
      if (!current?.pendingOperation) {
        return { operation, packageName, version: installedVersion, restartRequired: false };
      }
      if (current.pendingOperation !== "remove") {
        throw Object.assign(
          new Error(`Cannot cancel staged update for ${packageName}: updated package files are already installed`),
          { code: "dsh_plugin_cancel_unsupported" }
        );
      }
      const installed = readInstalledExternalPackageManifest(dir, packageName);
      if (!installed) {
        throw Object.assign(
          new Error(`Cannot cancel removal of ${packageName}: the package is no longer installed`),
          { code: "dsh_plugin_cancel_unavailable" }
        );
      }
      const restoredEnabled = current.previousEnabled !== false;
      await setExternalBundleActiveInProfile(dir, packageName, restoredEnabled);
      await upsertUserExternalDshPlugin(dir, {
        ...current,
        packageName,
        enabled: restoredEnabled,
        previousEnabled: undefined,
        pendingOperation: null,
        pendingVersion: null
      });
      return {
        operation,
        packageName,
        version: installed.version ?? installedVersion,
        restartRequired: restoredEnabled !== activeAtBoot
      };
    }, { waitMs: 10000 });
  }

  if (operation === "remove") {
    if (!existing && !installedManifest) {
      return { operation, packageName, version: null, restartRequired: false };
    }
    if (activeAtBoot) {
      await withFileLock(path.join(dir, "package.json"), async () => {
        const current = readUserExternalDshPlugins(dir)[packageName];
        const previousEnabled = current?.pendingOperation === "remove"
          ? (typeof current.previousEnabled === "boolean" ? current.previousEnabled : true)
          : current?.enabled !== false;
        await setExternalBundleActiveInProfile(dir, packageName, false);
        await upsertUserExternalDshPlugin(dir, {
          ...current,
          packageName,
          installedVersion: readInstalledExternalPackageManifest(dir, packageName)?.version ?? current?.installedVersion ?? installedVersion,
          previousEnabled,
          enabled: false,
          pendingOperation: "remove",
          pendingVersion: null,
          updateAvailable: false
        });
      }, { waitMs: 10000 });
      return {
        operation,
        packageName,
        version: installedVersion,
        restartRequired: true
      };
    }
    const pnpmExec = resolveBundledPnpm(installAnchor);
    await withFileLock(path.join(dir, "package.json"), async () => {
      await setExternalBundleActiveInProfile(dir, packageName, false);
      const manifest = readProfileManifest(profile, dir);
      if (Object.hasOwn(manifest.dependencies ?? {}, packageName)) {
        const result = await runRemove(profileCtx, ["remove", packageName], {
          command: pnpmExec.command ?? process.execPath,
          args: pnpmExec.args ?? [],
          execution: "service",
          outputBytes: 16384,
          idleTimeoutMs: 60000
        });
        if (result.exitCode !== 0 || result.timedOut) {
          throw Object.assign(new Error(`Could not remove ${packageName}`), { code: "dsh_plugin_remove_failed" });
        }
      }
      await removeUserExternalDshPlugin(dir, packageName);
    }, { waitMs: 120000 });
    return {
      operation,
      packageName,
      version: installedVersion,
      restartRequired: false
    };
  }

  const { command, args, metadata } = await lookupExternalNpmDshRelease({ dir, installAnchor, packageName, view });
  const latestVersion = metadata.version;
  const upstreamUrl = externalUpstreamUrl(metadata);
  const label = metadata.dsh?.title || metadata.dsh?.name || packageName;
  const description = typeof metadata.description === "string" && metadata.description.trim()
    ? metadata.description.trim()
    : undefined;
  const baseRecord = {
    packageName,
    labelI18n: { zh: label, en: label },
    ...(description ? { descriptionI18n: { zh: description, en: description } } : {}),
    permissionsI18n: externalPermissionsForManifest(metadata),
    ...(upstreamUrl ? { upstreamUrl } : {})
  };

  if (operation === "check") {
    const latestManifest = readInstalledExternalPackageManifest(dir, packageName);
    const latestInstalledVersion = latestManifest?.version ?? readUserExternalDshPlugins(dir)[packageName]?.installedVersion ?? installedVersion;
    const updateAvailable = Boolean(latestInstalledVersion && semver.valid(latestInstalledVersion) && semver.gt(latestVersion, latestInstalledVersion));
    await withFileLock(path.join(dir, "package.json"), async () => {
      const current = readUserExternalDshPlugins(dir)[packageName];
      if (current || readInstalledExternalPackageManifest(dir, packageName)) {
        await upsertUserExternalDshPlugin(dir, {
          ...baseRecord,
          installedVersion: latestInstalledVersion,
          availableVersion: latestVersion,
          updateAvailable,
          checkErrorReason: undefined
        });
      }
    }, { waitMs: 10000 });
    return {
      operation,
      packageName,
      version: latestInstalledVersion,
      availableVersion: latestVersion,
      updateAvailable,
      restartRequired: false
    };
  }

  if (operation === "update" && installedVersion && !semver.gt(latestVersion, installedVersion)) {
    await withFileLock(path.join(dir, "package.json"), async () => {
      const current = readUserExternalDshPlugins(dir)[packageName];
      if (current) {
        await upsertUserExternalDshPlugin(dir, {
          ...baseRecord,
          installedVersion,
          availableVersion: latestVersion,
          updateAvailable: false
        });
      }
    }, { waitMs: 10000 });
    return {
      operation,
      packageName,
      version: installedVersion,
      availableVersion: latestVersion,
      updateAvailable: false,
      staged: false,
      restartRequired: false
    };
  }

  if (operation !== "install" && operation !== "update") {
    throw Object.assign(new Error(`Unsupported external plugin operation: ${String(operation)}`), { code: "invalid_request" });
  }

  const result = await run(profileCtx, [
    "add", "--save-exact", "--ignore-scripts", `--registry=${NPM_PUBLIC_REGISTRY}`, `${packageName}@${latestVersion}`
  ], {
    command,
    args,
    execution: "service",
    outputBytes: 16384,
    activateNewBundles: false,
    expected: { name: packageName, version: latestVersion },
    idleTimeoutMs: 120000,
    lockWaitMs: 120000
  });
  if (result.exitCode !== 0 || result.timedOut) {
    throw Object.assign(new Error(`Could not install ${packageName}@${latestVersion}`), { code: "dsh_plugin_install_failed" });
  }
  const installedPkgManifest = readInstalledExternalPackageManifest(dir, packageName) ?? metadata;
  const pnpmExec = resolveBundledPnpm(installAnchor);
  let outcome;
  await withFileLock(path.join(dir, "package.json"), async () => {
    const current = readUserExternalDshPlugins(dir)[packageName];
    if (operation === "update" && current?.pendingOperation === "remove") {
      await setExternalBundleActiveInProfile(dir, packageName, false);
      outcome = {
        operation,
        packageName,
        version: current.installedVersion ?? installedVersion,
        availableVersion: latestVersion,
        updated: false,
        staged: false,
        restartRequired: true
      };
      return;
    }
    if (operation === "update" && !current && existing) {
      await setExternalBundleActiveInProfile(dir, packageName, false);
      const manifest = readProfileManifest(profile, dir);
      if (Object.hasOwn(manifest.dependencies ?? {}, packageName)) {
        await runRemove(profileCtx, ["remove", packageName], {
          command: pnpmExec.command ?? process.execPath,
          args: pnpmExec.args ?? [],
          execution: "service",
          outputBytes: 16384,
          idleTimeoutMs: 60000
        }).catch(() => undefined);
      }
      outcome = {
        operation,
        packageName,
        version: null,
        availableVersion: latestVersion,
        updated: false,
        staged: false,
        restartRequired: false
      };
      return;
    }
    const shouldEnable = operation === "install" ? true : current?.enabled !== false;
    const restartRequired = Boolean(activeAtBoot || shouldEnable);
    await setExternalBundleActiveInProfile(dir, packageName, shouldEnable);
    await upsertUserExternalDshPlugin(dir, {
      ...current,
      ...baseRecord,
      permissionsI18n: externalPermissionsForManifest(installedPkgManifest),
      installedVersion: latestVersion,
      availableVersion: latestVersion,
      updateAvailable: false,
      enabled: shouldEnable,
      pendingOperation: activeAtBoot ? "update" : null,
      pendingVersion: activeAtBoot ? latestVersion : null
    });
    outcome = {
      operation,
      packageName,
      version: latestVersion,
      availableVersion: latestVersion,
      updated: true,
      staged: restartRequired,
      restartRequired
    };
  }, { waitMs: 120000 });
  return outcome;
}
