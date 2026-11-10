import type { SoftwareSourceActionRef, SoftwareSourceRef, SoftwareSourcesProjection } from "./workbenchModel-package-contracts";
import { asOptionalBoolean, asRecord, asRecordArray, asString, asStringArray } from "./workbenchModel-primitives";

const statuses = new Set(["public", "authorized", "signed_out", "forbidden", "expired", "revoked"]);

function safeActionPayload(value: unknown): Record<string, unknown> {
  const input = asRecord(value);
  if (!input) return {};
  // This projection intentionally admits references only. The installer owns all
  // provider lookup and must never send credentials to the renderer.
  return Object.fromEntries(["source_id", "provider_id", "credential_handle", "enabled"].flatMap((key) => {
    const field = input[key];
    return typeof field === "string" || typeof field === "boolean" ? [[key, field]] : [];
  }));
}

function readSourceAction(value: Record<string, unknown>, sourceId: string): SoftwareSourceActionRef | null {
  const actionId = asString(value.action_id);
  if (!actionId) return null;
  return {
    actionId,
    label: asString(value.label) ?? actionId,
    delegatedSurface: asString(value.delegated_surface) ?? undefined,
    payload: { ...(actionId === "source_list" ? {} : { source_id: sourceId }), ...safeActionPayload(value.default_payload), ...safeActionPayload(value.payload) },
    payloadFields: asStringArray(value.payload_fields),
    status: value.status === "unavailable" ? "unavailable" : "available",
    mutates: asString(value.mutates) ?? undefined,
    dryRunSupported: value.dry_run_supported === true,
    confirmationRequired: value.confirmation_required === true,
    dangerLevel: asString(value.danger_level) ?? undefined,
    impact: asString(value.impact) ?? undefined,
    followUpActionIds: asStringArray(value.follow_up_action_ids),
    verifyActionId: asString(value.verify_action_id) ?? undefined,
    reason: asString(value.reason) ?? undefined
  };
}

export function readSoftwareSourcesProjection(value: unknown): SoftwareSourcesProjection | undefined {
  const projection = asRecord(value);
  if (projection?.surface_kind !== "opl_software_sources_projection.v1") return undefined;
  const authority = asRecord(projection.authority_boundary);
  return {
    status: projection.status === "available" || projection.status === "attention_required" ? projection.status : "unknown",
    entries: asRecordArray(projection.entries).flatMap((entry) => {
      const sourceId = asString(entry.source_id);
      const displayName = asString(entry.display_name);
      if (!sourceId || !displayName) return [];
      const rawStatus = asString(entry.status);
      const count = entry.entry_count;
      return [{
        sourceId,
        displayName,
        sourceKind: asString(entry.source_kind) ?? "registry",
        sourceRef: asString(entry.source_ref) ?? "",
        visibility: entry.visibility === "public" || entry.visibility === "authorized_only" ? entry.visibility : "unknown",
        providerId: asString(entry.provider_id) ?? undefined,
        status: rawStatus && statuses.has(rawStatus) ? rawStatus as SoftwareSourceRef["status"] : "unknown",
        enabled: asOptionalBoolean(entry.enabled),
        credentialHandlePresent: entry.credential_handle_present === true,
        verifiedAt: asString(entry.verified_at) ?? undefined,
        ...(typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? { entryCount: count } : {}),
        availableActions: asRecordArray(entry.available_actions).flatMap((action) => {
          const projected = readSourceAction(action, sourceId);
          return projected ? [projected] : [];
        })
      } satisfies SoftwareSourceRef];
    }),
    ...(authority ? { authorityBoundary: {
      owner: asString(authority.owner) ?? undefined,
      credentialValuesExposed: asOptionalBoolean(authority.credential_values_exposed) ?? undefined
    } } : {})
  };
}

export function softwareSourceStatusLabel(source: SoftwareSourceRef, locale: "zh" | "en"): string {
  if (source.enabled === false) return locale === "zh" ? "已停用" : "Disabled";
  const labels: Record<SoftwareSourceRef["status"], [string, string]> = {
    public: ["公开可用", "Public"],
    authorized: ["已授权", "Authorized"],
    signed_out: ["需要连接账户", "Connect an account"],
    forbidden: ["无访问权限", "No access"],
    expired: ["授权已过期", "Authorization expired"],
    revoked: ["授权已撤销", "Authorization revoked"],
    unknown: ["尚未验证", "Not verified"]
  };
  return labels[source.status][locale === "zh" ? 0 : 1];
}

export function softwareSourceStatusTone(source: SoftwareSourceRef): "ready" | "attention" | "neutral" {
  if (source.enabled === false || source.status === "unknown" || source.status === "signed_out") return "neutral";
  return source.status === "public" || source.status === "authorized" ? "ready" : "attention";
}

export function softwareSourceActionLabel(actionId: string, locale: "zh" | "en", fallback: string): string {
  const labels: Record<string, [string, string]> = {
    source_list: ["刷新目录", "Refresh catalog"],
    source_check: ["检查访问", "Check access"],
    source_configure: ["连接 GitHub 账户", "Connect GitHub account"],
    source_disconnect: ["断开连接", "Disconnect"]
  };
  return labels[actionId]?.[locale === "zh" ? 0 : 1] ?? fallback;
}
