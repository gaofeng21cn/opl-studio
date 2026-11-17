import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";

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

/** Read the module-table baseline from the pinned official boot package. */
function clientPlatformModules() {
  const require = createRequire(import.meta.url);
  const filename = require.resolve("@deepseek-ai/dsh-client-web/src/platform.ts");
  const source = fs.readFileSync(filename, "utf8");
  const body = source.match(/export const PLATFORM_MODULES = \[([\s\S]*?)\] as const/)?.[1];
  const modules = [...(body?.matchAll(/'([^']+)'/g) ?? [])].map(match => match[1]);
  if (!body || !modules.length) throw new Error("The pinned DSH boot package declares no static module-table baseline");
  return modules;
}

/** Match DSH apps/web's Vite/React pipeline while keeping carrier filenames stable. */
export async function buildRendererEntry(entrypoint, outdir, format = "esm", { external = [] } = {}) {
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
      rollupOptions: { external, output: { inlineDynamicImports: true } }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [entrypoint, outdir, format, clientPackage] = process.argv.slice(2);
  if (!entrypoint || !outdir) throw new Error("usage: vite-build-renderer-entry.mjs <entrypoint> <outdir> [format]");
  const manifest = clientPackage ? JSON.parse(fs.readFileSync(path.join(clientPackage, "package.json"), "utf8")) : undefined;
  const extra = manifest?.dsh?.client?.external ?? [];
  if (!Array.isArray(extra) || extra.some(value => typeof value !== "string")) throw new Error("dsh.client.external must be a string array");
  await buildRendererEntry(entrypoint, outdir, format, {
    external: manifest ? [...clientPlatformModules(), ...extra] : []
  });
}
