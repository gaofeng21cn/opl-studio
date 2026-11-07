import assert from "node:assert/strict";
import test from "node:test";
import { McpAppHost } from "../../plugins/opl-mcp-apps/src/service.mjs";
import { MCP_APP_MIME, MCP_APP_EXTENSION } from "./mcp-app-protocol.mjs";

function fixture() {
  const calls = [];
  const tools = {
    open: { name: "open", title: "Review", _meta: { ui: { resourceUri: "ui://fixture/review" } }, annotations: { readOnlyHint: true } },
    save: { name: "save", _meta: { ui: { visibility: ["app"] } } },
    modelOnly: { name: "modelOnly", _meta: { ui: { visibility: ["model"] } } },
    mutate: { name: "mutate", _meta: { ui: { resourceUri: "ui://fixture/review" } } }
  };
  const transport = { request: async (method, params) => {
    calls.push({ method, params });
    if (method === "mcpServerStatus/list") return { data: [{ name: "fixture", tools, resources: [] }] };
    if (method === "mcpServer/tool/call") return { content: [], structuredContent: { revision: 3 } };
    if (method === "mcpServer/resource/read") return { contents: [{ uri: params.uri, mimeType: MCP_APP_MIME, text: "<h1>Review</h1>" }] };
    throw new Error(method);
  } };
  return { host: new McpAppHost(transport), calls, tools, transport };
}

test("discovers declared UI tools and opens through the same thread connection", async () => {
  const { host, calls } = fixture();
  assert.equal(MCP_APP_EXTENSION["io.modelcontextprotocol/ui"].mimeTypes[0], MCP_APP_MIME);
  assert.deepEqual((await host.list({ threadId: "t1" })).apps.map(app => app.tool), ["open", "mutate"]);
  const view = await host.open({ threadId: "t1", server: "fixture", tool: "open", arguments: { item: "p7" } });
  assert.equal(view.resource.mimeType, MCP_APP_MIME);
  assert.deepEqual(calls.find(call => call.method === "mcpServer/tool/call").params, { threadId: "t1", server: "fixture", tool: "open", arguments: { item: "p7" } });
  await host.call({ ...view, name: "save", arguments: { revision: 3 } });
  assert.equal(calls.at(-1).params.server, "fixture");
  assert.equal(calls.at(-1).params.threadId, "t1");
});

test("rejects cross-thread, model-only, undeclared and closed view calls", async () => {
  const { host } = fixture();
  const view = await host.open({ threadId: "t1", server: "fixture", tool: "open" });
  for (const payload of [{ ...view, threadId: "t2", name: "save" }, { ...view, name: "modelOnly" }, { ...view, name: "other_server_send" }]) {
    await assert.rejects(host.call(payload), /not declared|another conversation/);
  }
  await assert.rejects(host.read({ ...view, uri: "file:///secrets" }), /not declared/);
  host.close(view);
  await assert.rejects(host.call({ ...view, name: "save" }), /closed/);
});

test("does not execute a mutation to open a view or accept mismatched resources", async () => {
  const { host, calls, transport } = fixture();
  await assert.rejects(host.open({ threadId: "t1", server: "fixture", tool: "mutate" }), /mutating/);
  assert.equal(calls.some(call => call.method === "mcpServer/tool/call"), false);
  const original = transport.request;
  transport.request = (method, params) => method === "mcpServer/resource/read" ? { contents: [{ uri: "ui://other", mimeType: MCP_APP_MIME, text: "wrong" }] } : original(method, params);
  await assert.rejects(host.open({ threadId: "t1", server: "fixture", tool: "open" }), /supported MCP App/);
  assert.equal(host.views.size, 0);
});

test("keeps owner tool errors intact and disposes all ephemeral bindings", async () => {
  const { host, transport } = fixture();
  const view = await host.open({ threadId: "t1", server: "fixture", tool: "open" });
  transport.request = async () => ({ isError: true, content: [{ type: "text", text: "revision conflict" }] });
  assert.equal((await host.call({ ...view, name: "save" })).isError, true);
  host.dispose();
  assert.equal(host.views.size, 0);
});

test("renders a canonical completed call without repeating its mutation", async () => {
  const { host, transport, calls } = fixture();
  transport.readThread = async threadId => ({ thread: { id: threadId, turns: [{ items: [{
    id: "call7", type: "mcpToolCall", server: "fixture", tool: "mutate", status: "completed",
    arguments: { revision: 3 }, result: { content: [], structuredContent: { receipt: "r7" } }
  }] }] } });
  const view = await host.open({ threadId: "t1", server: "fixture", tool: "mutate", callId: "call7" });
  assert.equal(view.result.structuredContent.receipt, "r7");
  assert.equal(calls.some(call => call.method === "mcpServer/tool/call"), false);
  assert.equal(calls.at(-1).params.originCallId, "call7");
  await host.read({ ...view, uri: view.resource.uri });
  assert.equal(calls.at(-1).params.originCallId, "call7");
  await assert.rejects(host.open({ threadId: "t1", server: "fixture", tool: "open", callId: "call7" }), /matches/);
});

test("opens model-visible UI tools while keeping them unavailable to the embedded app", async () => {
  const { host, tools } = fixture();
  tools.open._meta.ui.visibility = ["model"];
  assert.equal((await host.list({ threadId: "t1" })).apps[0].tool, "open");
  const view = await host.open({ threadId: "t1", server: "fixture", tool: "open" });
  await assert.rejects(host.call({ ...view, name: "open" }), /not declared/);
});

test("decodes bounded HTML blobs and preserves resource-list CSP metadata", async () => {
  const { host, transport } = fixture();
  const original = transport.request;
  let blob = Buffer.from("<h1>审阅</h1>").toString("base64");
  transport.request = async (method, params) => {
    if (method === "mcpServer/resource/read") return { contents: [{ uri: params.uri, mimeType: MCP_APP_MIME, blob, _meta: { ui: { prefersBorder: true } } }] };
    const result = await original(method, params);
    if (method === "mcpServerStatus/list") result.data[0].resources = [{ uri: "ui://fixture/review", _meta: { ui: { csp: { resourceDomains: ["https://assets.example"] } } } }];
    return result;
  };
  const view = await host.open({ threadId: "t1", server: "fixture", tool: "open" });
  assert.equal(view.resource.text, "<h1>审阅</h1>");
  assert.deepEqual(view.resource._meta.ui.csp.resourceDomains, ["https://assets.example"]);
  assert.equal(view.resource._meta.ui.prefersBorder, true);
  blob = "invalid!";
  await assert.rejects(host.open({ threadId: "t1", server: "fixture", tool: "open" }), /supported MCP App/);
});
