import type { RendererPreviewKind } from "../renderers/moduleRegistry";

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
