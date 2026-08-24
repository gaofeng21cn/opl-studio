import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, File, Folder, LoaderCircle, Search } from "lucide-react";
import type {
  ThreadWorkspaceEntry,
  ThreadWorkspaceFile,
  ThreadWorkspaceListing,
  ThreadWorkspaceSearch
} from "../bridge/oplBridge";

type WorkspaceFilesPanelProps = {
  threadId?: string;
  locale: "zh" | "en";
  listWorkspace(request: { threadId: string; relativePath?: string }): Promise<ThreadWorkspaceListing>;
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
  listWorkspace,
  readFile,
  searchWorkspace
}: WorkspaceFilesPanelProps) {
  const [listings, setListings] = useState<Map<string, ThreadWorkspaceListing>>(() => new Map());
  const [currentDirectory, setCurrentDirectory] = useState("");
  const [preview, setPreview] = useState<ThreadWorkspaceFile | null>(null);
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ThreadWorkspaceSearch | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
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
        search: "快速打开文件",
        empty: "当前对话没有可浏览的工作区。",
        noMatches: "没有匹配的文件",
        truncated: "结果已达到显示上限",
        workspace: "工作区",
        back: "返回上一级",
        backToFiles: "返回文件列表"
      }
    : {
        search: "Quick open a file",
        empty: "This task has no browsable workspace.",
        noMatches: "No matching files",
        truncated: "Results reached the display limit",
        workspace: "Workspace",
        back: "Back one level",
        backToFiles: "Back to files"
      };

  async function openFile(entry: ThreadWorkspaceEntry) {
    if (!threadId || entry.kind !== "file") return;
    setError("");
    setLoadingPath(entry.relativePath);
    try {
      setPreview(await readFile({ threadId, relativePath: entry.relativePath }));
    } catch (reason) {
      setPreview(null);
      setError(String(reason instanceof Error ? reason.message : reason));
    } finally {
      setLoadingPath(null);
    }
  }

  async function openDirectory(entry: ThreadWorkspaceEntry) {
    if (!threadId || entry.kind !== "directory") return;
    setPreview(null);
    setQuery("");
    setError("");
    if (listings.has(entry.relativePath)) {
      setCurrentDirectory(entry.relativePath);
      return;
    }
    setLoadingPath(entry.relativePath);
    try {
      const listing = await listWorkspace({ threadId, relativePath: entry.relativePath });
      setListings((current) => new Map(current).set(entry.relativePath, listing));
      setCurrentDirectory(entry.relativePath);
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
    } finally {
      setLoadingPath(null);
    }
  }

  const currentEntries = listings.get(currentDirectory)?.entries ?? [];
  const visibleSearchEntries = useMemo(() => searchResult?.entries ?? [], [searchResult]);

  if (!threadId) return <p className="context-empty">{copy.empty}</p>;

  return (
    <section className="workspace-files" data-testid="opl-thread-workspace-files">
      {preview ? (
        <div className="workspace-file-preview" data-testid="opl-thread-workspace-preview">
          <header>
            <button type="button" aria-label={copy.backToFiles} title={copy.backToFiles} onClick={() => setPreview(null)}><ChevronLeft aria-hidden="true" size={16} /></button>
            <File aria-hidden="true" size={14} />
            <strong>{preview.name}</strong>
            <small>{fileSize(preview.sizeBytes)}</small>
          </header>
          <pre>{preview.content}</pre>
        </div>
      ) : (
        <>
          <header className="workspace-file-directory-head">
            {currentDirectory ? <button type="button" aria-label={copy.back} title={copy.back} onClick={() => setCurrentDirectory(parentPath(currentDirectory))}><ChevronLeft aria-hidden="true" size={16} /></button> : <Folder aria-hidden="true" size={15} />}
            <strong>{currentDirectory ? currentDirectory.split("/").at(-1) : copy.workspace}</strong>
          </header>
          <label className="workspace-file-search">
            <Search aria-hidden="true" size={14} />
            <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={copy.search} />
            {loadingPath === "search" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : null}
          </label>
          {error ? <p className="workspace-file-error" role="alert">{error}</p> : null}
          <div className="workspace-file-list">
            {(query.trim() ? visibleSearchEntries : currentEntries).map((entry) => (
              <button
                key={entry.relativePath}
                className="workspace-file-row"
                type="button"
                onClick={() => entry.kind === "directory" ? void openDirectory(entry) : void openFile(entry)}
                disabled={entry.kind === "symlink"}
                title={entry.relativePath}
              >
                {entry.kind === "directory" ? <Folder aria-hidden="true" size={15} /> : <File aria-hidden="true" size={15} />}
                <span><strong>{entry.name}</strong>{query.trim() ? <small>{parentPath(entry.relativePath)}</small> : null}</span>
                {loadingPath === entry.relativePath ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : entry.kind === "directory" ? <ChevronRight aria-hidden="true" size={14} /> : entry.sizeBytes !== undefined ? <small>{fileSize(entry.sizeBytes)}</small> : null}
              </button>
            ))}
            {query.trim() && searchResult && !visibleSearchEntries.length ? <p className="context-empty">{copy.noMatches}</p> : null}
            {searchResult?.truncated ? <p className="context-empty">{copy.truncated}</p> : null}
          </div>
        </>
      )}
    </section>
  );
}
