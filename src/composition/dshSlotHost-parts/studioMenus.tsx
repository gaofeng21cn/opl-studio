import { useEffect } from "react";
import type { Context } from "@deepseek-ai/cordis";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import {
  applyContextMenus, createContextMenuBindings, SessionRenameDialog,
  type ContextMenus, type ContextMenuTarget, type MenuPoint,
  type SessionRenameTarget, type WorkspaceActionRequest,
} from "../../integrations/deepseek-harness/studioMenus.mjs";
import type { SlotRegistry } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/registry";
import { createEcosystemLocale } from "../../integrations/deepseek-harness/ecosystemClients";
import type { OplStudioSurface } from "../oplStudioSurface";
import { translate, useClientContext, useDshSnapshot, useStudio } from "./studioContext";

const controllers = new WeakMap<Context, ReturnType<typeof createStudioMenus>>();

function createStudioMenus(ctx: Context) {
  let surface: OplStudioSurface | undefined;
  let disposed = false;
  let renderedLocale = "en";
  const surfaceRevision = createSnapshotStore(0);
  const workspaceAction = createSnapshotStore<WorkspaceActionRequest | null>(null);
  const renameRequest = createSnapshotStore<SessionRenameTarget | null>(null);
  const shortcutState = createSnapshotStore({ searchRequest: 0, addRequested: false, directoryBusy: false });
  const locale = createEcosystemLocale(() => surface?.locale ?? "en");
  // The native menu service owns only window-local presentation. These isolated
  // projections supply its copy and current shortcut catalog, never DSH sessions.
  const menuScope = ctx.isolate("locale").isolate("shortcuts");
  menuScope.provide("locale", locale);
  menuScope.provide("shortcuts", { catalog: createSnapshotStore([]) });
  applyContextMenus(menuScope, { resolutionTimeoutMs: 1000 });
  // Both services are already provided by this same constructing fiber; its
  // active flag is published only after this synchronous installer returns.
  const menus = menuScope.get("contextMenus", false) as ContextMenus;
  const slots = menuScope.get("slots", false) as SlotRegistry;
  slots.installLocale(locale);
  const bindings = createContextMenuBindings((target, point) => menus.open(target, point), () => !disposed);
  const t = (key: string, params?: Record<string, unknown>) => translate(surface?.locale ?? "en", key, params);
  const currentSession = (id: string) => surface?.threadDirectoryStatus === "ready"
    ? surface.threadProjects.flatMap(project => project.threads).find(thread => thread.id === id) : undefined;
  const currentWorkspace = (id: string) => surface?.threadDirectoryStatus === "ready"
    ? surface.threadProjects.find(project => project.id === id && !project.projectless) : undefined;
  const requireSession = (id: string) => {
    if (!currentSession(id) || !surface) throw new Error(t("placeholder.unavailable"));
    return surface;
  };
  const requestSessionRename = (sessionId: string, currentTitle: string) => {
    requireSession(sessionId);
    renameRequest.set({ sessionId, currentTitle });
  };
  const settleSessionRename = () => renameRequest.set(null);
  const renameSession = async (sessionId: string, title: string) => requireSession(sessionId).renameSession(sessionId, title);
  const requestWorkspaceAction = (workspaceId: string, displayTitle: string, action: "rename" | "delete") => {
    const workspace = currentWorkspace(workspaceId);
    if (!workspace) throw new Error(t("placeholder.unavailable"));
    workspaceAction.set({ action, workspaceId, displayTitle, storedTitle: workspace.label });
  };
  ctx.effect(() => menus.register({
    id: "opl-studio.session", target: "session", order: 100,
    observe: () => [surfaceRevision],
    resolve: ({ sessionId, displayTitle }) => currentSession(sessionId) ? [
      { id: "rename", label: t("rename"), run: () => requestSessionRename(sessionId, displayTitle) },
      { id: "fork", label: t("menu.fork"), run: () => requireSession(sessionId).forkThread(sessionId) },
      { id: "archive", label: t("menu.archiveSession"), separatorBefore: true,
        run: () => requireSession(sessionId).archiveThread(sessionId) },
    ] : [],
  }));
  ctx.effect(() => menus.register({
    id: "opl-studio.workspace", target: "workspace", order: 100,
    observe: () => [surfaceRevision],
    resolve: ({ workspaceId, displayTitle }) => currentWorkspace(workspaceId) ? [
      { id: "rename", label: t("rename"), run: () => requestWorkspaceAction(workspaceId, displayTitle, "rename") },
      { id: "delete", label: t("delete.workspace"), danger: true, separatorBefore: true,
        run: () => requestWorkspaceAction(workspaceId, displayTitle, "delete") },
    ] : [],
  }));
  // Use the upstream dialog so focus, IME handling, pending writes, and errors
  // follow the same implementation as the Workspace browser's other dialogs.
  slots.inject("shell.overlay", () => slots.register({
    name: "shell.overlay", id: "opl-studio-session-rename", order: 100,
    inject: () => ({ hooks: { renameRequest }, settleSessionRename, renameSession, t }),
  }, SessionRenameDialog));
  ctx.effect(() => () => { disposed = true; controllers.delete(ctx); });

  const openMenu = (target: ContextMenuTarget, point: MenuPoint, mode?: "toggle") => {
    const active = menus.active.getSnapshot();
    const same = target.kind === "session" && active?.kind === "session"
      ? target.value.sessionId === active.value.sessionId
      : target.kind === "workspace" && active?.kind === "workspace"
        && target.value.workspaceId === active.value.workspaceId;
    if (mode === "toggle" && same) menus.close();
    else menus.open(target, point);
  };
  return {
    updateSurface(next: OplStudioSurface) { surface = next; },
    refresh() {
      surfaceRevision.set(surfaceRevision.getSnapshot() + 1);
      if (surface && renderedLocale !== surface.locale) {
        renderedLocale = surface.locale;
        locale.refresh();
      }
    },
    useContextMenu: () => bindings,
    useContextMenuTarget: <T,>(selector: (target: ContextMenuTarget | null) => T): T => useDshSnapshot(menus.active, selector),
    useWorkspaceActionRequest: <T,>(selector: (request: WorkspaceActionRequest | null) => T): T => useDshSnapshot(workspaceAction, selector),
    useWorkspaceShortcuts: <T,>(selector: (state: ReturnType<typeof shortcutState.getSnapshot>) => T): T => useDshSnapshot(shortcutState, selector),
    openSessionMenu: (sessionId: string, displayTitle: string, point: MenuPoint, mode?: "toggle") => {
      if (currentSession(sessionId)) openMenu({ kind: "session", value: { sessionId, displayTitle } }, point, mode);
    },
    openWorkspaceMenu: (workspaceId: string, path: string, displayTitle: string, point: MenuPoint, mode?: "toggle") => {
      if (currentWorkspace(workspaceId)) openMenu({ kind: "workspace", value: { workspaceId, path, displayTitle } }, point, mode);
    },
    requestSessionRename,
    settleWorkspaceAction: () => workspaceAction.set(null),
    notifyArchivedNotOpenable: () => menus.notify(t("toast.archivedNotOpenable")),
    unarchiveSession: async (_sessionId: string): Promise<void> => {
      throw new Error(surface?.locale === "zh" ? "当前 Codex 会话接口不支持恢复归档。" : "The current Codex thread interface does not support restoring archived threads.");
    },
    requestSearch: () => shortcutState.set({ ...shortcutState.getSnapshot(), searchRequest: shortcutState.getSnapshot().searchRequest + 1 }),
    requestAddWorkspace: () => shortcutState.set({ ...shortcutState.getSnapshot(), addRequested: true }),
    closeAddWorkspace: () => shortcutState.set({ ...shortcutState.getSnapshot(), addRequested: false }),
    setDirectoryBusy: (directoryBusy: boolean) => shortcutState.set({ ...shortcutState.getSnapshot(), directoryBusy }),
  };
}

/** Mount after the shell Slot declarations, once per existing Cordis host. */
export function installStudioMenus(ctx: Context) {
  const existing = controllers.get(ctx);
  if (existing) return existing;
  const controller = createStudioMenus(ctx);
  controllers.set(ctx, controller);
  return controller;
}

/** Bind native menu presentation to the current App-owned surface. */
export function useStudioMenus() {
  const ctx = useClientContext();
  const studio = useStudio();
  const controller = controllers.get(ctx);
  if (!controller) throw new Error("Studio context menus were not installed by the DSH slot host");
  controller.updateSurface(studio);
  useEffect(() => { controller.refresh(); }, [controller, studio.locale, studio.threadProjects, studio.threadDirectoryStatus]);
  return controller;
}
