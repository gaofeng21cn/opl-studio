import type {
  WorkItemRuntimeItem,
  WorkItemRuntimeProjection,
  WorkItemRuntimeStage
} from "@gaofeng21cn/opl-host-contracts";

export type RuntimeLocale = "zh" | "en";

export type StatusTone = "running" | "attention" | "paused" | "completed" | "stopped" | "other";

const COMPLETED_STAGE_STATES = new Set([
  "complete",
  "completed",
  "done",
  "delivered",
  "success",
  "succeeded",
  "skipped"
]);

const ACTIVE_STAGE_STATES = new Set([
  "in_progress",
  "current",
  "running",
  "active",
  "executing"
]);

const ATTENTION_STAGE_STATES = new Set([
  "failed",
  "error",
  "blocked",
  "attention",
  "awaiting_user_decision"
]);

export function normalizeStageStateKey(state: string | undefined): string {
  return (state ?? "unknown").trim().toLowerCase().replaceAll("-", "_");
}

export function isStageCompleted(state: string | undefined): boolean {
  return COMPLETED_STAGE_STATES.has(normalizeStageStateKey(state));
}

export function isStageActive(state: string | undefined): boolean {
  return ACTIVE_STAGE_STATES.has(normalizeStageStateKey(state));
}

export function isStageAttention(state: string | undefined): boolean {
  return ATTENTION_STAGE_STATES.has(normalizeStageStateKey(state));
}

export function statusTone(status: string): StatusTone {
  switch (status) {
    case "automatically_advancing":
      return "running";
    case "awaiting_user_decision":
    case "system_attention":
    case "sync_pending":
      return "attention";
    case "delivered_auto_paused":
      return "completed";
    case "paused":
      return "paused";
    case "stopped":
      return "stopped";
    default:
      return "other";
  }
}

export function isAttentionStatus(status: string): boolean {
  return status === "awaiting_user_decision" || status === "system_attention" || status === "sync_pending";
}

export function isActivelyRunningItem(item: WorkItemRuntimeItem): boolean {
  return item.status === "automatically_advancing" || item.executionState === "running" || item.activeSessionCount > 0;
}

export function localizePrimaryState(status: string, locale: RuntimeLocale): string {
  const map: Record<string, [string, string]> = {
    automatically_advancing: ["自动推进中", "Automatically advancing"],
    awaiting_user_decision: ["等待你决定", "Waiting for your decision"],
    system_attention: ["系统处理中", "System attention"],
    delivered_auto_paused: ["已交付自动暂停", "Delivered and auto-paused"],
    paused: ["已暂停", "Paused"],
    stopped: ["已停止", "Stopped"],
    sync_pending: ["状态待同步", "Sync pending"]
  };
  const pair = map[status];
  if (pair) return locale === "zh" ? pair[0] : pair[1];
  return locale === "zh" ? "未知状态" : status.replaceAll("_", " ");
}

export function localizeStageState(state: string, locale: RuntimeLocale): string {
  const key = normalizeStageStateKey(state);
  const map: Record<string, [string, string]> = {
    completed: ["已完成", "Completed"],
    complete: ["已完成", "Completed"],
    done: ["已完成", "Done"],
    delivered: ["已交付", "Delivered"],
    succeeded: ["已完成", "Succeeded"],
    success: ["已完成", "Succeeded"],
    skipped: ["已跳过", "Skipped"],
    in_progress: ["进行中", "In progress"],
    current: ["当前阶段", "Current"],
    running: ["运行中", "Running"],
    active: ["进行中", "Active"],
    executing: ["执行中", "Executing"],
    next: ["下一阶段", "Next"],
    pending: ["待开始", "Pending"],
    queued: ["排队中", "Queued"],
    failed: ["失败", "Failed"],
    error: ["异常", "Error"],
    blocked: ["受阻", "Blocked"],
    stopped: ["已停止", "Stopped"],
    paused: ["已暂停", "Paused"],
    unknown: ["未知", "Unknown"]
  };
  const pair = map[key];
  if (pair) return locale === "zh" ? pair[0] : pair[1];
  return state;
}

export function localizedStageName(
  stage: Pick<WorkItemRuntimeStage, "stageId" | "displayName" | "displayNameI18n"> | undefined,
  locale: RuntimeLocale,
  fallbackId?: string
): string {
  if (!stage) return fallbackId ?? "";
  const localized = locale === "zh" ? stage.displayNameI18n.zh : stage.displayNameI18n.en;
  return localized ?? stage.displayName ?? fallbackId ?? stage.stageId;
}

export function localizeOwnerName(item: WorkItemRuntimeItem, locale: RuntimeLocale): string {
  if (item.actionOwnerKind === "user") return locale === "zh" ? "你" : "You";
  if (item.actionOwnerKind === "system") return locale === "zh" ? "系统" : "System";
  if (item.actionOwnerKind === "agent") return item.agentDisplayName || (locale === "zh" ? "智能体" : "Agent");
  return item.nextActionOwner ?? "-";
}

export function localizeActionTitle(item: WorkItemRuntimeItem, locale: RuntimeLocale): string {
  if (item.actionTitleKey === "lifecycle.paused.title") {
    return locale === "zh" ? "等待明确后续方向" : "Waiting for next direction";
  }
  if (item.actionTitleKey === "lifecycle.deliveredPaused.title") {
    return locale === "zh" ? "已交付里程碑，可审阅或发起修订" : "Milestone delivered; review or start revision";
  }
  if (item.actionTitleKey === "lifecycle.stopped.title") {
    return locale === "zh" ? "任务已停止" : "Task stopped";
  }
  if (item.actionTitleKey === "lifecycle.syncPending.title") {
    return locale === "zh" ? "等待状态同步" : "Waiting for status sync";
  }
  if (locale === "zh" && item.nextActionTitle) return item.nextActionTitle;
  if (locale === "en" && item.nextActionTitle && !/[\u4e00-\u9fff]/.test(item.nextActionTitle)) {
    return item.nextActionTitle;
  }
  if (item.nextActionSummary && (locale === "en" || !/[\u4e00-\u9fff]/.test(item.nextActionSummary))) {
    return item.nextActionSummary;
  }
  return item.nextActionTitle
    ?? item.nextActionSummary
    ?? (item.nextStageName ? `${locale === "zh" ? "下一阶段" : "Next stage"}: ${item.nextStageName}` : "-");
}

export type ComputedStageProgress = {
  terminalDelivered: boolean;
  displayStages: WorkItemRuntimeStage[];
  completedCount: number;
  totalCount: number;
  percent: number;
  currentStage?: WorkItemRuntimeStage;
};

/**
 * Per Runtime Redesign SSOT: when primary_state === delivered_auto_paused or
 * package_status === milestone_delivered, stage_map enters a terminal boundary
 * where only actually completed stages are displayed and pending/next/failed tails are hidden.
 */
export function computeStageProgress(item: WorkItemRuntimeItem): ComputedStageProgress {
  const terminalDelivered =
    item.status === "delivered_auto_paused" || item.packageStatus === "milestone_delivered";
  const stages = item.stages ?? [];
  const displayStages = terminalDelivered
    ? stages.filter((stage) => isStageCompleted(stage.state))
    : stages;
  const completedCount = displayStages.filter((stage) => isStageCompleted(stage.state)).length;
  const totalCount = displayStages.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const currentStage =
    !terminalDelivered && item.currentStageId
      ? displayStages.find((stage) => stage.stageId === item.currentStageId)
      : !terminalDelivered
        ? displayStages.find((stage) => isStageActive(stage.state))
        : undefined;
  return {
    terminalDelivered,
    displayStages,
    completedCount,
    totalCount,
    percent,
    currentStage
  };
}

export function deriveEffectiveAgents(projection: WorkItemRuntimeProjection | undefined): Array<{ id: string; label: string }> {
  if (!projection) return [];
  const map = new Map<string, string>();
  for (const agent of projection.agents) {
    if (agent.id) map.set(agent.id, agent.label || agent.id);
  }
  for (const project of projection.projects) {
    if (project.agentId && project.agentId !== "unknown" && !map.has(project.agentId)) {
      const matchingItem = projection.items.find((item) => item.agentId === project.agentId);
      map.set(project.agentId, matchingItem?.agentDisplayName ?? project.agentId);
    }
  }
  for (const item of projection.items) {
    if (item.agentId && !map.has(item.agentId)) {
      map.set(item.agentId, item.agentDisplayName || item.agentId);
    }
  }
  return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
}

export type GroupedRuntimeProject = {
  projectId: string;
  projectLabel: string;
  agentId: string;
  agentLabel: string;
  workspacePath?: string;
  runningCount: number;
  attentionCount: number;
  items: WorkItemRuntimeItem[];
};

export function groupRuntimeItemsByProject(
  items: readonly WorkItemRuntimeItem[],
  projects: WorkItemRuntimeProjection["projects"]
): GroupedRuntimeProject[] {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const groups = new Map<string, GroupedRuntimeProject>();
  for (const item of items) {
    const existing = groups.get(item.projectId);
    if (existing) {
      existing.items.push(item);
      if (isActivelyRunningItem(item)) existing.runningCount += 1;
      if (isAttentionStatus(item.status)) existing.attentionCount += 1;
      continue;
    }
    const meta = projectMap.get(item.projectId);
    groups.set(item.projectId, {
      projectId: item.projectId,
      projectLabel: item.projectDisplayName || meta?.label || item.projectId,
      agentId: item.agentId,
      agentLabel: item.agentDisplayName || item.agentId,
      workspacePath: item.workspacePath ?? meta?.workspacePath,
      runningCount: isActivelyRunningItem(item) ? 1 : 0,
      attentionCount: isAttentionStatus(item.status) ? 1 : 0,
      items: [item]
    });
  }
  return Array.from(groups.values()).sort((left, right) => {
    if (right.runningCount !== left.runningCount) return right.runningCount - left.runningCount;
    if (right.attentionCount !== left.attentionCount) return right.attentionCount - left.attentionCount;
    return left.projectLabel.localeCompare(right.projectLabel);
  });
}

export function formatTimestamp(value: string | undefined, locale: RuntimeLocale): string {
  if (!value) return locale === "zh" ? "尚未读取" : "Not read yet";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

export function formatDuration(value: number | null | undefined, locale: RuntimeLocale): string {
  if (value === null || value === undefined) return locale === "zh" ? "用时未记录" : "Elapsed time not recorded";
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return locale === "zh" ? `${seconds} 秒` : `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return locale === "zh" ? `${minutes} 分钟` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return locale === "zh" ? `${hours} 小时 ${rest} 分钟` : `${hours}h ${rest}m`;
}

export function formatTokens(
  value: number | null | undefined,
  tokenState: string | undefined,
  locale: RuntimeLocale
): string {
  if (tokenState === "stale") return locale === "zh" ? "记录已过期" : "Usage stale";
  if (value === null || value === undefined) return locale === "zh" ? "尚无用量记录" : "Usage not recorded";
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", { notation: "compact" }).format(value);
}
