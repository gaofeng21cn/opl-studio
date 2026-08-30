import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { CodexAppServerTransport } from "./app-server-transport.mjs";
import { createWebUiHost } from "./http-host.mjs";

const fixture = new URL("./fixtures/fake-app-server.mjs", import.meta.url).pathname;

async function post(baseUrl, route, value) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value)
  });
  return { status: response.status, body: await response.json() };
}

test("loopback HTTP host exposes standard thread lifecycle, subagent projection, SSE, and OPL passthrough", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-webui-http-test-"));
  await writeFile(path.join(directory, "index.html"), "<!doctype html><title>OPL</title>", "utf8");
  await writeFile(path.join(directory, "workspace-note.md"), "# Workspace note\n", "utf8");
  const appServerLog = path.join(directory, "app-server.jsonl");
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    cwd: directory,
    env: { ...process.env, FAKE_APP_SERVER_LOG: appServerLog, FAKE_APP_SERVER_PENDING_APPROVAL: "1", FAKE_WORKSPACE: directory },
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  const opl = {
    readState: async (profile) => ({ profile, app_state: { meta: { profile } }, readback: { exitCode: 0 } }),
    readInitialize: async () => ({ system_initialize: { setup_flow: { is_first_run: false, ready_to_launch: true } } }),
    readFullDrilldown: async () => ({ detail: "full", drilldown: {}, readback: { exitCode: 0 } }),
    readDomainDetailView: async (request) => ({
      schema_version: "opl_domain_detail_view.v1",
      surface_kind: "opl_domain_detail_view",
      item_id: request.itemId,
      view_id: request.viewId,
      view_kind: "research-roadmap",
      availability: "available",
      revision: 5,
      not_modified: false,
      payload: { revision: 5 },
      conditions: []
    }),
    readContribution: async (request) => ({ packageId: request.packageId, ref: request.ref, result: { hypotheses: ["fixture"] } }),
    executeAction: async (request) => ({
      actionId: request.actionId,
      authorityBoundary: "app_bridge_no_domain_authority",
      status: request.dryRun === false ? "executed" : "preview_ready"
    })
  };
  const nativeUpdateOperations = [];
  const host = await createWebUiHost({
    transport,
    opl,
    nativeUpdater: {
      perform: async (operation) => {
        nativeUpdateOperations.push(operation);
        return {
          schema: "opl_native_app_updater.v1",
          owner: "one-person-lab-app_native_host",
          host: "native",
          carrierAdapter: "standalone_headless_webui",
          operation,
          supported: true,
          state: operation === "restart" ? "restart_scheduled" : "idle",
          restartRequired: operation === "apply",
          accepted: true
        };
      }
    },
    webRoot: directory
  });
  t.after(async () => {
    await host.close();
  });
  const baseUrl = host.url;

  const capabilities = await fetch(`${baseUrl}/api/capabilities`).then((response) => response.json());
  assert.equal(capabilities.localHost, true);
  assert.equal(capabilities.threadAdapter.available, true);
  assert.equal(capabilities.threadAdapter.threadStoreOwner, "codex_core_app_server");
  assert.equal(capabilities.threadAdapter.privateCoordinationLayer, false);
  assert.deepEqual(capabilities.oplPassthrough.channelCallback, {
    schema: "opl_channel_canonical_thread_callbacks.v1",
    status: "dormant",
    registered: false
  });
  assert.deepEqual(
    capabilities.threadAdapter.subagentProjection.itemTypes,
    ["collabAgentToolCall", "subAgentActivity"]
  );

  const inventory = await fetch(`${baseUrl}/api/host/plugins`).then((response) => response.json());
  assert.deepEqual(
    inventory.entries
      .filter((entry) => entry.moduleName.startsWith("./plugins/opl-"))
      .map((entry) => [entry.moduleName, entry.enabled, entry.fiberPhase]),
    [
      ["./plugins/opl-dsh-tool-mcp.mjs", true, "active"],
      ["./plugins/opl-codex-native.mjs", true, "active"],
      ["./plugins/opl-framework-bridge.mjs", true, "active"],
      ["./plugins/opl-host-core.mjs", true, "active"],
      ["./plugins/opl-web-routes.mjs", true, "active"]
    ]
  );
  const renderer = await fetch(`${baseUrl}/`).then((response) => response.text());
  assert.match(renderer, /<title>OPL<\/title>/);

  const eventAbort = new AbortController();
  const eventResponse = await fetch(`${baseUrl}/api/opl-events`, { signal: eventAbort.signal });
  const eventReader = eventResponse.body.getReader();
  const firstEvent = await eventReader.read();
  assert.match(new TextDecoder().decode(firstEvent.value), /host\/ready/);
  await eventReader.cancel();
  eventAbort.abort();

  const list = await post(baseUrl, "/api/threads/list", { projectKey: "project-a" });
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 5);
  assert.equal(list.body.data.find((thread) => thread.id === "thread-idle").sessionId, "session-thread-idle");
  const subagent = list.body.data.find((thread) => thread.id === "thread-subagent");
  assert.equal(subagent.parentThreadId, "thread-source");
  assert.equal(subagent.agentRole, "reviewer");
  assert.equal(subagent.agentNickname, "Scout");
  assert.equal(subagent.sourceKind, "subAgentReview");

  const read = await post(baseUrl, "/api/threads/read", { threadId: "thread-subagent", includeTurns: true });
  assert.equal(read.body.id, "thread-subagent");
  assert.deepEqual(
    read.body.turns[0].items.map((item) => item.type),
    ["collabAgentToolCall", "subAgentActivity"]
  );
  const workspaceListing = await post(baseUrl, "/api/threads/workspace/list", { threadId: "thread-idle" });
  assert.equal(workspaceListing.status, 200);
  assert.equal(workspaceListing.body.entries.some((entry) => entry.relativePath === "workspace-note.md"), true);
  const workspaceFile = await post(baseUrl, "/api/threads/workspace/read", { threadId: "thread-idle", relativePath: "workspace-note.md" });
  assert.equal(workspaceFile.status, 200);
  assert.equal(workspaceFile.body.content, "# Workspace note\n");
  const workspaceSearch = await post(baseUrl, "/api/threads/workspace/search", { threadId: "thread-idle", query: "workspace-note" });
  assert.deepEqual(workspaceSearch.body.entries.map((entry) => entry.relativePath), ["workspace-note.md"]);
  const traversal = await post(baseUrl, "/api/threads/workspace/read", { threadId: "thread-idle", relativePath: "../outside.txt" });
  assert.equal(traversal.status, 400);
  assert.equal(traversal.body.error.code, "invalid_workspace_path");
  const resumed = await post(baseUrl, "/api/threads/resume", { threadId: "thread-unloaded" });
  assert.equal(resumed.body.state, "idle");
  const forked = await post(baseUrl, "/api/threads/fork", { threadId: "thread-idle", throughTurnId: "turn-1" });
  assert.equal(forked.body.parentThreadId, "thread-idle");

  const archiveDenied = await post(baseUrl, "/api/threads/archive", { threadId: "thread-idle" });
  assert.equal(archiveDenied.status, 409);
  assert.equal(archiveDenied.body.error.details.confirmationRequired, true);
  const archived = await post(baseUrl, "/api/threads/archive", {
    threadId: "thread-idle",
    confirmed: true,
    confirmationId: "archive-confirmation"
  });
  assert.equal(archived.body.archived, true);
  const unarchived = await post(baseUrl, "/api/threads/unarchive", { threadId: "thread-idle" });
  assert.equal(unarchived.body.archived, false);

  const steered = await post(baseUrl, "/api/turns/steer", {
    threadId: "thread-running",
    expectedTurnId: "turn-running",
    prompt: "Keep the active turn on the accepted route."
  });
  assert.equal(steered.status, 200);
  assert.deepEqual(steered.body, {
    executor: "codex_app_server",
    transport: "stdio_json_rpc",
    threadId: "thread-running",
    expectedTurnId: "turn-running",
    turnId: "turn-running",
    accepted: true
  });

  const retiredEndpoint = await post(baseUrl, "/api/coordination/prepare", {});
  assert.equal(retiredEndpoint.status, 404);
  assert.equal(retiredEndpoint.body.error.code, "endpoint_not_found");

  const state = await fetch(`${baseUrl}/api/opl/state?profile=full`).then((response) => response.json());
  assert.equal(state.profile, "full");
  const initialize = await fetch(`${baseUrl}/api/opl/initialize`).then((response) => response.json());
  assert.equal(initialize.system_initialize.setup_flow.ready_to_launch, true);
  const domainDetail = await post(baseUrl, "/api/opl/view/read", {
    itemId: "project:one:study-one",
    viewId: "research-roadmap"
  });
  assert.equal(domainDetail.status, 200);
  assert.equal(domainDetail.body.payload.revision, 5);
  const contribution = await post(baseUrl, "/api/opl/contribution/read", { packageId: "mas", ref: "mas.research-roadmap.v1#current" });
  assert.deepEqual(contribution.body.result.hypotheses, ["fixture"]);
  const action = await post(baseUrl, "/api/opl/action", { actionId: "preview.test", dryRun: true });
  assert.equal(action.body.authorityBoundary, "app_bridge_no_domain_authority");

  const nativeUpdateStatus = await fetch(`${baseUrl}/api/native-app-update/status`).then((response) => response.json());
  assert.equal(nativeUpdateStatus.supported, true);
  assert.equal(nativeUpdateStatus.host, "native");
  assert.equal(nativeUpdateStatus.carrierAdapter, "standalone_headless_webui");
  for (const operation of ["check", "apply", "restart"]) {
    const updateResult = await post(baseUrl, `/api/native-app-update/${operation}`, {});
    assert.equal(updateResult.status, 200);
    assert.equal(updateResult.body.operation, operation);
    assert.equal(updateResult.body.supported, true);
  }
  assert.deepEqual(nativeUpdateOperations, ["status", "check", "apply", "restart"]);

  const models = await fetch(`${baseUrl}/api/codex/models`).then((response) => response.json());
  assert.equal(models.data[0].id, "gpt-test");

  const permissionProfiles = await fetch(`${baseUrl}/api/codex/permission-profiles`).then((response) => response.json());
  assert.deepEqual(permissionProfiles.data.map((profile) => profile.id), [":read-only", ":workspace", ":danger-full-access"]);

  const codexCapabilities = await fetch(`${baseUrl}/api/codex/capabilities?threadId=thread-idle`).then((response) => response.json());
  assert.equal(codexCapabilities.skills[0].name, "opl-test-skill");
  assert.equal(codexCapabilities.plugins[0].id, "test-plugin");
  assert.equal(codexCapabilities.apps[0].id, "test-app");
  assert.deepEqual(codexCapabilities.errors, []);

  const chat = await post(baseUrl, "/api/send-message", {
    prompt: "Return a fake host response.",
    permissions: ":danger-full-access",
    inputs: [
      { type: "localImage", path: "/tmp/test-image.png", detail: "auto" },
      { type: "mention", name: "notes", path: "/tmp/notes" },
      { type: "skill", name: "opl-test-skill", path: "/skills/opl-test-skill/SKILL.md" }
    ]
  });
  assert.equal(chat.status, 200);
  assert.equal(chat.body.executor, "codex_app_server");
  assert.equal(chat.body.finalMessage.startsWith("completed turn-created-"), true);
  assert.equal(chat.body.canonicalThread.id, chat.body.threadId);
  assert.equal(chat.body.canonicalThread.state, "idle");
  assert.equal(chat.body.canonicalThreadReadback.thread.id, chat.body.threadId);
  const pending = await fetch(`${baseUrl}/api/codex/pending-requests`).then((response) => response.json());
  assert.equal(pending.length, 1);
  assert.equal(pending[0].method, "item/commandExecution/requestApproval");
  const approval = await post(baseUrl, "/api/codex/respond-request", { id: pending[0].id, response: { result: { decision: "decline" } } });
  assert.deepEqual(approval.body, { id: "approval-1", accepted: true });
  const pendingAfterResponse = await fetch(`${baseUrl}/api/codex/pending-requests`).then((response) => response.json());
  assert.deepEqual(pendingAfterResponse, []);
  const canonicalTurn = chat.body.canonicalThread.turns.find((turn) => turn.id === chat.body.turnId);
  assert.equal(canonicalTurn.status, "completed");
  assert.equal(canonicalTurn.items.at(-1).type, "agentMessage");
  assert.equal(canonicalTurn.items.at(-1).text, chat.body.finalMessage);
  const frames = (await readFile(appServerLog, "utf8")).trim().split("\n").map(JSON.parse);
  const turnStart = frames.find((frame) => frame.method === "turn/start");
  const turnSteer = frames.find((frame) => frame.method === "turn/steer");
  assert.deepEqual(turnStart.params.input.map((input) => input.type), ["text", "localImage", "mention", "skill"]);
  assert.equal(turnStart.params.approvalPolicy, "never");
  assert.deepEqual(turnStart.params.sandboxPolicy, { type: "dangerFullAccess" });
  const threadStart = frames.find((frame) => frame.method === "thread/start");
  assert.equal(threadStart.params.approvalPolicy, "never");
  assert.equal(threadStart.params.sandbox, "danger-full-access");
  assert.equal(Object.hasOwn(threadStart.params, "sandboxPolicy"), false);
  assert.equal(turnSteer.params.expectedTurnId, "turn-running");
  assert.equal(turnSteer.params.input[0].text, "Keep the active turn on the accepted route.");
  const chatThreadStartIndex = frames.findLastIndex((frame) => (
    frame.direction === "client_to_server" && frame.method === "thread/start"
  ));
  const canonicalLaunchSequence = frames
    .slice(chatThreadStartIndex)
    .filter((frame, index) => (
      (index === 0 && frame.method === "thread/start")
      || (frame.method === "turn/start" && frame.params?.threadId === chat.body.threadId)
      || (
        frame.method === "turn/completed"
        && frame.params?.threadId === chat.body.threadId
        && frame.params?.turn?.id === chat.body.turnId
      )
      || (frame.method === "thread/read" && frame.params?.threadId === chat.body.threadId)
    ))
    .map((frame) => frame.method);
  assert.deepEqual(canonicalLaunchSequence, ["thread/start", "turn/start", "turn/completed", "thread/read"]);
  const canonicalRead = frames.slice(chatThreadStartIndex).find((frame) => frame.method === "thread/read");
  assert.equal(canonicalRead.direction, "client_to_server");
  assert.equal(canonicalRead.params.threadId, chat.body.threadId);
  assert.equal(canonicalRead.params.includeTurns, true);
});

test("Agent launch fails closed when canonical thread/read omits the completed turn", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-webui-canonical-readback-test-"));
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    cwd: directory,
    env: { ...process.env, FAKE_APP_SERVER_OMIT_COMPLETED_TURN_READBACK: "1" },
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  t.after(() => transport.stop());

  await assert.rejects(
    transport.sendMessage({ prompt: "Require canonical completion.", inputs: [] }),
    (error) => (
      error.code === "invalid_app_server_response"
      && error.message === "thread/read did not confirm the completed turn on the canonical thread"
    )
  );
});

test("loopback HTTP host exposes the dedicated Gateway secret route without generic action payloads", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-webui-gateway-test-"));
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    cwd: directory,
    env: process.env,
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  const calls = [];
  const host = await createWebUiHost({
    transport,
    opl: {
      readState: async () => ({}),
      readFullDrilldown: async () => ({}),
      readContribution: async () => ({}),
      executeAction: async () => { throw new Error("generic action must not receive Gateway credentials"); }
    },
    gatewayAccountLogin: async (request) => {
      calls.push(request);
      return { ok: true, stateRefreshRequired: true };
    },
    webRoot: directory
  });
  t.after(async () => {
    await host.close();
  });
  const result = await post(host.url, "/api/opl-runtime/gateway-account-login", {
    email: "user@example.com",
    password: "route-secret"
  });
  assert.deepEqual(result, { status: 200, body: { ok: true, stateRefreshRequired: true } });
  assert.deepEqual(calls, [{ email: "user@example.com", password: "route-secret" }]);
});

test("loopback HTTP host sends model credentials only through the dedicated stdin bridge", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-webui-codex-key-test-"));
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    cwd: directory,
    env: process.env,
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  const calls = [];
  const host = await createWebUiHost({
    transport,
    opl: {
      readState: async () => ({}),
      readFullDrilldown: async () => ({}),
      readContribution: async () => ({}),
      executeAction: async () => { throw new Error("generic action must not receive API keys"); }
    },
    codexApiKeyConfiguration: async (request) => {
      calls.push(request.apiKey);
      return { ok: true, stateRefreshRequired: true };
    },
    webRoot: directory
  });
  t.after(async () => {
    await host.close();
  });
  const result = await post(host.url, "/api/opl-runtime/configure-codex", {
    apiKey: "route-api-key"
  });
  assert.deepEqual(result, { status: 200, body: { ok: true, stateRefreshRequired: true } });
  assert.deepEqual(calls, ["route-api-key"]);
});

test("cloud-shaped HTTP host protects renderer, APIs, uploads, and SSE with the aionui-session ABI", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-webui-cloud-auth-"));
  await writeFile(path.join(directory, "index.html"), "<!doctype html><title>Cloud Studio</title>", "utf8");
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    cwd: directory,
    env: process.env,
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  const host = await createWebUiHost({
    transport,
    opl: {
      readState: async () => ({}),
      readInitialize: async () => ({}),
      readFullDrilldown: async () => ({}),
      readContribution: async () => ({}),
      readDomainDetailView: async () => ({}),
      executeAction: async () => ({})
    },
    webRoot: directory,
    env: {
      ...process.env,
      OPL_DATA_DIR: directory,
      OPL_WEBUI_DEPLOYMENT_MODE: "cloud",
      OPL_WEBUI_AUTH_MODE: "password",
      OPL_WEBUI_USERNAME: "opl",
      OPL_WEBUI_PASSWORD: "cloud-password",
      OPL_WEBUI_SESSION_SECRET: "0123456789abcdef0123456789abcdef"
    }
  });
  t.after(() => host.close());

  const anonymousRenderer = await fetch(`${host.url}/`, { redirect: "manual" });
  assert.equal(anonymousRenderer.status, 302);
  assert.equal(anonymousRenderer.headers.get("location"), "/login");
  assert.equal((await fetch(`${host.url}/api/capabilities`)).status, 401);
  assert.equal((await fetch(`${host.url}/api/opl-events`)).status, 401);
  assert.equal((await fetch(`${host.url}/healthz`)).status, 200);
  assert.equal((await fetch(`${host.url}/readyz`)).status, 200);

  const failedLogin = await fetch(`${host.url}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "opl", password: "wrong" })
  });
  assert.equal(failedLogin.status, 401);
  const login = await fetch(`${host.url}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "opl", password: "cloud-password" })
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(cookie, /^aionui-session=/);
  assert.equal((await fetch(`${host.url}/`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${host.url}/api/capabilities`, { headers: { cookie } })).status, 200);

  const noCsrf = await fetch(`${host.url}/api/inputs`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ kind: "files" })
  });
  assert.equal(noCsrf.status, 403);
  const mutationHeaders = { cookie, "x-csrf-token": loginBody.csrfToken };
  const createdResponse = await fetch(`${host.url}/api/inputs`, {
    method: "POST",
    headers: { ...mutationHeaders, "content-type": "application/json" },
    body: JSON.stringify({ kind: "files" })
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  const uploaded = await fetch(`${host.url}/api/inputs/${created.id}/files?path=note.txt`, {
    method: "PUT",
    headers: mutationHeaders,
    body: "cloud input"
  });
  assert.equal(uploaded.status, 201);
  const completed = await fetch(`${host.url}/api/inputs/${created.id}/complete`, {
    method: "POST",
    headers: { ...mutationHeaders, "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).inputs[0].cleanupToken, created.id);
  const logout = await fetch(`${host.url}/api/auth/logout`, { method: "POST", headers: mutationHeaders });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
});
