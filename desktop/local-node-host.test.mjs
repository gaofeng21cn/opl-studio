import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalNodeHost } from "./local-node-host.mjs";
import { assertPatchedHostNode, resolveHostNode } from "./node-host-runtime.mjs";

test("Node Host admission rejects the compromised TLS cohorts and prereleases", () => {
  for (const version of ["22.23.4", "22.24.0", "24.22.1", "26.12.1", "28.0.0"]) assert.doesNotThrow(() => assertPatchedHostNode(version));
  for (const version of ["20.20.0", "22.23.3", "23.0.0", "24.22.0", "25.0.0", "26.12.0", "26.12.1-rc.1"]) {
    assert.throws(() => assertPatchedHostNode(version), { code: "node_host_security_update_required" });
  }
});

test("Node Host refuses Electron and unsafe selected Node before starting a Host", context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-node-admission-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const command = path.join(root, "node");
  fs.writeFileSync(command, "fixture", { mode: 0o755 });
  const probe = value => () => ({ status: 0, stdout: JSON.stringify(value) });
  assert.throws(() => resolveHostNode({ nodeExecutable: command, probe: probe({ node: "26.12.1", electron: "44.9.1" }) }), { code: "node_host_runtime_unavailable" });
  assert.throws(() => resolveHostNode({ nodeExecutable: command, probe: probe({ node: "26.10.0", electron: null }) }), { code: "node_host_security_update_required" });
});

test("real standalone Node Host preserves profile loading, callbacks, buffers, update lease and close", async context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-node-host-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const native = [];
  const core = await createLocalNodeHost({ nodeExecutable: process.execPath,
    dshHome: path.join(root, "dsh"), workspaceRoot: root,
    env: { ...process.env, OPL_CODEX_BIN: path.join(root, "missing-codex"), OPL_APP_OPL_BIN: path.join(root, "missing-framework"),
      OPL_PROFILE_WORKSPACE: root, OPL_STATE_DIR: path.join(root, "state"), OPL_DATA_DIR: root, OPL_STUDIO_READ_ONLY: "1" },
    platform: { pickFiles: async () => [{ path: path.join(root, "input.txt"), bytes: Buffer.from([0, 1, 255]) }],
      notifyCompletion: async value => { native.push(value); return { accepted: true }; } },
    nativeUpdater: { perform: async operation => ({ operation }) },
    carrierDiagnostics: { read: async () => ({ platform: process.platform }) }
  });
  context.after(() => core.close());
  assert.equal(core.nodeHostIdentity.version, process.versions.node);
  assert.match(core.nodeHostIdentity.sha256, /^[0-9a-f]{64}$/);
  assert.equal(core.capabilities().appServerAvailable, false);
  assert.deepEqual(await core.invoke("pickFiles"), [{ path: path.join(root, "input.txt"), bytes: Buffer.from([0, 1, 255]) }]);
  await core.invoke("notifyCompletion", { title: "fixture" });
  assert.deepEqual(native, [{ title: "fixture" }]);
  assert.deepEqual(await core.invoke("readNativeAppUpdateStatus"), { operation: "status" });
  const inventory = await core.invoke("readHostPluginInventory");
  assert.ok(inventory, "actual shared profile must load before replying");
  let entered, release;
  const inside = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const operation = core.transport.runWhenIdle(async () => { entered(); await held; return "done"; });
  await inside;
  assert.deepEqual(await core.transport.runWhenIdle(async () => "must-not-run"), { status: "deferred", reasonCode: "app_server_busy" });
  release();
  assert.deepEqual(await operation, { status: "completed", result: "done" });
  assert.deepEqual(await core.transport.runWhenIdle(() => core.close()), { status: "completed", result: undefined });
  assert.equal(core.transport.initialized, false);
});

test("Node Host startup failure closes its private pipe without waiting for an RPC timeout", async context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-node-missing-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await assert.rejects(createLocalNodeHost({ nodeExecutable: process.execPath, hostRoot: root }), { code: "guest_host_closed" });
});
