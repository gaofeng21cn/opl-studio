import { OplCodexNative } from "./service.mjs";
export { OplCodexNative };

export const name = "opl-codex-native";
export const inject = ["oplStudioHostOptions", "oplDshToolMcp"];

export function apply(ctx) {
  const service = new OplCodexNative({
    ...ctx.oplStudioHostOptions,
    dshToolMcp: ctx.oplDshToolMcp
  });
  ctx.provide("oplCodexNative", service);
  ctx.effect(() => () => service.close(), "opl-codex-native: app-server lifecycle");
}
