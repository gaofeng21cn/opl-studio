import type {
  WorkbenchProjectGroup,
  WorkbenchThreadItem,
  WorkbenchThreadMessage
} from "./workbenchModel-contracts";
import {
  asRecord,
  asRecordArray,
  asStringArray,
  firstBoolean,
  firstString,
  isManagedCodexScratchWorkspace,
  listRecords,
  nestedRecord,
  pathLabel,
  payloadRecord,
  timestampString
} from "./workbenchModel-primitives";

function threadFromRecord(
  record: Record<string, unknown>,
  inheritedProject?: Record<string, unknown>
): WorkbenchThreadItem | null {
  const id = firstString(record, ["id", "threadId", "thread_id", "threadID"]);
  if (!id) return null;
  const project = nestedRecord(record, ["project", "projectRef", "project_ref"]) ?? inheritedProject ?? null;
  const projectId = firstString(record, ["projectId", "project_id"])
    ?? firstString(project, ["id", "projectId", "project_id"])
    ?? undefined;
  const projectLabel = firstString(record, ["projectLabel", "project_label", "projectName", "project_name"])
    ?? firstString(project, ["label", "name", "title"])
    ?? undefined;
  const workspace = firstString(record, ["workspace", "workspaceRoot", "workspace_root", "cwd", "path"])
    ?? firstString(project, ["workspace", "workspaceRoot", "workspace_root", "cwd", "path"])
    ?? undefined;
  return {
    id,
    sessionId: firstString(record, ["sessionId", "session_id"]) ?? undefined,
    projectKey: firstString(record, ["projectKey", "project_key"]) ?? undefined,
    sourceKind: firstString(record, ["sourceKind", "source_kind"])
      ?? firstString(nestedRecord(record, ["threadSource", "thread_source"]), ["type", "kind"])
      ?? firstString(record, ["threadSource", "thread_source"])
      ?? firstString(nestedRecord(record, ["source"]), ["type", "kind"])
      ?? firstString(record, ["source"])
      ?? undefined,
    agentRole: firstString(record, ["agentRole", "agent_role"]) ?? undefined,
    agentNickname: firstString(record, ["agentNickname", "agent_nickname"]) ?? undefined,
    title: firstString(record, ["title", "name", "displayName", "display_name", "summary", "preview", "subject"])
      ?? `Thread ${id.slice(0, 8)}`,
    projectId,
    canonicalProjectId: firstString(record, ["canonicalProjectId", "canonical_project_id"])
      ?? firstString(asRecord(record.extra), ["canonicalProjectId", "canonical_project_id"])
      ?? undefined,
    projectLabel,
    workspace,
    isTemporaryWorkspace: firstBoolean(record, ["isTemporaryWorkspace", "is_temporary_workspace"])
      || firstBoolean(asRecord(record.extra), ["isTemporaryWorkspace", "is_temporary_workspace"]),
    currentWorkspace: firstBoolean(record, ["currentWorkspace", "current_workspace"]),
    parentThreadId: firstString(record, ["parentThreadId", "parent_thread_id", "parentId", "parent_id"]) ?? undefined,
    activeTurnId: firstString(record, ["activeTurnId", "active_turn_id"])
      ?? firstString(nestedRecord(record, ["activeTurn", "active_turn"]), ["id", "turnId", "turn_id"])
      ?? undefined,
    status: firstString(record, ["status", "state", "phase"]) ?? "unknown",
    preview: firstString(record, ["preview", "summary", "lastMessage", "last_message", "snippet"]) ?? "",
    updatedAt: timestampString(record.updatedAt ?? record.updated_at ?? record.modifiedAt ?? record.modified_at),
    archived: firstBoolean(record, ["archived", "isArchived", "is_archived"])
  };
}

export function deriveThreadDirectory(value: unknown): WorkbenchProjectGroup[] {
  const payload = payloadRecord(value);
  const projectRows = asRecordArray(payload?.projects ?? payload?.workspaces);
  const inheritedThreads = projectRows.flatMap((project) => {
    const rows = asRecordArray(project.threads ?? project.items);
    return rows.map((thread) => threadFromRecord(thread, project));
  });
  const directThreads = listRecords(value, ["data", "threads", "items", "entries"])
    .map((thread) => threadFromRecord(thread));
  const threads = [...inheritedThreads, ...directThreads]
    .filter((thread): thread is WorkbenchThreadItem => Boolean(thread));
  const uniqueThreads = Array.from(new Map(threads.map((thread) => [thread.id, thread])).values());
  const groups = new Map<string, WorkbenchProjectGroup>();

  for (const thread of uniqueThreads) {
    const canonicalProjectId = thread.canonicalProjectId?.trim();
    const workspace = thread.workspace?.trim();
    const projectless = !canonicalProjectId && (
      thread.isTemporaryWorkspace
      || !workspace
      || isManagedCodexScratchWorkspace(workspace)
    );
    const projectKey = canonicalProjectId
      ? `project:${canonicalProjectId}`
      : projectless
        ? "projectless"
        : `workspace:${workspace}`;
    const group = groups.get(projectKey) ?? {
      id: projectKey,
      label: projectless
        ? "No project"
        : thread.projectLabel ?? pathLabel(canonicalProjectId ?? workspace ?? "Project"),
      workspace: projectless ? undefined : workspace,
      projectless,
      threads: []
    };
    group.threads.push(thread);
    groups.set(projectKey, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      threads: group.threads.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
    }))
    .sort((left, right) => {
      const leftUpdated = left.threads[0]?.updatedAt ?? "";
      const rightUpdated = right.threads[0]?.updatedAt ?? "";
      return Number(left.projectless) - Number(right.projectless)
        || rightUpdated.localeCompare(leftUpdated)
        || left.label.localeCompare(right.label);
    });
}

function textFromContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFromContent).filter(Boolean).join("\n");
  const record = asRecord(value);
  if (!record) return "";
  return firstString(record, ["text", "content", "message", "delta", "output_text"])
    ?? textFromContent(record.parts ?? record.items ?? record.content)
    ?? "";
}

function messageFromRecord(record: Record<string, unknown>, index: number): WorkbenchThreadMessage | null {
  const type = firstString(record, ["type", "kind", "event"])?.toLowerCase() ?? "";
  const subagentType = type === "collabagenttoolcall"
    ? "collabAgentToolCall"
    : type === "subagentactivity"
      ? "subAgentActivity"
      : null;
  const status = firstString(record, ["status", "state"]);
  const failed = status === "failed" || status === "error" || status === "declined"
    || (typeof record.exitCode === "number" && record.exitCode !== 0)
    || Boolean(record.error) || asRecord(record.result)?.isError === true;
  const failureText = textFromContent(record.error) || firstString(record, ["text", "message", "aggregatedOutput"]) || status || "";
  const execution = {
    ...(status ? { executionStatus: status } : {}),
    ...(failed ? { failureSummary: failureText.split("\n")[0].slice(0, 240) } : {})
  };
  if (subagentType) {
    const agent = nestedRecord(record, ["agent", "subAgent", "sub_agent"]);
    const agentRole = firstString(record, ["agentRole", "agent_role"]) ?? firstString(agent, ["role", "agentRole", "agent_role"]) ?? undefined;
    const agentNickname = firstString(record, ["agentNickname", "agent_nickname", "nickname"])
      ?? firstString(agent, ["nickname", "agentNickname", "agent_nickname"])
      ?? undefined;
    const status = firstString(record, ["status", "state", "phase"]);
    const text = firstString(record, ["text", "message", "summary", "title", "tool"])
      ?? [agentNickname ?? agentRole ?? "Subagent", status].filter(Boolean).join(" · ");
    return {
      id: firstString(record, ["id", "itemId", "item_id", "callId", "call_id"]) ?? `subagent-item-${index}`,
      role: "system",
      text,
      presentation: "execution",
      ...execution,
      subagent: { type: subagentType, agentRole, agentNickname, status: status ?? undefined,
        childThreadIds: [...new Set([...asStringArray(record.receiverThreadIds), ...Object.keys(asRecord(record.agentsStates) ?? {})])]
          .filter(id => /^[0-9A-Za-z-]+$/.test(id)) }
    };
  }
  const explicitRole = firstString(record, ["role", "author"]);
  const role = explicitRole === "user" || /user.?message|input.?message/.test(type)
    ? "user"
    : explicitRole === "assistant" || /agent.?message|assistant.?message|output.?message/.test(type)
      ? "assistant"
      : explicitRole === "system" || ["commandexecution", "filechange", "mcpToolCall".toLowerCase(), "tool", "process", "diff", "file", "websearch"].includes(type)
        ? "system"
        : null;
  if (!role) return null;
  let text = firstString(record, ["text", "message", "output_text", "aggregatedOutput", "command", "query"])
    ?? textFromContent(record.content ?? record.parts ?? record.items ?? record.result)
    ?? "";
  if (!text.trim() && failed) text = textFromContent(record.error) || failureText || "Execution unsuccessful";
  if (!text.trim()) return null;
  return {
    id: firstString(record, ["id", "itemId", "item_id", "messageId", "message_id"]) ?? `thread-message-${index}`,
    role,
    text,
    ...execution,
    ...(role === "system" && ["commandexecution", "filechange", "mcptoolcall", "tool", "process", "diff", "file", "websearch"].includes(type)
      ? { presentation: "execution" as const }
      : role === "assistant" && record.phase === "commentary"
        ? { presentation: "progress" as const }
        : {})
  };
}

export function deriveThreadMessages(value: unknown): WorkbenchThreadMessage[] {
  const payload = payloadRecord(value);
  const thread = nestedRecord(payload, ["thread"]);
  const direct = [payload, thread]
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .flatMap((record) => asRecordArray(record.messages ?? record.items));
  const turns = [payload, thread]
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .flatMap((record) => asRecordArray(record.turns));
  const turnItems = turns.flatMap((turn) => asRecordArray(turn.items ?? turn.messages)
    .map((item) => ({ ...item, turnId: firstString(turn, ["id"]) ?? undefined })));
  const imported = [payload, thread]
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .flatMap((record) => asRecordArray(asRecord(record.importedHistory)?.messages));
  return [...imported, ...direct, ...turnItems]
    .map((record, index) => {
      const message = messageFromRecord(record, index);
      const turnId = firstString(record, ["turnId"]);
      return message && turnId ? { ...message, turnId } : message;
    })
    .filter((message): message is WorkbenchThreadMessage => Boolean(message));
}
