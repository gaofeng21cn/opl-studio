const { contextBridge, ipcRenderer, webUtils } = require("electron");

const invoke = (method, payload = {}) => ipcRenderer.invoke("opl:invoke", { method, payload });
const subscriptions = new Map();

function subscribeEvents(listener) {
  const wrapped = (_event, payload) => listener(payload);
  subscriptions.set(listener, wrapped);
  ipcRenderer.on("opl:event", wrapped);
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
    codexInstall: true,
    modelAccessSecretInput: true
  },
  beginWindowDrag: () => invoke("beginWindowDrag"),
  retryDesktopHost: () => invoke("retryDesktopHost"),
  readState: (profile = "fast") => invoke("readState", { profile }),
  readInitialize: () => invoke("readInitialize"),
  readFullDrilldown: () => invoke("readFullDrilldown"),
  readDomainDetailView: (request) => invoke("readDomainDetailView", request),
  readContribution: (request) => invoke("readContribution", request),
  executeAction: (request) => invoke("executeAction", request),
  readCodexModels: () => invoke("readCodexModels"),
  readCodexCapabilities: (threadId) => invoke("readCodexCapabilities", { threadId }),
  readCodexPermissionProfiles: () => invoke("readCodexPermissionProfiles"),
  listPendingServerRequests: () => invoke("listPendingServerRequests"),
  respondToServerRequest: (request) => invoke("respondToServerRequest", request),
  pickFiles: () => invoke("pickFiles"),
  pickDirectory: () => invoke("pickDirectory"),
  resolveDroppedInputs: (files) => invoke("classifyInputPaths", {
    paths: Array.from(files ?? []).map((file) => webUtils.getPathForFile(file)).filter(Boolean)
  }),
  releaseInputs: (cleanupTokens) => invoke("releaseInputs", { cleanupTokens }),
  notifyCompletion: (request) => invoke("notifyCompletion", request),
  listThreadWorkspace: (request) => invoke("listThreadWorkspace", request),
  readThreadWorkspaceFile: (request) => invoke("readThreadWorkspaceFile", request),
  searchThreadWorkspace: (request) => invoke("searchThreadWorkspace", request),
  setLogDirectory: (request) => invoke("setLogDirectory", request),
  sendMessage: (request) => invoke("sendMessage", request),
  steerTurn: (request) => invoke("steerTurn", request),
  interruptTurn: (request) => invoke("interruptTurn", request),
  loginGatewayAccount: (request) => invoke("loginGatewayAccount", request),
  configureCodexApiKey: (request) => invoke("configureCodexApiKey", request),
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
