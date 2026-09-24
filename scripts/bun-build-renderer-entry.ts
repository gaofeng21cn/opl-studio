import path from "node:path";
import fs from "node:fs";
import { verifySettingsNavigationOverlay } from "./dsh-settings-navigation-overlay.mjs";

const [entrypoint, outdir, format = "esm"] = process.argv.slice(2);
if (!entrypoint || !outdir) throw new Error("usage: bun-build-renderer-entry.ts <entrypoint> <outdir> [format]");

const root = path.resolve(import.meta.dir, "..");
const settingsRootSource = verifySettingsNavigationOverlay(root,
  JSON.parse(fs.readFileSync(path.join(root, "src/composition/deepseekHarnessSourceManifest.json"), "utf8")));
const result = await Bun.build({
  entrypoints: [entrypoint],
  outdir,
  target: "browser",
  plugins: [{
    name: "opl-settings-navigation",
    setup(build) {
      build.onLoad({ filter: /ui-settings-general\/src\/client\/SettingsRoot\.tsx$/ }, args => ({
        contents: settingsRootSource,
        loader: "tsx"
      }));
    }
  }],
  format: format as "esm" | "cjs" | "iife",
  define: {
    "process.env.DSH_CLIENT_TITLE": JSON.stringify("One Person Lab"),
    "process.env.DSH_CLIENT_VERSION": "undefined",
    "process.env.DSH_CLIENT_GIT_DIRTY": "undefined",
    "process.env.DSH_CLIENT_COMMIT_HASH": JSON.stringify(""),
    "process.versions.node": JSON.stringify("0.0.0"),
    "process.execArgv": "[]",
    "process.env.CORDIS_SHARED": "undefined"
  },
  tsconfig: path.join(root, "tsconfig.json")
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
