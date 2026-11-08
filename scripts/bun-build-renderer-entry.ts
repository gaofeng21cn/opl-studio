import path from "node:path";

const [entrypoint, outdir, format = "esm"] = process.argv.slice(2);
if (!entrypoint || !outdir) throw new Error("usage: bun-build-renderer-entry.ts <entrypoint> <outdir> [format]");

const root = path.resolve(import.meta.dir, "..");
const result = await Bun.build({
  entrypoints: [entrypoint],
  outdir,
  target: "browser",
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
