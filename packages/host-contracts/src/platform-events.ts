import type { SuperagentState } from "./superagent";
import type { TeamBotsState, TeamBotAction } from "./team-bots";
import type { McpAppsBridge } from "./mcp-apps";
import type {
  AppLogDirectoryUpdateResult,
  CarrierDiagnosticsReadback,
  OplActionRequest,
  OplActionReceipt,
  OplContributionReadRequest,
  OplContributionReadback,
  OplDomainDetailViewReadRequest,
  OplDomainDetailViewReadback,
  OplEventKind,
  OplFullDrilldownReadback,
  OplInitializeReadback,
  OplStateProfile,
  OplStateReadback
} from "./app-state";
import type {
  CodexApiKeyConfigurationResult,
  CodexCapabilityCatalog,
  CodexMessageRequest,
  CodexMessageResponse,
  CodexModelCatalog,
  CodexPendingServerRequest,
  CodexPermissionProfileCatalog,
  CodexPickedInput,
  ConnectionAccessApprovalResult,
  GatewayAccountLoginRequest,
  GatewayAccountLoginResult,
  ThreadWorkspaceAccessRequest,
  ThreadWorkspaceBytes,
  ThreadWorkspaceFile,
  ThreadWorkspaceGit,
  ThreadWorkspaceListing,
  ThreadWorkspaceSearch
} from "./codex-workspace";
import type {
  CodexThreadAdapterBridge,
  SetArchivedRequest,
  ThreadForkRequest,
  ThreadInterruptRequest,
  ThreadInterruptResult,
  ThreadListRequest,
  ThreadListResult,
  ThreadReadRequest,
  ThreadResumeRequest,
  ThreadSteerRequest,
  ThreadSteerResult
} from "./threads";

export type OplPlatformCapabilities = {
  workspaceRootSelection: boolean;
  nativeWorkspaceFileAccess?: boolean;
  codexInstall: boolean;
  modelAccessSecretInput: boolean;
  connectionAccessApproval: boolean;
};

export type NativeAppUpdateOperation = "status" | "check" | "apply" | "restart";
export type NativeAppUpdateResult = {
  schema: "opl_native_app_updater.v1";
  owner: "one-person-lab-app_native_host" | "one-person-lab-app_desktop_host";
  host: "electron" | "native" | "web" | "browser_placeholder";
  carrierAdapter?: "electron_desktop" | "standalone_headless_webui" | "docker_webui";
  operation: NativeAppUpdateOperation;
  supported: boolean;
  state:
    | "idle"
    | "checking"
    | "not-available"
    | "not_available"
    | "available"
    | "downloading"
    | "downloaded"
    | "applying"
    | "applied"
    | "installing"
    | "restart_scheduled"
    | "recreating"
    | "recreated"
    | "busy"
    | "cancelled"
    | "error"
    | "unsupported";
  currentVersion?: string;
  buildKind?: string;
  localBuildId?: string;
  automatic?: boolean;
  targetVersion?: string;
  progressPercent?: number;
  accepted?: boolean;
  restartRequired: boolean;
  reasonCode?: string;
  errorCode?: string;
  message?: string;
  ownerFallback?: "one-person-lab-app";
};


type BaseBridgeEvent = {
  source: string;
  eventKind: OplEventKind;
  summary: string;
  raw: unknown;
};

export type OplBridgeTypeEvent = BaseBridgeEvent & {
  type: string;
};

export type OplBridgeMethodEvent = BaseBridgeEvent & {
  method: string;
  params: Record<string, unknown>;
  turnId?: string;
  delta?: string;
  itemText?: string;
};

export type OplBridgeEvent = OplBridgeTypeEvent | OplBridgeMethodEvent;

export type SettingsSearchLogRequest = { method: "GET" | "POST"; count?: boolean; body?: string };
export type SettingsSearchLogResponse = { status: number; body: string };

export type DshClientModuleGraph = {
  rev: string;
  release?: { version: string; commit?: string };
  entries: Array<{ id: string; url: string; rev: string; inject?: string[]; external?: string[] }>;
  batches: Array<{ phase: "bootstrap" | "application"; url: string; rev: string; entries: string[] }>;
};
export type DshPluginUpdateProjection = {
  schema: "opl_dsh_plugin_updates.v1";
  profile: string;
  checkedAt: string;
  plugins: Record<string, { installed: string | null; available: string | null; state: "current" | "update_available" | "unavailable"; reason?: string }>;
};
export type DshPluginUpdateResult = Record<string, unknown> & { operation?: string; application?: string; installed?: Record<string, string>; failures?: Record<string, string> };

export type LinkPairedDevice = { id: string; name: string; createdAt: string; lastSeenAt: string; expiresAt: string };
export type LinkInternetStatus = { status: "disabled" | "account_required" | "connecting" | "reconnecting" | "ready" | "error"; reasonCode?: string };
export type LinkDeviceReadback = { schema: "opl_link_studio_wire.v2"; host?: { id: string; name: string }; endpoint?: string | null; internet?: LinkInternetStatus; devices: LinkPairedDevice[]; unavailable?: boolean };
export type LinkPairing = { schema: "opl_link_studio_wire.v2"; endpoint?: string; serverUrl?: string; accountScope?: string; hostDeviceId?: string; hostIdentityKey?: string; hostFingerprint?: string; code: string; expiresAt: string; pairingURL: string };
export type LinkCompanionManagement = {
  readDevices(): Promise<LinkDeviceReadback>;
  enableInternet(): Promise<LinkInternetStatus>;
  reconnectInternet(): Promise<LinkInternetStatus>;
  createPairing(request?: { endpoint?: string }): Promise<LinkPairing>;
  revokeDevice(request: { id: string }): Promise<{ id: string; revoked: boolean }>;
};

export type OplStudioSurface = Pick<
  OplBridge,
  keyof McpAppsBridge | "readSuperagent" | "executeSuperagent" | "readTeamBots" | "executeTeamBot" | "requestSettingsSearchLog" | "platformCapabilities" | "beginWindowDrag" | "readState" | "readInitialize" | "readFullDrilldown" | "readContribution" | "readDomainDetailView" | "executeAction" | "readCodexModels" | "readCodexCapabilities" | "readCodexPermissionProfiles" | "listPendingServerRequests" | "respondToServerRequest" | "pickFiles" | "pickDirectory" | "revealLocalPath" | "resolveDroppedInputs" | "releaseInputs" | "notifyCompletion" | "listThreadWorkspace" | "readThreadWorkspaceFile" | "readThreadWorkspaceGit" | "readThreadWorkspaceBytes" | "searchThreadWorkspace" | "accessThreadWorkspace" | "openLogDirectory" | "setLogDirectory" | "sendMessage" | "steerTurn" | "interruptTurn" | "loginGatewayAccount" | "configureCodexApiKey" | "approveConnectionAccess" | "readNativeAppUpdateStatus" | "checkNativeAppUpdate" | "applyNativeAppUpdate" | "restartNativeApp" | "subscribeEvents"
> & Partial<CodexThreadAdapterBridge> & {
  linkCompanion?: LinkCompanionManagement;
  eventSourceUrl?: string;
  readClientModuleGraph?: () => Promise<DshClientModuleGraph>;
  readClientModuleBoot?: () => Promise<import("@deepseek-ai/dsh-host-webserver").IndexInjection[]>;
  readDshPluginUpdates?: () => Promise<DshPluginUpdateProjection>;
  updateDshPlugins?: (request: { all?: boolean; packages?: string[] }) => Promise<DshPluginUpdateResult>;
  retryDesktopHost?: () => Promise<{ status: string }>;
  connectEvents?: (onEvent: (event: OplBridgeEvent) => void) => () => void;
};


export type OplBridge = CodexThreadAdapterBridge & McpAppsBridge & {
  platformCapabilities: OplPlatformCapabilities;
  readSuperagent(): Promise<SuperagentState>;
  executeSuperagent(request: { operation: "start" | "stop" }): Promise<SuperagentState>;
  readTeamBots(): Promise<TeamBotsState>;
  executeTeamBot(request: TeamBotAction): Promise<unknown>;
  requestSettingsSearchLog(request: SettingsSearchLogRequest): Promise<SettingsSearchLogResponse>;
  beginWindowDrag(): void;
  retryDesktopHost(): Promise<void>;
  readState(profile?: OplStateProfile): Promise<OplStateReadback>;
  readInitialize(): Promise<OplInitializeReadback>;
  readFullDrilldown(): Promise<OplFullDrilldownReadback>;
  readContribution(request: OplContributionReadRequest): Promise<OplContributionReadback>;
  readDomainDetailView(request: OplDomainDetailViewReadRequest): Promise<OplDomainDetailViewReadback>;
  executeAction(request: OplActionRequest): Promise<OplActionReceipt>;
  readCodexModels(): Promise<CodexModelCatalog>;
  readCodexCapabilities(threadId?: string): Promise<CodexCapabilityCatalog>;
  readCodexPermissionProfiles(): Promise<CodexPermissionProfileCatalog>;
  listPendingServerRequests(): Promise<CodexPendingServerRequest[]>;
  respondToServerRequest(request: { id: string | number; response: { result?: unknown; error?: { code: number; message: string } } }): Promise<{ id: string | number; accepted: boolean }>;
  pickFiles(): Promise<CodexPickedInput[]>;
  pickDirectory(): Promise<CodexPickedInput[]>;
  revealLocalPath(request: { path: string }): Promise<void>;
  resolveDroppedInputs(files: readonly File[]): Promise<CodexPickedInput[]>;
  releaseInputs(cleanupTokens: readonly string[]): Promise<void>;
  notifyCompletion(request: { threadId: string; turnId: string; title: string; body: string }): Promise<void>;
  listThreadWorkspace(request: { threadId: string; relativePath?: string }): Promise<ThreadWorkspaceListing>;
  readThreadWorkspaceGit(request: { threadId: string }): Promise<ThreadWorkspaceGit>;
  readThreadWorkspaceBytes(request: { threadId: string; relativePath: string; offset?: number; length?: number }): Promise<ThreadWorkspaceBytes>;
  readThreadWorkspaceFile(request: { threadId: string; relativePath: string }): Promise<ThreadWorkspaceFile>;
  accessThreadWorkspace(request: ThreadWorkspaceAccessRequest): Promise<{ accepted: boolean }>;
  searchThreadWorkspace(request: { threadId: string; query: string }): Promise<ThreadWorkspaceSearch>;
  openLogDirectory(): Promise<{ accepted: boolean }>;
  setLogDirectory(request: { path: string }): Promise<AppLogDirectoryUpdateResult>;
  sendMessage(request: CodexMessageRequest): Promise<CodexMessageResponse>;
  steerTurn(request: ThreadSteerRequest): Promise<ThreadSteerResult>;
  interruptTurn(request: ThreadInterruptRequest): Promise<ThreadInterruptResult>;
  loginGatewayAccount(request: GatewayAccountLoginRequest): Promise<GatewayAccountLoginResult>;
  configureCodexApiKey(request: { apiKey: string }): Promise<CodexApiKeyConfigurationResult>;
  approveConnectionAccess(request: { requestId: string }): Promise<ConnectionAccessApprovalResult>;
  readNativeAppUpdateStatus(): Promise<NativeAppUpdateResult>;
  checkNativeAppUpdate(): Promise<NativeAppUpdateResult>;
  applyNativeAppUpdate(): Promise<NativeAppUpdateResult>;
  restartNativeApp(): Promise<NativeAppUpdateResult>;
  subscribeEvents(onEvent: (event: OplBridgeEvent) => void): () => void;
};
