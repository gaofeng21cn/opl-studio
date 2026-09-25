import assert from "node:assert/strict";
import test from "node:test";
import { CodexAppServerTransport } from "./app-server-transport.mjs";

test("stdio preserves Unicode separators and split UTF-8 in large history responses", async () => {
  const preview = `${"历史🧪".repeat(12_000)}\u2028第二段\u2029第三段\n第四段`;
  const child = `
    const readline = require('node:readline');
    const preview = ${JSON.stringify(preview)};
    readline.createInterface({ input: process.stdin }).on('line', async line => {
      const request = JSON.parse(line);
      if (!request.id) return;
      if (request.method === 'initialize') {
        process.stdout.write(JSON.stringify({ id: request.id, result: {} }) + '\\n');
        return;
      }
      const frame = Buffer.from(JSON.stringify({ id: request.id,
        result: { data: [{ id: 'unicode-history', preview }], nextCursor: null }
      }) + '\\r\\n');
      const split = frame.indexOf(Buffer.from('🧪')) + 1;
      process.stdout.write(frame.subarray(0, split));
      await new Promise(resolve => setTimeout(resolve, 20));
      process.stdout.write(frame.subarray(split));
      process.stdout.write(JSON.stringify({ method: 'fixture/complete', params: {} }) + '\\n');
    });
  `;
  const transport = new CodexAppServerTransport({
    command: process.execPath, args: ["-e", child], requestTimeoutMs: 2_000
  });
  const errors = [];
  transport.on("protocolError", (error) => errors.push(error.code));
  try {
    const response = await transport.listThreads({ limit: 100 });
    assert.equal(response.data[0].preview, preview);
    assert.equal(response.nextCursor, null);
    assert.deepEqual(errors, []);
  } finally {
    await transport.stop();
  }
});

function transportFixture() {
  const transport = new CodexAppServerTransport();
  const calls = [];
  transport.request = async (method, params) => {
    calls.push({ method, params });
    if (["thread/read", "thread/resume", "thread/fork"].includes(method)) {
      return { model: "model", thread: { id: method === "thread/fork" ? "forked" : "source", historyMode: "paginated", turns: [] } };
    }
    if (method === "thread/turns/list") {
      return params.cursor ? { data: [{ id: "turn-2", items: [], itemsView: "notLoaded", status: "completed" }], nextCursor: null }
        : { data: [{ id: "turn-1", items: [], itemsView: "notLoaded", status: "completed" }], nextCursor: "turn-page-2" };
    }
    if (method === "thread/items/list") {
      return params.cursor ? { data: [{ turnId: params.turnId, item: { id: `${params.turnId}-assistant`, type: "agentMessage", text: "answer" } }], nextCursor: null }
        : { data: [{ turnId: params.turnId, item: { id: `${params.turnId}-user`, type: "userMessage", content: [{ type: "text", text: "question" }] } }], nextCursor: "item-page-2" };
    }
    assert.fail(method);
  };
  return { transport, calls };
}

test("paginated read, resume and fork hydrate chronological turns and complete items", async () => {
  for (const operation of ["read", "resume", "fork"]) {
    const { transport, calls } = transportFixture();
    const result = operation === "read" ? await transport.readThread("source", true)
      : operation === "resume" ? await transport.resumeThread("source") : await transport.forkThread("source", "turn-2");
    assert.equal(result.model, "model");
    assert.equal(result.thread.historyMode, "paginated");
    assert.deepEqual(result.thread.turns.map((turn) => turn.items.map((item) => item.id)), [["turn-1-user", "turn-1-assistant"], ["turn-2-user", "turn-2-assistant"]]);
    assert.ok(result.thread.turns.every((turn) => turn.itemsView === "full"));
    assert.ok(calls.slice(1).every(({ params }) => params.threadId === (operation === "fork" ? "forked" : "source") && params.sortDirection === "asc"));
    assert.equal(calls.some(({ params }) => "historyMode" in params), false);
  }
});

test("metadata reads, explicit excludeTurns and legacy responses avoid pagination", async () => {
  const { transport, calls } = transportFixture();
  await transport.readThread("source", false);
  await transport.resumeThread("source", { excludeTurns: true });
  assert.equal(calls.length, 2);
  const legacy = { thread: { id: "legacy", historyMode: "legacy", turns: [{ id: "old", items: [{ id: "persisted" }] }] } };
  transport.request = async () => legacy;
  assert.equal(await transport.readThread("legacy", true), legacy);
  const older = { thread: { id: "old", turns: [{ id: "before-history-mode" }] } };
  transport.request = async () => older;
  assert.equal(await transport.resumeThread("old"), older);
});

test("repeated cursors and mismatched items fail instead of exposing incomplete history", async () => {
  for (const invalid of ["cursor", "item", "data"]) {
    const { transport } = transportFixture();
    const original = transport.request;
    transport.request = async (method, params) => {
      if (invalid === "cursor" && method === "thread/turns/list") return { data: [], nextCursor: "same" };
      if (invalid === "data" && method === "thread/turns/list") return { data: null, nextCursor: null };
      if (invalid === "item" && method === "thread/items/list") return { data: [{ turnId: "different", item: { id: "wrong-turn" } }], nextCursor: null };
      return original(method, params);
    };
    await assert.rejects(transport.readThread("source", true), (error) => error.code === "invalid_app_server_response");
  }
});


test("history reads inspect metadata first and only request inline history for legacy threads", async () => {
  const { transport, calls } = transportFixture();
  await transport.readThread("source", true);
  assert.deepEqual(calls.filter(call => call.method === "thread/read"), [
    { method: "thread/read", params: { threadId: "source", includeTurns: false } }
  ]);
  const legacyCalls = [];
  const turns = [{ id: "old-turn", items: [{ id: "old-item" }] }];
  transport.request = async (method, params) => {
    legacyCalls.push({ method, params });
    return { thread: { id: "legacy", turns: params.includeTurns ? turns : [] } };
  };
  assert.deepEqual((await transport.readThread("legacy", true)).thread.turns, turns);
  assert.deepEqual(legacyCalls.map(call => call.params.includeTurns), [false, true]);
});

test("unmaterialized threads expose empty native history without hiding other RPC failures", async () => {
  for (const historyMode of ["legacy", "paginated"]) {
    const transport = new CodexAppServerTransport();
    const failure = Object.assign(new Error("native history unavailable"), { code: "app_server_rpc_error", details: { error: { code: -32600, message: "no rollout found for thread id fresh" } } });
    transport.request = async (method, params) => {
      if (method === "thread/read" && !params.includeTurns) return { thread: { id: "fresh", historyMode } };
      throw failure;
    };
    assert.deepEqual((await transport.readThread("fresh", true)).thread.turns, []);
    failure.details.error.message = "database read failed";
    await assert.rejects(transport.readThread("fresh", true), error => error === failure);
    failure.details.error.message = "no rollout found for thread id another";
    await assert.rejects(transport.readThread("fresh", true), error => error === failure);
  }
});

test("new Studio threads explicitly select resumable legacy history without changing existing threads", async () => {
  const transport = new CodexAppServerTransport();
  transport.request = async (method, params) => ({ method, params });
  assert.equal((await transport.startThread()).params.historyMode, "legacy");
  assert.equal((await transport.startThread({ historyMode: "paginated" })).params.historyMode, "paginated");
});
