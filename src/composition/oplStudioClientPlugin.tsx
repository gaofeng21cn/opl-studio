import { McpAppsClientContext, mcpAppsClientPlugin, type McpAppsClient } from "../../plugins/opl-mcp-apps/src/client/plugin";
import { Context } from "@deepseek-ai/cordis";
import { createRoot } from "react-dom/client";
import {
  OPL_CLIENT_CONTRIBUTIONS_SERVICE,
  provideOplStudioClientContributions,
  type OplClientContributionsService
} from "./clientCordis";
import { installOplWorkspaceClient, renderOplStudioRoot } from "./dshSlotHost";
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

export const inject = ["oplMcpAppsClient"];

export function apply(ctx: Context) {
  const mcpApps = ctx.get("oplMcpAppsClient") as McpAppsClient;
  const webLoader = ctx.get("loader") as { internal?: unknown } | undefined;
  adoptEcosystemModuleSystem(ctx.get("modules") ?? webLoader?.internal);
  const contributions = provideOplStudioClientContributions(ctx);
  ctx.effect(() => installOplWorkspaceClient());
  ctx.provide("uiRenderer", {
    mount(container: HTMLElement) {
      const root = createRoot(container);
      root.render(<McpAppsClientContext.Provider value={mcpApps}>{renderOplStudioRoot(contributions)}</McpAppsClientContext.Provider>);
      return () => root.unmount();
    }
  });
}

export const oplStudioClientPlugin = { name, inject, apply };

export async function mountOplStudioClient(container: HTMLElement) {
  const ctx = new Context();
  await ctx.plugin(mcpAppsClientPlugin);
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
