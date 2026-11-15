import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
const PROVIDER = "opl-codex";

export const name = "opl-team-bots";
export const inject = ["oplStudioHostOptions", "oplCodexAgents", "agents", "agentLoop", "sessions", "sessionQuery", "sessionPersistence", "subagents", "agentTeams"];

/** Product configuration only; official DSH owns members, inboxes, tasks and history. */
export class TeamBots {
  constructor(ctx, directory) {
    this.ctx = ctx;
    this.file = path.join(directory, "bots.json");
    this.handles = new Map();
    this.resuming = new Map();
    this.serial = Promise.resolve();
    this.state = { revision: 0, bots: [], teams: [] };
  }
  async load() {
    try { this.state = JSON.parse(await readFile(this.file, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  mutate(operation) {
    const pending = this.serial.then(async () => {
      const next = structuredClone(this.state);
      const result = await operation(next);
      next.revision++;
      await mkdir(path.dirname(this.file), { recursive: true });
      const temp = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      await rename(temp, this.file);
      this.state = next;
      return result;
    });
    this.serial = pending.catch(() => {});
    return pending;
  }
  async saveBot(input) {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(input.name ?? "") || input.name === "lead") throw Error("Bot name must be 1–32 lowercase letters, numbers or hyphens, starting with a letter.");
    if (!path.isAbsolute(input.cwd ?? "")) throw Error("Bot workspace must be an absolute directory.");
    if (![":read-only", ":workspace", ":danger-full-access"].includes(input.permissions ?? ":workspace")) throw Error("Unknown Codex permission profile.");
    const bot = { id: input.id ?? randomUUID(), name: input.name, role: String(input.role ?? ""),
      cwd: input.cwd, model: input.model || "default", permissions: input.permissions ?? ":workspace",
      skills: Array.isArray(input.skills) ? input.skills.map(String) : [] };
    return this.mutate(state => {
      const index = state.bots.findIndex(item => item.id === bot.id);
      if (index < 0) state.bots.push(bot); else state.bots[index] = bot;
      return bot;
    });
  }
  async resolve(id) {
    const live = this.ctx.agents.get(id);
    if (live) return live;
    if (!this.resuming.has(id)) {
      const pending = this.ctx.agents.resume({ resumeSessionId: id, agentOptions: { provider: PROVIDER, model: this.ctx.oplCodexAgents.state.bindings[id]?.bot?.model ?? "default" } })
        .then(handle => { this.handles.set(id, handle); return handle.agent; })
        .finally(() => this.resuming.delete(id));
      this.resuming.set(id, pending);
    }
    return this.resuming.get(id);
  }
  async createTeam({ title, botId }) {
    const bot = this.state.bots.find(item => item.id === botId);
    if (!bot) throw Error("Choose a saved Bot for the Team lead.");
    const id = `opl-team-${randomUUID()}`;
    const handle = await this.ctx.agents.create({ sessionId: id, meta: { cwd: bot.cwd },
      agentOptions: { provider: PROVIDER, model: bot.model },
      setup: (_scope, agent) => this.ctx.oplCodexAgents.setBot(agent.id, bot) });
    this.handles.set(id, handle);
    await this.ctx.agentTeams.setEnabled(handle.agent, true);
    try { await this.mutate(state => { state.teams.push({ id, title: String(title || bot.name), botId }); }); }
    catch (error) { await handle.dispose(); this.handles.delete(id); throw error; }
    return { id };
  }
  async addMember({ teamId, botId, prompt }) {
    const bot = this.state.bots.find(item => item.id === botId);
    if (!bot) throw Error("Unknown Bot.");
    if (!this.state.teams.some(item => item.id === teamId)) throw Error("Unknown Team.");
    const parent = await this.resolve(teamId);
    const childId = `opl-bot-${randomUUID()}`;
    const dispose = this.ctx.on("agent/created", async ({ agent }) => {
      if (agent.id === childId) await this.ctx.oplCodexAgents.setBot(agent.id, { ...bot, cwd: parent.session.header.cwd });
    });
    try {
      const activation = await this.ctx.subagents.startActivation({ provider: "spawn", childId,
        label: bot.role || bot.name, name: bot.name, parent, prompt: [{ type: "text", text: String(prompt || `You are ${bot.name}. ${bot.role}\nWait for the Team's next assignment after acknowledging your role.`) }],
        agentOptions: { provider: PROVIDER, model: bot.model }, delivery: "parent", signal: new AbortController().signal });
      void activation.result.catch(error => this.ctx.logger.warn("Bot execution failed: %s", error.code ?? "unknown"));
      return { id: activation.childId, name: activation.name };
    } finally { dispose(); }
  }
  async send({ teamId, memberId, text }) {
    if (!this.state.teams.some(item => item.id === teamId) || !String(text ?? "").trim()) throw Error("Choose a Team and enter a message.");
    const root = await this.resolve(teamId);
    if (!memberId || memberId === teamId) root.followup(createUserMessage({ content: [{ type: "text", text }], source: { kind: "user" } }));
    else await this.ctx.subagents.sendMessage(root, memberId, [{ type: "text", text }], { signal: new AbortController().signal });
    await this.ctx.sessions.flush(root.session);
    return { accepted: true };
  }
  async execute({ operation, input = {} }) {
    switch (operation) {
      case "save_bot": return this.saveBot(input);
      case "delete_bot": return this.mutate(state => { state.bots = state.bots.filter(bot => bot.id !== input.id); return { deleted: true }; });
      case "create_team": return this.createTeam(input);
      case "add_member": return this.addMember(input);
      case "send_message": return this.send(input);
      case "cancel_member": {
        if (!this.state.teams.some(item => item.id === input.teamId)) throw Error("Unknown Team.");
        const root = await this.resolve(input.teamId);
        const members = await this.ctx.subagents.listDescendants(root.id);
        if (input.memberId !== root.id && !members.some(member => member.id === input.memberId)) throw Error("Member is outside this Team.");
        this.ctx.agents.get(input.memberId)?.cancel({ kind: "user" }, { keepInbox: true });
        return { accepted: true };
      }
      default: throw Error("Unknown Team/Bot operation.");
    }
  }
  async read(teamId, memberId) {
    const base = structuredClone(this.state);
    if (!teamId) return base;
    if (!base.teams.some(item => item.id === teamId)) throw Error("Unknown Team.");
    const root = await this.resolve(teamId);
    const members = await this.ctx.subagents.listDescendants(root.id);
    if (memberId && memberId !== teamId && !members.some(member => member.id === memberId)) throw Error("Member is outside this Team.");
    const binding = this.ctx.oplCodexAgents.state.bindings[memberId || teamId];
    const messages = await this.ctx.sessionQuery.inspectSession(memberId || teamId, session =>
      Array.from({ length: Math.min(100, session.seq) }, (_, index) => session.eventAt(Math.max(0, session.seq - 100) + index))
        .filter(event => ["user/message", "assistant/message"].includes(event?.type)).map(event => structuredClone(event)));
    return { ...base, teamId, memberId, members,
      execution: { threadId: binding?.threadId, status: binding?.attempt?.status },
      tasks: this.ctx.agentTeams.listTasks(root),
      messages };
  }
  async dispose() {
    for (const handle of this.handles.values()) {
      await this.ctx.subagents.drainDescendants([handle.agent]);
      await handle.dispose();
    }
    this.handles.clear();
  }
}

export async function apply(ctx) {
  const service = new TeamBots(ctx, path.join(ctx.oplStudioHostOptions.dshHome, "opl"));
  await service.load();
  ctx.provide("oplTeamBots", service);
  ctx.effect(() => async () => { await service.dispose(); }, "opl-team-bots lifecycle");
}
