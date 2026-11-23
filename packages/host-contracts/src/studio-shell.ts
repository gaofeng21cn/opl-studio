import type { OplActionReceipt, OplActionRequest } from "./app-state";
import type { McpAppProps } from "./mcp-apps";
import type { ServiceRecoverySummary, WorkItemRuntimeProjection } from "./runtime-status";

export type OplStudioShellPanelFocus = {
  agentId?: string;
  projectId?: string;
  workItemId?: string;
  relativePath?: string;
};

export type OplStudioShellSnapshot = {
  locale: "zh" | "en";
  stateStatus: "loading" | "ready" | "error";
  stateError?: string;
  snapshotSource: "live" | "cached" | "none";
  snapshotCachedAt?: string;
  workItemRuntime?: WorkItemRuntimeProjection;
  serviceRecovery?: ServiceRecoverySummary;
  selectedWorkItemId?: string;
  currentThreadId?: string;
  mcpApps?: Omit<McpAppProps, "locale">;
  panelFocus?: OplStudioShellPanelFocus;
};

export type OplStudioShellService = {
  getSnapshot(): OplStudioShellSnapshot;
  subscribe(listener: () => void): () => void;
  refreshState(): Promise<unknown>;
  executeAction(request: OplActionRequest): Promise<OplActionReceipt>;
  openMaintenance(): void;
  openPrimaryView(panelId: string, focus?: OplStudioShellPanelFocus): void;
  openThread(threadId: string): Promise<string | null>;
  selectWorkItem(itemId: string): void;
  startConversationInWorkspace(workspacePath: string): void;
};
