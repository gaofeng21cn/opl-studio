declare module "@opl-vendor/dsh-app-frame" {
  export const AppFrame: (props: any) => JSX.Element;
}

declare module "@opl-vendor/dsh-sidebar-root" {
  export const SidebarRoot: (props: any) => JSX.Element;
}

declare module "@opl-vendor/dsh-conversation-root" {
  export const ConversationRoot: (props: any) => JSX.Element;
}

declare module "@opl-vendor/dsh-input-bar" {
  export const InputBar: (props: any) => JSX.Element;
}

declare module "@opl-vendor/dsh-queue-dock" {
  export const QueueDock: (props: any) => JSX.Element;
}

declare module "@opl-vendor/dsh-settings-root" {
  export const SettingsRoot: (props: any) => JSX.Element;
}

declare module "@opl-vendor/dsh-workspace-browser" {
  export const WorkspaceBrowser: (props: any) => JSX.Element;
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
  export const SessionNodeItem: (props: any) => JSX.Element;
}

declare module "@opl-vendor/dsh-agent-preset-seat" {
  export const AgentPresetSeat: (props: any) => JSX.Element;
}

declare module "@opl-vendor/dsh-model-select" {
  export const ModelSelect: (props: any) => JSX.Element;
}

declare module "@deepseek-ai/dsh-client-ui-settings/client" {}

declare module "@deepseek-ai/dsh-client-runtime/client" {
  import type {
    ActionsDecl,
    StoreHandle,
    StoreSpec
  } from "@deepseek-ai/dsh-client-ui-slots";

  export type EngineStoreHandle<T, A extends ActionsDecl<T>> = StoreHandle<T, A>;
  export function defineStore<T, A extends ActionsDecl<T>>(spec: StoreSpec<T, A>): StoreHandle<T, A>;
}
