import crypto from "node:crypto";
import path from "node:path";
import { createReadStream } from "node:fs";
import { mkdir, open, realpath, rm, readdir, stat } from "node:fs/promises";
import { ThreadAdapterError } from "./thread-adapter.mjs";

export const LINK_CHUNK_BYTES = 512 * 1024;
const MAX_FILE = 10 * 1024 * 1024;
const TTL = 600_000;
const fail = (code, message, status = 400) => new ThreadAdapterError(code, message, {}, status);
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const object = value => value && typeof value === "object" && !Array.isArray(value);
export function decodeLinkBytes(value, limit = LINK_CHUNK_BYTES) {
  if (typeof value !== "string" || value.length > Math.ceil(limit / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw fail("invalid_link_attachment", "Invalid attachment bytes", 413);
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > limit || bytes.toString("base64") !== value) throw fail("invalid_link_attachment", "Invalid attachment bytes", 413);
  return bytes;
}

/** Temporary bytes and receipts only; canonical workspace/thread state stays with Host. */
export function createLinkUploads({ root, hostCore, now = Date.now }) {
  const uploads = new Map(); const requests = new Map();
  let creates = Promise.resolve(); let closed = false;
  async function scope(payload) {
    if (payload.threadId !== undefined) {
      if (typeof payload.threadId !== "string" || !payload.threadId || payload.cwd !== undefined) throw fail("invalid_link_upload_scope", "Choose a conversation or workspace");
      const read = await hostCore.threads.readThread({ threadId: payload.threadId });
      const thread = read.thread ?? read;
      return { threadId: thread.id ?? payload.threadId, cwd: await realpath(thread.cwd ?? thread.workspace) };
    }
    const canonical = await realpath(hostCore.transport.cwd);
    if (typeof payload.cwd !== "string" || await realpath(payload.cwd) !== canonical) throw fail("invalid_link_upload_scope", "Choose the desktop workspace", 403);
    return { cwd: canonical };
  }
  const projection = item => ({ id: item.id, receivedBytes: item.receivedBytes, size: item.size, status: item.status, expiresAt: new Date(item.expiresAt).toISOString() });
  async function removeItem(item) { uploads.delete(item.id); requests.delete(item.requestKey); await rm(item.file, { force: true }); }
  async function sweep() {
    for (const item of uploads.values()) if (item.expiresAt <= now()) { await item.queue; await removeItem(item); }
    // Restarted partial uploads have no resumable receipt; their bytes retain the same short TTL.
    for (const entry of await readdir(root, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; })) {
      if (!entry.isFile() || uploads.has(entry.name) || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
      const file = path.join(root, entry.name); const info = await stat(file).catch(() => undefined);
      if (info && info.mtimeMs + TTL <= now()) await rm(file, { force: true });
    }
  }
  const timer = setInterval(() => { void sweep().catch(() => {}); }, 30_000); timer.unref();
  function get(device, id) {
    const item = uploads.get(id);
    if (!item || item.deviceId !== device.id || item.expiresAt <= now()) throw fail("link_upload_not_found", "Upload expired; attach the file again", 404);
    return item;
  }
  async function createOne(device, payload) {
    if (closed) throw fail("link_host_closed", "The App is closing", 503);
    if (!object(payload) || Object.keys(payload).some(key => !["requestId", "threadId", "cwd", "name", "mimeType", "size", "sha256"].includes(key)) || !/^[A-Za-z0-9_-]{16,128}$/.test(payload.requestId ?? "")) throw fail("invalid_link_upload", "Invalid upload request");
    if (typeof payload.name !== "string" || !payload.name.trim() || payload.name.length > 180 || payload.name.startsWith(".") || /[\\/\u0000]/.test(payload.name)) throw fail("invalid_link_attachment", "Use an attachment filename without a path");
    if (typeof payload.mimeType !== "string" || payload.mimeType.length > 200 || !Number.isSafeInteger(payload.size) || payload.size < 1 || payload.size > MAX_FILE || !/^[a-f0-9]{64}$/.test(payload.sha256 ?? "")) throw fail("invalid_link_upload", "Files must be between one byte and 10 MiB");
    await sweep();
    const target = await scope(payload);
    const signature = hash(JSON.stringify({ requestId: payload.requestId, threadId: target.threadId, cwd: target.cwd, name: payload.name, mimeType: payload.mimeType, size: payload.size, sha256: payload.sha256 }));
    const requestKey = `${device.id}:${payload.requestId}`; const previous = requests.get(requestKey);
    if (previous) {
      const item = get(device, previous);
      if (item.signature !== signature) throw fail("link_request_conflict", "Upload request ID was already used", 409);
      return projection(item);
    }
    if ([...uploads.values()].filter(item => item.deviceId === device.id).length >= 5 || uploads.size >= 160) throw fail("link_attachment_limit", "Attach at most five files", 429);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const id = crypto.randomUUID(); const file = path.join(root, id);
    const handle = await open(file, "wx", 0o600); await handle.close();
    const item = { ...payload, ...target, id, file, deviceId: device.id, requestKey, signature, receivedBytes: 0, status: "uploading", expiresAt: now() + TTL, chunks: new Map(), queue: Promise.resolve() };
    uploads.set(id, item); requests.set(requestKey, id); return projection(item);
  }
  function create(device, payload) {
    const operation = creates.then(() => createOne(device, payload));
    creates = operation.catch(() => {}); return operation;
  }
  async function append(device, id, payload) {
    const item = get(device, id);
    if (!object(payload) || Object.keys(payload).some(key => !["offset", "base64"].includes(key)) || !Number.isSafeInteger(payload.offset) || payload.offset < 0) throw fail("invalid_link_upload", "Invalid upload chunk");
    const bytes = decodeLinkBytes(payload.base64); const digest = hash(bytes);
    const operation = item.queue.then(async () => {
      get(device, id);
      if (payload.offset < item.receivedBytes && item.chunks.get(payload.offset) === `${bytes.length}:${digest}`) return projection(item);
      if (item.status !== "uploading" || payload.offset !== item.receivedBytes || item.receivedBytes + bytes.length > item.size) throw fail("link_upload_offset_conflict", "Inspect the upload before continuing", 409);
      const handle = await open(item.file, "r+");
      try {
        let written = 0;
        while (written < bytes.length) { const result = await handle.write(bytes, written, bytes.length - written, item.receivedBytes + written); if (!result.bytesWritten) throw new Error("Upload write stopped"); written += result.bytesWritten; }
      }
      finally { await handle.close(); }
      item.chunks.set(payload.offset, `${bytes.length}:${digest}`); item.receivedBytes += bytes.length;
      if (item.receivedBytes === item.size) {
        const digest = crypto.createHash("sha256"); for await (const chunk of createReadStream(item.file)) digest.update(chunk);
        if (digest.digest("hex") !== item.sha256) { await removeItem(item); throw fail("link_upload_digest_mismatch", "The file changed during upload; attach it again", 409); }
        item.status = "ready";
      }
      return projection(item);
    });
    item.queue = operation.catch(() => {}); return operation;
  }
  async function consume(device, id, payload, inputService, groupId) {
    const item = get(device, id); await item.queue;
    const target = await scope(payload);
    if (item.status !== "ready" || item.threadId !== target.threadId || item.cwd !== target.cwd) throw fail("link_upload_scope_mismatch", "Attach this file to its original conversation or workspace", 403);
    await inputService.put(groupId, item.name, createReadStream(item.file));
    return item.name;
  }
  return { create, append, inspect: (device, id) => projection(get(device, id)), consume,
    async remove(device, id) { const item = get(device, id); await item.queue; await removeItem(item); return { id, removed: true }; },
    async revoke(deviceId) { for (const item of uploads.values()) if (item.deviceId === deviceId) { await item.queue; await removeItem(item); } },
    async close() { closed = true; clearInterval(timer); await creates; for (const item of uploads.values()) { await item.queue; await removeItem(item); } }
  };
}
