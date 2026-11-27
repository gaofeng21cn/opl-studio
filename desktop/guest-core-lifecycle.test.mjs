import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createGuestRpc } from "./windows-guest-rpc.mjs";
import { nativeHostOptions, startGuestHostCore } from "./guest-host-core.mjs";
import { createGuestCoreProxy } from "./guest-core-proxy.mjs";
import { OplHostCore } from "../plugins/core/opl-host-core/src/service.mjs";

function fixture(managedUpdate = async () => ({})) {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
  const core = Object.assign(new EventEmitter(), {
    capabilities: () => ({ appServerAvailable: true }),
    codex: { capabilities: () => ({ available: true }) },
    opl: { readState: async () => ({ owner: "Framework" }), runManagedUpdate: managedUpdate },
    carrierDiagnostics: { read: async () => ({ status: "available" }) },
    transport: { runWhenIdle: async operation => ({ status: "completed", result: await operation() }) },
    invoke: OplHostCore.prototype.invoke,
    close: async () => {}
  });
  const worker = startGuestHostCore({ input: child.stdin, output: child.stdout, createCore: async () => core, prepare: async (_payload, native) => { core.nativeUpdater = nativeHostOptions(native).nativeUpdater; return { options: {} }; } });
  return { child, core, worker };
}

test("desktop preload requests the setup projection only on explicit state reads", async context => {
  const fx = fixture();
  const seen = [];
  fx.core.opl.readState = async (profile, includeSetup = false) => {
    seen.push([profile, includeSetup]);
    return { app_state: includeSetup ? { system_initialize: { setup_flow: { ready_to_launch: false } } } : {} };
  };
  const proxy = await createGuestCoreProxy({ child: fx.child, initialize: {} });
  context.after(async () => { await proxy.close(); await fx.worker.close(); });
  let surface;
  runInNewContext(readFileSync(new URL("./preload.cjs", import.meta.url), "utf8"), {
    require: () => ({
      contextBridge: { exposeInMainWorld(_name, value) { surface = value; } },
      ipcRenderer: { invoke(channel, { method, payload }) {
        assert.equal(channel, "opl:invoke");
        return proxy.invoke(method, payload);
      } }
    })
  });
  assert.deepEqual((await surface.readState()).app_state, {});
  assert.equal((await surface.readState("fast", true)).app_state.system_initialize?.setup_flow.ready_to_launch, false);
  assert.deepEqual((await surface.readState("full", false)).app_state, {});
  assert.deepEqual(seen, [["fast", false], ["fast", true], ["full", false]]);
});

test("readState preserves the one parent maintenance controller through the actual Core method", async context => {
  const fx = fixture();
  const proxy = await createGuestCoreProxy({ child: fx.child, initialize: {}, closeChild: async () => {} });
  context.after(() => fx.worker.close());
  const snapshot = { status: "applying", reloadPending: true };
  proxy.updateMaintenance = { snapshot: () => snapshot, close: async () => {} };
  const state = await proxy.invoke("readState", { profile: "fast" });
  assert.equal(state.owner, "Framework");
  assert.deepEqual(state.managedUpdateMaintenance, snapshot);
  assert.equal(fx.core.updateMaintenance, undefined);
  await proxy.close();
});

test("a timed-out write cannot release the guest lease until the real owner finishes", async context => {
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const fx = fixture(async () => { started(); await pending; return { status: "completed" }; });
  const rpc = createGuestRpc({ input: fx.child.stdout, output: fx.child.stdin, onRequest: async () => ({}) });
  context.after(async () => { release(); await fx.worker.close(); rpc.close(); });
  await rpc.request("initialize");
  assert.deepEqual(await rpc.request("leaseAcquire"), { status: "held" });
  const write = rpc.request("managedUpdate", { operation: "apply" }, { timeoutMs: 20 });
  await entered;
  await assert.rejects(write, { code: "guest_request_timeout" });
  assert.deepEqual(await rpc.request("leaseRelease"), { released: false, reasonCode: "owner_operation_pending" });
  assert.deepEqual(await rpc.request("leaseAcquire"), { status: "deferred", reasonCode: "app_server_busy" });
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await rpc.request("leaseAcquire"), { status: "held" });
  assert.deepEqual(await rpc.request("leaseRelease"), { released: true });
});

test("parent-owned native restart can close the Host inside its idle lease", async context => {
  const fx = fixture();
  let proxy, entered = false;
  context.after(async () => { fx.worker.rpc.close(); await fx.worker.close(); });
  proxy = await createGuestCoreProxy({ child: fx.child, initialize: {}, closeChild: async () => {},
    nativeUpdater: { async perform(operation) {
      assert.equal(operation, "restart"); entered = true;
      const closed = await proxy.transport.runWhenIdle(() => proxy.close());
      return { status: closed.status };
    } }
  });
  const result = await proxy.invoke("restartNativeApp");
  assert.equal(entered, true);
  assert.deepEqual(result, { status: "completed" });
});

test("a MiniApp read arriving during maintenance does not prevent lease release", async context => {
  const fx = fixture();
  let unblock;
  const transportReleased = new Promise(resolve => { unblock = resolve; });
  fx.core.transport.runWhenIdle = async operation => {
    try { return { status: "completed", result: await operation() }; }
    finally { unblock(); }
  };
  fx.core.mcpApps = { async list() { await transportReleased; return { apps: [] }; } };
  const rpc = createGuestRpc({ input: fx.child.stdout, output: fx.child.stdin, onRequest: async () => ({}) });
  context.after(async () => { unblock(); await fx.worker.close(); rpc.close(); });
  await rpc.request("initialize");
  assert.deepEqual(await rpc.request("leaseAcquire"), { status: "held" });
  const read = rpc.request("invoke", { method: "listMcpApps", payload: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await rpc.request("leaseRelease"), { released: true });
  assert.deepEqual(await read, { apps: [] });
});

test("closing the Host rejects a read queued behind its maintenance lease", async context => {
  const fx = fixture();
  let invoked = false;
  fx.core.mcpApps = { async list() { invoked = true; return { apps: [] }; } };
  const rpc = createGuestRpc({ input: fx.child.stdout, output: fx.child.stdin, onRequest: async () => ({}) });
  context.after(async () => { await fx.worker.close(); rpc.close(); });
  await rpc.request("initialize");
  await rpc.request("leaseAcquire");
  const read = assert.rejects(rpc.request("invoke", { method: "listMcpApps", payload: {} }), { code: "guest_host_closing" });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await rpc.request("close"), { closed: true });
  await read;
  assert.equal(invoked, false);
});


test("disconnected Host closes its child even when maintenance cleanup fails", async context => {
  const fx = fixture();
  let closed = false;
  const proxy = await createGuestCoreProxy({ child: fx.child, initialize: {}, closeChild: async () => { closed = true; } });
  context.after(() => fx.worker.close());
  proxy.updateMaintenance = { close: async () => { throw Error("maintenance failed"); } };
  fx.child.emit("close", 1);
  assert.equal(proxy.isConnected(), false);
  await assert.rejects(proxy.close(), /maintenance failed/);
  assert.equal(closed, true);
  await assert.rejects(proxy.invoke("readSuperagent"), { code: "guest_host_closed" });
});
