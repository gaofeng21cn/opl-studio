import { mcpAppsClientPlugin } from "../plugins/opl-mcp-apps/src/client/plugin";
import { AppWebEntry } from "@deepseek-ai/dsh-client-web";
import "./integrations/deepseek-harness/theme";
import type { OplStudioSurface } from "./bridge/oplBridge";
import { installWebTransport } from "./bridge/webTransport";
import { mountOplStudioClient, oplStudioClientPlugin } from "./composition/oplStudioClientPlugin";

declare global {
  interface Window {
    oplStudio?: OplStudioSurface;
  }

  var __OPL_MCP_APPS_CLIENT__: typeof mcpAppsClientPlugin | undefined;
  var __OPL_STUDIO_CLIENT__: typeof oplStudioClientPlugin | undefined;
}

const desktopTransportInstalled = Boolean(window.oplStudio);
document.documentElement.dataset.oplHost = desktopTransportInstalled ? "desktop" : "web";

if (!desktopTransportInstalled && window.location.protocol !== "file:") {
  installWebTransport();
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("missing #root renderer mount");

globalThis.__OPL_MCP_APPS_CLIENT__ = mcpAppsClientPlugin;
globalThis.__OPL_STUDIO_CLIENT__ = oplStudioClientPlugin;

if (desktopTransportInstalled || window.location.protocol === "file:") {
  void mountOplStudioClient(rootElement);
} else {
  void new AppWebEntry(rootElement).run();
}
