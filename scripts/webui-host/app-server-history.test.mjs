import assert from "node:assert/strict";
import test from "node:test";
import { CodexAppServerTransport } from "./app-server-transport.mjs";

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
