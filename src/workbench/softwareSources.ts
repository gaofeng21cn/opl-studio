import type { CatalogOriginBasis, CatalogProvenanceRef, CatalogSourceRef, NativeSoftwareItemRef, SoftwareSourceActionRef, SoftwareSourceRef, SoftwareSourcesProjection, SoftwareInstallationRef, SoftwareActivationStatus } from "./workbenchModel-package-contracts";
import { asLocalizedText, asOptionalBoolean, asRecord, asRecordArray, asString, asStringArray } from "./workbenchModel-primitives";

const statuses = new Set(["public", "authorized", "signed_out", "forbidden", "expired", "revoked"]);

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
  // This projection intentionally admits references only. The installer owns all
  // provider lookup and must never send credentials to the renderer.
  return Object.fromEntries(["source_id", "provider_id", "credential_handle", "enabled", "item_id", "expected_revision", "package_id", "installation_id", "operation", "version", "profile"].flatMap((key) => {
    const field = input[key];
    return typeof field === "string" || typeof field === "boolean" ? [[key, field]] : [];
  }));
}

function readNativeItem(item: Record<string, unknown>, sourceId: string): NativeSoftwareItemRef | null {
  const itemId = asString(item.item_id);
  const name = asString(item.name);
  if (!itemId || !name || !["formula", "cask", "managed_runtime"].includes(String(item.kind))) return null;
  return {
    itemId, name,
    ...readCatalogProvenance(item),
    productId: asString(item.product_id) ?? undefined,
    productDisplayName: asString(item.product_display_name) ?? undefined,
    homebrewInstalled: item.homebrew_installed === undefined ? undefined : asOptionalBoolean(item.homebrew_installed),
    homebrewInstalledVersion: asString(item.homebrew_installed_version) ?? undefined,
    installationOwner: asString(item.installation_owner) ?? undefined,
    installationKind: asString(item.installation_kind) ?? undefined,
    installationEvidence: asString(item.installation_evidence) ?? undefined,
    ownerSettingsRoute: asString(item.owner_settings_route) ?? undefined,
    installationId: asString(item.installation_id) ?? undefined,
    installationMode: item.mode === "development" || item.mode === "installed" ? item.mode : undefined,
    location: asString(item.location) ?? undefined,
    active: typeof item.active === "boolean" ? item.active : undefined,
    activeInstallationId: asString(item.active_installation_id) ?? undefined,
    activeInstallationStatus: readSoftwareActivationStatus(item.active_installation_status),
    ...(Array.isArray(item.installations) ? { installations: readSoftwareInstallations(item.installations) } : {}),
    releaseChannel: item.release_channel === "stable" || item.release_channel === "nightly" ? item.release_channel : undefined,
    installationVariant: ["standard", "full", "default"].includes(String(item.installation_variant)) ? item.installation_variant as NativeSoftwareItemRef["installationVariant"] : undefined,
    recommendedForProduct: typeof item.recommended_for_product === "boolean" ? item.recommended_for_product : undefined,
    selectedForProduct: typeof item.selected_for_product === "boolean" ? item.selected_for_product : undefined,
    selectionBasis: asString(item.selection_basis) ?? undefined,
    displayName: asString(item.display_name) ?? name,
    description: asString(item.description) ?? undefined,
    displayNameI18n: asLocalizedText(item.display_name_i18n),
    descriptionI18n: asLocalizedText(item.description_i18n),
    kind: item.kind as NativeSoftwareItemRef["kind"],
    installed: asOptionalBoolean(item.installed),
    installedVersion: asString(item.installed_version) ?? undefined,
    installedDisplayVersion: asString(item.installed_display_version) ?? undefined,
    installedBuildKind: item.installed_build_kind === "local-development" ? "local-development" : undefined,
    installedBuildId: asString(item.installed_build_id) ?? undefined,
    availableVersion: asString(item.available_version) ?? undefined,
    availableDisplayVersion: asString(item.available_display_version) ?? undefined,
    pendingVersion: asString(item.pending_version) ?? undefined,
    updateStatus: ["available", "current", "needs_restart", "not_installed"].includes(String(item.update_status)) ? item.update_status as NativeSoftwareItemRef["updateStatus"] : "unknown",
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
    labelI18n: value.label_i18n && typeof value.label_i18n === 'object' ? {
      zh: asString((value.label_i18n as Record<string, unknown>)['zh-CN'] ?? (value.label_i18n as Record<string, unknown>).zh) ?? undefined,
      en: asString((value.label_i18n as Record<string, unknown>)['en-US'] ?? (value.label_i18n as Record<string, unknown>).en) ?? undefined,
    } : undefined,
    delegatedSurface: asString(value.delegated_surface) ?? undefined,
    payload: { ...(actionId === "source_list" || !sourceId ? {} : { source_id: sourceId }), ...safeActionPayload(value.default_payload), ...safeActionPayload(value.payload) },
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

export function readSoftwareActivationStatus(value: unknown): SoftwareActivationStatus | undefined {
  return ["active", "inactive", "unknown", "conflict"].includes(String(value)) ? value as SoftwareActivationStatus : undefined;
}

export function readSoftwareInstallationActions(value: unknown): SoftwareSourceActionRef[] {
  return asRecordArray(value).flatMap(action => {
    const projected = readSourceAction(action, "");
    return projected ? [projected] : [];
  });
}

export function readSoftwareInstallations(value: unknown): SoftwareInstallationRef[] {
  return asRecordArray(value).flatMap(item => {
    const installationId = asString(item.installation_id), version = asString(item.version), location = asString(item.location);
    if (!installationId || !version || !location || item.entrypoint_verified !== true
      || !["installed", "development"].includes(String(item.mode))) return [];
    return [{ installationId, version, location,
      kind: asString(item.kind) ?? "unknown", manager: asString(item.manager) ?? "unknown",
      mode: item.mode as SoftwareInstallationRef["mode"], active: item.active === true,
      displayVersion: asString(item.display_version) ?? undefined,
      locationRef: asString(item.location_ref) ?? undefined, evidenceRef: asString(item.evidence_ref) ?? undefined,
      revision: asString(item.revision) ?? undefined, availableVersion: asString(item.available_version) ?? undefined,
      ownerSettingsRoute: asString(item.owner_settings_route) ?? undefined,
      availableActions: readSoftwareInstallationActions(item.available_actions)
    }];
  });
}

export function readSoftwareSourcesProjection(value: unknown): SoftwareSourcesProjection | undefined {
  const projection = asRecord(value);
  if (projection?.surface_kind !== "opl_software_sources_projection.v1") return undefined;
  const authority = asRecord(projection.authority_boundary);
  return {
    status: projection.status === "available" || projection.status === "attention_required" ? projection.status : "unknown",
    installedProducts: asRecordArray(projection.installed_products).flatMap(item => {
      const projected = readNativeItem(item, "");
      return projected ? [{ ...projected, availableActions: [] }] : [];
    }),
    entries: asRecordArray(projection.entries).flatMap((entry) => {
      const sourceId = asString(entry.source_id);
      const displayName = asString(entry.display_name);
      if (!sourceId || !displayName) return [];
      const rawStatus = asString(entry.status);
      const count = entry.entry_count;
      return [{
        sourceId,
        displayName,
        ...readCatalogProvenance(entry),
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

export function nativeUpdateStatusLabel(status: NativeSoftwareItemRef["updateStatus"], locale: "zh" | "en") {
  return ({ available: ["有可用更新", "Update available"], current: ["与来源版本一致", "Matches source version"],
    needs_restart: ["需要重启", "Restart required"], not_installed: ["未安装", "Not installed"], unknown: ["更新状态待确认", "Update status not confirmed"] })[status][locale === "zh" ? 0 : 1];
}

export function nativeSoftwareProducts(projection?: SoftwareSourcesProjection) {
  type Channels = ReturnType<typeof nativeSoftwareEntries>;
  const groups = new Map<string, { channels: Channels; installed?: NativeSoftwareItemRef }>();
  for (const entry of nativeSoftwareEntries(projection)) {
    const key = entry.item.productId ?? `${entry.source.sourceId}:${entry.item.itemId}`;
    const group = groups.get(key) ?? { channels: [] };
    group.channels.push(entry);
    groups.set(key, group);
  }
  for (const item of projection?.installedProducts ?? []) {
    const key = item.productId ?? item.itemId;
    groups.set(key, { ...(groups.get(key) ?? { channels: [] }), installed: item });
  }
  return [...groups].map(([productId, { channels, installed }]) => {
    const selected = channels.filter(({ item }) => item.selectedForProduct === true);
    // Selection is Framework-owned. A legacy single-source projection has no choice to resolve.
    const primary = selected.length === 1 ? selected[0]
      : channels.length === 1 && channels[0].item.selectedForProduct === undefined ? channels[0] : undefined;
    const observed = installed ?? primary?.item ?? channels[0]?.item;
    const item = installed ? {
      ...primary?.item, ...installed,
      itemId: primary?.item.itemId ?? installed.itemId,
      name: primary?.item.name ?? installed.name,
      availableVersion: installed.availableVersion ?? primary?.item.availableVersion,
      availableDisplayVersion: installed.availableDisplayVersion ?? (installed.availableVersion ? undefined : primary?.item.availableDisplayVersion),
      availableActions: installed.availableActions.length ? installed.availableActions : primary?.item.availableActions ?? [],
      revision: installed.availableActions.length ? installed.revision : primary?.item.revision,
      homebrewInstalled: primary?.item.homebrewInstalled,
      homebrewInstalledVersion: primary?.item.homebrewInstalledVersion,
      releaseChannel: primary?.item.releaseChannel,
      installationVariant: primary?.item.installationVariant,
      selectionBasis: primary?.item.selectionBasis,
    } : primary?.item ?? { ...observed!, availableVersion: undefined, availableDisplayVersion: undefined, availableActions: [] };
    const observations = [...channels.map(channel => channel.item), installed].filter((entry): entry is NativeSoftwareItemRef => Boolean(entry));
    const installations = new Map<string, SoftwareInstallationRef>();
    for (const observation of observations) {
      for (const installation of observation.installations ?? []) installations.set(installation.installationId, installation);
      if (!observation.installations && observation.installed === true && observation.installationId && observation.location) {
        installations.set(observation.installationId, {
          installationId: observation.installationId, location: observation.location,
          kind: observation.installationKind ?? observation.kind,
          version: observation.installedVersion ?? "—", displayVersion: observation.installedDisplayVersion,
          mode: observation.installationMode ?? (observation.installedBuildKind === "local-development" || observation.installationKind === "source_link" ? "development" : "installed"),
          manager: observation.installationOwner ?? "unknown", active: observation.active === true,
          availableVersion: observation.availableDisplayVersion ?? observation.availableVersion ?? primary?.item.availableDisplayVersion ?? primary?.item.availableVersion,
          ownerSettingsRoute: observation.ownerSettingsRoute, availableActions: []
        });
      }
    }
    return { source: primary?.source, item, productId, channels, installations: [...installations.values()] };
  });
}

export function nativeSoftwareInventory(projection?: SoftwareSourcesProjection) {
  const entries = nativeSoftwareProducts(projection);
  const sources = projection?.entries.filter(source => source.sourceKind === "tap") ?? [];
  return {
    total: entries.length,
    installed: entries.filter(({ item }) => item.installed === true).length,
    installable: entries.filter(({ item }) => item.installed === false && item.availableActions.some(action => action.actionId === "source_install" && action.status === "available")).length,
    updatesAvailable: entries.filter(({ item }) => item.installed === true && item.updateStatus === "available").length,
    complete: sources.length > 0 && sources.every(source => source.inventoryStatus === "available")
  };
}

export function nativeSoftwareMatches(item: NativeSoftwareItemRef, source: SoftwareSourceRef | undefined, query: string, statusFilter: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery && ![item.itemId, item.name, item.displayName, item.description,
    item.catalogSource?.manager, item.catalogSource?.marketplaceId,
    ...Object.values(item.displayNameI18n ?? {}), ...Object.values(item.descriptionI18n ?? {}),
    source?.displayName, source?.sourceRef].join(" ").toLowerCase().includes(normalizedQuery)) return false;
  if (statusFilter === "all") return true;
  if (statusFilter === "development") return item.installationKind === "source_link";
  if (statusFilter === "ready" || statusFilter === "installed") return item.installed === true && item.installationKind !== "source_link";
  if (statusFilter === "not_installed") return item.installed === false;
  if (statusFilter === "unknown") return item.installed === null;
  if (statusFilter === "update:update_available" || statusFilter === "update:available") return item.updateStatus === "available";
  if (statusFilter === "update:current") return item.updateStatus === "current";
  if (statusFilter === "update:unknown") return item.updateStatus === "unknown";
  return false;
}

export function nativeInstallationLabel(item: NativeSoftwareItemRef, locale: "zh" | "en"): string {
  const labels: Record<string, [string, string]> = {
    homebrew_formula: ["Homebrew 命令行安装", "Homebrew formula"],
    homebrew_cask: ["Homebrew 应用安装", "Homebrew cask"],
    managed_runtime: ["OPL 受管运行时", "OPL managed runtime"],
    app_bundle: ["本机应用安装", "Local application bundle"],
    source_link: ["源码开发连接", "Source development link"],
  };
  return labels[item.installationKind ?? ""]?.[locale === "zh" ? 0 : 1] ?? (locale === "zh" ? "安装方式待确认" : "Installation method not confirmed");
}

/** Display identities are owner supplied; updater and carrier versions remain unchanged. */
export function nativeInstalledDisplayVersion(item: NativeSoftwareItemRef): string | undefined {
  return item.installedDisplayVersion ?? item.installedVersion;
}

export function nativeAvailableDisplayVersion(item: NativeSoftwareItemRef): string | undefined {
  return item.availableDisplayVersion ?? item.availableVersion;
}

/** Carrier actions are bound to the carrier receipt, not product presence. */
export function nativeCarrierInstalled(item: NativeSoftwareItemRef): boolean | null {
  return item.homebrewInstalled === undefined ? item.installed : item.homebrewInstalled;
}
