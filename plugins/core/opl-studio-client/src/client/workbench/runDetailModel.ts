import type {
  OplUiContribution,
  OplUiContributionsProjection
} from "../composition/contributionProjection";
import type {
  ActiveProjectLine,
  ArtifactPreview,
  WorkItemRuntimeItem,
  WorkbenchArtifactRef,
  WorkbenchThreadItem
} from "./workbenchModel";

export type RunDetailIdentity = {
  threadId?: string;
  workItemId?: string;
};

type RootScope = { scope: "root" };
type ThreadScope = { scope: "thread"; threadId: string };
type WorkItemScope = { scope: "work_item"; workItemId: string; threadId?: string };
export type RunDetailItemScope = RootScope | ThreadScope | WorkItemScope;

export type ScopedRunDetailItem<Value> = RunDetailItemScope & {
  value: Value;
};

export type RunDetailStatus = {
  state: "running" | "idle" | "attention" | "unavailable";
  sourceStatus: string;
  agentLabel: string;
  threadId?: string;
  workItemId?: string;
  activeLines: ActiveProjectLine[];
};

export type RuntimeDetailModuleViewModel = {
  contribution: OplUiContribution;
  state: "ready" | "unsupported";
  fallbackReason?: "unknown_contribution_kind" | "missing_view_descriptor";
};

export type RunDetailViewModel = {
  identity: RunDetailIdentity;
  status: RunDetailStatus;
  files: WorkbenchArtifactRef[];
  results: ArtifactPreview[];
  runtimeDetails: RuntimeDetailModuleViewModel[];
};

export type RunDetailModelInput = {
  thread?: Pick<WorkbenchThreadItem, "id" | "status" | "agentNickname" | "agentRole"> | null;
  workItem?: Pick<WorkItemRuntimeItem, "workItemId" | "status" | "agentDisplayName" | "executionState"> | null;
  workItemId?: string;
  running: boolean;
  activeLines: ActiveProjectLine[];
  files: ScopedRunDetailItem<WorkbenchArtifactRef>[];
  results: ScopedRunDetailItem<ArtifactPreview>[];
  contributions: OplUiContributionsProjection;
};

function isScopedToIdentity(scope: RunDetailItemScope, identity: RunDetailIdentity): boolean {
  if (scope.scope === "root") return true;
  if (scope.scope === "thread") return Boolean(identity.threadId) && scope.threadId === identity.threadId;
  return Boolean(identity.workItemId)
    && scope.workItemId === identity.workItemId
    && (!scope.threadId || scope.threadId === identity.threadId);
}
function runState(running: boolean, sourceStatus: string): RunDetailStatus["state"] {
  if (running) return "running";
  const normalized = sourceStatus.toLowerCase();
  if (/error|failed|blocked|attention|system_error/.test(normalized)) return "attention";
  if (/idle|paused|delivered|completed|stopped|cancelled|ready|notloaded|unloaded/.test(normalized)) return "idle";
  return "unavailable";
}

function runtimeDetailModule(entry: OplUiContribution): RuntimeDetailModuleViewModel {
  if (entry.contributionKind === "command_group") return { contribution: entry, state: "ready" };
  if (entry.contributionKind === "view") {
    return entry.view
      ? { contribution: entry, state: "ready" }
      : { contribution: entry, state: "unsupported", fallbackReason: "missing_view_descriptor" };
  }
  return { contribution: entry, state: "unsupported", fallbackReason: "unknown_contribution_kind" };
}

export function buildRunDetailViewModel(input: RunDetailModelInput): RunDetailViewModel {
  const identity: RunDetailIdentity = {
    ...(input.thread?.id ? { threadId: input.thread.id } : {}),
    ...(input.workItemId ? { workItemId: input.workItemId } : {})
  };
  const sourceStatus = input.workItem?.status ?? input.thread?.status ?? "idle";
  const agentLabel = input.workItem?.agentDisplayName ?? input.thread?.agentNickname ?? input.thread?.agentRole ?? "Codex";
  const running = input.workItem ? input.workItem.executionState === "running" : input.running;

  const runtimeDetails = input.contributions.entries
    .filter((entry) => entry.slot === "runtime.detail")
    .filter((entry) => entry.scope === "root" || (entry.scope === "work_item" && Boolean(identity.workItemId)))
    .map(runtimeDetailModule);

  return {
    identity,
    status: {
      state: runState(running, sourceStatus),
      sourceStatus,
      agentLabel,
      ...identity,
      activeLines: identity.workItemId
        ? input.activeLines.filter((line) => line.activeRunId === identity.workItemId)
        : []
    },
    files: input.files.filter((item) => isScopedToIdentity(item, identity)).map((item) => item.value),
    results: input.results.filter((item) => isScopedToIdentity(item, identity)).map((item) => item.value),
    runtimeDetails
  };
}
