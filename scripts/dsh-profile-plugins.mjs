import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { initProfile, resolveProfileDir } from "@deepseek-ai/dsh-app-boot";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { runPluginCommand } from "@deepseek-ai/dsh-plugin-manager/operations";
import { buildDshPlugins } from "./build-dsh-plugins.mjs";
import { discoverPublishablePackages, inspectProfile, isPublishableManifest, normalizePluginNames, retireLegacyOverrides, updateRegistryPlugins } from "@gaofeng21cn/opl-host-kit/profile-plugin-updates";
export { checkRegistryUpdates, discoverPublishablePackages, ensureProfileNpmrc, inspectProfile, resolveRegistryVersions, retireLegacyOverrides, updateRegistryPlugins } from "@gaofeng21cn/opl-host-kit/profile-plugin-updates";

const root = fileURLToPath(new URL("..", import.meta.url));
const profile = "opl-studio";
const installedAnchor = "/Applications/One Person Lab.app/Contents/Resources/app.asar.unpacked/package.json";

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
      "                 [--all]            Update every publishable source plugin",
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
  const names = operation === "update-source" && values.all ? discoverPublishablePackages({ sourceRoot: root }) : values.package ?? [];
  if (!names.length) throw new Error("--package is required");
  if (operation === "update-source") {
    const selected = normalizePluginNames(names, discoverPublishablePackages({ sourceRoot: root }));
    const carrierPackages = discoverPublishablePackages({ installAnchor });
    if (selected.some(name => !carrierPackages.includes(name))) {
      throw new Error("The selected carrier does not include these plugin identities; update the App carrier first.");
    }
  }
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
  const migration = operation === "update-source" ? await retireLegacyOverrides({ installAnchor, home,
    names: normalizePluginNames(names, discoverPublishablePackages({ sourceRoot: root })) }) : {};
  console.log(JSON.stringify({ operation, application: "restart-required",
    ...migration,
    ...await inspectProfile({ installAnchor, home }) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
