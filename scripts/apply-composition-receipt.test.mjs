import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { verifyCompositionInstallation } from "./verify-composition-installation.mjs";

const execute = promisify(execFile);
const script = new URL("./apply-composition-receipt.mjs", import.meta.url);
const pluginName = "@fixture/opl-plugin";
const pluginSource = "plugins/extensions/opl-plugin";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opl-composition-install-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "scripts"));
  await fs.copyFile(script, path.join(root, "scripts/apply-composition-receipt.mjs"));
  const helper = "packages/host-kit/src/dsh-source-packages.mjs";
  await fs.mkdir(path.join(root, path.dirname(helper)), { recursive: true });
  await fs.copyFile(new URL(`../${helper}`, import.meta.url), path.join(root, helper));
  await fs.mkdir(path.join(root, pluginSource), { recursive: true });
  const manifest = {
    name: "composition-fixture", version: "1.0.0", private: true,
    dependencies: { "@deepseek-ai/dsh-app-boot": "1.0.0", [pluginName]: `file:${pluginSource}` }
  };
  const receipt = {
    schema: "opl_dsh_plugin_composition_receipt.v1", dsh_cohort: "1.0.0",
    registry: "https://npm.pkg.github.com", plugins: { [pluginName]: "1.0.0" }
  };
  const local = { name: pluginName, version: "1.0.0", publishConfig: { registry: receipt.registry } };
  const write = (relative, object) => fs.writeFile(path.join(root, relative), JSON.stringify(object, null, 2) + "\n");
  await write("package.json", manifest);
  await write(`${pluginSource}/package.json`, local);
  await write("receipt.json", receipt);
  return { root, manifest, receipt, local, write };
}

async function apply(root, args = []) {
  return execute(process.execPath, ["scripts/apply-composition-receipt.mjs", "--receipt", "receipt.json", ...args], { cwd: root });
}

test("receipt invalidates only selected plugin resolutions and safely unlinks local sources", async t => {
  const { root, manifest, write } = await fixture(t);
  const unrelated = { version: "4.2.1", resolved: "https://registry.npmjs.org/untouched/-/untouched-4.2.1.tgz", integrity: "sha512-untouched" };
  await write("package-lock.json", {
    name: manifest.name, lockfileVersion: 3,
    packages: {
      "": { dependencies: manifest.dependencies },
      [`node_modules/${pluginName}`]: { link: true, resolved: pluginSource },
      [pluginSource]: { version: "1.0.0" },
      [`${pluginSource}/node_modules/old-private-dep`]: { version: "1.0.0" },
      "node_modules/untouched": unrelated
    }
  });
  await fs.mkdir(path.join(root, "node_modules/@fixture"), { recursive: true });
  await fs.symlink(path.join(root, pluginSource), path.join(root, "node_modules", pluginName), "dir");
  await apply(root);
  const lock = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(lock.packages[""].dependencies[pluginName], "1.0.0");
  assert.equal(lock.packages[`node_modules/${pluginName}`], undefined);
  assert.equal(lock.packages[pluginSource], undefined);
  assert.equal(lock.packages[`${pluginSource}/node_modules/old-private-dep`], undefined);
  assert.deepEqual(lock.packages["node_modules/untouched"], unrelated);
  assert.equal((await fs.stat(path.join(root, pluginSource, "package.json"))).isFile(), true);
  await assert.rejects(fs.lstat(path.join(root, "node_modules", pluginName)), { code: "ENOENT" });
});

test("dry-run preserves package, lock and installed plugin bytes", async t => {
  const { root, manifest, write } = await fixture(t);
  await write("package-lock.json", { lockfileVersion: 3, packages: { "": { dependencies: manifest.dependencies } } });
  await fs.mkdir(path.join(root, "node_modules", pluginName), { recursive: true });
  await fs.writeFile(path.join(root, "node_modules", pluginName, "marker"), "keep");
  const before = await Promise.all(["package.json", "package-lock.json"].map(file => fs.readFile(path.join(root, file), "utf8")));
  await apply(root, ["--dry-run"]);
  assert.deepEqual(await Promise.all(["package.json", "package-lock.json"].map(file => fs.readFile(path.join(root, file), "utf8"))), before);
  assert.equal(await fs.readFile(path.join(root, "node_modules", pluginName, "marker"), "utf8"), "keep");
});

test("real npm same-version file link becomes a registry tarball after applying the receipt", { timeout: 60000 }, async t => {
  const { root, receipt, local, write } = await fixture(t);
  // Keep this test offline: the fake registry serves both the selected plugin
  // and the otherwise unchanged pinned cohort dependency.
  const published = path.join(root, "published");
  await fs.mkdir(path.join(published, "lib"), { recursive: true });
  await fs.writeFile(path.join(published, "lib/client.js"), "registry-client-bytes\n");
  await fs.writeFile(path.join(published, "package.json"), JSON.stringify({ name: pluginName, version: "1.0.0", main: "lib/client.js" }));
  const packResult = JSON.parse((await execute("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", root], { cwd: published })).stdout);
  const packed = Array.isArray(packResult) ? packResult[0] : Object.values(packResult)[0];
  const tarball = await fs.readFile(path.join(root, packed.filename));
  const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/fixture.tgz") {
      response.setHeader("content-type", "application/octet-stream");
      response.end(tarball);
      return;
    }
    const name = decodeURIComponent(request.url.slice(1));
    response.end(JSON.stringify({ name, "dist-tags": { latest: "1.0.0" }, versions: { "1.0.0": { name, version: "1.0.0", dist: { tarball: `${registry}/fixture.tgz`, integrity } } } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const registry = `http://127.0.0.1:${server.address().port}`;
  receipt.registry = registry;
  local.publishConfig.registry = registry;
  await write("receipt.json", receipt);
  await write(`${pluginSource}/package.json`, local);
  const npm = async args => execute("npm", [...args, "--ignore-scripts", "--no-audit", "--no-fund", `--registry=${registry}`, `--cache=${path.join(root, "npm-cache")}`], { cwd: root, timeout: 20000 });
  await npm(["install"]);
  const initial = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));
  const cohort = initial.packages["node_modules/@deepseek-ai/dsh-app-boot"];
  assert.equal(initial.packages[`node_modules/${pluginName}`].link, true);
  await apply(root);
  await npm(["install", "--package-lock-only"]);
  await npm(["ci"]);
  const installed = path.join(root, "node_modules", pluginName);
  assert.equal((await fs.lstat(installed)).isSymbolicLink(), false);
  assert.equal(await fs.readFile(path.join(installed, "lib/client.js"), "utf8"), "registry-client-bytes\n");
  const lock = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(lock.packages[`node_modules/${pluginName}`].resolved, `${registry}/fixture.tgz`);
  assert.equal(lock.packages[`node_modules/${pluginName}`].integrity, integrity);
  assert.deepEqual(lock.packages["node_modules/@deepseek-ai/dsh-app-boot"], cohort);
  assert.equal((await fs.stat(path.join(root, pluginSource, "package.json"))).isFile(), true);
  assert.deepEqual(verifyCompositionInstallation({ root, receipt }), { verified_plugins: receipt.plugins });
});
