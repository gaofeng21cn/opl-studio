import { createWeixinChannelService } from "./service.mjs";

export { createWeixinChannelService };
export const name = "opl-channel-weixin";

export function apply(ctx) {
  const service = createWeixinChannelService();
  ctx.provide("oplWeixinChannel", service);
  ctx.effect(() => () => service.dispose(), "opl-channel-weixin: channel lifecycle");
}
