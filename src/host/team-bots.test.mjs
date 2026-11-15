import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { boot as bootOfficial, initProfile, loadProfile, createRuntimeResolution, PluginPackages, readProfilePatches } from "@deepseek-ai/dsh-app-boot";
import { provideCmdline } from "@deepseek-ai/dsh-cmdline";
import { pathToFileURL } from "node:url";
import { bootOplStudioHost } from "./dsh/host.mjs";

class CodexFixture extends EventEmitter {
  initialized = false;
  threads = new Map();
  turns = new Map();
  calls = [];
  next = 0;
  cancellationReady = new Promise(resolve => { this.markCancellationReady = resolve; });
  createChannelCallbackAdapter() { return null; }
  async start() { this.initialized = true; }
  async stop() { this.initialized = false; }
  async listModels() { return { data: [{ id: "fixture", displayName: "Fixture" }, { id: "fixture-alt", displayName: "Alternate" }] }; }
  async startThread(input) {
    const thread = { id: `thread-${++this.next}`, turns: [], input };
    this.threads.set(thread.id, thread);
    this.calls.push({ method: "thread/start", input });
    return { thread };
  }
  async resumeThread(id, input) { this.calls.push({ method: "thread/resume", input }); assert.ok(this.threads.has(id)); return { thread: this.threads.get(id) }; }
  async readThread(id) { return { thread: this.threads.get(id) }; }
  async startTurn(threadId, prompt, _inputs, overrides) {
    this.calls.push({ method: "turn/options", overrides });
    const turn = { id: `turn-${++this.next}`, threadId, prompt, status: "completed" };
    this.turns.set(turn.id, turn);
    this.threads.get(threadId).turns.push(turn);
    this.calls.push({ method: "turn/start", ...turn });
    return { turn };
  }
  async waitForTurn(id) {
    const turn = this.turns.get(id);
    if (turn.prompt.includes("WAIT_FOR_CANCEL")) {
      await new Promise(resolve => { this.finishCancelled = resolve; this.markCancellationReady(); });
    }
    if (turn.prompt.includes("CREATE_MODEL_CHILD") || turn.prompt.includes("CREATE_SHARED_TASK")) {
      await new Promise(resolve => {
        this.pendingTool = resolve;
        this.emit("serverRequest", { id: ++this.next, method: "item/tool/call", params: {
          threadId: turn.threadId, turnId: id, tool: "opl_dsh_call", callId: `call-${this.next}`,
          arguments: { name: turn.prompt.includes("CREATE_MODEL_CHILD") ? "subagent" : "team_task_create", arguments: turn.prompt.includes("CREATE_MODEL_CHILD")
            ? { name: "worker", description: "Verify inherited permissions", prompt: "Acknowledge" }
            : { subject: "Review", description: "Verify the implementation" } }
        } });
      });
    }
    return { finalMessage: "Fixture result", notification: { threadId: turn.threadId, turn: { id, status: turn.status } } };
  }
  respondToServerRequest(_id, response) {
    this.toolResponse = response;
    this.pendingTool?.();
  }
  async request(method, input) {
    this.calls.push({ method, input });
    if (method === "turn/interrupt") {
      this.turns.get(input.turnId).status = "interrupted";
      this.finishCancelled?.();
    }
    return {};
  }
}

async function boot(home, transport) {
  const host = await bootOplStudioHost({ dshHome: home, workspaceRoot: home, transport, webPort: 0,
    opl: Object.fromEntries(["readState", "readInitialize", "readFullDrilldown", "readDomainDetailView", "readContribution", "executeAction"].map(name => [name, async () => ({})])) });
  assert.equal(host.context.get("agents"), undefined, "ordinary Host must not own DSH sessions");
  // Exercise the official controller/adapter graph directly. The packed-package
  // integration test covers the shipped CLI process and parent transport.
  const profileHome = path.join(home, "opl-collaboration");
  const dir = path.join(profileHome, "profiles/web");
  initProfile(dir, ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@one-person-lab/opl-codex-agents"]);
  const installAnchor = path.resolve("package.json");
  const profile = loadProfile("executor test", "web", installAnchor, profileHome);
  const root = path.join(dir, "cordis.yml");
  await writeFile(root, "[]\n");
  const overlays = [{ id: "hmr", disabled: true }, { id: "session-telemetry-otel", disabled: true },
    { id: "credentials", config: { dshHome: profileHome } },
    { id: "session-persistence-jsonl", config: { root: path.join(home, "opl/sessions") } },
    { id: "web-runtime", config: { openBrowser: false, printUrl: false } }];
  const profileContext = { name: "web", dir, patchPath: profile.patchPath, installAnchor, home: profileHome,
    cwd: home, startedBundles: profile.layers.map(layer => layer.packageName), overlays, telemetryDisabledEnv: "1" };
  const resolution = await createRuntimeResolution({ installAnchor, profile, home: profileHome });
  const collaboration = await bootOfficial("executor test", root, readProfilePatches("executor test", profileContext, profile), async ctx => {
    ctx.set("dshHomePath", (...parts) => path.join(profileHome, ...parts));
    ctx.provide("profileContext", profileContext);
    ctx.provide("oplStudioHostOptions", { dshHome: home, workspaceRoot: home });
    ctx.provide("oplCodexNative", { transport });
    ctx.provide("oplCodexDefaultModel", "fixture");
    await ctx.plugin(PluginPackages, { resolution });
    provideCmdline(ctx, { args: ["--host", "127.0.0.1", "--port", "0", "--no-open"], exit: () => {} });
  }, pathToFileURL(path.join(dir, "package.json")).href);
  let closing;
  const core = { close: () => closing ??= (async () => { await collaboration.fiber.dispose(); await host.core.close(); })() };
  return { ...host, core, collaboration };
}

async function create(ctx, home) {
  const { sessionId } = await ctx.sessionController.create({ cwd: home });
  const agent = ctx.agents.get(sessionId);
  agent.session.append("sandbox/mode", { mode: "read-only" });
  return agent;
}
async function prompt(ctx, agent, text) {
  await ctx.sessionController.prompt({ sessionId: agent.id, requestId: crypto.randomUUID(), mode: "queue", content: [{ type: "text", text }] }, new AbortController().signal);
  await agent.whenIdle();
}

test("the official workbench toggles teamwork on the same Codex thread and restores members and tasks", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "opl-native-team-"));
  const transport = new CodexFixture(); let host;
  try {
    await mkdir(path.join(home, "opl"));
    await writeFile(path.join(home, "opl/bots.json"), '{"bots":[{"name":"legacy"}]}');
    host = await boot(home, transport);
    let ctx = host.collaboration;
    assert.equal(ctx.oplCodexNative.transport, transport);
    const root = await create(ctx, home);
    assert.equal(ctx.agentTeams.isEnabled(root), false);
    await prompt(ctx, root, "Initial acknowledgement");
    const threadId = ctx.oplCodexAgents.state.bindings[root.id].threadId;
    await ctx.agentTeams.setEnabled(root, true);
    await prompt(ctx, root, "CREATE_SHARED_TASK");
    assert.equal(transport.toolResponse?.result.success, true, JSON.stringify(transport.toolResponse));
    assert.equal(ctx.agentTeams.listTasks(root).length, 1);
    assert.ok(Array.from({ length: root.session.seq }, (_, index) => root.session.eventAt(index)).some(event => event.type === "tool/call" && event.data.name === "team_task_create"), "official tool cards receive native log events");
    await prompt(ctx, root, "CREATE_MODEL_CHILD");
    const members = await ctx.subagents.listDescendants(root.id);
    assert.equal(members.length, 1);
    const memberId = members[0].id;
    await ctx.agents.get(memberId)?.whenIdle(); await root.whenIdle();
    const memberThread = ctx.oplCodexAgents.state.bindings[memberId].threadId;
    assert.equal(transport.calls.filter(call => call.method === "thread/start").length, 2);
    assert.ok(transport.calls.filter(call => call.method === "thread/start").every(call => call.input.permissions === ":read-only"));
    await ctx.agentTeams.setEnabled(root, false);
    await prompt(ctx, root, "Teamwork disabled");
    const disabledCatalog = transport.calls.filter(call => call.method === "thread/resume").at(-1).input.developerInstructions;
    assert.ok(!disabledCatalog.includes('"name":"team_task_create"'));
    assert.equal(ctx.oplCodexAgents.state.bindings[root.id].threadId, threadId);
    await ctx.agentTeams.setEnabled(root, true);
    assert.equal(ctx.agentTeams.listTasks(root).length, 1);
    await ctx.subagents.sendMessage(root, memberId, [{ type: "text", text: "Refine the review" }], { signal: new AbortController().signal });
    await ctx.agents.get(memberId).whenIdle(); await root.whenIdle();
    await ctx.sessionController.selectModel({ sessionId: root.id, provider: "opl-codex", model: "fixture-alt" });
    await ctx.agentDefaultModel.saveSelection({ provider: "opl-codex", model: "fixture-alt" });
    await host.core.close();
    host = await boot(home, transport); ctx = host.collaboration;
    assert.equal(ctx.agentDefaultModel.currentSelection().model, "fixture-alt");
    await ctx.sessionController.selectModel({ sessionId: root.id, provider: "opl-codex", model: "fixture" });
    await ctx.agentDefaultModel.saveSelection({ provider: "opl-codex", model: "fixture" });
    const restored = ctx.agents.get(root.id);
    assert.equal(ctx.agentTeams.listTasks(restored).length, 1);
    assert.ok((await ctx.subagents.listDescendants(root.id)).some(member => member.id === memberId));
    await ctx.sessionQuery.inspectSession(memberId, session => assert.ok(session.seq > 0));
    assert.equal(ctx.agents.get(memberId), undefined, "cold transcript reads do not activate members");
    await ctx.subagents.sendMessage(restored, memberId, [{ type: "text", text: "Continue after restart" }], { signal: new AbortController().signal });
    await ctx.agents.get(memberId).whenIdle(); await restored.whenIdle();
    assert.equal(ctx.oplCodexAgents.state.bindings[memberId].threadId, memberThread);
    assert.equal(transport.calls.filter(call => call.method === "thread/start").length, 2);
    assert.equal(await readFile(path.join(home, "opl/bots.json"), "utf8"), '{"bots":[{"name":"legacy"}]}');
    await assert.rejects(host.context.oplTeamBots.execute({ operation: "save_bot" }), /official DSH workbench/);
  } finally { await host?.core.close(); await rm(home, { recursive: true, force: true }); }
});

test("unconfirmed native dispatch fails closed and official Stop interrupts the exact Codex turn", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "opl-native-cancel-"));
  const transport = new CodexFixture(); let host;
  try {
    host = await boot(home, transport); const ctx = host.collaboration;
    const root = await create(ctx, home);
    await ctx.agentTeams.setEnabled(root, true);
    await ctx.sessionController.prompt({ sessionId: root.id, requestId: crypto.randomUUID(), mode: "queue", content: [{ type: "text", text: "WAIT_FOR_CANCEL" }] }, new AbortController().signal);
    await transport.cancellationReady;
    const binding = ctx.oplCodexAgents.state.bindings[root.id];
    ctx.sessionController.cancel({ sessionId: root.id });
    await root.whenIdle();
    assert.ok(transport.calls.some(call => call.method === "turn/interrupt" && call.input.threadId === binding.threadId && call.input.turnId === binding.attempt.turnId));
    await ctx.oplCodexAgents.mutate(state => { state.bindings[root.id].attempt = { status: "dispatching", ids: ["unknown"] }; });
    const before = transport.calls.filter(call => call.method === "turn/start").length;
    await prompt(ctx, root, "Continue");
    assert.equal(transport.calls.filter(call => call.method === "turn/start").length, before);
    assert.equal(ctx.oplCodexAgents.state.bindings[root.id].attempt.status, "dispatching");
  } finally { await host?.core.close(); await rm(home, { recursive: true, force: true }); }
});
