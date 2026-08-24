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
  subagent?: {
    type: "collabAgentToolCall" | "subAgentActivity";
    agentRole?: string;
    agentNickname?: string;
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
  installed: boolean | null;
  activated: boolean | null;
  readiness: AgentPackageReadinessRef;
  version?: string;
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

export type WorkbenchModel = {
  purposes: WorkbenchPurpose[];
  sessions: WorkspaceSession[];
  results: WorkbenchArtifactRef[];
  deliverables: WorkbenchArtifactRef[];
  receipts: WorkbenchArtifactRef[];
  artifactPreviews: ArtifactPreview[];
  deliveryPackages: DeliveryPackage[];
  actionReceipts: ActionReceiptSummary[];
  packageLifecycle: AgentPackageLifecycleRef[];
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
      installed: null,
      activated: null,
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter((item): item is string => Boolean(item)) : [];
}

function asBoolean(value: unknown): boolean {
  return value === true || asString(value) === "true";
}

function asOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function readManagedUpdateDependencyVersion(value: unknown): ManagedUpdateDependencyVersion {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  const record = asRecord(value);
  if (!record || Object.values(record).some((item) => item !== null && typeof item !== "string")) return null;
  return Object.fromEntries(Object.entries(record)) as Record<string, string | null>;
}

function readManagedUpdateFlowDependency(value: Record<string, unknown>): ManagedFlowDependencyRef | null {
  const dependencyId = asString(value.dependency_id);
  const dependencyKind = asString(value.dependency_kind);
  if (!dependencyId || !dependencyKind) return null;
  return {
    dependencyId,
    dependencyKind,
    activation: asString(value.activation) ?? "unknown",
    offlineBundle: asString(value.offline_bundle) ?? "none",
    onlineInstallDefault: asOptionalBoolean(value.online_install_default),
    source: asString(value.source),
    sourcePath: asString(value.source_path),
    owner: asString(value.owner),
    bundleId: asString(value.bundle_id),
    versionRequirement: asString(value.version_requirement),
    installSource: asString(value.install_source),
    relationship: asString(value.relationship) ?? "required",
    lifecycleOwner: asString(value.lifecycle_owner) ?? "unknown",
    updateMode: asString(value.update_mode) ?? "unknown",
    installed: asOptionalBoolean(value.installed),
    observedStatus: asString(value.observed_status),
    status: asString(value.status) ?? "unknown",
    currentness: asString(value.currentness) ?? "unknown",
    version: readManagedUpdateDependencyVersion(value.version),
    latestVersion: readManagedUpdateDependencyVersion(value.latest_version),
    ownership: asString(value.ownership)
  };
}

function asLocalizedText(value: unknown): AgentPackageLocalizedText {
  const record = asRecord(value);
  const zh = firstString(record, ["zh-CN", "zh_CN", "zh"]);
  const en = firstString(record, ["en-US", "en_US", "en"]);
  return {
    ...(zh ? { zh } : {}),
    ...(en ? { en } : {})
  };
}

const domainDetailViewAvailabilities = new Set<DomainDetailViewAvailability>([
  "unread",
  "available",
  "missing",
  "stale",
  "invalid",
  "read_error"
]);

function readDomainDetailViewAvailability(value: unknown): DomainDetailViewAvailability | null {
  const candidate = asString(value);
  return candidate && domainDetailViewAvailabilities.has(candidate as DomainDetailViewAvailability)
    ? candidate as DomainDetailViewAvailability
    : null;
}

function readDomainDetailViewRevision(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const revision = asFiniteNumber(value);
  return revision !== null && Number.isSafeInteger(revision) && revision >= 0 ? revision : undefined;
}

export function parseDomainDetailViewDescriptors(value: unknown, itemId: string): DomainDetailViewDescriptor[] {
  if (!Array.isArray(value)) return [];
  const seenViewIds = new Set<string>();
  return value.map((candidate, index): DomainDetailViewDescriptor => {
    const record = asRecord(candidate);
    const declaredItemId = asString(record?.item_id);
    const viewId = asString(record?.view_id) ?? `invalid-view-${index + 1}`;
    const viewKind = asString(record?.view_kind) ?? "unknown";
    const title = asString(record?.title) ?? undefined;
    const schemaRef = asString(record?.schema_ref) ?? undefined;
    const schemaVersion = asString(record?.schema_version) ?? undefined;
    const digest = asString(record?.digest) ?? undefined;
    const availability = readDomainDetailViewAvailability(record?.availability);
    const revisionValue = record?.revision;
    const revision = readDomainDetailViewRevision(revisionValue);
    const invalidReasons: string[] = [];
    if (!record) invalidReasons.push("descriptor_not_object");
    if (!declaredItemId) invalidReasons.push("item_id_missing");
    else if (declaredItemId !== itemId) invalidReasons.push("item_id_mismatch");
    if (!asString(record?.view_id)) invalidReasons.push("view_id_missing");
    if (!asString(record?.view_kind)) invalidReasons.push("view_kind_missing");
    if (!availability) invalidReasons.push("availability_invalid");
    if (revisionValue !== undefined && revisionValue !== null && revision === undefined) {
      invalidReasons.push("revision_invalid");
    }
    if (seenViewIds.has(viewId)) invalidReasons.push("view_id_duplicate");
    seenViewIds.add(viewId);
    return {
      itemId: declaredItemId ?? itemId,
      viewId,
      viewKind,
      ...(title ? { title } : {}),
      ...(schemaRef ? { schemaRef } : {}),
      ...(schemaVersion ? { schemaVersion } : {}),
      ...(revision !== undefined ? { revision } : {}),
      ...(digest ? { digest } : {}),
      availability: invalidReasons.length ? "invalid" : availability as DomainDetailViewAvailability,
      valid: invalidReasons.length === 0,
      ...(invalidReasons.length ? { invalidReason: invalidReasons.join(",") } : {})
    };
  });
}

function readWorkItemRuntimeProjection(value: unknown): WorkItemRuntimeProjection | undefined {
  const projection = asRecord(value);
  if (!projection || asString(projection.schema_version) !== "work-item-projection.v2") return undefined;
  const summary = asRecord(projection?.summary);
  const numberOrZero = (candidate: unknown) => asFiniteNumber(candidate) ?? 0;
  const agents = asRecordArray(projection?.agent_catalog).flatMap((agent) => {
    const id = asString(agent.agent_id);
    if (!id) return [];
    return [{ id, label: asString(agent.display_name) ?? id }];
  });
  const projects = asRecordArray(projection?.project_catalog).flatMap((project) => {
    const id = asString(project.project_id);
    if (!id) return [];
    return [{
      id,
      agentId: asString(project.agent_id) ?? "unknown",
      label: asString(project.display_name) ?? id,
      ...(asString(project.workspace_path) ? { workspacePath: asString(project.workspace_path) as string } : {})
    }];
  });
  const items = asRecordArray(projection?.items).flatMap((item): WorkItemRuntimeItem[] => {
    const identity = asRecord(item.identity);
    const lifecycle = asRecord(item.lifecycle);
    const visibility = asRecord(item.visibility);
    const execution = asRecord(item.execution);
    const qualityBudget = asRecord(execution?.quality_budget);
    const sessionActivity = asRecord(item.session_activity);
    const attention = asRecord(item.attention);
    const telemetry = asRecord(item.telemetry);
    const currentStageTelemetry = asRecord(telemetry?.current_stage);
    const cumulativeTelemetry = asRecord(telemetry?.cumulative);
    const action = asRecord(item.action);
    const id = asString(item.item_id);
    const agentId = asString(identity?.agent_id);
    const domainId = asString(identity?.domain_id);
    const projectId = asString(identity?.project_id);
    const workItemId = asString(identity?.work_item_id);
    const domainWorkItemId = asString(identity?.domain_work_item_id);
    const workItemScopeId = asString(identity?.work_item_scope_id);
    const identityState = asString(identity?.identity_state);
    const workspacePath = asString(identity?.workspace_path);
    const attemptId = asString(execution?.attempt_id);
    const title = asString(identity?.work_item_display_name);
    if (!id || !agentId || !projectId || !workItemId || !title) return [];
    const domainDetailViews = parseDomainDetailViewDescriptors(item.domain_detail_views, id);
    const status = asString(lifecycle?.primary_state) ?? asString(lifecycle?.business_state) ?? "unknown";
    return [{
      id,
      agentId,
      agentDisplayName: asString(identity?.agent_display_name) ?? agentId,
      ...(domainId ? { domainId } : {}),
      projectId,
      projectDisplayName: asString(identity?.project_display_name) ?? projectId,
      ...(workspacePath ? { workspacePath } : {}),
      workItemId,
      ...(domainWorkItemId ? { domainWorkItemId } : {}),
      ...(workItemScopeId ? { workItemScopeId } : {}),
      ...(identityState ? { identityState } : {}),
      title,
      ...(asString(identity?.work_item_kind) ? { kind: asString(identity?.work_item_kind) as string } : {}),
      status,
      statusLabel: asString(lifecycle?.primary_state_label) ?? status,
      ...(asString(lifecycle?.primary_state_reason) ?? asString(lifecycle?.reason)
        ? { statusReason: (asString(lifecycle?.primary_state_reason) ?? asString(lifecycle?.reason)) as string }
        : {}),
      ...(asString(lifecycle?.current_stage_id) ?? asString(execution?.current_stage_id)
        ? { currentStageId: (asString(lifecycle?.current_stage_id) ?? asString(execution?.current_stage_id)) as string }
        : {}),
      ...(asString(lifecycle?.current_stage_display_name) ?? asString(execution?.current_stage_display_name)
        ? { currentStageName: (asString(lifecycle?.current_stage_display_name) ?? asString(execution?.current_stage_display_name)) as string }
        : {}),
      ...(attemptId ? { attemptId } : {}),
      ...(asString(execution?.next_stage_id) ? { nextStageId: asString(execution?.next_stage_id) as string } : {}),
      ...(asString(execution?.next_stage_display_name) ? { nextStageName: asString(execution?.next_stage_display_name) as string } : {}),
      executionState: asString(execution?.state) ?? "unknown",
      activeSessionCount: numberOrZero(sessionActivity?.active_session_count),
      attentionKind: asString(attention?.kind) ?? "none",
      ...(asString(action?.title) ? { nextActionTitle: asString(action?.title) as string } : {}),
      ...(asString(action?.summary) ? { nextActionSummary: asString(action?.summary) as string } : {}),
      ...(asString(action?.owner_display_name) ?? asString(action?.owner)
        ? { nextActionOwner: (asString(action?.owner_display_name) ?? asString(action?.owner)) as string }
        : {}),
      ...(asString(execution?.started_at) ? { startedAt: asString(execution?.started_at) as string } : {}),
      ...(asString(execution?.updated_at) ?? asString(lifecycle?.last_transition_at)
        ? { updatedAt: (asString(execution?.updated_at) ?? asString(lifecycle?.last_transition_at)) as string }
        : {}),
      elapsedMs: asFiniteNumber(qualityBudget?.elapsed_ms),
      stageTokens: asFiniteNumber(currentStageTelemetry?.total_tokens),
      totalTokens: asFiniteNumber(cumulativeTelemetry?.total_tokens),
      telemetryState: asString(telemetry?.state) ?? "missing",
      ...(asString(telemetry?.missing_reason) ?? asString(cumulativeTelemetry?.missing_reason)
        ? { telemetryMissingReason: (asString(telemetry?.missing_reason) ?? asString(cumulativeTelemetry?.missing_reason)) as string }
        : {}),
      archived: asString(visibility?.state) === "archived",
      stages: asRecordArray(item.stage_map).flatMap((stage): WorkItemRuntimeStage[] => {
        const stageId = asString(stage.stage_id);
        if (!stageId) return [];
        const usage = asRecord(stage.usage);
        return [{
          stageId,
          displayName: asString(stage.display_name) ?? stageId,
          displayNameI18n: asLocalizedText(stage.display_names),
          state: asString(stage.state) ?? "unknown",
          ...(asString(stage.owner) ? { owner: asString(stage.owner) as string } : {}),
          ...(asString(stage.owner_display_name) ? { ownerDisplayName: asString(stage.owner_display_name) as string } : {}),
          elapsedSeconds: asFiniteNumber(stage.elapsed_seconds),
          totalTokens: asFiniteNumber(usage?.total_tokens)
        }];
      }),
      ...(Array.isArray(item.domain_detail_views) ? { domainDetailViews } : {})
    }];
  });

  return {
    schemaVersion: "work-item-projection.v2",
    ...(asString(projection.generated_at) ? { generatedAt: asString(projection.generated_at) as string } : {}),
    summary: {
      agentCount: numberOrZero(summary?.agent_count),
      projectCount: numberOrZero(summary?.project_count),
      workItemCount: numberOrZero(summary?.work_item_count),
      archivedWorkItemCount: numberOrZero(summary?.archived_work_item_count),
      runningCount: numberOrZero(summary?.running_count),
      activeSessionCount: numberOrZero(summary?.active_session_count),
      userAttentionCount: numberOrZero(summary?.user_attention_count),
      systemAttentionCount: numberOrZero(summary?.system_attention_count),
      telemetryObservedCount: numberOrZero(summary?.telemetry_observed_count),
      telemetryMissingCount: numberOrZero(summary?.telemetry_missing_count)
    },
    agents,
    projects,
    items
  };
}

function firstString(record: Record<string, unknown> | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(record?.[key]);
    if (value) return value;
  }
  return null;
}

function firstBoolean(record: Record<string, unknown> | null, keys: string[]): boolean {
  return keys.some((key) => asBoolean(record?.[key]));
}

function nestedRecord(record: Record<string, unknown> | null, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const value = asRecord(record?.[key]);
    if (value) return value;
  }
  return null;
}

function payloadRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  return nestedRecord(record, ["result", "data", "payload", "response"]) ?? record;
}

function listRecords(value: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(value)) return asRecordArray(value);
  const payload = payloadRecord(value);
  for (const key of keys) {
    const items = asRecordArray(payload?.[key]);
    if (items.length || Array.isArray(payload?.[key])) return items;
  }
  return [];
}

function timestampString(value: unknown): string | undefined {
  const text = asString(value);
  if (text) return text;
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }
  return undefined;
}

function pathLabel(value: string): string {
  const normalized = value.replace(/\/$/, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? value;
}

const managedCodexScratchPatterns = [
  /^\/Users\/[^/]+\/Documents\/Codex(?:\/|$)/i,
  /^\/home\/[^/]+\/Documents\/Codex(?:\/|$)/i,
  /^[a-z]:\/Users\/[^/]+\/Documents\/Codex(?:\/|$)/i,
  /^\/mnt\/[a-z]\/Users\/[^/]+\/Documents\/Codex(?:\/|$)/i,
  /\/(?:Library\/Application Support\/One Person Lab\/opl-data|\.opl-app-data)\/conversations(?:\/[^/]+)*\/codex-temp-[^/]+$/i
];

export function isManagedCodexScratchWorkspace(workspace: string): boolean {
  const normalized = workspace.trim().replaceAll("\\", "/").replace(/\/{2,}/g, "/");
  return managedCodexScratchPatterns.some((pattern) => pattern.test(normalized));
}

function threadFromRecord(
  record: Record<string, unknown>,
  inheritedProject?: Record<string, unknown>
): WorkbenchThreadItem | null {
  const id = firstString(record, ["id", "threadId", "thread_id", "threadID"]);
  if (!id) return null;
  const project = nestedRecord(record, ["project", "projectRef", "project_ref"]) ?? inheritedProject ?? null;
  const projectId = firstString(record, ["projectId", "project_id"])
    ?? firstString(project, ["id", "projectId", "project_id"])
    ?? undefined;
  const projectLabel = firstString(record, ["projectLabel", "project_label", "projectName", "project_name"])
    ?? firstString(project, ["label", "name", "title"])
    ?? undefined;
  const workspace = firstString(record, ["workspace", "workspaceRoot", "workspace_root", "cwd", "path"])
    ?? firstString(project, ["workspace", "workspaceRoot", "workspace_root", "cwd", "path"])
    ?? undefined;
  return {
    id,
    sessionId: firstString(record, ["sessionId", "session_id"]) ?? undefined,
    projectKey: firstString(record, ["projectKey", "project_key"]) ?? undefined,
    sourceKind: firstString(record, ["sourceKind", "source_kind"])
      ?? firstString(nestedRecord(record, ["threadSource", "thread_source"]), ["type", "kind"])
      ?? firstString(record, ["threadSource", "thread_source"])
      ?? firstString(nestedRecord(record, ["source"]), ["type", "kind"])
      ?? firstString(record, ["source"])
      ?? undefined,
    agentRole: firstString(record, ["agentRole", "agent_role"]) ?? undefined,
    agentNickname: firstString(record, ["agentNickname", "agent_nickname"]) ?? undefined,
    title: firstString(record, ["title", "name", "displayName", "display_name", "summary", "preview", "subject"])
      ?? `Thread ${id.slice(0, 8)}`,
    projectId,
    canonicalProjectId: firstString(record, ["canonicalProjectId", "canonical_project_id"])
      ?? firstString(asRecord(record.extra), ["canonicalProjectId", "canonical_project_id"])
      ?? undefined,
    projectLabel,
    workspace,
    isTemporaryWorkspace: firstBoolean(record, ["isTemporaryWorkspace", "is_temporary_workspace"])
      || firstBoolean(asRecord(record.extra), ["isTemporaryWorkspace", "is_temporary_workspace"]),
    currentWorkspace: firstBoolean(record, ["currentWorkspace", "current_workspace"]),
    parentThreadId: firstString(record, ["parentThreadId", "parent_thread_id", "parentId", "parent_id"]) ?? undefined,
    activeTurnId: firstString(record, ["activeTurnId", "active_turn_id"])
      ?? firstString(nestedRecord(record, ["activeTurn", "active_turn"]), ["id", "turnId", "turn_id"])
      ?? undefined,
    status: firstString(record, ["status", "state", "phase"]) ?? "unknown",
    preview: firstString(record, ["preview", "summary", "lastMessage", "last_message", "snippet"]) ?? "",
    updatedAt: timestampString(record.updatedAt ?? record.updated_at ?? record.modifiedAt ?? record.modified_at),
    archived: firstBoolean(record, ["archived", "isArchived", "is_archived"])
  };
}

export function deriveThreadDirectory(value: unknown): WorkbenchProjectGroup[] {
  const payload = payloadRecord(value);
  const projectRows = asRecordArray(payload?.projects ?? payload?.workspaces);
  const inheritedThreads = projectRows.flatMap((project) => {
    const rows = asRecordArray(project.threads ?? project.items);
    return rows.map((thread) => threadFromRecord(thread, project));
  });
  const directThreads = listRecords(value, ["data", "threads", "items", "entries"])
    .map((thread) => threadFromRecord(thread));
  const threads = [...inheritedThreads, ...directThreads]
    .filter((thread): thread is WorkbenchThreadItem => Boolean(thread));
  const uniqueThreads = Array.from(new Map(threads.map((thread) => [thread.id, thread])).values());
  const groups = new Map<string, WorkbenchProjectGroup>();

  for (const thread of uniqueThreads) {
    const canonicalProjectId = thread.canonicalProjectId?.trim();
    const workspace = thread.workspace?.trim();
    const projectless = !canonicalProjectId && (
      thread.isTemporaryWorkspace
      || !workspace
      || isManagedCodexScratchWorkspace(workspace)
    );
    const projectKey = canonicalProjectId
      ? `project:${canonicalProjectId}`
      : projectless
        ? "projectless"
        : `workspace:${workspace}`;
    const group = groups.get(projectKey) ?? {
      id: projectKey,
      label: projectless
        ? "No project"
        : thread.projectLabel ?? pathLabel(canonicalProjectId ?? workspace ?? "Project"),
      workspace: projectless ? undefined : workspace,
      projectless,
      threads: []
    };
    group.threads.push(thread);
    groups.set(projectKey, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      threads: group.threads.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
    }))
    .sort((left, right) => {
      const leftUpdated = left.threads[0]?.updatedAt ?? "";
      const rightUpdated = right.threads[0]?.updatedAt ?? "";
      return Number(left.projectless) - Number(right.projectless)
        || rightUpdated.localeCompare(leftUpdated)
        || left.label.localeCompare(right.label);
    });
}

function textFromContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFromContent).filter(Boolean).join("\n");
  const record = asRecord(value);
  if (!record) return "";
  return firstString(record, ["text", "content", "message", "delta", "output_text"])
    ?? textFromContent(record.parts ?? record.items ?? record.content)
    ?? "";
}

function messageFromRecord(record: Record<string, unknown>, index: number): WorkbenchThreadMessage | null {
  const type = firstString(record, ["type", "kind", "event"])?.toLowerCase() ?? "";
  const subagentType = type === "collabagenttoolcall"
    ? "collabAgentToolCall"
    : type === "subagentactivity"
      ? "subAgentActivity"
      : null;
  if (subagentType) {
    const agent = nestedRecord(record, ["agent", "subAgent", "sub_agent"]);
    const agentRole = firstString(record, ["agentRole", "agent_role"]) ?? firstString(agent, ["role", "agentRole", "agent_role"]) ?? undefined;
    const agentNickname = firstString(record, ["agentNickname", "agent_nickname", "nickname"])
      ?? firstString(agent, ["nickname", "agentNickname", "agent_nickname"])
      ?? undefined;
    const status = firstString(record, ["status", "state", "phase"]);
    const text = firstString(record, ["text", "message", "summary", "title", "tool"])
      ?? [agentNickname ?? agentRole ?? "Subagent", status].filter(Boolean).join(" · ");
    return {
      id: firstString(record, ["id", "itemId", "item_id", "callId", "call_id"]) ?? `subagent-item-${index}`,
      role: "system",
      text,
      subagent: { type: subagentType, agentRole, agentNickname }
    };
  }
  const explicitRole = firstString(record, ["role", "author"]);
  const role = explicitRole === "user" || /user.?message|input.?message/.test(type)
    ? "user"
    : explicitRole === "assistant" || /agent.?message|assistant.?message|output.?message/.test(type)
      ? "assistant"
      : explicitRole === "system"
        ? "system"
        : null;
  if (!role) return null;
  const text = firstString(record, ["text", "message", "output_text"])
    ?? textFromContent(record.content ?? record.parts ?? record.items);
  if (!text.trim()) return null;
  return {
    id: firstString(record, ["id", "itemId", "item_id", "messageId", "message_id"]) ?? `thread-message-${index}`,
    role,
    text
  };
}

export function deriveThreadMessages(value: unknown): WorkbenchThreadMessage[] {
  const payload = payloadRecord(value);
  const thread = nestedRecord(payload, ["thread"]);
  const direct = [payload, thread]
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .flatMap((record) => asRecordArray(record.messages ?? record.items));
  const turns = [payload, thread]
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .flatMap((record) => asRecordArray(record.turns));
  const turnItems = turns.flatMap((turn) => asRecordArray(turn.items ?? turn.messages));
  return [...direct, ...turnItems]
    .map(messageFromRecord)
    .filter((message): message is WorkbenchThreadMessage => Boolean(message));
}

function uniqueByRef<T extends { ref?: string; route?: string; id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.ref ?? item.route ?? item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceRef(id: string, label: string, ref: unknown, summary: string): WorkbenchSourceRef | null {
  const value = asString(ref);
  return value ? { id, label, ref: value, summary } : null;
}

function actionText(action: WorkbenchActionRef): string {
  return `${action.id} ${action.label} ${action.route} ${action.delegatedSurface ?? ""}`.toLowerCase();
}

function previewKindFromText(value: string): WorkbenchPreviewKind {
  const text = value.toLowerCase();
  if (/pdf/.test(text)) return "pdf";
  if (/mermaid|diagram|flow/.test(text)) return "mermaid";
  if (/math|latex|katex|equation/.test(text)) return "math";
  if (/json|receipt|preview|diff|patch|code/.test(text)) return "code";
  if (/markdown|brief|review|result|handoff|summary|workflow|artifact|export/.test(text)) return "markdown";
  return "json";
}

function previewKindFromRef(ref: string, summary = ""): WorkbenchPreviewKind {
  return previewKindFromText(`${ref} ${summary}`);
}

function isDeliveryAction(action: WorkbenchActionRef): boolean {
  return /deliver|export|bundle|result|review|handoff|package/.test(actionText(action));
}

function isReceiptAction(action: WorkbenchActionRef): boolean {
  return /receipt|preview|dry.?run|export|bundle/.test(actionText(action));
}

function actionStatus(action: WorkbenchActionRef): ActionReceiptSummary["status"] {
  if (!action.dryRunSupported) return "unavailable";
  return action.payloadFields.length ? "payload_required" : "preview";
}

const starterPreviewRouteIds: Record<WorkbenchStarter["id"], string[]> = {
  // Source-marker contract: live starter actions are preview_route_not_domain_execution.
  mas: ["task_action_receipt_preview", "task_export_bundle_preview", "settings_sync_capabilities"],
  mag: ["task_export_bundle_preview", "task_action_receipt_preview", "settings_sync_capabilities"],
  rca: ["task_export_bundle_preview", "task_action_receipt_preview", "settings_sync_capabilities"],
  bookforge: ["workspace_ensure", "task_export_bundle_preview", "settings_sync_capabilities"]
};

function firstPreviewAction(actions: WorkbenchActionRef[]): WorkbenchActionRef | undefined {
  return actions.find((action) => action.dryRunSupported && isDeliveryAction(action))
    ?? actions.find((action) => action.dryRunSupported && action.payloadFields.length === 0)
    ?? actions.find((action) => action.dryRunSupported);
}

function moduleKey(value: string): WorkbenchStarter["id"] | null {
  const key = value.toLowerCase();
  if (key.includes("medautoscience") || key.includes("med auto science")) return "mas";
  if (key.includes("medautogrant") || key.includes("med auto grant")) return "mag";
  if (key.includes("redcube") || key.includes("redcube ai")) return "rca";
  if (key.includes("oplbookforge") || key.includes("opl book forge") || key.includes("bookforge")) return "bookforge";
  return null;
}

function starterPreviewAction(starter: WorkbenchStarter, actions: WorkbenchActionRef[]): WorkbenchActionRef | undefined {
  const exactIds = [`starter.${starter.id}`, `starter_${starter.id}`, `${starter.id}_starter`];
  const dedicated = actions.find((action) => action.dryRunSupported && exactIds.some((id) => action.id.includes(id)));
  if (dedicated) return dedicated;
  const routeIds = starterPreviewRouteIds[starter.id];
  return routeIds.map((id) => actions.find((action) => action.id === id && action.dryRunSupported)).find(Boolean);
}

function pickActiveProjectLines(value: unknown, fallback: ActiveProjectLine[]): ActiveProjectLine[] {
  const valueRecord = asRecord(value);
  const rawLines: unknown[] = Array.isArray(value)
    ? value
    : Array.isArray(valueRecord?.items)
      ? valueRecord.items
      : [];
  const lines = rawLines.map(asRecord).filter(Boolean).map((line): ActiveProjectLine => ({
    status: asString(line?.status) ?? "unknown",
    activeRunId: asString(line?.active_run_id) ?? asString(line?.activeRunId) ?? "",
    nextVisibleStep: asString(line?.next_visible_step) ?? asString(line?.nextVisibleStep) ?? "Review current refs",
    progressDeltaClassification: asString(line?.progress_delta_classification) ?? asString(line?.progressDeltaClassification) ?? "platform_or_observability_delta",
    deliverableProgressDelta: asString(line?.deliverable_progress_delta) ?? asString(line?.deliverableProgressDelta) ?? "refs visible",
    platformRepairDelta: asString(line?.platform_repair_delta) ?? asString(line?.platformRepairDelta) ?? "none",
    nextForcedDelta: asString(line?.next_forced_delta) ?? asString(line?.nextForcedDelta) ?? "owner adoption gate"
  })).filter((line) => line.status !== "candidate_preview_only" && !line.activeRunId?.startsWith("placeholder-"));
  return lines.length ? lines : fallback;
}

function pickAppState(state: unknown): Record<string, unknown> | null {
  const root = asRecord(state);
  return asRecord(root?.app_state) ?? root;
}

function compactText(value: unknown, fallback: string, max = 160): string {
  const text = asString(value)?.replace(/\s+/g, " ").trim() ?? fallback;
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function compactRef(value: string, max = 56): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function previewField(label: string, value: unknown): { label: string; value: string } | null {
  const text = asString(value);
  return text ? { label, value: text } : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function formatTimestamp(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  return text.replace("T", " ").replace(".000Z", "Z");
}

function usageSummary(usage: Record<string, unknown> | null): string | null {
  if (!usage) return null;
  const telemetry = asString(usage.telemetry_status) ?? "unknown";
  const calls = usage.api_call_count_observed ?? usage.observed_attempt_count;
  const duration = usage.duration_ms_observed;
  const sourceRefs = usage.source_ref_count;
  const parts = [
    `telemetry ${telemetry}`,
    typeof calls === "number" ? `${calls} calls` : null,
    typeof duration === "number" && duration > 0 ? `${duration} ms` : null,
    typeof sourceRefs === "number" ? `${sourceRefs} refs` : null
  ];
  return uniqueStrings(parts).join(" | ");
}

function taskAcceptedShapes(task: Record<string, unknown>, currentOwnerDelta: Record<string, unknown> | null): string[] {
  const stageRun = asRecord(task.stage_run_cockpit_summary) ?? asRecord(task.stage_run_current_owner_delta) ?? asRecord(task.stage_run_cockpit);
  return uniqueStrings([
    ...asStringArray(currentOwnerDelta?.accepted_answer_shape),
    ...asStringArray(stageRun?.accepted_return_shapes),
    ...asStringArray(stageRun?.required_return_shapes)
  ]);
}

function previewAuthorityBoundary(previewKind: WorkbenchPreviewKind, fallback = "Refs-only preview; body remains source-owned."): string {
  if (previewKind === "json") return "Structured receipt envelope only; no receipt body authority.";
  if (previewKind === "code") return "Manifest and patch-style projection only; no executable artifact body authority.";
  if (previewKind === "mermaid") return "Trace projection only; no workflow truth transfer.";
  if (previewKind === "pdf") return "Local export shell only; final file authority remains outside the workbench.";
  return fallback;
}

function artifactPreviewFromItem(item: WorkbenchArtifactRef): ArtifactPreview {
  return {
    id: item.id,
    label: item.kind === "receipt" ? "Receipt" : item.kind === "deliverable" ? "Deliverable" : item.title,
    previewKind: item.previewKind,
    rendererModuleId: rendererModuleIdForPreviewKind(item.previewKind),
    title: item.title,
    ref: item.ref,
    summary: item.summary,
    fields: [
      { label: "Kind", value: item.kind },
      { label: "Status", value: item.status.replaceAll("_", " ") },
      { label: "Primary ref", value: compactRef(item.ref) }
    ],
    bullets: item.actions,
    sourceRefs: uniqueStrings([item.ref, ...item.provenance]),
    authorityBoundary: previewAuthorityBoundary(item.previewKind)
  };
}

type ArtifactStatusSource = "derived" | "app_canonical";

const nonReadyBoundaryStatusPattern = /candidate|fallback|placeholder|simulat|preview|dry.?run|refs.?only|non.?live|no.?live|local.?draft/i;
const blockedStatusPattern = /blocked|dirty|error|attention|unavailable|failed|failure|timed.?out|missing/i;
const explicitReadyStatusPattern = /^(ready|succeeded|success|completed|complete)$/i;

function artifactStatus(value: unknown, source: ArtifactStatusSource = "derived"): WorkbenchArtifactRef["status"] {
  const text = (asString(value) ?? "").toLowerCase();
  if (blockedStatusPattern.test(text)) return "blocked";
  if (nonReadyBoundaryStatusPattern.test(text)) return "needs_review";
  if (source === "app_canonical" && explicitReadyStatusPattern.test(text)) return "ready";
  return "needs_review";
}

function fieldLabel(name: string): string {
  const labels: Record<string, string> = {
    task_id: "Task ID",
    action_ref: "Action ref",
    export_bundle_ref: "Export bundle ref",
    agent_id: "Agent ID",
    workspace_root_optional: "Workspace root",
    workspace_id: "Workspace ID",
    project_id: "Project ID",
    mode: "Mode",
    title: "Title"
  };
  return labels[name] ?? name.replace(/_/g, " ");
}

function fieldInput(name: string): WorkbenchStarterField["input"] {
  if (name === "mode") return "select";
  if (/ref|path|prompt|question|summary|note|description|title/.test(name)) return "textarea";
  return "text";
}

function fieldOptions(name: string): string[] | undefined {
  if (name === "mode") return ["existing", "create"];
  return undefined;
}

function ensureDryRunJsonRoute(route: string): string {
  const withDryRun = route.includes("--dry-run") ? route : `${route} --dry-run`;
  return withDryRun.includes("--json") ? withDryRun : `${withDryRun} --json`;
}

function extractActionId(ref: unknown): string | null {
  const value = asString(ref);
  if (!value) return null;
  const match = value.match(/#([A-Za-z0-9_.-]+)$/);
  return match?.[1] ?? null;
}

function firstStringField(record: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = asString(record[field]);
    if (value) return value;
    const values = asStringArray(record[field]);
    if (values[0]) return values[0];
  }
  return null;
}

function packageIdentity(record: Record<string, unknown>, index: number): string {
  return firstStringField(record, ["package_id", "packageId", "agent_id", "module_id", "id"])
    ?? `package-${index}`;
}

function packageLabel(record: Record<string, unknown>): string {
  return firstStringField(record, ["display_name", "displayName", "package_short_name", "label", "name", "module_id"])
    ?? "Agent package";
}

function packageDisplayRef(label: string, ref: string | null, summary: string): PackageLifecycleDisplayRef | null {
  return ref ? { label, ref, summary } : null;
}

function recordValues(value: unknown): Record<string, unknown>[] {
  const record = asRecord(value);
  return record ? Object.values(record).map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function packageFileRef(record: Record<string, unknown>, key: string): string | null {
  return asString(asRecord(record.files)?.[key]);
}

function canonicalSummaryRow(agentPackages: Record<string, unknown>): Record<string, unknown> {
  const directory = asRecord(agentPackages.directory);
  const statusIndex = asRecord(agentPackages.status_index);
  const files = {
    ...(asRecord(directory?.files) ?? {}),
    ...(asRecord(statusIndex?.files) ?? {}),
    ...(asRecord(agentPackages.files) ?? {})
  };
  const installedCount = directory?.installed_package_count ?? statusIndex?.installed_package_count ?? 0;
  return {
    surface_kind: asString(agentPackages.surface_kind) ?? "opl_app_agent_packages_projection",
    package_id: "agent_packages_directory",
    display_name: "Agent package directory",
    lifecycle_status: installedCount ? "canonical_projection_available" : "canonical_projection_available_no_installed_packages",
    install_state: installedCount ? "canonical_rows_available" : "no_installed_package_rows",
    update_state: asString(directory?.status) ?? "no_package_update_status",
    source_state: "canonical_agent_packages_projection",
    trust_state: "not_reported",
    codex_surface_state: installedCount ? "from_agent_packages_projection" : "no_codex_package_surface_rows",
    conditions: [
      `entry_count=${directory?.entry_count ?? 0}`,
      `installed_package_count=${installedCount}`,
      `migration_required_count=${directory?.migration_required_count ?? 0}`,
      "modules.items fallback suppressed because canonical agent_packages projection is present"
    ],
    recommended_action: installedCount ? "inspect package refs from app_state.agent_packages" : "install_from_manifest_url through App action refs",
    source_kind: asString(directory?.source_catalog_kind) ?? "canonical_agent_packages",
    source_surface: asString(asRecord(agentPackages.source)?.list_surface),
    files,
    physical_surface: {
      status: installedCount ? "package_rows_reported" : "no_installed_package_physical_surface",
      home_shortcut_preferences_file: asString(files.home_shortcut_preferences_file)
    }
  };
}

function packageRowsFromCanonicalProjection(agentPackages: Record<string, unknown> | null, appState: Record<string, unknown>): Record<string, unknown>[] {
  if (!agentPackages) return [];
  const directory = asRecord(agentPackages.directory);
  const statusIndex = asRecord(agentPackages.status_index);
  const directoryRows = asRecordArray(directory?.entries);
  const statusRows = [
    ...asRecordArray(statusIndex?.packages),
    ...recordValues(statusIndex?.packages),
    ...asRecordArray(agentPackages.status_packages),
    ...recordValues(agentPackages.status_packages)
  ];
  const homeRows = [
    ...asRecordArray(statusIndex?.home_shortcut_preferences),
    ...asRecordArray(agentPackages.home_shortcut_preferences),
    ...asRecordArray(appState.home_agent_shortcuts)
  ];
  const byId = new Map<string, Record<string, unknown>>();
  const mergeRow = (row: Record<string, unknown>) => {
    const id = packageIdentity(row, byId.size);
    byId.set(id, { ...(byId.get(id) ?? {}), ...row, package_id: id });
  };
  for (const row of statusRows) mergeRow(row);
  // Directory entries own lifecycle, presentation, readiness, and exact actions.
  for (const row of directoryRows) mergeRow(row);
  for (const row of homeRows) {
    const id = packageIdentity(row, byId.size);
    const current = byId.get(id) ?? { package_id: id };
    const preferences = asRecordArray(current.home_shortcut_preferences);
    byId.set(id, {
      ...current,
      package_id: id,
      home_shortcut_preferences: [...preferences, row]
    });
  }
  return Array.from(byId.values());
}

function packageStatusAxes(
  record: Record<string, unknown>,
  source: PackageLifecycleStatusAxis["source"]
): PackageLifecycleStatusAxis[] {
  const presence = asRecord(record.presence);
  const installedReadiness = asRecord(record.installed_readiness);
  const git = asRecord(record.git);
  return [
    {
      label: "Install",
      value: firstStringField(record, ["install_state", "install_status", "lifecycle_status", "status"])
        ?? asString(installedReadiness?.physical_status)
        ?? asString(presence?.status)
        ?? "unknown",
      source
    },
    { label: "Update", value: firstStringField(record, ["update_state", "update_status", "recommended_action"]) ?? asString(git?.sync_status) ?? "unknown", source },
    { label: "Source", value: packageSourceKind(record), source },
    { label: "Trust", value: firstStringField(record, ["trust_state", "trust_tier", "health_status"]) ?? "unknown", source },
    { label: "Codex surface", value: packageCodexSurface(record), source }
  ];
}

function packageConditionText(record: Record<string, unknown>): string {
  return uniqueStrings([
    ...asStringArray(record.conditions),
    ...asStringArray(record.failure_conditions),
    ...asStringArray(record.blocked_conditions),
    ...asStringArray(record.issues),
    ...asStringArray(record.diagnostics),
    asString(record.status_reason),
    asString(record.failure_reason),
    asString(record.reason)
  ]).join(" | ") || "none_reported";
}

function packageRecommendedAction(record: Record<string, unknown>): string {
  const recommendation = asRecord(record.action_recommendation) ?? asRecord(record.recommendation);
  return firstStringField(record, ["recommended_action", "recommendedAction", "next_action", "repair_action"])
    ?? firstStringField(recommendation ?? {}, ["action_id", "summary", "label"])
    ?? "none_reported";
}

function packageSourceKind(record: Record<string, unknown>): string {
  const sourceExplanation = asRecord(record.source_explanation);
  const installedCarrier = asRecord(record.installed_carrier_readback);
  const sourcePolicy = asRecord(record.source_policy);
  const distributionPayload = asRecord(record.distribution_payload);
  return firstStringField(record, ["source_kind", "install_origin", "source_state"])
    ?? firstStringField(sourceExplanation ?? {}, ["kind", "source"])
    ?? asString(installedCarrier?.kind)
    ?? asString(sourcePolicy?.effective_install_update_source)
    ?? asString(distributionPayload?.source_kind)
    ?? "unknown";
}

function packageEffectiveSourcePolicy(record: Record<string, unknown>): Record<string, unknown> | null {
  const sourceExplanation = asRecord(record.source_explanation);
  return asRecord(sourceExplanation?.effective_source_policy) ?? asRecord(record.source_policy);
}

function packageSourceMode(record: Record<string, unknown>): string {
  const sourcePolicy = packageEffectiveSourcePolicy(record);
  return asString(sourcePolicy?.effective_install_update_source)
    ?? asString(sourcePolicy?.desired_source_kind)
    ?? packageSourceKind(record);
}

function packageAutomaticUpdate(record: Record<string, unknown>): boolean | null {
  return asOptionalBoolean(packageEffectiveSourcePolicy(record)?.package_channel_auto_update);
}

function packageCapabilityMetadata(record: Record<string, unknown>): {
  requiredSkillIds: string[];
  optionalSkillRefs: string[];
} {
  const metadata = asRecord(record.capability_metadata);
  return {
    requiredSkillIds: asStringArray(metadata?.required_skill_ids),
    optionalSkillRefs: asStringArray(metadata?.optional_skill_refs)
  };
}

function packageReadiness(record: Record<string, unknown>, installed: boolean | null): AgentPackageReadinessRef {
  const readiness = asRecord(record.readiness);
  const presence = asRecord(record.presence);
  const present = asOptionalBoolean(presence?.present);
  const callable = asOptionalBoolean(presence?.callable);
  const operationalReady = asOptionalBoolean(readiness?.operational_ready);
  const launchAllowed = asOptionalBoolean(readiness?.launch_allowed);
  const unavailable = installed === false
    || present === false
    || callable === false
    || operationalReady === false
    || launchAllowed === false;
  const available = installed === true && present === true && callable === true;
  return {
    status: asString(readiness?.status) ?? "unknown",
    operationalReady,
    launchAllowed,
    verificationDeferred: asOptionalBoolean(readiness?.verification_deferred),
    ...(asString(readiness?.reason) ? { reason: asString(readiness?.reason) as string } : {}),
    ...(asString(readiness?.detail_surface) ? { detailSurface: asString(readiness?.detail_surface) as string } : {}),
    ...(asString(readiness?.status_read_error) ? { statusReadError: asString(readiness?.status_read_error) as string } : {}),
    present,
    callable,
    selectionStatus: unavailable ? "unavailable" : available ? "available" : "checking",
    // Unknown readiness remains selectable, but an explicit owner rejection is authoritative.
    selectable: !unavailable
  };
}

function packageHomeShortcuts(record: Record<string, unknown>): AgentPackageShortcutRef[] {
  const preferences = new Map(asRecordArray(record.home_shortcut_preferences).flatMap((preference) => {
    const shortcutId = firstStringField(preference, ["shortcut_id"]);
    return shortcutId ? [[shortcutId, preference] as const] : [];
  }));
  const shortcuts = asRecordArray(record.home_shortcuts);
  const projected = shortcuts.flatMap((shortcut, index): AgentPackageShortcutRef[] => {
    const shortcutId = firstStringField(shortcut, ["shortcut_id"]);
    if (!shortcutId) return [];
    const preference = preferences.get(shortcutId);
    const route = asRecord(shortcut.route);
    const routeKind = asString(route?.route_kind);
    const executor = asString(route?.executor);
    const codexVisibleEntry = asString(route?.codex_visible_entry);
    preferences.delete(shortcutId);
    return [{
      shortcutId,
      labelI18n: asLocalizedText(shortcut.label_i18n),
      defaultVisible: asOptionalBoolean(shortcut.default_visible),
      userConfigurable: asOptionalBoolean(shortcut.user_configurable),
      visible: asOptionalBoolean(preference?.visible) ?? asOptionalBoolean(shortcut.default_visible) ?? false,
      sortOrder: asFiniteNumber(preference?.sort_order) ?? asFiniteNumber(shortcut.sort_order) ?? index,
      ...(routeKind && executor && codexVisibleEntry
        ? { route: { routeKind, executor, codexVisibleEntry } }
        : {})
    }];
  });
  const preferenceOnly = Array.from(preferences.values()).flatMap((preference): AgentPackageShortcutRef[] => {
    const shortcutId = firstStringField(preference, ["shortcut_id"]);
    const visible = asOptionalBoolean(preference.visible);
    const sortOrder = asFiniteNumber(preference.sort_order);
    if (!shortcutId || visible === null || sortOrder === null) return [];
    return [{
      shortcutId,
      labelI18n: {},
      defaultVisible: null,
      userConfigurable: null,
      visible,
      sortOrder
    }];
  });
  return [...projected, ...preferenceOnly];
}

function packageManifestUrl(record: Record<string, unknown>): string | null {
  const value = firstStringField(record, ["manifest_url", "manifestUrl", "manifest_ref", "package_ref"]);
  if (!value || /^file:/i.test(value) || value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
    return null;
  }
  return value;
}

function packageSourceRefValue(record: Record<string, unknown>): string | null {
  const installedCarrier = asRecord(record.installed_carrier_readback);
  const configuredCarrier = asRecord(record.configured_carrier);
  const carrier = asRecord(configuredCarrier?.carrier);
  return asString(installedCarrier?.identity)
    ?? asString(configuredCarrier?.publication_ref)
    ?? asString(carrier?.plugin_id);
}

function packageRequiredSkill(record: Record<string, unknown>): string {
  const capabilityMetadata = asRecord(record.capability_metadata);
  return firstStringField(record, ["required_skill", "requiredSkill", "skill_id", "skill_ref"])
    ?? asStringArray(record.required_skills)[0]
    ?? asStringArray(capabilityMetadata?.required_skill_ids)[0]
    ?? "not_reported";
}

function packageCodexSurface(record: Record<string, unknown>): string {
  const capabilityExposure = asRecord(record.capability_exposure);
  const configuredCarrier = asRecord(record.configured_carrier);
  const executor = asRecord(configuredCarrier?.executor);
  const installedReadiness = asRecord(record.installed_readiness);
  return firstStringField(record, ["codex_surface_state", "codex_visible_entry", "shortcut_id", "codex_surface_ref"])
    ?? asString(asRecord(record.codex_surface)?.status)
    ?? asString(capabilityExposure?.status)
    ?? asString(executor?.status)
    ?? asString(installedReadiness?.callability)
    ?? "missing_codex_surface";
}

function packagePhysicalSurface(record: Record<string, unknown>): { status: string; ref?: string } {
  const installedReadiness = asRecord(record.installed_readiness);
  const presence = asRecord(record.presence);
  return {
    status: firstStringField(record, ["physical_surface_status"])
      ?? asString(installedReadiness?.physical_status)
      ?? asString(presence?.status)
      ?? "not_reported"
  };
}

function packageSourceExplanation(
  record: Record<string, unknown>,
  source: PackageLifecycleStatusAxis["source"]
): string {
  if (source === "legacy_modules_fallback") {
    return "legacy modules.items preview fallback; fallback rows are preview-only and all package actions stay unavailable.";
  }
  if (source === "missing_bridge") {
    return "missing App/root package bridge; no package lifecycle truth or executable action is inferred.";
  }
  const sourceKind = packageSourceKind(record).toLowerCase();
  const manifestUrl = packageManifestUrl(record);
  const sourceRefValue = packageSourceRefValue(record)?.toLowerCase() ?? "";
  if (/ghcr|oci|container|image/.test(`${sourceKind} ${sourceRefValue}`)) {
    return "ghcr_source: canonical App/root package projection points at an OCI/GHCR package source.";
  }
  if (manifestUrl) {
    return "manifest_url_source: canonical App/root package projection supplies a manifest URL/ref for install or update preview.";
  }
  if (/git|checkout|local|developer/.test(`${sourceKind} ${sourceRefValue}`)) {
    return "git_local_developer_source: canonical App/root package projection points at a git/local developer source.";
  }
  if (/managed|root|registry/.test(`${sourceKind} ${sourceRefValue}`)) {
    return "managed_source: canonical App/root managed package projection.";
  }
  return "canonical App/root agent_packages projection; Workbench renders refs and action availability only.";
}

function packageSearchMetadata(
  record: Record<string, unknown>,
  source: PackageLifecycleStatusAxis["source"]
): PackageLifecycleSearchMetadata {
  const sourceKind = packageSourceKind(record);
  const manifestUrl = packageManifestUrl(record);
  const sourceRefValue = packageSourceRefValue(record);
  const requiredSkill = packageRequiredSkill(record);
  const codexSurface = packageCodexSurface(record);
  const physicalSurface = packagePhysicalSurface(record);
  const query = uniqueStrings([
    packageIdentity(record, 0),
    packageLabel(record),
    source,
    sourceKind,
    manifestUrl,
    sourceRefValue,
    requiredSkill,
    codexSurface,
    physicalSurface.status,
    packageRecommendedAction(record),
    packageConditionText(record)
  ]).join(" ").toLowerCase();
  const tagText = `${sourceKind} ${sourceRefValue ?? ""} ${manifestUrl ?? ""}`.toLowerCase();
  const tags = uniqueStrings([
    source,
    sourceKind,
    /managed|root|registry/.test(tagText) ? "managed_source" : null,
    /ghcr|oci|container|image/.test(tagText) ? "ghcr_source" : null,
    manifestUrl ? "manifest_url_source" : null,
    /git|checkout|local|developer/.test(tagText) ? "git_local_developer_source" : null,
    codexSurface === "missing_codex_surface" || /missing/.test(codexSurface) ? "missing_codex_surface" : null,
    requiredSkill !== "not_reported" ? `required_skill:${requiredSkill}` : "required_skill:not_reported",
    physicalSurface.status
  ]);
  const filters = [
    packageDisplayRef("Source", source, "Projection source used for package lifecycle rendering."),
    packageDisplayRef("Source kind", sourceKind, "Search/filter source kind from App/root projection."),
    packageDisplayRef("Codex surface", codexSurface, "Codex/App exposure surface state from refs."),
    packageDisplayRef("Required skill", requiredSkill, "Required skill ref if App/root reports one."),
    packageDisplayRef("Physical surface", physicalSurface.status, "Physical surface status from App/root detail fields.")
  ].filter((item): item is PackageLifecycleDisplayRef => Boolean(item));
  return { query, tags, filters };
}

function packageLifecycleDetails(
  record: Record<string, unknown>,
  source: PackageLifecycleStatusAxis["source"]
): PackageLifecycleDetailRef[] {
  const physicalSurface = packagePhysicalSurface(record);
  const detail = (label: string, value: string | null, summary: string, ref?: string): PackageLifecycleDetailRef => ({
    label,
    value: value ?? "not_reported",
    source,
    ref,
    summary
  });
  return [
    detail("Status", firstStringField(record, ["lifecycle_status", "status", "install_state", "health_status"]), "Lifecycle status supplied by App/root projection."),
    detail("Conditions", packageConditionText(record), "Failure/blocking/diagnostic conditions from App/root projection."),
    detail("Recommended action", packageRecommendedAction(record), "Recommended action text or action id from App/root projection."),
    detail("Physical surface", physicalSurface.status, "Physical surface status is a detail ref, not package truth.", physicalSurface.ref),
    detail("Required skill", packageRequiredSkill(record), "Required skill surfaced for search/filter only."),
    detail("Codex surface", packageCodexSurface(record), "Codex/App exposure surface state from refs."),
    detail("Manifest URL", packageManifestUrl(record), "Manifest URL/ref is input metadata, not installed-ready proof."),
    detail("Source kind", packageSourceKind(record), "managed_source / ghcr_source / manifest_url_source / git_local_developer_source classification.")
  ];
}

function packageActionKind(value: string): PackageLifecycleActionKind {
  const semantic = value.trim().toLowerCase();
  if (semantic === "install" || semantic === "update" || semantic === "repair" || semantic === "uninstall") return semantic;
  if (semantic === "preferences") return "preferences";
  return "other";
}

function packageActionLabel(kind: PackageLifecycleActionKind, fallback: string): string {
  if (kind === "install") return "Install";
  if (kind === "update") return "Update";
  if (kind === "repair") return "Repair";
  if (kind === "uninstall") return "Uninstall";
  if (kind === "preferences") return "Preferences";
  return fallback;
}

function packageLifecycleActions(
  record: Record<string, unknown>,
  actionMap: Map<string, WorkbenchActionRef>,
  source: PackageLifecycleStatusAxis["source"]
): PackageLifecycleActionRef[] {
  if (source !== "canonical_agent_packages") return [];
  return asRecordArray(record.available_actions).flatMap((projectedAction) => {
    const actionId = asString(projectedAction.action_id);
    const actionRef = asString(projectedAction.action_ref);
    if (!actionId || !actionRef) return [];
    const semantic = asString(projectedAction.semantic) ?? actionId;
    const kind = packageActionKind(semantic);
    const action = actionMap.get(actionId);
    const payload = asRecord(projectedAction.payload) ?? {};
    const requiredPayloadFields = asStringArray(projectedAction.required_payload_fields);
    const confirmationRequired = typeof projectedAction.confirmation_required === "boolean"
      ? projectedAction.confirmation_required
      : action?.confirmationRequired ?? false;
    const status = action ? "available" : "unavailable";
    return [{
      kind,
      semantic,
      ...(asString(projectedAction.surface) ? { surface: asString(projectedAction.surface) as string } : {}),
      label: packageActionLabel(kind, action?.label ?? actionId),
      status,
      actionId,
      actionRef,
      route: action?.route,
      payload,
      requiredPayloadFields,
      confirmationRequired,
      dryRunSupported: action?.dryRunSupported ?? false,
      owner: action?.owner,
      delegatedSurface: action?.delegatedSurface,
      sourceRef: action?.route ?? actionRef,
      reason: action
        ? "Available through this package row's App-projected action contract."
        : "The package row exposes this action, but the matching App action definition is unavailable."
    } satisfies PackageLifecycleActionRef];
  });
}

function packageLifecycleItem(
  record: Record<string, unknown>,
  actionMap: Map<string, WorkbenchActionRef>,
  source: PackageLifecycleStatusAxis["source"]
): AgentPackageLifecycleRef {
  const packageId = packageIdentity(record, 0);
  const publisher = firstStringField(record, ["publisher"]) ?? "unknown";
  const packageRole = firstStringField(record, ["package_role"]) ?? "unknown";
  const official = asOptionalBoolean(record.official)
    ?? publisher.toLowerCase() === "one-person-lab";
  const roleGroup: AgentPackageLifecycleRef["roleGroup"] = packageRole === "standard_agent"
    ? (official ? "agent" : "other")
    : packageRole === "workflow_profile"
      ? "workflow"
      : official
        ? "supporting"
        : "other";
  const installed = asOptionalBoolean(record.installed ?? asRecord(record.installed_readiness)?.installed);
  const readiness = packageReadiness(record, installed);
  const capabilityMetadata = packageCapabilityMetadata(record);
  const packageCurrentness = asRecord(record.package_currentness);
  const sourceRef = source === "canonical_agent_packages"
    ? "opl app state --profile fast --json#app_state.agent_packages.directory + app_state.agent_packages.status_index"
    : source === "legacy_modules_fallback"
      ? "opl app state --profile fast --json#app_state.modules.items[]"
      : "missing_bridge";
  const refs = [
    packageDisplayRef("Manifest", packageManifestUrl(record), "Package manifest or source ref from App/root projection."),
    packageDisplayRef("Source", packageSourceRefValue(record), "Managed, GHCR, git, local developer, or registry source ref from App/root projection."),
    packageDisplayRef("Exposure", firstStringField(record, ["home_shortcut_ref", "shortcut_id", "codex_visible_entry", "display_policy"]), "Codex/App exposure ref supplied by App/root."),
    packageDisplayRef("Shortcut preferences", packageFileRef(record, "home_shortcut_preferences_file"), "Physical exposure preferences file surfaced as a ref only.")
  ].filter((item): item is PackageLifecycleDisplayRef => Boolean(item));
  const homeShortcuts = packageHomeShortcuts(record);
  return {
    id: `package-lifecycle-${packageId}`,
    packageId,
    label: packageLabel(record),
    description: firstStringField(record, ["description"]) ?? "",
    publisher,
    packageRole,
    roleGroup,
    official,
    displayNameI18n: asLocalizedText(record.display_name_i18n),
    descriptionI18n: asLocalizedText(record.description_i18n),
    sessionRoutingSummaryI18n: asLocalizedText(record.session_routing_summary_i18n),
    ...capabilityMetadata,
    installed,
    activated: asOptionalBoolean(record.activated),
    readiness,
    ...(firstStringField(record, ["selected_version", "installed_version", "stable_version"])
      ? { version: firstStringField(record, ["selected_version", "installed_version", "stable_version"]) as string }
      : {}),
    currentness: asString(packageCurrentness?.status) ?? "unknown",
    sourceMode: packageSourceMode(record),
    automaticUpdate: packageAutomaticUpdate(record),
    homeShortcuts,
    ...(firstStringField(record, ["recommended_action", "recommendedAction"])
      ? { recommendedActionId: firstStringField(record, ["recommended_action", "recommendedAction"]) as string }
      : {}),
    status: source === "legacy_modules_fallback"
      ? "preview_legacy_modules_fallback"
      : readiness.status !== "unknown"
        ? readiness.status
        : firstStringField(record, ["lifecycle_status", "status", "install_state", "health_status"])
          ?? "app_state_projection",
    summary: source === "canonical_agent_packages"
      ? "Canonical package lifecycle projection from App/root; Workbench only renders refs and action availability."
      : source === "legacy_modules_fallback"
        ? "Legacy modules.items fallback while canonical agent_packages projection is missing; no package installed/ready/synced claim is inferred."
        : "Package lifecycle bridge missing.",
    sourceRef,
    sourceExplanation: packageSourceExplanation(record, source),
    searchMetadata: packageSearchMetadata(record, source),
    refs,
    details: packageLifecycleDetails(record, source),
    statusAxes: packageStatusAxes(record, source),
    actions: packageLifecycleActions(record, actionMap, source),
    authorityBoundary: "One Person Lab consumes App/root package lifecycle refs and actions only; no executor, package truth, readiness, or release authority is created here."
  };
}

export function agentPackageSelectionIntent(agent: AgentPackageLifecycleRef): AgentPackageSelectionIntent {
  const shortcut = agent.homeShortcuts.find((candidate) => candidate.route);
  return {
    kind: "agent_package_selection",
    selectionId: `agent-package:${agent.packageId}`,
    packageId: agent.packageId,
    label: agent.label,
    description: agent.description,
    publisher: agent.publisher,
    displayNameI18n: { ...agent.displayNameI18n },
    descriptionI18n: { ...agent.descriptionI18n },
    sessionRoutingSummaryI18n: { ...agent.sessionRoutingSummaryI18n },
    requiredSkillIds: [...agent.requiredSkillIds],
    optionalSkillRefs: [...agent.optionalSkillRefs],
    readiness: { ...agent.readiness },
    ...(shortcut?.route ? { route: { shortcutId: shortcut.shortcutId, ...shortcut.route } } : {}),
    actions: agent.actions.map((action) => ({
      ...action,
      payload: { ...action.payload },
      requiredPayloadFields: [...action.requiredPayloadFields]
    })),
    ...(agent.recommendedActionId ? { recommendedActionId: agent.recommendedActionId } : {}),
    sourceRef: agent.sourceRef
  };
}

function legacyPackageRowsFromModules(moduleItems: Record<string, unknown>[]): Record<string, unknown>[] {
  return moduleItems.map((item) => ({
    ...item,
    package_id: firstStringField(item, ["module_id", "id"]),
    display_name: firstStringField(item, ["label", "module_id"]),
    install_state: "legacy_modules_fallback",
    update_state: firstStringField(item, ["recommended_action"]) ?? asString(asRecord(item.git)?.sync_status) ?? "unknown",
    source_state: asString(asRecord(item.source_policy)?.effective_install_update_source) ?? "legacy_modules_fallback",
    trust_state: firstStringField(item, ["health_status"]) ?? "unknown",
    codex_surface_state: "missing_agent_packages_projection"
  }));
}

function pickTaskKey(task: Record<string, unknown>): WorkbenchStarter["id"] | null {
  return moduleKey(
    `${asString(task.domain_id) ?? ""} ${asString(task.domain_label) ?? ""} ${asString(task.title) ?? ""}`
  );
}

function starterFieldValue(
  fieldName: string,
  task: Record<string, unknown> | null,
  moduleItem: Record<string, unknown> | null
): string {
  const actionReceipt = asRecord(task?.action_receipt);
  const artifact = asRecord(task?.artifact_or_blocker);
  const exportBundleRefs = asStringArray(artifact?.export_bundle_refs);
  if (fieldName === "task_id") return asString(task?.task_id) ?? asString(task?.domain_id) ?? "";
  if (fieldName === "action_ref") return asString(actionReceipt?.preview_ref) ?? "";
  if (fieldName === "export_bundle_ref") return exportBundleRefs[0] ?? asString(artifact?.export_ref) ?? "";
  if (fieldName === "agent_id") return asString(task?.domain_id) ?? asString(moduleItem?.module_id) ?? "";
  if (fieldName === "workspace_root_optional" || fieldName === "workspace_path") {
    return asString(task?.workspace_path) ?? asString(moduleItem?.checkout_path) ?? "";
  }
  if (fieldName === "workspace_id") return asString(task?.task_id) ?? asString(moduleItem?.module_id) ?? "";
  if (fieldName === "project_id") return asString(task?.task_id) ?? asString(moduleItem?.module_id) ?? "";
  if (fieldName === "mode") return "existing";
  if (fieldName === "title") return asString(task?.title) ?? asString(moduleItem?.label) ?? "";
  return asString(task?.title) ?? asString(moduleItem?.label) ?? "";
}

function buildStarterFields(
  starter: WorkbenchStarter,
  action: WorkbenchActionRef | undefined,
  task: Record<string, unknown> | null,
  moduleItem: Record<string, unknown> | null
): WorkbenchStarterField[] {
  if (!action?.payloadFields.length) return starter.fields;
  return action.payloadFields.map((name) => ({
    name,
    label: fieldLabel(name),
    input: fieldInput(name),
    value: starterFieldValue(name, task, moduleItem),
    options: fieldOptions(name)
  }));
}

function buildTaskSourceRefs(taskDrilldowns: Record<string, unknown>[]): WorkbenchSourceRef[] {
  return taskDrilldowns.flatMap((task) => {
    const taskId = asString(task.task_id) ?? "task";
    const title = asString(task.title) ?? taskId;
    const artifact = asRecord(task.artifact_or_blocker);
    const workflowRefs = asRecord(task.workflow_refs);
    const reviewReceipt = asRecord(task.review_receipt);
    const actionReceipt = asRecord(task.action_receipt);
    return [
      sourceRef(
        `task-${taskId}`,
        `${title} task`,
        artifact?.current_ref ?? workflowRefs?.current_workflow_ref ?? asString(task.workspace_path),
        compactText(task.next_visible_step, "Task status ref.")
      ),
      sourceRef(
        `workflow-${taskId}`,
        `${title} workflow`,
        workflowRefs?.current_workflow_ref ?? workflowRefs?.stage_workflow_ref,
        compactText(workflowRefs?.content_policy, "Refs-only workflow ref.")
      ),
      sourceRef(
        `review-${taskId}`,
        `${title} review receipt`,
        reviewReceipt?.receipt_ref,
        compactText(reviewReceipt?.authority_policy, "Reviewer receipt ref only.")
      ),
      sourceRef(
        `preview-${taskId}`,
        `${title} action preview`,
        actionReceipt?.preview_ref,
        compactText(actionReceipt?.content_policy, "Dry-run action preview ref.")
      )
    ].filter((item): item is WorkbenchSourceRef => Boolean(item));
  });
}

function buildResultsFromTasks(taskDrilldowns: Record<string, unknown>[]): WorkbenchArtifactRef[] {
  const items = taskDrilldowns.flatMap((task) => {
    const taskId = asString(task.task_id);
    const title = asString(task.title);
    const artifact = asRecord(task.artifact_or_blocker);
    const reviewReceipt = asRecord(task.review_receipt);
    const actionReceipt = asRecord(task.action_receipt);
    if (!taskId || !title) return [];
    return [
      {
        id: `result-${taskId}`,
        title: `${title} delta`,
        kind: "result" as const,
        status: artifactStatus(
          artifact?.status ?? artifact?.canonical_status ?? artifact?.export_status,
          "app_canonical"
        ),
        previewKind: previewKindFromRef(
          asString(artifact?.current_ref) ?? asString(artifact?.canonical_ref) ?? title,
          asString(task.next_visible_step) ?? title
        ),
        ref: asString(artifact?.current_ref) ?? asString(artifact?.canonical_ref) ?? `opl://task/${taskId}`,
        summary: compactText(task.next_visible_step, `${title} task status ref.`),
        provenance: [
          asString(task.workspace_path),
          asString(task.runtime_readback_source),
          asString(reviewReceipt?.receipt_ref)
        ].filter((item): item is string => Boolean(item)),
        actions: [
          asString(actionReceipt?.action_id) ? "Preview task receipt" : null,
          asString(reviewReceipt?.receipt_ref) ? "Open review receipt ref" : null
        ].filter((item): item is string => Boolean(item))
      }
    ];
  });
  return items.length ? items.slice(0, 6) : initialWorkbenchModel.results;
}

export function deriveWorkbenchModelFromState(state: unknown, fallback: WorkbenchModel = initialWorkbenchModel): WorkbenchModel {
  const appState = pickAppState(state);
  if (!appState) return fallback;

  const core = asRecord(appState.core);
  const coreCodex = asRecord(core?.codex);
  const runtimeSource = asRecord(appState.runtime_source);
  const operator = asRecord(appState.operator);
  const workbench = asRecord(operator?.workbench);
  const modules = asRecord(appState.modules);
  const provider = asRecord(appState.provider);
  const temporal = asRecord(provider?.temporal);
  const temporalDetails = asRecord(temporal?.details);
  const temporalWorkerReadiness = asRecord(temporalDetails?.worker_readiness);
  const temporalServiceLifecycle = asRecord(temporalWorkerReadiness?.temporal_service_lifecycle);
  const temporalSupervisor = asRecord(temporalServiceLifecycle?.supervisor);
  const temporalScheduler = asRecord(temporalDetails?.scheduler);
  const temporalManagement = asRecord(temporal?.management);
  const runtimeSourceCarriers = asRecord(appState.runtime_source_carriers);
  const runtimeCarrierSummary = asRecord(runtimeSourceCarriers?.summary);
  const actions = asRecordArray(appState.actions);
  const actionRecords = new Map(actions.flatMap((action): [string, Record<string, unknown>][] => {
    const actionId = asString(action.action_id);
    return actionId ? [[actionId, action]] : [];
  }));
  const projectedMaintenanceAction = (actionId: string | null | undefined): RuntimeMaintenanceActionRef | undefined => {
    if (!actionId) return undefined;
    const action = actionRecords.get(actionId);
    if (!action) return undefined;
    return {
      actionId,
      label: asString(action.label) ?? actionId,
      payload: {},
      requiredPayloadFields: asStringArray(action.payload_fields),
      confirmationRequired: asBoolean(action.confirmation_required),
      dryRunSupported: asBoolean(action.dry_run_supported),
      mutates: asString(action.mutates) ?? "unknown",
      ...(asString(action.danger_level) ? { dangerLevel: asString(action.danger_level) as string } : {})
    };
  };
  const settingsControlCenter = asRecord(appState.settings_control_center);
  const appSettingsReadModel = asRecord(settingsControlCenter?.app_settings_read_model);
  const gatewayAccountProjection = asRecord(appSettingsReadModel?.opl_gateway_account);
  const gatewayAccountRecord = asRecord(gatewayAccountProjection?.account);
  const gatewayAccountBalance = asRecord(gatewayAccountRecord?.balance);
  const gatewayUsage = asRecord(gatewayAccountProjection?.usage);
  const gatewayManagedKey = asRecord(gatewayAccountProjection?.managed_key);
  const gatewayInstallation = asRecord(gatewayAccountProjection?.installation);
  const gatewayFreshness = asRecord(gatewayAccountProjection?.freshness);
  const gatewayAccountStatus = asString(gatewayAccountProjection?.status);
  const gatewayConnectionMode = gatewayAccountProjection?.surface_kind === "opl_gateway_account_read_model.v1"
    && ["none", "manual_key", "account"].includes(asString(gatewayAccountProjection.connection_mode) ?? "")
    ? asString(gatewayAccountProjection.connection_mode) as WorkbenchSettingsProjection["gatewayConnectionMode"]
    : "none";
  const gatewayAccountDisplayName = asString(gatewayAccountRecord?.display_name);
  const gatewayBalanceAmount = asFiniteNumber(gatewayAccountBalance?.amount);
  const gatewayBalanceCurrency = asString(gatewayAccountBalance?.currency);
  const gatewayTodayTokens = asFiniteNumber(gatewayUsage?.today_tokens);
  const gatewayTotalTokens = asFiniteNumber(gatewayUsage?.total_tokens);
  const gatewayTodayCost = asFiniteNumber(gatewayUsage?.today_actual_cost);
  const gatewayTotalCost = asFiniteNumber(gatewayUsage?.total_actual_cost);
  const gatewayUsageCurrency = asString(gatewayUsage?.currency);
  const gatewayUsageTimezone = asString(gatewayUsage?.day_timezone);
  const gatewayManagedKeyName = asString(gatewayManagedKey?.name);
  const gatewayManagedKeyStatus = asString(gatewayManagedKey?.status);
  const gatewayDeviceLabel = asString(gatewayInstallation?.device_label);
  const gatewayDeviceShortId = asString(gatewayInstallation?.short_id);
  const gatewayObservedAt = asString(gatewayFreshness?.observed_at);
  const gatewayLastErrorCode = asString(gatewayFreshness?.last_error_code);
  const gatewayAvailableGroups = asRecordArray(gatewayAccountProjection?.available_groups).flatMap((group) => {
    const id = asString(group.group_id);
    return id ? [{ id, label: asString(group.label) ?? id }] : [];
  });
  const gatewayAccount = gatewayAccountProjection?.surface_kind === "opl_gateway_account_read_model.v1"
    && gatewayAccountProjection.connection_mode === "account"
    && asBoolean(gatewayAccountProjection.account_card_visible)
    && gatewayAccountStatus !== null
    && ["connected", "setup_required", "reauth_required", "attention_needed", "disconnect_pending"].includes(gatewayAccountStatus)
    && gatewayAccountDisplayName !== null
    ? {
        displayName: gatewayAccountDisplayName,
        status: gatewayAccountStatus,
        ...(asString(gatewayAccountRecord?.email) ? { email: asString(gatewayAccountRecord?.email) as string } : {}),
        ...(asString(gatewayAccountRecord?.status) ? { accountStatus: asString(gatewayAccountRecord?.status) as string } : {}),
        ...(gatewayBalanceAmount !== null && gatewayBalanceCurrency
          ? { balance: { amount: gatewayBalanceAmount, currency: gatewayBalanceCurrency } }
          : {}),
        ...(gatewayTodayTokens !== null || gatewayTotalTokens !== null || gatewayTodayCost !== null || gatewayTotalCost !== null
          ? {
              usage: {
                ...(gatewayTodayTokens !== null ? { todayTokens: gatewayTodayTokens } : {}),
                ...(gatewayTotalTokens !== null ? { totalTokens: gatewayTotalTokens } : {}),
                ...(gatewayTodayCost !== null ? { todayCost: gatewayTodayCost } : {}),
                ...(gatewayTotalCost !== null ? { totalCost: gatewayTotalCost } : {}),
                ...(gatewayUsageCurrency ? { currency: gatewayUsageCurrency } : {}),
                ...(gatewayUsageTimezone ? { timezone: gatewayUsageTimezone } : {})
              }
            }
          : {}),
        ...(gatewayManagedKeyName || gatewayManagedKeyStatus
          ? {
              managedKey: {
                ...(gatewayManagedKeyName ? { name: gatewayManagedKeyName } : {}),
                ...(gatewayManagedKeyStatus ? { status: gatewayManagedKeyStatus } : {})
              }
            }
          : {}),
        ...(gatewayAvailableGroups.length ? { availableGroups: gatewayAvailableGroups } : {}),
        ...(gatewayDeviceLabel || gatewayDeviceShortId
          ? {
              installation: {
                ...(gatewayDeviceLabel ? { deviceLabel: gatewayDeviceLabel } : {}),
                ...(gatewayDeviceShortId ? { shortId: gatewayDeviceShortId } : {})
              }
            }
          : {}),
        ...(gatewayObservedAt || gatewayFreshness
          ? {
              freshness: {
                ...(gatewayObservedAt ? { observedAt: gatewayObservedAt } : {}),
                stale: asBoolean(gatewayFreshness?.stale),
                ...(gatewayLastErrorCode ? { lastErrorCode: gatewayLastErrorCode } : {})
              }
            }
          : {}),
        sourceRef: "app_state.settings_control_center.app_settings_read_model.opl_gateway_account.account.display_name"
      }
    : undefined;
  const codexModelPolicy = asRecord(appSettingsReadModel?.codex_model_policy);
  const localEnvironment = asRecord(appSettingsReadModel?.local_environment);
  const workspaceServices = asRecord(appSettingsReadModel?.workspace_services);
  const workspaceRoot = asRecord(workspaceServices?.workspace_root);
  const personalizationRefs = asRecord(workspaceServices?.personalization_refs);
  const connectionsReadModel = asRecord(appSettingsReadModel?.connections);
  const dockerWebui = asRecord(appSettingsReadModel?.docker_webui);
  const dockerRuntimeProxy = asRecord(dockerWebui?.runtime_proxy);
  const dockerFailureRecovery = asRecord(dockerWebui?.failure_recovery);
  const storageLifecycle = asRecord(appSettingsReadModel?.storage_lifecycle);
  const agentPackageStore = asRecord(storageLifecycle?.agent_package_store);
  const webuiDataVolume = asRecord(storageLifecycle?.webui_data_volume);
  const agentPackageInventoryAction = projectedMaintenanceAction(
    asString(agentPackageStore?.inventory_action_id)
      ?? asString(asRecord(agentPackageStore?.projected_action)?.action_id)
  );
  const webuiInventoryAction = projectedMaintenanceAction(
    asString(webuiDataVolume?.inventory_action_id)
      ?? asString(asRecord(webuiDataVolume?.projected_action)?.action_id)
  );
  const codexPersonalization = asRecord(appState.codex_personalization);
  const userAgents = asRecord(codexPersonalization?.user_agents);
  const oplFlowDefaultUserAgents = asRecord(codexPersonalization?.opl_flow_default_user_agents);
  const statusSummary = asRecord(settingsControlCenter?.status_summary);
  const dockerActions = asRecordArray(dockerWebui?.ordinary_next_actions).flatMap((projected): RuntimeMaintenanceActionRef[] => {
    const actionId = asString(projected.action_id);
    if (!actionId) return [];
    const action = actionRecords.get(actionId);
    const dangerLevel = asString(projected.danger_level) ?? asString(action?.danger_level);
    return [{
      actionId,
      label: asString(projected.label) ?? asString(action?.label) ?? actionId,
      ...(asString(projected.state) ? { state: asString(projected.state) as string } : {}),
      payload: {},
      requiredPayloadFields: asStringArray(projected.payload_fields).length
        ? asStringArray(projected.payload_fields)
        : asStringArray(action?.payload_fields),
      confirmationRequired: asOptionalBoolean(projected.confirmation_required)
        ?? asOptionalBoolean(action?.confirmation_required)
        ?? false,
      dryRunSupported: Boolean(asString(projected.dry_run_route)) || asBoolean(action?.dry_run_supported),
      mutates: asString(action?.mutates) ?? "unknown",
      ...(dangerLevel ? { dangerLevel } : {})
    }];
  });
  const externalConnections = asRecordArray(connectionsReadModel?.connections)
    .filter((connection) => {
      const type = asString(connection.connection_type);
      const id = asString(connection.connection_id);
      return type !== "opl_gateway_account" && id !== "opl-gateway-account";
    })
    .map((connection, index) => ({
      id: asString(connection.connection_id) ?? `external-connection-${index}`,
      name: asString(connection.name) ?? asString(connection.connection_id) ?? `Connection ${index + 1}`,
      ...(asString(connection.connection_type) ? { type: asString(connection.connection_type) as string } : {}),
      ...(asString(connection.endpoint) ? { endpoint: asString(connection.endpoint) as string } : {}),
      ...(asString(connection.status) ? { status: asString(connection.status) as string } : {}),
      ...(asString(connection.last_tested_at) ? { lastTestedAt: asString(connection.last_tested_at) as string } : {})
    }));
  const settingsProjection: WorkbenchSettingsProjection | undefined = appSettingsReadModel || coreCodex
    ? {
        sourceRef: "app_state.settings_control_center.app_settings_read_model",
        gatewayConnectionMode,
        codex: {
          installed: asOptionalBoolean(coreCodex?.installed),
          ...(firstString(coreCodex, ["parsed_version", "version"]) ? { version: firstString(coreCodex, ["parsed_version", "version"]) as string } : {}),
          ...(asString(coreCodex?.version_status) ? { versionStatus: asString(coreCodex?.version_status) as string } : {}),
          ...(asString(coreCodex?.binary_path) ? { binaryPath: asString(coreCodex?.binary_path) as string } : {}),
          ...(firstString(codexModelPolicy, ["model"]) ?? firstString(coreCodex, ["default_model", "model"])
            ? { model: (firstString(codexModelPolicy, ["model"]) ?? firstString(coreCodex, ["default_model", "model"])) as string }
            : {}),
          ...(firstString(codexModelPolicy, ["reasoning_effort"]) ?? firstString(coreCodex, ["default_reasoning_effort"])
            ? { reasoningEffort: (firstString(codexModelPolicy, ["reasoning_effort"]) ?? firstString(coreCodex, ["default_reasoning_effort"])) as string }
            : {}),
          ...(firstString(codexModelPolicy, ["provider_name"]) ?? firstString(coreCodex, ["provider_name"])
            ? { providerName: (firstString(codexModelPolicy, ["provider_name"]) ?? firstString(coreCodex, ["provider_name"])) as string }
            : {}),
          ...(firstString(codexModelPolicy, ["provider_base_url"]) ?? firstString(coreCodex, ["provider_base_url"])
            ? { providerBaseUrl: (firstString(codexModelPolicy, ["provider_base_url"]) ?? firstString(coreCodex, ["provider_base_url"])) as string }
            : {}),
          ...(firstString(codexModelPolicy, ["model_access_source"]) ?? firstString(coreCodex, ["model_access_source"])
            ? { modelAccessSource: (firstString(codexModelPolicy, ["model_access_source"]) ?? firstString(coreCodex, ["model_access_source"])) as string }
            : {}),
          ...(firstString(codexModelPolicy, ["access_status", "model_access_status"]) ?? firstString(coreCodex, ["model_access_status"])
            ? { accessStatus: (firstString(codexModelPolicy, ["access_status", "model_access_status"]) ?? firstString(coreCodex, ["model_access_status"])) as string }
            : {}),
          ...(firstString(codexModelPolicy, ["config_path"]) ?? firstString(coreCodex, ["config_path"])
            ? { configPath: (firstString(codexModelPolicy, ["config_path"]) ?? firstString(coreCodex, ["config_path"])) as string }
            : {}),
          apiKeyPresent: asOptionalBoolean(codexModelPolicy?.api_key_present ?? coreCodex?.api_key_present),
          updateAvailable: asOptionalBoolean(coreCodex?.update_available)
        },
        statusSummary: {
          ...(asString(statusSummary?.runtime_source_carrier_health) ? { runtimeSourceHealth: asString(statusSummary?.runtime_source_carrier_health) as string } : {}),
          ...(asString(statusSummary?.agent_package_functional_health) ? { agentPackageHealth: asString(statusSummary?.agent_package_functional_health) as string } : {}),
          ...(firstString(statusSummary, ["temporal_provider"]) ?? firstString(localEnvironment, ["temporal_provider"])
            ? { temporalProvider: (firstString(statusSummary, ["temporal_provider"]) ?? firstString(localEnvironment, ["temporal_provider"])) as string }
            : {}),
          ...(firstString(statusSummary, ["release_channel"]) ?? firstString(localEnvironment, ["release_channel"])
            ? { releaseChannel: (firstString(statusSummary, ["release_channel"]) ?? firstString(localEnvironment, ["release_channel"])) as string }
            : {}),
          ...(asFiniteNumber(statusSummary?.issue_count) !== null ? { issueCount: asFiniteNumber(statusSummary?.issue_count) as number } : {})
        },
        localEnvironment: {
          ...(asString(localEnvironment?.state_dir) ? { stateDir: asString(localEnvironment?.state_dir) as string } : {}),
          ...(asString(localEnvironment?.runtime_sources_root) ? { runtimeSourcesRoot: asString(localEnvironment?.runtime_sources_root) as string } : {}),
          ...(asString(localEnvironment?.logs_dir) ? { logsDir: asString(localEnvironment?.logs_dir) as string } : {}),
          ...(asString(localEnvironment?.release_channel) ? { releaseChannel: asString(localEnvironment?.release_channel) as string } : {}),
          ...(asString(localEnvironment?.temporal_provider) ? { temporalProvider: asString(localEnvironment?.temporal_provider) as string } : {})
        },
        workspace: {
          ...(asString(workspaceRoot?.selected_path) ? { selectedPath: asString(workspaceRoot?.selected_path) as string } : {}),
          exists: asOptionalBoolean(workspaceRoot?.exists),
          writable: asOptionalBoolean(workspaceRoot?.writable),
          ...(asString(workspaceRoot?.health_status) ? { healthStatus: asString(workspaceRoot?.health_status) as string } : {}),
          personalizationSourceCount: asStringArray(personalizationRefs?.source_refs).length
        },
        externalConnections,
        dockerWebui: {
          ...(asString(dockerWebui?.ordinary_status) ? { status: asString(dockerWebui?.ordinary_status) as string } : {}),
          ...(asString(dockerRuntimeProxy?.status) ? { runtimeStatus: asString(dockerRuntimeProxy?.status) as string } : {}),
          ...(asString(dockerFailureRecovery?.status) ? { recoveryStatus: asString(dockerFailureRecovery?.status) as string } : {}),
          actions: dockerActions
        },
        personalization: {
          ...(asString(userAgents?.status) ? {
            userAgents: {
              status: asString(userAgents?.status) as string,
              ...(asString(userAgents?.path) ? { path: asString(userAgents?.path) as string } : {}),
              ...(typeof userAgents?.content === "string" ? { content: userAgents.content } : {}),
              ...(asString(userAgents?.sha256) ? { sha256: asString(userAgents?.sha256) as string } : {}),
              ...(asFiniteNumber(userAgents?.size_bytes) !== null ? { sizeBytes: asFiniteNumber(userAgents?.size_bytes) as number } : {}),
              ...(asFiniteNumber(userAgents?.max_editable_bytes) !== null ? { maxEditableBytes: asFiniteNumber(userAgents?.max_editable_bytes) as number } : {}),
              ...(asString(userAgents?.source) ? { source: asString(userAgents?.source) as string } : {})
            }
          } : {}),
          ...(asString(oplFlowDefaultUserAgents?.status) ? {
            oplFlowDefaultUserAgents: {
              status: asString(oplFlowDefaultUserAgents?.status) as string,
              ...(typeof oplFlowDefaultUserAgents?.content === "string" ? { content: oplFlowDefaultUserAgents.content } : {}),
              ...(asString(oplFlowDefaultUserAgents?.sha256) ? { sha256: asString(oplFlowDefaultUserAgents?.sha256) as string } : {}),
              ...(asString(oplFlowDefaultUserAgents?.source_path) ? { sourcePath: asString(oplFlowDefaultUserAgents?.source_path) as string } : {}),
              ...(asString(oplFlowDefaultUserAgents?.package_version) ? { packageVersion: asString(oplFlowDefaultUserAgents?.package_version) as string } : {}),
              ...(asString(oplFlowDefaultUserAgents?.source) ? { source: asString(oplFlowDefaultUserAgents?.source) as string } : {}),
              ...(asString(oplFlowDefaultUserAgents?.reason) ? { reason: asString(oplFlowDefaultUserAgents?.reason) as string } : {})
            }
          } : {})
        },
        storage: {
          agentPackageStore: {
            ...(asString(agentPackageStore?.status) ? { status: asString(agentPackageStore?.status) as string } : {}),
            ...(asFiniteNumber(agentPackageStore?.bytes) !== null ? { bytes: asFiniteNumber(agentPackageStore?.bytes) as number } : {}),
            ...(asFiniteNumber(agentPackageStore?.reclaimable_bytes) !== null ? { reclaimableBytes: asFiniteNumber(agentPackageStore?.reclaimable_bytes) as number } : {}),
            ...(asString(agentPackageStore?.reason_code) ? { reasonCode: asString(agentPackageStore?.reason_code) as string } : {}),
            ...(asString(agentPackageStore?.observed_at) ? { observedAt: asString(agentPackageStore?.observed_at) as string } : {}),
            stale: asOptionalBoolean(agentPackageStore?.stale),
            ...(asString(agentPackageStore?.owner_route) ? { ownerRoute: asString(agentPackageStore?.owner_route) as string } : {}),
            ...(agentPackageInventoryAction ? { inventoryAction: agentPackageInventoryAction } : {}),
            ...(asRecord(agentPackageStore?.projected_action) ? {
              projectedAction: {
                ...(asString(asRecord(agentPackageStore?.projected_action)?.kind) ? { kind: asString(asRecord(agentPackageStore?.projected_action)?.kind) as string } : {}),
                ...(asString(asRecord(agentPackageStore?.projected_action)?.status) ? { status: asString(asRecord(agentPackageStore?.projected_action)?.status) as string } : {}),
                ...(asString(asRecord(agentPackageStore?.projected_action)?.route) ? { route: asString(asRecord(agentPackageStore?.projected_action)?.route) as string } : {}),
                ...(asString(asRecord(agentPackageStore?.projected_action)?.action_id) ? { actionId: asString(asRecord(agentPackageStore?.projected_action)?.action_id) as string } : {}),
                dryRunRequired: asOptionalBoolean(asRecord(agentPackageStore?.projected_action)?.dry_run_required)
              }
            } : {})
          },
          webuiDataVolume: {
            ...(asString(webuiDataVolume?.status) ? { status: asString(webuiDataVolume?.status) as string } : {}),
            ...(asFiniteNumber(webuiDataVolume?.bytes) !== null ? { bytes: asFiniteNumber(webuiDataVolume?.bytes) as number } : {}),
            ...(asFiniteNumber(webuiDataVolume?.reclaimable_bytes) !== null ? { reclaimableBytes: asFiniteNumber(webuiDataVolume?.reclaimable_bytes) as number } : {}),
            ...(asString(webuiDataVolume?.reason_code) ? { reasonCode: asString(webuiDataVolume?.reason_code) as string } : {}),
            ...(asString(webuiDataVolume?.observed_at) ? { observedAt: asString(webuiDataVolume?.observed_at) as string } : {}),
            stale: asOptionalBoolean(webuiDataVolume?.stale),
            ...(asString(webuiDataVolume?.owner_route) ? { ownerRoute: asString(webuiDataVolume?.owner_route) as string } : {}),
            ...(webuiInventoryAction ? { inventoryAction: webuiInventoryAction } : {}),
            ...(asRecord(webuiDataVolume?.projected_action) ? {
              projectedAction: {
                ...(asString(asRecord(webuiDataVolume?.projected_action)?.kind) ? { kind: asString(asRecord(webuiDataVolume?.projected_action)?.kind) as string } : {}),
                ...(asString(asRecord(webuiDataVolume?.projected_action)?.status) ? { status: asString(asRecord(webuiDataVolume?.projected_action)?.status) as string } : {}),
                ...(asString(asRecord(webuiDataVolume?.projected_action)?.route) ? { route: asString(asRecord(webuiDataVolume?.projected_action)?.route) as string } : {}),
                ...(asString(asRecord(webuiDataVolume?.projected_action)?.action_id) ? { actionId: asString(asRecord(webuiDataVolume?.projected_action)?.action_id) as string } : {}),
                dryRunRequired: asOptionalBoolean(asRecord(webuiDataVolume?.projected_action)?.dry_run_required)
              }
            } : {})
          }
        }
      }
    : undefined;
  const moduleItems = asRecordArray(modules?.items);
  const taskDrilldowns = asRecordArray(workbench?.task_drilldowns);
  const workItemRuntime = readWorkItemRuntimeProjection(workbench?.work_item_projection_v2);
  const settingsTaskEntries = asRecordArray(settingsControlCenter?.task_entries);
  const settingsSections = asRecordArray(settingsControlCenter?.action_sections);
  const safeActionRoutes = asRecordArray(workbench?.safe_action_routes);
  const currentOwnerDelta = asRecord(workbench?.current_owner_delta);
  const currentOwnerDeltaNextAction = asRecord(workbench?.current_owner_delta_next_action);
  const meta = asRecord(appState.meta);

  const runtimeSources = [
    sourceRef("state-fast", "Fast state", runtimeSource?.normal_gui_state_surface, "Normal GUI state read."),
    sourceRef("state-full", "Full state", runtimeSource?.full_gui_state_surface, "Explicit detailed state read."),
    sourceRef("action-boundary", "Action boundary", runtimeSource?.action_boundary_surface, "App action execution surface."),
    sourceRef("full-drilldown", "Full drilldown", runtimeSource?.full_drilldown_exception_surface, "Runtime drilldown exception.")
  ].filter((item): item is WorkbenchSourceRef => Boolean(item));

  const workbenchSources = buildTaskSourceRefs(taskDrilldowns);

  const settingsSources = settingsSections.map((item, index) => sourceRef(
    `settings-section-${asString(item.section_id) ?? index}`,
    asString(item.label) ?? `Settings section ${index + 1}`,
    item.source_ref,
    compactText(item.description, "Settings control center section.")
  )).filter((item): item is WorkbenchSourceRef => Boolean(item));

  const moduleSources = moduleItems.slice(0, 5).map((item, index) => sourceRef(
    `module-${asString(item?.module_id) ?? index}`,
    asString(item?.label) ?? asString(item?.module_id) ?? "Module",
    asString(item?.checkout_path) ?? asString(item?.repo_url),
    compactText(item?.description, asString(item?.health_status) ? `Module health: ${item?.health_status}` : "Managed OPL module ref.")
  )).filter((item): item is WorkbenchSourceRef => Boolean(item));

  const contextSources = uniqueByRef([...runtimeSources, ...settingsSources, ...moduleSources, ...workbenchSources]);

  const baseActions = actions.map((item): WorkbenchActionRef | null => {
    const id = asString(item?.action_id);
    if (!id) return null;
    return {
      id,
      label: asString(item?.label) ?? id,
      route: asString(item?.route) ?? `opl app action execute --action ${id}`,
      payloadFields: asStringArray(item?.payload_fields),
      mutates: asString(item?.mutates) ?? "unknown",
      dryRunSupported: asBoolean(item?.dry_run_supported),
      confirmationRequired: asBoolean(item?.confirmation_required),
      dangerLevel: asString(item?.danger_level) ?? undefined,
      owner: asString(item?.owner) ?? undefined,
      delegatedSurface: asString(item?.delegated_surface) ?? undefined,
      canSubmitToSafeActionShell: asBoolean(item?.can_submit_to_safe_action_shell),
      routeRequiresPayload: asBoolean(item?.route_requires_domain_or_app_payload)
    };
  }).filter((item): item is WorkbenchActionRef => Boolean(item));

  const actionOverrides = new Map<string, Partial<WorkbenchActionRef>>();
  for (const entry of settingsTaskEntries) {
    const id = asString(entry.action_id) ?? asString(entry.task_id);
    if (!id) continue;
    actionOverrides.set(id, {
      label: asString(entry.label) ?? id,
      route: asString(entry.route) ?? `opl app action execute --action ${id}`,
      payloadFields: asStringArray(entry.payload_fields),
      mutates: asString(entry.mutates) ?? "unknown",
      dryRunSupported: asBoolean(entry.dry_run_supported),
      confirmationRequired: asBoolean(entry.confirmation_required),
      dangerLevel: asString(entry.danger_level) ?? undefined,
      delegatedSurface: asString(entry.delegated_surface) ?? asString(entry.dry_run_route) ?? undefined,
      routeRequiresPayload: asBoolean(entry.payload_required)
    });
  }
  for (const route of safeActionRoutes) {
    const id = asString(route.action_id);
    if (!id) continue;
    const existing = actionOverrides.get(id) ?? {};
    actionOverrides.set(id, {
      ...existing,
      label: asString(route.label) ?? existing.label ?? id,
      route: asString(route.route) ?? existing.route ?? `opl app action execute --action ${id}`,
      owner: asString(route.owner) ?? existing.owner,
      dryRunSupported: true
    });
  }

  const actionMap = new Map<string, WorkbenchActionRef>();
  for (const action of baseActions) {
    const override = actionOverrides.get(action.id);
    actionMap.set(action.id, {
      ...action,
      ...(override ?? {})
    });
  }
  for (const [id, override] of actionOverrides.entries()) {
    if (actionMap.has(id)) continue;
    actionMap.set(id, {
      id,
      label: override.label ?? id,
      route: override.route ?? `opl app action execute --action ${id}`,
      payloadFields: override.payloadFields ?? [],
      mutates: override.mutates ?? "unknown",
      dryRunSupported: override.dryRunSupported ?? true,
      confirmationRequired: override.confirmationRequired ?? false,
      dangerLevel: override.dangerLevel,
      owner: override.owner,
      delegatedSurface: override.delegatedSurface,
      canSubmitToSafeActionShell: override.canSubmitToSafeActionShell,
      routeRequiresPayload: override.routeRequiresPayload
    });
  }

  const runtimeMaintenanceActionIds = uniqueStrings([
    asString(localEnvironment?.app_update_action_id),
    "settings_check_app_update",
    "settings_apply_opl_packages",
    "settings_sync_capabilities",
    asString(localEnvironment?.runtime_roots_cleanup_action_id),
    asString(localEnvironment?.runtime_substrate_rollback_action_id),
    ...asStringArray(temporalManagement?.actions)
  ]);
  const runtimeMaintenanceActions = runtimeMaintenanceActionIds.flatMap((actionId): RuntimeMaintenanceActionRef[] => {
    const action = actionMap.get(actionId);
    if (!action) return [];
    return [{
      actionId,
      label: action.label,
      payload: {},
      requiredPayloadFields: action.payloadFields,
      confirmationRequired: action.confirmationRequired,
      dryRunSupported: action.dryRunSupported,
      mutates: action.mutates,
      ...(action.dangerLevel ? { dangerLevel: action.dangerLevel } : {})
    }];
  });
  const temporalSchedulerStatus = firstString(temporalScheduler, ["status", "health_status"]) ?? "unknown";
  const temporalSchedulerReady = asOptionalBoolean(temporalScheduler?.ready);
  const recommendedRuntimeAction = (
    temporalSchedulerReady === false || /attention|error|failed|stale/.test(temporalSchedulerStatus.toLowerCase())
      ? runtimeMaintenanceActions.find((action) => action.actionId === "provider_scheduler_status")
      : null
  ) ?? runtimeMaintenanceActions.find((action) => action.actionId === asString(localEnvironment?.app_update_action_id));
  const runtimeOverview: RuntimeOverviewRef = {
    temporal: {
      status: firstString(temporal, ["health_status", "status"]) ?? firstString(provider, ["status"]) ?? "unknown",
      ready: asOptionalBoolean(temporal?.ready),
      serviceStatus: firstString(temporalSupervisor, ["status", "process_state"])
        ?? firstString(temporalServiceLifecycle, ["service_status"])
        ?? "unknown",
      serviceReady: asOptionalBoolean(temporalSupervisor?.ready ?? temporalWorkerReadiness?.service_ready),
      workerStatus: firstString(temporalWorkerReadiness, ["readiness_status", "lifecycle_status"]) ?? "unknown",
      workerReady: asOptionalBoolean(temporalWorkerReadiness?.worker_ready),
      schedulerStatus: temporalSchedulerStatus,
      schedulerReady: temporalSchedulerReady,
      ...(asString(temporalDetails?.address) ? { address: asString(temporalDetails?.address) as string } : {}),
      ...(asString(temporalDetails?.namespace) ? { namespace: asString(temporalDetails?.namespace) as string } : {}),
      ...(asString(temporalDetails?.task_queue) ? { taskQueue: asString(temporalDetails?.task_queue) as string } : {}),
      ...(firstString(temporalScheduler, ["observed_at"]) ?? firstString(temporalSupervisor, ["observed_at"])
        ? { observedAt: (firstString(temporalScheduler, ["observed_at"]) ?? firstString(temporalSupervisor, ["observed_at"])) as string }
        : {})
    },
    carriers: {
      total: asFiniteNumber(runtimeCarrierSummary?.default_carriers_count) ?? 0,
      present: asFiniteNumber(runtimeCarrierSummary?.present_default_carriers_count) ?? 0,
      healthy: asFiniteNumber(runtimeCarrierSummary?.healthy_default_carriers_count) ?? 0,
      items: asRecordArray(runtimeSourceCarriers?.items).map((carrier, index) => ({
        packageId: asString(carrier.package_id) ?? `runtime-carrier-${index}`,
        label: asString(carrier.label) ?? asString(carrier.package_id) ?? `Runtime source ${index + 1}`,
        ...(asString(carrier.description) ? { description: asString(carrier.description) as string } : {}),
        status: asString(carrier.source_health_status) ?? (asBoolean(carrier.source_present) ? "ready" : "unavailable"),
        ...(asString(carrier.source_origin) ? { sourceOrigin: asString(carrier.source_origin) as string } : {}),
        ...(asString(asRecord(carrier.git)?.sync_status) ? { syncStatus: asString(asRecord(carrier.git)?.sync_status) as string } : {}),
        dirty: asOptionalBoolean(asRecord(carrier.git)?.dirty)
      })),
    },
    maintenanceActions: runtimeMaintenanceActions,
    ...(recommendedRuntimeAction ? { recommendedActionId: recommendedRuntimeAction.actionId } : {})
  };

  const canonicalPackageProjection = asRecord(appState.agent_packages);
  const canonicalPackageRows = packageRowsFromCanonicalProjection(canonicalPackageProjection, appState);
  const canonicalPackageItems = canonicalPackageRows.length
    ? canonicalPackageRows
    : canonicalPackageProjection
      ? [canonicalSummaryRow(canonicalPackageProjection)]
      : [];
  const packageLifecycle = canonicalPackageItems.length
    ? canonicalPackageItems.map((item) => packageLifecycleItem(item, actionMap, "canonical_agent_packages"))
    : moduleItems.length
      ? legacyPackageRowsFromModules(moduleItems).map((item) => packageLifecycleItem(item, actionMap, "legacy_modules_fallback"))
      : fallback.packageLifecycle;

  const priorityActionIds = uniqueByRef(taskDrilldowns.flatMap((task) => {
    const actionReceipt = asRecord(task.action_receipt);
    const taskActionId = asString(actionReceipt?.action_id);
    const exportActionId = asString(actionReceipt?.export_bundle_action_id)
      ?? extractActionId(asRecord(task.artifact_or_blocker)?.export_bundle_action_ref);
    return [taskActionId, exportActionId].filter((item): item is string => Boolean(item)).map((id) => ({
      id,
      ref: id
    }));
  }).concat(
    settingsTaskEntries
      .filter((entry) => ["workspace", "capabilities", "packages", "model_access"].includes(asString(entry.section_id) ?? ""))
      .map((entry) => ({ id: asString(entry.action_id) ?? asString(entry.task_id) ?? "", ref: asString(entry.action_id) ?? asString(entry.task_id) ?? "" })),
    [
      { id: "workspace_ensure", ref: "workspace_ensure" },
      { id: "settings_sync_capabilities", ref: "settings_sync_capabilities" },
      { id: "task_action_receipt_preview", ref: "task_action_receipt_preview" },
      { id: "task_export_bundle_preview", ref: "task_export_bundle_preview" }
    ]
  )).map((item) => item.id);

  const contextActions = uniqueByRef([
    ...priorityActionIds.map((id) => actionMap.get(id)).filter((item): item is WorkbenchActionRef => Boolean(item)),
    ...Array.from(actionMap.values())
      .filter((action) => action.dryRunSupported && (isDeliveryAction(action) || isReceiptAction(action)))
      .slice(0, 8)
  ]);

  const taskDeliverables = taskDrilldowns.flatMap((task) => {
    const taskId = asString(task.task_id);
    const title = asString(task.title);
    const artifact = asRecord(task.artifact_or_blocker);
    const workflowRefs = asRecord(task.workflow_refs);
    if (!taskId || !title || !artifact) return [];
    const refs = [
      {
        id: `deliverable-${taskId}-canonical`,
        title: `${title} canonical ref`,
        ref: asString(artifact.canonical_ref),
        summary: compactText(artifact.content_policy, "Refs-only canonical artifact ref."),
        previewKind: previewKindFromRef(asString(artifact.canonical_ref) ?? title, asString(artifact.content_policy) ?? title)
      },
      {
        id: `deliverable-${taskId}-export`,
        title: `${title} export ref`,
        ref: asString(artifact.export_ref),
        summary: compactText(task.next_visible_step, "Export ref derived from operator workbench."),
        previewKind: previewKindFromRef(asString(artifact.export_ref) ?? title, asString(task.next_visible_step) ?? title)
      },
      {
        id: `deliverable-${taskId}-workflow`,
        title: `${title} workflow ref`,
        ref: asString(workflowRefs?.current_workflow_ref),
        summary: compactText(workflowRefs?.content_policy, "Workflow ref only."),
        previewKind: previewKindFromRef(asString(workflowRefs?.current_workflow_ref) ?? title, asString(workflowRefs?.content_policy) ?? title)
      }
    ];
    return refs
      .filter((item) => item.ref)
      .map((item): WorkbenchArtifactRef => ({
        id: item.id,
        title: item.title,
        kind: "deliverable",
        status: artifactStatus(
          artifact.status ?? artifact.canonical_status ?? artifact.export_status,
          "app_canonical"
        ),
        previewKind: item.previewKind,
        ref: item.ref!,
        summary: item.summary,
        provenance: [
          asString(task.workspace_path),
          asString(artifact.lineage_ref),
          asString(artifact.conformance_ref)
        ].filter((value): value is string => Boolean(value)),
        actions: ["Preview ref", "Attach receipt ref"]
      }));
  });
  const deliverables = taskDeliverables.length ? uniqueByRef(taskDeliverables).slice(0, 6) : fallback.deliverables;

  const taskReceipts = taskDrilldowns.flatMap((task) => {
    const taskId = asString(task.task_id);
    const title = asString(task.title);
    const actionReceipt = asRecord(task.action_receipt);
    const reviewReceipt = asRecord(task.review_receipt);
    const artifact = asRecord(task.artifact_or_blocker);
    if (!taskId || !title) return [];
    const items = [
      {
        id: `receipt-${taskId}-action`,
        title: `${title} action preview`,
        ref: asString(actionReceipt?.preview_ref),
        summary: compactText(actionReceipt?.content_policy, "Dry-run action receipt ref."),
        status: actionReceipt?.preview_ref ? "needs_review" : "blocked"
      },
      {
        id: `receipt-${taskId}-review`,
        title: `${title} review receipt`,
        ref: asString(reviewReceipt?.receipt_ref),
        summary: compactText(reviewReceipt?.authority_policy, "Review receipt summary ref."),
        status: artifactStatus(reviewReceipt?.status ?? task.status ?? task.state)
      },
      {
        id: `receipt-${taskId}-artifact`,
        title: `${title} artifact receipt`,
        ref: asString(artifact?.receipt_ref),
        summary: compactText(artifact?.content_policy, "Artifact receipt ref only."),
        status: artifactStatus(
          artifact?.status ?? artifact?.receipt_status ?? artifact?.canonical_status,
          "app_canonical"
        )
      }
    ];
    return items
      .filter((item) => item.ref)
      .map((item): WorkbenchArtifactRef => ({
        id: item.id,
        title: item.title,
        kind: "receipt",
        status: item.status as WorkbenchArtifactRef["status"],
        previewKind: "code",
        ref: item.ref!,
        summary: item.summary,
        provenance: [
          asString(task.runtime_readback_source),
          asString(task.workspace_path),
          asString(reviewReceipt?.check_ref)
        ].filter((value): value is string => Boolean(value)),
        actions: ["Preview receipt", "Compare refs"]
      }));
  });
  const receipts = taskReceipts.length ? uniqueByRef(taskReceipts).slice(0, 6) : fallback.receipts;

  const leadTask = taskDrilldowns[0] ?? null;
  const leadTaskTitle = asString(leadTask?.title) ?? "Current task";
  const leadArtifact = asRecord(leadTask?.artifact_or_blocker);
  const leadActionReceipt = asRecord(leadTask?.action_receipt);
  const leadActionId = asString(leadActionReceipt?.action_id);
  const leadActionRoute = asString(leadActionReceipt?.route);
  const leadExportActionId = asString(leadActionReceipt?.export_bundle_action_id);
  const leadExportRoute = asString(leadActionReceipt?.export_bundle_route);
  const leadStageRun = asRecord(leadTask?.stage_run_cockpit_summary)
    ?? asRecord(leadTask?.stage_run_current_owner_delta)
    ?? asRecord(leadTask?.stage_run_cockpit);
  const leadAcceptedShapes = taskAcceptedShapes(leadTask ?? {}, currentOwnerDelta);
  const leadUsageSummary = usageSummary(asRecord(leadTask?.current_stage_usage));
  const leadTaskTotalUsage = usageSummary(asRecord(leadTask?.task_total_usage));
  const leadTraceSteps = uniqueStrings([
    leadTaskTitle,
    asString(leadTask?.active_stage_label) ?? asString(leadTask?.active_stage_id),
    asString(leadTask?.status_label) ?? asString(leadTask?.status),
    asString(currentOwnerDelta?.owner) ?? asString(leadStageRun?.current_owner),
    compactText(leadTask?.next_visible_step, "Review current refs before execution.", 88),
    leadAcceptedShapes.length ? `Return ${leadAcceptedShapes.join(" | ")}` : null
  ]);

  const leadPreviewCandidates: ArtifactPreview[] = leadTask ? [
    {
      id: `preview-summary-${asString(leadTask.task_id) ?? "current"}`,
      label: "Summary",
      previewKind: "markdown",
      rendererModuleId: rendererModuleIdForPreviewKind("markdown"),
      title: `${leadTaskTitle} workbench summary`,
      ref: asString(leadArtifact?.current_ref) ?? `opl://task/${asString(leadTask.task_id) ?? "current"}`,
      summary: compactText(leadTask.next_visible_step, "Task-derived summary preview."),
      content: [
        `### ${leadTaskTitle}`,
        "",
        compactText(leadTask.next_visible_step, "Review current refs before execution."),
        "",
        "#### Workbench reading",
        `- Status: ${(asString(leadTask.status_label) ?? asString(leadTask.status) ?? "unknown").replaceAll("_", " ")}`,
        `- Owner: ${asString(currentOwnerDelta?.owner) ?? asString(leadStageRun?.current_owner) ?? "unknown"}`,
        `- Stage: ${asString(leadTask.active_stage_label) ?? asString(leadTask.active_stage_id) ?? "unknown"}`,
        `- Runtime source: ${asString(leadTask.runtime_readback_source) ?? "unknown"}`,
        ...(leadAcceptedShapes.length ? [`- Required return: ${leadAcceptedShapes.join(", ")}`] : []),
        ...(leadUsageSummary ? [`- Stage usage: ${leadUsageSummary}`] : []),
        ...(leadTaskTotalUsage ? [`- Task usage: ${leadTaskTotalUsage}`] : [])
      ].join("\n"),
      fields: [
        previewField("Task", asString(leadTask.task_id)),
        previewField("Primary state", asString(leadTask.primary_state_label) ?? asString(leadTask.primary_state)),
        previewField("Automation", asString(leadTask.automation_state_label) ?? asString(leadTask.automation_state)),
        previewField("Last heartbeat", formatTimestamp(leadTask.last_heartbeat_at)),
        previewField("Last progress", formatTimestamp(leadTask.last_progress_at))
      ].filter((item): item is { label: string; value: string } => Boolean(item)),
      bullets: uniqueStrings([
        asString(leadTask.typed_blocker_summary),
        asString(leadTask.resolution_route),
        asString(leadStageRun?.running_proof_summary)
      ]),
      sourceRefs: uniqueStrings([
        asString(leadArtifact?.current_ref),
        asString(leadTask.workspace_path),
        asString(leadTask.gateway_status_ref),
        asString(leadStageRun?.typed_blocker_resolution_ref)
      ]),
      authorityBoundary: "Summary projection only; task truth, receipts, and artifact bodies remain source-owned."
    },
    {
      id: `preview-receipt-${asString(leadTask.task_id) ?? "current"}`,
      label: "Receipt",
      previewKind: "json",
      rendererModuleId: rendererModuleIdForPreviewKind("json"),
      title: `${leadTaskTitle} action receipt envelope`,
      ref: asString(leadActionReceipt?.preview_ref) ?? (leadActionRoute ? ensureDryRunJsonRoute(leadActionRoute) : `opl://task/${asString(leadTask.task_id) ?? "current"}/receipt-preview-unavailable`),
      summary: compactText(leadActionReceipt?.content_policy, "Structured preview receipt metadata."),
      content: JSON.stringify({
        task_id: asString(leadTask.task_id),
        action_id: leadActionId,
        preview_ref: asString(leadActionReceipt?.preview_ref),
        dry_run_route: leadActionRoute ? ensureDryRunJsonRoute(leadActionRoute) : null,
        export_bundle_action_id: leadExportActionId,
        export_bundle_route: leadExportRoute ? ensureDryRunJsonRoute(leadExportRoute) : null,
        export_bundle_ref: asStringArray(leadArtifact?.export_bundle_refs)[0] ?? asString(leadArtifact?.export_ref),
        content_policy: asString(leadActionReceipt?.content_policy) ?? "refs_only_no_action_receipt_body",
        required_return_shapes: leadAcceptedShapes
      }, null, 2),
      fields: [
        previewField("Action", leadActionId),
        previewField("Export action", leadExportActionId),
        previewField("Payload", "task_id, action_ref"),
        previewField("Boundary", asString(leadActionReceipt?.content_policy) ?? "refs_only_no_action_receipt_body")
      ].filter((item): item is { label: string; value: string } => Boolean(item)),
      bullets: [
        "Dry-run preview route only; no action receipt body is transferred into the renderer.",
        "Use the preview ref and export bundle ref together when preparing a confirmable action."
      ],
      sourceRefs: uniqueStrings([
        asString(leadActionReceipt?.preview_ref),
        asString(leadArtifact?.export_bundle_action_ref),
        asStringArray(leadArtifact?.export_bundle_refs)[0],
        asString(leadArtifact?.receipt_ref)
      ]),
      authorityBoundary: "Receipt envelope only; execute, owner receipt, and rollback truth remain outside the shell."
    },
    {
      id: `preview-trace-${asString(leadTask.task_id) ?? "current"}`,
      label: "Trace",
      previewKind: "mermaid",
      rendererModuleId: rendererModuleIdForPreviewKind("mermaid"),
      title: `${leadTaskTitle} owner-route trace`,
      ref: asString(leadStageRun?.source_ref) ?? asString(leadArtifact?.current_ref) ?? `opl://task/${asString(leadTask.task_id) ?? "current"}/trace`,
      summary: compactText(asString(currentOwnerDelta?.desired_delta_description) ?? asString(leadTask?.resolution_route), "Owner-route trace derived from App state."),
      fields: [
        previewField("Current owner", asString(currentOwnerDelta?.owner) ?? asString(leadStageRun?.current_owner)),
        previewField("Hard gate", asString(asRecord(currentOwnerDelta?.hard_gate)?.state)),
        previewField("Next safe action", asString(leadStageRun?.next_safe_action_ref)),
        previewField("Runtime", asString(leadTask?.runtime_attempt_status))
      ].filter((item): item is { label: string; value: string } => Boolean(item)),
      bullets: uniqueStrings([
        asString(currentOwnerDelta?.desired_delta_description),
        asString(leadStageRun?.resolution_route),
        asString(leadTask?.typed_blocker_summary)
      ]),
      sourceRefs: uniqueStrings([
        asString(leadStageRun?.source_ref),
        asString(leadStageRun?.typed_blocker_resolution_ref),
        asString(leadTask?.gateway_status_ref)
      ]),
      traceSteps: leadTraceSteps,
      authorityBoundary: "Trace projection only; stage transition still requires owner receipt or typed blocker."
    },
    {
      id: `preview-manifest-${asString(leadTask.task_id) ?? "current"}`,
      label: "Manifest",
      previewKind: "code",
      rendererModuleId: rendererModuleIdForPreviewKind("code"),
      title: `${leadTaskTitle} deliverable manifest`,
      ref: asStringArray(leadArtifact?.export_bundle_refs)[0] ?? asString(leadArtifact?.export_ref) ?? asString(leadArtifact?.canonical_ref) ?? `opl://task/${asString(leadTask.task_id) ?? "current"}/deliverable`,
      summary: compactText(leadArtifact?.content_policy, "Manifest-style delivery projection from refs."),
      content: [
        "export const workbenchDeliveryProjection = {",
        `  taskId: ${JSON.stringify(asString(leadTask.task_id) ?? null)},`,
        `  title: ${JSON.stringify(leadTaskTitle)},`,
        `  currentRef: ${JSON.stringify(asString(leadArtifact?.current_ref) ?? null)},`,
        `  canonicalRef: ${JSON.stringify(asString(leadArtifact?.canonical_ref) ?? null)},`,
        `  exportRef: ${JSON.stringify(asString(leadArtifact?.export_ref) ?? null)},`,
        `  exportBundleRef: ${JSON.stringify(asStringArray(leadArtifact?.export_bundle_refs)[0] ?? null)},`,
        `  receiptRef: ${JSON.stringify(asString(leadArtifact?.receipt_ref) ?? null)},`,
        `  lineageRef: ${JSON.stringify(asString(leadArtifact?.lineage_ref) ?? null)},`,
        `  conformanceRef: ${JSON.stringify(asString(leadArtifact?.conformance_ref) ?? null)},`,
        `  sourceRefCount: ${JSON.stringify(leadTask.source_ref_count ?? null)},`,
        `  safeActionRefCount: ${JSON.stringify(leadTask.safe_action_ref_count ?? null)},`,
        '  authorityBoundary: "refs_only_no_artifact_body"',
        "};"
      ].join("\n"),
      fields: [
        previewField("Current ref", compactRef(asString(leadArtifact?.current_ref) ?? "")),
        previewField("Export bundle", compactRef(asStringArray(leadArtifact?.export_bundle_refs)[0] ?? asString(leadArtifact?.export_ref) ?? "")),
        previewField("Lineage", compactRef(asString(leadArtifact?.lineage_ref) ?? "")),
        previewField("Conformance", compactRef(asString(leadArtifact?.conformance_ref) ?? ""))
      ].filter((item): item is { label: string; value: string } => Boolean(item)),
      bullets: [
        "This is a manifest-style projection for export/readback, not an owned artifact body.",
        "Conformance and lineage stay as refs so the workbench can show delivery context without copying truth."
      ],
      sourceRefs: uniqueStrings([
        asString(leadArtifact?.current_ref),
        asString(leadArtifact?.canonical_ref),
        asStringArray(leadArtifact?.export_bundle_refs)[0],
        asString(leadArtifact?.lineage_ref),
        asString(leadArtifact?.conformance_ref)
      ]),
      authorityBoundary: "Manifest projection only; artifact bytes and release authority remain external."
    }
  ] : [];

  const genericArtifactPreviews = uniqueByRef([
    ...deliverables.map(artifactPreviewFromItem),
    ...receipts.map(artifactPreviewFromItem)
  ]);
  const artifactPreviews = uniqueByRef([...leadPreviewCandidates, ...genericArtifactPreviews]).slice(0, 6);

  const taskReceiptSummaries = taskDrilldowns.flatMap((task) => {
    const taskId = asString(task.task_id);
    const title = asString(task.title);
    const actionReceipt = asRecord(task.action_receipt);
    const artifact = asRecord(task.artifact_or_blocker);
    const acceptedShapes = taskAcceptedShapes(task, currentOwnerDelta);
    if (!taskId || !title || !actionReceipt) return [];
    const actionId = asString(actionReceipt.action_id);
    const actionRoute = asString(actionReceipt.route);
    const exportActionId = asString(actionReceipt.export_bundle_action_id);
    const exportRoute = asString(actionReceipt.export_bundle_route);
    const exportBundleRef = asStringArray(artifact?.export_bundle_refs)[0];
    return [
      ...(actionId && actionRoute ? [{
        id: `action-receipt-${taskId}`,
        title: `${title} receipt preview`,
        actionId,
        route: ensureDryRunJsonRoute(actionRoute),
        status: "payload_required" as const,
        mutates: "none_read_only",
        receiptRef: asString(actionReceipt.preview_ref) ?? `receipt://${taskId}/preview`,
        summary: compactText(task.next_visible_step, "Task preview receipt derived from operator workbench."),
        payloadFields: ["task_id", "action_ref"],
        owner: asString(task.typed_blocker_owner) ?? asString(currentOwnerDelta?.owner) ?? asString(task.domain_id) ?? undefined,
        authorityBoundary: "Task receipt preview only; no domain execution or owner receipt is implied.",
        sourceRefs: uniqueStrings([
          asString(actionReceipt.preview_ref),
          asString(artifact?.current_ref),
          asString(task.workspace_path)
        ]),
        checks: uniqueStrings([
          "Bind task_id and action_ref before previewing the receipt.",
          acceptedShapes.length ? `Accepted return shapes: ${acceptedShapes.join(", ")}` : null
        ])
      }] : []),
      ...(exportActionId && exportRoute && exportBundleRef ? [{
        id: `action-export-${taskId}`,
        title: `${title} export bundle preview`,
        actionId: exportActionId,
        route: ensureDryRunJsonRoute(exportRoute),
        status: "payload_required" as const,
        mutates: "none_read_only",
        receiptRef: exportBundleRef,
        summary: compactText(artifact?.content_policy, "Export bundle preview uses refs only."),
        payloadFields: ["task_id", "export_bundle_ref"],
        owner: asString(task.domain_id) ?? undefined,
        authorityBoundary: "Export preview only; bundle contents remain source-owned.",
        sourceRefs: uniqueStrings([
          exportBundleRef,
          asString(artifact?.export_ref),
          asString(artifact?.conformance_ref)
        ]),
        checks: [
          "Confirm the export bundle ref is current before any execute step.",
          "Dry-run does not imply package-ready or owner acceptance."
        ]
      }] : [])
    ];
  });
  const genericReceiptSummaries = contextActions
    .filter((action) => action.dryRunSupported)
    .map((action): ActionReceiptSummary => ({
      id: `action-generic-${action.id}`,
      title: `${action.label} receipt preview`,
      actionId: action.id,
      route: ensureDryRunJsonRoute(action.route),
      status: actionStatus(action),
      mutates: action.mutates,
      receiptRef: `receipt://${action.id}/dry-run`,
      summary: action.payloadFields.length
        ? `Dry-run route exists; payload required: ${action.payloadFields.join(", ")}.`
        : "Dry-run route can preview a refs-only receipt without a domain artifact body."
      ,
      payloadFields: action.payloadFields,
      owner: action.owner,
      authorityBoundary: "Generic action receipt preview only; submit/execute stays outside the renderer.",
      sourceRefs: uniqueStrings([ensureDryRunJsonRoute(action.route), action.delegatedSurface]),
      checks: uniqueStrings([
        action.payloadFields.length ? `Required payload: ${action.payloadFields.join(", ")}` : "No payload required for a preview receipt.",
        action.canSubmitToSafeActionShell ? "Safe-action shell can submit this preview lane." : "Safe-action shell submission is not declared for this route."
      ])
    }));
  const actionReceipts = uniqueByRef([...taskReceiptSummaries, ...genericReceiptSummaries]).slice(0, 8);

  const moduleAvailability = new Map<WorkbenchStarter["id"], { status: string; sourceRef: string }>();
  const moduleRecords = new Map<WorkbenchStarter["id"], Record<string, unknown>>();
  for (const item of moduleItems) {
    const moduleId = asString(item?.module_id) ?? "";
    const label = asString(item?.label) ?? "";
    const key = moduleKey(`${moduleId} ${label}`);
    if (!key) continue;
    const installed = asBoolean(item?.installed);
    const health = asString(item?.health_status) ?? "unknown";
    moduleAvailability.set(key, {
      status: installed ? health : "not_installed",
      sourceRef: asString(item?.checkout_path) ?? asString(item?.repo_url) ?? moduleId
    });
    moduleRecords.set(key, item);
  }

  const starterTasks = new Map<WorkbenchStarter["id"], Record<string, unknown>>();
  for (const task of taskDrilldowns) {
    const key = pickTaskKey(task);
    if (!key) continue;
    const current = starterTasks.get(key);
    const taskId = asString(task.task_id);
    const domainId = asString(task.domain_id);
    if (!current || (taskId && domainId && taskId === domainId)) {
      starterTasks.set(key, task);
    }
  }

  const starters = fallback.starters.map((starter): WorkbenchStarter => {
    const availability = moduleAvailability.get(starter.id);
    const moduleRecord = moduleRecords.get(starter.id) ?? null;
    const task = starterTasks.get(starter.id) ?? null;
    const taskAction = actionMap.get(asString(asRecord(task?.action_receipt)?.action_id) ?? "");
    const exportAction = actionMap.get(
      asString(asRecord(task?.action_receipt)?.export_bundle_action_id)
      ?? extractActionId(asRecord(task?.artifact_or_blocker)?.export_bundle_action_ref)
      ?? ""
    );
    const starterAction = [taskAction, exportAction, starterPreviewAction(starter, contextActions)]
      .find((action): action is WorkbenchActionRef => Boolean(action?.dryRunSupported));
    const routeStatus = starterAction ? actionStatus(starterAction) : "unavailable";
    const taskArtifact = asRecord(task?.artifact_or_blocker);
    const taskActionReceipt = asRecord(task?.action_receipt);
    const starterTitle = asString(task?.title)
      ? `${starter.title.split("/")[0]?.trim() ?? starter.title} / ${asString(task?.title)}`
      : starter.title;
    return {
      ...starter,
      title: starterTitle,
      module: asString(moduleRecord?.label) ?? starter.module,
      intent: compactText(task?.next_visible_step, asString(moduleRecord?.description) ?? starter.intent),
      fields: buildStarterFields(starter, starterAction, task, moduleRecord),
      available: Boolean(starterAction?.dryRunSupported),
      status: routeStatus,
      sourceRef: asString(taskActionReceipt?.preview_ref)
        ?? asString(taskArtifact?.current_ref)
        ?? starterAction?.route
        ?? availability?.sourceRef
        ?? starter.sourceRef,
      previewActionId: starterAction?.id,
      dryRunAction: starterAction?.id
    };
  });

  const runtimeStatus = asString(asRecord(operator?.summary)?.runtime_status)
    ?? asString(asRecord(operator?.summary)?.provider_status)
    ?? asString(currentOwnerDeltaNextAction?.action_kind)
    ?? asString(asRecord(appState.provider)?.status)
    ?? "unknown";

  const effectiveContextSources = contextSources.length ? contextSources : fallback.contextSources;
  const sourceRefs = effectiveContextSources.map((source) => source.ref);
  const previewAction = firstPreviewAction(contextActions);
  const deliveryPackages: DeliveryPackage[] = (deliverables.length || receipts.length || contextActions.length) ? [
    {
      id: "delivery-package",
      title: "Delivery package",
      status: deliverables.length || receipts.length ? "needs_review" : "blocked",
      summary: "Derived from live App action refs, operator task drilldowns, receipt refs, and runtime status; artifact bodies stay source-owned.",
      previewActionId: previewAction?.id,
      deliverableRefs: deliverables.map((item) => item.ref),
      receiptRefs: receipts.map((item) => item.ref),
      sourceRefs,
      runtimeStatus,
      authorityBoundary: "Refs-only delivery context; no artifact body, owner receipt, domain truth, or release authority."
    }
  ] : fallback.deliveryPackages;

  const leadTaskNextStep = compactText(leadTask?.next_visible_step, "Review current App refs before execution.");
  const confirmations: ConfirmationCard[] = previewAction ? [{
    id: `confirm-${previewAction.id}`,
    title: `Preview ${leadTaskTitle} package`,
    question: `Preview ${previewAction.label} for ${leadTaskTitle} as a refs-only delivery package?`,
    risks: [`Runtime status: ${runtimeStatus}`, leadTaskNextStep, "needs_human_confirmation"],
    willChange: [`Create dry-run request for ${previewAction.id}`, "Attach current App state refs"],
    willNotChange: ["No domain artifact body is written", "No owner receipt or release claim is created"],
    receipt: "Preview receipt from opl app action execute --dry-run",
    rollback: "Discard the candidate packet request before explicit execution",
    dryRunAction: previewAction.id
  }] : [];

  const questions = leadTask ? [
    {
      id: "question-owner-shape",
      question: compactText(currentOwnerDelta?.desired_delta_description, leadTaskNextStep),
      whyItMatters: compactText(currentOwnerDeltaNextAction?.action_kind, "Current owner delta defines the next legal answer shape."),
      answerType: asStringArray(currentOwnerDelta?.accepted_answer_shape).join(", ") || "typed owner answer"
    },
    {
      id: "question-review-receipt",
      question: `Which receipt ref should stay attached to ${leadTaskTitle}?`,
      whyItMatters: "Review receipts stay refs-only and do not transfer domain authority.",
      answerType: "receipt ref"
    },
    {
      id: "question-package-export",
      question: "Which export bundle ref should be previewed next?",
      whyItMatters: "Export bundle previews remain App-owned dry-run refs, not artifact bodies.",
      answerType: "export bundle ref"
    }
  ] : [];

  const contextTrace = [
    { id: "profile", label: "Profile", value: `${asString(meta?.profile) ?? "fast"} | ${formatTimestamp(meta?.generated_at) ?? "no timestamp"}` },
    { id: "owner", label: "Owner route", value: `${asString(currentOwnerDelta?.owner) ?? asString(workbench?.operator_next_action_owner) ?? "unknown"} -> ${asString(currentOwnerDeltaNextAction?.action_kind) ?? asString(workbench?.operator_next_action_kind) ?? "unknown next action"}` },
    { id: "runtime", label: "Runtime", value: `${asString(asRecord(operator?.summary)?.runtime_status) ?? "unknown"} | provider ${asString(asRecord(operator?.summary)?.provider_status) ?? "unknown"}` },
    { id: "boundary", label: "Boundary", value: `${asString(runtimeSource?.owner) ?? "opl_framework"} via ${asString(runtimeSource?.app_repo_truth_owner) ?? "one-person-lab-app"} | refs only` },
    { id: "hard-gate", label: "Hard gate", value: `${asString(asRecord(currentOwnerDelta?.hard_gate)?.state) ?? "unknown"}${leadAcceptedShapes.length ? ` | return ${leadAcceptedShapes.join(", ")}` : ""}` },
    { id: "task", label: "Lead task", value: `${leadTaskTitle} | ${compactText(leadTask?.next_visible_step, "Review current refs", 72)}` }
  ].filter((item) => item.value);

  const sessions = taskDrilldowns.length
    ? taskDrilldowns.slice(0, 3).map((task): WorkspaceSession => ({
        id: asString(task.task_id) ?? `session-${Math.random()}`,
        workspace: `${asString(task.domain_label) ?? "OPL"}${asString(task.workspace_label) ? ` / ${asString(task.workspace_label)}` : ""}`,
        session: `${asString(task.title) ?? asString(task.task_id) ?? "Delivery review"}${asString(task.active_stage_label) ? ` · ${asString(task.active_stage_label)}` : ""}`,
        status: `${asString(task.status) ?? asString(task.state) ?? "candidate_surface_only"}${asString(task.priority_bucket) ? ` · ${asString(task.priority_bucket)}` : ""}`,
        nextStep: compactText(task.next_visible_step, "Review current refs")
      }))
    : fallback.sessions;

  const derivedActiveProjectLines = taskDrilldowns.length ? taskDrilldowns.slice(0, 6).map((task): ActiveProjectLine => ({
    status: asString(task.status) ?? asString(task.state) ?? "unknown",
    activeRunId: asString(task.active_run_id),
    nextVisibleStep: compactText(task.next_visible_step, "Review current refs"),
    progressDeltaClassification: asString(task.priority_bucket) ?? asString(asRecord(task.progress)?.status) ?? "platform_or_observability_delta",
    deliverableProgressDelta: asString(asRecord(task.artifact_or_blocker)?.content_policy) ?? "refs_only_no_artifact_body",
    platformRepairDelta: asString(task.runtime_attempt_status) ?? "none",
    nextForcedDelta: asString(asRecord(task.review_receipt)?.next_action) ?? asString(currentOwnerDeltaNextAction?.action_kind) ?? "owner adoption gate"
  })) : pickActiveProjectLines(appState.active_project_lines, fallback.activeProjectLines);

  return {
    ...fallback,
    sessions,
    results: buildResultsFromTasks(taskDrilldowns),
    deliverables,
    receipts,
    artifactPreviews,
    deliveryPackages,
    actionReceipts,
    packageLifecycle,
    starters,
    confirmations,
    questions,
    activeProjectLines: derivedActiveProjectLines,
    contextSources: effectiveContextSources,
    contextActions: contextActions.length ? contextActions : fallback.contextActions,
    contextTrace: contextTrace.length ? contextTrace : fallback.contextTrace,
    gatewayAccount,
    settingsProjection,
    runtimeOverview,
    serviceRecovery: deriveServiceRecoveryModel({ temporal, actions, stateFresh: true }),
    workItemRuntime,
    managedCompanions: readManagedCompanions(appState),
    uiContributions: readUiContributionsProjection(state),
    stateGeneratedAt: asString(meta?.generated_at) ?? fallback.stateGeneratedAt
  };
}

export function readManagedUpdateProjection(value: unknown): ManagedUpdateProjection | null {
  const root = asRecord(value);
  const outerAppState = asRecord(root?.app_state);
  const appState = asRecord(outerAppState?.app_state) ?? outerAppState;
  const execution = asRecord(root?.app_action_execution);
  const result = asRecord(execution?.result) ?? asRecord(root?.result);
  const managedUpdate = asRecord(result?.managed_update)
    ?? asRecord(execution?.managed_update)
    ?? asRecord(root?.managed_update)
    ?? asRecord(appState?.managed_update);
  if (!managedUpdate) return null;
  const components = asRecordArray(managedUpdate.components).flatMap((component): ManagedUpdateComponentRef[] => {
    const componentId = asString(component.component_id);
    if (!componentId) return [];
    const current = asRecord(component.current);
    const dependencyCatalog = asRecord(current?.dependency_catalog);
    const autoApply = asRecord(component.auto_apply);
    const plan = asRecord(component.plan);
    const flowDependencies = dependencyCatalog && Array.isArray(dependencyCatalog.flow_dependencies)
      ? asRecordArray(dependencyCatalog.flow_dependencies).flatMap((dependency) => {
        const projection = readManagedUpdateFlowDependency(dependency);
        return projection ? [projection] : [];
      })
      : undefined;
    return [{
      componentId,
      lifecycleOwner: asString(component.lifecycle_owner) ?? componentId,
      label: asString(component.label) ?? componentId,
      state: asString(component.state) ?? "unknown",
      ...(asString(component.channel) ?? asString(managedUpdate.update_channel)
        ? { channel: (asString(component.channel) ?? asString(managedUpdate.update_channel)) as string }
        : {}),
      ...(asString(current?.installed_version) ? { installedVersion: asString(current?.installed_version) as string } : {}),
      ...(asString(current?.latest_version) ? { latestVersion: asString(current?.latest_version) as string } : {}),
      ...(asString(current?.currentness) ? { currentness: asString(current?.currentness) as string } : {}),
      ...(asString(autoApply?.mode) ? { autoApplyMode: asString(autoApply?.mode) as string } : {}),
      autoApplyEligible: asOptionalBoolean(autoApply?.eligible),
      backgroundSafe: asOptionalBoolean(autoApply?.app_background_safe),
      ...(asString(plan?.summary) ? { summary: asString(plan?.summary) as string } : {}),
      ...(asString(current?.manual_guidance) ? { guidance: asString(current?.manual_guidance) as string } : {}),
      ...(flowDependencies ? { flowDependencies } : {})
    }];
  });
  return {
    operation: asString(managedUpdate.operation) ?? "status",
    ...(asString(managedUpdate.update_channel) ? { channel: asString(managedUpdate.update_channel) as string } : {}),
    components
  };
}

export function mergeManagedUpdateProjections(
  current: ManagedUpdateProjection | null,
  incoming: ManagedUpdateProjection
): ManagedUpdateProjection {
  const components = new Map((current?.components ?? []).map((component) => [component.componentId, component]));
  for (const component of incoming.components) components.set(component.componentId, component);
  return {
    operation: incoming.operation,
    ...(incoming.channel ?? current?.channel ? { channel: (incoming.channel ?? current?.channel) as string } : {}),
    components: Array.from(components.values())
  };
}
