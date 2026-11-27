import assert from "node:assert/strict";
import test from "node:test";
import { OpldClient, createOplPassthrough } from "../../plugins/core/opl-framework-bridge/src/index.mjs";
import { startFakeOpld } from "./fixtures/fake-opld.mjs";

test("readState forwards fast and full profiles to app.state.get and preserves daemon projection", async (t) => {
  const calls = [];
  const daemon = await startFakeOpld({
    onCall: async (method, params) => {
      calls.push({ method, params });
      return {
        profile: params.profile,
        packages: [{ package_id: "med-autoscience", installed: true }],
        workspaces: [{ workspace_id: "ws-1" }],
        knowledge_sources: [{ source_id: "ks-1" }],
        connections: [{ connection_id: "conn-1" }],
        tasks: [{ task_id: "task-1" }],
        schedules: [{ schedule_id: "sched-1" }],
        app_state: { packages: [{ package_id: "med-autoscience" }] }
      };
    }
  });
  const opl = createOplPassthrough({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await opl.close(); await daemon.close(); });

  const fast = await opl.readState("fast");
  assert.equal(fast.profile, "fast");
  assert.equal(fast.readback.exitCode, 0);
  assert.equal(fast.packages[0].package_id, "med-autoscience");
  assert.equal(fast.workspaces[0].workspace_id, "ws-1");
  assert.equal(fast.knowledge_sources[0].source_id, "ks-1");
  assert.equal(fast.connections[0].connection_id, "conn-1");
  assert.equal(fast.tasks[0].task_id, "task-1");
  assert.equal(fast.schedules[0].schedule_id, "sched-1");

  const full = await opl.readState("full");
  assert.equal(full.profile, "full");
  assert.deepEqual(calls, [
    { method: "app.state.get", params: { profile: "fast" } },
    { method: "app.state.get", params: { profile: "full" } }
  ]);
});

test("executeAction enforces pre-RPC validation, read-only preview vs mutating block, and native inventory preservation", async (t) => {
  const calls = [];
  const daemon = await startFakeOpld({
    onCall: async (method, params) => {
      calls.push({ method, params });
      return {
        status: params.dry_run ? "preview" : "executed",
        app_action_execution: {
          status: "completed",
          result: {
            native_action: { action_id: params.action_id, status: "completed" },
            native_inventory: { inventory_status: "available", native_items: [{ item_id: "cask:publisher/tap/native-app", installed: true }] }
          }
        }
      };
    }
  });
  const client = new OpldClient({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await client.close(); await daemon.close(); });

  const ro = createOplPassthrough({ client, env: { OPL_STUDIO_READ_ONLY: "1" } });
  await assert.rejects(() => ro.executeAction({ actionId: "   " }), (err) => err?.code === "invalid_request");

  const blocked = await ro.executeAction({ actionId: "source_install", dryRun: false, mode: "execute", payload: { confirmed: true } });
  assert.equal(blocked.status, "blocked_read_only");
  assert.equal(blocked.receiptKind, "blocked_read_only");
  assert.equal(blocked.canExecute, false);
  assert.equal(blocked.exitCode, 1);
  assert.equal(blocked.blockedReason, "read_only_host");
  assert.equal(calls.length, 0);

  const preview = await ro.executeAction({ actionId: "source_install", dryRun: false, mode: "preview", payload: { item_id: "cask:x" } });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.receiptKind, "preview");
  assert.equal(preview.status, "preview_ready");

  const writable = createOplPassthrough({ client, env: {} });
  const receipt = await writable.executeAction({
    actionId: "source_install",
    dryRun: false,
    mode: "execute",
    packageId: "opl-pkg",
    payload: { confirmed: true }
  });
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.status, "executed");
  assert.equal(receipt.stdoutJson.app_action_execution.result.native_inventory.native_items[0].installed, true);
  assert.deepEqual(calls.at(-1), {
    method: "app.action.execute",
    params: { action_id: "source_install", payload: { confirmed: true }, dry_run: false, mode: "execute", package_id: "opl-pkg" }
  });
});

test("runStartupMaintenance invokes daemon.doctor and blocks pre-RPC in read-only mode", async (t) => {
  const calls = [];
  const daemon = await startFakeOpld({
    onCall: async (method, params) => {
      calls.push({ method, params });
      return { healthy: true };
    }
  });
  t.after(() => daemon.close());

  const ro = createOplPassthrough({ stateDir: daemon.stateDir, autoStart: false, env: { OPL_NATIVE_WORKBENCH_READ_ONLY: "1" } });
  t.after(() => ro.close());
  await assert.rejects(() => ro.runStartupMaintenance(), (err) => err?.code === "blocked_read_only");
  assert.equal(calls.length, 0);

  const writable = createOplPassthrough({ stateDir: daemon.stateDir, autoStart: false, env: {} });
  t.after(() => writable.close());
  assert.deepEqual(await writable.runStartupMaintenance(), {
    system_action: { status: "completed", details: { healthy: true } }
  });
  assert.deepEqual(calls, [{ method: "daemon.doctor", params: { includeFirstRun: false } }]);
});
