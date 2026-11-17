import { Context } from "@deepseek-ai/cordis";
import { createRoot } from "react-dom/client";
import {
  OPL_CLIENT_CONTRIBUTIONS_SERVICE,
  provideOplStudioClientContributions,
  type OplClientContributionsService
} from "./clientCordis";
import { OplStudioDshSlotHost } from "./dshSlotHost";
import { adoptEcosystemModuleSystem } from "../integrations/deepseek-harness/ecosystemClients";
import { McpAppsClientContext } from "./mcpAppsClient";
import "../integrations/deepseek-harness/theme";

export type { UiRendererService as OplStudioUiRenderer } from "../vendor/deepseek-harness/packages/client/ui-renderer/src/client/index.ts";

export const name = "opl-studio-client";

export const inject = ["oplMcpAppsClient"];

export function apply(ctx: Context) {
  const webLoader = ctx.get("loader") as { internal?: unknown } | undefined;
  adoptEcosystemModuleSystem(ctx.get("modules") ?? webLoader?.internal);
  const contributions = provideOplStudioClientContributions(ctx);
  const slotHost = new OplStudioDshSlotHost(ctx, contributions);
  ctx.effect(() => slotHost.installWorkspaceClient());
  ctx.provide("uiRenderer", {
    mount(container: HTMLElement) {
      const root = createRoot(container);
      const mcpApps = ctx.get("oplMcpAppsClient") as import("./mcpAppsClient").OplMcpAppsClient;
      root.render(<McpAppsClientContext.Provider value={mcpApps}>{slotHost.renderRoot()}</McpAppsClientContext.Provider>);
      return () => root.unmount();
    }
  });
}

export const oplStudioClientPlugin = { name, inject, apply };
