export type OplStateProfile = "fast" | "full";

export type OplActionMode = "preview" | "execute" | "rollback";
export type OplActionReceiptKind = OplActionMode | "confirmation_required" | "blocked_read_only";
export type OplActionReceiptStatus =
  | "preview_ready"
  | "confirmation_required"
  | "blocked_read_only"
  | "executed"
  | "no_op"
  | "unsupported"
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
  managedUpdateMaintenance?: { schema: "opl_studio_update_maintenance.v1"; status: string; lastCompletedAt: number | null };
  raw_state?: Record<string, unknown>;
};

export type OplInitializeChecklistItem = {
  itemId: string;
  label?: string;
  status?: string;
  blocking: boolean;
  required: boolean;
  userActionRequired?: boolean;
  reasonCode?: string;
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
      readyToLaunch?: boolean;
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
      platform?: string;
      arch?: string;
    };
  };
  setLogDirectorySupported: boolean;
  reasonCode?: string;
  frameworkBootstrapStatus?: string;
  frameworkActivationStatus?: string;
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
