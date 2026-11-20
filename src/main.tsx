import { AppWebEntry } from "@deepseek-ai/dsh-client-web";
import type { OplStudioSurface } from "@gaofeng21cn/opl-host-contracts";
import { installWebTransport } from "./bridge/webTransport";
import { bootDesktopDshClient } from "./composition/dshClientModuleRuntime";

declare global {
  interface Window { oplStudio?: OplStudioSurface; }
}

const desktopTransportInstalled = Boolean(window.oplStudio);
document.documentElement.dataset.oplHost = desktopTransportInstalled ? "desktop" : "web";
if (!desktopTransportInstalled && window.location.protocol !== "file:") installWebTransport();
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("missing #root renderer mount");
if (desktopTransportInstalled || window.location.protocol === "file:") {
  void bootDesktopDshClient(rootElement).catch(error => {
    console.error(error);
    rootElement.textContent = `OPL client boot failed: ${String(error?.message ?? error)}`;
  });
} else {
  void new AppWebEntry(rootElement).run();
}
