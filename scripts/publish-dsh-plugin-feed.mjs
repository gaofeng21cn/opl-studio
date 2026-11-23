#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO = "gaofeng21cn/opl-studio";
const DEFAULT_TAG = "dsh-plugins-latest";
const REGISTRY_URL = "https://npm.pkg.github.com";

export function publicFeedDownloadUrl(repo, tag, assetName) {
  return `https://github.com/${repo}/releases/download/${tag}/${assetName}`;
}

export function packPublishablePlugins(sourceRoot, destinationDir) {
  const pluginRoot = path.join(sourceRoot, "plugins");
  fs.mkdirSync(destinationDir, { recursive: true });
  const packed = [];
  for (const entry of fs.readdirSync(pluginRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(pluginRoot, entry.name);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    if (!manifest?.name?.startsWith("@gaofeng21cn/") || manifest.private === true || manifest.publishConfig?.registry !== REGISTRY_URL) {
      continue;
    }
    const raw = execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", destinationDir], {
      cwd: directory,
      encoding: "utf8"
    });
    const parsed = JSON.parse(raw);
    const meta = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
    const archivePath = path.join(destinationDir, meta.filename);
    const assetName = `${entry.name}-${manifest.version}.tgz`;
    const assetPath = path.join(destinationDir, assetName);
    if (archivePath !== assetPath) fs.renameSync(archivePath, assetPath);
    const integrity = "sha512-" + createHash("sha512").update(fs.readFileSync(assetPath)).digest("base64");
    packed.push({
      dirName: entry.name,
      name: manifest.name,
      version: manifest.version,
      engines: manifest.engines ?? {},
      peerDependencies: manifest.peerDependencies ?? {},
      assetName,
      assetPath,
      integrity
    });
  }
  return packed;
}

export function mergePublicFeedIndex(existingFeed, packedPlugins, { repo = DEFAULT_REPO, tag = DEFAULT_TAG, generatedAt = new Date().toISOString() } = {}) {
  const plugins = {};
  if (existingFeed?.schema === "opl_dsh_plugin_public_feed.v1" && existingFeed.plugins && typeof existingFeed.plugins === "object") {
    for (const [name, entries] of Object.entries(existingFeed.plugins)) {
      if (Array.isArray(entries)) plugins[name] = entries.filter(entry => entry && typeof entry.version === "string");
    }
  }
  for (const item of packedPlugins) {
    const current = plugins[item.name] ?? [];
    const nextEntry = {
      version: item.version,
      engines: item.engines,
      peerDependencies: item.peerDependencies,
      tarballUrl: publicFeedDownloadUrl(repo, tag, item.assetName),
      integrity: item.integrity
    };
    const filtered = current.filter(entry => entry.version !== item.version);
    plugins[item.name] = [nextEntry, ...filtered];
  }
  return {
    schema: "opl_dsh_plugin_public_feed.v1",
    generatedAt,
    repository: repo,
    tag,
    plugins
  };
}

function readExistingFeed(repo, tag, scratchDir) {
  try {
    execFileSync("gh", ["release", "view", tag, "--repo", repo], { stdio: "ignore" });
  } catch {
    return null;
  }
  try {
    execFileSync("gh", ["release", "download", tag, "--repo", repo, "--pattern", "dsh-plugin-index.json", "--dir", scratchDir], {
      stdio: "ignore"
    });
    return JSON.parse(fs.readFileSync(path.join(scratchDir, "dsh-plugin-index.json"), "utf8"));
  } catch {
    return null;
  }
}

export function publishPublicPluginFeed({ sourceRoot, stagingDir, repo = DEFAULT_REPO, tag = DEFAULT_TAG }) {
  fs.mkdirSync(stagingDir, { recursive: true });
  const packed = packPublishablePlugins(sourceRoot, stagingDir);
  const existingFeed = readExistingFeed(repo, tag, stagingDir);
  const index = mergePublicFeedIndex(existingFeed, packed, { repo, tag });
  const indexPath = path.join(stagingDir, "dsh-plugin-index.json");
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
  try {
    execFileSync("gh", ["release", "view", tag, "--repo", repo], { stdio: "ignore" });
  } catch {
    execFileSync("gh", [
      "release", "create", tag,
      "--repo", repo,
      "--title", "OPL Studio DSH Plugins (Public Feed)",
      "--notes", "Automated public distribution feed for OPL Studio DSH Host & Client plugins."
    ], { stdio: "inherit" });
  }
  const assets = [indexPath, ...packed.map(item => item.assetPath)];
  execFileSync("gh", ["release", "upload", tag, "--repo", repo, "--clobber", ...assets], { stdio: "inherit" });
  return { indexPath, assetCount: assets.length, plugins: packed.map(item => `${item.name}@${item.version}`) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const staging = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || "/tmp", "opl-dsh-feed-"));
  try {
    const result = publishPublicPluginFeed({
      sourceRoot: root,
      stagingDir: staging,
      repo: process.env.GITHUB_REPOSITORY || DEFAULT_REPO,
      tag: process.env.OPL_DSH_FEED_TAG || DEFAULT_TAG
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
