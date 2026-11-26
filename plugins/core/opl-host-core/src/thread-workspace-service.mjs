import {
  DEFAULT_MAX_DOWNLOAD_BYTES,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_PREVIEW_BYTES,
  assertRequestObject,
  downloadContainedFile,
  listContainedDirectory,
  normalizeLimit,
  readContainedFileBytes,
  readContainedTextFile,
  requiredString,
  resolveContainedAccess,
  resolveRootDirectory,
  searchContainedDirectory,
  workspaceError
} from "@gaofeng21cn/opl-host-kit/workspace-fs";
import { readWorkspaceGit } from "./workspace-git.mjs";

function workspaceValue(thread) {
  const candidate = thread?.thread && typeof thread.thread === "object" ? thread.thread : thread;
  for (const value of [candidate?.workspace, candidate?.cwd]) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export function createThreadWorkspaceService({
  threads,
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxPreviewBytes = DEFAULT_MAX_PREVIEW_BYTES,
  maxDownloadBytes = DEFAULT_MAX_DOWNLOAD_BYTES
} = {}) {
  if (!threads || typeof threads.readThread !== "function") {
    throw workspaceError("thread_adapter_unavailable", "A threads adapter with readThread is required", {}, 503);
  }
  const entryLimit = normalizeLimit(maxEntries, DEFAULT_MAX_ENTRIES, "maxEntries");
  const previewLimit = normalizeLimit(maxPreviewBytes, DEFAULT_MAX_PREVIEW_BYTES, "maxPreviewBytes");
  const downloadLimit = normalizeLimit(maxDownloadBytes, DEFAULT_MAX_DOWNLOAD_BYTES, "maxDownloadBytes");

  async function resolveWorkspace(threadId) {
    const thread = await threads.readThread({ threadId });
    const workspace = workspaceValue(thread);
    if (!workspace) {
      throw workspaceError(
        "thread_workspace_unavailable",
        "Canonical thread does not provide a workspace",
        { threadId },
        409
      );
    }
    return resolveRootDirectory(workspace, {
      missingCode: "thread_workspace_unavailable",
      notDirectoryCode: "thread_workspace_not_directory",
      notDirectoryMessage: "Canonical thread workspace is not a directory",
      details: { threadId }
    });
  }

  async function list(request = {}) {
    assertRequestObject(request, "list");
    const threadId = requiredString(request.threadId, "threadId");
    const root = await resolveWorkspace(threadId);
    const result = await listContainedDirectory(root, request.relativePath, { entryLimit });
    return {
      schema: "opl_thread_workspace_listing.v1",
      threadId,
      ...result
    };
  }

  async function read(request = {}) {
    assertRequestObject(request, "read");
    const threadId = requiredString(request.threadId, "threadId");
    const root = await resolveWorkspace(threadId);
    const result = await readContainedTextFile(root, request.relativePath, { previewLimit });
    return {
      schema: "opl_thread_workspace_file.v1",
      threadId,
      ...result
    };
  }

  async function resolveAccess(request = {}) {
    assertRequestObject(request, "access");
    const threadId = requiredString(request.threadId, "threadId");
    const root = await resolveWorkspace(threadId);
    const resolved = await resolveContainedAccess(root, request.relativePath, request.action);
    return { threadId, ...resolved };
  }

  async function download(request = {}) {
    assertRequestObject(request, "download");
    const threadId = requiredString(request.threadId, "threadId");
    const root = await resolveWorkspace(threadId);
    const file = await downloadContainedFile(root, request.relativePath, { downloadLimit });
    return { threadId, ...file };
  }

  async function readBytes(request = {}) {
    assertRequestObject(request, "readBytes");
    const threadId = requiredString(request.threadId, "threadId");
    const root = await resolveWorkspace(threadId);
    return readContainedFileBytes(root, request.relativePath, {
      offset: request.offset,
      length: request.length,
      ifMatch: request.ifMatch,
      downloadLimit
    });
  }

  async function search(request = {}) {
    assertRequestObject(request, "search");
    const threadId = requiredString(request.threadId, "threadId");
    const root = await resolveWorkspace(threadId);
    const result = await searchContainedDirectory(root, request.query);
    return {
      schema: "opl_thread_workspace_search.v1",
      threadId,
      ...result
    };
  }

  async function git(request = {}) {
    assertRequestObject(request, "git");
    const threadId = requiredString(request.threadId, "threadId");
    return readWorkspaceGit(await resolveWorkspace(threadId), threadId);
  }

  return Object.freeze({ list, read, search, resolveAccess, download, readBytes, git });
}

export default createThreadWorkspaceService;
