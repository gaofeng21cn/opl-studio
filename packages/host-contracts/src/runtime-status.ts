export type WorkItemLocalizedText = {
  zh?: string;
  en?: string;
};

export type WorkItemRuntimeStage = {
  stageId: string;
  displayName: string;
  displayNameI18n: WorkItemLocalizedText;
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

export type WorkItemAttentionEnvelope = {
  kind: string;
  reason?: string;
  owner?: string;
  responsibleComponent?: string;
  issue?: string;
  impact?: string;
  repairAction?: string;
  expectedOutcome?: string;
};

export type WorkItemRuntimeItem = {
  id: string;
  agentId: string;
  agentDisplayName: string;
  domainId?: string;
  projectId: string;
  projectDisplayName: string;
  workspacePath?: string;
  workItemRoot?: string;
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
  packageStatus?: string;
  currentStageId?: string;
  currentStageName?: string;
  executionStageId?: string;
  attemptId?: string;
  nextStageId?: string;
  nextStageName?: string;
  executionState: string;
  activeSessionCount: number;
  attentionKind: string;
  attention?: WorkItemAttentionEnvelope;
  nextActionTitle?: string;
  nextActionSummary?: string;
  nextActionOwner?: string;
  actionTitleKey?: string;
  actionSummaryKey?: string;
  actionMessageArgs?: Record<string, unknown>;
  actionOwnerKind?: string;
  actionRef?: string;
  startedAt?: string;
  lastHeartbeatAt?: string;
  updatedAt?: string;
  elapsedMs: number | null;
  stageTokens: number | null;
  stageTokensState?: string;
  totalTokens: number | null;
  cumulativeTokensState?: string;
  telemetryState: string;
  telemetryMissingReason?: string;
  freshnessState?: string;
  archived: boolean;
  visibilityGeneration?: number;
  visibilityControlRef?: string;
  visibilitySource?: string;
  visibilityUpdatedAt?: string;
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

export type ServiceRecoverySummary = {
  causalRoot: {
    component: string;
    status: string;
    reasonCode: string;
    rawStatus: string;
    detail: { zh: string; en: string };
    sourceRef: string;
  };
  components: {
    service: { ready: boolean | null; status: string };
    worker: { ready: boolean | null; status: string };
    scheduler: { ready: boolean | null; status: string };
  };
  mutationGuard: {
    status: string;
    allowed: boolean | null;
    blockedReason?: string;
    sourceRef: string;
  };
  primaryAction: {
    actionId: string;
    kind: string;
    label: string;
    mutates: boolean;
    confirmationRequired: boolean;
    sourceRef: string;
  } | null;
  primaryActionBlockedReason?: string;
};
