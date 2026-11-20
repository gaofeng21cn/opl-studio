import type {
  AgentPackageLocalizedText,
  DomainDetailViewAvailability,
  DomainDetailViewDescriptor,
  WorkItemRuntimeItem,
  WorkItemRuntimeProjection,
  WorkItemRuntimeStage
} from "./workbenchModel-contracts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter((item): item is string => Boolean(item)) : [];
}

function asBoolean(value: unknown): boolean {
  return value === true || asString(value) === "true";
}

function asOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function asLocalizedText(value: unknown): AgentPackageLocalizedText {
  const record = asRecord(value);
  const zh = firstString(record, ["zh-CN", "zh_CN", "zh"]);
  const en = firstString(record, ["en-US", "en_US", "en"]);
  return {
    ...(zh ? { zh } : {}),
    ...(en ? { en } : {})
  };
}

const domainDetailViewAvailabilities = new Set<DomainDetailViewAvailability>([
  "unread",
  "available",
  "missing",
  "stale",
  "invalid",
  "read_error"
]);

function readDomainDetailViewAvailability(value: unknown): DomainDetailViewAvailability | null {
  const candidate = asString(value);
  return candidate && domainDetailViewAvailabilities.has(candidate as DomainDetailViewAvailability)
    ? candidate as DomainDetailViewAvailability
    : null;
}

function readDomainDetailViewRevision(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const revision = asFiniteNumber(value);
  return revision !== null && Number.isSafeInteger(revision) && revision >= 0 ? revision : undefined;
}

export function parseDomainDetailViewDescriptors(value: unknown, itemId: string): DomainDetailViewDescriptor[] {
  if (!Array.isArray(value)) return [];
  const seenViewIds = new Set<string>();
  return value.map((candidate, index): DomainDetailViewDescriptor => {
    const record = asRecord(candidate);
    const declaredItemId = asString(record?.item_id);
    const viewId = asString(record?.view_id) ?? `invalid-view-${index + 1}`;
    const viewKind = asString(record?.view_kind) ?? "unknown";
    const title = asString(record?.title) ?? undefined;
    const schemaRef = asString(record?.schema_ref) ?? undefined;
    const schemaVersion = asString(record?.schema_version) ?? undefined;
    const digest = asString(record?.digest) ?? undefined;
    const availability = readDomainDetailViewAvailability(record?.availability);
    const revisionValue = record?.revision;
    const revision = readDomainDetailViewRevision(revisionValue);
    const invalidReasons: string[] = [];
    if (!record) invalidReasons.push("descriptor_not_object");
    if (!declaredItemId) invalidReasons.push("item_id_missing");
    else if (declaredItemId !== itemId) invalidReasons.push("item_id_mismatch");
    if (!asString(record?.view_id)) invalidReasons.push("view_id_missing");
    if (!asString(record?.view_kind)) invalidReasons.push("view_kind_missing");
    if (!availability) invalidReasons.push("availability_invalid");
    if (revisionValue !== undefined && revisionValue !== null && revision === undefined) {
      invalidReasons.push("revision_invalid");
    }
    if (seenViewIds.has(viewId)) invalidReasons.push("view_id_duplicate");
    seenViewIds.add(viewId);
    return {
      itemId: declaredItemId ?? itemId,
      viewId,
      viewKind,
      ...(title ? { title } : {}),
      ...(schemaRef ? { schemaRef } : {}),
      ...(schemaVersion ? { schemaVersion } : {}),
      ...(revision !== undefined ? { revision } : {}),
      ...(digest ? { digest } : {}),
      availability: invalidReasons.length ? "invalid" : availability as DomainDetailViewAvailability,
      valid: invalidReasons.length === 0,
      ...(invalidReasons.length ? { invalidReason: invalidReasons.join(",") } : {})
    };
  });
}

function readWorkItemRuntimeProjection(value: unknown): WorkItemRuntimeProjection | undefined {
  const projection = asRecord(value);
  if (!projection || asString(projection.schema_version) !== "work-item-projection.v2") return undefined;
  const summary = asRecord(projection?.summary);
  const numberOrZero = (candidate: unknown) => asFiniteNumber(candidate) ?? 0;
  const agents = asRecordArray(projection?.agent_catalog).flatMap((agent) => {
    const id = asString(agent.agent_id);
    if (!id) return [];
    return [{ id, label: asString(agent.display_name) ?? id }];
  });
  const projects = asRecordArray(projection?.project_catalog).flatMap((project) => {
    const id = asString(project.project_id);
    if (!id) return [];
    return [{
      id,
      agentId: asString(project.agent_id) ?? "unknown",
      label: asString(project.display_name) ?? id,
      ...(asString(project.workspace_path) ? { workspacePath: asString(project.workspace_path) as string } : {})
    }];
  });
  const items = asRecordArray(projection?.items).flatMap((item): WorkItemRuntimeItem[] => {
    const identity = asRecord(item.identity);
    const lifecycle = asRecord(item.lifecycle);
    const visibility = asRecord(item.visibility);
    const execution = asRecord(item.execution);
    const qualityBudget = asRecord(execution?.quality_budget);
    const sessionActivity = asRecord(item.session_activity);
    const attention = asRecord(item.attention);
    const telemetry = asRecord(item.telemetry);
    const currentStageTelemetry = asRecord(telemetry?.current_stage);
    const cumulativeTelemetry = asRecord(telemetry?.cumulative);
    const action = asRecord(item.action);
    const id = asString(item.item_id);
    const agentId = asString(identity?.agent_id);
    const domainId = asString(identity?.domain_id);
    const projectId = asString(identity?.project_id);
    const workItemId = asString(identity?.work_item_id);
    const domainWorkItemId = asString(identity?.domain_work_item_id);
    const workItemScopeId = asString(identity?.work_item_scope_id);
    const identityState = asString(identity?.identity_state);
    const workspacePath = asString(identity?.workspace_path);
    const attemptId = asString(execution?.attempt_id);
    const title = asString(identity?.work_item_display_name);
    if (!id || !agentId || !projectId || !workItemId || !title) return [];
    const domainDetailViews = parseDomainDetailViewDescriptors(item.domain_detail_views, id);
    const status = asString(lifecycle?.primary_state) ?? asString(lifecycle?.business_state) ?? "unknown";
    return [{
      id,
      agentId,
      agentDisplayName: asString(identity?.agent_display_name) ?? agentId,
      ...(domainId ? { domainId } : {}),
      projectId,
      projectDisplayName: asString(identity?.project_display_name) ?? projectId,
      ...(workspacePath ? { workspacePath } : {}),
      workItemId,
      canonicalThreadIds: [...new Set([...asStringArray(sessionActivity?.active_session_refs), ...asStringArray(sessionActivity?.nonterminal_session_refs), asString(sessionActivity?.latest_session_ref)])]
        .flatMap(ref => typeof ref === "string" && /^codex:\/\/threads\/[0-9A-Za-z-]+$/.test(ref) ? [ref.slice("codex://threads/".length)] : []),
      ...(domainWorkItemId ? { domainWorkItemId } : {}),
      ...(workItemScopeId ? { workItemScopeId } : {}),
      ...(identityState ? { identityState } : {}),
      title,
      ...(asString(identity?.work_item_kind) ? { kind: asString(identity?.work_item_kind) as string } : {}),
      status,
      statusLabel: asString(lifecycle?.primary_state_label) ?? status,
      ...(asString(lifecycle?.primary_state_reason) ?? asString(lifecycle?.reason)
        ? { statusReason: (asString(lifecycle?.primary_state_reason) ?? asString(lifecycle?.reason)) as string }
        : {}),
      ...(asString(lifecycle?.current_stage_id) ?? asString(execution?.current_stage_id)
        ? { currentStageId: (asString(lifecycle?.current_stage_id) ?? asString(execution?.current_stage_id)) as string }
        : {}),
      ...(asString(lifecycle?.current_stage_display_name) ?? asString(execution?.current_stage_display_name)
        ? { currentStageName: (asString(lifecycle?.current_stage_display_name) ?? asString(execution?.current_stage_display_name)) as string }
        : {}),
      ...(attemptId ? { attemptId } : {}),
      ...(asString(execution?.next_stage_id) ? { nextStageId: asString(execution?.next_stage_id) as string } : {}),
      ...(asString(execution?.next_stage_display_name) ? { nextStageName: asString(execution?.next_stage_display_name) as string } : {}),
      executionState: asString(execution?.state) ?? "unknown",
      activeSessionCount: numberOrZero(sessionActivity?.active_session_count),
      attentionKind: asString(attention?.kind) ?? "none",
      ...(asString(action?.title) ? { nextActionTitle: asString(action?.title) as string } : {}),
      ...(asString(action?.summary) ? { nextActionSummary: asString(action?.summary) as string } : {}),
      ...(asString(action?.owner_display_name) ?? asString(action?.owner)
        ? { nextActionOwner: (asString(action?.owner_display_name) ?? asString(action?.owner)) as string }
        : {}),
      ...(asString(execution?.started_at) ? { startedAt: asString(execution?.started_at) as string } : {}),
      ...(asString(execution?.updated_at) ?? asString(lifecycle?.last_transition_at)
        ? { updatedAt: (asString(execution?.updated_at) ?? asString(lifecycle?.last_transition_at)) as string }
        : {}),
      elapsedMs: asFiniteNumber(qualityBudget?.elapsed_ms),
      stageTokens: asFiniteNumber(currentStageTelemetry?.total_tokens),
      totalTokens: asFiniteNumber(cumulativeTelemetry?.total_tokens),
      telemetryState: asString(telemetry?.state) ?? "missing",
      ...(asString(telemetry?.missing_reason) ?? asString(cumulativeTelemetry?.missing_reason)
        ? { telemetryMissingReason: (asString(telemetry?.missing_reason) ?? asString(cumulativeTelemetry?.missing_reason)) as string }
        : {}),
      archived: asString(visibility?.state) === "archived",
      stages: asRecordArray(item.stage_map).flatMap((stage): WorkItemRuntimeStage[] => {
        const stageId = asString(stage.stage_id);
        if (!stageId) return [];
        const usage = asRecord(stage.usage);
        return [{
          stageId,
          displayName: asString(stage.display_name) ?? stageId,
          displayNameI18n: asLocalizedText(stage.display_names),
          state: asString(stage.state) ?? "unknown",
          ...(asString(stage.owner) ? { owner: asString(stage.owner) as string } : {}),
          ...(asString(stage.owner_display_name) ? { ownerDisplayName: asString(stage.owner_display_name) as string } : {}),
          elapsedSeconds: asFiniteNumber(stage.elapsed_seconds),
          totalTokens: asFiniteNumber(usage?.total_tokens)
        }];
      }),
      ...(Array.isArray(item.domain_detail_views) ? { domainDetailViews } : {})
    }];
  });

  return {
    schemaVersion: "work-item-projection.v2",
    ...(asString(projection.generated_at) ? { generatedAt: asString(projection.generated_at) as string } : {}),
    summary: {
      agentCount: numberOrZero(summary?.agent_count),
      projectCount: numberOrZero(summary?.project_count),
      workItemCount: numberOrZero(summary?.work_item_count),
      archivedWorkItemCount: numberOrZero(summary?.archived_work_item_count),
      runningCount: numberOrZero(summary?.running_count),
      activeSessionCount: numberOrZero(summary?.active_session_count),
      userAttentionCount: numberOrZero(summary?.user_attention_count),
      systemAttentionCount: numberOrZero(summary?.system_attention_count),
      telemetryObservedCount: numberOrZero(summary?.telemetry_observed_count),
      telemetryMissingCount: numberOrZero(summary?.telemetry_missing_count)
    },
    agents,
    projects,
    items
  };
}

function firstString(record: Record<string, unknown> | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(record?.[key]);
    if (value) return value;
  }
  return null;
}

function firstBoolean(record: Record<string, unknown> | null, keys: string[]): boolean {
  return keys.some((key) => asBoolean(record?.[key]));
}

function nestedRecord(record: Record<string, unknown> | null, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const value = asRecord(record?.[key]);
    if (value) return value;
  }
  return null;
}

function payloadRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  return nestedRecord(record, ["result", "data", "payload", "response"]) ?? record;
}

function listRecords(value: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(value)) return asRecordArray(value);
  const payload = payloadRecord(value);
  for (const key of keys) {
    const items = asRecordArray(payload?.[key]);
    if (items.length || Array.isArray(payload?.[key])) return items;
  }
  return [];
}

function timestampString(value: unknown): string | undefined {
  const text = asString(value);
  if (text) return text;
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }
  return undefined;
}

function pathLabel(value: string): string {
  const normalized = value.replace(/\/$/, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? value;
}

const managedCodexScratchPatterns = [
  /^\/Users\/[^/]+\/Documents\/Codex(?:\/|$)/i,
  /^\/home\/[^/]+\/Documents\/Codex(?:\/|$)/i,
  /^[a-z]:\/Users\/[^/]+\/Documents\/Codex(?:\/|$)/i,
  /^\/mnt\/[a-z]\/Users\/[^/]+\/Documents\/Codex(?:\/|$)/i,
  /\/(?:Library\/Application Support\/One Person Lab\/opl-data|\.opl-app-data)\/conversations(?:\/[^/]+)*\/codex-temp-[^/]+$/i
];

export function isManagedCodexScratchWorkspace(workspace: string): boolean {
  const normalized = workspace.trim().replaceAll("\\", "/").replace(/\/{2,}/g, "/");
  return managedCodexScratchPatterns.some((pattern) => pattern.test(normalized));
}

export {
  asRecord,
  asString,
  asStringArray,
  asBoolean,
  asOptionalBoolean,
  asFiniteNumber,
  asRecordArray,
  asLocalizedText,
  readWorkItemRuntimeProjection,
  firstString,
  firstBoolean,
  nestedRecord,
  payloadRecord,
  listRecords,
  timestampString,
  pathLabel
};
