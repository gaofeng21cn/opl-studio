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

test("the action bridge preserves owner rejections, required confirmation and identity", async () => {
  let value;
  const client = { call: async () => value };
  const opl = createOplPassthrough({ client });
  const request = { actionId: "package_contribution_execute", mode: "execute", payload: { package_id: "example", ref: "example#set" } };
  for (const rejected of [{ ok: false, status: "executed" }, { status: "executed", result: { ok: false } }, {}, { status: "unrecognized" }]) {
    value = rejected;
    const receipt = await opl.executeAction(request);
    assert.equal(receipt.status, "error");
    assert.equal(receipt.canExecute, false);
    assert.notEqual(receipt.exitCode, 0);
  }
  value = { status: "confirmation_required" };
  const prompt = await opl.executeAction(request);
  assert.equal(prompt.status, "confirmation_required");
  assert.equal(prompt.confirmationRequired, true);
  assert.equal(prompt.canExecute, false);
  value = { ok: true, status: "preview", confirmation_required: true, confirmation_id: "owner-request" };
  const preview = await opl.executeAction({ ...request, mode: "preview" });
  assert.equal(preview.status, "preview_ready");
  assert.equal(preview.confirmationRequired, true);
  assert.equal(preview.confirmationId, "owner-request");
  value = { ok: true, status: "executed", dry_run: true };
  await assert.rejects(() => opl.executeAction(request), { code: "invalid_owner_receipt" });
  value = { ok: true, status: "executed", action_id: "unrelated" };
  await assert.rejects(() => opl.executeAction(request), { code: "invalid_owner_receipt" });
});

test("contribution reads preserve domain state and the reference returned by the owner", async () => {
  const request = { packageId: "example", ref: "example#overview" };
  let value = { schema_version: "opl-package-app-contribution-response.v1", ok: true, ref: request.ref, package_id: "example", state: "empty", data: { rows: [] } };
  const opl = createOplPassthrough({ client: { call: async () => value } });
  const read = await opl.readContribution(request);
  assert.deepEqual(read.stdoutJson.opl_app_contribution.response.result, value);
  value = { ok: false, ref: request.ref, error: { message: "Package workspace unavailable" } };
  const failed = await opl.readContribution(request);
  assert.notEqual(failed.exitCode, 0);
  assert.equal(failed.stderr, "Package workspace unavailable");
  value = { ok: true, ref: "stale-ref", result: [] };
  await assert.rejects(() => opl.readContribution(request), { code: "invalid_owner_receipt" });
});

test("the native channel only receives its own declared contribution commands", async () => {
  const packageId = "opl-channel-weixin";
  const ref = "weixin.channel-access#disconnect";
  let frameworkCalls = 0;
  const client = { async call() { frameworkCalls++; return { ok: true, status: "executed" }; } };
  const wh = { appStatePatch: () => ({ ui_contributions: { entries: [{ package_id: packageId, commands: [{ action_ref: ref, confirmation_required: true }] }] } }) };
  const opl = createOplPassthrough({ client, getWeixinHost: () => wh });
  const req = { actionId: "package_contribution_execute", payload: { package_id: packageId, ref } };
  const preview = await opl.executeAction(req);
  assert.equal(preview.status, "preview_ready");
  assert.equal(preview.confirmationRequired, true);
  assert.equal((await opl.executeAction({ ...req, mode: "execute" })).status, "confirmation_required");
  await assert.rejects(() => opl.executeAction({ ...req, payload: { ...req.payload, ref: "unknown" } }), /Unknown Weixin/);
  assert.equal(frameworkCalls, 0);
  const toggled = await opl.executeAction({ actionId: "package_app_set_enabled", mode: "execute", payload: { package_id: packageId, enabled: false } });
  assert.equal(toggled.status, "executed");
  assert.equal(frameworkCalls, 1);
});
