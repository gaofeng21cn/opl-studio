import { EventEmitter } from "node:events";

export class ThreadAdapterError extends Error {
  constructor(code, message, details = {}, httpStatus = 409) {
    super(message);
    this.name = "ThreadAdapterError";
    this.code = code;
    this.details = details;
    this.httpStatus = httpStatus;
  }
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ThreadAdapterError("invalid_thread_request", `Missing ${field}`, { field }, 400);
  }
  return value.trim();
}

function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : [];
}

function runtimeStatus(value) {
  const type = typeof value === "string" ? value : value?.type;
  if (type === "active") return { type, activeFlags: strings(value?.activeFlags) };
  if (["notLoaded", "idle", "systemError"].includes(type)) return { type };
  return { type: "systemError" };
}

function stateFromStatus(status) {
  if (status.type === "notLoaded") return "unloaded";
  if (status.type === "idle") return "idle";
  if (status.type === "active") return "running";
  return "system_error";
}

function sourceKind(thread) {
  if (typeof thread?.sourceKind === "string") return thread.sourceKind;
  if (thread?.threadSource?.type || thread?.threadSource?.kind) {
    return thread.threadSource.type ?? thread.threadSource.kind;
  }
  if (typeof thread?.threadSource === "string") return thread.threadSource;
  if (thread?.source?.type || thread?.source?.kind) return thread.source.type ?? thread.source.kind;
  return typeof thread?.source === "string" ? thread.source : undefined;
}

export function projectCodexThread(thread, scope = {}) {
  const id = requiredString(thread?.id, "thread.id");
  const status = runtimeStatus(thread?.status);
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  const activeTurn = [...turns].reverse().find((turn) => turn?.status === "inProgress") ?? null;
  const extra = thread?.extra && typeof thread.extra === "object" ? thread.extra : {};
  const canonicalProjectId = [
    thread?.canonicalProjectId,
    thread?.canonical_project_id,
    extra.canonicalProjectId,
    extra.canonical_project_id,
    thread?.projectId
  ].find((value) => typeof value === "string" && value.trim());
  const isTemporaryWorkspace = [
    thread?.isTemporaryWorkspace,
    thread?.is_temporary_workspace,
    extra.isTemporaryWorkspace,
    extra.is_temporary_workspace
  ].some((value) => value === true);
  return {
    ...thread,
    id,
    sessionId: typeof thread?.sessionId === "string" ? thread.sessionId : id,
    projectKey: thread?.projectKey ?? extra.projectKey ?? null,
    canonicalProjectId: typeof canonicalProjectId === "string" ? canonicalProjectId.trim() : undefined,
    isTemporaryWorkspace,
    status,
    state: stateFromStatus(status),
    summary: thread?.name ?? thread?.preview ?? "",
    workspace: thread?.cwd ?? "",
    currentWorkspace: Boolean(scope.currentWorkspace && thread?.cwd === scope.currentWorkspace),
    archived: Boolean(thread?.archived ?? scope.archived),
    parentThreadId: thread?.parentThreadId ?? thread?.forkedFromId ?? null,
    agentRole: typeof thread?.agentRole === "string" ? thread.agentRole : undefined,
    agentNickname: typeof thread?.agentNickname === "string" ? thread.agentNickname : undefined,
    sourceKind: sourceKind(thread),
    createdAt: Number(thread?.createdAt ?? 0),
    updatedAt: Number(thread?.updatedAt ?? 0),
    turns,
    activeTurnId: activeTurn?.id
  };
}

export class CodexThreadAdapter extends EventEmitter {
  constructor(transport) {
    super();
    this.transport = transport;
    transport.on("event", (event) => this.emit("event", event));
  }

  capabilities() {
    return {
      available: this.transport.initialized,
      transport: "local_http_sse_stdio_json_rpc",
      threadStoreOwner: "codex_core_app_server",
      supportedProtocols: [
        "thread/list",
        "thread/read",
        "thread/start",
        "thread/resume",
        "thread/fork",
        "thread/name/set",
        "thread/delete",
        "thread/archive",
        "thread/unarchive",
        "turn/start",
        "turn/steer"
      ],
      subagentProjection: {
        metadata: ["parentThreadId", "agentRole", "agentNickname"],
        sourceKinds: ["subAgent", "subAgentReview", "subAgentCompact", "subAgentThreadSpawn", "subAgentOther"],
        itemTypes: ["collabAgentToolCall", "subAgentActivity"]
      },
      privateCoordinationLayer: false
    };
  }

  async listThreads(request = {}) {
    const requestedWorkspace = typeof request.workspace === "string" ? request.workspace : undefined;
    const params = {
      sortKey: "updated_at",
      sortDirection: "desc",
      // Account/provider changes must not hide existing native conversations.
      modelProviders: [],
      ...(Number.isFinite(request.limit) ? { limit: request.limit } : {}),
      ...(typeof request.archived === "boolean" ? { archived: request.archived } : {}),
      ...(requestedWorkspace ? { cwd: requestedWorkspace } : {}),
      ...(request.searchTerm ? { searchTerm: request.searchTerm } : {})
    };
    const data = [];
    const seenCursors = new Set();
    let cursor;
    do {
      const page = await this.transport.listThreads({ ...params, ...(cursor ? { cursor } : {}) });
      data.push(...(page.data ?? []));
      cursor = page.nextCursor ?? undefined;
      if (cursor && seenCursors.has(cursor)) {
        throw new ThreadAdapterError("invalid_app_server_response", "thread/list repeated its pagination cursor", { cursor }, 502);
      }
      if (cursor) seenCursors.add(cursor);
    } while (cursor);

    const workspaceFilter = Array.isArray(request.workspace) ? request.workspace : request.workspace ? [request.workspace] : [];
    const projected = data.map((thread) => projectCodexThread(thread, {
      currentWorkspace: this.transport.cwd,
      archived: request.archived
    }));
    return {
      data: projected.filter((thread) => (
        (request.projectKey === undefined || thread.projectKey === request.projectKey)
        && (request.archived === undefined || thread.archived === request.archived)
        && (!workspaceFilter.length || workspaceFilter.includes(thread.workspace))
      )),
      nextCursor: null
    };
  }

  async readThread({ threadId, includeTurns = false }) {
    const response = await this.transport.readThread(requiredString(threadId, "threadId"), includeTurns);
    return projectCodexThread(response.thread);
  }

  async resumeThread({ threadId }) {
    const response = await this.transport.resumeThread(requiredString(threadId, "threadId"));
    return projectCodexThread(response.thread);
  }

  async forkThread({ threadId, throughTurnId }) {
    const response = await this.transport.forkThread(requiredString(threadId, "threadId"), throughTurnId);
    return projectCodexThread(response.thread);
  }

  async renameThread({ threadId, name }) {
    const id = requiredString(threadId, "threadId");
    const title = requiredString(name, "name");
    await this.transport.renameThread(id, title);
    const response = await this.transport.readThread(id);
    return projectCodexThread(response.thread);
  }

  async deleteThread({ threadId, confirmed }) {
    const id = requiredString(threadId, "threadId");
    if (confirmed !== true) {
      throw new ThreadAdapterError("confirmation_required", "confirmation_required", { confirmationRequired: true }, 409);
    }
    await this.transport.deleteThread(id);
    return { threadId: id, deleted: true };
  }

  async setArchived({ threadId, archived, confirmed }) {
    const id = requiredString(threadId, "threadId");
    if (archived && confirmed !== true) {
      throw new ThreadAdapterError(
        "confirmation_required",
        "Archiving a thread requires explicit user confirmation",
        { confirmationRequired: true },
        409
      );
    }
    return archived ? this.transport.archiveThread(id) : this.transport.unarchiveThread(id);
  }
}
