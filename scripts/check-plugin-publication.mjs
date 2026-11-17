#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const registry = process.env.NPM_REGISTRY ?? "https://npm.pkg.github.com";

function packageJson(directory) {
  return JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
}

function registryShasum(name, version) {
  try {
    const output = execFileSync("npm", ["view", `${name}@${version}`, "dist.shasum", "--registry", registry, "--json"], {
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    const value = JSON.parse(output || "null");
    const shasum = Array.isArray(value) && value.length === 1 ? value[0] : value;
    if (typeof shasum !== "string" || !/^[0-9a-f]{40}$/.test(shasum)) {
      throw new Error("Registry returned no exact package tarball digest");
    }
    return shasum;
  } catch (error) {
    const stderr = String(error?.stderr ?? "");
    if (/npm (?:error|ERR!) code E404\b/.test(stderr)) return null;
    throw new Error(`Cannot inspect ${name}@${version} on ${registry}: ${stderr.trim() || error.message}`);
  }
}

export function inspectPublication(directory) {
  const manifest = packageJson(directory);
  if (manifest.private || !manifest.name || !manifest.version) {
    throw new Error("A publishable package directory is required");
  }
  const publishedShasum = registryShasum(manifest.name, manifest.version);
  if (!publishedShasum) return { name: manifest.name, version: manifest.version, status: "unpublished" };
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), "opl-plugin-pack-"));
  try {
    const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", destination], {
      cwd: directory,
      encoding: "utf8",
      env: process.env
    }));
    const packageResult = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
    const localShasum = packageResult?.shasum;
    if (typeof localShasum !== "string") throw new Error(`npm pack returned no shasum for ${manifest.name}`);
    if (localShasum !== publishedShasum) {
      throw new Error(`${manifest.name}@${manifest.version} is already published with different bytes: registry=${publishedShasum} local=${localShasum}`);
    }
    return { name: manifest.name, version: manifest.version, status: "published", publishedShasum, localShasum };
  } finally {
    fs.rmSync(destination, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = inspectPublication(path.resolve(process.argv[2] ?? "."));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
