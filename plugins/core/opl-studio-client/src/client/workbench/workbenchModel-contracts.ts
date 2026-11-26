import type { WorkbenchPurpose, WorkbenchArtifactRef, WorkspaceSession, ArtifactPreview, WorkbenchSourceRef, WorkbenchActionRef, WorkbenchFeatureRef, WorkbenchTraceRef, WorkbenchStarter, ConfirmationCard, InterviewQuestion, ActiveProjectLine, DeliveryPackage, ActionReceiptSummary } from "./workbenchModel-conversation-contracts";
import type { AgentPackageLifecycleRef, SoftwareSourcesProjection } from "./workbenchModel-package-contracts";
import type { WorkItemRuntimeProjection, RuntimeOverviewRef } from "./workbenchModel-runtime-contracts";
import type { WorkbenchGatewayAccount, WorkbenchSettingsProjection } from "./workbenchModel-settings-contracts";
import type { KnowledgeSourcesProjection } from "./knowledgeSources";

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
  softwareSources?: SoftwareSourcesProjection;
  knowledgeSources?: KnowledgeSourcesProjection;
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
  applicationManagement?: ApplicationManagementProjection;
  runtimeOverview?: RuntimeOverviewRef;
  serviceRecovery?: ServiceRecoveryModel;
  workItemRuntime?: WorkItemRuntimeProjection;
  managedCompanions: ManagedCompanionViewModel[];
  uiContributions: OplUiContributionsProjection;
  stateGeneratedAt?: string;
};

export type ApplicationManagementResource = {
  resourceId: string;
  resourceKind: "knowledge_source" | "connection" | "model" | "base_capability";
  label: string;
  labelI18n?: { zh?: string; en?: string };
  status: "ready" | "attention" | "unknown";
  sourceRefs: string[];
  consumerPackageIds: string[];
  ownerSettingsRoute?: string;
  relationKind: "required" | "optional" | "configured";
  detailRef?: string;
  authorization?: {
    status: "authorized" | "attention" | "unknown";
    consumerCount?: number;
    grantCount?: number;
  };
  revision?: {
    status: "current" | "stale" | "unknown";
    securityRevision?: string;
  };
  freshness?: {
    status: "fresh" | "stale" | "unknown";
    observedAt?: string;
  };
  readiness?: {
    status: "ready" | "attention" | "unknown";
    reason?: string;
  };
};

export type ApplicationManagementProjection = {
  sharedResources: ApplicationManagementResource[];
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

export type {
  WorkbenchPurpose,
  WorkbenchPreviewKind,
  WorkbenchArtifactRef,
  WorkspaceSession,
  WorkbenchThreadMessage,
  WorkbenchThreadItem,
  WorkbenchProjectGroup,
  ArtifactPreview,
  WorkbenchSourceRef,
  WorkbenchActionRef,
  WorkbenchFeatureState,
  WorkbenchFeatureRef,
  WorkbenchTraceRef,
  WorkbenchStarterField,
  WorkbenchStarter,
  ConfirmationCard,
  InterviewQuestion,
  ActiveProjectLine,
  DeliveryPackage,
  ActionReceiptSummary
} from "./workbenchModel-conversation-contracts";

export type {
  PackageLifecycleActionKind,
  PackageLifecycleActionRef,
  PackageLifecycleDisplayRef,
  PackageLifecycleStatusAxis,
  PackageLifecycleSearchMetadata,
  PackageLifecycleDetailRef,
  AgentPackageLocalizedText,
  AgentPackageRouteRef,
  AgentPackageShortcutRef,
  AgentPackageReadinessRef,
  AgentPackageDependencyRef,
  AgentPackageLifecycleRef,
  AgentPackageSelectionIntent
} from "./workbenchModel-package-contracts";

export type {
  WorkItemRuntimeStage,
  DomainDetailViewAvailability,
  DomainDetailViewDescriptor,
  WorkItemRuntimeItem,
  WorkItemRuntimeProjection,
  RuntimeMaintenanceActionRef,
  ManagedUpdateDependencyVersion,
  ManagedUpdateComponentRef,
  ManagedFlowDependencyRef,
  ManagedRuntimeDependencyRef,
  ManagedPackageStateRef,
  ManagedUpdateProjection,
  RuntimeOverviewRef
} from "./workbenchModel-runtime-contracts";

export type {
  WorkbenchGatewayAccount,
  WorkbenchSettingsProjection
} from "./workbenchModel-settings-contracts";

export type {
  ConnectionAuthorizationCapability,
  AuthorizedConnectionSummary,
  ConnectionAuthorizationConsumer,
  ConnectionAccessRequest,
  ConnectionGrant,
  ConnectionInvocation,
  AvailableRelayConnection,
  ConnectionAuthorizationProjection
} from "./workbenchModel-connection-contracts";
