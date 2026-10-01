import assert from "node:assert/strict";
import test from "node:test";

import { deriveServiceRecoveryModel } from "../../src/workbench/serviceRecoveryModel.ts";
import { deriveWorkbenchModelFromState } from "../../src/workbench/workbenchModel.ts";

const action = (actionId: string, mutates = "none_read_only") => ({
  action_id: actionId,
  label: actionId,
  payload_fields: [],
  mutates
});

const actions = [
  action("provider_service_status"),
  action("provider_service_start", "opl_temporal_service"),
  action("provider_service_restart", "opl_temporal_service"),
  action("provider_worker_status"),
  action("provider_worker_start", "opl_temporal_worker"),
  action("provider_worker_restart", "opl_temporal_worker"),
  action("provider_scheduler_status"),
  action("provider_scheduler_install", "opl_temporal_scheduler")
];

function temporalState(overrides: {
  serviceReady?: boolean;
  workerReady?: boolean;
  schedulerReady?: boolean;
  workerStatus?: string;
  schedulerStatus?: string;
  supervisor?: Record<string, unknown>;
  serviceRepairActionId?: string;
  workerRepairActionId?: string;
  schedulerRepairActionId?: string;
  mutationGuard?: Record<string, unknown>;
} = {}) {
  return {
    status: "ready",
    ready: true,
    details: {
      worker_readiness: {
        readiness_status: overrides.workerStatus ?? "ready",
        service_ready: overrides.serviceReady ?? true,
        worker_ready: overrides.workerReady ?? true,
        temporal_service_lifecycle: {
          service_status: "running",
          supervisor: {
            applicable: true,
            required: true,
            installed: true,
            loaded: true,
            ready: true,
            configuration_current: true,
            status: "loaded_running",
            ...overrides.supervisor
          },
          repair_action: {
            action_id: overrides.serviceRepairActionId ?? "none"
          }
        },
        worker_mutation_guard: overrides.mutationGuard ?? {
          mutation_guard_status: "allowed_managed_runtime",
          allowed: true
        },
        repair_action: {
          action_id: overrides.workerRepairActionId ?? "none"
        }
      },
      scheduler: {
        status: overrides.schedulerStatus ?? "ready",
        ready: overrides.schedulerReady ?? true,
        repair_action: {
          action_id: overrides.schedulerRepairActionId ?? "none"
        }
      }
    }
  };
}

test("selects the service configuration repair as the first causal action", () => {
  const model = deriveServiceRecoveryModel({
    temporal: temporalState({
      serviceReady: false,
      supervisor: { ready: false, configuration_current: false, status: "configuration_stale" },
      serviceRepairActionId: "install_temporal_service_supervisor"
    }),
    actions,
    stateFresh: true
  });

  assert.deepEqual(model.causalRoot, {
    component: "service",
    status: "attention",
    reasonCode: "service_configuration_drift",
    rawStatus: "configuration_stale",
    detail: { zh: "后台服务配置已变化，需要重新加载", en: "Background service configuration changed and must be reloaded" },
    sourceRef: "app_state.provider.temporal.details.worker_readiness.temporal_service_lifecycle.supervisor"
  });
  assert.equal(model.primaryAction?.actionId, "provider_service_start");
  assert.equal(model.primaryAction?.kind, "repair");
  assert.equal(model.primaryAction?.mutates, true);
  assert.equal(model.freshRecheck.required, true);
  assert.equal(model.freshRecheck.afterPrimaryAction, true);
});

test("selects service start when the managed service is not installed", () => {
  const model = deriveServiceRecoveryModel({
    temporal: temporalState({
      serviceReady: false,
      supervisor: { installed: false, loaded: false, ready: false, status: "not_installed" }
    }),
    actions,
    stateFresh: true
  });

  assert.equal(model.causalRoot.component, "service");
  assert.equal(model.primaryAction?.actionId, "provider_service_start");
  assert.equal(model.primaryAction?.kind, "start");
});

test("a non-applicable Linux supervisor does not invent configuration drift", () => {
  const model = deriveServiceRecoveryModel({
    temporal: temporalState({
      serviceReady: false,
      supervisor: { applicable: false, required: false, ready: null, installed: false,
        loaded: false, configuration_current: false, status: "not_applicable" }
    }),
    actions,
    stateFresh: true
  });
  assert.equal(model.causalRoot.reasonCode, "service_not_ready");
  assert.equal(model.primaryAction?.kind, "start");
});

test("selects a bounded worker restart only from the App action catalog", () => {
  const model = deriveServiceRecoveryModel({
    temporal: temporalState({
      workerReady: false,
      workerStatus: "worker_source_stale",
      workerRepairActionId: "restart_temporal_worker"
    }),
    actions,
    stateFresh: true
  });

  assert.equal(model.causalRoot.component, "worker");
  assert.equal(model.causalRoot.reasonCode, "worker_not_ready");
  assert.deepEqual(model.primaryAction, {
    actionId: "provider_worker_restart",
    kind: "restart",
    label: "provider_worker_restart",
    mutates: true,
    confirmationRequired: false,
    sourceRef: "app_state.actions"
  });
});

test("a worker mutation guard preserves the blocker and reduces the primary action to status", () => {
  const model = deriveServiceRecoveryModel({
    temporal: temporalState({
      workerReady: false,
      workerStatus: "worker_not_ready",
      workerRepairActionId: "start_temporal_worker",
      mutationGuard: {
        mutation_guard_status: "blocked_developer_checkout_shared_state",
        allowed: false
      }
    }),
    actions,
    stateFresh: true
  });

  assert.equal(model.causalRoot.status, "blocked");
  assert.equal(model.causalRoot.reasonCode, "worker_mutation_blocked");
  assert.equal(model.mutationGuard.blockedReason, "blocked_developer_checkout_shared_state");
  assert.equal(model.primaryAction?.actionId, "provider_worker_status");
  assert.equal(model.primaryAction?.kind, "status");
  assert.equal(model.primaryAction?.mutates, false);
});

test("an unknown worker mutation guard never exposes a mutating recovery action", () => {
  const model = deriveServiceRecoveryModel({
    temporal: temporalState({
      workerReady: false,
      workerStatus: "worker_source_stale",
      workerRepairActionId: "restart_temporal_worker",
      mutationGuard: { mutation_guard_status: "unknown" }
    }),
    actions,
    stateFresh: true
  });

  assert.equal(model.mutationGuard.allowed, null);
  assert.equal(model.primaryAction?.actionId, "provider_worker_status");
  assert.equal(model.primaryAction?.kind, "status");
  assert.equal(model.primaryAction?.mutates, false);
});

test("the worker guard does not block repair of the upstream service", () => {
  const model = deriveServiceRecoveryModel({
    temporal: temporalState({
      serviceReady: false,
      supervisor: { ready: false, configuration_current: false, status: "configuration_stale" },
      serviceRepairActionId: "install_temporal_service_supervisor",
      mutationGuard: {
        mutation_guard_status: "blocked_developer_checkout_shared_state",
        allowed: false
      }
    }),
    actions,
    stateFresh: true
  });

  assert.equal(model.causalRoot.component, "service");
  assert.equal(model.primaryAction?.actionId, "provider_service_start");
  assert.equal(model.primaryAction?.kind, "repair");
});

test("does not infer component readiness from an aggregate ready provider", () => {
  const temporal = temporalState();
  const workerReadiness = temporal.details.worker_readiness as Record<string, unknown>;
  delete workerReadiness.service_ready;
  const model = deriveServiceRecoveryModel({ temporal, actions });

  assert.equal(model.causalRoot.component, "service");
  assert.equal(model.causalRoot.status, "unknown");
  assert.equal(model.causalRoot.reasonCode, "service_readback_missing");
  assert.equal(model.primaryAction?.actionId, "provider_service_status");
  assert.equal(model.freshRecheck.beforeMutation, true);
});

test("selects scheduler installation only after the service and worker are ready", () => {
  const model = deriveServiceRecoveryModel({
    temporal: temporalState({
      schedulerReady: false,
      schedulerStatus: "not_installed",
      schedulerRepairActionId: "install_scheduler_cadence"
    }),
    actions,
    stateFresh: true
  });

  assert.equal(model.causalRoot.component, "scheduler");
  assert.equal(model.primaryAction?.actionId, "provider_scheduler_install");
  assert.equal(model.primaryAction?.kind, "repair");
});

test("healthy state offers one read-only status action and still requires fresh post-action readback", () => {
  const model = deriveServiceRecoveryModel({ temporal: temporalState(), actions, stateFresh: true });

  assert.equal(model.causalRoot.component, "temporal");
  assert.equal(model.causalRoot.status, "ready");
  assert.equal(model.primaryAction?.actionId, "provider_service_status");
  assert.equal(model.primaryAction?.kind, "status");
  assert.equal(model.primaryAction?.mutates, false);
  assert.equal(model.freshRecheck.stateSourceRef, "app_state.provider.temporal");
});

test("never fabricates a recovery route when the App action is absent", () => {
  const model = deriveServiceRecoveryModel({
    temporal: temporalState({ workerReady: false, workerStatus: "worker_not_ready" }),
    actions: [action("provider_worker_status")],
    stateFresh: true
  });

  assert.equal(model.causalRoot.component, "worker");
  assert.equal(model.primaryAction, null);
  assert.equal(model.primaryActionBlockedReason, "app_projected_recovery_action_unavailable");
  assert.equal(model.freshRecheck.statusActionId, "provider_worker_status");
  assert.equal(model.authorityBoundary.role, "derived_view_model_only");
});

test("a stale projection must be rechecked before any mutation", () => {
  const model = deriveServiceRecoveryModel({
    temporal: temporalState({ workerReady: false, workerStatus: "worker_not_ready" }),
    actions,
    stateFresh: false
  });

  assert.equal(model.primaryAction?.actionId, "provider_worker_status");
  assert.equal(model.primaryAction?.kind, "status");
  assert.equal(model.freshRecheck.beforeMutation, true);
});

test("workbench state projects the recovery model from the same App state and action catalog", () => {
  const model = deriveWorkbenchModelFromState({
    app_state: {
      provider: {
        temporal: temporalState({
          workerReady: false,
          workerStatus: "worker_source_stale",
          workerRepairActionId: "restart_temporal_worker"
        })
      },
      actions
    }
  });

  assert.equal(model.serviceRecovery?.causalRoot.component, "worker");
  assert.equal(model.serviceRecovery?.primaryAction?.actionId, "provider_worker_restart");
  assert.equal(model.serviceRecovery?.authorityBoundary.role, "derived_view_model_only");
});
