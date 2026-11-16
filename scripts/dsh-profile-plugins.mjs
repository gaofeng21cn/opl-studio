import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createRuntimeResolution, initProfile, loadProfile, resolveProfileDir } from "@deepseek-ai/dsh-app-boot";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { runPluginCommand } from "@deepseek-ai/dsh-plugin-manager/operations";
import { buildDshPlugins } from "./build-dsh-plugins.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const profile = "opl-studio";
const installedAnchor = "/Applications/One Person Lab.app/Contents/Resources/app.asar.unpacked/package.json";

const REGISTRY_URL = "https://npm.pkg.github.com";
const REGISTRY_HOST = "//npm.pkg.github.com/";

/** All OPL DSH Host plugins eligible for independent registry publication. */
const PUBLISHABLE_PACKAGES = [
  "@one-person-lab/opl-codex-agents",
  "@one-person-lab/opl-codex-native",
  "@one-person-lab/opl-dsh-tool-mcp",
  "@one-person-lab/opl-framework-bridge",
  "@one-person-lab/opl-host-core",
  "@one-person-lab/opl-mcp-apps",
  "@one-person-lab/opl-superagent",
  "@one-person-lab/opl-team-bots",
  "@one-person-lab/opl-web-routes",
];

/**
 * Ensure the profile directory has an .npmrc that routes @one-person-lab to
 * GitHub Packages. If a token is provided, it is written as the _authToken
 * for that registry host. If the .npmrc already contains correct scope and
 * host entries, only the token line is updated (or added).
 */
function ensureProfileNpmrc(dir, token) {
  const npmrcPath = path.join(dir, ".npmrc");
  const scopeLine = `@one-person-lab:registry=${REGISTRY_URL}`;
  const tokenLine = token ? `${REGISTRY_HOST}:_authToken=${token}` : null;

  let existing = "";
  try { existing = fs.readFileSync(npmrcPath, "utf8"); } catch {}

  const lines = existing.split("\n").filter(Boolean);
  const withoutManaged = lines.filter(l =>
    !l.startsWith("@one-person-lab:registry=") &&
    !l.startsWith(`${REGISTRY_HOST}:_authToken=`));

  const updated = [...withoutManaged, scopeLine, ...(tokenLine ? [tokenLine] : [])];
  fs.writeFileSync(npmrcPath, updated.join("\n") + "\n", { mode: 0o600 });
}

/**
 * Resolve the latest published version of each package that satisfies the
 * caret range based on its local baseline version. Returns a map of
 * packageName → resolvedVersion. Packages not yet published fall back to
 * their local baseline version and are skipped in the registry add.
 */
function resolveRegistryVersions(names, dir) {
  const resolved = {};
  for (const pkgName of names) {
    const dirName = pkgName.replace("@one-person-lab/", "");
    const localManifest = JSON.parse(fs.readFileSync(path.join(root, "plugins", dirName, "package.json"), "utf8"));
    const baseVer = localManifest.version;
    const range = `${pkgName}@^${baseVer}`;
    const result = spawnSync("pnpm", ["view", range, "version", "--json",
      `--registry=${REGISTRY_URL}`, "--config.fetch-retries=0"], {
      cwd: dir, encoding: "utf8", timeout: 15000
    });
    if (result.status !== 0 || !result.stdout.trim()) {
      resolved[pkgName] = { version: baseVer, available: false };
      continue;
    }
    // pnpm view may return a string or an array when multiple versions match
    let versions;
    try { versions = JSON.parse(result.stdout.trim()); } catch { versions = baseVer; }
    const latest = Array.isArray(versions) ? versions[versions.length - 1] : versions;
    resolved[pkgName] = { version: String(latest), available: true };
  }
  return resolved;
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
    if (entry.id === "opl-studio-client") throw new Error("The static Studio renderer requires an App carrier build.");
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
    const names = values.all
      ? PUBLISHABLE_PACKAGES
      : (values.package ?? []).map(p => {
          // Accept either short dir name or full scoped name
          const full = p.startsWith("@") ? p : `@one-person-lab/${p}`;
          if (!PUBLISHABLE_PACKAGES.includes(full)) throw new Error(`Not a publishable plugin: ${p}`);
          return full;
        });
    if (!names.length) throw new Error("Specify --all or at least one --package for update-registry");

    const token = values.token ?? process.env.GITHUB_TOKEN ?? process.env.NODE_AUTH_TOKEN;

    initProfile(dir, []);
    ensureProfileNpmrc(dir, token);

    // Resolve latest compatible versions from the registry
    const resolved = resolveRegistryVersions(names, dir);
    const toInstall = Object.entries(resolved).filter(([, v]) => v.available);
    const skipped = Object.entries(resolved).filter(([, v]) => !v.available).map(([n]) => n);

    if (skipped.length) {
      process.stderr.write(`Skipped (not yet published): ${skipped.join(", ")}\n`);
    }
    if (!toInstall.length) {
      console.log(JSON.stringify({ operation, application: "no-updates",
        skipped, ...await inspectProfile({ installAnchor, home }) }, null, 2));
      return;
    }

    // Build the add args: each package at its resolved exact version
    const addArgs = ["add", ...toInstall.map(([name, v]) => `${name}@${v.version}`),
      `--registry=${REGISTRY_URL}`];

    const result = await runPluginCommand({ profile, dir, installAnchor, home, cwd: root }, addArgs, {
      execution: "service", outputBytes: 16384, lockWaitMs: 120000, lookupTimeoutMs: 30000,
      idleTimeoutMs: 60000, activateNewBundles: false,
      onOutput: text => process.stderr.write(text),
      env: token ? { NODE_AUTH_TOKEN: token } : {}
    });
    if (result.exitCode !== 0 || result.timedOut) throw new Error(`Native DSH package operation failed; inspect ${result.logPath}`);

    console.log(JSON.stringify({ operation, application: "restart-required",
      installed: Object.fromEntries(toInstall.map(([n, v]) => [n, v.version])),
      skipped, ...await inspectProfile({ installAnchor, home }) }, null, 2));
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
