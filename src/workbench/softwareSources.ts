import type { NativeSoftwareItemRef, SoftwareSourceActionRef, SoftwareSourceRef, SoftwareSourcesProjection } from "./workbenchModel-package-contracts";
import { asLocalizedText, asOptionalBoolean, asRecord, asRecordArray, asString, asStringArray } from "./workbenchModel-primitives";

const statuses = new Set(["public", "authorized", "signed_out", "forbidden", "expired", "revoked"]);

function safeActionPayload(value: unknown): Record<string, unknown> {
  const input = asRecord(value);
  if (!input) return {};
  // This projection intentionally admits references only. The installer owns all
  // provider lookup and must never send credentials to the renderer.
  return Object.fromEntries(["source_id", "provider_id", "credential_handle", "enabled", "item_id", "expected_revision"].flatMap((key) => {
    const field = input[key];
    return typeof field === "string" || typeof field === "boolean" ? [[key, field]] : [];
  }));
}

function readNativeItem(item: Record<string, unknown>, sourceId: string): NativeSoftwareItemRef | null {
  const itemId = asString(item.item_id);
  const name = asString(item.name);
  if (!itemId || !name || !["formula", "cask"].includes(String(item.kind))) return null;
  return {
    itemId, name, displayName: asString(item.display_name) ?? name,
    description: asString(item.description) ?? undefined,
    displayNameI18n: asLocalizedText(item.display_name_i18n),
    descriptionI18n: asLocalizedText(item.description_i18n),
    kind: item.kind as NativeSoftwareItemRef["kind"],
    installed: asOptionalBoolean(item.installed),
    installedVersion: asString(item.installed_version) ?? undefined,
    availableVersion: asString(item.available_version) ?? undefined,
    updateStatus: ["available", "current", "not_installed"].includes(String(item.update_status)) ? item.update_status as NativeSoftwareItemRef["updateStatus"] : "unknown",
    revision: asString(item.revision) ?? undefined,
    availableActions: asRecordArray(item.available_actions).flatMap((action) => {
      if (!["source_install", "source_update", "source_uninstall"].includes(String(action.action_id))) return [];
      const projected = readSourceAction(action, sourceId);
      return projected ? [projected] : [];
    })
  };
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
        ...(entry.source_kind === "tap" ? {
          inventoryStatus: ["available", "not_checked", "unavailable"].includes(String(entry.inventory_status)) ? entry.inventory_status as SoftwareSourceRef["inventoryStatus"] : "unknown",
          inventoryReason: asString(entry.inventory_reason) ?? undefined,
          inventoryCheckedAt: asString(entry.inventory_checked_at) ?? undefined,
          versionAuthority: asString(entry.version_basis) ?? asString(entry.version_authority) ?? undefined,
          installationOwner: asString(entry.installation_owner) ?? undefined,
          nativeItems: asRecordArray(entry.native_items).flatMap((item) => {
            const projected = readNativeItem(item, sourceId);
            return projected ? [projected] : [];
          })
        } : {}),
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
    authorized: ["账户已连接", "Account connected"],
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
    source_refresh: ["更新目录", "Update catalog"],
    source_setup: ["启用此软件源", "Enable source"],
    source_install: ["安装", "Install"],
    source_update: ["更新", "Update"],
    source_uninstall: ["卸载", "Uninstall"],
    source_configure: ["连接 GitHub 账户", "Connect GitHub account"],
    source_disconnect: ["断开连接", "Disconnect"]
  };
  return labels[actionId]?.[locale === "zh" ? 0 : 1] ?? fallback;
}

export function nativeSoftwareEntries(projection?: SoftwareSourcesProjection) {
  return projection?.entries.filter(source => source.sourceKind === "tap" && source.inventoryStatus === "available").flatMap(source => (source.nativeItems ?? []).map(item => ({ source, item }))) ?? [];
}

export function nativeSoftwareInventory(projection?: SoftwareSourcesProjection) {
  const entries = nativeSoftwareEntries(projection);
  const sources = projection?.entries.filter(source => source.sourceKind === "tap") ?? [];
  return {
    total: entries.length,
    installed: entries.filter(({ item }) => item.installed === true).length,
    installable: entries.filter(({ item }) => item.installed === false && item.availableActions.some(action => action.actionId === "source_install" && action.status === "available")).length,
    updatesAvailable: entries.filter(({ item }) => item.updateStatus === "available").length,
    complete: sources.length > 0 && sources.every(source => source.inventoryStatus === "available")
  };
}

export function nativeSoftwareMatches(item: NativeSoftwareItemRef, source: SoftwareSourceRef, query: string, statusFilter: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery && ![item.itemId, item.name, item.displayName, item.description,
    ...Object.values(item.displayNameI18n ?? {}), ...Object.values(item.descriptionI18n ?? {}),
    source.displayName, source.sourceRef].join(" ").toLowerCase().includes(normalizedQuery)) return false;
  if (statusFilter === "all") return true;
  if (statusFilter === "ready" || statusFilter === "installed") return item.installed === true;
  if (statusFilter === "not_installed") return item.installed === false;
  if (statusFilter === "unknown") return item.installed === null;
  if (statusFilter === "update:update_available" || statusFilter === "update:available") return item.updateStatus === "available";
  if (statusFilter === "update:current") return item.updateStatus === "current";
  if (statusFilter === "update:unknown") return item.updateStatus === "unknown";
  return false;
}
