type UnknownRecord = Record<string, unknown>;

export type ServiceRecoveryComponent = "service" | "worker" | "scheduler" | "temporal";
export type ServiceRecoveryStatus = "ready" | "attention" | "blocked" | "unknown";
export type ServiceRecoveryActionKind = "start" | "restart" | "status" | "repair";

export type ServiceRecoveryAction = {
  actionId: string;
  kind: ServiceRecoveryActionKind;
  label: string;
  mutates: boolean;
  confirmationRequired: boolean;
  sourceRef: "app_state.actions";
};

export type ServiceRecoveryModel = {
  causalRoot: {
    component: ServiceRecoveryComponent;
    status: ServiceRecoveryStatus;
    reasonCode: string;
    rawStatus: string;
    detail: { zh: string; en: string };
    sourceRef: string;
  };
  components: {
    service: { ready: boolean | null; status: string };
    worker: { ready: boolean | null; status: string };
    scheduler: { ready: boolean | null; status: string };
  };
  mutationGuard: {
    status: string;
    allowed: boolean | null;
    blockedReason?: string;
    sourceRef: string;
  };
  primaryAction: ServiceRecoveryAction | null;
  primaryActionBlockedReason?: string;
  freshRecheck: {
    required: true;
    beforeMutation: boolean;
    afterPrimaryAction: true;
    statusActionId: string | null;
    stateSourceRef: "app_state.provider.temporal";
  };
  authorityBoundary: {
    state: "app_state.provider.temporal";
    actions: "app_state.actions";
    role: "derived_view_model_only";
  };
};

export type ServiceRecoveryInput = {
  temporal?: unknown;
  actions?: readonly unknown[];
  stateFresh?: boolean;
};

type ProjectedAction = {
  id: string;
  label: string;
  mutates: boolean;
  confirmationRequired: boolean;
  payloadFields: string[];
};

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function firstStatus(value: UnknownRecord, fields: string[]): string {
  for (const field of fields) {
    const status = stringValue(value[field]);
    if (status) return status;
  }
  return "unknown";
}

function projectedActions(value: readonly unknown[] | undefined): Map<string, ProjectedAction> {
  const actions = new Map<string, ProjectedAction>();
  for (const candidate of value ?? []) {
    const action = record(candidate);
    const id = stringValue(action.action_id) ?? stringValue(action.actionId) ?? stringValue(action.id);
    if (!id) continue;
    const mutates = stringValue(action.mutates) ?? "unknown";
    actions.set(id, {
      id,
      label: stringValue(action.label) ?? id,
      mutates: mutates !== "none_read_only" && mutates !== "none" && mutates !== "read_only",
      confirmationRequired: booleanValue(action.confirmation_required ?? action.confirmationRequired) ?? false,
      payloadFields: stringArray(action.payload_fields ?? action.requiredPayloadFields)
    });
  }
  return actions;
}

function hasAttentionStatus(status: string): boolean {
  return /blocked|degraded|error|failed|missing|not[_-](?:installed|ready|running)|stale|stopped|unavailable/.test(
    status.toLowerCase()
  );
}

function executableAction(
  actions: Map<string, ProjectedAction>,
  actionId: string,
  kind: ServiceRecoveryActionKind,
  expectsMutation = kind !== "status"
): ServiceRecoveryAction | null {
  const action = actions.get(actionId);
  if (!action || action.payloadFields.length > 0 || action.mutates !== expectsMutation) return null;
  return {
    actionId,
    kind,
    label: action.label,
    mutates: action.mutates,
    confirmationRequired: action.confirmationRequired,
    sourceRef: "app_state.actions"
  };
}

function firstExecutable(
  actions: Map<string, ProjectedAction>,
  candidates: readonly [string, ServiceRecoveryActionKind][]
): ServiceRecoveryAction | null {
  for (const [actionId, kind] of candidates) {
    const action = executableAction(actions, actionId, kind);
    if (action) return action;
  }
  return null;
}

function statusActionId(component: ServiceRecoveryComponent): string {
  if (component === "worker") return "provider_worker_status";
  if (component === "scheduler") return "provider_scheduler_status";
  return "provider_service_status";
}

function recoveryDetail(reasonCode: string, rawStatus: string, component: ServiceRecoveryComponent): { zh: string; en: string } {
  if (reasonCode === "worker_not_ready" && rawStatus === "worker_source_stale") {
    return { zh: "后台任务代码版本落后，需要重新加载", en: "Worker source is stale and must be reloaded" };
  }
  if (reasonCode === "service_configuration_drift") {
    return { zh: "后台服务配置已变化，需要重新加载", en: "Background service configuration changed and must be reloaded" };
  }
  if (component === "worker") return { zh: "后台任务尚未就绪", en: "Background worker is not ready" };
  if (component === "scheduler") return { zh: "定时任务需要检查", en: "Scheduled tasks need attention" };
  if (component === "service") return { zh: "后台服务尚未就绪", en: "Background service is not ready" };
  return { zh: "运行状态需要检查", en: "Runtime status needs attention" };
}

export function deriveServiceRecoveryModel(input: ServiceRecoveryInput): ServiceRecoveryModel {
  const temporal = record(input.temporal);
  const details = record(temporal.details);
  const workerReadiness = record(details.worker_readiness);
  const serviceLifecycle = record(workerReadiness.temporal_service_lifecycle);
  const supervisor = record(serviceLifecycle.supervisor);
  const serviceRepair = record(serviceLifecycle.repair_action);
  const workerRepair = record(workerReadiness.repair_action);
  const workerGuard = record(workerReadiness.worker_mutation_guard);
  const scheduler = record(details.scheduler);
  const schedulerRepair = record(scheduler.repair_action);
  const actions = projectedActions(input.actions);

  const supervisorApplicable = booleanValue(supervisor.applicable);
  const supervisorRequired = booleanValue(supervisor.required);
  const supervisorReady = booleanValue(supervisor.ready);
  const serviceReady = booleanValue(workerReadiness.service_ready);
  const workerReady = booleanValue(workerReadiness.worker_ready);
  const schedulerReady = booleanValue(scheduler.ready);
  const serviceStatus = firstStatus(serviceLifecycle, ["service_status", "status"]);
  const workerStatus = firstStatus(workerReadiness, ["readiness_status", "lifecycle_status"]);
  const schedulerStatus = firstStatus(scheduler, ["status", "health_status", "schedule_status"]);
  const guardStatus = firstStatus(workerGuard, ["mutation_guard_status", "status"]);
  const guardAllowed = booleanValue(workerGuard.allowed);
  const guardBlocked = guardAllowed === false || guardStatus.startsWith("blocked_");
  const supervisorMustBeReady = supervisorApplicable !== false && supervisorRequired === true;
  const serviceConfigurationCurrent = booleanValue(supervisor.configuration_current);

  let component: ServiceRecoveryComponent = "temporal";
  let status: ServiceRecoveryStatus = "ready";
  let reasonCode = "all_components_ready";
  let rawStatus = firstStatus(temporal, ["health_status", "status"]);
  let sourceRef = "app_state.provider.temporal";

  if (serviceReady !== true || (supervisorMustBeReady && supervisorReady !== true)) {
    component = "service";
    rawStatus = supervisorMustBeReady && supervisorReady !== true
      ? firstStatus(supervisor, ["status", "process_state"])
      : serviceStatus;
    sourceRef = supervisorMustBeReady
      ? "app_state.provider.temporal.details.worker_readiness.temporal_service_lifecycle.supervisor"
      : "app_state.provider.temporal.details.worker_readiness.service_ready";
    if (serviceReady === null && !(supervisorMustBeReady && supervisorReady === false)) {
      status = "unknown";
      reasonCode = "service_readback_missing";
    } else if (supervisorApplicable !== false && serviceConfigurationCurrent === false) {
      status = "attention";
      reasonCode = "service_configuration_drift";
    } else {
      status = hasAttentionStatus(rawStatus) || serviceReady === false || supervisorReady === false
        ? "attention"
        : "unknown";
      reasonCode = supervisorMustBeReady && supervisorReady !== true
        ? "service_supervisor_not_ready"
        : "service_not_ready";
    }
  } else if (workerReady !== true) {
    component = "worker";
    rawStatus = workerStatus;
    sourceRef = "app_state.provider.temporal.details.worker_readiness";
    status = guardBlocked ? "blocked" : workerReady === null ? "unknown" : "attention";
    reasonCode = guardBlocked
      ? "worker_mutation_blocked"
      : workerReady === null
      ? "worker_readback_missing"
      : "worker_not_ready";
  } else if (schedulerReady !== true) {
    component = "scheduler";
    rawStatus = schedulerStatus;
    sourceRef = "app_state.provider.temporal.details.scheduler";
    status = schedulerReady === null ? "unknown" : "attention";
    reasonCode = schedulerReady === null ? "scheduler_readback_missing" : "scheduler_not_ready";
  }

  const diagnosticActionId = statusActionId(component);
  const diagnosticAction = executableAction(actions, diagnosticActionId, "status");
  const workerMutationBlocked = component === "worker" && guardAllowed !== true;
  let primaryAction: ServiceRecoveryAction | null = null;

  if (input.stateFresh === false || status === "unknown" || workerMutationBlocked) {
    primaryAction = diagnosticAction;
  } else if (component === "service") {
    const repairActionId = stringValue(serviceRepair.action_id);
    const installed = booleanValue(supervisor.installed);
    const loaded = booleanValue(supervisor.loaded);
    const shouldRepair = (supervisorApplicable !== false && serviceConfigurationCurrent === false)
      || (repairActionId !== undefined && repairActionId !== "none");
    const shouldRestart = !shouldRepair && installed === true && loaded === true && hasAttentionStatus(rawStatus);
    primaryAction = shouldRestart
      ? firstExecutable(actions, [["provider_service_restart", "restart"], ["provider_service_start", "repair"]])
      : firstExecutable(actions, [["provider_service_start", shouldRepair ? "repair" : "start"]]);
  } else if (component === "worker") {
    const repairActionId = stringValue(workerRepair.action_id);
    const shouldRestart = repairActionId === "restart_temporal_worker"
      || /duplicate|source_stale/.test(workerStatus.toLowerCase());
    primaryAction = shouldRestart
      ? executableAction(actions, "provider_worker_restart", "restart")
      : repairActionId === "repair_temporal_worker_runtime_dependencies"
      ? diagnosticAction
      : executableAction(actions, "provider_worker_start", "start");
  } else if (component === "scheduler") {
    const repairActionId = stringValue(schedulerRepair.action_id);
    const needsInstall = /not[_-]installed|missing/.test(schedulerStatus.toLowerCase())
      || repairActionId === "install_scheduler_cadence";
    primaryAction = needsInstall
      ? executableAction(actions, "provider_scheduler_install", "repair")
      : diagnosticAction;
  } else {
    primaryAction = diagnosticAction;
  }

  const expectedMutation = input.stateFresh !== false && status !== "unknown" && !workerMutationBlocked
    && component !== "temporal";
  const primaryActionBlockedReason = primaryAction
    ? undefined
    : workerMutationBlocked
    ? guardStatus
    : expectedMutation
    ? "app_projected_recovery_action_unavailable"
    : "app_projected_status_action_unavailable";

  return {
    causalRoot: { component, status, reasonCode, rawStatus, detail: recoveryDetail(reasonCode, rawStatus, component), sourceRef },
    components: {
      service: { ready: serviceReady, status: serviceStatus },
      worker: { ready: workerReady, status: workerStatus },
      scheduler: { ready: schedulerReady, status: schedulerStatus }
    },
    mutationGuard: {
      status: guardStatus,
      allowed: guardAllowed,
      ...(guardBlocked ? { blockedReason: guardStatus } : {}),
      sourceRef: "app_state.provider.temporal.details.worker_readiness.worker_mutation_guard"
    },
    primaryAction,
    ...(primaryActionBlockedReason ? { primaryActionBlockedReason } : {}),
    freshRecheck: {
      required: true,
      beforeMutation: input.stateFresh === false || status === "unknown",
      afterPrimaryAction: true,
      statusActionId: diagnosticAction?.actionId ?? null,
      stateSourceRef: "app_state.provider.temporal"
    },
    authorityBoundary: {
      state: "app_state.provider.temporal",
      actions: "app_state.actions",
      role: "derived_view_model_only"
    }
  };
}
