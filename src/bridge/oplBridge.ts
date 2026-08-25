import { normalizeRuntimeProfile, readRuntimeProfile } from "../workbench/settingsModel";
import type {
  CodexThread,
  CodexThreadAdapterBridge,
  CodexThreadRuntimeStatus,
  CodexTurn,
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
} from "../threads/types";

export type OplStateProfile = "fast" | "full";

export type OplActionMode = "preview" | "execute" | "rollback";
export type OplActionReceiptKind = OplActionMode | "confirmation_required" | "blocked_read_only";
export type OplActionReceiptStatus =
  | "preview_ready"
  | "confirmation_required"
  | "blocked_read_only"
  | "executed"
  | "error"
  | "timed_out";
export type OplEventKind = "tool" | "process" | "diff" | "file" | "receipt" | "user_input" | "permission";

export type OplActionPayload = Record<string, unknown> & {
  confirmed?: boolean;
  confirmationId?: string;
  receiptId?: string;
  rollbackRef?: string;
};

export type OplCommandReadback = {
  command: string;
  commandArgs: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type OplRuntimeSource = Record<string, unknown> & {
  owner?: string;
  app_repo_truth_owner?: string;
  normal_gui_state_surface?: string;
  full_gui_state_surface?: string;
  action_boundary_surface?: string;
  full_drilldown_exception_surface?: string;
};

export type OplOperatorSummary = Record<string, unknown> & {
  runtime_status?: string;
  provider_status?: string;
};

export type OplOperatorRef = Record<string, unknown> & {
  label?: string;
  ref?: string;
  node_kind?: string;
};

export type OplModuleItem = Record<string, unknown> & {
  module_id?: string;
  label?: string;
  installed?: boolean;
  checkout_path?: string;
  repo_url?: string;
  health_status?: string;
};

export type OplActionDescriptor = Record<string, unknown> & {
  action_id: string;
  label: string;
  route: string;
  surface?: string;
  submit_via?: string;
  payload_fields: string[];
  mutates: string;
  dry_run_supported: boolean;
  confirmation_required?: boolean;
  danger_level?: string;
  owner: string;
  delegated_surface: string;
  can_submit_to_safe_action_shell: boolean;
  route_requires_domain_or_app_payload: boolean;
};

export type OplActiveProjectLine = Record<string, unknown> & {
  status: string;
  active_run_id: string;
  next_visible_step: string;
  progress_delta_classification: string;
  deliverable_progress_delta: string;
  platform_repair_delta: string;
  next_forced_delta: string;
};

export type OplAppState = Record<string, unknown> & {
  runtime_source: OplRuntimeSource;
  operator: {
    summary: OplOperatorSummary;
    refs: OplOperatorRef[];
    workbench?: Record<string, unknown>;
  };
  modules: {
    items: OplModuleItem[];
  };
  actions: OplActionDescriptor[];
  meta: {
    profile: OplStateProfile;
    generated_at: string;
  };
  provider: Record<string, unknown> & {
    status: string;
  };
  managed_companions: Record<string, unknown>[];
  active_project_lines: OplActiveProjectLine[];
  ui_contributions?: Record<string, unknown>;
};

export type OplStateReadback = {
  profile: OplStateProfile;
  app_state: OplAppState;
  readback: OplCommandReadback;
  carrierDiagnostics: CarrierDiagnosticsReadback;
  raw_state?: Record<string, unknown>;
};

export type OplInitializeChecklistItem = {
  itemId: string;
  label?: string;
  status?: string;
  blocking: boolean;
  required: boolean;
  readinessLayer?: string;
  severity?: string;
  nextVisibleStep?: string;
};

export type OplInitializeReadback = {
  schema: "opl_studio_initialize_readback.v1";
  systemInitialize: {
    overallState?: string;
    setupFlow: {
      isFirstRun: boolean;
      phase?: string;
      readyToLaunch: boolean;
      progress: Record<string, number>;
      blockingItems: string[];
      maintenanceItems: string[];
    };
    readiness: {
      coreReady?: boolean;
      domainReady?: boolean;
      launchReady?: boolean;
      familyRuntimeProviderReady?: boolean;
      fullReady?: boolean;
    };
    checklist: OplInitializeChecklistItem[];
    familyRuntimeProvider?: {
      status?: string;
      ready?: boolean;
      fullReadinessBlocking?: boolean;
    };
  };
  readback: OplCommandReadback;
};

export type CarrierDiagnosticsReadback = {
  schema: "opl_app_carrier_diagnostics.v1";
  owner: "one-person-lab-app_native_host" | "one-person-lab-app_desktop_host";
  carrier: "electron_desktop" | "standalone_headless_webui" | "docker_webui" | "browser_placeholder";
  status: "available" | "unavailable";
  application?: {
    systemInfo: {
      logDir: string;
    };
  };
  setLogDirectorySupported: boolean;
  reasonCode?: string;
};

export type AppLogDirectoryUpdateResult = {
  schema: "opl_app_log_directory_update.v1";
  owner: "one-person-lab-app_native_host" | "one-person-lab-app_desktop_host";
  carrier: "electron_desktop" | "standalone_headless_webui" | "docker_webui" | "browser_placeholder";
  action: "application.setLogDirectory";
  status: "updated" | "unsupported" | "error";
  success: boolean;
  hostLogDir?: string;
  errorCode?: string;
  reasonCode?: string;
  rollbackStatus?: "not_required" | "restored" | "failed";
  message?: string;
};

export type OplFullDrilldownReadback = {
  detail: "full";
  drilldown: Record<string, unknown>;
  readback: OplCommandReadback;
};

export type OplContributionReadRequest = {
  packageId: string;
  ref: string;
  input?: Record<string, unknown>;
};

export type OplContributionReadback = {
  packageId: string;
  ref: string;
  result: unknown;
  readback: OplCommandReadback;
};

export type OplDomainDetailViewAvailability =
  | "available"
  | "missing"
  | "stale"
  | "invalid"
  | "read_error";

export type OplDomainDetailViewReadRequest = {
  itemId: string;
  viewId: string;
  ifRevision?: number;
};

export type OplDomainDetailViewCondition = {
  type: string;
  status: string;
  reason: string;
  message: string;
  [key: string]: unknown;
};

export type OplDomainDetailViewReadback = {
  schemaVersion: "opl_domain_detail_view.v1";
  surfaceKind: "opl_domain_detail_view";
  itemId: string;
  viewId: string;
  viewKind: string;
  availability: OplDomainDetailViewAvailability;
  revision: number;
  notModified: boolean;
  payload: unknown | null;
  conditions: OplDomainDetailViewCondition[];
  digest?: string;
  generation?: number;
  payloadSchemaRef?: string;
  payloadSchema?: string;
  readback: OplCommandReadback;
};

export type OplActionRequest = {
  actionId: string;
  mode?: OplActionMode;
  payload?: OplActionPayload;
  dryRun?: boolean;
};

export type OplActionReceipt = {
  actionId: string;
  dryRun: boolean;
  confirmationRequired: boolean;
  canExecute: boolean;
  receiptKind: OplActionReceiptKind;
  authorityBoundary: "app_bridge_no_domain_authority";
  requestedMode: OplActionMode;
  status: OplActionReceiptStatus;
  command: string;
  commandArgs: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  payload?: OplActionPayload;
  stdoutJson?: unknown;
  stderrJson?: unknown;
  confirmationId?: string;
  receiptId?: string;
  rollbackRef?: string;
  blockedReason?: string;
};

export type CodexMessageRequest = {
  prompt: string;
  inputs?: CodexComposerInput[];
  threadId?: string;
  cwd?: string;
  agentSelection?: CodexAgentSelectionSnapshot;
  turnAgentSelection?: CodexAgentSelectionSnapshot;
  additionalInstructions?: string;
  model?: string;
  reasoningEffort?: string;
  permissions?: string;
};

export type CodexAgentSelectionSnapshot = {
  package_id: string;
  shortcut_id: string;
  codex_visible_entry: string;
  required_skill_ids: string[];
};

export type CodexComposerInput =
  | { type: "localImage"; path: string; detail?: "auto" | "low" | "high" | "original" | null }
  | { type: "skill"; name: string; path: string }
  | { type: "mention"; name: string; path: string };

export type CodexPickedInput = {
  kind: "file" | "folder" | "image";
  name: string;
  path: string;
};

export type ThreadWorkspaceEntry = {
  name: string;
  relativePath: string;
  kind: "file" | "directory" | "symlink";
  sizeBytes?: number;
};

export type ThreadWorkspaceListing = {
  schema: "opl_thread_workspace_listing.v1";
  threadId: string;
  relativePath: string;
  entries: ThreadWorkspaceEntry[];
  truncated: boolean;
};

export type ThreadWorkspaceFile = {
  schema: "opl_thread_workspace_file.v1";
  threadId: string;
  relativePath: string;
  name: string;
  content: string;
  sizeBytes: number;
};

export type ThreadWorkspaceSearch = {
  schema: "opl_thread_workspace_search.v1";
  threadId: string;
  query: string;
  entries: ThreadWorkspaceEntry[];
  truncated: boolean;
};

export type CodexSkillCapability = {
  name: string;
  path: string;
  description: string;
  enabled: boolean;
  scope: string;
};

export type CodexInstalledCapability = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  callable: boolean;
};

export type CodexCapabilityCatalog = {
  source: "codex_app_server" | "bridge_unavailable";
  skills: CodexSkillCapability[];
  plugins: CodexInstalledCapability[];
  apps: CodexInstalledCapability[];
  errors: string[];
  simulated?: boolean;
};

export type CodexPermissionProfile = {
  id: string;
  description: string;
  allowed: boolean;
  approvalPolicy?: string;
  sandbox?: string;
};

export type CodexPermissionProfileCatalog = {
  source: "codex_app_server" | "bridge_unavailable";
  profiles: CodexPermissionProfile[];
  simulated?: boolean;
};

export type CodexMessageResponse = {
  executor: "codex_app_server";
  transport: "stdio_json_rpc";
  threadId?: string;
  turnId?: string;
  finalMessage: string;
  eventCount: number;
  completed: Record<string, unknown>;
  cwd?: string;
  simulated?: boolean;
};

export type GatewayAccountLoginRequest = {
  email: string;
  password: string;
};

export type GatewayAccountLoginErrorCode =
  | "invalid_credentials"
  | "account_disabled"
  | "mfa_or_challenge_required"
  | "session_not_persistable"
  | "group_selection_required"
  | "auth_expired"
  | "network_unreachable"
  | "rate_limited"
  | "managed_key_missing"
  | "managed_key_conflict"
  | "managed_key_identity_drift"
  | "disconnect_pending"
  | "invalid_request"
  | "internal_contract_violation"
  | "gateway_account_failed";

export type GatewayAccountLoginResult =
  | { ok: true; stateRefreshRequired: true }
  | { ok: false; errorCode: GatewayAccountLoginErrorCode; stateRefreshRequired: false };

export type CodexApiKeyConfigurationResult =
  | { ok: true; stateRefreshRequired: true }
  | { ok: false; errorCode: "invalid_request" | "network_unreachable" | "internal_contract_violation" | "codex_configuration_failed"; stateRefreshRequired: false };

export type OplPlatformCapabilities = {
  workspaceRootSelection: boolean;
  codexInstall: boolean;
  modelAccessSecretInput: boolean;
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
  targetVersion?: string;
  progressPercent?: number;
  accepted?: boolean;
  restartRequired: boolean;
  reasonCode?: string;
  errorCode?: string;
  message?: string;
  ownerFallback?: "one-person-lab-app";
};

export type CodexModelCatalogEntry = {
  id: string;
  model: string;
  displayName: string;
  isDefault: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: string[];
};

export type CodexModelCatalog = {
  source: "codex_app_server_model_list" | "bridge_unavailable";
  models: CodexModelCatalogEntry[];
  simulated?: boolean;
};

export type CodexPendingServerRequest = {
  id: string | number;
  method: string;
  params: Record<string, unknown>;
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

export type OplStudioSurface = Pick<
  OplBridge,
  "platformCapabilities" | "beginWindowDrag" | "readState" | "readInitialize" | "readFullDrilldown" | "readContribution" | "readDomainDetailView" | "executeAction" | "readCodexModels" | "readCodexCapabilities" | "readCodexPermissionProfiles" | "listPendingServerRequests" | "respondToServerRequest" | "pickFiles" | "pickDirectory" | "listThreadWorkspace" | "readThreadWorkspaceFile" | "searchThreadWorkspace" | "setLogDirectory" | "sendMessage" | "steerTurn" | "interruptTurn" | "loginGatewayAccount" | "configureCodexApiKey" | "readNativeAppUpdateStatus" | "checkNativeAppUpdate" | "applyNativeAppUpdate" | "restartNativeApp" | "subscribeEvents"
> & Partial<CodexThreadAdapterBridge> & {
  eventSourceUrl?: string;
  connectEvents?: (onEvent: (event: OplBridgeEvent) => void) => () => void;
};

export const OPL_COMMANDS = {
  fastState: "opl app state --profile fast --json",
  fullState: "opl app state --profile full --json",
  fullDrilldown: "opl runtime app-operator-drilldown --detail full --json",
  domainDetailViewPrefix: "opl app view read",
  actionPrefix: "opl app action execute --action"
} as const;

export function buildDomainDetailViewCommandArgs(request: OplDomainDetailViewReadRequest): string[] {
  const args = ["opl", "app", "view", "read", "--item-id", request.itemId, "--view-id", request.viewId];
  if (request.ifRevision !== undefined) args.push("--if-revision", String(request.ifRevision));
  args.push("--json");
  return args;
}

export function buildDomainDetailViewCommand(request: OplDomainDetailViewReadRequest): string {
  return buildDomainDetailViewCommandArgs(request).join(" ");
}

export const CODEX_APP_SERVER = {
  transport: "codex app-server --stdio",
  initialize: "initialize",
  threadStart: "thread/start",
  threadList: "thread/list",
  threadRead: "thread/read",
  turnStart: "turn/start",
  resume: "thread/resume",
  threadFork: "thread/fork",
  threadArchive: "thread/archive",
  threadUnarchive: "thread/unarchive",
  turnSteer: "turn/steer",
  turnInterrupt: "turn/interrupt",
  turnStarted: "turn/started",
  streamEvent: "item/agentMessage/delta",
  itemCompleted: "item/completed",
  turnCompleted: "turn/completed",
  defaultPermissions: ":danger-full-access",
  approvalPolicy: "never",
  permissionProfiles: {
    ":danger-full-access": { approvalPolicy: "never", sandbox: "danger-full-access" },
    ":workspace": { approvalPolicy: "on-request", sandbox: "workspace-write" },
    ":read-only": { approvalPolicy: "on-request", sandbox: "read-only" }
  },
  requestTimeoutSeconds: 45,
  turnTimeoutSeconds: 180
} as const;

export type OplBridge = CodexThreadAdapterBridge & {
  platformCapabilities: OplPlatformCapabilities;
  beginWindowDrag(): void;
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
  listThreadWorkspace(request: { threadId: string; relativePath?: string }): Promise<ThreadWorkspaceListing>;
  readThreadWorkspaceFile(request: { threadId: string; relativePath: string }): Promise<ThreadWorkspaceFile>;
  searchThreadWorkspace(request: { threadId: string; query: string }): Promise<ThreadWorkspaceSearch>;
  setLogDirectory(request: { path: string }): Promise<AppLogDirectoryUpdateResult>;
  sendMessage(request: CodexMessageRequest): Promise<CodexMessageResponse>;
  steerTurn(request: ThreadSteerRequest): Promise<ThreadSteerResult>;
  interruptTurn(request: ThreadInterruptRequest): Promise<ThreadInterruptResult>;
  loginGatewayAccount(request: GatewayAccountLoginRequest): Promise<GatewayAccountLoginResult>;
  configureCodexApiKey(request: { apiKey: string }): Promise<CodexApiKeyConfigurationResult>;
  readNativeAppUpdateStatus(): Promise<NativeAppUpdateResult>;
  checkNativeAppUpdate(): Promise<NativeAppUpdateResult>;
  applyNativeAppUpdate(): Promise<NativeAppUpdateResult>;
  restartNativeApp(): Promise<NativeAppUpdateResult>;
  subscribeEvents(onEvent: (event: OplBridgeEvent) => void): () => void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function unavailableCarrierDiagnostics(
  carrier: CarrierDiagnosticsReadback["carrier"] = "browser_placeholder",
  reasonCode = "carrier_log_directory_unavailable"
): CarrierDiagnosticsReadback {
  return {
    schema: "opl_app_carrier_diagnostics.v1",
    owner: "one-person-lab-app_native_host",
    carrier,
    status: "unavailable",
    setLogDirectorySupported: false,
    reasonCode
  };
}

export function normalizeCarrierDiagnostics(value: unknown): CarrierDiagnosticsReadback {
  const record = asRecord(value);
  const ownerValue = asString(record?.owner);
  const owner = (["one-person-lab-app_native_host", "one-person-lab-app_desktop_host"] as const)
    .find((item) => item === ownerValue);
  const carrierValue = asString(record?.carrier);
  const carrier = (["electron_desktop", "standalone_headless_webui", "docker_webui", "browser_placeholder"] as const)
    .find((item) => item === carrierValue) ?? "browser_placeholder";
  const application = asRecord(record?.application);
  const systemInfo = asRecord(application?.systemInfo);
  const logDir = asString(systemInfo?.logDir);
  if (
    record?.schema === "opl_app_carrier_diagnostics.v1"
    && owner
    && record.status === "available"
    && logDir
  ) {
    return {
      schema: "opl_app_carrier_diagnostics.v1",
      owner,
      carrier,
      status: "available",
      application: { systemInfo: { logDir } },
      setLogDirectorySupported: record.setLogDirectorySupported === true,
      ...(asString(record.reasonCode) ? { reasonCode: asString(record.reasonCode) } : {})
    };
  }
  return unavailableCarrierDiagnostics(carrier, asString(record?.reasonCode));
}

function normalizeInitializeChecklistItem(value: unknown): OplInitializeChecklistItem | undefined {
  const record = asRecord(value);
  const itemId = asString(record?.item_id);
  if (!itemId) return undefined;
  return {
    itemId,
    ...(asString(record?.label) ? { label: asString(record?.label) } : {}),
    ...(asString(record?.status) ? { status: asString(record?.status) } : {}),
    blocking: record?.blocking === true,
    required: record?.required === true,
    ...(asString(record?.readiness_layer) ? { readinessLayer: asString(record?.readiness_layer) } : {}),
    ...(asString(record?.severity) ? { severity: asString(record?.severity) } : {}),
    ...(asString(record?.next_visible_step) ? { nextVisibleStep: asString(record?.next_visible_step) } : {})
  };
}

export function normalizeInitializeReadback(value: unknown): OplInitializeReadback {
  const root = asRecord(value);
  const systemInitialize = asRecord(root?.system_initialize) ?? {};
  const setupFlow = asRecord(systemInitialize.setup_flow) ?? {};
  const progressRecord = asRecord(setupFlow.progress) ?? {};
  const readiness = asRecord(systemInitialize.readiness) ?? {};
  const provider = asRecord(systemInitialize.family_runtime_provider);
  const checklist = Array.isArray(systemInitialize.checklist)
    ? systemInitialize.checklist.flatMap((item) => normalizeInitializeChecklistItem(item) ?? [])
    : [];
  const progress = Object.fromEntries(Object.entries(progressRecord)
    .filter(([, item]) => typeof item === "number" && Number.isFinite(item))
    .map(([key, item]) => [key, item as number]));
  const readback = asRecord(root?.readback);
  return {
    schema: "opl_studio_initialize_readback.v1",
    systemInitialize: {
      ...(asString(systemInitialize.overall_state) ? { overallState: asString(systemInitialize.overall_state) } : {}),
      setupFlow: {
        isFirstRun: setupFlow.is_first_run === true,
        ...(asString(setupFlow.phase) ? { phase: asString(setupFlow.phase) } : {}),
        readyToLaunch: setupFlow.ready_to_launch === true,
        progress,
        blockingItems: Array.isArray(setupFlow.blocking_items) ? setupFlow.blocking_items.map(String).slice(0, 32) : [],
        maintenanceItems: Array.isArray(setupFlow.maintenance_items) ? setupFlow.maintenance_items.map(String).slice(0, 32) : []
      },
      readiness: {
        ...(asBoolean(readiness.core_ready) !== undefined ? { coreReady: asBoolean(readiness.core_ready) } : {}),
        ...(asBoolean(readiness.domain_ready) !== undefined ? { domainReady: asBoolean(readiness.domain_ready) } : {}),
        ...(asBoolean(readiness.launch_ready) !== undefined ? { launchReady: asBoolean(readiness.launch_ready) } : {}),
        ...(asBoolean(readiness.family_runtime_provider_ready) !== undefined ? { familyRuntimeProviderReady: asBoolean(readiness.family_runtime_provider_ready) } : {}),
        ...(asBoolean(readiness.full_ready) !== undefined ? { fullReady: asBoolean(readiness.full_ready) } : {})
      },
      checklist,
      ...(provider ? {
        familyRuntimeProvider: {
          ...(asString(provider.status) ? { status: asString(provider.status) } : {}),
          ...(asBoolean(provider.ready) !== undefined ? { ready: asBoolean(provider.ready) } : {}),
          ...(asBoolean(provider.full_readiness_blocking) !== undefined ? { fullReadinessBlocking: asBoolean(provider.full_readiness_blocking) } : {})
        }
      } : {})
    },
    readback: {
      command: typeof readback?.command === "string" ? readback.command : "opl system initialize --json",
      commandArgs: Array.isArray(readback?.commandArgs) ? readback.commandArgs.map(String) : ["system", "initialize", "--json"],
      exitCode: asNumber(readback?.exitCode) ?? 0,
      stdout: "",
      stderr: typeof readback?.stderr === "string" ? readback.stderr : "",
      timedOut: readback?.timedOut === true
    }
  };
}

function normalizeThreadStatus(value: unknown): CodexThreadRuntimeStatus {
  const record = asRecord(value);
  const type = asString(record?.type);
  if (type === "idle" || type === "notLoaded" || type === "systemError") return { type };
  if (type === "active") {
    return {
      type,
      activeFlags: Array.isArray(record?.activeFlags) ? record.activeFlags.map(String) : []
    };
  }
  return { type: "systemError" };
}

function normalizeThreadState(status: CodexThreadRuntimeStatus): CodexThread["state"] {
  if (status.type === "notLoaded") return "unloaded";
  if (status.type === "idle") return "idle";
  if (status.type === "active") return "running";
  return "system_error";
}

function normalizeTurn(value: unknown): CodexTurn | undefined {
  const record = asRecord(value);
  const id = asString(record?.id);
  const status = asString(record?.status);
  if (!id || !["completed", "interrupted", "failed", "inProgress"].includes(status ?? "")) return undefined;
  return { ...record, id, status: status as CodexTurn["status"] };
}

function threadSourceKind(source: Record<string, unknown>): string | undefined {
  const explicit = asString(source.sourceKind);
  if (explicit) return explicit;
  const threadSource = asRecord(source.threadSource);
  const nestedThreadSource = asString(threadSource?.type) ?? asString(threadSource?.kind);
  if (nestedThreadSource) return nestedThreadSource;
  const directThreadSource = asString(source.threadSource);
  if (directThreadSource) return directThreadSource;
  const genericSource = asRecord(source.source);
  return asString(genericSource?.type)
    ?? asString(genericSource?.kind)
    ?? asString(source.source);
}

export function normalizeCodexThread(value: unknown): CodexThread {
  const record = asRecord(value);
  const source = asRecord(record?.thread) ?? record ?? {};
  const id = asString(source.id) ?? "";
  const status = normalizeThreadStatus(source.status);
  const turns = Array.isArray(source.turns) ? source.turns.flatMap((turn) => normalizeTurn(turn) ?? []) : [];
  const extra = asRecord(source.extra);
  return {
    ...source,
    id,
    sessionId: asString(source.sessionId) ?? id,
    projectKey: asString(source.projectKey) ?? asString(asRecord(source.extra)?.projectKey) ?? null,
    canonicalProjectId: asString(source.canonicalProjectId)
      ?? asString(source.canonical_project_id)
      ?? asString(extra?.canonicalProjectId)
      ?? asString(extra?.canonical_project_id)
      ?? asString(source.projectId),
    isTemporaryWorkspace: asBoolean(source.isTemporaryWorkspace)
      ?? asBoolean(source.is_temporary_workspace)
      ?? asBoolean(extra?.isTemporaryWorkspace)
      ?? asBoolean(extra?.is_temporary_workspace)
      ?? false,
    status,
    state: normalizeThreadState(status),
    summary: asString(source.summary) ?? asString(source.preview) ?? "",
    workspace: asString(source.workspace) ?? asString(source.cwd) ?? "",
    archived: asBoolean(source.archived) ?? false,
    parentThreadId: asString(source.parentThreadId) ?? asString(source.forkedFromId) ?? null,
    agentRole: asString(source.agentRole),
    agentNickname: asString(source.agentNickname),
    sourceKind: threadSourceKind(source),
    createdAt: asNumber(source.createdAt) ?? 0,
    updatedAt: asNumber(source.updatedAt) ?? 0,
    turns,
    activeTurnId: asString(source.activeTurnId) ?? turns.find((turn) => turn.status === "inProgress")?.id
  };
}

export function normalizeThreadListResult(value: unknown): ThreadListResult {
  const record = asRecord(value);
  const data = Array.isArray(record?.data) ? record.data.map(normalizeCodexThread).filter((thread) => thread.id) : [];
  return { data, nextCursor: null };
}

export function normalizeCodexModelCatalog(value: unknown): CodexModelCatalog {
  const record = asRecord(value);
  const data = Array.isArray(record?.data) ? record.data : Array.isArray(record?.models) ? record.models : [];
  const models = data.flatMap((item) => {
    const model = asRecord(item);
    const id = asString(model?.id) ?? asString(model?.model);
    if (!id) return [];
    const reasoning = Array.isArray(model?.supportedReasoningEfforts)
      ? model.supportedReasoningEfforts.flatMap((option) => {
        if (typeof option === "string") return option ? [option] : [];
        const effort = asString(asRecord(option)?.reasoningEffort);
        return effort ? [effort] : [];
      })
      : [];
    return [{
      id,
      model: asString(model?.model) ?? id,
      displayName: asString(model?.displayName) ?? id,
      isDefault: asBoolean(model?.isDefault) ?? false,
      defaultReasoningEffort: asString(model?.defaultReasoningEffort) ?? reasoning.at(-1) ?? "medium",
      supportedReasoningEfforts: reasoning
    }];
  });
  return {
    source: models.length ? "codex_app_server_model_list" : "bridge_unavailable",
    models,
    simulated: models.length ? undefined : true
  };
}

function parseJsonValue(value: string): unknown {
  const text = value.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function normalizeProfile(profile: unknown): OplStateProfile {
  return normalizeRuntimeProfile(profile);
}

function stateCommand(profile: OplStateProfile): string {
  return profile === "full" ? OPL_COMMANDS.fullState : OPL_COMMANDS.fastState;
}

function createCommandReadback(
  command: string,
  commandArgs: string[],
  exitCode = 0,
  stdout = "",
  stderr = "",
  timedOut = false
): OplCommandReadback {
  return { command, commandArgs, exitCode, stdout, stderr, timedOut };
}

export function normalizeContributionReadback(
  value: unknown,
  request: OplContributionReadRequest
): OplContributionReadback {
  const raw = asRecord(value) ?? {};
  const readback = createCommandReadback(
    asString(raw.command) ?? "opl app contribution read",
    Array.isArray(raw.commandArgs) ? raw.commandArgs.map(String) : [],
    asNumber(raw.exitCode) ?? 0,
    asString(raw.stdout) ?? "",
    asString(raw.stderr) ?? "",
    asBoolean(raw.timedOut) ?? false
  );
  if (readback.timedOut || readback.exitCode !== 0) {
    throw new Error(readback.stderr || "OPL contribution read failed");
  }
  const root = asRecord(raw.parsed)
    ?? asRecord(raw.stdoutJson)
    ?? asRecord(parseJsonValue(readback.stdout))
    ?? raw;
  const envelope = asRecord(root.opl_app_contribution);
  const response = asRecord(envelope?.response);
  if (
    envelope?.surface_kind !== "opl_app_package_contribution.v1"
    || envelope.package_id !== request.packageId
    || envelope.ref !== request.ref
    || envelope.operation !== "read"
    || response?.schema_version !== "opl-package-app-contribution-response.v1"
    || response.ok !== true
    || response.ref !== request.ref
    || response.operation !== "read"
    || !("result" in response)
  ) {
    throw new Error("OPL contribution read returned a stale or malformed response");
  }
  return { packageId: request.packageId, ref: request.ref, result: response.result, readback };
}

const domainDetailViewAvailabilities: OplDomainDetailViewAvailability[] = [
  "available",
  "missing",
  "stale",
  "invalid",
  "read_error"
];

function isDomainDetailViewAvailability(value: unknown): value is OplDomainDetailViewAvailability {
  return typeof value === "string" && domainDetailViewAvailabilities.includes(value as OplDomainDetailViewAvailability);
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function domainDetailCondition(
  availability: OplDomainDetailViewAvailability,
  reason: string,
  message: string
): OplDomainDetailViewCondition {
  return {
    type: "DomainDetailViewAvailable",
    status: availability === "available" ? "True" : availability === "missing" ? "Unknown" : "False",
    reason,
    message
  };
}

function normalizeDomainDetailCondition(value: unknown): OplDomainDetailViewCondition | undefined {
  const record = asRecord(value);
  const type = asString(record?.type);
  const status = asString(record?.status);
  const reason = asString(record?.reason);
  const message = asString(record?.message);
  if (!type || !status || !reason || !message) return undefined;
  return {
    ...record,
    type,
    status,
    reason,
    message
  };
}

function domainDetailViewEnvelope(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  return asRecord(record.opl_domain_detail_view) ?? record;
}

export function createPlaceholderDomainDetailViewReadback(
  request: OplDomainDetailViewReadRequest,
  reason = "bridge_unavailable_placeholder"
): OplDomainDetailViewReadback {
  const commandArgs = buildDomainDetailViewCommandArgs(request);
  const message = reason === "bridge_unavailable_placeholder"
    ? "Domain detail view bridge is unavailable in this host"
    : reason;
  const readback = createCommandReadback(
    buildDomainDetailViewCommand(request),
    commandArgs,
    -1,
    "",
    message,
    false
  );
  return {
    schemaVersion: "opl_domain_detail_view.v1",
    surfaceKind: "opl_domain_detail_view",
    itemId: request.itemId,
    viewId: request.viewId,
    viewKind: "",
    availability: "read_error",
    revision: 0,
    notModified: false,
    payload: null,
    conditions: [domainDetailCondition("read_error", reason, message)],
    readback
  };
}

export function normalizeDomainDetailViewReadback(
  value: unknown,
  request: OplDomainDetailViewReadRequest
): OplDomainDetailViewReadback {
  const commandArgs = buildDomainDetailViewCommandArgs(request);
  const fallbackReadback = createCommandReadback(buildDomainDetailViewCommand(request), commandArgs);
  const raw = asRecord(value) ?? {};
  const readback = raw.readback
    ? normalizeCommandReadback(raw.readback, fallbackReadback.command, fallbackReadback.commandArgs)
    : normalizeCommandReadback(raw, fallbackReadback.command, fallbackReadback.commandArgs);
  if (readback.timedOut || readback.exitCode !== 0) {
    const message = readback.stderr || "OPL domain detail view read failed";
    return {
      ...createPlaceholderDomainDetailViewReadback(request, message),
      readback
    };
  }

  const parsed = asRecord(raw.parsed)
    ?? asRecord(raw.stdoutJson)
    ?? asRecord(parseJsonValue(readback.stdout));
  const envelope = domainDetailViewEnvelope(parsed ?? raw);
  const invalid = (reason: string, message: string): OplDomainDetailViewReadback => ({
    schemaVersion: "opl_domain_detail_view.v1",
    surfaceKind: "opl_domain_detail_view",
    itemId: asString(envelope?.item_id) ?? request.itemId,
    viewId: asString(envelope?.view_id) ?? request.viewId,
    viewKind: asString(envelope?.view_kind) ?? "",
    availability: "invalid",
    revision: nonNegativeInteger(envelope?.revision) ?? 0,
    notModified: false,
    payload: null,
    conditions: [domainDetailCondition("invalid", reason, message)],
    readback
  });

  if (!envelope
    || envelope.schema_version !== "opl_domain_detail_view.v1"
    || envelope.surface_kind !== "opl_domain_detail_view") {
    return invalid("domain_detail_view_envelope_invalid", "OPL domain detail view response is malformed");
  }
  const itemId = asString(envelope.item_id);
  const viewId = asString(envelope.view_id);
  const viewKind = asString(envelope.view_kind);
  const availability = envelope.availability;
  const revision = nonNegativeInteger(envelope.revision);
  const notModified = asBoolean(envelope.not_modified);
  if (!itemId || !viewId || !viewKind || itemId !== request.itemId || viewId !== request.viewId) {
    return invalid("domain_detail_view_identity_mismatch", "OPL domain detail view response does not match the requested view");
  }
  if (!isDomainDetailViewAvailability(availability)
    || revision === undefined
    || notModified === undefined) {
    return invalid("domain_detail_view_shape_invalid", "OPL domain detail view response has invalid transport fields");
  }
  const generation = envelope.generation === undefined ? undefined : nonNegativeInteger(envelope.generation);
  if (envelope.generation !== undefined && generation === undefined) {
    return invalid("domain_detail_view_generation_invalid", "OPL domain detail view generation is invalid");
  }
  if (generation !== undefined && generation !== revision) {
    return invalid("domain_detail_view_generation_mismatch", "OPL domain detail view generation does not match revision");
  }
  const payload = envelope.payload === undefined ? null : envelope.payload;
  if (notModified && payload !== null) {
    return invalid("domain_detail_view_not_modified_payload", "Unchanged domain detail view responses must not include a payload");
  }
  if (availability === "available" && !notModified && payload === null) {
    return invalid("domain_detail_view_payload_missing", "Available domain detail view response is missing its payload");
  }
  const conditions = Array.isArray(envelope.conditions)
    ? envelope.conditions.flatMap((condition) => normalizeDomainDetailCondition(condition) ?? [])
    : [];
  const normalizedConditions = conditions.length
    ? conditions
    : [domainDetailCondition(availability, `domain_detail_view_${availability}`, `Domain detail view is ${availability}`)];
  return {
    schemaVersion: "opl_domain_detail_view.v1",
    surfaceKind: "opl_domain_detail_view",
    itemId,
    viewId,
    viewKind,
    availability,
    revision,
    notModified,
    payload: availability === "available" ? payload : null,
    conditions: normalizedConditions,
    ...(asString(envelope.digest) ? { digest: asString(envelope.digest) } : {}),
    ...(generation !== undefined ? { generation } : {}),
    ...(asString(envelope.payload_schema_ref) ? { payloadSchemaRef: asString(envelope.payload_schema_ref) } : {}),
    ...(asString(envelope.payload_schema) ? { payloadSchema: asString(envelope.payload_schema) } : {}),
    readback
  };
}

function defaultStateActions(): OplActionDescriptor[] {
  return [
    {
      action_id: "task_action_receipt_preview",
      label: "Preview task action receipt",
      route: "opl app action execute --action task_action_receipt_preview",
      payload_fields: [],
      mutates: "none",
      dry_run_supported: true,
      owner: "opl_app",
      delegated_surface: "opl task action receipt preview",
      can_submit_to_safe_action_shell: true,
      route_requires_domain_or_app_payload: false
    },
    {
      action_id: "task_export_bundle_preview",
      label: "Preview export bundle",
      route: "opl app action execute --action task_export_bundle_preview",
      payload_fields: ["refs"],
      mutates: "candidate_preview_only",
      dry_run_supported: true,
      owner: "opl_app",
      delegated_surface: "opl export bundle preview",
      can_submit_to_safe_action_shell: true,
      route_requires_domain_or_app_payload: true
    },
    {
      action_id: "workspace_ensure",
      label: "Ensure workspace",
      route: "opl app action execute --action workspace_ensure",
      payload_fields: ["workspace"],
      mutates: "workspace_context",
      dry_run_supported: true,
      owner: "opl_app",
      delegated_surface: "opl workspace ensure",
      can_submit_to_safe_action_shell: true,
      route_requires_domain_or_app_payload: true
    },
    {
      action_id: "settings_sync_capabilities",
      label: "Sync settings capabilities",
      route: "opl app action execute --action settings_sync_capabilities",
      payload_fields: [],
      mutates: "settings_capabilities_projection",
      dry_run_supported: true,
      owner: "opl_app",
      delegated_surface: "opl settings capability sync",
      can_submit_to_safe_action_shell: true,
      route_requires_domain_or_app_payload: false
    },
    {
      action_id: "provider_scheduler_status",
      label: "Provider scheduler status",
      route: "opl app action execute --action provider_scheduler_status",
      payload_fields: [],
      mutates: "none",
      dry_run_supported: true,
      owner: "opl_runtime",
      delegated_surface: "opl provider scheduler status",
      can_submit_to_safe_action_shell: true,
      route_requires_domain_or_app_payload: false
    }
  ];
}

function defaultStateReadback(profile: OplStateProfile): OplStateReadback {
  const generatedAt = new Date().toISOString();
  return {
    profile,
    app_state: {
      runtime_source: {
        owner: "opl_framework",
        app_repo_truth_owner: "one-person-lab-app",
        normal_gui_state_surface: OPL_COMMANDS.fastState,
        full_gui_state_surface: OPL_COMMANDS.fullState,
        action_boundary_surface: "opl app action execute --action <action_id> [--payload json] [--dry-run] --json",
        full_drilldown_exception_surface: OPL_COMMANDS.fullDrilldown
      },
      operator: {
        summary: {
          runtime_status: profile === "full" ? "full_profile_placeholder" : "fast_profile_placeholder",
          provider_status: "candidate_preview_only"
        },
        refs: [{
          label: "App state profile",
          ref: `opl://state/${profile}`,
          node_kind: "runtime_profile"
        }]
      },
      modules: { items: [] },
      actions: defaultStateActions(),
      managed_companions: [],
      meta: {
        profile,
        generated_at: generatedAt
      },
      provider: {
        status: "candidate_preview_only"
      },
      active_project_lines: [{
        status: "candidate_preview_only",
        active_run_id: `placeholder-${profile}`,
        next_visible_step: "Read runtime refs before execution",
        progress_delta_classification: "platform_or_observability_delta",
        deliverable_progress_delta: "runtime refs available",
        platform_repair_delta: "none",
        next_forced_delta: "human_confirmation_gate"
      }]
    },
    readback: createCommandReadback(
      stateCommand(profile),
      ["opl", "app", "state", "--profile", profile, "--json"]
    ),
    carrierDiagnostics: unavailableCarrierDiagnostics()
  };
}

function defaultFullDrilldown(): OplFullDrilldownReadback {
  return {
    detail: "full",
    drilldown: {
      runtime_status: "full_drilldown_placeholder",
      authorityBoundary: "app_bridge_no_domain_authority"
    },
    readback: createCommandReadback(
      OPL_COMMANDS.fullDrilldown,
      ["opl", "runtime", "app-operator-drilldown", "--detail", "full", "--json"]
    )
  };
}

export function buildActionCommandArgs(request: OplActionRequest): string[] {
  const args = ["opl", "app", "action", "execute", "--action", request.actionId];
  if (request.payload) {
    args.push("--payload", JSON.stringify(request.payload));
  }
  if (request.dryRun !== false) {
    args.push("--dry-run");
  }
  args.push("--json");
  return args;
}

export function buildActionCommand(request: OplActionRequest): string {
  const payload = request.payload ? ` --payload '${JSON.stringify(request.payload)}'` : "";
  const dryRun = request.dryRun === false ? "" : " --dry-run";
  return `${OPL_COMMANDS.actionPrefix} ${request.actionId}${payload}${dryRun} --json`;
}

function actionMode(request: OplActionRequest): OplActionMode {
  if (request.mode) return request.mode;
  if (request.payload?.rollbackRef) return "rollback";
  return request.dryRun === false ? "execute" : "preview";
}

function actionReceiptKind(request: OplActionRequest): OplActionReceiptKind {
  if (request.dryRun === false && request.payload?.confirmed !== true) return "confirmation_required";
  return actionMode(request);
}

function actionReceiptStatus(
  receiptKind: OplActionReceiptKind,
  dryRun: boolean,
  exitCode: number,
  timedOut: boolean
): OplActionReceiptStatus {
  if (timedOut) return "timed_out";
  if (receiptKind === "blocked_read_only") return "blocked_read_only";
  if (receiptKind === "confirmation_required") return "confirmation_required";
  if (exitCode !== 0) return "error";
  return dryRun ? "preview_ready" : "executed";
}

function createPlaceholderActionReceipt(request: OplActionRequest): OplActionReceipt {
  const command = buildActionCommand(request);
  const commandArgs = buildActionCommandArgs(request);
  const receiptKind = actionReceiptKind(request);
  const dryRun = request.dryRun !== false;
  const exitCode = -1;
  const stderr = receiptKind === "confirmation_required"
    ? "confirmation_required"
    : JSON.stringify({
        error: "bridge_unavailable_placeholder",
        boundary: "preview_only_no_native_action_record"
      });
  return {
    actionId: request.actionId,
    dryRun,
    confirmationRequired: receiptKind === "confirmation_required",
    canExecute: false,
    receiptKind,
    authorityBoundary: "app_bridge_no_domain_authority",
    requestedMode: actionMode(request),
    status: actionReceiptStatus(receiptKind, dryRun, exitCode, false),
    command,
    commandArgs,
    exitCode,
    stdout: "",
    stderr,
    timedOut: false,
    payload: request.payload,
    stdoutJson: undefined,
    stderrJson: parseJsonValue(stderr),
    confirmationId: request.payload?.confirmationId,
    receiptId: request.payload?.receiptId,
    rollbackRef: request.payload?.rollbackRef
  };
}

function hasActionReceiptRecord(record: Record<string, unknown>): boolean {
  return Boolean(
    asString(record.actionId)
      || asString(record.command)
      || typeof record.exitCode === "number"
      || typeof record.stdout === "string"
      || typeof record.stderr === "string"
      || asString(record.receiptKind)
  );
}

function normalizeCommandReadback(
  value: unknown,
  fallbackCommand: string,
  fallbackArgs: string[]
): OplCommandReadback {
  const record = asRecord(value);
  return createCommandReadback(
    asString(record?.command) ?? fallbackCommand,
    fallbackArgs,
    asNumber(record?.exitCode) ?? 0,
    typeof record?.stdout === "string" ? record.stdout : "",
    typeof record?.stderr === "string" ? record.stderr : "",
    asBoolean(record?.timedOut) ?? false
  );
}

function normalizeStateObject(value: unknown, fallback: OplStateReadback): OplAppState {
  const root = asRecord(value);
  const appState = asRecord(root?.app_state) ?? root;
  if (!appState) return fallback.app_state;
  const operator = asRecord(appState.operator);
  return {
    ...fallback.app_state,
    ...appState,
    runtime_source: {
      ...fallback.app_state.runtime_source,
      ...asRecord(appState.runtime_source)
    },
    operator: {
      ...operator,
      summary: {
        ...fallback.app_state.operator.summary,
        ...asRecord(operator?.summary)
      },
      refs: Array.isArray(operator?.refs)
        ? (operator.refs as unknown[]).map((item) => asRecord(item) ?? {})
        : fallback.app_state.operator.refs,
      ...(asRecord(operator?.workbench) ? { workbench: asRecord(operator?.workbench) as Record<string, unknown> } : {})
    },
    modules: {
      items: Array.isArray(asRecord(appState.modules)?.items)
        ? (asRecord(appState.modules)?.items as unknown[]).map((item) => asRecord(item) ?? {})
        : fallback.app_state.modules.items
    },
    actions: Array.isArray(appState.actions)
      ? appState.actions.map((item) => {
          const action = asRecord(item);
          const id = asString(action?.action_id) ?? "";
          return {
            action_id: id,
            label: asString(action?.label) ?? id,
            route: asString(action?.route) ?? `opl app action execute --action ${id}`,
            ...(asString(action?.surface) ? { surface: asString(action?.surface) as string } : {}),
            ...(asString(action?.submit_via) ? { submit_via: asString(action?.submit_via) as string } : {}),
            payload_fields: Array.isArray(action?.payload_fields)
              ? action.payload_fields.map((field) => String(field))
              : [],
            mutates: asString(action?.mutates) ?? "unknown",
            dry_run_supported: asBoolean(action?.dry_run_supported) ?? false,
            confirmation_required: asBoolean(action?.confirmation_required) ?? false,
            ...(asString(action?.danger_level) ? { danger_level: asString(action?.danger_level) as string } : {}),
            owner: asString(action?.owner) ?? "",
            delegated_surface: asString(action?.delegated_surface) ?? "",
            can_submit_to_safe_action_shell: asBoolean(action?.can_submit_to_safe_action_shell) ?? false,
            route_requires_domain_or_app_payload: asBoolean(action?.route_requires_domain_or_app_payload) ?? false
          };
        }).filter((action) => Boolean(action.action_id))
      : fallback.app_state.actions,
    managed_companions: Array.isArray(appState.managed_companions)
      ? appState.managed_companions
          .map(asRecord)
          .filter((item): item is Record<string, unknown> => item !== null)
      : fallback.app_state.managed_companions,
    meta: {
      profile: normalizeProfile(asRecord(appState.meta)?.profile ?? fallback.profile),
      generated_at: asString(asRecord(appState.meta)?.generated_at) ?? fallback.app_state.meta.generated_at
    },
    provider: {
      ...asRecord(appState.provider),
      status: asString(asRecord(appState.provider)?.status) ?? fallback.app_state.provider.status
    },
    active_project_lines: Array.isArray(appState.active_project_lines)
      ? appState.active_project_lines.map((item) => {
          const line = asRecord(item);
          return {
            status: asString(line?.status) ?? "unknown",
            active_run_id: asString(line?.active_run_id) ?? "",
            next_visible_step: asString(line?.next_visible_step) ?? "Review current refs",
            progress_delta_classification: asString(line?.progress_delta_classification) ?? "platform_or_observability_delta",
            deliverable_progress_delta: asString(line?.deliverable_progress_delta) ?? "runtime refs available",
            platform_repair_delta: asString(line?.platform_repair_delta) ?? "none",
            next_forced_delta: asString(line?.next_forced_delta) ?? "human_confirmation_gate"
          };
        })
      : fallback.app_state.active_project_lines
  };
}

export function normalizeStateReadback(value: unknown, profile = readRuntimeProfile()): OplStateReadback {
  const normalizedProfile = normalizeProfile(profile);
  const fallback = defaultStateReadback(normalizedProfile);
  const commandReadback = normalizeCommandReadback(
    value,
    stateCommand(normalizedProfile),
    ["opl", "app", "state", "--profile", normalizedProfile, "--json"]
  );
  const record = asRecord(value);
  const parsedState = parseJsonValue(commandReadback.stdout);
  const stateSource = asRecord(parsedState)
    ?? asRecord(record?.raw_state)
    ?? asRecord(record?.app_state)
    ?? record;
  return {
    profile: normalizedProfile,
    app_state: normalizeStateObject(stateSource, fallback),
    readback: record?.readback
      ? normalizeCommandReadback(record.readback, commandReadback.command, commandReadback.commandArgs)
      : commandReadback,
    carrierDiagnostics: normalizeCarrierDiagnostics(record?.carrierDiagnostics ?? record?.carrier_diagnostics)
  };
}

export function normalizeFullDrilldownReadback(value: unknown): OplFullDrilldownReadback {
  const fallback = defaultFullDrilldown();
  const commandReadback = normalizeCommandReadback(
    value,
    OPL_COMMANDS.fullDrilldown,
    ["opl", "runtime", "app-operator-drilldown", "--detail", "full", "--json"]
  );
  const record = asRecord(value);
  const parsed = asRecord(parseJsonValue(commandReadback.stdout));
  return {
    detail: "full",
    drilldown: parsed ?? asRecord(record?.drilldown) ?? fallback.drilldown,
    readback: record?.readback
      ? normalizeCommandReadback(record.readback, commandReadback.command, commandReadback.commandArgs)
      : commandReadback
  };
}

export function normalizeActionReceipt(value: unknown, request: OplActionRequest): OplActionReceipt {
  const fallback = createPlaceholderActionReceipt(request);
  const record = asRecord(value);
  if (!record || !hasActionReceiptRecord(record)) return fallback;
  const readback = normalizeCommandReadback(record, fallback.command, fallback.commandArgs);
  const receiptKind = (asString(record.receiptKind) as OplActionReceiptKind | undefined) ?? fallback.receiptKind;
  return {
    ...fallback,
    actionId: asString(record.actionId) ?? fallback.actionId,
    dryRun: asBoolean(record.dryRun) ?? fallback.dryRun,
    confirmationRequired: asBoolean(record.confirmationRequired) ?? fallback.confirmationRequired,
    canExecute: asBoolean(record.canExecute) ?? fallback.canExecute,
    receiptKind,
    requestedMode: fallback.requestedMode,
    status: actionReceiptStatus(
      receiptKind,
      asBoolean(record.dryRun) ?? fallback.dryRun,
      readback.exitCode,
      readback.timedOut
    ),
    authorityBoundary: (asString(record.authorityBoundary) as "app_bridge_no_domain_authority" | undefined) ?? fallback.authorityBoundary,
    command: readback.command,
    commandArgs: readback.commandArgs,
    exitCode: readback.exitCode,
    stdout: readback.stdout,
    stderr: readback.stderr,
    timedOut: readback.timedOut,
    payload: request.payload,
    stdoutJson: parseJsonValue(readback.stdout),
    stderrJson: parseJsonValue(readback.stderr),
    confirmationId: asString(record.confirmationId) ?? fallback.confirmationId,
    receiptId: asString(record.receiptId) ?? fallback.receiptId,
    rollbackRef: asString(record.rollbackRef) ?? fallback.rollbackRef,
    blockedReason: asString(record.blockedReason) ?? fallback.blockedReason
  };
}

export function normalizeSendMessageResponse(value: unknown, request: CodexMessageRequest): CodexMessageResponse {
  const record = asRecord(value);
  const threadId = asString(record?.threadId) ?? request.threadId;
  const turnId = asString(record?.turnId) ?? (threadId ? `${threadId}:simulated-turn` : "simulated-turn");
  const completed = asRecord(record?.completed) ?? {
    turn: {
      id: turnId,
      status: "preview_only"
    }
  };
  return {
    executor: "codex_app_server",
    transport: "stdio_json_rpc",
    threadId,
    turnId,
    finalMessage: asString(record?.finalMessage) ?? "Preview-only browser placeholder reply. Native bridge unavailable.",
    eventCount: asNumber(record?.eventCount) ?? 0,
    completed,
    cwd: asString(record?.cwd),
    simulated: asBoolean(record?.simulated) ?? !record
  };
}

function classifyEventKind(methodOrType: string, payload: Record<string, unknown> | null): OplEventKind {
  const text = methodOrType.toLowerCase();
  const item = asRecord(payload?.item);
  const itemType = asString(item?.type)?.toLowerCase() ?? "";
  if (text.includes("permission")) return "permission";
  if (text.includes("user_input") || text.includes("input")) return "user_input";
  if (text.includes("receipt")) return "receipt";
  if (text.includes("tool") || itemType.includes("tool")) return "tool";
  if (text.includes("diff")) return "diff";
  if (text.includes("file")) return "file";
  return "process";
}

export function normalizeBridgeEvent(value: unknown, source = "bridge"): OplBridgeEvent {
  const record = asRecord(value);
  const method = asString(record?.method);
  if (method) {
    const params = asRecord(record?.params) ?? {};
    const item = asRecord(params.item);
    return {
      method,
      params,
      source,
      eventKind: classifyEventKind(method, params),
      summary: method,
      turnId: asString(params.turnId) ?? asString(asRecord(params.turn)?.id),
      delta: asString(params.delta),
      itemText: asString(item?.text),
      raw: value
    };
  }
  const type = asString(record?.type) ?? "bridge.event";
  return {
    type,
    source,
    eventKind: classifyEventKind(type, record),
    summary: type,
    raw: value
  };
}

function normalizeInstalledCapability(value: unknown): CodexInstalledCapability | null {
  const record = asRecord(value);
  const id = asString(record?.id);
  if (!record || !id) return null;
  const interfaceRecord = asRecord(record.interface);
  return {
    id,
    name: asString(record.name) ?? asString(record.runtimeName) ?? asString(interfaceRecord?.displayName) ?? id,
    description: asString(record.description) ?? asString(interfaceRecord?.shortDescription) ?? "",
    enabled: asBoolean(record.enabled) ?? asBoolean(record.isEnabled) ?? false,
    callable: asBoolean(record.callable) ?? (asBoolean(record.installed) === true && asBoolean(record.enabled) === true)
  };
}

export function normalizeCodexCapabilityCatalog(value: unknown): CodexCapabilityCatalog {
  const record = asRecord(value);
  const skills = Array.isArray(record?.skills) ? record.skills.flatMap((value) => {
    const skill = asRecord(value);
    const name = asString(skill?.name);
    const path = asString(skill?.path);
    return name && path ? [{
      name,
      path,
      description: asString(skill?.description) ?? asString(skill?.shortDescription) ?? "",
      enabled: asBoolean(skill?.enabled) ?? true,
      scope: asString(skill?.scope) ?? "unknown"
    }] : [];
  }) : [];
  const plugins = Array.isArray(record?.plugins)
    ? record.plugins.flatMap((value) => normalizeInstalledCapability(value) ?? [])
    : [];
  const apps = Array.isArray(record?.apps)
    ? record.apps.flatMap((value) => normalizeInstalledCapability(value) ?? [])
    : [];
  const uniqueBy = <Item,>(items: Item[], key: (item: Item) => string): Item[] => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const identity = key(item).trim().toLowerCase();
      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  };
  return {
    source: record ? "codex_app_server" : "bridge_unavailable",
    skills: uniqueBy(skills, (item) => item.name),
    plugins: uniqueBy(plugins, (item) => item.id),
    apps: uniqueBy(apps, (item) => item.id),
    errors: Array.isArray(record?.errors) ? record.errors.map(String) : [],
    simulated: asBoolean(record?.simulated) ?? !record
  };
}

export function normalizeCodexPermissionProfileCatalog(value: unknown): CodexPermissionProfileCatalog {
  const record = asRecord(value);
  const values = Array.isArray(record?.data)
    ? record.data
    : Array.isArray(record?.profiles)
      ? record.profiles
      : [];
  const profiles = values.flatMap((value) => {
    const profile = asRecord(value);
    const id = asString(profile?.id);
    return id ? [{
      id,
      description: asString(profile?.description) ?? "",
      allowed: asBoolean(profile?.allowed) ?? true,
      ...(asString(profile?.approvalPolicy) ? { approvalPolicy: asString(profile?.approvalPolicy) } : {}),
      ...(asString(profile?.sandbox) ? { sandbox: asString(profile?.sandbox) } : {})
    }] : [];
  });
  return {
    source: record ? "codex_app_server" : "bridge_unavailable",
    profiles,
    simulated: asBoolean(record?.simulated) ?? !record
  };
}

function normalizePickedInputs(value: unknown): CodexPickedInput[] {
  const record = asRecord(value);
  const items = Array.isArray(value) ? value : Array.isArray(record?.items) ? record.items : [];
  return items.flatMap((value) => {
    const item = asRecord(value);
    const name = asString(item?.name);
    const path = asString(item?.path);
    const kind = asString(item?.kind);
    return name && path && (kind === "file" || kind === "folder" || kind === "image")
      ? [{ name, path, kind } as CodexPickedInput]
      : [];
  });
}

export function parseEventSourceMessage(data: string, source = "web_transport_sse"): OplBridgeEvent {
  return normalizeBridgeEvent(parseJsonValue(data) ?? { type: "bridge.event", data }, source);
}

export function createBrowserBridge(): OplBridge {
  const candidate = ((globalThis as Record<string, unknown>).window as { oplStudio?: OplStudioSurface } | undefined)
    ?.oplStudio;
  return {
    platformCapabilities: {
      workspaceRootSelection: candidate?.platformCapabilities?.workspaceRootSelection === true,
      codexInstall: candidate?.platformCapabilities?.codexInstall === true,
      modelAccessSecretInput: candidate?.platformCapabilities?.modelAccessSecretInput === true
    },
    beginWindowDrag() {
      candidate?.beginWindowDrag?.();
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
    listThreadWorkspace(request) {
      if (!candidate?.listThreadWorkspace) {
        return Promise.reject(new Error("Thread workspace browsing is unavailable in this host"));
      }
      return candidate.listThreadWorkspace(request);
    },
    readThreadWorkspaceFile(request) {
      if (!candidate?.readThreadWorkspaceFile) {
        return Promise.reject(new Error("Thread workspace file preview is unavailable in this host"));
      }
      return candidate.readThreadWorkspaceFile(request);
    },
    searchThreadWorkspace(request) {
      if (!candidate?.searchThreadWorkspace) {
        return Promise.reject(new Error("Thread workspace search is unavailable in this host"));
      }
      return candidate.searchThreadWorkspace(request);
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

function nativeUpdaterPlaceholder(operation: NativeAppUpdateOperation): NativeAppUpdateResult {
  return {
    schema: "opl_native_app_updater.v1",
    owner: "one-person-lab-app_native_host",
    host: "browser_placeholder",
    operation,
    supported: false,
    state: "unsupported",
    restartRequired: false,
    reasonCode: "native_host_required",
    ownerFallback: "one-person-lab-app"
  };
}

function unsupportedLogDirectoryUpdate(): AppLogDirectoryUpdateResult {
  return {
    schema: "opl_app_log_directory_update.v1",
    owner: "one-person-lab-app_native_host",
    carrier: "browser_placeholder",
    action: "application.setLogDirectory",
    status: "unsupported",
    success: false,
    reasonCode: "desktop_host_required"
  };
}
