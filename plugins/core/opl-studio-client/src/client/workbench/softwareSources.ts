import type { CatalogOriginBasis, CatalogProvenanceRef, CatalogSourceRef, SoftwareSourceActionRef, SoftwareSourceRef, SoftwareSourcesProjection } from "./workbenchModel-package-contracts";
import { asLocalizedText, asOptionalBoolean, asRecord, asRecordArray, asString, asStringArray } from "./workbenchModel-primitives";

const statuses = new Set(["public", "authorized", "signed_out", "forbidden", "expired", "revoked", "loading", "ready", "stale", "unavailable"]);
const sourceActions = new Set(["source_refresh", "source_check", "source_configure", "source_disconnect"]);

/** Read owner metadata without inferring maintenance ownership from a name or publisher. */
export function readCatalogProvenance(value: Record<string, unknown>): Required<CatalogProvenanceRef> {
  const source = asRecord(value.catalog_source);
  return {
    catalogOrigin: value.catalog_origin === "opl" || value.catalog_origin === "external" ? value.catalog_origin : "unknown",
    originBasis: ["owner_projection", "owner_manifest", "native_carrier"].includes(String(value.origin_basis))
      ? value.origin_basis as CatalogOriginBasis : "unknown",
    catalogSource: {
      manager: asString(source?.manager) ?? "unknown",
      ...(asString(source?.marketplace_id) ? { marketplaceId: asString(source?.marketplace_id)! } : {}),
      delivery: ["host_bundled", "marketplace", "local"].includes(String(source?.delivery))
        ? source!.delivery as CatalogSourceRef["delivery"] : "unknown"
    }
  };
}

function safeActionPayload(value: unknown): Record<string, unknown> {
  const input = asRecord(value);
  if (!input) return {};
  return Object.fromEntries(["source_id", "provider_id", "credential_handle", "enabled"].flatMap(key => {
    const field = input[key];
    return typeof field === "string" || typeof field === "boolean" ? [[key, field]] : [];
  }));
}

function readSourceAction(value: Record<string, unknown>, sourceId: string): SoftwareSourceActionRef | null {
  const actionId = asString(value.action_id);
  if (!actionId || !sourceActions.has(actionId) || (actionId === "source_refresh") !== (sourceId === "public-registry:opl")) return null;
  return {
    actionId,
    label: asString(value.label) ?? actionId,
    labelI18n: value.label_i18n && typeof value.label_i18n === "object" ? {
      zh: asString((value.label_i18n as Record<string, unknown>)["zh-CN"] ?? (value.label_i18n as Record<string, unknown>).zh) ?? undefined,
      en: asString((value.label_i18n as Record<string, unknown>)["en-US"] ?? (value.label_i18n as Record<string, unknown>).en) ?? undefined,
    } : undefined,
    delegatedSurface: asString(value.delegated_surface) ?? undefined,
    payload: { ...safeActionPayload(value.default_payload), ...safeActionPayload(value.payload), source_id: sourceId },
    payloadFields: asStringArray(value.payload_fields ?? value.required_payload_fields),
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
    entries: asRecordArray(projection.entries).flatMap(entry => {
      const sourceId = asString(entry.source_id);
      const displayName = asString(entry.display_name);
      if (!sourceId || !displayName || entry.source_kind === "tap") return [];
      const publicCatalog = sourceId === "public-registry:opl";
      const rawStatus = asString(entry.status);
      const count = entry.entry_count;
      const catalogCache = asRecord(entry.catalog_cache);
      return [{
        sourceId,
        displayName,
        ...readCatalogProvenance(entry),
        ...(publicCatalog ? { catalogOrigin: "opl" as const } : {}),
        sourceKind: asString(entry.source_kind) ?? "registry",
        sourceRef: asString(entry.source_ref) ?? "",
        visibility: publicCatalog ? "public" : entry.visibility === "public" || entry.visibility === "authorized_only" ? entry.visibility : "unknown",
        providerId: asString(entry.provider_id) ?? undefined,
        status: rawStatus && statuses.has(rawStatus) ? rawStatus as SoftwareSourceRef["status"] : "unknown",
        enabled: asOptionalBoolean(entry.enabled),
        credentialHandlePresent: entry.credential_handle_present === true,
        accessRefreshRequired: entry.access_refresh_required === true,
        ...(catalogCache ? { catalogCache: {
          cached: catalogCache.cached === true,
          stale: catalogCache.stale === true,
          fetchedAt: asString(catalogCache.fetched_at) ?? undefined
        } } : {}),
        verifiedAt: asString(entry.verified_at) ?? undefined,
        ...(typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? { entryCount: count } : {}),
        availableActions: asRecordArray(entry.available_actions).flatMap(action => {
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

/** Only the source owner can request an automatic access check. */
export function pendingSoftwareSourceAccessCheck(projection: SoftwareSourcesProjection | undefined, attempted: ReadonlySet<string>) {
  for (const source of projection?.entries ?? []) {
    if (!source.accessRefreshRequired || source.enabled === false || !source.credentialHandlePresent || attempted.has(source.sourceId)) continue;
    const action = source.availableActions.find(candidate => candidate.actionId === "source_check"
      && candidate.status === "available" && !candidate.confirmationRequired
      && candidate.payload.source_id === source.sourceId);
    if (action) return { source, action };
  }
  return undefined;
}

export function softwareSourceStatusLabel(source: SoftwareSourceRef, locale: "zh" | "en"): string {
  if (source.enabled === false) return locale === "zh" ? "已停用" : "Disabled";
  const labels: Record<SoftwareSourceRef["status"], [string, string]> = {
    public: ["公开可用", "Public"],
    authorized: ["账户已连接", "Account connected"],
    signed_out: ["需要连接账户", "Connect an account"],
    forbidden: ["无访问权限", "No access"],
    expired: ["授权已过期", "Authorization expired"],
    revoked: ["授权已撤销", "Authorization revoked"],
    loading: ["正在读取目录", "Loading catalog"],
    ready: ["目录可用", "Catalog ready"],
    stale: ["使用上次同步的目录", "Using the last synchronized catalog"],
    unavailable: ["目录暂不可用", "Catalog unavailable"],
    unknown: ["尚未验证", "Not verified"]
  };
  return labels[source.status][locale === "zh" ? 0 : 1];
}

export function softwareSourceStatusTone(source: SoftwareSourceRef): "ready" | "attention" | "neutral" {
  if (source.enabled === false || source.status === "unknown" || source.status === "signed_out" || source.status === "loading") return "neutral";
  return source.status === "public" || source.status === "authorized" || source.status === "ready" ? "ready" : "attention";
}

export function softwareSourceActionLabel(actionId: string, locale: "zh" | "en", fallback: string): string {
  const labels: Record<string, [string, string]> = {
    source_check: ["检查访问", "Check access"],
    source_refresh: ["更新目录", "Refresh catalog"],
    source_configure: ["连接 GitHub 账户", "Connect GitHub account"],
    source_disconnect: ["断开连接", "Disconnect"]
  };
  return labels[actionId]?.[locale === "zh" ? 0 : 1] ?? fallback;
}
