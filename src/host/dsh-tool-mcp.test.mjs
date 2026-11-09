import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { codexArgsWithDshToolMcp } from "../../plugins/opl-codex-native/src/service.mjs";
import { bootOplStudioHost, resolveWebBindAddress } from "./dsh/host.mjs";

const fakeTransport = {
  initialized: false,
  on() {},
  createChannelCallbackAdapter: () => null,
  async start() { this.initialized = true; },
  async stop() { this.initialized = false; }
};

function emptyOpl() {
  return {
    readState: async () => ({}),
    readInitialize: async () => ({}),
    readFullDrilldown: async () => ({}),
    readDomainDetailView: async () => ({}),
    readContribution: async () => ({}),
    executeAction: async () => ({})
  };
}

async function writeProfileTool(dshHome) {
  const profileDir = path.join(dshHome, "profiles", "opl-studio");
  const packageDir = path.join(profileDir, "node_modules", "opl-dsh-test-tool");
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(packageDir, "package.json"), JSON.stringify({
    name: "opl-dsh-test-tool",
    version: "1.0.0",
    type: "module",
    exports: "./index.mjs"
  }), "utf8");
  await writeFile(path.join(packageDir, "index.mjs"), `
import { defineTool } from "@deepseek-ai/dsh-tools";
export const name = "opl-dsh-test-tool";
export const inject = ["tools"];
export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "opl_echo",
    description: "Echo text through a DSH profile plugin.",
    parameters: { text: { type: "string", required: true } },
    output: {
      schema: { type: "object", additionalProperties: false, properties: { echoed: { type: "string", required: true } } },
      render: (_args, value) => [{ type: "text", text: value.echoed }]
    },
    async execute(args) { return { echoed: args.text }; }
  }));
}
`, "utf8");
  await writeFile(path.join(profileDir, "package.json"), JSON.stringify({
    name: "dsh-profile-opl-studio",
    private: true,
    dependencies: { "opl-dsh-test-tool": "1.0.0" },
    dsh: { profile: { bundles: [] } }
  }, null, 2), "utf8");
  await writeFile(path.join(profileDir, "cordis.patch.yml"), `
- insert:
    - id: opl-dsh-test-tool
      name: opl-dsh-test-tool
`, "utf8");
}

test("DSH profile tools are authenticated, callable, and dynamically announced over MCP", async (t) => {
  const dshHome = await mkdtemp(path.join(os.tmpdir(), "opl-studio-dsh-profile-"));
  await writeProfileTool(dshHome);
  const { context, core } = await bootOplStudioHost({
    dshHome,
    transport: fakeTransport,
    opl: emptyOpl(),
    webHost: "127.0.0.1",
    webPort: 0
  });
  t.after(async () => {
    await core.close();
    await rm(dshHome, { recursive: true, force: true });
  });

  const mcp = context.get("oplDshToolMcp");
  const connection = mcp.codexConnection();
  const unauthorized = await fetch(connection.url, { method: "POST", body: "{}" });
  assert.equal(unauthorized.status, 401);

  let changed;
  const changedPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("tool list notification was not received")), 2_000);
    changed = (error, tools) => {
      // Image registration also emits a notification. Wait for the later
      // registration instead of depending on both events being coalesced.
      if (!error && !tools?.some((tool) => tool.name === "late_tool")) return;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(tools);
    };
  });
  const client = new Client(
    { name: "opl-studio-mcp-test", version: "1.0.0" },
    { listChanged: { tools: { debounceMs: 0, onChanged: changed } } }
  );
  const transport = new StreamableHTTPClientTransport(new URL(connection.url), {
    requestInit: { headers: { authorization: `Bearer ${connection.bearerToken}` } }
  });
  t.after(() => client.close());
  await client.connect(transport);

  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name), ["opl_echo"]);
  const result = await client.callTool({ name: "opl_echo", arguments: { text: "from-profile" } });
  assert.deepEqual(result.content, [{ type: "text", text: "from-profile" }]);
  assert.deepEqual(result.structuredContent, {
    dsh: { value: { echoed: "from-profile" } }
  });
  const invalid = await client.callTool({ name: "opl_echo", arguments: { text: 17 } });
  assert.equal(invalid.isError, true);
  assert.ok(invalid.structuredContent.dsh.error);
  const unknown = await client.callTool({ name: "not_registered", arguments: {} });
  assert.equal(unknown.isError, true);
  assert.ok(unknown.structuredContent.dsh.error);

  const imageRef = {
    attachmentId: "image-1",
    mediaType: "image/png",
    bytes: 4,
    width: 1,
    height: 1
  };
  context.provide("attachments", {
    async readImage(ref) {
      assert.deepEqual(ref, imageRef);
      return { ref, data: Uint8Array.from([0, 1, 2, 3]) };
    }
  });
  const { defineTool } = await import("@deepseek-ai/dsh-tools");
  const disposeImageTool = context.tools.register(defineTool({
    name: "profile_image",
    description: "Return a stored DSH image.",
    parameters: {},
    output: {
      schema: { type: "string" },
      render: () => [{ type: "image", attachment: imageRef }]
    },
    async execute() { return "image-1"; }
  }));
  t.after(disposeImageTool);
  const imageResult = await client.callTool({ name: "profile_image", arguments: {} });
  assert.deepEqual(imageResult.content, [{
    type: "image",
    data: "AAECAw==",
    mimeType: "image/png"
  }]);

  const disposeLateTool = context.tools.register(defineTool({
    name: "late_tool",
    description: "Registered after MCP initialization.",
    parameters: {},
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }]
    },
    async execute() { return "late"; }
  }));
  t.after(disposeLateTool);
  assert.deepEqual((await changedPromise).map((tool) => tool.name).sort(), [
    "late_tool",
    "opl_echo",
    "profile_image"
  ]);
});

test("Codex App Server receives the DSH MCP only through launch-scoped config and env", () => {
  const args = codexArgsWithDshToolMcp(["app-server", "--stdio"], {
    url: "http://127.0.0.1:3456/mcp/dsh-tools",
    bearerTokenEnvVar: "OPL_STUDIO_DSH_MCP_TOKEN"
  });
  assert.deepEqual(args, [
    "app-server", "--stdio",
    "-c", "mcp_servers.opl_studio_dsh.url=\"http://127.0.0.1:3456/mcp/dsh-tools\"",
    "-c", "mcp_servers.opl_studio_dsh.bearer_token_env_var=\"OPL_STUDIO_DSH_MCP_TOKEN\"",
    "-c", "mcp_servers.opl_studio_dsh.required=true",
    "-c", "mcp_servers.opl_studio_dsh.default_tools_approval_mode=\"auto\""
  ]);
});


test("wildcard WebUI requests bind one concrete interface for the official DSH host", () => {
  const eth0 = [{ address: "172.18.0.2", family: "IPv4", internal: false }];
  const interfaces = { lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }], eth0 };
  assert.equal(resolveWebBindAddress("0.0.0.0", interfaces), "172.18.0.2");
  assert.equal(resolveWebBindAddress("127.0.0.1", interfaces), "127.0.0.1");
  assert.throws(() => resolveWebBindAddress("0.0.0.0", {}), /concrete local WebUI bind address/);
  assert.throws(() => resolveWebBindAddress("0.0.0.0", { ...interfaces, eth1: [{ address: "192.168.0.2", family: "IPv4", internal: false }] }), /concrete local WebUI bind address/);
});
