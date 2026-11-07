import { OplHostCore } from "./service.mjs";

export const name = "opl-host-core";
export const inject = ["oplStudioHostOptions", "oplCodexNative", "oplFrameworkBridge", "oplMcpApps"];

export function apply(ctx) {
  ctx.provide("oplHostCore", new OplHostCore({
    ...ctx.oplStudioHostOptions,
    codex: ctx.oplCodexNative,
    framework: ctx.oplFrameworkBridge,
    mcpApps: ctx.oplMcpApps,
    managedByDsh: true
  }));
}
