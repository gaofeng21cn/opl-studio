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

for (const method of [
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request"
]) test(`an outstanding ${method} pauses inactivity rejection beyond the timeout`, async (t) => {
  const transport = createTransport(t);
  await startTurn(transport, "turn-approval");
  const waiting = outcome(transport.waitForTurn("turn-approval", 80));
  const requestReceived = once(transport, "serverRequest");
  transport.notify("fixture/emit", { steps: [
    { delay: 20, frame: serverRequest("approval-stream", "turn-approval", method) }
  ] });
  const [request] = await requestReceived;

  const early = await Promise.race([waiting, delay(120).then(() => "pending")]);
  assert.equal(early, "pending", "human thinking time must not time out the turn");
  assert.equal(transport.activeTurns.has("turn-approval"), true);
  assert.equal(transport.isBusy(), true);
  assert.deepEqual(transport.listPendingServerRequests().map(item => item.id), [request.id]);
  transport.notify("fixture/respond", {
    requestId: request.id,
    steps: [{ delay: 10, frame: completed("turn-approval") }]
  });
  transport.respondToServerRequest(request.id, { result: { decision: "accept" } });
  assert.equal((await waiting).status, "resolved");
});

test("all pending human requests must be answered before idle maintenance can run", async (t) => {
  const transport = createTransport(t);
  await startTurn(transport, "turn-many");
  const waiting = outcome(transport.waitForTurn("turn-many", 80));
  const received = [];
  transport.on("serverRequest", request => received.push(request));
  transport.notify("fixture/emit", { steps: [
    { frame: serverRequest("question-many", "turn-many", "item/tool/requestUserInput") },
    { frame: serverRequest("mcp-many", "turn-many", "mcpServer/elicitation/request") }
  ] });
  while (received.length < 2) await delay(5);
  let idleRuns = 0;
  const idle = transport.scheduleWhenIdle(() => { idleRuns += 1; });
  transport.respondToServerRequest("question-many", { result: { answers: {} } });
  assert.equal(await Promise.race([waiting, delay(120).then(() => "pending")]), "pending");
  assert.equal(idleRuns, 0);
  assert.deepEqual(transport.listPendingServerRequests().map(item => item.id), ["mcp-many"]);
  transport.notify("fixture/respond", {
    requestId: "mcp-many",
    steps: [{ frame: completed("turn-many") }]
  });
  transport.respondToServerRequest("mcp-many", { result: { action: "accept", content: {} } });
  assert.equal((await waiting).status, "resolved");
  await idle;
  assert.equal(idleRuns, 1);
});

test("an MCP elicitation without a turn ID pauses only its own thread", async (t) => {
  const transport = createTransport(t);
  await startTurn(transport, "turn-mcp", { threadId: "thread-mcp" });
  await startTurn(transport, "turn-unrelated", { threadId: "thread-unrelated" });
  const received = once(transport, "serverRequest");
  transport.notify("fixture/emit", { steps: [{ frame: {
    id: "mcp-standalone", method: "mcpServer/elicitation/request",
    params: { threadId: "thread-mcp", turnId: null }
  } }] });
  await received;
  const waiting = outcome(transport.waitForTurn("turn-mcp", 80));
  const unrelated = outcome(transport.waitForTurn("turn-unrelated", 80));
  assert.equal((await unrelated).error.code, "turn_timeout");
  assert.equal(await Promise.race([waiting, delay(40).then(() => "pending")]), "pending");
  // A canonical turn terminal event cannot dispose a standalone MCP request.
  transport.notify("fixture/emit", { steps: [{ frame: completed("turn-mcp") }] });
  assert.equal((await waiting).status, "resolved");
  assert.deepEqual(transport.listPendingServerRequests().map(item => item.id), ["mcp-standalone"]);
  assert.equal(transport.isBusy(), true);
  transport.respondToServerRequest("mcp-standalone", { result: { action: "decline" } });
  assert.equal(transport.isBusy(), false);
});

test("an explicitly nonblocking question does not suspend inactivity", async (t) => {
  const transport = createTransport(t);
  await startTurn(transport, "turn-advisory");
  const received = once(transport, "serverRequest");
  transport.notify("fixture/emit", { steps: [{ frame: {
    id: "advisory", method: "item/tool/requestUserInput",
    params: { turnId: "turn-advisory", isBlocking: false }
  } }] });
  await received;
  const result = await outcome(transport.waitForTurn("turn-advisory", 60));
  assert.equal(result.error.code, "turn_timeout");
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

test("turn completion emits a turn-scoped cleanup that leaves another turn's approval pending", async (t) => {
  const transport = createTransport(t);
  await startTurn(transport, "turn-done");
  await startTurn(transport, "turn-other");
  const received = [];
  transport.on("serverRequest", request => received.push(request));
  transport.notify("fixture/emit", { steps: [
    { frame: serverRequest("approval-done", "turn-done") },
    { frame: serverRequest("approval-other", "turn-other") }
  ] });
  while (received.length < 2) await delay(5);

  const cleared = once(transport, "serverRequestsCleared");
  transport.notify("fixture/emit", { steps: [{ frame: completed("turn-done") }] });

  const [completedDetail] = await cleared;
  assert.deepEqual(completedDetail, {
    reason: "turn_completed",
    count: 1,
    requestIds: ["approval-done"]
  });
  assert.deepEqual(
    transport.listPendingServerRequests().map(request => request.id),
    ["approval-other"],
    "another turn's approval survives the completed turn's cleanup"
  );
});

test("turn timeout emits a turn-scoped cleanup for only the timed-out turn's requests", async (t) => {
  const transport = createTransport(t);
  await startTurn(transport, "turn-expire");
  await startTurn(transport, "turn-live");
  const received = [];
  transport.on("serverRequest", request => received.push(request));
  transport.notify("fixture/emit", { steps: [
    { frame: serverRequest("tool-expire", "turn-expire", "item/tool/call") },
    { frame: serverRequest("approval-live", "turn-live") }
  ] });
  while (received.length < 2) await delay(5);

  const cleared = once(transport, "serverRequestsCleared");
  const expired = outcome(transport.waitForTurn("turn-expire", 60));

  assert.equal((await expired).error.code, "turn_timeout");
  const [timeoutDetail] = await cleared;
  assert.deepEqual(timeoutDetail, {
    reason: "turn_timeout",
    count: 1,
    requestIds: ["tool-expire"]
  });
  assert.deepEqual(
    transport.listPendingServerRequests().map(request => request.id),
    ["approval-live"],
    "another turn's approval survives the timed-out turn's cleanup"
  );
});
