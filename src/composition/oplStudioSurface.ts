import type { ReactNode } from "react";
import type { SettingsDestinationId } from "../workbench/SettingsPanel";
import type { AgentPackageSelectionIntent, WorkbenchProjectGroup } from "../workbench/workbenchModel";
import type { ResolvedCodexModelOption } from "../workbench/modelPolicy";
import type { OplInitializeReadback } from "../bridge/oplBridge";
import type { OplContributionSlotOwner, OplUiContributionsProjection } from "./contributionProjection";

export type OplSetupOperationResult = {
  status: "completed" | "cancelled" | "error";
  message?: string;
};

export type OplStudioPrimaryView = "conversation" | "runtime";
export type RenderSettingsContribution = (options?: { only?: string }) => ReactNode;

export type OplStudioSurface = {
  locale: "zh" | "en";
  projectTitle: string;
  sessionTitle: string;
  workspacePath: string;
  prompt: string;
  promptRevision: number;
  conversationBlank: boolean;
  sending: boolean;
  queue: Array<{
    id: string;
    placement: "queued";
    preview: string;
    text: string | null;
  }>;
  contributionOwner: OplContributionSlotOwner;
  uiContributions: OplUiContributionsProjection;
  threadProjects: WorkbenchProjectGroup[];
  threadDirectoryStatus: "loading" | "ready" | "error";
  threadDirectoryError: string;
  currentThreadId?: string;
  selectedProjectId?: string;
  modelOptions: ResolvedCodexModelOption[];
  modelSelection: string;
  reasoningSelection: string;
  reasoningOptions: string[];
  resolvedModelId?: string;
  agentPresets: Array<{
    id: string;
    name: string;
    description: string;
    selection: AgentPackageSelectionIntent | null;
  }>;
  selectedAgentPresetId: string;
  conversationBody: ReactNode;
  primaryView: OplStudioPrimaryView;
  runtimeOverview: ReactNode;
  openPrimaryView(view: OplStudioPrimaryView): void;
  composerAccessory: ReactNode;
  composerOverlay: ReactNode;
  details: ReactNode;
  renderSettings(destination: SettingsDestinationId, renderContribution?: RenderSettingsContribution): ReactNode;
  initializationStatus: "loading" | "ready" | "error";
  initialization: OplInitializeReadback | null;
  refreshInitialization(): void;
  setupCapabilities: {
    workspaceRoot: boolean;
    codexInstall: boolean;
  };
  chooseWorkspaceRoot(): Promise<OplSetupOperationResult>;
  installCodex(): Promise<OplSetupOperationResult>;
  overlay: ReactNode;
  detailsRequestRevision: number;
  startSession(): void;
  startSessionInProject(projectId?: string): void;
  openThread(threadId: string): void;
  renameSession(threadId: string, title: string): Promise<void>;
  renameWorkspace(workspaceId: string, title: string): Promise<void>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  insertWorkspaceBefore(workspaceId: string, beforeWorkspaceId?: string): Promise<void>;
  insertSessionBefore(workspaceId: string, threadId: string, beforeThreadId?: string): Promise<void>;
  createWorkspace(path: string): Promise<void>;
  forkThread(threadId: string): void;
  archiveThread(threadId: string): Promise<void>;
  searchThreads(query: string): Promise<Array<{ sessionId: string; snippet?: string }>>;
  reloadThreadDirectory(): void;
  selectModel(modelId: string, reasoningEffort?: string): Promise<boolean>;
  selectAgentPreset(id: string): Promise<void>;
  updatePrompt(value: string): void;
  submitPrompt(mode?: "queue" | "steer"): void;
  steerQueue(): void;
  updateQueue(itemId: string, action: { kind: string; content?: Array<{ type?: string; text?: string }> }): Promise<void>;
  notifyQueue(level: "info" | "error", text: string): void;
  openComposerPalette(): void;
  stopTurn?(): void;
};

export type RenderOplStudioShell = (surface: OplStudioSurface) => ReactNode;
