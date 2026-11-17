import { createContext, useContext, type ComponentType } from "react";

export type OplMcpAppsClient = {
  Workspace: ComponentType<any>;
  TaskWorkbench: ComponentType<any>;
};

export const McpAppsClientContext = createContext<OplMcpAppsClient | null>(null);

export function useMcpAppsClient(): OplMcpAppsClient | undefined {
  return useContext(McpAppsClientContext) ?? undefined;
}
