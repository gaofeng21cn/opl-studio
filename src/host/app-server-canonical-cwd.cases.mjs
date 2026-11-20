import assert from "node:assert/strict";
import test from "node:test";
import { CodexAppServerTransport } from "../../plugins/opl-codex-native/src/app-server-transport.mjs";

const HOST_CWD = "/srv/opl/host";
const THREAD_CWD = "/srv/opl/workspaces/alpha";
const OTHER_CWD = "/srv/opl/workspaces/beta";
const THREAD_ID = "thread-canonical";
const HOST = "studio-host";

function sendFixture(options = {}) {
  const transport = new CodexAppServerTransport({ cwd: options.hostCwd ?? HOST_CWD });
  const calls = { resume: [], read: [], startThread: [], startTurn: [] };
  const turns = [];
  let turnSequence = 0;
  transport.readThread = async (threadId, includeTurns) => {
    calls.read.push({ threadId, includeTurns });
    if (options.read) return options.read(threadId, includeTurns);
    return { thread: {
      id: threadId,
      cwd: options.threadCwd ?? THREAD_CWD,
      ...(includeTurns ? { turns: [...turns] } : {})
    } };
  };
  transport.resumeThread = async (...args) => {
    calls.resume.push(args);
    return options.resume
      ? options.resume(...args)
      : { thread: { id: THREAD_ID, cwd: options.threadCwd ?? THREAD_CWD } };
  };
  transport.startThread = async (params) => {
    calls.startThread.push(params);
    return { thread: { id: THREAD_ID, cwd: params?.cwd } };
  };
  transport.startTurn = async (threadId, prompt, inputs, overrides) => {
    const turnId = `turn-${++turnSequence}`;
    turns.push({ id: turnId, status: "completed" });
    calls.startTurn.push({ threadId, prompt, inputs, overrides });
    return { turn: { id: turnId } };
  };
  transport.waitForTurn = async (turnId) => ({
    finalMessage: "done",
    events: [],
    notification: { turn: { id: turnId, status: "completed" } }
  });
  return { transport, calls };
}

function channelFixture(options = {}) {
  const transport = new CodexAppServerTransport({ cwd: options.hostCwd ?? HOST_CWD, host: HOST });
  const calls = { read: [], resume: [], startThread: [], startTurn: [] };
  transport.readThread = async (threadId, includeTurns) => {
    calls.read.push({ threadId, includeTurns });
    if (options.read) return options.read(threadId, includeTurns);
    return { thread: { id: threadId, cwd: options.threadCwd ?? THREAD_CWD } };
  };
  transport.resumeThread = async (...args) => {
    calls.resume.push(args);
    return options.resume
      ? options.resume(...args)
      : { thread: { id: THREAD_ID, cwd: options.threadCwd ?? THREAD_CWD } };
  };
  transport.startThread = async (params) => {
    calls.startThread.push(params);
    return options.startThread
      ? options.startThread(params)
      : { thread: { id: THREAD_ID, cwd: params?.cwd ?? transport.cwd } };
  };
  transport.startTurn = async (...args) => {
    calls.startTurn.push(args);
    return { turn: { id: "turn-channel" } };
  };
  transport.channelBindingStore = {
    readBindings: () => [],
    assertKnownThread: async () => undefined,
    getOrCreate: async (_identity, create) => ({ thread: await create(), created: true })
  };
  return { transport, calls, adapter: transport.createChannelCallbackAdapter() };
}

const channelRef = () => ({ canonical_thread_host: HOST, canonical_thread_id: THREAD_ID });
const turnRequest = () => ({ ...channelRef(), text: "Channel follow-up" });

test("first send uses only the validated selected directory for the thread, turn and sandbox", async () => {
  // Given a new conversation and a selected directory.
  const { transport, calls } = sendFixture();
  // When the first message is sent.
  const result = await transport.sendMessage({ prompt: "First", cwd: THREAD_CWD, permissions: ":workspace" });
  // Then the selected directory is the thread, turn and sandbox root.
  assert.equal(calls.startThread[0].cwd, THREAD_CWD);
  assert.equal(calls.startTurn[0].overrides.cwd, THREAD_CWD);
  assert.deepEqual(calls.startTurn[0].overrides.sandboxPolicy.writableRoots, [THREAD_CWD]);
  assert.equal(result.cwd, THREAD_CWD);
});

test("first send rejects a relative selected directory before thread/start", async () => {
  // Given a new conversation with a non-absolute selection.
  const { transport, calls } = sendFixture();
  // When it is sent.
  const sending = transport.sendMessage({ prompt: "First", cwd: "relative/workspace" });
  // Then no thread or turn starts.
  await assert.rejects(sending, (error) => error.code === "invalid_request" && /absolute/.test(error.message));
  assert.equal(calls.startThread.length, 0);
  assert.equal(calls.startTurn.length, 0);
});

test("first send rejects a relative configured directory before thread/start", async () => {
  // Given a transport configured with a non-absolute fallback.
  const { transport, calls } = sendFixture({ hostCwd: "relative/host" });
  // When a new conversation is sent without a selection.
  const sending = transport.sendMessage({ prompt: "First" });
  // Then the configured directory is validated too.
  await assert.rejects(sending, (error) => error.code === "invalid_request" && /absolute/.test(error.message));
  assert.equal(calls.startThread.length, 0);
});

test("follow-up sends resume without a cwd override and route the canonical thread cwd", async () => {
  // Given an existing canonical thread whose resume confirms its workspace.
  const { transport, calls } = sendFixture();
  // When a follow-up omits cwd, as the App does.
  const result = await transport.sendMessage({ threadId: THREAD_ID, prompt: "Next", permissions: ":workspace" });
  // Then resume carries no workspace override and the turn stays on the thread cwd.
  assert.equal(calls.resume[0].length, 1);
  assert.equal(calls.startTurn[0].overrides.cwd, THREAD_CWD);
  assert.deepEqual(calls.startTurn[0].overrides.sandboxPolicy.writableRoots, [THREAD_CWD]);
  assert.equal(result.cwd, THREAD_CWD);
});

test("follow-up sends reject any caller cwd override before resume or turn", async () => {
  // Given an existing canonical thread and a caller-supplied workspace.
  const { transport, calls } = sendFixture();
  // When the follow-up tries to override the workspace.
  const sending = transport.sendMessage({ threadId: THREAD_ID, prompt: "Next", cwd: OTHER_CWD });
  // Then the canonical thread keeps ownership.
  await assert.rejects(sending, (error) => error.code === "invalid_request" && /canonical thread/.test(error.message));
  assert.equal(calls.resume.length, 0);
  assert.equal(calls.startTurn.length, 0);
});

test("follow-up reads a fresh thread when resume omits the canonical cwd", async () => {
  // Given a resume response without a cwd and a readable thread with one.
  const { transport, calls } = sendFixture({ resume: async () => ({ thread: { id: THREAD_ID } }) });
  // When the follow-up is sent.
  const result = await transport.sendMessage({ threadId: THREAD_ID, prompt: "Next" });
  // Then the canonical cwd comes from the fresh thread/read.
  assert.equal(calls.read.some((call) => call.threadId === THREAD_ID && call.includeTurns !== true), true);
  assert.equal(calls.startTurn[0].overrides.cwd, THREAD_CWD);
  assert.equal(result.cwd, THREAD_CWD);
});

for (const [name, resume] of [
  ["missing", async () => ({ thread: { id: THREAD_ID } })],
  ["empty", async () => ({ thread: { id: THREAD_ID, cwd: "" } })],
  ["relative", async () => ({ thread: { id: THREAD_ID, cwd: "workspaces/alpha" } })],
  ["contradictory", async () => ({ cwd: OTHER_CWD, thread: { id: THREAD_ID, cwd: THREAD_CWD } })]
]) {
  test(`follow-up rejects a ${name} canonical cwd without falling back to the host cwd`, async () => {
    // Given a thread whose resume cannot establish one canonical workspace.
    const { transport, calls } = sendFixture({ resume, read: async (threadId) => ({ thread: { id: threadId } }) });
    // When the follow-up is sent.
    const sending = transport.sendMessage({ threadId: THREAD_ID, prompt: "Next" });
    // Then it fails closed before turn/start and never uses the transport fallback.
    await assert.rejects(sending, (error) => error.code === "invalid_app_server_response");
    assert.equal(calls.startTurn.length, 0);
  });
}

test("follow-up rejects a resume response for a different thread id", async () => {
  // Given a resume that returns another canonical thread.
  const { transport, calls } = sendFixture({ resume: async () => ({ thread: { id: "thread-other", cwd: THREAD_CWD } }) });
  // When the follow-up is sent.
  const sending = transport.sendMessage({ threadId: THREAD_ID, prompt: "Next" });
  // Then the identity mismatch fails before turn/start.
  await assert.rejects(sending, (error) => error.code === "invalid_app_server_response" && /different canonical thread/.test(error.message));
  assert.equal(calls.startTurn.length, 0);
});

test("channel turn uses the canonical readback cwd and sandbox root", async () => {
  // Given a channel callback for an existing thread.
  const { adapter, calls } = channelFixture();
  // When it starts a turn.
  await adapter.startTurn(turnRequest());
  // Then the turn workspace comes from the canonical thread, not the transport.
  assert.equal(calls.startTurn[0][3].cwd, THREAD_CWD);
  assert.notEqual(calls.startTurn[0][3].cwd, HOST_CWD);
  assert.equal(calls.startTurn[0][3].sandboxPolicy.type, "dangerFullAccess");
});

test("channel turn rejects a missing canonical cwd before turn/start", async () => {
  // Given a channel thread whose readback has no workspace.
  const { adapter, calls } = channelFixture({ read: async (threadId) => ({ thread: { id: threadId } }) });
  // When the channel starts a turn.
  const starting = adapter.startTurn(turnRequest());
  // Then it fails closed instead of using the transport cwd.
  await assert.rejects(starting, (error) => error.code === "invalid_app_server_response" && /canonical cwd/.test(error.message));
  assert.equal(calls.startTurn.length, 0);
});

test("channel resume sends no cwd override and accepts the resumed canonical cwd", async () => {
  // Given an existing channel binding.
  const { adapter, calls } = channelFixture();
  // When the channel resumes it.
  await adapter.resumeThread(channelRef());
  // Then resume carries no workspace override and no second turn is opened.
  assert.equal(calls.resume[0].length, 1);
  assert.equal(calls.startTurn.length, 0);
});

test("channel resume rejects contradictory readback and resume cwds", async () => {
  // Given a readback workspace that disagrees with the resume response.
  const { adapter } = channelFixture({ resume: async () => ({ thread: { id: THREAD_ID, cwd: OTHER_CWD } }) });
  // When the channel resumes the thread.
  const resuming = adapter.resumeThread(channelRef());
  // Then the contradiction fails closed.
  await assert.rejects(resuming, (error) => error.code === "invalid_app_server_response" && /contradictory/.test(error.message));
});

test("channel resume rejects a missing canonical cwd", async () => {
  // Given every channel read lacks a workspace.
  const { adapter, calls } = channelFixture({
    read: async (threadId) => ({ thread: { id: threadId } }),
    resume: async () => ({ thread: { id: THREAD_ID } })
  });
  // When the channel resumes the thread.
  const resuming = adapter.resumeThread(channelRef());
  // Then it fails closed before any turn.
  await assert.rejects(resuming, (error) => error.code === "invalid_app_server_response" && /canonical cwd/.test(error.message));
  assert.equal(calls.startTurn.length, 0);
});
