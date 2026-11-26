// The adapter exposes only the upstream props it supplies. The real component,
// store, and async face remain byte-identical vendored DSH modules.
declare module "@opl-vendor/dsh-files-face" {
  export type DirectoryResult =
    | { ok: true; value: { entries: { name: string; type: "file" | "directory" | "other"; size?: number }[]; truncated: boolean } }
    | { ok: false; error: { code: string; message: string } };
  export type FilesState = { byTab: Record<string, unknown> };
  export type FilesActions = { [key: string]: (...args: unknown[]) => void; reset(tabId: string): void };
  export type FilesFace = {
    start(tabId: string, root: string, signal: AbortSignal): void;
    load(tabId: string, path: string, signal: AbortSignal): void;
    toggle(tabId: string, path: string, loaded: boolean, signal: AbortSignal): void;
  };
  export function filesFace(list: (threadId: string, path: string, signal: AbortSignal) => Promise<DirectoryResult>): (threadId: string, actions: FilesActions) => FilesFace;
}

declare module "@opl-vendor/dsh-files-store" {
  import type { FilesActions, FilesState } from "@opl-vendor/dsh-files-face";
  export function createFilesStore(): { create(): {
    subscribe(listener: () => void): () => void;
    getSnapshot(): FilesState;
    actions: FilesActions;
  } };
}

declare module "@opl-vendor/dsh-files-body" {
  import type { ReactNode } from "react";
  import type { FilesActions, FilesFace, FilesState } from "@opl-vendor/dsh-files-face";
  export function FilesBody(props: FilesFace & {
    sessionId: string;
    useTabInfo(): { tab: { id: string; signal: AbortSignal; actions: { openResource(address: string): void } } };
    useSessions<T>(selector: (sessions: { byId: Record<string, { cwd?: string }> }) => T): T;
    useStore<T>(selector: (state: FilesState) => T): T;
    actions: FilesActions;
    t(key: string, params?: Record<string, unknown>): string;
  }): ReactNode;
}
