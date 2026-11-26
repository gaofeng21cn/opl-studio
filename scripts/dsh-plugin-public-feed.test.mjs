import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mergePublicFeedIndex, publishPublicPluginFeed } from "./publish-dsh-plugin-feed.mjs";

const registry = "https://npm.pkg.github.com";
const name = "@gaofeng21cn/opl-example";
const version = "0.1.0";
const coordinate = `${name}@${version}`;
const assetName = `opl-example-${version}.tgz`;
const bytes = Buffer.from("registry package bytes");
const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
const integrity = "sha512-" + createHash("sha512").update(bytes).digest("base64");

function fixture(context, { assets = [], index, previousIndex, registryMissing = false, releaseLookupStatus, namedPack = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "opl-plugin-public-feed-test-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const stagingDir = path.join(root, "staging");
  const writes = [];
  for (const id of ["opl-example", "opl-unselected"]) {
    const directory = path.join(root, "plugins", "extensions", id);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "package.json"), JSON.stringify({
      name: `@gaofeng21cn/${id}`, version, engines: { dsh: "source" }, publishConfig: { registry }
    }));
  }
  const existingAssets = [...assets];
  if (index) existingAssets.push({ name: "dsh-plugin-index.json", state: "uploaded" });
  if (previousIndex) existingAssets.push({ name: "dsh-plugin-index.previous.json", state: "uploaded" });
  const run = (command, args) => {
    if (command === "npm") {
      assert.deepEqual(args, [
        "pack", coordinate, "--registry", registry, "--ignore-scripts", "--json", "--pack-destination", stagingDir
      ]);
      if (registryMissing) throw new Error("exact registry version is missing");
      const filename = "registry.tgz";
      writeFileSync(path.join(stagingDir, filename), bytes);
      const archive = { name, version, filename, integrity };
      return JSON.stringify(namedPack ? { [coordinate]: archive } : [archive]);
    }
    if (command === "tar") {
      assert.equal(args[2], "package/package.json");
      return JSON.stringify({ name, version, engines: { dsh: "registry" } });
    }
    assert.equal(command, "gh");
    if (args[0] === "api" && args[1].includes("/releases/tags/")) {
      if (releaseLookupStatus) throw Object.assign(new Error("release lookup failed"), { stderr: `HTTP ${releaseLookupStatus}` });
      return JSON.stringify({ id: 42 });
    }
    if (args[0] === "api" && args[1] === "--paginate") return JSON.stringify([existingAssets]);
    if (args[1] === "download") {
      return JSON.stringify(args[args.indexOf("--pattern") + 1] === "dsh-plugin-index.json" ? index : previousIndex);
    }
    writes.push(args);
  };
  return {
    writes,
    publish: () => publishPublicPluginFeed({ sourceRoot: root, stagingDir, selectedPlugins: ["opl-example"], run })
  };
}

const publishedArchive = { name: assetName, state: "uploaded", digest };
const validIndex = mergePublicFeedIndex(null, [{ name, version, assetName, integrity, engines: { dsh: "registry" } }]);

test("public feed mirrors only the selected registry archive and updates its index last", context => {
  const { writes, publish } = fixture(context, { releaseLookupStatus: 404, namedPack: true });
  const result = publish();
  assert.equal(result.assetCount, 3);
  assert.deepEqual(result.plugins, [coordinate]);
  assert.deepEqual(writes.map(args => args.slice(0, 2)), [
    ["release", "create"], ["release", "upload"], ["release", "upload"], ["release", "upload"]
  ]);
  assert.equal(path.basename(writes[1].at(-1)), "dsh-plugin-index.previous.json");
  assert.equal(writes[2].includes("--clobber"), false);
  assert.deepEqual(readFileSync(writes[2].at(-1)), bytes);
  assert.equal(writes[3].at(-2), "--clobber");
  assert.equal(JSON.parse(readFileSync(result.indexPath, "utf8")).plugins[name][0].engines.dsh, "registry");
});

test("public feed retries index upload without replacing a verified existing archive", context => {
  const prior = mergePublicFeedIndex(null, [{
    name: "@gaofeng21cn/opl-other", version, assetName: "other.tgz", integrity, engines: {}, peerDependencies: {}
  }]);
  const { writes, publish } = fixture(context, { assets: [publishedArchive], previousIndex: prior });
  const result = publish();
  assert.equal(result.assetCount, 1);
  assert.equal(writes.length, 1);
  assert.equal(path.basename(writes[0].at(-1)), "dsh-plugin-index.json");
  const { plugins } = JSON.parse(readFileSync(result.indexPath, "utf8"));
  assert.deepEqual(plugins["@gaofeng21cn/opl-other"], prior.plugins["@gaofeng21cn/opl-other"]);
});

test("public feed replay leaves identical archives and index in place", context => {
  const { writes, publish } = fixture(context, { assets: [publishedArchive], index: validIndex });
  assert.equal(publish().assetCount, 0);
  assert.deepEqual(writes, []);
});

test("public feed refuses to overwrite an existing coordinate or asset with other bytes", context => {
  const otherIndex = structuredClone(validIndex);
  otherIndex.plugins[name][0].integrity = "sha512-other";
  const staleIndex = fixture(context, { assets: [publishedArchive], index: otherIndex });
  assert.throws(staleIndex.publish, /different bytes or URL/);
  assert.deepEqual(staleIndex.writes, []);
  const staleAsset = fixture(context, { assets: [{ ...publishedArchive, digest: "sha256:other" }], index: validIndex });
  assert.throws(staleAsset.publish, /does not match the registry archive/);
  assert.deepEqual(staleAsset.writes, []);
});

test("public feed stops before mutation when authoritative reads fail", context => {
  const noIndex = fixture(context, { assets: [publishedArchive] });
  assert.throws(noIndex.publish, /no recoverable index/);
  assert.deepEqual(noIndex.writes, []);
  const noNpmPackage = fixture(context, { registryMissing: true });
  assert.throws(noNpmPackage.publish, /exact registry version is missing/);
  assert.deepEqual(noNpmPackage.writes, []);
  const unavailableRelease = fixture(context, { releaseLookupStatus: 503 });
  assert.throws(unavailableRelease.publish, /release lookup failed/);
  assert.deepEqual(unavailableRelease.writes, []);
});
