import path from "node:path";
import { readdirSync, statSync } from "node:fs";
import { createLogStore, createLogRoute } from "@objectivex666/dsh-settings-search";

export const SETTINGS_SEARCH_LOG_MAX_BYTES = 256 * 1024;
const ownedLog = /^settings-search(-\d{4}-\d{2}-\d{2}(\.[0-9]+)?)?\.log(\.[0-9]+)?$/;
const reply = (status, reason) => ({ status, body: JSON.stringify({ ok: false, reason }) });

/** Adapt the official store/route to the existing authenticated Studio transports. */
export function createSettingsSearchLog({ dshHome, allowOpen = false }) {
  if (!dshHome || !path.isAbsolute(dshHome)) throw new Error("Settings search logs require the resolved DSH home");
  const store = createLogStore({ dir: path.join(dshHome, "logs", "dsh-settings-search") });
  const route = createLogRoute({
    ...store,
    get file() { return store.file; },
    clear() {
      const clearedFile = store.file;
      if (!store.clear()) throw new Error("Settings search logs could not be cleared");
      // Upstream skips held historical files; do not report complete deletion.
      const remaining = readdirSync(store.dir).filter(name => ownedLog.test(name))
        .some(name => path.join(store.dir, name) !== clearedFile || statSync(path.join(store.dir, name)).size !== 0);
      if (remaining) throw new Error("Some settings search log files remain; clear was incomplete");
      return true;
    },
  });
  return async (payload = {}) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || Object.keys(payload).some(key => !["method", "count", "body"].includes(key))) return reply(400, "bad-request");
    const { method = "GET", count = false, body } = payload;
    if (!["GET", "POST"].includes(method)) return reply(405, "method-not-allowed");
    if (typeof count !== "boolean" || (body !== undefined && typeof body !== "string")) return reply(400, "bad-request");
    if (method === "GET" && body !== undefined) return reply(400, "bad-request");
    if (Buffer.byteLength(body ?? "", "utf8") > SETTINGS_SEARCH_LOG_MAX_BYTES) return reply(413, "request-too-large");
    if (method === "POST" && !allowOpen) {
      try { if (JSON.parse(body).action === "open") return reply(403, "desktop-host-required"); } catch {}
    }
    const response = await route.fetch(new Request(`http://studio.internal/api/settings-search-log${count ? "?count=1" : ""}`, {
      method, ...(method === "POST" ? { body: body ?? "", headers: { "content-type": "application/json" } } : {}),
    }));
    return { status: response.status, body: await response.text() };
  };
}
