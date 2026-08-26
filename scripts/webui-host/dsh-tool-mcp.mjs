import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest
} from "@modelcontextprotocol/sdk/types.js";

export const DSH_TOOL_MCP_PATH = "/mcp/dsh-tools";
export const DSH_TOOL_MCP_TOKEN_ENV = "OPL_STUDIO_DSH_MCP_TOKEN";
const studioVersion = JSON.parse(await readFile(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json"),
  "utf8"
)).version;

class DshToolMcpHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "DshToolMcpHttpError";
    this.status = status;
  }
}

function headerValue(value) {
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function writeJson(res, status, value, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(value));
}

function writeJsonRpcError(res, status, message) {
  writeJson(res, status, {
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null
  });
}

function authorized(req, token) {
  const value = headerValue(req.headers.authorization);
  if (value === undefined) return false;
  const actual = Buffer.from(value);
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) throw new DshToolMcpHttpError(400, "MCP POST body is required");
  try {
    return JSON.parse(body);
  } catch {
    throw new DshToolMcpHttpError(400, "MCP POST body must be valid JSON");
  }
}

function jsonText(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

async function projectContentBlock(context, block, signal) {
  if (block?.type === "text" && typeof block.text === "string") {
    return { type: "text", text: block.text };
  }
  if (block?.type === "image" && block.attachment) {
    const attachments = context.get("attachments");
    if (attachments && typeof attachments.readImage === "function") {
      const stored = await attachments.readImage(block.attachment, signal);
      return {
        type: "image",
        data: Buffer.from(stored.data).toString("base64"),
        mimeType: stored.ref?.mediaType ?? block.attachment.mediaType
      };
    }
  }
  return { type: "text", text: jsonText(block) };
}

async function projectToolResult(context, result, signal) {
  const content = await Promise.all(
    (Array.isArray(result?.content) ? result.content : []).map(
      (block) => projectContentBlock(context, block, signal)
    )
  );
  const dsh = {
    ...(result?.isError === true ? { error: result.error } : { value: result?.value }),
    ...(result?.meta !== undefined ? { meta: result.meta } : {}),
    ...(result?.additionalContexts !== undefined
      ? { additionalContexts: result.additionalContexts }
      : {}),
    ...(result?.concludesTurn === true ? { concludesTurn: true } : {})
  };
  return {
    content,
    isError: result?.isError === true,
    structuredContent: { dsh }
  };
}

function mcpToolSchema(schema) {
  return {
    name: schema.name,
    description: schema.description,
    inputSchema: structuredClone(schema.parameters)
  };
}

export class DshToolMcp {
  constructor({ context, webServer, tools, token = randomBytes(32).toString("base64url") }) {
    this.context = context;
    this.webServer = webServer;
    this.tools = tools;
    this.token = token;
    this.sessions = new Map();
    this.active = false;
  }

  get url() {
    const host = this.webServer.host === "0.0.0.0" ? "127.0.0.1" : this.webServer.host;
    return `http://${host}:${this.webServer.port}${DSH_TOOL_MCP_PATH}`;
  }

  codexConnection() {
    return Object.freeze({
      url: this.url,
      bearerTokenEnvVar: DSH_TOOL_MCP_TOKEN_ENV,
      bearerToken: this.token
    });
  }

  activate() {
    if (this.active) throw new Error("opl-studio: DSH Tool MCP is already active");
    this.active = true;
    const disposeRoute = this.webServer.register({
      kind: "exact",
      path: DSH_TOOL_MCP_PATH,
      handler: (req, res) => this.#handle(req, res)
    });
    const disposeChange = this.context.on("tools/change", () => {
      const notifications = [...this.sessions.values()].map(({ server }) => (
        server.sendToolListChanged()
      ));
      void Promise.allSettled(notifications);
    });

    return async () => {
      this.active = false;
      disposeChange();
      disposeRoute();
      const sessions = [...this.sessions.values()];
      this.sessions.clear();
      await Promise.allSettled(sessions.map(({ server }) => server.close()));
    };
  }

  #createSession() {
    let record;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomBytes(24).toString("base64url"),
      onsessioninitialized: (sessionId) => {
        record.sessionId = sessionId;
        this.sessions.set(sessionId, record);
      }
    });
    const server = new Server(
      { name: "opl-studio-dsh-tools", version: studioVersion },
      {
        capabilities: { tools: { listChanged: true } },
        debouncedNotificationMethods: ["notifications/tools/list_changed"]
      }
    );
    record = { server, transport, sessionId: undefined };
    transport.onclose = () => {
      if (record.sessionId && this.sessions.get(record.sessionId) === record) {
        this.sessions.delete(record.sessionId);
      }
    };
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools.schemas().map(mcpToolSchema)
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const result = await this.tools.execute({
        callId: `mcp:${extra.sessionId ?? "initializing"}:${String(extra.requestId)}`,
        name: request.params.name,
        arguments: request.params.arguments ?? {},
        signal: extra.signal
      });
      return projectToolResult(this.context, result, extra.signal);
    });
    return record;
  }

  async #handle(req, res) {
    if (!authorized(req, this.token)) {
      writeJson(res, 401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
      return;
    }

    try {
      const sessionId = headerValue(req.headers["mcp-session-id"]);
      if (req.method === "POST") {
        const body = await readJsonBody(req);
        if (sessionId) {
          const record = this.sessions.get(sessionId);
          if (!record) throw new DshToolMcpHttpError(400, "Invalid MCP session ID");
          await record.transport.handleRequest(req, res, body);
          return;
        }
        if (!isInitializeRequest(body)) {
          throw new DshToolMcpHttpError(400, "MCP initialization request is required");
        }
        const record = this.#createSession();
        try {
          await record.server.connect(record.transport);
          await record.transport.handleRequest(req, res, body);
        } catch (error) {
          await record.server.close().catch(() => {});
          throw error;
        }
        return;
      }

      if (req.method === "GET" || req.method === "DELETE") {
        const record = sessionId ? this.sessions.get(sessionId) : undefined;
        if (!record) throw new DshToolMcpHttpError(400, "Invalid or missing MCP session ID");
        await record.transport.handleRequest(req, res);
        return;
      }

      res.writeHead(405, { allow: "GET, POST, DELETE" });
      res.end();
    } catch (error) {
      if (res.headersSent) {
        res.destroy(error instanceof Error ? error : undefined);
        return;
      }
      const status = error instanceof DshToolMcpHttpError ? error.status : 500;
      const message = error instanceof DshToolMcpHttpError
        ? error.message
        : "Internal MCP server error";
      writeJsonRpcError(res, status, message);
    }
  }
}
