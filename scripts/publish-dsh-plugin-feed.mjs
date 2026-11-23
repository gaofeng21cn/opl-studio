#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO = "gaofeng21cn/opl-studio";
const DEFAULT_TAG = "dsh-plugins-latest";
const REGISTRY_URL = "https://npm.pkg.github.com";
const INDEX_ASSET = "dsh-plugin-index.json";
const PREVIOUS_INDEX_ASSET = "dsh-plugin-index.previous.json";

export function publicFeedDownloadUrl(repo, tag, assetName) {
  return `https://github.com/${repo}/releases/download/${tag}/${assetName}`;
}

function downloadRegistryPlugins(sourceRoot, destinationDir, selectedPlugins, run) {
  const pluginRoot = path.join(sourceRoot, "plugins");
  const selected = selectedPlugins && new Set(selectedPlugins);
  const packed = [];
  for (const entry of fs.readdirSync(pluginRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || (selected && !selected.has(entry.name))) continue;
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, entry.name, "package.json"), "utf8"));
    if (!manifest?.name?.startsWith("@gaofeng21cn/") || manifest.private === true || manifest.publishConfig?.registry !== REGISTRY_URL) {
      continue;
    }
    const spec = `${manifest.name}@${manifest.version}`;
    const packResult = JSON.parse(run("npm", [
      "pack", spec, "--registry", REGISTRY_URL, "--ignore-scripts", "--json", "--pack-destination", destinationDir
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    const [archive] = Array.isArray(packResult) ? packResult : Object.values(packResult);
    if (archive?.name !== manifest.name || archive.version !== manifest.version) {
      throw new Error(`Registry returned a different package for ${spec}`);
    }
    const assetName = `${entry.name}-${manifest.version}.tgz`;
    const archivePath = path.join(destinationDir, path.basename(archive.filename));
    const assetPath = path.join(destinationDir, assetName);
    if (archivePath !== assetPath) fs.renameSync(archivePath, assetPath);
    const bytes = fs.readFileSync(assetPath);
    const integrity = "sha512-" + createHash("sha512").update(bytes).digest("base64");
    if (integrity !== archive.integrity) throw new Error(`Registry package integrity mismatch for ${spec}`);
    const registryManifest = JSON.parse(run("tar", ["-xOf", assetPath, "package/package.json"], { encoding: "utf8" }));
    if (registryManifest.name !== manifest.name || registryManifest.version !== manifest.version) {
      throw new Error(`Registry archive manifest does not match ${spec}`);
    }
    packed.push({
      name: manifest.name,
      version: manifest.version,
      engines: registryManifest.engines ?? {},
      peerDependencies: registryManifest.peerDependencies ?? {},
      assetName,
      assetPath,
      integrity,
      digest: "sha256:" + createHash("sha256").update(bytes).digest("hex")
    });
    selected?.delete(entry.name);
  }
  if (selected?.size) throw new Error(`Not publishable source packages: ${[...selected].join(", ")}`);
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
    const existing = current.find(entry => entry.version === item.version);
    if (existing) {
      if (existing.integrity !== nextEntry.integrity || existing.tarballUrl !== nextEntry.tarballUrl) {
        throw new Error(`Public feed already contains different bytes or URL for ${item.name}@${item.version}`);
      }
      continue;
    }
    plugins[item.name] = [nextEntry, ...current];
  }
  return {
    schema: "opl_dsh_plugin_public_feed.v1",
    generatedAt,
    repository: repo,
    tag,
    plugins
  };
}

function readExistingRelease(repo, tag, run) {
  let release;
  try {
    release = JSON.parse(run("gh", ["api", `repos/${repo}/releases/tags/${encodeURIComponent(tag)}`], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
    }));
  } catch (error) {
    if (/HTTP 404\b/.test(String(error.stderr ?? ""))) return { exists: false, assets: new Map(), index: null };
    throw error;
  }
  const pages = JSON.parse(run("gh", [
    "api", "--paginate", "--slurp", `repos/${repo}/releases/${release.id}/assets?per_page=100`
  ], { encoding: "utf8" }));
  const assets = new Map(pages.flat().map(asset => [asset.name, asset]));
  const hasCurrentIndex = assets.get(INDEX_ASSET)?.state === "uploaded";
  const indexAsset = hasCurrentIndex ? INDEX_ASSET : PREVIOUS_INDEX_ASSET;
  if (assets.get(indexAsset)?.state !== "uploaded") {
    const emptyBootstrap = assets.size === 1 && assets.get(PREVIOUS_INDEX_ASSET)?.state === "starter";
    if (assets.size && !emptyBootstrap) throw new Error("Existing public plugin release has no recoverable index");
    return { exists: true, assets, index: null };
  }
  const indexBytes = run("gh", [
    "release", "download", tag, "--repo", repo, "--pattern", indexAsset, "--output", "-"
  ], { encoding: "utf8" });
  const index = JSON.parse(indexBytes);
  if (index?.schema !== "opl_dsh_plugin_public_feed.v1" || index.repository !== repo || index.tag !== tag ||
    !index.plugins || typeof index.plugins !== "object" || Array.isArray(index.plugins)) {
    throw new Error("Existing public plugin index has an unexpected identity or format");
  }
  return { exists: true, assets, index, indexBytes, hasCurrentIndex };
}

export function publishPublicPluginFeed({
  sourceRoot,
  stagingDir,
  selectedPlugins,
  repo = DEFAULT_REPO,
  tag = DEFAULT_TAG,
  run = execFileSync
}) {
  fs.mkdirSync(stagingDir, { recursive: true });
  const packed = downloadRegistryPlugins(sourceRoot, stagingDir, selectedPlugins, run);
  if (!packed.length) return { assetCount: 0, plugins: [] };

  const release = readExistingRelease(repo, tag, run);
  const index = mergePublicFeedIndex(release.index, packed, { repo, tag });
  const missing = packed.filter(item => {
    const asset = release.assets.get(item.assetName);
    if (!asset) return true;
    if (asset.state !== "uploaded" || asset.digest !== item.digest) {
      throw new Error(`Public asset ${item.assetName} does not match the registry archive`);
    }
    return false;
  });

  if (!release.exists) {
    run("gh", [
      "release", "create", tag, "--repo", repo,
      "--title", "OPL Studio DSH Plugins (Public Feed)",
      "--notes", "Automated public distribution feed for OPL Studio DSH Host & Client plugins."
    ], { stdio: "inherit" });
  }
  const updateIndex = !release.hasCurrentIndex ||
    JSON.stringify(index.plugins) !== JSON.stringify(release.index.plugins);
  let assetCount = 0;
  // GitHub replaces the public index by deleting its old asset before uploading
  // the new one. Persist the previous index so retry can reconstruct history.
  if (updateIndex && (release.hasCurrentIndex || !release.index)) {
    const backupPath = path.join(stagingDir, PREVIOUS_INDEX_ASSET);
    const backup = release.indexBytes ?? JSON.stringify(mergePublicFeedIndex(null, [], { repo, tag })) + "\n";
    fs.writeFileSync(backupPath, backup);
    run("gh", ["release", "upload", tag, "--repo", repo, "--clobber", backupPath], { stdio: "inherit" });
    assetCount++;
  }
  if (missing.length) {
    run("gh", ["release", "upload", tag, "--repo", repo, ...missing.map(item => item.assetPath)], { stdio: "inherit" });
    assetCount += missing.length;
  }
  const plugins = packed.map(item => `${item.name}@${item.version}`);
  if (!updateIndex) return { assetCount, plugins };
  const indexPath = path.join(stagingDir, INDEX_ASSET);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
  run("gh", ["release", "upload", tag, "--repo", repo, "--clobber", indexPath], { stdio: "inherit" });
  return { indexPath, assetCount: assetCount + 1, plugins };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const staging = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || "/tmp", "opl-dsh-feed-"));
  try {
    const selectedPlugins = process.env.SELECTED_PLUGINS && JSON.parse(process.env.SELECTED_PLUGINS);
    if (selectedPlugins && (!Array.isArray(selectedPlugins) || selectedPlugins.some(id => typeof id !== "string"))) {
      throw new Error("SELECTED_PLUGINS must be a JSON array of plugin directory names");
    }
    const result = publishPublicPluginFeed({
      sourceRoot: root,
      stagingDir: staging,
      selectedPlugins,
      repo: process.env.GITHUB_REPOSITORY || DEFAULT_REPO,
      tag: process.env.OPL_DSH_FEED_TAG || DEFAULT_TAG
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
