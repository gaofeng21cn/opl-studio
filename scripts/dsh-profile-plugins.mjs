import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createRuntimeResolution, evaluatePluginCompatibility, initProfile, loadProfile, resolveProfileDir } from "@deepseek-ai/dsh-app-boot";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { runPluginCommand, viewProfilePackage } from "@deepseek-ai/dsh-plugin-manager/operations";
import { classifyInstallFailure } from "@deepseek-ai/dsh-plugin-manager";
import semver from "semver";
import { buildDshPlugins } from "./build-dsh-plugins.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const profile = "opl-studio";
const installedAnchor = "/Applications/One Person Lab.app/Contents/Resources/app.asar.unpacked/package.json";

const REGISTRY_URL = "https://npm.pkg.github.com";
const REGISTRY_HOST = "//npm.pkg.github.com/";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isPublishableManifest(manifest) {
  return manifest?.name?.startsWith("@one-person-lab/")
    && manifest.private !== true
    && manifest.publishConfig?.registry === REGISTRY_URL
    && typeof manifest.version === "string"
    && typeof manifest.engines?.dsh === "string";
}

/** Discover publishable DSH packages from the package metadata that owns them. */
export function discoverPublishablePackages({ installAnchor, sourceRoot = root, profilePackages = [] } = {}) {
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
      if (!name.startsWith("@one-person-lab/")) continue;
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
 * Ensure the profile directory has an .npmrc that routes @one-person-lab to
 * GitHub Packages. If a token is provided, it is written as the _authToken
 * for that registry host. If the .npmrc already contains correct scope and
 * host entries, only the token line is updated (or added).
 */
export function ensureProfileNpmrc(dir, token) {
  const npmrcPath = path.join(dir, ".npmrc");
  const scopeLine = `@one-person-lab:registry=${REGISTRY_URL}`;

  let existing = "";
  try { existing = fs.readFileSync(npmrcPath, "utf8"); } catch {}
  const lines = existing.split("\n").filter(Boolean);
  const existingTokenLine = lines.find(line => line.startsWith(`${REGISTRY_HOST}:_authToken=`));
  const tokenLine = token ? `${REGISTRY_HOST}:_authToken=${token}` : existingTokenLine;
  const withoutManaged = lines.filter(l =>
    !l.startsWith("@one-person-lab:registry=") &&
    !l.startsWith(`${REGISTRY_HOST}:_authToken=`));

  const updated = [...withoutManaged, scopeLine, ...(tokenLine ? [tokenLine] : [])];
  fs.writeFileSync(npmrcPath, updated.join("\n") + "\n", { mode: 0o600 });
  fs.chmodSync(npmrcPath, 0o600);
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

function normalizePluginNames(names, available) {
  return names.map(name => {
    const full = name.startsWith("@") ? name : `@one-person-lab/${name}`;
    if (!available.includes(full)) throw new Error(`Not a publishable plugin: ${name}`);
    return full;
  });
}

export async function checkRegistryUpdates({ installAnchor, home, names, cwd = root, view = viewProfilePackage } = {}) {
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

export async function updateRegistryPlugins({ installAnchor, home, names, all = false, token, cwd = root,
  view = viewProfilePackage, run = runPluginCommand } = {}) {
  if (!all && !names?.length) throw new Error("Specify all or at least one plugin");
  const dir = resolveProfileDir(profile, home);
  initProfile(dir, []);
  ensureProfileNpmrc(dir, token);
  const projection = await checkRegistryUpdates({ installAnchor, home, names: all ? undefined : names, cwd, view });
  const toInstall = Object.entries(projection.plugins).filter(([, value]) => value.state === "update_available");
  const failures = Object.fromEntries(Object.entries(projection.plugins).filter(([, value]) => value.state === "unavailable").map(([name, value]) => [name, value.reason]));
  if (!toInstall.length) return { operation: "update-registry", application: Object.keys(failures).length ? "update-check-failed" : "current", installed: {}, failures, profile, home };
  const addArgs = ["add", "--save-exact", ...toInstall.map(([name, value]) => `${name}@${value.available}`), `--registry=${REGISTRY_URL}`];
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
  return { operation: "update-registry", application: Object.keys(installed).length ? "restart-required" : "update-check-failed", installed, failures, profile, home };
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

export function packSourcePlugins(names, cacheRoot) {
  const directories = fs.readdirSync(path.join(root, "plugins"), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => {
      const directory = path.join(root, "plugins", entry.name);
      return { directory, id: entry.name, manifest: JSON.parse(fs.readFileSync(path.join(directory, "package.json"))) };
    });
  const selected = names.map(name => {
    const entry = directories.find(entry => entry.id === name || entry.manifest.name === name);
    if (!entry) throw new Error(`Unknown DSH source package: ${name}`);
    if (!isPublishableManifest(entry.manifest)) {
      throw new Error(`Package is not an independently publishable DSH package: ${entry.manifest.name}`);
    }
    return entry;
  });
  if (!selected.length || new Set(selected.map(entry => entry.id)).size !== selected.length) {
    throw new Error("Select one or more distinct DSH source packages with --package.");
  }
  buildDshPlugins(selected.map(entry => entry.id));
  fs.mkdirSync(cacheRoot, { recursive: true });
  const staging = fs.mkdtempSync(path.join(cacheRoot, ".pack-"));
  try {
    return selected.map(entry => {
      const result = spawnSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", staging], {
        cwd: entry.directory, encoding: "utf8"
      });
      if (result.status !== 0) throw new Error(result.stderr || "npm pack failed");
      const parsed = JSON.parse(result.stdout);
      const packed = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
      const archive = path.join(staging, packed.filename);
      const bytes = fs.readFileSync(archive);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const destination = path.join(cacheRoot, `${entry.id}-${hash}.tgz`);
      fs.writeFileSync(destination, bytes);
      return destination;
    });
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    package: { type: "string", multiple: true },
    all: { type: "boolean", default: false },
    token: { type: "string" },
    home: { type: "string" },
    "install-anchor": { type: "string", default: installedAnchor },
    "cache-root": { type: "string", default: path.join(os.homedir(), "Library/Caches/One Person Lab/dsh-plugins") },
    help: { type: "boolean" }
  } });
  if (values.help) {
    console.log([
      "DSH profile plugins — manage OPL Host plugin overrides in the native DSH profile.",
      "",
      "Operations:",
      "  inspect                           Show current profile overrides",
      "  update-source  --package <id>     Build from local source and install",
      "  update-registry [--all]           Pull latest compatible from GitHub Packages",
      "                 [--package <name>] Pull specific packages only",
      "                 [--token <tok>]    GitHub token with read:packages scope",
      "                                   (defaults to GITHUB_TOKEN env var)",
      "  remove         --package <name>   Remove override; bundled baseline restores on restart",
      "",
      "Options:",
      "  --home <dir>              DSH home directory",
      "  --install-anchor <path>   carrier package.json (default: installed macOS App)",
      "  --cache-root <dir>        tarball cache for update-source",
      "",
      "Restart the App to load a saved change.",
    ].join("\n"));
    return;
  }
  const operation = positionals[0] ?? "inspect";
  if (positionals.length > 1 || !["inspect", "update-source", "update-registry", "remove"].includes(operation)) {
    throw new Error(`Unknown DSH plugin operation: ${operation}. Use inspect | update-source | update-registry | remove`);
  }
  const installAnchor = path.resolve(values["install-anchor"]);
  const home = resolveDshHome(values.home);
  if (!fs.statSync(installAnchor).isFile()) throw new Error("The selected App carrier package.json is unavailable");
  const dir = resolveProfileDir(profile, home);

  if (operation === "inspect") {
    console.log(JSON.stringify(await inspectProfile({ installAnchor, home }), null, 2));
    return;
  }

  if (operation === "update-registry") {
    // Determine which packages to update
    const available = discoverPublishablePackages({ installAnchor });
    const names = values.all ? available : (values.package ?? []);
    if (!names.length) throw new Error("Specify --all or at least one --package for update-registry");
    const token = values.token ?? process.env.GITHUB_TOKEN ?? process.env.NODE_AUTH_TOKEN;
    const result = await updateRegistryPlugins({ installAnchor, home, names, all: values.all, token, cwd: root });
    console.log(JSON.stringify(result, null, 2));
    if (Object.keys(result.failures ?? {}).length) process.exitCode = 1;
    return;
  }

  // update-source and remove
  const names = values.package ?? [];
  if (!names.length) throw new Error("--package is required");
  const args = operation === "update-source"
    ? ["add", ...packSourcePlugins(names, path.resolve(values["cache-root"]))]
    : ["remove", ...names];
  initProfile(dir, []);
  const result = await runPluginCommand({ profile, dir, installAnchor, home, cwd: root }, args, {
    execution: "service", outputBytes: 16384, lockWaitMs: 120000, lookupTimeoutMs: 30000,
    idleTimeoutMs: 60000, activateNewBundles: false,
    onOutput: text => process.stderr.write(text)
  });
  if (result.exitCode !== 0 || result.timedOut) throw new Error(`Native DSH package operation failed; inspect ${result.logPath}`);
  console.log(JSON.stringify({ operation, application: "restart-required",
    ...await inspectProfile({ installAnchor, home }) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
