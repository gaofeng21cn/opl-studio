import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyCompositionInstallation } from "./verify-composition-installation.mjs";

const name = "@gaofeng21cn/opl-studio-client";

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "opl-installed-composition-")));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const packageRoot = path.join(root, "node_modules", name);
  await fs.mkdir(path.join(packageRoot, "lib"), { recursive: true });
  const manifest = {
    name, version: "0.1.2", main: "./lib/index.mjs",
    exports: { ".": "./lib/index.mjs", "./client": "./lib/client.js" },
    dsh: { manifestVersion: 1, client: { platform: "web", immediately: true } }
  };
  const receipt = {
    schema: "opl_dsh_plugin_composition_receipt.v1",
    registry: "https://npm.pkg.github.com", plugins: { [name]: "0.1.2" }
  };
  const entry = {
    version: "0.1.2", resolved: "https://npm.pkg.github.com/download/@gaofeng21cn/opl-studio-client/0.1.2/fixture",
    integrity: `sha512-${Buffer.alloc(64, 7).toString("base64")}`
  };
  const lock = { lockfileVersion: 3, packages: {
    "": { dependencies: { [name]: "0.1.2" } }, [`node_modules/${name}`]: entry
  } };
  const writeManifest = () => fs.writeFile(path.join(packageRoot, "package.json"), JSON.stringify(manifest));
  const writeLock = () => fs.writeFile(path.join(root, "package-lock.json"), JSON.stringify(lock));
  await Promise.all([
    writeManifest(), writeLock(),
    fs.writeFile(path.join(packageRoot, "lib/index.mjs"), "export const name = 'client';\n"),
    fs.writeFile(path.join(packageRoot, "lib/client.js"), "globalThis.shippedClient = true;\n")
  ]);
  return { root, packageRoot, receipt, manifest, lock, entry, writeManifest, writeLock,
    verify: () => verifyCompositionInstallation({ root, receipt }) };
}

test("verifies installed registry bytes and supports the official client default export", async t => {
  const f = await fixture(t);
  assert.deepEqual(f.verify(), { verified_plugins: f.receipt.plugins });
  f.manifest.exports["./client"] = { default: "./lib/client.js" };
  await f.writeManifest();
  assert.deepEqual(f.verify(), { verified_plugins: f.receipt.plugins });
});

test("rejects a same-version source link and a linked scoped parent", async t => {
  await t.test("package link", async t => {
    const f = await fixture(t);
    const source = path.join(f.root, "local-plugin");
    await fs.rename(f.packageRoot, source);
    await fs.symlink(source, f.packageRoot, "dir");
    assert.throws(f.verify, /not a local link/);
  });
  await t.test("scope link", async t => {
    const f = await fixture(t);
    const scope = path.dirname(f.packageRoot);
    const source = path.join(f.root, "local-scope");
    await fs.rename(scope, source);
    await fs.symlink(source, scope, "dir");
    assert.throws(f.verify, /not a local link/);
  });
});

test("rejects lock version drift, local resolution, foreign origin and invalid integrity", async t => {
  const mutations = [
    ["root version", f => { f.lock.packages[""].dependencies[name] = "^0.1.2"; }, /root lock dependency/],
    ["installed version", f => { f.entry.version = "0.1.1"; }, /installed lock entry/],
    ["linked lock", f => { f.entry.link = true; }, /installed lock entry/],
    ["local path", f => { f.entry.resolved = "file:plugins/core/opl-studio-client"; }, /receipt registry/],
    ["foreign origin", f => { f.entry.resolved = "https://registry.npmjs.org/client.tgz"; }, /receipt registry/],
    ["missing integrity", f => { delete f.entry.integrity; }, /integrity/],
    ["truncated integrity", f => { f.entry.integrity = "sha512-YWJj"; }, /integrity/]
  ];
  for (const [label, mutate, expected] of mutations) {
    await t.test(label, async t => {
      const f = await fixture(t);
      mutate(f);
      await f.writeLock();
      assert.throws(f.verify, expected);
    });
  }
});

test("requires the receipt package identity and its shipped Host/client entrypoints", async t => {
  await t.test("manifest version", async t => {
    const f = await fixture(t);
    f.manifest.version = "0.1.1";
    await f.writeManifest();
    assert.throws(f.verify, /installed package name\/version/);
  });
  for (const [file, expected] of [["index.mjs", /main shipped file is missing/], ["client.js", /exports\[.\/client\] shipped file is missing/]]) {
    await t.test(`missing ${file}`, async t => {
      const f = await fixture(t);
      await fs.unlink(path.join(f.packageRoot, "lib", file));
      assert.throws(f.verify, expected);
    });
  }
  await t.test("missing client export", async t => {
    const f = await fixture(t);
    delete f.manifest.exports["./client"];
    await f.writeManifest();
    assert.throws(f.verify, /exports\[.\/client\] must name/);
  });
});
