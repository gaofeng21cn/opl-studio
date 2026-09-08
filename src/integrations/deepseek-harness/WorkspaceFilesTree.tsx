import { useEffect, useMemo, useSyncExternalStore } from "react";
import { FilesBody } from "@opl-vendor/dsh-files-body";
import { createFilesStore } from "@opl-vendor/dsh-files-store";
import { filesFace, type DirectoryResult } from "@opl-vendor/dsh-files-face";
import { parseFileAddress } from "@deepseek-ai/dsh-util-workspace-path";
import { en, zh } from "../../vendor/deepseek-harness/packages/client/ui-sidebar-files/src/client/locales";
import type { ThreadWorkspaceListing } from "../../bridge/oplBridge";

export type WorkspaceFilesTreeProps = {
  threadId: string;
  workspace: string;
  locale: "zh" | "en";
  listWorkspace(request: { threadId: string; relativePath?: string }): Promise<ThreadWorkspaceListing>;
  onOpenFile(relativePath: string): void;
};

function relativeToWorkspace(workspace: string, absolutePath: string): string | undefined {
  if (!workspace) return undefined;
  const root = workspace.replace(/\\/g, "/").replace(/\/+$/, "");
  const target = absolutePath.replace(/\\/g, "/");
  if (target.replace(/\/+$/, "") === root) return "";
  if (!target.startsWith(`${root}/`)) return undefined;
  const relative = target.slice(root.length + 1);
  return relative.split("/").includes("..") || relative.includes("\0") ? undefined : relative;
}

export function createWorkspaceTreeListing(workspace: string, listWorkspace: WorkspaceFilesTreeProps["listWorkspace"]) {
  return async (threadId: string, absolutePath: string, signal: AbortSignal): Promise<DirectoryResult> => {
    const cancelled = (): DirectoryResult => ({ ok: false, error: { code: "cancelled", message: "Request cancelled" } });
    if (signal.aborted) return cancelled();
    const relativePath = relativeToWorkspace(workspace, absolutePath);
    if (relativePath === undefined) return { ok: false, error: { code: "workspace-file/outside-workspace", message: "Path is outside this workspace" } };
    try {
      const listing = await listWorkspace({ threadId, relativePath });
      if (signal.aborted) return cancelled();
      if (listing.threadId !== threadId || listing.relativePath !== relativePath) {
        return { ok: false, error: { code: "workspace-file/unavailable", message: "Workspace listing identity changed" } };
      }
      return { ok: true, value: {
        entries: listing.entries.map((entry) => ({ name: entry.name, type: entry.kind === "symlink" ? "other" : entry.kind, size: entry.sizeBytes })),
        truncated: listing.truncated
      } };
    } catch (reason) {
      if (signal.aborted) return cancelled();
      const source = reason as { code?: string; message?: string };
      const codes: Record<string, string> = {
        workspace_path_not_found: "workspace-file/not-found",
        workspace_path_outside: "workspace-file/outside-workspace",
        workspace_path_not_directory: "workspace-file/not-directory"
      };
      return { ok: false, error: { code: codes[source?.code ?? ""] ?? "workspace-file/unavailable", message: source?.message ?? String(reason) } };
    }
  };
}

function WorkspaceFilesTreeSession({ threadId, workspace, locale, listWorkspace, onOpenFile }: WorkspaceFilesTreeProps) {
  const store = useMemo(() => createFilesStore().create(), []);
  const controller = useMemo(() => new AbortController(), []);
  const face = useMemo(() => filesFace(createWorkspaceTreeListing(workspace, listWorkspace))(threadId, store.actions), [listWorkspace, store, threadId, workspace]);
  useEffect(() => () => controller.abort(), [controller]);
  const dictionary: Record<string, string> = locale === "zh" ? zh : en;
  const tab = {
    id: threadId,
    signal: controller.signal,
    actions: { openResource(address: string) {
      const file = parseFileAddress(address);
      if (file?.scope === "session" && file.sessionId === threadId) onOpenFile(file.path);
    } }
  };
  return <FilesBody
    sessionId={threadId}
    useTabInfo={() => ({ tab })}
    useSessions={(selector) => selector({ byId: { [threadId]: { cwd: workspace || undefined } } })}
    useStore={(selector) => selector(useSyncExternalStore(store.subscribe, store.getSnapshot))}
    actions={store.actions}
    {...face}
    t={(key, params) => {
      const template = dictionary[key];
      return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ""));
    }}
  />;
}

export function WorkspaceFilesTree(props: WorkspaceFilesTreeProps) {
  return <WorkspaceFilesTreeSession key={`${props.threadId}:${props.workspace}`} {...props} />;
}
