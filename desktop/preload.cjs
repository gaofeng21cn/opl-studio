const { contextBridge, ipcRenderer, webUtils } = require("electron");

const invoke = (method, payload = {}) => ipcRenderer.invoke("opl:invoke", { method, payload });
const subscriptions = new Map();
let pendingDeepLinksRequested = false;
const NATIVE_THEME_SOURCE_ATTRIBUTE = "data-ds-theme-source";
const NATIVE_THEME_SOURCE_CHANNEL = "opl:native-theme-source";

function markDocumentPlatform() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const mark = () => {
    if (document.documentElement) document.documentElement.dataset.platform = process.platform;
  };
  if (document.documentElement) mark();
  else window.addEventListener("DOMContentLoaded", mark, { once: true });
}

markDocumentPlatform();
function syncNativeThemeSource() {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  const root = document.documentElement;
  if (!root) return;
  let sent;
  const send = () => {
    const source = root.getAttribute(NATIVE_THEME_SOURCE_ATTRIBUTE);
    if ((source !== "light" && source !== "dark" && source !== "system") || source === sent) return;
    sent = source;
    ipcRenderer.send(NATIVE_THEME_SOURCE_CHANNEL, source);
  };
  new MutationObserver(send).observe(root, {
    attributes: true,
    attributeFilter: [NATIVE_THEME_SOURCE_ATTRIBUTE]
  });
  send();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", syncNativeThemeSource, { once: true });
  else syncNativeThemeSource();
}

if (typeof document !== "undefined") ipcRenderer.on("opl:window-fullscreen", (_event, fullscreen) => {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const mark = () => {
    if (!document.documentElement) return;
    if (fullscreen) document.documentElement.dataset.fullscreen = "true";
    else delete document.documentElement.dataset.fullscreen;
  };
  if (document.documentElement) mark();
  else window.addEventListener("DOMContentLoaded", mark, { once: true });
});

function subscribeEvents(listener) {
  const wrapped = (_event, payload) => listener(payload);
  subscriptions.set(listener, wrapped);
  ipcRenderer.on("opl:event", wrapped);
  if (!pendingDeepLinksRequested) {
    pendingDeepLinksRequested = true;
    void invoke("readPendingDeepLinks").then((pending) => {
      if (!Array.isArray(pending)) return;
      for (const payload of pending) {
        for (const subscriber of subscriptions.values()) subscriber(null, { method: "desktop/deep-link", params: payload });
      }
    }).catch(() => { pendingDeepLinksRequested = false; });
  }
  return () => {
    const active = subscriptions.get(listener);
    if (active) ipcRenderer.removeListener("opl:event", active);
    subscriptions.delete(listener);
  };
}

contextBridge.exposeInMainWorld("oplStudio", {
  eventSourceUrl: "electron://opl",
  platformCapabilities: {
    workspaceRootSelection: true,
    nativeWorkspaceFileAccess: true,
    codexInstall: true,
    modelAccessSecretInput: true,
    connectionAccessApproval: true
  },
  requestSettingsSearchLog: request => invoke("requestSettingsSearchLog", request),
  beginWindowDrag: () => invoke("beginWindowDrag"),
  retryDesktopHost: () => invoke("retryDesktopHost"),
  readState: (profile = "fast") => invoke("readState", { profile }),
  readInitialize: () => invoke("readInitialize"),
  readFullDrilldown: () => invoke("readFullDrilldown"),
  readDomainDetailView: (request) => invoke("readDomainDetailView", request),
  readContribution: (request) => invoke("readContribution", request),
  executeAction: (request) => invoke("executeAction", request),
  listMcpApps: request => invoke("listMcpApps", request),
  openMcpApp: request => invoke("openMcpApp", request),
  callMcpAppTool: request => invoke("callMcpAppTool", request),
  readMcpAppResource: request => invoke("readMcpAppResource", request),
  closeMcpApp: request => invoke("closeMcpApp", request),
  readCodexModels: () => invoke("readCodexModels"),
  readCodexCapabilities: (threadId) => invoke("readCodexCapabilities", { threadId }),
  readCodexPermissionProfiles: () => invoke("readCodexPermissionProfiles"),
  listPendingServerRequests: () => invoke("listPendingServerRequests"),
  respondToServerRequest: (request) => invoke("respondToServerRequest", request),
  pickFiles: () => invoke("pickFiles"),
  pickDirectory: () => invoke("pickDirectory"),
  revealLocalPath: (request) => invoke("revealLocalPath", request),
  resolveDroppedInputs: (files) => invoke("classifyInputPaths", {
    paths: Array.from(files ?? []).map((file) => webUtils.getPathForFile(file)).filter(Boolean)
  }),
  releaseInputs: (cleanupTokens) => invoke("releaseInputs", { cleanupTokens }),
  notifyCompletion: (request) => invoke("notifyCompletion", request),
  listThreadWorkspace: (request) => invoke("listThreadWorkspace", request),
  readThreadWorkspaceGit: (request) => invoke("readThreadWorkspaceGit", request),
  readThreadWorkspaceBytes: (request) => invoke("readThreadWorkspaceBytes", request),
  readThreadWorkspaceFile: (request) => invoke("readThreadWorkspaceFile", request),
  accessThreadWorkspace: (request) => invoke("accessThreadWorkspace", request),
  searchThreadWorkspace: (request) => invoke("searchThreadWorkspace", request),
  openLogDirectory: () => invoke("openLogDirectory"),
  setLogDirectory: (request) => invoke("setLogDirectory", request),
  sendMessage: (request) => invoke("sendMessage", request),
  steerTurn: (request) => invoke("steerTurn", request),
  interruptTurn: (request) => invoke("interruptTurn", request),
  loginGatewayAccount: (request) => invoke("loginGatewayAccount", request),
  configureCodexApiKey: (request) => invoke("configureCodexApiKey", request),
  approveConnectionAccess: (request) => invoke("approveConnectionAccess", request),
  readNativeAppUpdateStatus: () => invoke("readNativeAppUpdateStatus"),
  checkNativeAppUpdate: () => invoke("checkNativeAppUpdate"),
  applyNativeAppUpdate: () => invoke("applyNativeAppUpdate"),
  restartNativeApp: () => invoke("restartNativeApp"),
  listThreads: (request = {}) => invoke("listThreads", request),
  readThread: (request) => invoke("readThread", request),
  resumeThread: (request) => invoke("resumeThread", request),
  forkThread: (request) => invoke("forkThread", request),
  renameThread: (request) => invoke("renameThread", request),
  deleteThread: (request) => invoke("deleteThread", request),
  setArchived: (request) => invoke("setArchived", request),
  subscribeEvents,
  connectEvents: subscribeEvents
});
