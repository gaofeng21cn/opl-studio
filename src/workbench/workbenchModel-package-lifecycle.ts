import type {
  AgentPackageDependencyRef,
  AgentPackageLifecycleRef,
  AgentPackageReadinessRef,
  AgentPackageSelectionIntent,
  AgentPackageShortcutRef,
  PackageLifecycleActionKind,
  PackageLifecycleActionRef,
  PackageLifecycleDetailRef,
  PackageLifecycleDisplayRef,
  PackageLifecycleSearchMetadata,
  PackageLifecycleStatusAxis,
  WorkbenchActionRef
} from "./workbenchModel-contracts";
import type { AgentPackageAccessRef } from "./workbenchModel-package-contracts";
import {
  asBoolean,
  asFiniteNumber,
  asLocalizedText,
  asOptionalBoolean,
  asRecord,
  asRecordArray,
  asString,
  asStringArray,
  firstString
} from "./workbenchModel-primitives";
import { firstStringField, uniqueStrings } from "./workbenchModel-presentation";
import { readCatalogProvenance } from "./softwareSources";

function packageIdentity(record: Record<string, unknown>, index: number): string {
  return firstStringField(record, ["package_id", "packageId", "agent_id", "module_id", "id"])
    ?? `package-${index}`;
}

function packageLabel(record: Record<string, unknown>): string {
  return firstStringField(record, ["display_name", "displayName", "package_short_name", "label", "name", "module_id"])
    ?? "Agent package";
}

function packageDisplayRef(label: string, ref: string | null, summary: string): PackageLifecycleDisplayRef | null {
  return ref ? { label, ref, summary } : null;
}

function recordValues(value: unknown): Record<string, unknown>[] {
  const record = asRecord(value);
  return record ? Object.values(record).map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function packageFileRef(record: Record<string, unknown>, key: string): string | null {
  return asString(asRecord(record.files)?.[key]);
}

function canonicalSummaryRow(agentPackages: Record<string, unknown>): Record<string, unknown> {
  const directory = asRecord(agentPackages.directory);
  const statusIndex = asRecord(agentPackages.status_index);
  const files = {
    ...(asRecord(directory?.files) ?? {}),
    ...(asRecord(statusIndex?.files) ?? {}),
    ...(asRecord(agentPackages.files) ?? {})
  };
  const installedCount = directory?.installed_package_count ?? statusIndex?.installed_package_count ?? 0;
  return {
    surface_kind: asString(agentPackages.surface_kind) ?? "opl_app_agent_packages_projection",
    package_id: "agent_packages_directory",
    display_name: "Agent package directory",
    lifecycle_status: installedCount ? "canonical_projection_available" : "canonical_projection_available_no_installed_packages",
    install_state: installedCount ? "canonical_rows_available" : "no_installed_package_rows",
    update_state: asString(directory?.status) ?? "no_package_update_status",
    source_state: "canonical_agent_packages_projection",
    trust_state: "not_reported",
    codex_surface_state: installedCount ? "from_agent_packages_projection" : "no_codex_package_surface_rows",
    conditions: [
      `entry_count=${directory?.entry_count ?? 0}`,
      `installed_package_count=${installedCount}`,
      `migration_required_count=${directory?.migration_required_count ?? 0}`,
      "modules.items fallback suppressed because canonical agent_packages projection is present"
    ],
    recommended_action: installedCount ? "inspect package refs from app_state.agent_packages" : "install_from_manifest_url through App action refs",
    source_kind: asString(directory?.source_catalog_kind) ?? "canonical_agent_packages",
    source_surface: asString(asRecord(agentPackages.source)?.list_surface),
    files,
    physical_surface: {
      status: installedCount ? "package_rows_reported" : "no_installed_package_physical_surface",
      home_shortcut_preferences_file: asString(files.home_shortcut_preferences_file)
    }
  };
}

function packageRowsFromCanonicalProjection(agentPackages: Record<string, unknown> | null, appState: Record<string, unknown>): Record<string, unknown>[] {
  if (!agentPackages) return [];
  const directory = asRecord(agentPackages.directory);
  const statusIndex = asRecord(agentPackages.status_index);
  const directoryRows = asRecordArray(directory?.entries);
  const statusRows = [
    ...asRecordArray(statusIndex?.packages),
    ...recordValues(statusIndex?.packages),
    ...asRecordArray(agentPackages.status_packages),
    ...recordValues(agentPackages.status_packages)
  ];
  const homeRows = [
    ...asRecordArray(statusIndex?.home_shortcut_preferences),
    ...asRecordArray(agentPackages.home_shortcut_preferences),
    ...asRecordArray(appState.home_agent_shortcuts)
  ];
  const byId = new Map<string, Record<string, unknown>>();
  const mergeRow = (row: Record<string, unknown>) => {
    const id = packageIdentity(row, byId.size);
    byId.set(id, { ...(byId.get(id) ?? {}), ...row, package_id: id });
  };
  for (const row of statusRows) mergeRow(row);
  // Directory entries own lifecycle, presentation, readiness, and exact actions.
  for (const row of directoryRows) mergeRow(row);
  for (const row of homeRows) {
    const id = packageIdentity(row, byId.size);
    const current = byId.get(id) ?? { package_id: id };
    const preferences = asRecordArray(current.home_shortcut_preferences);
    byId.set(id, {
      ...current,
      package_id: id,
      home_shortcut_preferences: [...preferences, row]
    });
  }
  return Array.from(byId.values());
}

function packageStatusAxes(
  record: Record<string, unknown>,
  source: PackageLifecycleStatusAxis["source"]
): PackageLifecycleStatusAxis[] {
  const presence = asRecord(record.presence);
  const installedReadiness = asRecord(record.installed_readiness);
  const git = asRecord(record.git);
  return [
    {
      label: "Install",
      value: firstStringField(record, ["install_state", "install_status", "lifecycle_status", "status"])
        ?? asString(installedReadiness?.physical_status)
        ?? asString(presence?.status)
        ?? "unknown",
      source
    },
    { label: "Update", value: firstStringField(record, ["update_state", "update_status", "recommended_action"]) ?? asString(git?.sync_status) ?? "unknown", source },
    { label: "Source", value: packageSourceKind(record), source },
    { label: "Trust", value: firstStringField(record, ["trust_state", "trust_tier", "health_status"]) ?? "unknown", source },
    { label: "Codex surface", value: packageCodexSurface(record), source }
  ];
}

function packageConditionText(record: Record<string, unknown>): string {
  return uniqueStrings([
    ...asStringArray(record.conditions),
    ...asStringArray(record.failure_conditions),
    ...asStringArray(record.blocked_conditions),
    ...asStringArray(record.issues),
    ...asStringArray(record.diagnostics),
    asString(record.status_reason),
    asString(record.failure_reason),
    asString(record.reason)
  ]).join(" | ") || "none_reported";
}

function packageRecommendedAction(record: Record<string, unknown>): string {
  const recommendation = asRecord(record.action_recommendation) ?? asRecord(record.recommendation);
  return firstStringField(record, ["recommended_action", "recommendedAction", "next_action", "repair_action"])
    ?? firstStringField(recommendation ?? {}, ["action_id", "summary", "label"])
    ?? "none_reported";
}

function packageSourceKind(record: Record<string, unknown>): string {
  const sourceExplanation = asRecord(record.source_explanation);
  const installedCarrier = asRecord(record.installed_carrier_readback);
  const sourcePolicy = asRecord(record.source_policy);
  const distributionPayload = asRecord(record.distribution_payload);
  return firstStringField(record, ["source_kind", "install_origin", "source_state"])
    ?? firstStringField(sourceExplanation ?? {}, ["kind", "source"])
    ?? asString(installedCarrier?.kind)
    ?? asString(sourcePolicy?.effective_install_update_source)
    ?? asString(distributionPayload?.source_kind)
    ?? "unknown";
}

function packageEffectiveSourcePolicy(record: Record<string, unknown>): Record<string, unknown> | null {
  const sourceExplanation = asRecord(record.source_explanation);
  return asRecord(sourceExplanation?.effective_source_policy) ?? asRecord(record.source_policy);
}

function packageSourceMode(record: Record<string, unknown>): string {
  const sourcePolicy = packageEffectiveSourcePolicy(record);
  return asString(sourcePolicy?.effective_install_update_source)
    ?? asString(sourcePolicy?.desired_source_kind)
    ?? packageSourceKind(record);
}

function packageAutomaticUpdate(record: Record<string, unknown>): boolean | null {
  return asOptionalBoolean(packageEffectiveSourcePolicy(record)?.package_channel_auto_update);
}

function packageAccess(record: Record<string, unknown>): AgentPackageAccessRef {
  const access = asRecord(record.package_access);
  const visibility = asString(access?.visibility);
  const status = asString(access?.status);
  return {
    visibility: visibility === "public" || visibility === "authorized_only" ? visibility : "unknown",
    status: status === "public" || status === "authorized" || status === "signed_out" || status === "forbidden"
      || status === "expired" || status === "revoked" ? status : "unknown",
    ...(asString(access?.provider_id) ? { providerId: asString(access?.provider_id)! } : {}),
    ...(asString(access?.source_ref) ? { sourceRef: asString(access?.source_ref)! } : {}),
    ...(asString(access?.access_policy_ref) ? { accessPolicyRef: asString(access?.access_policy_ref)! } : {}),
    ...(asString(access?.verified_at) ? { verifiedAt: asString(access?.verified_at)! } : {}),
    ...(asString(access?.security_revision) ? { securityRevision: asString(access?.security_revision)! } : {}),
    ...(asString(access?.reason) ? { reason: asString(access?.reason)! } : {}),
    discoverAllowed: asOptionalBoolean(access?.discover_allowed),
    downloadAllowed: asOptionalBoolean(access?.download_allowed)
  };
}

function packageCapabilityMetadata(record: Record<string, unknown>): {
  requiredSkillIds: string[];
  optionalSkillRefs: string[];
} {
  const metadata = asRecord(record.capability_metadata);
  return {
    requiredSkillIds: asStringArray(metadata?.required_skill_ids),
    optionalSkillRefs: asStringArray(metadata?.optional_skill_refs)
  };
}

function packageDependencies(record: Record<string, unknown>): AgentPackageDependencyRef[] {
  const readiness = asRecord(record.dependency_readiness);
  return asRecordArray(readiness?.checks).flatMap((check) => {
    const packageId = asString(check.package_id);
    if (!packageId) return [];
    return [{
      packageId,
      required: asOptionalBoolean(check.required),
      present: asOptionalBoolean(check.present),
      callable: asOptionalBoolean(check.callable),
      status: asString(check.status) ?? "unknown",
      reasons: asStringArray(check.reasons)
    } satisfies AgentPackageDependencyRef];
  });
}

function packageReadiness(record: Record<string, unknown>, installed: boolean | null): AgentPackageReadinessRef {
  const readiness = asRecord(record.readiness);
  const presence = asRecord(record.presence);
  const present = asOptionalBoolean(presence?.present);
  const callable = asOptionalBoolean(presence?.callable);
  const operationalReady = asOptionalBoolean(readiness?.operational_ready);
  const launchAllowed = asOptionalBoolean(readiness?.launch_allowed);
  const unavailable = installed === false
    || present === false
    || callable === false
    || operationalReady === false
    || launchAllowed === false;
  const available = installed === true && present === true && callable === true;
  return {
    status: asString(readiness?.status) ?? "unknown",
    operationalReady,
    launchAllowed,
    verificationDeferred: asOptionalBoolean(readiness?.verification_deferred),
    ...(asString(readiness?.reason) ? { reason: asString(readiness?.reason) as string } : {}),
    ...(asString(readiness?.detail_surface) ? { detailSurface: asString(readiness?.detail_surface) as string } : {}),
    ...(asString(readiness?.status_read_error) ? { statusReadError: asString(readiness?.status_read_error) as string } : {}),
    present,
    callable,
    selectionStatus: unavailable ? "unavailable" : available ? "available" : "checking",
    // Unknown readiness remains selectable, but an explicit owner rejection is authoritative.
    selectable: !unavailable
  };
}

function packageHomeShortcuts(record: Record<string, unknown>): AgentPackageShortcutRef[] {
  const preferences = new Map(asRecordArray(record.home_shortcut_preferences).flatMap((preference) => {
    const shortcutId = firstStringField(preference, ["shortcut_id"]);
    return shortcutId ? [[shortcutId, preference] as const] : [];
  }));
  const shortcuts = asRecordArray(record.home_shortcuts);
  const projected = shortcuts.flatMap((shortcut, index): AgentPackageShortcutRef[] => {
    const shortcutId = firstStringField(shortcut, ["shortcut_id"]);
    if (!shortcutId) return [];
    const preference = preferences.get(shortcutId);
    const route = asRecord(shortcut.route);
    const routeKind = asString(route?.route_kind);
    const executor = asString(route?.executor);
    const codexVisibleEntry = asString(route?.codex_visible_entry);
    preferences.delete(shortcutId);
    return [{
      shortcutId,
      labelI18n: asLocalizedText(shortcut.label_i18n),
      defaultVisible: asOptionalBoolean(shortcut.default_visible),
      userConfigurable: asOptionalBoolean(shortcut.user_configurable),
      visible: asOptionalBoolean(preference?.visible) ?? asOptionalBoolean(shortcut.default_visible) ?? false,
      sortOrder: asFiniteNumber(preference?.sort_order) ?? asFiniteNumber(shortcut.sort_order) ?? index,
      ...(routeKind && executor && codexVisibleEntry
        ? { route: { routeKind, executor, codexVisibleEntry } }
        : {})
    }];
  });
  const preferenceOnly = Array.from(preferences.values()).flatMap((preference): AgentPackageShortcutRef[] => {
    const shortcutId = firstStringField(preference, ["shortcut_id"]);
    const visible = asOptionalBoolean(preference.visible);
    const sortOrder = asFiniteNumber(preference.sort_order);
    if (!shortcutId || visible === null || sortOrder === null) return [];
    return [{
      shortcutId,
      labelI18n: {},
      defaultVisible: null,
      userConfigurable: null,
      visible,
      sortOrder
    }];
  });
  return [...projected, ...preferenceOnly];
}

function packageManifestUrl(record: Record<string, unknown>): string | null {
  const value = firstStringField(record, ["manifest_url", "manifestUrl", "manifest_ref", "package_ref"]);
  if (!value || /^file:/i.test(value) || value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
    return null;
  }
  return value;
}

function packageSourceRefValue(record: Record<string, unknown>): string | null {
  const installedCarrier = asRecord(record.installed_carrier_readback);
  const configuredCarrier = asRecord(record.configured_carrier);
  const carrier = asRecord(configuredCarrier?.carrier);
  return asString(installedCarrier?.identity)
    ?? asString(configuredCarrier?.publication_ref)
    ?? asString(carrier?.plugin_id);
}

function packageRequiredSkill(record: Record<string, unknown>): string {
  const capabilityMetadata = asRecord(record.capability_metadata);
  return firstStringField(record, ["required_skill", "requiredSkill", "skill_id", "skill_ref"])
    ?? asStringArray(record.required_skills)[0]
    ?? asStringArray(capabilityMetadata?.required_skill_ids)[0]
    ?? "not_reported";
}

function packageCodexSurface(record: Record<string, unknown>): string {
  const capabilityExposure = asRecord(record.capability_exposure);
  const configuredCarrier = asRecord(record.configured_carrier);
  const executor = asRecord(configuredCarrier?.executor);
  const installedReadiness = asRecord(record.installed_readiness);
  return firstStringField(record, ["codex_surface_state", "codex_visible_entry", "shortcut_id", "codex_surface_ref"])
    ?? asString(asRecord(record.codex_surface)?.status)
    ?? asString(capabilityExposure?.status)
    ?? asString(executor?.status)
    ?? asString(installedReadiness?.callability)
    ?? "missing_codex_surface";
}

function packagePhysicalSurface(record: Record<string, unknown>): { status: string; ref?: string } {
  const installedReadiness = asRecord(record.installed_readiness);
  const presence = asRecord(record.presence);
  return {
    status: firstStringField(record, ["physical_surface_status"])
      ?? asString(installedReadiness?.physical_status)
      ?? asString(presence?.status)
      ?? "not_reported"
  };
}

function packageSourceExplanation(
  record: Record<string, unknown>,
  source: PackageLifecycleStatusAxis["source"]
): string {
  if (source === "legacy_modules_fallback") {
    return "legacy modules.items preview fallback; fallback rows are preview-only and all package actions stay unavailable.";
  }
  if (source === "missing_bridge") {
    return "missing App/root package bridge; no package lifecycle truth or executable action is inferred.";
  }
  const sourceKind = packageSourceKind(record).toLowerCase();
  const manifestUrl = packageManifestUrl(record);
  const sourceRefValue = packageSourceRefValue(record)?.toLowerCase() ?? "";
  if (/ghcr|oci|container|image/.test(`${sourceKind} ${sourceRefValue}`)) {
    return "ghcr_source: canonical App/root package projection points at an OCI/GHCR package source.";
  }
  if (manifestUrl) {
    return "manifest_url_source: canonical App/root package projection supplies a manifest URL/ref for install or update preview.";
  }
  if (/git|checkout|local|developer/.test(`${sourceKind} ${sourceRefValue}`)) {
    return "git_local_developer_source: canonical App/root package projection points at a git/local developer source.";
  }
  if (/managed|root|registry/.test(`${sourceKind} ${sourceRefValue}`)) {
    return "managed_source: canonical App/root managed package projection.";
  }
  return "canonical App/root agent_packages projection; Workbench renders refs and action availability only.";
}

function packageSearchMetadata(
  record: Record<string, unknown>,
  source: PackageLifecycleStatusAxis["source"]
): PackageLifecycleSearchMetadata {
  const sourceKind = packageSourceKind(record);
  const manifestUrl = packageManifestUrl(record);
  const sourceRefValue = packageSourceRefValue(record);
  const requiredSkill = packageRequiredSkill(record);
  const codexSurface = packageCodexSurface(record);
  const physicalSurface = packagePhysicalSurface(record);
  const access = packageAccess(record);
  const provenance = readCatalogProvenance(record);
  const query = uniqueStrings([
    packageIdentity(record, 0),
    packageLabel(record),
    provenance.catalogOrigin,
    provenance.catalogSource.manager,
    provenance.catalogSource.marketplaceId,
    access.visibility,
    access.status,
    access.providerId,
    access.sourceRef,
    source,
    sourceKind,
    manifestUrl,
    sourceRefValue,
    requiredSkill,
    codexSurface,
    physicalSurface.status,
    packageRecommendedAction(record),
    packageConditionText(record)
  ]).join(" ").toLowerCase();
  const tagText = `${sourceKind} ${sourceRefValue ?? ""} ${manifestUrl ?? ""}`.toLowerCase();
  const tags = uniqueStrings([
    source,
    sourceKind,
    `visibility:${access.visibility}`,
    `access:${access.status}`,
    /managed|root|registry/.test(tagText) ? "managed_source" : null,
    /ghcr|oci|container|image/.test(tagText) ? "ghcr_source" : null,
    manifestUrl ? "manifest_url_source" : null,
    /git|checkout|local|developer/.test(tagText) ? "git_local_developer_source" : null,
    codexSurface === "missing_codex_surface" || /missing/.test(codexSurface) ? "missing_codex_surface" : null,
    requiredSkill !== "not_reported" ? `required_skill:${requiredSkill}` : "required_skill:not_reported",
    physicalSurface.status
  ]);
  const filters = [
    packageDisplayRef("Source", source, "Projection source used for package lifecycle rendering."),
    packageDisplayRef("Source kind", sourceKind, "Search/filter source kind from App/root projection."),
    packageDisplayRef("Codex surface", codexSurface, "Codex/App exposure surface state from refs."),
    packageDisplayRef("Required skill", requiredSkill, "Required skill ref if App/root reports one."),
    packageDisplayRef("Physical surface", physicalSurface.status, "Physical surface status from App/root detail fields.")
  ].filter((item): item is PackageLifecycleDisplayRef => Boolean(item));
  return { query, tags, filters };
}

function packageLifecycleDetails(
  record: Record<string, unknown>,
  source: PackageLifecycleStatusAxis["source"]
): PackageLifecycleDetailRef[] {
  const physicalSurface = packagePhysicalSurface(record);
  const detail = (label: string, value: string | null, summary: string, ref?: string): PackageLifecycleDetailRef => ({
    label,
    value: value ?? "not_reported",
    source,
    ref,
    summary
  });
  return [
    detail("Status", firstStringField(record, ["lifecycle_status", "status", "install_state", "health_status"]), "Lifecycle status supplied by App/root projection."),
    detail("Conditions", packageConditionText(record), "Failure/blocking/diagnostic conditions from App/root projection."),
    detail("Recommended action", packageRecommendedAction(record), "Recommended action text or action id from App/root projection."),
    detail("Physical surface", physicalSurface.status, "Physical surface status is a detail ref, not package truth.", physicalSurface.ref),
    detail("Required skill", packageRequiredSkill(record), "Required skill surfaced for search/filter only."),
    detail("Codex surface", packageCodexSurface(record), "Codex/App exposure surface state from refs."),
    detail("Manifest URL", packageManifestUrl(record), "Manifest URL/ref is input metadata, not installed-ready proof."),
    detail("Source kind", packageSourceKind(record), "managed_source / ghcr_source / manifest_url_source / git_local_developer_source classification.")
  ];
}

function packageActionKind(value: string): PackageLifecycleActionKind {
  const semantic = value.trim().toLowerCase();
  if (semantic === "install" || semantic === "update" || semantic === "repair" || semantic === "uninstall") return semantic;
  if (semantic === "preferences") return "preferences";
  return "other";
}

function packageActionLabel(kind: PackageLifecycleActionKind, fallback: string): string {
  if (kind === "install") return "Install";
  if (kind === "update") return "Update";
  if (kind === "repair") return "Repair";
  if (kind === "uninstall") return "Uninstall";
  if (kind === "preferences") return "Preferences";
  return fallback;
}

function packageLifecycleActions(
  record: Record<string, unknown>,
  actionMap: Map<string, WorkbenchActionRef>,
  source: PackageLifecycleStatusAxis["source"]
): PackageLifecycleActionRef[] {
  if (source !== "canonical_agent_packages") return [];
  return asRecordArray(record.available_actions).flatMap((projectedAction) => {
    const actionId = asString(projectedAction.action_id);
    const actionRef = asString(projectedAction.action_ref);
    if (!actionId || !actionRef) return [];
    const semantic = asString(projectedAction.semantic) ?? actionId;
    const kind = packageActionKind(semantic);
    const action = actionMap.get(actionId);
    const payload = asRecord(projectedAction.payload) ?? {};
    const requiredPayloadFields = asStringArray(projectedAction.required_payload_fields);
    const confirmationRequired = typeof projectedAction.confirmation_required === "boolean"
      ? projectedAction.confirmation_required
      : action?.confirmationRequired ?? false;
    const projectionUnavailable = projectedAction.status === "unavailable" || projectedAction.available === false;
    const status = action && !projectionUnavailable ? "available" : "unavailable";
    return [{
      kind,
      semantic,
      ...(asString(projectedAction.surface) ? { surface: asString(projectedAction.surface) as string } : {}),
      label: packageActionLabel(kind, action?.label ?? actionId),
      status,
      actionId,
      actionRef,
      route: action?.route,
      payload,
      requiredPayloadFields,
      confirmationRequired,
      dryRunSupported: action?.dryRunSupported ?? false,
      owner: action?.owner,
      delegatedSurface: action?.delegatedSurface,
      sourceRef: action?.route ?? actionRef,
      reason: projectionUnavailable
        ? asString(projectedAction.reason) ?? "The Package owner has not authorized this action."
        : action
        ? "Available through this package row's App-projected action contract."
        : "The package row exposes this action, but the matching App action definition is unavailable."
    } satisfies PackageLifecycleActionRef];
  });
}

function packageLifecycleItem(
  record: Record<string, unknown>,
  actionMap: Map<string, WorkbenchActionRef>,
  source: PackageLifecycleStatusAxis["source"]
): AgentPackageLifecycleRef {
  const packageId = packageIdentity(record, 0);
  const publisher = firstStringField(record, ["publisher"]) ?? "unknown";
  const packageRole = firstStringField(record, ["package_role"]) ?? "unknown";
  const provenance = readCatalogProvenance(record);
  const official = provenance.catalogOrigin === "opl";
  const roleGroup: AgentPackageLifecycleRef["roleGroup"] = packageRole === "standard_agent"
    ? (official ? "agent" : "other")
    : packageRole === "workflow_profile"
      ? "workflow"
      : official
        ? "supporting"
        : "other";
  const installed = asOptionalBoolean(record.installed ?? asRecord(record.installed_readiness)?.installed);
  const readiness = packageReadiness(record, installed);
  const capabilityMetadata = packageCapabilityMetadata(record);
  const dependencies = packageDependencies(record);
  const requiredByPackageIds = asStringArray(record.required_by_package_ids ?? record.requiredByPackageIds);
  const packageCurrentness = asRecord(record.package_currentness);
  const sourceRef = source === "canonical_agent_packages"
    ? "opl app state --profile fast --json#app_state.agent_packages.directory + app_state.agent_packages.status_index"
    : source === "legacy_modules_fallback"
      ? "opl app state --profile fast --json#app_state.modules.items[]"
      : "missing_bridge";
  const refs = [
    packageDisplayRef("Manifest", packageManifestUrl(record), "Package manifest or source ref from App/root projection."),
    packageDisplayRef("Source", packageSourceRefValue(record), "Managed, GHCR, git, local developer, or registry source ref from App/root projection."),
    packageDisplayRef("Exposure", firstStringField(record, ["home_shortcut_ref", "shortcut_id", "codex_visible_entry", "display_policy"]), "Codex/App exposure ref supplied by App/root."),
    packageDisplayRef("Shortcut preferences", packageFileRef(record, "home_shortcut_preferences_file"), "Physical exposure preferences file surfaced as a ref only.")
  ].filter((item): item is PackageLifecycleDisplayRef => Boolean(item));
  const homeShortcuts = packageHomeShortcuts(record);
  const installedVersion = installed === true
    ? firstStringField(record, ["installed_version"]) ?? asString(asRecord(record.installed_carrier_readback)?.version)
    : null;
  const availableVersion = firstStringField(record, ["selected_version", "stable_version"]);
  const version = installedVersion ?? availableVersion;
  return {
    id: `package-lifecycle-${packageId}`,
    packageId,
    label: packageLabel(record),
    description: firstStringField(record, ["description"]) ?? "",
    publisher,
    ...provenance,
    packageRole,
    softwareType: ["application", "agent", "capability"].includes(String(record.software_type)) ? record.software_type as "application" | "agent" | "capability" : "unknown",
    catalogScope: record.catalog_scope === "software" || record.catalog_scope === "host_component" ? record.catalog_scope : "unknown",
    ...(["release", "source", "unknown"].includes(String(record.distribution_channel)) ? { distributionChannel: record.distribution_channel as "release" | "source" | "unknown" } : {}),
    ...(record.release_channel === "preview" || record.release_channel === "stable"
      ? { releaseChannel: record.release_channel } : {}),
    localInstallations: asRecordArray(record.local_installations).flatMap(installation => {
      const id = asString(installation.installation_id), version = asString(installation.version);
      const locationRef = asString(installation.location_ref), evidenceRef = asString(installation.evidence_ref);
      if (!id || !version || !locationRef || !evidenceRef || installation.entrypoint_verified !== true
        || !["owner_managed", "uv_tool"].includes(String(installation.kind))
        || !["installed", "development"].includes(String(installation.mode))
        || !["package_owner", "uv"].includes(String(installation.manager)) || installation.management_scope !== "owner_only") return [];
      return [{ installationId: id, version, kind: installation.kind as "owner_managed" | "uv_tool",
        mode: installation.mode as "installed" | "development", manager: installation.manager as "package_owner" | "uv",
        managementScope: "owner_only" as const, locationRef, evidenceRef,
        sourceRevision: asString(installation.source_revision) ?? undefined }];
    }),
    roleGroup,
    official,
    displayNameI18n: asLocalizedText(record.display_name_i18n),
    descriptionI18n: asLocalizedText(record.description_i18n),
    sessionRoutingSummaryI18n: asLocalizedText(record.session_routing_summary_i18n),
    ...capabilityMetadata,
    dependencies,
    ...(requiredByPackageIds.length ? { requiredByPackageIds } : {}),
    installed,
    activated: asOptionalBoolean(record.activated),
    appEnabled: record.app_enabled !== false,
    readiness,
    ...(installedVersion ? { installedVersion } : {}),
    ...(availableVersion ? { availableVersion } : {}),
    ...(version ? { version, versionKind: installedVersion ? "installed" as const : "available" as const } : {}),
    currentness: asString(packageCurrentness?.status) ?? "unknown",
    sourceMode: packageSourceMode(record),
    access: packageAccess(record),
    installable: asOptionalBoolean(asRecord(record.installability)?.installable),
    installabilityReason: asString(asRecord(record.installability)?.reason) ?? undefined,
    automaticUpdate: packageAutomaticUpdate(record),
    homeShortcuts,
    ...(firstStringField(record, ["recommended_action", "recommendedAction"])
      ? { recommendedActionId: firstStringField(record, ["recommended_action", "recommendedAction"]) as string }
      : {}),
    status: source === "legacy_modules_fallback"
      ? "preview_legacy_modules_fallback"
      : readiness.status !== "unknown"
        ? readiness.status
        : firstStringField(record, ["lifecycle_status", "status", "install_state", "health_status"])
          ?? "app_state_projection",
    summary: source === "canonical_agent_packages"
      ? "Canonical package lifecycle projection from App/root; Workbench only renders refs and action availability."
      : source === "legacy_modules_fallback"
        ? "Legacy modules.items fallback while canonical agent_packages projection is missing; no package installed/ready/synced claim is inferred."
        : "Package lifecycle bridge missing.",
    sourceRef,
    sourceExplanation: packageSourceExplanation(record, source),
    searchMetadata: packageSearchMetadata(record, source),
    refs,
    details: packageLifecycleDetails(record, source),
    statusAxes: packageStatusAxes(record, source),
    actions: packageLifecycleActions(record, actionMap, source),
    authorityBoundary: "One Person Lab consumes App/root package lifecycle refs and actions only; no executor, package truth, readiness, or release authority is created here."
  };
}

export function agentPackageSelectionIntent(agent: AgentPackageLifecycleRef): AgentPackageSelectionIntent {
  const shortcut = agent.homeShortcuts.find((candidate) => candidate.route);
  return {
    kind: "agent_package_selection",
    selectionId: `agent-package:${agent.packageId}`,
    packageId: agent.packageId,
    label: agent.label,
    description: agent.description,
    publisher: agent.publisher,
    displayNameI18n: { ...agent.displayNameI18n },
    descriptionI18n: { ...agent.descriptionI18n },
    sessionRoutingSummaryI18n: { ...agent.sessionRoutingSummaryI18n },
    requiredSkillIds: [...agent.requiredSkillIds],
    optionalSkillRefs: [...agent.optionalSkillRefs],
    readiness: { ...agent.readiness },
    ...(shortcut?.route ? { route: { shortcutId: shortcut.shortcutId, ...shortcut.route } } : {}),
    actions: agent.actions.map((action) => ({
      ...action,
      payload: { ...action.payload },
      requiredPayloadFields: [...action.requiredPayloadFields]
    })),
    ...(agent.recommendedActionId ? { recommendedActionId: agent.recommendedActionId } : {}),
    sourceRef: agent.sourceRef
  };
}

function legacyPackageRowsFromModules(moduleItems: Record<string, unknown>[]): Record<string, unknown>[] {
  return moduleItems.map((item) => ({
    ...item,
    package_id: firstStringField(item, ["module_id", "id"]),
    display_name: firstStringField(item, ["label", "module_id"]),
    install_state: "legacy_modules_fallback",
    update_state: firstStringField(item, ["recommended_action"]) ?? asString(asRecord(item.git)?.sync_status) ?? "unknown",
    source_state: asString(asRecord(item.source_policy)?.effective_install_update_source) ?? "legacy_modules_fallback",
    trust_state: firstStringField(item, ["health_status"]) ?? "unknown",
    codex_surface_state: "missing_agent_packages_projection"
  }));
}

export {
  canonicalSummaryRow,
  packageRowsFromCanonicalProjection,
  packageLifecycleItem,
  legacyPackageRowsFromModules
};
