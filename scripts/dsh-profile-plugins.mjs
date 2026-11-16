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
    package: { type: "string", multiple: true }, home: { type: "string" },
    "install-anchor": { type: "string", default: installedAnchor },
    "cache-root": { type: "string", default: path.join(os.homedir(), "Library/Caches/One Person Lab/dsh-plugins") },
    help: { type: "boolean" }
  } });
  if (values.help) {
    console.log("DSH profile plugins: inspect | update-source --package <directory-or-npm-name> [--package ...] | remove --package <npm-name>\nOptions: --home <DSH home> --install-anchor <carrier package.json> --cache-root <directory>\nUses native DSH package management. Restart the App to load a saved change; remove restores the bundled plugin.");
    return;
  }
  const operation = positionals[0] ?? "inspect";
  if (positionals.length > 1 || !["inspect", "update-source", "remove"].includes(operation)) throw new Error("Unknown DSH plugin operation");
  const installAnchor = path.resolve(values["install-anchor"]);
  const home = resolveDshHome(values.home);
  if (!fs.statSync(installAnchor).isFile()) throw new Error("The selected App carrier package.json is unavailable");
  const dir = resolveProfileDir(profile, home);
  if (operation === "inspect") {
    console.log(JSON.stringify(await inspectProfile({ installAnchor, home }), null, 2));
    return;
  }
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
