import { randomUUID } from "node:crypto";
import { ThreadAdapterError } from "../../../src/host/thread-adapter.mjs";

import { MCP_APP_MIME } from "../../../src/host/mcp-app-protocol.mjs";
const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const fail = (code, message) => { throw new ThreadAdapterError(code, message, {}, 400); };
const required = (value, field) => typeof value === "string" && value.trim() ? value : fail("invalid_mcp_app_request", `${field} is required`);
const appVisible = tool => !Array.isArray(tool?._meta?.ui?.visibility) || tool._meta.ui.visibility.includes("app");
const resourceUri = tool => tool?._meta?.ui?.resourceUri ?? tool?._meta?.["ui/resourceUri"] ?? tool?._meta?.["openai/outputTemplate"];
const MAX_RESOURCE_BYTES = 8 * 1024 * 1024;

function appResource(resource, catalog, uri) {
  const content = resource.contents?.find(item => item.uri === uri && item.mimeType === MCP_APP_MIME);
  let text = content?.text;
  if (typeof text !== "string" && typeof content?.blob === "string" && content.blob.length <= Math.ceil(MAX_RESOURCE_BYTES / 3) * 4) {
    const bytes = Buffer.from(content.blob, "base64");
    if (bytes.toString("base64") === content.blob) text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_RESOURCE_BYTES) fail("mcp_app_resource_invalid", "The server did not return a supported MCP App resource");
  const listedMeta = object(catalog.resources?.find(item => item.uri === uri)?._meta);
  const readMeta = object(content._meta);
  return { uri, mimeType: MCP_APP_MIME, text, _meta: { ...listedMeta, ...readMeta, ui: { ...object(listedMeta.ui), ...object(readMeta.ui) } } };
}

// Only ephemeral view bindings live here. Codex owns connections, credentials,
// tool approvals and thread state; the MCP server owns all domain operations.
export class McpAppHost {
  constructor(transport) {
    this.transport = transport;
    this.views = new Map();
    this.generation = 0;
    this.disposed = false;
    this.onAvailability = availability => {
      if (availability.available === false) { this.generation++; this.views.clear(); }
    };
    transport.on?.("availability", this.onAvailability);
  }

  requireGeneration(generation) {
    if (this.disposed || generation !== this.generation) fail("mcp_app_closed", "The MCP App connection changed; reopen the view");
  }

  async catalog(threadId, serverName) {
    const servers = [];
    let cursor;
    const seen = new Set();
    do {
      const page = await this.transport.request("mcpServerStatus/list", { detail: "full", ...(threadId ? { threadId } : {}), ...(serverName ? { serverName } : {}), ...(cursor ? { cursor } : {}) });
      servers.push(...(page.data ?? []));
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new Error("MCP catalog pagination did not advance");
      seen.add(cursor);
    } while (cursor);
    return servers;
  }

  async list({ threadId } = {}) {
    return { apps: (await this.catalog(threadId)).flatMap(server => Object.values(server.tools ?? {}).flatMap(tool => {
      const uri = resourceUri(tool);
      return typeof uri === "string" && uri.startsWith("ui://") && (!Array.isArray(tool._meta?.ui?.visibility) || tool._meta.ui.visibility.includes("model")) ? [{
        server: server.name, tool: tool.name, title: tool.title || tool.name,
        description: tool.description ?? "", resourceUri: uri,
        inputSchema: object(tool.inputSchema), readOnly: tool.annotations?.readOnlyHint === true
      }] : [];
    })) };
  }

  async open({ threadId, server, tool, arguments: args = {}, callId }) {
    required(threadId, "threadId"); required(server, "server"); required(tool, "tool");
    const generation = this.generation;
    this.requireGeneration(generation);
    if (this.views.size >= 16) fail("mcp_app_limit", "Close an existing MCP App first");
    const catalog = (await this.catalog(threadId, server)).find(entry => entry.name === server);
    this.requireGeneration(generation);
    const declared = Object.values(catalog?.tools ?? {}).find(entry => entry.name === tool);
    const uri = resourceUri(declared);
    if (!declared || typeof uri !== "string" || !uri.startsWith("ui://")) fail("mcp_app_unavailable", "This tool has no available MCP App");
    let result;
    if (callId) {
      const history = await this.transport.readThread(threadId, true);
      const item = (history.thread?.turns ?? []).flatMap(turn => turn.items ?? []).find(item => item.id === callId);
      if (item?.type !== "mcpToolCall" || item.server !== server || item.tool !== tool || item.status !== "completed" || !item.result) fail("mcp_app_call_mismatch", "No completed tool call matches this view and conversation");
      result = item.result;
      args = item.arguments;
    } else {
      if (declared.annotations?.readOnlyHint !== true) fail("mcp_app_open_requires_read", "Opening a view must not repeat a mutating tool");
      result = await this.transport.request("mcpServer/tool/call", { threadId, server, tool, arguments: object(args) }, 120_000);
    }
    this.requireGeneration(generation);
    if (result.isError) fail("mcp_app_open_failed", result.content?.find(item => item.type === "text")?.text ?? "The MCP App could not open");
    const resource = await this.transport.request("mcpServer/resource/read", { threadId, server, uri, ...(callId ? { originCallId: callId } : {}) });
    this.requireGeneration(generation);
    const content = appResource(resource, catalog, uri);
    const id = randomUUID();
    this.views.set(id, { threadId, server, tool, uri, callId });
    return { id, threadId, server, tool, title: declared.title || tool, arguments: object(args), result, resource: content, resources: catalog.resources ?? [] };
  }

  binding({ id, threadId }) {
    const view = this.views.get(required(id, "id"));
    if (!view || view.threadId !== threadId) fail("mcp_app_closed", "The MCP App is closed or belongs to another conversation");
    return view;
  }

  async currentCatalog(payload) {
    const view = this.binding(payload);
    const catalog = (await this.catalog(view.threadId, view.server)).find(entry => entry.name === view.server);
    // Closing the iframe or resetting the connection during discovery revokes
    // this dispatch, too. Never authorize against the catalog captured at open.
    this.binding(payload);
    if (!catalog) fail("mcp_app_unavailable", "This MCP App server is no longer available");
    return { view, catalog };
  }

  dispatch(payload, method, params, timeoutMs) {
    const beforeDispatch = () => { this.binding(payload); };
    beforeDispatch();
    return this.transport.request(method, params, timeoutMs, { beforeDispatch });
  }

  async call(payload) {
    const { view, catalog } = await this.currentCatalog(payload);
    const tool = Object.values(catalog.tools ?? {}).find(item => item.name === payload.name);
    if (!tool || !appVisible(tool)) fail("mcp_app_tool_denied", "The tool is not declared for this MCP App server");
    return this.dispatch(payload, "mcpServer/tool/call", { threadId: view.threadId, server: view.server, tool: payload.name, arguments: object(payload.arguments) }, 120_000);
  }

  async read(payload) {
    const { view, catalog } = await this.currentCatalog(payload);
    const openingTool = Object.values(catalog.tools ?? {}).find(item => item.name === view.tool);
    const declared = (catalog.resources ?? []).some(item => item.uri === payload.uri)
      || (payload.uri === view.uri && resourceUri(openingTool) === view.uri);
    if (!declared) fail("mcp_app_resource_denied", "The resource is not declared for this MCP App server");
    return this.dispatch(payload, "mcpServer/resource/read", { threadId: view.threadId, server: view.server, uri: payload.uri, ...(view.callId ? { originCallId: view.callId } : {}) });
  }

  close(payload) { this.binding(payload); this.views.delete(payload.id); return { closed: true }; }
  dispose() { this.disposed = true; this.generation++; this.views.clear(); this.transport.off?.("availability", this.onAvailability); }
}
