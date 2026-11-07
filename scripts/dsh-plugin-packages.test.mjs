import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { readPluginInventory } from "@deepseek-ai/dsh-host-plugin-inventory";
import { ThreadAdapterError } from "../src/host/thread-adapter.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("packed DSH packages boot outside the checkout and retain native inventory metadata", async () => {
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "opl-dsh-packages-"));
  let core;
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    await fs.writeFile(path.join(staging, "package.json"), JSON.stringify(manifest));
    const entrypoints = [];
    for (const [name, source] of Object.entries(manifest.dependencies)) {
      const destination = path.join(staging, "node_modules", name);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      if (!source.startsWith("file:plugins/")) {
        await fs.symlink(await fs.realpath(path.join(root, "node_modules", name)), destination, "dir");
        continue;
      }
      const packed = spawnSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", staging], {
        cwd: path.join(root, source.slice(5)), encoding: "utf8"
      });
      assert.equal(packed.status, 0, packed.stderr);
      const receipt = JSON.parse(packed.stdout)[0];
      assert.ok(receipt.files.some((file) => file.path === "LICENSE"), name);
      assert.ok(!receipt.files.some((file) => file.path.startsWith("src/")), name);
      await fs.mkdir(destination, { recursive: true });
      const unpack = spawnSync("tar", ["-xzf", path.join(staging, receipt.filename), "--strip-components=1", "-C", destination]);
      assert.equal(unpack.status, 0, String(unpack.stderr));
      entrypoints.push([name, pathToFileURL(path.join(destination, JSON.parse(await fs.readFile(path.join(destination, "package.json"), "utf8")).main))]);
    }
    for (const [name, entrypoint] of entrypoints) {
      assert.equal(typeof (await import(entrypoint)).apply, "function", name);
    }
    await fs.cp(path.join(root, "src/host/dsh"), path.join(staging, "src/host/dsh"), { recursive: true });
    const { bootOplStudioHost } = await import(pathToFileURL(path.join(staging, "src/host/dsh/host.mjs")));
    const transport = {
      initialized: false, on() {}, createChannelCallbackAdapter: () => null,
      async start() { this.initialized = true; }, async stop() { this.initialized = false; }
    };
    const host = await bootOplStudioHost({
      dshHome: path.join(staging, "profile"), workspaceRoot: staging,
      env: { ...process.env }, transport,
      opl: Object.fromEntries(["readState", "readInitialize", "readFullDrilldown", "readDomainDetailView", "readContribution", "executeAction"].map((name) => [name, async () => ({})])),
      webHost: "127.0.0.1", webPort: 0
    });
    core = host.core;
    const inventory = await readPluginInventory(host.context);
    const own = inventory.entries.filter((entry) => entry.moduleName.startsWith("@one-person-lab/"));
    assert.equal(own.length, 5);
    assert.equal(core.mcpApps, host.context.oplMcpApps);
    for (const entry of own) {
      assert.equal(entry.fiberPhase, "active", entry.moduleName);
      assert.ok(entry.meta?.description, entry.moduleName);
    }
    assert.equal(transport.initialized, true);
    await core.close();
    assert.equal(transport.initialized, false);
  } finally {
    await core?.close();
    await fs.rm(staging, { recursive: true, force: true });
  }
});

test("typed HTTP errors preserve the shared ABI across isolated plugin bundles", async () => {
  const source = await fs.readFile(path.join(root, "src/host/thread-adapter.mjs"), "utf8");
  const copy = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  const error = new copy.ThreadAdapterError("invalid_workspace_path", "denied", {}, 400);
  assert.ok(error instanceof ThreadAdapterError);
  assert.equal(error.httpStatus, 400);
  assert.equal(Object.assign(new Error("untyped"), { name: "ThreadAdapterError", httpStatus: 400 }) instanceof ThreadAdapterError, false);
});
