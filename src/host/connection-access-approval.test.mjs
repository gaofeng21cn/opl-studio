import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createConnectionAccessApproval } from "./connection-access-approval.mjs";

function fakeSpawn(response, observed) {
  return (command, args, options) => {
    Object.assign(observed, { command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = () => undefined;
    child.stderr.setEncoding = () => undefined;
    child.kill = () => undefined;
    queueMicrotask(() => {
      if (response.stdout) child.stdout.emit("data", response.stdout);
      if (response.stderr) child.stderr.emit("data", response.stderr);
      child.emit("close", response.exitCode ?? 0);
    });
    return child;
  };
}

test("Connect approval calls the dedicated Framework command and returns no projection", async () => {
  const observed = {};
  const approve = createConnectionAccessApproval({
    command: "/test/opl",
    cwd: "/workspace",
    env: { PATH: "/bin" },
    spawnImpl: fakeSpawn({ stdout: JSON.stringify({ connection_authorization: { grants: [] } }) }, observed)
  });

  assert.deepEqual(await approve({ requestId: "request-123" }), { ok: true, stateRefreshRequired: true });
  assert.equal(observed.command, "/test/opl");
  assert.deepEqual(observed.args, [
    "connect", "authorization", "approve", "--request-id", "request-123", "--json"
  ]);
  assert.deepEqual(observed.options.stdio, ["ignore", "pipe", "pipe"]);
});

test("Connect approval accepts only requestId and rejects malformed ids before spawning", async () => {
  let spawned = false;
  const approve = createConnectionAccessApproval({
    spawnImpl: () => { spawned = true; throw new Error("must not spawn"); }
  });

  for (const request of [null, {}, { requestId: "r1", confirmed: true }, { requestId: " " }, { requestId: "bad\nid" }]) {
    assert.deepEqual(await approve(request), { ok: false, errorCode: "invalid_request" });
  }
  assert.equal(spawned, false);
});

test("Connect approval returns only a normalized owner error code", async () => {
  const approve = createConnectionAccessApproval({
    spawnImpl: fakeSpawn({
      exitCode: 1,
      stdout: JSON.stringify({ error: { code: "authorization_failed", message: "private details", details: { reason_code: "authorization_request_stale" } } }),
      stderr: "private diagnostic"
    }, {})
  });

  assert.deepEqual(await approve({ requestId: "request-123" }), {
    ok: false,
    errorCode: "authorization_request_stale"
  });
});

test("Connect approval rejects malformed or secret-bearing successful output", async () => {
  for (const stdout of [
    "not json",
    JSON.stringify({ ok: true }),
    JSON.stringify({ connection_authorization: { access_token: "must-not-escape" } })
  ]) {
    const approve = createConnectionAccessApproval({ spawnImpl: fakeSpawn({ stdout }, {}) });
    assert.deepEqual(await approve({ requestId: "request-123" }), {
      ok: false,
      errorCode: "internal_contract_violation"
    });
  }
});
