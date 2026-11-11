import { type WorkbenchServicesClient } from "../plugins/WorkbenchServicesPanel";

import type { ActionReceiptView } from "../actionReceiptView";

import { FontSizeRow } from "../../vendor/deepseek-harness/packages/client/ui-theme/src/client/FontSizeRow";

import { createContext, type ReactNode } from "react";
import type { CarrierDiagnosticsReadback, CodexCapabilityCatalog, NativeAppUpdateResult, OplInitializeReadback } from "../../bridge/oplBridge";
import type { ManagedUpdateProjection, WorkbenchModel } from "../workbenchModel";
import { type ResolvedCodexModelOption } from "../modelPolicy";
import type { WorkbenchSettings } from "../settingsModel";

import { type SettingsActionRequest, type SettingsHostActionIntent, type SettingsActionViewModel } from "../settingsActions";
import { AppearanceRow } from "../../vendor/deepseek-harness/packages/client/ui-theme/src/client/AppearanceRow";

import { SettingsActionConfirmation } from "./presentation";

export const StudioAppearanceRow = AppearanceRow as (props: Pick<Parameters<typeof AppearanceRow>[0], "t" | "setTheme" | "useStore" | "actions">) => ReturnType<typeof AppearanceRow>;

export const StudioFontSizeRow = FontSizeRow as (props: Pick<Parameters<typeof FontSizeRow>[0], "t" | "role" | "setFontSize" | "useStore" | "actions">) => ReturnType<typeof FontSizeRow>;

export type SettingsDestinationId =
  | "overview"
  | "account"
  | "models"
  | "resources"
  | "workspace"
  | "storage"
  | "agents"
  | "capabilities"
  | "instructions"
  | "services"
  | "updates"
  | "diagnostics"
  | "preferences"
  | "about";

export type SettingsContextDestinationId = "resources" | "agents" | "instructions" | "memory";

export type SettingsMobileView = "categories" | "destinations" | "about";

export const SettingsNavigationContext = createContext<{
  destination: SettingsDestinationId | null;
  navigate(destination: SettingsDestinationId): void;
  mobileView: SettingsMobileView;
  setMobileView(view: SettingsMobileView): void;
} | null>(null);

export type SettingsGroupId =
  | "overview"
  | "account_models"
  | "connections_deployment"
  | "workspace"
  | "agents_capabilities"
  | "runtime_maintenance"
  | "preferences";

export type SettingsPanelProps = {
  mobileNavigation?: {
    view: SettingsMobileView;
    setView: (view: SettingsMobileView) => void;
  };
  workbenchServices?: WorkbenchServicesClient;
  onClose?: () => void;
  onOpenSchedules?: () => void;
  onOpenSoftwareCenter?: (section?: "applications" | "updates" | "resources" | "sources") => void;
  model: WorkbenchModel;
  managedUpdate: ManagedUpdateProjection | null;
  actionViewModel?: SettingsActionViewModel;
  settings: WorkbenchSettings;
  modelOptions: ResolvedCodexModelOption[];
  resolvedModel?: ResolvedCodexModelOption;
  resolvedReasoning: string;
  resolvedReasoningOptions: string[];
  stateStatus: "loading" | "ready" | "error";
  stateError: string;
  carrierDiagnostics: CarrierDiagnosticsReadback;
  initializationStatus: "loading" | "ready" | "error";
  initialization: OplInitializeReadback | null;
  nativeAppUpdate: NativeAppUpdateResult | null;
  maintenanceStatus?: string | null;
  maintenanceError?: string | null;
  dockerDiagnostic: SettingsDockerDiagnostic | null;
  capabilityCatalog: CodexCapabilityCatalog;
  capabilityStatus: "idle" | "loading" | "ready" | "error";
  capabilityError: string;
  onRefreshCapabilities: () => void;
  activeDestination: SettingsDestinationId;
  onNavigate?: (destination: SettingsDestinationId) => void;
  onRefresh: () => void;
  readMemory?: () => Promise<import("../../bridge/oplBridge").OplFullDrilldownReadback>;
  onRefreshInitialization: () => void;
  setupCapabilities: {
    workspaceRoot: boolean;
    codexInstall: boolean;
    modelAccessSecretInput: boolean;
  };
  onChooseWorkspaceRoot: () => Promise<unknown>;
  onInstallCodex: () => Promise<unknown>;
  onConfigureCodexApiKey: (apiKey: string) => Promise<boolean>;
  onChangeLogDirectory: () => void;
  onOpenLogDirectory?: () => Promise<unknown>;
  currentWorkspace?: string;
  onOpenWorkspace?: () => Promise<unknown>;
  onSettingChange: <Key extends keyof WorkbenchSettings>(key: Key, value: WorkbenchSettings[Key]) => void;
  onReasoningChange: (reasoning: WorkbenchSettings["reasoningLevel"]) => void;
  additionalConversationInstructions: string;
  onAdditionalConversationInstructionsChange: (value: string) => void;
  onAction: (request: SettingsActionRequest) => void;
  onHostAction?: (intent: SettingsHostActionIntent) => void;
  onGatewayLogin?: (credentials: { email: string; password: string }) => Promise<boolean>;
  onApproveConnectionAccess?: (requestId: string) => Promise<boolean>;
  manifestInstallAction?: {
    actionId: string;
    payloadFields: string[];
    confirmationRequired: boolean;
    dryRunSupported: boolean;
  };
  actionBusyKey: string | null;
  actionFeedback: SettingsActionFeedback | null;
  actionReceipt?: ActionReceiptView | null;
  pendingConfirmation: SettingsActionConfirmation | null;
  onConfirmAction: () => void;
  onCancelAction: () => void;
  renderPackageContributions?: (packageId: string) => ReactNode;
};

export type SettingsActionFeedback = {
  tone: "success" | "attention" | "neutral";
  message: string;
};

export type SettingsDockerDiagnostic = {
  status: string;
  attentionCount?: number;
  startupPhase?: string;
  dockerRuntimeStatus?: string;
  browserUrlStatus?: string;
  startupMaintenanceStatus?: string;
};

export const quietDockerDiagnosticStatuses = new Set([
  "not_checked",
  "unknown",
  "initializing",
  "not_visible",
  "verification_deferred",
  "pending"
]);
