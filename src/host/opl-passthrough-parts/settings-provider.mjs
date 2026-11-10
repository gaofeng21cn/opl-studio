import { selectedFields } from "./contributions-packages.mjs";

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

const records = value => Array.isArray(value) ? value.filter(item => item && typeof item === "object" && !Array.isArray(item)) : [];
const strings = value => Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
function compactCapabilities(value) {
  return (Array.isArray(value) ? value : []).flatMap(item => typeof item === "string" ? [item]
    : item && typeof item === "object" ? [selectedFields(item, ["capability_id", "id", "label", "risk"])] : []);
}
function compactConnection(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    ...selectedFields(value, ["connection_id", "id", "display_name", "name", "connection_display_name", "provider_type", "connection_provider_type", "connection_type", "status", "security_revision", "account_label", "disabled"]),
    capabilities: compactCapabilities(value.capabilities)
  };
}
function compactConnectionRequest(value) {
  return {
    ...selectedFields(value, ["request_id", "grant_id", "status", "consumer_package_id", "consumer_display_name", "connection_id", "connection_display_name", "connection_provider_type", "provider_type", "connection_status", "connection_security_revision", "connection_account_label", "requested_at", "created_at", "granted_at", "decided_at", "stale_reason"]),
    consumer: selectedFields(value.consumer, ["package_id", "display_name"]),
    connection: compactConnection(value.connection),
    capabilities: compactCapabilities(value.capabilities ?? value.capability_ids)
  };
}
function compactConnectionAuthorization(value) {
  if (!value || typeof value !== "object") return undefined;
  return {
    ...selectedFields(value, ["schema", "surface_kind", "available_connections_status", "available_connections_reason"]),
    connections: records(value.connections).map(compactConnection),
    requests: records(value.requests).map(compactConnectionRequest),
    grants: records(value.grants).map(compactConnectionRequest),
    invocations: records(value.invocations).slice(0, 20).map(item => selectedFields(item, ["invocation_id", "consumer_package_id", "consumer_display_name", "connection_id", "connection_display_name", "capability_id", "capability_label", "started_at", "finished_at", "disposition"])),
    available_connections: records(value.available_connections).map(item => selectedFields(item, ["mailbox_ref", "display_name", "name", "account_label", "provider_type"]))
  };
}
function compactKnowledgeSources(value) {
  if (!value || value.surface_kind !== "opl_knowledge_sources_projection.v1") return undefined;
  const payloadFields = ["resource_id", "context_id", "source_id", "label", "scope_ids", "consumer_domain_ids", "write_domain_ids", "expected_revision"];
  const payload = value => Object.fromEntries(Object.entries(selectedFields(value, payloadFields) ?? {}).filter(([, entry]) => typeof entry === "string" || Array.isArray(entry) && entry.every(item => typeof item === "string")));
  return {
    ...selectedFields(value, ["surface_kind", "status"]),
    contexts: records(value.contexts).map(item => ({
      ...selectedFields(item, ["context_id", "label", "selected", "revision", "status"]),
      available_scope_ids: strings(item.available_scope_ids)
    })),
    items: records(value.items).map(item => ({
      ...selectedFields(item, ["resource_id", "source_id", "label", "context_id", "status", "connected", "source_writable", "revision_identity", "knowledge_count", "reason", "owner_settings_route", "access_editable", "access_edit_reason", "scope_expansion_allowed"]),
      scope_ids: strings(item.scope_ids), available_scope_ids: strings(item.available_scope_ids), consumer_domain_ids: strings(item.consumer_domain_ids),
      consumer_package_ids: strings(item.consumer_package_ids), write_domain_ids: strings(item.write_domain_ids), action_ids: strings(item.action_ids),
      authorization: selectedFields(item.authorization, ["status", "consumer_count", "grant_count"]),
      revision: selectedFields(item.revision, ["status", "security_revision"]),
      freshness: selectedFields(item.freshness, ["status", "observed_at"]),
      readiness: selectedFields(item.readiness, ["status", "reason"]),
      ...(item.knowledge_health && typeof item.knowledge_health === "object" ? { knowledge_health: {
        ...selectedFields(item.knowledge_health, ["current_count", "review_due_count", "inactive_count", "unavailable_count", "checked_count", "truncated"]),
        issues: records(item.knowledge_health.issues).map(issue => selectedFields(issue, ["knowledge_id", "status", "reason"]))
      } } : {})
    })),
    available_consumers: records(value.available_consumers).map(item => selectedFields(item, ["domain_id", "label", "package_id"])),
    failures: records(value.failures).map(item => selectedFields(item, ["context_id", "reason"])),
    authority_boundary: selectedFields(value.authority_boundary, ["body_included", "absolute_paths_included", "second_registry", "source_owner"]),
    available_actions: records(value.available_actions).filter(item => typeof item.action_id === "string" && item.action_id.startsWith("knowledge_source_")).map(item => ({
      ...selectedFields(item, ["action_id", "label", "status", "dry_run_supported", "confirmation_required", "reason"]),
      payload_fields: strings(item.payload_fields), follow_up_action_ids: strings(item.follow_up_action_ids),
      payload: payload(item.payload), default_payload: payload(item.default_payload)
    }))
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
      action_ids: strings(connections.action_ids),
      authorization: compactConnectionAuthorization(connections.authorization),
      connections: Array.isArray(connections.connections)
        ? connections.connections.slice(0, 16).map((connection) => selectedFields(connection, [
            "connection_id", "name", "connection_type", "endpoint", "status", "status_code", "last_tested_at"
          ]) ?? {})
        : []
    } : undefined,
    resource_sources: compactKnowledgeSources(value.resource_sources),
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

export {
  compactCodexPersonalization,
  compactCore,
  compactProvider,
  compactRuntimeSourceCarriers,
  compactSettingsReadModel
};
