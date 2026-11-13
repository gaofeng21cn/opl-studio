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
  Info,
  ArrowUpRight,
  UserRound,
  X
} from "lucide-react";
import type { WorkItemRuntimeItem, WorkItemRuntimeProjection } from "./workbenchModel";
import type { ServiceRecoveryModel } from "./serviceRecoveryModel";
import {
  DomainDetailViewEntryList,
  DomainDetailViews
} from "./domainDetailViews";

type RuntimeOverviewPageProps = {
  locale: "zh" | "en";
  projection?: WorkItemRuntimeProjection;
  serviceRecovery?: ServiceRecoveryModel;
  selectedWorkItemId?: string;
  stateStatus: "loading" | "ready" | "error";
  snapshotSource: "live" | "cached" | "none";
  snapshotCachedAt?: string;
  onRefresh(): void;
  onOpenMaintenance(): void;
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
  if (/completed|delivered|success/.test(item.status)) return "completed";
  if (/paused/.test(item.status)) return "paused";
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
  if (value === null) return locale === "zh" ? "用时未记录" : "Elapsed time not recorded";
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

export function RuntimeOverviewPage({
  locale,
  projection,
  serviceRecovery,
  selectedWorkItemId,
  stateStatus,
  snapshotSource,
  snapshotCachedAt,
  onRefresh,
  onOpenMaintenance,
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
  const [activeDomainDetailRoute, setActiveDomainDetailRoute] = useState<ActiveDomainDetailRoute | null>(null);
  const copy = locale === "zh" ? {
    title: "项目运行总览",
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
    refreshing: "Updating; showing the last known state",
    cached: "Showing the last known state",
    stale: "Latest read failed; keeping the last known state"
  };
  const projects = useMemo(() => (projection?.projects ?? []).filter((project) => (
    agentId === "all" || project.agentId === agentId
  )), [agentId, projection?.projects]);
  const scopedItems = useMemo(() => (projection?.items ?? []).filter((item) => (
    (agentId === "all" || item.agentId === agentId)
    && (projectId === "all" || item.projectId === projectId)
  )), [agentId, projectId, projection?.items]);
  const libraryItems = scopedItems.filter((item) => item.archived === showArchived);
  const items = libraryItems.filter((item) => status === "all" || (status === "attention" ? item.attentionKind !== "none" : statusCategory(item) === status));
  const runningCount = libraryItems.filter((item) => statusCategory(item) === "running").length;
  const attentionCount = libraryItems.filter((item) => item.attentionKind !== "none").length;
  const archivedCount = scopedItems.filter((item) => item.archived).length;
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
  const serviceSnapshotIsCurrent = stateStatus === "ready" && snapshotSource === "live";
  const serviceNoticeTone = !serviceSnapshotIsCurrent || serviceRecovery?.causalRoot.status === "unknown" ? "unknown" : "attention";
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
          className="runtime-refresh-button"
          aria-label={copy.refresh}
          title={copy.refresh}
          disabled={stateStatus === "loading"}
          onClick={onRefresh}
        >
          <RefreshCw className={stateStatus === "loading" ? "spin" : undefined} aria-hidden="true" size={16} />
          <span>{stateStatus === "loading" ? copy.loading : (locale === "zh" ? "刷新" : "Refresh")}</span>
        </button>
      </header>
      <p className="runtime-snapshot-note" role="status">
        {snapshotMessage ?? (projection ? copy.readback : stateStatus === "loading" ? copy.loading : copy.noData)}
        {(snapshotCachedAt ?? projection?.generatedAt) ? <> · {copy.loaded} <time dateTime={snapshotCachedAt ?? projection?.generatedAt}>{formatTimestamp(snapshotCachedAt ?? projection?.generatedAt, locale)}</time></> : null}
      </p>

      {projection && recoveryNeedsAttention && serviceRecovery ? (
        <section className="runtime-service-notice" aria-labelledby="runtime-service-title" data-tone={serviceNoticeTone}>
          {serviceNoticeTone === "unknown" ? <Info aria-hidden="true" size={18} /> : <CircleAlert aria-hidden="true" size={18} />}
          <div>
            <h2 id="runtime-service-title">{!serviceSnapshotIsCurrent ? `${copy.cachedService} · ` : ""}{serviceRecovery.causalRoot.detail[locale]}</h2>
            <p>{serviceNoticeTone === "unknown" ? copy.unknownHint : copy.serviceHint}</p>
          </div>
          <button type="button" className="runtime-maintenance-button" onClick={onOpenMaintenance}>
            {copy.openMaintenance}<ArrowUpRight aria-hidden="true" size={15} />
          </button>
        </section>
      ) : null}

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
      </div>

      <div className="runtime-list-heading">
        <div className="runtime-list-summary">
          <h2>{showArchived ? copy.archive : copy.tasks}</h2>
          {projection ? <span>{libraryItems.length} {copy.workItems} · {copy.running} {runningCount} · {copy.attention} {attentionCount}</span> : null}
        </div>
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
            {showArchived ? copy.backToCurrent : `${copy.archive} (${archivedCount})`}
          </button>
        </div>
      </div>

      {!projection ? (
        <div className="runtime-empty-state" role={stateStatus === "error" ? "alert" : "status"}>
          <h3>{stateStatus === "loading" ? copy.loading : copy.noData}</h3>
          {stateStatus !== "loading" ? <><p>{copy.unavailableHint}</p><div>
            <button type="button" className="runtime-refresh-button" onClick={onRefresh}>{copy.retry}</button>
            <button type="button" className="runtime-maintenance-button" onClick={onOpenMaintenance}>{copy.openMaintenance}</button>
          </div></> : <div className="runtime-loading-placeholder" aria-hidden="true"><span /><span /><span /></div>}
        </div>
      ) : items.length === 0 ? (
        <div className="runtime-empty-state" role="status">
          <h3>{status !== "all" && libraryItems.length ? copy.noMatch : showArchived ? copy.noArchived : copy.noItems}</h3>
          {status !== "all" ? <button type="button" className="runtime-refresh-button" onClick={() => setStatus("all")}>{copy.clearFilter}</button> : <p>{copy.emptyHint}</p>}
        </div>
      ) : null}

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
                {item.canonicalThreadIds?.length && onOpenThread ? <div className="runtime-thread-links">
                  {item.canonicalThreadIds.map((threadId, index) => <button key={threadId} type="button" disabled={openingThread} onClick={async () => {
                    setOpeningThread(true); setThreadError("");
                    try { setThreadError(await onOpenThread(threadId) ?? ""); } catch (error) { setThreadError(String(error)); } finally { setOpeningThread(false); }
                  }}>{locale === "zh" ? "打开会话" : "Open thread"}{item.canonicalThreadIds!.length > 1 ? ` ${index + 1}` : ""}</button>)}
                </div> : null}
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
