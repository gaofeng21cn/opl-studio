import type { WorkItemRuntimeProjection } from "./workbenchModel";

export type ProjectProgressLocale = "zh" | "en";

export type ProjectProgressProjectProjection = WorkItemRuntimeProjection["projects"][number] & {
  workspacePath?: string;
};

export type ProjectProgressItemProjection = WorkItemRuntimeProjection["items"][number] & {
  workspacePath?: string;
  attemptId?: string;
};

export type ProjectProgressEmptyReason =
  | "projection_unavailable"
  | "workspace_missing"
  | "no_matching_project";

export type ProjectProgressMatchedProject = {
  id: string;
  label: string;
};

export type ProjectProgressStage = {
  id: string;
  label: string;
};

export type ProjectProgressAttempt = {
  id: string;
};

export type ProjectProgressNextAction = {
  title?: string;
  summary?: string;
  owner?: string;
};

export type ProjectProgressItem = {
  id: string;
  agentLabel: string;
  projectLabel: string;
  workItemLabel: string;
  lifecycleStatus: string;
  lifecycleStatusLabel: string;
  lifecycleStatusReason?: string;
  completedStages: number;
  totalStages: number;
  currentStage?: ProjectProgressStage;
  attempt?: ProjectProgressAttempt;
  attention?: string;
  blocker?: string;
  nextAction?: ProjectProgressNextAction;
};

export type ProjectProgressViewModel = {
  matchedProject: ProjectProgressMatchedProject | null;
  items: ProjectProgressItem[];
  emptyReason?: ProjectProgressEmptyReason;
};

const completedStageStates = new Set([
  "complete",
  "completed",
  "done",
  "delivered",
  "success",
  "succeeded",
  "skipped"
]);

function nonEmpty(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  return candidate || undefined;
}

/** Keep matching deterministic without requiring filesystem access or realpath resolution. */
export function normalizeProjectProgressWorkspace(value: string | undefined | null): string {
  const normalized = (value ?? "").trim().replaceAll("\\", "/").replace(/\/{2,}/g, "/");
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
}

function localizedStageLabel(
  stage: ProjectProgressItemProjection["stages"][number] | undefined,
  locale: ProjectProgressLocale,
  fallback: string
): string {
  if (!stage) return fallback;
  return (locale === "zh" ? stage.displayNameI18n.zh : stage.displayNameI18n.en)
    ?? stage.displayName
    ?? fallback;
}

function stageIsCompleted(state: string): boolean {
  return completedStageStates.has(state.trim().toLowerCase().replaceAll("-", "_"));
}

function projectProgressItem(
  item: ProjectProgressItemProjection,
  projectLabel: string,
  agentLabel: string,
  locale: ProjectProgressLocale
): ProjectProgressItem {
  const stages = item.stages ?? [];
  const currentStageId = nonEmpty(item.currentStageId);
  const currentStage = currentStageId
    ? {
      id: currentStageId,
      label: localizedStageLabel(
        stages.find((stage) => stage.stageId === currentStageId),
        locale,
        nonEmpty(item.currentStageName) ?? currentStageId
      )
    }
    : undefined;

  const attemptId = nonEmpty(item.attemptId);
  const attempt = attemptId
    ? { id: attemptId }
    : undefined;

  const attentionKind = nonEmpty(item.attentionKind);
  const attention = attentionKind && attentionKind.toLowerCase() !== "none"
    ? attentionKind
    : undefined;
  const blocker = nonEmpty(item.statusReason);
  const nextAction = item.nextActionTitle || item.nextActionSummary || item.nextActionOwner
    ? {
      ...(nonEmpty(item.nextActionTitle) ? { title: nonEmpty(item.nextActionTitle) as string } : {}),
      ...(nonEmpty(item.nextActionSummary) ? { summary: nonEmpty(item.nextActionSummary) as string } : {}),
      ...(nonEmpty(item.nextActionOwner) ? { owner: nonEmpty(item.nextActionOwner) as string } : {})
    }
    : undefined;

  return {
    id: item.id,
    agentLabel,
    projectLabel,
    workItemLabel: item.title,
    lifecycleStatus: item.status,
    lifecycleStatusLabel: item.statusLabel,
    ...(nonEmpty(item.statusReason) ? { lifecycleStatusReason: nonEmpty(item.statusReason) as string } : {}),
    completedStages: stages.filter((stage) => stageIsCompleted(stage.state)).length,
    totalStages: stages.length,
    ...(currentStage ? { currentStage } : {}),
    ...(attempt ? { attempt } : {}),
    ...(attention ? { attention } : {}),
    ...(blocker ? { blocker } : {}),
    ...(nextAction ? { nextAction } : {})
  };
}

function emptyProjectProgress(emptyReason: ProjectProgressEmptyReason): ProjectProgressViewModel {
  return {
    matchedProject: null,
    items: [],
    emptyReason
  };
}

/**
 * Select the project represented by the current thread workspace.
 *
 * A project workspace match owns all of that project's items. If the project
 * catalog has no workspace field, an explicit item workspace match can still
 * identify the project; no ID, stage order, or pending-state fallback is used.
 */
export function selectProjectProgress(
  currentThreadWorkspace: string,
  projection: WorkItemRuntimeProjection | undefined,
  locale: ProjectProgressLocale
): ProjectProgressViewModel {
  if (!projection) return emptyProjectProgress("projection_unavailable");

  const workspace = normalizeProjectProgressWorkspace(currentThreadWorkspace);
  if (!workspace) return emptyProjectProgress("workspace_missing");

  const projects = projection.projects as ProjectProgressProjectProjection[];
  const items = projection.items as ProjectProgressItemProjection[];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const matchedProjectByWorkspace = projects.find(
    (project) => normalizeProjectProgressWorkspace(project.workspacePath) === workspace
  );
  const matchedItemsByWorkspace = items.filter(
    (item) => normalizeProjectProgressWorkspace(item.workspacePath) === workspace
  );

  const matchedProject = matchedProjectByWorkspace
    ?? projectById.get(matchedItemsByWorkspace[0]?.projectId ?? "")
    ?? (matchedItemsByWorkspace[0]
      ? {
        id: matchedItemsByWorkspace[0].projectId,
        agentId: matchedItemsByWorkspace[0].agentId,
        label: matchedItemsByWorkspace[0].projectDisplayName
      }
      : undefined);

  if (!matchedProject) return emptyProjectProgress("no_matching_project");

  const selectedItems = matchedProjectByWorkspace
    ? items.filter((item) => item.projectId === matchedProject.id)
    : matchedItemsByWorkspace.filter((item) => item.projectId === matchedProject.id);
  const agentLabels = new Map(projection.agents.map((agent) => [agent.id, agent.label]));
  const projectLabel = nonEmpty(matchedProject.label) ?? matchedProject.id;

  return {
    matchedProject: {
      id: matchedProject.id,
      label: projectLabel
    },
    items: selectedItems.map((item) => projectProgressItem(
      item,
      projectLabel,
      nonEmpty(agentLabels.get(item.agentId)) ?? nonEmpty(item.agentDisplayName) ?? item.agentId,
      locale
    ))
  };
}

export const selectProjectProgressViewModel = selectProjectProgress;
