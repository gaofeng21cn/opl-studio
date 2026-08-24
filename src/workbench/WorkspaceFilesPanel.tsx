import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, LoaderCircle, Search } from "lucide-react";
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

function entriesForDirectory(
  listings: ReadonlyMap<string, ThreadWorkspaceListing>,
  relativePath: string
): readonly ThreadWorkspaceEntry[] {
  return listings.get(relativePath)?.entries ?? [];
}

export function WorkspaceFilesPanel({
  threadId,
  locale,
  listWorkspace,
  readFile,
  searchWorkspace
}: WorkspaceFilesPanelProps) {
  const [listings, setListings] = useState<Map<string, ThreadWorkspaceListing>>(() => new Map());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState("");
  const [preview, setPreview] = useState<ThreadWorkspaceFile | null>(null);
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ThreadWorkspaceSearch | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setListings(new Map());
    setExpanded(new Set());
    setSelectedPath("");
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
      setLoadingPath("search");
      void searchWorkspace({ threadId, query: query.trim() }).then((result) => {
        if (!active) return;
        setSearchResult(result);
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
        previewEmpty: "选择文本文件以预览",
        truncated: "结果已达到显示上限"
      }
    : {
        search: "Quick open a file",
        empty: "This task has no browsable workspace.",
        noMatches: "No matching files",
        previewEmpty: "Select a text file to preview",
        truncated: "Results reached the display limit"
      };

  async function openFile(entry: ThreadWorkspaceEntry) {
    if (!threadId || entry.kind !== "file") return;
    setSelectedPath(entry.relativePath);
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

  async function toggleDirectory(entry: ThreadWorkspaceEntry) {
    if (!threadId || entry.kind !== "directory") return;
    if (expanded.has(entry.relativePath)) {
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(entry.relativePath);
        return next;
      });
      return;
    }
    setExpanded((current) => new Set(current).add(entry.relativePath));
    if (listings.has(entry.relativePath)) return;
    setLoadingPath(entry.relativePath);
    setError("");
    try {
      const listing = await listWorkspace({ threadId, relativePath: entry.relativePath });
      setListings((current) => new Map(current).set(entry.relativePath, listing));
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
    } finally {
      setLoadingPath(null);
    }
  }

  function renderEntries(relativePath: string, depth: number) {
    return entriesForDirectory(listings, relativePath).map((entry) => {
      const isDirectory = entry.kind === "directory";
      const isExpanded = isDirectory && expanded.has(entry.relativePath);
      return (
        <div key={entry.relativePath}>
          <button
            className="workspace-file-row"
            data-selected={selectedPath === entry.relativePath || undefined}
            type="button"
            style={{ paddingInlineStart: `${8 + depth * 16}px` }}
            onClick={() => isDirectory ? void toggleDirectory(entry) : void openFile(entry)}
            disabled={entry.kind === "symlink"}
            title={entry.relativePath}
          >
            {isDirectory
              ? (isExpanded ? <ChevronDown aria-hidden="true" size={13} /> : <ChevronRight aria-hidden="true" size={13} />)
              : <span className="workspace-file-indent" />}
            {isDirectory ? <Folder aria-hidden="true" size={14} /> : <File aria-hidden="true" size={14} />}
            <span>{entry.name}</span>
            {loadingPath === entry.relativePath ? <LoaderCircle className="spin" aria-hidden="true" size={12} /> : null}
          </button>
          {isExpanded ? renderEntries(entry.relativePath, depth + 1) : null}
        </div>
      );
    });
  }

  const visibleSearchEntries = useMemo(() => searchResult?.entries ?? [], [searchResult]);

  if (!threadId) return <p className="context-empty">{copy.empty}</p>;

  return (
    <section className="workspace-files" data-testid="opl-thread-workspace-files">
      <label className="workspace-file-search">
        <Search aria-hidden="true" size={14} />
        <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={copy.search} />
        {loadingPath === "search" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : null}
      </label>
      {error ? <p className="workspace-file-error" role="alert">{error}</p> : null}
      <div className="workspace-file-layout">
        <div className="workspace-file-tree" role="tree" aria-label={copy.search}>
          {query.trim()
            ? visibleSearchEntries.map((entry) => (
                <button key={entry.relativePath} className="workspace-file-search-result" type="button" onClick={() => entry.kind === "file" ? void openFile(entry) : void toggleDirectory(entry)}>
                  {entry.kind === "directory" ? <Folder aria-hidden="true" size={14} /> : <File aria-hidden="true" size={14} />}
                  <span><strong>{entry.name}</strong><small>{parentPath(entry.relativePath)}</small></span>
                </button>
              ))
            : renderEntries("", 0)}
          {query.trim() && searchResult && !visibleSearchEntries.length ? <p className="context-empty">{copy.noMatches}</p> : null}
          {searchResult?.truncated ? <p className="context-empty">{copy.truncated}</p> : null}
        </div>
        <div className="workspace-file-preview" data-testid="opl-thread-workspace-preview">
          {preview ? <><header><File aria-hidden="true" size={14} /><strong>{preview.name}</strong></header><pre>{preview.content}</pre></> : <p className="context-empty">{copy.previewEmpty}</p>}
        </div>
      </div>
    </section>
  );
}
