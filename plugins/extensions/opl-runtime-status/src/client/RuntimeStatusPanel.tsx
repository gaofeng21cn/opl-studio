import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  CircleAlert,
  Clock3,
  FolderOpen,
  Info,
  Layers,
  LayoutList,
  MessageSquare,
  RefreshCw,
  UserRound
} from "lucide-react";
import type {
  McpAppProps,
  OplActionReceipt,
  OplActionRequest,
  OplStudioShellPanelFocus,
  OplStudioShellService,
  ServiceRecoverySummary,
  WorkItemRuntimeItem,
  WorkItemRuntimeProjection
} from "@gaofeng21cn/opl-host-contracts";
import { PluginErrorBoundary, useOplStudioShellSnapshot } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { ArchiveConfirmDialog } from "./ArchiveConfirmDialog";
import { StageProgressStepper } from "./StageProgressStepper";
import { WorkItemDetailDrawer } from "./WorkItemDetailDrawer";
import {
  computeStageProgress,
  deriveEffectiveAgents,
  formatDuration,
  formatTimestamp,
  formatTokens,
  groupRuntimeItemsByProject,
  isActivelyRunningItem,
  isAttentionStatus,
  localizeActionTitle,
  localizeOwnerName,
  localizePrimaryState,
  localizedStageName,
  statusTone,
  type RuntimeLocale
} from "./runtimeStatusHelpers";

export type RuntimeStatusPanelProps = {
  locale: RuntimeLocale;
  projection?: WorkItemRuntimeProjection;
  serviceRecovery?: ServiceRecoverySummary;
  selectedWorkItemId?: string;
  stateStatus: "loading" | "ready" | "error";
  snapshotSource: "live" | "cached" | "none";
  snapshotCachedAt?: string;
  panelFocus?: OplStudioShellPanelFocus;
  autoRefresh?: boolean;
  onRefresh(): void | Promise<unknown>;
  onOpenMaintenance(): void;
  onOpenWorkItem?(item: WorkItemRuntimeItem): void;
  onOpenMaterials?(item: WorkItemRuntimeItem): void;
  onOpenThread?(threadId: string): Promise<string | null>;
  onExecuteAction?(request: OplActionRequest): Promise<OplActionReceipt>;
  mcpApps?: Omit<McpAppProps, "locale">;
  TaskWorkbenchComponent?: ComponentType<any>;
};

type StatusFilter =
  | "all"
  | "automatically_advancing"
  | "awaiting_user_decision"
  | "system_attention"
  | "delivered_auto_paused"
  | "paused"
  | "stopped"
  | "sync_pending";

type ViewMode = "grouped" | "flat";

export function RuntimeStatusPanel({
  locale,
  projection,
  serviceRecovery,
  selectedWorkItemId,
  stateStatus,
  snapshotSource,
  snapshotCachedAt,
  panelFocus,
  autoRefresh = true,
  onRefresh,
  onOpenMaintenance,
  onOpenWorkItem,
  onOpenMaterials,
  onOpenThread,
  onExecuteAction,
  mcpApps,
  TaskWorkbenchComponent
}: RuntimeStatusPanelProps) {
  const zh = locale === "zh";
  const [threadError, setThreadError] = useState("");
  const [openingThread, setOpeningThread] = useState(false);
  const [agentId, setAgentId] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");
  const [showArchived, setShowArchived] = useState(false);
  const [openStagesFor, setOpenStagesFor] = useState<string | null>(null);
  const [activeDetailItemId, setActiveDetailItemId] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<{ item: WorkItemRuntimeItem; targetArchived: boolean } | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [archiveNotice, setArchiveNotice] = useState("");

  useEffect(() => {
    if (!panelFocus) return;
    if (panelFocus.agentId) setAgentId(panelFocus.agentId);
    if (panelFocus.projectId) setProjectId(panelFocus.projectId);
    if (panelFocus.workItemId && projection?.items) {
      const matched = projection.items.find(
        (candidate) => candidate.id === panelFocus.workItemId || candidate.workItemId === panelFocus.workItemId
      );
      if (matched) setActiveDetailItemId(matched.id);
    }
  }, [panelFocus, projection?.items]);

  const copy = zh
    ? {
        title: "运行状态",
        intro: "查看已注册智能体、正在推进的项目与阶段进度；选择一项进入详情工作台。",
        scope: "查看范围",
        agent: "智能体",
        allAgents: "全部智能体",
        project: "项目",
        allProjects: "全部项目",
        loaded: "更新于",
        readback: "任务列表已更新",
        loading: "正在读取任务…",
        openMaintenance: "打开维护",
        retry: "重试",
        clearFilter: "清除状态筛选",
        noMatch: "没有符合此状态的工作",
        noArchived: "当前范围没有归档工作",
        emptyHint: "智能体提供项目任务后，会显示在这里。",
        unavailableHint: "重新读取任务列表，或打开维护查看连接状态。",
        serviceHint: "后台自动执行可能受影响。打开维护查看服务详情与恢复操作。",
        unknownHint: "刷新后确认服务状态，或在维护中查看详情。",
        cachedService: "上次服务检查",
        running: "运行中",
        attention: "需关注",
        automaticallyAdvancing: "自动推进中",
        awaitingUserDecision: "等待你决定",
        systemAttention: "系统处理中",
        deliveredAutoPaused: "已交付自动暂停",
        syncPending: "状态待同步",
        tasks: "任务",
        workItems: "项工作",
        all: "全部",
        paused: "已暂停",
        completed: "已交付",
        stopped: "已停止",
        archive: "归档库",
        backToCurrent: "返回当前任务",
        refresh: "刷新运行状态",
        noData: "运行状态暂不可用",
        noItems: "当前范围没有工作",
        nextAction: "下一步",
        owner: "负责人",
        elapsed: "已用时",
        currentStageUsage: "阶段",
        cumulativeUsage: "累计",
        openDetails: "查看详情",
        refreshing: "正在更新，页面先显示上次状态",
        cached: "显示上次读取的状态",
        stale: "最新读取失败，保留上次状态",
        activeSpotlight: "正在运行",
        groupedView: "按项目分组",
        flatView: "列表视图",
        viewMaterials: "资料",
        archiveAction: "归档",
        restoreAction: "恢复"
      }
    : {
        title: "Runtime status",
        intro: "Monitor registered Agents, running projects, and stage progress; select an item for details.",
        scope: "Scope",
        agent: "Agent",
        allAgents: "All Agents",
        project: "Project",
        allProjects: "All projects",
        loaded: "Updated",
        readback: "Task list updated",
        loading: "Reading tasks…",
        openMaintenance: "Open maintenance",
        retry: "Retry",
        clearFilter: "Clear status filter",
        noMatch: "No work matches this status",
        noArchived: "No archived work in this scope",
        emptyHint: "Project work will appear here when an agent provides it.",
        unavailableHint: "Read the task list again, or open maintenance to check the connection.",
        serviceHint: "Background execution may be affected. Open maintenance for service details and recovery.",
        unknownHint: "Refresh to check service status, or view details in maintenance.",
        cachedService: "Last service check",
        running: "Running",
        attention: "Needs attention",
        automaticallyAdvancing: "Automatically advancing",
        awaitingUserDecision: "Waiting for your decision",
        systemAttention: "System attention",
        deliveredAutoPaused: "Delivered and auto-paused",
        syncPending: "Sync pending",
        tasks: "Tasks",
        workItems: "work items",
        all: "All",
        paused: "Paused",
        completed: "Delivered",
        stopped: "Stopped",
        archive: "Archive",
        backToCurrent: "Back to current tasks",
        refresh: "Refresh runtime status",
        noData: "Runtime status is unavailable",
        noItems: "No work in this scope",
        nextAction: "Next",
        owner: "Owner",
        elapsed: "Elapsed",
        currentStageUsage: "Stage",
        cumulativeUsage: "Total",
        openDetails: "Open details",
        refreshing: "Updating; showing the last known state",
        cached: "Showing the last known state",
        stale: "Latest read failed; keeping the last known state",
        activeSpotlight: "Active runs",
        groupedView: "Group by project",
        flatView: "Flat list",
        viewMaterials: "Materials",
        archiveAction: "Archive",
        restoreAction: "Restore"
      };

  const effectiveAgents = useMemo(() => deriveEffectiveAgents(projection), [projection]);
  const projects = useMemo(
    () => (projection?.projects ?? []).filter((project) => agentId === "all" || project.agentId === agentId),
    [agentId, projection?.projects]
  );
  const scopedItems = useMemo(
    () =>
      (projection?.items ?? []).filter(
        (item) => (agentId === "all" || item.agentId === agentId) && (projectId === "all" || item.projectId === projectId)
      ),
    [agentId, projectId, projection?.items]
  );
  const libraryItems = useMemo(
    () => scopedItems.filter((item) => item.archived === showArchived),
    [scopedItems, showArchived]
  );
  const items = useMemo(
    () => libraryItems.filter((item) => status === "all" || item.status === status),
    [libraryItems, status]
  );
  const activeRuns = useMemo(
    () => libraryItems.filter((item) => isActivelyRunningItem(item)),
    [libraryItems]
  );
  const groupedProjects = useMemo(
    () => groupRuntimeItemsByProject(items, projects),
    [items, projects]
  );

  const runningCount = libraryItems.filter((item) => isActivelyRunningItem(item)).length;
  const attentionCount = libraryItems.filter((item) => isAttentionStatus(item.status)).length;
  const archivedCount = scopedItems.filter((item) => item.archived).length;

  useEffect(() => {
    if (!autoRefresh || typeof document === "undefined") return;
    const intervalMs = runningCount > 0 ? 10_000 : 30_000;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && stateStatus !== "loading") {
        void onRefresh();
      }
    }, intervalMs);
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && stateStatus !== "loading") {
        void onRefresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [autoRefresh, onRefresh, runningCount, stateStatus]);

  const activeDetailItem = useMemo(() => {
    if (!activeDetailItemId || !projection?.items) return undefined;
    return projection.items.find((candidate) => candidate.id === activeDetailItemId);
  }, [activeDetailItemId, projection?.items]);

  const recoveryNeedsAttention = serviceRecovery !== undefined && serviceRecovery.causalRoot.status !== "ready";
  const serviceSnapshotIsCurrent = stateStatus === "ready" && snapshotSource === "live";
  const serviceNoticeTone = !serviceSnapshotIsCurrent || serviceRecovery?.causalRoot.status === "unknown" ? "unknown" : "attention";
  const snapshotMessage =
    stateStatus === "error" && snapshotSource !== "none"
      ? copy.stale
      : stateStatus === "loading" && snapshotSource !== "none"
        ? copy.refreshing
        : snapshotSource === "cached"
          ? copy.cached
          : undefined;

  const changeAgent = (value: string) => {
    setAgentId(value);
    const project = projection?.projects.find((candidate) => candidate.id === projectId);
    if (value !== "all" && project?.agentId !== value) setProjectId("all");
  };

  const handleConfirmArchive = useCallback(async () => {
    if (!archiveConfirm || !onExecuteAction) return;
    const { item, targetArchived } = archiveConfirm;
    setArchiveBusy(true);
    setArchiveError("");
    setArchiveNotice("");
    try {
      const receipt = await onExecuteAction({
        actionId: "work_item_visibility_set",
        mode: "execute",
        payload: {
          confirmed: true,
          agent_id: item.agentId,
          project_id: item.projectId,
          work_item_id: item.workItemId,
          visibility_state: targetArchived ? "archived" : "visible",
          ...(item.visibilityGeneration !== undefined ? { expected_generation: item.visibilityGeneration } : {})
        }
      });
      const stderrText = `${receipt.stderr ?? ""} ${receipt.stdout ?? ""}`;
      if (receipt.status !== "executed" && receipt.status !== "no_op") {
        const isConflict = stderrText.includes("work_item_control_generation_conflict");
        if (isConflict) {
          await onRefresh();
          setArchiveError(
            zh
              ? "状态已被其他操作更新，页面已刷新最新数据，请重新确认后再操作。"
              : "Control generation changed elsewhere. State refreshed; review and retry."
          );
          return;
        }
        setArchiveError(
          receipt.stderr?.trim()
            || (zh ? "归档状态更新失败，请检查维护状态后重试。" : "Failed to update archive visibility.")
        );
        return;
      }
      const refreshed = (await onRefresh()) as
        | { workItemRuntime?: WorkItemRuntimeProjection }
        | WorkItemRuntimeProjection
        | null
        | undefined;
      const refreshedProjection =
        refreshed && typeof refreshed === "object" && "workItemRuntime" in refreshed
          ? refreshed.workItemRuntime
          : refreshed && typeof refreshed === "object" && "items" in refreshed
            ? refreshed
            : undefined;
      const refreshedItem = refreshedProjection?.items?.find(
        (candidate) =>
          candidate.id === item.id ||
          (candidate.agentId === item.agentId &&
            candidate.projectId === item.projectId &&
            candidate.workItemId === item.workItemId)
      );
      if (refreshedItem && Boolean(refreshedItem.archived) !== targetArchived) {
        setArchiveError(
          zh
            ? "归档状态回读校验不一致，请刷新页面后确认最新状态。"
            : "Readback verification did not reflect the updated archive state. Refresh and check again."
        );
        return;
      }
      setArchiveConfirm(null);
      setArchiveNotice(
        targetArchived
          ? (zh ? `已归档「${item.title}」（任务如在运行将继续执行）` : `Archived "${item.title}"`)
          : (zh ? `已将「${item.title}」恢复至当前任务` : `Restored "${item.title}"`)
      );
    } catch (reason) {
      const message = String(reason instanceof Error ? reason.message : reason);
      if (message.includes("work_item_control_generation_conflict")) {
        await onRefresh();
        setArchiveError(
          zh
            ? "状态已被其他操作更新，页面已刷新最新数据，请重新确认后再操作。"
            : "Control generation changed elsewhere. State refreshed; review and retry."
        );
      } else {
        setArchiveError(message);
      }
    } finally {
      setArchiveBusy(false);
    }
  }, [archiveConfirm, onExecuteAction, onRefresh, zh]);

  if (activeDetailItem) {
    return (
      <>
        <WorkItemDetailDrawer
          item={activeDetailItem}
          locale={locale}
          mcpApps={mcpApps}
          TaskWorkbenchComponent={TaskWorkbenchComponent}
          archiveBusy={archiveBusy}
          onBack={() => setActiveDetailItemId(null)}
          onOpenMaterials={onOpenMaterials}
          onOpenThread={onOpenThread}
          onRequestArchive={
            onExecuteAction
              ? (item, targetArchived) => {
                  setArchiveError("");
                  setArchiveConfirm({ item, targetArchived });
                }
              : undefined
          }
        />
        <ArchiveConfirmDialog
          item={archiveConfirm?.item ?? null}
          targetArchived={archiveConfirm?.targetArchived ?? true}
          locale={locale}
          busy={archiveBusy}
          error={archiveError}
          onCancel={() => {
            setArchiveConfirm(null);
            setArchiveError("");
          }}
          onConfirm={() => void handleConfirmArchive()}
        />
      </>
    );
  }

  const renderWorkItemRow = (item: WorkItemRuntimeItem) => {
    const category = statusTone(item.status);
    const stagesOpen = openStagesFor === item.id;
    const selected = selectedWorkItemId === item.id;
    const stageState = item.cumulativeTokensState ?? item.telemetryState;
    return (
      <article className="runtime-work-row" key={item.id} data-status={category} data-selected={selected || undefined}>
        <div className="runtime-work-identity">
          <button
            type="button"
            className="runtime-work-open-button"
            aria-label={`${copy.openDetails}: ${item.title}`}
            onClick={() => {
              setActiveDetailItemId(item.id);
              onOpenWorkItem?.(item);
            }}
          >
            <strong>{item.projectDisplayName}</strong>
            <h3>{item.title}</h3>
            <span className="runtime-agent-tag">
              <UserRound aria-hidden="true" size={13} />
              <span>{item.agentDisplayName}</span>
            </span>
          </button>
          <div className="runtime-row-inline-actions">
            {onOpenMaterials ? (
              <button
                type="button"
                className="runtime-inline-link"
                onClick={() => onOpenMaterials(item)}
              >
                <FolderOpen aria-hidden="true" size={12} />
                <span>{copy.viewMaterials}</span>
              </button>
            ) : null}
            {item.canonicalThreadIds?.length && onOpenThread ? (
              item.canonicalThreadIds.map((threadId, index) => (
                <button
                  key={threadId}
                  type="button"
                  className="runtime-inline-link"
                  disabled={openingThread}
                  onClick={async () => {
                    setOpeningThread(true);
                    setThreadError("");
                    try {
                      setThreadError((await onOpenThread(threadId)) ?? "");
                    } catch (error) {
                      setThreadError(String(error));
                    } finally {
                      setOpeningThread(false);
                    }
                  }}
                >
                  <MessageSquare aria-hidden="true" size={12} />
                  <span>
                    {zh ? "打开会话" : "Open thread"}
                    {item.canonicalThreadIds!.length > 1 ? ` ${index + 1}` : ""}
                  </span>
                </button>
              ))
            ) : null}
            {onExecuteAction ? (
              <button
                type="button"
                className="runtime-inline-link"
                disabled={archiveBusy}
                onClick={() => {
                  setArchiveError("");
                  setArchiveConfirm({ item, targetArchived: !item.archived });
                }}
              >
                {item.archived ? <ArchiveRestore aria-hidden="true" size={12} /> : <Archive aria-hidden="true" size={12} />}
                <span>{item.archived ? copy.restoreAction : copy.archiveAction}</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="runtime-work-status">
          <span className="runtime-status-badge" data-tone={category}>
            <span className="runtime-status-dot" aria-hidden="true" />
            {localizePrimaryState(item.status, locale)}
          </span>
          {item.activeSessionCount > 0 ? (
            <small>{item.activeSessionCount} {zh ? "个活跃会话" : "active sessions"}</small>
          ) : null}
        </div>

        <div className="runtime-work-progress">
          <StageProgressStepper
            item={item}
            locale={locale}
            open={stagesOpen}
            onToggle={() => setOpenStagesFor(stagesOpen ? null : item.id)}
            onClose={() => setOpenStagesFor(null)}
          />
          <p>
            <strong>{copy.nextAction}:</strong> {localizeActionTitle(item, locale)}
          </p>
          <p>
            <strong>{copy.owner}:</strong> {localizeOwnerName(item, locale)}{" "}
            <strong>{copy.elapsed}:</strong> {formatDuration(item.elapsedMs, locale)}
          </p>
        </div>

        <dl className="runtime-work-usage">
          <div>
            <dt>{copy.currentStageUsage}</dt>
            <dd>{formatTokens(item.stageTokens, item.stageTokensState, locale)}</dd>
          </div>
          <div>
            <dt>{copy.cumulativeUsage}</dt>
            <dd>{formatTokens(item.totalTokens, stageState, locale)}</dd>
          </div>
          <div className="runtime-work-time">
            <Clock3 aria-hidden="true" size={13} />
            <span>{item.updatedAt ? formatTimestamp(item.updatedAt, locale) : "-"}</span>
          </div>
        </dl>
      </article>
    );
  };

  return (
    <section
      className="opl-runtime-overview"
      data-testid="opl-runtime-overview-page"
      aria-labelledby="opl-runtime-overview-title"
    >
      <header className="runtime-overview-header">
        <div>
          <Activity aria-hidden="true" size={20} />
          <h1 id="opl-runtime-overview-title">{copy.title}</h1>
          {runningCount > 0 ? (
            <span className="runtime-live-pill" data-testid="opl-runtime-live-badge">
              <span className="runtime-live-pulse" aria-hidden="true" />
              {runningCount} {copy.running}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="runtime-refresh-button"
          aria-label={copy.refresh}
          title={copy.refresh}
          disabled={stateStatus === "loading"}
          onClick={() => void onRefresh()}
        >
          <RefreshCw className={stateStatus === "loading" ? "spin" : undefined} aria-hidden="true" size={16} />
          <span>{stateStatus === "loading" ? copy.loading : zh ? "刷新" : "Refresh"}</span>
        </button>
      </header>

      <p className="runtime-overview-intro">{copy.intro}</p>
      <p className="runtime-snapshot-note" role="status">
        {snapshotMessage ?? (projection ? copy.readback : stateStatus === "loading" ? copy.loading : copy.noData)}
        {(snapshotCachedAt ?? projection?.generatedAt) ? (
          <>
            {" "}
            · {copy.loaded}{" "}
            <time dateTime={snapshotCachedAt ?? projection?.generatedAt}>
              {formatTimestamp(snapshotCachedAt ?? projection?.generatedAt, locale)}
            </time>
          </>
        ) : null}
      </p>

      {archiveNotice ? (
        <p className="runtime-action-notice" role="status">
          {archiveNotice}
        </p>
      ) : null}

      {projection && recoveryNeedsAttention && serviceRecovery ? (
        <section className="runtime-service-notice" aria-labelledby="runtime-service-title" data-tone={serviceNoticeTone}>
          {serviceNoticeTone === "unknown" ? <Info aria-hidden="true" size={18} /> : <CircleAlert aria-hidden="true" size={18} />}
          <div>
            <h2 id="runtime-service-title">
              {!serviceSnapshotIsCurrent ? `${copy.cachedService} · ` : ""}
              {serviceRecovery.causalRoot.detail[locale]}
            </h2>
            <p>{serviceNoticeTone === "unknown" ? copy.unknownHint : copy.serviceHint}</p>
          </div>
          <button type="button" className="runtime-maintenance-button" onClick={onOpenMaintenance}>
            {copy.openMaintenance}
            <ArrowUpRight aria-hidden="true" size={15} />
          </button>
        </section>
      ) : null}

      {activeRuns.length > 0 ? (
        <section className="runtime-active-spotlight" aria-label={copy.activeSpotlight} data-testid="opl-runtime-active-spotlight">
          <div className="runtime-spotlight-title">
            <span className="runtime-live-pulse" aria-hidden="true" />
            <strong>{copy.activeSpotlight} ({activeRuns.length})</strong>
          </div>
          <div className="runtime-spotlight-cards">
            {activeRuns.map((item) => {
              const prog = computeStageProgress(item);
              const stageName = prog.currentStage
                ? localizedStageName(prog.currentStage, locale)
                : item.currentStageName ?? localizePrimaryState(item.status, locale);
              return (
                <button
                  key={item.id}
                  type="button"
                  className="runtime-spotlight-card"
                  onClick={() => {
                    setActiveDetailItemId(item.id);
                    onOpenWorkItem?.(item);
                  }}
                >
                  <div className="runtime-spotlight-head">
                    <span>{item.agentDisplayName} · {item.projectDisplayName}</span>
                    <small>{formatDuration(item.elapsedMs, locale)}</small>
                  </div>
                  <strong>{item.title}</strong>
                  <div className="runtime-spotlight-foot">
                    <span>{stageName}</span>
                    {prog.totalCount > 0 ? (
                      <span className="runtime-spotlight-ratio">{prog.completedCount}/{prog.totalCount}</span>
                    ) : null}
                  </div>
                  {prog.totalCount > 0 ? (
                    <div className="runtime-spotlight-bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(8, prog.percent)}%` }} />
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="runtime-scope-band">
        <strong>{copy.scope}</strong>
        <label>
          <span>{copy.agent}</span>
          <select value={agentId} onChange={(event) => changeAgent(event.currentTarget.value)}>
            <option value="all">{copy.allAgents}</option>
            {effectiveAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{copy.project}</span>
          <select value={projectId} onChange={(event) => setProjectId(event.currentTarget.value)}>
            <option value="all">{copy.allProjects}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="runtime-list-heading">
        <div className="runtime-list-summary">
          <h2>{showArchived ? copy.archive : copy.tasks}</h2>
          {projection ? (
            <span>
              {libraryItems.length} {copy.workItems} · {copy.running} {runningCount} · {copy.attention} {attentionCount}
            </span>
          ) : null}
        </div>
        <div className="runtime-list-controls">
          <div className="runtime-view-switch" role="group" aria-label={zh ? "显示模式" : "View mode"}>
            <button
              type="button"
              aria-pressed={viewMode === "grouped"}
              title={copy.groupedView}
              onClick={() => setViewMode("grouped")}
            >
              <Layers aria-hidden="true" size={14} />
              <span>{copy.groupedView}</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "flat"}
              title={copy.flatView}
              onClick={() => setViewMode("flat")}
            >
              <LayoutList aria-hidden="true" size={14} />
              <span>{copy.flatView}</span>
            </button>
          </div>
          <select
            aria-label={zh ? "状态" : "Status"}
            value={status}
            onChange={(event) => setStatus(event.currentTarget.value as StatusFilter)}
          >
            <option value="all">{copy.all}</option>
            <option value="automatically_advancing">{copy.automaticallyAdvancing}</option>
            <option value="awaiting_user_decision">{copy.awaitingUserDecision}</option>
            <option value="system_attention">{copy.systemAttention}</option>
            <option value="delivered_auto_paused">{copy.deliveredAutoPaused}</option>
            <option value="paused">{copy.paused}</option>
            <option value="stopped">{copy.stopped}</option>
            <option value="sync_pending">{copy.syncPending}</option>
          </select>
          <button
            type="button"
            className="runtime-archive-button"
            aria-pressed={showArchived}
            onClick={() => {
              setShowArchived((value) => !value);
              setOpenStagesFor(null);
            }}
          >
            <Archive aria-hidden="true" size={15} />
            {showArchived ? copy.backToCurrent : `${copy.archive} (${archivedCount})`}
          </button>
        </div>
      </div>

      {!projection ? (
        <div className="runtime-empty-state" role={stateStatus === "error" ? "alert" : "status"}>
          <h3>{stateStatus === "loading" ? copy.loading : copy.noData}</h3>
          {stateStatus !== "loading" ? (
            <>
              <p>{copy.unavailableHint}</p>
              <div>
                <button type="button" className="runtime-refresh-button" onClick={() => void onRefresh()}>
                  {copy.retry}
                </button>
                <button type="button" className="runtime-maintenance-button" onClick={onOpenMaintenance}>
                  {copy.openMaintenance}
                </button>
              </div>
            </>
          ) : (
            <div className="runtime-loading-placeholder" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
      ) : items.length === 0 ? (
        <div className="runtime-empty-state" role="status">
          <h3>{status !== "all" && libraryItems.length ? copy.noMatch : showArchived ? copy.noArchived : copy.noItems}</h3>
          {status !== "all" ? (
            <button type="button" className="runtime-refresh-button" onClick={() => setStatus("all")}>
              {copy.clearFilter}
            </button>
          ) : (
            <p>{copy.emptyHint}</p>
          )}
        </div>
      ) : null}

      {threadError ? <p className="runtime-inline-alert" role="alert">{threadError}</p> : null}

      {items.length > 0 && viewMode === "grouped" ? (
        <div className="runtime-project-groups" aria-live="polite">
          {groupedProjects.map((group) => (
            <section className="runtime-project-group" key={group.projectId}>
              <header className="runtime-project-group-header">
                <div className="runtime-project-group-title">
                  <strong>{group.projectLabel}</strong>
                  <span>{group.agentLabel}</span>
                  <small>
                    {group.items.length} {copy.workItems}
                    {group.runningCount > 0 ? ` · ${copy.running} ${group.runningCount}` : ""}
                    {group.attentionCount > 0 ? ` · ${copy.attention} ${group.attentionCount}` : ""}
                  </small>
                </div>
                {onOpenMaterials && group.items[0] ? (
                  <button
                    type="button"
                    className="runtime-inline-link"
                    onClick={() => onOpenMaterials(group.items[0])}
                  >
                    <FolderOpen aria-hidden="true" size={13} />
                    <span>{zh ? "项目资料空间" : "Project materials"}</span>
                  </button>
                ) : null}
              </header>
              <div className="runtime-work-list">{group.items.map(renderWorkItemRow)}</div>
            </section>
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="runtime-work-list" aria-live="polite">
          {items.map(renderWorkItemRow)}
        </div>
      ) : null}

      <ArchiveConfirmDialog
        item={archiveConfirm?.item ?? null}
        targetArchived={archiveConfirm?.targetArchived ?? true}
        locale={locale}
        busy={archiveBusy}
        error={archiveError}
        onCancel={() => {
          setArchiveConfirm(null);
          setArchiveError("");
        }}
        onConfirm={() => void handleConfirmArchive()}
      />
    </section>
  );
}

export function RuntimeStatusSlotPanel({
  shell,
  TaskWorkbenchComponent
}: {
  shell: OplStudioShellService;
  TaskWorkbenchComponent?: ComponentType<any>;
}) {
  const snapshot = useOplStudioShellSnapshot(shell);
  return (
    <PluginErrorBoundary
      pluginId="@gaofeng21cn/opl-runtime-status"
      pluginLabel={snapshot.locale === "zh" ? "运行状态" : "Runtime status"}
      locale={snapshot.locale}
      onOpenSoftwareCenter={() => shell.openPrimaryView("applications")}
    >
      <RuntimeStatusPanel
        locale={snapshot.locale}
        projection={snapshot.workItemRuntime}
        serviceRecovery={snapshot.serviceRecovery}
        selectedWorkItemId={snapshot.selectedWorkItemId}
        stateStatus={snapshot.stateStatus}
        snapshotSource={snapshot.snapshotSource}
        snapshotCachedAt={snapshot.snapshotCachedAt}
        panelFocus={snapshot.panelFocus}
        mcpApps={snapshot.mcpApps}
        TaskWorkbenchComponent={TaskWorkbenchComponent}
        onRefresh={() => shell.refreshState()}
        onOpenMaintenance={() => shell.openMaintenance()}
        onOpenWorkItem={(item) => shell.selectWorkItem(item.id)}
        onOpenMaterials={(item) =>
          shell.openPrimaryView("materials", {
            agentId: item.agentId,
            projectId: item.projectId,
            workItemId: item.workItemId
          })
        }
        onOpenThread={(threadId) => shell.openThread(threadId)}
        onExecuteAction={(request) => shell.executeAction(request)}
      />
    </PluginErrorBoundary>
  );
}
