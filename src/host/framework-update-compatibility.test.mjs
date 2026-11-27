import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { OplFrameworkBridge, OpldClient, OpldRpcError, createOplPassthrough } from "../../plugins/core/opl-framework-bridge/src/index.mjs";
import { startFakeOpld } from "./fixtures/fake-opld.mjs";

test("Handshake apiVersion major compatibility succeeds on minor bump and latches base_upgrade_required (-32002)", async (t) => {
  const daemon = await startFakeOpld({ apiVersion: "2.0" });
  t.after(() => daemon.close());

  const okBridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, apiVersion: "2.3", autoStart: false });
  t.after(() => okBridge.close());
  const caps = await okBridge.start();
  assert.equal(caps.connected, true);
  assert.equal(caps.apiVersion, "2.0");

  for (const incompatible of ["1.0", "99.0"]) {
    const badBridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, apiVersion: incompatible, autoStart: false });
    t.after(() => badBridge.close());
    await assert.rejects(
      () => badBridge.start(),
      (err) => err instanceof OpldRpcError && err.code === "base_upgrade_required" && err.rpcCode === -32002 && err.data?.expected_major === 2
    );
    await assert.rejects(
      () => badBridge.opl.readState("fast"),
      (err) => err instanceof OpldRpcError && err.code === "base_upgrade_required" && err.rpcCode === -32002
    );
  }
});

test("runManagedUpdate validates operations pre-RPC and enforces read-only host blocking", async (t) => {
  const calls = [];
  const daemon = await startFakeOpld({
    onCall: async (method) => {
      calls.push(method);
      if (method === "pack.updatePlan") return {
        packages: [{ package_id: "mas", status: "available" }],
        managed_update: { components: [{ component_id: "opl_packages" }], execution: { status: "completed" } }
      };
      if (method === "daemon.health") return { status: "ok" };
      return {};
    }
  });
  t.after(() => daemon.close());

  const roClient = new OpldClient({ stateDir: daemon.stateDir, autoStart: false });
  t.after(() => roClient.close());
  const ro = createOplPassthrough({ client: roClient, env: { OPL_STUDIO_READ_ONLY: "1" } });

  await assert.rejects(() => ro.runManagedUpdate("rollback"), (err) => err?.code === "invalid_request");
  for (const op of ["apply", "activate"]) {
    await assert.rejects(() => ro.runManagedUpdate(op), (err) => err?.code === "blocked_read_only");
  }
  const roNative = createOplPassthrough({ client: roClient, env: { OPL_NATIVE_WORKBENCH_READ_ONLY: "1" } });
  await assert.rejects(() => roNative.runManagedUpdate("apply"), (err) => err?.code === "blocked_read_only");
  assert.equal(calls.length, 0);

  const check = await ro.runManagedUpdate("check");
  assert.equal(check.managed_update.packages[0].package_id, "mas");
  const status = await ro.runManagedUpdate("status");
  assert.deepEqual(status.managed_update.components, [{ component_id: "opl_packages" }]);
  assert.deepEqual(calls, ["pack.updatePlan", "pack.updatePlan"]);
});

test("writable runManagedUpdate routes pack.updateAll and propagates daemon/trusted-host errors without synthesizing completion", async (t) => {
  let failApply = false;
  let legacy = false;
  const calls = [];
  const daemon = await startFakeOpld({
    onCall: async (method, params) => {
      calls.push({ method, params });
      if (method === "pack.updateAll") {
        if (failApply) return { __rpcError: { code: -32003, message: "Trusted host required", data: { code: "TRUSTED_HOST_REQUIRED" } } };
        if (legacy) return { batch_id: "batch-1", results: [] };
        assert.deepEqual(params, { background: true });
        return { batch_id: "batch-1", managed_update: { components: [], execution: { status: "partial_failure" } } };
      }
      if (method === "daemon.health") return { ok: true };
      return { packages: [] };
    }
  });
  t.after(() => daemon.close());

  const opl = createOplPassthrough({ stateDir: daemon.stateDir, autoStart: false });
  t.after(() => opl.close());

  const applied = await opl.runManagedUpdate("apply");
  assert.equal(applied.managed_update.batch_id, "batch-1");
  assert.equal(applied.managed_update.execution.status, "partial_failure");

  const activated = await opl.runManagedUpdate("activate");
  assert.equal(activated.runtime_activation.status, "active");
  assert.deepEqual(calls.map((c) => c.method), ["pack.updateAll", "daemon.health"]);

  legacy = true;
  await assert.rejects(() => opl.runManagedUpdate("apply"), { code: "base_upgrade_required" });
  failApply = true;
  await assert.rejects(
    () => opl.runManagedUpdate("apply"),
    (err) => err instanceof OpldRpcError && err.rpcCode === -32003 && err.code === "TRUSTED_HOST_REQUIRED"
  );
});

test("unavailable daemon and missing binary errors reject fail-closed when explicitly configured", async (t) => {
  const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), "opl-update-compat-"));
  t.after(() => fs.rm(emptyDir, { recursive: true, force: true }));

  const noAuto = new OpldClient({ stateDir: emptyDir, autoStart: false });
  t.after(() => noAuto.close());
  await assert.rejects(() => noAuto.connect(), (err) => err instanceof OpldRpcError && err.code === "daemon_unavailable");

  const explicitBadBin = new OplFrameworkBridge({
    stateDir: emptyDir,
    env: { ...process.env, OPL_DAEMON_BIN: path.join(emptyDir, "missing-opld") }
  });
  t.after(() => explicitBadBin.close());
  await assert.rejects(() => explicitBadBin.start(), (err) => err instanceof OpldRpcError && err.code === "daemon_not_found");
});
