import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { Activity, AlertCircle, Check, CheckCircle2, ChevronDown, ChevronRight, Files, Folder, LoaderCircle, PanelRight, Puzzle, RefreshCw, Settings as SettingsIcon, Shield, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { IconChevronDownOutline14, Menu, OnboardingSurface, RiskConfirmation, type MenuEntry } from "@deepseek-ai/dsh-client-ui-primitives";
import {
  SlotCore,
  type HostObservable,
  type SessionMaybeProvideInfo,
  type SlotRendererHost
} from "@deepseek-ai/dsh-client-ui-slots";
import { createSlotRenderer } from "../vendor/deepseek-harness/packages/client/ui-renderer/src/client/scoped-slots.tsx";
import { AppFrame } from "@opl-vendor/dsh-app-frame";
import { SidebarRoot } from "@opl-vendor/dsh-sidebar-root";
import { ConversationRoot } from "@opl-vendor/dsh-conversation-root";
import { InputBar } from "@opl-vendor/dsh-input-bar";
import { QueueDock } from "@opl-vendor/dsh-queue-dock";
import { SettingsRoot } from "@opl-vendor/dsh-settings-root";
import { WorkspaceBrowser } from "@opl-vendor/dsh-workspace-browser";
import { SessionNodeItem, type DshSessionNode } from "@opl-vendor/dsh-session-node";
import { AgentPresetSeat } from "@opl-vendor/dsh-agent-preset-seat";
import { createWorkspaceViewStore } from "../vendor/deepseek-harness/packages/client/ui-workspace/src/client/stores.ts";
import { zh as workspaceZh, en as workspaceEn } from "../vendor/deepseek-harness/packages/client/ui-workspace/src/client/locales.ts";
import { zh as modelZh, en as modelEn } from "../vendor/deepseek-harness/packages/client/ui-model-selection/src/client/locales.ts";
import { zh as agentZh, en as agentEn } from "../vendor/deepseek-harness/packages/client/ui-agent-preset/src/client/locales.ts";
import {
  createSnapshotStore,
  type SessionListState,
  type WorkspaceListState,
} from "../integrations/deepseek-harness/runtimeShim";
import App from "../workbench/App";
import { settingsDestinations, type SettingsDestinationId } from "../workbench/SettingsPanel";
import { autoModelLabel, reasoningLabel } from "../workbench/modelPolicy";
import { ProjectedContribution } from "./contributionComponents";
import type { OplClientContributionsService } from "./clientCordis";
import {
  OPL_UI_CONTRIBUTION_SLOTS,
  type OplUiContribution,
  type OplUiContributionsProjection,
  type OplUiContributionSlot
} from "./contributionProjection";
import type { OplAgentPermission, OplStudioSurface } from "./oplStudioSurface";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    root: { kind: "single"; scope: "root" };
    sidebar: { kind: "single"; scope: "root"; owner: { collapsed: boolean; width: number } };
    conversation: { kind: "single"; scope: "root"; owner: object };
    details: { kind: "single"; scope: "root"; owner: object };
    "shell.overlay": { kind: "list"; scope: "root"; owner: object };
    "sidebar.workspaces": { kind: "single"; scope: "root"; owner: { wide: boolean; expandSidebar(): void } };
    "sidebar.settings": { kind: "single"; scope: "root"; owner: { wide: boolean } };
    "sidebar.footer.action": { kind: "list"; scope: "root"; owner: { wide: boolean } };
    "conversation.session.header": { kind: "single"; scope: "root"; owner: object };
    "conversation.session": { kind: "single"; scope: "root"; owner: object };
    "conversation.composer.bar": { kind: "single"; scope: "root"; owner: Record<string, unknown> };
    "conversation.input.overlay": { kind: "single"; scope: "root"; owner: object };
    "conversation.input.left": { kind: "list"; scope: "root"; owner: object };
    "conversation.input.right": { kind: "list"; scope: "root"; owner: object };
    "conversation.input.plan": { kind: "single"; scope: "root"; owner: object };
    "conversation.input.model": { kind: "single"; scope: "root"; owner: object };
    "conversation.input.dock": { kind: "list"; scope: "root"; owner: object };
    "conversation.composer.dock": { kind: "list"; scope: "root"; owner: object };
    "conversation.hero.workspace": { kind: "single"; scope: "root"; owner: object };
    "conversation.hero.agentPreset": { kind: "single"; scope: "root"; owner: object };
    "settings.trigger": { kind: "single"; scope: "root"; owner: { wide: boolean } };
    "settings.header": { kind: "single"; scope: "root"; owner: object };
    "settings.action": { kind: "list"; scope: "root"; owner: object };
    "settings.close": { kind: "single"; scope: "root"; owner: object };
    "settings.section": { kind: "list"; scope: "root"; owner: object };
    "settings.general.item": { kind: "list"; scope: "root"; owner: object };
    "settings.onboarding": { kind: "list"; scope: "root"; owner: object };
    "composer.palette": { kind: "list"; scope: "root"; owner: object };
    "runtime.detail": { kind: "list"; scope: "root"; owner: object };
  }
}

const emptyArraySnapshot = Object.freeze([]) as readonly unknown[];
const noSessionSnapshot: SessionMaybeProvideInfo = Object.freeze({ sessionId: undefined, hooks: Object.freeze({}), props: Object.freeze({}) });
const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const SettingsContributionSlotContext = createContext<((options?: { only?: string }) => ReactNode) | null>(null);

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.closest('[hidden], [aria-hidden="true"]') && element.getClientRects().length > 0);
}

function useSettingsDialogFocus(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let dialog: HTMLElement | null = null;
    let restoreTarget: HTMLElement | null = null;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const current = document.activeElement as HTMLElement | null;
      const currentIndex = current ? focusable.indexOf(current) : -1;
      const wrapBackward = event.shiftKey && currentIndex <= 0;
      const wrapForward = !event.shiftKey && currentIndex === focusable.length - 1;
      if (!dialog.contains(current) || wrapBackward || wrapForward) {
        event.preventDefault();
        (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus();
      }
    };

    const syncDialog = () => {
      const nextDialog = root.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (nextDialog === dialog) return;
      if (nextDialog) {
        dialog = nextDialog;
        restoreTarget = root.querySelector<HTMLElement>('button[aria-haspopup="dialog"]');
        document.addEventListener("keydown", trapFocus, true);
        return;
      }
      if (dialog) {
        dialog = null;
        document.removeEventListener("keydown", trapFocus, true);
        const target = restoreTarget;
        requestAnimationFrame(() => {
          if (target?.isConnected) target.focus();
        });
      }
    };

    const observer = new MutationObserver(syncDialog);
    observer.observe(root, { childList: true, subtree: true });
    syncDialog();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", trapFocus, true);
    };
  }, [rootRef]);
}

function constantObservable<T>(snapshot: T): HostObservable<T> {
  return { getSnapshot: () => snapshot, subscribe: () => () => undefined };
}

function useDshSnapshot<T, S>(store: { getSnapshot(): T; subscribe(listener: () => void): () => void }, selector: (value: T) => S): S {
  return selector(useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot));
}

type ActiveRegistration = { fingerprint: string; dispose(): void };
type StudioContextValue = OplStudioSurface & {
  narrow: boolean;
  detailsOpen: boolean;
  toggleSidebar(): void;
  closeDetails(): void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

function useStudio(): StudioContextValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error("OPL Studio DSH slot rendered outside the Studio surface");
  return value;
}

function translate(locale: "zh" | "en", key: string, params?: Record<string, unknown>): string {
  const copy: Record<string, [string, string]> = {
    "session.new.label": ["新建任务", "New task"], "session.new": ["新建任务", "New task"],
    "toggle.open": ["展开侧栏", "Expand sidebar"], "toggle.collapse": ["收起侧栏", "Collapse sidebar"],
    "hero.headline": ["One Person Lab", "One Person Lab"], "hero.preview": ["预览版", "Preview"],
    "hero.chooseWorkspace": ["选择工作区", "Choose workspace"], "placeholder.workspace": ["先选择工作区", "Choose a workspace first"],
    "placeholder.hero": ["向 OPL 描述你的目标", "Describe your goal to OPL"], "placeholder.default": ["向 OPL 描述你的目标", "Describe your goal to OPL"],
    "placeholder.unavailable": ["当前不可输入", "Input unavailable"], "placeholder.parentOffline": ["父任务当前离线", "Parent task is offline"],
    "placeholder.steerQueue": ["输入后续指令", "Add a follow-up"], "placeholder.plan": ["描述计划", "Describe the plan"],
    "input.commands": ["添加文件、Skill 或模块", "Add files, Skills, or modules"], "input.send": ["发送", "Send"], "input.stop": ["停止", "Stop"],
    "input.accessMode": ["权限：{name}", "Access: {name}"], "context.aria": ["上下文已用 {percent}", "{percent} of context used"],
    "context.used": ["上下文用量", "Context usage"], "context.system": ["系统", "System"], "context.tools": ["工具", "Tools"], "context.messages": ["消息", "Messages"],
    "access.confirm.title": ["启用完整权限", "Enable full access"], "access.confirm.description": ["完整权限允许任务修改本机文件。", "Full access allows the task to modify local files."],
    "access.confirm.acknowledge": ["我了解此权限", "I understand this access"], "access.confirm.cancel": ["取消", "Cancel"], "access.confirm.enable": ["启用", "Enable"]
    , "queue.count": ["{n} 条排队消息", "{n} queued messages"], "queue.edit": ["编辑排队消息", "Edit queued message"],
    "queue.edit.unsupported": ["包含非文本内容，暂不支持编辑", "Contains non-text content; editing is not supported yet"],
    "queue.save": ["保存", "Save"], "queue.cancelEdit": ["取消编辑", "Cancel editing"], "queue.remove": ["删除排队消息", "Remove queued message"],
    "queue.steer": ["插话发送", "Steer queued message"], "queue.steer.unavailable": ["仅运行中可插话发送", "Steering is available only while the agent is running"],
    "queue.editFailed": ["编辑失败，请重试。", "Editing failed. Try again."], "queue.removeFailed": ["删除失败，请重试。", "Removal failed. Try again."],
    "queue.steerFailed": ["插话发送失败，请重试。", "Steering failed. Try again."]
  };
  const dshDictionary = locale === "zh"
    ? { ...workspaceZh, ...modelZh, ...agentZh }
    : { ...workspaceEn, ...modelEn, ...agentEn };
  let value = copy[key]?.[locale === "zh" ? 0 : 1] ?? dshDictionary[key as keyof typeof dshDictionary] ?? key;
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}

function StudioFrame({ surface, renderSlot }: { surface: OplStudioSurface; renderSlot: any }) {
  const [panels, setPanels] = useState({ sidebar: 280, details: 0, narrow: false, narrowExpanded: false });
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const frameRootRef = useRef<HTMLElement | null>(null);
  const actions = useMemo(() => ({
    setSidebar: (px: number) => setPanels((current) => ({ ...current, sidebar: Math.min(420, Math.max(264, px)) })),
    setDetails: () => undefined,
    toggleSidebar: () => setPanels((current) => current.narrow ? { ...current, narrowExpanded: !current.narrowExpanded } : { ...current, sidebar: current.sidebar === 0 ? 280 : 0 }),
    setNarrow: (narrow: boolean) => setPanels((current) => current.narrow === narrow ? current : { ...current, narrow, narrowExpanded: false }),
    openDetails: () => setInspectorOpen(true),
    closeDetails: () => setInspectorOpen(false)
  }), []);
  const sessions = { phase: "ready", current: "opl-current", byId: { "opl-current": { blank: false, cwd: surface.workspacePath } } };
  const value = useMemo(() => ({
    ...surface,
    narrow: panels.narrow,
    detailsOpen: inspectorOpen,
    openPrimaryView: (view: OplStudioSurface["primaryView"]) => {
      if (view === "runtime") actions.closeDetails();
      surface.openPrimaryView(view);
    },
    toggleSidebar: actions.toggleSidebar,
    closeDetails: actions.closeDetails
  }), [actions, inspectorOpen, panels.narrow, surface]);
  const lastDetailsRequest = useRef(surface.detailsRequestRevision);
  useEffect(() => {
    if (lastDetailsRequest.current === surface.detailsRequestRevision) return;
    lastDetailsRequest.current = surface.detailsRequestRevision;
    actions.openDetails();
  }, [actions, surface.detailsRequestRevision]);
  useEffect(() => {
    const root = frameRootRef.current;
    if (!root) return;
    const frame = root.firstElementChild;
    if (!(frame instanceof HTMLElement)) return;
    const handles = Array.from(frame.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.dataset.side === "sidebar");
    const cleanups = handles.map((handle) => {
      const min = 264;
      const max = 420;
      const value = panels.sidebar;
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-orientation", "vertical");
      handle.setAttribute("aria-label", surface.locale === "zh" ? "调整项目侧栏宽度" : "Resize project sidebar");
      handle.setAttribute("aria-valuemin", String(min));
      handle.setAttribute("aria-valuemax", String(max));
      handle.setAttribute("aria-valuenow", String(value));
      handle.tabIndex = 0;

      const onKeyDown = (event: globalThis.KeyboardEvent) => {
        let next: number | null = null;
        if (event.key === "Home") next = min;
        else if (event.key === "End") next = max;
        else if (event.key === "ArrowLeft") next = value - 16;
        else if (event.key === "ArrowRight") next = value + 16;
        if (next === null) return;
        event.preventDefault();
        actions.setSidebar(next);
      };
      handle.addEventListener("keydown", onKeyDown);
      return () => handle.removeEventListener("keydown", onKeyDown);
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [actions, panels.narrow, panels.sidebar, surface.locale]);
  return (
    <StudioContext.Provider value={value}>
      <main ref={frameRootRef} data-testid="opl-studio-root" data-inspector-open={inspectorOpen || undefined} className="opl-studio-dsh-root codex-sidebar-chat with-rail without-inspector">
        <AppFrame
          useStore={(selector: (state: typeof panels) => unknown) => selector(panels)}
          useSessions={(selector: (state: typeof sessions) => unknown) => selector(sessions)}
          actions={actions}
          renderSlot={renderSlot}
        />
      </main>
    </StudioContext.Provider>
  );
}

function OplStudioRoot({
  renderSlot,
  contributions
}: {
  renderSlot: any;
  contributions: OplClientContributionsService;
}) {
  const latestHostState = useRef<unknown>(null);

  useEffect(() => {
    const unsubscribe = contributions.subscribe((projection) => slotHost.replaceHostDerivedProjection(projection));
    contributions.updateHostState(latestHostState.current);
    return () => {
      unsubscribe();
      slotHost.clearProjection();
    };
  }, [contributions]);

  const updateHostState = useCallback((state: unknown) => {
    latestHostState.current = state;
    contributions.updateHostState(state);
  }, [contributions]);
  const clearHostState = useCallback(() => {
    latestHostState.current = null;
    contributions.updateHostState(null);
    slotHost.clearProjection();
  }, [contributions]);

  return <App detailTabs={contributions.detailsTabs} renderShell={(surface) => <StudioFrame surface={surface} renderSlot={renderSlot} />} renderContributionSlot={(slot, owner, options) => renderSlot(slot, owner, options)} onHostStateChange={updateHostState} onHostStateDispose={clearHostState} />;
}

function SidebarSlot({ collapsed, width, renderSlot }: { collapsed: boolean; width: number; renderSlot: any }) {
  const studio = useStudio();
  return (
    <div className="opl-dsh-sidebar-shell" data-collapsed={collapsed || undefined}>
      <SidebarRoot
        collapsed={collapsed}
        width={width}
        startSession={studio.startSession}
        toggleSidebar={studio.toggleSidebar}
        t={(key: string, params?: Record<string, unknown>) => translate(studio.locale, key, params)}
        renderSlot={renderSlot}
      />
    </div>
  );
}

function SidebarWorkspacesSlot({ wide, expandSidebar }: { wide: boolean; expandSidebar(): void }) {
  const studio = useStudio();
  const workspaceStore = useMemo(() => createWorkspaceViewStore().create(), []);
  const list: SessionListState = useMemo(() => {
    const projects = studio.threadProjects.filter(project => !project.projectless);
    const byId = Object.fromEntries(projects.flatMap(project => project.threads.map(thread => [thread.id, {
      id: thread.id,
      displayTitle: thread.title,
      cwd: thread.workspace,
      running: thread.status === "running",
      completed: thread.status === "completed",
      blank: false,
      updatedAt: thread.updatedAt ? Date.parse(thread.updatedAt) : 0
    }]))) as SessionListState["byId"];
    return {
      ids: Object.keys(byId), byId, current: studio.currentThreadId,
      phase: studio.threadDirectoryStatus,
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined
    };
  }, [studio.currentThreadId, studio.threadDirectoryStatus, studio.threadProjects]);
  const workspaces: WorkspaceListState = useMemo(() => ({
    phase: studio.threadDirectoryStatus,
    items: studio.threadProjects.filter(project => !project.projectless).map(project => ({
      workspaceId: project.id,
      path: project.workspace ?? project.label,
      title: project.label,
      sessionIds: project.threads.map(thread => thread.id),
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: new Date().toISOString()
    })),
    archivedSessionIds: new Set()
  }), [studio.threadDirectoryStatus, studio.threadProjects]);
  const recentList: SessionListState = useMemo(() => {
    const projectless = studio.threadProjects.find(project => project.projectless);
    const byId = Object.fromEntries((projectless?.threads ?? []).map(thread => [thread.id, {
      id: thread.id,
      displayTitle: thread.title,
      cwd: undefined,
      running: thread.status === "running",
      completed: thread.status === "completed",
      blank: false,
      updatedAt: thread.updatedAt ? Date.parse(thread.updatedAt) : 0
    }])) as SessionListState["byId"];
    return {
      ids: Object.keys(byId), byId, current: studio.currentThreadId,
      phase: studio.threadDirectoryStatus,
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined
    };
  }, [studio.currentThreadId, studio.threadDirectoryStatus, studio.threadProjects]);
  const actions = workspaceStore.actions as Record<string, (...args: any[]) => void>;
  const dshLocale = (key: string, params?: Record<string, unknown>) => translate(studio.locale, key, params);
  if (studio.threadDirectoryStatus === "loading") {
    return <><RuntimeNavigation wide={wide} /><div className="opl-thread-directory-status" role="status">{studio.locale === "zh" ? "正在读取 Codex 会话..." : "Loading Codex conversations..."}</div></>;
  }
  if (studio.threadDirectoryStatus === "error") {
    return <><RuntimeNavigation wide={wide} /><div className="opl-thread-directory-error" role="alert">
      <strong>{studio.locale === "zh" ? "无法连接 Codex App Server" : "Codex App Server is unavailable"}</strong>
      <span>{studio.threadDirectoryError}</span>
      <button type="button" onClick={() => studio.reloadThreadDirectory()}><RefreshCw aria-hidden="true" size={14} />{studio.locale === "zh" ? "重试" : "Retry"}</button>
    </div></>;
  }
  return <><RuntimeNavigation wide={wide} />
  <div className="opl-workspace-browser-seat">
  <WorkspaceBrowser
    wide={wide}
    expandSidebar={expandSidebar}
    useSessions={(selector: any) => selector(list)}
    useWorkspaces={(selector: any) => selector(workspaces)}
    useStore={(selector: any) => useDshSnapshot(workspaceStore, selector)}
    actions={actions}
    startSession={(projectId?: string) => studio.startSessionInProject(projectId)}
    open={(threadId: string) => studio.openThread(threadId)}
    renameSession={(threadId: string, title: string) => studio.renameSession(threadId, title)}
    forkSession={(threadId: string) => studio.forkThread(threadId)}
    renameWorkspace={(workspaceId: string, title: string) => studio.renameWorkspace(workspaceId, title)}
    deleteWorkspace={(workspaceId: string) => studio.deleteWorkspace(workspaceId)}
    insertWorkspaceBefore={(workspaceId: string, beforeWorkspaceId?: string) => studio.insertWorkspaceBefore(workspaceId, beforeWorkspaceId)}
    archiveSession={(threadId: string) => studio.archiveThread(threadId)}
    insertSessionBefore={(workspaceId: string, threadId: string, beforeThreadId?: string) => studio.insertSessionBefore(workspaceId, threadId, beforeThreadId)}
    createWorkspace={async ({ path }: { path: string }) => studio.createWorkspace(path).then(() => ({ workspaceId: path, path, title: path, sessionIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as never)}
    searchSessions={async (query: string) => ({ items: await studio.searchThreads(query), hasMore: false })}
    searchResultLimit={100}
    useDirectoryFlow={() => false}
    useHostDescription={(selector: any) => selector(undefined)}
    renderSlot={() => null}
    t={dshLocale}
  />
  {wide ? <RecentSessionsSection list={recentList} current={studio.currentThreadId} locale={studio.locale} open={studio.openThread} fork={studio.forkThread} archive={studio.archiveThread} /> : null}
  </div>
  </>;
}

function RecentSessionsSection({ list, current, locale, open, fork, archive }: {
  list: SessionListState;
  current?: string;
  locale: "zh" | "en";
  open(threadId: string): void;
  fork(threadId: string): void;
  archive(threadId: string): Promise<void>;
}) {
  const recent = useMemo(() => Object.values(list.byId)
    .filter(session => !session.blank)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 20)
    .map(session => ({
      id: session.id,
      title: session.displayTitle,
      blank: false,
      running: session.running,
      runningSubagentCount: 0,
      completed: session.completed === true,
      updatedAt: session.updatedAt
    })) as DshSessionNode[], [list.byId]);
  const t = useCallback((key: string, params?: Record<string, unknown>) => translate(locale, key, params), [locale]);
  if (recent.length === 0) return null;
  const now = Date.now();
  return <section className="opl-recent-sessions" aria-labelledby="opl-recent-sessions-title">
    <h2 id="opl-recent-sessions-title">{locale === "zh" ? "最近" : "Recent"}</h2>
    <div className="opl-recent-session-list" role="tree" aria-labelledby="opl-recent-sessions-title">
      {recent.map(node => <SessionNodeItem
        key={node.id}
        node={node}
        currentId={current}
        now={now}
        onOpen={open}
        onRename={() => undefined}
        onFork={fork}
        onArchive={(threadId: string) => { void archive(threadId); }}
        flat
        t={t}
      />)}
    </div>
  </section>;
}

function RuntimeNavigation({ wide }: { wide: boolean }) {
  const studio = useStudio();
  const label = studio.locale === "zh" ? "运行状态" : "Run status";
  return <nav className="opl-primary-nav" data-wide={wide} aria-label={studio.locale === "zh" ? "主导航" : "Primary navigation"}>
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-current={studio.primaryView === "runtime" ? "page" : undefined}
      onClick={() => studio.openPrimaryView("runtime")}
    ><Activity aria-hidden="true" size={wide ? 14 : 18} />{wide ? <span>{label}</span> : null}</button>
  </nav>;
}

function ConversationSlot({ renderSlot }: { renderSlot: any }) {
  const studio = useStudio();
  if (studio.primaryView === "runtime") return <>{studio.runtimeOverview}</>;
  const sessionId = "opl-current";
  const session = { openState: "open", composerPhase: studio.conversationBlank ? "blank" : "active", pending: [], promptError: null, running: studio.sending, subagent: null, removed: false };
  const sessions = { phase: "ready", current: sessionId, byId: { [sessionId]: { blank: studio.conversationBlank, cwd: studio.workspacePath } } };
  const workspaces = { phase: "ready", items: [{ workspaceId: "opl-workspace", title: studio.projectTitle, sessionIds: [sessionId] }] };
  const input = { draft: studio.prompt, imageIds: [], draftRev: studio.promptRevision, phase: "plain", occurrences: [], queue: studio.queue };
  return <div className="opl-dsh-conversation-shell">
    <ConversationRoot sessionId={sessionId} useSession={(selector: any) => selector(session)} useSessions={(selector: any) => selector(sessions)} useWorkspaces={(selector: any) => selector(workspaces)} useInput={(selector: any) => selector(input)} useComposerBlock={(selector: any) => selector(undefined)} renderSlot={renderSlot} renderSlotChain={(_key: string, _owner: unknown, options: { fallback: ReactNode }) => options.fallback} selectWorkspace={async () => undefined} t={(key: string, params?: Record<string, unknown>) => translate(studio.locale, key, params)} />
  </div>;
}

function ConversationHeaderSlot() {
  const studio = useStudio();
  return <header className="opl-dsh-session-header" data-testid="opl-session-header">
    <div className="opl-dsh-session-header-copy">
      <strong title={studio.sessionTitle}>{studio.sessionTitle}</strong>
      <span title={studio.projectTitle}>{studio.projectTitle}</span>
    </div>
  </header>;
}

function ConversationBodySlot() { return <>{useStudio().conversationBody}</>; }
function OplBrandMarkSlot(): null { return null; }

function StudioPermissionSelect({
  value,
  options,
  locked,
  locale,
  command
}: {
  value: string;
  options: Array<{ value: string; name: string; description: string }>;
  locked: boolean;
  locale: "zh" | "en";
  command: (line: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const current = options.find((option) => option.value === value);
  const currentLabel = current?.name ?? value;
  const busy = pending !== null || confirmation !== null;
  const iconFor = (permission: string) => permission === "danger-full-access"
    ? <ShieldAlert aria-hidden="true" size={14} />
    : permission === "workspace-write"
      ? <ShieldCheck aria-hidden="true" size={14} />
      : <Shield aria-hidden="true" size={14} />;
  const items: MenuEntry[] = options.filter((option) => option.value !== "custom").map((option) => ({
    id: option.value,
    label: option.name,
    icon: iconFor(option.value)
  }));
  const submit = (next: string) => {
    setPending(next);
    void command(`/permission ${next}`).catch(() => false).finally(() => setPending(null));
  };
  const choose = (next: string) => {
    setOpen(false);
    if (next === value) return;
    if (next === "danger-full-access") {
      setAcknowledged(false);
      setConfirmation(next);
      return;
    }
    submit(next);
  };
  const closeConfirmation = () => {
    setAcknowledged(false);
    setConfirmation(null);
  };
  const confirmFullAccess = () => {
    if (locked || !acknowledged || confirmation === null) return;
    const next = confirmation;
    closeConfirmation();
    submit(next);
  };
  return <>
    <Menu
      open={open}
      items={items}
      selectedId={value}
      onSelect={choose}
      onClose={() => setOpen(false)}
      side="top"
      anchor={<button
        type="button"
        className="opl-dsh-permission-trigger"
        aria-label={locale === "zh" ? `权限：${currentLabel}` : `Access: ${currentLabel}`}
        title={current?.description}
        disabled={locked || busy}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="opl-dsh-permission-icon">{iconFor(value)}</span>
        <span className="opl-dsh-permission-label">{currentLabel}</span>
        <span className={`opl-dsh-permission-chevron${open ? " is-open" : ""}`} aria-hidden="true"><IconChevronDownOutline14 /></span>
      </button>}
    />
    <RiskConfirmation
      open={confirmation !== null}
      title={locale === "zh" ? "启用完整权限" : "Enable full access"}
      description={locale === "zh" ? "完整权限允许任务修改本机文件。" : "Full access allows the task to modify local files."}
      acknowledgeLabel={locale === "zh" ? "我了解此权限" : "I understand this access"}
      cancelLabel={locale === "zh" ? "取消" : "Cancel"}
      confirmLabel={locale === "zh" ? "启用" : "Enable"}
      acknowledged={acknowledged}
      disabled={locked}
      onAcknowledgedChange={setAcknowledged}
      onCancel={closeConfirmation}
      onConfirm={confirmFullAccess}
    />
  </>;
}
function OplBrandNameSlot() { return <>One Person Lab</>; }
function EmptyAttachmentSlot() { return null; }
function HeroActionsSlot() {
  const studio = useStudio();
  const store = useMemo(() => createSnapshotStore<{
    options: Array<{ id: string; trust: "system"; name: string; description: string }>;
    current: string;
    error: string | null;
    busy: boolean;
    introduce: boolean;
  }>({ options: [], current: "", error: null, busy: false, introduce: false }), []);
  useEffect(() => {
    store.set({
      ...store.getSnapshot(),
      options: studio.agentPresets.map((preset) => ({ id: preset.id, trust: "system" as const, name: preset.name, description: preset.description })),
      current: studio.selectedAgentPresetId,
    });
  }, [store, studio.agentPresets, studio.selectedAgentPresetId]);
  return <AgentPresetSeat
    load={async () => undefined}
    select={(id: string) => studio.selectAgentPreset(id)}
    introduced={() => undefined}
    useAgentPresetSeat={(selector: any) => useDshSnapshot(store, selector)}
    t={(key: string) => translate(studio.locale, key)}
  />;
}
function ComposerOverlaySlot() { return <>{useStudio().composerOverlay}</>; }
function ComposerModelSlot() {
  const studio = useStudio();
  const [open, setOpen] = useState(false);
  const currentOption = studio.modelOptions.find((option) => option.id === studio.resolvedModelId);
  const modelLabel = studio.modelSelection === "__auto"
    ? autoModelLabel(studio.locale)
    : studio.locale === "zh" ? currentOption?.label_zh ?? studio.modelSelection : currentOption?.label_en ?? studio.modelSelection;
  const effortLabel = reasoningLabel(studio.reasoningSelection, studio.locale, true);
  const summary = (label: string, value: string) => <span className="opl-model-menu-summary"><span>{label}</span><span className="opl-model-menu-value">{value}</span><ChevronRight aria-hidden="true" size={14} /></span>;
  const choice = (label: string, selected: boolean) => <span className="opl-model-menu-choice"><span>{label}</span>{selected ? <Check aria-hidden="true" size={14} /> : null}</span>;
  const items: MenuEntry[] = [
    {
      id: "model",
      label: summary(studio.locale === "zh" ? "模型" : "Model", modelLabel),
      disabled: !studio.modelOptions.some((option) => option.available),
      submenu: studio.modelOptions.filter((option) => option.available).map((option) => ({
        id: `model:${option.id}`,
        label: choice(studio.locale === "zh" ? option.label_zh : option.label_en, studio.modelSelection === option.id)
      }))
    },
    {
      id: "reasoning",
      label: summary(studio.locale === "zh" ? "推理等级" : "Reasoning", effortLabel),
      disabled: !studio.resolvedModelId || studio.reasoningOptions.length === 0,
      submenu: studio.reasoningOptions.map((effort) => ({
        id: `reasoning:${effort}`,
        label: choice(reasoningLabel(effort, studio.locale, true), studio.reasoningSelection === effort)
      }))
    },
    {
      id: "automatic",
      label: autoModelLabel(studio.locale)
    }
  ];
  const select = (id: string) => {
    setOpen(false);
    if (id === "automatic") {
      void studio.selectModel("__auto");
      return;
    }
    if (id.startsWith("model:")) {
      const modelId = id.slice("model:".length);
      const option = studio.modelOptions.find((candidate) => candidate.id === modelId);
      void studio.selectModel(modelId, option?.defaultReasoningEffort);
      return;
    }
    if (id.startsWith("reasoning:") && studio.resolvedModelId) {
      void studio.selectModel(studio.resolvedModelId, id.slice("reasoning:".length));
    }
  };
  return <Menu
    open={open}
    side="top"
    align="end"
    items={items}
    selectedIds={studio.modelSelection === "__auto" ? ["automatic"] : []}
    onSelect={select}
    onClose={() => setOpen(false)}
    anchor={<button
      type="button"
      className="opl-model-trigger"
      data-testid="opl-model-trigger"
      aria-label={`${studio.locale === "zh" ? "选择模型" : "Select model"}: ${modelLabel}, ${effortLabel}`}
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={studio.sending}
      title={`${modelLabel} · ${effortLabel}`}
      onClick={() => setOpen((value) => !value)}
    ><span>{modelLabel}</span><span className="opl-model-trigger-effort">{effortLabel}</span><ChevronDown aria-hidden="true" size={14} /></button>}
  />;
}

function InputBarSlot({ renderSlot, ...owner }: Record<string, any>) {
  const studio = useStudio();
  const input = { draft: studio.prompt, imageIds: [], draftRev: studio.promptRevision, phase: "plain", occurrences: [], queue: studio.queue };
  const permissionValue = studio.agentPermissions === ":danger-full-access"
    ? "danger-full-access"
    : studio.agentPermissions === ":workspace" ? "workspace-write" : "read-only";
  const permissionName = (value: string) => value === "danger-full-access"
    ? (studio.locale === "zh" ? "完全访问" : "Full access")
    : value === "workspace-write"
      ? (studio.locale === "zh" ? "工作区访问" : "Workspace access")
      : (studio.locale === "zh" ? "只读" : "Read only");
  const permissionOptions = [
    { value: "read-only", name: permissionName("read-only"), description: studio.locale === "zh" ? "仅读取，不修改文件。" : "Read without modifying files." },
    { value: "workspace-write", name: permissionName("workspace-write"), description: studio.locale === "zh" ? "允许修改当前工作区。" : "Allow changes in the current workspace." },
    { value: "danger-full-access", name: permissionName("danger-full-access"), description: studio.locale === "zh" ? "允许执行更广泛的本机操作。" : "Allow broader local operations." }
  ];
  const command = async (line: string) => {
    const match = /^\/permission\s+(\S+)\s*$/.exec(line.trim());
    const value = match?.[1];
    const next = value === "danger-full-access" ? ":danger-full-access" : value === "workspace-write" ? ":workspace" : value === "read-only" ? ":read-only" : undefined;
    if (!next) return false;
    studio.setAgentPermissions(next);
    return true;
  };
  const keyboard = {
    snapshot: input, setDraft: studio.updatePrompt, submit: studio.submitPrompt, steerQueue: studio.steerQueue,
    undo: () => undefined, redo: () => undefined,
    pasteBegin: (text: string, selection: { start: number; end: number }) => studio.updatePrompt(`${studio.prompt.slice(0, selection.start)}${text}${studio.prompt.slice(selection.end)}`),
    invalidatePaste: () => undefined, track: () => undefined, arbitrate: () => "pass", space: () => false, dismissPopup: () => undefined
  };
  const inputRenderSlot = (key: string, props: Record<string, unknown>) => key === "conversation.input.plan"
    ? <StudioPermissionSelect value={permissionValue} options={permissionOptions} locked={studio.sending} locale={studio.locale} command={command} />
    : renderSlot(key, props);
  return <InputBar {...owner} sessionId="opl-current" useSession={(selector: any) => selector({ promptError: null, running: studio.sending, subagent: null, removed: false })} useInput={(selector: any) => selector(input)} inputActions={{ setDraft: studio.updatePrompt, addImages: () => false, removeImage: () => undefined, pruneImages: () => undefined, submit: studio.submitPrompt }} keyboard={keyboard} draftImages={() => []} resolveSubmitMode={(running: boolean, gesture: string) => running && gesture === "accelerated" ? "steer" : "queue"} toggleCommandMenu={studio.openComposerPalette} stop={studio.stopTurn} t={(key: string, params?: Record<string, unknown>) => translate(studio.locale, key, params)} renderSlot={inputRenderSlot} useNotices={(selector: any) => selector(null)} useLexicon={(selector: any) => selector(new Map())} useMenuLauncher={(selector: any) => selector(undefined)} useProjection={(_key: string, selector?: (value: undefined) => unknown) => selector ? selector(undefined) : undefined} accessory={studio.composerAccessory} />;
}

function QueueDockSlot() {
  const studio = useStudio();
  const session = { queue: studio.queue, running: studio.sending, subagent: null };
  return <QueueDock
    useSession={(selector: any) => selector(session)}
    updateQueue={studio.updateQueue}
    notify={studio.notifyQueue}
    t={(key: string, params?: Record<string, unknown>) => translate(studio.locale, key, params)}
  />;
}

function DetailsSlot(): null { return null; }

function ShellOverlaySlot() {
  const studio = useStudio();
  const [menuOpen, setMenuOpen] = useState(false);
  const detailsDialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const detailsOpen = studio.primaryView === "conversation" && studio.detailsOpen;
  const detailTabs = useMemo(() => [...studio.detailTabs].sort((left, right) => left.order - right.order), [studio.detailTabs]);
  const detailMenuItems: MenuEntry[] = detailTabs.map((tab) => ({
    id: tab.id,
    label: tab.labels[studio.locale],
    icon: tab.icon === "progress" ? <Activity aria-hidden="true" size={16} /> : tab.icon === "files" ? <Files aria-hidden="true" size={16} /> : <Puzzle aria-hidden="true" size={16} />
  }));
  useEffect(() => {
    if (!detailsOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      requestAnimationFrame(() => {
        if (previousFocus !== document.body && previousFocus?.isConnected) previousFocus.focus();
        else document.querySelector<HTMLButtonElement>('[data-testid="opl-context-inspector-trigger"]')?.focus();
      });
    };
  }, [detailsOpen]);
  return <>
    {studio.overlay}
    {studio.primaryView === "conversation" && !detailsOpen ? (
      <div className="opl-context-inspector-trigger-wrap">
        <Menu
          open={menuOpen}
          portal
          align="end"
          side="bottom"
          compact
          items={detailMenuItems}
          selectedId={studio.activeDetailTabId}
          onClose={() => setMenuOpen(false)}
          onSelect={(id) => {
            setMenuOpen(false);
            const tab = detailTabs.find((candidate) => candidate.id === id);
            if (tab) studio.openDetailTab(tab.id);
          }}
          anchor={<button
            type="button"
            className="opl-context-inspector-trigger"
            data-testid="opl-context-inspector-trigger"
            aria-label={studio.locale === "zh" ? "打开任务详情" : "Open task details"}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={studio.locale === "zh" ? "任务详情" : "Task details"}
            onClick={() => setMenuOpen((open) => !open)}
          ><PanelRight aria-hidden="true" size={16} /><span>{studio.locale === "zh" ? "任务详情" : "Task details"}</span><ChevronDown aria-hidden="true" size={14} /></button>}
        />
      </div>
    ) : null}
    {detailsOpen ? (
      <section
        ref={detailsDialogRef}
        className="opl-context-inspector"
        data-testid="opl-context-inspector"
        data-narrow={studio.narrow || undefined}
        role={studio.narrow ? "dialog" : "complementary"}
        aria-modal={studio.narrow || undefined}
        aria-labelledby="opl-context-inspector-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            studio.closeDetails();
            return;
          }
          if (!studio.narrow || event.key !== "Tab") return;
          const focusable = focusableElements(detailsDialogRef.current);
          if (focusable.length === 0) {
            event.preventDefault();
            detailsDialogRef.current?.focus();
            return;
          }
          const first = focusable[0]!;
          const last = focusable[focusable.length - 1]!;
          if (!detailsDialogRef.current?.contains(document.activeElement)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
          } else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header>
          <strong id="opl-context-inspector-title" className="visually-hidden">{studio.locale === "zh" ? "任务详情" : "Task details"}</strong>
          <nav className="opl-context-inspector-tabs" data-testid="opl-context-tabs" aria-label={studio.locale === "zh" ? "任务详情分区" : "Task detail sections"}>
            {detailTabs.map((tab) => (
              <button key={tab.id} type="button" data-active={studio.activeDetailTabId === tab.id || undefined} aria-label={tab.labels[studio.locale]} onClick={() => studio.openDetailTab(tab.id)}>
                {tab.icon === "progress" ? <Activity aria-hidden="true" size={15} /> : tab.icon === "files" ? <Files aria-hidden="true" size={15} /> : <Puzzle aria-hidden="true" size={15} />}
                <span>{tab.labels[studio.locale]}</span>
              </button>
            ))}
          </nav>
          <button ref={closeButtonRef} className="opl-context-inspector-close" type="button" aria-label={studio.locale === "zh" ? "关闭详情" : "Close details"} title={studio.locale === "zh" ? "关闭详情" : "Close details"} onClick={studio.closeDetails}><X aria-hidden="true" size={16} /></button>
        </header>
        <div className="opl-context-inspector-body">{studio.details}</div>
      </section>
    ) : null}
  </>;
}

function SettingsSlot({ wide, renderSlot }: { wide: boolean; renderSlot: any }) {
  const studio = useStudio();
  const rootRef = useRef<HTMLDivElement | null>(null);
  useSettingsDialogFocus(rootRef);
  const studioRows = settingsDestinations(studio.locale).map((destination, index) => ({
    id: settingsSectionId(destination.id),
    order: index * 10,
    label: destination.label
  }));
  // Package contributions are rendered inside the owning Studio destination;
  // they are not extra top-level settings pages.
  const rows = studioRows;
  const setupFlow = studio.initialization?.systemInitialize.setupFlow;
  const onboardingVisible = studio.initializationStatus === "ready"
    && setupFlow?.isFirstRun === true
    && setupFlow.readyToLaunch === false;
  const sessions = { phase: "ready", current: "opl-current", byId: { "opl-current": { blank: onboardingVisible } } };
  const onboardingSteps = onboardingVisible ? [{ id: "opl-first-run", order: 0 }] : [];
  const renderContribution = useCallback((options?: { only?: string }) => (
    renderSlot("settings.section", studio.contributionOwner, options)
  ), [renderSlot, studio.contributionOwner]);
  return <SettingsContributionSlotContext.Provider value={renderContribution}><div ref={rootRef} className="opl-settings-slot-root"><SettingsRoot wide={wide} useSections={(selector: any) => selector(rows)} useOnboardingSteps={(selector: any) => selector(onboardingSteps)} useSessions={(selector: any) => selector(sessions)} renderSlot={renderSlot} /></div></SettingsContributionSlotContext.Provider>;
}

function SettingsTriggerSlot({ wide }: { wide: boolean }) {
  const studio = useStudio();
  const label = studio.locale === "zh" ? "设置" : "Settings";
  return <><SettingsIcon aria-hidden="true" size={16} /><span className={wide ? undefined : "visually-hidden"}>{label}</span></>;
}

function SettingsHeaderSlot() { return <>One Person Lab</>; }
function SettingsCloseSlot() { return <>{useStudio().locale === "zh" ? "关闭" : "Close"}</>; }
function settingsSectionId(destination: SettingsDestinationId): string {
  return `opl-studio-settings-${destination}`;
}

function SettingsMainSlot({ destination }: { destination: SettingsDestinationId }) {
  const renderContribution = useContext(SettingsContributionSlotContext);
  return <>{useStudio().renderSettings(destination, renderContribution ?? undefined)}</>;
}

function firstRunItemLabel(itemId: string, fallback: string | undefined, locale: "zh" | "en"): string {
  const labels: Record<string, [string, string]> = {
    workspace_root: ["工作目录", "Working directory"],
    codex: ["本机助手", "Local assistant"],
    codex_cli: ["本机助手", "Local assistant"],
    codex_config: ["模型访问", "Model access"],
    domain_modules: ["专业能力", "Professional capabilities"],
    family_runtime_provider: ["后台任务服务", "Background task service"]
  };
  return labels[itemId]?.[locale === "zh" ? 0 : 1] ?? fallback ?? itemId;
}

function FirstRunOnboardingSlot({
  complete,
  openSection
}: {
  complete(): void;
  openSection(id: string): void;
}) {
  const studio = useStudio();
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState("");
  const systemInitialize = studio.initialization?.systemInitialize;
  const setupFlow = systemInitialize?.setupFlow;
  if (studio.initializationStatus !== "ready" || !systemInitialize || !setupFlow?.isFirstRun || setupFlow.readyToLaunch) return null;
  const coreItems = systemInitialize.checklist.filter((item) => item.readinessLayer === "core_launch");
  const nextCoreItemId = coreItems.find((item) => item.blocking)?.itemId ?? setupFlow.phase;
  const destination: SettingsDestinationId = nextCoreItemId === "workspace_root" ? "workspace" : "account";
  const directSetup = nextCoreItemId === "workspace_root" && studio.setupCapabilities.workspaceRoot
    ? { label: studio.locale === "zh" ? "选择工作目录" : "Choose working directory", run: studio.chooseWorkspaceRoot }
    : ["codex", "codex_cli"].includes(nextCoreItemId ?? "") && studio.setupCapabilities.codexInstall
      ? { label: studio.locale === "zh" ? "安装本机助手" : "Install local assistant", run: studio.installCodex }
      : null;
  const runPrimarySetup = async () => {
    if (!directSetup) {
      complete();
      openSection(settingsSectionId(destination));
      return;
    }
    setSetupBusy(true);
    setSetupError("");
    const result = await directSetup.run();
    if (result.status === "error") setSetupError(result.message ?? (studio.locale === "zh" ? "此步骤未完成。" : "This step did not complete."));
    setSetupBusy(false);
  };
  return (
    <OnboardingSurface>
      <section className="opl-first-run" role="dialog" aria-modal="true" aria-labelledby="opl-first-run-title">
        <header>
          <span className="opl-first-run-mark" aria-hidden="true">OPL</span>
          <div>
            <p>{studio.locale === "zh" ? "首次启动" : "First launch"}</p>
            <h1 id="opl-first-run-title">{studio.locale === "zh" ? "完成本机准备" : "Finish local setup"}</h1>
            <span>{studio.locale === "zh" ? "检查只读取本机状态；后台能力不会阻止你进入应用。" : "The check reads local state only; background capabilities do not block entry."}</span>
          </div>
        </header>
        <div className="opl-first-run-checklist">
          {coreItems.map((item) => {
            const ready = !item.blocking;
            return (
              <div key={item.itemId} data-ready={ready}>
                {ready ? <CheckCircle2 aria-hidden="true" size={18} /> : <AlertCircle aria-hidden="true" size={18} />}
                <span><strong>{firstRunItemLabel(item.itemId, item.label, studio.locale)}</strong><small>{ready ? (studio.locale === "zh" ? "已就绪" : "Ready") : item.nextVisibleStep ?? (studio.locale === "zh" ? "需要设置" : "Setup required")}</small></span>
              </div>
            );
          })}
        </div>
        {setupError ? <p className="opl-first-run-error" role="alert">{setupError}</p> : null}
        <footer>
          <button className="settings-icon-button" type="button" aria-label={studio.locale === "zh" ? "重新检查" : "Check again"} title={studio.locale === "zh" ? "重新检查" : "Check again"} disabled={setupBusy} onClick={studio.refreshInitialization}><RefreshCw aria-hidden="true" size={16} /></button>
          <button className="settings-action-button" type="button" disabled={setupBusy} onClick={complete}>{studio.locale === "zh" ? "稍后处理" : "Do this later"}</button>
          <button className="settings-action-button primary" type="button" disabled={setupBusy} onClick={() => { void runPrimarySetup(); }}>
            {setupBusy ? <LoaderCircle className="spin" aria-hidden="true" size={14} /> : null}
            {directSetup?.label ?? (studio.locale === "zh" ? "打开设置" : "Open settings")}
          </button>
        </footer>
      </section>
    </OnboardingSurface>
  );
}

export class OplStudioDshSlotHost {
  readonly core = new SlotCore();
  private readonly renderer = createSlotRenderer();
  private readonly registrations = new Map<string, ActiveRegistration>();
  private readonly host: SlotRendererHost;

  constructor() {
    this.host = {
      subscribe: (key, listener) => this.core.subscribe(key, listener), getVersion: (key) => this.core.getVersion(key),
      entriesOf: (key) => this.core.entries(key), entriesOfSlot: (key) => this.core.entriesOfSlot(key),
      reportEntryError: (key, entry, error, info) => this.core.reportEntryError(key, entry, error, info), specOf: (key) => this.core.specDynamic(key),
      isLive: (entry) => this.core.isLive(entry), storeOf: () => undefined,
      sessions: { list: constantObservable(emptyArraySnapshot), provideInfo: constantObservable(noSessionSnapshot) }, workspaces: { list: constantObservable(emptyArraySnapshot) }
    };
    this.core.onEntryError((key, entry, error) => console.error("OPL Studio UI slot failed", { slot: key, registrant: entry.registrant, error }));
    this.registerStaticSlots();
  }

  private registerStaticSlots() {
    const register = (spec: Record<string, unknown>, component: unknown) => this.core.register(spec as any, component as any);
    register({ name: "root", registrant: "opl-studio", children: { sidebar: { kind: "single", scope: "root" }, conversation: { kind: "single", scope: "root" }, details: { kind: "single", scope: "root" }, "shell.overlay": { kind: "list", scope: "root" }, "composer.palette": { kind: "list", scope: "root" } } }, OplStudioRoot);
    register({ name: "sidebar", registrant: "dsh-ui-sidebar", children: { "sidebar.brand.mark": { kind: "single", scope: "root" }, "sidebar.brand.name": { kind: "single", scope: "root" }, "sidebar.workspaces": { kind: "single", scope: "root" }, "sidebar.settings": { kind: "single", scope: "root" }, "sidebar.footer.action": { kind: "list", scope: "root" } } }, SidebarSlot);
    register({ name: "sidebar.brand.mark", registrant: "opl-studio" }, OplBrandMarkSlot);
    register({ name: "sidebar.brand.name", registrant: "opl-studio" }, OplBrandNameSlot);
    register({ name: "sidebar.workspaces", registrant: "opl-studio" }, SidebarWorkspacesSlot);
    register({ name: "sidebar.settings", registrant: "dsh-ui-settings", children: { "settings.trigger": { kind: "single", scope: "root" }, "settings.header": { kind: "single", scope: "root" }, "settings.action": { kind: "list", scope: "root" }, "settings.close": { kind: "single", scope: "root" }, "settings.section": { kind: "list", scope: "root" }, "settings.onboarding": { kind: "list", scope: "root" } } }, SettingsSlot);
    register({ name: "settings.trigger", registrant: "opl-studio" }, SettingsTriggerSlot);
    register({ name: "settings.header", registrant: "opl-studio" }, SettingsHeaderSlot);
    register({ name: "settings.close", registrant: "opl-studio" }, SettingsCloseSlot);
    register({ name: "settings.onboarding", id: "opl-first-run", order: 0, registrant: "opl-studio" }, FirstRunOnboardingSlot);
    for (const [order, destination] of settingsDestinations("en").entries()) {
      register(
        { name: "settings.section", id: settingsSectionId(destination.id), order: order * 10, label: destination.label, registrant: "opl-studio" },
        () => <SettingsMainSlot destination={destination.id} />
      );
    }
    register({ name: "conversation", registrant: "dsh-ui-conversation", children: { "conversation.session.header": { kind: "single", scope: "root" }, "conversation.session": { kind: "single", scope: "root" }, "conversation.composer.bar": { kind: "single", scope: "root" }, "conversation.input.overlay": { kind: "single", scope: "root" }, "conversation.input.left": { kind: "list", scope: "root" }, "conversation.input.right": { kind: "list", scope: "root" }, "conversation.input.dock": { kind: "list", scope: "root" }, "conversation.composer.dock": { kind: "list", scope: "root" }, "conversation.hero.brand.mark": { kind: "single", scope: "root" }, "conversation.hero.workspace": { kind: "single", scope: "root" }, "conversation.hero.agentPreset": { kind: "single", scope: "root" } } }, ConversationSlot);
    register({ name: "conversation.hero.brand.mark", registrant: "opl-studio" }, OplBrandMarkSlot);
    register({ name: "conversation.session.header", registrant: "opl-studio" }, ConversationHeaderSlot);
    register({ name: "conversation.session", registrant: "opl-studio" }, ConversationBodySlot);
    register({ name: "conversation.input.overlay", registrant: "opl-studio" }, ComposerOverlaySlot);
    register({ name: "conversation.composer.bar", registrant: "dsh-ui-conversation", children: { "conversation.input.attachments": { kind: "single", scope: "root" }, "conversation.input.plan": { kind: "single", scope: "root" }, "conversation.input.model": { kind: "single", scope: "root" } } }, InputBarSlot);
    register({ name: "conversation.input.attachments", registrant: "opl-studio" }, EmptyAttachmentSlot);
    register({ name: "conversation.input.model", registrant: "opl-studio" }, ComposerModelSlot);
    register({ name: "conversation.input.dock", id: "queue", order: 20, registrant: "dsh-ui-conversation" }, QueueDockSlot);
    register({ name: "conversation.hero.agentPreset", registrant: "opl-studio" }, HeroActionsSlot);
    register({ name: "details", registrant: "opl-studio", children: { "runtime.detail": { kind: "list", scope: "root" } } }, DetailsSlot);
    register({ name: "shell.overlay", id: "opl-studio-overlay", order: 0, registrant: "opl-studio" }, ShellOverlaySlot);
  }

  renderRoot(contributions: OplClientContributionsService) {
    return this.renderer.renderRoot(this.host, { contributions });
  }

  // Package occupants come only from the Framework Host projection. Static DSH
  // registrations define renderer structure, not a second Package graph.
  replaceHostDerivedProjection(projection: OplUiContributionsProjection) {
    const next = new Map(projection.entries.map((entry) => [entry.contributionKey, entry]));
    for (const [key, active] of this.registrations) {
      const entry = next.get(key); const fingerprint = entry ? JSON.stringify(entry) : null;
      if (!entry || fingerprint !== active.fingerprint) { active.dispose(); this.registrations.delete(key); }
    }
    for (const entry of projection.entries) if (!this.registrations.has(entry.contributionKey)) this.registerContribution(entry);
  }

  clearProjection() { for (const active of this.registrations.values()) active.dispose(); this.registrations.clear(); }

  private registerContribution(entry: OplUiContribution) {
    const fingerprint = JSON.stringify(entry);
    const Component = () => { const studio = useStudio(); return <ProjectedContribution entry={entry} owner={studio.contributionOwner} />; };
    const dispose = this.core.register({ name: entry.slot, id: entry.contributionKey, order: entry.sortOrder, label: entry.contributionId, registrant: entry.packageId } as any, Component as any);
    this.registrations.set(entry.contributionKey, { fingerprint, dispose });
  }
}

const slotHost = new OplStudioDshSlotHost();

export function renderOplStudioRoot(contributions: OplClientContributionsService) {
  return slotHost.renderRoot(contributions);
}
export function clearOplStudioContributionProjection() { slotHost.clearProjection(); }
export function dshSlotSnapshot(slot?: OplUiContributionSlot) { return slotHost.core.snapshot(slot); }
export { OPL_UI_CONTRIBUTION_SLOTS };
