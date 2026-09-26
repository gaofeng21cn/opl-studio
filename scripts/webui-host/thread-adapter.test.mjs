import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  CodexThreadAdapter,
  ThreadAdapterError,
  projectCodexThread
} from "./thread-adapter.mjs";

function thread(id, overrides = {}) {
  return {
    id,
    status: { type: "idle" },
    cwd: "/workspace/current",
    preview: `Preview ${id}`,
    createdAt: 1,
    updatedAt: 2,
    turns: [],
    ...overrides
  };
}

class FakeTransport extends EventEmitter {
  initialized = true;
  cwd = "/workspace/current";
  calls = [];

  async listThreads(params) {
    assert.deepEqual(params.modelProviders, []);
    this.calls.push(["thread/list", params]);
    if (params.cursor === "page-2") {
      return {
        data: [thread("subagent", {
          parentThreadId: "parent",
          agentRole: "reviewer",
          agentNickname: "Scout",
          threadSource: { type: "subAgentReview" }
        })],
        nextCursor: null
      };
    }
    return { data: [thread("parent")], nextCursor: "page-2" };
  }

  async readThread(threadId, includeTurns) {
    this.calls.push(["thread/read", { threadId, includeTurns }]);
    return {
      thread: thread(threadId, {
        turns: [{
          id: "turn-1",
          status: "completed",
          items: [
            { id: "call-1", type: "collabAgentToolCall", agentRole: "reviewer" },
            { id: "activity-1", type: "subAgentActivity", agentNickname: "Scout" }
          ]
        }]
      })
    };
  }

  async resumeThread(threadId) {
    this.calls.push(["thread/resume", { threadId }]);
    return { thread: thread(threadId) };
  }

  async forkThread(threadId, lastTurnId) {
    this.calls.push(["thread/fork", { threadId, lastTurnId }]);
    return { thread: thread("forked", { forkedFromId: threadId }) };
  }

  async archiveThread(threadId) {
    this.calls.push(["thread/archive", { threadId }]);
    return { threadId, archived: true };
  }

  async unarchiveThread(threadId) {
    this.calls.push(["thread/unarchive", { threadId }]);
    return { threadId, archived: false };
  }

  async deleteThread(threadId) {
    this.calls.push(["thread/delete", { threadId }]);
    return { threadId, deleted: true };
  }
}

test("projects canonical thread and Codex subagent metadata without private authority", () => {
  const projected = projectCodexThread(thread("subagent", {
    parentThreadId: "parent",
    agentRole: "reviewer",
    agentNickname: "Scout",
    source: { kind: "subAgentReview" },
    extra: { canonical_project_id: "/workspace/canonical", is_temporary_workspace: true },
    status: { type: "active", activeFlags: ["waiting"] },
    turns: [{ id: "turn-active", status: "inProgress", items: [] }]
  }), { currentWorkspace: "/workspace/current" });

  assert.equal(projected.parentThreadId, "parent");
  assert.equal(projected.agentRole, "reviewer");
  assert.equal(projected.agentNickname, "Scout");
  assert.equal(projected.sourceKind, "subAgentReview");
  assert.equal(projected.state, "running");
  assert.equal(projected.activeTurnId, "turn-active");
  assert.equal(projected.currentWorkspace, true);
  assert.equal(projected.canonicalProjectId, "/workspace/canonical");
  assert.equal(projected.isTemporaryWorkspace, true);
});

test("adapter paginates standard thread/list and exposes only Codex-owned lifecycle", async () => {
  const transport = new FakeTransport();
  const adapter = new CodexThreadAdapter(transport);
  const result = await adapter.listThreads({ projectKey: null, limit: 100 });

  assert.deepEqual(result.data.map((item) => item.id), ["parent", "subagent"]);
  assert.equal(transport.calls.filter(([method]) => method === "thread/list").length, 2);
  assert.equal(transport.calls.every(([, params]) => !("useStateDbOnly" in params)), true);
  assert.equal(transport.calls.every(([, params]) => params.sortKey === "updated_at" && params.sortDirection === "desc"), true);
  const capabilities = adapter.capabilities();
  assert.equal(capabilities.threadStoreOwner, "codex_core_app_server");
  assert.equal(capabilities.privateCoordinationLayer, false);
  assert.deepEqual(capabilities.subagentProjection.itemTypes, ["collabAgentToolCall", "subAgentActivity"]);
  assert.equal(capabilities.supportedProtocols.includes("thread/delete"), true);
  assert.equal(capabilities.supportedProtocols.includes("thread/archive"), true);
  assert.equal(capabilities.supportedProtocols.some((item) => item.includes("coordination")), false);
});

test("adapter sends only a scalar cwd to App Server and filters workspace arrays locally", async () => {
  const arrayTransport = new FakeTransport();
  const arrayAdapter = new CodexThreadAdapter(arrayTransport);
  const arrayResult = await arrayAdapter.listThreads({ workspace: ["/workspace/current", "/workspace/other"] });

  assert.deepEqual(arrayResult.data.map((item) => item.id), ["parent", "subagent"]);
  assert.equal(arrayTransport.calls.every(([, params]) => params.cwd === undefined), true);

  const scalarTransport = new FakeTransport();
  const scalarAdapter = new CodexThreadAdapter(scalarTransport);
  await scalarAdapter.listThreads({ workspace: "/workspace/current" });
  assert.equal(scalarTransport.calls.every(([, params]) => params.cwd === "/workspace/current"), true);
});

test("adapter preserves native subagent items and routes standard lifecycle", async () => {
  const transport = new FakeTransport();
  const adapter = new CodexThreadAdapter(transport);
  const read = await adapter.readThread({ threadId: "subagent", includeTurns: true });
  assert.deepEqual(read.turns[0].items.map((item) => item.type), ["collabAgentToolCall", "subAgentActivity"]);

  const resumed = await adapter.resumeThread({ threadId: "subagent" });
  assert.equal(resumed.id, "subagent");
  const forked = await adapter.forkThread({ threadId: "subagent", throughTurnId: "turn-1" });
  assert.equal(forked.parentThreadId, "subagent");

  await assert.rejects(
    adapter.setArchived({ threadId: "subagent", archived: true }),
    (error) => error instanceof ThreadAdapterError && error.code === "confirmation_required"
  );
  assert.deepEqual(
    await adapter.setArchived({ threadId: "subagent", archived: true, confirmed: true }),
    { threadId: "subagent", archived: true }
  );
  assert.deepEqual(
    await adapter.setArchived({ threadId: "subagent", archived: false }),
    { threadId: "subagent", archived: false }
  );
  await assert.rejects(
    adapter.deleteThread({ threadId: "subagent" }),
    (error) => error instanceof ThreadAdapterError && error.code === "confirmation_required"
  );
  assert.deepEqual(
    await adapter.deleteThread({ threadId: "subagent", confirmed: true }),
    { threadId: "subagent", deleted: true }
  );
});

test("adapter rejects a repeated thread/list cursor", async () => {
  const transport = new FakeTransport();
  transport.listThreads = async () => ({ data: [], nextCursor: "repeat" });
  const adapter = new CodexThreadAdapter(transport);
  await assert.rejects(
    adapter.listThreads(),
    (error) => error instanceof ThreadAdapterError && error.code === "invalid_app_server_response"
  );
});
