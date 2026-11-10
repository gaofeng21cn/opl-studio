declare module "@opl-vendor/dsh-app-frame" {
  import type { ReactNode } from "react";
  import type { SnapshotSelectorHook } from "@deepseek-ai/dsh-client-ui-slots";
  // Studio supplies the presentation face consumed by AppFrame, while its
  // Session and panel owners remain Codex/App. Keep required injected hooks
  // explicit so a DSH upgrade cannot silently mount an undefined callback.
  export interface StudioFrameLayout {
    sidebar: number;
    rightbar: number | null;
    rightbarTrack: boolean;
    rightbarShown: boolean;
    rightbarFullscreen: boolean;
    rightbarInstant: boolean;
    viewportWidth: number;
    narrowExpanded: boolean;
  }
  export interface StudioFrameSessions {
    byId: Record<string, { id: string; title?: string; retainedBy: { mainView: number } }>;
  }
  export interface StudioAppFrameProps {
    useStore: SnapshotSelectorHook<{ layoutInfo: StudioFrameLayout }>;
    useSessions: SnapshotSelectorHook<StudioFrameSessions>;
    usePanelInfo: SnapshotSelectorHook<{ activePanelId: string | null }>;
    useFoldedLandscape: SnapshotSelectorHook<boolean>;
    actions: {
      setSidebar(width: number): void;
      setRightbar(width: number): void;
      setViewportWidth(width: number): void;
      toggleSidebar(): void;
    };
    renderSlot(key: string, owner: object, options?: object): ReactNode;
    t(key: string, params?: Record<string, unknown>): string;
  }
  export const AppFrame: (props: StudioAppFrameProps) => ReactNode;
}

declare module "@opl-vendor/dsh-sidebar-root" {
  import type { ReactNode } from "react";
  export interface StudioSidebarProps {
    collapsed: boolean;
    width: number;
    drawer: boolean;
    useRemoteAccess(action: string): boolean;
    useEntryPins(selector: (ids: readonly string[]) => unknown): unknown;
    useEntryActions(selector: (registered: boolean) => unknown): unknown;
    setPinned(id: string, pinned: boolean): void;
    trackEntryClick(attributes: unknown): void;
    [prop: string]: unknown;
  }
  export const SidebarRoot: (props: StudioSidebarProps) => ReactNode;
}

declare module "@opl-vendor/dsh-conversation-root" {
  export const ConversationRoot: (props: any) => JSX.Element;
}

declare module "@opl-vendor/dsh-input-bar" {
  import type { ReactNode } from "react";
  export const InputBar: (props: {
    useAccess(action: string): boolean | undefined;
    [prop: string]: unknown;
  }) => ReactNode;
}

declare module "@opl-vendor/dsh-queue-dock" {
  export const QueueDock: (props: any) => JSX.Element;
}

declare module "@opl-vendor/dsh-settings-root" {
  export const SettingsRoot: (props: any) => JSX.Element;
}

declare module "@opl-vendor/dsh-workspace-browser" {
  import type { ReactNode } from "react";
  import type { SnapshotSelectorHook } from "@deepseek-ai/dsh-client-ui-slots";
  export interface StudioWorkspaceBrowserProps {
    useRemoteAccess(action: string): boolean;
    useSessionAccess(sessionId: string, action: string): boolean;
    useWorkspaceAccess(workspaceId: string, action: string): boolean;
    useContextMenu(): import("./studioMenus.mjs").ContextMenuBindings;
    useContextMenuTarget: SnapshotSelectorHook<import("./studioMenus.mjs").ContextMenuTarget | null>;
    useWorkspaceActionRequest: SnapshotSelectorHook<import("./studioMenus.mjs").WorkspaceActionRequest | null>;
    settleWorkspaceAction(): void;
    requestSessionRename(sessionId: string, title: string): void;
    notifyArchivedNotOpenable(): void;
    unarchiveSession(sessionId: string): Promise<void>;
    openSessionMenu(sessionId: string, title: string, point: { x: number; y: number }, mode?: "toggle"): void;
    openWorkspaceMenu(workspaceId: string, path: string, title: string, point: { x: number; y: number }, mode?: "toggle"): void;
    [prop: string]: unknown;
  }
  export const WorkspaceBrowser: (props: StudioWorkspaceBrowserProps) => ReactNode;
}

declare module "@opl-vendor/dsh-session-node" {
  export type DshSessionNode = {
    id: string;
    title: string;
    blank: boolean;
    running: boolean;
    runningSubagentCount: number;
    completed: boolean;
    updatedAt: number;
  };
  export const SessionNodeItem: (props: {
    useSessionAccess(sessionId: string, action: string): boolean;
    useContextMenu(): import("./studioMenus.mjs").ContextMenuBindings;
    useContextMenuTarget: import("@deepseek-ai/dsh-client-ui-slots").SnapshotSelectorHook<import("./studioMenus.mjs").ContextMenuTarget | null>;
    openSessionMenu(sessionId: string, title: string, point: { x: number; y: number }, mode?: "toggle"): void;
    onRenameRequest(sessionId: string, title: string): void;
    [prop: string]: unknown;
  }) => import("react").ReactNode;
}

declare module "@opl-vendor/dsh-agent-preset-seat" {
  export const AgentPresetSeat: (props: any) => JSX.Element;
}

declare module "@opl-vendor/dsh-model-select" {
  export const ModelSelect: (props: any) => JSX.Element;
}

declare module "@deepseek-ai/dsh-client-runtime/client" {
  import type {
    ActionsDecl,
    StoreHandle,
    StoreSpec
  } from "@deepseek-ai/dsh-client-ui-slots";

  export type EngineStoreHandle<T, A extends ActionsDecl<T>> = StoreHandle<T, A>;
  export function defineStore<T, A extends ActionsDecl<T>>(spec: StoreSpec<T, A>): StoreHandle<T, A>;
}
