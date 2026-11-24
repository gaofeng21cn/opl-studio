import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HeaderLeadingControls } from "../../integrations/deepseek-harness/sidebarComponents.mjs";
import { AppFrame } from "@opl-vendor/dsh-app-frame";
import { createSidebarPanelPins } from "./sidebarPreferences";
import { SidebarRoot } from "@opl-vendor/dsh-sidebar-root";
import { ConversationRoot } from "@opl-vendor/dsh-conversation-root";
import { ConversationContent } from "../../integrations/deepseek-harness/conversationContent.mjs";
import { WorkspaceBrowser } from "@opl-vendor/dsh-workspace-browser";
import {
  Button,
  createWorkspaceViewStore,
  IconPinOutlineRegular,
  MenuItemButton,
  WorkspacePicker,
  type DirectoryFlowOwnerProps,
  type WorkspacePickerProps
} from "@gaofeng21cn/opl-dsh-adapters/dsh-shell";
import { NativeDirectoryFlow } from "@deepseek-ai/dsh-client-ui-directory-picker-native/src/client/flow.ts";
import type { WorkspaceSnapshot } from "@deepseek-ai/dsh-api-workspace-controller/client";
import { SessionNodeItem, type DshSessionNode } from "@opl-vendor/dsh-session-node";
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from "../../integrations/deepseek-harness/runtimeShim";
import { useStudioMenus } from "./studioMenus";
import type { OplStudioSurface } from "../oplStudioSurface";
import { buildConversationWorkspaceItems } from "../conversationWorkspace";
import {
  StudioContext,
  useConversationPanelInfo,
  useDshSnapshot,
  useStudioFoldedLandscape,
  useStudio,
  useStudioDirectoryFlow,
  useStudioPanels,
  useStudioRemoteAccess,
  useStudioSessionAccess,
  useStudioWorkspaceAccess,
  useStudioShortcuts,
  translate
} from "./studioContext";

function conversationWorkspaceSnapshot(studio: OplStudioSurface, sessionId: string): WorkspaceSnapshot {
  return {
    items: buildConversationWorkspaceItems({
      projects: studio.threadProjects,
      currentThreadId: studio.currentThreadId,
      selectedProjectId: studio.selectedProjectId,
      pendingWorkspacePath: studio.pendingWorkspacePath,
      workspacePath: studio.workspacePath,
      projectTitle: studio.projectTitle,
      sessionId
    }),
    archivedSessionIds: [],
    pinnedSessionIds: [],
    phase: studio.threadDirectoryStatus === "ready" ? "ready" : "pending",
    state: studio.threadDirectoryStatus === "error" ? "error" : studio.threadDirectoryStatus === "loading" ? "loading" : "idle",
    error: null
  };
}

function useHeroDirectoryFlow<S>(selector: (occupied: boolean) => S): S {
  return useStudioDirectoryFlow("conversation.hero.workspace.directoryFlow", selector);
}

function useSidebarDirectoryFlow<S>(selector: (occupied: boolean) => S): S {
  return useStudioDirectoryFlow("sidebar.workspaces.directoryFlow", selector);
}

export function StudioDirectoryFlow(props: DirectoryFlowOwnerProps) {
  const studio = useStudio();
  return studio.directoryPickerAvailable ? <NativeDirectoryFlow {...props} pick={studio.pickDirectory} /> : null;
}

export function WorkspacePickerSlot(props: Omit<WorkspacePickerProps, "createWorkspace" | "useDirectoryFlow" | "useWorkspaces" | "t">) {
  const studio = useStudio();
  const workspaces = conversationWorkspaceSnapshot(studio, "opl-current");
  return <WorkspacePicker
    {...props}
    createWorkspace={({ path }) => studio.createWorkspace(path)}
    useDirectoryFlow={useHeroDirectoryFlow}
    useWorkspaces={selector => selector(workspaces)}
    t={(key, params) => translate(studio.locale, key, params)}
  />;
}

export function StudioFrame({ surface, renderSlot }: { surface: OplStudioSurface; renderSlot: any }) {
  const [panels, setPanels] = useState({ sidebar: 280, rightbar: 0, rightbarTrack: false, rightbarShown: false, rightbarFullscreen: false, rightbarInstant: false, viewportWidth: globalThis.innerWidth || 1440, narrow: (globalThis.innerWidth || 1440) < 1024, narrowExpanded: false });
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const frameRootRef = useRef<HTMLElement | null>(null);
  const actions = useMemo(() => ({
    setSidebar: (px: number) => setPanels((current) => ({ ...current, sidebar: Math.min(420, Math.max(264, px)) })),
    setRightbar: () => undefined,
    setViewportWidth: (viewportWidth: number) => setPanels((current) => current.viewportWidth === viewportWidth ? current : { ...current, viewportWidth, narrow: viewportWidth < 1024, narrowExpanded: viewportWidth < 1024 === current.narrow ? current.narrowExpanded : false }),
    toggleSidebar: () => setPanels((current) => current.narrow ? { ...current, narrowExpanded: !current.narrowExpanded } : { ...current, sidebar: current.sidebar === 0 ? 280 : 0 }),
    setNarrow: (narrow: boolean) => setPanels((current) => current.narrow === narrow ? current : { ...current, narrow, narrowExpanded: false }),
    openDetails: () => setInspectorOpen(true),
    closeDetails: () => setInspectorOpen(false)
  }), []);
  const sessions = { phase: "ready", current: "opl-current", byId: { "opl-current": { id: "opl-current", title: surface.currentThreadId ? surface.sessionTitle : undefined, blank: false, cwd: surface.workspacePath, retainedBy: { mainView: 1 } } } };
  const value = useMemo(() => ({
    ...surface,
    narrow: panels.narrow,
    detailsOpen: inspectorOpen,
    openPrimaryView: (view: OplStudioSurface["primaryView"]) => {
      if (view !== "conversation") actions.closeDetails();
      setPanels(current => current.narrowExpanded ? {...current, narrowExpanded: false} : current);
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
          useStore={(selector) => selector({ layoutInfo: panels })}
          useSessions={(selector) => selector(sessions)}
          usePanelInfo={useConversationPanelInfo}
          useFoldedLandscape={useStudioFoldedLandscape}
          actions={actions}
          renderSlot={renderSlot}
          t={(key: string, params?: Record<string, unknown>) => translate(surface.locale, key, params)}
        />
      </main>
    </StudioContext.Provider>
  );
}

export function SidebarSlot({ collapsed, width, drawer, renderSlot, renderFactorySlot }: { collapsed: boolean; width: number; drawer: boolean; renderSlot: any; renderFactorySlot: any }) {
  const studio = useStudio();
  const panelIds = useStudioPanels(panels => panels.map(panel => panel.id));
  const pins = useMemo(() => createSidebarPanelPins(panelIds, globalThis.__OPL_SIDEBAR_DEFAULT_PINS__ ?? []), []);
  useEffect(() => pins.reconcile(panelIds), [pins, panelIds]);
  return (
    <div className="opl-dsh-sidebar-shell" data-collapsed={collapsed || undefined} data-narrow-expanded={studio.narrow && !collapsed || undefined}>
      <SidebarRoot
        collapsed={collapsed}
        width={width}
        drawer={drawer}
        useRemoteAccess={useStudioRemoteAccess}
        useEntryPins={(selector: (ids: readonly string[]) => unknown) => useDshSnapshot(pins.unpinned, selector)}
        setPinned={pins.setPinned}
        trackEntryClick={() => undefined}
        startSession={studio.startSession}
        toggleSidebar={studio.toggleSidebar}
        selectPanel={(id: string) => {
          if (panelIds.includes(id)) {
            studio.openPrimaryView(id as OplStudioSurface["primaryView"]);
          }
        }}
        usePanels={useStudioPanels}
        useEntryActions={(selector: (registered: boolean) => unknown) => selector(panelIds.length > 0)}
        useShortcuts={useStudioShortcuts}
        usePanelInfo={useConversationPanelInfo}
        t={(key: string, params?: Record<string, unknown>) => translate(studio.locale, key, params)}
        renderSlot={renderSlot}
        renderFactorySlot={renderFactorySlot}
      />
    </div>
  );
}

export function SidebarLeadingSlot() {
  const studio = useStudio();
  return <HeaderLeadingControls toggleSidebar={studio.toggleSidebar} startSession={studio.startSession}
    trackEntryClick={() => undefined} useRemoteAccess={useStudioRemoteAccess} useShortcuts={useStudioShortcuts}
    t={(key: string, params?: Record<string, unknown>) => translate(studio.locale, key, params)} />;
}

/** Reuses DSH's menu row primitive for the sidebar More menu. */
export function SidebarPanelActionsSlot({ entries, onOpen, onPinnedChange, onDismiss, renderFactorySlot }: {
  entries: readonly { id: string; label: string; pinned: boolean; active?: boolean }[];
  onOpen(id: string): void;
  onPinnedChange(id: string, pinned: boolean): void;
  onDismiss(): void;
  renderFactorySlot: any;
}) {
  const studio = useStudio();
  const zh = studio.locale === "zh";
  return <>{entries.filter(entry => !entry.pinned).map(entry => <div key={entry.id} className="opl-sidebar-more-entry">
    <MenuItemButton current={entry.active === true} icon={renderFactorySlot("sidebar.panel.icon", { id: entry.id, size: 16, active: entry.active === true })} onSelect={() => { onDismiss(); onOpen(entry.id); }}>{entry.label}</MenuItemButton>
    <Button size="sm" role="menuitem" aria-label={zh ? `固定${entry.label}` : `Pin ${entry.label}`} onClick={() => { onDismiss(); onPinnedChange(entry.id, true); }}><IconPinOutlineRegular size={14} /></Button>
  </div>)}</>;
}

export function SidebarWorkspacesSlot({ wide, expandSidebar, useSectionScroller, renderFactorySlot, renderSlot }: { wide: boolean; expandSidebar(): void; useSectionScroller: any; renderFactorySlot: any; renderSlot: any }) {
  const studio = useStudio();
  const menus = useStudioMenus();
  const workspaceStore = useMemo(() => createWorkspaceViewStore().create(), []);
  const list: SessionListState = useMemo(() => {
    const projects = studio.threadProjects.filter(project => !project.projectless);
    const byId = Object.fromEntries(projects.flatMap(project => project.threads.map(thread => [thread.id, {
      id: thread.id,
      title: thread.title,
      displayTitle: thread.title,
      cwd: thread.workspace,
      running: thread.status === "running",
      completed: thread.status === "completed",
      blank: false,
      retainedBy: { mainView: thread.id === studio.currentThreadId ? 1 : 0 },
      updatedAt: thread.updatedAt ? Date.parse(thread.updatedAt) : 0
    }]))) as SessionListState["byId"];
    return {
      ids: Object.keys(byId), byId, current: studio.currentThreadId,
      phase: studio.threadDirectoryStatus,
      subagentsByParent: {}, jobsBySession: {}, projectionsBySession: {}, currentAddress: undefined
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
    archivedSessionIds: [],
    pinnedSessionIds: []
  }), [studio.threadDirectoryStatus, studio.threadProjects]);
  const recentList: SessionListState = useMemo(() => {
    const projectless = studio.threadProjects.find(project => project.projectless);
    const byId = Object.fromEntries((projectless?.threads ?? []).map(thread => [thread.id, {
      id: thread.id,
      title: thread.title,
      displayTitle: thread.title,
      cwd: undefined,
      running: thread.status === "running",
      completed: thread.status === "completed",
      blank: false,
      retainedBy: { mainView: thread.id === studio.currentThreadId ? 1 : 0 },
      updatedAt: thread.updatedAt ? Date.parse(thread.updatedAt) : 0
    }])) as SessionListState["byId"];
    return {
      ids: Object.keys(byId), byId, current: studio.currentThreadId,
      phase: studio.threadDirectoryStatus,
      subagentsByParent: {}, jobsBySession: {}, projectionsBySession: {}, currentAddress: undefined
    };
  }, [studio.currentThreadId, studio.threadDirectoryStatus, studio.threadProjects]);
  const actions = workspaceStore.actions as Record<string, (...args: any[]) => void>;
  const dshLocale = (key: string, params?: Record<string, unknown>) => translate(studio.locale, key, params);
  if (studio.threadDirectoryStatus === "loading") {
    return <div className="opl-thread-directory-status" role="status">{studio.locale === "zh" ? "正在读取 Codex 会话..." : "Loading Codex conversations..."}</div>;
  }
  return <div className="opl-workspace-browser-seat">
    {studio.threadDirectoryStatus === "error" ? <div className="opl-thread-directory-error" role="status">
      <strong>{studio.locale === "zh" ? "会话历史暂时不可用" : "Conversation history is temporarily unavailable"}</strong>
      <span>{studio.threadDirectoryError}</span>
      <button type="button" onClick={() => studio.reloadThreadDirectory()}><RefreshCw aria-hidden="true" size={14} />{studio.locale === "zh" ? "重试历史" : "Retry history"}</button>
    </div> : null}
  <WorkspaceBrowser
    wide={wide}
    renderFactorySlot={renderFactorySlot}
    useSectionScroller={useSectionScroller}
    usePanelInfo={useConversationPanelInfo}
    expandSidebar={expandSidebar}
    useRemoteAccess={useStudioRemoteAccess}
    useSessionAccess={useStudioSessionAccess}
    useWorkspaceAccess={useStudioWorkspaceAccess}
    useContextMenu={menus.useContextMenu}
    useContextMenuTarget={menus.useContextMenuTarget}
    openSessionMenu={menus.openSessionMenu}
    openWorkspaceMenu={menus.openWorkspaceMenu}
    useWorkspaceActionRequest={menus.useWorkspaceActionRequest}
    settleWorkspaceAction={menus.settleWorkspaceAction}
    requestSessionRename={menus.requestSessionRename}
    notifyArchivedNotOpenable={menus.notifyArchivedNotOpenable}
    unarchiveSession={menus.unarchiveSession}
    useSessions={(selector: any) => selector(list)}
    useSessionStatus={(selector: any) => selector(new Map(Object.values(list.byId).filter((session) => session.pendingInteraction).map((session) => [session.id, { pendingInteraction: session.pendingInteraction }])))}
    useWorkspaces={(selector: any) => selector(workspaces)}
    useStore={(selector: any) => useDshSnapshot(workspaceStore, selector)}
    actions={actions}
    startSession={(projectId?: string) => studio.startSessionInProject(projectId)}
    open={(threadId: string) => studio.openThread(threadId)}
    renameWorkspace={(workspaceId: string, title: string) => studio.renameWorkspace(workspaceId, title)}
    deleteWorkspace={(workspaceId: string) => studio.deleteWorkspace(workspaceId)}
    insertWorkspaceBefore={(workspaceId: string, beforeWorkspaceId?: string) => studio.insertWorkspaceBefore(workspaceId, beforeWorkspaceId)}
    createWorkspace={({ path }: { path: string }) => studio.createWorkspace(path)}
    searchSessions={async (query: string) => ({ items: await studio.searchThreads(query), hasMore: false })}
    searchResultLimit={100}
    useDirectoryFlow={useSidebarDirectoryFlow}
    useHostInfo={(selector: any) => selector({ home: undefined })}
    useShortcuts={useStudioShortcuts}
    useWorkspaceShortcuts={menus.useWorkspaceShortcuts}
    requestSearch={menus.requestSearch}
    requestAddWorkspace={menus.requestAddWorkspace}
    closeAddWorkspace={menus.closeAddWorkspace}
    setDirectoryBusy={menus.setDirectoryBusy}
    renderSlot={renderSlot}
    t={dshLocale}
  />
  {wide ? <RecentSessionsSection list={recentList} current={studio.currentThreadId} locale={studio.locale} open={studio.openThread} menus={menus} renderFactorySlot={renderFactorySlot} /> : null}
  </div>;
}

function RecentSessionsSection({ list, current, locale, open, menus, renderFactorySlot }: {
  list: SessionListState;
  current?: string;
  locale: "zh" | "en";
  open(threadId: string): void;
  menus: ReturnType<typeof useStudioMenus>;
  renderFactorySlot: any;
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
        onRenameRequest={menus.requestSessionRename}
        useSessionAccess={useStudioSessionAccess}
        useContextMenu={menus.useContextMenu}
        useContextMenuTarget={menus.useContextMenuTarget}
        openSessionMenu={menus.openSessionMenu}
        renderSlot={() => null}
        renderFactorySlot={renderFactorySlot}
        t={t}
      />)}
    </div>
  </section>;
}

export function ConversationSlot({ renderSlot }: { renderSlot: any }) {
  const studio = useStudio();
  const sessionId = "opl-current";
  // Setup is real view content. Use DSH's active scroll layout instead of its
  // centered empty hero, which can clip long setup details on short windows.
  // This is renderer state only; it does not create or change a Codex thread.
  const blank = studio.conversationBlank && (!studio.installationState || studio.installationState.stage === 'ready');
  const session = { openState: "open", blank, awaitingFirstTurn: false, promptAttempted: false, pending: [], promptError: null, running: studio.sending, subagent: null, removed: false };
  const sessions = { phase: "ready", current: sessionId, byId: { [sessionId]: { id: sessionId, blank, cwd: studio.workspacePath, retainedBy: { mainView: 1 } } } };
  const workspaces = conversationWorkspaceSnapshot(studio, sessionId);
  const input = { draft: studio.prompt, attachmentIds: [], draftRev: studio.promptRevision, phase: "plain", occurrences: [], queue: studio.queue };
  // The upstream content treats this factory result as a component type.
  // Keep it stable across progress/state refreshes so disclosure and scroll survive.
  const SessionViews = useCallback(() => renderSlot("conversation.session", {}), [renderSlot]);
  return <div className="opl-dsh-conversation-shell">
    <ConversationRoot
      useSessionPendingInteraction={(selector: any) => selector(new Map())}
      useSessionStatus={(selector: any) => selector(new Map())}
      useConversation={(selector: any) => selector({ views: { get: () => undefined }, activeTargets: new Set() })}
      sessionId={sessionId}
      useSession={(selector: any) => selector(session)}
      useSessions={(selector: any) => selector(sessions)}
      useWorkspaces={(selector: any) => selector(workspaces)}
      useInput={(selector: any) => selector(input)}
      useComposerBlock={(selector: any) => selector(undefined)}
      renderSlot={renderSlot}
      renderFactorySlot={(_name: string, owner: Record<string, unknown>, options: { slots?: Record<string, unknown> }) => <ConversationContent
        {...owner}
        sessionId={sessionId}
        useSession={(selector: any) => selector(session)}
        useSessionStatus={(selector: any) => selector(new Map())}
        useSessions={(selector: any) => selector(sessions)}
        useWorkspaces={(selector: any) => selector(workspaces)}
        useInput={(selector: any) => selector(input)}
        useComposerBlock={(selector: any) => selector(undefined)}
        renderSlot={renderSlot}
        renderSlotChain={(_key: string, _owner: unknown, chain: { fallback: ReactNode }) => chain.fallback}
        selectWorkspace={async (workspaceId: string) => studio.selectSessionWorkspace(workspaceId)}
        useFactorySlot={(key: string, fallback: unknown) => key === "views" ? SessionViews : options.slots?.[key] ?? fallback}
        t={(key: string, params?: Record<string, unknown>) => translate(studio.locale, key, params)}
      />}
      renderSlotChain={(_key: string, _owner: unknown, options: { fallback: ReactNode }) => options.fallback}
      selectWorkspace={async () => undefined}
      t={(key: string, params?: Record<string, unknown>) => translate(studio.locale, key, params)}
    />
  </div>;
}

export function ApplicationMainSlot() { return <>{useStudio().applicationManagement}</>; }
export function SchedulesMainSlot() { return <>{useStudio().scheduledTasks}</>; }

export function ConversationHeaderSlot() {
  const studio = useStudio();
  return <header className="opl-dsh-session-header" data-testid="opl-session-header">
    <div className="opl-dsh-session-header-copy">
      <strong title={studio.sessionTitle}>{studio.sessionTitle}</strong>
      <span title={studio.projectTitle}>{studio.projectTitle}</span>
    </div>
  </header>;
}

export function ConversationBodySlot() { return <>{useStudio().conversationBody}</>; }
export function OplBrandMarkSlot(): null { return null; }
