import { CodexWorkbenchProfile } from "@one-person-lab/opl-codex-agents/workbench-profile";

export const name = "opl-team-bots";
export const inject = ["oplStudioHostOptions", "oplCodexNative"];
export class CollaborationProfile extends CodexWorkbenchProfile {}

export function apply(ctx) {
  const service = new CollaborationProfile(ctx.oplStudioHostOptions, ctx.oplCodexNative);
  ctx.provide("oplTeamBots", service);
  ctx.effect(() => () => service.dispose(), "official collaboration application lifecycle");
}
