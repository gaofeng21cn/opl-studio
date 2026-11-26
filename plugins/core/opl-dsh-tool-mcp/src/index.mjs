import { DshToolMcp } from "./service.mjs";

export const name = "opl-dsh-tool-mcp";
export const inject = ["webServer", "tools"];

export function apply(ctx) {
  const service = new DshToolMcp({
    context: ctx,
    webServer: ctx.webServer,
    tools: ctx.tools
  });
  ctx.provide("oplDshToolMcp", service);
  ctx.effect(() => service.activate(), "opl-dsh-tool-mcp: HTTP and session lifecycle");
}
