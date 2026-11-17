import { asBoolean, asNumber, asRecord, asString } from "./oplBridge-primitives";
import type { CodexThread, CodexThreadRuntimeStatus, CodexTurn, ThreadListResult } from "@gaofeng21cn/opl-host-contracts";

function normalizeThreadStatus(value: unknown): CodexThreadRuntimeStatus {
  const record = asRecord(value);
  const type = asString(record?.type);
  if (type === "idle" || type === "notLoaded" || type === "systemError") return { type };
  if (type === "active") {
    return {
      type,
      activeFlags: Array.isArray(record?.activeFlags) ? record.activeFlags.map(String) : []
    };
  }
  return { type: "systemError" };
}

function normalizeThreadState(status: CodexThreadRuntimeStatus): CodexThread["state"] {
  if (status.type === "notLoaded") return "unloaded";
  if (status.type === "idle") return "idle";
  if (status.type === "active") return "running";
  return "system_error";
}

function normalizeTurn(value: unknown): CodexTurn | undefined {
  const record = asRecord(value);
  const id = asString(record?.id);
  const status = asString(record?.status);
  if (!id || !["completed", "interrupted", "failed", "inProgress"].includes(status ?? "")) return undefined;
  return { ...record, id, status: status as CodexTurn["status"] };
}

function threadSourceKind(source: Record<string, unknown>): string | undefined {
  const explicit = asString(source.sourceKind);
  if (explicit) return explicit;
  const threadSource = asRecord(source.threadSource);
  const nestedThreadSource = asString(threadSource?.type) ?? asString(threadSource?.kind);
  if (nestedThreadSource) return nestedThreadSource;
  const directThreadSource = asString(source.threadSource);
  if (directThreadSource) return directThreadSource;
  const genericSource = asRecord(source.source);
  return asString(genericSource?.type)
    ?? asString(genericSource?.kind)
    ?? asString(source.source);
}

export function normalizeCodexThread(value: unknown): CodexThread {
  const record = asRecord(value);
  const source = asRecord(record?.thread) ?? record ?? {};
  const id = asString(source.id) ?? "";
  const status = normalizeThreadStatus(source.status);
  const turns = Array.isArray(source.turns) ? source.turns.flatMap((turn) => normalizeTurn(turn) ?? []) : [];
  const extra = asRecord(source.extra);
  return {
    ...source,
    id,
    sessionId: asString(source.sessionId) ?? id,
    projectKey: asString(source.projectKey) ?? asString(asRecord(source.extra)?.projectKey) ?? null,
    canonicalProjectId: asString(source.canonicalProjectId)
      ?? asString(source.canonical_project_id)
      ?? asString(extra?.canonicalProjectId)
      ?? asString(extra?.canonical_project_id)
      ?? asString(source.projectId),
    isTemporaryWorkspace: asBoolean(source.isTemporaryWorkspace)
      ?? asBoolean(source.is_temporary_workspace)
      ?? asBoolean(extra?.isTemporaryWorkspace)
      ?? asBoolean(extra?.is_temporary_workspace)
      ?? false,
    status,
    state: normalizeThreadState(status),
    summary: asString(source.summary) ?? asString(source.preview) ?? "",
    workspace: asString(source.workspace) ?? asString(source.cwd) ?? "",
    archived: asBoolean(source.archived) ?? false,
    parentThreadId: asString(source.parentThreadId) ?? asString(source.forkedFromId) ?? null,
    agentRole: asString(source.agentRole),
    agentNickname: asString(source.agentNickname),
    sourceKind: threadSourceKind(source),
    createdAt: asNumber(source.createdAt) ?? 0,
    updatedAt: asNumber(source.updatedAt) ?? 0,
    turns,
    activeTurnId: asString(source.activeTurnId) ?? turns.find((turn) => turn.status === "inProgress")?.id
  };
}

export function normalizeThreadListResult(value: unknown): ThreadListResult {
  const record = asRecord(value);
  const data = Array.isArray(record?.data) ? record.data.map(normalizeCodexThread).filter((thread) => thread.id) : [];
  return { data, nextCursor: null };
}
