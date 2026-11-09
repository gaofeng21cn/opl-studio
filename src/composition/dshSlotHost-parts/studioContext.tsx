import type { Context } from "@deepseek-ai/cordis";
import type { SlotRegistry } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/registry.ts";
import { zh as workspaceZh, en as workspaceEn } from "../../vendor/deepseek-harness/packages/client/ui-workspace/src/client/locales.ts";
import { zh as conversationZh, en as conversationEn } from "../../vendor/deepseek-harness/packages/client/ui-conversation/src/client/locales.ts";
import { zh as modelZh, en as modelEn } from "../../vendor/deepseek-harness/packages/client/ui-model-selection/src/client/locales.ts";
import { zh as agentZh, en as agentEn } from "../../vendor/deepseek-harness/packages/client/ui-agent-preset/src/client/locales.ts";
import { zh as settingsZh, en as settingsEn } from "../../vendor/deepseek-harness/packages/client/ui-settings-general/src/client/locales.ts";
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode, type RefObject } from "react";
export { SettingsNavigationContext } from "../../workbench/settings/types";
import type { OplStudioSurface } from "../oplStudioSurface";
import { workspaceEntries } from "../workspaceViewModel";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    sidebar: { kind: "single"; scope: "root"; owner: { collapsed: boolean; width: number } };
    main: { kind: "keyed"; scope: "root"; owner: object };
    rightbar: { kind: "single"; scope: "root"; owner: { width: number; viewportWidth: number; canShow: boolean } };
    "shell.overlay": { kind: "list"; scope: "root"; owner: object };
    "shell.leading": { kind: "single"; scope: "root"; owner: object };
    "shell.bottom": { kind: "single"; scope: "root"; owner: object };
    "sidebar.workspaces": { kind: "single"; scope: "root"; owner: { wide: boolean; expandSidebar(): void } };
    "sidebar.settings": { kind: "single"; scope: "root"; owner: { wide: boolean } };
    "sidebar.footer.action": { kind: "list"; scope: "root"; owner: { wide: boolean } };
    "sidebar.panellist": { kind: "list"; scope: "root"; owner: { size: number; active: boolean } };
    "conversation.session.header": { kind: "single"; scope: "root"; owner: object };
    "conversation.session": { kind: "single"; scope: "root"; owner: object };
    "conversation.composer.bar": { kind: "single"; scope: "root"; owner: Record<string, unknown> };
    "conversation.input.overlay": { kind: "single"; scope: "root"; owner: object };
    "conversation.input.left": { kind: "list"; scope: "root"; owner: object };
    "conversation.input.right": { kind: "list"; scope: "root"; owner: object };
    "conversation.input.plan": { kind: "single"; scope: "root"; owner: object };
    "conversation.input.permission": { kind: "single"; scope: "root"; owner: object };
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

const focusableSelector = 'summary, button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export const SettingsContributionSlotContext = createContext<((options?: { only?: string }) => ReactNode) | null>(null);

export function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.closest('[hidden], [aria-hidden="true"]') && element.getClientRects().length > 0 && element.checkVisibility?.() !== false);
}

export function useSettingsDialogFocus(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let dialog: HTMLElement | null = null;
    let restoreTarget: HTMLElement | null = null;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const activeModal = document.activeElement?.closest<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (activeModal && activeModal !== dialog) return;
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
      const nextDialog = document.querySelector<HTMLElement>('[data-shortcut-modal="settings"][role="dialog"]');
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
    observer.observe(document.body, { childList: true, subtree: true });
    syncDialog();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", trapFocus, true);
    };
  }, [rootRef]);
}

export function useDshSnapshot<T, S>(store: { getSnapshot(): T; subscribe(listener: () => void): () => void }, selector: (value: T) => S): S {
  return selector(useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot));
}

export type StudioContextValue = OplStudioSurface & {
  narrow: boolean;
  detailsOpen: boolean;
  toggleSidebar(): void;
  closeDetails(): void;
};

export const StudioContext = createContext<StudioContextValue | null>(null);
export const ClientContext = createContext<Context | null>(null);
export function useClientContext(): Context {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("OPL Studio slot rendered outside its Cordis client context");
  return ctx;
}

export const SlotCoreContext = createContext<SlotRegistry | null>(null);

export function useSlotCore(): SlotRegistry {
  const value = useContext(SlotCoreContext);
  if (!value) throw new Error("OPL Studio DSH slot rendered without the slot host core");
  return value;
}

export function useStudio(): StudioContextValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error("OPL Studio DSH slot rendered outside the Studio surface");
  return value;
}

export function translate(locale: "zh" | "en", key: string, params?: Record<string, unknown>): string {
  const copy: Record<string, [string, string]> = {
    "session.new.label": ["新建任务", "New task"], "session.new": ["新建任务", "New task"],
    "toggle.open": ["展开侧栏", "Expand sidebar"], "toggle.collapse": ["收起侧栏", "Collapse sidebar"],
    "panels.label": ["主页面", "App pages"],
    "hero.headline": ["One Person Lab", "One Person Lab"], "hero.preview": ["", ""],
    "hero.chooseWorkspace": ["选择工作区", "Choose workspace"], "placeholder.workspace": ["先选择工作区", "Choose a workspace first"],
    "placeholder.hero": ["向 OPL 描述你的目标", "Describe your goal to OPL"], "placeholder.default": ["向 OPL 描述你的目标", "Describe your goal to OPL"],
    "placeholder.unavailable": ["当前不可输入", "Input unavailable"], "placeholder.parentOffline": ["父任务当前离线", "Parent task is offline"],
    "placeholder.steerQueue": ["输入后续指令", "Add a follow-up"], "placeholder.plan": ["描述计划", "Describe the plan"],
    "input.commands": ["添加文件、Skill 或模块", "Add files, Skills, or modules"], "file.attach": ["添加文件", "Attach files"], "input.send": ["发送", "Send"], "input.stop": ["停止", "Stop"],
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
    ? { ...conversationZh, ...workspaceZh, ...modelZh, ...agentZh, ...settingsZh }
    : { ...conversationEn, ...workspaceEn, ...modelEn, ...agentEn, ...settingsEn };
  let value = copy[key]?.[locale === "zh" ? 0 : 1] ?? dshDictionary[key as keyof typeof dshDictionary] ?? key;
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}

// DSH uses null for the current conversation and falls back to the "conversation"
// main-slot key. A non-null id denotes a global panel and clears row selection.
export function useConversationPanelInfo<T>(selector: (info: { activePanelId: string | null }) => T): T {
  const studio = useStudio();
  return selector({ activePanelId: studio.primaryView === "workspace" ? "workspace" : null });
}
export function useStudioPanels<T>(selector: (panels: readonly { id: string; order: number; label: string }[]) => T): T {
  const studio = useStudio();
  return selector(workspaceEntries(studio.uiContributions.entries).length ? [{
    id: "workspace", order: 10, label: studio.locale === "zh" ? "能力工作台" : "Capability workspace"
  }] : []);
}
// Plain Enter queues while the agent is busy; the accelerated chord steers.
const studioBusyEnter = "queue" as const;
export const useStudioBusyEnter = (selector: (behavior: typeof studioBusyEnter) => unknown) => selector(studioBusyEnter);
// DSH 0.2.1-alpha.1 UI packages receive these hook faces through DSH's runtime injector. The
// Studio host renders the reference components directly, so bind the same
// contracts to the App-owned local projections here.
const studioShortcuts: readonly { id: string; keys: readonly string[]; aria: string }[] = [];
export const useStudioShortcuts = (selector: (entries: typeof studioShortcuts) => unknown) => selector(studioShortcuts);
const studioDeveloperTools = true;
export const useStudioDeveloperTools = (selector: (enabled: boolean) => unknown) => selector(studioDeveloperTools);
const studioStopShortcut: readonly string[] = [];
export const useStudioStopShortcut = (selector: (keys: typeof studioStopShortcut) => unknown) => selector(studioStopShortcut);
const studioWorkspaceShortcutState = { searchRequest: 0, addRequested: false, directoryBusy: false, renameTarget: null, forkError: null };
export const useStudioWorkspaceShortcuts = (selector: (state: typeof studioWorkspaceShortcutState) => unknown) => selector(studioWorkspaceShortcutState);
// Studio queue rows carry text only, so the queue thumbnail loader is inert.
export const loadStudioQueueImage = async (): Promise<string> => "";
