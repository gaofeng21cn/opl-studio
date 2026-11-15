import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
  async listModels() { return { data: [{ id: "fixture", displayName: "Fixture" }] }; }
  async startThread(input) {
    const thread = { id: `thread-${++this.next}`, turns: [], input };
    this.threads.set(thread.id, thread);
    this.calls.push({ method: "thread/start", input });
    return { thread };
  }
  async resumeThread(id) { assert.ok(this.threads.has(id)); return { thread: this.threads.get(id) }; }
  async readThread(id) { return { thread: this.threads.get(id) }; }
  async startTurn(threadId, prompt) {
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
          threadId: turn.threadId, turnId: id, tool: turn.prompt.includes("CREATE_MODEL_CHILD") ? "opl_dsh_subagent" : "opl_dsh_team_task_create", callId: `call-${this.next}`,
          arguments: turn.prompt.includes("CREATE_MODEL_CHILD")
            ? { name: "worker", description: "Verify inherited permissions", prompt: "Acknowledge" }
            : { subject: "Review", description: "Verify the implementation" }
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
  return bootOplStudioHost({ dshHome: home, workspaceRoot: home, transport, webPort: 0,
    opl: Object.fromEntries(["readState", "readInitialize", "readFullDrilldown", "readDomainDetailView", "readContribution", "executeAction"].map(name => [name, async () => ({})])) });
}

test("official Team uses exact members, durable messages and one continuing Codex thread after restart", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "opl-team-integration-"));
  const transport = new CodexFixture();
  let host;
  try {
    host = await boot(home, transport);
    let service = host.context.oplTeamBots;
    assert.ok(!host.context.tools.schemas().some(tool => tool.name.startsWith("team_task_") || tool.name === "subagent"));
    const lead = await service.saveBot({ name: "coordinator", role: "Coordinate", cwd: home, permissions: ":read-only" });
    const reviewer = await service.saveBot({ name: "reviewer", role: "Review", cwd: home, permissions: ":read-only" });
    const team = await service.createTeam({ title: "Team", botId: lead.id });
    await service.send({ teamId: team.id, text: "CREATE_SHARED_TASK" });
    await (await service.resolve(team.id)).whenIdle();
    assert.ok(transport.toolResponse, JSON.stringify({ calls: transport.calls.map(call => ({ method: call.method, prompt: call.prompt })), events: Array.from({ length: (await service.resolve(team.id)).session.seq }, (_, index) => (host.context.agents.get(team.id)).session.eventAt(index)).filter(event => /error|attempt/.test(event.type)) }));
    assert.equal(transport.toolResponse.result.success, true);
    assert.equal((await service.read(team.id)).tasks.length, 1);
    const member = await service.addMember({ teamId: team.id, botId: reviewer.id, prompt: "Review the task" });
    await host.context.agents.get(member.id).whenIdle();
    await (await service.resolve(team.id)).whenIdle();
    const starts = transport.calls.filter(call => call.method === "thread/start");
    assert.equal(starts.length, 2);
    assert.ok(starts.every(call => call.input.permissions === ":read-only"));
    const memberThread = host.context.oplCodexAgents.state.bindings[member.id].threadId;
    await service.send({ teamId: team.id, memberId: member.id, text: "Refine the review" });
    await host.context.agents.get(member.id).whenIdle();
    assert.ok(transport.calls.some(call => call.method === "turn/start" && call.threadId === memberThread && call.prompt.includes("Refine the review")));
    assert.equal(transport.calls.filter(call => call.method === "thread/start").length, 2);
    await host.core.close();
    host = await boot(home, transport);
    service = host.context.oplTeamBots;
    const restored = await service.read(team.id);
    assert.equal(restored.tasks.length, 1);
    const cold = await service.read(team.id, member.id);
    assert.ok(cold.messages.some(event => event.type === "assistant/message"));
    assert.equal(host.context.agents.get(member.id), undefined, "transcript reads must not activate a cold member");
    await assert.rejects(service.execute({ operation: "cancel_member", input: { teamId: "foreign", memberId: member.id } }), /Unknown Team/);
    assert.ok(restored.members.some(item => item.id === member.id && item.path === "reviewer"));
    await service.send({ teamId: team.id, memberId: member.id, text: "Continue after restart" });
    await host.context.agents.get(member.id).whenIdle();
    assert.equal(host.context.oplCodexAgents.state.bindings[member.id].threadId, memberThread);
    assert.equal(transport.calls.filter(call => call.method === "thread/start").length, 2);
  } finally {
    await host?.core.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("an unconfirmed dispatch remains inspectable and is never blindly sent again", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "opl-team-unknown-"));
  const transport = new CodexFixture();
  let host;
  try {
    host = await boot(home, transport);
    const service = host.context.oplTeamBots;
    const bot = await service.saveBot({ name: "coordinator", cwd: home });
    const team = await service.createTeam({ botId: bot.id });
    await service.send({ teamId: team.id, text: "Initial task" });
    const root = await service.resolve(team.id);
    await root.whenIdle();
    await host.context.oplCodexAgents.mutate(state => {
      state.bindings[team.id].attempt = { status: "dispatching", ids: ["unconfirmed-input"] };
    });
    const before = transport.calls.filter(call => call.method === "turn/start").length;
    await service.send({ teamId: team.id, text: "Continue" });
    await root.whenIdle();
    assert.equal(transport.calls.filter(call => call.method === "turn/start").length, before);
    assert.equal(host.context.oplCodexAgents.state.bindings[team.id].attempt.status, "dispatching");
  } finally { await host?.core.close(); await rm(home, { recursive: true, force: true }); }
});

test("model-created official subagents inherit the exact Bot permission profile", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "opl-team-inheritance-"));
  const transport = new CodexFixture(); let host;
  try {
    host = await boot(home, transport);
    const service = host.context.oplTeamBots;
    const bot = await service.saveBot({ name: "coordinator", cwd: home, permissions: ":read-only", skills: ["review"] });
    const team = await service.createTeam({ botId: bot.id });
    await service.send({ teamId: team.id, text: "CREATE_MODEL_CHILD" });
    const root = await service.resolve(team.id); await root.whenIdle();
    const members = (await service.read(team.id)).members;
    assert.equal(members.length, 1);
    await host.context.agents.get(members[0].id)?.whenIdle();
    assert.equal(host.context.oplCodexAgents.state.bindings[members[0].id].bot.permissions, ":read-only");
    assert.ok(transport.calls.filter(call => call.method === "thread/start").every(call => call.input.permissions === ":read-only"));
  } finally { await host?.core.close(); await rm(home, { recursive: true, force: true }); }
});

test("cancelling a Team member interrupts that member's exact Codex turn", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "opl-team-cancel-"));
  const transport = new CodexFixture(); let host;
  try {
    host = await boot(home, transport);
    const service = host.context.oplTeamBots;
    const bot = await service.saveBot({ name: "coordinator", cwd: home });
    const team = await service.createTeam({ botId: bot.id });
    await service.send({ teamId: team.id, text: "WAIT_FOR_CANCEL" });
    await transport.cancellationReady;
    const binding = host.context.oplCodexAgents.state.bindings[team.id];
    await service.execute({ operation: "cancel_member", input: { teamId: team.id, memberId: team.id } });
    await (await service.resolve(team.id)).whenIdle();
    assert.ok(transport.calls.some(call => call.method === "turn/interrupt"
      && call.input.threadId === binding.threadId && call.input.turnId === binding.attempt.turnId));
  } finally { await host?.core.close(); await rm(home, { recursive: true, force: true }); }
});
