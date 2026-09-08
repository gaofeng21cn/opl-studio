import { Context } from "@deepseek-ai/cordis";
import { createRoot } from "react-dom/client";
import {
  OPL_CLIENT_CONTRIBUTIONS_SERVICE,
  provideOplStudioClientContributions,
  type OplClientContributionsService
} from "./clientCordis";
import { renderOplStudioRoot } from "./dshSlotHost";
import { adoptEcosystemModuleSystem } from "../integrations/deepseek-harness/ecosystemClients";

export type OplStudioUiRenderer = {
  mount(container: HTMLElement): () => void;
};

declare module "@deepseek-ai/cordis" {
  interface Context {
    uiRenderer: OplStudioUiRenderer;
  }
}

export const name = "opl-studio-client";

export function apply(ctx: Context) {
  const webLoader = ctx.get("loader") as { internal?: unknown } | undefined;
  adoptEcosystemModuleSystem(ctx.get("modules") ?? webLoader?.internal);
  const contributions = provideOplStudioClientContributions(ctx);
  ctx.provide("uiRenderer", {
    mount(container: HTMLElement) {
      const root = createRoot(container);
      root.render(renderOplStudioRoot(contributions));
      return () => root.unmount();
    }
  });
}

export const oplStudioClientPlugin = { name, apply };

export async function mountOplStudioClient(container: HTMLElement) {
  const ctx = new Context();
  const fiber = await ctx.plugin(oplStudioClientPlugin);
  const renderer = ctx.get("uiRenderer");
  const contributions = ctx.get(OPL_CLIENT_CONTRIBUTIONS_SERVICE) as OplClientContributionsService | undefined;
  if (!renderer || !contributions) {
    await ctx.fiber.dispose();
    throw new Error("opl-studio-client: plugin did not provide the renderer composition");
  }
  const unmount = renderer.mount(container);
  return async () => {
    unmount();
    await fiber.dispose();
    await ctx.fiber.dispose();
  };
}
