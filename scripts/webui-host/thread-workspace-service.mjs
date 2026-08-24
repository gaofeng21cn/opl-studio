import { lstat, opendir, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { ThreadAdapterError } from "./thread-adapter.mjs";

const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_MAX_PREVIEW_BYTES = 64 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_SEARCH_SCANNED_ENTRIES = 5_000;
const MAX_SEARCH_RESULTS = 100;
const IGNORED_SEARCH_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage",
  "out",
  "target",
  ".turbo"
]);

function error(code, message, details = {}, httpStatus = 409) {
  return new ThreadAdapterError(code, message, details, httpStatus);
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw error("invalid_thread_request", `Missing ${field}`, { field }, 400);
  }
  return value.trim();
}

function assertRequestObject(value, operation) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw error("invalid_workspace_request", `${operation} request must be an object`, {}, 400);
  }
}

function normalizeLimit(value, fallback, name, { allowZero = true } = {}) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw error(
      "invalid_workspace_service_options",
      `${name} must be a ${allowZero ? "non-negative" : "positive"} safe integer`,
      { name, value },
      400
    );
  }
  return value;
}

function normalizeRelativePath(value, { required = false } = {}) {
  if (value === undefined) {
    if (required) {
      throw error("invalid_workspace_path", "relativePath is required", { field: "relativePath" }, 400);
    }
    return { filesystemPath: ".", relativePath: "" };
  }
  if (typeof value !== "string") {
    throw error("invalid_workspace_path", "relativePath must be a string", { field: "relativePath" }, 400);
  }
  if (value.includes("\0")) {
    throw error("invalid_workspace_path", "relativePath must not contain NUL", {}, 400);
  }
  if (!value) {
    if (required) {
      throw error("invalid_workspace_path", "relativePath is required", { field: "relativePath" }, 400);
    }
    return { filesystemPath: ".", relativePath: "" };
  }

  if (
    path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || /^[A-Za-z]:/.test(value)
  ) {
    throw error("invalid_workspace_path", "relativePath must be relative", { relativePath: value }, 400);
  }

  const segments = value.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    throw error("invalid_workspace_path", "relativePath must not traverse its workspace", { relativePath: value }, 400);
  }

  const normalizedSegments = segments.filter((segment) => segment !== ".");
  return {
    filesystemPath: normalizedSegments.length ? normalizedSegments.join(path.sep) : ".",
    relativePath: normalizedSegments.join("/")
  };
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

function entryType(entry) {
  if (entry.isSymbolicLink()) return "symlink";
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  return undefined;
}

function sortEntries(left, right) {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

function entryRelativePath(parentRelativePath, name) {
  return parentRelativePath ? `${parentRelativePath}/${name}` : name;
}

async function projectDirectoryEntry(directoryPath, parentRelativePath, entry) {
  const kind = entryType(entry);
  if (!kind) return undefined;
  const projected = {
    name: entry.name,
    relativePath: entryRelativePath(parentRelativePath, entry.name),
    kind
  };
  if (kind !== "file") return projected;

  try {
    const entryStat = await lstat(path.join(directoryPath, entry.name));
    if (entryStat.isFile()) projected.sizeBytes = entryStat.size;
  } catch {
    // Directory enumeration remains useful if a file disappears during listing.
  }
  return projected;
}

function mapFsError(fsError, { operation, relativePath, missingCode = "workspace_path_not_found" } = {}) {
  if (fsError instanceof ThreadAdapterError) return fsError;
  const details = {
    operation,
    ...(relativePath !== undefined ? { relativePath } : {})
  };
  switch (fsError?.code) {
    case "ENOENT":
      return error(missingCode, "Workspace path does not exist", details, 404);
    case "EACCES":
    case "EPERM":
      return error("workspace_access_denied", "Workspace path is not readable", details, 403);
    case "ENOTDIR":
      return error("workspace_path_not_directory", "Workspace path is not a directory", details, 400);
    default:
      return error("workspace_read_failed", "Unable to read workspace path", {
        ...details,
        systemCode: fsError?.code
      }, 500);
  }
}

function assertText(buffer, relativePath) {
  if (buffer.some((byte) => byte === 0 || byte === 0x7f || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d))) {
    throw error("workspace_binary_file", "Workspace file is not a text file", { relativePath }, 415);
  }

  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw error("workspace_binary_file", "Workspace file is not valid UTF-8 text", { relativePath }, 415);
  }
  return content;
}

async function readBoundedFile(filePath, maxBytes, relativePath) {
  let handle;
  try {
    handle = await open(filePath, "r");
  } catch (fsError) {
    throw mapFsError(fsError, { operation: "read", relativePath });
  }

  const chunks = [];
  let totalBytes = 0;
  try {
    while (totalBytes <= maxBytes) {
      const requestBytes = Math.min(READ_CHUNK_BYTES, maxBytes - totalBytes + 1);
      if (requestBytes <= 0) break;
      const chunk = Buffer.allocUnsafe(requestBytes);
      const { bytesRead } = await handle.read(chunk, 0, requestBytes, null);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      totalBytes += bytesRead;
      if (totalBytes > maxBytes) {
        throw error(
          "workspace_file_too_large",
          "Workspace file exceeds the preview size limit",
          { relativePath, maxPreviewBytes: maxBytes },
          413
        );
      }
      if (bytesRead < requestBytes) break;
    }
  } catch (readError) {
    if (readError instanceof ThreadAdapterError) throw readError;
    throw mapFsError(readError, { operation: "read", relativePath });
  } finally {
    await handle.close().catch(() => undefined);
  }

  return Buffer.concat(chunks, totalBytes);
}

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
  maxPreviewBytes = DEFAULT_MAX_PREVIEW_BYTES
} = {}) {
  if (!threads || typeof threads.readThread !== "function") {
    throw error("thread_adapter_unavailable", "A threads adapter with readThread is required", {}, 503);
  }
  const entryLimit = normalizeLimit(maxEntries, DEFAULT_MAX_ENTRIES, "maxEntries");
  const previewLimit = normalizeLimit(maxPreviewBytes, DEFAULT_MAX_PREVIEW_BYTES, "maxPreviewBytes");

  async function resolveWorkspace(threadId) {
    const thread = await threads.readThread({ threadId });
    const workspace = workspaceValue(thread);
    if (!workspace) {
      throw error(
        "thread_workspace_unavailable",
        "Canonical thread does not provide a workspace",
        { threadId },
        409
      );
    }

    let root;
    try {
      root = await realpath(workspace);
      const rootStat = await stat(root);
      if (!rootStat.isDirectory()) {
        throw error("thread_workspace_not_directory", "Canonical thread workspace is not a directory", { threadId }, 409);
      }
    } catch (fsError) {
      if (fsError instanceof ThreadAdapterError) throw fsError;
      throw mapFsError(fsError, {
        operation: "resolve_workspace",
        missingCode: "thread_workspace_unavailable"
      });
    }
    return root;
  }

  async function resolveTarget(root, pathInfo) {
    const candidate = path.resolve(root, pathInfo.filesystemPath);
    let target;
    try {
      target = await realpath(candidate);
    } catch (fsError) {
      throw mapFsError(fsError, { operation: "resolve_path", relativePath: pathInfo.relativePath });
    }
    if (!isInside(root, target)) {
      throw error(
        "workspace_path_outside",
        "Workspace path resolves outside the canonical workspace",
        { relativePath: pathInfo.relativePath },
        403
      );
    }
    return target;
  }

  async function list(request = {}) {
    assertRequestObject(request, "list");
    const threadId = requiredString(request.threadId, "threadId");
    const pathInfo = normalizeRelativePath(request.relativePath);
    const root = await resolveWorkspace(threadId);
    const target = await resolveTarget(root, pathInfo);

    let directory;
    try {
      directory = await opendir(target);
    } catch (fsError) {
      throw mapFsError(fsError, { operation: "list", relativePath: pathInfo.relativePath });
    }

    const entries = [];
    let truncated = false;
    try {
      for await (const entry of directory) {
        if (entryLimit === 0) {
          truncated = true;
          continue;
        }
        const projected = await projectDirectoryEntry(target, pathInfo.relativePath, entry);
        if (!projected) continue;
        if (entries.length < entryLimit) {
          entries.push(projected);
          entries.sort(sortEntries);
          continue;
        }
        truncated = true;
        if (entry.name < entries.at(-1).name) {
          entries[entries.length - 1] = projected;
          entries.sort(sortEntries);
        }
      }
    } catch (listError) {
      throw mapFsError(listError, { operation: "list", relativePath: pathInfo.relativePath });
    } finally {
      await directory.close().catch(() => undefined);
    }

    return {
      schema: "opl_thread_workspace_listing.v1",
      threadId,
      relativePath: pathInfo.relativePath,
      entries,
      truncated
    };
  }

  async function read(request = {}) {
    assertRequestObject(request, "read");
    const threadId = requiredString(request.threadId, "threadId");
    const pathInfo = normalizeRelativePath(request.relativePath, { required: true });
    const root = await resolveWorkspace(threadId);
    const target = await resolveTarget(root, pathInfo);

    let fileStat;
    try {
      fileStat = await stat(target);
    } catch (fsError) {
      throw mapFsError(fsError, { operation: "read", relativePath: pathInfo.relativePath });
    }
    if (fileStat.isDirectory()) {
      throw error("workspace_not_regular_file", "Workspace path is a directory", { relativePath: pathInfo.relativePath }, 400);
    }
    if (!fileStat.isFile()) {
      throw error("workspace_not_regular_file", "Workspace path is not a regular file", { relativePath: pathInfo.relativePath }, 415);
    }
    if (fileStat.size > previewLimit) {
      throw error(
        "workspace_file_too_large",
        "Workspace file exceeds the preview size limit",
        { relativePath: pathInfo.relativePath, bytes: fileStat.size, maxPreviewBytes: previewLimit },
        413
      );
    }

    const contentBuffer = await readBoundedFile(target, previewLimit, pathInfo.relativePath);
    const content = assertText(contentBuffer, pathInfo.relativePath);
    return {
      schema: "opl_thread_workspace_file.v1",
      threadId,
      relativePath: pathInfo.relativePath,
      name: path.posix.basename(pathInfo.relativePath),
      content,
      sizeBytes: contentBuffer.byteLength
    };
  }

  async function search(request = {}) {
    assertRequestObject(request, "search");
    const threadId = requiredString(request.threadId, "threadId");
    if (typeof request.query !== "string") {
      throw error("invalid_workspace_query", "query must be a string", { field: "query" }, 400);
    }
    const root = await resolveWorkspace(threadId);
    const query = request.query.toLowerCase();
    const state = { scanned: 0, truncated: false, matches: [] };

    async function walk(directoryPath, parentRelativePath) {
      if (state.scanned >= MAX_SEARCH_SCANNED_ENTRIES) {
        state.truncated = true;
        return;
      }

      let directory;
      try {
        directory = await opendir(directoryPath);
      } catch {
        state.truncated = true;
        return;
      }

      const children = [];
      try {
        for await (const entry of directory) {
          if (state.scanned >= MAX_SEARCH_SCANNED_ENTRIES) {
            state.truncated = true;
            break;
          }
          state.scanned += 1;
          children.push(entry);
        }
      } finally {
        await directory.close().catch(() => undefined);
      }
      children.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);

      for (const entry of children) {
        const childRelativePath = entryRelativePath(parentRelativePath, entry.name);
        const kind = entryType(entry);
        if (!kind) continue;
        if (kind === "directory" && IGNORED_SEARCH_DIRECTORIES.has(entry.name)) continue;

        const candidate = path.join(directoryPath, entry.name);
        let resolved;
        try {
          resolved = await realpath(candidate);
        } catch {
          continue;
        }
        if (!isInside(root, resolved)) continue;

        const matches = entry.name.toLowerCase().includes(query) || childRelativePath.toLowerCase().includes(query);
        if (matches) {
          const projected = await projectDirectoryEntry(directoryPath, parentRelativePath, entry);
          if (projected) state.matches.push(projected);
        }
        if (kind === "directory") {
          await walk(resolved, childRelativePath);
          if (state.scanned >= MAX_SEARCH_SCANNED_ENTRIES) {
            state.truncated = true;
            break;
          }
        }
      }
    }

    await walk(root, "");
    state.matches.sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0);
    if (state.matches.length > MAX_SEARCH_RESULTS) state.truncated = true;
    return {
      schema: "opl_thread_workspace_search.v1",
      threadId,
      query: request.query,
      entries: state.matches.slice(0, MAX_SEARCH_RESULTS),
      truncated: state.truncated
    };
  }

  return Object.freeze({ list, read, search });
}

export default createThreadWorkspaceService;
