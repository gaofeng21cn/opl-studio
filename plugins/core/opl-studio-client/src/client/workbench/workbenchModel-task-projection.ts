import type {
  ActionReceiptSummary,
  AgentPackageLifecycleRef,
  ArtifactPreview,
  WorkbenchActionRef,
  WorkbenchArtifactRef
} from "./workbenchModel-contracts";
import {
  asRecord,
  asRecordArray,
  asString,
  asStringArray
} from "./workbenchModel-primitives";
import {
  actionStatus,
  artifactPreviewFromItem,
  artifactStatus,
  compactRef,
  compactText,
  ensureDryRunJsonRoute,
  extractActionId,
  formatTimestamp,
  isDeliveryAction,
  isReceiptAction,
  previewField,
  previewKindFromRef,
  taskAcceptedShapes,
  uniqueByRef,
  uniqueStrings,
  usageSummary
} from "./workbenchModel-presentation";
import {
  canonicalSummaryRow,
  legacyPackageRowsFromModules,
  packageLifecycleItem,
  packageRowsFromCanonicalProjection
} from "./workbenchModel-package-lifecycle";
import { rendererModuleIdForPreviewKind } from "../renderers/moduleRegistry";

export type WorkbenchTaskProjectionInput = {
  taskDrilldowns: Record<string, unknown>[];
  currentOwnerDelta: Record<string, unknown> | null;
  actionMap: Map<string, WorkbenchActionRef>;
  settingsTaskEntries: Record<string, unknown>[];
  canonicalPackageProjection: Record<string, unknown> | null;
  homeAgentShortcuts: unknown;
  moduleItems: Record<string, unknown>[];
  fallback: {
    packageLifecycle: AgentPackageLifecycleRef[];
    deliverables: WorkbenchArtifactRef[];
    receipts: WorkbenchArtifactRef[];
  };
};

type LeadTaskProjection = {
  leadTask: Record<string, unknown> | null;
  leadTaskTitle: string;
  currentOwnerDelta: Record<string, unknown> | null;
  leadArtifact: Record<string, unknown> | null;
  leadActionReceipt: Record<string, unknown> | null;
  leadActionId: string | null;
  leadActionRoute: string | null;
  leadExportActionId: string | null;
  leadExportRoute: string | null;
  leadStageRun: Record<string, unknown> | null;
  leadAcceptedShapes: string[];
  leadUsageSummary: string | null;
  leadTaskTotalUsage: string | null;
  leadTraceSteps: string[];
};

export type WorkbenchTaskProjectionResult = LeadTaskProjection & {
  packageLifecycle: AgentPackageLifecycleRef[];
  contextActions: WorkbenchActionRef[];
  deliverables: WorkbenchArtifactRef[];
  receipts: WorkbenchArtifactRef[];
  artifactPreviews: ArtifactPreview[];
  actionReceipts: ActionReceiptSummary[];
};

function derivePackageLifecycle(
  canonicalPackageProjection: Record<string, unknown> | null,
  homeAgentShortcuts: unknown,
  moduleItems: Record<string, unknown>[],
  actionMap: Map<string, WorkbenchActionRef>,
  fallback: AgentPackageLifecycleRef[]
): AgentPackageLifecycleRef[] {
  const canonicalPackageRows = packageRowsFromCanonicalProjection(canonicalPackageProjection, {
    agent_packages: canonicalPackageProjection,
    home_agent_shortcuts: homeAgentShortcuts
  });
  const canonicalPackageItems = canonicalPackageRows.length
    ? canonicalPackageRows
    : canonicalPackageProjection
      ? [canonicalSummaryRow(canonicalPackageProjection)]
      : [];
  return canonicalPackageItems.length
    ? canonicalPackageItems.map((item) => packageLifecycleItem(item, actionMap, "canonical_agent_packages"))
    : moduleItems.length
      ? legacyPackageRowsFromModules(moduleItems).map((item) => packageLifecycleItem(item, actionMap, "legacy_modules_fallback"))
      : fallback;
}

function deriveTaskContextActions(
  taskDrilldowns: Record<string, unknown>[],
  settingsTaskEntries: Record<string, unknown>[],
  actionMap: Map<string, WorkbenchActionRef>
): WorkbenchActionRef[] {
  const priorityActionIds = uniqueByRef(taskDrilldowns.flatMap((task) => {
    const actionReceipt = asRecord(task.action_receipt);
    const taskActionId = asString(actionReceipt?.action_id);
    const exportActionId = asString(actionReceipt?.export_bundle_action_id)
      ?? extractActionId(asRecord(task.artifact_or_blocker)?.export_bundle_action_ref);
    return [taskActionId, exportActionId].filter((item): item is string => Boolean(item)).map((id) => ({
      id,
      ref: id
    }));
  }).concat(
    settingsTaskEntries
      .filter((entry) => ["workspace", "capabilities", "packages", "model_access"].includes(asString(entry.section_id) ?? ""))
      .map((entry) => ({ id: asString(entry.action_id) ?? asString(entry.task_id) ?? "", ref: asString(entry.action_id) ?? asString(entry.task_id) ?? "" })),
    [
      { id: "workspace_ensure", ref: "workspace_ensure" },
      { id: "settings_sync_capabilities", ref: "settings_sync_capabilities" },
      { id: "task_action_receipt_preview", ref: "task_action_receipt_preview" },
      { id: "task_export_bundle_preview", ref: "task_export_bundle_preview" }
    ]
  )).map((item) => item.id);
  return uniqueByRef([
    ...priorityActionIds.map((id) => actionMap.get(id)).filter((item): item is WorkbenchActionRef => Boolean(item)),
    ...Array.from(actionMap.values())
      .filter((action) => action.dryRunSupported && (isDeliveryAction(action) || isReceiptAction(action)))
      .slice(0, 8)
  ]);
}

function deriveTaskArtifacts(
  taskDrilldowns: Record<string, unknown>[],
  fallback: WorkbenchTaskProjectionInput["fallback"]
): { deliverables: WorkbenchArtifactRef[]; receipts: WorkbenchArtifactRef[] } {
  const taskDeliverables = taskDrilldowns.flatMap((task) => {
    const taskId = asString(task.task_id);
    const title = asString(task.title);
    const artifact = asRecord(task.artifact_or_blocker);
    const workflowRefs = asRecord(task.workflow_refs);
    if (!taskId || !title || !artifact) return [];
    const refs = [
      {
        id: `deliverable-${taskId}-canonical`,
        title: `${title} canonical ref`,
        ref: asString(artifact.canonical_ref),
        summary: compactText(artifact.content_policy, "Refs-only canonical artifact ref."),
        previewKind: previewKindFromRef(asString(artifact.canonical_ref) ?? title, asString(artifact.content_policy) ?? title)
      },
      {
        id: `deliverable-${taskId}-export`,
        title: `${title} export ref`,
        ref: asString(artifact.export_ref),
        summary: compactText(task.next_visible_step, "Export ref derived from operator workbench."),
        previewKind: previewKindFromRef(asString(artifact.export_ref) ?? title, asString(task.next_visible_step) ?? title)
      },
      {
        id: `deliverable-${taskId}-workflow`,
        title: `${title} workflow ref`,
        ref: asString(workflowRefs?.current_workflow_ref),
        summary: compactText(workflowRefs?.content_policy, "Workflow ref only."),
        previewKind: previewKindFromRef(asString(workflowRefs?.current_workflow_ref) ?? title, asString(workflowRefs?.content_policy) ?? title)
      }
    ];
    return refs
      .filter((item) => item.ref)
      .map((item): WorkbenchArtifactRef => ({
        id: item.id,
        title: item.title,
        kind: "deliverable",
        status: artifactStatus(
          artifact.status ?? artifact.canonical_status ?? artifact.export_status,
          "app_canonical"
        ),
        previewKind: item.previewKind,
        ref: item.ref!,
        summary: item.summary,
        provenance: [
          asString(task.workspace_path),
          asString(artifact.lineage_ref),
          asString(artifact.conformance_ref)
        ].filter((value): value is string => Boolean(value)),
        actions: ["Preview ref", "Attach receipt ref"]
      }));
  });
  const deliverables = taskDeliverables.length ? uniqueByRef(taskDeliverables).slice(0, 6) : fallback.deliverables;

  const taskReceipts = taskDrilldowns.flatMap((task) => {
    const taskId = asString(task.task_id);
    const title = asString(task.title);
    const actionReceipt = asRecord(task.action_receipt);
    const reviewReceipt = asRecord(task.review_receipt);
    const artifact = asRecord(task.artifact_or_blocker);
    if (!taskId || !title) return [];
    const items = [
      {
        id: `receipt-${taskId}-action`,
        title: `${title} action preview`,
        ref: asString(actionReceipt?.preview_ref),
        summary: compactText(actionReceipt?.content_policy, "Dry-run action receipt ref."),
        status: actionReceipt?.preview_ref ? "needs_review" : "blocked"
      },
      {
        id: `receipt-${taskId}-review`,
        title: `${title} review receipt`,
        ref: asString(reviewReceipt?.receipt_ref),
        summary: compactText(reviewReceipt?.authority_policy, "Review receipt summary ref."),
        status: artifactStatus(reviewReceipt?.status ?? task.status ?? task.state)
      },
      {
        id: `receipt-${taskId}-artifact`,
        title: `${title} artifact receipt`,
        ref: asString(artifact?.receipt_ref),
        summary: compactText(artifact?.content_policy, "Artifact receipt ref only."),
        status: artifactStatus(
          artifact?.status ?? artifact?.receipt_status ?? artifact?.canonical_status,
          "app_canonical"
        )
      }
    ];
    return items
      .filter((item) => item.ref)
      .map((item): WorkbenchArtifactRef => ({
        id: item.id,
        title: item.title,
        kind: "receipt",
        status: item.status as WorkbenchArtifactRef["status"],
        previewKind: "code",
        ref: item.ref!,
        summary: item.summary,
        provenance: [
          asString(task.runtime_readback_source),
          asString(task.workspace_path),
          asString(reviewReceipt?.check_ref)
        ].filter((value): value is string => Boolean(value)),
        actions: ["Preview receipt", "Compare refs"]
      }));
  });
  const receipts = taskReceipts.length ? uniqueByRef(taskReceipts).slice(0, 6) : fallback.receipts;
  return { deliverables, receipts };
}

function deriveLeadTaskProjection(
  taskDrilldowns: Record<string, unknown>[],
  currentOwnerDelta: Record<string, unknown> | null
): LeadTaskProjection {
  const leadTask = taskDrilldowns[0] ?? null;
  const leadTaskTitle = asString(leadTask?.title) ?? "Current task";
  const leadArtifact = asRecord(leadTask?.artifact_or_blocker);
  const leadActionReceipt = asRecord(leadTask?.action_receipt);
  const leadActionId = asString(leadActionReceipt?.action_id);
  const leadActionRoute = asString(leadActionReceipt?.route);
  const leadExportActionId = asString(leadActionReceipt?.export_bundle_action_id);
  const leadExportRoute = asString(leadActionReceipt?.export_bundle_route);
  const leadStageRun = asRecord(leadTask?.stage_run_cockpit_summary)
    ?? asRecord(leadTask?.stage_run_current_owner_delta)
    ?? asRecord(leadTask?.stage_run_cockpit);
  const leadAcceptedShapes = taskAcceptedShapes(leadTask ?? {}, currentOwnerDelta);
  const leadUsageSummary = usageSummary(asRecord(leadTask?.current_stage_usage));
  const leadTaskTotalUsage = usageSummary(asRecord(leadTask?.task_total_usage));
  const leadTraceSteps = uniqueStrings([
    leadTaskTitle,
    asString(leadTask?.active_stage_label) ?? asString(leadTask?.active_stage_id),
    asString(leadTask?.status_label) ?? asString(leadTask?.status),
    asString(currentOwnerDelta?.owner) ?? asString(leadStageRun?.current_owner),
    compactText(leadTask?.next_visible_step, "Review current refs before execution.", 88),
    leadAcceptedShapes.length ? `Return ${leadAcceptedShapes.join(" | ")}` : null
  ]);
  return {
    leadTask,
    leadTaskTitle,
    currentOwnerDelta,
    leadArtifact,
    leadActionReceipt,
    leadActionId,
    leadActionRoute,
    leadExportActionId,
    leadExportRoute,
    leadStageRun,
    leadAcceptedShapes,
    leadUsageSummary,
    leadTaskTotalUsage,
    leadTraceSteps
  };
}

function leadSummaryPreview(lead: LeadTaskProjection): ArtifactPreview {
  const { leadTask, leadTaskTitle, leadArtifact, leadStageRun, leadAcceptedShapes, leadUsageSummary, leadTaskTotalUsage, currentOwnerDelta } = lead;
  return {
    id: `preview-summary-${asString(leadTask?.task_id) ?? "current"}`,
    label: "Summary",
    previewKind: "markdown",
    rendererModuleId: rendererModuleIdForPreviewKind("markdown"),
    title: `${leadTaskTitle} workbench summary`,
    ref: asString(leadArtifact?.current_ref) ?? `opl://task/${asString(leadTask?.task_id) ?? "current"}`,
    summary: compactText(leadTask?.next_visible_step, "Task-derived summary preview."),
    content: [
      `### ${leadTaskTitle}`,
      "",
      compactText(leadTask?.next_visible_step, "Review current refs before execution."),
      "",
      "#### Workbench reading",
      `- Status: ${(asString(leadTask?.status_label) ?? asString(leadTask?.status) ?? "unknown").replaceAll("_", " ")}`,
      `- Owner: ${asString(currentOwnerDelta?.owner) ?? asString(leadStageRun?.current_owner) ?? "unknown"}`,
      `- Stage: ${asString(leadTask?.active_stage_label) ?? asString(leadTask?.active_stage_id) ?? "unknown"}`,
      `- Runtime source: ${asString(leadTask?.runtime_readback_source) ?? "unknown"}`,
      ...(leadAcceptedShapes.length ? [`- Required return: ${leadAcceptedShapes.join(", ")}`] : []),
      ...(leadUsageSummary ? [`- Stage usage: ${leadUsageSummary}`] : []),
      ...(leadTaskTotalUsage ? [`- Task usage: ${leadTaskTotalUsage}`] : [])
    ].join("\n"),
    fields: [
      previewField("Task", asString(leadTask?.task_id)),
      previewField("Primary state", asString(leadTask?.primary_state_label) ?? asString(leadTask?.primary_state)),
      previewField("Automation", asString(leadTask?.automation_state_label) ?? asString(leadTask?.automation_state)),
      previewField("Last heartbeat", formatTimestamp(leadTask?.last_heartbeat_at)),
      previewField("Last progress", formatTimestamp(leadTask?.last_progress_at))
    ].filter((item): item is { label: string; value: string } => Boolean(item)),
    bullets: uniqueStrings([
      asString(leadTask?.typed_blocker_summary),
      asString(leadTask?.resolution_route),
      asString(leadStageRun?.running_proof_summary)
    ]),
    sourceRefs: uniqueStrings([
      asString(leadArtifact?.current_ref),
      asString(leadTask?.workspace_path),
      asString(leadTask?.gateway_status_ref),
      asString(leadStageRun?.typed_blocker_resolution_ref)
    ]),
    authorityBoundary: "Summary projection only; task truth, receipts, and artifact bodies remain source-owned."
  };
}

function leadReceiptPreview(lead: LeadTaskProjection): ArtifactPreview {
  const { leadTask, leadArtifact, leadActionReceipt, leadActionId, leadActionRoute, leadExportActionId, leadExportRoute, leadAcceptedShapes } = lead;
  return {
    id: `preview-receipt-${asString(leadTask?.task_id) ?? "current"}`,
    label: "Receipt",
    previewKind: "json",
    rendererModuleId: rendererModuleIdForPreviewKind("json"),
    title: `${asString(leadTask?.title) ?? "Current task"} action receipt envelope`,
    ref: asString(leadActionReceipt?.preview_ref) ?? (leadActionRoute ? ensureDryRunJsonRoute(leadActionRoute) : `opl://task/${asString(leadTask?.task_id) ?? "current"}/receipt-preview-unavailable`),
    summary: compactText(leadActionReceipt?.content_policy, "Structured preview receipt metadata."),
    content: JSON.stringify({
      task_id: asString(leadTask?.task_id),
      action_id: leadActionId,
      preview_ref: asString(leadActionReceipt?.preview_ref),
      dry_run_route: leadActionRoute ? ensureDryRunJsonRoute(leadActionRoute) : null,
      export_bundle_action_id: leadExportActionId,
      export_bundle_route: leadExportRoute ? ensureDryRunJsonRoute(leadExportRoute) : null,
      export_bundle_ref: asStringArray(leadArtifact?.export_bundle_refs)[0] ?? asString(leadArtifact?.export_ref),
      content_policy: asString(leadActionReceipt?.content_policy) ?? "refs_only_no_action_receipt_body",
      required_return_shapes: leadAcceptedShapes
    }, null, 2),
    fields: [
      previewField("Action", leadActionId),
      previewField("Export action", leadExportActionId),
      previewField("Payload", "task_id, action_ref"),
      previewField("Boundary", asString(leadActionReceipt?.content_policy) ?? "refs_only_no_action_receipt_body")
    ].filter((item): item is { label: string; value: string } => Boolean(item)),
    bullets: [
      "Dry-run preview route only; no action receipt body is transferred into the renderer.",
      "Use the preview ref and export bundle ref together when preparing a confirmable action."
    ],
    sourceRefs: uniqueStrings([
      asString(leadActionReceipt?.preview_ref),
      asString(leadArtifact?.export_bundle_action_ref),
      asStringArray(leadArtifact?.export_bundle_refs)[0],
      asString(leadArtifact?.receipt_ref)
    ]),
    authorityBoundary: "Receipt envelope only; execute, owner receipt, and rollback truth remain outside the shell."
  };
}

function leadTracePreview(lead: LeadTaskProjection): ArtifactPreview {
  const { leadTask, leadTaskTitle, leadArtifact, leadStageRun, leadAcceptedShapes, leadTraceSteps, currentOwnerDelta } = lead;
  return {
    id: `preview-trace-${asString(leadTask?.task_id) ?? "current"}`,
    label: "Trace",
    previewKind: "mermaid",
    rendererModuleId: rendererModuleIdForPreviewKind("mermaid"),
    title: `${leadTaskTitle} owner-route trace`,
    ref: asString(leadStageRun?.source_ref) ?? asString(leadArtifact?.current_ref) ?? `opl://task/${asString(leadTask?.task_id) ?? "current"}/trace`,
    summary: compactText(asString(currentOwnerDelta?.desired_delta_description) ?? asString(leadTask?.resolution_route), "Owner-route trace derived from App state."),
    fields: [
      previewField("Current owner", asString(currentOwnerDelta?.owner) ?? asString(leadStageRun?.current_owner)),
      previewField("Hard gate", asString(asRecord(currentOwnerDelta?.hard_gate)?.state)),
      previewField("Next safe action", asString(leadStageRun?.next_safe_action_ref)),
      previewField("Runtime", asString(leadTask?.runtime_attempt_status))
    ].filter((item): item is { label: string; value: string } => Boolean(item)),
    bullets: uniqueStrings([
      asString(currentOwnerDelta?.desired_delta_description),
      asString(leadStageRun?.resolution_route),
      asString(leadTask?.typed_blocker_summary)
    ]),
    sourceRefs: uniqueStrings([
      asString(leadStageRun?.source_ref),
      asString(leadStageRun?.typed_blocker_resolution_ref),
      asString(leadTask?.gateway_status_ref)
    ]),
    traceSteps: leadTraceSteps,
    authorityBoundary: "Trace projection only; stage transition still requires owner receipt or typed blocker."
  };
}

function leadManifestPreview(lead: LeadTaskProjection): ArtifactPreview {
  const { leadTask, leadTaskTitle, leadArtifact } = lead;
  return {
    id: `preview-manifest-${asString(leadTask?.task_id) ?? "current"}`,
    label: "Manifest",
    previewKind: "code",
    rendererModuleId: rendererModuleIdForPreviewKind("code"),
    title: `${leadTaskTitle} deliverable manifest`,
    ref: asStringArray(leadArtifact?.export_bundle_refs)[0] ?? asString(leadArtifact?.export_ref) ?? asString(leadArtifact?.canonical_ref) ?? `opl://task/${asString(leadTask?.task_id) ?? "current"}/deliverable`,
    summary: compactText(leadArtifact?.content_policy, "Manifest-style delivery projection from refs."),
    content: [
      "export const workbenchDeliveryProjection = {",
      `  taskId: ${JSON.stringify(asString(leadTask?.task_id) ?? null)},`,
      `  title: ${JSON.stringify(leadTaskTitle)},`,
      `  currentRef: ${JSON.stringify(asString(leadArtifact?.current_ref) ?? null)},`,
      `  canonicalRef: ${JSON.stringify(asString(leadArtifact?.canonical_ref) ?? null)},`,
      `  exportRef: ${JSON.stringify(asString(leadArtifact?.export_ref) ?? null)},`,
      `  exportBundleRef: ${JSON.stringify(asStringArray(leadArtifact?.export_bundle_refs)[0] ?? null)},`,
      `  receiptRef: ${JSON.stringify(asString(leadArtifact?.receipt_ref) ?? null)},`,
      `  lineageRef: ${JSON.stringify(asString(leadArtifact?.lineage_ref) ?? null)},`,
      `  conformanceRef: ${JSON.stringify(asString(leadArtifact?.conformance_ref) ?? null)},`,
      `  sourceRefCount: ${JSON.stringify(leadTask?.source_ref_count ?? null)},`,
      `  safeActionRefCount: ${JSON.stringify(leadTask?.safe_action_ref_count ?? null)},`,
      '  authorityBoundary: "refs_only_no_artifact_body"',
      "};"
    ].join("\n"),
    fields: [
      previewField("Current ref", compactRef(asString(leadArtifact?.current_ref) ?? "")),
      previewField("Export bundle", compactRef(asStringArray(leadArtifact?.export_bundle_refs)[0] ?? asString(leadArtifact?.export_ref) ?? "")),
      previewField("Lineage", compactRef(asString(leadArtifact?.lineage_ref) ?? "")),
      previewField("Conformance", compactRef(asString(leadArtifact?.conformance_ref) ?? ""))
    ].filter((item): item is { label: string; value: string } => Boolean(item)),
    bullets: [
      "This is a manifest-style projection for export/readback, not an owned artifact body.",
      "Conformance and lineage stay as refs so the workbench can show delivery context without copying truth."
    ],
    sourceRefs: uniqueStrings([
      asString(leadArtifact?.current_ref),
      asString(leadArtifact?.canonical_ref),
      asStringArray(leadArtifact?.export_bundle_refs)[0],
      asString(leadArtifact?.lineage_ref),
      asString(leadArtifact?.conformance_ref)
    ]),
    authorityBoundary: "Manifest projection only; artifact bytes and release authority remain external."
  };
}

function deriveLeadArtifactPreviews(lead: LeadTaskProjection): ArtifactPreview[] {
  if (!lead.leadTask) return [];
  return [
    leadSummaryPreview(lead),
    leadReceiptPreview(lead),
    leadTracePreview(lead),
    leadManifestPreview(lead)
  ];
}

function deriveActionReceipts(
  taskDrilldowns: Record<string, unknown>[],
  currentOwnerDelta: Record<string, unknown> | null,
  contextActions: WorkbenchActionRef[]
): ActionReceiptSummary[] {
  const taskReceiptSummaries = taskDrilldowns.flatMap((task) => {
    const taskId = asString(task.task_id);
    const title = asString(task.title);
    const actionReceipt = asRecord(task.action_receipt);
    const artifact = asRecord(task.artifact_or_blocker);
    const acceptedShapes = taskAcceptedShapes(task, currentOwnerDelta);
    if (!taskId || !title || !actionReceipt) return [];
    const actionId = asString(actionReceipt.action_id);
    const actionRoute = asString(actionReceipt.route);
    const exportActionId = asString(actionReceipt.export_bundle_action_id);
    const exportRoute = asString(actionReceipt.export_bundle_route);
    const exportBundleRef = asStringArray(artifact?.export_bundle_refs)[0];
    return [
      ...(actionId && actionRoute ? [{
        id: `action-receipt-${taskId}`,
        title: `${title} receipt preview`,
        actionId,
        route: ensureDryRunJsonRoute(actionRoute),
        status: "payload_required" as const,
        mutates: "none_read_only",
        receiptRef: asString(actionReceipt.preview_ref) ?? `receipt://${taskId}/preview`,
        summary: compactText(task.next_visible_step, "Task preview receipt derived from operator workbench."),
        payloadFields: ["task_id", "action_ref"],
        owner: asString(task.typed_blocker_owner) ?? asString(currentOwnerDelta?.owner) ?? asString(task.domain_id) ?? undefined,
        authorityBoundary: "Task receipt preview only; no domain execution or owner receipt is implied.",
        sourceRefs: uniqueStrings([
          asString(actionReceipt.preview_ref),
          asString(artifact?.current_ref),
          asString(task.workspace_path)
        ]),
        checks: uniqueStrings([
          "Bind task_id and action_ref before previewing the receipt.",
          acceptedShapes.length ? `Accepted return shapes: ${acceptedShapes.join(", ")}` : null
        ])
      }] : []),
      ...(exportActionId && exportRoute && exportBundleRef ? [{
        id: `action-export-${taskId}`,
        title: `${title} export bundle preview`,
        actionId: exportActionId,
        route: ensureDryRunJsonRoute(exportRoute),
        status: "payload_required" as const,
        mutates: "none_read_only",
        receiptRef: exportBundleRef,
        summary: compactText(artifact?.content_policy, "Export bundle preview uses refs only."),
        payloadFields: ["task_id", "export_bundle_ref"],
        owner: asString(task.domain_id) ?? undefined,
        authorityBoundary: "Export preview only; bundle contents remain source-owned.",
        sourceRefs: uniqueStrings([
          exportBundleRef,
          asString(artifact?.export_ref),
          asString(artifact?.conformance_ref)
        ]),
        checks: [
          "Confirm the export bundle ref is current before any execute step.",
          "Dry-run does not imply package-ready or owner acceptance."
        ]
      }] : [])
    ];
  });
  const genericReceiptSummaries = contextActions
    .filter((action) => action.dryRunSupported)
    .map((action): ActionReceiptSummary => ({
      id: `action-generic-${action.id}`,
      title: `${action.label} receipt preview`,
      actionId: action.id,
      route: ensureDryRunJsonRoute(action.route),
      status: actionStatus(action),
      mutates: action.mutates,
      receiptRef: `receipt://${action.id}/dry-run`,
      summary: action.payloadFields.length
        ? `Dry-run route exists; payload required: ${action.payloadFields.join(", ")}.`
        : "Dry-run route can preview a refs-only receipt without a domain artifact body.",
      payloadFields: action.payloadFields,
      owner: action.owner,
      authorityBoundary: "Generic action receipt preview only; submit/execute stays outside the renderer.",
      sourceRefs: uniqueStrings([ensureDryRunJsonRoute(action.route), action.delegatedSurface]),
      checks: uniqueStrings([
        action.payloadFields.length ? `Required payload: ${action.payloadFields.join(", ")}` : "No payload required for a preview receipt.",
        action.canSubmitToSafeActionShell ? "Safe-action shell can submit this preview lane." : "Safe-action shell submission is not declared for this route."
      ])
    }));
  return uniqueByRef([...taskReceiptSummaries, ...genericReceiptSummaries]).slice(0, 8);
}

export function deriveWorkbenchTaskProjection({
  taskDrilldowns,
  currentOwnerDelta,
  actionMap,
  settingsTaskEntries,
  canonicalPackageProjection,
  homeAgentShortcuts,
  moduleItems,
  fallback
}: WorkbenchTaskProjectionInput): WorkbenchTaskProjectionResult {
  const packageLifecycle = derivePackageLifecycle(canonicalPackageProjection, homeAgentShortcuts, moduleItems, actionMap, fallback.packageLifecycle);
  const contextActions = deriveTaskContextActions(taskDrilldowns, settingsTaskEntries, actionMap);
  const { deliverables, receipts } = deriveTaskArtifacts(taskDrilldowns, fallback);
  const lead = deriveLeadTaskProjection(taskDrilldowns, currentOwnerDelta);
  const leadPreviewCandidates = deriveLeadArtifactPreviews(lead);
  const genericArtifactPreviews = uniqueByRef([
    ...deliverables.map(artifactPreviewFromItem),
    ...receipts.map(artifactPreviewFromItem)
  ]);
  const artifactPreviews = uniqueByRef([...leadPreviewCandidates, ...genericArtifactPreviews]).slice(0, 6);
  const actionReceipts = deriveActionReceipts(taskDrilldowns, currentOwnerDelta, contextActions);
  return {
    packageLifecycle,
    contextActions,
    deliverables,
    receipts,
    artifactPreviews,
    actionReceipts,
    ...lead
  };
}
