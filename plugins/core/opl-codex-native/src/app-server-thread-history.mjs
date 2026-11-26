import { AppServerTransportError, requiredChannelString } from "@gaofeng21cn/opl-host-kit/app-server-protocol";

export async function hydrateThreadHistory(transport, response) {
  const thread = response?.thread;
  if (thread?.historyMode !== "paginated") return response;
  const threadId = requiredChannelString(thread.id, "thread.id");
  const collect = async (method, params) => {
    const data = [];
    const seenCursors = new Set();
    let cursor;
    do {
      const page = await transport.request(method, { threadId, sortDirection: "asc", limit: 100, ...params, ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(page?.data) || (page.nextCursor != null && (typeof page.nextCursor !== "string" || !page.nextCursor))) {
        throw new AppServerTransportError("invalid_app_server_response", `${method} returned invalid pagination data`);
      }
      data.push(...page.data);
      cursor = page.nextCursor ?? undefined;
      if (cursor && seenCursors.has(cursor)) {
        throw new AppServerTransportError("invalid_app_server_response", `${method} repeated its pagination cursor`);
      }
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return data;
  };
  // New Codex threads intentionally omit inline history. Keep their persisted
  // history mode and assemble the existing renderer contract from public pages.
  const turns = await collect("thread/turns/list", { itemsView: "notLoaded" });
  const byId = new Map();
  for (const turn of turns) {
    if (typeof turn?.id !== "string" || !turn.id || byId.has(turn.id)) {
      throw new AppServerTransportError("invalid_app_server_response", "thread/turns/list returned an invalid or duplicate turn");
    }
    byId.set(turn.id, { ...turn, items: [], itemsView: "full" });
  }
  for (const turn of byId.values()) {
    const entries = await collect("thread/items/list", { turnId: turn.id });
    const itemIds = new Set();
    for (const entry of entries) {
      if (entry?.turnId !== turn.id || typeof entry.item?.id !== "string" || !entry.item.id || itemIds.has(entry.item.id)) {
        throw new AppServerTransportError("invalid_app_server_response", "thread/items/list returned an invalid, duplicate or mismatched item");
      }
      itemIds.add(entry.item.id);
      turn.items.push(entry.item);
    }
  }
  return { ...response, thread: { ...thread, turns: [...byId.values()] } };
}
