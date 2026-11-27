import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { performDesktopRestart, scheduleRendererReload } from "./relaunch.mjs";

test("performDesktopRestart delegates downloaded Electron shell updates to quitAndInstall", async () => {
  const calls = [];
  const desktopUpdater = {
    snapshot: () => ({ schema: "opl_native_app_updater.v1", state: "downloaded", supported: true, restartRequired: true }),
    perform: async (operation) => {
      calls.push(operation);
      return { schema: "opl_native_app_updater.v1", state: "installing", operation, supported: true, accepted: true, restartRequired: true };
    }
  };
  const result = await performDesktopRestart({
    desktopUpdater,
    hostCore: { transport: { runWhenIdle: async () => assert.fail("updater owns host lease") } },
    prepareShutdown: async () => assert.fail("updater runs beforeRestart"),
    relaunchApp: () => calls.push("relaunch"),
    quitApp: () => calls.push("quit")
  });
  assert.equal(result.accepted, true);
  assert.deepEqual(calls, ["restart"]);
});

test("performDesktopRestart cleanly shuts down idle host and relaunches for plugin or Framework restarts", async () => {
  const lifecycle = [];
  const desktopUpdater = {
    snapshot: (operation = "status") => ({ schema: "opl_native_app_updater.v1", operation, state: "unsupported", supported: false, restartRequired: false })
  };
  const hostCore = {
    transport: {
      runWhenIdle: async (work) => {
        lifecycle.push("lease");
        await work();
        return { status: "completed" };
      }
    }
  };
  const result = await performDesktopRestart({
    desktopUpdater,
    hostCore,
    prepareShutdown: async () => lifecycle.push("shutdown"),
    relaunchApp: () => lifecycle.push("relaunch"),
    quitApp: () => lifecycle.push("quit")
  });
  assert.equal(result.accepted, true);
  assert.equal(result.state, "restart_scheduled");
  assert.equal(result.supported, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(lifecycle, ["lease", "shutdown", "relaunch", "quit"]);
});

test("performDesktopRestart refuses to quit when a task holds the Codex transport", async () => {
  const lifecycle = [];
  const result = await performDesktopRestart({
    desktopUpdater: { snapshot: () => ({ schema: "opl_native_app_updater.v1", state: "not_available", supported: true, restartRequired: false }) },
    hostCore: { transport: { runWhenIdle: async () => ({ status: "deferred", reasonCode: "app_server_busy" }) } },
    prepareShutdown: async () => lifecycle.push("shutdown"),
    relaunchApp: () => lifecycle.push("relaunch"),
    quitApp: () => lifecycle.push("quit")
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reasonCode, "app_server_busy");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(lifecycle, []);
});

test("a successful main frame reload acknowledges staged updates, a failed load leaves them pending", async () => {
  const target = new EventEmitter();
  const calls = [];
  target.isDestroyed = () => false;
  target.reloadIgnoringCache = () => calls.push("reload");
  const maintenance = { captureRendererUpdateAcknowledgement: () => () => calls.push("ack") };
  for (const outcome of ["failed", "loaded"]) {
    assert.equal(scheduleRendererReload(target, maintenance).accepted, true);
    await new Promise(resolve => setImmediate(resolve));
    target.emit("did-fail-load", {}, -1, "", "", outcome === "failed");
    target.emit("did-finish-load");
    assert.equal(target.listenerCount("destroyed"), 0);
  }
  assert.deepEqual(calls, ["reload", "reload", "ack"]);
});
