import { McpAppHost } from "./service.mjs";

export const name = "opl-mcp-apps";
export const inject = ["oplCodexNative"];
export function apply(ctx) {
  const service = new McpAppHost(ctx.oplCodexNative.transport);
  ctx.provide("oplMcpApps", service);
  ctx.effect(() => () => service.dispose(), "opl-mcp-apps: view bindings");
}
