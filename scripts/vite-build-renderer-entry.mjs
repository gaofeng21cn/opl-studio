import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Use the existing source aliases without maintaining a second package map. */
function sourceAliases() {
  const tsconfig = JSON.parse(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8"));
  return Object.entries(tsconfig.compilerOptions.paths).map(([specifier, paths]) => {
    if (specifier.includes("*") || paths.length !== 1) {
      throw new Error(`Renderer source alias must have one exact target: ${specifier}`);
    }
    return {
      find: new RegExp(`^${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      replacement: path.resolve(root, paths[0])
    };
  });
}

function nodeModuleStub() {
  return path.join(root, "scripts/vite-node-module-stub.mjs");
}

/** Match DSH apps/web's Vite/React pipeline while keeping carrier filenames stable. */
export async function buildRendererEntry(entrypoint, outdir, format = "esm") {
  const formats = { esm: "es", iife: "iife", cjs: "cjs" };
  const outputFormat = formats[format];
  if (!outputFormat) throw new Error(`Unsupported renderer output format: ${format}`);
  const name = path.basename(entrypoint).replace(/\.[^.]+$/, "");
  return build({
    root,
    configFile: false,
    publicDir: false,
    base: "./",
    logLevel: "warn",
    plugins: [react()],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: [
        { find: /^node:module$/, replacement: nodeModuleStub() },
        ...sourceAliases()
      ],
      mainFields: ["main", "module"],
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.DSH_CLIENT_TITLE": JSON.stringify("One Person Lab"),
      "process.env.DSH_CLIENT_VERSION": "undefined",
      "process.env.DSH_CLIENT_GIT_DIRTY": "undefined",
      "process.env.DSH_CLIENT_COMMIT_HASH": JSON.stringify(""),
      "process.versions.node": JSON.stringify("0.0.0"),
      "process.execArgv": "[]",
      "process.env.CORDIS_SHARED": "undefined"
    },
    build: {
      target: "es2022",
      outDir: path.resolve(outdir),
      emptyOutDir: false,
      minify: false,
      cssMinify: false,
      cssCodeSplit: false,
      reportCompressedSize: false,
      lib: {
        entry: path.resolve(entrypoint),
        name: "OplStudioRenderer",
        formats: [outputFormat],
        fileName: () => `${name}.js`,
        cssFileName: name
      },
      rollupOptions: { output: { inlineDynamicImports: true } }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [entrypoint, outdir, format] = process.argv.slice(2);
  if (!entrypoint || !outdir) throw new Error("usage: vite-build-renderer-entry.mjs <entrypoint> <outdir> [format]");
  await buildRendererEntry(entrypoint, outdir, format);
}
