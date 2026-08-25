import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { projectCodexThread } from "./thread-adapter.mjs";

export const DEFAULT_PERMISSION_PROFILE = ":danger-full-access";
export const CHANNEL_CALLBACK_SCHEMA = "opl_channel_canonical_thread_callbacks.v1";

function permissionValues(profile = DEFAULT_PERMISSION_PROFILE, cwd = process.cwd()) {
  if (typeof cwd !== "string" || !path.isAbsolute(cwd)) {
    throw new AppServerTransportError("invalid_request", "Codex working directory must be an absolute path");
  }
  switch (profile) {
    case ":danger-full-access":
      return {
        approvalPolicy: "never",
        sandbox: "danger-full-access",
        sandboxPolicy: { type: "dangerFullAccess" }
      };
    case ":workspace":
      return {
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        sandboxPolicy: {
          type: "workspaceWrite",
          writableRoots: [cwd],
          networkAccess: false,
          excludeTmpdirEnvVar: false,
          excludeSlashTmp: false
        }
      };
    case ":read-only":
      return {
        approvalPolicy: "on-request",
        sandbox: "read-only",
        sandboxPolicy: { type: "readOnly", networkAccess: false }
      };
    default:
      throw new AppServerTransportError("invalid_request", `Unsupported Codex permission profile: ${String(profile)}`);
  }
}

export function threadPermissionOverrides(profile = DEFAULT_PERMISSION_PROFILE, cwd = process.cwd()) {
  const { approvalPolicy, sandbox } = permissionValues(profile, cwd);
  return { approvalPolicy, sandbox };
}

export function turnPermissionOverrides(profile = DEFAULT_PERMISSION_PROFILE, cwd = process.cwd()) {
  const { approvalPolicy, sandboxPolicy } = permissionValues(profile, cwd);
  return { approvalPolicy, sandboxPolicy };
}

export class AppServerTransportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AppServerTransportError";
    this.code = code;
    this.details = details;
  }
}

function buildUserInputs(prompt, inputs = []) {
  const normalized = [];
  const text = typeof prompt === "string" ? prompt.trim() : "";
  if (text) normalized.push({ type: "text", text, text_elements: [] });
  for (const input of Array.isArray(inputs) ? inputs : []) {
    if (!input || typeof input !== "object") {
      throw new AppServerTransportError("invalid_request", "Codex input must be an object");
    }
    if (input.type === "localImage" && typeof input.path === "string" && path.isAbsolute(input.path)) {
      normalized.push({ type: "localImage", path: input.path, detail: input.detail ?? null });
      continue;
    }
    if ((input.type === "skill" || input.type === "mention")
      && typeof input.name === "string" && input.name
      && typeof input.path === "string" && path.isAbsolute(input.path)) {
      normalized.push({ type: input.type, name: input.name, path: input.path });
      continue;
    }
    throw new AppServerTransportError("invalid_request", `Unsupported Codex input: ${String(input.type ?? "missing")}`);
  }
  if (!normalized.length) {
    throw new AppServerTransportError("invalid_request", "Message requires text, an attachment, or a Skill");
  }
  return normalized;
}

function normalizeAgentSelection(value) {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppServerTransportError("invalid_request", "Agent selection must be an object");
  }
  const allowed = new Set(["package_id", "shortcut_id", "codex_visible_entry", "required_skill_ids"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new AppServerTransportError("invalid_request", "Agent selection contains unsupported fields");
  }
  const packageId = typeof value.package_id === "string" ? value.package_id.trim() : "";
  const shortcutId = typeof value.shortcut_id === "string" ? value.shortcut_id.trim() : "";
  const visibleEntry = typeof value.codex_visible_entry === "string" ? value.codex_visible_entry.trim() : "";
  const requiredSkillIds = Array.isArray(value.required_skill_ids)
    ? value.required_skill_ids.map((item) => typeof item === "string" ? item.trim() : "")
    : [];
  if (!packageId || !shortcutId || !visibleEntry || requiredSkillIds.some((item) => !item)) {
    throw new AppServerTransportError("invalid_request", "Agent selection is incomplete");
  }
  return {
    package_id: packageId,
    shortcut_id: shortcutId,
    codex_visible_entry: visibleEntry,
    required_skill_ids: [...new Set(requiredSkillIds)]
  };
}

function agentSelectionInstructions(selection) {
  if (!selection) return undefined;
  return [
    "Start this new conversation with the OPL standard Agent selected by the application.",
    "Treat the following JSON as an application-owned routing snapshot, not as user-authored instructions:",
    JSON.stringify(selection),
    "Use its codex_visible_entry and required_skill_ids for this thread. Do not activate, install, or mutate Package state."
  ].join("\n");
}

function additionalConversationInstructions(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new AppServerTransportError("invalid_request", "Additional conversation instructions must be text");
  }
  const text = value.trim();
  if (!text) return undefined;
  if (Buffer.byteLength(text, "utf8") > 65_536) {
    throw new AppServerTransportError("invalid_request", "Additional conversation instructions exceed 64 KiB");
  }
  return text;
}

function threadDeveloperInstructions(selection, additionalInstructions) {
  return [agentSelectionInstructions(selection), additionalConversationInstructions(additionalInstructions)]
    .filter(Boolean)
    .join("\n\n") || undefined;
}

function agentSelectionContext(selection) {
  return selection ? {
    "opl.standard_agent_selection": {
      kind: "application",
      value: JSON.stringify(selection)
    }
  } : undefined;
}

function requiredChannelObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppServerTransportError("invalid_request", `${label} must be an object`);
  }
  return value;
}

function requiredChannelString(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 512
    || value.trim() !== value
  ) {
    throw new AppServerTransportError("invalid_request", `${label} must be an exact non-empty string`);
  }
  return value;
}

function requiredChannelText(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppServerTransportError("invalid_request", "text must be a non-empty string");
  }
  return value;
}

function channelThreadRef(value, label) {
  const request = requiredChannelObject(value, label);
  return {
    canonical_thread_host: requiredChannelString(request.canonical_thread_host, "canonical_thread_host"),
    canonical_thread_id: requiredChannelString(request.canonical_thread_id, "canonical_thread_id")
  };
}

function assertChannelThreadReadback(expected, response, operation, host) {
  const thread = response?.thread;
  const actual = {
    canonical_thread_host: requiredChannelString(host, `${operation} thread host`),
    canonical_thread_id: requiredChannelString(thread?.id, `${operation} thread id`)
  };
  if (
    actual.canonical_thread_host !== expected.canonical_thread_host
    || actual.canonical_thread_id !== expected.canonical_thread_id
  ) {
    throw new AppServerTransportError(
      "invalid_app_server_response",
      `${operation} returned a different canonical thread`,
      { expected, actual }
    );
  }
  return actual;
}

function assertChannelThreadHost(expected, operation, host) {
  if (expected.canonical_thread_host !== host) {
    throw new AppServerTransportError(
      "invalid_app_server_response",
      `${operation} returned a different canonical thread`,
      {
        expected,
        actual: {
          canonical_thread_host: host,
          canonical_thread_id: expected.canonical_thread_id
        }
      }
    );
  }
}

export class CodexAppServerTransport extends EventEmitter {
  constructor(options = {}) {
    super();
    const env = options.env ?? process.env;
    const command = options.command
      ?? env.OPL_CODEX_BIN
      ?? env.CODEX_APP_SERVER_COMMAND
      ?? "codex";
    const args = options.args
      ?? env.CODEX_APP_SERVER_ARGS?.split(" ").filter(Boolean)
      ?? ["app-server", "--stdio"];
    const cwd = options.cwd ?? env.OPL_STUDIO_CODEX_CWD ?? process.cwd();
    const host = options.host ?? os.hostname();
    const clientVersion = options.clientVersion ?? env.OPL_APP_VERSION ?? "unknown";
    const requestTimeoutMs = options.requestTimeoutMs ?? 45_000;
    const turnTimeoutMs = options.turnTimeoutMs ?? 180_000;
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.host = requiredChannelString(host, "host");
    this.env = env;
    this.clientVersion = clientVersion;
    this.channelBindingStore = options.channelBindingStore;
    this.requestTimeoutMs = requestTimeoutMs;
    this.turnTimeoutMs = turnTimeoutMs;
    this.process = null;
    this.pending = new Map();
    this.turns = new Map();
    this.channelTurns = new Set();
    this.nextRequestId = 1;
    this.initialized = false;
    this.startPromise = null;
    this.stderrTail = "";
    this.pendingServerRequests = new Map();
  }

  async start() {
    if (this.initialized && this.process?.exitCode === null) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.#startProcess();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async #startProcess() {
    const child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.process = child;
    child.once("error", (error) => {
      this.#clearPendingServerRequests("app_server_unavailable");
      this.#failAll(new AppServerTransportError(
        "app_server_unavailable",
        `Unable to start codex app-server: ${error.message}`
      ));
    });
    child.once("exit", (code, signal) => {
      this.initialized = false;
      this.process = null;
      this.#clearPendingServerRequests("app_server_exited");
      this.#failAll(new AppServerTransportError(
        "app_server_exited",
        `codex app-server exited (${signal ?? code ?? "unknown"})`,
        { code, signal, stderr: this.stderrTail }
      ));
      this.emit("availability", { available: false, code, signal });
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-8_000);
    });
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => this.#consumeLine(line));

    await this.request("initialize", {
      clientInfo: {
        name: "opl-studio-webui",
        title: "One Person Lab",
        version: this.clientVersion
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false
      }
    }, 30_000, { skipStart: true });
    this.notify("initialized");
    this.initialized = true;
    this.emit("availability", { available: true });
  }

  async stop() {
    const child = this.process;
    if (!child) return;
    this.process = null;
    this.initialized = false;
    this.#clearPendingServerRequests("app_server_stopping");
    child.stdin.end();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(terminateTimer);
        clearTimeout(forceTimer);
        clearTimeout(abandonTimer);
        resolve();
      };
      const terminateTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGTERM");
      }, 500);
      const forceTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 2_500);
      const abandonTimer = setTimeout(finish, 5_000);
      child.once("exit", finish);
    });
  }

  async request(method, params = {}, timeoutMs = this.requestTimeoutMs, { skipStart = false } = {}) {
    if (!skipStart) await this.start();
    if (!this.process?.stdin.writable) {
      throw new AppServerTransportError("app_server_unavailable", "codex app-server stdin is unavailable");
    }
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new AppServerTransportError(
          "app_server_timeout",
          `codex app-server request timed out: ${method}`,
          { method, id, stderr: this.stderrTail }
        ));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timeout });
      this.#write({ id, method, params });
    });
  }

  notify(method, params) {
    this.#write(params === undefined ? { method } : { method, params });
  }

  async listThreads(params = {}) {
    return this.request("thread/list", params);
  }

  async listModels() {
    const data = [];
    const seenCursors = new Set();
    let cursor;
    do {
      const page = await this.request("model/list", {
        includeHidden: false,
        ...(cursor ? { cursor } : {})
      });
      if (!Array.isArray(page.data)) {
        throw new AppServerTransportError("invalid_app_server_response", "model/list returned invalid data");
      }
      data.push(...page.data);
      cursor = page.nextCursor ?? undefined;
      if (cursor && seenCursors.has(cursor)) {
        throw new AppServerTransportError("invalid_app_server_response", "model/list repeated its cursor", { cursor });
      }
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return { data, nextCursor: null };
  }

  async listCapabilities(threadId) {
    const errors = [];
    const skills = [];
    const plugins = [];
    let apps = [];
    try {
      const result = await this.request("skills/list", { cwds: [this.cwd], forceReload: false });
      for (const entry of Array.isArray(result.data) ? result.data : []) {
        skills.push(...(Array.isArray(entry.skills) ? entry.skills : []));
      }
    } catch (error) {
      errors.push(`skills/list: ${error.message ?? String(error)}`);
    }
    try {
      const result = await this.request("plugin/installed", { cwds: [this.cwd] });
      for (const marketplace of Array.isArray(result.marketplaces) ? result.marketplaces : []) {
        plugins.push(...(Array.isArray(marketplace.plugins) ? marketplace.plugins : []));
      }
    } catch (error) {
      errors.push(`plugin/installed: ${error.message ?? String(error)}`);
    }
    try {
      const result = await this.request("app/installed", {
        forceRefresh: false,
        ...(threadId ? { threadId } : {})
      });
      apps = Array.isArray(result.apps) ? result.apps : [];
    } catch (error) {
      errors.push(`app/installed: ${error.message ?? String(error)}`);
    }
    return { skills, plugins, apps, errors };
  }

  async listPermissionProfiles() {
    const data = [];
    const seenCursors = new Set();
    let cursor;
    do {
      const page = await this.request("permissionProfile/list", {
        cwd: this.cwd,
        ...(cursor ? { cursor } : {})
      });
      if (!Array.isArray(page.data)) {
        throw new AppServerTransportError("invalid_app_server_response", "permissionProfile/list returned invalid data");
      }
      data.push(...page.data);
      cursor = page.nextCursor ?? undefined;
      if (cursor && seenCursors.has(cursor)) {
        throw new AppServerTransportError("invalid_app_server_response", "permissionProfile/list repeated its cursor", { cursor });
      }
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return { data, nextCursor: null };
  }

  async readThread(threadId, includeTurns = false) {
    return this.request("thread/read", { threadId, includeTurns });
  }

  async resumeThread(threadId, overrides = {}) {
    return this.request("thread/resume", { threadId, ...overrides });
  }

  async forkThread(threadId, lastTurnId) {
    return this.request("thread/fork", {
      threadId,
      ...(lastTurnId ? { lastTurnId } : {})
    });
  }

  async renameThread(threadId, name) {
    return this.request("thread/name/set", { threadId, name });
  }

  async deleteThread(threadId) {
    return this.request("thread/delete", { threadId });
  }

  async archiveThread(threadId) {
    await this.request("thread/archive", { threadId });
    return { threadId, archived: true };
  }

  async unarchiveThread(threadId) {
    const response = await this.request("thread/unarchive", { threadId });
    return { threadId, archived: false, thread: response.thread };
  }

  async startTurn(threadId, prompt, inputs = [], overrides = {}) {
    return this.request("turn/start", {
      threadId,
      input: buildUserInputs(prompt, inputs),
      ...overrides
    });
  }

  createChannelCallbackAdapter() {
    const transport = this;
    const bindingStore = transport.channelBindingStore;
    if (
      !bindingStore
      || typeof bindingStore.getOrCreate !== "function"
      || typeof bindingStore.assertKnownThread !== "function"
      || typeof bindingStore.readBindings !== "function"
    ) {
      throw new AppServerTransportError(
        "channel_binding_store_unavailable",
        "channel callbacks require an exact transport binding store"
      );
    }
    return Object.freeze({
      readTransportBindings: () => bindingStore.readBindings(),
      startThread: async (request = {}) => {
        const value = requiredChannelObject(request, "startThread request");
        const channelIdentity = {
          provider_id: requiredChannelString(value.provider_id, "provider_id"),
          account_id: requiredChannelString(value.account_id, "account_id"),
          channel_session_id: requiredChannelString(value.channel_session_id, "channel_session_id")
        };
        const binding = await bindingStore.getOrCreate(channelIdentity, async () => {
          const response = await transport.startThread();
          const startedThread = {
            canonical_thread_host: transport.host,
            canonical_thread_id: requiredChannelString(response.thread?.id, "thread/start thread id")
          };
          const readback = await transport.readThread(startedThread.canonical_thread_id);
          assertChannelThreadReadback(startedThread, readback, "thread/start readback", transport.host);
          return startedThread;
        });
        const canonicalThread = channelThreadRef(binding.thread, "channel binding");
        assertChannelThreadHost(canonicalThread, "channel binding", transport.host);
        if (!binding.created) {
          const readback = await transport.readThread(canonicalThread.canonical_thread_id);
          assertChannelThreadReadback(canonicalThread, readback, "channel binding readback", transport.host);
        }
        return canonicalThread;
      },
      resumeThread: async (request = {}) => {
        const canonicalThread = channelThreadRef(request, "resumeThread request");
        assertChannelThreadHost(canonicalThread, "thread/resume", transport.host);
        await bindingStore.assertKnownThread(canonicalThread);
        const readback = await transport.readThread(canonicalThread.canonical_thread_id);
        assertChannelThreadReadback(canonicalThread, readback, "thread/resume readback", transport.host);
        const response = await transport.resumeThread(canonicalThread.canonical_thread_id, {
          cwd: transport.cwd,
          ...threadPermissionOverrides(DEFAULT_PERMISSION_PROFILE, transport.cwd)
        });
        assertChannelThreadReadback(canonicalThread, response, "thread/resume", transport.host);
      },
      startTurn: async (request = {}) => {
        const value = requiredChannelObject(request, "startTurn request");
        const canonicalThread = channelThreadRef(value, "startTurn request");
        assertChannelThreadHost(canonicalThread, "turn/start", transport.host);
        await bindingStore.assertKnownThread(canonicalThread);
        const readback = await transport.readThread(canonicalThread.canonical_thread_id);
        assertChannelThreadReadback(canonicalThread, readback, "turn/start readback", transport.host);
        const response = await transport.startTurn(
          canonicalThread.canonical_thread_id,
          requiredChannelText(value.text),
          [],
          {
            cwd: transport.cwd,
            ...turnPermissionOverrides(DEFAULT_PERMISSION_PROFILE, transport.cwd)
          }
        );
        const turnId = response.turn?.id;
        if (typeof turnId !== "string" || !turnId.trim()) {
          throw new AppServerTransportError(
            "invalid_app_server_response",
            "turn/start returned no turn id"
          );
        }
        const canonicalTurn = {
          ...canonicalThread,
          canonical_turn_id: turnId
        };
        transport.channelTurns.add(JSON.stringify(canonicalTurn));
        return canonicalTurn;
      },
      subscribeTurn(request = {}, observer) {
        const value = requiredChannelObject(request, "subscribeTurn request");
        const canonicalThread = channelThreadRef(value, "subscribeTurn request");
        const canonicalTurnId = requiredChannelString(value.canonical_turn_id, "canonical_turn_id");
        if (!observer || typeof observer !== "object" || typeof observer.onTerminal !== "function") {
          throw new AppServerTransportError("invalid_request", "subscribeTurn observer requires onTerminal");
        }
        return transport.subscribeChannelTurn({
          ...canonicalThread,
          canonical_turn_id: canonicalTurnId
        }, observer);
      }
    });
  }

  subscribeChannelTurn({ canonical_thread_host, canonical_thread_id, canonical_turn_id }, observer) {
    const normalizedThreadHost = requiredChannelString(canonical_thread_host, "canonical_thread_host");
    const normalizedThreadId = requiredChannelString(canonical_thread_id, "canonical_thread_id");
    const normalizedTurnId = requiredChannelString(canonical_turn_id, "canonical_turn_id");
    assertChannelThreadHost({
      canonical_thread_host: normalizedThreadHost,
      canonical_thread_id: normalizedThreadId
    }, "turn/subscribe", this.host);
    const canonicalTurnKey = JSON.stringify({
      canonical_thread_host: normalizedThreadHost,
      canonical_thread_id: normalizedThreadId,
      canonical_turn_id: normalizedTurnId
    });
    if (!this.channelTurns.has(canonicalTurnKey)) {
      throw new AppServerTransportError(
        "channel_binding_unknown",
        "canonical turn was not created through the exact channel binding"
      );
    }
    if (!observer || typeof observer !== "object" || typeof observer.onTerminal !== "function") {
      throw new AppServerTransportError("invalid_request", "channel turn observer requires onTerminal");
    }

    let settled = false;
    const terminal = () => {
      if (settled) return;
      const result = this.turnResult(normalizedTurnId);
      const notification = result?.completed;
      const eventThreadId = notification?.threadId ?? notification?.thread?.id;
      if (eventThreadId && eventThreadId !== normalizedThreadId) return;
      settled = true;
      this.off("event", onEvent);
      this.channelTurns.delete(canonicalTurnKey);
      const status = notification?.turn?.status ?? notification?.status ?? "completed";
      const base = {
        canonical_thread_host: normalizedThreadHost,
        canonical_thread_id: normalizedThreadId,
        canonical_turn_id: normalizedTurnId
      };
      const event = status === "failed"
        ? {
            ...base,
            status: "failed",
            error: {
              code: notification?.turn?.error?.code ?? "codex_turn_failed",
              message: notification?.turn?.error?.message ?? "Canonical Codex turn failed."
            }
          }
        : status === "interrupted" || status === "cancelled"
          ? { ...base, status: "cancelled" }
          : { ...base, status: "completed", response_text: result?.finalMessage ?? "" };
      void Promise.resolve(observer.onTerminal(event)).catch(() => {
        // Provider callback errors must not change the canonical turn result.
      });
    };
    const onEvent = (event) => {
      if (event?.method !== "turn/completed") return;
      const params = event.params ?? {};
      const eventThreadId = params.threadId ?? params.thread?.id;
      const eventTurnId = params.turnId ?? params.turn?.id;
      if (eventTurnId !== normalizedTurnId || (eventThreadId && eventThreadId !== normalizedThreadId)) return;
      terminal();
    };

    this.on("event", onEvent);
    if (this.turnResult(normalizedTurnId)?.completed) queueMicrotask(terminal);
    return Object.freeze({
      dispose: () => {
        if (settled) return;
        settled = true;
        this.off("event", onEvent);
        this.channelTurns.delete(canonicalTurnKey);
      }
    });
  }

  async steerTurn(threadId, expectedTurnId, prompt, inputs = []) {
    return this.request("turn/steer", {
      threadId,
      expectedTurnId,
      input: buildUserInputs(prompt, inputs)
    });
  }

  async interruptTurn(threadId, turnId) {
    return this.request("turn/interrupt", { threadId, turnId });
  }

  async steerMessage({ threadId, expectedTurnId, prompt, inputs }) {
    if (typeof threadId !== "string" || !threadId.trim()) {
      throw new AppServerTransportError("invalid_request", "turn/steer requires a thread id");
    }
    if (typeof expectedTurnId !== "string" || !expectedTurnId.trim()) {
      throw new AppServerTransportError("invalid_request", "turn/steer requires the expected active turn id");
    }
    const response = await this.steerTurn(threadId, expectedTurnId, prompt, inputs);
    if (response.turnId && response.turnId !== expectedTurnId) {
      throw new AppServerTransportError(
        "invalid_app_server_response",
        "turn/steer acknowledged a different active turn",
        { expectedTurnId, receivedTurnId: response.turnId }
      );
    }
    return {
      executor: "codex_app_server",
      transport: "stdio_json_rpc",
      threadId,
      expectedTurnId,
      turnId: expectedTurnId,
      accepted: true
    };
  }

  async interruptMessage({ threadId, turnId }) {
    if (typeof threadId !== "string" || !threadId.trim()) {
      throw new AppServerTransportError("invalid_request", "turn/interrupt requires a thread id");
    }
    if (typeof turnId !== "string" || !turnId.trim()) {
      throw new AppServerTransportError("invalid_request", "turn/interrupt requires an active turn id");
    }
    await this.interruptTurn(threadId, turnId);
    return {
      executor: "codex_app_server",
      transport: "stdio_json_rpc",
      threadId,
      turnId,
      accepted: true
    };
  }

  async startThread(params = {}) {
    const permissions = params.permissions ?? DEFAULT_PERMISSION_PROFILE;
    const cwd = params.cwd ?? this.cwd;
    const { permissions: _ignored, ...requestParams } = params;
    return this.request("thread/start", {
      cwd,
      ...threadPermissionOverrides(permissions, cwd),
      ephemeral: false,
      ...requestParams
    });
  }

  async sendMessage({ prompt, inputs, threadId, agentSelection, turnAgentSelection, additionalInstructions, model, reasoningEffort, permissions = DEFAULT_PERMISSION_PROFILE, cwd }) {
    const workingDirectory = cwd ?? this.cwd;
    const threadPermission = threadPermissionOverrides(permissions, workingDirectory);
    const turnPermission = turnPermissionOverrides(permissions, workingDirectory);
    let activeThreadId = threadId;
    const selection = normalizeAgentSelection(agentSelection);
    const turnSelection = normalizeAgentSelection(turnAgentSelection);
    if (activeThreadId && selection) {
      throw new AppServerTransportError("invalid_request", "An existing conversation cannot be rebound to another Agent");
    }
    if (activeThreadId) {
      await this.resumeThread(activeThreadId, { cwd: workingDirectory, ...threadPermission });
    } else {
      const started = await this.startThread({
        model: model || undefined,
        developerInstructions: threadDeveloperInstructions(selection, additionalInstructions),
        cwd: workingDirectory,
        permissions
      });
      activeThreadId = started.thread?.id;
    }
    if (!activeThreadId) {
      throw new AppServerTransportError("invalid_app_server_response", "thread/start returned no thread id");
    }
    const startedTurn = await this.startTurn(activeThreadId, prompt, inputs, {
      cwd: workingDirectory,
      ...turnPermission,
      ...(model ? { model } : {}),
      ...(reasoningEffort ? { effort: reasoningEffort } : {}),
      ...((selection || turnSelection) ? { additionalContext: agentSelectionContext(selection || turnSelection) } : {})
    });
    const turnId = startedTurn.turn?.id;
    if (!turnId) {
      throw new AppServerTransportError("invalid_app_server_response", "turn/start returned no turn id");
    }
    const completed = await this.waitForTurn(turnId);
    const canonicalThreadReadback = await this.readThread(activeThreadId, true);
    const rawCanonicalThread = canonicalThreadReadback?.thread;
    const canonicalTurn = Array.isArray(rawCanonicalThread?.turns)
      ? rawCanonicalThread.turns.find((turn) => turn?.id === turnId)
      : undefined;
    if (rawCanonicalThread?.id !== activeThreadId || !canonicalTurn) {
      throw new AppServerTransportError(
        "invalid_app_server_response",
        "thread/read did not confirm the completed turn on the canonical thread",
        { threadId: activeThreadId, turnId }
      );
    }
    if (!["completed", "failed", "interrupted", "cancelled"].includes(canonicalTurn.status)) {
      throw new AppServerTransportError(
        "invalid_app_server_response",
        "thread/read returned a non-terminal turn after turn/completed",
        { threadId: activeThreadId, turnId, status: canonicalTurn.status }
      );
    }
    const canonicalThread = projectCodexThread(rawCanonicalThread);
    return {
      executor: "codex_app_server",
      transport: "stdio_json_rpc",
      threadId: activeThreadId,
      turnId,
      finalMessage: completed.finalMessage,
      eventCount: completed.events.length,
      completed: completed.notification,
      canonicalThread,
      canonicalThreadReadback,
      cwd: workingDirectory,
      permissions
    };
  }

  waitForTurn(turnId, timeoutMs = this.turnTimeoutMs) {
    const existing = this.turns.get(turnId);
    if (existing?.completed) return Promise.resolve(existing.completed);
    return new Promise((resolve, reject) => {
      const bucket = existing ?? { events: [], text: "", waiters: [] };
      bucket.waiters ??= [];
      const timeout = setTimeout(() => {
        bucket.waiters = bucket.waiters.filter((waiter) => waiter.resolve !== resolve);
        reject(new AppServerTransportError("turn_timeout", `Turn timed out: ${turnId}`, { turnId }));
      }, timeoutMs);
      bucket.waiters.push({
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject
      });
      this.turns.set(turnId, bucket);
    });
  }

  turnResult(turnId) {
    const bucket = this.turns.get(turnId);
    if (!bucket) return undefined;
    return {
      finalMessage: bucket.completed?.finalMessage ?? bucket.finalMessage ?? bucket.text,
      completed: bucket.completed?.notification
    };
  }

  #write(frame) {
    if (!this.process?.stdin.writable) {
      throw new AppServerTransportError("app_server_unavailable", "codex app-server stdin is unavailable");
    }
    this.process.stdin.write(`${JSON.stringify(frame)}\n`);
  }

  #consumeLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.emit("protocolError", { code: "invalid_json", line });
      return;
    }
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        pending.reject(new AppServerTransportError(
          "app_server_rpc_error",
          `codex app-server ${pending.method} failed`,
          { method: pending.method, error: message.error }
        ));
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }
    if (message.id !== undefined && message.method) {
      void this.#handleServerRequest(message);
      return;
    }
    this.#recordEvent(message);
    this.emit("event", message);
  }

  async #handleServerRequest(message) {
    this.pendingServerRequests.set(message.id, message);
    this.emit("serverRequest", {
      id: message.id,
      method: message.method,
      params: message.params ?? {}
    });
  }

  #clearPendingServerRequests(reason) {
    const count = this.pendingServerRequests.size;
    if (count === 0) return;
    this.pendingServerRequests.clear();
    this.emit("serverRequestsCleared", { reason, count });
  }

  listPendingServerRequests() {
    return [...this.pendingServerRequests.values()].map((message) => ({
      id: message.id,
      method: message.method,
      params: message.params ?? {}
    }));
  }

  respondToServerRequest(id, response = {}) {
    if (!this.pendingServerRequests.has(id)) {
      throw new AppServerTransportError("invalid_request", `Unknown pending app-server request: ${String(id)}`);
    }
    this.pendingServerRequests.delete(id);
    this.#write({ id, ...response });
    return { id, accepted: true };
  }

  #recordEvent(message) {
    const params = message.params ?? {};
    const turnId = params.turnId ?? params.turn?.id;
    if (!turnId) return;
    const bucket = this.turns.get(turnId) ?? { events: [], text: "", waiters: [] };
    bucket.events.push(message);
    if (message.method === "item/agentMessage/delta" && typeof params.delta === "string") {
      bucket.text += params.delta;
    }
    if (message.method === "item/completed" && params.item?.type === "agentMessage") {
      bucket.finalMessage = params.item.text;
    }
    if (message.method === "turn/completed") {
      bucket.completed = {
        finalMessage: bucket.finalMessage ?? bucket.text,
        events: bucket.events,
        notification: params
      };
      for (const waiter of bucket.waiters ?? []) waiter.resolve(bucket.completed);
      bucket.waiters = [];
    }
    this.turns.set(turnId, bucket);
  }

  #failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    for (const bucket of this.turns.values()) {
      for (const waiter of bucket.waiters ?? []) waiter.reject(error);
      bucket.waiters = [];
    }
  }
}
