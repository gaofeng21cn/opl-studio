import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { CodexAppServerTransport, turnPermissionOverrides } from "../../plugins/core/opl-codex-native/src/app-server-transport.mjs";
import { OpldRpcError, createOplPassthrough } from "../../plugins/core/opl-framework-bridge/src/index.mjs";
import { startFakeOpld } from "./fixtures/fake-opld.mjs";

test("scheduled turns use CodexAppServerTransport, explicit turnPermissionOverrides, and canonical readback", async () => {
  const calls = [];
  const transport = new CodexAppServerTransport({ cwd: "/workspace" });
  transport.initialized = true;
  transport.request = async (method, params) => {
    calls.push({ method, params });
    if (method === "thread/start") return { thread: { id: "canonical" } };
    if (method === "turn/start") return { turn: { id: "turn" } };
    if (method === "thread/read") return { thread: { id: "canonical", turns: [{ id: "turn", status: "completed", items: [{ type: "agentMessage", text: "done" }] }] } };
    if (method === "turn/interrupt") return {};
    return {};
  };

  const thread = await transport.startThread({ cwd: "/workspace", permissions: ":read-only" });
  assert.equal(thread.thread.id, "canonical");
  assert.equal(calls[0].method, "thread/start");
  assert.equal(calls[0].params.cwd, "/workspace");
  assert.equal(calls[0].params.approvalPolicy, "on-request");
  assert.equal(calls[0].params.sandbox, "read-only");

  const roTurn = await transport.startTurn("canonical", "fixture", [], turnPermissionOverrides(":read-only", "/workspace"));
  assert.equal(roTurn.turn.id, "turn");
  assert.equal(calls[1].params.sandboxPolicy.type, "readOnly");
  assert.equal(calls[1].params.sandboxPolicy.networkAccess, true);

  await transport.startTurn("canonical", "fixture", [], turnPermissionOverrides(":workspace", "/workspace"));
  assert.equal(calls[2].params.sandboxPolicy.type, "workspaceWrite");
  assert.equal(calls[2].params.sandboxPolicy.networkAccess, true);

  const read = await transport.readThread("canonical", { includeTurns: true });
  assert.equal(read.thread.turns[0].status, "completed");
  assert.equal(read.thread.turns[0].items[0].text, "done");

  await transport.interruptTurn("canonical", "turn");
  assert.deepEqual(calls.at(-1), { method: "turn/interrupt", params: { threadId: "canonical", turnId: "turn" } });
});

test("workbench action bridge retains preview/read-only/execute contracts, contribution read, and full drilldown via opld", async (t) => {
  const calls = [];
  const daemon = await startFakeOpld({
    onCall: async (method, params) => {
      calls.push({ method, params });
      if (method === "app.action.execute") return { status: params.dry_run ? "preview" : "executed", confirmationId: "confirmation", result: { summary: "preview" } };
      if (method === "app.contribution.read") return { ok: true, result: { status: "available", items: [] } };
      if (method === "runway.task.list") return { tasks: [{ task_id: "sched-task-1", status: "running" }] };
      if (method === "ledger.timeline") return { entries: [{ entry_id: "entry-1" }], timeline: [{ entry_id: "entry-1" }] };
      if (method === "app.state.get") return { profile: params.profile, schedules: [{ schedule_id: "s-1" }] };
      return {};
    }
  });
  t.after(() => daemon.close());

  const ro = createOplPassthrough({ stateDir: daemon.stateDir, autoStart: false, env: { OPL_STUDIO_READ_ONLY: "1" } });
  t.after(() => ro.close());
  const request = { actionId: "package_contribution_execute", payload: { package_id: "opl-workbench-services", ref: "workbench#cleanup", input: { ids: ["logs:x"] } } };
  const preview = await ro.executeAction(request);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.status, "preview_ready");
  assert.equal(preview.stdoutJson.confirmationId, "confirmation");

  const blocked = await ro.executeAction({ ...request, dryRun: false });
  assert.equal(blocked.status, "blocked_read_only");
  assert.equal(calls.filter((c) => c.method === "app.action.execute").length, 1);

  const read = await ro.readContribution({ packageId: "opl-workbench-services", ref: "workbench#tasks" });
  assert.equal(read.stdoutJson.opl_app_contribution.response.result.status, "available");

  const drill = await ro.readFullDrilldown();
  assert.equal(drill.detail, "full");
  assert.equal(drill.drilldown.tasks[0].task_id, "sched-task-1");
  assert.equal(drill.drilldown.entries[0].entry_id, "entry-1");
  assert.equal(drill.drilldown.state.schedules[0].schedule_id, "s-1");
});

test("incompatible daemon or unavailable package contribution degrades cleanly with typed OpldRpcError", async (t) => {
  const daemon = await startFakeOpld({
    apiVersion: "2.0",
    onCall: async () => ({ __rpcError: { code: -32004, message: "Package not found", data: { code: "PACKAGE_NOT_FOUND" } } })
  });
  t.after(() => daemon.close());

  const opl = createOplPassthrough({ stateDir: daemon.stateDir, autoStart: false });
  t.after(() => opl.close());
  await assert.rejects(
    () => opl.readContribution({ packageId: "opl-workbench-services", ref: "workbench#tasks" }),
    (err) => err instanceof OpldRpcError && err.rpcCode === -32004 && err.code === "PACKAGE_NOT_FOUND"
  );

  const incompatible = createOplPassthrough({ stateDir: daemon.stateDir, apiVersion: "1.0", autoStart: false });
  t.after(() => incompatible.close());
  await assert.rejects(
    () => incompatible.readState("fast"),
    (err) => err instanceof OpldRpcError && err.rpcCode === -32002 && err.code === "base_upgrade_required"
  );
});
