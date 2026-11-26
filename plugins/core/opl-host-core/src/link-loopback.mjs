import { Readable, PassThrough } from "node:stream";
import { loopbackRequestSchema } from "../../../../vendor/dsh-remote/loopback.mjs";
import { RpcError } from "../../../../vendor/dsh-remote/host.mjs";

export const LINK_VIRTUAL_PORT = 43177;
const SAFE_HEADERS = new Set(["authorization", "content-type", "accept", "if-match"]);
const MAX_READ = 64 * 1024;

class LinkResponse extends PassThrough {
  constructor() {
    super({ highWaterMark: 1024 * 1024 });
    this.headersSent = false;
    this.head = new Promise((resolve, reject) => { this.resolveHead = resolve; this.once("error", reject); });
  }
  writeHead(status, headers = {}) {
    if (this.headersSent) throw new Error("Response already started");
    this.headersSent = true;
    this.resolveHead({ status, headers: Object.entries(headers).map(([key, value]) => [key, String(value)]) });
    return this;
  }
}

/** In-process adapter for an authenticated Remote peer. It never opens sockets or resolves URLs. */
export class LinkLoopback {
  constructor({ context, handle, idleMs = 20_000 }) {
    this.context = context; this.handle = handle; this.idleMs = idleMs; this.handles = new Map(); this.closed = false;
    this.timer = setInterval(() => { for (const [id, item] of this.handles) if (Date.now() - item.touched > 60_000) this.close(id); }, 10_000); this.timer.unref();
  }
  async call(input) {
    if (this.closed) throw new RpcError("TRANSPORT_CLOSED", "Connection closed; reconnect to the desktop App.");
    const value = loopbackRequestSchema.parse(input);
    if (value.op === "close") { this.close(value.id); return { closed: true }; }
    if (value.op === "http.open") {
      const target = new URL(value.path, `http://127.0.0.1:${LINK_VIRTUAL_PORT}`);
      if (value.port !== LINK_VIRTUAL_PORT || target.origin !== `http://127.0.0.1:${LINK_VIRTUAL_PORT}` || !target.pathname.startsWith("/api/link/") || /^\/api\/link\/(?:pair|devices)(?:\/|$)/.test(target.pathname)) throw new RpcError("LOOPBACK_PORT_DENIED", "Only OPL Link phone actions are available.");
      if (this.handles.has(value.id)) throw new RpcError("REQUEST_CONFLICT", "Request handle is already in use.");
      if (this.handles.size >= 16) throw new RpcError("RATE_LIMITED", "Too many active requests.");
      const bytes = Buffer.from(value.body ?? "", "base64");
      if (bytes.length > 1024 * 1024) throw new RpcError("REQUEST_TOO_LARGE", "Use attachment chunks.");
      const req = new Readable({ read() { this.push(bytes); this.push(null); }, autoDestroy: false });
      req.url = value.path; req.method = value.method;
      req.headers = { host: `127.0.0.1:${LINK_VIRTUAL_PORT}` };
      for (const [key, entry] of value.headers) { const name = key.toLowerCase(); if (!SAFE_HEADERS.has(name) || req.headers[name] !== undefined) throw new RpcError("INVALID_MESSAGE", "Unsupported or duplicate request header."); req.headers[name] = entry; }
      req.socket = { remoteAddress: "127.0.0.1", encrypted: false };
      const res = new LinkResponse();
      const item = { req, res, touched: Date.now(), total: 0, reading: false }; this.handles.set(value.id, item);
      void Promise.resolve(this.handle(req, res, this.context)).catch(() => { res.destroy(new Error("Link request failed")); });
      let timer;
      try { return await Promise.race([res.head, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 20_000); })]); }
      catch { this.close(value.id); throw new RpcError("LOOPBACK_UNAVAILABLE", "The desktop did not complete this request. Refresh its state before continuing."); }
      finally { clearTimeout(timer); }
    }
    if (value.op !== "http.read") throw new RpcError("METHOD_NOT_FOUND", "Only bounded OPL Link HTTP operations are available.");
    const item = this.handles.get(value.id);
    if (!item) throw new RpcError("LOOPBACK_CLOSED", "Request closed; refresh the desktop state.");
    if (item.reading) throw new RpcError("REQUEST_CONFLICT", "Only one read may be pending.");
    item.reading = true; item.touched = Date.now();
    try {
      const response = item.res;
      if (!response.readableLength && !response.readableEnded && !response.destroyed) await new Promise((resolve, reject) => {
        const finish = error => { clearTimeout(timer); for (const event of ["readable", "end", "close"]) response.off(event, ready); response.off("error", failed); error ? reject(error) : resolve(); };
        const ready = () => finish(); const failed = () => finish(new Error("closed"));
        const timer = setTimeout(() => finish(new Error("idle")), this.idleMs);
        for (const event of ["readable", "end", "close"]) response.once(event, ready); response.once("error", failed);
      });
      if (this.handles.get(value.id) !== item || response.destroyed && !response.readableEnded) throw new Error("closed");
      const chunk = response.read(Math.min(response.readableLength || MAX_READ, MAX_READ));
      item.total += chunk?.length ?? 0;
      if (item.total > 64 * 1024 * 1024) throw new Error("size");
      const done = !chunk && (response.readableEnded || response.destroyed || response.writableFinished);
      if (done) this.close(value.id);
      return { data: chunk?.toString("base64") ?? "", done };
    } catch { this.close(value.id); throw new RpcError("LOOPBACK_READ_FAILED", "Response closed; read the canonical desktop state before reconnecting."); }
    finally { item.reading = false; }
  }
  close(id) { const item = this.handles.get(id); this.handles.delete(id); item?.req.destroy(); item?.res.destroy(); }
  closeAll() { this.closed = true; clearInterval(this.timer); for (const id of this.handles.keys()) this.close(id); }
}
