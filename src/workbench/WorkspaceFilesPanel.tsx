import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, File, Folder, FolderOpen, LoaderCircle, Search } from "lucide-react";
import { EcosystemFilePreview } from "../integrations/deepseek-harness/EcosystemFilePreview";
import { WorkspaceFilesTree } from "../integrations/deepseek-harness/WorkspaceFilesTree";
import type {
  ThreadWorkspaceBytes,
  ThreadWorkspaceAccessRequest,
  ThreadWorkspaceEntry,
  ThreadWorkspaceListing,
  ThreadWorkspaceSearch
} from "../bridge/oplBridge";

type WorkspaceFilesPanelProps = {
  threadId?: string;
  workspace: string;
  locale: "zh" | "en";
  nativeFileAccess: boolean;
  accessWorkspace(request: ThreadWorkspaceAccessRequest): Promise<{ accepted: boolean }>;
  listWorkspace(request: { threadId: string; relativePath?: string }): Promise<ThreadWorkspaceListing>;
  readBytes(request: { threadId: string; relativePath: string; offset?: number; length?: number }): Promise<ThreadWorkspaceBytes>;
  searchWorkspace(request: { threadId: string; query: string }): Promise<ThreadWorkspaceSearch>;
};

function parentPath(relativePath: string): string {
  const boundary = relativePath.lastIndexOf("/");
  return boundary < 0 ? "" : relativePath.slice(0, boundary);
}

function fileSize(sizeBytes?: number): string {
  if (sizeBytes === undefined) return "";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkspaceFilesPanel({
  threadId,
  workspace,
  locale,
  nativeFileAccess,
  accessWorkspace,
  listWorkspace,
  readBytes,
  searchWorkspace
}: WorkspaceFilesPanelProps) {
  const [focusedDirectory, setFocusedDirectory] = useState("");
  const generation = useRef(0);
  const [selected, setSelected] = useState<ThreadWorkspaceEntry | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ThreadWorkspaceSearch | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    generation.current += 1;
    setSelected(null);
    setActionBusy(false);
    setActionMessage("");
    setFocusedDirectory("");
    setPreview(null);
    setQuery("");
    setSearchResult(null);
    setSearching(false);
    setError("");
  }, [threadId, workspace]);

  useEffect(() => {
    if (!threadId || !query.trim()) {
      setSearchResult(null);
      setSearching(false);
      return;
    }
    let active = true;
    setSearchResult(null);
    setSearching(true);
    const timer = window.setTimeout(() => {
      setError("");
      void searchWorkspace({ threadId, query: query.trim() }).then((result) => {
        if (!active) return;
        setSearchResult(result);
        setError("");
        setSearching(false);
      }, (reason) => {
        if (!active) return;
        setError(String(reason instanceof Error ? reason.message : reason));
        setSearching(false);
      });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, searchWorkspace, threadId]);

  const copy = locale === "zh"
    ? {
        search: "搜索文件和文件夹",
        open: "用默认应用打开",
        reveal: "在文件管理器中显示",
        openFolder: "打开当前文件夹",
        download: "下载文件",
        text: "预览文件",
        downloadStarted: "已交给浏览器保存",
        opened: "已交给系统打开",
        revealed: "已在文件管理器中显示",
        unavailableType: "此类型请在文件管理器中打开。",
        tooLarge: "文件超过 256 MB 下载上限，请在主机文件管理器中访问。",
        empty: "当前对话没有可浏览的工作区。",
        noMatches: "没有匹配的文件",
        truncated: "结果已达到显示上限",
        workspace: "工作区",
        back: "返回工作区根目录"
      }
    : {
        search: "Search files and folders",
        open: "Open in default app",
        reveal: "Show in file manager",
        openFolder: "Open current folder",
        download: "Download file",
        text: "Preview file",
        downloadStarted: "Sent to your browser to save",
        opened: "Sent to the system to open",
        revealed: "Shown in file manager",
        unavailableType: "Open this file type from your file manager.",
        tooLarge: "File exceeds the 256 MB download limit. Access it from the host file manager.",
        empty: "This task has no browsable workspace.",
        noMatches: "No matching files",
        truncated: "Results reached the display limit",
        workspace: "Workspace",
        back: "Back to workspace root"
      };

  function openFile(entry: ThreadWorkspaceEntry) {
    if (!threadId || entry.kind !== "file") return;
    setError("");
    setPreview(entry.relativePath);
  }

  async function accessPath(action: ThreadWorkspaceAccessRequest["action"], relativePath: string) {
    if (!threadId || actionBusy) return;
    const requestGeneration = generation.current;
    setActionBusy(true);
    setActionMessage("");
    setError("");
    try {
      await accessWorkspace({ threadId, relativePath, action });
      if (generation.current === requestGeneration) setActionMessage(action === "download" ? copy.downloadStarted : action === "reveal" ? copy.revealed : copy.opened);
    } catch (reason) {
      if (generation.current !== requestGeneration) return;
      const code = (reason as { code?: string })?.code;
      const message = String(reason instanceof Error ? reason.message : reason);
      setError(code === "workspace_open_type_unsupported" || message.includes("This file type must be opened") ? copy.unavailableType : code === "workspace_file_too_large" ? copy.tooLarge : message);
    } finally {
      if (generation.current === requestGeneration) setActionBusy(false);
    }
  }

  const listTreeWorkspace = useCallback(async (request: { threadId: string; relativePath?: string }) => {
    const relativePath = [focusedDirectory, request.relativePath].filter(Boolean).join("/");
    const listing = await listWorkspace({ threadId: request.threadId, relativePath });
    if (listing.threadId !== request.threadId || listing.relativePath !== relativePath) throw new Error("Workspace listing identity changed");
    return { ...listing, relativePath: request.relativePath ?? "" };
  }, [focusedDirectory, listWorkspace]);
  const treeWorkspace = focusedDirectory ? `${workspace.replace(/[\\/]+$/, "")}/${focusedDirectory}` : workspace;
  const visibleSearchEntries = searchResult?.entries ?? [];

  if (!threadId || !workspace) return <p className="context-empty">{copy.empty}</p>;

  return (
    <section className="workspace-files" data-testid="opl-thread-workspace-files">
      {error ? <p className="workspace-file-error" role="alert">{error}</p> : null}
      {actionMessage ? <p className="workspace-file-status" role="status">{actionMessage}</p> : null}
      {selected && !preview ? <div className="workspace-file-selection">
        <strong title={selected.relativePath}>{selected.name}</strong>
        <small>{fileSize(selected.sizeBytes)}</small>
        <div className="workspace-file-actions">
          {nativeFileAccess ? <>
            <button type="button" disabled={actionBusy} onClick={() => void accessPath("open", selected.relativePath)}><ExternalLink size={14} aria-hidden="true" />{copy.open}</button>
            <button type="button" disabled={actionBusy} onClick={() => void accessPath("reveal", selected.relativePath)}><FolderOpen size={14} aria-hidden="true" />{copy.reveal}</button>
          </> : <button type="button" disabled={actionBusy} onClick={() => void accessPath("download", selected.relativePath)}>{actionBusy ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}{copy.download}</button>}
          {!preview ? <button type="button" onClick={() => openFile(selected)}>{copy.text}</button> : null}
        </div>
      </div> : null}
      {preview ? (
        <EcosystemFilePreview
          threadId={threadId}
          relativePath={preview}
          locale={locale}
          nativeFileAccess={nativeFileAccess}
          listWorkspace={listWorkspace}
          readBytes={readBytes}
          accessWorkspace={accessWorkspace}
          onClose={() => setPreview(null)}
        />
      ) : (
        <>
          <header className="workspace-file-directory-head">
            {focusedDirectory ? <button type="button" aria-label={copy.back} title={copy.back} onClick={() => { setFocusedDirectory(""); setSelected(null); }}><ChevronLeft aria-hidden="true" size={16} /></button> : <Folder aria-hidden="true" size={15} />}
            <strong title={focusedDirectory || workspace}>{focusedDirectory || copy.workspace}</strong>
            {nativeFileAccess ? <button type="button" aria-label={copy.openFolder} title={copy.openFolder} disabled={actionBusy} onClick={() => void accessPath("open", focusedDirectory)}><FolderOpen aria-hidden="true" size={14} /></button> : null}
          </header>
          <label className="workspace-file-search">
            <Search aria-hidden="true" size={14} />
            <input aria-label={copy.search} value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={copy.search} />
            {searching ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : null}
          </label>
          {query.trim() ? <div className="workspace-file-list">
            {visibleSearchEntries.map((entry) => (
              <button
                key={entry.relativePath}
                className={`workspace-file-row${selected?.relativePath === entry.relativePath ? " is-selected" : ""}`}
                aria-pressed={entry.kind === "file" ? selected?.relativePath === entry.relativePath : undefined}
                type="button"
                onClick={() => {
                  if (entry.kind === "directory") { setFocusedDirectory(entry.relativePath); setQuery(""); setSelected(null); setActionMessage(""); setError(""); }
                  else { setSelected(entry); setActionMessage(""); setError(""); }
                }}
                disabled={entry.kind === "symlink"}
                title={entry.relativePath}
              >
                {entry.kind === "directory" ? <Folder aria-hidden="true" size={15} /> : <File aria-hidden="true" size={15} />}
                <span><strong>{entry.name}</strong>{query.trim() ? <small>{parentPath(entry.relativePath)}</small> : null}</span>
                {entry.kind === "directory" ? <ChevronRight aria-hidden="true" size={14} /> : entry.sizeBytes !== undefined ? <small>{fileSize(entry.sizeBytes)}</small> : null}
              </button>
            ))}
            {query.trim() && searchResult && !visibleSearchEntries.length ? <p className="context-empty">{copy.noMatches}</p> : null}
            {searchResult?.truncated ? <p className="context-empty">{copy.truncated}</p> : null}
          </div> : <WorkspaceFilesTree
            threadId={threadId}
            workspace={treeWorkspace}
            locale={locale}
            listWorkspace={listTreeWorkspace}
            onOpenFile={(path) => {
              const relativePath = [focusedDirectory, path].filter(Boolean).join("/");
              setSelected({ name: path.split("/").at(-1) ?? path, relativePath, kind: "file" });
              setActionMessage("");
              setError("");
            }}
          />}
        </>
      )}
    </section>
  );
}
