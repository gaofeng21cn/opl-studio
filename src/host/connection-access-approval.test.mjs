import assert from "node:assert/strict";
import test from "node:test";
import { OplFrameworkBridge, OpldRpcError } from "../../plugins/core/opl-framework-bridge/src/index.mjs";
import { startFakeOpld } from "./fixtures/fake-opld.mjs";

test("Connect approval dispatches connect.approveRequest via callable and .approve() and strips extra/secret fields", async (t) => {
  const calls = [];
  const daemon = await startFakeOpld({
    onCall: async (method, params) => {
      calls.push({ method, params });
      return { ok: true, stateRefreshRequired: true, grants: [{ grant_id: "g-1" }] };
    }
  });
  const bridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await bridge.close(); await daemon.close(); });

  assert.deepEqual(await bridge.connectionAccessApproval({ requestId: "request-123" }), { ok: true, stateRefreshRequired: true });
  assert.deepEqual(await bridge.connectionAccessApproval.approve("request-456"), { ok: true, stateRefreshRequired: true });
  assert.deepEqual(calls, [
    { method: "connect.approveRequest", params: { request_id: "request-123" } },
    { method: "connect.approveRequest", params: { request_id: "request-456" } }
  ]);
});

test("Connect approval accepts only requestId and rejects malformed ids or extra keys before RPC", async () => {
  let called = 0;
  const spyClient = { on() {}, off() {}, close: async () => {}, async call() { called += 1; return {}; } };
  const bridge = new OplFrameworkBridge({ client: spyClient });

  for (const request of [null, undefined, {}, { requestId: "r1", confirmed: true }, { requestId: " " }, { requestId: "bad\nid" }, { requestId: "bad;id" }, { requestId: "" }]) {
    await assert.rejects(() => bridge.connectionAccessApproval(request), (err) => err?.code === "invalid_request");
  }
  await assert.rejects(() => bridge.connectionAccessApproval.approve("bad;id"), (err) => err?.code === "invalid_request");
  assert.equal(called, 0);
});

test("Connect approval maps non-trusted-host domain RPC errors cleanly and still rejects -32003 TRUSTED_HOST_REQUIRED", async (t) => {
  const daemon = await startFakeOpld({
    onCall: async (_method, params) => {
      if (params.request_id === "stale-req") {
        return { __rpcError: { code: -32000, message: "private details", data: { code: "authorization_failed", reason_code: "authorization_request_stale" } } };
      }
      return { __rpcError: { code: -32003, message: "Trusted host required", data: { code: "TRUSTED_HOST_REQUIRED" } } };
    }
  });
  const bridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await bridge.close(); await daemon.close(); });

  assert.deepEqual(await bridge.connectionAccessApproval({ requestId: "stale-req" }), {
    ok: false,
    errorCode: "authorization_request_stale"
  });
  await assert.rejects(
    () => bridge.connectionAccessApproval({ requestId: "untrusted-req" }),
    (err) => err instanceof OpldRpcError && err.rpcCode === -32003 && err.code === "TRUSTED_HOST_REQUIRED"
  );
});

test("Connect approval rejects secret-bearing daemon output with internal_contract_violation and wraps custom callbacks", async (t) => {
  const daemon = await startFakeOpld({
    onCall: async () => ({ ok: true, stateRefreshRequired: true, grants: [{ access_token: "must-not-escape" }] })
  });
  const bridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await bridge.close(); await daemon.close(); });

  assert.deepEqual(await bridge.connectionAccessApproval({ requestId: "request-123" }), {
    ok: false,
    errorCode: "internal_contract_violation"
  });

  const customSeen = [];
  const customBridge = new OplFrameworkBridge({
    connectionAccessApproval: async (req) => { customSeen.push(req); return { ok: true, stateRefreshRequired: true }; }
  });
  t.after(() => customBridge.close());
  assert.deepEqual(await customBridge.connectionAccessApproval.approve("req-custom"), { ok: true, stateRefreshRequired: true });
  assert.deepEqual(customSeen, [{ requestId: "req-custom" }]);
});
