import type { Context } from "@deepseek-ai/cordis";
import { McpAppWorkspace } from "./McpAppWorkspace";
import { McpTaskWorkbench } from "./McpTaskWorkbench";
export { McpAppsClientContext, useMcpAppsClient } from "../../../../src/composition/mcpAppsClient";

export type McpAppsClient = { Workspace: typeof McpAppWorkspace; TaskWorkbench: typeof McpTaskWorkbench };
export const mcpAppsClientPlugin = {
  name: "opl-mcp-apps-client",
  apply(ctx: Context) {
    ctx.provide("oplMcpAppsClient", { Workspace: McpAppWorkspace, TaskWorkbench: McpTaskWorkbench });
  }
};
export default mcpAppsClientPlugin;
