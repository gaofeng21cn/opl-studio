import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, File, Folder, FolderOpen, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { EcosystemFilePreview } from "../integrations/deepseek-harness/EcosystemFilePreview";
import type {
  ThreadWorkspaceBytes,
  ThreadWorkspaceAccessRequest,
  ThreadWorkspaceEntry,
  ThreadWorkspaceFile,
  ThreadWorkspaceListing,
  ThreadWorkspaceSearch
} from "../bridge/oplBridge";

type WorkspaceFilesPanelProps = {
  threadId?: string;
  locale: "zh" | "en";
  nativeFileAccess: boolean;
  accessWorkspace(request: ThreadWorkspaceAccessRequest): Promise<{ accepted: boolean }>;
  listWorkspace(request: { threadId: string; relativePath?: string }): Promise<ThreadWorkspaceListing>;
  readBytes(request: { threadId: string; relativePath: string; offset?: number; length?: number }): Promise<ThreadWorkspaceBytes>;
  readFile(request: { threadId: string; relativePath: string }): Promise<ThreadWorkspaceFile>;
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
  locale,
  nativeFileAccess,
  accessWorkspace,
  listWorkspace,
  readBytes,
  searchWorkspace
}: WorkspaceFilesPanelProps) {
  const [listings, setListings] = useState<Map<string, ThreadWorkspaceListing>>(() => new Map());
  const [currentDirectory, setCurrentDirectory] = useState("");
  const generation = useRef(0);
  const [selected, setSelected] = useState<ThreadWorkspaceEntry | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ThreadWorkspaceSearch | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    generation.current += 1;
    setSelected(null);
    setActionBusy(false);
    setActionMessage("");
    setListings(new Map());
    setCurrentDirectory("");
    setPreview(null);
    setQuery("");
    setSearchResult(null);
    setError("");
    if (!threadId) return;
    let active = true;
    setLoadingPath("");
    void listWorkspace({ threadId }).then((listing) => {
      if (!active) return;
      setListings(new Map([["", listing]]));
      setLoadingPath(null);
    }, (reason) => {
      if (!active) return;
      setError(String(reason instanceof Error ? reason.message : reason));
      setLoadingPath(null);
    });
    return () => { active = false; };
  }, [listWorkspace, threadId]);

  useEffect(() => {
    if (!threadId || !query.trim()) {
      setSearchResult(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setError("");
      setLoadingPath("search");
      void searchWorkspace({ threadId, query: query.trim() }).then((result) => {
        if (!active) return;
        setSearchResult(result);
        setError("");
        setLoadingPath(null);
      }, (reason) => {
        if (!active) return;
        setError(String(reason instanceof Error ? reason.message : reason));
        setLoadingPath(null);
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
        refresh: "刷新文件列表",
        downloadStarted: "已交给浏览器保存",
        opened: "已交给系统打开",
        revealed: "已在文件管理器中显示",
        unavailableType: "此类型请在文件管理器中打开。",
        tooLarge: "文件超过 256 MB 下载上限，请在主机文件管理器中访问。",
        empty: "当前对话没有可浏览的工作区。",
        noMatches: "没有匹配的文件",
        truncated: "结果已达到显示上限",
        workspace: "工作区",
        back: "返回上一级",
        backToFiles: "返回文件列表"
      }
    : {
        search: "Search files and folders",
        open: "Open in default app",
        reveal: "Show in file manager",
        openFolder: "Open current folder",
        download: "Download file",
        text: "Preview file",
        refresh: "Refresh file list",
        downloadStarted: "Sent to your browser to save",
        opened: "Sent to the system to open",
        revealed: "Shown in file manager",
        unavailableType: "Open this file type from your file manager.",
        tooLarge: "File exceeds the 256 MB download limit. Access it from the host file manager.",
        empty: "This task has no browsable workspace.",
        noMatches: "No matching files",
        truncated: "Results reached the display limit",
        workspace: "Workspace",
        back: "Back one level",
        backToFiles: "Back to files"
      };

  function openFile(entry: ThreadWorkspaceEntry) {
    if (!threadId || entry.kind !== "file") return;
    setError("");
    setPreview(entry.relativePath);
  }

  async function openDirectory(entry: ThreadWorkspaceEntry) {
    if (!threadId || entry.kind !== "directory") return;
    const requestGeneration = generation.current;
    setPreview(null);
    setSelected(null);
    setActionMessage("");
    setQuery("");
    setError("");
    if (listings.has(entry.relativePath)) {
      setCurrentDirectory(entry.relativePath);
      return;
    }
    setLoadingPath(entry.relativePath);
    try {
      const listing = await listWorkspace({ threadId, relativePath: entry.relativePath });
      if (generation.current !== requestGeneration) return;
      setListings((current) => new Map(current).set(entry.relativePath, listing));
      setCurrentDirectory(entry.relativePath);
    } catch (reason) {
      if (generation.current === requestGeneration) setError(String(reason instanceof Error ? reason.message : reason));
    } finally {
      if (generation.current === requestGeneration) setLoadingPath(null);
    }
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

  async function refreshDirectory() {
    if (!threadId) return;
    const requestGeneration = generation.current;
    setLoadingPath(currentDirectory);
    setError("");
    setQuery("");
    setSelected(null);
    setPreview(null);
    setActionMessage("");
    try {
      const listing = await listWorkspace({ threadId, relativePath: currentDirectory });
      if (generation.current === requestGeneration) setListings(new Map([[currentDirectory, listing]]));
    } catch (reason) {
      if (generation.current === requestGeneration) setError(String(reason instanceof Error ? reason.message : reason));
    } finally {
      if (generation.current === requestGeneration) setLoadingPath(null);
    }
  }

  const currentEntries = listings.get(currentDirectory)?.entries ?? [];
  const visibleSearchEntries = useMemo(() => searchResult?.entries ?? [], [searchResult]);

  if (!threadId) return <p className="context-empty">{copy.empty}</p>;

  return (
    <section className="workspace-files" data-testid="opl-thread-workspace-files">
      {error ? <p className="workspace-file-error" role="alert">{error}</p> : null}
      {actionMessage ? <p className="workspace-file-status" role="status">{actionMessage}</p> : null}
      {selected ? <div className="workspace-file-selection">
        <strong title={selected.relativePath}>{selected.name}</strong>
        <small>{fileSize(selected.sizeBytes)}</small>
        <div className="workspace-file-actions">
          {nativeFileAccess ? <>
            <button type="button" disabled={actionBusy} onClick={() => void accessPath("open", selected.relativePath)}><ExternalLink size={14} aria-hidden="true" />{copy.open}</button>
            <button type="button" disabled={actionBusy} onClick={() => void accessPath("reveal", selected.relativePath)}><FolderOpen size={14} aria-hidden="true" />{copy.reveal}</button>
          </> : <button type="button" disabled={actionBusy} onClick={() => void accessPath("download", selected.relativePath)}>{actionBusy ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}{copy.download}</button>}
          {!preview ? <button type="button" disabled={loadingPath === selected.relativePath} onClick={() => void openFile(selected)}>{copy.text}</button> : null}
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
            {currentDirectory ? <button type="button" aria-label={copy.back} title={copy.back} onClick={() => void openDirectory({ name: "", relativePath: parentPath(currentDirectory), kind: "directory" })}><ChevronLeft aria-hidden="true" size={16} /></button> : <Folder aria-hidden="true" size={15} />}
            <strong>{currentDirectory ? currentDirectory.split("/").at(-1) : copy.workspace}</strong>
            <button type="button" aria-label={copy.refresh} title={copy.refresh} disabled={loadingPath !== null} onClick={() => void refreshDirectory()}><RefreshCw aria-hidden="true" size={14} /></button>
            {nativeFileAccess ? <button type="button" aria-label={copy.openFolder} title={copy.openFolder} disabled={actionBusy} onClick={() => void accessPath("open", currentDirectory)}><FolderOpen aria-hidden="true" size={14} /></button> : null}
          </header>
          <label className="workspace-file-search">
            <Search aria-hidden="true" size={14} />
            <input aria-label={copy.search} value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={copy.search} />
            {loadingPath === "search" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : null}
          </label>
          <div className="workspace-file-list">
            {(query.trim() ? visibleSearchEntries : currentEntries).map((entry) => (
              <button
                key={entry.relativePath}
                className={`workspace-file-row${selected?.relativePath === entry.relativePath ? " is-selected" : ""}`}
                aria-pressed={entry.kind === "file" ? selected?.relativePath === entry.relativePath : undefined}
                type="button"
                onClick={() => {
                  if (entry.kind === "directory") void openDirectory(entry);
                  else { setSelected(entry); setActionMessage(""); setError(""); }
                }}
                disabled={entry.kind === "symlink"}
                title={entry.relativePath}
              >
                {entry.kind === "directory" ? <Folder aria-hidden="true" size={15} /> : <File aria-hidden="true" size={15} />}
                <span><strong>{entry.name}</strong>{query.trim() ? <small>{parentPath(entry.relativePath)}</small> : null}</span>
                {loadingPath === entry.relativePath ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : entry.kind === "directory" ? <ChevronRight aria-hidden="true" size={14} /> : entry.sizeBytes !== undefined ? <small>{fileSize(entry.sizeBytes)}</small> : null}
              </button>
            ))}
            {query.trim() && searchResult && !visibleSearchEntries.length ? <p className="context-empty">{copy.noMatches}</p> : null}
            {(query.trim() ? searchResult?.truncated : listings.get(currentDirectory)?.truncated) ? <p className="context-empty">{copy.truncated}</p> : null}
          </div>
        </>
      )}
    </section>
  );
}
