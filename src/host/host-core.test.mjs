import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import os from "node:os";
import path from "node:path";
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import test, { after } from "node:test";
import { CodexAppServerTransport, threadPermissionOverrides, turnPermissionOverrides } from "../../plugins/core/opl-codex-native/src/app-server-transport.mjs";
import { ChannelBindingStore } from "@gaofeng21cn/opl-host-kit/channel-bindings";
import { startFakeOpld } from "./fixtures/fake-opld.mjs";
import { OplHostCore } from "../../plugins/core/opl-host-core/src/service.mjs";
import { createOplHostCore as createHostCore } from "./create-host.mjs";
import { OplCodexNative } from "../../plugins/core/opl-codex-native/src/service.mjs";
import { OplFrameworkBridge, resolveOplStatePaths } from "../../plugins/core/opl-framework-bridge/src/index.mjs";
import { OpldClient, resolveDaemonBinary } from "../../plugins/core/opl-framework-bridge/src/opld-client.mjs";
import { McpAppHost } from "../../plugins/core/opl-mcp-apps/src/service.mjs";

const fixture = new URL("./fixtures/fake-app-server.mjs", import.meta.url).pathname;
const dshHome = await mkdtemp(path.join(os.tmpdir(), "opl-host-test-dsh-"));
after(() => rm(dshHome, { recursive: true, force: true }));
const createOplHostCore = (options) => createHostCore({ ...options, dshHome });
// Production composition is owned by Cordis. Focused service tests construct
// the same providers explicitly without adding runtime sibling dependencies.
function createStandaloneHostCore(options = {}) {
  const codex = options.codex ?? new OplCodexNative(options);
  const framework = options.framework ?? new OplFrameworkBridge({ ...options, codex });
  const mcpApps = options.mcpApps ?? new McpAppHost(codex.transport);
  return new OplHostCore({ ...options, codex, framework, mcpApps });
}

test("Host Core requires the providers owned by its Cordis profile", () => {
  assert.throws(() => new OplHostCore(), /requires the Codex, Framework and MCP Apps services/);
});

test("a catalog refresh notifies the mounted workbench to read the new Framework state", { timeout: 5_000 }, async (t) => {
  const entries = [];
  const daemon = await startFakeOpld({ onCall(method) {
    assert.equal(method, "app.state.get");
    return { app_state: { agent_packages: { directory: { entries } } } };
  } });
  const core = createStandaloneHostCore({ stateDir: daemon.stateDir, autoStart: false });
  t.after(async () => { await core.close(); await daemon.close(); });
  const readEntries = async () => (await core.invoke("readState", { profile: "fast" })).app_state.agent_packages.directory.entries;
  assert.deepEqual(await readEntries(), []);
  const changed = once(core, "event");
  daemon.emitEvent("event.pack.progress", { package_id: "catalog-probe" });
  entries.push({ package_id: "catalog-probe", installed: false });
  daemon.emitEvent("event.pack.catalog.changed");
  assert.deepEqual(await changed, [{ method: "host/app-state-changed", params: { source: "package_catalog" } }]);
  assert.deepEqual(await readEntries(), entries);
  await core.close();
  assert.equal(core.framework.listenerCount("event"), 0);
});

test("the older desktop action channel can only disable Link with an explicit execute request", async () => {
  const core = createStandaloneHostCore();
  let disables = 0;
  core.linkInternet = { disable: async () => { disables++; return { status: "disabled", enabled: false }; } };
  const action = { actionId: "link_disable_internet", mode: "execute", dryRun: false, payload: { confirmed: true } };
  for (const invalid of [{ mode: "preview" }, { dryRun: true }, { payload: {} }, { mode: "rollback" }]) {
    await assert.rejects(core.invoke("executeAction", { ...action, ...invalid }), { code: "invalid_request" });
  }
  assert.equal(disables, 0);
  assert.equal((await core.invoke("executeAction", action)).status, "executed");
  assert.equal(disables, 1);
});

test("Host shutdown waits for a manual update and its Codex refresh", async () => {
  const core = createStandaloneHostCore();
  const events = [];
  let finishUpdate;
  core.opl.executeAction = () => new Promise((resolve) => { finishUpdate = resolve; });
  core.codex.reloadConfiguration = async () => { events.push("refresh"); };
  core.framework.close = async () => { events.push("framework-close"); };
  core.codex.close = async () => { events.push("codex-close"); };
  const operation = core.executeAction({ actionId: "agent_package_update", dryRun: false });
  const close = core.close();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, []);
  await assert.rejects(core.executeAction({ actionId: "agent_package_update", dryRun: false }), /closing/);
  finishUpdate({ status: "executed", exitCode: 0 });
  await operation;
  await close;
  assert.deepEqual(events, ["refresh", "framework-close", "codex-close"]);
});

test("Codex permission profiles stay on the protocol layer that owns them", () => {
  assert.deepEqual(threadPermissionOverrides(":danger-full-access", "/workspace"), {
    approvalPolicy: "never",
    sandbox: "danger-full-access"
  });
  assert.deepEqual(turnPermissionOverrides(":danger-full-access", "/workspace"), {
    approvalPolicy: "never",
    sandboxPolicy: { type: "dangerFullAccess" }
  });
  assert.deepEqual(threadPermissionOverrides(":workspace", "/workspace"), {
    approvalPolicy: "on-request",
    sandbox: "workspace-write"
  });
  assert.deepEqual(turnPermissionOverrides(":workspace", "/workspace"), {
    approvalPolicy: "on-request",
    sandboxPolicy: {
      type: "workspaceWrite",
      writableRoots: ["/workspace"],
      networkAccess: true,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false
    }
  });
  assert.deepEqual(turnPermissionOverrides(":read-only", "/workspace"), {
    approvalPolicy: "on-request",
    sandboxPolicy: { type: "readOnly", networkAccess: true }
  });
});

test("desktop hosts can supply a real working directory instead of the packaged app.asar path", () => {
  const core = createStandaloneHostCore({ workspaceRoot: "/Users/opl" });
  assert.equal(core.transport.cwd, "/Users/opl");
  assert.deepEqual(core.capabilities().oplPassthrough.channelCallback, {
    schema: "opl_channel_canonical_thread_callbacks.v1",
    status: "dormant",
    registered: false
  });
});

test("desktop runtime environment drives Codex and Gateway RPC calls from one host boundary", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-host-runtime-env-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const connectCalls = [];
  const loginCalls = [];
  const daemon = await startFakeOpld({
    onCall: async (method, params) => {
      if (method === "app.state.get") {
        return {
          profile: params.profile,
          app_state: {
            settings_control_center: {
              app_settings_read_model: {
                opl_gateway_account: {
                  surface_kind: "opl_gateway_account_read_model.v1",
                  connection_mode: "account",
                  status: "connected",
                  account_card_visible: true,
                  account: { display_name: "OPL User", status: "active" }
                }
              }
            }
          }
        };
      }
      if (method === "connect.configureCodexApiKey") {
        assert.deepEqual(params, { api_key: "sk-test" });
        connectCalls.push({ method });
        return { ok: true };
      }
      if (method === "connect.gateway.login") {
        loginCalls.push(params);
        return { gateway_account: { surface_kind: "opl_gateway_account_read_model.v1", connection_mode: "account", status: "connected", account: { email: params.email, status: "active" } } };
      }
      if (method === "connect.add") {
        connectCalls.push(params);
        return { connection_id: `conn-${connectCalls.length}` };
      }
      return {};
    }
  });
  t.after(() => daemon.close());

  const env = {
    PATH: `${directory}:/usr/bin:/bin:/usr/sbin:/sbin`,
    OPL_CODEX_BIN: "/Users/opl/.local/bin/codex",
    OPL_STATE_DIR: daemon.stateDir,
    OPL_APP_VERSION: "1.2.3"
  };
  const core = createStandaloneHostCore({
    workspaceRoot: directory,
    channelBindingFile: path.join(directory, "bindings.json"),
    autoStart: false,
    env
  });
  t.after(() => core.close());
  let reloadCount = 0;
  core.codex.reloadConfiguration = async () => {
    reloadCount += 1;
    return { available: true };
  };

  assert.equal(core.transport.command, env.OPL_CODEX_BIN);
  assert.equal(core.transport.clientVersion, env.OPL_APP_VERSION);
  assert.equal(core.transport.env, env);
  const state = await core.invoke("readState", { profile: "fast" });
  assert.equal(state.readback.exitCode, 0);
  assert.equal(
    state.app_state.settings_control_center.app_settings_read_model.opl_gateway_account.status,
    "connected"
  );
  assert.deepEqual(await core.invoke("loginGatewayAccount", {
    email: "user@example.com",
    password: "secret"
  }), { ok: true, stateRefreshRequired: true });
  assert.deepEqual(await core.invoke("configureCodexApiKey", {
    apiKey: "sk-test"
  }), { ok: true, stateRefreshRequired: true });
  assert.deepEqual(loginCalls, [{ email: "user@example.com", password: "secret" }]);
  assert.deepEqual(connectCalls, [{ method: "connect.configureCodexApiKey" }]);
  assert.equal(reloadCount, 1);
});

test("Codex configuration reload keeps the native adapter and serializes concurrent reloads", async () => {
  const transport = new EventEmitter();
  const calls = [];
  Object.assign(transport, {
    initialized: true,
    async stop() {
      calls.push("stop");
      this.initialized = false;
    },
    async start() {
      calls.push("start");
      await new Promise((resolve) => setTimeout(resolve, 5));
      this.initialized = true;
    }
  });
  const codex = new OplCodexNative({ transport, env: {} });
  const threads = codex.threads;

  const [first, second] = await Promise.all([
    codex.reloadConfiguration(),
    codex.reloadConfiguration()
  ]);

  assert.deepEqual(calls, ["stop", "start"]);
  assert.equal(first.available, true);
  assert.equal(second.available, true);
  assert.equal(codex.threads, threads);
});

test("successful Gateway model-access execution reloads the persistent App Server", async () => {
  let reloadCount = 0;
  const actionCalls = [];
  const core = createStandaloneHostCore({
    opl: {
      async executeAction(request) {
        actionCalls.push(request);
        return {
          actionId: request.actionId,
          dryRun: request.dryRun !== false,
          status: request.dryRun === false ? "executed" : "preview_ready",
          exitCode: 0
        };
      }
    }
  });
  core.codex.reloadConfiguration = async () => {
    reloadCount += 1;
    return { available: true };
  };

  await core.invoke("executeAction", {
    actionId: "gateway_account_use_for_model_access",
    payload: { confirmed: true },
    dryRun: true
  });
  assert.equal(reloadCount, 0);

  await core.invoke("executeAction", {
    actionId: "gateway_account_use_for_model_access",
    payload: { confirmed: true },
    dryRun: false
  });
  assert.equal(reloadCount, 1);

  await core.invoke("executeAction", {
    actionId: "unrelated_action",
    payload: { confirmed: true },
    dryRun: false
  });
  assert.equal(reloadCount, 1);
  assert.equal(actionCalls.length, 3);
});

test("App Server exit clears pending interactive requests instead of leaving stale approvals", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-pending-request-exit-test-"));
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    cwd: directory,
    env: { ...process.env, FAKE_APP_SERVER_PENDING_APPROVAL: "1" },
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  t.after(() => transport.stop());

  await transport.start();
  const requestPromise = new Promise((resolve) => transport.once("serverRequest", resolve));
  await transport.startTurn("thread-idle", "Require approval cleanup.");
  const request = await requestPromise;
  assert.equal(request.id, "approval-1");
  assert.equal(transport.listPendingServerRequests().length, 1);

  const clearedPromise = new Promise((resolve) => transport.once("serverRequestsCleared", resolve));
  transport.process.kill("SIGTERM");
  assert.deepEqual(await clearedPromise, { reason: "app_server_exited", count: 1, requestIds: ["approval-1"] });
  assert.deepEqual(transport.listPendingServerRequests(), []);
});

test("optional channel provider receives canonical App Server callbacks without changing the default host path", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-host-channel-callback-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    cwd: directory,
    host: "local",
    env: process.env,
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  const core = await createOplHostCore({
    transport,
    channelBindingFile: path.join(directory, "channel-bindings.json"),
    opl: { readState: async () => ({ profile: "fast" }) }
  });
  let closed = false;
  t.after(async () => {
    if (!closed) await core.close();
  });

  assert.deepEqual(core.capabilities().oplPassthrough.channelCallback, {
    schema: "opl_channel_canonical_thread_callbacks.v1",
    status: "dormant",
    registered: false
  });
  const callbacks = core.codex.channelCallbackAdapter;
  assert.deepEqual(
    Object.keys(callbacks).sort(),
    ["readTransportBindings", "resumeThread", "startThread", "startTurn", "subscribeTurn"]
  );
  assert.deepEqual(
    [
      callbacks.readTransportBindings,
      callbacks.startThread,
      callbacks.resumeThread,
      callbacks.startTurn,
      callbacks.subscribeTurn
    ].map((value) => typeof value),
    ["function", "function", "function", "function", "function"]
  );

  const started = await callbacks.startThread({
    provider_id: "opl-channel-weixin",
    account_id: "account-1",
    channel_session_id: "session-1"
  });
  assert.equal(started.canonical_thread_host, "local");
  assert.match(started.canonical_thread_id, /^thread-created-/);
  assert.equal(await callbacks.resumeThread(started), undefined);
  const turn = await callbacks.startTurn({
    ...started,
    text: "Reply through the canonical channel callback."
  });
  let subscription;
  const terminal = await new Promise((resolve) => {
    subscription = callbacks.subscribeTurn(turn, { onTerminal: resolve });
  });
  assert.deepEqual(terminal, {
    canonical_thread_host: "local",
    canonical_thread_id: started.canonical_thread_id,
    canonical_turn_id: turn.canonical_turn_id,
    status: "completed",
    response_text: `completed ${turn.canonical_turn_id}`
  });
  assert.equal(typeof subscription.dispose, "function");
  subscription.dispose();

  await assert.rejects(
    callbacks.resumeThread({ ...started, canonical_thread_host: "other-host" }),
    (error) => error.code === "invalid_app_server_response" && /different canonical thread/.test(error.message)
  );
  await core.close();
  closed = true;
  const bindings = JSON.parse(await readFile(path.join(directory, "channel-bindings.json"), "utf8"));
  assert.deepEqual(bindings.entries, [{
    provider_id: "opl-channel-weixin",
    account_id: "account-1",
    channel_session_id: "session-1",
    canonical_thread_host: "local",
    canonical_thread_id: started.canonical_thread_id
  }]);
});

test("channel binding restart recovers the exact thread and rejects unknown or mismatched refs", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-channel-binding-restart-test-"));
  const bindingFile = path.join(directory, "bindings.json");
  const identity = {
    provider_id: "opl-channel-weixin",
    account_id: "account-exact",
    channel_session_id: "session-exact"
  };
  const calls = [];
  const first = new CodexAppServerTransport({
    host: "host-exact",
    channelBindingStore: new ChannelBindingStore({ filePath: bindingFile })
  });
  first.startThread = async () => {
    calls.push("start:first");
    return { thread: { id: "thread-exact" } };
  };
  first.readThread = async (threadId) => {
    calls.push(`read:first:${threadId}`);
    return { thread: { id: threadId } };
  };
  const created = await first.createChannelCallbackAdapter().startThread(identity);
  assert.deepEqual(created, {
    canonical_thread_host: "host-exact",
    canonical_thread_id: "thread-exact"
  });

  const restarted = new CodexAppServerTransport({
    host: "host-exact",
    channelBindingStore: new ChannelBindingStore({ filePath: bindingFile })
  });
  restarted.startThread = async () => {
    throw new Error("restart must not create a replacement thread");
  };
  restarted.readThread = async (threadId) => {
    calls.push(`read:restart:${threadId}`);
    return { thread: { id: threadId, cwd: "/tmp/channel-restart-workspace" } };
  };
  restarted.resumeThread = async (threadId) => {
    calls.push(`resume:restart:${threadId}`);
    return { thread: { id: threadId, cwd: "/tmp/channel-restart-workspace" } };
  };
  const recovered = await restarted.createChannelCallbackAdapter().startThread(identity);
  assert.deepEqual(recovered, created);
  assert.deepEqual(await restarted.createChannelCallbackAdapter().readTransportBindings(), [{
    ...identity,
    ...created
  }]);
  assert.deepEqual(calls, [
    "start:first",
    "read:first:thread-exact",
    "read:restart:thread-exact"
  ]);

  await restarted.createChannelCallbackAdapter().resumeThread(recovered);
  assert.deepEqual(calls, [
    "start:first",
    "read:first:thread-exact",
    "read:restart:thread-exact",
    "read:restart:thread-exact",
    "resume:restart:thread-exact"
  ]);
  assert.equal(calls.filter((call) => call.startsWith("resume:")).length, 1);

  await assert.rejects(
    restarted.createChannelCallbackAdapter().resumeThread({
      canonical_thread_host: "host-exact",
      canonical_thread_id: "thread-unknown"
    }),
    (error) => error.code === "channel_binding_unknown"
  );
  const mismatchedThread = new CodexAppServerTransport({
    host: "host-exact",
    channelBindingStore: new ChannelBindingStore({ filePath: bindingFile })
  });
  mismatchedThread.readThread = async () => ({ thread: { id: "thread-other" } });
  await assert.rejects(
    mismatchedThread.createChannelCallbackAdapter().startThread(identity),
    (error) => error.code === "invalid_app_server_response" && /different canonical thread/.test(error.message)
  );
  const otherHost = new CodexAppServerTransport({
    host: "host-other",
    channelBindingStore: new ChannelBindingStore({ filePath: bindingFile })
  });
  otherHost.readThread = async () => { throw new Error("host mismatch must fail before thread/read"); };
  await assert.rejects(
    otherHost.createChannelCallbackAdapter().startThread(identity),
    (error) => error.code === "invalid_app_server_response" && /different canonical thread/.test(error.message)
  );

  await writeFile(bindingFile, "{broken", "utf8");
  await assert.rejects(
    restarted.createChannelCallbackAdapter().readTransportBindings(),
    (error) => error.code === "channel_binding_state_invalid"
  );
  await writeFile(bindingFile, JSON.stringify({
    schema: "opl_studio_channel_transport_bindings.v1",
    entries: [
      { ...identity, ...created },
      { ...identity, canonical_thread_host: "host-exact", canonical_thread_id: "thread-other" }
    ]
  }), "utf8");
  await assert.rejects(
    restarted.createChannelCallbackAdapter().readTransportBindings(),
    (error) => error.code === "channel_binding_state_invalid"
  );
});

test("shared Host attaches after App Server start and tears the provider down before transport", async () => {
  const calls = [];
  const transport = new EventEmitter();
  transport.cwd = "/tmp/studio-order";
  transport.initialized = false;
  transport.createChannelCallbackAdapter = () => ({
    startThread: async () => {},
    resumeThread: async () => {},
    startTurn: async () => {},
    subscribeTurn: () => ({ dispose() {} })
  });
  transport.start = async () => {
    calls.push("transport:start");
    transport.initialized = true;
  };
  transport.stop = async () => {
    calls.push("transport:stop");
    transport.initialized = false;
  };
  const codex = new OplCodexNative({ transport, env: {} });
  const framework = new OplFrameworkBridge({
    codex,
    opl: { readState: async () => ({}) },
    client: { on() {}, off() {}, connect: async () => {}, close: async () => { calls.push("bridge:close"); } }
  });
  const core = new OplHostCore({ codex, framework, mcpApps: new McpAppHost(transport) });
  core.attachHostContext({
    get: (key) => (key === "oplWeixinChannel" ? {
      async connect(adapter) {
        assert.equal(adapter, codex.channelCallbackAdapter);
        calls.push("provider:attach");
        return {
          appStatePatch: () => ({ ui_contributions: { entries: [] } }),
          readChannelAccess: async () => ({}),
          executeChannelAccessAction: async () => ({}),
          dispose: async () => { calls.push("provider:dispose"); }
        };
      }
    } : undefined)
  });
  await core.start();
  assert.deepEqual(calls, ["transport:start", "provider:attach"]);
  await core.close();
  await core.close();
  assert.deepEqual(calls, [
    "transport:start",
    "provider:attach",
    "provider:dispose",
    "bridge:close",
    "transport:stop"
  ]);
});

test("OpldClient binary and state path resolution honor explicit, env, and sibling priorities", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-daemon-resolve-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const binDir = path.join(directory, "bin");
  const pathDir = path.join(directory, "path-bin");
  await mkdir(binDir, { recursive: true });
  await mkdir(pathDir, { recursive: true });
  const explicitBin = path.join(directory, "explicit-opld");
  const envBin = path.join(directory, "env-opld");
  const siblingOpl = path.join(binDir, "opl");
  const siblingOpld = path.join(binDir, process.platform === "win32" ? "opld.cmd" : "opld");
  const pathOpld = path.join(pathDir, process.platform === "win32" ? "opld.cmd" : "opld");
  const nonExec = path.join(directory, "not-exec-opld");
  for (const f of [explicitBin, envBin, siblingOpl, siblingOpld, pathOpld]) {
    await writeFile(f, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(f, 0o755);
  }
  await writeFile(nonExec, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(nonExec, 0o644);

  assert.equal(resolveDaemonBinary({ OPL_DAEMON_BIN: envBin, PATH: pathDir }, explicitBin), explicitBin);
  assert.equal(resolveDaemonBinary({ OPL_DAEMON_BIN: envBin, PATH: pathDir }), envBin);
  assert.equal(resolveDaemonBinary({ OPL_APP_OPL_BIN: siblingOpl, PATH: pathDir }), siblingOpld);
  assert.equal(resolveDaemonBinary({ OPL_DAEMON_BIN: nonExec, PATH: pathDir }), process.platform === "win32" ? nonExec : pathOpld);
  assert.equal(resolveOplStatePaths({ HOME: "/h", OPL_STATE_DIR: "/s", OPL_DATA_DIR: "/d" }, "/e").stateDir, path.resolve("/e"));
  assert.equal(resolveOplStatePaths({ HOME: "/h", OPL_STATE_DIR: "/s", OPL_DATA_DIR: "/d" }).stateDir, path.resolve("/s"));
  assert.equal(resolveOplStatePaths({ HOME: "/h", OPL_DATA_DIR: "/d" }).stateDir, path.join(path.resolve("/d"), "opl", "state"));
});

test("an explicit data directory isolates the bridge from a running legacy home session", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-data-session-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const legacy = await startFakeOpld({ onCall: () => ({ instance: "legacy" }) });
  t.after(() => legacy.close());
  const homeRun = path.join(directory, ".opl", "run");
  await mkdir(homeRun, { recursive: true });
  await copyFile(legacy.sessionFile, path.join(homeRun, "opld.session.json"));

  const regular = new OpldClient({ env: { HOME: directory }, autoStart: false });
  t.after(() => regular.close());
  assert.deepEqual(await regular.call("daemon.info"), { instance: "legacy" });

  const isolated = new OpldClient({
    env: { HOME: directory, OPL_DATA_DIR: path.join(directory, "data") },
    autoStart: false,
  });
  t.after(() => isolated.close());
  await assert.rejects(isolated.call("daemon.info"), { code: "daemon_unavailable" });

  const selected = await startFakeOpld({ onCall: () => ({ instance: "selected" }) });
  t.after(() => selected.close());
  await mkdir(isolated.paths.runDir, { recursive: true });
  await copyFile(selected.sessionFile, isolated.paths.sessionFile);
  assert.deepEqual(await isolated.call("daemon.info"), { instance: "selected" });
});

test("OplFrameworkBridge connects studioWeixin, merges appStatePatch, routes opl-channel-weixin, and preserves disabled ownership", async (t) => {
  const events = [];
  const daemon = await startFakeOpld({
    onCall: async (method) => {
      if (method === "app.state.get") {
        return {
          profile: "fast",
          app_state: {
            ui_contributions: { entries: [{ package_id: "legacy", view: { view_type: "channel_access" } }, { package_id: "opl-fleet-agent", view: { view_type: "list_detail" } }] }
          }
        };
      }
      return {};
    }
  });
  t.after(() => daemon.close());

  const callback = Object.freeze({
    readTransportBindings: async () => [],
    startThread: async () => {},
    resumeThread: async () => {},
    startTurn: async () => {},
    subscribeTurn: () => ({ dispose() {} })
  });
  const studioWeixin = {
    async connect(adapter) {
      assert.equal(adapter, callback);
      events.push("start native");
      return {
        appStatePatch: () => ({
          ui_contributions: {
            surface_kind: "opl_app_ui_contributions_projection.v1",
            entries: [{ package_id: "opl-channel-weixin", view: { view_type: "channel_access" }, commands: [{ action_ref: "weixin.channel-access#connect", confirmation_required: false }] }]
          },
          transport_bindings: { status: "available", bindings: [{ binding_id: "b1", provider_id: "opl-channel-weixin", canonical_thread_id: "t1" }] }
        }),
        readChannelAccess: async (req) => ({ opl_app_contribution: { package_id: req.package_id, ref: req.ref, response: { ok: true, result: { state: "disconnected" } } } }),
        executeChannelAccessAction: async (req) => ({ opl_app_contribution: { surface_kind: "opl_app_package_contribution.v1", package_id: req.package_id, ref: req.ref, operation: "execute", response: { schema_version: "opl-package-app-contribution-response.v1", ref: req.ref, operation: "execute", ok: true, result: { ok: true } } } }),
        dispose: async () => { events.push("stop native"); }
      };
    }
  };

  const bridge = new OplFrameworkBridge({
    stateDir: daemon.stateDir,
    autoStart: false,
    codex: { channelCallbackAdapter: callback, capabilities: () => ({ channelCallbackSchema: "v1" }) }
  });
  const caps = await bridge.start(studioWeixin);
  assert.equal(bridge.hasNativeWeixinChannel(), true);
  assert.ok(bridge.nativeWeixinHost);
  assert.equal(caps.channelCallback.status, "dormant");

  const st = await bridge.opl.readState("fast");
  assert.deepEqual(st.app_state.ui_contributions.entries.map((e) => e.package_id), ["opl-fleet-agent", "opl-channel-weixin"]);
  assert.equal(st.app_state.transport_bindings.bindings[0].canonical_thread_id, "t1");

  const read = await bridge.opl.readContribution({ packageId: "opl-channel-weixin", ref: "weixin.channel-access#state" });
  assert.equal(read.stdoutJson.opl_app_contribution.response.result.state, "disconnected");

  const exec = await bridge.opl.executeAction({
    actionId: "package_contribution_execute",
    dryRun: false,
    payload: { package_id: "opl-channel-weixin", ref: "weixin.channel-access#connect", confirmed: true }
  });
  assert.equal(exec.status, "executed");
  await bridge.close();

  const disabledBridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, autoStart: false });
  t.after(() => disabledBridge.close());
  await disabledBridge.start(null);
  assert.equal(disabledBridge.hasNativeWeixinChannel(), true);
  assert.equal(disabledBridge.nativeWeixinHost, null);

  const absentBridge = new OplFrameworkBridge({ stateDir: daemon.stateDir, autoStart: false });
  t.after(() => absentBridge.close());
  await absentBridge.start(undefined);
  assert.equal(absentBridge.hasNativeWeixinChannel(), false);
  assert.deepEqual(events, ["start native", "stop native"]);
});

test("shared host core serves desktop and HTTP adapters through one typed method surface", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-host-core-test-"));
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    cwd: directory,
    env: process.env,
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  const updateOperations = [];
  const logDirectoryUpdates = [];
  const configuredApiKeys = [];
  const core = await createOplHostCore({
    transport,
    opl: {
      readState: async (profile) => ({ profile }),
      readInitialize: async () => ({ system_initialize: { setup_flow: { ready_to_launch: true } } }),
      readFullDrilldown: async () => ({ detail: "full" }),
      readDomainDetailView: async (request) => ({
        schema_version: "opl_domain_detail_view.v1",
        surface_kind: "opl_domain_detail_view",
        item_id: request.itemId,
        view_id: request.viewId,
        view_kind: "research-roadmap",
        availability: "available",
        revision: 3,
        not_modified: false,
        payload: { revision: 3 },
        conditions: []
      }),
      readContribution: async (request) => ({ request }),
      executeAction: async (request) => ({ request, authorityBoundary: "app_bridge_no_domain_authority" })
    },
    gatewayAccountLogin: async () => ({ ok: true, stateRefreshRequired: true }),
    codexApiKeyConfiguration: async (request) => {
      configuredApiKeys.push(request.apiKey);
      return { ok: true, stateRefreshRequired: true };
    },
    platform: {
      pickFiles: async () => ["/tmp/one.txt"],
      pickDirectory: async () => "/tmp/project"
    },
    carrierDiagnostics: {
      read: async () => ({
        schema: "opl_app_carrier_diagnostics.v1",
        owner: "one-person-lab-app_desktop_host",
        carrier: "electron_desktop",
        status: "available",
        application: { systemInfo: { logDir: "/tmp/one-person-lab/logs" } },
        setLogDirectorySupported: true
      }),
      setLogDirectory: async (request) => {
        logDirectoryUpdates.push(request);
        return {
          schema: "opl_app_log_directory_update.v1",
          owner: "one-person-lab-app_desktop_host",
          carrier: "electron_desktop",
          action: "application.setLogDirectory",
          status: "updated",
          success: true,
          hostLogDir: request.path
        };
      }
    },
    nativeUpdater: {
      perform: async (operation) => {
        updateOperations.push(operation);
        return { supported: true, operation };
      }
    }
  });
  t.after(() => core.close());

  assert.equal(core.capabilities().threadAdapter.threadStoreOwner, "codex_core_app_server");
  assert.deepEqual(await core.invoke("readState", { profile: "full" }), {
    profile: "full",
    carrierDiagnostics: {
      schema: "opl_app_carrier_diagnostics.v1",
      owner: "one-person-lab-app_desktop_host",
      carrier: "electron_desktop",
      status: "available",
      application: { systemInfo: { logDir: "/tmp/one-person-lab/logs" } },
      setLogDirectorySupported: true
    }
  });
  assert.deepEqual(await core.invoke("readInitialize"), {
    system_initialize: { setup_flow: { ready_to_launch: true } }
  });
  assert.equal((await core.invoke("readDomainDetailView", {
    itemId: "project:one:study-one",
    viewId: "research-roadmap"
  })).payload.revision, 3);
  assert.equal((await core.invoke("listThreads", {})).data.length, 5);
  assert.deepEqual(await core.invoke("pickFiles"), ["/tmp/one.txt"]);
  assert.equal(await core.invoke("pickDirectory"), "/tmp/project");
  assert.deepEqual(await core.invoke("setLogDirectory", { path: "/tmp/new-logs" }), {
    schema: "opl_app_log_directory_update.v1",
    owner: "one-person-lab-app_desktop_host",
    carrier: "electron_desktop",
    action: "application.setLogDirectory",
    status: "updated",
    success: true,
    hostLogDir: "/tmp/new-logs"
  });
  assert.deepEqual(logDirectoryUpdates, [{ path: "/tmp/new-logs" }]);
  assert.deepEqual(await core.invoke("readNativeAppUpdateStatus"), { supported: true, operation: "status" });
  assert.deepEqual(await core.invoke("checkNativeAppUpdate"), { supported: true, operation: "check" });
  assert.deepEqual(await core.invoke("applyNativeAppUpdate"), { supported: true, operation: "apply" });
  assert.deepEqual(await core.invoke("restartNativeApp"), { supported: true, operation: "restart" });
  assert.deepEqual(updateOperations, ["status", "check", "apply", "restart"]);
  assert.deepEqual(await core.invoke("configureCodexApiKey", { apiKey: "host-secret" }), {
    ok: true,
    stateRefreshRequired: true
  });
  assert.deepEqual(configuredApiKeys, ["host-secret"]);
  await assert.rejects(
    core.invoke("unregisteredMethod"),
    (error) => error.code === "host_method_not_found" && error.httpStatus === 404
  );
});

test("a deferred Codex reload never turns a written API key into a reported failure", async () => {
  const transport = new CodexAppServerTransport();
  const events = [];
  const reloads = [];
  let release;
  const work = new Promise((resolve) => { release = resolve; });

  const codex = new EventEmitter();
  codex.transport = transport;
  codex.threads = { readThread() {}, capabilities: () => ({}) };
  codex.close = async () => {};
  codex.reloadConfiguration = async ({ maintenanceHeld } = {}) => {
    assert.equal(maintenanceHeld, true);
    reloads.push("reload");
  };

  const core = createStandaloneHostCore({
    codex,
    framework: {
      opl: { readState: async () => ({}), executeAction: async () => ({}) },
      gatewayAccountLogin: async () => ({ ok: true, stateRefreshRequired: true }),
      codexApiKeyConfiguration: async () => ({ ok: true, stateRefreshRequired: true }),
      close: async () => {}
    },
    threadWorkspace: { list() {}, read() {}, git() {}, readBytes() {}, search() {}, access() {} }
  });
  core.on("event", (event) => events.push(event));

  // The credential write lands while a turn keeps the app-server busy.
  const activity = transport.withActivity(() => work);
  assert.deepEqual(await core.invoke("configureCodexApiKey", { apiKey: "sk-live" }), {
    ok: true,
    stateRefreshRequired: true
  });
  assert.deepEqual(reloads, [], "the live reload stays deferred while the server is busy");
  assert.deepEqual(events, [{
    method: "host/codex-configuration-refresh-deferred",
    params: { reasonCode: "codex_configuration_refresh_deferred" }
  }]);

  // Once the server quiesces the deferred reload still runs, so the saved key
  // actually reaches the live app-server instead of being silently dropped.
  release();
  await activity;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(reloads, ["reload"]);
  await core.close();
});

for (const busy of [false, true]) {
  test(`committed model access keeps its success when a ${busy ? "deferred" : "immediate"} reload fails`, async () => {
    const core = createStandaloneHostCore();
    const events = [];
    core.on("event", (event) => events.push(event));
    core.codexApiKeyConfiguration = async () => ({ ok: true, stateRefreshRequired: true });
    core.opl.executeAction = async () => ({ status: "executed", exitCode: 0 });
    core.codex.reloadConfiguration = async () => {
      throw Object.assign(new Error("synthetic restart failure"), { code: "app_server_unavailable" });
    };
    let release;
    const activity = busy ? core.transport.withActivity(() => new Promise((resolve) => { release = resolve; })) : null;
    assert.equal((await core.configureCodexApiKey({ apiKey: "synthetic" })).ok, true);
    assert.equal((await core.executeAction({ actionId: "gateway_account_use_for_model_access", dryRun: false })).status, "executed");
    if (busy) {
      assert.equal(events.filter((event) => event.method.endsWith("refresh-failed")).length, 0);
      release();
      await activity;
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(events.filter((event) => event.method.endsWith("refresh-failed")).length, 2);
    assert.ok(events.filter((event) => event.method.endsWith("refresh-failed"))
      .every((event) => event.params.reasonCode === "app_server_unavailable"));
    await core.close();
  });
}

test("shared host core reports unavailable carrier logs instead of borrowing Framework logs", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-host-core-unavailable-test-"));
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    cwd: directory,
    env: process.env,
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  const core = await createOplHostCore({
    transport,
    opl: {
      readState: async () => ({
        app_state: {
          settings_control_center: {
            app_settings_read_model: {
              local_environment: { logs_dir: "/framework/runtime/logs" }
            }
          }
        }
      })
    }
  });
  t.after(() => core.close());

  const readback = await core.invoke("readState", { profile: "fast" });
  assert.deepEqual(readback.carrierDiagnostics, {
    schema: "opl_app_carrier_diagnostics.v1",
    owner: "one-person-lab-app_native_host",
    carrier: "standalone_headless_webui",
    status: "unavailable",
    setLogDirectorySupported: false,
    reasonCode: "carrier_log_directory_unavailable"
  });
  assert.equal("logsDirectory" in readback.carrierDiagnostics, false);
  assert.equal("application" in readback.carrierDiagnostics, false);
});

test("Docker projects application.systemInfo.logDir as read-only /data/logs", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-host-core-docker-test-"));
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: [fixture],
    cwd: directory,
    env: process.env,
    requestTimeoutMs: 2_000,
    turnTimeoutMs: 2_000
  });
  const core = await createOplHostCore({
    transport,
    opl: { readState: async () => ({ profile: "fast" }) },
    env: {
      HOME: "/data",
      OPL_DATA_DIR: "/data",
      OPL_WORKSPACE_ROOT: "/projects"
    }
  });
  t.after(() => core.close());

  assert.deepEqual((await core.invoke("readState", { profile: "fast" })).carrierDiagnostics, {
    schema: "opl_app_carrier_diagnostics.v1",
    owner: "one-person-lab-app_native_host",
    carrier: "docker_webui",
    status: "available",
    application: { systemInfo: { logDir: "/data/logs" } },
    setLogDirectorySupported: false,
    reasonCode: "docker_log_directory_is_read_only"
  });
});


test("desktop workspace actions invoke the platform only after canonical path validation", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-workspace-native-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "report.pdf"), "%PDF-fixture");
  const calls = [];
  const core = createStandaloneHostCore({ platform: { accessWorkspacePath: async (request) => { calls.push(request); } } });
  core.threads.readThread = async () => ({ cwd: directory });
  assert.deepEqual(await core.invoke("accessThreadWorkspace", { threadId: "thread-1", relativePath: "report.pdf", action: "open" }), { accepted: true });
  await core.invoke("accessThreadWorkspace", { threadId: "thread-1", relativePath: "report.pdf", action: "reveal" });
  assert.deepEqual(calls, [
    { path: await realpath(path.join(directory, "report.pdf")), action: "open" },
    { path: await realpath(path.join(directory, "report.pdf")), action: "reveal" }
  ]);
  await assert.rejects(core.invoke("accessThreadWorkspace", { threadId: "thread-1", relativePath: "../secret.pdf", action: "open" }), (error) => error.code === "invalid_workspace_path");
  await assert.rejects(core.invoke("accessThreadWorkspace", { threadId: "thread-1", relativePath: "report.pdf", action: "download" }), (error) => error.code === "invalid_workspace_action");
  assert.equal(calls.length, 2);
  core.platform.accessWorkspacePath = async () => { throw new Error("No associated application"); };
  await assert.rejects(core.invoke("accessThreadWorkspace", { threadId: "thread-1", relativePath: "report.pdf", action: "open" }), /No associated application/);
});


test("installation locations are revealed without executing files or accepting relative paths", async (t) => {
  const calls = [];
  const core = createStandaloneHostCore({ platform: { accessWorkspacePath: async (request) => calls.push(request) } });
  t.after(() => core.close());
  await core.invoke("revealLocalPath", { path: path.resolve("fixture-installation"), action: "open" });
  assert.deepEqual(calls, [{ path: path.resolve("fixture-installation"), action: "reveal" }]);
  for (const invalid of ["../app", "", "https://example.com", "/tmp/app\0bad"]) {
    await assert.rejects(core.invoke("revealLocalPath", { path: invalid }), /absolute local path/);
  }
  assert.equal(calls.length, 1);
});

test("OplFrameworkBridge.close() during in-flight studioWeixin.connect() disposes the resolved host without leaking", async () => {
  let resolveConnect;
  let disposed = false;
  const bridge = new OplFrameworkBridge({
    client: { on() {}, off() {}, connect: async () => {}, close: async () => {}, connected: true, serverApiVersion: "2.0" },
    codex: { channelCallbackAdapter: {}, capabilities: () => ({ channelCallbackSchema: "v1" }) }
  });
  const studioWeixin = {
    connect: () => new Promise((resolve) => { resolveConnect = resolve; })
  };

  const startPromise = bridge.start(studioWeixin);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const closePromise = bridge.close();
  resolveConnect({
    dispose: async () => { disposed = true; }
  });
  await Promise.all([startPromise, closePromise]);

  assert.equal(disposed, true);
  assert.equal(bridge.nativeWeixinHost, null);
});
