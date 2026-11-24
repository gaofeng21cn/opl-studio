#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.join(root, "packages/opl-plugin-ui-kit");
const srcEntry = path.join(packageDir, "src/index.ts");
const distDir = path.join(packageDir, "dist");

export async function buildPluginUiKit() {
  fs.copyFileSync(path.join(root, "LICENSE"), path.join(packageDir, "LICENSE"));
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  await build({
    entryPoints: [srcEntry],
    outfile: path.join(distDir, "index.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    external: ["react", "react/jsx-runtime", "react-dom", "@deepseek-ai/dsh-client-ui-primitives"]
  });

  const tscBin = path.join(root, "node_modules/typescript/bin/tsc");
  const tscResult = spawnSync(process.execPath, [tscBin, "-p", path.join(packageDir, "tsconfig.json")], {
    cwd: root,
    encoding: "utf8"
  });
  if (tscResult.status !== 0) {
    throw new Error(tscResult.stderr || tscResult.stdout || "Failed to emit @gaofeng21cn/opl-plugin-ui-kit declarations");
  }

  const forbidden = ["vendor/", "@gaofeng21cn/opl-host-contracts", "@deepseek-ai/dsh-client-ui-slots"];
  for (const entry of fs.readdirSync(distDir)) {
    if (!/\.(?:js|d\.ts)$/.test(entry)) continue;
    const content = fs.readFileSync(path.join(distDir, entry), "utf8");
    for (const marker of forbidden) {
      if (content.includes(marker)) {
        throw new Error(`Published UI kit artifact dist/${entry} leaked restricted reference: ${marker}`);
      }
    }
  }

  return {
    name: "@gaofeng21cn/opl-plugin-ui-kit",
    distDir
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildPluginUiKit();
  console.log(JSON.stringify({ status: "built", ...result }));
}
