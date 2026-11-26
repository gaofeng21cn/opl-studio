import { useState, type ComponentType } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  CircleAlert,
  CircleDot,
  Clock3,
  FolderOpen,
  MessageSquare,
  Route
} from "lucide-react";
import type { McpAppProps, WorkItemRuntimeItem } from "@gaofeng21cn/opl-host-contracts";
import {
  computeStageProgress,
  formatDuration,
  formatTimestamp,
  formatTokens,
  isStageActive,
  isStageAttention,
  isStageCompleted,
  localizeActionTitle,
  localizeOwnerName,
  localizePrimaryState,
  localizeStageState,
  localizedStageName,
  normalizeStageStateKey,
  statusTone,
  type RuntimeLocale
} from "./runtimeStatusHelpers";

export type WorkItemDetailDrawerProps = {
  item: WorkItemRuntimeItem;
  locale: RuntimeLocale;
  initialViewId?: string;
  mcpApps?: Omit<McpAppProps, "locale">;
  TaskWorkbenchComponent?: ComponentType<any>;
  archiveBusy?: boolean;
  onBack(): void;
  onOpenMaterials?(item: WorkItemRuntimeItem): void;
  onOpenThread?(threadId: string): Promise<string | null>;
  onRequestArchive?(item: WorkItemRuntimeItem, archived: boolean): void;
};

export function WorkItemDetailDrawer({
  item,
  locale,
  initialViewId,
  mcpApps,
  TaskWorkbenchComponent,
  archiveBusy,
  onBack,
  onOpenMaterials,
  onOpenThread,
  onRequestArchive
}: WorkItemDetailDrawerProps) {
  const zh = locale === "zh";
  const [selectedViewId, setSelectedViewId] = useState<string | undefined>(initialViewId);
  const [workbenchOpen, setWorkbenchOpen] = useState(Boolean(initialViewId));
  const [threadError, setThreadError] = useState("");
  const [openingThread, setOpeningThread] = useState(false);

  const progress = computeStageProgress(item);
  const tone = statusTone(item.status);
  const views = item.domainDetailViews ?? [];

  if (workbenchOpen) {
    const activeView = views.find((v) => v.viewId === selectedViewId) ?? views[0];
    const route = `/runtime/item/${encodeURIComponent(item.id)}/insights/${encodeURIComponent(activeView?.viewId ?? "task")}`;
    return (
      <section
        className="opl-runtime-overview runtime-domain-view"
        data-testid="opl-runtime-domain-detail-page"
        data-route={route}
        aria-labelledby="runtime-domain-view-title"
      >
        <header className="runtime-overview-header runtime-domain-view-header">
          <div>
            <button
              type="button"
              className="runtime-icon-button"
              aria-label={zh ? "返回任务详情" : "Back to work item details"}
              title={zh ? "返回任务详情" : "Back to work item details"}
              onClick={() => setWorkbenchOpen(false)}
            >
              <ArrowLeft aria-hidden="true" size={16} />
            </button>
            <div className="runtime-domain-view-title">
              <span>{item.agentDisplayName} / {item.projectDisplayName}</span>
              <h1 id="runtime-domain-view-title">
                {activeView?.title ?? (zh ? "领域任务工作台" : "Task workbench")}
              </h1>
            </div>
          </div>
          {onOpenMaterials ? (
            <button type="button" className="runtime-btn-secondary" onClick={() => onOpenMaterials(item)}>
              <FolderOpen aria-hidden="true" size={14} />
              <span>{zh ? "查看交付材料" : "Deliverables"}</span>
            </button>
          ) : null}
        </header>
        {TaskWorkbenchComponent && mcpApps ? (
          <TaskWorkbenchComponent
            {...mcpApps}
            locale={locale}
            itemId={item.id}
            viewId={activeView?.viewId}
          />
        ) : (
          <p className="runtime-overview-empty" role="status">
            {zh ? "任务工作台连接暂不可用" : "Task workbench is unavailable"}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      className="opl-runtime-overview runtime-detail-page"
      data-testid="opl-runtime-work-item-detail"
      aria-labelledby="runtime-detail-title"
    >
      <header className="runtime-overview-header runtime-detail-header">
        <div>
          <button
            type="button"
            className="runtime-icon-button"
            aria-label={zh ? "返回运行状态总览" : "Back to runtime status"}
            title={zh ? "返回运行状态总览" : "Back to runtime status"}
            onClick={onBack}
          >
            <ArrowLeft aria-hidden="true" size={16} />
          </button>
          <div className="runtime-domain-view-title">
            <span>{item.agentDisplayName} · {item.projectDisplayName}</span>
            <h1 id="runtime-detail-title">{item.title}</h1>
          </div>
        </div>
        <div className="runtime-detail-header-actions">
          <span className="runtime-status-badge" data-tone={tone}>
            <span className="runtime-status-dot" aria-hidden="true" />
            {localizePrimaryState(item.status, locale)}
          </span>
        </div>
      </header>

      <div className="runtime-detail-action-strip">
        {onOpenMaterials ? (
          <button type="button" className="runtime-btn-primary" onClick={() => onOpenMaterials(item)}>
            <FolderOpen aria-hidden="true" size={15} />
            <span>{zh ? "在资料空间查看交付材料" : "View deliverables in Materials Space"}</span>
          </button>
        ) : null}
        {item.canonicalThreadIds?.length && onOpenThread ? (
          item.canonicalThreadIds.map((threadId, idx) => (
            <button
              key={threadId}
              type="button"
              className="runtime-btn-secondary"
              disabled={openingThread}
              onClick={async () => {
                setOpeningThread(true);
                setThreadError("");
                try {
                  setThreadError((await onOpenThread(threadId)) ?? "");
                } catch (reason) {
                  setThreadError(String(reason));
                } finally {
                  setOpeningThread(false);
                }
              }}
            >
              <MessageSquare aria-hidden="true" size={14} />
              <span>
                {zh ? "打开关联会话" : "Open thread"}
                {item.canonicalThreadIds!.length > 1 ? ` ${idx + 1}` : ""}
              </span>
            </button>
          ))
        ) : null}
        {onRequestArchive ? (
          <button
            type="button"
            className="runtime-btn-secondary"
            disabled={archiveBusy}
            onClick={() => onRequestArchive(item, !item.archived)}
          >
            {item.archived ? <ArchiveRestore aria-hidden="true" size={14} /> : <Archive aria-hidden="true" size={14} />}
            <span>{item.archived ? (zh ? "恢复到当前列表" : "Restore") : (zh ? "归档隐藏" : "Archive")}</span>
          </button>
        ) : null}
      </div>

      {threadError ? <p className="runtime-inline-alert" role="alert">{threadError}</p> : null}

      <div className="runtime-detail-grid">
        <article className="runtime-detail-card runtime-detail-card-wide">
          <header>
            <h2>{zh ? "1. 阶段进度图 (Stage Map)" : "1. Stage Map"}</h2>
            <span>
              {progress.completedCount}/{progress.totalCount} ({progress.percent}%)
              {item.attemptId ? ` · ${zh ? "当前尝试" : "Attempt"}: ${item.attemptId}` : ""}
            </span>
          </header>
          {progress.displayStages.length ? (
            <ol className="runtime-detail-stage-list">
              {progress.displayStages.map((stage, index) => {
                const key = normalizeStageStateKey(stage.state);
                const stageTone = isStageCompleted(key)
                  ? "completed"
                  : isStageActive(key)
                    ? "active"
                    : isStageAttention(key)
                      ? "attention"
                      : "pending";
                const isCurrent = item.currentStageId === stage.stageId;
                return (
                  <li key={stage.stageId} data-tone={stageTone} data-current={isCurrent || undefined}>
                    <span className="runtime-stage-node" aria-hidden="true">
                      {stageTone === "completed" ? <Check size={13} /> : stageTone === "active" ? <CircleDot size={13} /> : stageTone === "attention" ? <CircleAlert size={13} /> : <Clock3 size={12} />}
                    </span>
                    <div>
                      <strong>{index + 1}. {localizedStageName(stage, locale)}</strong>
                      <div className="runtime-stage-sub">
                        <span className="runtime-stage-state-badge" data-tone={stageTone}>
                          {localizeStageState(stage.state, locale)}
                        </span>
                        {stage.ownerDisplayName ? <small>{stage.ownerDisplayName}</small> : null}
                        {stage.elapsedSeconds !== null ? <small>{Math.round(stage.elapsedSeconds)}s</small> : null}
                        {stage.totalTokens !== null ? <small>{formatTokens(stage.totalTokens, "observed", locale)} tok</small> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="runtime-detail-muted">{zh ? "当前暂无阶段历程记录。" : "No stage history available."}</p>
          )}
        </article>

        <article className="runtime-detail-card">
          <h2>{zh ? "2. 当前与下一阶段" : "2. Current & Next Stage"}</h2>
          <dl className="runtime-detail-kv">
            <div>
              <dt>{zh ? "当前阶段" : "Current stage"}</dt>
              <dd>{progress.currentStage ? localizedStageName(progress.currentStage, locale) : item.currentStageName ?? (zh ? "暂无当前阶段" : "None")}</dd>
            </div>
            <div>
              <dt>{zh ? "下一阶段" : "Next stage"}</dt>
              <dd>{item.nextStageName ?? "-"}</dd>
            </div>
            <div>
              <dt>{zh ? "执行状态" : "Execution state"}</dt>
              <dd>{item.executionState}</dd>
            </div>
          </dl>
        </article>

        <article className="runtime-detail-card">
          <h2>{zh ? "3. 运行时长与心跳" : "3. Elapsed & Heartbeat"}</h2>
          <dl className="runtime-detail-kv">
            <div>
              <dt>{zh ? "已用时" : "Elapsed"}</dt>
              <dd>{formatDuration(item.elapsedMs, locale)}</dd>
            </div>
            <div>
              <dt>{zh ? "最近心跳" : "Last heartbeat"}</dt>
              <dd>{item.lastHeartbeatAt ? formatTimestamp(item.lastHeartbeatAt, locale) : (zh ? "未记录" : "Not recorded")}</dd>
            </div>
            <div>
              <dt>{zh ? "活跃会话" : "Active sessions"}</dt>
              <dd>{item.activeSessionCount}</dd>
            </div>
            <div>
              <dt>{zh ? "最近更新" : "Updated"}</dt>
              <dd>{formatTimestamp(item.updatedAt, locale)}</dd>
            </div>
          </dl>
        </article>

        <article className="runtime-detail-card">
          <h2>{zh ? "4. Token 用量" : "4. Token Telemetry"}</h2>
          <dl className="runtime-detail-kv">
            <div>
              <dt>{zh ? "当前阶段 Token" : "Current stage"}</dt>
              <dd>{formatTokens(item.stageTokens, item.stageTokensState, locale)}</dd>
            </div>
            <div>
              <dt>{zh ? "任务累计 Token" : "Cumulative total"}</dt>
              <dd>{formatTokens(item.totalTokens, item.cumulativeTokensState ?? item.telemetryState, locale)}</dd>
            </div>
          </dl>
        </article>

        <article className="runtime-detail-card">
          <h2>{zh ? "5. 下一步与责任说明" : "5. Next Action & Owner"}</h2>
          <dl className="runtime-detail-kv">
            <div>
              <dt>{zh ? "下一步" : "Next action"}</dt>
              <dd>{localizeActionTitle(item, locale)}</dd>
            </div>
            <div>
              <dt>{zh ? "负责人" : "Owner"}</dt>
              <dd>{localizeOwnerName(item, locale)}</dd>
            </div>
          </dl>
          {item.status === "system_attention" && item.attention ? (
            <div className="runtime-attention-envelope">
              {item.attention.responsibleComponent ? <p><strong>{zh ? "责任组件：" : "Component: "}</strong>{item.attention.responsibleComponent}</p> : null}
              {item.attention.issue ? <p><strong>{zh ? "阻塞问题：" : "Issue: "}</strong>{item.attention.issue}</p> : null}
              {item.attention.repairAction ? <p><strong>{zh ? "处理动作：" : "Repair: "}</strong>{item.attention.repairAction}</p> : null}
              {item.attention.impact ? <p><strong>{zh ? "影响：" : "Impact: "}</strong>{item.attention.impact}</p> : null}
            </div>
          ) : null}
        </article>

        {views.length > 0 ? (
          <article className="runtime-detail-card runtime-detail-card-wide">
            <h2>{zh ? "领域任务视图" : "Typed Domain Views"}</h2>
            <div className="runtime-domain-view-entry-list" role="list">
              {views.map((view) => (
                <button
                  key={view.viewId}
                  type="button"
                  role="listitem"
                  data-view-id={view.viewId}
                  data-view-kind={view.viewKind}
                  onClick={() => {
                    setSelectedViewId(view.viewId);
                    setWorkbenchOpen(true);
                  }}
                >
                  <Route aria-hidden="true" size={14} />
                  <span>{view.title ?? view.viewId}</span>
                </button>
              ))}
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
