import { OplFrameworkBridge } from "./service.mjs";
export { OplFrameworkBridge };
export { createOplPassthrough } from "./opl-passthrough.mjs";

export const name = "opl-framework-bridge";
export const inject = ["oplStudioHostOptions", "oplCodexNative"];

export function apply(ctx) {
  const service = new OplFrameworkBridge({
    ...ctx.oplStudioHostOptions,
    codex: ctx.oplCodexNative
  });
  ctx.provide("oplFrameworkBridge", service);
  ctx.effect(() => () => service.close(), "opl-framework-bridge: provider lifecycle");
}
