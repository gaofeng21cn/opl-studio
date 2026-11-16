import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CodexAppServerTransport } from "./app-server-transport.mjs";

const fixture = fileURLToPath(new URL("./fixtures/turn-inactivity-app-server.mjs", import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const settle = () => new Promise(resolve => setImmediate(resolve));
const delta = (turnId, text) => ({ method: "item/agentMessage/delta", params: { turnId, delta: text } });
const completed = turnId => ({ method: "turn/completed", params: { turnId, turn: { id: turnId, status: "completed" } } });
const serverRequest = (id, turnId, method = "item/commandExecution/requestApproval") => ({
  id, method, params: { turnId }
});
const outcome = promise => promise.then(
  value => ({ status: "resolved", value }),
  error => ({ status: "rejected", error })
);

function createTransport(t) {
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    requestTimeoutMs: 1_000,
    turnTimeoutMs: 1_000
  });
  t.after(() => transport.stop());
  return transport;
}

async function startTurn(transport, turnId, options = {}) {
  await transport.request("turn/start", { turnId, ...options });
}

test("continuous turn activity extends the inactivity window until completion", async (t) => {
  // Given a started turn with an explicit inactivity window.
  const transport = createTransport(t);
  await startTurn(transport, "turn-stream");
  const waiting = transport.waitForTurn("turn-stream", 90);

  // When deltas keep arriving inside that window but completion exceeds its original deadline.
  transport.notify("fixture/emit", { steps: [
    { delay: 50, frame: delta("turn-stream", "research ") },
    { delay: 100, frame: delta("turn-stream", "continues") },
    { delay: 150, frame: completed("turn-stream") }
  ] });

  // Then the complete streamed result resolves and the turn becomes idle.
  const result = await waiting;
  assert.equal(result.finalMessage, "research continues");
  assert.equal(transport.activeTurns.has("turn-stream"), false);
});

test("an outstanding human approval pauses inactivity rejection beyond the timeout", async (t) => {
  const transport = createTransport(t);
  await startTurn(transport, "turn-approval");
  const waiting = outcome(transport.waitForTurn("turn-approval", 80));
  const requestReceived = once(transport, "serverRequest");
  transport.notify("fixture/emit", { steps: [
    { delay: 20, frame: serverRequest("approval-stream", "turn-approval") }
  ] });
  const [request] = await requestReceived;

  const early = await Promise.race([waiting, delay(120).then(() => "pending")]);
  assert.equal(early, "pending", "human thinking time must not time out the turn");
  transport.notify("fixture/respond", {
    requestId: request.id,
    steps: [{ delay: 10, frame: completed("turn-approval") }]
  });
  transport.respondToServerRequest(request.id, { result: { decision: "accept" } });
  assert.equal((await waiting).status, "resolved");
});

test("turn server requests and their responses re-arm continuous inactivity", async (t) => {
  const transport = createTransport(t);
  await startTurn(transport, "turn-response");
  const waiting = outcome(transport.waitForTurn("turn-response", 100));
  const requestReceived = once(transport, "serverRequest");
  transport.notify("fixture/emit", { steps: [
    { delay: 60, frame: serverRequest("input-response", "turn-response", "item/tool/requestUserInput") }
  ] });
  const [request] = await requestReceived;
  await delay(60);

  const respondedAt = Date.now();
  transport.respondToServerRequest(request.id, { result: { answers: {} } });
  const result = await waiting;
  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "turn_timeout");
  assert.ok(Date.now() - respondedAt >= 80, "the response starts a fresh inactivity window");
});

test("a started silent turn rejects waiters, releases idle work, and does not interrupt the provider", async (t) => {
  const transport = createTransport(t);
  await startTurn(transport, "turn-silent");
  const waiters = [
    transport.waitForTurn("turn-silent", 60),
    transport.waitForTurn("turn-silent", 60)
  ];
  let idleRuns = 0;
  const idle = transport.scheduleWhenIdle(() => { idleRuns += 1; });

  const results = await Promise.allSettled(waiters);
  assert.deepEqual(results.map(result => result.status), ["rejected", "rejected"]);
  assert.ok(results.every(result => result.reason.code === "turn_timeout"));
  assert.equal(transport.activeTurns.has("turn-silent"), false);
  assert.equal(transport.isBusy(), false);
  await idle;
  assert.equal(idleRuns, 1);
  assert.deepEqual((await transport.request("fixture/state")).interruptions, []);
});

test("stop rejects pending RPCs and turn waiters, clears approvals, and ignores EOF activity", async (t) => {
  const transport = createTransport(t);
  await startTurn(transport, "turn-stop", { eofStarted: true });
  const waiting = outcome(transport.waitForTurn("turn-stop", 500));
  const pendingRpc = outcome(transport.request("fixture/hold", {}, 500));
  const requestReceived = once(transport, "serverRequest");
  transport.notify("fixture/emit", { steps: [
    { frame: serverRequest("approval-stop", "turn-stop") }
  ] });
  await requestReceived;
  let idleRuns = 0;
  const idle = transport.scheduleWhenIdle(() => { idleRuns += 1; });

  await transport.stop();
  const [turnResult, rpcResult] = await Promise.all([waiting, pendingRpc]);
  assert.equal(turnResult.error.code, "app_server_stopping");
  assert.equal(rpcResult.error.code, "app_server_stopping");
  assert.equal(transport.activeTurns.size, 0);
  assert.equal(transport.pending.size, 0);
  assert.equal(transport.listPendingServerRequests().length, 0);
  await settle();
  assert.equal(transport.isBusy(), false, "EOF must not resurrect a stopped turn");
  await idle;
  assert.equal(idleRuns, 1);
});

test("one turn timeout preserves unrelated turn activity and approvals", async (t) => {
  const transport = createTransport(t);
  await startTurn(transport, "turn-alpha");
  await startTurn(transport, "turn-beta");
  const alpha = outcome(transport.waitForTurn("turn-alpha", 60));
  const beta = outcome(transport.waitForTurn("turn-beta", 150));
  const requestReceived = once(transport, "serverRequest");
  transport.notify("fixture/emit", { steps: [
    { delay: 20, frame: serverRequest("approval-beta", "turn-beta") }
  ] });
  const [request] = await requestReceived;

  assert.equal((await alpha).error.code, "turn_timeout");
  assert.equal(transport.activeTurns.has("turn-alpha"), false);
  assert.equal(transport.activeTurns.has("turn-beta"), true);
  assert.deepEqual(transport.listPendingServerRequests().map(request => request.id), [request.id]);
  transport.notify("fixture/respond", {
    requestId: request.id,
    steps: [{ frame: completed("turn-beta") }]
  });
  transport.respondToServerRequest(request.id, { result: { decision: "accept" } });
  assert.equal((await beta).status, "resolved");
});

test("terminal completion clears an outstanding approval and releases idle work", async (t) => {
  const transport = createTransport(t);
  await startTurn(transport, "turn-terminal");
  const waiting = transport.waitForTurn("turn-terminal", 500);
  const requestReceived = once(transport, "serverRequest");
  transport.notify("fixture/emit", { steps: [
    { frame: serverRequest("approval-terminal", "turn-terminal") }
  ] });
  await requestReceived;
  let idleRuns = 0;
  const idle = transport.scheduleWhenIdle(() => { idleRuns += 1; });
  transport.notify("fixture/emit", { steps: [{ frame: completed("turn-terminal") }] });

  await waiting;
  assert.equal(transport.listPendingServerRequests().length, 0);
  await idle;
  assert.equal(idleRuns, 1);
});
