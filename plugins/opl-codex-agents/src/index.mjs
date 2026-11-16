import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { CodexTeamAdapter, PROVIDER } from "./codex-adapter.mjs";
export const name = "opl-codex-agents";
export const inject = ["oplStudioHostOptions", "oplCodexNative", "agents", "sessions", "llm", "tools"];

// Only execution links and delivery receipts live here. DSH retains conversations and Team state.
export class CodexAgentBindings {
  constructor(file) { this.file = file; this.state = { bindings: {} }; this.serial = Promise.resolve(); }
  async load() {
    try { this.state = JSON.parse(await readFile(this.file, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  mutate(operation) {
    const pending = this.serial.then(async () => {
      const next = structuredClone(this.state);
      const result = await operation(next);
      await mkdir(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600 });
      await rename(temporary, this.file);
      this.state = next;
      return result;
    });
    this.serial = pending.catch(() => {});
    return pending;
  }
  setBot(id, bot) { return this.mutate(state => { (state.bindings[id] ??= {}).bot = structuredClone(bot); }); }
}
export async function apply(ctx) {
  ctx.on("webserver/index-inject", table => {
    if (ctx.oplStudioHostOptions.codexEnvironmentStateDir) table.push({ kind: "global", name: "__OPL_CODEX_WORKBENCH_INITIAL_PANEL__", value: "dsh-superagent" });
  });
  const bindings = new CodexAgentBindings(path.join(ctx.oplStudioHostOptions.dshHome, "opl", "codex-agent-bindings.json"));
  await bindings.load();
  const adapter = new CodexTeamAdapter(ctx, ctx.oplCodexNative.transport, bindings);
  ctx.llm.registerAdapter([PROVIDER], adapter);
  ctx.provide("oplCodexAgents", bindings);
  ctx.on("agent/created", async ({ agent }) => {
    const inherited = bindings.state.bindings[agent.session.header.parentSession]?.bot;
    if (inherited && !bindings.state.bindings[agent.id]?.bot) await bindings.setBot(agent.id, inherited);
  });
  ctx.effect(() => () => adapter.dispose(), "opl-codex-agents lifecycle");
}
