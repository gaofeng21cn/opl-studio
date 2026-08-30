import crypto from "node:crypto";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { access, link, lstat, mkdir, open, readdir, rm, stat, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { ThreadAdapterError } from "./thread-adapter.mjs";

export const MAX_STAGED_FILE_BYTES = 30 * 1024 * 1024;
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i;

function uploadId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(value)) {
    throw new ThreadAdapterError("invalid_upload_id", "Upload id is invalid", {}, 400);
  }
  return value;
}

function relativeUploadPath(value) {
  if (typeof value !== "string" || !value || value.includes("\0") || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new ThreadAdapterError("invalid_upload_path", "Upload path must be relative", {}, 400);
  }
  const normalized = value.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new ThreadAdapterError("invalid_upload_path", "Upload path contains an invalid segment", {}, 400);
  }
  return segments.join("/");
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(root, directory = root) {
  const items = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const item of items) {
    if (item.name.startsWith(".")) continue;
    const target = path.join(directory, item.name);
    if (item.isDirectory()) files.push(...await collectFiles(root, target));
    else if (item.isFile()) files.push(path.relative(root, target).split(path.sep).join("/"));
  }
  return files.sort();
}

export async function createStagedInputService({ root, now = () => Date.now() } = {}) {
  if (!root) throw new Error("staged input root is required");
  const absoluteRoot = path.resolve(root);
  await mkdir(absoluteRoot, { recursive: true, mode: 0o700 });
  const groups = new Map();

  for (const item of await readdir(absoluteRoot, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const target = path.join(absoluteRoot, item.name);
    const metadata = await stat(target);
    if (now() - metadata.mtimeMs > ORPHAN_MAX_AGE_MS) await rm(target, { recursive: true, force: true });
  }

  async function remove(id) {
    const normalized = uploadId(id);
    groups.delete(normalized);
    await rm(path.join(absoluteRoot, normalized), { recursive: true, force: true });
  }

  async function create({ kind = "files" } = {}) {
    if (!new Set(["files", "directory"]).has(kind)) {
      throw new ThreadAdapterError("invalid_upload_kind", "Upload kind must be files or directory", {}, 400);
    }
    const id = crypto.randomUUID();
    await mkdir(path.join(absoluteRoot, id), { mode: 0o700 });
    groups.set(id, { kind, status: "pending" });
    return { schema: "opl_staged_input_group.v1", id, kind, status: "pending", maxFileBytes: MAX_STAGED_FILE_BYTES };
  }

  async function put(id, relativePath, readable) {
    const normalizedId = uploadId(id);
    const group = groups.get(normalizedId);
    if (!group || group.status !== "pending") throw new ThreadAdapterError("upload_not_pending", "Upload group is not pending", {}, 409);
    const normalizedPath = relativeUploadPath(relativePath);
    const groupRoot = path.join(absoluteRoot, normalizedId);
    const target = path.resolve(groupRoot, ...normalizedPath.split("/"));
    if (!target.startsWith(`${groupRoot}${path.sep}`)) throw new ThreadAdapterError("invalid_upload_path", "Upload path escapes the staging root", {}, 400);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    if (await exists(target)) throw new ThreadAdapterError("upload_path_exists", "Upload path already exists", {}, 409);
    const temporary = `${target}.part-${crypto.randomBytes(6).toString("hex")}`;
    let size = 0;
    try {
      const limiter = new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          if (size > MAX_STAGED_FILE_BYTES) callback(new ThreadAdapterError("upload_too_large", "File exceeds 30 MiB", { maxFileBytes: MAX_STAGED_FILE_BYTES }, 413));
          else callback(null, chunk);
        }
      });
      const handle = await open(temporary, "wx", 0o600);
      await handle.close();
      await pipeline(readable, limiter, createWriteStream(temporary, { flags: "r+" }));
      await link(temporary, target);
      await unlink(temporary);
      return { path: normalizedPath, sizeBytes: size };
    } catch (error) {
      await rm(temporary, { force: true });
      if (error?.code === "EEXIST") throw new ThreadAdapterError("upload_path_exists", "Upload path already exists", {}, 409);
      await remove(normalizedId);
      throw error;
    }
  }

  async function complete(id) {
    const normalizedId = uploadId(id);
    const group = groups.get(normalizedId);
    if (!group || group.status !== "pending") throw new ThreadAdapterError("upload_not_pending", "Upload group is not pending", {}, 409);
    const groupRoot = path.join(absoluteRoot, normalizedId);
    const files = await collectFiles(groupRoot);
    if (!files.length) throw new ThreadAdapterError("upload_empty", "Upload group contains no files", {}, 400);
    let inputs;
    if (group.kind === "directory") {
      const topLevel = files[0].split("/")[0];
      if (!topLevel || files.some((file) => file.split("/")[0] !== topLevel)) {
        throw new ThreadAdapterError("invalid_upload_directory", "Directory upload must preserve one top-level directory", {}, 400);
      }
      const target = path.join(groupRoot, topLevel);
      if (!(await lstat(target)).isDirectory()) throw new ThreadAdapterError("invalid_upload_directory", "Directory upload root is invalid", {}, 400);
      inputs = [{ kind: "folder", name: topLevel, path: target, cleanupToken: normalizedId }];
    } else {
      inputs = files.map((file) => ({
        kind: IMAGE_PATTERN.test(file) ? "image" : "file",
        name: path.posix.basename(file),
        path: path.join(groupRoot, ...file.split("/")),
        cleanupToken: normalizedId
      }));
    }
    group.status = "ready";
    return { schema: "opl_staged_input_group.v1", id: normalizedId, kind: group.kind, status: "ready", inputs };
  }

  return Object.freeze({ root: absoluteRoot, create, put, complete, remove });
}
