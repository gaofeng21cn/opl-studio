import type {
  WorkbenchActionRef,
  WorkbenchStarter
} from "./workbenchModel-contracts";
import {
  asBoolean,
  asRecord,
  asString
} from "./workbenchModel-primitives";
import {
  actionStatus,
  buildStarterFields,
  extractActionId,
  moduleKey,
  pickTaskKey,
  starterPreviewAction,
  compactText
} from "./workbenchModel-presentation";

export type WorkbenchStartersInput = {
  starters: WorkbenchStarter[];
  moduleItems: Record<string, unknown>[];
  taskDrilldowns: Record<string, unknown>[];
  actionMap: Map<string, WorkbenchActionRef>;
  contextActions: WorkbenchActionRef[];
};

export function deriveWorkbenchStarters({
  starters,
  moduleItems,
  taskDrilldowns,
  actionMap,
  contextActions
}: WorkbenchStartersInput): WorkbenchStarter[] {
  const moduleAvailability = new Map<WorkbenchStarter["id"], { status: string; sourceRef: string }>();
  const moduleRecords = new Map<WorkbenchStarter["id"], Record<string, unknown>>();
  for (const item of moduleItems) {
    const moduleId = asString(item?.module_id) ?? "";
    const label = asString(item?.label) ?? "";
    const key = moduleKey(`${moduleId} ${label}`);
    if (!key) continue;
    const installed = asBoolean(item?.installed);
    const health = asString(item?.health_status) ?? "unknown";
    moduleAvailability.set(key, {
      status: installed ? health : "not_installed",
      sourceRef: asString(item?.checkout_path) ?? asString(item?.repo_url) ?? moduleId
    });
    moduleRecords.set(key, item);
  }

  const starterTasks = new Map<WorkbenchStarter["id"], Record<string, unknown>>();
  for (const task of taskDrilldowns) {
    const key = pickTaskKey(task);
    if (!key) continue;
    const current = starterTasks.get(key);
    const taskId = asString(task.task_id);
    const domainId = asString(task.domain_id);
    if (!current || (taskId && domainId && taskId === domainId)) {
      starterTasks.set(key, task);
    }
  }

  return starters.map((starter): WorkbenchStarter => {
    const availability = moduleAvailability.get(starter.id);
    const moduleRecord = moduleRecords.get(starter.id) ?? null;
    const task = starterTasks.get(starter.id) ?? null;
    const taskAction = actionMap.get(asString(asRecord(task?.action_receipt)?.action_id) ?? "");
    const exportAction = actionMap.get(
      asString(asRecord(task?.action_receipt)?.export_bundle_action_id)
      ?? extractActionId(asRecord(task?.artifact_or_blocker)?.export_bundle_action_ref)
      ?? ""
    );
    const starterAction = [taskAction, exportAction, starterPreviewAction(starter, contextActions)]
      .find((action): action is WorkbenchActionRef => Boolean(action?.dryRunSupported));
    const routeStatus = starterAction ? actionStatus(starterAction) : "unavailable";
    const taskArtifact = asRecord(task?.artifact_or_blocker);
    const taskActionReceipt = asRecord(task?.action_receipt);
    const starterTitle = asString(task?.title)
      ? `${starter.title.split("/")[0]?.trim() ?? starter.title} / ${asString(task?.title)}`
      : starter.title;
    return {
      ...starter,
      title: starterTitle,
      module: asString(moduleRecord?.label) ?? starter.module,
      intent: compactText(task?.next_visible_step, asString(moduleRecord?.description) ?? starter.intent),
      fields: buildStarterFields(starter, starterAction, task, moduleRecord),
      available: Boolean(starterAction?.dryRunSupported),
      status: routeStatus,
      sourceRef: asString(taskActionReceipt?.preview_ref)
        ?? asString(taskArtifact?.current_ref)
        ?? starterAction?.route
        ?? availability?.sourceRef
        ?? starter.sourceRef,
      previewActionId: starterAction?.id,
      dryRunAction: starterAction?.id
    };
  });
}
