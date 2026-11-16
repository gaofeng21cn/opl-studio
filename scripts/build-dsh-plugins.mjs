import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function buildDshPlugins(selected) {
  const packages = [];
  const entries = fs.readdirSync(path.join(root, "plugins"), { withFileTypes: true }).filter(entry => entry.isDirectory());
  if (selected) for (const name of selected) {
    if (!entries.some(entry => entry.name === name)) throw new Error(`Unknown DSH source package: ${name}`);
  }
  for (const entry of entries) {
    if (selected && !selected.includes(entry.name)) continue;
    const directory = path.join(root, "plugins", entry.name);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    fs.copyFileSync(path.join(root, entry.name === "opl-superagent-engine" ? "vendor/dsh-superagent/LICENSE" : "LICENSE"), path.join(directory, "LICENSE"));
    const source = path.join(directory, "src/index.mjs");
    if (fs.existsSync(source)) {
      fs.mkdirSync(path.join(directory, "lib"), { recursive: true });
      const result = spawnSync("bun", ["build", source, "--target=node", "--format=esm", "--packages=external", "--minify-syntax", "--outfile", path.join(directory, "lib/index.mjs")], { cwd: root, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Failed to build ${manifest.name}`);
    }
    for (const entrypoint of ["parent-transport", "workbench-profile"]) {
      const source = path.join(directory, `src/${entrypoint}.mjs`);
      if (!fs.existsSync(source)) continue;
      const result = spawnSync("bun", ["build", source, "--target=node", "--format=esm", "--packages=external", "--minify-syntax", "--outfile", path.join(directory, `lib/${entrypoint}.mjs`)], { cwd: root, encoding: "utf8" });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    }
    const client = path.join(directory, "src/client.js");
    if (fs.existsSync(client)) fs.copyFileSync(client, path.join(directory, "lib/client.js"));
    packages.push(manifest.name);
  }
  if (!selected || selected.includes("opl-superagent-engine")) {
    const superagent = spawnSync(process.execPath, [path.join(root, "scripts/build-superagent-engine.mjs")], { cwd: root, encoding: "utf8" });
    if (superagent.status !== 0) throw new Error(superagent.stderr || superagent.stdout);
  }
  return packages;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({ status: "built", packages: buildDshPlugins() }));
}
