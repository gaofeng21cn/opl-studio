import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  File,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  FolderKanban,
  FolderOpen,
  MessageSquarePlus,
  RefreshCw,
  Search
} from "lucide-react";
import type {
  DeliverableCategory,
  MaterialDeliverableEntry,
  MaterialSpaceCatalog,
  MaterialSpaceProject,
  OplStudioShellPanelFocus,
  OplStudioShellService,
  OplStudioSurface,
  ProjectDeliverablesScan,
  ProjectWorkspaceAccessRequest,
  ProjectWorkspaceEntry,
  ProjectWorkspaceListing,
  ProjectWorkspaceSearch,
  ThreadWorkspaceBytes
} from "@gaofeng21cn/opl-host-contracts";
import { PluginErrorBoundary, useOplStudioShellSnapshot } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { WorkspaceFilePreview } from "@gaofeng21cn/opl-dsh-adapters/workspace-preview";
import {
  buildBreadcrumbs,
  categoryLabel,
  filterSpaceProjects,
  formatMaterialSize,
  formatMaterialTime,
  pickInitialDeliverable,
  type MaterialsLocale
} from "./materialsSpaceHelpers";

export type MaterialsSpaceBridge = {
  nativeFileAccess: boolean;
  listMaterialSpaces(request?: { refresh?: boolean }): Promise<MaterialSpaceCatalog>;
  scanProjectDeliverables(request: { projectId: string; workItemId?: string; query?: string; category?: string }): Promise<ProjectDeliverablesScan>;
  listProjectWorkspace(request: { projectId: string; relativePath?: string }): Promise<ProjectWorkspaceListing>;
  searchProjectWorkspace(request: { projectId: string; query: string }): Promise<ProjectWorkspaceSearch>;
  readProjectWorkspaceBytes(request: { projectId: string; relativePath: string; offset?: number; length?: number }): Promise<ThreadWorkspaceBytes>;
  accessProjectWorkspace(request: ProjectWorkspaceAccessRequest): Promise<{ accepted: boolean }>;
};

export type MaterialsSpacePanelProps = {
  locale: MaterialsLocale;
  bridge: MaterialsSpaceBridge;
  panelFocus?: OplStudioShellPanelFocus;
  onStartConversation?(workspacePath: string): void;
  onOpenRuntimeStatus?(project: MaterialSpaceProject): void;
};

type BrowserTab = "deliverables" | "files";
type SortMode = "recent" | "name";

function entryIcon(entry: { category?: DeliverableCategory; extension?: string; kind?: string }) {
  if (entry.kind === "directory") return <Folder aria-hidden="true" size={15} />;
  switch (entry.category) {
    case "document": return <FileText aria-hidden="true" size={15} />;
    case "media": return <Film aria-hidden="true" size={15} />;
    case "data": return <FileSpreadsheet aria-hidden="true" size={15} />;
    case "archive": return <FileArchive aria-hidden="true" size={15} />;
    case "code": return <FileCode2 aria-hidden="true" size={15} />;
    default: return <File aria-hidden="true" size={15} />;
  }
}

export function MaterialsSpacePanel({
  locale,
  bridge,
  panelFocus,
  onStartConversation,
  onOpenRuntimeStatus
}: MaterialsSpacePanelProps) {
  const zh = locale === "zh";
  const tabIdBase = useId();
  const [catalog, setCatalog] = useState<MaterialSpaceCatalog | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "ready" | "error">("loading");
  const [catalogError, setCatalogError] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(() => new Set());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string>("all");

  const [activeTab, setActiveTab] = useState<BrowserTab>("deliverables");
  const [categoryFilter, setCategoryFilter] = useState<DeliverableCategory | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [deliverablesQuery, setDeliverablesQuery] = useState("");
  const [deliverablesScan, setDeliverablesScan] = useState<ProjectDeliverablesScan | null>(null);
  const [deliverablesStatus, setDeliverablesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [deliverablesError, setDeliverablesError] = useState("");

  const [currentDir, setCurrentDir] = useState("");
  const [dirListing, setDirListing] = useState<ProjectWorkspaceListing | null>(null);
  const [filesQuery, setFilesQuery] = useState("");
  const [filesSearch, setFilesSearch] = useState<ProjectWorkspaceSearch | null>(null);
  const [filesStatus, setFilesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [filesError, setFilesError] = useState("");

  const [selectedFile, setSelectedFile] = useState<{
    relativePath: string;
    name: string;
    sizeBytes?: number;
    workItemTitle?: string;
  } | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);

  const loadSpaces = useCallback(async (refresh = false) => {
    setCatalogStatus("loading");
    setCatalogError("");
    try {
      const data = await bridge.listMaterialSpaces({ refresh });
      setCatalog(data);
      setCatalogStatus("ready");
      setSelectedProjectId((current) => {
        if (panelFocus?.projectId && data.projects.some((p) => p.projectId === panelFocus.projectId)) {
          return panelFocus.projectId;
        }
        if (current && data.projects.some((p) => p.projectId === current)) return current;
        return data.projects.find((p) => p.exists)?.projectId ?? data.projects[0]?.projectId ?? null;
      });
    } catch (reason) {
      setCatalogStatus("error");
      setCatalogError(String(reason instanceof Error ? reason.message : reason));
    }
  }, [bridge, panelFocus?.projectId]);

  useEffect(() => {
    void loadSpaces(false);
  }, [loadSpaces]);

  useEffect(() => {
    if (!panelFocus || !catalog) return;
    if (panelFocus.projectId && catalog.projects.some((p) => p.projectId === panelFocus.projectId)) {
      setSelectedProjectId(panelFocus.projectId);
      setSelectedWorkItemId(panelFocus.workItemId ?? "all");
      if (panelFocus.agentId) {
        setCollapsedAgents((prev) => {
          const next = new Set(prev);
          next.delete(panelFocus.agentId!);
          return next;
        });
      }
    } else if (panelFocus.agentId) {
      const match = catalog.projects.find((p) => p.agentId === panelFocus.agentId);
      if (match) {
        setSelectedProjectId(match.projectId);
        setSelectedWorkItemId("all");
      }
    }
  }, [panelFocus, catalog]);

  const selectedProject = useMemo(
    () => catalog?.projects.find((p) => p.projectId === selectedProjectId) ?? null,
    [catalog?.projects, selectedProjectId]
  );

  const loadSeqRef = useRef(0);

  const loadDeliverables = useCallback(async (project: MaterialSpaceProject, workItemId: string) => {
    if (!project.exists) {
      setDeliverablesScan(null);
      setDeliverablesStatus("ready");
      setSelectedFile(null);
      return;
    }
    const seq = ++loadSeqRef.current;
    setDeliverablesStatus("loading");
    setDeliverablesError("");
    try {
      const scan = await bridge.scanProjectDeliverables({
        projectId: project.projectId,
        ...(workItemId !== "all" ? { workItemId } : {})
      });
      if (seq !== loadSeqRef.current) return;
      setDeliverablesScan(scan);
      setDeliverablesStatus("ready");
      const initial = pickInitialDeliverable(scan.entries);
      setSelectedFile((current) => {
        if (current && scan.entries.some((e) => e.relativePath === current.relativePath)) return current;
        return initial
          ? {
              relativePath: initial.relativePath,
              name: initial.name,
              sizeBytes: initial.sizeBytes,
              workItemTitle: initial.workItemTitle
            }
          : null;
      });
    } catch (reason) {
      if (seq !== loadSeqRef.current) return;
      setDeliverablesStatus("error");
      setDeliverablesError(String(reason instanceof Error ? reason.message : reason));
    }
  }, [bridge]);

  const loadDirectory = useCallback(async (project: MaterialSpaceProject, relPath: string) => {
    if (!project.exists) {
      setDirListing(null);
      setFilesStatus("ready");
      return;
    }
    setFilesStatus("loading");
    setFilesError("");
    try {
      const listing = await bridge.listProjectWorkspace({ projectId: project.projectId, relativePath: relPath });
      setDirListing(listing);
      setFilesStatus("ready");
    } catch (reason) {
      setFilesStatus("error");
      setFilesError(String(reason instanceof Error ? reason.message : reason));
    }
  }, [bridge]);

  useEffect(() => {
    if (!selectedProject) return;
    setCurrentDir("");
    setFilesQuery("");
    setFilesSearch(null);
    setSelectedFile(null);
    void loadDeliverables(selectedProject, selectedWorkItemId);
  }, [selectedProject, selectedWorkItemId, loadDeliverables]);

  useEffect(() => {
    if (!selectedProject || activeTab !== "files" || filesQuery.trim()) return;
    void loadDirectory(selectedProject, currentDir);
  }, [selectedProject, activeTab, currentDir, filesQuery, loadDirectory]);

  useEffect(() => {
    if (!selectedProject || activeTab !== "files" || !filesQuery.trim()) {
      setFilesSearch(null);
      return;
    }
    let active = true;
    setFilesStatus("loading");
    setFilesError("");
    const timer = window.setTimeout(() => {
      void bridge.searchProjectWorkspace({ projectId: selectedProject.projectId, query: filesQuery.trim() }).then(
        (res) => {
          if (!active) return;
          setFilesSearch(res);
          setFilesStatus("ready");
        },
        (reason) => {
          if (!active) return;
          setFilesStatus("error");
          setFilesError(String(reason instanceof Error ? reason.message : reason));
        }
      );
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [selectedProject, activeTab, filesQuery, bridge]);

  const filteredProjects = useMemo(
    () => filterSpaceProjects(catalog?.projects ?? [], projectSearch),
    [catalog?.projects, projectSearch]
  );

  const groupedAgentProjects = useMemo(() => {
    const groups = new Map<string, { agentId: string; agentLabel: string; projects: MaterialSpaceProject[] }>();
    for (const p of filteredProjects) {
      const existing = groups.get(p.agentId);
      if (existing) {
        existing.projects.push(p);
      } else {
        groups.set(p.agentId, {
          agentId: p.agentId,
          agentLabel: p.agentDisplayName,
          projects: [p]
        });
      }
    }
    return Array.from(groups.values());
  }, [filteredProjects]);

  const visibleDeliverables = useMemo(() => {
    const raw = deliverablesScan?.entries ?? [];
    const q = deliverablesQuery.trim().toLowerCase();
    const filtered = raw.filter((entry) => {
      if (categoryFilter !== "all" && entry.category !== categoryFilter) return false;
      if (q && !entry.name.toLowerCase().includes(q) && !entry.relativePath.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sortMode === "name") {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }
    return filtered;
  }, [deliverablesScan?.entries, deliverablesQuery, categoryFilter, sortMode]);

  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(selectedProject?.displayName ?? (zh ? "根目录" : "Root"), currentDir),
    [selectedProject?.displayName, currentDir, zh]
  );

  const copy = zh
    ? {
        title: "资料空间",
        subtitle: "按智能体和项目目录集中查阅交付材料与产物。",
        refresh: "刷新目录",
        searchProjects: "筛选智能体或项目…",
        noAgents: "暂无已注册的智能体项目目录",
        noAgentsHint: "在工作目录中启动或关联任意 OPL 标准智能体后，其项目目录和交付材料将自动显示在此处。",
        missingDir: "目录不存在",
        inactive: "历史",
        allWorkItems: "全部任务",
        openFolder: "打开项目文件夹",
        newTaskHere: "在此项目新建对话",
        viewRuntime: "运行状态",
        tabDeliverables: "交付材料",
        tabFiles: "全部文件",
        searchDeliverables: "搜索交付材料…",
        searchFiles: "在当前项目中搜索文件名…",
        sortRecent: "最近更新",
        sortName: "按名称",
        loading: "正在读取…",
        noDeliverables: "此目录暂无识别到的交付材料",
        noDeliverablesHint: "你可以切换到「全部文件」浏览目录中的所有文件，或让智能体完成输出后再刷新。",
        switchToAllFiles: "浏览全部文件",
        dirMissingTitle: "项目工作目录当前不可访问",
        dirMissingDetail: "该目录在磁盘上不存在或已被移动，无法浏览文件。",
        emptyFileSelect: "从左侧选择任意交付材料即可在此处直接预览。",
        truncated: "已达到单次展示上限，可使用搜索精准定位。"
      }
    : {
        title: "Materials Space",
        subtitle: "Browse and preview deliverables across registered standard agent project workspaces.",
        refresh: "Refresh spaces",
        searchProjects: "Filter agents or projects…",
        noAgents: "No registered agent project directories",
        noAgentsHint: "Project workspaces and deliverables appear here automatically once an OPL standard agent binds a directory.",
        missingDir: "Missing",
        inactive: "Inactive",
        allWorkItems: "All items",
        openFolder: "Open project folder",
        newTaskHere: "New task here",
        viewRuntime: "Runtime status",
        tabDeliverables: "Deliverables",
        tabFiles: "All files",
        searchDeliverables: "Search deliverables…",
        searchFiles: "Search files in workspace…",
        sortRecent: "Recent",
        sortName: "Name",
        loading: "Loading…",
        noDeliverables: "No deliverables discovered yet",
        noDeliverablesHint: "Switch to All files to inspect the entire directory, or refresh after the agent outputs deliverables.",
        switchToAllFiles: "Browse all files",
        dirMissingTitle: "Project directory unavailable",
        dirMissingDetail: "This directory does not exist on disk or has been moved.",
        emptyFileSelect: "Select a deliverable on the left to preview it here.",
        truncated: "Result limit reached; refine your search query."
      };

  const readPreviewBytes = useCallback(
    (req: { relativePath: string; offset?: number; length?: number }) => {
      if (!selectedProject) throw new Error("No project selected");
      return bridge.readProjectWorkspaceBytes({ projectId: selectedProject.projectId, ...req });
    },
    [bridge, selectedProject]
  );

  const accessPreviewFile = useCallback(
    (action: "open" | "reveal" | "download") => {
      if (!selectedProject || !selectedFile) throw new Error("No file selected");
      return bridge.accessProjectWorkspace({
        projectId: selectedProject.projectId,
        relativePath: selectedFile.relativePath,
        action
      });
    },
    [bridge, selectedProject, selectedFile]
  );

  const handleCopyPath = useCallback(() => {
    if (!selectedProject || !selectedFile) return;
    const full = `${selectedProject.workspacePath.replace(/[\\/]+$/, "")}/${selectedFile.relativePath}`;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(full).then(() => {
        setCopiedPath(true);
        window.setTimeout(() => setCopiedPath(false), 1800);
      });
    }
  }, [selectedProject, selectedFile]);

  const fileRows: ProjectWorkspaceEntry[] = filesQuery.trim()
    ? (filesSearch?.entries ?? [])
    : (dirListing?.entries ?? []);

  return (
    <section
      className="opl-materials-space"
      data-testid="opl-materials-space-page"
      aria-labelledby="opl-materials-title"
    >
      <header className="materials-header">
        <div className="materials-header-title">
          <FolderKanban aria-hidden="true" size={20} />
          <div>
            <h1 id="opl-materials-title">{copy.title}</h1>
            <p>{copy.subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          className="materials-btn"
          disabled={catalogStatus === "loading"}
          onClick={() => void loadSpaces(true)}
        >
          <RefreshCw className={catalogStatus === "loading" ? "spin" : undefined} aria-hidden="true" size={14} />
          <span>{copy.refresh}</span>
        </button>
      </header>

      {catalogStatus === "error" ? (
        <div className="materials-banner-error" role="alert">
          <p>{catalogError}</p>
          <button type="button" className="materials-btn" onClick={() => void loadSpaces(true)}>
            {zh ? "重试" : "Retry"}
          </button>
        </div>
      ) : null}

      <div className="materials-shell">
        <aside className="materials-projects-rail" aria-label={zh ? "智能体与项目目录" : "Agents and project workspaces"}>
          <label className="materials-search-box">
            <Search aria-hidden="true" size={14} />
            <input
              type="search"
              aria-label={copy.searchProjects}
              placeholder={copy.searchProjects}
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.currentTarget.value)}
            />
          </label>

          {catalogStatus === "loading" && !catalog ? (
            <p className="materials-muted" role="status">{copy.loading}</p>
          ) : groupedAgentProjects.length === 0 ? (
            <div className="materials-empty-box" role="status">
              <strong>{copy.noAgents}</strong>
              <p>{copy.noAgentsHint}</p>
            </div>
          ) : (
            <div className="materials-agent-groups">
              {groupedAgentProjects.map((group) => {
                const collapsed = collapsedAgents.has(group.agentId);
                return (
                  <section className="materials-agent-group" key={group.agentId}>
                    <button
                      type="button"
                      className="materials-agent-toggle"
                      aria-expanded={!collapsed}
                      onClick={() => {
                        setCollapsedAgents((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.agentId)) next.delete(group.agentId);
                          else next.add(group.agentId);
                          return next;
                        });
                      }}
                    >
                      {collapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                      <strong>{group.agentLabel}</strong>
                      <small>{group.projects.length}</small>
                    </button>
                    {!collapsed ? (
                      <ul className="materials-project-list">
                        {group.projects.map((project) => {
                          const selected = project.projectId === selectedProjectId;
                          return (
                            <li key={project.projectId}>
                              <button
                                type="button"
                                className="materials-project-item"
                                aria-current={selected ? "true" : undefined}
                                onClick={() => {
                                  setSelectedProjectId(project.projectId);
                                  setSelectedWorkItemId("all");
                                }}
                              >
                                <div className="materials-project-item-top">
                                  <Folder aria-hidden="true" size={14} />
                                  <span title={project.workspacePath}>{project.displayName}</span>
                                </div>
                                <div className="materials-project-item-meta">
                                  {!project.exists ? (
                                    <span className="materials-badge-warn">{copy.missingDir}</span>
                                  ) : project.workItems.length > 0 ? (
                                    <small>{project.workItems.length} {zh ? "项工作" : "items"}</small>
                                  ) : (
                                    <small>{project.bindingStatus === "inactive" ? copy.inactive : ""}</small>
                                  )}
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </aside>

        <section className="materials-browser-pane" aria-label={zh ? "材料列表" : "Materials list"}>
          {!selectedProject ? (
            <div className="materials-empty-box" role="status">
              <p>{copy.noAgents}</p>
            </div>
          ) : (
            <>
              <div className="materials-project-head">
                <div className="materials-project-head-info">
                  <h2>{selectedProject.displayName}</h2>
                  <small title={selectedProject.workspacePath}>{selectedProject.workspacePath}</small>
                </div>
                <div className="materials-project-head-actions">
                  {bridge.nativeFileAccess && selectedProject.exists ? (
                    <button
                      type="button"
                      className="materials-icon-btn"
                      title={copy.openFolder}
                      aria-label={copy.openFolder}
                      onClick={() => void bridge.accessProjectWorkspace({ projectId: selectedProject.projectId, action: "reveal" })}
                    >
                      <FolderOpen aria-hidden="true" size={15} />
                    </button>
                  ) : null}
                  {onStartConversation && selectedProject.exists ? (
                    <button
                      type="button"
                      className="materials-icon-btn"
                      title={copy.newTaskHere}
                      aria-label={copy.newTaskHere}
                      onClick={() => onStartConversation(selectedProject.workspacePath)}
                    >
                      <MessageSquarePlus aria-hidden="true" size={15} />
                    </button>
                  ) : null}
                  {onOpenRuntimeStatus ? (
                    <button
                      type="button"
                      className="materials-icon-btn"
                      title={copy.viewRuntime}
                      aria-label={copy.viewRuntime}
                      onClick={() => onOpenRuntimeStatus(selectedProject)}
                    >
                      <Activity aria-hidden="true" size={15} />
                    </button>
                  ) : null}
                </div>
              </div>

              {selectedProject.workItems.length > 0 ? (
                <div className="materials-workitem-pills" role="group" aria-label={zh ? "按项目研究筛选" : "Filter by work item"}>
                  <button
                    type="button"
                    aria-pressed={selectedWorkItemId === "all"}
                    onClick={() => setSelectedWorkItemId("all")}
                  >
                    {copy.allWorkItems} ({selectedProject.workItems.length})
                  </button>
                  {selectedProject.workItems.map((wi) => (
                    <button
                      key={wi.workItemId}
                      type="button"
                      title={wi.title}
                      aria-pressed={selectedWorkItemId === wi.workItemId}
                      onClick={() => setSelectedWorkItemId(wi.workItemId)}
                    >
                      {wi.workItemId}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="materials-tabs" role="tablist" aria-label={zh ? "浏览视图" : "Browse mode"}>
                <button
                  type="button"
                  role="tab"
                  id={`${tabIdBase}-deliverables`}
                  aria-selected={activeTab === "deliverables"}
                  onClick={() => setActiveTab("deliverables")}
                >
                  {copy.tabDeliverables}
                  {deliverablesScan ? ` (${deliverablesScan.totalCount})` : ""}
                </button>
                <button
                  type="button"
                  role="tab"
                  id={`${tabIdBase}-files`}
                  aria-selected={activeTab === "files"}
                  onClick={() => setActiveTab("files")}
                >
                  {copy.tabFiles}
                </button>
              </div>

              {!selectedProject.exists ? (
                <div className="materials-empty-box" role="status">
                  <strong>{copy.dirMissingTitle}</strong>
                  <p>{copy.dirMissingDetail}</p>
                </div>
              ) : activeTab === "deliverables" ? (
                <div
                  className="materials-tab-panel"
                  role="tabpanel"
                  aria-labelledby={`${tabIdBase}-deliverables`}
                >
                  <div className="materials-filter-bar">
                    <label className="materials-search-box">
                      <Search aria-hidden="true" size={14} />
                      <input
                        type="search"
                        aria-label={copy.searchDeliverables}
                        placeholder={copy.searchDeliverables}
                        value={deliverablesQuery}
                        onChange={(e) => setDeliverablesQuery(e.currentTarget.value)}
                      />
                    </label>
                    <select
                      aria-label={zh ? "排序" : "Sort"}
                      value={sortMode}
                      onChange={(e) => setSortMode(e.currentTarget.value as SortMode)}
                    >
                      <option value="recent">{copy.sortRecent}</option>
                      <option value="name">{copy.sortName}</option>
                    </select>
                  </div>

                  <div className="materials-category-pills">
                    {(["all", "document", "media", "data", "archive"] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        aria-pressed={categoryFilter === cat}
                        onClick={() => setCategoryFilter(cat)}
                      >
                        {categoryLabel(cat, locale)}
                      </button>
                    ))}
                  </div>

                  {deliverablesStatus === "loading" && !deliverablesScan ? (
                    <p className="materials-muted" role="status">{copy.loading}</p>
                  ) : deliverablesStatus === "error" ? (
                    <p className="materials-error" role="alert">{deliverablesError}</p>
                  ) : visibleDeliverables.length === 0 ? (
                    <div className="materials-empty-box" role="status">
                      <strong>{copy.noDeliverables}</strong>
                      <p>{copy.noDeliverablesHint}</p>
                      <button type="button" className="materials-btn" onClick={() => setActiveTab("files")}>
                        {copy.switchToAllFiles}
                      </button>
                    </div>
                  ) : (
                    <ul className="materials-entry-list">
                      {visibleDeliverables.map((entry) => {
                        const isSelected = selectedFile?.relativePath === entry.relativePath;
                        return (
                          <li key={entry.relativePath}>
                            <button
                              type="button"
                              className="materials-entry-row"
                              aria-current={isSelected ? "true" : undefined}
                              onClick={() =>
                                setSelectedFile({
                                  relativePath: entry.relativePath,
                                  name: entry.name,
                                  sizeBytes: entry.sizeBytes,
                                  workItemTitle: entry.workItemTitle
                                })
                              }
                            >
                              <span className="materials-entry-icon">{entryIcon(entry)}</span>
                              <div className="materials-entry-body">
                                <strong title={entry.relativePath}>{entry.name}</strong>
                                <div className="materials-entry-sub">
                                  <span>{entry.group}</span>
                                  <span title={entry.relativePath}>{entry.relativePath}</span>
                                </div>
                              </div>
                              <div className="materials-entry-meta">
                                <small>{formatMaterialSize(entry.sizeBytes)}</small>
                                <small>{formatMaterialTime(entry.modifiedAt, locale)}</small>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                      {deliverablesScan?.truncated ? (
                        <li className="materials-muted">{copy.truncated}</li>
                      ) : null}
                    </ul>
                  )}
                </div>
              ) : (
                <div
                  className="materials-tab-panel"
                  role="tabpanel"
                  aria-labelledby={`${tabIdBase}-files`}
                >
                  <label className="materials-search-box">
                    <Search aria-hidden="true" size={14} />
                    <input
                      type="search"
                      aria-label={copy.searchFiles}
                      placeholder={copy.searchFiles}
                      value={filesQuery}
                      onChange={(e) => setFilesQuery(e.currentTarget.value)}
                    />
                  </label>

                  {!filesQuery.trim() ? (
                    <nav className="materials-breadcrumbs" aria-label={zh ? "目录路径" : "Breadcrumbs"}>
                      <ol>
                        {breadcrumbs.map((crumb, idx) => {
                          const isCurrent = idx === breadcrumbs.length - 1;
                          return (
                            <li key={crumb.relativePath || "__root"}>
                              <a
                                href={`#${encodeURIComponent(crumb.relativePath)}`}
                                aria-current={isCurrent ? "page" : undefined}
                                onClick={(event) => {
                                  event.preventDefault();
                                  setCurrentDir(crumb.relativePath);
                                }}
                              >
                                {crumb.label}
                              </a>
                            </li>
                          );
                        })}
                      </ol>
                    </nav>
                  ) : null}

                  {filesStatus === "loading" ? (
                    <p className="materials-muted" role="status">{copy.loading}</p>
                  ) : filesError ? (
                    <p className="materials-error" role="alert">{filesError}</p>
                  ) : fileRows.length === 0 ? (
                    <p className="materials-muted" role="status">{zh ? "当前目录为空" : "No files found"}</p>
                  ) : (
                    <ul className="materials-entry-list">
                      {fileRows.map((entry) => {
                        const isSelected = entry.kind === "file" && selectedFile?.relativePath === entry.relativePath;
                        return (
                          <li key={entry.relativePath}>
                            <button
                              type="button"
                              className="materials-entry-row"
                              disabled={entry.kind === "symlink"}
                              aria-current={isSelected ? "true" : undefined}
                              onClick={() => {
                                if (entry.kind === "directory") {
                                  setFilesQuery("");
                                  setCurrentDir(entry.relativePath);
                                } else if (entry.kind === "file") {
                                  setSelectedFile({
                                    relativePath: entry.relativePath,
                                    name: entry.name,
                                    sizeBytes: entry.sizeBytes
                                  });
                                }
                              }}
                            >
                              <span className="materials-entry-icon">{entryIcon({ kind: entry.kind })}</span>
                              <div className="materials-entry-body">
                                <strong>{entry.name}</strong>
                                {filesQuery.trim() ? <small>{entry.relativePath}</small> : null}
                              </div>
                              <div className="materials-entry-meta">
                                {entry.kind === "directory" ? (
                                  <ChevronRight aria-hidden="true" size={14} />
                                ) : (
                                  <>
                                    <small>{formatMaterialSize(entry.sizeBytes)}</small>
                                    <small>{formatMaterialTime(entry.modifiedAt, locale)}</small>
                                  </>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <section className="materials-preview-pane" aria-label={zh ? "材料预览" : "Material preview"}>
          {selectedProject && selectedFile ? (
            <WorkspaceFilePreview
              sourceKey={selectedProject.projectId}
              relativePath={selectedFile.relativePath}
              title={selectedFile.name}
              subtitle={selectedFile.workItemTitle ? `${selectedFile.workItemTitle} · ${selectedFile.relativePath}` : selectedFile.relativePath}
              sizeBytes={selectedFile.sizeBytes}
              nativeFileAccess={bridge.nativeFileAccess}
              readBytes={readPreviewBytes}
              accessFile={accessPreviewFile}
              locale={locale}
              onCopyPath={handleCopyPath}
              copied={copiedPath}
            />
          ) : (
            <div className="materials-preview-empty" role="status">
              <FileText aria-hidden="true" size={28} />
              <p>{copy.emptyFileSelect}</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function defaultMaterialsBridge(): MaterialsSpaceBridge {
  const win = (globalThis as typeof globalThis & { window?: { oplStudio?: OplStudioSurface } }).window?.oplStudio;
  if (
    !win?.listMaterialSpaces
    || !win.scanProjectDeliverables
    || !win.listProjectWorkspace
    || !win.searchProjectWorkspace
    || !win.readProjectWorkspaceBytes
    || !win.accessProjectWorkspace
  ) {
    throw new Error("Materials Space bridge is unavailable");
  }
  return {
    nativeFileAccess: win.platformCapabilities?.nativeWorkspaceFileAccess === true,
    listMaterialSpaces: win.listMaterialSpaces,
    scanProjectDeliverables: win.scanProjectDeliverables,
    listProjectWorkspace: win.listProjectWorkspace,
    searchProjectWorkspace: win.searchProjectWorkspace,
    readProjectWorkspaceBytes: win.readProjectWorkspaceBytes,
    accessProjectWorkspace: win.accessProjectWorkspace
  };
}

function MaterialsSpaceSlotContent({ shell }: { shell: OplStudioShellService }) {
  const snapshot = useOplStudioShellSnapshot(shell);
  const bridge = useMemo(() => defaultMaterialsBridge(), []);
  return (
    <MaterialsSpacePanel
      locale={snapshot.locale}
      bridge={bridge}
      panelFocus={snapshot.panelFocus}
      onStartConversation={(workspacePath) => shell.startConversationInWorkspace(workspacePath)}
      onOpenRuntimeStatus={(project) =>
        shell.openPrimaryView("runtime", {
          agentId: project.agentId,
          projectId: project.projectId
        })
      }
    />
  );
}

export function MaterialsSpaceSlotPanel({ shell }: { shell: OplStudioShellService }) {
  const snapshot = useOplStudioShellSnapshot(shell);
  return (
    <PluginErrorBoundary
      pluginId="@gaofeng21cn/opl-materials-space"
      pluginLabel={snapshot.locale === "zh" ? "资料空间" : "Materials Space"}
      locale={snapshot.locale}
      onOpenSoftwareCenter={() => shell.openPrimaryView("applications")}
    >
      <MaterialsSpaceSlotContent shell={shell} />
    </PluginErrorBoundary>
  );
}
