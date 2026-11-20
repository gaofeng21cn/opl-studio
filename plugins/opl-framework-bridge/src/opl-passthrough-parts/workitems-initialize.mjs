import { compactLocalizedText, compactStringArray, selectedFields } from "./contributions-packages.mjs";

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
      "workspace_path", "work_item_id", "domain_work_item_id", "work_item_scope_id", "identity_state",
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
        "next_stage_display_name", "attempt_id", "started_at", "updated_at", "running_proof_status"
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
      "state", "active_session_count", "latest_activity_kind", "latest_activity_state", "latest_activity_at",
      "active_session_refs", "nonterminal_session_refs", "latest_session_ref"
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
    domain_detail_views: Array.isArray(value.domain_detail_views) ? value.domain_detail_views.slice(0, 64).map(view => selectedFields(view, [
      "item_id", "view_id", "view_kind", "title", "schema_ref", "schema_version", "revision", "digest", "availability"
    ])) : undefined,
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
          "project_id", "agent_id", "agent_display_name", "domain_id", "display_name", "workspace_path", "binding_status"
        ]) ?? {})
      : [],
    items: Array.isArray(value.items) ? value.items.slice(0, 512).map(compactWorkItem) : []
  };
}

function compactInitializeChecklistItem(value) {
  const item = selectedFields(value, [
    "item_id", "label", "status", "required", "blocking", "readiness_layer",
    "severity", "user_action_required", "next_visible_step"
  ]) ?? {};
  if (typeof value?.last_attempt?.degraded_reason === "string") item.reason_code = value.last_attempt.degraded_reason;
  return item;
}

function compactInitialize(value) {
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

export { compactInitialize, compactWorkItemProjection };
