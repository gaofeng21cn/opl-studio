import { readRuntimeProfile } from "../workbench/settingsModel";
import { OPL_COMMANDS, CODEX_APP_SERVER } from "./oplBridge-commands";
import { asRecord, asString } from "./oplBridge-primitives";
import {
  defaultFullDrilldown,
  defaultStateReadback,
  normalizeProfile,
  normalizeFullDrilldownReadback,
  normalizeInitializeReadback,
  normalizeStateReadback
} from "./oplBridge-normalizers-state";
import {
  normalizeCarrierDiagnostics,
  nativeUpdaterPlaceholder,
  unsupportedLogDirectoryUpdate
} from "./oplBridge-normalizers-platform";
import { normalizeCodexThread, normalizeThreadListResult } from "./oplBridge-normalizers-threads";
import { createPlaceholderDomainDetailViewReadback, normalizeContributionReadback, normalizeDomainDetailViewReadback } from "./oplBridge-normalizers-domain";
import { createPlaceholderActionReceipt, normalizeActionReceipt } from "./oplBridge-normalizers-action";
import { normalizeCodexCapabilityCatalog, normalizeCodexModelCatalog, normalizeCodexPermissionProfileCatalog, normalizePickedInputs, normalizeSendMessageResponse } from "./oplBridge-normalizers-codex";
import { normalizeBridgeEvent } from "./oplBridge-normalizers-events";
import type { OplBridge, OplStudioSurface } from "./oplBridge-types-platform-events";
import type { ThreadWorkspaceGit } from "./oplBridge-types-codex-workspace";
import type {
  SetArchivedRequest,
  ThreadForkRequest,
  ThreadListRequest,
  ThreadReadRequest,
  ThreadResumeRequest
} from "../threads/types";

export * from "./oplBridge-types-state";
export * from "./oplBridge-types-codex-workspace";
export * from "./oplBridge-types-platform-events";

export {
  OPL_COMMANDS,
  CODEX_APP_SERVER,
  buildDomainDetailViewCommandArgs,
  buildDomainDetailViewCommand,
  buildActionCommandArgs,
  buildActionCommand
} from "./oplBridge-commands";
export { normalizeCarrierDiagnostics } from "./oplBridge-normalizers-platform";
export { normalizeInitializeReadback, normalizeStateReadback, readStartupState, normalizeFullDrilldownReadback } from "./oplBridge-normalizers-state";
export { normalizeCodexThread, normalizeThreadListResult } from "./oplBridge-normalizers-threads";
export { normalizeContributionReadback, createPlaceholderDomainDetailViewReadback, normalizeDomainDetailViewReadback } from "./oplBridge-normalizers-domain";
export { projectedActionStatus, normalizeActionReceipt } from "./oplBridge-normalizers-action";
export { normalizeCodexModelCatalog, normalizeCodexCapabilityCatalog, normalizeCodexPermissionProfileCatalog, normalizeSendMessageResponse } from "./oplBridge-normalizers-codex";
export { normalizeBridgeEvent, parseEventSourceMessage } from "./oplBridge-normalizers-events";

export function createBrowserBridge(): OplBridge {
  const candidate = ((globalThis as Record<string, unknown>).window as { oplStudio?: OplStudioSurface } | undefined)
    ?.oplStudio;
  return {
    platformCapabilities: {
      workspaceRootSelection: candidate?.platformCapabilities?.workspaceRootSelection === true,
      nativeWorkspaceFileAccess: candidate?.platformCapabilities?.nativeWorkspaceFileAccess === true,
      codexInstall: candidate?.platformCapabilities?.codexInstall === true,
      modelAccessSecretInput: candidate?.platformCapabilities?.modelAccessSecretInput === true
    },
    beginWindowDrag() {
      candidate?.beginWindowDrag?.();
    },
    retryDesktopHost() {
      return Promise.resolve(candidate?.retryDesktopHost?.()).then(() => undefined);
    },
    readState(profile = readRuntimeProfile()) {
      const normalizedProfile = normalizeProfile(profile);
      const promise = candidate?.readState?.(normalizedProfile) ?? Promise.resolve(defaultStateReadback(normalizedProfile));
      return Promise.resolve(promise).then((value) => normalizeStateReadback(value, normalizedProfile));
    },
    readInitialize() {
      const promise = candidate?.readInitialize?.() ?? Promise.resolve({
        system_initialize: { setup_flow: { is_first_run: false, ready_to_launch: true } },
        readback: {
          command: "opl system initialize --json",
          commandArgs: ["system", "initialize", "--json"],
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false
        }
      });
      return Promise.resolve(promise).then(normalizeInitializeReadback);
    },
    readFullDrilldown() {
      const promise = candidate?.readFullDrilldown?.() ?? Promise.resolve(defaultFullDrilldown());
      return Promise.resolve(promise).then(normalizeFullDrilldownReadback);
    },
    readContribution(request) {
      if (!candidate?.readContribution) {
        return Promise.reject(new Error("OPL contribution reads are unavailable in this host"));
      }
      return Promise.resolve(candidate.readContribution(request)).then((value) => normalizeContributionReadback(value, request));
    },
    readDomainDetailView(request) {
      const reader = candidate?.readDomainDetailView;
      const promise = typeof reader === "function"
        ? reader(request)
        : Promise.resolve(createPlaceholderDomainDetailViewReadback(request));
      return Promise.resolve(promise)
        .then((value) => typeof reader === "function"
          ? normalizeDomainDetailViewReadback(value, request)
          : value)
        .catch((error) => createPlaceholderDomainDetailViewReadback(
          request,
          error instanceof Error ? error.message : String(error)
        ));
    },
    executeAction(request) {
      const promise = candidate?.executeAction?.(request) ?? Promise.resolve(createPlaceholderActionReceipt(request));
      return Promise.resolve(promise).then((value) => normalizeActionReceipt(value, request));
    },
    listMcpApps: request => candidate?.listMcpApps?.(request) ?? Promise.reject(new Error("MCP Apps are unavailable in this host")),
    openMcpApp: request => candidate?.openMcpApp?.(request) ?? Promise.reject(new Error("MCP Apps are unavailable in this host")),
    callMcpAppTool: request => candidate?.callMcpAppTool?.(request) ?? Promise.reject(new Error("MCP Apps are unavailable in this host")),
    readMcpAppResource: request => candidate?.readMcpAppResource?.(request) ?? Promise.reject(new Error("MCP Apps are unavailable in this host")),
    closeMcpApp: request => candidate?.closeMcpApp?.(request) ?? Promise.reject(new Error("MCP Apps are unavailable in this host")),
    readCodexModels() {
      const promise = candidate?.readCodexModels?.() ?? Promise.resolve({ models: [], simulated: true });
      return Promise.resolve(promise).then(normalizeCodexModelCatalog);
    },
    readCodexCapabilities(threadId) {
      const promise = candidate?.readCodexCapabilities?.(threadId) ?? Promise.resolve({ simulated: true });
      return Promise.resolve(promise).then(normalizeCodexCapabilityCatalog);
    },
    readCodexPermissionProfiles() {
      const promise = candidate?.readCodexPermissionProfiles?.() ?? Promise.resolve({
        data: [
          { id: ":danger-full-access", allowed: true },
          { id: ":workspace", allowed: true },
          { id: ":read-only", allowed: true }
        ],
        simulated: true
      });
      return Promise.resolve(promise).then(normalizeCodexPermissionProfileCatalog);
    },
    listPendingServerRequests() {
      const promise = candidate?.listPendingServerRequests?.() ?? Promise.resolve([]);
      return Promise.resolve(promise).then((value) => Array.isArray(value) ? value.flatMap((item) => {
        const record = asRecord(item);
        const id = record?.id;
        const method = asString(record?.method);
        const params = asRecord(record?.params);
        return (typeof id === "string" || typeof id === "number") && method && params ? [{ id, method, params }] : [];
      }) : []);
    },
    respondToServerRequest(request) {
      if (!candidate?.respondToServerRequest) return Promise.reject(new Error("Codex server-request responses are unavailable in this host"));
      return Promise.resolve(candidate.respondToServerRequest(request)).then((value) => {
        const record = asRecord(value);
        return {
          id: (typeof record?.id === "string" || typeof record?.id === "number") ? record.id : request.id,
          accepted: record?.accepted === true
        };
      });
    },
    pickFiles() {
      const promise = candidate?.pickFiles?.() ?? Promise.resolve([]);
      return Promise.resolve(promise).then(normalizePickedInputs);
    },
    pickDirectory() {
      const promise = candidate?.pickDirectory?.() ?? Promise.resolve([]);
      return Promise.resolve(promise).then(normalizePickedInputs);
    },
    resolveDroppedInputs(files) {
      const promise = candidate?.resolveDroppedInputs?.(files) ?? Promise.resolve([]);
      return Promise.resolve(promise).then(normalizePickedInputs);
    },
    releaseInputs(cleanupTokens) {
      return Promise.resolve(candidate?.releaseInputs?.(cleanupTokens)).then(() => undefined);
    },
    notifyCompletion(request) {
      return Promise.resolve(candidate?.notifyCompletion?.(request)).then(() => undefined);
    },
    listThreadWorkspace(request) {
      if (!candidate?.listThreadWorkspace) {
        return Promise.reject(new Error("Thread workspace browsing is unavailable in this host"));
      }
      return candidate.listThreadWorkspace(request);
    },
    readThreadWorkspaceGit(request) {
      if (!candidate?.readThreadWorkspaceGit) return Promise.reject(new Error("Git preview is unavailable in this host"));
      return candidate.readThreadWorkspaceGit(request);
    },
    readThreadWorkspaceBytes(request) {
      if (!candidate?.readThreadWorkspaceBytes) return Promise.reject(new Error("Workspace byte access is unavailable in this host"));
      return candidate.readThreadWorkspaceBytes(request);
    },
    readThreadWorkspaceFile(request) {
      if (!candidate?.readThreadWorkspaceFile) {
        return Promise.reject(new Error("Thread workspace file preview is unavailable in this host"));
      }
      return candidate.readThreadWorkspaceFile(request);
    },
    accessThreadWorkspace(request) {
      if (!candidate?.accessThreadWorkspace) return Promise.reject(new Error("Workspace file actions are unavailable in this host"));
      return candidate.accessThreadWorkspace(request);
    },
    searchThreadWorkspace(request) {
      if (!candidate?.searchThreadWorkspace) {
        return Promise.reject(new Error("Thread workspace search is unavailable in this host"));
      }
      return candidate.searchThreadWorkspace(request);
    },
    openLogDirectory() {
      return candidate?.openLogDirectory?.() ?? Promise.reject(new Error("Log folder access is unavailable in this host"));
    },
    setLogDirectory(request) {
      return candidate?.setLogDirectory?.(request) ?? Promise.resolve(unsupportedLogDirectoryUpdate());
    },
    sendMessage(request) {
      const promise = candidate?.sendMessage?.(request) ?? Promise.resolve({
        command: CODEX_APP_SERVER.transport,
        initialize: CODEX_APP_SERVER.initialize,
        threadStart: CODEX_APP_SERVER.threadStart,
        turnStart: CODEX_APP_SERVER.turnStart,
        resume: CODEX_APP_SERVER.resume,
        turnStarted: CODEX_APP_SERVER.turnStarted,
        streamEvent: CODEX_APP_SERVER.streamEvent,
        itemCompleted: CODEX_APP_SERVER.itemCompleted,
        turnCompleted: CODEX_APP_SERVER.turnCompleted,
        threadId: request.threadId ?? "simulated-thread",
        turnId: "simulated-turn",
        finalMessage: "Preview-only browser placeholder reply. Native bridge unavailable.",
        eventCount: 4,
        completed: {
          turn: {
            id: "simulated-turn",
            status: "preview_only"
          }
        },
        permissions: request.permissions ?? CODEX_APP_SERVER.defaultPermissions,
        approvalPolicy: CODEX_APP_SERVER.approvalPolicy,
        prompt: request.prompt,
        executor: "codex_app_server",
        simulated: true
      });
      return Promise.resolve(promise).then((value) => normalizeSendMessageResponse(value, request));
    },
    steerTurn(request) {
      if (!candidate?.steerTurn) {
        return Promise.reject(new Error("Codex turn/steer is unavailable in this host"));
      }
      return candidate.steerTurn(request);
    },
    interruptTurn(request) {
      if (!candidate?.interruptTurn) {
        return Promise.reject(new Error("Codex turn/interrupt is unavailable in this host"));
      }
      return candidate.interruptTurn(request);
    },
    loginGatewayAccount(request) {
      if (!candidate?.loginGatewayAccount) {
        return Promise.resolve({ ok: false, errorCode: "gateway_account_failed", stateRefreshRequired: false });
      }
      return candidate.loginGatewayAccount(request);
    },
    configureCodexApiKey(request) {
      if (!candidate?.configureCodexApiKey) {
        return Promise.resolve({ ok: false, errorCode: "codex_configuration_failed", stateRefreshRequired: false });
      }
      return candidate.configureCodexApiKey(request);
    },
    readNativeAppUpdateStatus() {
      return candidate?.readNativeAppUpdateStatus?.() ?? Promise.resolve(nativeUpdaterPlaceholder("status"));
    },
    checkNativeAppUpdate() {
      return candidate?.checkNativeAppUpdate?.() ?? Promise.resolve(nativeUpdaterPlaceholder("check"));
    },
    applyNativeAppUpdate() {
      return candidate?.applyNativeAppUpdate?.() ?? Promise.resolve(nativeUpdaterPlaceholder("apply"));
    },
    restartNativeApp() {
      return candidate?.restartNativeApp?.() ?? Promise.resolve(nativeUpdaterPlaceholder("restart"));
    },
    listThreads(request: ThreadListRequest = {}) {
      const promise = candidate?.listThreads?.(request) ?? Promise.resolve({ data: [], nextCursor: null });
      return Promise.resolve(promise).then(normalizeThreadListResult);
    },
    readThread(request: ThreadReadRequest) {
      const promise = candidate?.readThread?.(request) ?? Promise.resolve({
        id: request.threadId,
        status: { type: "notLoaded" },
        sessionId: request.threadId,
        projectKey: null,
        isTemporaryWorkspace: false,
        summary: "",
        workspace: "",
        archived: false,
        parentThreadId: null,
        createdAt: 0,
        updatedAt: 0,
        turns: []
      });
      return Promise.resolve(promise).then(normalizeCodexThread);
    },
    resumeThread(request: ThreadResumeRequest) {
      const promise = candidate?.resumeThread?.(request) ?? Promise.resolve({
        id: request.threadId,
        status: { type: "notLoaded" },
        sessionId: request.threadId,
        projectKey: null,
        isTemporaryWorkspace: false,
        summary: "",
        workspace: "",
        archived: false,
        parentThreadId: null,
        createdAt: 0,
        updatedAt: 0,
        turns: []
      });
      return Promise.resolve(promise).then(normalizeCodexThread);
    },
    forkThread(request: ThreadForkRequest) {
      const promise = candidate?.forkThread?.(request) ?? Promise.resolve({
        id: "",
        status: { type: "notLoaded" },
        sessionId: "",
        projectKey: null,
        isTemporaryWorkspace: false,
        summary: "",
        workspace: "",
        archived: false,
        parentThreadId: null,
        createdAt: 0,
        updatedAt: 0,
        turns: []
      });
      return Promise.resolve(promise).then(normalizeCodexThread);
    },
    renameThread(request: { threadId: string; name: string }) {
      if (!candidate?.renameThread) return Promise.reject(new Error("thread/name/set is unavailable in this host"));
      return Promise.resolve(candidate.renameThread(request)).then(normalizeCodexThread);
    },
    deleteThread(request: { threadId: string; confirmed?: boolean; confirmationId?: string }) {
      if (!candidate?.deleteThread) return Promise.reject(new Error("thread/delete is unavailable in this host"));
      return Promise.resolve(candidate.deleteThread(request)).then((value) => ({
        threadId: request.threadId,
        deleted: asRecord(value)?.deleted === true
      }));
    },
    setArchived(request: SetArchivedRequest) {
      const promise = candidate?.setArchived?.(request) ?? Promise.resolve(request);
      return Promise.resolve(promise).then(() => ({ threadId: request.threadId, archived: request.archived }));
    },
    subscribeEvents(onEvent) {
      if (candidate?.subscribeEvents) {
        return candidate.subscribeEvents((event) => onEvent(normalizeBridgeEvent(event, "native_bridge")));
      }
      onEvent(normalizeBridgeEvent({ type: "bridge.preview_only", source: "browser-placeholder" }, "browser-placeholder"));
      return () => undefined;
    }
  };
}
