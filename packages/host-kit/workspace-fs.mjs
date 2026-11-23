import { access, lstat, opendir, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { Readable } from "node:stream";
import { ThreadAdapterError } from "@gaofeng21cn/opl-host-contracts/thread-error";

export const DEFAULT_MAX_ENTRIES = 200;
export const DEFAULT_MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
export const DEFAULT_MAX_PREVIEW_BYTES = 64 * 1024;
export const READ_CHUNK_BYTES = 64 * 1024;
export const MAX_SEARCH_SCANNED_ENTRIES = 5_000;
export const MAX_SEARCH_RESULTS = 100;

// Open documents through their registered viewer; executable and link formats remain reveal-only.
export const EXTERNAL_DOCUMENT_EXTENSIONS = new Set(
  "txt md markdown rst log csv tsv json yaml yml toml xml ini conf tex bib pdf doc docx odt rtf xls xlsx ods ppt pptx odp pages numbers key png jpg jpeg gif webp bmp tiff tif heic avif mp3 wav m4a flac ogg mp4 mov m4v webm avi mkv".split(" ")
);

export const IGNORED_SEARCH_DIRECTORIES = new Set([
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

export function workspaceError(code, message, details = {}, httpStatus = 409) {
  return new ThreadAdapterError(code, message, details, httpStatus);
}

export function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw workspaceError("invalid_thread_request", `Missing ${field}`, { field }, 400);
  }
  return value.trim();
}

export function assertRequestObject(value, operation) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw workspaceError("invalid_workspace_request", `${operation} request must be an object`, {}, 400);
  }
}

export function normalizeLimit(value, fallback, name, { allowZero = true } = {}) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw workspaceError(
      "invalid_workspace_service_options",
      `${name} must be a ${allowZero ? "non-negative" : "positive"} safe integer`,
      { name, value },
      400
    );
  }
  return value;
}

export function normalizeRelativePath(value, { required = false } = {}) {
  if (value === undefined) {
    if (required) {
      throw workspaceError("invalid_workspace_path", "relativePath is required", { field: "relativePath" }, 400);
    }
    return { filesystemPath: ".", relativePath: "" };
  }
  if (typeof value !== "string") {
    throw workspaceError("invalid_workspace_path", "relativePath must be a string", { field: "relativePath" }, 400);
  }
  if (value.includes("\0")) {
    throw workspaceError("invalid_workspace_path", "relativePath must not contain NUL", {}, 400);
  }
  if (!value) {
    if (required) {
      throw workspaceError("invalid_workspace_path", "relativePath is required", { field: "relativePath" }, 400);
    }
    return { filesystemPath: ".", relativePath: "" };
  }

  if (
    path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || /^[A-Za-z]:/.test(value)
  ) {
    throw workspaceError("invalid_workspace_path", "relativePath must be relative", { relativePath: value }, 400);
  }

  const segments = value.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    throw workspaceError("invalid_workspace_path", "relativePath must not traverse its workspace", { relativePath: value }, 400);
  }

  const normalizedSegments = segments.filter((segment) => segment !== ".");
  return {
    filesystemPath: normalizedSegments.length ? normalizedSegments.join(path.sep) : ".",
    relativePath: normalizedSegments.join("/")
  };
}

export function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

export function entryType(entry) {
  if (entry.isSymbolicLink()) return "symlink";
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  return undefined;
}

export function sortEntriesAlphabetically(left, right) {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

export function sortEntriesDirectoriesFirst(left, right) {
  const leftDir = left.kind === "directory" ? 0 : 1;
  const rightDir = right.kind === "directory" ? 0 : 1;
  if (leftDir !== rightDir) return leftDir - rightDir;
  return sortEntriesAlphabetically(left, right);
}

export function entryRelativePath(parentRelativePath, name) {
  return parentRelativePath ? `${parentRelativePath}/${name}` : name;
}

export async function projectDirectoryEntry(directoryPath, parentRelativePath, entry, { includeMtime = false } = {}) {
  const kind = entryType(entry);
  if (!kind) return undefined;
  const projected = {
    name: entry.name,
    relativePath: entryRelativePath(parentRelativePath, entry.name),
    kind
  };
  if (kind !== "file" && !includeMtime) return projected;

  try {
    const entryStat = await lstat(path.join(directoryPath, entry.name));
    if (kind === "file" && entryStat.isFile()) projected.sizeBytes = entryStat.size;
    if (includeMtime && Number.isFinite(entryStat.mtimeMs)) {
      projected.modifiedAt = new Date(entryStat.mtimeMs).toISOString();
    }
  } catch {
    // Directory enumeration remains useful if a file disappears during listing.
  }
  return projected;
}

export function mapFsError(fsError, { operation, relativePath, missingCode = "workspace_path_not_found" } = {}) {
  if (fsError instanceof ThreadAdapterError) return fsError;
  const details = {
    operation,
    ...(relativePath !== undefined ? { relativePath } : {})
  };
  switch (fsError?.code) {
    case "ENOENT":
      return workspaceError(missingCode, "Workspace path does not exist", details, 404);
    case "EACCES":
    case "EPERM":
      return workspaceError("workspace_access_denied", "Workspace path is not readable", details, 403);
    case "ENOTDIR":
      return workspaceError("workspace_path_not_directory", "Workspace path is not a directory", details, 400);
    default:
      return workspaceError("workspace_read_failed", "Unable to read workspace path", {
        ...details,
        systemCode: fsError?.code
      }, 500);
  }
}

function assertText(buffer, relativePath) {
  if (buffer.some((byte) => byte === 0 || byte === 0x7f || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d))) {
    throw workspaceError("workspace_binary_file", "Workspace file is not a text file", { relativePath }, 415);
  }

  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw workspaceError("workspace_binary_file", "Workspace file is not valid UTF-8 text", { relativePath }, 415);
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
        throw workspaceError(
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

export async function resolveRootDirectory(
  workspacePath,
  {
    missingCode = "workspace_unavailable",
    notDirectoryCode = "workspace_not_directory",
    notDirectoryMessage = "Workspace is not a directory",
    details = {}
  } = {}
) {
  let root;
  try {
    root = await realpath(workspacePath);
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      throw workspaceError(notDirectoryCode, notDirectoryMessage, details, 409);
    }
  } catch (fsError) {
    if (fsError instanceof ThreadAdapterError) throw fsError;
    throw mapFsError(fsError, {
      operation: "resolve_workspace",
      missingCode
    });
  }
  return root;
}

export async function resolveContainedTarget(root, pathInfo) {
  const candidate = path.resolve(root, pathInfo.filesystemPath);
  let target;
  try {
    target = await realpath(candidate);
  } catch (fsError) {
    throw mapFsError(fsError, { operation: "resolve_path", relativePath: pathInfo.relativePath });
  }
  if (!isInside(root, target)) {
    throw workspaceError(
      "workspace_path_outside",
      "Workspace path resolves outside the canonical workspace",
      { relativePath: pathInfo.relativePath },
      403
    );
  }
  return target;
}

export async function listContainedDirectory(
  root,
  relativePathInput,
  { entryLimit = DEFAULT_MAX_ENTRIES, includeMtime = false, directoriesFirst = false } = {}
) {
  const pathInfo = normalizeRelativePath(relativePathInput);
  const target = await resolveContainedTarget(root, pathInfo);
  const comparator = directoriesFirst ? sortEntriesDirectoriesFirst : sortEntriesAlphabetically;

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
      const projected = await projectDirectoryEntry(target, pathInfo.relativePath, entry, { includeMtime });
      if (!projected) continue;
      if (entries.length < entryLimit) {
        entries.push(projected);
        entries.sort(comparator);
        continue;
      }
      truncated = true;
      if (comparator(projected, entries.at(-1)) < 0) {
        entries[entries.length - 1] = projected;
        entries.sort(comparator);
      }
    }
  } catch (listError) {
    throw mapFsError(listError, { operation: "list", relativePath: pathInfo.relativePath });
  } finally {
    await directory.close().catch(() => undefined);
  }

  return {
    relativePath: pathInfo.relativePath,
    entries,
    truncated
  };
}

export async function readContainedTextFile(root, relativePathInput, { previewLimit = DEFAULT_MAX_PREVIEW_BYTES } = {}) {
  const pathInfo = normalizeRelativePath(relativePathInput, { required: true });
  const target = await resolveContainedTarget(root, pathInfo);

  let fileStat;
  try {
    fileStat = await stat(target);
  } catch (fsError) {
    throw mapFsError(fsError, { operation: "read", relativePath: pathInfo.relativePath });
  }
  if (fileStat.isDirectory()) {
    throw workspaceError("workspace_not_regular_file", "Workspace path is a directory", { relativePath: pathInfo.relativePath }, 400);
  }
  if (!fileStat.isFile()) {
    throw workspaceError("workspace_not_regular_file", "Workspace path is not a regular file", { relativePath: pathInfo.relativePath }, 415);
  }
  if (fileStat.size > previewLimit) {
    throw workspaceError(
      "workspace_file_too_large",
      "Workspace file exceeds the preview size limit",
      { relativePath: pathInfo.relativePath, bytes: fileStat.size, maxPreviewBytes: previewLimit },
      413
    );
  }

  const contentBuffer = await readBoundedFile(target, previewLimit, pathInfo.relativePath);
  const content = assertText(contentBuffer, pathInfo.relativePath);
  return {
    relativePath: pathInfo.relativePath,
    name: path.posix.basename(pathInfo.relativePath),
    content,
    sizeBytes: contentBuffer.byteLength
  };
}

export async function resolveContainedAccess(root, relativePathInput, action) {
  if (!["open", "reveal", "download"].includes(action)) {
    throw workspaceError("invalid_workspace_action", "Unsupported workspace file action", {}, 400);
  }
  const pathInfo = normalizeRelativePath(relativePathInput, { required: action === "download" });
  const target = await resolveContainedTarget(root, pathInfo);
  try {
    const info = await stat(target);
    if (!info.isFile() && !info.isDirectory()) {
      throw workspaceError("workspace_not_regular_file", "Workspace path is not a file or directory", {}, 415);
    }
    // Application bundles are directories too. Reveal them instead of executing them.
    const bundle = /\.(app|bundle|framework)$/i.test(target);
    if (action === "open" && (bundle || (info.isFile() && !EXTERNAL_DOCUMENT_EXTENSIONS.has(path.extname(target).slice(1).toLowerCase())))) {
      throw workspaceError("workspace_open_type_unsupported", "This file type must be opened from your file manager", {}, 415);
    }
    await access(target, constants.R_OK | (info.isDirectory() ? constants.X_OK : 0));
    if (action === "download" && !info.isFile()) {
      throw workspaceError("workspace_not_regular_file", "Only regular files can be downloaded", {}, 415);
    }
    return { relativePath: pathInfo.relativePath, target, info, root, pathInfo };
  } catch (reason) {
    throw mapFsError(reason, { operation: action, relativePath: pathInfo.relativePath });
  }
}

export async function openContainedDownloadDescriptor(
  root,
  relativePathInput,
  { downloadLimit = DEFAULT_MAX_DOWNLOAD_BYTES } = {}
) {
  const resolved = await resolveContainedAccess(root, relativePathInput, "download");
  const { target, relativePath, pathInfo } = resolved;
  let handle;
  try {
    // Retain the checked descriptor for streaming; do not reopen a mutable pathname.
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile()) throw workspaceError("workspace_not_regular_file", "Only regular files can be downloaded", {}, 415);
    const currentTarget = await resolveContainedTarget(root, pathInfo);
    const currentInfo = await stat(currentTarget);
    if (currentTarget !== target || currentInfo.dev !== info.dev || currentInfo.ino !== info.ino) {
      throw workspaceError("workspace_path_changed", "Workspace file changed while opening; try again", {}, 409);
    }
    if (info.size > downloadLimit) {
      throw workspaceError("workspace_file_too_large", "File exceeds the download limit", { maxDownloadBytes: downloadLimit }, 413);
    }
    return {
      relativePath,
      name: path.basename(target),
      sizeBytes: info.size,
      handle,
      etag: `"${info.dev.toString(16)}-${info.ino.toString(16)}-${info.size.toString(16)}-${info.mtimeMs.toString(16)}-${info.ctimeMs.toString(16)}"`
    };
  } catch (reason) {
    await handle?.close().catch(() => undefined);
    throw mapFsError(reason, { operation: "download", relativePath });
  }
}

export async function downloadContainedFile(root, relativePathInput, options = {}) {
  const file = await openContainedDownloadDescriptor(root, relativePathInput, options);
  const { handle, ...metadata } = file;
  return {
    ...metadata,
    stream: file.sizeBytes ? handle.createReadStream({ start: 0, end: file.sizeBytes - 1 }) : Readable.from([]),
    close: () => handle.close().catch(() => undefined)
  };
}

export async function readContainedFileBytes(
  root,
  relativePathInput,
  { offset = 0, length = 512 * 1024, ifMatch, downloadLimit = DEFAULT_MAX_DOWNLOAD_BYTES } = {}
) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > 512 * 1024) {
    throw workspaceError("invalid_workspace_range", "Byte range requires non-negative offset and length between 1 and 512 KiB", {}, 400);
  }
  const file = await openContainedDownloadDescriptor(root, relativePathInput, { downloadLimit });
  try {
    if (ifMatch !== undefined && ifMatch !== file.etag) {
      throw workspaceError("workspace_file_changed", "File changed during download; discard the partial file", {}, 412);
    }
    const requested = Math.min(length, Math.max(0, file.sizeBytes - offset));
    const buffer = Buffer.alloc(requested);
    const { bytesRead } = requested ? await file.handle.read(buffer, 0, requested, offset) : { bytesRead: 0 };
    const after = await file.handle.stat();
    const afterTag = `"${after.dev.toString(16)}-${after.ino.toString(16)}-${after.size.toString(16)}-${after.mtimeMs.toString(16)}-${after.ctimeMs.toString(16)}"`;
    if (afterTag !== file.etag) {
      throw workspaceError("workspace_file_changed", "File changed during download; discard the partial file", {}, 412);
    }
    return {
      data: buffer.subarray(0, bytesRead).toString("base64"),
      offset,
      sizeBytes: file.sizeBytes,
      eof: offset + bytesRead >= file.sizeBytes || bytesRead === 0,
      etag: file.etag
    };
  } catch (reason) {
    throw mapFsError(reason, { operation: "readBytes", relativePath: relativePathInput });
  } finally {
    await file.handle.close().catch(() => undefined);
  }
}

export async function searchContainedDirectory(
  root,
  queryInput,
  {
    maxScanned = MAX_SEARCH_SCANNED_ENTRIES,
    maxResults = MAX_SEARCH_RESULTS,
    ignoredDirectories = IGNORED_SEARCH_DIRECTORIES,
    includeMtime = false
  } = {}
) {
  if (typeof queryInput !== "string") {
    throw workspaceError("invalid_workspace_query", "query must be a string", { field: "query" }, 400);
  }
  const query = queryInput.toLowerCase();
  const state = { scanned: 0, truncated: false, matches: [] };

  async function walk(directoryPath, parentRelativePath) {
    if (state.scanned >= maxScanned) {
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
        if (state.scanned >= maxScanned) {
          state.truncated = true;
          break;
        }
        state.scanned += 1;
        children.push(entry);
      }
    } finally {
      await directory.close().catch(() => undefined);
    }
    children.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    const directories = [];
    for (const entry of children) {
      const childRelativePath = entryRelativePath(parentRelativePath, entry.name);
      const kind = entryType(entry);
      if (!kind) continue;
      if (kind === "directory" && ignoredDirectories.has(entry.name)) continue;

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
        const projected = await projectDirectoryEntry(directoryPath, parentRelativePath, entry, { includeMtime });
        if (projected) state.matches.push(projected);
      }
      if (kind === "directory") directories.push({ path: resolved, relativePath: childRelativePath });
    }

    // Match every child in the current directory before descending. A large
    // early directory must not hide nearby files by exhausting the scan cap.
    for (const child of directories) {
      await walk(child.path, child.relativePath);
      if (state.scanned >= maxScanned) {
        state.truncated = true;
        break;
      }
    }
  }

  await walk(root, "");
  state.matches.sort((left, right) => (left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0));
  if (state.matches.length > maxResults) state.truncated = true;
  return {
    query: queryInput,
    entries: state.matches.slice(0, maxResults),
    truncated: state.truncated
  };
}
