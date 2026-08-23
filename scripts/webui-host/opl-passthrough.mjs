import { spawn } from "node:child_process";

function boundedTimeout(value, fallback) {
  const normalized = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(normalized) || normalized < 100 || normalized > 120_000) {
    throw new Error("readStateTimeoutMs must be an integer from 100 through 120000");
  }
  return normalized;
}

function run(command, args, { cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      resolve({ exitCode: -1, stdout, stderr: `${stderr}${error.message}`, timedOut: false });
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve({ exitCode: timedOut ? -1 : (code ?? -1), stdout, stderr, timedOut });
    });
  });
}

function commandReadback(args, result) {
  return {
    command: args.join(" "),
    commandArgs: args.slice(1),
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut
  };
}

function jsonValue(value) {
  if (!value.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function firstRecords(value, limit = 8) {
  if (Array.isArray(value)) return value.slice(0, limit);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, limit));
  return value;
}

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
      return [{
        ...selectedFields(component, ["component_id", "lifecycle_owner", "label", "state", "channel"]),
        current: {
          ...selectedFields(current, ["installed_version", "latest_version", "currentness", "manual_guidance"]),
          ...(flowDependencies ? { dependency_catalog: { flow_dependencies: flowDependencies } } : {})
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
  "display_name", "displayName", "package_short_name", "label", "name", "publisher", "description", "tags", "package_role",
  "lifecycle_status", "status", "install_state", "install_status", "health_status",
  "update_state", "update_status", "source_state", "trust_state", "trust_tier",
  "codex_surface_state", "codex_visible_entry", "codex_surface_ref", "shortcut_id", "display_policy",
  "conditions", "failure_conditions", "blocked_conditions", "issues", "diagnostics",
  "status_reason", "failure_reason", "reason", "recommended_action", "recommendedAction", "next_action", "repair_action",
  "source_kind", "install_origin",
  "required_skill", "requiredSkill", "skill_id", "skill_ref", "required_skills",
  "source_surface", "installed_version", "selected_version", "stable_version", "projected_version",
  "installed", "activated", "codex_visible", "official", "manifest_url", "physical_surface_status"
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
    "exposure_action", "shortcut_id", "visible", "sort_order"
  ]);
}

function compactPackageRecord(value) {
  const record = selectedFields(value, packageFields) ?? {};
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
  const presence = selectedFields(value?.presence, [
    "registered", "installed", "present", "callable", "status", "reason"
  ]);
  const capabilityExposure = selectedFields(value?.capability_exposure, ["status", "codex_visible"]);
  const actions = selectedFields(value?.actions, ["available", "recommended", "execute_surface"]);
  const readiness = selectedFields(value?.readiness, [
    "status", "operational_ready", "launch_allowed", "verification_deferred", "reason", "detail_surface", "status_read_error"
  ]);
  const packageCurrentness = selectedFields(value?.package_currentness, ["status", "reasons"]);
  const availableActions = Array.isArray(value?.available_actions)
    ? value.available_actions.map((action) => {
      const payload = compactPackageActionPayload(action?.payload);
      return {
        ...(selectedFields(action, [
        "action_id", "action_ref", "required_payload_fields", "confirmation_required", "semantic", "surface"
        ]) ?? {}),
        ...(payload && Object.keys(payload).length ? { payload } : {})
      };
    })
    : undefined;
  const files = selectedFields(value?.files, ["home_shortcut_preferences_file"]);
  return {
    ...record,
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
    ...(presence ? { presence } : {}),
    ...(capabilityExposure ? { capability_exposure: capabilityExposure } : {}),
    ...(actions ? { actions } : {}),
    ...(readiness ? { readiness } : {}),
    ...(packageCurrentness ? { package_currentness: packageCurrentness } : {}),
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

function compactAction(value) {
  return selectedFields(value, [
    "action_id", "label", "route", "payload_fields", "mutates", "dry_run_supported", "owner",
    "delegated_surface", "can_submit_to_safe_action_shell", "route_requires_domain_or_app_payload",
    "confirmation_required", "danger_level"
  ]) ?? {};
}

function compactGatewayAccount(value) {
  if (!value || typeof value !== "object") return undefined;
  const account = value.account && typeof value.account === "object" ? value.account : undefined;
  return {
    ...selectedFields(value, ["surface_kind", "connection_mode", "status", "account_card_visible"]),
    account: account ? {
      ...selectedFields(account, ["display_name", "email", "status"]),
      balance: selectedFields(account.balance, ["amount", "currency"])
    } : undefined,
    usage: selectedFields(value.usage, [
      "today_tokens", "total_tokens", "today_actual_cost", "total_actual_cost", "currency", "day_timezone"
    ]),
    managed_key: selectedFields(value.managed_key, ["name", "status", "ownership"]),
    installation: selectedFields(value.installation, ["device_label", "short_id"]),
    freshness: selectedFields(value.freshness, ["observed_at", "stale_after", "stale", "last_error_code"]),
    capabilities: selectedFields(value.capabilities, ["account_login_supported", "manual_key_supported"]),
    actions: selectedFields(value.actions, [
      "complete_setup", "refresh", "repair", "use_for_model_access", "disconnect"
    ])
  };
}

function compactProjectedAction(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    ...selectedFields(value, [
      "kind", "status", "action_id", "label", "state", "route", "dry_run_route", "dry_run_required",
      "payload_required", "payload_fields", "confirmation_required", "danger_level", "execution_owner"
    ]),
    host_action_abi: selectedFields(value.host_action_abi, [
      "capability_id", "endpoint_status", "endpoint_availability", "plan_action_id", "execute_action_id", "restore_action_id"
    ])
  };
}

function compactStorageProjection(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    ...selectedFields(value, [
      "status", "observed_at", "stale", "bytes", "reclaimable_bytes", "reason_code", "owner_route",
      "inventory_action_id"
    ]),
    projected_action: compactProjectedAction(value.projected_action)
  };
}

function compactCodexPersonalization(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    ...selectedFields(value, ["surface_kind"]),
    user_agents: selectedFields(value.user_agents, [
      "surface_kind", "status", "path", "exists", "content", "sha256", "size_bytes", "max_editable_bytes", "source"
    ]),
    opl_flow_default_user_agents: selectedFields(value.opl_flow_default_user_agents, [
      "surface_kind", "status", "content", "sha256", "source_path", "package_version", "source", "reason"
    ]),
    authority_boundary: selectedFields(value.authority_boundary, [
      "user_agents_owner", "app_edit_action", "app_restore_action", "opl_flow_role", "opl_app_session_context_owner"
    ])
  };
}

function compactSettingsReadModel(value) {
  if (!value || typeof value !== "object") return undefined;
  const connections = value.connections && typeof value.connections === "object" ? value.connections : undefined;
  const workspaceServices = value.workspace_services && typeof value.workspace_services === "object"
    ? value.workspace_services
    : undefined;
  const dockerWebui = value.docker_webui && typeof value.docker_webui === "object" ? value.docker_webui : undefined;
  const storageLifecycle = value.storage_lifecycle && typeof value.storage_lifecycle === "object"
    ? value.storage_lifecycle
    : undefined;
  return {
    ...selectedFields(value, ["surface_kind", "schema_version", "owner", "source_surface"]),
    opl_gateway_account: compactGatewayAccount(value.opl_gateway_account),
    codex_model_policy: selectedFields(value.codex_model_policy, [
      "model", "reasoning_effort", "model_provider", "provider_name", "provider_base_url", "config_path",
      "profile_source", "api_key_present", "opl_gateway_configured", "model_access_ready", "model_access_source", "access_status"
    ]),
    local_environment: selectedFields(value.local_environment, [
      "source_ref", "state_dir", "runtime_sources_root", "logs_dir", "release_channel", "temporal_provider",
      "app_update_action_id", "runtime_roots_cleanup_action_id", "runtime_substrate_rollback_action_id"
    ]),
    workspace_services: workspaceServices ? {
      workspace_root: selectedFields(workspaceServices.workspace_root, [
        "source_ref", "selected_path", "source", "exists", "writable", "health_status"
      ]),
      personalization_refs: selectedFields(workspaceServices.personalization_refs, [
        "source_refs", "user_agents_owner", "opl_app_context_owner", "framework_role"
      ])
    } : undefined,
    connections: connections ? {
      ...selectedFields(connections, ["surface_kind", "source_ref", "allowed_statuses", "default_connection_id"]),
      connections: Array.isArray(connections.connections)
        ? connections.connections.slice(0, 16).map((connection) => selectedFields(connection, [
            "connection_id", "name", "connection_type", "endpoint", "status", "status_code", "last_tested_at"
          ]) ?? {})
        : []
    } : undefined,
    docker_webui: dockerWebui ? {
      ...selectedFields(dockerWebui, ["surface_kind", "ordinary_status", "doctor_read_model_ref", "action_ids", "issue_ids"]),
      runtime_proxy: selectedFields(dockerWebui.runtime_proxy, ["status"]),
      failure_recovery: selectedFields(dockerWebui.failure_recovery, ["status"]),
      ordinary_next_actions: Array.isArray(dockerWebui.ordinary_next_actions)
        ? dockerWebui.ordinary_next_actions.slice(0, 16).map(compactProjectedAction)
        : []
    } : undefined,
    storage_lifecycle: storageLifecycle ? {
      ...selectedFields(storageLifecycle, ["surface_kind", "snapshot_updated_at"]),
      agent_package_store: compactStorageProjection(storageLifecycle.agent_package_store),
      webui_data_volume: compactStorageProjection(storageLifecycle.webui_data_volume)
    } : undefined
  };
}

function compactCore(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    codex: selectedFields(value.codex, [
      "installed", "version", "parsed_version", "minimum_version", "version_status", "latest_version",
      "latest_version_status", "update_available", "binary_path", "default_model", "default_reasoning_effort",
      "config_path", "api_key_present", "opl_gateway_configured", "model_access_ready", "model_access_status",
      "model_access_source", "provider_name", "provider_base_url"
    ])
  };
}

function compactProvider(value) {
  if (!value || typeof value !== "object") return undefined;
  const temporal = value.temporal && typeof value.temporal === "object" ? value.temporal : undefined;
  const details = temporal?.details && typeof temporal.details === "object" ? temporal.details : undefined;
  const workerReadiness = details?.worker_readiness && typeof details.worker_readiness === "object"
    ? details.worker_readiness
    : undefined;
  const serviceLifecycle = workerReadiness?.temporal_service_lifecycle && typeof workerReadiness.temporal_service_lifecycle === "object"
    ? workerReadiness.temporal_service_lifecycle
    : undefined;
  return {
    ...selectedFields(value, ["status"]),
    temporal: temporal ? {
      ...selectedFields(temporal, ["status", "health_status", "ready"]),
      management: selectedFields(temporal.management, ["owner_surface", "actions"]),
      details: details ? {
        ...selectedFields(details, ["address", "address_source", "namespace", "task_queue"]),
        worker_readiness: workerReadiness ? {
          ...selectedFields(workerReadiness, ["readiness_status", "service_ready", "worker_ready", "server_reachable", "blockers"]),
          temporal_service_lifecycle: serviceLifecycle ? {
            ...selectedFields(serviceLifecycle, ["service_status", "address_source", "server_reachable", "service_kind", "blockers"]),
            supervisor: selectedFields(serviceLifecycle.supervisor, [
              "status", "installed", "loaded", "ready", "observed_at", "error", "supported", "applicable",
              "required", "configuration_current", "process_state"
            ])
          } : undefined
        } : undefined,
        scheduler: selectedFields(details.scheduler, [
          "status", "ready", "observed_at", "schedule_status", "health_status", "degraded_reason", "inspection_error"
        ])
      } : undefined
    } : undefined
  };
}

function compactRuntimeSourceCarriers(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    ...selectedFields(value, ["surface_kind"]),
    summary: selectedFields(value.summary, [
      "default_carriers_count", "present_default_carriers_count", "healthy_default_carriers_count"
    ]),
    items: Array.isArray(value.items) ? value.items.map((item) => ({
      ...selectedFields(item, [
        "package_id", "carrier_id", "label", "scope", "description", "default_carrier", "source_present",
        "source_origin", "source_health_status"
      ]),
      git: selectedFields(item?.git, ["sync_status", "dirty"])
    })) : []
  };
}

function compactWorkItemStage(value) {
  if (!value || typeof value !== "object") return {};
  return {
    ...selectedFields(value, [
      "stage_id", "display_name", "state", "owner", "owner_display_name", "elapsed_seconds"
    ]),
    display_names: compactLocalizedText(value.display_names, 8),
    usage: selectedFields(value.usage, [
      "state", "input_tokens", "output_tokens", "total_tokens", "observed_at", "missing_reason"
    ]),
    next_action: selectedFields(value.next_action, ["title", "summary", "owner", "action_ref"])
  };
}

function compactWorkItem(value) {
  if (!value || typeof value !== "object") return {};
  const execution = value.execution && typeof value.execution === "object" ? value.execution : undefined;
  const telemetry = value.telemetry && typeof value.telemetry === "object" ? value.telemetry : undefined;
  return {
    ...selectedFields(value, ["item_id"]),
    identity: selectedFields(value.identity, [
      "agent_id", "agent_display_name", "domain_id", "project_id", "project_display_name",
      "work_item_id", "domain_work_item_id", "work_item_scope_id", "identity_state",
      "work_item_display_name", "work_item_kind", "source_kind"
    ]),
    lifecycle: selectedFields(value.lifecycle, [
      "business_state", "primary_state", "primary_state_reason", "primary_state_label", "reason",
      "last_transition_at", "current_stage_id", "current_stage_display_name", "current_stage_status"
    ]),
    visibility: selectedFields(value.visibility, ["state", "updated_at"]),
    execution: execution ? {
      ...selectedFields(execution, [
        "state", "current_stage_id", "current_stage_display_name", "next_stage_id",
        "next_stage_display_name", "started_at", "updated_at", "running_proof_status"
      ]),
      review_chain: selectedFields(execution.review_chain, [
        "stage_run_count", "total_attempt_count", "total_repair_rounds", "total_tokens_observed",
        "token_observation_status"
      ]),
      quality_budget: selectedFields(execution.quality_budget, [
        "state", "elapsed_ms", "max_elapsed_ms", "tokens_used", "max_tokens", "token_observation_status",
        "stop_reason"
      ])
    } : undefined,
    session_activity: selectedFields(value.session_activity, [
      "state", "active_session_count", "latest_activity_kind", "latest_activity_state", "latest_activity_at"
    ]),
    attention: selectedFields(value.attention, [
      "kind", "reason", "owner", "responsible_component", "issue", "impact", "repair_action", "expected_outcome"
    ]),
    telemetry: telemetry ? {
      ...selectedFields(telemetry, ["state", "missing_reason"]),
      current_stage: selectedFields(telemetry.current_stage, [
        "state", "input_tokens", "output_tokens", "total_tokens", "observed_at", "missing_reason"
      ]),
      cumulative: selectedFields(telemetry.cumulative, [
        "state", "input_tokens", "output_tokens", "total_tokens", "observed_at", "missing_reason"
      ])
    } : undefined,
    action: selectedFields(value.action, [
      "kind", "title", "summary", "owner", "owner_kind", "owner_display_name", "action_ref"
    ]),
    stage_map: Array.isArray(value.stage_map) ? value.stage_map.slice(0, 64).map(compactWorkItemStage) : [],
    freshness: selectedFields(value.freshness, [
      "state", "inventory_observed_at", "execution_observed_at", "last_transition_time", "reason"
    ])
  };
}

function compactWorkItemProjection(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    ...selectedFields(value, ["surface_kind", "schema_version", "profile", "generated_at"]),
    summary: selectedFields(value.summary, [
      "agent_count", "project_count", "work_item_count", "visible_work_item_count", "archived_work_item_count",
      "total_work_item_count", "running_count", "active_session_count", "user_attention_count",
      "system_attention_count", "telemetry_observed_count", "telemetry_missing_count"
    ]),
    agent_catalog: Array.isArray(value.agent_catalog)
      ? value.agent_catalog.slice(0, 64).map((agent) => selectedFields(agent, [
          "agent_id", "domain_id", "display_name", "short_label", "package_id"
        ]) ?? {})
      : [],
    project_catalog: Array.isArray(value.project_catalog)
      ? value.project_catalog.slice(0, 256).map((project) => selectedFields(project, [
          "project_id", "agent_id", "agent_display_name", "domain_id", "display_name", "binding_status"
        ]) ?? {})
      : [],
    items: Array.isArray(value.items) ? value.items.slice(0, 512).map(compactWorkItem) : []
  };
}

function compactFastState(value) {
  const root = value && typeof value === "object" ? value : {};
  const appState = root.app_state && typeof root.app_state === "object" ? root.app_state : root;
  const agentPackages = appState.agent_packages && typeof appState.agent_packages === "object" ? appState.agent_packages : undefined;
  const directory = agentPackages?.directory && typeof agentPackages.directory === "object" ? agentPackages.directory : undefined;
  const statusIndex = agentPackages?.status_index && typeof agentPackages.status_index === "object" ? agentPackages.status_index : undefined;
  const operator = appState.operator && typeof appState.operator === "object" ? appState.operator : undefined;
  const workbench = operator?.workbench && typeof operator.workbench === "object" ? operator.workbench : undefined;
  const settings = appState.settings_control_center && typeof appState.settings_control_center === "object"
    ? appState.settings_control_center
    : undefined;
  return {
    ...(root.version !== undefined ? { version: root.version } : {}),
    app_state: {
      schema_version: appState.schema_version,
      surface_kind: appState.surface_kind,
      runtime_source: appState.runtime_source,
      meta: appState.meta,
      managed_update: compactManagedUpdateProjection(appState.managed_update),
      core: compactCore(appState.core),
      provider: compactProvider(appState.provider),
      runtime_source_carriers: compactRuntimeSourceCarriers(appState.runtime_source_carriers),
      codex_personalization: compactCodexPersonalization(appState.codex_personalization),
      ui_contributions: compactUiContributions(appState.ui_contributions),
      transport_bindings: appState.transport_bindings,
      active_project_lines: firstRecords(appState.active_project_lines, 12),
      home_agent_shortcuts: compactHomeShortcutPreferences(appState.home_agent_shortcuts, 16),
      modules: { items: firstRecords(appState.modules?.items, 8) ?? [] },
      actions: Array.isArray(appState.actions) ? appState.actions.slice(0, 100).map(compactAction) : [],
      operator: operator ? {
        summary: operator.summary,
        refs: firstRecords(operator.refs, 16) ?? [],
        workbench: workbench ? {
          task_drilldowns: firstRecords(workbench.task_drilldowns, 8) ?? [],
          work_item_projection_v2: compactWorkItemProjection(workbench.work_item_projection_v2),
          safe_action_routes: firstRecords(workbench.safe_action_routes, 32) ?? [],
          current_owner_delta: workbench.current_owner_delta,
          current_owner_delta_next_action: workbench.current_owner_delta_next_action
        } : undefined
      } : undefined,
      settings_control_center: settings ? {
        surface_kind: settings.surface_kind,
        schema_version: settings.schema_version,
        profile: settings.profile,
        status_summary: selectedFields(settings.status_summary, [
          "model_access", "codex_version", "runtime_source_carrier_health", "agent_package_functional_health",
          "temporal_provider", "release_channel", "issue_count"
        ]),
        app_settings_read_model: compactSettingsReadModel(settings.app_settings_read_model),
        task_entries: firstRecords(settings.task_entries, 64) ?? [],
        action_sections: firstRecords(settings.action_sections, 32) ?? []
      } : undefined,
      agent_packages: agentPackages ? {
        surface_kind: agentPackages.surface_kind,
        source: agentPackages.source,
        directory: directory ? {
          status: directory.status,
          entry_count: directory.entry_count,
          installed_package_count: directory.installed_package_count,
          installable_package_count: directory.installable_package_count,
          migration_required_count: directory.migration_required_count,
          source_catalog_kind: directory.source_catalog_kind,
          files: selectedFields(directory.files, ["home_shortcut_preferences_file"]),
          home_shortcut_preferences: compactHomeShortcutPreferences(directory.home_shortcut_preferences, 16),
          entries: compactPackageRows(directory.entries, 64) ?? []
        } : undefined,
        status_index: statusIndex ? {
          installed_package_count: statusIndex.installed_package_count,
          files: statusIndex.files,
          home_shortcut_preferences: compactHomeShortcutPreferences(statusIndex.home_shortcut_preferences, 16),
          packages: compactPackageRows(statusIndex.packages, 64)
        } : undefined
      } : undefined
    }
  };
}

function boundedReadback(args, result) {
  return {
    ...commandReadback(args, result),
    stdout: "",
    stdoutBytes: Buffer.byteLength(result.stdout),
    stdoutOmittedFromGuiProjection: true
  };
}

function compactInitializeChecklistItem(value) {
  return selectedFields(value, [
    "item_id", "label", "status", "required", "blocking", "readiness_layer",
    "severity", "user_action_required", "next_visible_step"
  ]) ?? {};
}

export function compactInitialize(value) {
  const source = value?.system_initialize && typeof value.system_initialize === "object"
    ? value.system_initialize
    : {};
  const setupFlow = source.setup_flow && typeof source.setup_flow === "object"
    ? source.setup_flow
    : {};
  return {
    system_initialize: {
      ...selectedFields(source, ["overall_state"]),
      setup_flow: {
        ...selectedFields(setupFlow, ["is_first_run", "phase", "ready_to_launch"]),
        progress: selectedFields(setupFlow.progress, [
          "required_completed_count", "required_total_count", "optional_completed_count",
          "optional_total_count", "ready_required_count", "total_required_count",
          "ready_full_readiness_count", "total_full_readiness_count",
          "ready_optional_count", "total_optional_count"
        ]) ?? {},
        blocking_items: compactStringArray(setupFlow.blocking_items),
        maintenance_items: compactStringArray(setupFlow.maintenance_items)
      },
      readiness: selectedFields(source.readiness, [
        "core_ready", "domain_ready", "launch_ready", "family_runtime_provider_ready", "full_ready"
      ]) ?? {},
      checklist: Array.isArray(source.checklist)
        ? source.checklist.slice(0, 32).map(compactInitializeChecklistItem)
        : [],
      family_runtime_provider: selectedFields(source.family_runtime_provider, [
        "status", "provider_kind", "blocking", "full_readiness_blocking", "ready"
      ]) ?? {}
    }
  };
}

function validateChannelCallbackAdapter(adapter) {
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
    throw Object.assign(new Error("channel callback adapter must be an object"), { code: "invalid_request" });
  }
  for (const method of ["startThread", "resumeThread", "startTurn", "subscribeTurn"]) {
    if (typeof adapter[method] !== "function") {
      throw Object.assign(new Error(`channel callback adapter is missing ${method}`), { code: "invalid_request" });
    }
  }
  return adapter;
}

function validateChannelProviderHost(host) {
  if (!host || typeof host !== "object" || Array.isArray(host)) {
    throw Object.assign(new Error("channel callback registrar must return a Host handle"), { code: "invalid_request" });
  }
  for (const method of ["appStatePatch", "readChannelAccess", "executeChannelAccessAction", "dispose"]) {
    if (typeof host[method] !== "function") {
      throw Object.assign(new Error(`channel provider Host is missing ${method}`), { code: "invalid_request" });
    }
  }
  return host;
}

function channelAccessEntries(host) {
  if (!host) return [];
  const patch = host.appStatePatch();
  const entries = patch?.ui_contributions?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => entry?.view?.view_type === "channel_access");
}

function channelAccessEntry(host, packageId, ref, operation) {
  return channelAccessEntries(host).find((entry) => {
    if (
      entry?.package_id !== packageId
      || entry?.action_boundary !== "opl.connect.channel-provider-host"
    ) return false;
    if (operation === "read") return entry.view?.data_ref === ref;
    return Array.isArray(entry.commands)
      && entry.commands.some((command) => command?.action_ref === ref);
  });
}

export function mergeChannelProviderState(value, host) {
  if (!host || !value?.app_state || typeof value.app_state !== "object") return value;
  const patch = host.appStatePatch();
  const hostProjection = patch?.ui_contributions;
  const transportBindings = patch?.transport_bindings;
  const hasHostProjection = hostProjection && typeof hostProjection === "object";
  const hasTransportBindings = transportBindings && typeof transportBindings === "object";
  if (!hasHostProjection && !hasTransportBindings) return value;
  let appState = {
    ...value.app_state,
    ...(hasTransportBindings ? { transport_bindings: transportBindings } : {})
  };
  if (hasHostProjection) {
    const currentProjection = value.app_state.ui_contributions;
    const currentEntries = Array.isArray(currentProjection?.entries) ? currentProjection.entries : [];
    const hostEntries = Array.isArray(hostProjection.entries) ? hostProjection.entries : [];
    const entries = [
      ...currentEntries.filter((entry) => entry?.view?.view_type !== "channel_access"),
      ...hostEntries
    ];
    appState = {
      ...appState,
      ui_contributions: {
        ...(currentProjection && typeof currentProjection === "object" ? currentProjection : {}),
        ...hostProjection,
        contribution_count: entries.length,
        entries
      }
    };
  }
  return {
    ...value,
    app_state: appState
  };
}

function hostActionReceipt(request, result) {
  return {
    actionId: request.actionId,
    dryRun: false,
    confirmationRequired: false,
    canExecute: true,
    receiptKind: "execute",
    authorityBoundary: "app_bridge_no_domain_authority",
    requestedMode: "execute",
    status: "executed",
    command: "opl.connect.channel-provider-host",
    commandArgs: [],
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
    payload: request.payload,
    stdoutJson: result
  };
}

export { compactFastState };

export function createOplPassthrough({
  env = process.env,
  cwd = process.cwd(),
  command = env.OPL_APP_OPL_BIN ?? env.OPL_COMMAND ?? "opl",
  readStateTimeoutMs = env.OPL_APP_STATE_TIMEOUT_MS,
  allowActions = env.OPL_NATIVE_WORKBENCH_READ_ONLY === "0"
    || env.OPL_STUDIO_READ_ONLY === "0",
  candidateActionAllowlist = [],
  channelCallbackRegistrar
} = {}) {
  const stateTimeoutMs = boundedTimeout(readStateTimeoutMs, 30_000);
  if (!Array.isArray(candidateActionAllowlist) || candidateActionAllowlist.some((actionId) => typeof actionId !== "string" || !actionId.trim())) {
    throw Object.assign(new Error("candidateActionAllowlist must contain non-empty action IDs"), { code: "invalid_request" });
  }
  const allowedCandidateActions = new Set([
    "settings_diagnose_docker_webui",
    "settings_inventory_agent_package_store",
    "settings_inventory_webui_data_volume",
    "codex_user_instructions_set",
    "codex_user_instructions_restore_opl_flow_default",
    ...candidateActionAllowlist.map((actionId) => actionId.trim())
  ]);
  if (channelCallbackRegistrar !== undefined && typeof channelCallbackRegistrar !== "function") {
    throw Object.assign(new Error("channel callback registrar must be a function"), { code: "invalid_request" });
  }
  let channelProviderHost = null;
  return {
    async registerChannelCallbackAdapter(adapter) {
      const validated = validateChannelCallbackAdapter(adapter);
      if (typeof channelCallbackRegistrar !== "function") {
        return { status: "dormant", registered: false, dispose: async () => {} };
      }
      const candidate = await channelCallbackRegistrar(validated);
      let registration;
      try {
        registration = validateChannelProviderHost(candidate);
      } catch (error) {
        await candidate?.dispose?.();
        throw error;
      }
      channelProviderHost = registration;
      let disposed = false;
      return {
        status: registration?.status ?? "registered",
        registered: true,
        dispose: async () => {
          if (disposed) return;
          disposed = true;
          if (channelProviderHost === registration) channelProviderHost = null;
          await registration.dispose();
        }
      };
    },

    async readState(profile = "fast") {
      const normalizedProfile = profile === "full" ? "full" : "fast";
      const args = [command, "app", "state", "--profile", normalizedProfile, "--json"];
      const result = await run(command, args.slice(1), { cwd, env, timeoutMs: stateTimeoutMs });
      const parsed = mergeChannelProviderState(jsonValue(result.stdout), channelProviderHost);
      return {
        profile: normalizedProfile,
        app_state: normalizedProfile === "fast" ? compactFastState(parsed) : parsed,
        readback: boundedReadback(args, result)
      };
    },

    async readInitialize() {
      const args = [command, "system", "initialize", "--json"];
      const result = await run(command, args.slice(1), { cwd, env, timeoutMs: 60_000 });
      return {
        ...compactInitialize(jsonValue(result.stdout)),
        readback: boundedReadback(args, result)
      };
    },

    async readFullDrilldown() {
      const args = [command, "runtime", "app-operator-drilldown", "--detail", "full", "--json"];
      const result = await run(command, args.slice(1), { cwd, env, timeoutMs: 45_000 });
      return { detail: "full", drilldown: jsonValue(result.stdout), readback: commandReadback(args, result) };
    },

    async readDomainDetailView(request = {}) {
      const itemId = typeof request.itemId === "string" ? request.itemId.trim() : "";
      const viewId = typeof request.viewId === "string" ? request.viewId.trim() : "";
      if (!itemId || !viewId) {
        throw Object.assign(new Error("missing itemId or viewId"), { code: "invalid_request" });
      }
      const args = [command, "app", "view", "read", "--item-id", itemId, "--view-id", viewId];
      if (request.ifRevision !== undefined) {
        if (!Number.isInteger(request.ifRevision) || request.ifRevision < 0) {
          throw Object.assign(new Error("ifRevision must be a non-negative integer"), { code: "invalid_request" });
        }
        args.push("--if-revision", String(request.ifRevision));
      }
      args.push("--json");
      const result = await run(command, args.slice(1), { cwd, env, timeoutMs: 45_000 });
      return { ...commandReadback(args, result), stdoutJson: jsonValue(result.stdout) };
    },

    async readContribution(request = {}) {
      const packageId = typeof request.packageId === "string" ? request.packageId.trim() : "";
      const ref = typeof request.ref === "string" ? request.ref.trim() : "";
      if (!packageId || !ref) throw Object.assign(new Error("missing packageId or ref"), { code: "invalid_request" });
      const input = request.input && typeof request.input === "object" ? request.input : {};
      if (channelAccessEntry(channelProviderHost, packageId, ref, "read")) {
        const stdoutJson = await channelProviderHost.readChannelAccess({
          package_id: packageId,
          ref,
          input
        });
        return {
          command: "opl.connect.channel-provider-host",
          commandArgs: [],
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
          stdoutJson
        };
      }
      const args = [command, "app", "contribution", "read", "--package-id", packageId, "--ref", ref, "--input", JSON.stringify(input), "--json"];
      const result = await run(command, args.slice(1), { cwd, env, timeoutMs: 45_000 });
      return { ...commandReadback(args, result), stdoutJson: jsonValue(result.stdout) };
    },

    async executeAction(request = {}) {
      const actionId = typeof request.actionId === "string" ? request.actionId.trim() : "";
      if (!actionId) throw Object.assign(new Error("missing actionId"), { code: "invalid_request" });
      const payload = request.payload && typeof request.payload === "object" ? request.payload : {};
      const packageId = typeof payload.package_id === "string" ? payload.package_id.trim() : "";
      const ref = typeof payload.ref === "string" ? payload.ref.trim() : "";
      if (
        actionId === "package_contribution_execute"
        && request.dryRun === false
        && packageId
        && ref
        && channelAccessEntry(channelProviderHost, packageId, ref, "execute")
      ) {
        const result = await channelProviderHost.executeChannelAccessAction({
          package_id: packageId,
          ref,
          input: payload.input && typeof payload.input === "object" ? payload.input : {},
          confirmed: payload.confirmed === true
        });
        return hostActionReceipt(request, result);
      }
      const dryRun = request.dryRun !== false;
      const confirmed = payload.confirmed === true;
      const rollbackRef = typeof payload.rollbackRef === "string" ? payload.rollbackRef : undefined;
      const requestedMode = request.mode === "rollback" || request.mode === "execute" ? request.mode : "preview";
      const candidateAllowedAction = allowedCandidateActions.has(actionId);
      const actionExecutionAllowed = allowActions || candidateAllowedAction;
      const blockedReadOnly = !dryRun && !actionExecutionAllowed;
      const receiptKind = blockedReadOnly
        ? "blocked_read_only"
        : !dryRun && !confirmed
        ? "confirmation_required"
        : (requestedMode === "rollback" || rollbackRef ? "rollback" : (dryRun ? "preview" : "execute"));
      const args = [command, "app", "action", "execute", "--action", actionId];
      if (Object.keys(payload).length) args.push("--payload", JSON.stringify(payload));
      if (dryRun) args.push("--dry-run");
      args.push("--json");
      const result = blockedReadOnly
        ? { exitCode: -1, stdout: "", stderr: "candidate_read_only_policy", timedOut: false }
        : !dryRun && !confirmed
        ? { exitCode: -1, stdout: "", stderr: "confirmation_required", timedOut: false }
        : await run(command, args.slice(1), { cwd, env, timeoutMs: actionId === "codex_install" ? 120_000 : 45_000 });
      return {
        actionId,
        dryRun,
        confirmationRequired: dryRun || (!dryRun && !confirmed),
        canExecute: dryRun || (actionExecutionAllowed && confirmed),
        receiptKind,
        authorityBoundary: "app_bridge_no_domain_authority",
        requestedMode,
        status: result.timedOut
          ? "timed_out"
          : (blockedReadOnly
              ? "blocked_read_only"
              : (!dryRun && !confirmed ? "confirmation_required" : (result.exitCode === 0 ? (dryRun ? "preview_ready" : "executed") : "error"))),
        ...commandReadback(args, result),
        payload,
        stdoutJson: jsonValue(result.stdout),
        stderrJson: jsonValue(result.stderr),
        ...(payload.confirmationId ? { confirmationId: payload.confirmationId } : {}),
        ...(payload.receiptId ? { receiptId: payload.receiptId } : {}),
        ...(rollbackRef ? { rollbackRef } : {})
      };
    }
  };
}
