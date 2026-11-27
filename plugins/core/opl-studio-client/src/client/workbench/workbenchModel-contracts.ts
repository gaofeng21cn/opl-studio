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

import type { ServiceRecoverySummary } from "@gaofeng21cn/opl-host-contracts";

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
  serviceRecovery?: ServiceRecoverySummary;
  workItemRuntime?: WorkItemRuntimeProjection;
  managedCompanions: ManagedCompanionViewModel[];
  uiContributions: OplUiContributionsProjection;
  canExecuteUiContributions?: boolean;
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
  packageLifecycle: [],
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
