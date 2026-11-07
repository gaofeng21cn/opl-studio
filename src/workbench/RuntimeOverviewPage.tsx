import type { McpAppProps } from "../../plugins/opl-mcp-apps/src/client/McpAppWorkspace";
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Archive,
  ChevronDown,
  Clock3,
  CircleAlert,
  RefreshCw,
  RotateCcw,
  UserRound,
  X
} from "lucide-react";
import type { WorkItemRuntimeItem, WorkItemRuntimeProjection } from "./workbenchModel";
import type { ServiceRecoveryAction, ServiceRecoveryModel } from "./serviceRecoveryModel";
import {
  DomainDetailViewEntryList,
  DomainDetailViews
} from "./domainDetailViews";

type RuntimeOverviewPageProps = {
  locale: "zh" | "en";
  projection?: WorkItemRuntimeProjection;
  serviceRecovery?: ServiceRecoveryModel;
  serviceRecoveryBusy: boolean;
  serviceRecoveryFeedback: { tone: "success" | "attention"; message: string } | null;
  selectedWorkItemId?: string;
  stateStatus: "loading" | "ready" | "error";
  stateError: string;
  snapshotSource: "live" | "cached" | "none";
  snapshotCachedAt?: string;
  onRefresh(): void;
  onRunServiceRecovery(action: ServiceRecoveryAction): void;
  onOpenWorkItem(item: WorkItemRuntimeItem): void;
  onOpenThread?(threadId: string): Promise<string | null>;
  mcpApps?: Omit<McpAppProps, "locale">;
};

type StatusFilter = "all" | "running" | "attention" | "paused" | "completed" | "stopped";

type ActiveDomainDetailRoute = {
  itemId: string;
  viewId?: string;
};

function statusCategory(item: WorkItemRuntimeItem): Exclude<StatusFilter, "all"> | "other" {
  if (item.executionState === "running" || item.status === "running") return "running";
  if (item.attentionKind !== "none") return "attention";
  if (/paused/.test(item.status)) return "paused";
  if (/completed|delivered|success/.test(item.status)) return "completed";
  if (/stopped|cancelled|failed/.test(item.status)) return "stopped";
  return "other";
}

function formatTimestamp(value: string | undefined, locale: "zh" | "en"): string {
  if (!value) return locale === "zh" ? "尚未读取" : "Not read yet";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function formatDuration(value: number | null, locale: "zh" | "en"): string {
  if (value === null) return locale === "zh" ? "当前没有运行" : "Not currently running";
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return locale === "zh" ? `${seconds} 秒` : `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return locale === "zh" ? `${minutes} 分钟` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return locale === "zh" ? `${hours} 小时 ${rest} 分钟` : `${hours}h ${rest}m`;
}

function formatTokens(value: number | null, locale: "zh" | "en"): string {
  if (value === null) return locale === "zh" ? "用量未记录" : "Usage not recorded";
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", { notation: "compact" }).format(value);
}

function localizedStageName(item: WorkItemRuntimeItem, stageId: string, locale: "zh" | "en"): string {
  const stage = item.stages.find((candidate) => candidate.stageId === stageId);
  return (locale === "zh" ? stage?.displayNameI18n.zh : stage?.displayNameI18n.en) ?? stage?.displayName ?? stageId;
}

function recoveryComponentLabel(component: ServiceRecoveryModel["causalRoot"]["component"], locale: "zh" | "en"): string {
  if (locale === "zh") {
    return component === "service" ? "后台服务" : component === "worker" ? "后台任务" : component === "scheduler" ? "定时任务" : "运行状态";
  }
  return component === "service" ? "Background service" : component === "worker" ? "Background worker" : component === "scheduler" ? "Scheduled tasks" : "Runtime";
}

function recoveryStatusLabel(model: ServiceRecoveryModel, locale: "zh" | "en"): string {
  if (locale === "zh") {
    if (model.causalRoot.status === "blocked" || model.mutationGuard.allowed === false) return "当前环境暂不能自动修复";
    if (model.causalRoot.status === "unknown") return "需要先刷新状态";
    return model.primaryAction ? "可以尝试恢复" : "暂无可安全执行的操作";
  }
  if (model.causalRoot.status === "blocked" || model.mutationGuard.allowed === false) return "Automatic repair is unavailable in this environment";
  if (model.causalRoot.status === "unknown") return "Refresh status before continuing";
  return model.primaryAction ? "Recovery can be attempted" : "No safe recovery action is available";
}

function recoveryReadinessLabel(model: ServiceRecoveryModel, locale: "zh" | "en"): string {
  return model.causalRoot.detail[locale];
}

function recoveryActionLabel(model: ServiceRecoveryModel, locale: "zh" | "en"): string {
  const kind = model.primaryAction?.kind ?? "status";
  if (locale === "zh") {
    if (model.causalRoot.component === "worker") return kind === "restart" ? "重新加载后台任务" : kind === "start" ? "启动后台任务" : "检查后台任务";
    if (model.causalRoot.component === "scheduler") return kind === "restart" ? "重新加载定时任务" : kind === "start" || kind === "repair" ? "启动定时任务" : "检查定时任务";
    return kind === "restart" ? "重新加载后台服务" : kind === "start" || kind === "repair" ? "启动后台服务" : "检查后台服务";
  }
  if (model.causalRoot.component === "worker") return kind === "restart" ? "Reload background worker" : kind === "start" ? "Start background worker" : "Check background worker";
  if (model.causalRoot.component === "scheduler") return kind === "restart" ? "Reload scheduled tasks" : kind === "start" || kind === "repair" ? "Start scheduled tasks" : "Check scheduled tasks";
  return kind === "restart" ? "Reload background service" : kind === "start" || kind === "repair" ? "Start background service" : "Check background service";
}

export function RuntimeOverviewPage({
  locale,
  projection,
  serviceRecovery,
  serviceRecoveryBusy,
  serviceRecoveryFeedback,
  selectedWorkItemId,
  stateStatus,
  stateError,
  snapshotSource,
  snapshotCachedAt,
  onRefresh,
  onRunServiceRecovery,
  onOpenWorkItem,
  onOpenThread,
  mcpApps
}: RuntimeOverviewPageProps) {
  const [threadError, setThreadError] = useState("");
  const [openingThread, setOpeningThread] = useState(false);
  const [agentId, setAgentId] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [openStagesFor, setOpenStagesFor] = useState<string | null>(null);
  const [pendingRecoveryAction, setPendingRecoveryAction] = useState<ServiceRecoveryAction | null>(null);
  const [activeDomainDetailRoute, setActiveDomainDetailRoute] = useState<ActiveDomainDetailRoute | null>(null);
  const copy = locale === "zh" ? {
    title: "项目运行总览",
    scope: "查看范围",
    agent: "智能体",
    allAgents: "全部智能体",
    project: "项目",
    allProjects: "全部项目",
    loaded: "加载时间",
    availability: "整体状态",
    available: "可用",
    partial: "部分可用",
    unavailable: "不可用",
    running: "运行中",
    attention: "需关注",
    tasks: "任务",
    currentCount: "当前范围",
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
    stage: "当前阶段",
    noStage: "暂无当前阶段",
    nextStage: "下一阶段",
    nextAction: "下一步",
    owner: "负责人",
    elapsed: "已用时",
    currentStageUsage: "阶段",
    cumulativeUsage: "累计",
    stageMap: "阶段进度",
    close: "关闭阶段进度",
    openDetails: "查看详情",
    serviceRecovery: "运行状态需要检查",
    causalRoot: "影响范围",
    mutationGuard: "自动修复",
    noRecoveryAction: "当前没有可安全执行的恢复操作",
    confirmRecovery: "确认执行",
    cancelRecovery: "取消",
    refreshing: "正在更新，页面先显示上次状态",
    cached: "显示上次读取的状态",
    stale: "最新读取失败，保留上次状态"
  } : {
    title: "Project runtime overview",
    scope: "Scope",
    agent: "Agent",
    allAgents: "All Agents",
    project: "Project",
    allProjects: "All projects",
    loaded: "Loaded",
    availability: "Overall status",
    available: "Available",
    partial: "Partially available",
    unavailable: "Unavailable",
    running: "Running",
    attention: "Needs attention",
    tasks: "Tasks",
    currentCount: "Current scope",
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
    stage: "Current stage",
    noStage: "No current stage",
    nextStage: "Next stage",
    nextAction: "Next",
    owner: "Owner",
    elapsed: "Elapsed",
    currentStageUsage: "Stage",
    cumulativeUsage: "Total",
    stageMap: "Stage progress",
    close: "Close stage progress",
    openDetails: "Open details",
    serviceRecovery: "Runtime status needs attention",
    causalRoot: "Affected area",
    mutationGuard: "Automatic recovery",
    noRecoveryAction: "No safe recovery action is currently available",
    confirmRecovery: "Confirm",
    cancelRecovery: "Cancel",
    refreshing: "Updating; showing the last known state",
    cached: "Showing the last known state",
    stale: "Latest read failed; keeping the last known state"
  };
  const projects = useMemo(() => (projection?.projects ?? []).filter((project) => (
    agentId === "all" || project.agentId === agentId
  )), [agentId, projection?.projects]);
  const items = useMemo(() => (projection?.items ?? []).filter((item) => (
    item.archived === showArchived
    && (agentId === "all" || item.agentId === agentId)
    && (projectId === "all" || item.projectId === projectId)
    && (status === "all" || statusCategory(item) === status)
  )), [agentId, projectId, projection?.items, showArchived, status]);
  const activeDomainDetailItem = useMemo(() => {
    if (!activeDomainDetailRoute) return undefined;
    const item = projection?.items.find((candidate) => candidate.id === activeDomainDetailRoute.itemId);
    if (!item) return undefined;
    return {
      ...item,
      domainDetailViews: (item.domainDetailViews ?? []).filter((view) => !activeDomainDetailRoute.viewId || view.viewId === activeDomainDetailRoute.viewId)
    };
  }, [activeDomainDetailRoute, projection?.items]);
  const activeDomainDetailView = activeDomainDetailItem?.domainDetailViews?.[0];
  const recoveryNeedsAttention = serviceRecovery !== undefined && serviceRecovery.causalRoot.status !== "ready";
  const attentionCount = projection
    ? projection.summary.userAttentionCount + projection.summary.systemAttentionCount + (recoveryNeedsAttention ? 1 : 0)
    : 0;
  const overallStatus = !projection
    ? { label: copy.unavailable, tone: "muted" as const }
    : recoveryNeedsAttention
      ? { label: copy.partial, tone: "attention" as const }
      : { label: copy.available, tone: "success" as const };
  const snapshotMessage = stateStatus === "error" && snapshotSource !== "none"
    ? copy.stale
    : stateStatus === "loading" && snapshotSource !== "none"
      ? copy.refreshing
      : snapshotSource === "cached" ? copy.cached : undefined;

  const changeAgent = (value: string) => {
    setAgentId(value);
    const project = projection?.projects.find((candidate) => candidate.id === projectId);
    if (value !== "all" && project?.agentId !== value) setProjectId("all");
  };

  if (activeDomainDetailRoute) {
    const route = `/runtime/item/${encodeURIComponent(activeDomainDetailRoute.itemId)}/insights/${encodeURIComponent(activeDomainDetailRoute.viewId ?? "task")}`;
    return (
      <section className="opl-runtime-overview runtime-domain-view" data-testid="opl-runtime-domain-detail-page" data-route={route} aria-labelledby="runtime-domain-view-title">
        <header className="runtime-overview-header runtime-domain-view-header">
          <div>
            <button
              type="button"
              className="runtime-icon-button"
              aria-label={locale === "zh" ? "返回项目运行总览" : "Back to project runtime overview"}
              title={locale === "zh" ? "返回项目运行总览" : "Back to project runtime overview"}
              onClick={() => setActiveDomainDetailRoute(null)}
            >
              <ArrowLeft aria-hidden="true" size={16} />
            </button>
            <div className="runtime-domain-view-title">
              <span>{activeDomainDetailItem?.projectDisplayName ?? copy.title}</span>
              <h1 id="runtime-domain-view-title">{activeDomainDetailRoute.viewId ? (activeDomainDetailView?.title ?? activeDomainDetailRoute.viewId) : (locale === "zh" ? "任务工作台" : "Task workbench")}</h1>
            </div>
          </div>
        </header>
        {activeDomainDetailItem && (!activeDomainDetailRoute.viewId || activeDomainDetailView) ? (
          <DomainDetailViews
            item={activeDomainDetailItem}
            locale={locale}
            mcpApps={mcpApps}
            initialViewId={activeDomainDetailRoute.viewId}
          />
        ) : (
          <p className="runtime-overview-empty" role="status">{locale === "zh" ? "此任务详情视图暂不可用" : "This work item detail view is unavailable"}</p>
        )}
      </section>
    );
  }

  return (
    <section className="opl-runtime-overview" data-testid="opl-runtime-overview-page" aria-labelledby="opl-runtime-overview-title">
      <header className="runtime-overview-header">
        <div>
          <Activity aria-hidden="true" size={20} />
          <h1 id="opl-runtime-overview-title">{copy.title}</h1>
        </div>
        <button
          type="button"
          className="runtime-icon-button"
          aria-label={copy.refresh}
          title={copy.refresh}
          disabled={stateStatus === "loading"}
          onClick={onRefresh}
        >
          <RefreshCw className={stateStatus === "loading" ? "spin" : undefined} aria-hidden="true" size={16} />
        </button>
      </header>
      {snapshotMessage ? <p className="runtime-snapshot-note" data-source={snapshotSource} role={stateStatus === "error" ? "alert" : "status"}>{snapshotMessage}{snapshotCachedAt ? ` · ${formatTimestamp(snapshotCachedAt, locale)}` : ""}</p> : null}

      <div className="runtime-scope-band">
        <strong>{copy.scope}</strong>
        <label>
          <span>{copy.agent}</span>
          <select value={agentId} onChange={(event) => changeAgent(event.currentTarget.value)}>
            <option value="all">{copy.allAgents}</option>
            {(projection?.agents ?? []).map((agent) => <option key={agent.id} value={agent.id}>{agent.label}</option>)}
          </select>
        </label>
        <label>
          <span>{copy.project}</span>
          <select value={projectId} onChange={(event) => setProjectId(event.currentTarget.value)}>
            <option value="all">{copy.allProjects}</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
          </select>
        </label>
        <span className="runtime-loaded-at">{copy.loaded}: {formatTimestamp(projection?.generatedAt, locale)}</span>
      </div>

      <dl className="runtime-summary-band">
        <div><dt>{copy.availability}</dt><dd data-tone={overallStatus.tone}>{overallStatus.label}</dd></div>
        <div><dt>{copy.running}</dt><dd data-tone={projection?.summary.runningCount ? "active" : "muted"}>{projection?.summary.runningCount ?? "-"}</dd></div>
        <div><dt>{copy.attention}</dt><dd data-tone={attentionCount ? "attention" : "muted"}>{projection ? attentionCount : "-"}</dd></div>
      </dl>

      {recoveryNeedsAttention && serviceRecovery ? (
        <section className="runtime-recovery-band" aria-labelledby="runtime-recovery-title" data-status={serviceRecovery.causalRoot.status}>
          <div className="runtime-recovery-heading">
            <CircleAlert aria-hidden="true" size={17} />
            <div>
              <h2 id="runtime-recovery-title">{copy.serviceRecovery}</h2>
              <p>{copy.causalRoot}: {recoveryComponentLabel(serviceRecovery.causalRoot.component, locale)}</p>
            </div>
          </div>
          <dl>
            <div><dt>{copy.mutationGuard}</dt><dd>{recoveryStatusLabel(serviceRecovery, locale)}</dd></div>
            <div><dt>{locale === "zh" ? "状态" : "Status"}</dt><dd>{recoveryReadinessLabel(serviceRecovery, locale)}</dd></div>
          </dl>
          <div className="runtime-recovery-action">
            {serviceRecovery.primaryAction ? (
              pendingRecoveryAction?.actionId === serviceRecovery.primaryAction.actionId ? (
                <div className="runtime-recovery-confirmation" role="group" aria-label={copy.confirmRecovery}>
                  <span>{recoveryActionLabel(serviceRecovery, locale)}</span>
                  <button type="button" disabled={serviceRecoveryBusy} onClick={() => setPendingRecoveryAction(null)}>{copy.cancelRecovery}</button>
                  <button type="button" className="primary" disabled={serviceRecoveryBusy} onClick={() => {
                    const action = pendingRecoveryAction;
                    setPendingRecoveryAction(null);
                    if (action) onRunServiceRecovery(action);
                  }}>{copy.confirmRecovery}</button>
                </div>
              ) : (
                <button type="button" disabled={serviceRecoveryBusy} onClick={() => {
                  if (serviceRecovery.primaryAction?.confirmationRequired) setPendingRecoveryAction(serviceRecovery.primaryAction);
                  else if (serviceRecovery.primaryAction) onRunServiceRecovery(serviceRecovery.primaryAction);
                }}>
                  <RotateCcw className={serviceRecoveryBusy ? "spin" : undefined} aria-hidden="true" size={15} />
                  {recoveryActionLabel(serviceRecovery, locale)}
                </button>
              )
            ) : <span>{copy.noRecoveryAction}</span>}
            {serviceRecoveryFeedback ? <p role={serviceRecoveryFeedback.tone === "attention" ? "alert" : "status"} data-tone={serviceRecoveryFeedback.tone}>{serviceRecoveryFeedback.message}</p> : null}
          </div>
        </section>
      ) : null}

      <div className="runtime-list-heading">
        <div><h2>{copy.tasks}</h2><span>{copy.currentCount} {items.length} {copy.workItems}</span></div>
        <div className="runtime-list-controls">
          <select aria-label={locale === "zh" ? "状态" : "Status"} value={status} onChange={(event) => setStatus(event.currentTarget.value as StatusFilter)}>
            <option value="all">{copy.all}</option>
            <option value="running">{copy.running}</option>
            <option value="attention">{copy.attention}</option>
            <option value="paused">{copy.paused}</option>
            <option value="completed">{copy.completed}</option>
            <option value="stopped">{copy.stopped}</option>
          </select>
          <button type="button" className="runtime-archive-button" aria-pressed={showArchived} onClick={() => { setShowArchived((value) => !value); setOpenStagesFor(null); }}>
            <Archive aria-hidden="true" size={15} />
            {showArchived ? copy.backToCurrent : `${copy.archive} (${projection?.summary.archivedWorkItemCount ?? 0})`}
          </button>
        </div>
      </div>

      {stateStatus === "error" ? <p className="runtime-overview-error" role="alert">{stateError || copy.noData}</p> : null}
      {stateStatus === "ready" && !projection ? <p className="runtime-overview-empty">{copy.noData}</p> : null}
      {projection && items.length === 0 ? <p className="runtime-overview-empty">{copy.noItems}</p> : null}

      {threadError && <p role="alert">{threadError}</p>}
      <div className="runtime-work-list" aria-live="polite">
        {items.map((item) => {
          const category = statusCategory(item);
          const stageLabel = item.currentStageId
            ? localizedStageName(item, item.currentStageId, locale)
            : item.currentStageName ?? copy.noStage;
          const stagesOpen = openStagesFor === item.id;
          const selected = selectedWorkItemId === item.workItemId || selectedWorkItemId === item.id;
          return (
            <article className="runtime-work-row" key={item.id} data-status={category} data-selected={selected}>
              <div className="runtime-work-identity">
                <button type="button" aria-label={`${copy.openDetails}: ${item.title}`} onClick={() => setActiveDomainDetailRoute({ itemId: item.id })}>
                  <strong>{item.projectDisplayName}</strong>
                  <h3>{item.title}</h3>
                  <span><UserRound aria-hidden="true" size={13} />{item.agentDisplayName}</span>
                </button>
              </div>
              <div className="runtime-thread-links">
                {item.canonicalThreadIds?.length && onOpenThread ? item.canonicalThreadIds.map(threadId => <button key={threadId} type="button" disabled={openingThread} onClick={async () => {
                  setOpeningThread(true); setThreadError("");
                  try { setThreadError(await onOpenThread(threadId) ?? ""); } catch (error) { setThreadError(String(error)); } finally { setOpeningThread(false); }
                }}>{locale === "zh" ? "打开会话" : "Open thread"} · {threadId.slice(0, 8)}</button>) : <small>{locale === "zh" ? "Owner 未提供可打开的会话引用" : "No canonical thread ref projected"}</small>}
              </div>
              <div className="runtime-work-status"><span>{item.statusLabel}</span>{item.activeSessionCount ? <small>{item.activeSessionCount} {locale === "zh" ? "个活跃会话" : "active sessions"}</small> : null}</div>
              <div className="runtime-work-progress">
                <button
                  type="button"
                  className="runtime-stage-button"
                  aria-expanded={stagesOpen}
                  aria-controls={`runtime-stages-${item.workItemId}`}
                  onClick={() => setOpenStagesFor(stagesOpen ? null : item.id)}
                >
                  <span>{copy.stage}: {stageLabel}</span><ChevronDown aria-hidden="true" size={14} />
                </button>
                <p><strong>{copy.nextAction}:</strong> {item.nextActionTitle ?? item.nextActionSummary ?? (item.nextStageName ? `${copy.nextStage}: ${item.nextStageName}` : "-")}</p>
                <p><strong>{copy.owner}:</strong> {item.nextActionOwner ?? "-"} <strong>{copy.elapsed}:</strong> {formatDuration(item.elapsedMs, locale)}</p>
                {stagesOpen ? (
                  <section id={`runtime-stages-${item.workItemId}`} className="runtime-stage-popover" aria-label={copy.stageMap}>
                    <header><strong>{copy.stageMap}</strong><button type="button" aria-label={copy.close} title={copy.close} onClick={() => setOpenStagesFor(null)}><X aria-hidden="true" size={14} /></button></header>
                    {item.stages.length ? <ol>{item.stages.map((stage) => <li key={stage.stageId} data-state={stage.state}><span /><div><strong>{(locale === "zh" ? stage.displayNameI18n.zh : stage.displayNameI18n.en) ?? stage.displayName}</strong><small>{stage.state}</small></div></li>)}</ol> : <p>{copy.noStage}</p>}
                  </section>
                ) : null}
              </div>
              <dl className="runtime-work-usage">
                <div><dt>{copy.currentStageUsage}</dt><dd>{formatTokens(item.stageTokens, locale)}</dd></div>
                <div><dt>{copy.cumulativeUsage}</dt><dd>{formatTokens(item.totalTokens, locale)}</dd></div>
                <div className="runtime-work-time"><Clock3 aria-hidden="true" size={13} /><span>{item.updatedAt ? formatTimestamp(item.updatedAt, locale) : "-"}</span></div>
              </dl>
              {selected ? (
                <DomainDetailViewEntryList
                  item={item}
                  locale={locale}
                  onOpen={(view) => setActiveDomainDetailRoute({ itemId: item.id, viewId: view.viewId })}
                />
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
