import { LlmAdapter, createAssistantMessage } from "@deepseek-ai/dsh-llm";
import { threadPermissionOverrides, turnPermissionOverrides } from "../../../src/host/app-server-protocol.mjs";

const PROVIDER = "opl-codex";
const textOf = (content) => (Array.isArray(content) ? content : [])
  .filter(block => block.type === "text").map(block => block.text).join("\n");
const failure = (code, message) => Object.assign(new Error(message), { code });
const DISPATCH_TOOL = { name: "opl_dsh_call", description: "Call an available DSH tool from the current DSH tool catalog in the developer instructions.",
  inputSchema: { type: "object", properties: { name: { type: "string" }, arguments: { type: "object", additionalProperties: true } }, required: ["name", "arguments"], additionalProperties: false } };
const permissionForMode = mode => ({ "read-only": ":read-only", "workspace-write": ":workspace", "danger-full-access": ":danger-full-access" })[mode];

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
    return (result.data ?? []).map(model => ({ provider: PROVIDER, id: model.id ?? model.model, name: model.displayName ?? model.id ?? model.model }));
  }

  async resolveModel(provider, id) {
    const result = await this.transport.listModels();
    const model = (result.data ?? []).find(item => (item.id ?? item.model) === id);
    return { provider, id, name: model?.displayName ?? id,
      ...(model?.supportedReasoningEfforts?.length ? { reasoning: {
        efforts: model.supportedReasoningEfforts.map(item => ({ id: item.reasoningEffort, name: item.reasoningEffort, description: item.description })),
        defaultEffort: model.defaultReasoningEffort,
      } } : {}) };
  }

  async executionOverrides() {
    const stateDir = this.ctx.oplStudioHostOptions.codexEnvironmentStateDir;
    if (!stateDir) return {};
    // Codex is a parent-owned process, so project the original Superagent
    // account environment per thread instead of changing the App's environment.
    const { agentVariables, workerBin } = await import("dsh-superagent/environment");
    const variables = agentVariables(stateDir);
    const set = Object.fromEntries(Object.entries(variables).filter(([, value]) => value !== undefined));
    const delimiter = process.platform === "win32" ? ";" : ":";
    const directory = workerBin(stateDir);
    set.PATH = [directory, ...(process.env.PATH ?? "").split(delimiter).filter(entry => entry !== directory)].join(delimiter);
    return { config: { shell_environment_policy: { inherit: "all", exclude: Object.keys(variables).filter(name => variables[name] === undefined), set } } };
  }

  async commit(agent, type, data) {
    await this.store.mutate(state => {
      const binding = state.bindings[agent.id] ??= {};
      if (type === "opl/codex-thread") { binding.threadId = data.threadId; binding.toolBridge = "dispatcher-v1"; }
      if (type === "opl/codex-attempt") binding.attempt = data;
      if (type === "opl/codex-inputs") binding.delivered = [...new Set([...(binding.delivered ?? []), ...data.ids])];
    });
  }

  async dispatchTool(request, call) {
    const { tool, arguments: input, callId, threadId } = request.params;
    const name = call.legacy && tool.startsWith("opl_dsh_") ? tool.slice("opl_dsh_".length) : input?.name;
    const args = call.legacy ? input : input?.arguments;
    let response;
    try {
      if ((!call.legacy && tool !== DISPATCH_TOOL.name) || !call.names.has(name) || call.agent !== this.ctx.agents.get(call.agent.id)
        || call.signal.aborted || call.threadId !== threadId) {
        throw failure("team_tool_unavailable", "This tool is not available to this exact Team member.");
      }
      const block = { type: "tool-call", id: callId, name, arguments: JSON.stringify(args ?? {}) };
      // Translate the actual Codex callback into the official advertised-call
      // lifecycle before its native executor records tool/call and tool/result.
      if (call.log) call.agent.session.append("assistant/message", { ...call.log,
        message: createAssistantMessage({ content: [block], source: { provider: PROVIDER, model: call.model } }), stream: [] }, { surfaceOp: "append" });
      const batch = await this.ctx.tools.execute({
        calls: [block],
        agent: call.agent, signal: call.signal, toolSet: call.toolSet, log: call.log
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
    const legacy = Boolean(threadId && binding.toolBridge !== "dispatcher-v1");
    const model = options.model === "default" ? undefined : options.model;
    const cwd = agent.session.header.cwd;
    const execution = await this.executionOverrides();
    const policy = this.ctx.get("sandboxPolicy");
    const selectedMode = policy?.overrideOf(agent.session);
    const permissions = permissionForMode(selectedMode) ?? bot.permissions ?? permissionForMode(policy?.resolve({ session: agent.session }).mode) ?? ":workspace";
    // Codex fixes dynamicTools at thread/start. A stable dispatcher plus the
    // current admitted catalog preserves DSH's enable/disable and preset semantics.
    const instructions = [legacy ? "Use the existing opl_dsh_ prefixed tools for DSH collaboration. Only the tools in the current catalog are admitted."
      : "Use opl_dsh_call with {name, arguments} for the DSH tools below. Only this catalog is available for this turn. Codex native subagents are independent of this DSH Team.",
      bot.role, ...(bot.skills ?? []).map(skill => `Use the installed Skill ${skill}.`),
      ...options.messages.filter(message => message.role === "system").map(message => textOf(message.content)),
      `Current DSH tool catalog: ${JSON.stringify(options.tools ?? [])}`].filter(Boolean).join("\n\n");
    if (!threadId) {
      const result = await this.transport.startThread({ cwd, model, permissions,
        dynamicTools: [DISPATCH_TOOL], developerInstructions: instructions, ...execution });
      threadId = result.thread?.id;
      if (!threadId) throw Error("Codex did not return a persistent Team thread.");
      await this.commit(agent, "opl/codex-thread", { threadId });
    } else {
      await this.transport.resumeThread(threadId, { cwd, excludeTurns: true, ...threadPermissionOverrides(permissions, cwd), developerInstructions: instructions, ...execution });
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
    const boundary = this.ctx.agents.turnBoundaryOf(agent.session);
    const position = boundary.lastStepStartSeq === null ? undefined : agent.session.eventAt(boundary.lastStepStartSeq)?.data;
    const attempt = { ids: pending.map(message => message.id), status: "dispatching" };
    const call = { agent, threadId, legacy, model: options.model, signal: options.signal, toolSet,
      log: position ? { turn: position.turn, step: position.step } : undefined,
      names: new Set((options.tools ?? []).map(tool => tool.name)) };
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
        cwd, ...turnPermissionOverrides(permissions, cwd), ...(model ? { model } : {}), ...(options.reasoningEffort ? { effort: options.reasoningEffort } : {})
      });
      turnId = started.turn?.id;
      if (!turnId) throw Error("Codex did not return a Team turn id.");
      await this.commit(agent, "opl/codex-attempt", { ...attempt, status: "running", turnId });
      if (options.signal.aborted) abort();
      let result;
      for (;;) {
        try {
          result = await this.transport.waitForTurn(turnId);
          break;
        } catch (error) {
          // This adapter owns live tool callbacks until Codex is terminal.
          // A local observer deadline must not dispose them or resend the turn.
          if (error?.code !== "turn_timeout") throw error;
        }
      }
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
