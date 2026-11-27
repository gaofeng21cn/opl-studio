import assert from "node:assert/strict";
import test from "node:test";
import { OplFrameworkBridge, OpldClient, OpldRpcError, createOplPassthrough } from "../../plugins/core/opl-framework-bridge/src/index.mjs";
import { startFakeOpld } from "./fixtures/fake-opld.mjs";

test("OpldClient enforces requestTimeoutMs and reconnects transparently after a transient socket drop", async (t) => {
  let droppedOnce = false;
  const daemon = await startFakeOpld({
    onCall: async (method) => {
      if (method === "slow.op") {
        await new Promise((r) => setTimeout(r, 120));
        return { ok: true };
      }
      if (method === "drop.once" && !droppedOnce) {
        droppedOnce = true;
        daemon.dropSockets();
        await new Promise((r) => setTimeout(r, 20));
        return {};
      }
      return { recovered: true };
    }
  });
  t.after(() => daemon.close());

  const client = new OpldClient({ stateDir: daemon.stateDir, autoStart: false, requestTimeoutMs: 30_000 });
  t.after(() => client.close());
  assert.equal(client.requestTimeoutMs, 30_000);
  await assert.rejects(() => client.call("slow.op", {}, 25), (err) => err instanceof OpldRpcError && err.code === "rpc_timeout");

  const autoClient = new OpldClient({ stateDir: daemon.stateDir, autoStart: true });
  t.after(() => autoClient.close());
  assert.deepEqual(await autoClient.call("drop.once", {}), { recovered: true });
});

test("readState, readInitialize, and readFullDrilldown pass through daemon projections and attach readback", async (t) => {
  const daemon = await startFakeOpld({
    onCall: async (method, params) => {
      if (method === "app.state.get") {
        return {
          profile: params.profile,
          packages: [{ package_id: "med-autoscience" }],
          connections: [{ connection_id: "conn-1", status: "active" }],
          workspaces: [{ workspace_id: "ws-1" }],
          knowledge_sources: [{ source_id: "ks-1" }],
          tasks: [{ task_id: "task-1" }],
          schedules: [{ schedule_id: "sched-1" }]
        };
      }
      if (method === "app.initialize.get") return { system_initialize: { setup_flow: { ready_to_launch: true } } };
      if (method === "runway.task.list") return { tasks: [{ task_id: "task-1", status: "running" }] };
      if (method === "ledger.timeline") return { entries: [{ entry_id: "e-1", task_id: params.task_id }], timeline: [{ entry_id: "e-1" }] };
      return {};
    }
  });
  const opl = createOplPassthrough({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await opl.close(); await daemon.close(); });

  const st = await opl.readState("fast");
  assert.equal(st.profile, "fast");
  assert.equal(st.readback.exitCode, 0);
  assert.equal(st.connections[0].connection_id, "conn-1");

  const init = await opl.readInitialize();
  assert.equal(init.system_initialize.setup_flow.ready_to_launch, true);
  assert.equal(init.readback.exitCode, 0);

  const drill = await opl.readFullDrilldown();
  assert.equal(drill.detail, "full");
  assert.equal(drill.drilldown.tasks[0].task_id, "task-1");
  assert.equal(drill.drilldown.entries[0].entry_id, "e-1");
  assert.equal(drill.drilldown.state.profile, "full");
});

test("readDomainDetailView normalizes available, not_modified, missing envelopes and validates inputs pre-RPC", async (t) => {
  const calls = [];
  const daemon = await startFakeOpld({
    onCall: async (method, params) => {
      calls.push({ method, params });
      if (params.item_id === "missing-item") return { item_id: params.item_id, view_id: params.view_id, data: { status: "unavailable" } };
      return { item_id: params.item_id, view_id: params.view_id, view: { view_type: "list_detail" }, revision: 7, data: { rows: [1] } };
    }
  });
  const opl = createOplPassthrough({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await opl.close(); await daemon.close(); });

  for (const bad of [{ itemId: "", viewId: "v" }, { itemId: "i", viewId: " " }, { itemId: "i", viewId: "v", ifRevision: -1 }, { itemId: "i", viewId: "v", ifRevision: 1.5 }]) {
    await assert.rejects(() => opl.readDomainDetailView(bad), (err) => err?.code === "invalid_request");
  }
  assert.equal(calls.length, 0);

  const avail = await opl.readDomainDetailView({ itemId: "project:one", viewId: "roadmap" });
  assert.equal(avail.stdoutJson.schema_version, "opl_domain_detail_view.v1");
  assert.equal(avail.stdoutJson.availability, "available");
  assert.equal(avail.stdoutJson.view_kind, "list_detail");
  assert.equal(avail.stdoutJson.not_modified, false);
  assert.deepEqual(avail.stdoutJson.payload.data, { rows: [1] });

  const notMod = await opl.readDomainDetailView({ itemId: "project:one", viewId: "roadmap", ifRevision: 7 });
  assert.equal(notMod.stdoutJson.not_modified, true);
  assert.equal(notMod.stdoutJson.payload, null);

  const missing = await opl.readDomainDetailView({ itemId: "missing-item", viewId: "roadmap" });
  assert.equal(missing.stdoutJson.availability, "missing");
  assert.equal(missing.stdoutJson.payload, null);
});

test("readContribution forwards context fields, normalizes envelopes, validates pre-RPC, and propagates RPC errors", async (t) => {
  const calls = [];
  const daemon = await startFakeOpld({
    onCall: async (method, params) => {
      calls.push({ method, params });
      if (params.package_id === "missing-pkg") {
        return { __rpcError: { code: -32004, message: "Package not found", data: { code: "PACKAGE_NOT_FOUND" } } };
      }
      return { ok: true, result: { items: ["a"] } };
    }
  });
  const opl = createOplPassthrough({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await opl.close(); await daemon.close(); });

  for (const bad of [{ ref: "  " }, { packageId: "", ref: "x" }, { packageId: "  ", ref: "x" }, { packageId: 123, ref: "x" }]) {
    await assert.rejects(() => opl.readContribution(bad), (err) => err?.code === "invalid_request");
  }
  assert.equal(calls.length, 0);

  const res = await opl.readContribution({ packageId: "mas", ref: "view#main", input: { q: 1 }, ifRevision: 2, consumerBindToken: "tok", sessionId: "s1" });
  assert.equal(res.stdoutJson.opl_app_contribution.surface_kind, "opl_app_package_contribution.v1");
  assert.equal(res.stdoutJson.opl_app_contribution.package_id, "mas");
  assert.deepEqual(res.stdoutJson.opl_app_contribution.response.result, { items: ["a"] });
  assert.deepEqual(calls[0].params, { package_id: "mas", ref: "view#main", input: { q: 1 }, if_revision: 2, consumer_bind_token: "tok", session_id: "s1" });

  await assert.rejects(
    () => opl.readContribution({ packageId: "missing-pkg", ref: "view#main" }),
    (err) => err instanceof OpldRpcError && err.rpcCode === -32004 && err.code === "PACKAGE_NOT_FOUND"
  );
});

test("executeAction enforces read-only matrix, authorityBoundary, and preserves payload and stdoutJson", async (t) => {
  const calls = [];
  const daemon = await startFakeOpld({
    onCall: async (method, params) => {
      calls.push({ method, params });
      return { status: params.dry_run ? "preview" : "executed", result: { ok: true } };
    }
  });
  const client = new OpldClient({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await client.close(); await daemon.close(); });

  for (const flag of ["OPL_STUDIO_READ_ONLY", "OPL_NATIVE_WORKBENCH_READ_ONLY"]) {
    const ro = createOplPassthrough({ client, env: { [flag]: "1" } });
    const blocked = await ro.executeAction({ actionId: "test.mutate", dryRun: false, payload: { confirmed: true } });
    assert.equal(blocked.status, "blocked_read_only");
    assert.equal(blocked.blockedReason, "read_only_host");
    assert.equal(blocked.canExecute, false);
    assert.equal(blocked.exitCode, 1);

    const preview = await ro.executeAction({ actionId: "test.mutate", dryRun: false, mode: "preview", payload: { confirmed: true } });
    assert.equal(preview.status, "preview_ready");
    assert.equal(preview.authorityBoundary, "app_bridge_no_domain_authority");
  }

  const writable = createOplPassthrough({ client, env: {} });
  const exec = await writable.executeAction({ actionId: "gateway_account_use_for_model_access", dryRun: false, payload: { confirmed: true } });
  assert.equal(exec.status, "executed");
  assert.deepEqual(exec.payload, { confirmed: true });
  assert.equal(exec.stdoutJson.result.ok, true);
  assert.equal(calls.length, 3);
});

test("OplFrameworkBridge capabilities, Server-Push events, tolerant daemon_not_found, and credential/Weixin routes", async (t) => {
  const daemon = await startFakeOpld({
    onCall: async (method) => {
      if (method === "connect.add") return { connection_id: "conn-1" };
      if (method === "connect.approveRequest") return { ok: true, stateRefreshRequired: true };
      return {};
    }
  });
  const bridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await bridge.close(); await daemon.close(); });

  const caps = await bridge.start();
  assert.equal(caps.transport, "opld_rpc");
  assert.equal(caps.channelCallback.status, "dormant");
  assert.equal(bridge.hasNativeWeixinChannel(), false);

  const seen = [];
  const listener = (ev) => seen.push(ev);
  bridge.on("event", listener);
  daemon.emitEvent("event.pack.progress", { package_id: "mas", reload_mode: "renderer_reload" });
  daemon.emitEvent("event.runway.changed", { task_id: "t-1" });
  await new Promise((r) => setTimeout(r, 25));
  assert.deepEqual(seen.map((e) => e.method), ["event.pack.progress", "event.runway.changed"]);
  assert.equal(seen[0].raw.id, undefined);
  bridge.off("event", listener);

  assert.deepEqual(await bridge.gatewayAccountLogin({ email: "a@opl.dev", password: "pw" }), { ok: true, stateRefreshRequired: true });
  assert.deepEqual(await bridge.codexApiKeyConfiguration({ apiKey: "sk-1" }), { ok: true, stateRefreshRequired: true });
  assert.deepEqual(await bridge.connectionAccessApproval({ requestId: "req-1" }), { ok: true, stateRefreshRequired: true });

  const noDaemon = new OplFrameworkBridge({ stateDir: `${daemon.stateDir}-absent`, env: { PATH: "" } });
  t.after(() => noDaemon.close());
  const degraded = await noDaemon.start();
  assert.equal(degraded.available, false);
  assert.equal(degraded.reasonCode, "daemon_not_found");
});
