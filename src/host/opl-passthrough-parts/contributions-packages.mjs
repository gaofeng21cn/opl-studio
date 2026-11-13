function selectedFields(value, fields) {
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(fields.flatMap((field) => value[field] === undefined ? [] : [[field, value[field]]]));
}

function compactLocalizedText(value, limit = 16) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Object.fromEntries(Object.entries(value)
    .filter(([, text]) => typeof text === "string")
    .slice(0, limit));
}

function compactStringArray(value, limit = 32) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string").slice(0, limit) : [];
}

function compactCatalogProvenance(value) {
  const source = value?.catalog_source;
  return {
    ...Object.fromEntries(["catalog_origin", "origin_basis"].flatMap(key => typeof value?.[key] === "string" ? [[key, value[key]]] : [])),
    ...(source && typeof source === "object" && !Array.isArray(source)
      ? { catalog_source: Object.fromEntries(["manager", "marketplace_id", "delivery"].flatMap(key => typeof source[key] === "string" ? [[key, source[key]]] : [])) }
      : {})
  };
}

const managedUpdateFlowDependencyFields = [
  "dependency_id", "dependency_kind", "activation", "offline_bundle", "online_install_default",
  "source", "source_path", "owner", "bundle_id", "version_requirement", "install_source",
  "relationship", "lifecycle_owner", "update_mode", "installed", "observed_status",
  "status", "currentness", "version", "latest_version", "ownership"
];

function compactManagedUpdateFlowDependency(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return selectedFields(value, managedUpdateFlowDependencyFields);
}

// Keep the Framework-owned update projection while excluding its execution envelope.
function compactManagedUpdateProjection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const components = Array.isArray(value.components)
    ? value.components.slice(0, 16).flatMap((component) => {
      if (!component || typeof component !== "object" || Array.isArray(component)) return [];
      const current = component.current && typeof component.current === "object" && !Array.isArray(component.current)
        ? component.current
        : {};
      const dependencyCatalog = current.dependency_catalog
        && typeof current.dependency_catalog === "object"
        && !Array.isArray(current.dependency_catalog)
        ? current.dependency_catalog
        : undefined;
      const flowDependencies = Array.isArray(dependencyCatalog?.flow_dependencies)
        ? dependencyCatalog.flow_dependencies.slice(0, 256).flatMap((dependency) => {
          const compact = compactManagedUpdateFlowDependency(dependency);
          return compact ? [compact] : [];
        })
        : undefined;
      const dependencies = Array.isArray(dependencyCatalog?.dependencies) ? dependencyCatalog.dependencies.slice(0, 256).map(dependency => selectedFields(dependency, [
        "dependency_id", "dependency_kind", "installed", "version", "latest_version", "currentness", "status", "ownership", "update_policy", "update_mode", "activation_policy", "binary_path", "note"
      ])).filter(Boolean) : undefined;
      return [{
        ...selectedFields(component, ["component_id", "lifecycle_owner", "label", "state", "channel"]),
        current: {
          ...selectedFields(current, ["installed_version", "latest_version", "currentness", "manual_guidance"]),
          ...(flowDependencies || dependencies ? { dependency_catalog: { ...(flowDependencies ? { flow_dependencies: flowDependencies } : {}), ...(dependencies ? { dependencies } : {}) } } : {})
        },
        auto_apply: selectedFields(component.auto_apply, ["mode", "eligible", "app_background_safe"]),
        plan: selectedFields(component.plan, ["summary"])
      }];
    })
    : [];
  return {
    ...selectedFields(value, ["operation", "update_channel"]),
    components
  };
}

const packageFields = [
  "package_id", "packageId", "agent_id", "module_id", "id",
  "management_scope", "deployment_target", "icon_ref", "icon_url", "carrier_source_commit",
  "display_name", "displayName", "package_short_name", "label", "name", "publisher", "description", "tags", "package_role", "software_type", "catalog_scope", "distribution_channel", "release_channel",
  "lifecycle_status", "status", "install_state", "install_status", "health_status",
  "update_state", "update_status", "source_state", "trust_state", "trust_tier",
  "codex_surface_state", "codex_visible_entry", "codex_surface_ref", "shortcut_id", "display_policy",
  "conditions", "failure_conditions", "blocked_conditions", "issues", "diagnostics",
  "status_reason", "failure_reason", "reason", "recommended_action", "recommendedAction", "next_action", "repair_action",
  "source_kind", "install_origin",
  "required_skill", "requiredSkill", "skill_id", "skill_ref", "required_skills",
  "source_surface", "installed_version", "selected_version", "stable_version", "projected_version",
  "active_installation_id", "active_installation_status", "installation_management_reason", "installed", "activated", "app_enabled", "codex_visible", "official", "manifest_url", "physical_surface_status"
];

function compactHomeShortcut(value) {
  if (!value || typeof value !== "object") return {};
  return {
    ...selectedFields(value, ["shortcut_id", "default_visible", "user_configurable", "sort_order"]),
    label_i18n: compactLocalizedText(value.label_i18n),
    route: selectedFields(value.route, ["route_kind", "executor", "codex_visible_entry"])
  };
}

function compactHomeShortcutPreferences(value, limit = 16) {
  return Array.isArray(value)
    ? value.slice(0, limit).map((entry) => selectedFields(entry, [
      "package_id", "shortcut_id", "visible", "sort_order"
    ]) ?? {})
    : [];
}

function compactContributionNavigation(value) {
  return {
    ...selectedFields(value, ["navigation_id", "view_id", "icon_id", "sort_order"]),
    label_i18n: compactLocalizedText(value?.label_i18n)
  };
}

function compactContributionView(value) {
  return {
    ...selectedFields(value, ["view_id", "view_type", "data_ref"]),
    title_i18n: compactLocalizedText(value?.title_i18n),
    command_ids: compactStringArray(value?.command_ids),
    badge_ids: compactStringArray(value?.badge_ids),
    empty_state_i18n: compactLocalizedText(value?.empty_state_i18n)
  };
}

function compactContributionCommand(value) {
  return {
    ...selectedFields(value, ["command_id", "action_ref", "confirmation_required"]),
    label_i18n: compactLocalizedText(value?.label_i18n)
  };
}

function compactContributionBadge(value) {
  return {
    ...selectedFields(value, ["badge_id", "data_ref", "tone"]),
    label_i18n: compactLocalizedText(value?.label_i18n)
  };
}

function compactContributionPlacement(value) {
  return {
    ...selectedFields(value, [
      "contribution_id", "slot", "contribution_kind", "trust_tier", "scope", "sort_order", "view_id"
    ]),
    command_ids: compactStringArray(value?.command_ids)
  };
}

function compactAppContributions(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    ...selectedFields(value, ["schema_version"]),
    navigation: Array.isArray(value.navigation) ? value.navigation.slice(0, 32).map(compactContributionNavigation) : [],
    views: Array.isArray(value.views) ? value.views.slice(0, 32).map(compactContributionView) : [],
    commands: Array.isArray(value.commands) ? value.commands.slice(0, 64).map(compactContributionCommand) : [],
    badges: Array.isArray(value.badges) ? value.badges.slice(0, 64).map(compactContributionBadge) : [],
    ui: Array.isArray(value.ui) ? value.ui.slice(0, 64).map(compactContributionPlacement) : []
  };
}

function compactUiContributionEntry(value) {
  if (!value || typeof value !== "object") return {};
  return {
    ...selectedFields(value, [
      "contribution_key", "contribution_id", "package_id", "slot", "contribution_kind", "trust_tier", "scope",
      "sort_order", "descriptor_schema_version"
    ]),
    view: value.view && typeof value.view === "object" ? compactContributionView(value.view) : undefined,
    commands: Array.isArray(value.commands) ? value.commands.slice(0, 64).map(compactContributionCommand) : [],
    badges: Array.isArray(value.badges) ? value.badges.slice(0, 64).map(compactContributionBadge) : []
  };
}

function compactUiContributions(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    ...selectedFields(value, ["surface_kind", "contribution_count", "source_ref"]),
    entries: Array.isArray(value.entries) ? value.entries.slice(0, 64).map(compactUiContributionEntry) : []
  };
}

function compactPackageActionPayload(value) {
  return selectedFields(value, [
    "package_id", "manifest_url", "registry_url", "trust_tier", "source_kind",
    "exposure_action", "shortcut_id", "visible", "sort_order", "enabled", "installation_id", "expected_revision", "operation", "version"
  ]);
}

function compactSoftwareInstallation(value) {
  return {
    ...selectedFields(value, ["installation_id", "kind", "version", "display_version", "mode", "manager", "location", "location_ref", "evidence_ref", "entrypoint_verified", "active", "revision", "available_version", "owner_settings_route"]),
    available_actions: Array.isArray(value?.available_actions) ? value.available_actions.slice(0, 16).map(compactSoftwareSourceAction).filter(Boolean) : []
  };
}

function compactPackageRecord(value) {
  const record = selectedFields(value, packageFields) ?? {};
  if (typeof value?.miniapp_entry?.resource_uri === "string" && /^ui:\/\/[^#]+$/.test(value.miniapp_entry.resource_uri)) {
    record.miniapp_entry = { resource_uri: value.miniapp_entry.resource_uri,
      arguments: Object.fromEntries(Object.entries(selectedFields(value.miniapp_entry.arguments, ["package_id", "view_id"]) ?? {}).filter(([, value]) => typeof value === "string")) };
  }
  const sourcePolicy = selectedFields(value?.source_policy, [
    "effective_install_update_source", "desired_source_kind", "package_channel_auto_update"
  ]);
  const sourceExplanationBase = selectedFields(value?.source_explanation, [
    "kind", "source", "summary", "source_policy_status"
  ]);
  const effectiveSourcePolicy = selectedFields(value?.source_explanation?.effective_source_policy, [
    "effective_install_update_source", "desired_source_kind", "package_channel_auto_update"
  ]);
  const sourceExplanation = sourceExplanationBase ? {
    ...sourceExplanationBase,
    ...(effectiveSourcePolicy ? { effective_source_policy: effectiveSourcePolicy } : {})
  } : undefined;
  const capabilityMetadata = selectedFields(value?.capability_metadata, [
    "source", "required_skill_ids", "optional_skill_refs"
  ]);
  const installedCarrierReadback = selectedFields(value?.installed_carrier_readback, [
    "kind", "identity", "version", "enabled", "lifecycle_authority"
  ]);
  const installedReadiness = selectedFields(value?.installed_readiness, [
    "installed", "physical_status", "callability"
  ]);
  const dependencyReadiness = selectedFields(value?.dependency_readiness, [
    "status", "required_count", "present_count", "callable_count"
  ]);
  const dependencyChecks = Array.isArray(value?.dependency_readiness?.checks)
    ? value.dependency_readiness.checks.map((check) => selectedFields(check, [
      "package_id", "required", "present", "callable", "status", "reasons"
    ])).filter(Boolean)
    : undefined;
  const presence = selectedFields(value?.presence, [
    "registered", "installed", "present", "callable", "status", "reason"
  ]);
  const capabilityExposure = selectedFields(value?.capability_exposure, ["status", "codex_visible"]);
  const actions = selectedFields(value?.actions, ["available", "recommended", "execute_surface"]);
  const readiness = selectedFields(value?.readiness, [
    "status", "operational_ready", "launch_allowed", "verification_deferred", "reason", "detail_surface", "status_read_error"
  ]);
  const packageCurrentness = selectedFields(value?.package_currentness, ["status", "reasons"]);
  const packageAccess = selectedFields(value?.package_access, [
    "visibility", "status", "provider_id", "source_id", "source_ref", "access_policy_ref", "verified_at",
    "security_revision", "reason", "discover_allowed", "download_allowed"
  ]);
  const installability = selectedFields(value?.installability, ["installable", "reason"]);
  const availableActions = Array.isArray(value?.available_actions)
    ? value.available_actions.map((action) => {
      const payload = compactPackageActionPayload(action?.payload);
      return {
        ...(selectedFields(action, [
        "action_id", "action_ref", "required_payload_fields", "confirmation_required", "semantic", "surface", "status", "reason"
        ]) ?? {}),
        ...(payload && Object.keys(payload).length ? { payload } : {})
      };
    })
    : undefined;
  const files = selectedFields(value?.files, ["home_shortcut_preferences_file"]);
  return {
    ...record,
    ...compactCatalogProvenance(value),
    display_name_i18n: compactLocalizedText(value?.display_name_i18n),
    description_i18n: compactLocalizedText(value?.description_i18n),
    session_routing_summary_i18n: compactLocalizedText(value?.session_routing_summary_i18n),
    home_shortcuts: Array.isArray(value?.home_shortcuts) ? value.home_shortcuts.slice(0, 16).map(compactHomeShortcut) : [],
    app_contributions: compactAppContributions(value?.app_contributions),
    ...(sourcePolicy ? { source_policy: sourcePolicy } : {}),
    ...(sourceExplanation ? { source_explanation: sourceExplanation } : {}),
    ...(capabilityMetadata ? { capability_metadata: capabilityMetadata } : {}),
    ...(installedCarrierReadback ? { installed_carrier_readback: installedCarrierReadback } : {}),
    ...(installedReadiness ? { installed_readiness: installedReadiness } : {}),
    ...(dependencyReadiness
      ? { dependency_readiness: { ...dependencyReadiness, ...(dependencyChecks ? { checks: dependencyChecks } : {}) } }
      : {}),
    ...(presence ? { presence } : {}),
    ...(capabilityExposure ? { capability_exposure: capabilityExposure } : {}),
    ...(actions ? { actions } : {}),
    ...(readiness ? { readiness } : {}),
    ...(packageCurrentness ? { package_currentness: packageCurrentness } : {}),
    ...(packageAccess ? { package_access: packageAccess } : {}),
    ...(installability ? { installability } : {}),
    ...(Array.isArray(value?.installations) ? { installations: value.installations.slice(0, 32).map(compactSoftwareInstallation) } : {}),
    ...(Array.isArray(value?.installation_actions) ? { installation_actions: value.installation_actions.slice(0, 16).map(compactSoftwareSourceAction).filter(Boolean) } : {}),
    ...(Array.isArray(value?.local_installations) ? { local_installations: value.local_installations.slice(0, 32).map(installation => selectedFields(installation, ["installation_id", "kind", "version", "mode", "manager", "management_scope", "location_ref", "evidence_ref", "entrypoint_verified", "source_revision"])) } : {}),
    ...(Array.isArray(value?.required_by_package_ids) ? { required_by_package_ids: compactStringArray(value.required_by_package_ids) } : {}),
    ...(availableActions ? { available_actions: availableActions } : {}),
    ...(files ? { files } : {}),
  };
}

function compactPackageRows(value, limit = 64) {
  if (Array.isArray(value)) return value.slice(0, limit).map(compactPackageRecord);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, limit).map(([key, row]) => [key, compactPackageRecord(row)]));
  }
  return value;
}

function compactSoftwareSourceAction(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const defaultPayload = selectedFields(value.default_payload, ["source_id", "provider_id", "credential_handle", "enabled", "item_id", "expected_revision", "package_id", "installation_id", "operation", "version"]);
  const payload = selectedFields(value.payload, ["source_id", "provider_id", "credential_handle", "enabled", "item_id", "expected_revision", "package_id", "installation_id", "operation", "version"]);
  return {
    ...selectedFields(value, [
      "action_id", "label", "semantic", "delegated_surface", "payload_fields", "required_payload_fields", "mutates", "dry_run_supported",
      "confirmation_required", "danger_level", "impact", "follow_up_action_ids", "verify_action_id", "status", "reason"
    ]),
    ...(defaultPayload && Object.keys(defaultPayload).length ? { default_payload: defaultPayload } : {}),
    ...(payload && Object.keys(payload).length ? { payload } : {})
  };
}

function compactNativeSoftwareItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
  return {
    ...compactCatalogProvenance(item),
    ...selectedFields(item, ["item_id", "product_id", "product_display_name", "name", "display_name", "description", "kind", "homebrew_installed", "homebrew_installed_version", "installation_owner", "installation_kind", "installation_evidence", "owner_settings_route", "installed", "installed_version", "installed_display_version", "installed_build_kind", "installed_build_id", "installed_source_revision", "available_version", "available_display_version", "pending_version", "update_status", "revision", "installation_id", "location", "mode", "active", "active_installation_id", "active_installation_status", "release_channel", "installation_variant", "recommended_for_product", "selected_for_product", "selection_basis"]),
    ...(Array.isArray(item.installations) ? { installations: item.installations.slice(0, 32).map(compactSoftwareInstallation) } : {}),
    display_name_i18n: compactLocalizedText(item.display_name_i18n),
    description_i18n: compactLocalizedText(item.description_i18n),
    available_actions: Array.isArray(item.available_actions) ? item.available_actions.slice(0, 8).map(compactSoftwareSourceAction).filter(Boolean) : []
  };
}

function compactSoftwareSources(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Array.isArray(value.entries) ? value.entries.slice(0, 32).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const compact = selectedFields(entry, [
      "source_id", "display_name", "source_kind", "source_ref", "visibility", "provider_id", "status",
      "enabled", "credential_handle_present", "access_refresh_required", "catalog_refresh_required", "verified_at", "entry_count",
      "inventory_status", "inventory_refresh_required", "inventory_reason", "inventory_checked_at", "version_authority", "version_basis", "installation_owner"
    ]) ?? {};
    Object.assign(compact, compactCatalogProvenance(entry));
    compact.available_actions = Array.isArray(entry.available_actions)
      ? entry.available_actions.slice(0, 8).map(compactSoftwareSourceAction).filter(Boolean)
      : [];
    if (entry.source_kind === "tap") {
      compact.native_items = Array.isArray(entry.native_items) ? entry.native_items.slice(0, 256).map(compactNativeSoftwareItem).filter(Boolean) : [];
    }
    return [compact];
  }) : [];
  return {
    ...selectedFields(value, ["surface_kind", "status"]),
    installed_products: Array.isArray(value.installed_products) ? value.installed_products.slice(0, 256).map(compactNativeSoftwareItem).filter(Boolean) : [],
    entries,
    authority_boundary: selectedFields(value.authority_boundary, ["owner", "credential_values_exposed", "installation_mutation_owner"]) ?? {}
  };
}

function compactAction(value) {
  return selectedFields(value, [
    "action_id", "label", "route", "payload_fields", "mutates", "dry_run_supported", "owner",
    "delegated_surface", "can_submit_to_safe_action_shell", "route_requires_domain_or_app_payload",
    "confirmation_required", "danger_level"
  ]) ?? {};
}

export {
  compactAction,
  compactAppContributions,
  compactHomeShortcutPreferences,
  compactManagedUpdateProjection,
  compactPackageRows,
  compactSoftwareSources,
  compactUiContributions,
  compactLocalizedText,
  compactStringArray,
  selectedFields
};
