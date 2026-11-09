import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
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
  const transport = Object.assign(new EventEmitter(), { request: async (method, params) => {
    calls.push({ method, params });
    if (method === "mcpServerStatus/list") return { data: [{ name: "fixture", tools, resources: [] }] };
    if (method === "mcpServer/tool/call") return { content: [], structuredContent: { revision: 3 } };
    if (method === "mcpServer/resource/read") return { contents: [{ uri: params.uri, mimeType: MCP_APP_MIME, text: "<h1>Review</h1>" }] };
    throw new Error(method);
  } });
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
  const original = transport.request;
  transport.request = async (method, params) => method === "mcpServer/tool/call"
    ? { isError: true, content: [{ type: "text", text: "revision conflict" }] }
    : original(method, params);
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


test("rechecks App visibility and resource declarations after a view has opened", async () => {
  const { host, tools, calls } = fixture();
  const view = await host.open({ threadId: "t1", server: "fixture", tool: "open" });
  const before = calls.length;
  tools.save._meta.ui.visibility = ["model"];
  await assert.rejects(host.call({ ...view, name: "save", arguments: { revision: 3 } }), /not declared/);
  delete tools.open;
  await assert.rejects(host.read({ ...view, uri: view.resource.uri }), /not declared/);
  assert.equal(calls.slice(before).some(call => call.method !== "mcpServerStatus/list"), false);
});

test("closing during live discovery prevents a pending operation from dispatching", async () => {
  const { host, transport, calls } = fixture();
  const view = await host.open({ threadId: "t1", server: "fixture", tool: "open" });
  const original = transport.request;
  let resume;
  transport.request = async (method, params) => {
    if (method === "mcpServerStatus/list") await new Promise(resolve => { resume = resolve; });
    return original(method, params);
  };
  const before = calls.length;
  const pending = host.call({ ...view, name: "save" });
  host.close(view);
  resume();
  await assert.rejects(pending, /closed/);
  assert.equal(calls.slice(before).some(call => call.method === "mcpServer/tool/call"), false);
});

test("connection reset revokes old bindings and a reopened view uses owner readback", async () => {
  const { host, transport, calls } = fixture();
  const view = await host.open({ threadId: "t1", server: "fixture", tool: "open", arguments: { item: "p7" } });
  transport.emit("availability", { available: false });
  transport.emit("availability", { available: true });
  await assert.rejects(host.call({ ...view, name: "save" }), /closed/);
  const reopened = await host.open({ threadId: "t1", server: "fixture", tool: "open", arguments: view.arguments });
  assert.notEqual(reopened.id, view.id);
  assert.deepEqual(reopened.arguments, { item: "p7" });
  assert.deepEqual(calls.filter(call => call.method === "mcpServer/tool/call").map(call => call.params.tool), ["open", "open"]);
  host.dispose();
  assert.equal(transport.listenerCount("availability"), 0);
});

test("an open in flight cannot recreate a binding after connection reset", async () => {
  const { host, transport } = fixture();
  const original = transport.request;
  transport.request = async (method, params) => {
    const result = await original(method, params);
    if (method === "mcpServer/resource/read") transport.emit("availability", { available: false });
    return result;
  };
  await assert.rejects(host.open({ threadId: "t1", server: "fixture", tool: "open" }), /connection changed/);
  assert.equal(host.views.size, 0);
});

test("unknown mutation outcomes are returned without a second dispatch", async () => {
  const { host, transport, calls } = fixture();
  const view = await host.open({ threadId: "t1", server: "fixture", tool: "open" });
  const original = transport.request;
  transport.request = async (method, params) => {
    const result = await original(method, params);
    if (method === "mcpServer/tool/call" && params.tool === "save") throw new Error("outcome_unknown; inspect the owner receipt");
    return result;
  };
  await assert.rejects(host.call({ ...view, name: "save", arguments: { revision: 3, request_id: "r7" } }), /outcome_unknown/);
  assert.equal(calls.filter(call => call.method === "mcpServer/tool/call" && call.params.tool === "save").length, 1);
  const readback = await host.call({ ...view, name: "open", arguments: { item: "p7", request_id: "r7" } });
  assert.equal(readback.structuredContent.revision, 3);
});


test("closing between catalog resolution and the caller continuation prevents dispatch", async () => {
  for (const method of ["call", "read"]) {
    const { host, calls } = fixture();
    const view = await host.open({ threadId: "t1", server: "fixture", tool: "open" });
    const original = host.currentCatalog.bind(host);
    host.currentCatalog = async payload => {
      const result = await original(payload);
      queueMicrotask(() => host.close(view));
      return result;
    };
    const before = calls.length;
    await assert.rejects(host[method]({ ...view, name: "save", uri: view.resource.uri }), /closed/);
    assert.equal(calls.slice(before).some(call => call.method !== "mcpServerStatus/list"), false);
  }
});
