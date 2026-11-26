import { lstat, opendir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_MAX_DOWNLOAD_BYTES,
  DEFAULT_MAX_ENTRIES,
  assertRequestObject,
  downloadContainedFile,
  isInside,
  listContainedDirectory,
  normalizeLimit,
  readContainedFileBytes,
  requiredString,
  resolveContainedAccess,
  resolveRootDirectory,
  searchContainedDirectory,
  workspaceError
} from "@gaofeng21cn/opl-host-kit/workspace-fs";

const CATALOG_CACHE_TTL_MS = 5_000;
const MAX_DELIVERABLE_SCAN_ENTRIES = 3_000;
const MAX_DELIVERABLE_RESULTS = 400;

const IGNORED_DELIVERABLE_DIRS = new Set([
  ".git",
  ".github",
  ".codex",
  ".codex-plugin",
  ".agents",
  ".codegraph",
  ".playwright-mcp",
  ".playwright-cli",
  ".cache",
  ".venv",
  ".ruff_cache",
  ".worktrees",
  "node_modules",
  "__pycache__",
  "runtime",
  "control",
  "controller",
  "controller_decisions",
  "autonomy",
  "supervision",
  "eval_hygiene",
  "stage_knowledge",
  "ops",
  "tmp",
  "_archive",
  "archive",
  "memory",
  "state",
  "backends",
  "profiles",
  "dist",
  "build",
  "coverage",
  "target",
  ".turbo",
  "data",
  "literature",
  "shared"
]);

const DELIVERABLE_SUBDIR_NAMES = new Set([
  "deliveries",
  "deliverables",
  "delivery",
  "publication",
  "publications",
  "manuscript",
  "manuscripts",
  "output",
  "outputs",
  "report",
  "reports",
  "exports",
  "packages",
  "stage_outputs",
  "handoff",
  "review",
  "productions",
  "docs",
  "current_package"
]);

const USER_FACING_ROOT_FILES = new Set([
  "STUDY_STATUS.md",
  "WORKSPACE_STATUS.md",
  "WORKSPACE.md",
  "README.md",
  "brief.md",
  "protocol.md",
  "book-brief.md",
  "draft.md"
]);

const INTERNAL_PLUMBING_FILENAMES = new Set([
  "package.json",
  "package-lock.json",
  "pyproject.toml",
  "uv.lock",
  "workspace.yaml",
  "workspace_index.json",
  "workspace_health.json",
  "workspace_inspection.json",
  "workspace_map.json",
  "workspace_report.json",
  "workspace_resource_inventory.json",
  "project.yaml",
  "project_index.json",
  "project_data_plan.yaml",
  "runtime_binding.yaml",
  "study.yaml",
  "paper.yaml",
  "AGENTS.md",
  "WORKSPACE_AUTOSCIENCE_RULES.md",
  "MANIFEST.in",
  "Makefile",
  "LICENSE",
  "STATUS.json",
  "current_stage.json",
  "opl_stage_outputs_manifest.json",
  "stage_outputs_index.json",
  "evidence_ledger.json",
  "review_ledger.json",
  "revision_log.jsonl",
  "readiness.json",
  "runtime_status_summary.json",
  "latest_status.json",
  "studies_index.json",
  "blockers.json",
  "lifecycle.json",
  "next_action.json",
  "stage_index.json"
]);

const DOCUMENT_EXTENSIONS = new Set(["md", "markdown", "pdf", "doc", "docx", "odt", "rtf", "txt", "text", "html", "htm", "tex", "rst", "ppt", "pptx", "odp", "key", "pages"]);
const MEDIA_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "mp4", "m4v", "mov", "webm", "mp3", "wav", "m4a", "ogg", "flac", "avi", "mkv"]);
const DATA_EXTENSIONS = new Set(["csv", "tsv", "xls", "xlsx", "ods", "numbers", "json", "jsonl", "yaml", "yml", "toml", "xml", "sql"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "tar", "gz", "7z"]);
const CODE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "r", "rmd", "qmd", "sh", "css", "scss"]);
const PREVIEWABLE_EXTENSIONS = new Set([
  "md", "markdown", "html", "htm", "txt", "text", "log", "json", "jsonl", "yaml", "yml", "toml",
  "csv", "tsv", "ts", "tsx", "js", "jsx", "mjs", "cjs", "css", "py", "go", "rs", "r", "rmd", "qmd",
  "xml", "sql", "tex", "rst", "pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg",
  "mp4", "m4v", "mov", "webm", "mp3", "wav", "m4a", "ogg", "flac"
]);

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function asString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extensionOf(name) {
  const idx = name.lastIndexOf(".");
  return idx < 0 ? "" : name.slice(idx + 1).toLowerCase();
}

function classifyExtension(ext) {
  if (DOCUMENT_EXTENSIONS.has(ext)) return "document";
  if (MEDIA_EXTENSIONS.has(ext)) return "media";
  if (DATA_EXTENSIONS.has(ext)) return "data";
  if (ARCHIVE_EXTENSIONS.has(ext)) return "archive";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  return "other";
}

function isPlumbingFile(name) {
  if (name.startsWith(".")) return true;
  if (INTERNAL_PLUMBING_FILENAMES.has(name)) return true;
  if (/(?:-receipt|-readback|-manifest|-index)\.json$/i.test(name)) return true;
  return false;
}

function deliverableGroupLabel(relativePath, workItemTitle) {
  if (workItemTitle) return workItemTitle;
  const parts = relativePath.split("/");
  if (parts.length <= 1) return "Workspace overview";
  const top = parts[0].toLowerCase();
  if (top === "deliveries" || top === "deliverables" || top === "delivery") return "Deliveries";
  if (top === "manuscript" || top === "manuscripts") return "Manuscript";
  if (top === "publication" || top === "publications") return "Publication";
  if (top === "reports" || top === "report") return "Reports";
  if (top === "artifacts") return parts[1] ? `Artifacts / ${parts[1]}` : "Artifacts";
  if (top === "studies" || top === "projects") return parts[1] ?? parts[0];
  return parts[0];
}

function isHumanDeliverablePath(relativePath, name, ext, insideCuratedDir) {
  if (isPlumbingFile(name)) return false;
  const lower = relativePath.toLowerCase();
  if (USER_FACING_ROOT_FILES.has(name)) return true;
  if (insideCuratedDir) {
    // Inside curated deliverable folders, keep documents, media, spreadsheets, archives, and non-plumbing assets.
    return ext !== "json" || !/(?:manifest|receipt|status|ledger|score|beats|review|preview|config)/i.test(name);
  }
  if (lower.includes("/")) {
    const segments = lower.split("/");
    if (segments.some((seg) => DELIVERABLE_SUBDIR_NAMES.has(seg))) {
      return ext !== "json" || !/(?:manifest|receipt|status|ledger|score|beats|review|preview|config)/i.test(name);
    }
    return false;
  }
  // Top-level files in workspace root or work-item root: admit tangible deliverables only.
  return DOCUMENT_EXTENSIONS.has(ext)
    || MEDIA_EXTENSIONS.has(ext)
    || ARCHIVE_EXTENSIONS.has(ext)
    || ext === "csv"
    || ext === "tsv"
    || ext === "xlsx"
    || ext === "xls";
}

async function readWorkspaceKindSafe(root) {
  try {
    const indexPath = path.join(root, "workspace_index.json");
    const resolved = await realpath(indexPath);
    if (!isInside(root, resolved)) return undefined;
    const raw = await readFile(resolved, "utf8");
    const parsed = JSON.parse(raw);
    return asString(parsed?.surface_kind) ?? asString(parsed?.schema_version);
  } catch {
    return undefined;
  }
}

export function createMaterialsSpaceService({
  readAppState,
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxDownloadBytes = DEFAULT_MAX_DOWNLOAD_BYTES
} = {}) {
  if (typeof readAppState !== "function") {
    throw workspaceError("materials_space_init_error", "readAppState function is required", {}, 500);
  }
  const entryLimit = normalizeLimit(maxEntries, DEFAULT_MAX_ENTRIES, "maxEntries");
  const downloadLimit = normalizeLimit(maxDownloadBytes, DEFAULT_MAX_DOWNLOAD_BYTES, "maxDownloadBytes");

  let catalogCache = null;

  async function loadRawProjection(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && catalogCache && now - catalogCache.loadedAt < CATALOG_CACHE_TTL_MS) {
      return catalogCache.catalog;
    }
    const readback = await readAppState();
    const appState = asRecord(readback?.app_state) ?? asRecord(readback) ?? {};
    const operator = asRecord(appState.operator);
    const workbench = asRecord(operator?.workbench);
    const projection = asRecord(workbench?.work_item_projection_v2) ?? {};

    const agentMap = new Map();
    const catalogAgents = Array.isArray(projection.agent_catalog) ? projection.agent_catalog : [];
    for (const candidate of catalogAgents) {
      const a = asRecord(candidate);
      const id = asString(a?.agent_id);
      if (!id) continue;
      agentMap.set(id, {
        id,
        displayName: asString(a?.display_name) ?? id,
        ...(asString(a?.short_label) ? { shortLabel: asString(a?.short_label) } : {}),
        ...(asString(a?.domain_id) ? { domainId: asString(a?.domain_id) } : {}),
        projectCount: 0
      });
    }

    const rawProjects = Array.isArray(projection.project_catalog) ? projection.project_catalog : [];
    const rawItems = Array.isArray(projection.items) ? projection.items : [];
    const itemsByProjectId = new Map();
    for (const rawItem of rawItems) {
      const it = asRecord(rawItem);
      const ident = asRecord(it?.identity);
      const lc = asRecord(it?.lifecycle);
      const pid = asString(ident?.project_id);
      const aid = asString(ident?.agent_id);
      const wid = asString(ident?.work_item_id);
      const itemId = asString(it?.item_id);
      const title = asString(ident?.work_item_display_name);
      if (!pid || !wid || !itemId || !title) continue;
      if (aid && !agentMap.has(aid)) {
        agentMap.set(aid, {
          id: aid,
          displayName: asString(ident?.agent_display_name) ?? aid,
          ...(asString(ident?.domain_id) ? { domainId: asString(ident?.domain_id) } : {}),
          projectCount: 0
        });
      }
      const list = itemsByProjectId.get(pid) ?? [];
      list.push({
        itemId,
        workItemId: wid,
        title,
        ...(asString(ident?.work_item_kind) ? { kind: asString(ident?.work_item_kind) } : {}),
        status: asString(lc?.primary_state) ?? asString(lc?.business_state) ?? "unknown",
        ...(asString(ident?.work_item_root) ? { workItemRoot: asString(ident?.work_item_root) } : {}),
        ...(asString(lc?.current_stage_display_name) ? { currentStageName: asString(lc?.current_stage_display_name) } : {}),
        ...(asString(lc?.last_transition_at) ? { updatedAt: asString(lc?.last_transition_at) } : {})
      });
      itemsByProjectId.set(pid, list);
    }

    const projects = [];
    for (const candidate of rawProjects) {
      const p = asRecord(candidate);
      const projectId = asString(p?.project_id);
      const agentId = asString(p?.agent_id) ?? "unknown";
      const workspacePath = asString(p?.workspace_path);
      if (!projectId || !workspacePath) continue;
      if (agentId !== "unknown" && !agentMap.has(agentId)) {
        agentMap.set(agentId, {
          id: agentId,
          displayName: asString(p?.agent_display_name) ?? agentId,
          ...(asString(p?.domain_id) ? { domainId: asString(p?.domain_id) } : {}),
          projectCount: 0
        });
      }

      let exists = false;
      let resolvedRoot = null;
      let workspaceKind;
      try {
        resolvedRoot = await realpath(workspacePath);
        const info = await stat(resolvedRoot);
        exists = info.isDirectory();
        if (exists) workspaceKind = await readWorkspaceKindSafe(resolvedRoot);
      } catch {
        exists = false;
      }

      const workItems = await Promise.all((itemsByProjectId.get(projectId) ?? []).map(async (wi) => {
        if (!wi.workItemRoot || !resolvedRoot) return wi;
        try {
          const candidateRoot = path.isAbsolute(wi.workItemRoot)
            ? wi.workItemRoot
            : path.resolve(resolvedRoot, wi.workItemRoot);
          const resolvedItemRoot = await realpath(candidateRoot).catch(() => path.resolve(candidateRoot));
          const rel = path.relative(resolvedRoot, resolvedItemRoot).split(path.sep).join("/");
          if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
            return { ...wi, relativeRoot: rel };
          }
        } catch {
          // ignore relative computation failures
        }
        return wi;
      }));

      const agent = agentMap.get(agentId);
      if (agent) agent.projectCount += 1;

      projects.push({
        projectId,
        agentId,
        agentDisplayName: agent?.displayName ?? asString(p?.agent_display_name) ?? agentId,
        ...(asString(p?.domain_id) ? { domainId: asString(p?.domain_id) } : {}),
        displayName: asString(p?.display_name) ?? path.basename(workspacePath),
        workspacePath,
        ...(asString(p?.binding_status) ? { bindingStatus: asString(p?.binding_status) } : {}),
        exists,
        ...(workspaceKind ? { workspaceKind } : {}),
        workItems
      });
    }

    const agents = Array.from(agentMap.values()).filter((a) => a.projectCount > 0);
    projects.sort((a, b) => {
      const aActive = a.bindingStatus === "active" ? 0 : 1;
      const bActive = b.bindingStatus === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.displayName.localeCompare(b.displayName);
    });

    const catalog = {
      schema: "opl_materials_space_catalog.v1",
      generatedAt: new Date().toISOString(),
      agents,
      projects
    };
    catalogCache = { loadedAt: now, catalog };
    return catalog;
  }

  async function resolveProject(projectId) {
    let catalog = await loadRawProjection(false);
    let project = catalog.projects.find((candidate) => candidate.projectId === projectId);
    if (!project) {
      catalog = await loadRawProjection(true);
      project = catalog.projects.find((candidate) => candidate.projectId === projectId);
    }
    if (!project) {
      throw workspaceError("materials_project_not_found", "Registered project was not found", { projectId }, 404);
    }
    const root = await resolveRootDirectory(project.workspacePath, {
      missingCode: "materials_workspace_unavailable",
      notDirectoryCode: "materials_workspace_not_directory",
      notDirectoryMessage: "Project workspace is not a directory",
      details: { projectId }
    });
    return { project, root };
  }

  async function listSpaces(request = {}) {
    assertRequestObject(request ?? {}, "listSpaces");
    return loadRawProjection(Boolean(request?.refresh));
  }

  async function scanDeliverables(request = {}) {
    assertRequestObject(request, "scanDeliverables");
    const projectId = requiredString(request.projectId, "projectId");
    const filterWorkItemId = asString(request.workItemId);
    const query = (asString(request.query) ?? "").toLowerCase();
    const filterCategory = asString(request.category);
    const { project, root } = await resolveProject(projectId);

    const workItemRoots = project.workItems
      .filter((wi) => Boolean(wi.relativeRoot))
      .map((wi) => ({
        workItemId: wi.workItemId,
        title: wi.title,
        prefix: `${wi.relativeRoot}/`,
        exact: wi.relativeRoot
      }));

    const findWorkItem = (relPath) => {
      for (const wi of workItemRoots) {
        if (relPath === wi.exact || relPath.startsWith(wi.prefix)) return wi;
      }
      return undefined;
    };

    const state = { scanned: 0, truncated: false, entries: [] };

    async function walk(dirPath, parentRel, insideCuratedDir) {
      if (state.scanned >= MAX_DELIVERABLE_SCAN_ENTRIES) {
        state.truncated = true;
        return;
      }
      let dir;
      try {
        dir = await opendir(dirPath);
      } catch {
        return;
      }
      const children = [];
      try {
        for await (const entry of dir) {
          if (state.scanned >= MAX_DELIVERABLE_SCAN_ENTRIES) {
            state.truncated = true;
            break;
          }
          state.scanned += 1;
          children.push(entry);
        }
      } finally {
        await dir.close().catch(() => undefined);
      }

      const subdirs = [];
      for (const entry of children) {
        const relPath = parentRel ? `${parentRel}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (IGNORED_DELIVERABLE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
          const candidate = path.join(dirPath, entry.name);
          let resolved;
          try {
            resolved = await realpath(candidate);
          } catch {
            continue;
          }
          if (!isInside(root, resolved)) continue;
          const nextCurated = insideCuratedDir || DELIVERABLE_SUBDIR_NAMES.has(entry.name.toLowerCase());
          subdirs.push({ path: resolved, relPath, curated: nextCurated });
          continue;
        }
        if (!entry.isFile()) continue;

        const ext = extensionOf(entry.name);
        if (!isHumanDeliverablePath(relPath, entry.name, ext, insideCuratedDir)) continue;

        const matchedWi = findWorkItem(relPath);
        if (filterWorkItemId && matchedWi?.workItemId !== filterWorkItemId) continue;

        const category = classifyExtension(ext);
        if (filterCategory && filterCategory !== "all" && category !== filterCategory) continue;

        if (query && !entry.name.toLowerCase().includes(query) && !relPath.toLowerCase().includes(query)) continue;

        let fileStat;
        try {
          fileStat = await lstat(path.join(dirPath, entry.name));
        } catch {
          continue;
        }
        if (!fileStat.isFile()) continue;

        state.entries.push({
          relativePath: relPath,
          name: entry.name,
          extension: ext,
          category,
          group: deliverableGroupLabel(relPath, matchedWi?.title),
          ...(matchedWi ? { workItemId: matchedWi.workItemId, workItemTitle: matchedWi.title } : {}),
          sizeBytes: fileStat.size,
          modifiedAt: new Date(fileStat.mtimeMs).toISOString(),
          previewable: PREVIEWABLE_EXTENSIONS.has(ext)
        });
      }

      for (const child of subdirs) {
        await walk(child.path, child.relPath, child.curated);
        if (state.scanned >= MAX_DELIVERABLE_SCAN_ENTRIES) {
          state.truncated = true;
          break;
        }
      }
    }

    await walk(root, "", false);

    state.entries.sort((left, right) => {
      const lm = left.modifiedAt ?? "";
      const rm = right.modifiedAt ?? "";
      if (rm !== lm) return rm.localeCompare(lm);
      return left.relativePath.localeCompare(right.relativePath);
    });

    const totalCount = state.entries.length;
    if (totalCount > MAX_DELIVERABLE_RESULTS) state.truncated = true;

    return {
      schema: "opl_project_deliverables_scan.v1",
      projectId,
      workspacePath: project.workspacePath,
      entries: state.entries.slice(0, MAX_DELIVERABLE_RESULTS),
      totalCount,
      truncated: state.truncated,
      scannedAt: new Date().toISOString()
    };
  }

  async function listWorkspace(request = {}) {
    assertRequestObject(request, "listWorkspace");
    const projectId = requiredString(request.projectId, "projectId");
    const { root } = await resolveProject(projectId);
    const result = await listContainedDirectory(root, request.relativePath, {
      entryLimit,
      includeMtime: true,
      directoriesFirst: true
    });
    return {
      schema: "opl_project_workspace_listing.v1",
      projectId,
      ...result
    };
  }

  async function searchWorkspace(request = {}) {
    assertRequestObject(request, "searchWorkspace");
    const projectId = requiredString(request.projectId, "projectId");
    const { root } = await resolveProject(projectId);
    const result = await searchContainedDirectory(root, request.query, { includeMtime: true });
    return {
      schema: "opl_project_workspace_search.v1",
      projectId,
      ...result
    };
  }

  async function readBytes(request = {}) {
    assertRequestObject(request, "readBytes");
    const projectId = requiredString(request.projectId, "projectId");
    const { root } = await resolveProject(projectId);
    return readContainedFileBytes(root, request.relativePath, {
      offset: request.offset,
      length: request.length,
      ifMatch: request.ifMatch,
      downloadLimit
    });
  }

  async function resolveAccess(request = {}) {
    assertRequestObject(request, "resolveAccess");
    const projectId = requiredString(request.projectId, "projectId");
    const { root } = await resolveProject(projectId);
    const resolved = await resolveContainedAccess(root, request.relativePath, request.action);
    return { projectId, ...resolved };
  }

  async function download(request = {}) {
    assertRequestObject(request, "download");
    const projectId = requiredString(request.projectId, "projectId");
    const { root } = await resolveProject(projectId);
    const file = await downloadContainedFile(root, request.relativePath, { downloadLimit });
    return { projectId, ...file };
  }

  return Object.freeze({
    listSpaces,
    scanDeliverables,
    listWorkspace,
    searchWorkspace,
    readBytes,
    resolveAccess,
    download
  });
}

export default createMaterialsSpaceService;
