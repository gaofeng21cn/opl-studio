import type { Context } from "@deepseek-ai/cordis";
import type { HTMLAttributes, ReactNode } from "react";

export interface ObservableSnapshot<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}
export type SelectorHook<T> = <R>(selector: (value: T) => R) => R;
export interface MenuPoint { readonly x: number; readonly y: number }
export interface StudioMenuTargets {
  session: { readonly sessionId: string; readonly displayTitle: string };
  workspace: { readonly workspaceId: string; readonly path: string; readonly displayTitle: string };
}
export type ContextMenuTarget = {
  [K in keyof StudioMenuTargets]: { readonly kind: K; readonly value: StudioMenuTargets[K] }
}[keyof StudioMenuTargets];
export type ContextMenuTriggerProps = Pick<HTMLAttributes<HTMLElement>, "onContextMenu" | "onKeyDown" | "tabIndex">;
export interface ContextMenuBindings {
  getTriggerProps(target: ContextMenuTarget | (() => ContextMenuTarget) | undefined, handlers?: ContextMenuTriggerProps): ContextMenuTriggerProps;
}
export interface MenuAction {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly separatorBefore?: boolean;
  readonly afterContent?: boolean;
  readonly run?: () => void | Promise<void>;
}
export interface ContextMenus {
  readonly active: ObservableSnapshot<ContextMenuTarget | null>;
  register<K extends keyof StudioMenuTargets>(contribution: {
    readonly id: string;
    readonly target: K;
    readonly order: number;
    observe?(target: StudioMenuTargets[K]): readonly ObservableSnapshot<unknown>[];
    resolve(target: StudioMenuTargets[K], signal: AbortSignal): readonly MenuAction[] | Promise<readonly MenuAction[]>;
  }): () => void;
  open(target: ContextMenuTarget, point: MenuPoint): void;
  close(): void;
  notify(text: string, success?: boolean): void;
}
export interface SessionRenameTarget { sessionId: string; currentTitle: string }
export interface WorkspaceActionRequest {
  readonly action: "rename" | "delete";
  readonly workspaceId: string;
  readonly displayTitle: string;
  readonly storedTitle: string;
}
export function applyContextMenus(ctx: Context, config?: { resolutionTimeoutMs?: number }): void;
export function createContextMenuBindings(
  open: (target: ContextMenuTarget, point: MenuPoint) => void,
  active: () => boolean,
): ContextMenuBindings;
export function SessionRenameDialog(props: {
  useRenameRequest: SelectorHook<SessionRenameTarget | null>;
  settleSessionRename(): void;
  renameSession(sessionId: string, title: string): Promise<void>;
  t(key: string, params?: Record<string, unknown>): string;
}): ReactNode;
