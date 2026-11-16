import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendor = path.join(root, "vendor/dsh-superagent");
const target = path.join(root, "plugins/opl-superagent-engine");
const provenance = JSON.parse(fs.readFileSync(path.join(vendor, "provenance.json"), "utf8"));
for (const [file, expected] of Object.entries(provenance.source_files)) {
  const actual = createHash("sha256").update(fs.readFileSync(path.join(vendor, file))).digest("hex");
  if (actual !== expected) throw new Error(`Superagent upstream source changed: ${file}`);
}

for (const [name, source] of [["github-watch", "src/sources/github.ts"], ["feishu-watch", "src/sources/feishu.ts"], ["environment", "src/infra/environment.ts"]]) {
  const result = spawnSync("bun", ["build", path.join(vendor, source), "--target=node", "--format=esm", "--packages=external", "--outfile", path.join(target, "lib", `${name}.mjs`)], { encoding: "utf8" });
  if (result.status) throw Error(result.stderr);
}
await build({ entryPoints: [path.join(vendor, "src/client/index.tsx")], outfile: path.join(target, "lib/client.js"), bundle: true,
  format: "cjs", platform: "browser", target: "es2024", external: ["react", "react/jsx-runtime", "react-dom"],
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-superagent", factory: (require) => { var module = { exports: {} }; var exports = module.exports;' },
  footer: { js: "return module.exports; } });" },
  plugins: [{ name: "upstream-raw-assets", setup(plugin) {
    plugin.onResolve({ filter: /\?raw$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: "upstream-raw" }));
    plugin.onLoad({ filter: /.*/, namespace: "upstream-raw" }, args => ({ contents: fs.readFileSync(args.path, "utf8"), loader: "text" }));
  } }]
});
for (const name of ["prompts", "skills", "locale"]) fs.cpSync(path.join(vendor, name), path.join(target, name), { recursive: true });
for (const name of ["LICENSE", "cordis.patch.yml"]) fs.copyFileSync(path.join(vendor, name), path.join(target, name));
