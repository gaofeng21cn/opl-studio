import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CodexAppServerTransport } from "../../plugins/core/opl-codex-native/src/app-server-transport.mjs";
import { createManagedUpdateMaintenance, eligibleBackgroundComponents } from "./managed-update-maintenance.mjs";

const component = (id, safe = true) => ({
  component_id: id,
  auto_apply: { eligible: true, app_background_safe: safe, command_ref: "opl update apply --json" }
});

test("scheduled idle work waits out a busy transport and runs exactly once", async () => {
  const transport = new CodexAppServerTransport();
  const runs = [];
  let release;
  const work = new Promise((resolve) => { release = resolve; });

  // A live request keeps the transport busy, so a plain runWhenIdle defers.
  const activity = transport.withActivity(() => work);
  assert.equal((await transport.runWhenIdle(() => assert.fail("busy writer"))).status, "deferred");

  // scheduleWhenIdle must not drop the deferred work; it waits for quiescence.
  let scheduled = false;
  const scheduledRun = transport.scheduleWhenIdle(() => { scheduled = true; runs.push("reload"); });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scheduled, false, "must not run while the transport is busy");

  release();
  await activity;
  await scheduledRun;
  assert.equal(scheduled, true);
  assert.deepEqual(runs, ["reload"]);

  // Requested again while busy: the operation still runs after the next
  // quiescence instead of becoming a dropped deferred no-op.
  let releaseLate;
  const lateWork = new Promise((resolve) => { releaseLate = resolve; });
  const lateActivity = transport.withActivity(() => lateWork);
  const lateRun = transport.scheduleWhenIdle(() => runs.push("late"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(runs, ["reload"]);
  releaseLate();
  await lateActivity;
  await lateRun;
  assert.deepEqual(runs, ["reload", "late"]);

  await transport.close();
  await assert.rejects(
    transport.scheduleWhenIdle(() => assert.fail("closed transport")),
    /closed/
  );
});

test("maintenance consumes Framework eligibility for dynamically contributed components", () => {
  const external = { ...component("homebrew"), auto_apply: { eligible: false } };
  const plan = { managed_update: { components: [component("opl_base"), component("opl_packages", false), component("new_plugin_runtime"), external] } };
  assert.deepEqual(eligibleBackgroundComponents(plan).map((item) => item.component_id), ["opl_base", "new_plugin_runtime"]);
  assert.throws(() => eligibleBackgroundComponents({}), /no components/);
});

test("idle maintenance serializes new requests and defers active tasks and approvals", async () => {
  const transport = new CodexAppServerTransport();
  let release;
  const work = new Promise((resolve) => { release = resolve; });
  const lease = transport.runWhenIdle(() => work);
  let requested = false;
  const request = transport.withActivity(() => { requested = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requested, false);
  assert.equal((await transport.runWhenIdle(() => assert.fail("second writer"))).status, "deferred");
  release();
  await lease;
  await request;
  assert.equal(requested, true);
  transport.activeTurns.add("active-turn");
  assert.equal((await transport.runWhenIdle(() => assert.fail("active turn"))).status, "deferred");
  transport.activeTurns.clear();
  transport.pendingServerRequests.set(1, {});
  assert.equal((await transport.runWhenIdle(() => assert.fail("pending approval"))).status, "deferred");
  transport.pendingServerRequests.clear();
  await transport.close();
  await assert.rejects(transport.withActivity(() => assert.fail("closed transport")), /closed/);
});

test("eligible updates refresh Codex only inside the idle lease and read back Framework status", async () => {
  const calls = [];
  const transport = new CodexAppServerTransport();
  const maintenance = createManagedUpdateMaintenance({
    opl: { runManagedUpdate: async (operation) => {
      calls.push(operation);
      if (operation === "plan") return { managed_update: { components: [component("opl_packages")] } };
      if (operation === "apply") return { managed_update: {
        execution: { status: "completed" },
        components: [{ component_id: "opl_packages", receipt: { reload_guidance: { reload_recommended: true } } }]
      } };
      return {};
    } },
    codex: { transport, reloadConfiguration: async (options) => {
      assert.equal(options.maintenanceHeld, true);
      assert.ok(transport.maintenance);
      calls.push("reload");
    } },
    now: () => 1234
  });
  const result = await maintenance.runNow();
  assert.equal(result.status, "completed");
  assert.equal(result.lastCompletedAt, 1234);
  assert.deepEqual(calls, ["plan", "apply", "reload", "status"]);
  await maintenance.close();
});

test("busy and failed maintenance remains retryable without advancing the check receipt", async () => {
  const transport = new CodexAppServerTransport();
  transport.activeTurns.add("running");
  let applied = false;
  const maintenance = createManagedUpdateMaintenance({
    opl: { runManagedUpdate: async (operation) => {
      if (operation === "plan") return { managed_update: { components: [component("opl_base")] } };
      if (operation === "apply") { applied = true; throw new Error("failed download"); }
      return {};
    } },
    codex: { transport }
  });
  assert.equal((await maintenance.runNow()).status, "deferred");
  assert.equal(applied, false);
  transport.activeTurns.clear();
  const failed = await maintenance.runNow();
  assert.equal(failed.status, "failed");
  assert.equal(failed.lastCompletedAt, null);
  assert.equal(transport.maintenance, null);
  await maintenance.close();
});

test("App updater feed failure does not block Framework package maintenance", async () => {
  const calls = [];
  let appChecks = 0;
  const transport = new CodexAppServerTransport();
  const maintenance = createManagedUpdateMaintenance({
    checkAppUpdate: async () => { appChecks++; throw new Error("feed unavailable"); },
    opl: { runManagedUpdate: async (operation) => {
      calls.push(operation);
      if (operation === "plan") return { managed_update: { components: [component("opl_packages")] } };
      if (operation === "apply") return { managed_update: { execution: { status: "completed" }, components: [] } };
      return {};
    } },
    codex: { transport },
    now: () => 100_000
  });

  const result = await maintenance.runNow();
  assert.equal(result.status, "completed");
  assert.equal(result.failureRetryCount, 1);
  assert.equal(result.retryExhausted, false);
  assert.equal(result.nextAttemptAt, 100_000 + 30 * 60_000);
  assert.equal(appChecks, 1);
  assert.deepEqual(calls, ["plan", "apply", "status"]);
  await maintenance.close();
});

test("failed Codex refresh survives restart and retries even when packages are already current", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opl-maintenance-recovery-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stateFile = path.join(root, "state.json");
  const transport = new CodexAppServerTransport();
  let updated = false;
  let refreshes = 0;
  const options = {
    stateFile,
    opl: { runManagedUpdate: async (operation) => {
      if (operation === "plan") return { managed_update: { components: updated ? [] : [component("opl_packages")] } };
      if (operation === "apply") {
        updated = true;
        return { managed_update: { execution: { status: "completed" }, components: [
          { component_id: "opl_packages", receipt: { reload_guidance: { reload_recommended: true } } }
        ] } };
      }
      return {};
    } },
    codex: { transport, reloadConfiguration: async () => { if (++refreshes === 1) throw new Error("restart failed"); } },
    schedule: () => 1, unschedule: () => {}
  };
  const initial = createManagedUpdateMaintenance(options);
  assert.equal((await initial.runNow()).status, "failed");
  await initial.close();
  const restored = createManagedUpdateMaintenance(options);
  await restored.start();
  assert.equal(restored.snapshot().reloadPending, true);
  const result = await restored.runNow();
  assert.equal(result.status, "completed");
  assert.equal(result.reloadPending, false);
  assert.equal(refreshes, 2);
  await restored.close();
});

test("failed automatic apply uses bounded retries across repeated cold starts", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opl-maintenance-cooldown-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stateFile = path.join(root, "state.json");
  const checkInterval = 6 * 60 * 60_000;
  const failureRetry = 30 * 60_000;
  let time = 100_000;
  let timer;
  let applies = 0;
  const options = {
    stateFile, now: () => time,
    schedule: (callback, delay) => { timer = { callback, delay }; return timer; }, unschedule: () => {},
    opl: { runManagedUpdate: async (operation) => {
      if (operation === "plan") return { managed_update: { components: [component("opl_packages")] } };
      if (operation === "apply") {
        applies++;
        const saved = JSON.parse(await fs.readFile(stateFile, "utf8"));
        assert.equal(saved.nextAttemptAt, time + checkInterval);
        return { managed_update: { execution: { status: "partial_failure" } } };
      }
      return {};
    } },
    codex: { transport: new CodexAppServerTransport() }
  };
  const initial = createManagedUpdateMaintenance(options);
  await initial.start();
  assert.equal(timer.delay, 30_000);
  await timer.callback();
  assert.equal(initial.snapshot().status, "failed");
  assert.equal(timer.delay, failureRetry);
  await initial.close();
  for (let i = 1; i <= 2; i++) {
    time += failureRetry;
    const restored = createManagedUpdateMaintenance(options);
    await restored.start();
    assert.equal(timer.delay, 30_000);
    await timer.callback();
    assert.equal(restored.snapshot().status, "failed");
    await restored.close();
  }
  assert.equal(applies, 3);
  assert.equal(timer.delay, checkInterval);
});

test("legacy failed receipts migrate once and an interrupted attempt keeps its reservation", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opl-maintenance-legacy-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stateFile = path.join(root, "state.json");
  const checkInterval = 6 * 60 * 60_000;
  const failureRetry = 30 * 60_000;
  let time = 100_000;
  let delay;
  const options = { stateFile, now: () => time,
    schedule: (_, value) => { delay = value; return 1; }, unschedule: () => {},
    opl: { runManagedUpdate: () => assert.fail("must not replay mutation on start") }, codex: {} };
  for (const status of ["failed", "checking", "applying"]) {
    await fs.writeFile(stateFile, JSON.stringify({ schema: "opl_studio_update_maintenance.v1", status }));
    const first = createManagedUpdateMaintenance(options);
    await first.start();
    assert.equal(delay, failureRetry);
    await first.close();
    time += 60_000;
    const restarted = createManagedUpdateMaintenance(options);
    await restarted.start();
    assert.equal(delay, failureRetry - 60_000);
    await restarted.close();
  }
});

test("only an idle-lease deferral uses the short automatic retry", async () => {
  let timer;
  const transport = new CodexAppServerTransport();
  transport.activeTurns.add("active");
  const maintenance = createManagedUpdateMaintenance({
    now: () => 10_000,
    schedule: (callback, delay) => { timer = { callback, delay }; return timer; }, unschedule: () => {},
    opl: { runManagedUpdate: async (operation) => {
      assert.notEqual(operation, "apply");
      return { managed_update: { components: [component("opl_packages")] } };
    } }, codex: { transport }
  });
  await maintenance.start();
  const firstTimer = timer;
  await maintenance.start();
  assert.equal(timer, firstTimer);
  await timer.callback();
  assert.equal(maintenance.snapshot().status, "deferred");
  assert.equal(timer.delay, 5 * 60_000);
  await maintenance.close();
});

test("background maintenance syncs DSH plugins, marks restart pending, and clears the flag on cold start", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opl-maintenance-dsh-sync-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stateFile = path.join(root, "state.json");
  const transport = new CodexAppServerTransport();
  let syncCalls = 0;
  const maintenance = createManagedUpdateMaintenance({
    stateFile,
    opl: { runManagedUpdate: async () => ({ managed_update: { components: [] } }) },
    codex: { transport },
    syncDshPlugins: async () => {
      syncCalls += 1;
      return { application: "restart-required", installed: { "@gaofeng21cn/opl-studio-client": "0.1.99" }, failures: {} };
    },
    now: () => 50_000
  });
  const snapshot = await maintenance.runNow();
  assert.equal(syncCalls, 1);
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.dshPluginRestartRequired, true);
  assert.equal(snapshot.dshPluginUpdateStatus, "restart_required");
  assert.deepEqual(snapshot.updatedDshPlugins, { "@gaofeng21cn/opl-studio-client": "0.1.99" });
  await maintenance.close();

  const relaunched = createManagedUpdateMaintenance({
    stateFile,
    opl: { runManagedUpdate: async () => ({ managed_update: { components: [] } }) },
    codex: { transport },
    schedule: (cb, delay) => ({ cb, delay }),
    unschedule: () => {},
    now: () => 60_000
  });
  await relaunched.start();
  assert.equal(relaunched.snapshot().dshPluginRestartRequired, false);
  await relaunched.close();
});

test("DSH plugin sync failures remain isolated without failing Framework package maintenance", async () => {
  const transport = new CodexAppServerTransport();
  const maintenance = createManagedUpdateMaintenance({
    opl: { runManagedUpdate: async () => ({ managed_update: { components: [] } }) },
    codex: { transport },
    syncDshPlugins: async () => { throw new Error("feed_unavailable"); },
    now: () => 50_000
  });
  const snapshot = await maintenance.runNow();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.dshPluginUpdateStatus, "failed");
  assert.equal(snapshot.dshPluginRestartRequired, false);
  await maintenance.close();
});

test("background maintenance marks reload_ready when only client DSH plugins refresh and external updates still require restart", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opl-maintenance-reload-ready-"));
  try {
    const stateFile = path.join(root, "state.json");
    const transport = new CodexAppServerTransport();
    const maintenance = createManagedUpdateMaintenance({
      stateFile,
      opl: { runManagedUpdate: async () => ({ managed_update: { components: [] } }) },
      codex: { transport },
      syncDshPlugins: async () => ({
        application: "renderer-reload",
        reloadMode: "renderer_reload",
        installed: { "@gaofeng21cn/opl-runtime-status": "0.1.2" },
        failures: {},
        externalStaged: []
      }),
      now: () => 50_000
    });
    const snapshot = await maintenance.runNow();
    assert.equal(snapshot.dshPluginReloadReady, true);
    assert.equal(snapshot.dshPluginRestartRequired, false);
    assert.equal(snapshot.dshPluginUpdateStatus, "reload_ready");
    await maintenance.close();

    const relaunched = createManagedUpdateMaintenance({
      stateFile,
      opl: { runManagedUpdate: async () => ({ managed_update: { components: [] } }) },
      codex: { transport },
      schedule: (cb, delay) => ({ cb, delay }),
      unschedule: () => {},
      now: () => 60_000
    });
    await relaunched.start();
    assert.equal(relaunched.snapshot().dshPluginReloadReady, false);
    assert.equal(relaunched.snapshot().dshPluginRestartRequired, false);
    await relaunched.close();

    const mixedMaintenance = createManagedUpdateMaintenance({
      opl: { runManagedUpdate: async () => ({ managed_update: { components: [] } }) },
      codex: { transport },
      syncDshPlugins: async () => ({
        application: "restart-required",
        reloadMode: "restart_required",
        installed: { "@gaofeng21cn/opl-studio-client": "0.1.10" },
        failures: {},
        externalStaged: ["billion-context"]
      }),
      now: () => 70_000
    });
    const mixedSnapshot = await mixedMaintenance.runNow();
    assert.equal(mixedSnapshot.dshPluginRestartRequired, true);
    assert.equal(mixedSnapshot.dshPluginReloadReady, false);
    await mixedMaintenance.close();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("a partially applied Framework batch preserves its app restart until a cold start", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opl-maintenance-framework-restart-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let applyNeeded = true;
  const options = {
    stateFile: path.join(root, "state.json"),
    opl: { runManagedUpdate: async (operation) => {
      if (operation === "plan") return { managed_update: { components: applyNeeded ? [component("opl_packages")] : [] } };
      if (operation === "apply") {
        applyNeeded = false;
        return { managed_update: {
          execution: { status: "partial_failure" },
          components: [{ component_id: "opl_packages", receipt: { reload_guidance: { reload_mode: "restart_required", restart_required: true } } }]
        } };
      }
      return {};
    } },
    codex: { transport: new CodexAppServerTransport(), reloadConfiguration: () => assert.fail("restart needs the whole App") },
    schedule: () => 1, unschedule: () => {}
  };
  const initial = createManagedUpdateMaintenance(options);
  const partial = await initial.runNow();
  assert.equal(partial.status, "failed");
  assert.equal(partial.errorCode, "managed_update_incomplete");
  assert.equal(partial.packageRestartRequired, true);
  assert.equal(partial.dshPluginRestartRequired, false);
  assert.equal((await initial.runNow()).packageRestartRequired, true);
  await initial.close();
  const relaunched = createManagedUpdateMaintenance(options);
  await relaunched.start();
  assert.equal(relaunched.snapshot().packageRestartRequired, false);
  await relaunched.close();
});

test("an older Framework without update plans cannot block DSH package maintenance", async () => {
  const maintenance = createManagedUpdateMaintenance({
    opl: { runManagedUpdate: async () => { throw Object.assign(new Error("Unknown method"), { code: "METHOD_NOT_FOUND" }); } },
    codex: { transport: new CodexAppServerTransport() },
    syncDshPlugins: async () => ({ installed: { "test-plugin": "1.1.0" }, application: "restart-required" }),
    now: () => 100
  });
  const result = await maintenance.runNow();
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "METHOD_NOT_FOUND");
  assert.equal(result.nextAttemptAt, 100 + 30 * 60_000);
  assert.equal(result.dshPluginRestartRequired, true);
  assert.equal(result.dshPluginUpdateStatus, "restart_required");
  assert.deepEqual(result.updatedDshPlugins, { "test-plugin": "1.1.0" });
  await maintenance.close();
});

test("a renderer reload acknowledges the loaded Framework and DSH updates while newer updates stay pending", async () => {
  let dshUpdated = true;
  const maintenance = createManagedUpdateMaintenance({
    opl: { runManagedUpdate: async (operation) => {
      if (operation === "plan") return { managed_update: { components: [component("opl_packages")] } };
      if (operation === "apply") return { managed_update: {
        execution: { status: "completed" },
        components: [{ component_id: "opl_packages", receipt: { reload_guidance: { reload_mode: "renderer_reload", reload_recommended: true } } }]
      } };
      return {};
    } },
    codex: { transport: new CodexAppServerTransport(), reloadConfiguration: () => assert.fail("renderer reload needs the client") },
    syncDshPlugins: async () => dshUpdated
      ? { installed: { "test-plugin": "1.1.0" }, reloadMode: "renderer_reload" } : {}
  });
  const snapshot = await maintenance.runNow();
  assert.equal(snapshot.packageRendererReloadReady, true);
  assert.equal(snapshot.dshPluginReloadReady, true);
  const loaded = maintenance.captureRendererUpdateAcknowledgement();
  dshUpdated = false;
  await maintenance.runNow();
  loaded();
  assert.equal(maintenance.snapshot().packageRendererReloadReady, true);
  assert.equal(maintenance.snapshot().dshPluginReloadReady, false);
  maintenance.captureRendererUpdateAcknowledgement()();
  assert.equal(maintenance.snapshot().packageRendererReloadReady, false);
  await maintenance.close();
});
