import type { AgentPackageLocalizedText } from "./workbenchModel-package-contracts";

export type WorkItemRuntimeStage = {
  stageId: string;
  displayName: string;
  displayNameI18n: AgentPackageLocalizedText;
  state: string;
  owner?: string;
  ownerDisplayName?: string;
  elapsedSeconds: number | null;
  totalTokens: number | null;
};

export type DomainDetailViewAvailability =
  | "unread"
  | "available"
  | "missing"
  | "stale"
  | "invalid"
  | "read_error";

export type DomainDetailViewDescriptor = {
  itemId: string;
  viewId: string;
  viewKind: string;
  title?: string;
  schemaRef?: string;
  schemaVersion?: string;
  revision?: number;
  digest?: string;
  availability: DomainDetailViewAvailability;
  valid: boolean;
  invalidReason?: string;
};

export type WorkItemRuntimeItem = {
  id: string;
  agentId: string;
  agentDisplayName: string;
  domainId?: string;
  projectId: string;
  projectDisplayName: string;
  workspacePath?: string;
  workItemId: string;
  domainWorkItemId?: string;
  canonicalThreadIds?: string[];
  workItemScopeId?: string;
  identityState?: string;
  title: string;
  kind?: string;
  status: string;
  statusLabel: string;
  statusReason?: string;
  currentStageId?: string;
  currentStageName?: string;
  attemptId?: string;
  nextStageId?: string;
  nextStageName?: string;
  executionState: string;
  activeSessionCount: number;
  attentionKind: string;
  nextActionTitle?: string;
  nextActionSummary?: string;
  nextActionOwner?: string;
  startedAt?: string;
  updatedAt?: string;
  elapsedMs: number | null;
  stageTokens: number | null;
  totalTokens: number | null;
  telemetryState: string;
  telemetryMissingReason?: string;
  archived: boolean;
  stages: WorkItemRuntimeStage[];
  domainDetailViews?: DomainDetailViewDescriptor[];
};

export type WorkItemRuntimeProjection = {
  schemaVersion: "work-item-projection.v2";
  generatedAt?: string;
  summary: {
    agentCount: number;
    projectCount: number;
    workItemCount: number;
    archivedWorkItemCount: number;
    runningCount: number;
    activeSessionCount: number;
    userAttentionCount: number;
    systemAttentionCount: number;
    telemetryObservedCount: number;
    telemetryMissingCount: number;
  };
  agents: Array<{ id: string; label: string }>;
  projects: Array<{ id: string; agentId: string; label: string; workspacePath?: string }>;
  items: WorkItemRuntimeItem[];
};

export type RuntimeMaintenanceActionRef = {
  actionId: string;
  label: string;
  state?: string;
  payload: Record<string, unknown>;
  requiredPayloadFields: string[];
  confirmationRequired: boolean;
  dryRunSupported: boolean;
  mutates: string;
  dangerLevel?: string;
};

export type ManagedUpdateDependencyVersion = string | Record<string, string | null> | null;

export type ManagedUpdateComponentRef = {
  componentId: "opl_app" | "opl_base" | "opl_packages" | string;
  lifecycleOwner: string;
  label: string;
  state: string;
  channel?: string;
  installedVersion?: string;
  latestVersion?: string;
  currentness?: string;
  autoApplyMode?: string;
  autoApplyEligible: boolean | null;
  backgroundSafe: boolean | null;
  summary?: string;
  guidance?: string;
  flowDependencies?: ManagedFlowDependencyRef[];
  runtimeDependencies?: ManagedRuntimeDependencyRef[];
  packageStates?: ManagedPackageStateRef[];
};

export type ManagedFlowDependencyRef = {
  dependencyId: string;
  dependencyKind: string;
  activation: string;
  offlineBundle: string;
  onlineInstallDefault: boolean | null;
  source: string | null;
  sourcePath: string | null;
  owner: string | null;
  bundleId: string | null;
  versionRequirement: string | null;
  installSource: string | null;
  relationship: string;
  lifecycleOwner: string;
  updateMode: string;
  installed: boolean | null;
  observedStatus: string | null;
  status: string;
  currentness: string;
  version: ManagedUpdateDependencyVersion;
  latestVersion: ManagedUpdateDependencyVersion;
  ownership: string | null;
};

export type ManagedRuntimeDependencyRef = {
  dependencyId: string;
  dependencyKind: string;
  installed: boolean | null;
  version: ManagedUpdateDependencyVersion;
  latestVersion: ManagedUpdateDependencyVersion;
  currentness: string;
  status: string;
  ownership: string | null;
  updatePolicy: string;
  updateMode: string;
  activationPolicy: string;
  binaryPath: string | null;
  note: string | null;
};

export type ManagedPackageStateRef = {
  packageId: string;
  label: string;
  state: string;
  updateMode: string;
  autoApplyEligible: boolean | null;
  backgroundUpdateReason: string | null;
  backgroundSafe: boolean | null;
  packageVersion: string | null;
  sourcePath: string | null;
  carrierKind: string | null;
  carrierIdentity: string | null;
  carrierStatus: string | null;
};

export type ManagedUpdateProjection = {
  operation: string;
  channel?: string;
  components: ManagedUpdateComponentRef[];
};

export type RuntimeOverviewRef = {
  temporal: {
    status: string;
    ready: boolean | null;
    serviceStatus: string;
    serviceReady: boolean | null;
    workerStatus: string;
    workerReady: boolean | null;
    schedulerStatus: string;
    schedulerReady: boolean | null;
    address?: string;
    namespace?: string;
    taskQueue?: string;
    observedAt?: string;
  };
  carriers: {
    total: number;
    present: number;
    healthy: number;
    items: {
      packageId: string;
      label: string;
      description?: string;
      status: string;
      sourceOrigin?: string;
      syncStatus?: string;
      dirty: boolean | null;
    }[];
  };
  maintenanceActions: RuntimeMaintenanceActionRef[];
  recommendedActionId?: string;
};
