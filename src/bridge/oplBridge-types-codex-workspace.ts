export type CodexMessageRequest = {
  autoReview?: boolean;
  timeContext?: boolean;
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
  cleanupToken?: string;
  previewUrl?: string;
};

export type ThreadWorkspaceBytes = { data: string; offset: number; sizeBytes: number; eof: boolean };

export type ThreadWorkspaceAccessRequest = {
  threadId: string;
  relativePath?: string;
  action: "open" | "reveal" | "download";
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
  | "account_switch_requires_disconnect"
  | "gateway_busy"
  | "gateway_codex_binding_failed"
  | "gateway_configuration_invalid"
  | "gateway_request_rejected"
  | "gateway_response_invalid"
  | "gateway_store_invalid"
  | "credentials_stdin_too_large"
  | "invalid_request"
  | "internal_contract_violation"
  | "gateway_account_failed";

export type GatewayAccountLoginResult =
  | { ok: true; stateRefreshRequired: true }
  | { ok: false; errorCode: GatewayAccountLoginErrorCode; stateRefreshRequired: false };

export type CodexApiKeyConfigurationErrorCode =
  | "invalid_request"
  | "network_unreachable"
  | "internal_contract_violation"
  | "codex_configuration_failed";

export type CodexApiKeyConfigurationResult =
  | { ok: true; stateRefreshRequired: true }
  | { ok: false; errorCode: CodexApiKeyConfigurationErrorCode; stateRefreshRequired: false };

export type ConnectionAccessApprovalResult =
  | { ok: true; stateRefreshRequired: true }
  | { ok: false; errorCode: string };


export type CodexPendingServerRequest = {
  id: string | number;
  method: string;
  params: Record<string, unknown>;
};


export type ThreadWorkspaceGit = {
  threadId: string;
  status: "available" | "unavailable";
  reason?: string;
  branch?: string;
  files?: { path: string; index: string; workingTree: string; originalPath?: string }[];
  stagedDiff?: string;
  unstagedDiff?: string;
};
