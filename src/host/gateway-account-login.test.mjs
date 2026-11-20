import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createCodexApiKeyConfiguration, createGatewayAccountLogin } from "../../plugins/opl-framework-bridge/src/gateway-account-login.mjs";

function fakeSpawn(response, observed) {
  return (command, args, options) => {
    observed.command = command;
    observed.args = args;
    observed.options = options;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = () => undefined;
    child.stderr.setEncoding = () => undefined;
    child.kill = () => undefined;
    child.stdin = new EventEmitter();
    child.stdin.end = (input) => {
      observed.stdin = input;
      queueMicrotask(() => {
        if (response.stdinError) child.stdin.emit("error", response.stdinError);
        if (response.stdout) child.stdout.emit("data", response.stdout);
        if (response.stderr) child.stderr.emit("data", response.stderr);
        child.emit("close", response.exitCode ?? 0);
      });
    };
    return child;
  };
}

test("Gateway account login keeps credentials on stdin and returns only the typed result", async () => {
  const observed = {};
  const password = "gateway-secret-must-not-escape";
  const login = createGatewayAccountLogin({
    command: "/test/opl",
    cwd: "/workspace",
    spawnImpl: fakeSpawn({ stdout: JSON.stringify({ ok: true, account: "user@example.com" }) }, observed)
  });

  const result = await login({ email: " user@example.com ", password });

  assert.deepEqual(result, { ok: true, stateRefreshRequired: true });
  assert.equal(observed.command, "/test/opl");
  assert.deepEqual(observed.args, ["connect", "gateway", "login", "--credentials-stdin", "--json"]);
  assert.deepEqual(observed.options.stdio, ["pipe", "pipe", "pipe"]);
  assert.equal(observed.stdin, `${JSON.stringify({ email: "user@example.com", password })}\n`);
  assert.equal(observed.stdin.includes("device_label"), false);
  assert.equal(JSON.stringify({ result, args: observed.args }).includes(password), false);
  assert.equal("stdout" in result || "stderr" in result, false);
});

test("Gateway account login contains stdin EPIPE after a successful child exit", async () => {
  const observed = {};
  const stdinError = new Error("write EPIPE");
  stdinError.code = "EPIPE";
  const login = createGatewayAccountLogin({
    spawnImpl: fakeSpawn({
      stdinError,
      stdout: JSON.stringify({ ok: true, account: "user@example.com" })
    }, observed)
  });

  assert.deepEqual(await login({ email: "user@example.com", password: "secret" }), {
    ok: true,
    stateRefreshRequired: true
  });
});

test("Gateway account login rejects unexpected request fields before spawning", async () => {
  let spawned = false;
  const login = createGatewayAccountLogin({
    spawnImpl: () => {
      spawned = true;
      throw new Error("must not spawn");
    }
  });

  assert.deepEqual(
    await login({ email: "user@example.com", password: "secret", deviceLabel: "must-use-framework-default" }),
    { ok: false, errorCode: "invalid_request", stateRefreshRequired: false }
  );
  assert.equal(spawned, false);
});

test("Gateway account login rejects secret-bearing CLI output without returning it", async () => {
  const observed = {};
  const login = createGatewayAccountLogin({
    spawnImpl: fakeSpawn({ stdout: JSON.stringify({ ok: true, password: "echoed-secret" }) }, observed)
  });

  const result = await login({ email: "user@example.com", password: "input-secret" });
  assert.deepEqual(result, {
    ok: false,
    errorCode: "internal_contract_violation",
    stateRefreshRequired: false
  });
  assert.equal(JSON.stringify(result).includes("echoed-secret"), false);
});

test("Gateway account login rejects a secret value echoed under a non-secret field", async () => {
  const observed = {};
  const password = "echoed-under-message";
  const login = createGatewayAccountLogin({
    spawnImpl: fakeSpawn({ stdout: JSON.stringify({ ok: true, message: password }) }, observed)
  });

  assert.deepEqual(await login({ email: "user@example.com", password }), {
    ok: false,
    errorCode: "internal_contract_violation",
    stateRefreshRequired: false
  });
});

test("Gateway account login maps structured failures without returning stderr", async () => {
  const observed = {};
  const login = createGatewayAccountLogin({
    spawnImpl: fakeSpawn({
      exitCode: 1,
      stdout: JSON.stringify({ ok: false, error: { code: "credentials_stdin_invalid" } }),
      stderr: "private diagnostic"
    }, observed)
  });

  const result = await login({ email: "user@example.com", password: "input-secret" });
  assert.deepEqual(result, { ok: false, errorCode: "invalid_request", stateRefreshRequired: false });
  assert.equal(JSON.stringify(result).includes("private diagnostic"), false);
});

test("Codex API key configuration keeps the key on stdin and returns only typed status", async () => {
  const observed = {};
  const apiKey = "sk-test-must-not-escape";
  const configure = createCodexApiKeyConfiguration({
    command: "/test/opl",
    cwd: "/workspace",
    spawnImpl: fakeSpawn({ stdout: JSON.stringify({ configured: true, api_key_present: true }) }, observed)
  });

  const result = await configure({ apiKey });

  assert.deepEqual(result, { ok: true, stateRefreshRequired: true });
  assert.equal(observed.command, "/test/opl");
  assert.deepEqual(observed.args, ["system", "configure-codex", "--api-key-stdin", "--json"]);
  assert.equal(observed.stdin, `${apiKey}\n`);
  assert.equal(JSON.stringify({ result, args: observed.args }).includes(apiKey), false);
  assert.equal("stdout" in result || "stderr" in result, false);
});

test("Codex API key configuration rejects unexpected fields and secret-bearing output", async () => {
  let spawned = false;
  const rejectsUnexpected = createCodexApiKeyConfiguration({
    spawnImpl: () => {
      spawned = true;
      throw new Error("must not spawn");
    }
  });
  assert.deepEqual(await rejectsUnexpected({ apiKey: "secret", provider: "other" }), {
    ok: false,
    errorCode: "invalid_request",
    stateRefreshRequired: false
  });
  assert.equal(spawned, false);

  const observed = {};
  const apiKey = "echoed-api-key";
  const rejectsEcho = createCodexApiKeyConfiguration({
    spawnImpl: fakeSpawn({ stdout: JSON.stringify({ configured: true, message: apiKey }) }, observed)
  });
  assert.deepEqual(await rejectsEcho({ apiKey }), {
    ok: false,
    errorCode: "internal_contract_violation",
    stateRefreshRequired: false
  });
});

// Every reason_code the OPL Framework gateway surface can emit. Sourced from
// one-person-lab src/adapters/integration/opl-gateway-account*.ts plus the
// connect CLI credentials-stdin guard.
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

test("Gateway account login maps every framework reason code to a specific error", async () => {
  for (const reason of FRAMEWORK_GATEWAY_REASON_CODES) {
    const login = createGatewayAccountLogin({
      spawnImpl: fakeSpawn({
        exitCode: 4,
        stdout: "",
        stderr: `${JSON.stringify({
          version: "g2",
          error: {
            code: "launcher_failed",
            message: "OPL Gateway rejected the request.",
            exit_code: 4,
            details: { reason_code: reason, http_status: 409 }
          }
        }, null, 2)}\n`
      }, {})
    });

    const result = await login({ email: "user@example.com", password: "input-secret" });
    assert.equal(result.ok, false);
    assert.equal(result.stateRefreshRequired, false);
    assert.notEqual(
      result.errorCode,
      "gateway_account_failed",
      `reason code ${reason} collapsed into the non-actionable generic bucket`
    );
  }
});

test("Gateway account login no longer mislabels a bare 401 status as bad credentials", async () => {
  const login = createGatewayAccountLogin({
    spawnImpl: fakeSpawn({
      exitCode: 4,
      stdout: "",
      stderr: "OPL Gateway rejected the request. http_status=401"
    }, {})
  });

  const result = await login({ email: "user@example.com", password: "input-secret" });
  assert.equal(result.ok, false);
  assert.notEqual(result.errorCode, "invalid_credentials");
});

test("Gateway account login accepts a password that is also part of the submitted email", async () => {
  // Qualification accounts are often provisioned as <token>@<domain> with the
  // same <token> as the password. The CLI echoes the signed-in email inside the
  // account projection, which used to be read as the password leaking and turned
  // a successful sign-in into a failure.
  const password = "operator-token";
  const email = "operator-token@example.com";
  const login = createGatewayAccountLogin({
    spawnImpl: fakeSpawn({
      stdout: JSON.stringify({ gateway_account: { status: "connected", account: { email } } })
    }, {})
  });

  assert.deepEqual(await login({ email, password }), { ok: true, stateRefreshRequired: true });
});

test("Gateway account login still rejects a CLI that echoes the password itself", async () => {
  const password = "operator-token";
  const email = "operator-token@example.com";
  const login = createGatewayAccountLogin({
    spawnImpl: fakeSpawn({
      stdout: JSON.stringify({
        gateway_account: { status: "connected", account: { email } },
        echo: { password }
      })
    }, {})
  });

  assert.deepEqual(await login({ email, password }), {
    ok: false,
    errorCode: "internal_contract_violation",
    stateRefreshRequired: false
  });
});
