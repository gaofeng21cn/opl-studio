export type McpAppDescriptor = {
  server: string; tool: string; title: string; description: string; resourceUri: string;
  inputSchema: { properties?: Record<string, { type?: string; title?: string; description?: string; default?: unknown }>; required?: string[] };
  readOnly: boolean;
};
export type McpAppOpen = { threadId: string; server: string; tool: string; arguments?: Record<string, unknown>; callId?: string };
export type McpAppBinding = { id: string; threadId: string };
export type McpAppSession = McpAppBinding & {
  server: string; tool: string; title: string; arguments: Record<string, unknown>;
  result: any; resource: { uri: string; mimeType: string; text: string; _meta?: any };
  resources: { uri: string; name: string; mimeType?: string; [key: string]: unknown }[];
};
export type McpAppsBridge = {
  listMcpApps(request: { threadId?: string }): Promise<{ apps: McpAppDescriptor[] }>;
  openMcpApp(request: McpAppOpen): Promise<McpAppSession>;
  callMcpAppTool(request: McpAppBinding & { name: string; arguments?: Record<string, unknown> }): Promise<any>;
  readMcpAppResource(request: McpAppBinding & { uri: string }): Promise<any>;
  closeMcpApp(request: McpAppBinding): Promise<{ closed: boolean }>;
};
