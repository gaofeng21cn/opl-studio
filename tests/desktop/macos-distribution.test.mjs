import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  prepareMacUpdateFeed,
  validateMacPublicUpdateFeed,
  validateMacUpdateFeed
} from "../../scripts/desktop/macos-distribution.mjs";
import { buildAppUpdateConfig, writeAppUpdateConfig } from "../../scripts/desktop/write-app-update-config.mjs";
import { nextPatchVersion } from "../../scripts/desktop/qualify-local-updater.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("local updater qualification derives exactly one patch-newer target", () => {
  assert.equal(nextPatchVersion("0.1.0"), "0.1.1");
  assert.throws(() => nextPatchVersion("0.1.0-preview.1"), /numeric semver/);
});

test("macOS builder declares hardened runtime, ULFO, and the dedicated Studio update feed", async () => {
  const builder = await readFile(path.join(root, "electron-builder.yml"), "utf8");
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.match(builder, /hardenedRuntime:\s*true/);
  assert.match(builder, /dmg:\s*\n\s+format:\s*ULFO/);
  assert.match(builder, /publish:\s*\n\s+provider:\s*github\s*\n\s+owner:\s*gaofeng21cn\s*\n\s+repo:\s*opl-studio/);
  assert.match(builder, /afterPack:\s*scripts\/desktop\/write-app-update-config\.mjs/);
  assert.match(pkg.scripts["dist:mac"], /qualify:desktop:mac/);
  assert.match(pkg.scripts["qualify:desktop:mac:release"], /--require-release-trust/);
  assert.match(pkg.scripts["qualify:desktop:mac:release"], /--require-public-feed/);
  assert.equal(pkg.scripts["test:desktop-distribution"], "node --test tests/desktop/*.test.mjs");
  assert.equal(pkg.scripts["qualify:desktop:updater:local"], "node scripts/desktop/qualify-local-updater.mjs");
});

test("Studio afterPack writes the dedicated GitHub updater identity", () => {
  assert.deepEqual(buildAppUpdateConfig({
    publish: { provider: "github", owner: "gaofeng21cn", repo: "opl-studio" }
  }), { provider: "github", owner: "gaofeng21cn", repo: "opl-studio" });
  assert.throws(
    () => buildAppUpdateConfig({ publish: { provider: "github", owner: "other", repo: "other" } }),
    /dedicated gaofeng21cn\/opl-studio GitHub feed/
  );
});

test("Studio afterPack writes app-update.yml inside the single packaged app", async () => {
  const appOutDir = await mkdtemp(path.join(os.tmpdir(), "opl-app-update-hook-test-"));
  const appDir = path.join(appOutDir, "One Person Lab Preview.app");
  await mkdir(path.join(appDir, "Contents"), { recursive: true });

  const outputPath = writeAppUpdateConfig({
    appOutDir,
    builderConfig: { publish: { provider: "github", owner: "gaofeng21cn", repo: "opl-studio" } }
  });

  assert.equal(outputPath, path.join(appDir, "Contents", "Resources", "app-update.yml"));
  assert.equal(existsSync(outputPath), true);
  assert.equal(await readFile(outputPath, "utf8"), "provider: github\nowner: gaofeng21cn\nrepo: opl-studio\n");
  assert.equal(existsSync(path.join(appOutDir, "Contents", "Resources", "app-update.yml")), false);
});

test("Studio afterPack rejects missing or ambiguous packaged apps", async () => {
  const emptyOutDir = await mkdtemp(path.join(os.tmpdir(), "opl-app-update-hook-empty-"));
  assert.throws(
    () => writeAppUpdateConfig({
      appOutDir: emptyOutDir,
      builderConfig: { publish: { provider: "github", owner: "gaofeng21cn", repo: "opl-studio" } }
    }),
    /exactly one top-level \.app/
  );

  const ambiguousOutDir = await mkdtemp(path.join(os.tmpdir(), "opl-app-update-hook-ambiguous-"));
  await mkdir(path.join(ambiguousOutDir, "First.app"));
  await mkdir(path.join(ambiguousOutDir, "Second.app"));
  assert.throws(
    () => writeAppUpdateConfig({
      appOutDir: ambiguousOutDir,
      builderConfig: { publish: { provider: "github", owner: "gaofeng21cn", repo: "opl-studio" } }
    }),
    /exactly one top-level \.app/
  );
});

test("macOS updater feed binds exact ZIP and DMG bytes and creates the compatibility metadata copy", async () => {
  const outRoot = await mkdtemp(path.join(os.tmpdir(), "opl-mac-feed-test-"));
  const zipName = "one-person-lab-preview-1.1.0-mac-arm64.zip";
  const dmgName = "one-person-lab-preview-1.1.0-mac-arm64.dmg";
  const zipBytes = Buffer.from("signed zip fixture");
  const dmgBytes = Buffer.from("signed dmg fixture");
  await mkdir(outRoot, { recursive: true });
  await writeFile(path.join(outRoot, zipName), zipBytes);
  await writeFile(path.join(outRoot, dmgName), dmgBytes);
  const sha512 = (value) => createHash("sha512").update(value).digest("base64");
  await writeFile(path.join(outRoot, "latest-mac.yml"), [
    "version: 1.1.0",
    "files:",
    `  - url: ${zipName}`,
    `    sha512: ${sha512(zipBytes)}`,
    `    size: ${zipBytes.length}`,
    `  - url: ${dmgName}`,
    `    sha512: ${sha512(dmgBytes)}`,
    `    size: ${dmgBytes.length}`,
    `path: ${zipName}`,
    `sha512: ${sha512(zipBytes)}`,
    "releaseDate: '2026-08-15T00:00:00.000Z'",
    ""
  ].join("\n"));

  const prepared = await prepareMacUpdateFeed({ outRoot });
  assert.equal(prepared.version, "1.1.0");
  assert.equal(prepared.compatibilityMetadataByteIdentical, true);
  const primary = await readFile(path.join(outRoot, "latest-mac.yml"));
  const compatibility = await readFile(path.join(outRoot, "latest-arm64-mac.yml"));
  assert.deepEqual(compatibility, primary);

  const validated = await validateMacUpdateFeed({ outRoot, expectedVersion: "1.1.0" });
  assert.deepEqual(validated.artifacts.map((entry) => entry.name), [zipName, dmgName]);
  assert.equal(parse(primary.toString()).version, validated.version);
});

test("macOS updater feed rejects metadata that does not match artifact bytes", async () => {
  const outRoot = await mkdtemp(path.join(os.tmpdir(), "opl-mac-feed-invalid-test-"));
  const artifact = "one-person-lab-preview-1.1.0-mac-arm64.zip";
  const dmg = "one-person-lab-preview-1.1.0-mac-arm64.dmg";
  const dmgBytes = Buffer.from("dmg bytes");
  await writeFile(path.join(outRoot, artifact), "changed bytes");
  await writeFile(path.join(outRoot, dmg), dmgBytes);
  const dmgSha512 = createHash("sha512").update(dmgBytes).digest("base64");
  await writeFile(path.join(outRoot, "latest-mac.yml"), [
    "version: 1.1.0",
    "files:",
    `  - url: ${artifact}`,
    "    sha512: invalid",
    "    size: 1",
    `  - url: ${dmg}`,
    `    sha512: ${dmgSha512}`,
    `    size: ${dmgBytes.length}`,
    `path: ${artifact}`,
    "sha512: invalid",
    ""
  ].join("\n"));
  await assert.rejects(
    validateMacUpdateFeed({ outRoot, expectedVersion: "1.1.0" }),
    /does not match update metadata/
  );
});

test("public macOS updater admission binds anonymous GitHub release bytes to the local feed", async () => {
  const outRoot = await mkdtemp(path.join(os.tmpdir(), "opl-public-mac-feed-test-"));
  const baseUrl = "https://github.com/gaofeng21cn/opl-studio/releases/download/v1.1.0/";
  const zipName = "one-person-lab-preview-1.1.0-mac-arm64.zip";
  const dmgName = "one-person-lab-preview-1.1.0-mac-arm64.dmg";
  const zipBytes = Buffer.from("public signed zip fixture");
  const dmgBytes = Buffer.from("public signed dmg fixture");
  const sha512 = (value) => createHash("sha512").update(value).digest("base64");
  const metadata = Buffer.from([
    "version: 1.1.0",
    "files:",
    `  - url: ${zipName}`,
    `    sha512: ${sha512(zipBytes)}`,
    `    size: ${zipBytes.length}`,
    `  - url: ${dmgName}`,
    `    sha512: ${sha512(dmgBytes)}`,
    `    size: ${dmgBytes.length}`,
    `path: ${zipName}`,
    `sha512: ${sha512(zipBytes)}`,
    ""
  ].join("\n"));
  const assets = new Map([
    [`${baseUrl}latest-mac.yml`, metadata],
    [`${baseUrl}latest-arm64-mac.yml`, metadata],
    [`${baseUrl}${zipName}`, zipBytes],
    [`${baseUrl}${dmgName}`, dmgBytes]
  ]);
  await writeFile(path.join(outRoot, "latest-mac.yml"), metadata);
  await writeFile(path.join(outRoot, "latest-arm64-mac.yml"), metadata);
  await writeFile(path.join(outRoot, zipName), zipBytes);
  await writeFile(path.join(outRoot, dmgName), dmgBytes);

  const fetchImpl = async (input) => {
    const bytes = assets.get(String(input));
    return bytes ? new Response(bytes) : new Response("not found", { status: 404 });
  };
  const result = await validateMacPublicUpdateFeed({
    outRoot,
    publicFeedUrl: baseUrl,
    expectedVersion: "1.1.0",
    fetchImpl
  });
  assert.equal(result.qualified, true);
  assert.equal(result.anonymousDownload, true);
  assert.deepEqual(result.artifacts.map((entry) => entry.name), [zipName, dmgName]);

  assets.set(`${baseUrl}${dmgName}`, Buffer.from("different public bytes"));
  await assert.rejects(
    validateMacPublicUpdateFeed({ outRoot, publicFeedUrl: baseUrl, expectedVersion: "1.1.0", fetchImpl }),
    /does not match the qualified local bytes/
  );
});

test("public macOS updater admission rejects non-canonical feed locations", async () => {
  await assert.rejects(
    validateMacPublicUpdateFeed({
      outRoot: "/tmp/unused",
      publicFeedUrl: "https://example.com/releases/v1/",
      fetchImpl: async () => new Response()
    }),
    /must use GitHub Releases/
  );
});

test("public feed qualification rejects credential-bearing URLs before fetching", async () => {
  const outRoot = await mkdtemp(path.join(os.tmpdir(), "opl-public-mac-feed-secret-test-"));
  let fetched = false;
  await assert.rejects(
    validateMacPublicUpdateFeed({
      outRoot,
      publicFeedUrl: "https://user:secret@github.com/gaofeng21cn/opl-studio/releases/download/v1/",
      fetchImpl: async () => {
        fetched = true;
        return new Response();
      }
    }),
    /must not contain credentials/
  );
  assert.equal(fetched, false);
});
