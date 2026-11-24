import type { ComponentType, ReactNode } from "react";

export { SlotRegistry } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/registry.ts";
export type { UiRendererService } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/index.ts";
export { createSlotRenderer } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/scoped-slots.tsx";
export { bindSnapshotSelector } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/bind.ts";

export { createNavigationStore } from "../../vendor/deepseek-harness/packages/client/ui-plugin-manager/src/client/navigation-store.ts";
export { createPluginHeaderRef } from "../../vendor/deepseek-harness/packages/client/ui-plugin-manager/src/client/header-scroll.ts";

export { createSettingsShellStore } from "../../vendor/deepseek-harness/packages/client/ui-settings-general/src/client/shell-store.ts";
export { createPanelPins } from "../../vendor/deepseek-harness/packages/client/ui-sidebar/src/client/panel-pins";
export { createWorkspaceViewStore } from "../../vendor/deepseek-harness/packages/client/ui-workspace/src/client/stores.ts";

export type {
  ChainRenderOpts,
  HostObservable,
  RenderOpts,
  SnapshotSelectorHook,
  SlotRenderer,
  ScopedStandardSourceBinding,
  SlotRendererHost,
  SlotScopeAdapter,
  StandardSourceBinding,
  StoreInstanceLike
} from "@deepseek-ai/dsh-client-ui-slots";

export const PanelIcon: ComponentType<Record<string, any>>;
export const HeaderLeadingControls: ComponentType<Record<string, any>>;

export const ConversationContent: ComponentType<Record<string, any>>;

export type DirectoryFlowOwnerProps = {
  open: boolean;
  busy: boolean;
  onPicked: (path: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
};

export type WorkspacePickerProps = {
  createWorkspace(input: { path: string }): Promise<any>;
  useDirectoryFlow: any;
  useWorkspaces: (selector: (snapshot: any) => any) => any;
  t(key: string, params?: Record<string, unknown>): string;
  [key: string]: any;
};

export const WorkspacePicker: ComponentType<WorkspacePickerProps>;
export function SessionRenameDialog(props: Record<string, any>): ReactNode;

export const TaskManagerPage: ComponentType<Record<string, unknown>>;
export function createCatalogSource(deps: Record<string, unknown>): any;
export function createEditorStore(): any;

export function applyContextMenus(ctx: any, config?: { resolutionTimeoutMs?: number }): void;
export function createContextMenuBindings(open: any, active: () => boolean): any;

export {
  Button,
  IconAlarmClockOutlineRegular,
  IconAppsAddOutlineRegular,
  IconGaugeOutlineRegular,
  IconPinOutlineRegular,
  MenuItemButton
} from "@deepseek-ai/dsh-client-ui-primitives";
