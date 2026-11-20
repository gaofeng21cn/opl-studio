import type { OplBridge } from "./platform-events";

export type McpAppDescriptor = {
  miniAppId: string;
  server: string;
  tool: string;
  launchTool?: string;
  tools?: string[];
  title: string;
  description: string;
  resourceUri: string;
  inputSchema: {
    properties?: Record<string, { type?: string; title?: string; description?: string; default?: unknown }>;
    required?: string[];
  };
  readOnly: boolean;
  readiness: "ready" | "input_required" | "replay_only";
};

export type McpAppOpen = {
  threadId: string;
  server: string;
  tool: string;
  miniAppId?: string;
  arguments?: Record<string, unknown>;
  callId?: string;
};

export type McpAppBinding = { id: string; threadId: string };

export type McpAppSession = McpAppBinding & {
  miniAppId: string;
  server: string;
  tool: string;
  title: string;
  arguments: Record<string, unknown>;
  result: any;
  resource: { uri: string; mimeType: string; text: string; _meta?: any };
  resources: { uri: string; name: string; mimeType?: string; [key: string]: unknown }[];
};

export type McpAppsBridge = {
  listMcpApps(request: { threadId?: string }): Promise<{ apps: McpAppDescriptor[] }>;
  openMcpApp(request: McpAppOpen): Promise<McpAppSession>;
  callMcpAppTool(request: McpAppBinding & { name: string; arguments?: Record<string, unknown> }): Promise<any>;
  readMcpAppResource(request: McpAppBinding & { uri: string }): Promise<any>;
  closeMcpApp(request: McpAppBinding): Promise<{ closed: boolean }>;
};

export type McpAppProps = {
  bridge: McpAppsBridge & Partial<Pick<OplBridge, "readThread" | "listThreadWorkspace" | "readThreadWorkspaceBytes" | "accessThreadWorkspace" | "platformCapabilities">>; launch?: McpAppOpen; threadId?: string; locale: "zh" | "en"; revision?: number;
  preferredEntry?: { resourceUri: string; arguments: Record<string, string> };
  onPreferredEntryConsumed?: (entry: NonNullable<McpAppProps["preferredEntry"]>) => void;
  onManage?: () => void;
  onConversation?: () => void;
  onContext(threadId: string, context: string): void;
  onMessage(threadId: string, text: string): void;
};
