import { deriveFeatureRefs } from "./featureModel";
import {
  rendererModuleIdForPreviewKind,
  type RendererPreviewKind
} from "../renderers/moduleRegistry";
import {
  emptyUiContributionsProjection,
  readUiContributionsProjection,
  type OplUiContributionsProjection
} from "../composition/contributionProjection";
import {
  readManagedCompanions,
  type ManagedCompanionViewModel
} from "./managedCompanions";
import {
  deriveServiceRecoveryModel,
  type ServiceRecoveryModel
} from "./serviceRecoveryModel";

export type WorkbenchPurpose = "research" | "grant" | "presentation" | "review";
export type WorkbenchPreviewKind = RendererPreviewKind;

export type WorkbenchArtifactRef = {
  id: string;
  title: string;
  kind: "result" | "file" | "receipt" | "deliverable";
  status: "ready" | "needs_review" | "blocked";
  previewKind: WorkbenchPreviewKind;
  ref: string;
  summary: string;
  provenance: string[];
  actions: string[];
};

export type WorkspaceSession = {
  id: string;
  workspace: string;
  session: string;
  status: string;
  nextStep: string;
};

export type WorkbenchThreadMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  turnId?: string;
  itemId?: string;
  presentation?: "execution" | "progress";
  executionStatus?: string;
  failureSummary?: string;
  subagent?: {
    type: "collabAgentToolCall" | "subAgentActivity";
    agentRole?: string;
    agentNickname?: string;
    childThreadIds?: string[];
    status?: string;
  };
};

export type WorkbenchThreadItem = {
  id: string;
  sessionId?: string;
  projectKey?: string;
  sourceKind?: string;
  agentRole?: string;
  agentNickname?: string;
  title: string;
  projectId?: string;
  canonicalProjectId?: string;
  projectLabel?: string;
  workspace?: string;
  isTemporaryWorkspace: boolean;
  currentWorkspace: boolean;
  parentThreadId?: string;
  activeTurnId?: string;
  status: string;
  preview: string;
  updatedAt?: string;
  archived: boolean;
};

export type WorkbenchProjectGroup = {
  id: string;
  label: string;
  workspace?: string;
  projectless: boolean;
  threads: WorkbenchThreadItem[];
};

export type ArtifactPreview = {
  id: string;
  label: string;
  previewKind: WorkbenchPreviewKind;
  rendererModuleId: string;
  title: string;
  ref: string;
  summary: string;
  content?: string;
  fields?: { label: string; value: string }[];
  bullets?: string[];
  sourceRefs?: string[];
  traceSteps?: string[];
  authorityBoundary?: string;
};

export type WorkbenchSourceRef = {
  id: string;
  label: string;
  ref: string;
  summary: string;
};

export type WorkbenchActionRef = {
  id: string;
  label: string;
  route: string;
  payloadFields: string[];
  mutates: string;
  dryRunSupported: boolean;
  confirmationRequired: boolean;
  dangerLevel?: string;
  owner?: string;
  delegatedSurface?: string;
  canSubmitToSafeActionShell?: boolean;
  routeRequiresPayload?: boolean;
};

export type WorkbenchFeatureState = "available" | "degraded" | "not_configured" | "unavailable" | "owner_action_required";
export type WorkbenchFeatureRef = {
  featureId: string;
  state: WorkbenchFeatureState;
  owner: string;
  sourceRef: string;
  summary?: string;
  actions: WorkbenchActionRef[];
  label: string;
  labelEn: string;
  destination: import("./featureModel").FeatureDestination;
  nextStep: string;
  affectsCodex: boolean;
};

export type WorkbenchTraceRef = {
  id: string;
  label: string;
  value: string;
};

export type WorkbenchStarterField = {
  name: string;
  label: string;
  input: "text" | "textarea" | "select";
  value: string;
  options?: string[];
};

export type WorkbenchStarter = {
  id: "mas" | "mag" | "rca" | "bookforge";
  purpose: "research" | "grant" | "presentation" | "book";
  title: string;
  requiredSkill: string;
  module: string;
  intent: string;
  fields: WorkbenchStarterField[];
  dryRunAction?: string;
  available?: boolean;
  status?: "preview" | "payload_required" | "unavailable";
  sourceRef?: string;
  previewActionId?: string;
};

export type ConfirmationCard = {
  id: string;
  title: string;
  question: string;
  risks: string[];
  willChange: string[];
  willNotChange: string[];
  receipt: string;
  rollback: string;
  dryRunAction?: string;
};

export type InterviewQuestion = {
  id: string;
  question: string;
  whyItMatters: string;
  answerType: string;
};

export type ActiveProjectLine = {
  status: string;
  activeRunId: string | null;
  nextVisibleStep: string;
  progressDeltaClassification: string;
  deliverableProgressDelta: string;
  platformRepairDelta: string;
  nextForcedDelta: string;
};

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

export type DeliveryPackage = {
  id: string;
  title: string;
  status: "ready" | "needs_review" | "blocked";
  summary: string;
  previewActionId?: string;
  deliverableRefs: string[];
  receiptRefs: string[];
  sourceRefs: string[];
  runtimeStatus: string;
  authorityBoundary: string;
};

export type ActionReceiptSummary = {
  id: string;
  title: string;
  actionId?: string;
  route?: string;
  status: "preview" | "payload_required" | "unavailable";
  mutates: string;
  receiptRef: string;
  summary: string;
  payloadFields: string[];
  owner?: string;
  authorityBoundary: string;
  sourceRefs: string[];
  checks: string[];
};

export type PackageLifecycleActionKind = "install" | "update" | "repair" | "uninstall" | "preferences" | "other";

export type PackageLifecycleActionRef = {
  kind: PackageLifecycleActionKind;
  semantic: string;
  surface?: string;
  label: string;
  status: "available" | "unavailable";
  actionId: string;
  actionRef: string;
  route?: string;
  payload: Record<string, unknown>;
  requiredPayloadFields: string[];
  confirmationRequired: boolean;
  dryRunSupported: boolean;
  owner?: string;
  delegatedSurface?: string;
  sourceRef: string;
  reason: string;
};

export type PackageLifecycleDisplayRef = {
  label: string;
  ref: string;
  summary: string;
};

export type PackageLifecycleStatusAxis = {
  label: string;
  value: string;
  source: "canonical_agent_packages" | "legacy_modules_fallback" | "missing_bridge";
};

export type PackageLifecycleSearchMetadata = {
  query: string;
  tags: string[];
  filters: PackageLifecycleDisplayRef[];
};

export type PackageLifecycleDetailRef = {
  label: string;
  value: string;
  source: PackageLifecycleStatusAxis["source"];
  ref?: string;
  summary: string;
};

export type AgentPackageLocalizedText = {
  zh?: string;
  en?: string;
};

export type AgentPackageRouteRef = {
  routeKind: string;
  executor: string;
  codexVisibleEntry: string;
};

export type AgentPackageShortcutRef = {
  shortcutId: string;
  labelI18n: AgentPackageLocalizedText;
  defaultVisible: boolean | null;
  userConfigurable: boolean | null;
  visible: boolean;
  sortOrder: number;
  route?: AgentPackageRouteRef;
};

export type AgentPackageReadinessRef = {
  status: string;
  operationalReady: boolean | null;
  launchAllowed: boolean | null;
  verificationDeferred: boolean | null;
  reason?: string;
  detailSurface?: string;
  statusReadError?: string;
  present: boolean | null;
  callable: boolean | null;
  selectionStatus: "available" | "unavailable" | "checking";
  selectable: boolean;
};

export type AgentPackageDependencyRef = {
  packageId: string;
  required: boolean | null;
  present: boolean | null;
  callable: boolean | null;
  status: string;
  reasons: string[];
};

export type AgentPackageLifecycleRef = {
  id: string;
  packageId: string;
  label: string;
  description: string;
  publisher: string;
  packageRole: string;
  roleGroup: "agent" | "workflow" | "supporting" | "other";
  official: boolean;
  displayNameI18n: AgentPackageLocalizedText;
  descriptionI18n: AgentPackageLocalizedText;
  sessionRoutingSummaryI18n: AgentPackageLocalizedText;
  requiredSkillIds: string[];
  optionalSkillRefs: string[];
  dependencies: AgentPackageDependencyRef[];
  installed: boolean | null;
  activated: boolean | null;
  appEnabled: boolean;
  readiness: AgentPackageReadinessRef;
  version?: string;
  versionKind?: "installed" | "available";
  currentness: string;
  sourceMode: string;
  automaticUpdate: boolean | null;
  homeShortcuts: AgentPackageShortcutRef[];
  recommendedActionId?: string;
  status: string;
  summary: string;
  sourceRef: string;
  sourceExplanation: string;
  searchMetadata: PackageLifecycleSearchMetadata;
  refs: PackageLifecycleDisplayRef[];
  details: PackageLifecycleDetailRef[];
  statusAxes: PackageLifecycleStatusAxis[];
  actions: PackageLifecycleActionRef[];
  authorityBoundary: string;
};

export type AgentPackageSelectionIntent = {
  kind: "agent_package_selection";
  selectionId: string;
  packageId: string;
  label: string;
  description: string;
  publisher: string;
  displayNameI18n: AgentPackageLocalizedText;
  descriptionI18n: AgentPackageLocalizedText;
  sessionRoutingSummaryI18n: AgentPackageLocalizedText;
  requiredSkillIds: string[];
  optionalSkillRefs: string[];
  readiness: AgentPackageReadinessRef;
  route?: AgentPackageRouteRef & { shortcutId: string };
  actions: PackageLifecycleActionRef[];
  recommendedActionId?: string;
  sourceRef: string;
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

export type WorkbenchGatewayAccount = {
  displayName: string;
  status: string;
  email?: string;
  accountStatus?: string;
  balance?: {
    amount: number;
    currency: string;
  };
  usage?: {
    todayTokens?: number;
    totalTokens?: number;
    todayCost?: number;
    totalCost?: number;
    currency?: string;
    timezone?: string;
  };
  managedKey?: {
    name?: string;
    status?: string;
  };
  availableGroups?: Array<{
    id: string;
    label: string;
  }>;
  installation?: {
    deviceLabel?: string;
    shortId?: string;
  };
  freshness?: {
    observedAt?: string;
    stale: boolean;
    lastErrorCode?: string;
  };
  sourceRef: string;
};

export type WorkbenchSettingsProjection = {
  sourceRef: string;
  gatewayConnectionMode: "none" | "manual_key" | "account";
  codex: {
    installed: boolean | null;
    version?: string;
    versionStatus?: string;
    binaryPath?: string;
    model?: string;
    reasoningEffort?: string;
    providerName?: string;
    providerBaseUrl?: string;
    modelAccessSource?: string;
    accessStatus?: string;
    configPath?: string;
    apiKeyPresent: boolean | null;
    updateAvailable: boolean | null;
  };
  statusSummary: {
    runtimeSourceHealth?: string;
    agentPackageHealth?: string;
    temporalProvider?: string;
    releaseChannel?: string;
    issueCount?: number;
  };
  localEnvironment: {
    stateDir?: string;
    runtimeSourcesRoot?: string;
    logsDir?: string;
    releaseChannel?: string;
    temporalProvider?: string;
  };
  workspace: {
    selectedPath?: string;
    exists: boolean | null;
    writable: boolean | null;
    healthStatus?: string;
    personalizationSourceCount: number;
  };
  externalConnections: {
    id: string;
    name: string;
    type?: string;
    endpoint?: string;
    status?: string;
    lastTestedAt?: string;
  }[];
  connectionAuthorization?: ConnectionAuthorizationProjection;
  connectionActions: {
    actionId: string;
    label: string;
    payloadFields: string[];
    confirmationRequired: boolean;
    dryRunSupported: boolean;
  }[];
  dockerWebui: {
    status?: string;
    runtimeStatus?: string;
    recoveryStatus?: string;
    actions: RuntimeMaintenanceActionRef[];
  };
  personalization: {
    userAgents?: {
      status: string;
      path?: string;
      content?: string;
      sha256?: string;
      sizeBytes?: number;
      maxEditableBytes?: number;
      source?: string;
    };
    oplFlowDefaultUserAgents?: {
      status: string;
      content?: string;
      sha256?: string;
      sourcePath?: string;
      packageVersion?: string;
      source?: string;
      reason?: string;
    };
  };
  storage: {
    agentPackageStore: {
      status?: string;
      bytes?: number;
      reclaimableBytes?: number;
      reasonCode?: string;
      observedAt?: string;
      stale: boolean | null;
      ownerRoute?: string;
      inventoryAction?: RuntimeMaintenanceActionRef;
      projectedAction?: {
        kind?: string;
        status?: string;
        route?: string;
        actionId?: string;
        dryRunRequired: boolean | null;
      };
    };
    webuiDataVolume: {
      status?: string;
      bytes?: number;
      reclaimableBytes?: number;
      reasonCode?: string;
      observedAt?: string;
      stale: boolean | null;
      ownerRoute?: string;
      inventoryAction?: RuntimeMaintenanceActionRef;
      projectedAction?: {
        kind?: string;
        status?: string;
        route?: string;
        actionId?: string;
        dryRunRequired: boolean | null;
      };
    };
  };
};

export type ConnectionAuthorizationCapability = {
  id: string;
  label: string;
  risk?: string;
};

export type AuthorizedConnectionSummary = {
  id: string;
  displayName: string;
  providerType?: string;
  status?: string;
  securityRevision?: number;
  accountLabel?: string;
  capabilities: ConnectionAuthorizationCapability[];
};

export type ConnectionAuthorizationConsumer = {
  packageId: string;
  displayName: string;
};

export type ConnectionAccessRequest = {
  requestId: string;
  status: string;
  consumer: ConnectionAuthorizationConsumer;
  connection: AuthorizedConnectionSummary;
  capabilities: ConnectionAuthorizationCapability[];
  requestedAt?: string;
};

export type ConnectionGrant = ConnectionAccessRequest & {
  grantId: string;
  grantedAt?: string;
  staleReason?: string;
};

export type ConnectionInvocation = {
  invocationId: string;
  consumerPackageId: string;
  consumerDisplayName: string;
  connectionId: string;
  connectionDisplayName: string;
  capabilityId: string;
  capabilityLabel: string;
  startedAt?: string;
  finishedAt?: string;
  disposition: string;
};

export type AvailableRelayConnection = {
  mailboxRef: string;
  displayName: string;
  accountLabel?: string;
};

export type ConnectionAuthorizationProjection = {
  requests: ConnectionAccessRequest[];
  grants: ConnectionGrant[];
  invocations: ConnectionInvocation[];
  connections: AuthorizedConnectionSummary[];
  availableRelayConnections: AvailableRelayConnection[];
};

export type WorkbenchModel = {
  features: WorkbenchFeatureRef[];
  purposes: WorkbenchPurpose[];
  sessions: WorkspaceSession[];
  results: WorkbenchArtifactRef[];
  deliverables: WorkbenchArtifactRef[];
  receipts: WorkbenchArtifactRef[];
  artifactPreviews: ArtifactPreview[];
  deliveryPackages: DeliveryPackage[];
  actionReceipts: ActionReceiptSummary[];
  packageLifecycle: AgentPackageLifecycleRef[];
  officialProfileRestore?: WorkbenchActionRef;
  starters: WorkbenchStarter[];
  confirmations: ConfirmationCard[];
  questions: InterviewQuestion[];
  activeProjectLines: ActiveProjectLine[];
  contextSources: WorkbenchSourceRef[];
  contextActions: WorkbenchActionRef[];
  contextTrace: WorkbenchTraceRef[];
  gatewayAccount?: WorkbenchGatewayAccount;
  settingsProjection?: WorkbenchSettingsProjection;
  runtimeOverview?: RuntimeOverviewRef;
  serviceRecovery?: ServiceRecoveryModel;
  workItemRuntime?: WorkItemRuntimeProjection;
  managedCompanions: ManagedCompanionViewModel[];
  uiContributions: OplUiContributionsProjection;
  stateGeneratedAt?: string;
};

export const workbenchBridgeUnavailableDiagnostic = {
  status: "candidate_surface_only",
  nextStep: "Consume opl app state/action refs"
} as const;

export const initialWorkbenchModel: WorkbenchModel = {
  features: deriveFeatureRefs(undefined),
  purposes: ["research", "grant", "presentation", "review"],
  managedCompanions: [],
  uiContributions: emptyUiContributionsProjection,
  sessions: [],
  results: [],
  deliverables: [],
  receipts: [],
  artifactPreviews: [],
  deliveryPackages: [],
  actionReceipts: [],
  packageLifecycle: [
    {
      id: "package-lifecycle-missing-bridge",
      packageId: "missing_bridge",
      label: "Agent package lifecycle",
      description: "No canonical App package lifecycle projection is available.",
      publisher: "unknown",
      packageRole: "unknown",
      roleGroup: "other",
      official: false,
      displayNameI18n: {},
      descriptionI18n: {},
      sessionRoutingSummaryI18n: {},
      requiredSkillIds: [],
      optionalSkillRefs: [],
      dependencies: [],
      installed: null,
      activated: null,
      appEnabled: true,
      readiness: {
        status: "unknown",
        operationalReady: null,
        launchAllowed: null,
        verificationDeferred: null,
        present: null,
        callable: null,
        selectionStatus: "checking",
        selectable: false
      },
      currentness: "unknown",
      sourceMode: "unknown",
      automaticUpdate: null,
      homeShortcuts: [],
      status: "missing_bridge",
      summary: "No canonical App package lifecycle projection is available; fallback stays preview-only and unavailable.",
      sourceRef: "opl app state --profile fast --json#app_state.agent_packages.directory + app_state.agent_packages.status_index",
      sourceExplanation: "missing App/root package bridge; no package lifecycle truth or executable action is inferred.",
      searchMetadata: {
        query: "missing_bridge agent package lifecycle missing_codex_surface required_skill:not_reported",
        tags: ["missing_bridge", "missing_codex_surface", "required_skill:not_reported"],
        filters: [
          { label: "Source", ref: "missing_bridge", summary: "No canonical agent_packages projection is available." },
          { label: "Codex surface", ref: "missing_codex_surface", summary: "No Codex/App exposure surface ref is available." },
          { label: "Required skill", ref: "required_skill:not_reported", summary: "No required skill ref is available." }
        ]
      },
      refs: [
        {
          label: "Canonical projection",
          ref: "opl app state --profile fast --json#app_state.agent_packages",
          summary: "Preferred App/root package lifecycle source."
        }
      ],
      details: [
        { label: "Status", value: "missing_bridge", source: "missing_bridge", summary: "No canonical package projection is available." },
        { label: "Conditions", value: "missing App/root bridge", source: "missing_bridge", summary: "Fallback mode cannot infer package truth." },
        { label: "Recommended action", value: "open App state/action refs", source: "missing_bridge", summary: "Bind canonical app_state.agent_packages before showing executable lifecycle actions." },
        { label: "Physical surface", value: "not_reported", source: "missing_bridge", summary: "No physical surface ref is available." },
        { label: "Required skill", value: "not_reported", source: "missing_bridge", summary: "No required skill ref is available." },
        { label: "Codex surface", value: "missing_codex_surface", source: "missing_bridge", summary: "No Codex/App exposure surface ref is available." }
      ],
      statusAxes: [
        { label: "Install", value: "missing_bridge", source: "missing_bridge" },
        { label: "Update", value: "missing_bridge", source: "missing_bridge" },
        { label: "Source", value: "missing_bridge", source: "missing_bridge" },
        { label: "Trust", value: "missing_bridge", source: "missing_bridge" },
        { label: "Codex surface", value: "missing_bridge", source: "missing_bridge" }
      ],
      actions: [],
      authorityBoundary: "One Person Lab displays App/root package refs only; it cannot infer installed, ready, synced, or release state."
    }
  ],
  starters: [
    {
      id: "mas",
      purpose: "research",
      title: "Research / MAS",
      requiredSkill: "mas",
      module: "MedAutoScience",
      intent: "Prepare a paper-mission preview request from local fields.",
      fields: [
        { name: "study", label: "Study", input: "text", value: "" },
        { name: "question", label: "Scientific question", input: "textarea", value: "" },
        { name: "output", label: "Output", input: "select", value: "decision_packet", options: ["decision_packet", "figure_refs", "review_response"] }
      ],
      available: false,
      status: "unavailable",
      sourceRef: "unavailable:no live App state action ref"
    },
    {
      id: "mag",
      purpose: "grant",
      title: "Grant / MAG",
      requiredSkill: "mag",
      module: "MedAutoGrant",
      intent: "Shape a grant-authoring preview request without grant authority.",
      fields: [
        { name: "mechanism", label: "Mechanism", input: "text", value: "" },
        { name: "aim", label: "Aim", input: "textarea", value: "" },
        { name: "stage", label: "Stage", input: "select", value: "outline", options: ["outline", "significance", "approach"] }
      ],
      available: false,
      status: "unavailable",
      sourceRef: "unavailable:no live App state action ref"
    },
    {
      id: "rca",
      purpose: "presentation",
      title: "Presentation / RCA",
      requiredSkill: "rca",
      module: "RedCube AI",
      intent: "Prepare a visual-deliverable preview request from refs.",
      fields: [
        { name: "scene", label: "Scene", input: "text", value: "" },
        { name: "assets", label: "Assets", input: "textarea", value: "" },
        { name: "format", label: "Format", input: "select", value: "slide_panel", options: ["slide_panel", "poster_panel", "figure_panel"] }
      ],
      available: false,
      status: "unavailable",
      sourceRef: "unavailable:no live App state action ref"
    },
    {
      id: "bookforge",
      purpose: "book",
      title: "Book / BookForge",
      requiredSkill: "opl-bookforge",
      module: "OPL BookForge",
      intent: "Start a manuscript-structure preview request.",
      fields: [
        { name: "book", label: "Book", input: "text", value: "" },
        { name: "chapter", label: "Chapter brief", input: "textarea", value: "" },
        { name: "mode", label: "Mode", input: "select", value: "outline", options: ["outline", "section_draft", "revision_map"] }
      ],
      available: false,
      status: "unavailable",
      sourceRef: "unavailable:no live App state action ref"
    }
  ],
  confirmations: [],
  questions: [],
  activeProjectLines: [],
  contextSources: [],
  contextActions: [],
  contextTrace: []
};
