import type {
  RuntimeOverviewRef,
  WorkbenchActionRef,
  WorkbenchSourceRef
} from "./workbenchModel-contracts";
import {
  asBoolean,
  asFiniteNumber,
  asOptionalBoolean,
  asRecord,
  asRecordArray,
  asString,
  asStringArray,
  firstString
} from "./workbenchModel-primitives";
import {
  buildTaskSourceRefs,
  compactText,
  sourceRef,
  uniqueByRef,
  uniqueStrings
} from "./workbenchModel-presentation";

export type WorkbenchContextSourcesInput = {
  runtimeSource: Record<string, unknown> | null;
  settingsSections: Record<string, unknown>[];
  moduleItems: Record<string, unknown>[];
  taskDrilldowns: Record<string, unknown>[];
};

export type WorkbenchActionProjectionInput = {
  actions: Record<string, unknown>[];
  settingsTaskEntries: Record<string, unknown>[];
  safeActionRoutes: Record<string, unknown>[];
};

export type WorkbenchActionProjectionResult = {
  baseActions: WorkbenchActionRef[];
  actionMap: Map<string, WorkbenchActionRef>;
};

export type WorkbenchRuntimeOverviewInput = {
  provider: Record<string, unknown> | null;
  temporal: Record<string, unknown> | null;
  temporalDetails: Record<string, unknown> | null;
  temporalWorkerReadiness: Record<string, unknown> | null;
  temporalServiceLifecycle: Record<string, unknown> | null;
  temporalSupervisor: Record<string, unknown> | null;
  temporalScheduler: Record<string, unknown> | null;
  temporalManagement: Record<string, unknown> | null;
  runtimeSourceCarriers: Record<string, unknown> | null;
  runtimeCarrierSummary: Record<string, unknown> | null;
  localEnvironment: Record<string, unknown> | null;
  actionMap: Map<string, WorkbenchActionRef>;
};

export function deriveWorkbenchContextSources({
  runtimeSource,
  settingsSections,
  moduleItems,
  taskDrilldowns
}: WorkbenchContextSourcesInput): WorkbenchSourceRef[] {
  const runtimeSources = [
    sourceRef("state-fast", "Fast state", runtimeSource?.normal_gui_state_surface, "Normal GUI state read."),
    sourceRef("state-full", "Full state", runtimeSource?.full_gui_state_surface, "Explicit detailed state read."),
    sourceRef("action-boundary", "Action boundary", runtimeSource?.action_boundary_surface, "App action execution surface."),
    sourceRef("full-drilldown", "Full drilldown", runtimeSource?.full_drilldown_exception_surface, "Runtime drilldown exception.")
  ].filter((item): item is WorkbenchSourceRef => Boolean(item));

  const workbenchSources = buildTaskSourceRefs(taskDrilldowns);
  const settingsSources = settingsSections.map((item, index) => sourceRef(
    `settings-section-${asString(item.section_id) ?? index}`,
    asString(item.label) ?? `Settings section ${index + 1}`,
    item.source_ref,
    compactText(item.description, "Settings control center section.")
  )).filter((item): item is WorkbenchSourceRef => Boolean(item));
  const moduleSources = moduleItems.slice(0, 5).map((item, index) => sourceRef(
    `module-${asString(item?.module_id) ?? index}`,
    asString(item?.label) ?? asString(item?.module_id) ?? "Module",
    asString(item?.checkout_path) ?? asString(item?.repo_url),
    compactText(item?.description, asString(item?.health_status) ? `Module health: ${item?.health_status}` : "Managed OPL module ref.")
  )).filter((item): item is WorkbenchSourceRef => Boolean(item));

  return uniqueByRef([...runtimeSources, ...settingsSources, ...moduleSources, ...workbenchSources]);
}

export function deriveWorkbenchActionProjection({
  actions,
  settingsTaskEntries,
  safeActionRoutes
}: WorkbenchActionProjectionInput): WorkbenchActionProjectionResult {
  const baseActions = actions.map((item): WorkbenchActionRef | null => {
    const id = asString(item?.action_id);
    if (!id) return null;
    return {
      id,
      label: asString(item?.label) ?? id,
      route: asString(item?.route) ?? `opl app action execute --action ${id}`,
      payloadFields: asStringArray(item?.payload_fields),
      mutates: asString(item?.mutates) ?? "unknown",
      dryRunSupported: asBoolean(item?.dry_run_supported),
      confirmationRequired: asBoolean(item?.confirmation_required),
      dangerLevel: asString(item?.danger_level) ?? undefined,
      owner: asString(item?.owner) ?? undefined,
      delegatedSurface: asString(item?.delegated_surface) ?? undefined,
      canSubmitToSafeActionShell: asBoolean(item?.can_submit_to_safe_action_shell),
      routeRequiresPayload: asBoolean(item?.route_requires_domain_or_app_payload)
    };
  }).filter((item): item is WorkbenchActionRef => Boolean(item));

  const actionOverrides = new Map<string, Partial<WorkbenchActionRef>>();
  for (const entry of settingsTaskEntries) {
    const id = asString(entry.action_id) ?? asString(entry.task_id);
    if (!id) continue;
    actionOverrides.set(id, {
      label: asString(entry.label) ?? id,
      route: asString(entry.route) ?? `opl app action execute --action ${id}`,
      payloadFields: asStringArray(entry.payload_fields),
      mutates: asString(entry.mutates) ?? "unknown",
      dryRunSupported: asBoolean(entry.dry_run_supported),
      confirmationRequired: asBoolean(entry.confirmation_required),
      dangerLevel: asString(entry.danger_level) ?? undefined,
      delegatedSurface: asString(entry.delegated_surface) ?? asString(entry.dry_run_route) ?? undefined,
      routeRequiresPayload: asBoolean(entry.payload_required)
    });
  }
  for (const route of safeActionRoutes) {
    const id = asString(route.action_id);
    if (!id) continue;
    const existing = actionOverrides.get(id) ?? {};
    actionOverrides.set(id, {
      ...existing,
      label: asString(route.label) ?? existing.label ?? id,
      route: asString(route.route) ?? existing.route ?? `opl app action execute --action ${id}`,
      owner: asString(route.owner) ?? existing.owner,
      dryRunSupported: true
    });
  }

  const actionMap = new Map<string, WorkbenchActionRef>();
  for (const action of baseActions) {
    const override = actionOverrides.get(action.id);
    actionMap.set(action.id, {
      ...action,
      ...(override ?? {})
    });
  }
  for (const [id, override] of actionOverrides.entries()) {
    if (actionMap.has(id)) continue;
    actionMap.set(id, {
      id,
      label: override.label ?? id,
      route: override.route ?? `opl app action execute --action ${id}`,
      payloadFields: override.payloadFields ?? [],
      mutates: override.mutates ?? "unknown",
      dryRunSupported: override.dryRunSupported ?? true,
      confirmationRequired: override.confirmationRequired ?? false,
      dangerLevel: override.dangerLevel,
      owner: override.owner,
      delegatedSurface: override.delegatedSurface,
      canSubmitToSafeActionShell: override.canSubmitToSafeActionShell,
      routeRequiresPayload: override.routeRequiresPayload
    });
  }
  return { baseActions, actionMap };
}

export function deriveWorkbenchRuntimeOverview({
  provider,
  temporal,
  temporalDetails,
  temporalWorkerReadiness,
  temporalServiceLifecycle,
  temporalSupervisor,
  temporalScheduler,
  temporalManagement,
  runtimeSourceCarriers,
  runtimeCarrierSummary,
  localEnvironment,
  actionMap
}: WorkbenchRuntimeOverviewInput): RuntimeOverviewRef {
  const runtimeMaintenanceActionIds = uniqueStrings([
    asString(localEnvironment?.app_update_action_id),
    "settings_check_app_update",
    "settings_apply_opl_packages",
    "settings_sync_capabilities",
    asString(localEnvironment?.runtime_roots_cleanup_action_id),
    asString(localEnvironment?.runtime_substrate_rollback_action_id),
    ...asStringArray(temporalManagement?.actions)
  ]);
  const runtimeMaintenanceActions = runtimeMaintenanceActionIds.flatMap((actionId) => {
    const action = actionMap.get(actionId);
    if (!action) return [];
    return [{
      actionId,
      label: action.label,
      payload: {},
      requiredPayloadFields: action.payloadFields,
      confirmationRequired: action.confirmationRequired,
      dryRunSupported: action.dryRunSupported,
      mutates: action.mutates,
      ...(action.dangerLevel ? { dangerLevel: action.dangerLevel } : {})
    }];
  });
  const temporalSchedulerStatus = firstString(temporalScheduler, ["status", "health_status"]) ?? "unknown";
  const temporalSchedulerReady = asOptionalBoolean(temporalScheduler?.ready);
  const recommendedRuntimeAction = (
    temporalSchedulerReady === false || /attention|error|failed|stale/.test(temporalSchedulerStatus.toLowerCase())
      ? runtimeMaintenanceActions.find((action) => action.actionId === "provider_scheduler_status")
      : null
  ) ?? runtimeMaintenanceActions.find((action) => action.actionId === asString(localEnvironment?.app_update_action_id));
  return {
    temporal: {
      status: firstString(temporal, ["health_status", "status"]) ?? firstString(provider, ["status"]) ?? "unknown",
      ready: asOptionalBoolean(temporal?.ready),
      serviceStatus: firstString(temporalSupervisor, ["status", "process_state"])
        ?? firstString(temporalServiceLifecycle, ["service_status"])
        ?? "unknown",
      serviceReady: asOptionalBoolean(temporalSupervisor?.ready ?? temporalWorkerReadiness?.service_ready),
      workerStatus: firstString(temporalWorkerReadiness, ["readiness_status", "lifecycle_status"]) ?? "unknown",
      workerReady: asOptionalBoolean(temporalWorkerReadiness?.worker_ready),
      schedulerStatus: temporalSchedulerStatus,
      schedulerReady: temporalSchedulerReady,
      ...(asString(temporalDetails?.address) ? { address: asString(temporalDetails?.address) as string } : {}),
      ...(asString(temporalDetails?.namespace) ? { namespace: asString(temporalDetails?.namespace) as string } : {}),
      ...(asString(temporalDetails?.task_queue) ? { taskQueue: asString(temporalDetails?.task_queue) as string } : {}),
      ...(firstString(temporalScheduler, ["observed_at"]) ?? firstString(temporalSupervisor, ["observed_at"])
        ? { observedAt: (firstString(temporalScheduler, ["observed_at"]) ?? firstString(temporalSupervisor, ["observed_at"])) as string }
        : {})
    },
    carriers: {
      total: asFiniteNumber(runtimeCarrierSummary?.default_carriers_count) ?? 0,
      present: asFiniteNumber(runtimeCarrierSummary?.present_default_carriers_count) ?? 0,
      healthy: asFiniteNumber(runtimeCarrierSummary?.healthy_default_carriers_count) ?? 0,
      items: asRecordArray(runtimeSourceCarriers?.items).map((carrier, index) => ({
        packageId: asString(carrier.package_id) ?? `runtime-carrier-${index}`,
        label: asString(carrier.label) ?? asString(carrier.package_id) ?? `Runtime source ${index + 1}`,
        ...(asString(carrier.description) ? { description: asString(carrier.description) as string } : {}),
        status: asString(carrier.source_health_status) ?? (asBoolean(carrier.source_present) ? "ready" : "unavailable"),
        ...(asString(carrier.source_origin) ? { sourceOrigin: asString(carrier.source_origin) as string } : {}),
        ...(asString(asRecord(carrier.git)?.sync_status) ? { syncStatus: asString(asRecord(carrier.git)?.sync_status) as string } : {}),
        dirty: asOptionalBoolean(asRecord(carrier.git)?.dirty)
      }))
    },
    maintenanceActions: runtimeMaintenanceActions,
    ...(recommendedRuntimeAction ? { recommendedActionId: recommendedRuntimeAction.actionId } : {})
  };
}
