import { appendFileSync } from "node:fs";
import readline from "node:readline";

const workspace = process.env.FAKE_WORKSPACE ?? "/workspace/project-a";
const configuredProjectKey = process.env.FAKE_PROJECT_KEY ?? "project-a";
const projectKey = configuredProjectKey === "__projectless__" ? null : configuredProjectKey;
const logPath = process.env.FAKE_APP_SERVER_LOG;
const lifecyclePath = process.env.FAKE_APP_SERVER_LIFECYCLE_LOG;
const omitCompletedTurnReadback = process.env.FAKE_APP_SERVER_OMIT_COMPLETED_TURN_READBACK === "1";
const includeProjectlessThread = process.env.FAKE_APP_SERVER_INCLUDE_PROJECTLESS === "1";
const emitPendingApproval = process.env.FAKE_APP_SERVER_PENDING_APPROVAL === "1";
const threads = new Map([
  ["thread-source", thread("thread-source", { type: "idle" }, ["src/source.ts"])],
  ["thread-idle", thread("thread-idle", { type: "idle" }, ["src/idle.ts"])],
  ["thread-unloaded", thread("thread-unloaded", { type: "notLoaded" }, ["src/unloaded.ts"])],
  ["thread-running", thread("thread-running", { type: "active", activeFlags: [] }, ["src/running.ts"], [turn("turn-running", "inProgress")])],
  ["thread-subagent", thread("thread-subagent", { type: "idle" }, [], [turn("turn-subagent", "completed", [
    { id: "collab-call", type: "collabAgentToolCall", agentRole: "reviewer", text: "Review delegated" },
    { id: "subagent-activity", type: "subAgentActivity", agentNickname: "Scout", text: "Review completed" }
  ])], {
    parentThreadId: "thread-source",
    agentRole: "reviewer",
    agentNickname: "Scout",
    threadSource: { type: "subAgentReview" }
  })]
]);
if (includeProjectlessThread) {
  threads.set("thread-recent", thread("thread-recent", { type: "idle" }, [], [], { cwd: "", isTemporaryWorkspace: true, projectKey: null, updatedAt: 3 }));
}
let nextThread = 1;
let nextTurn = 1;
let lifecycleClosed = false;
const pendingApprovalTurns = new Map();

function lifecycle(event, detail = {}) {
  if (lifecyclePath) appendFileSync(lifecyclePath, `${JSON.stringify({ event, pid: process.pid, ...detail })}\n`);
}

function closeLifecycle(reason) {
  if (lifecycleClosed) return;
  lifecycleClosed = true;
  lifecycle("exit", { reason });
}

lifecycle("start");
process.once("exit", () => closeLifecycle("process_exit"));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    closeLifecycle(signal);
    process.exit(0);
  });
}

function turn(id, status, items = []) {
  return { id, items, itemsView: { type: "full" }, status, error: null, startedAt: 1, completedAt: null, durationMs: null };
}

function thread(id, status, writeSet = [], turns = [], overrides = {}) {
  return {
    id,
    sessionId: `session-${id}`,
    forkedFromId: null,
    parentThreadId: null,
    preview: `Preview ${id}`,
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1,
    updatedAt: 2,
    recencyAt: 2,
    status,
    path: null,
    cwd: workspace,
    cliVersion: "0.144.1",
    source: "appServer",
    threadSource: null,
    agentNickname: null,
    agentRole: "worker",
    gitInfo: null,
    name: `Thread ${id}`,
    turns,
    projectKey,
    hostId: "local",
    goal: `Goal ${id}`,
    writeSet,
    archived: false,
    ...overrides
  };
}

function send(frame) {
  log({ direction: "server_to_client", ...frame });
  process.stdout.write(`${JSON.stringify(frame)}\n`);
}

function log(frame) {
  if (logPath) appendFileSync(logPath, `${JSON.stringify(frame)}\n`);
}

function completeTurn(threadId, turnId, status = "completed") {
  const completedItem = {
    type: "agentMessage",
    id: `message-${turnId}`,
    text: `completed ${turnId}`
  };
  const target = threads.get(threadId);
  if (target) {
    target.status = { type: "idle" };
    target.turns = target.turns.map((item) => item.id === turnId
      ? { ...item, items: [...item.items, completedItem], status, completedAt: 2 }
      : item);
  }
  send({ method: "item/completed", params: { threadId, turnId, item: completedItem } });
  send({ method: "turn/completed", params: { threadId, turn: { ...turn(turnId, status), completedAt: 2 } } });
  send({ method: "thread/status/changed", params: { threadId, status: { type: "idle" } } });
}

async function handle(frame) {
  log({ direction: "client_to_server", ...frame });
  if (frame.id !== undefined && !frame.method) {
    const pending = pendingApprovalTurns.get(frame.id);
    if (pending) {
      pendingApprovalTurns.delete(frame.id);
      completeTurn(pending.threadId, pending.turnId);
    }
    return;
  }
  const { id, method, params = {} } = frame;
  if (id === undefined) return;
  if (method === "initialize") return send({ id, result: { userAgent: "fake-app-server/0.144.1" } });
  if (method === "thread/list") {
    const page = params.cursor === "page-2"
      ? [threads.get("thread-running"), threads.get("thread-subagent")]
      : [threads.get("thread-source"), threads.get("thread-idle"), threads.get("thread-unloaded"), ...(includeProjectlessThread ? [threads.get("thread-recent")] : [])];
    return send({ id, result: { data: page, nextCursor: params.cursor ? null : "page-2", backwardsCursor: null } });
  }
  if (method === "thread/read") {
    const target = threads.get(params.threadId);
    if (!target) return send({ id, error: { code: -32004, message: "thread not found" } });
    const turns = params.includeTurns
      ? target.turns.filter((turn) => !(omitCompletedTurnReadback && turn.status === "completed"))
      : [];
    return send({ id, result: { thread: { ...target, turns } } });
  }
  if (method === "thread/resume") {
    const target = threads.get(params.threadId);
    if (!target) return send({ id, error: { code: -32004, message: "thread not found" } });
    target.status = { type: "idle" };
    return send({ id, result: { thread: target, model: "gpt-test", modelProvider: "openai", cwd: workspace } });
  }
  if (method === "thread/start") {
    const threadId = `thread-created-${nextThread++}`;
    const target = thread(threadId, { type: "idle" });
    target.ephemeral = Boolean(params.ephemeral);
    threads.set(threadId, target);
    return send({ id, result: { thread: target, model: "gpt-test", modelProvider: "openai", cwd: workspace } });
  }
  if (method === "thread/fork") {
    const source = threads.get(params.threadId);
    if (!source) return send({ id, error: { code: -32004, message: "thread not found" } });
    const threadId = `thread-fork-${nextThread++}`;
    const forked = { ...source, id: threadId, sessionId: `session-${threadId}`, forkedFromId: source.id, status: { type: "idle" } };
    threads.set(threadId, forked);
    return send({ id, result: { thread: forked, model: "gpt-test", modelProvider: "openai", cwd: workspace } });
  }
  if (method === "thread/archive") {
    threads.get(params.threadId).archived = true;
    return send({ id, result: {} });
  }
  if (method === "thread/unarchive") {
    const target = threads.get(params.threadId);
    target.archived = false;
    return send({ id, result: { thread: target } });
  }
  if (method === "turn/start") {
    const turnId = `turn-created-${nextTurn++}`;
    const target = threads.get(params.threadId);
    target.status = { type: "active", activeFlags: [] };
    target.turns.push(turn(turnId, "inProgress"));
    send({ id, result: { turn: turn(turnId, "inProgress") } });
    if (emitPendingApproval) {
      pendingApprovalTurns.set("approval-1", { threadId: params.threadId, turnId });
      send({ id: "approval-1", method: "item/commandExecution/requestApproval", params: { itemId: `item-${turnId}`, threadId: params.threadId, turnId, command: "echo approval", reason: "fixture approval" } });
    } else {
      setTimeout(() => completeTurn(params.threadId, turnId), 10);
    }
    return;
  }
  if (method === "turn/steer") {
    send({ id, result: { turnId: params.expectedTurnId } });
    setTimeout(() => completeTurn(params.threadId, params.expectedTurnId), 10);
    return;
  }
  if (method === "model/list") {
    return send({ id, result: { data: [{ id: "gpt-test", model: "gpt-test", isDefault: true }], nextCursor: null } });
  }
  if (method === "permissionProfile/list") {
    return send({ id, result: { data: [
      { id: ":read-only", description: null, allowed: true },
      { id: ":workspace", description: null, allowed: true },
      { id: ":danger-full-access", description: null, allowed: true }
    ], nextCursor: null } });
  }
  if (method === "skills/list") {
    return send({ id, result: { data: [{ cwd: workspace, skills: [{ name: "opl-test-skill", path: "/skills/opl-test-skill/SKILL.md", description: "Test Skill", enabled: true, scope: "user" }] }] } });
  }
  if (method === "plugin/installed") {
    return send({ id, result: { marketplaces: [{ name: "test", plugins: [{ id: "test-plugin", name: "Test Plugin", description: "Test plugin", enabled: true, installed: true }] }] } });
  }
  if (method === "app/installed") {
    return send({ id, result: { apps: [{ id: "test-app", name: "Test App", description: "Test app", enabled: true, installed: true }] } });
  }
  send({ id, error: { code: -32601, message: `unsupported fake method ${method}` } });
}

const lines = readline.createInterface({ input: process.stdin });
lines.once("close", () => {
  closeLifecycle("stdin_closed");
  process.exit(0);
});
lines.on("line", (line) => {
  try {
    void handle(JSON.parse(line));
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
  }
});
