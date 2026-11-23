import type {
  OplActionReceipt,
  OplActionRequest,
  OplStudioShellPanelFocus,
  OplStudioShellService,
  OplStudioShellSnapshot
} from "@gaofeng21cn/opl-host-contracts";

export type StudioShellCommandHandlers = {
  refreshState(): Promise<unknown>;
  executeAction(request: OplActionRequest): Promise<OplActionReceipt>;
  openMaintenance(): void;
  openPrimaryView(panelId: string, focus?: OplStudioShellPanelFocus): void;
  openThread(threadId: string): Promise<string | null>;
  selectWorkItem(itemId: string): void;
  startConversationInWorkspace(workspacePath: string): void;
};

const initialSnapshot: OplStudioShellSnapshot = {
  locale: "zh",
  stateStatus: "loading",
  snapshotSource: "none"
};

export type StudioShellStore = OplStudioShellService & {
  updateSnapshot(next: OplStudioShellSnapshot): void;
  setHandlers(next: StudioShellCommandHandlers): void;
};

/**
 * Reactive Cordis bridge service exposing App-owned runtime state and
 * navigation commands to independent Tier 2 DSH client plugins.
 */
export function createStudioShellStore(): StudioShellStore {
  let snapshot: OplStudioShellSnapshot = initialSnapshot;
  let handlers: StudioShellCommandHandlers = {
    refreshState: async () => null,
    executeAction: async () => {
      throw new Error("OPL Studio shell is not ready");
    },
    openMaintenance: () => undefined,
    openPrimaryView: () => undefined,
    openThread: async () => null,
    selectWorkItem: () => undefined,
    startConversationInWorkspace: () => undefined
  };
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateSnapshot(next) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    setHandlers(next) {
      handlers = next;
    },
    refreshState: () => handlers.refreshState(),
    executeAction: (request) => handlers.executeAction(request),
    openMaintenance: () => handlers.openMaintenance(),
    openPrimaryView: (panelId, focus) => handlers.openPrimaryView(panelId, focus),
    openThread: (threadId) => handlers.openThread(threadId),
    selectWorkItem: (itemId) => handlers.selectWorkItem(itemId),
    startConversationInWorkspace: (workspacePath) => handlers.startConversationInWorkspace(workspacePath)
  };
}
