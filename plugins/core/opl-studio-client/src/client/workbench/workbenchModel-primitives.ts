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
  const agentMap = new Map<string, string>();
  for (const agent of asRecordArray(projection?.agent_catalog)) {
    const id = asString(agent.agent_id);
    if (!id) continue;
    agentMap.set(id, asString(agent.display_name) ?? id);
  }
  const projects = asRecordArray(projection?.project_catalog).flatMap((project) => {
    const id = asString(project.project_id);
    if (!id) return [];
    const agentId = asString(project.agent_id) ?? "unknown";
    if (!agentMap.has(agentId) && agentId !== "unknown") {
      agentMap.set(agentId, asString(project.agent_display_name) ?? agentId);
    }
    return [{
      id,
      agentId,
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
    const freshness = asRecord(item.freshness);
    const id = asString(item.item_id);
    const agentId = asString(identity?.agent_id);
    const domainId = asString(identity?.domain_id);
    const projectId = asString(identity?.project_id);
    const workItemId = asString(identity?.work_item_id);
    const domainWorkItemId = asString(identity?.domain_work_item_id);
    const workItemScopeId = asString(identity?.work_item_scope_id);
    const identityState = asString(identity?.identity_state);
    const workspacePath = asString(identity?.workspace_path);
    const workItemRoot = asString(identity?.work_item_root);
    const attemptId = asString(execution?.attempt_id);
    const title = asString(identity?.work_item_display_name);
    if (!id || !agentId || !projectId || !workItemId || !title) return [];
    if (!agentMap.has(agentId)) {
      agentMap.set(agentId, asString(identity?.agent_display_name) ?? agentId);
    }
    const domainDetailViews = parseDomainDetailViewDescriptors(item.domain_detail_views, id);
    const status = asString(lifecycle?.primary_state) ?? asString(lifecycle?.business_state) ?? "unknown";
    const executionStageId = asString(execution?.current_stage_id) ?? asString(execution?.stage_id);
    const attentionKind = asString(attention?.kind) ?? "none";
    const attentionEnvelope = attention
      ? {
          kind: attentionKind,
          ...(asString(attention.reason) ? { reason: asString(attention.reason) as string } : {}),
          ...(asString(attention.owner) ? { owner: asString(attention.owner) as string } : {}),
          ...(asString(attention.responsible_component) ? { responsibleComponent: asString(attention.responsible_component) as string } : {}),
          ...(asString(attention.issue) ? { issue: asString(attention.issue) as string } : {}),
          ...(asString(attention.impact) ? { impact: asString(attention.impact) as string } : {}),
          ...(asString(attention.repair_action) ? { repairAction: asString(attention.repair_action) as string } : {}),
          ...(asString(attention.expected_outcome) ? { expectedOutcome: asString(attention.expected_outcome) as string } : {})
        }
      : undefined;
    const actionMessageArgs = asRecord(action?.message_args);
    const visibilityGeneration = asFiniteNumber(visibility?.generation);
    return [{
      id,
      agentId,
      agentDisplayName: asString(identity?.agent_display_name) ?? agentId,
      ...(domainId ? { domainId } : {}),
      projectId,
      projectDisplayName: asString(identity?.project_display_name) ?? projectId,
      ...(workspacePath ? { workspacePath } : {}),
      ...(workItemRoot ? { workItemRoot } : {}),
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
      ...(asString(lifecycle?.package_status) ? { packageStatus: asString(lifecycle?.package_status) as string } : {}),
      ...(asString(lifecycle?.current_stage_id)
        ? { currentStageId: asString(lifecycle?.current_stage_id) as string }
        : {}),
      ...(asString(lifecycle?.current_stage_display_name)
        ? { currentStageName: asString(lifecycle?.current_stage_display_name) as string }
        : {}),
      ...(executionStageId ? { executionStageId } : {}),
      ...(attemptId ? { attemptId } : {}),
      ...(asString(execution?.next_stage_id) ? { nextStageId: asString(execution?.next_stage_id) as string } : {}),
      ...(asString(execution?.next_stage_display_name) ? { nextStageName: asString(execution?.next_stage_display_name) as string } : {}),
      executionState: asString(execution?.state) ?? "unknown",
      activeSessionCount: numberOrZero(sessionActivity?.active_session_count),
      attentionKind,
      ...(attentionEnvelope ? { attention: attentionEnvelope } : {}),
      ...(asString(action?.title) ? { nextActionTitle: asString(action?.title) as string } : {}),
      ...(asString(action?.summary) ? { nextActionSummary: asString(action?.summary) as string } : {}),
      ...(asString(action?.owner_display_name) ?? asString(action?.owner)
        ? { nextActionOwner: (asString(action?.owner_display_name) ?? asString(action?.owner)) as string }
        : {}),
      ...(asString(action?.title_key) ? { actionTitleKey: asString(action?.title_key) as string } : {}),
      ...(asString(action?.summary_key) ? { actionSummaryKey: asString(action?.summary_key) as string } : {}),
      ...(actionMessageArgs ? { actionMessageArgs } : {}),
      ...(asString(action?.owner_kind) ? { actionOwnerKind: asString(action?.owner_kind) as string } : {}),
      ...(asString(action?.action_ref) ? { actionRef: asString(action?.action_ref) as string } : {}),
      ...(asString(execution?.started_at) ? { startedAt: asString(execution?.started_at) as string } : {}),
      ...(asString(execution?.last_heartbeat_at) ? { lastHeartbeatAt: asString(execution?.last_heartbeat_at) as string } : {}),
      ...(asString(execution?.updated_at) ?? asString(lifecycle?.last_transition_at)
        ? { updatedAt: (asString(execution?.updated_at) ?? asString(lifecycle?.last_transition_at)) as string }
        : {}),
      elapsedMs: asFiniteNumber(qualityBudget?.elapsed_ms) ?? asFiniteNumber(execution?.elapsed_ms),
      stageTokens: asFiniteNumber(currentStageTelemetry?.total_tokens),
      ...(asString(currentStageTelemetry?.state) ? { stageTokensState: asString(currentStageTelemetry?.state) as string } : {}),
      totalTokens: asFiniteNumber(cumulativeTelemetry?.total_tokens),
      ...(asString(cumulativeTelemetry?.state) ? { cumulativeTokensState: asString(cumulativeTelemetry?.state) as string } : {}),
      telemetryState: asString(telemetry?.state) ?? "missing",
      ...(asString(telemetry?.missing_reason) ?? asString(cumulativeTelemetry?.missing_reason)
        ? { telemetryMissingReason: (asString(telemetry?.missing_reason) ?? asString(cumulativeTelemetry?.missing_reason)) as string }
        : {}),
      ...(asString(freshness?.state) ? { freshnessState: asString(freshness?.state) as string } : {}),
      archived: asString(visibility?.state) === "archived",
      ...(visibilityGeneration !== null ? { visibilityGeneration } : {}),
      ...(asString(visibility?.control_ref) ? { visibilityControlRef: asString(visibility?.control_ref) as string } : {}),
      ...(asString(visibility?.source) ? { visibilitySource: asString(visibility?.source) as string } : {}),
      ...(asString(visibility?.updated_at) ? { visibilityUpdatedAt: asString(visibility?.updated_at) as string } : {}),
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
  const agents = Array.from(agentMap.entries()).map(([id, label]) => ({ id, label }));

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
