import "virtual:opl-client-runtime-policy";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/workbench/App";
import { StudioContext, useStudioRemoteAccess } from "../../src/composition/dshSlotHost-parts/studioContext";

function SessionAccess() {
  return <button disabled={!useStudioRemoteAccess("session/create")}>New session</button>;
}

function renderShell(surface: any) {
  (window as any).historyStartupSurface = surface;
  return <StudioContext.Provider value={surface}><div data-history-status={surface.threadDirectoryStatus} data-codex-status={surface.codexConnectionStatus}><SessionAccess />{surface.conversationBody}</div></StudioContext.Provider>;
}

createRoot(document.getElementById("root")!).render(<App detailTabs={[]} renderShell={renderShell} />);
