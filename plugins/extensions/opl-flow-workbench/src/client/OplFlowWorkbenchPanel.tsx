import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, Play, Plus, RefreshCw, ShieldAlert, Square } from "lucide-react";
import type { OplStudioShellService } from "@gaofeng21cn/opl-host-contracts";
import {
  Button,
  EmptyState,
  PluginErrorBoundary,
  StatusPill,
  useOplLocale,
  useOplStudioShellSnapshot
} from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import {
  executeOplFlowAction,
  readOplFlowDashboard,
  resolveStudioWindowBridge,
  type OplFlowCarrier,
  type OplFlowDashboardEnvelope,
  type OplFlowInboxEntry,
  type OplFlowSessionEntry,
  type OplFlowTabId,
  type StudioWindowBridge
} from "./oplFlowBridge";
import "./opl-flow-workbench.css";

const TABS: readonly { id: OplFlowTabId; zh: string; en: string }[] = [
  { id: "needs_action", zh: "需你拍板", en: "Needs action" },
  { id: "safe_to_archive", zh: "待批归档", en: "Ready to archive" },
  { id: "active_objectives", zh: "进行中", en: "Active" },
  { id: "active_sessions", zh: "活跃对话", en: "Active sessions" },
  { id: "blocked", zh: "外部阻塞", en: "Blocked" },
  { id: "backlog", zh: "待排期", en: "Backlog" },
  { id: "pending_events", zh: "待处理事件", en: "Pending events" }
];

function carrierDisplayName(carrier: string | null | undefined, zh: boolean): string {
  if (carrier === "codex") return "Codex";
  if (carrier === "antigravity") return "AntiGravity";
  if (carrier === "dsh") return "OPL DSH";
  return zh ? "自动选择" : "Auto";
}

export type OplFlowWorkbenchPanelProps = {
  shell: Pick<
    OplStudioShellService,
    "getSnapshot" | "subscribe" | "executeAction" | "openPrimaryView" | "openThread" | "startConversationInWorkspace"
  >;
  bridge?: StudioWindowBridge;
};

export function OplFlowWorkbenchInner({ shell, bridge: explicitBridge }: OplFlowWorkbenchPanelProps) {
  const snapshot = useOplStudioShellSnapshot(shell as OplStudioShellService);
  const locale = useOplLocale(snapshot.locale);
  const zh = locale === "zh";
  const bridge = explicitBridge ?? resolveStudioWindowBridge();

  const [dashboard, setDashboard] = useState<OplFlowDashboardEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<OplFlowTabId>("needs_action");
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [objectiveId, setObjectiveId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [executor, setExecutor] = useState<"" | OplFlowCarrier>("");
  const [executionMode, setExecutionMode] = useState<"active" | "backlog">("active");
  const [runNow, setRunNow] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await readOplFlowDashboard(bridge);
      setDashboard(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const data = dashboard?.state === "ready" ? dashboard.data : undefined;
  const counts = data?.counts;

  const firstNonEmptyTab = useMemo<OplFlowTabId>(() => {
    if (!counts) return "needs_action";
    for (const tab of TABS) {
      if ((counts[tab.id] ?? 0) > 0) return tab.id;
    }
    return "needs_action";
  }, [counts]);

  useEffect(() => {
    if (counts && (counts[activeTab] ?? 0) === 0 && (counts[firstNonEmptyTab] ?? 0) > 0) {
      setActiveTab(firstNonEmptyTab);
    }
  }, [counts, activeTab, firstNonEmptyTab]);

  async function runAction(
    ref: "opl-flow.decision.v1#send" | "opl-flow.decision.v1#approve" | "opl-flow.decision.v1#tick" | "opl-flow.decision.v1#service",
    input: Record<string, unknown>,
    fallbackMessage: string
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await executeOplFlowAction(shell, ref, input);
      setNotice(typeof result.message === "string" && result.message ? result.message : fallbackMessage);
      await refresh();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitSend(event: FormEvent) {
    event.preventDefault();
    const cleanMsg = message.trim();
    if (!cleanMsg) {
      setError(zh ? "请输入任务描述或回复指令。" : "Enter a task instruction or reply.");
      return;
    }
    const payload: Record<string, unknown> = {
      message: cleanMsg,
      execution_mode: executionMode,
      now: runNow
    };
    if (objectiveId.trim()) payload.objective_id = objectiveId.trim();
    else if (title.trim()) payload.title = title.trim();
    if (executor) payload.executor = executor;
    const ok = await runAction(
      "opl-flow.decision.v1#send",
      payload,
      zh ? "已投递至 OPL Flow 队列。" : "Submitted to OPL Flow."
    );
    if (ok) {
      setMessage("");
      setTitle("");
      setObjectiveId("");
      setComposeOpen(false);
    }
  }

  function handleNavigateObjective(entry: OplFlowInboxEntry) {
    if (entry.jump_mode === "native_switch" && entry.thread_id) {
      void shell.openThread(entry.thread_id);
      return;
    }
    if (entry.workspace_path) {
      shell.startConversationInWorkspace(entry.workspace_path);
      return;
    }
    shell.openPrimaryView("conversation");
  }

  function handleNavigateSession(sess: OplFlowSessionEntry) {
    if (sess.jump_mode === "native_switch" && sess.thread_id) {
      void shell.openThread(sess.thread_id);
      return;
    }
    if (sess.workspace_path) {
      shell.startConversationInWorkspace(sess.workspace_path);
    }
  }

  function renderObjectiveAction(entry: OplFlowInboxEntry) {
    const mode = entry.jump_mode;
    if (mode === "native_switch" && entry.thread_id) {
      return (
        <Button size="sm" variant="outline" onClick={() => handleNavigateObjective(entry)}>
          <ArrowUpRight size={13} aria-hidden="true" />
          <span>{zh ? "切换原生会话" : "Open thread"}</span>
        </Button>
      );
    }
    if (mode === "external_focus_only") {
      return (
        <>
          <span className="opl-flow-badge" data-carrier={entry.execution_carrier ?? undefined}>
            {zh
              ? `当前由 ${carrierDisplayName(entry.execution_carrier, zh)} 持有`
              : `Held by ${carrierDisplayName(entry.execution_carrier, zh)}`}
          </span>
          {entry.workspace_path ? (
            <Button size="sm" variant="outline" onClick={() => shell.startConversationInWorkspace(entry.workspace_path!)}>
              <ArrowUpRight size={13} aria-hidden="true" />
              <span>{zh ? "在此工作区新建 Codex 会话" : "New Codex session here"}</span>
            </Button>
          ) : null}
        </>
      );
    }
    return (
      <Button size="sm" variant="outline" onClick={() => handleNavigateObjective(entry)}>
        <ArrowUpRight size={13} aria-hidden="true" />
        <span>{zh ? "在原生会话继续" : "Continue in native chat"}</span>
      </Button>
    );
  }

  const serviceRunning = Boolean(data?.service?.running);
  const serviceBridge = data?.service?.bridge || "auto";
  const currentEntries = (activeTab !== "active_sessions" && activeTab !== "pending_events"
    ? data?.inbox?.[activeTab] ?? []
    : []) as OplFlowInboxEntry[];
  const activeSessions = ((data?.inbox?.active_sessions?.length ? data.inbox.active_sessions : data?.active_sessions?.sessions) ?? []) as OplFlowSessionEntry[];
  const pendingEvents = data?.inbox?.pending_events ?? [];
  const occupants = (data?.inbox?.active_workspace_occupants?.length ? data.inbox.active_workspace_occupants : data?.active_sessions?.active_workspace_occupants) ?? [];

  return (
    <section className="opl-flow-workbench" data-testid="opl-flow-workbench">
      <header className="opl-flow-header">
        <div>
          <div className="opl-flow-title-row">
            <h1>{zh ? "OPL Flow 总控" : "OPL Flow Control Tower"}</h1>
            {data?.instance_name ? <span className="opl-flow-badge">{data.instance_name}</span> : null}
          </div>
          <p className="opl-flow-boundary-note">
            {zh
              ? "个人跨 Codex / AntiGravity / OPL DSH 与多机器 Beads/Dolt 长期目标总账与自动路由控制塔（不自建第二套聊天框）。本机 Runway 阶段任务看「运行状态」，单会话组队看「智能体协作」，外部来单看「Superagent 工单台」。"
              : "Personal cross-carrier Beads/Dolt ledger and zero-token auto-router control tower. Use Runtime for local Runway stages, Agent collaboration for in-thread teams, and Superagent Tickets for external intake."}
          </p>
        </div>
        <div className="opl-flow-header-actions">
          <Button size="sm" variant="outline" onClick={() => shell.openPrimaryView("runtime")}>
            {zh ? "运行状态" : "Runtime"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setComposeOpen((prev) => !prev)}>
            <Plus size={14} aria-hidden="true" />
            <span>{zh ? "投递任务 / 指令" : "Dispatch"}</span>
          </Button>
          <Button size="sm" variant="outline" disabled={loading || busy} onClick={() => void refresh()}>
            <RefreshCw size={14} aria-hidden="true" />
            <span>{zh ? "刷新" : "Refresh"}</span>
          </Button>
        </div>
      </header>

      {error ? <p className="opl-flow-alert" role="alert">{error}</p> : null}
      {notice ? <p className="opl-flow-notice" role="status">{notice}</p> : null}

      {dashboard?.state === "unavailable" ? (
        <div className="opl-flow-card">
          <EmptyState
            title={zh ? "本机尚未绑定 OPL Flow 实例" : "OPL Flow instance not bound"}
            detail={dashboard.reason || (zh ? "请先在原生会话执行 $opl-flow start 完成 Beads/Dolt 总账初始化。" : "Run $opl-flow start in a conversation to bind an instance.")}
            action={(
              <Button size="sm" onClick={() => shell.openPrimaryView("conversation")}>
                {zh ? "前往对话初始化" : "Go to conversation"}
              </Button>
            )}
          />
        </div>
      ) : null}

      {data ? (
        <>
          <div className="opl-flow-card opl-flow-router-bar">
            <div className="opl-flow-router-meta">
              <StatusPill
                state={serviceRunning ? "done" : "idle"}
                label={serviceRunning ? (zh ? "后台路由器运行中" : "Router running") : (zh ? "后台路由器未启动" : "Router stopped")}
              />
              <span className="opl-flow-badge">{`bridge: ${serviceBridge}`}</span>
              {occupants.length > 0 ? (
                <span className="opl-flow-badge">
                  <ShieldAlert size={12} aria-hidden="true" />
                  <span>{zh ? `防撞车保护 ${occupants.length} 个工作区` : `${occupants.length} workspace guards`}</span>
                </span>
              ) : null}
            </div>
            <div className="opl-flow-item-actions">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void runAction(
                  "opl-flow.decision.v1#service",
                  { action: serviceRunning ? "down" : "up", bridge: "auto", confirmed: true },
                  serviceRunning ? (zh ? "已停止后台路由。" : "Router stopped.") : (zh ? "已启动后台路由。" : "Router started.")
                )}
              >
                {serviceRunning ? <Square size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />}
                <span>{serviceRunning ? (zh ? "停止路由" : "Stop router") : (zh ? "启动自动路由" : "Start auto router")}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void runAction(
                  "opl-flow.decision.v1#tick",
                  { dry_run: false },
                  zh ? "已完成一轮状态推进。" : "Router tick completed."
                )}
              >
                <span>{zh ? "立即评估 (Tick)" : "Tick now"}</span>
              </Button>
            </div>
          </div>

          {composeOpen ? (
            <form className="opl-flow-card" onSubmit={(event) => void handleSubmitSend(event)}>
              <div className="opl-flow-form-grid">
                <label className="opl-flow-field">
                  <span>{zh ? "目标编号（留空则新建目标）" : "Objective ID (blank to create)"}</span>
                  <input
                    className="opl-flow-input"
                    value={objectiveId}
                    onChange={(event) => setObjectiveId(event.target.value)}
                    placeholder={zh ? "例如 opl-123" : "e.g. opl-123"}
                  />
                </label>
                {!objectiveId.trim() ? (
                  <label className="opl-flow-field">
                    <span>{zh ? "目标标题（新建可选）" : "Title (optional)"}</span>
                    <input
                      className="opl-flow-input"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={zh ? "一句话描述目标" : "Short objective title"}
                    />
                  </label>
                ) : null}
                <label className="opl-flow-field">
                  <span>{zh ? "执行载体" : "Executor"}</span>
                  <select
                    className="opl-flow-select"
                    value={executor}
                    onChange={(event) => setExecutor(event.target.value as "" | OplFlowCarrier)}
                  >
                    <option value="">{zh ? "自动路由 (auto)" : "Auto"}</option>
                    <option value="codex">Codex</option>
                    <option value="antigravity">AntiGravity</option>
                    <option value="dsh">OPL DSH</option>
                  </select>
                </label>
                <label className="opl-flow-field">
                  <span>{zh ? "队列模式" : "Mode"}</span>
                  <select
                    className="opl-flow-select"
                    value={executionMode}
                    onChange={(event) => setExecutionMode(event.target.value as "active" | "backlog")}
                  >
                    <option value="active">{zh ? "立即排入进行中 (active)" : "Active"}</option>
                    <option value="backlog">{zh ? "暂存待排期 (backlog)" : "Backlog"}</option>
                  </select>
                </label>
              </div>
              <label className="opl-flow-field">
                <span>{zh ? "任务内容或拍板指令" : "Instruction"}</span>
                <textarea
                  className="opl-flow-textarea"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={zh ? "说明目标、验收要求或针对待拍板项的回复…" : "Describe goal, acceptance criteria, or decision…"}
                />
              </label>
              <div className="opl-flow-form-footer">
                <label className="opl-flow-badge">
                  <input type="checkbox" checked={runNow} onChange={(event) => setRunNow(event.target.checked)} />
                  <span>{zh ? "投递后立即执行一轮状态评估" : "Run router tick immediately"}</span>
                </label>
                <div className="opl-flow-item-actions">
                  <Button size="sm" variant="outline" type="button" onClick={() => setComposeOpen(false)}>
                    {zh ? "取消" : "Cancel"}
                  </Button>
                  <Button size="sm" type="submit" disabled={busy}>
                    {zh ? "确认投递" : "Submit"}
                  </Button>
                </div>
              </div>
            </form>
          ) : null}

          <div className="opl-flow-tablist" role="tablist" aria-label={zh ? "OPL Flow 控制塔分类" : "Control tower sections"}>
            {TABS.map((tab) => {
              const count = counts?.[tab.id] ?? 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className="opl-flow-tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span>{zh ? tab.zh : tab.en}</span>
                  <span className="opl-flow-tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          {activeTab === "active_sessions" ? (
            <div className="opl-flow-list">
              {activeSessions.length === 0 ? (
                <div className="opl-flow-card">
                  <EmptyState
                    title={zh ? "当前无活跃或近期本地会话" : "No active local sessions"}
                    detail={zh ? "在 Codex、AntiGravity 或 OPL DSH 开启对话后，此处会自动零 Token 感知并发防撞车。" : "Active chats across Codex, AntiGravity, and OPL DSH appear here."}
                  />
                </div>
              ) : activeSessions.map((sess) => (
                <article className="opl-flow-card" key={sess.session_ref}>
                  <div className="opl-flow-item-head">
                    <div className="opl-flow-item-title">
                      <span className="opl-flow-badge" data-carrier={sess.carrier}>{carrierDisplayName(sess.carrier, zh)}</span>
                      <strong>{sess.title || sess.model_label || sess.session_ref}</strong>
                      <span className="opl-flow-badge">{sess.workspace_label || (zh ? "未标注目录" : "Unscoped")}</span>
                      {sess.bound_bead_id ? (
                        <span className="opl-flow-badge">{`Bead: ${sess.bound_bead_id}`}</span>
                      ) : (
                        <span className="opl-flow-badge">{zh ? "自由对话·仅防撞车" : "Unbound · guard only"}</span>
                      )}
                    </div>
                    <div className="opl-flow-item-actions">
                      {sess.jump_mode === "native_switch" && sess.thread_id ? (
                        <Button size="sm" variant="outline" onClick={() => handleNavigateSession(sess)}>
                          <ArrowUpRight size={13} aria-hidden="true" />
                          <span>{zh ? "切换到此 Codex 会话" : "Switch to Codex thread"}</span>
                        </Button>
                      ) : (
                        <>
                          <span className="opl-flow-badge">
                            {zh ? `外部载体：${carrierDisplayName(sess.carrier, zh)}` : `External: ${carrierDisplayName(sess.carrier, zh)}`}
                          </span>
                          {sess.workspace_path ? (
                            <Button size="sm" variant="outline" onClick={() => shell.startConversationInWorkspace(sess.workspace_path!)}>
                              <ArrowUpRight size={13} aria-hidden="true" />
                              <span>{zh ? "在同目录新建 Codex 会话" : "New Codex chat here"}</span>
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="opl-flow-item-meta">
                    {`${sess.session_ref} · ${sess.status || "idle"}${sess.model_label ? ` · ${sess.model_label}` : ""}`}
                  </div>
                </article>
              ))}
            </div>
          ) : activeTab === "pending_events" ? (
            <div className="opl-flow-list">
              {pendingEvents.length === 0 ? (
                <div className="opl-flow-card">
                  <EmptyState
                    title={zh ? "当前无待处理事件" : "No pending events"}
                    detail={zh ? "新投递任务、人工拍板或 Worker 回调事件会在此排队等待 Router 处理。" : "Queued events appear here."}
                  />
                </div>
              ) : pendingEvents.map((ev) => (
                <article className="opl-flow-card" key={ev.event_id}>
                  <div className="opl-flow-item-title">
                    <span className="opl-flow-badge">{ev.event_type}</span>
                    <strong>{ev.objective_id}</strong>
                    <span className="opl-flow-badge">{ev.status || "pending"}</span>
                  </div>
                  {ev.summary ? <div className="opl-flow-item-meta">{ev.summary}</div> : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="opl-flow-list">
              {currentEntries.length === 0 ? (
                <div className="opl-flow-card">
                  <EmptyState
                    title={zh ? "该分类下暂无目标" : "No items in this view"}
                    detail={zh ? "可以点击右上角「投递任务 / 指令」新建目标，或在原生对话继续已有工作。" : "Use Dispatch to submit a new objective."}
                  />
                </div>
              ) : currentEntries.map((entry) => (
                <article className="opl-flow-card" key={entry.bead_id}>
                  <div className="opl-flow-item-head">
                    <div className="opl-flow-item-title">
                      <strong>{entry.title}</strong>
                      <span className="opl-flow-badge">{entry.bead_id}</span>
                      {entry.execution_carrier ? (
                        <span className="opl-flow-badge" data-carrier={entry.execution_carrier}>
                          {carrierDisplayName(entry.execution_carrier, zh)}
                        </span>
                      ) : null}
                    </div>
                    <div className="opl-flow-item-actions">
                      {renderObjectiveAction(entry)}
                      {activeTab === "safe_to_archive" ? (
                        confirmApproveId === entry.bead_id ? (
                          <>
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                setConfirmApproveId(null);
                                void runAction(
                                  "opl-flow.decision.v1#approve",
                                  { bead_id: entry.bead_id, approved_by: "owner", confirmed: true },
                                  zh ? `已批准归档 ${entry.bead_id}。` : `Approved archive for ${entry.bead_id}.`
                                );
                              }}
                            >
                              {zh ? "确认归档" : "Confirm archive"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmApproveId(null)}>
                              {zh ? "取消" : "Cancel"}
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setConfirmApproveId(entry.bead_id)}>
                            {zh ? "批准归档" : "Approve archive"}
                          </Button>
                        )
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setObjectiveId(entry.bead_id);
                            setComposeOpen(true);
                          }}
                        >
                          {zh ? "追加指令" : "Reply"}
                        </Button>
                      )}
                    </div>
                  </div>
                  {entry.first_blocker || entry.next_action ? (
                    <div className="opl-flow-item-meta">
                      {entry.first_blocker
                        ? `${zh ? "阻塞" : "Blocker"}: ${entry.first_blocker}`
                        : `${zh ? "下一步" : "Next"}: ${entry.next_action}`}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

export function OplFlowWorkbenchPanel({ shell, bridge }: OplFlowWorkbenchPanelProps) {
  const snapshot = useOplStudioShellSnapshot(shell as OplStudioShellService);
  const locale = useOplLocale(snapshot.locale);
  const zh = locale === "zh";
  const [reloadNonce, setReloadNonce] = useState(0);
  return (
    <PluginErrorBoundary
      pluginId="@gaofeng21cn/opl-flow-workbench"
      pluginLabel={zh ? "OPL Flow 总控" : "OPL Flow"}
      locale={locale}
      onOpenSoftwareCenter={() => shell.openPrimaryView("applications")}
      onReloadView={() => setReloadNonce((value) => value + 1)}
    >
      <OplFlowWorkbenchInner key={reloadNonce} shell={shell} bridge={bridge} />
    </PluginErrorBoundary>
  );
}
