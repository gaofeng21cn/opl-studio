import { createContext, useContext } from "react";
import type { Context } from "@deepseek-ai/cordis";
import { McpAppWorkspace } from "./McpAppWorkspace";
import { McpTaskWorkbench } from "./McpTaskWorkbench";

export type McpAppsClient = { Workspace: typeof McpAppWorkspace; TaskWorkbench: typeof McpTaskWorkbench };
export const McpAppsClientContext = createContext<McpAppsClient | null>(null);
export const useMcpAppsClient = () => useContext(McpAppsClientContext);
export const mcpAppsClientPlugin = {
  name: "opl-mcp-apps-client",
  apply(ctx: Context) {
    ctx.provide("oplMcpAppsClient", { Workspace: McpAppWorkspace, TaskWorkbench: McpTaskWorkbench });
  }
};
