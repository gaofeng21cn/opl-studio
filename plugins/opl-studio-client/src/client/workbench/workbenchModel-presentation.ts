import type {
  ActionReceiptSummary,
  ActiveProjectLine,
  ArtifactPreview,
  WorkbenchActionRef,
  WorkbenchArtifactRef,
  WorkbenchPreviewKind,
  WorkbenchSourceRef,
  WorkbenchStarter,
  WorkbenchStarterField
} from "./workbenchModel-contracts";
import { initialWorkbenchModel } from "./workbenchModel-contracts";
import {
  asBoolean,
  asFiniteNumber,
  asRecord,
  asRecordArray,
  asOptionalBoolean,
  asString,
  asStringArray,
  firstString
} from "./workbenchModel-primitives";
import { rendererModuleIdForPreviewKind } from "../renderers/moduleRegistry";

function uniqueByRef<T extends { ref?: string; route?: string; id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.ref ?? item.route ?? item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceRef(id: string, label: string, ref: unknown, summary: string): WorkbenchSourceRef | null {
  const value = asString(ref);
  return value ? { id, label, ref: value, summary } : null;
}

function actionText(action: WorkbenchActionRef): string {
  return `${action.id} ${action.label} ${action.route} ${action.delegatedSurface ?? ""}`.toLowerCase();
}

function previewKindFromText(value: string): WorkbenchPreviewKind {
  const text = value.toLowerCase();
  if (/pdf/.test(text)) return "pdf";
  if (/mermaid|diagram|flow/.test(text)) return "mermaid";
  if (/math|latex|katex|equation/.test(text)) return "math";
  if (/json|receipt|preview|diff|patch|code/.test(text)) return "code";
  if (/markdown|brief|review|result|handoff|summary|workflow|artifact|export/.test(text)) return "markdown";
  return "json";
}

function previewKindFromRef(ref: string, summary = ""): WorkbenchPreviewKind {
  return previewKindFromText(`${ref} ${summary}`);
}

function isDeliveryAction(action: WorkbenchActionRef): boolean {
  return /deliver|export|bundle|result|review|handoff|package/.test(actionText(action));
}

function isReceiptAction(action: WorkbenchActionRef): boolean {
  return /receipt|preview|dry.?run|export|bundle/.test(actionText(action));
}

function actionStatus(action: WorkbenchActionRef): ActionReceiptSummary["status"] {
  if (!action.dryRunSupported) return "unavailable";
  return action.payloadFields.length ? "payload_required" : "preview";
}

const starterPreviewRouteIds: Record<WorkbenchStarter["id"], string[]> = {
  // Source-marker contract: live starter actions are preview_route_not_domain_execution.
  mas: ["task_action_receipt_preview", "task_export_bundle_preview", "settings_sync_capabilities"],
  mag: ["task_export_bundle_preview", "task_action_receipt_preview", "settings_sync_capabilities"],
  rca: ["task_export_bundle_preview", "task_action_receipt_preview", "settings_sync_capabilities"],
  bookforge: ["workspace_ensure", "task_export_bundle_preview", "settings_sync_capabilities"]
};

function firstPreviewAction(actions: WorkbenchActionRef[]): WorkbenchActionRef | undefined {
  return actions.find((action) => action.dryRunSupported && isDeliveryAction(action))
    ?? actions.find((action) => action.dryRunSupported && action.payloadFields.length === 0)
    ?? actions.find((action) => action.dryRunSupported);
}

function moduleKey(value: string): WorkbenchStarter["id"] | null {
  const key = value.toLowerCase();
  if (key.includes("medautoscience") || key.includes("med auto science")) return "mas";
  if (key.includes("medautogrant") || key.includes("med auto grant")) return "mag";
  if (key.includes("redcube") || key.includes("redcube ai")) return "rca";
  if (key.includes("oplbookforge") || key.includes("opl book forge") || key.includes("bookforge")) return "bookforge";
  return null;
}

function starterPreviewAction(starter: WorkbenchStarter, actions: WorkbenchActionRef[]): WorkbenchActionRef | undefined {
  const exactIds = [`starter.${starter.id}`, `starter_${starter.id}`, `${starter.id}_starter`];
  const dedicated = actions.find((action) => action.dryRunSupported && exactIds.some((id) => action.id.includes(id)));
  if (dedicated) return dedicated;
  const routeIds = starterPreviewRouteIds[starter.id];
  return routeIds.map((id) => actions.find((action) => action.id === id && action.dryRunSupported)).find(Boolean);
}

function pickActiveProjectLines(value: unknown, fallback: ActiveProjectLine[]): ActiveProjectLine[] {
  const valueRecord = asRecord(value);
  const rawLines: unknown[] = Array.isArray(value)
    ? value
    : Array.isArray(valueRecord?.items)
      ? valueRecord.items
      : [];
  const lines = rawLines.map(asRecord).filter(Boolean).map((line): ActiveProjectLine => ({
    status: asString(line?.status) ?? "unknown",
    activeRunId: asString(line?.active_run_id) ?? asString(line?.activeRunId) ?? "",
    nextVisibleStep: asString(line?.next_visible_step) ?? asString(line?.nextVisibleStep) ?? "Review current refs",
    progressDeltaClassification: asString(line?.progress_delta_classification) ?? asString(line?.progressDeltaClassification) ?? "platform_or_observability_delta",
    deliverableProgressDelta: asString(line?.deliverable_progress_delta) ?? asString(line?.deliverableProgressDelta) ?? "refs visible",
    platformRepairDelta: asString(line?.platform_repair_delta) ?? asString(line?.platformRepairDelta) ?? "none",
    nextForcedDelta: asString(line?.next_forced_delta) ?? asString(line?.nextForcedDelta) ?? "owner adoption gate"
  })).filter((line) => line.status !== "candidate_preview_only" && !line.activeRunId?.startsWith("placeholder-"));
  return lines.length ? lines : fallback;
}

function pickAppState(state: unknown): Record<string, unknown> | null {
  const root = asRecord(state);
  return asRecord(root?.app_state) ?? root;
}

function compactText(value: unknown, fallback: string, max = 160): string {
  const text = asString(value)?.replace(/\s+/g, " ").trim() ?? fallback;
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function compactRef(value: string, max = 56): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function previewField(label: string, value: unknown): { label: string; value: string } | null {
  const text = asString(value);
  return text ? { label, value: text } : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function formatTimestamp(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  return text.replace("T", " ").replace(".000Z", "Z");
}

function usageSummary(usage: Record<string, unknown> | null): string | null {
  if (!usage) return null;
  const telemetry = asString(usage.telemetry_status) ?? "unknown";
  const calls = usage.api_call_count_observed ?? usage.observed_attempt_count;
  const duration = usage.duration_ms_observed;
  const sourceRefs = usage.source_ref_count;
  const parts = [
    `telemetry ${telemetry}`,
    typeof calls === "number" ? `${calls} calls` : null,
    typeof duration === "number" && duration > 0 ? `${duration} ms` : null,
    typeof sourceRefs === "number" ? `${sourceRefs} refs` : null
  ];
  return uniqueStrings(parts).join(" | ");
}

function taskAcceptedShapes(task: Record<string, unknown>, currentOwnerDelta: Record<string, unknown> | null): string[] {
  const stageRun = asRecord(task.stage_run_cockpit_summary) ?? asRecord(task.stage_run_current_owner_delta) ?? asRecord(task.stage_run_cockpit);
  return uniqueStrings([
    ...asStringArray(currentOwnerDelta?.accepted_answer_shape),
    ...asStringArray(stageRun?.accepted_return_shapes),
    ...asStringArray(stageRun?.required_return_shapes)
  ]);
}

function previewAuthorityBoundary(previewKind: WorkbenchPreviewKind, fallback = "Refs-only preview; body remains source-owned."): string {
  if (previewKind === "json") return "Structured receipt envelope only; no receipt body authority.";
  if (previewKind === "code") return "Manifest and patch-style projection only; no executable artifact body authority.";
  if (previewKind === "mermaid") return "Trace projection only; no workflow truth transfer.";
  if (previewKind === "pdf") return "Local export shell only; final file authority remains outside the workbench.";
  return fallback;
}

function artifactPreviewFromItem(item: WorkbenchArtifactRef): ArtifactPreview {
  return {
    id: item.id,
    label: item.kind === "receipt" ? "Receipt" : item.kind === "deliverable" ? "Deliverable" : item.title,
    previewKind: item.previewKind,
    rendererModuleId: rendererModuleIdForPreviewKind(item.previewKind),
    title: item.title,
    ref: item.ref,
    summary: item.summary,
    fields: [
      { label: "Kind", value: item.kind },
      { label: "Status", value: item.status.replaceAll("_", " ") },
      { label: "Primary ref", value: compactRef(item.ref) }
    ],
    bullets: item.actions,
    sourceRefs: uniqueStrings([item.ref, ...item.provenance]),
    authorityBoundary: previewAuthorityBoundary(item.previewKind)
  };
}

type ArtifactStatusSource = "derived" | "app_canonical";

const nonReadyBoundaryStatusPattern = /candidate|fallback|placeholder|simulat|preview|dry.?run|refs.?only|non.?live|no.?live|local.?draft/i;
const blockedStatusPattern = /blocked|dirty|error|attention|unavailable|failed|failure|timed.?out|missing/i;
const explicitReadyStatusPattern = /^(ready|succeeded|success|completed|complete)$/i;

function artifactStatus(value: unknown, source: ArtifactStatusSource = "derived"): WorkbenchArtifactRef["status"] {
  const text = (asString(value) ?? "").toLowerCase();
  if (blockedStatusPattern.test(text)) return "blocked";
  if (nonReadyBoundaryStatusPattern.test(text)) return "needs_review";
  if (source === "app_canonical" && explicitReadyStatusPattern.test(text)) return "ready";
  return "needs_review";
}

function fieldLabel(name: string): string {
  const labels: Record<string, string> = {
    task_id: "Task ID",
    action_ref: "Action ref",
    export_bundle_ref: "Export bundle ref",
    agent_id: "Agent ID",
    workspace_root_optional: "Workspace root",
    workspace_id: "Workspace ID",
    project_id: "Project ID",
    mode: "Mode",
    title: "Title"
  };
  return labels[name] ?? name.replace(/_/g, " ");
}

function fieldInput(name: string): WorkbenchStarterField["input"] {
  if (name === "mode") return "select";
  if (/ref|path|prompt|question|summary|note|description|title/.test(name)) return "textarea";
  return "text";
}

function fieldOptions(name: string): string[] | undefined {
  if (name === "mode") return ["existing", "create"];
  return undefined;
}

function ensureDryRunJsonRoute(route: string): string {
  const withDryRun = route.includes("--dry-run") ? route : `${route} --dry-run`;
  return withDryRun.includes("--json") ? withDryRun : `${withDryRun} --json`;
}

function extractActionId(ref: unknown): string | null {
  const value = asString(ref);
  if (!value) return null;
  const match = value.match(/#([A-Za-z0-9_.-]+)$/);
  return match?.[1] ?? null;
}

function firstStringField(record: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = asString(record[field]);
    if (value) return value;
    const values = asStringArray(record[field]);
    if (values[0]) return values[0];
  }
  return null;
}
function pickTaskKey(task: Record<string, unknown>): WorkbenchStarter["id"] | null {
  return moduleKey(
    `${asString(task.domain_id) ?? ""} ${asString(task.domain_label) ?? ""} ${asString(task.title) ?? ""}`
  );
}

function starterFieldValue(
  fieldName: string,
  task: Record<string, unknown> | null,
  moduleItem: Record<string, unknown> | null
): string {
  const actionReceipt = asRecord(task?.action_receipt);
  const artifact = asRecord(task?.artifact_or_blocker);
  const exportBundleRefs = asStringArray(artifact?.export_bundle_refs);
  if (fieldName === "task_id") return asString(task?.task_id) ?? asString(task?.domain_id) ?? "";
  if (fieldName === "action_ref") return asString(actionReceipt?.preview_ref) ?? "";
  if (fieldName === "export_bundle_ref") return exportBundleRefs[0] ?? asString(artifact?.export_ref) ?? "";
  if (fieldName === "agent_id") return asString(task?.domain_id) ?? asString(moduleItem?.module_id) ?? "";
  if (fieldName === "workspace_root_optional" || fieldName === "workspace_path") {
    return asString(task?.workspace_path) ?? asString(moduleItem?.checkout_path) ?? "";
  }
  if (fieldName === "workspace_id") return asString(task?.task_id) ?? asString(moduleItem?.module_id) ?? "";
  if (fieldName === "project_id") return asString(task?.task_id) ?? asString(moduleItem?.module_id) ?? "";
  if (fieldName === "mode") return "existing";
  if (fieldName === "title") return asString(task?.title) ?? asString(moduleItem?.label) ?? "";
  return asString(task?.title) ?? asString(moduleItem?.label) ?? "";
}

function buildStarterFields(
  starter: WorkbenchStarter,
  action: WorkbenchActionRef | undefined,
  task: Record<string, unknown> | null,
  moduleItem: Record<string, unknown> | null
): WorkbenchStarterField[] {
  if (!action?.payloadFields.length) return starter.fields;
  return action.payloadFields.map((name) => ({
    name,
    label: fieldLabel(name),
    input: fieldInput(name),
    value: starterFieldValue(name, task, moduleItem),
    options: fieldOptions(name)
  }));
}

function buildTaskSourceRefs(taskDrilldowns: Record<string, unknown>[]): WorkbenchSourceRef[] {
  return taskDrilldowns.flatMap((task) => {
    const taskId = asString(task.task_id) ?? "task";
    const title = asString(task.title) ?? taskId;
    const artifact = asRecord(task.artifact_or_blocker);
    const workflowRefs = asRecord(task.workflow_refs);
    const reviewReceipt = asRecord(task.review_receipt);
    const actionReceipt = asRecord(task.action_receipt);
    return [
      sourceRef(
        `task-${taskId}`,
        `${title} task`,
        artifact?.current_ref ?? workflowRefs?.current_workflow_ref ?? asString(task.workspace_path),
        compactText(task.next_visible_step, "Task status ref.")
      ),
      sourceRef(
        `workflow-${taskId}`,
        `${title} workflow`,
        workflowRefs?.current_workflow_ref ?? workflowRefs?.stage_workflow_ref,
        compactText(workflowRefs?.content_policy, "Refs-only workflow ref.")
      ),
      sourceRef(
        `review-${taskId}`,
        `${title} review receipt`,
        reviewReceipt?.receipt_ref,
        compactText(reviewReceipt?.authority_policy, "Reviewer receipt ref only.")
      ),
      sourceRef(
        `preview-${taskId}`,
        `${title} action preview`,
        actionReceipt?.preview_ref,
        compactText(actionReceipt?.content_policy, "Dry-run action preview ref.")
      )
    ].filter((item): item is WorkbenchSourceRef => Boolean(item));
  });
}

function buildResultsFromTasks(taskDrilldowns: Record<string, unknown>[]): WorkbenchArtifactRef[] {
  const items = taskDrilldowns.flatMap((task) => {
    const taskId = asString(task.task_id);
    const title = asString(task.title);
    const artifact = asRecord(task.artifact_or_blocker);
    const reviewReceipt = asRecord(task.review_receipt);
    const actionReceipt = asRecord(task.action_receipt);
    if (!taskId || !title) return [];
    return [
      {
        id: `result-${taskId}`,
        title: `${title} delta`,
        kind: "result" as const,
        status: artifactStatus(
          artifact?.status ?? artifact?.canonical_status ?? artifact?.export_status,
          "app_canonical"
        ),
        previewKind: previewKindFromRef(
          asString(artifact?.current_ref) ?? asString(artifact?.canonical_ref) ?? title,
          asString(task.next_visible_step) ?? title
        ),
        ref: asString(artifact?.current_ref) ?? asString(artifact?.canonical_ref) ?? `opl://task/${taskId}`,
        summary: compactText(task.next_visible_step, `${title} task status ref.`),
        provenance: [
          asString(task.workspace_path),
          asString(task.runtime_readback_source),
          asString(reviewReceipt?.receipt_ref)
        ].filter((item): item is string => Boolean(item)),
        actions: [
          asString(actionReceipt?.action_id) ? "Preview task receipt" : null,
          asString(reviewReceipt?.receipt_ref) ? "Open review receipt ref" : null
        ].filter((item): item is string => Boolean(item))
      }
    ];
  });
  return items.length ? items.slice(0, 6) : initialWorkbenchModel.results;
}

export {
  uniqueByRef,
  sourceRef,
  previewKindFromRef,
  isDeliveryAction,
  isReceiptAction,
  actionStatus,
  firstPreviewAction,
  moduleKey,
  starterPreviewAction,
  pickActiveProjectLines,
  pickAppState,
  compactText,
  compactRef,
  previewField,
  uniqueStrings,
  formatTimestamp,
  usageSummary,
  taskAcceptedShapes,
  artifactPreviewFromItem,
  artifactStatus,
  previewAuthorityBoundary,
  firstStringField,
  ensureDryRunJsonRoute,
  extractActionId,
  buildStarterFields,
  pickTaskKey,
  buildTaskSourceRefs,
  buildResultsFromTasks
};
