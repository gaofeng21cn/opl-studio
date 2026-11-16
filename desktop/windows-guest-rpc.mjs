import { EventEmitter } from "node:events";

// Private parent/child pipe: no listener socket, credentials file, or second
// session store. Only request IDs cross it; application errors stay bounded.
export function createGuestRpc({ input, output, onRequest, onEvent = () => {}, timeoutMs = 120000, maxFrameBytes = 128 * 1024 * 1024 }) {
  // Canonical thread reads can contain image data and exceed 32 MiB. Bound each
  // private pipe frame, rather than the sum of frames coalesced in one chunk.
  let serial = 0, fragments = [], bufferedBytes = 0, closed = false;
  const pending = new Map();
  const events = new EventEmitter();
  const write = value => {
    if (closed) throw Object.assign(new Error("Guest Host connection closed"), { code: "guest_host_closed" });
    const frame = JSON.stringify(value, (_key, value) => Buffer.isBuffer(value)
      ? { __oplBuffer: value.toString("base64") } : value?.type === "Buffer" && Array.isArray(value.data)
        ? { __oplBuffer: Buffer.from(value.data).toString("base64") } : value);
    if (Buffer.byteLength(frame) > maxFrameBytes) throw Object.assign(new Error("Guest Host response exceeds the private frame limit"), { code: "guest_frame_too_large" });
    output.write(`${frame}\n`);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    fragments = []; bufferedBytes = 0;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(Object.assign(new Error("Guest Host disconnected"), { code: "guest_host_closed" })); }
    pending.clear(); events.emit("close");
  };
  const consume = async frame => {
    if (frame.type === "response" && Number.isSafeInteger(frame.id)) {
      const request = pending.get(frame.id);
      if (!request) return;
      pending.delete(frame.id); clearTimeout(request.timer);
      if (frame.error) request.reject(Object.assign(new Error(frame.error.message ?? "Guest Host request failed"), { code: frame.error.code ?? "guest_request_failed" }));
      else request.resolve(frame.value);
    } else if (frame.type === "event") onEvent(frame.value);
    else if (frame.type === "request" && Number.isSafeInteger(frame.id) && typeof frame.method === "string") {
      try { write({ type: "response", id: frame.id, value: await onRequest(frame.method, frame.payload) }); }
      catch (error) { if (!closed) write({ type: "response", id: frame.id, error: { code: error.code ?? "guest_request_failed", message: String(error.message ?? "Guest Host request failed").slice(0, 2048) } }); }
    }
  };
  input.setEncoding("utf8");
  input.on("data", chunk => {
    if (closed) return;
    let start = 0;
    while (start < chunk.length) {
      const next = chunk.indexOf("\n", start);
      const part = chunk.slice(start, next === -1 ? chunk.length : next);
      bufferedBytes += Buffer.byteLength(part);
      if (bufferedBytes > maxFrameBytes) { close(); return; }
      fragments.push(part);
      if (next === -1) return;
      const line = fragments.join(""); fragments = []; bufferedBytes = 0;
      try { void consume(JSON.parse(line, (_key, value) => value?.__oplBuffer && Object.keys(value).length === 1 ? Buffer.from(value.__oplBuffer, "base64") : value)); }
      catch { close(); return; }
      start = next + 1;
    }
  });
  input.once("end", close);
  input.once("error", close);
  return {
    events, close,
    emit(value) { if (!closed) write({ type: "event", value }); },
    request(method, payload = {}, { timeoutMs: requestTimeoutMs = timeoutMs } = {}) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = requestTimeoutMs === 0 ? null : setTimeout(() => { pending.delete(id); reject(Object.assign(new Error("Guest Host request timed out"), { code: "guest_request_timeout" })); }, requestTimeoutMs);
        pending.set(id, { resolve, reject, timer });
        try { write({ type: "request", id, method, payload }); }
        catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
      });
    }
  };
}
