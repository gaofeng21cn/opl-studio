import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { OplFrameworkBridge } from "../../plugins/core/opl-framework-bridge/src/index.mjs";
import { startFakeOpld } from "./fixtures/fake-opld.mjs";

const FRAMEWORK_GATEWAY_REASON_CODES = [
  "invalid_credentials",
  "account_disabled",
  "mfa_or_challenge_required",
  "session_not_persistable",
  "group_selection_required",
  "auth_expired",
  "reauth_required",
  "rate_limited",
  "network_timeout",
  "network_unreachable",
  "gateway_unavailable",
  "managed_key_missing",
  "managed_key_conflict",
  "managed_key_identity_drift",
  "disconnect_pending",
  "account_switch_requires_disconnect",
  "gateway_account_busy",
  "gateway_codex_binding_failed",
  "gateway_control_url_invalid",
  "gateway_profile_invalid",
  "gateway_request_rejected",
  "gateway_request_failed",
  "gateway_response_invalid",
  "gateway_response_too_large",
  "gateway_conflict",
  "gateway_group_required",
  "gateway_account_dry_run_unsupported",
  "gateway_account_payload_forbidden",
  "gateway_store_json_invalid",
  "gateway_store_owner_invalid",
  "gateway_store_permissions_invalid",
  "gateway_store_symlink_forbidden",
  "gateway_store_type_invalid",
  "credentials_stdin_invalid",
  "credentials_stdin_too_large"
];

function signedInGateway(email, status = "connected") {
  return { gateway_account: { surface_kind: "opl_gateway_account_read_model.v1", connection_mode: "account", status, account: { email, status: "active" } } };
}

test("Gateway account login sends credentials over 0600 RPC socket and returns only typed status", async (t) => {
  const calls = [];
  const password = "gateway-secret-must-not-escape";
  const daemon = await startFakeOpld({
    onCall: async (method, params) => {
      calls.push({ method, params });
      return signedInGateway(params.email, "setup_required");
    }
  });
  const bridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await bridge.close(); await daemon.close(); });

  if (process.platform !== "win32") {
    assert.equal(fs.statSync(daemon.socketPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(daemon.sessionFile).mode & 0o777, 0o600);
  }

  const result = await bridge.gatewayAccountLogin({ email: " user@example.com ", password });
  assert.deepEqual(result, { ok: true, stateRefreshRequired: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "connect.gateway.login");
  assert.deepEqual(calls[0].params, {
    email: "user@example.com",
    password
  });
  assert.equal(JSON.stringify(result).includes(password), false);
  assert.equal("stdout" in result || "stderr" in result, false);
});

test("Gateway login requires the authenticated account projection", async () => {
  const genericConnection = { connection_id: "ref", provider_type: "opl_gateway", status: "active" };
  const bridge = new OplFrameworkBridge({ client: { on() {}, close() {}, async call() { return genericConnection; } } });
  assert.deepEqual(await bridge.gatewayAccountLogin({ email: "user@example.com", password: "sample" }), {
    ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false
  });
});

test("Gateway account login and Codex API key reject unexpected request fields or oversized payloads before RPC", async () => {
  let called = 0;
  const spyClient = { on() {}, off() {}, close: async () => {}, async call() { called += 1; return {}; } };
  const bridge = new OplFrameworkBridge({ client: spyClient });

  for (const badLogin of [
    null, undefined, {}, { email: "  ", password: "x" }, { email: "a@b.c", password: "  " },
    { email: "user@example.com", password: "secret", deviceLabel: "must-use-framework-default" }
  ]) {
    assert.deepEqual(await bridge.gatewayAccountLogin(badLogin), {
      ok: false, errorCode: "invalid_request", stateRefreshRequired: false
    });
  }
  for (const badKey of [
    null, undefined, {}, { apiKey: "" }, { apiKey: " \n\t " },
    { apiKey: "secret", provider: "other" },
    { apiKey: "x".repeat(65_537) }
  ]) {
    assert.deepEqual(await bridge.codexApiKeyConfiguration(badKey), {
      ok: false, errorCode: "invalid_request", stateRefreshRequired: false
    });
  }
  assert.equal(called, 0);
});

test("Gateway account login and Codex API key reject secret-echoing RPC responses without leaking secrets", async (t) => {
  const password = "echoed-under-message";
  const apiKey = "sk-echoed-secret-key";
  let mode = "field";
  const daemon = await startFakeOpld({
    onCall: async () => {
      if (mode === "field") return { ok: true, password: "echoed-secret" };
      if (mode === "message") return { ok: true, message: password };
      return { configured: true, message: apiKey };
    }
  });
  const bridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await bridge.close(); await daemon.close(); });

  const r1 = await bridge.gatewayAccountLogin({ email: "user@example.com", password: "input-secret" });
  assert.deepEqual(r1, { ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false });
  assert.equal(JSON.stringify(r1).includes("echoed-secret"), false);

  mode = "message";
  assert.deepEqual(await bridge.gatewayAccountLogin({ email: "user@example.com", password }), {
    ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false
  });

  mode = "apikey";
  const r3 = await bridge.codexApiKeyConfiguration({ apiKey });
  assert.deepEqual(r3, { ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false });
  assert.equal(JSON.stringify(r3).includes(apiKey), false);
});

test("Codex API key configuration requires the dedicated Codex configuration receipt", async (t) => {
  const calls = [];
  const apiKey = "sk-test-must-not-escape";
  const daemon = await startFakeOpld({
    onCall: async (method, params) => { calls.push({ method, params }); return calls.length === 1 ? { ok: true } : { connection_id: "conn-codex" }; }
  });
  const bridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await bridge.close(); await daemon.close(); });

  const result = await bridge.codexApiKeyConfiguration({ apiKey: ` ${apiKey} ` });
  assert.deepEqual(result, { ok: true, stateRefreshRequired: true });
  assert.deepEqual(calls, [{
    method: "connect.configureCodexApiKey",
    params: { api_key: apiKey }
  }]);
  assert.equal(JSON.stringify(result).includes(apiKey), false);
  assert.deepEqual(await bridge.codexApiKeyConfiguration({ apiKey }), {
    ok: false, errorCode: "codex_configuration_failed", stateRefreshRequired: false
  });
});

test("Gateway account login maps every framework reason code and RPC/network code cleanly", async (t) => {
  let nextError = null;
  const daemon = await startFakeOpld({
    onCall: async () => ({ __rpcError: nextError })
  });
  const bridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await bridge.close(); await daemon.close(); });

  for (const reason of FRAMEWORK_GATEWAY_REASON_CODES) {
    nextError = { code: -32000, message: "Gateway rejected", data: { code: "launcher_failed", reason_code: reason } };
    const result = await bridge.gatewayAccountLogin({ email: "user@example.com", password: "input-secret" });
    assert.equal(result.ok, false);
    assert.equal(result.stateRefreshRequired, false);
    assert.notEqual(result.errorCode, "gateway_account_failed", `${reason} collapsed to generic bucket`);
  }

  for (const [rpcErrCode, expected] of [
    ["UNAUTHORIZED", "auth_expired"],
    ["INVALID_INPUT", "invalid_request"],
    ["TRUSTED_HOST_REQUIRED", "internal_contract_violation"],
    ["unknown_daemon_error", "gateway_account_failed"]
  ]) {
    nextError = { code: -32000, message: "raw stderr must not leak", data: { code: rpcErrCode } };
    const result = await bridge.gatewayAccountLogin({ email: "user@example.com", password: "input-secret" });
    assert.deepEqual(result, { ok: false, errorCode: expected, stateRefreshRequired: false });
    assert.equal(JSON.stringify(result).includes("raw stderr"), false);
  }
});

test("Gateway account login accepts a password that is a substring of the submitted email, while still catching password echoes", async (t) => {
  const password = "operator-token";
  const email = "operator-token@example.com";
  let echoPassword = false;
  const daemon = await startFakeOpld({
    onCall: async () => (echoPassword
      ? { ...signedInGateway(email), echo: { password } }
      : signedInGateway(email))
  });
  const bridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await bridge.close(); await daemon.close(); });

  assert.deepEqual(await bridge.gatewayAccountLogin({ email, password }), { ok: true, stateRefreshRequired: true });
  echoPassword = true;
  assert.deepEqual(await bridge.gatewayAccountLogin({ email, password }), {
    ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false
  });
});

test("Gateway account login and Codex API key map low-level network and daemon start errors to network_unreachable", async () => {
  for (const err of [
    Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    Object.assign(new Error("socket reset"), { code: "econnreset" }),
    Object.assign(new Error("broken pipe"), { code: "EPIPE" }),
    Object.assign(new Error("missing socket"), { code: "ENOENT" }),
    Object.assign(new Error("spawn failed"), { data: { code: "DAEMON_START_FAILED" } }),
    Object.assign(new Error("spawn timeout"), { data: { code: "daemon_start_timeout" } })
  ]) {
    const bridge = new OplFrameworkBridge({
      client: { on() {}, off() {}, close: async () => {}, async call() { throw err; } }
    });
    assert.deepEqual(await bridge.gatewayAccountLogin({ email: "a@b.c", password: "pw" }), {
      ok: false, errorCode: "network_unreachable", stateRefreshRequired: false
    });
    assert.deepEqual(await bridge.codexApiKeyConfiguration({ apiKey: "sk-1" }), {
      ok: false, errorCode: "network_unreachable", stateRefreshRequired: false
    });
  }
});

test("Gateway account login and Codex API key catch JSON-escaped secret echoes across leaf strings", async () => {
  const password = 'pass"word\\here';
  const apiKey = 'sk-"escaped"\\key';
  let response = { ok: true, message: `leaked: ${password}` };
  const bridge = new OplFrameworkBridge({
    client: { on() {}, off() {}, close: async () => {}, async call() { return response; } }
  });

  assert.deepEqual(await bridge.gatewayAccountLogin({ email: "a@b.c", password }), {
    ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false
  });
  response = { ok: true, detail: 'echo "pass"word"' };
  assert.deepEqual(await bridge.gatewayAccountLogin({ email: "a@b.c", password: 'pass"word' }), {
    ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false
  });
  response = { ok: true, nested: [{ detail: apiKey }] };
  assert.deepEqual(await bridge.codexApiKeyConfiguration({ apiKey }), {
    ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false
  });
  response = signedInGateway("operator-token@example.com");
  assert.deepEqual(await bridge.gatewayAccountLogin({ email: "operator-token@example.com", password: "operator-token" }), {
    ok: true, stateRefreshRequired: true
  });
  response = { ok: true, email: "operator-token@example.com", detail: "operator-token" };
  assert.deepEqual(await bridge.gatewayAccountLogin({ email: "operator-token@example.com", password: "operator-token" }), {
    ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false
  });
});
