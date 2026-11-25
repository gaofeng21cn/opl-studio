import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function bundledPluginPackageArgs(rootManifest, manifest) {
  const localLibraries = { ...rootManifest.dependencies, ...rootManifest.devDependencies };
  const packageNames = new Set([
    ...Object.keys(rootManifest.dependencies ?? {}),
    ...Object.keys(rootManifest.devDependencies ?? {}),
    ...Object.keys(rootManifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
  return [
    "--packages=bundle",
    ...[...packageNames]
      .filter((name) => !localLibraries[name]?.startsWith("file:packages/"))
      .flatMap((name) => ["--external", name]),
  ];
}

export function buildDshPlugins(selected, { skipBuild = false } = {}) {
  const packages = [];
  const entries = fs.readdirSync(path.join(root, "plugins"), { withFileTypes: true }).filter(entry => entry.isDirectory());
  if (selected) for (const name of selected) {
    if (!entries.some(entry => entry.name === name)) throw new Error(`Unknown DSH source package: ${name}`);
  }
  if (!skipBuild && (!selected || selected.some((name) => name !== "opl-superagent-engine"))) {
    const uiKit = spawnSync(process.execPath, [path.join(root, "scripts/build-plugin-ui-kit.mjs")], {
      cwd: root,
      encoding: "utf8"
    });
    if (uiKit.status !== 0) {
      throw new Error(uiKit.stderr || uiKit.stdout || "Failed to build @gaofeng21cn/opl-plugin-ui-kit");
    }
  }
  const rootManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  for (const entry of entries) {
    if (selected && !selected.includes(entry.name)) continue;
    const directory = path.join(root, "plugins", entry.name);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    if (!skipBuild) {
      const packageArgs = bundledPluginPackageArgs(rootManifest, manifest);
      fs.copyFileSync(path.join(root, entry.name === "opl-superagent-engine" ? "vendor/dsh-superagent/LICENSE" : "LICENSE"), path.join(directory, "LICENSE"));
      const source = path.join(directory, "src/index.mjs");
      if (fs.existsSync(source)) {
        fs.mkdirSync(path.join(directory, "lib"), { recursive: true });
        const result = spawnSync("bun", ["build", source, "--target=node", "--format=esm", ...packageArgs, "--minify-syntax", "--outfile", path.join(directory, "lib/index.mjs")], { cwd: root, encoding: "utf8" });
        if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Failed to build ${manifest.name}`);
      }
      for (const entrypoint of ["parent-transport", "workbench-profile"]) {
        const source = path.join(directory, `src/${entrypoint}.mjs`);
        if (!fs.existsSync(source)) continue;
        const result = spawnSync("bun", ["build", source, "--target=node", "--format=esm", ...packageArgs, "--minify-syntax", "--outfile", path.join(directory, `lib/${entrypoint}.mjs`)], { cwd: root, encoding: "utf8" });
        if (result.status !== 0) throw new Error(result.stderr || result.stdout);
      }
      const client = path.join(directory, "src/client.js");
      const clientPlugin = path.join(directory, "src/client/plugin.tsx");
      if (fs.existsSync(clientPlugin)) {
        // DSH's official client-modules loader consumes one CJS factory per
        // dsh.client package. The React/Cordis platform singletons stay
        // external; feature code and its private UI dependencies travel with
        // this independently published plugin byte set.
        const staging = fs.mkdtempSync(path.join(root, ".dsh-client-build-"));
        try {
          const result = spawnSync(process.execPath, [path.join(root, "scripts/vite-build-renderer-entry.mjs"), clientPlugin, staging, "cjs", directory], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
          if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Failed to build ${manifest.name} client`);
          const jsFile = fs.readdirSync(staging).find(file => file.endsWith(".js"));
          if (!jsFile) throw new Error(`Client build produced no JavaScript for ${manifest.name}`);
          const cssFile = fs.readdirSync(staging).find(file => file.endsWith(".css"));
          const js = fs.readFileSync(path.join(staging, jsFile), "utf8");
          const css = cssFile ? fs.readFileSync(path.join(staging, cssFile), "utf8") : "";
          const style = css ? `if(typeof document!=="undefined"){var style=document.createElement("style");style.setAttribute("data-plugin",${JSON.stringify(manifest.name)});style.textContent=${JSON.stringify(css)};document.head.append(style);}` : "";
          fs.writeFileSync(path.join(directory, "lib/client.js"), `window.__ModuleLoader__.load({id:${JSON.stringify(manifest.name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;${js}\n${style}\nreturn module.exports;}});\n`);
        } finally {
          fs.rmSync(staging, { recursive: true, force: true });
        }
      } else if (fs.existsSync(client)) {
        fs.copyFileSync(client, path.join(directory, "lib/client.js"));
      }
    }
    packages.push(manifest.name);
  }
  if (!skipBuild && (!selected || selected.includes("opl-superagent-engine"))) {
    const superagent = spawnSync(process.execPath, [path.join(root, "scripts/build-superagent-engine.mjs")], { cwd: root, encoding: "utf8" });
    if (superagent.status !== 0) throw new Error(superagent.stderr || superagent.stdout);
  }
  return packages;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Registry composition installs still run dependency lifecycle scripts
  // (Electron and native modules need them), while the root prepare hook
  // must leave the receipt-selected Host package bytes untouched.
  const registry = process.env.OPL_DSH_REGISTRY_PLUGINS === "1";
  console.log(JSON.stringify({ status: registry ? "registry_plugins_preserved" : "built",
    packages: buildDshPlugins(registry ? ["opl-superagent-engine"] : undefined) }));
}
