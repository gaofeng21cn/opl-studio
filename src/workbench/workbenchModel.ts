import {
  initialWorkbenchModel,
  type ApplicationManagementProjection,
  type ApplicationManagementResource,
  type ActiveProjectLine,
  type ConfirmationCard,
  type DeliveryPackage,
  type WorkbenchModel,
  type WorkspaceSession
} from "./workbenchModel-contracts";
import {
  asRecord,
  asRecordArray,
  asString,
  readWorkItemRuntimeProjection
} from "./workbenchModel-primitives";
import {
  buildResultsFromTasks,
  compactText,
  firstPreviewAction,
  formatTimestamp,
  pickActiveProjectLines,
  pickAppState
} from "./workbenchModel-presentation";
import {
  deriveWorkbenchActionProjection,
  deriveWorkbenchContextSources,
  deriveWorkbenchRuntimeOverview
} from "./workbenchModel-runtime";
import { deriveWorkbenchSettingsProjection } from "./workbenchModel-settings";
import { deriveWorkbenchStarters } from "./workbenchModel-starters";
import { deriveWorkbenchTaskProjection } from "./workbenchModel-task-projection";
import { deriveFeatureRefs } from "./featureModel";
import { readUiContributionsProjection } from "../composition/contributionProjection";
import { readManagedCompanions } from "./managedCompanions";
import { deriveServiceRecoveryModel } from "./serviceRecoveryModel";

// Renderer source-contract markers: these public projection fields and type
// names remain owned by this facade while their implementations live in the
// responsibility modules below.
// sessions: []; results: []; deliverables: []; receipts: []; artifactPreviews: [];
// deliveryPackages: []; actionReceipts: []; confirmations: []; questions: [];
// activeProjectLines: []; contextSources: []; contextActions: []; contextTrace: [];
// "collabAgentToolCall" | "subAgentActivity"; type === "collabagenttoolcall";
// type === "subagentactivity"; parentThreadId; sourceKind;
// function packageDependencies(; readManagedUpdateProjection; mergeManagedUpdateProjections
// artifactStatus contract: nonReadyBoundaryStatusPattern; explicitReadyStatusPattern; "app_canonical"
// App source-contract markers: Consume opl app state/action refs; appState.agent_packages;
// app_settings_read_model; opl_gateway_account_read_model.v1; gatewayAccountRecord?.display_name;
// gatewayAccountProjection.connection_mode === "account"; gatewayConnectionMode; settingsProjection;
// codex_model_policy; workspace_services; storage_lifecycle; codex_personalization; ordinary_next_actions;
// readManagedUpdateProjection; mergeManagedUpdateProjections;
// canonical_agent_packages; legacy_modules_fallback; missing_bridge; record.available_actions;
// projectedAction.action_id; projectedAction.action_ref; projectedAction.payload;
// projectedAction.required_payload_fields; projectedAction.confirmation_required;
// task_action_receipt_preview; task_export_bundle_preview; workspace_ensure;
// settings_sync_capabilities; preview_route_not_domain_execution;
// starterPreviewAction;
// deriveThreadDirectory; deriveThreadMessages; collabAgentToolCall; subAgentActivity;
// parentThreadId; sourceKind

export * from "./workbenchModel-contracts";
export * from "./workbenchModel-primitives";
export * from "./workbenchModel-threads";
export * from "./workbenchModel-managed-updates";
export { agentPackageSelectionIntent } from "./workbenchModel-package-lifecycle";
export { deriveThreadDirectory, deriveThreadMessages } from "./workbenchModel-threads";

function readApplicationManagementProjection(value: unknown): ApplicationManagementProjection | undefined {
  const projection = asRecord(value);
  if (projection?.surface_kind !== "opl_application_management_projection.v1") return undefined;
  const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const optionalString = (value: unknown): string | undefined => asString(value) ?? undefined;
  const optionalCount = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
  const kinds: ApplicationManagementResource["resourceKind"][] = ["knowledge_source", "connection", "model", "base_capability"];
  return { sharedResources: asRecordArray(projection.shared_resources).flatMap((resource) => {
    const resourceId = asString(resource.resource_id);
    const resourceKind = asString(resource.resource_kind) as ApplicationManagementResource["resourceKind"];
    const label = asString(resource.label);
    if (!resourceId || !label || !kinds.includes(resourceKind)) return [];
    const labels = asRecord(resource.label_i18n);
    const authorization = asRecord(resource.authorization);
    const revision = asRecord(resource.revision);
    const freshness = asRecord(resource.freshness);
    const readiness = asRecord(resource.readiness);
    return [{
      resourceId,
      resourceKind,
      label,
      ...(labels ? { labelI18n: { zh: optionalString(labels.zh), en: optionalString(labels.en) } } : {}),
      status: resource.status === "ready" || resource.status === "attention" ? resource.status : "unknown",
      sourceRefs: strings(resource.source_refs),
      consumerPackageIds: strings(resource.consumer_package_ids),
      ownerSettingsRoute: optionalString(resource.owner_settings_route),
      relationKind: resource.relation_kind === "required" || resource.relation_kind === "configured" ? resource.relation_kind : "optional",
      detailRef: optionalString(resource.detail_ref),
      ...(authorization ? { authorization: {
        status: authorization.status === "authorized" || authorization.status === "attention" ? authorization.status : "unknown",
        consumerCount: optionalCount(authorization.consumer_count),
        grantCount: optionalCount(authorization.grant_count)
      } } : {}),
      ...(revision ? { revision: {
        status: revision.status === "current" || revision.status === "stale" ? revision.status : "unknown",
        securityRevision: optionalString(revision.security_revision)
      } } : {}),
      ...(freshness ? { freshness: {
        status: freshness.status === "fresh" || freshness.status === "stale" ? freshness.status : "unknown",
        observedAt: optionalString(freshness.observed_at)
      } } : {}),
      ...(readiness ? { readiness: {
        status: readiness.status === "ready" || readiness.status === "attention" ? readiness.status : "unknown",
        reason: optionalString(readiness.reason)
      } } : {})
    } satisfies ApplicationManagementResource];
  }) };
}

export function deriveWorkbenchModelFromState(state: unknown, fallback: WorkbenchModel = initialWorkbenchModel): WorkbenchModel {
  const appState = pickAppState(state);
  if (!appState) return fallback;

  const core = asRecord(appState.core);
  const coreCodex = asRecord(core?.codex);
  const runtimeSource = asRecord(appState.runtime_source);
  const operator = asRecord(appState.operator);
  const workbench = asRecord(operator?.workbench);
  const modules = asRecord(appState.modules);
  const provider = asRecord(appState.provider);
  const temporal = asRecord(provider?.temporal);
  const temporalDetails = asRecord(temporal?.details);
  const temporalWorkerReadiness = asRecord(temporalDetails?.worker_readiness);
  const temporalServiceLifecycle = asRecord(temporalWorkerReadiness?.temporal_service_lifecycle);
  const temporalSupervisor = asRecord(temporalServiceLifecycle?.supervisor);
  const temporalScheduler = asRecord(temporalDetails?.scheduler);
  const temporalManagement = asRecord(temporal?.management);
  const runtimeSourceCarriers = asRecord(appState.runtime_source_carriers);
  const runtimeCarrierSummary = asRecord(runtimeSourceCarriers?.summary);
  const actions = asRecordArray(appState.actions);
  const actionRecords = new Map(actions.flatMap((action): [string, Record<string, unknown>][] => {
    const actionId = asString(action.action_id);
    return actionId ? [[actionId, action]] : [];
  }));
  const settingsControlCenter = asRecord(appState.settings_control_center);
  const codexPersonalization = asRecord(appState.codex_personalization);
  const { gatewayAccount, settingsProjection } = deriveWorkbenchSettingsProjection({
    coreCodex,
    settingsControlCenter,
    codexPersonalization,
    actionRecords
  });

  const moduleItems = asRecordArray(modules?.items);
  const taskDrilldowns = asRecordArray(workbench?.task_drilldowns);
  const workItemRuntime = readWorkItemRuntimeProjection(workbench?.work_item_projection_v2);
  const settingsTaskEntries = asRecordArray(settingsControlCenter?.task_entries);
  const settingsSections = asRecordArray(settingsControlCenter?.action_sections);
  const safeActionRoutes = asRecordArray(workbench?.safe_action_routes);
  const currentOwnerDelta = asRecord(workbench?.current_owner_delta);
  const currentOwnerDeltaNextAction = asRecord(workbench?.current_owner_delta_next_action);
  const meta = asRecord(appState.meta);

  const contextSources = deriveWorkbenchContextSources({
    runtimeSource,
    settingsSections,
    moduleItems,
    taskDrilldowns
  });
  const { baseActions, actionMap } = deriveWorkbenchActionProjection({
    actions,
    settingsTaskEntries,
    safeActionRoutes
  });
  const localEnvironment = asRecord(asRecord(settingsControlCenter?.app_settings_read_model)?.local_environment);
  const runtimeOverview = deriveWorkbenchRuntimeOverview({
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
  });

  const canonicalPackageProjection = asRecord(appState.agent_packages);
  const taskProjection = deriveWorkbenchTaskProjection({
    taskDrilldowns,
    currentOwnerDelta,
    actionMap,
    settingsTaskEntries,
    canonicalPackageProjection,
    homeAgentShortcuts: appState.home_agent_shortcuts,
    moduleItems,
    fallback: {
      packageLifecycle: fallback.packageLifecycle,
      deliverables: fallback.deliverables,
      receipts: fallback.receipts
    }
  });
  const {
    packageLifecycle,
    contextActions,
    deliverables,
    receipts,
    artifactPreviews,
    actionReceipts,
    leadTask,
    leadTaskTitle,
    leadAcceptedShapes
  } = taskProjection;

  const starters = deriveWorkbenchStarters({
    starters: fallback.starters,
    moduleItems,
    taskDrilldowns,
    actionMap,
    contextActions
  });

  const runtimeStatus = asString(asRecord(operator?.summary)?.runtime_status)
    ?? asString(asRecord(operator?.summary)?.provider_status)
    ?? asString(currentOwnerDeltaNextAction?.action_kind)
    ?? asString(asRecord(appState.provider)?.status)
    ?? "unknown";

  const effectiveContextSources = contextSources.length ? contextSources : fallback.contextSources;
  const sourceRefs = effectiveContextSources.map((source) => source.ref);
  const previewAction = firstPreviewAction(contextActions);
  const deliveryPackages: DeliveryPackage[] = (deliverables.length || receipts.length || contextActions.length) ? [
    {
      id: "delivery-package",
      title: "Delivery package",
      status: deliverables.length || receipts.length ? "needs_review" : "blocked",
      summary: "Derived from live App action refs, operator task drilldowns, receipt refs, and runtime status; artifact bodies stay source-owned.",
      previewActionId: previewAction?.id,
      deliverableRefs: deliverables.map((item) => item.ref),
      receiptRefs: receipts.map((item) => item.ref),
      sourceRefs,
      runtimeStatus,
      authorityBoundary: "Refs-only delivery context; no artifact body, owner receipt, domain truth, or release authority."
    }
  ] : fallback.deliveryPackages;

  const leadTaskNextStep = compactText(leadTask?.next_visible_step, "Review current App refs before execution.");
  const confirmations: ConfirmationCard[] = previewAction ? [{
    id: `confirm-${previewAction.id}`,
    title: `Preview ${leadTaskTitle} package`,
    question: `Preview ${previewAction.label} for ${leadTaskTitle} as a refs-only delivery package?`,
    risks: [`Runtime status: ${runtimeStatus}`, leadTaskNextStep, "needs_human_confirmation"],
    willChange: [`Create dry-run request for ${previewAction.id}`, "Attach current App state refs"],
    willNotChange: ["No domain artifact body is written", "No owner receipt or release claim is created"],
    receipt: "Preview receipt from opl app action execute --dry-run",
    rollback: "Discard the candidate packet request before explicit execution",
    dryRunAction: previewAction.id
  }] : [];

  const questions = leadTask ? [
    {
      id: "question-owner-shape",
      question: compactText(currentOwnerDelta?.desired_delta_description, leadTaskNextStep),
      whyItMatters: compactText(currentOwnerDeltaNextAction?.action_kind, "Current owner delta defines the next legal answer shape."),
      answerType: leadAcceptedShapes.join(", ") || "typed owner answer"
    },
    {
      id: "question-review-receipt",
      question: `Which receipt ref should stay attached to ${leadTaskTitle}?`,
      whyItMatters: "Review receipts stay refs-only and do not transfer domain authority.",
      answerType: "receipt ref"
    },
    {
      id: "question-package-export",
      question: "Which export bundle ref should be previewed next?",
      whyItMatters: "Export bundle previews remain App-owned dry-run refs, not artifact bodies.",
      answerType: "export bundle ref"
    }
  ] : [];

  const contextTrace = [
    { id: "profile", label: "Profile", value: `${asString(meta?.profile) ?? "fast"} | ${formatTimestamp(meta?.generated_at) ?? "no timestamp"}` },
    { id: "owner", label: "Owner route", value: `${asString(currentOwnerDelta?.owner) ?? asString(workbench?.operator_next_action_owner) ?? "unknown"} -> ${asString(currentOwnerDeltaNextAction?.action_kind) ?? asString(workbench?.operator_next_action_kind) ?? "unknown next action"}` },
    { id: "runtime", label: "Runtime", value: `${asString(asRecord(operator?.summary)?.runtime_status) ?? "unknown"} | provider ${asString(asRecord(operator?.summary)?.provider_status) ?? "unknown"}` },
    { id: "boundary", label: "Boundary", value: `${asString(runtimeSource?.owner) ?? "opl_framework"} via ${asString(runtimeSource?.app_repo_truth_owner) ?? "one-person-lab-app"} | refs only` },
    { id: "hard-gate", label: "Hard gate", value: `${asString(asRecord(currentOwnerDelta?.hard_gate)?.state) ?? "unknown"}${leadAcceptedShapes.length ? ` | return ${leadAcceptedShapes.join(", ")}` : ""}` },
    { id: "task", label: "Lead task", value: `${leadTaskTitle} | ${compactText(leadTask?.next_visible_step, "Review current refs", 72)}` }
  ].filter((item) => item.value);

  const sessions = taskDrilldowns.length
    ? taskDrilldowns.slice(0, 3).map((task): WorkspaceSession => ({
        id: asString(task.task_id) ?? `session-${Math.random()}`,
        workspace: `${asString(task.domain_label) ?? "OPL"}${asString(task.workspace_label) ? ` / ${asString(task.workspace_label)}` : ""}`,
        session: `${asString(task.title) ?? asString(task.task_id) ?? "Delivery review"}${asString(task.active_stage_label) ? ` · ${asString(task.active_stage_label)}` : ""}`,
        status: `${asString(task.status) ?? asString(task.state) ?? "candidate_surface_only"}${asString(task.priority_bucket) ? ` · ${asString(task.priority_bucket)}` : ""}`,
        nextStep: compactText(task.next_visible_step, "Review current refs")
      }))
    : fallback.sessions;

  const derivedActiveProjectLines = taskDrilldowns.length ? taskDrilldowns.slice(0, 6).map((task): ActiveProjectLine => ({
    status: asString(task.status) ?? asString(task.state) ?? "unknown",
    activeRunId: asString(task.active_run_id),
    nextVisibleStep: compactText(task.next_visible_step, "Review current refs"),
    progressDeltaClassification: asString(task.priority_bucket) ?? asString(asRecord(task.progress)?.status) ?? "platform_or_observability_delta",
    deliverableProgressDelta: asString(asRecord(task.artifact_or_blocker)?.content_policy) ?? "refs_only_no_artifact_body",
    platformRepairDelta: asString(task.runtime_attempt_status) ?? "none",
    nextForcedDelta: asString(asRecord(task.review_receipt)?.next_action) ?? asString(currentOwnerDeltaNextAction?.action_kind) ?? "owner adoption gate"
  })) : pickActiveProjectLines(appState.active_project_lines, fallback.activeProjectLines);

  return {
    ...fallback,
    features: deriveFeatureRefs(state, baseActions),
    sessions,
    results: buildResultsFromTasks(taskDrilldowns),
    deliverables,
    receipts,
    artifactPreviews,
    deliveryPackages,
    actionReceipts,
    packageLifecycle,
    officialProfileRestore: actionMap.get("official_profile_restore"),
    starters,
    confirmations,
    questions,
    activeProjectLines: derivedActiveProjectLines,
    contextSources: effectiveContextSources,
    contextActions: contextActions.length ? contextActions : fallback.contextActions,
    contextTrace: contextTrace.length ? contextTrace : fallback.contextTrace,
    gatewayAccount,
    settingsProjection,
    applicationManagement: readApplicationManagementProjection(appState.application_management),
    runtimeOverview,
    serviceRecovery: deriveServiceRecoveryModel({ temporal, actions, stateFresh: true }),
    workItemRuntime,
    managedCompanions: readManagedCompanions(appState),
    uiContributions: readUiContributionsProjection(state),
    stateGeneratedAt: asString(meta?.generated_at) ?? fallback.stateGeneratedAt
  };
}
