import type { SoftwareSourceActionRef } from "./workbenchModel-package-contracts";
import { asOptionalBoolean, asRecord, asRecordArray, asString, asStringArray } from "./workbenchModel-primitives";

export type KnowledgeSourceContext = { contextId: string; label: string; selected: boolean; revision?: string; availableScopeIds: string[] };
export type KnowledgeSourceConsumer = { domainId: string; label: string; packageId?: string };
export type KnowledgeSourceHealth = {
  currentCount: number; reviewDueCount: number; inactiveCount: number; unavailableCount: number; checkedCount: number; truncated: boolean;
  issues: Array<{ knowledgeId: string; status: "review_due" | "unavailable"; reason: string }>;
};
export type KnowledgeSourceRef = {
  resourceId: string; sourceId: string; label: string; contextId: string;
  status: string; connected: boolean | null; scopeIds: string[]; consumerDomainIds: string[]; consumerPackageIds: string[];
  writeDomainIds: string[]; sourceWritable: boolean | null; revisionIdentity?: string;
  authorizationStatus: string; revisionStatus: string; freshnessStatus: string; observedAt?: string;
  readinessStatus: string; reason?: string; actionIds: string[];
  accessEditable: boolean | null; accessEditReason?: string; scopeExpansionAllowed: boolean | null; availableScopeIds: string[];
  knowledgeHealth?: KnowledgeSourceHealth;
};
export type KnowledgeSourcesProjection = {
  status: "available" | "not_configured" | "attention_required" | "unknown";
  contexts: KnowledgeSourceContext[]; entries: KnowledgeSourceRef[];
  consumers: KnowledgeSourceConsumer[]; actions: SoftwareSourceActionRef[];
};

const safePayloadFields = new Set(["resource_id", "context_id", "source_id", "label", "scope_ids", "consumer_domain_ids", "write_domain_ids", "expected_revision"]);
// Owner payload_fields describes accepted fields, including optional fields
// and the mutually exclusive vault_path / registry_path inputs.
const knowledgeRequiredFields: Record<string, string[]> = {
  knowledge_source_list: [], knowledge_source_check: [],
  knowledge_source_connect: ["context_id", "scope_ids", "consumer_domain_ids", "expected_revision"],
  knowledge_source_configure: ["resource_id", "scope_ids", "consumer_domain_ids", "write_domain_ids", "expected_revision"],
  knowledge_source_disconnect: ["resource_id", "expected_revision"]
};
function readKnowledgeHealth(value: unknown): KnowledgeSourceHealth | undefined {
  const input = asRecord(value);
  if (!input) return undefined;
  const counts = ["current_count", "review_due_count", "inactive_count", "unavailable_count", "checked_count"] as const;
  if (counts.some(key => !Number.isSafeInteger(input[key]) || Number(input[key]) < 0) || typeof input.truncated !== "boolean") return undefined;
  return {
    currentCount: Number(input.current_count), reviewDueCount: Number(input.review_due_count), inactiveCount: Number(input.inactive_count),
    unavailableCount: Number(input.unavailable_count), checkedCount: Number(input.checked_count), truncated: input.truncated,
    issues: asRecordArray(input.issues).flatMap(issue => {
      const knowledgeId = asString(issue.knowledge_id), reason = asString(issue.reason);
      return knowledgeId && reason && (issue.status === "review_due" || issue.status === "unavailable") ? [{ knowledgeId, reason, status: issue.status }] : [];
    })
  };
}
export function readKnowledgeSourcesProjection(value: unknown): KnowledgeSourcesProjection | undefined {
  const input = asRecord(value);
  if (input?.surface_kind !== "opl_knowledge_sources_projection.v1") return undefined;
  return {
    status: ["available", "not_configured", "attention_required"].includes(String(input.status)) ? input.status as KnowledgeSourcesProjection["status"] : "unknown",
    contexts: asRecordArray(input.contexts).flatMap(context => {
      const contextId = asString(context.context_id); if (!contextId) return [];
      return [{ contextId, label: asString(context.label) ?? contextId, selected: context.selected === true,
        revision: asString(context.revision) ?? undefined, availableScopeIds: asStringArray(context.available_scope_ids) }];
    }),
    entries: asRecordArray(input.items).flatMap(item => {
      const resourceId = asString(item.resource_id); const sourceId = asString(item.source_id); const contextId = asString(item.context_id);
      if (!resourceId || !sourceId || !contextId) return [];
      const authorization = asRecord(item.authorization); const revision = asRecord(item.revision);
      const freshness = asRecord(item.freshness); const readiness = asRecord(item.readiness);
      return [{ resourceId, sourceId, contextId, label: asString(item.label) ?? sourceId, status: asString(item.status) ?? "unknown", connected: asOptionalBoolean(item.connected),
        scopeIds: asStringArray(item.scope_ids), consumerDomainIds: asStringArray(item.consumer_domain_ids), consumerPackageIds: asStringArray(item.consumer_package_ids),
        writeDomainIds: asStringArray(item.write_domain_ids), sourceWritable: asOptionalBoolean(item.source_writable), revisionIdentity: asString(item.revision_identity) ?? undefined,
        authorizationStatus: asString(authorization?.status) ?? "unknown", revisionStatus: asString(revision?.status) ?? "unknown",
        freshnessStatus: asString(freshness?.status) ?? "unknown", observedAt: asString(freshness?.observed_at) ?? undefined,
        readinessStatus: asString(readiness?.status) ?? asString(item.status) ?? "unknown", reason: asString(readiness?.reason) ?? asString(item.reason) ?? undefined,
        actionIds: asStringArray(item.action_ids), accessEditable: asOptionalBoolean(item.access_editable), accessEditReason: asString(item.access_edit_reason) ?? undefined, scopeExpansionAllowed: asOptionalBoolean(item.scope_expansion_allowed), availableScopeIds: asStringArray(item.available_scope_ids), knowledgeHealth: readKnowledgeHealth(item.knowledge_health) }];
    }),
    consumers: asRecordArray(input.available_consumers).flatMap(consumer => {
      const domainId = asString(consumer.domain_id); if (!domainId) return [];
      return [{ domainId, label: asString(consumer.label) ?? domainId, packageId: asString(consumer.package_id) ?? undefined }];
    }),
    actions: asRecordArray(input.available_actions).flatMap(action => {
      const actionId = asString(action.action_id); if (!actionId?.startsWith("knowledge_source_")) return [];
      const payload = { ...asRecord(action.default_payload), ...asRecord(action.payload) };
      return [{ actionId, label: asString(action.label) ?? actionId, payload: Object.fromEntries(Object.entries(payload).filter(([key, value]) => safePayloadFields.has(key) && (typeof value === "string" || Array.isArray(value) && value.every(item => typeof item === "string")))),
        payloadFields: knowledgeRequiredFields[actionId] ?? asStringArray(action.payload_fields), status: action.status === "unavailable" ? "unavailable" as const : "available" as const,
        dryRunSupported: action.dry_run_supported === true, confirmationRequired: action.confirmation_required === true,
        followUpActionIds: asStringArray(action.follow_up_action_ids), reason: asString(action.reason) ?? undefined }];
    })
  };
}

export function knowledgeSourceNeedsAttention(source: KnowledgeSourceRef): boolean {
  if (source.connected === false) return false;
  return [source.status, source.authorizationStatus, source.readinessStatus].some(status => ["attention", "attention_required", "attention_needed", "revoked", "unavailable"].includes(status))
    || source.revisionStatus === "stale" || source.freshnessStatus === "stale";
}

export function knowledgeSourceStatus(source: KnowledgeSourceRef): string {
  if (knowledgeSourceNeedsAttention(source)) return "attention_needed";
  return source.status === "ready" || source.status === "available" ? "ready" : "unknown";
}
