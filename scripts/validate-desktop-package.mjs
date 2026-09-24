import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(modulePath), "..");

function normalizedEntries(directory) {
  return fs.readdirSync(directory, { recursive: true }).map(String).map((entry) => entry.split(path.sep).join("/"));
}

function executablePattern(platform, stable = false) {
  if (stable && platform === "darwin") return /One Person Lab\.app\/Contents\/MacOS\/One Person Lab$/;
  if (stable && platform === "win32") return /win(?:-[^/]+)?-unpacked\/One Person Lab\.exe$/;
  if (stable && platform === "linux") return /linux(?:-[^/]+)?-unpacked\/one-person-lab$/i;
  if (platform === "darwin") return /One Person Lab Preview\.app\/Contents\/MacOS\/One Person Lab Preview$/;
  if (platform === "win32") return /win-unpacked\/One Person Lab Preview\.exe$/;
  if (platform === "linux") return /linux(?:-[^/]+)?-unpacked\/one-person-lab-preview$/i;
  throw new Error(`Unsupported desktop package platform: ${platform}`);
}

function requiredDistributionArtifacts({ platform, version, arch, stable = false }) {
  const platformName = platform === "win32" ? "win" : platform === "darwin" ? "mac" : "linux";
  const base = `${stable ? "One-Person-Lab" : "one-person-lab-preview"}-${version}-${platformName}-${arch}`;
  if (platform === "win32") return [`${base}.exe`, `${base}.zip`];
  if (platform === "linux") {
    if (stable) return [`${base}.deb`];
    const debArch = arch === "x64" ? "amd64" : arch;
    return [`one-person-lab-preview-${version}-${platformName}-${debArch}.deb`];
  }
  if (platform === "darwin") return [`${base}.dmg`, `${base}.zip`];
  throw new Error(`Unsupported desktop distribution platform: ${platform}`);
}

export function validateDesktopPackage({
  repositoryRoot = defaultRoot,
  outRoot = path.join(repositoryRoot, "out"),
  platform = process.platform,
  arch = process.arch,
  version,
  identity = "preview",
  requireDistribution = false
} = {}) {
  assert.ok(["preview", "stable"].includes(identity), "unsupported desktop package identity");
  const stable = identity === "stable";
  assert.ok(fs.existsSync(outRoot), "desktop package output is missing");
  const files = normalizedEntries(outRoot);
  const asar = files.find((entry) => entry.toLowerCase().endsWith("/resources/app.asar"));
  assert.ok(asar, "desktop package must contain app.asar");
  assert.ok(files.some((entry) => executablePattern(platform, stable).test(entry)), `desktop package must contain the ${platform} executable`);

  const builderConfig = fs.readFileSync(path.join(repositoryRoot, stable ? "electron-builder.stable.yml" : "electron-builder.yml"), "utf8");
  for (const marker of ["mac:", "win:", "linux:", "desktop/**/*", "dist/desktop/**/*", "scripts/webui-host/**/*"]) {
    assert.match(builderConfig, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing builder marker ${marker}`);
  }
  for (const forbidden of ["Package.swift", "WKWebView", "AppKit", "AionCore"]) {
    assert.doesNotMatch(builderConfig, new RegExp(forbidden), `desktop package config must not use ${forbidden}`);
  }

  const distributionArtifacts = [];
  if (requireDistribution) {
    const expectedVersion = version
      ?? JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8")).version;
    const topLevel = new Set(fs.readdirSync(outRoot));
    for (const name of requiredDistributionArtifacts({ platform, version: expectedVersion, arch, stable })) {
      assert.ok(topLevel.has(name), `desktop distribution artifact is missing: ${name}`);
      const artifactPath = path.join(outRoot, name);
      const artifact = fs.statSync(artifactPath);
      assert.ok(artifact.isFile() && artifact.size > 1024, `desktop distribution artifact is empty: ${name}`);
      distributionArtifacts.push({ name, size: artifact.size });
    }
  }

  return {
    schema: "opl_desktop_package_qualification.v1",
    status: "desktop_package_validated",
    platform,
    arch,
    identity,
    appAsar: asar,
    sharedHostCore: true,
    desktopCarriers: ["macos", "windows", "linux"],
    distributionRequired: requireDistribution,
    distributionArtifacts
  };
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  assert.ok(value && !value.startsWith("--"), `${name} requires a value`);
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const outRoot = optionValue("--out-root");
  console.log(JSON.stringify(validateDesktopPackage({
    ...(outRoot ? { outRoot: path.resolve(outRoot) } : {}),
    version: optionValue("--version") || (process.env.OPL_DESKTOP_RELEASE_IDENTITY === "stable" ? process.env.OPL_RELEASE_VERSION : undefined),
    identity: optionValue("--identity") || process.env.OPL_DESKTOP_RELEASE_IDENTITY || "preview",
    requireDistribution: process.argv.includes("--distribution")
  }), null, 2));
}
