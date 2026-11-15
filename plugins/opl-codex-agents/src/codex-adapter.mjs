import { LlmAdapter } from "@deepseek-ai/dsh-llm";

const PROVIDER = "opl-codex";
const textOf = (content) => (Array.isArray(content) ? content : [])
  .filter(block => block.type === "text").map(block => block.text).join("\n");
const failure = (code, message) => Object.assign(new Error(message), { code });

/** Official DSH owns coordination. This adapter owns only its Codex execution binding. */
export class CodexTeamAdapter extends LlmAdapter {
  constructor(ctx, transport, store) {
    super();
    this.ctx = ctx;
    this.transport = transport;
    this.store = store;
    this.calls = new Map();
    this.onRequest = request => {
      if (request.method !== "item/tool/call") return;
      const call = this.calls.get(request.params?.threadId);
      if (!call) return;
      void this.dispatchTool(request, call);
    };
    transport.on("serverRequest", this.onRequest);
  }

  providerInfo() { return { id: PROVIDER, name: "Codex" }; }
  async listModels() {
    const result = await this.transport.listModels();
    return (result.data ?? []).map(model => ({ id: model.id ?? model.model, name: model.displayName ?? model.id ?? model.model }));
  }

  async commit(agent, type, data) {
    await this.store.mutate(state => {
      const binding = state.bindings[agent.id] ??= {};
      if (type === "opl/codex-thread") binding.threadId = data.threadId;
      if (type === "opl/codex-attempt") binding.attempt = data;
      if (type === "opl/codex-inputs") binding.delivered = [...new Set([...(binding.delivered ?? []), ...data.ids])];
    });
  }

  async dispatchTool(request, call) {
    const { tool, arguments: args, callId, threadId } = request.params;
    let response;
    try {
      if (!call.names.has(tool) || call.agent !== this.ctx.agents.get(call.agent.id)
        || call.signal.aborted || call.threadId !== threadId) {
        throw failure("team_tool_unavailable", "This tool is not available to this exact Team member.");
      }
      const batch = await this.ctx.tools.execute({
        calls: [{ type: "tool-call", id: callId, name: call.names.get(tool), arguments: JSON.stringify(args ?? {}) }],
        agent: call.agent, signal: call.signal, toolSet: call.toolSet
      });
      const result = batch.results?.[0];
      if (batch.results?.length !== 1 || result.callId !== callId) throw Error("Uncorrelated Team tool result.");
      response = { success: result.result?.isError !== true,
        contentItems: [{ type: "inputText", text: JSON.stringify(result.result) }] };
    } catch (error) {
      response = { success: false, contentItems: [{ type: "inputText", text: error.message }] };
    }
    this.transport.respondToServerRequest(request.id, { result: response });
  }

  async *stream(options) {
    const agent = this.ctx.agents.requireInitiator();
    const binding = this.store.state.bindings[agent.id] ?? {};
    const bot = binding.bot ?? {};
    const previous = binding.attempt;
    // Official teammate messages have agent-message sources and remain valid inputs.
    const messages = options.messages.filter(message => message.role === "user" && message.id);
    const delivered = new Set(binding.delivered ?? []);
    let pending = messages.filter(message => !delivered.has(message.id));
    let threadId = binding?.threadId;
    const tools = (options.tools ?? []).map(tool => ({ type: "function", name: `opl_dsh_${tool.name}`, description: tool.description, inputSchema: tool.parameters }));
    const model = options.model === "default" ? undefined : options.model;
    const cwd = agent.session.header.cwd;
    if (!threadId) {
      const result = await this.transport.startThread({ cwd, model, permissions: bot.permissions ?? ":workspace",
        dynamicTools: tools, developerInstructions: ["Use the opl_dsh_ tools for DSH Team collaboration. Tool names in DSH guidance below use that prefix. Codex native subagents are independent of this Team.", bot.role, ...(bot.skills ?? []).map(skill => `Use the installed Skill ${skill}.`), ...options.messages.filter(message => message.role === "system")
          .map(message => textOf(message.content))].filter(Boolean).join("\n\n") });
      threadId = result.thread?.id;
      if (!threadId) throw Error("Codex did not return a persistent Team thread.");
      await this.commit(agent, "opl/codex-thread", { threadId });
    } else {
      await this.transport.resumeThread(threadId, { cwd });
    }
    if (previous && previous.status !== "settled") {
      if (!previous.turnId) throw failure("team_execution_unconfirmed", "Previous dispatch is unconfirmed. Inspect the linked Codex thread before continuing.");
      const read = await this.transport.readThread(threadId, true);
      const turn = read.thread?.turns?.find(item => item.id === previous.turnId);
      if (!turn || !["completed", "failed", "interrupted", "cancelled"].includes(turn.status)) {
        throw failure("team_execution_unconfirmed", "Previous Codex turn is not confirmed terminal. Inspect it before continuing.");
      }
      await this.commit(agent, "opl/codex-inputs", { ids: previous.ids });
      await this.commit(agent, "opl/codex-attempt", { ...previous, status: "settled" });
      pending = pending.filter(message => !previous.ids.includes(message.id));
    }
    if (!pending.length) throw failure("team_input_unavailable", "No new durable Team input is available.");
    const prompt = pending.map(message => textOf(message.content)).filter(Boolean).join("\n\n");
    if (!prompt) throw failure("team_input_unsupported", "This Team adapter currently requires text input.");
    const toolSet = await this.ctx.tools.resolve({ agent, signal: options.signal, modelSelection: { provider: options.provider, model: options.model } });
    const attempt = { ids: pending.map(message => message.id), status: "dispatching" };
    const call = { agent, threadId, signal: options.signal, toolSet, names: new Map((options.tools ?? []).map(tool => [`opl_dsh_${tool.name}`, tool.name])) };
    this.calls.set(threadId, call);
    let turnId;
    const abort = () => {
      if (turnId) void this.transport.request("turn/interrupt", { threadId, turnId }).catch(() => {});
    };
    options.signal.addEventListener("abort", abort, { once: true });
    try {
      options.signal.throwIfAborted();
      await this.commit(agent, "opl/codex-attempt", attempt);
      const started = await this.transport.startTurn(threadId, prompt, [], {
        cwd, ...(model ? { model } : {}), ...(options.reasoningEffort ? { effort: options.reasoningEffort } : {})
      });
      turnId = started.turn?.id;
      if (!turnId) throw Error("Codex did not return a Team turn id.");
      await this.commit(agent, "opl/codex-attempt", { ...attempt, status: "running", turnId });
      if (options.signal.aborted) abort();
      const result = await this.transport.waitForTurn(turnId);
      const status = result.notification?.turn?.status ?? result.notification?.status;
      await this.commit(agent, "opl/codex-inputs", { ids: attempt.ids });
      await this.commit(agent, "opl/codex-attempt", { ...attempt, status: "settled", turnId });
      if (status !== "completed") throw failure("team_codex_turn_failed", `Codex Team turn ended as ${status ?? "unknown"}.`);
      const text = result.finalMessage ?? "";
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text };
      yield { type: "block-end", index: 0, block: { type: "text", text } };
      yield { type: "finish", reason: "stop" };
    } finally {
      toolSet.dispose();
      options.signal.removeEventListener("abort", abort);
      if (this.calls.get(threadId) === call) this.calls.delete(threadId);
    }
  }

  dispose() { this.transport.off("serverRequest", this.onRequest); }
}

export { PROVIDER };
