import { createComposerAttachmentController, disposeSelectionPreviews } from "./composerAttachments";
import type { McpAppOpen } from "../bridge/mcpApps";
import { useWorkbenchShortcuts } from "./shortcuts";
import { VoiceInput } from "./VoiceInput";
import { appendVoiceTranscript, voiceInputContextKey, type VoiceInputContext } from "../composition/voiceInputModel";
import { DshScheduledTasksPanel } from "./plugins/WorkbenchServicesPanel";
import { SettingsActionDialog } from "./settings/SettingsActionDialog";
import { agentAvailabilityDetail } from "./settings/packages";
import { gatewayAccountErrorMessage } from "./settings/gatewayAccountMessages";
import { actionReceiptView, type ActionReceiptView } from "./actionReceiptView";
import { WorkspaceReviewPreview } from "../composition/workspaceClientPlugin";
import { resolveDeepLinkDestination } from "./deepLinkNavigation";
import { SubagentsPanel } from "./SubagentsPanel";
import { WorkspaceGitPanel } from "./WorkspaceGitPanel";
import { featureRefsWithCodexStatus } from "./featureModel";
import { Button, Modal, Pill } from "@deepseek-ai/dsh-client-ui-primitives";
import { Streamdown } from "streamdown";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronLeft,
  CircleEllipsis,
  Clock3,
  Download,
  Files,
  FileText,
  Folder,
  RefreshCw,
  Search
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import {
  createBrowserBridge,
  readStartupState,
  type CodexAgentSelectionSnapshot,
  type CodexCapabilityCatalog,
  type CodexComposerInput,
  type CodexModelCatalogEntry,
  type CodexSkillCapability,
  type CarrierDiagnosticsReadback,
  type OplInitializeReadback,
  type NativeAppUpdateResult,
  type OplActionReceipt
} from "../bridge/oplBridge";
import type { CodexThread } from "../threads/types";
import { ArtifactPreviewCard } from "../ui/workbenchPrimitives";
import {
  deriveWorkbenchModelFromState,
  deriveThreadDirectory,
  deriveThreadMessages,
  initialWorkbenchModel,
  mergeManagedUpdateProjections,
  readManagedUpdateProjection,
  agentPackageSelectionIntent,
  type ManagedUpdateProjection,
  type AgentPackageSelectionIntent,
  type WorkbenchArtifactRef,
  type WorkbenchProjectGroup,
  type WorkbenchModel,
  type WorkbenchThreadItem,
  type WorkbenchThreadMessage
} from "./workbenchModel";
import {
  markGatewayAccountCacheStale,
  readGatewayAccountCache,
  writeGatewayAccountCache
} from "./gatewayAccountCache";
import {
  readAdditionalConversationInstructions,
  readSettings,
  writeAdditionalConversationInstructions,
  writeSetting,
  writeSettings,
  type WorkbenchSettings
} from "./settingsModel";
import { codexWorkbenchStyles } from "./codexWorkbenchStyles";
import { RuntimeOverviewPage } from "./RuntimeOverviewPage";
import { ApplicationManagementPage, type ApplicationManagementTab } from "./ApplicationManagementPage";
import {
  readRuntimeOverviewCache,
  runtimeOverviewModelFromCache,
  writeRuntimeOverviewCache
} from "./runtimeOverviewCache";
import {
  codexModelPolicy,
  resolveCodexModelOptions,
  resolveCodexSelection
} from "./modelPolicy";
import {
  SettingsPanel,
  type SettingsActionConfirmation,
  type SettingsActionFeedback,
  type SettingsActionRequest,
  type SettingsDockerDiagnostic,
  type SettingsDestinationId
} from "./SettingsPanel";
import {
  buildSettingsActionViewModel,
  readGatewayActionsFromState,
  type ProjectedGatewayAction,
  type SettingsHostActionIntent
} from "./settingsActions";
import { ThreadDetailPopover } from "./threads/ThreadDetailPopover";
import { ThreadLifecycleConfirmationDialog } from "./threads/ThreadLifecycleConfirmationDialog";
import type { ThreadLifecycleAction } from "./threads/ThreadLifecycleConfirmationDialog";
import { ConversationMessages } from "./ConversationMessages";
import { assistantDisplayMarkdown } from "./messageDisplay";
import {
  ComposerCapabilityPalette,
  type ComposerAgentOption,
  type ComposerOplCapabilityOption,
  type ComposerSelection
} from "./ComposerCapabilityPalette";
import { ComposerAccessory } from "./ComposerAccessory";
import {
  buildRunDetailViewModel,
  type ScopedRunDetailItem
} from "./runDetailModel";
import {
  collectCanonicalReconcileTargets,
  isEventForActiveTurn,
  resolveCanonicalTurn,
  shouldNotifyCanonicalCompletion
} from "./canonicalThreadReconcile";
import {
  composerTurnKey,
  mergeComposerSelections,
  mergeComposerSubmissionPrompt,
  terminalTrackedComposerTurns,
  trackComposerTurnSelections,
  type TrackedComposerTurn
} from "./composerSubmissionLifecycle";
import type {
  OplContributionAction,
  OplUiContribution,
  OplUiContributionCommand,
  OplUiContributionsProjection,
  RenderOplContributionSlot
} from "../composition/contributionProjection";
import { settingsContributionDestination } from "../composition/contributionProjection";
import { contributionActionOutcome, contributionLabel, createOplContributionActionRequest } from "../composition/contributionProjection";
import type { OplAgentPermission, OplSetupOperationResult, OplStudioPrimaryView, RenderOplStudioShell } from "../composition/oplStudioSurface";
import type { OplStudioDetailTab } from "../composition/clientCordis";
import { CodexServerRequestPanel } from "./CodexServerRequestPanel";
import { WorkspaceFilesPanel } from "./WorkspaceFilesPanel";
import { ProjectProgressPanel } from "./ProjectProgressPanel";
import { selectProjectProgress } from "./projectProgress";
import {
  dockerDiagnosticFromReceipt,
  managedUpdateActionSpecs,
  readProjectedManagedUpdateActions,
  readProjectedManifestInstallAction,
  readProjectedSetupActions,
  type ProjectedManagedUpdateAction,
  type ProjectedManifestInstallAction,
  type ProjectedSetupAction
} from "./appProjection";
import { firstPreviewAction } from "./workbenchModel-presentation";
export {
  readProjectedManagedUpdateActions,
  readProjectedManifestInstallAction,
  readProjectedSetupActions
} from "./appProjection";
import {
  assistantMarkdownControls,
  assistantMarkdownLinkSafety,
  emptyCapabilityCatalog,
  exportActionRefId,
  standardAgentSeatPresentationZh,
  threadRuntimeStatusLabel,
  uiCopy
} from "./appCopy";
import {
  readPersistedWorkbenchUi,
  writeDrafts,
  writeUiMetadata,
  type WorkbenchDrafts,
  type WorkbenchUiMetadata
} from "./appPersistence";
// Persistence contract remains owned by appPersistence: legacyChatSessionsBackupKey,
// storage.removeItem(legacyChatSessionsStorageKey), uiMetadataStorageKey, and draftStorageKey.
import {
  eventCompletedText,
  eventDelta,
  eventMethod,
  eventParams,
  formatEvent
} from "./appEvents";

type ContextTabId = OplStudioDetailTab["id"];
type FilesDetailView = "workspace" | "inputs" | "results";

const initializationActionIds = new Set([
  "workspace_root_set",
  "codex_install",
  "gateway_account_complete_setup",
  "gateway_account_use_for_model_access"
]);

function formatReceipt(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function contributionReceiptForDisplay(entry: OplUiContribution, receipt: OplActionReceipt, transientPresentation = false): OplActionReceipt | Record<string, unknown> {
  if (entry.view?.viewType !== "remote_companion_access" && !transientPresentation) return receipt;
  // Remote pairing input and provider output are transient; keep only action metadata in the global receipt panel.
  return {
    actionId: receipt.actionId,
    dryRun: receipt.dryRun,
    confirmationRequired: receipt.confirmationRequired,
    canExecute: receipt.canExecute,
    receiptKind: receipt.receiptKind,
    authorityBoundary: receipt.authorityBoundary,
    requestedMode: receipt.requestedMode,
    status: receipt.status,
    exitCode: receipt.exitCode,
    timedOut: receipt.timedOut,
    ...(receipt.confirmationId ? { confirmationId: receipt.confirmationId } : {}),
    ...(receipt.receiptId ? { receiptId: receipt.receiptId } : {}),
    ...(receipt.rollbackRef ? { rollbackRef: receipt.rollbackRef } : {})
  };
}

function createIntroMessages(): ChatMessage[] {
  return [];
}

function codexSkillMatchesRef(skillName: string, skillRef: string): boolean {
  const normalizedName = skillName.toLowerCase();
  const normalizedRef = skillRef.toLowerCase();
  if (normalizedName === normalizedRef || normalizedName.endsWith(`:${normalizedRef}`) || normalizedRef.endsWith(`:${normalizedName}`)) return true;
  return normalizedName.split(":").at(-1) === normalizedRef.split(":").at(-1);
}

type ChatMessage = WorkbenchThreadMessage;

type ComposerSubmitMode = "queue" | "steer";

type EphemeralQueueItem = {
  id: string;
  placement: "queued";
  preview: string;
  text: string | null;
  prompt: string;
  inputs: CodexComposerInput[];
  selections: ComposerSelection[];
  turnAgentSelection?: CodexAgentSelectionSnapshot;
};

function composerSelectionArtifact(selection: ComposerSelection): WorkbenchArtifactRef {
  return {
    id: selection.id,
    title: selection.label,
    kind: "file",
    status: "ready",
    previewKind: "code",
    ref: selection.detail,
    summary: selection.detail,
    provenance: [selection.detail],
    actions: []
  };
}

function localizedSessionTitle(title: string, locale: WorkbenchSettings["locale"]): string {
  if (locale !== "zh") return title;
  if (title === "Current project") return "当前项目";
  if (title === "New chat" || title === "New task") return "新任务";
  return title;
}

type AppProps = {
  detailTabs: readonly OplStudioDetailTab[];
  renderShell: RenderOplStudioShell;
  renderContributionSlot?: RenderOplContributionSlot;
  onHostStateChange?: (state: unknown) => void;
  onHostStateDispose?: () => void;
};

export function App({
  detailTabs,
  renderShell,
  renderContributionSlot,
  onHostStateChange,
  onHostStateDispose
}: AppProps) {
  const bridge = useMemo(() => createBrowserBridge(), []);
  const persistedUi = useMemo(() => readPersistedWorkbenchUi(), []);
  const cachedRuntime = useMemo(() => readRuntimeOverviewCache(), []);
  const conversationRef = useRef<HTMLElement | null>(null);
  const pendingAssistantIdRef = useRef<string | null>(null);
  const interruptRequestedForRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>(createIntroMessages());
  const activeTurnRef = useRef<{ threadId: string; turnId: string } | null>(null);
  const pendingSubmissionSelectionsRef = useRef<{
    expectedThreadId?: string;
    selections: ComposerSelection[];
  } | null>(null);
  const stagedSelectionsByTurnRef = useRef(new Map<string, TrackedComposerTurn>());
  const ephemeralQueueRef = useRef<EphemeralQueueItem[]>([]);
  const projectedGatewayActionsRef = useRef<ProjectedGatewayAction[]>([]);
  const startupLoadKeyRef = useRef("");
  const [model, setModel] = useState<WorkbenchModel>(() => {
    const cachedModel = runtimeOverviewModelFromCache(cachedRuntime);
    return cachedModel
      ? { ...initialWorkbenchModel, ...cachedModel, gatewayAccount: readGatewayAccountCache() }
      : { ...initialWorkbenchModel, gatewayAccount: readGatewayAccountCache() };
  });
  const [runtimeSnapshotSource, setRuntimeSnapshotSource] = useState<"live" | "cached" | "none">(cachedRuntime ? "cached" : "none");
  const [runtimeSnapshotCachedAt, setRuntimeSnapshotCachedAt] = useState<string | undefined>(cachedRuntime?.cachedAt);
  const [managedUpdate, setManagedUpdate] = useState<ManagedUpdateProjection | null>(null);
  const [nativeAppUpdate, setNativeAppUpdate] = useState<NativeAppUpdateResult | null>(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [projectedManagedUpdateActions, setProjectedManagedUpdateActions] = useState<ProjectedManagedUpdateAction[]>([]);
  const [projectedSetupActions, setProjectedSetupActions] = useState<ProjectedSetupAction[]>([]);
  const [projectedManifestInstallAction, setProjectedManifestInstallAction] = useState<ProjectedManifestInstallAction>();
  const [carrierDiagnostics, setCarrierDiagnostics] = useState<CarrierDiagnosticsReadback>({
    schema: "opl_app_carrier_diagnostics.v1",
    owner: "one-person-lab-app_native_host",
    carrier: "browser_placeholder",
    status: "unavailable",
    setLogDirectorySupported: false,
    reasonCode: "carrier_log_directory_unavailable"
  });
  const [initializeReadback, setInitializeReadback] = useState<OplInitializeReadback | null>(null);
  const [initializeStatus, setInitializeStatus] = useState<"loading" | "ready" | "error">("loading");
  const [additionalConversationInstructions, setAdditionalConversationInstructions] = useState(() => readAdditionalConversationInstructions());
  const [projectedGatewayActions, setProjectedGatewayActions] = useState<ProjectedGatewayAction[]>([]);
  const [stateStatus, setStateStatus] = useState<"loading" | "ready" | "error">("loading");
  const [stateError, setStateError] = useState("");
  const [detailsRequestRevision, setDetailsRequestRevision] = useState(0);
  const [lastDryRun, setLastDryRun] = useState("");
  const [contributionActionBusy, setContributionActionBusy] = useState(false);
  const [contributionRefreshRevision, setContributionRefreshRevision] = useState(0);
  const [contributionActionConfirmation, setContributionActionConfirmation] = useState<{
    entry: OplUiContribution;
    command: OplUiContributionCommand;
    input: Record<string, unknown>;
    preview?: Record<string, unknown>;
  } | null>(null);
  const contributionActionResolver = useRef<((value: import("../composition/contributionProjection").OplContributionActionOutcome) => void) | null>(null);
  useEffect(() => () => { contributionActionResolver.current?.({status: "cancelled"}); }, []);
  const [settingsActionReceipt, setSettingsActionReceipt] = useState<ActionReceiptView | null>(null);
  const [settingsActionBusyKey, setSettingsActionBusyKey] = useState<string | null>(null);
  const [settingsActionFeedback, setSettingsActionFeedback] = useState<SettingsActionFeedback | null>(null);
  const [dockerDiagnostic, setDockerDiagnostic] = useState<SettingsDockerDiagnostic | null>(null);
  const [settingsActionConfirmation, setSettingsActionConfirmation] = useState<SettingsActionConfirmation | null>(null);
  const workbenchActionResolver = useRef<{ key: string; resolve(value: { status: string; [key: string]: unknown }): void } | null>(null);
  useEffect(() => () => {
    workbenchActionResolver.current?.resolve({ status: "cancelled" });
    workbenchActionResolver.current = null;
  }, []);
  const [uiMetadata, setUiMetadata] = useState<WorkbenchUiMetadata>(persistedUi.metadata);
  const [drafts, setDrafts] = useState<WorkbenchDrafts>(persistedUi.drafts);
  const [prompt, setPrompt] = useState(persistedUi.drafts.prompts[persistedUi.metadata.selectedThreadId ?? "new"] ?? "");
  const promptRef = useRef(prompt);
  const [sendState, setSendState] = useState<"idle" | "running" | "error">("idle");
  const [threadProjects, setThreadProjects] = useState<WorkbenchProjectGroup[]>([]);
  const [archivedThreadProjects, setArchivedThreadProjects] = useState<WorkbenchProjectGroup[]>([]);
  const [threadDirectoryStatus, setThreadDirectoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [threadDirectoryError, setThreadDirectoryError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(createIntroMessages());
  const [eventFeed, setEventFeed] = useState<string[]>(["bridge.preview_only"]);
  const [codexThreadId, setCodexThreadId] = useState<string | undefined>(persistedUi.metadata.selectedThreadId);
  const [historyPage, setHistoryPage] = useState<{ threadId?: string; end: number } | null>(null);
  useEffect(() => setHistoryPage(null), [codexThreadId]);
  const historyEnd = historyPage?.threadId === codexThreadId && historyPage !== null
    ? Math.min(historyPage.end, messages.length) : messages.length;
  const historyStart = Math.max(0, historyEnd - 40);
  const selectedThreadIdRef = useRef<string | undefined>(persistedUi.metadata.selectedThreadId);
  const reconcileSequenceRef = useRef(new Map<string, number>());
  const trackedTurnIdsRef = useRef(new Map<string, string>());
  const notifiedTurnIdsRef = useRef(new Set<string>());
  const [threadDetail, setThreadDetail] = useState<WorkbenchThreadItem | null>(null);
  const [threadActionBusy, setThreadActionBusy] = useState(false);
  const [threadActionError, setThreadActionError] = useState("");
  const [lifecycleConfirmation, setLifecycleConfirmation] = useState<{ thread: WorkbenchThreadItem; action: ThreadLifecycleAction } | null>(null);
  const [settings, setSettings] = useState<WorkbenchSettings>(() => readSettings());
  const [settingsNavigation, setSettingsNavigation] = useState<{ open: boolean; destination?: SettingsDestinationId; revision: number }>();
  const settingsRef = useRef(settings);
  const voiceInputContextRef = useRef<VoiceInputContext | null>(null);
  const [codexCatalog, setCodexCatalog] = useState<CodexModelCatalogEntry[]>([]);
  const [modelCatalogStatus, setModelCatalogStatus] = useState<"loading" | "ready" | "error">("loading");
  const [modelCatalogError, setModelCatalogError] = useState("");
  const [capabilityCatalog, setCapabilityCatalog] = useState<CodexCapabilityCatalog>(emptyCapabilityCatalog);
  const [capabilityStatus, setCapabilityStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [capabilityError, setCapabilityError] = useState("");
  const [capabilityQuery, setCapabilityQuery] = useState("");
  const [pendingServerRequests, setPendingServerRequests] = useState<import("../bridge/oplBridge").CodexPendingServerRequest[]>([]);
  const [pendingServerRequestError, setPendingServerRequestError] = useState("");
  const [composerPaletteOpen, setComposerPaletteOpen] = useState(false);
  const [composerSelections, setComposerSelections] = useState<ComposerSelection[]>([]);
  const { addPickedInputs, releaseComposerSelections, removeComposerSelection, stageComposerFiles } =
    createComposerAttachmentController({ bridge, locale: settings.locale, setComposerSelections });
  const [selectedAgent, setSelectedAgent] = useState<AgentPackageSelectionIntent | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [ephemeralQueue, setEphemeralQueue] = useState<EphemeralQueueItem[]>([]);
  const [composerSubmissionError, setComposerSubmissionError] = useState("");
  const [threadInputFiles, setThreadInputFiles] = useState<Record<string, WorkbenchArtifactRef[]>>({});
  const [pendingInputFiles, setPendingInputFiles] = useState<WorkbenchArtifactRef[]>([]);
  const [activeContextTab, setActiveContextTab] = useState<ContextTabId>(detailTabs[0]?.id ?? "opl-project-progress-panel");
  const [activeFilesView, setActiveFilesView] = useState<FilesDetailView>("workspace");
  const [artifactPreviewOpen, setArtifactPreviewOpen] = useState(false);
  const [mcpAppLaunch, setMcpAppLaunch] = useState<(McpAppOpen & { title: string }) | undefined>();
  const [mcpTaskTarget, setMcpTaskTarget] = useState<{ itemId: string; viewId?: string; threadId?: string } | undefined>();
  const [mcpAppSelectedLaunch, setMcpAppSelectedLaunch] = useState<McpAppOpen | undefined>();
  const [primaryView, setPrimaryView] = useState<OplStudioPrimaryView>("conversation");
  const [applicationManagementTab, setApplicationManagementTab] = useState<ApplicationManagementTab>("applications");
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [desktopSetupStage, setDesktopSetupStage] = useState<string | null>(null);
  const [desktopSetupElapsedSeconds, setDesktopSetupElapsedSeconds] = useState<number | null>(null);
  const t = uiCopy[settings.locale];
  const normalizedCapabilityQuery = capabilityQuery.trim().toLowerCase();
  const standardAgentOptions = useMemo<ComposerAgentOption[]>(() => model.packageLifecycle
    .filter((item) => (
      item.packageRole === "standard_agent"
      && item.appEnabled
      && item.readiness.selectable
      && item.homeShortcuts.some((shortcut) => Boolean(shortcut.route))
    ))
    .sort((left, right) => (
      (standardAgentSeatPresentationZh[left.packageId]?.order ?? Number.MAX_SAFE_INTEGER)
      - (standardAgentSeatPresentationZh[right.packageId]?.order ?? Number.MAX_SAFE_INTEGER)
      || left.label.localeCompare(right.label)
    ))
    .map((agent) => {
      const description = (settings.locale === "zh" ? agent.descriptionI18n.zh : agent.descriptionI18n.en) ?? agent.description;
      const formalName = agent.displayNameI18n.en ?? agent.label;
      return {
        id: agent.packageId,
        name: settings.locale === "zh"
          ? standardAgentSeatPresentationZh[agent.packageId]?.name ?? agent.displayNameI18n.zh ?? agent.label
          : formalName,
        description: settings.locale === "zh" && description
          ? `${formalName} · ${description}`
          : description,
        selection: agentPackageSelectionIntent(agent)
      };
    }), [model.packageLifecycle, settings.locale]);
  const oplCapabilityOptions = useMemo<ComposerOplCapabilityOption[]>(() => model.packageLifecycle
    .filter((item) => item.appEnabled && item.official && item.packageId !== "missing_bridge" && item.packageRole !== "standard_agent")
    .flatMap((item) => {
      // A package owns one shortcut; its remaining required Skills stay available in the generic Skills group.
      const skill = item.requiredSkillIds
        .map((skillId) => capabilityCatalog.skills.find((candidate) => candidate.enabled && codexSkillMatchesRef(candidate.name, skillId)))
        .find((candidate): candidate is CodexSkillCapability => Boolean(candidate));
      if (!skill) return [];
      const displayName = settings.locale === "zh"
        ? item.displayNameI18n.zh ?? item.label
        : item.displayNameI18n.en ?? item.label;
      return [{
        id: item.packageId,
        name: displayName,
        description: (settings.locale === "zh" ? item.descriptionI18n.zh : item.descriptionI18n.en) ?? item.description,
        skill
      }];
    }), [capabilityCatalog.skills, model.packageLifecycle, settings.locale]);
  const oplModuleItems = useMemo(() => {
    const packageItems = model.packageLifecycle
      .filter((item) => item.appEnabled && item.official && item.packageId !== "missing_bridge")
      .map((item) => ({
        id: `package:${item.packageId}`,
        name: settings.locale === "zh" ? item.displayNameI18n.zh ?? item.label : item.displayNameI18n.en ?? item.label,
        detail: (settings.locale === "zh" ? item.descriptionI18n.zh : item.descriptionI18n.en) ?? item.description,
        active: item.readiness.callable !== false && item.activated !== false
      }));
    const dependencyItems = model.packageLifecycle.filter((owner) => owner.appEnabled).flatMap((owner) => owner.dependencies.map((dependency) => ({
      id: `dependency:${dependency.packageId}`,
      name: dependency.packageId,
      detail: settings.locale === "zh" ? `${owner.label} 的必需能力包` : `Required by ${owner.label}`,
      active: dependency.present !== false && dependency.callable !== false
    })));
    return [...packageItems, ...dependencyItems].filter((item, index, items) => (
      items.findIndex((candidate) => candidate.id === item.id) === index
    ));
  }, [model.packageLifecycle, settings.locale]);
  const disabledAppPackages = useRef(new Set<string>());
  disabledAppPackages.current = new Set(model.packageLifecycle.filter((item) => !item.appEnabled).map((item) => item.packageId));
  useEffect(() => {
    if (selectedAgent && disabledAppPackages.current.has(selectedAgent.packageId)) setSelectedAgent(null);
    if (contributionActionConfirmation && disabledAppPackages.current.has(contributionActionConfirmation.entry.packageId)) {
      contributionActionResolver.current?.({ status: "cancelled" });
      contributionActionResolver.current = null;
      setContributionActionConfirmation(null);
    }
  }, [model.packageLifecycle, selectedAgent, contributionActionConfirmation]);
  const capabilityGroups = [
    {
      id: "opl-modules",
      label: settings.locale === "zh" ? "OPL 模块" : "OPL modules",
      items: oplModuleItems
    },
    {
      id: "skills",
      label: settings.locale === "zh" ? "技能" : "Skills",
      items: capabilityCatalog.skills.map((item) => ({ id: item.name, name: item.name, detail: item.description, active: item.enabled }))
    },
    {
      id: "plugins",
      label: settings.locale === "zh" ? "插件" : "Plugins",
      items: capabilityCatalog.plugins.map((item) => ({ id: item.id, name: item.name, detail: item.description, active: item.enabled && item.callable }))
    },
    {
      id: "apps",
      label: settings.locale === "zh" ? "应用" : "Apps",
      items: capabilityCatalog.apps.map((item) => ({ id: item.id, name: item.name, detail: item.description, active: item.enabled && item.callable }))
    }
  ].map((group) => ({
    ...group,
    filteredItems: group.items.filter((item) => !normalizedCapabilityQuery || `${item.name} ${item.detail}`.toLowerCase().includes(normalizedCapabilityQuery))
  }));
  const previewAction = firstPreviewAction(model.contextActions);
  const exportAction = model.contextActions.find((action) => action.id === exportActionRefId && action.dryRunSupported) ?? previewAction;
  const activeThreads = useMemo(() => threadProjects.flatMap((project) => project.threads), [threadProjects]);
  const archivedThreads = useMemo(() => archivedThreadProjects.flatMap((project) => project.threads), [archivedThreadProjects]);
  const visibleThreadProjects = useMemo(() => {
    const hidden = new Set(uiMetadata.hiddenWorkspaceIds);
    const workspaceOrder = new Map(uiMetadata.workspaceOrder.map((id, index) => [id, index]));
    return threadProjects
      .filter((project) => !hidden.has(project.id))
      .map((project) => {
        const threadOrder = new Map((uiMetadata.threadOrderByProject[project.id] ?? []).map((id, index) => [id, index]));
        return {
          ...project,
          label: uiMetadata.workspaceLabels[project.id] ?? project.label,
          threads: [...project.threads].sort((left, right) => (
            Number(uiMetadata.pinnedThreadIds.includes(right.id)) - Number(uiMetadata.pinnedThreadIds.includes(left.id))
            || (threadOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (threadOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
            || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
          ))
        };
      })
      .sort((left, right) => (workspaceOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (workspaceOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  }, [threadProjects, uiMetadata.hiddenWorkspaceIds, uiMetadata.pinnedThreadIds, uiMetadata.threadOrderByProject, uiMetadata.workspaceLabels, uiMetadata.workspaceOrder]);
  const allThreads = useMemo(() => [...activeThreads, ...archivedThreads], [activeThreads, archivedThreads]);
  const allThreadsRef = useRef(allThreads);
  const currentSession = allThreads.find((thread) => thread.id === codexThreadId);
  const currentAgentStatus = sendState === "running"
    ? (settings.locale === "zh" ? "运行中" : "Running")
    : threadRuntimeStatusLabel(currentSession?.status, settings.locale);
  const selectedProject = visibleThreadProjects.find((project) => !project.projectless && project.id === uiMetadata.selectedProjectId)
    ?? visibleThreadProjects.find((project) => !project.projectless && project.threads.some((thread) => thread.id === codexThreadId))
    ?? visibleThreadProjects.find((project) => !project.projectless);
  const currentProject = selectedProject?.label ?? settings.defaultWorkspace ?? "Current project";
  const projectProgressWorkspace = currentSession?.workspace
    ?? (codexThreadId ? "" : selectedProject?.workspace ?? "");
  const projectProgress = useMemo(
    () => selectProjectProgress(projectProgressWorkspace, model.workItemRuntime, settings.locale),
    [model.workItemRuntime, projectProgressWorkspace, settings.locale]
  );
  const defaultWorkItemId = model.workItemRuntime?.items.find(item => item.workspacePath === projectProgressWorkspace)?.workItemId;
  const [selectedRuntimeWorkItemId, setSelectedRuntimeWorkItemId] = useState<string | undefined>();
  const selectedWorkItemId = selectedRuntimeWorkItemId ?? defaultWorkItemId;
  const selectedRuntimeWorkItem = selectedWorkItemId
    ? model.workItemRuntime?.items.find((item) => item.workItemId === selectedWorkItemId || item.id === selectedWorkItemId)
    : undefined;
  const detailWorkItemId = selectedRuntimeWorkItem?.workItemId ?? selectedWorkItemId;
  const runDetail = useMemo(() => buildRunDetailViewModel({
    thread: currentSession,
    workItem: selectedRuntimeWorkItem,
    workItemId: detailWorkItemId,
    running: sendState === "running",
    activeLines: model.activeProjectLines,
    files: [
      ...Object.entries(threadInputFiles).flatMap(([threadId, files]) => files.map((value): ScopedRunDetailItem<WorkbenchArtifactRef> => ({ scope: "thread", threadId, value }))),
      ...pendingInputFiles.map((value): ScopedRunDetailItem<WorkbenchArtifactRef> => codexThreadId
        ? { scope: "thread", threadId: codexThreadId, value }
        : { scope: "root", value })
    ],
    results: model.artifactPreviews.map((value) => ({ scope: "root" as const, value })),
    contributions: model.uiContributions
  }), [codexThreadId, currentSession, detailWorkItemId, model.activeProjectLines, model.artifactPreviews, model.uiContributions, pendingInputFiles, selectedRuntimeWorkItem, sendState, threadInputFiles]);
  const previewItems = useMemo(() => [...runDetail.results].sort((left, right) => {
    if (left.previewKind === right.previewKind) return 0;
    if (left.previewKind === "markdown") return -1;
    if (right.previewKind === "markdown") return 1;
    if (left.previewKind === "pdf") return -1;
    if (right.previewKind === "pdf") return 1;
    return 0;
  }), [runDetail.results]);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | undefined>(previewItems[0]?.id);
  const selectedPreview = previewItems.find((preview) => preview.id === selectedPreviewId) ?? previewItems[0];
  const sidebarSources = runDetail.files.map((file) => ({ id: file.id, label: file.title, summary: file.summary }));
  const modelOptions = useMemo(() => resolveCodexModelOptions(codexCatalog), [codexCatalog]);
  const {
    model: resolvedModel,
    reasoningEffort: resolvedReasoning,
    reasoningOptions: resolvedReasoningOptions,
    effectiveSelection
  } = resolveCodexSelection(modelOptions, settings.modelAccess, settings.reasoningLevel);
  const unavailableFixedModel = settings.modelAccess !== "__auto" && !resolvedModel;
  const projectedManagedUpdateHostActions = useMemo(() => {
    const projectedActions = new Map(projectedManagedUpdateActions.map((action) => [action.actionId, action]));
    return managedUpdateActionSpecs.flatMap((spec) => {
      const projectedAction = projectedActions.get(spec.actionId);
      if (!projectedAction) return [];
      const availability = projectedAction.payloadFields.length
        ? "payload_required"
        : projectedAction.confirmationRequired && !projectedAction.dryRunSupported
          ? "unavailable"
          : "ready";
      return [{
        projectedAction,
        intent: {
          transport: "managed_update_host" as const,
          key: `managed-update:${projectedAction.actionId}`,
          label: spec.labels[settings.locale === "zh" ? 0 : 1],
          operation: spec.operation,
          componentIds: [...spec.componentIds],
          confirmationRequired: projectedAction.confirmationRequired,
          availability,
          sourceRef: `app_state.actions#${projectedAction.actionId}`
        } satisfies SettingsHostActionIntent
      }];
    });
  }, [projectedManagedUpdateActions, settings.locale]);
  const settingsActionViewModel = useMemo(() => buildSettingsActionViewModel(model, managedUpdate, {
    gatewayActions: projectedGatewayActions,
    managedUpdateActions: [
      {
        transport: "native_app_updater",
        key: "native-app-update:check",
        label: settings.locale === "zh" ? "检查更新" : "Check for updates",
        operation: "check",
        componentIds: ["opl_app"],
        confirmationRequired: false,
        availability: nativeAppUpdate?.supported === false ? "unavailable" : "ready",
        sourceRef: "one-person-lab-app native updater"
      },
      {
        transport: "native_app_updater",
        key: "native-app-update:apply",
        label: settings.locale === "zh" ? "安装更新" : "Install update",
        operation: "apply",
        componentIds: ["opl_app"],
        confirmationRequired: true,
        availability: nativeAppUpdate?.supported === true && nativeAppUpdate.state === "available" ? "ready" : "unavailable",
        sourceRef: "one-person-lab-app native updater"
      },
      {
        transport: "native_app_updater",
        key: "native-app-update:restart",
        label: settings.locale === "zh" ? "重新启动" : "Restart",
        operation: "restart",
        componentIds: ["opl_app"],
        confirmationRequired: false,
        availability: nativeAppUpdate?.supported === true && nativeAppUpdate.restartRequired === true ? "ready" : "unavailable",
        sourceRef: "one-person-lab-app native host"
      },
      ...projectedManagedUpdateHostActions.map(({ intent }) => intent)
    ]
  }), [managedUpdate, model, nativeAppUpdate, projectedGatewayActions, projectedManagedUpdateHostActions, settings.locale]);
  const workspaceRootAction = projectedSetupActions.find((action) => action.actionId === "workspace_root_set");
  const codexInstallAction = projectedSetupActions.find((action) => action.actionId === "codex_install");
  const setupCapabilities = {
    workspaceRoot: bridge.platformCapabilities.workspaceRootSelection && Boolean(workspaceRootAction),
    codexInstall: bridge.platformCapabilities.codexInstall && Boolean(codexInstallAction)
  };
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    allThreadsRef.current = allThreads;
  }, [allThreads]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    ephemeralQueueRef.current = ephemeralQueue;
  }, [ephemeralQueue]);

  useEffect(() => {
    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && media?.matches === true);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      document.documentElement.setAttribute("data-ds-theme-source", settings.theme);
      document.body.toggleAttribute("data-ds-dark-theme", dark);
    };
    applyTheme();
    if (settings.theme !== "system" || !media) return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--dsh-content-font-size", `${settings.fontSize}px`);
    document.documentElement.style.setProperty("--opl-content-font-size", `${settings.fontSize}px`);
  }, [settings.fontSize]);

  useEffect(() => {
    if (!codexThreadId || !messages.length) return;
    const frame = globalThis.requestAnimationFrame?.(() => {
      conversationRef.current?.scrollIntoView({ block: historyEnd === messages.length ? "end" : "start" });
    });
    return () => { if (frame !== undefined) globalThis.cancelAnimationFrame?.(frame); };
  }, [codexThreadId, historyStart, historyEnd]);

  function updateUiMetadata(next: Partial<WorkbenchUiMetadata>) {
    setUiMetadata((current) => {
      const merged = { ...current, ...next };
      writeUiMetadata(merged);
      return merged;
    });
  }

  function rememberThreadAffinity(threadId: string, projectId?: string) {
    if (!threadId || !projectId || uiMetadata.threadAffinityById[threadId] === projectId) return;
    updateUiMetadata({ threadAffinityById: { ...uiMetadata.threadAffinityById, [threadId]: projectId } });
  }

  async function renameSession(threadId: string, title: string) {
    if (!bridge.renameThread) throw new Error(settings.locale === "zh" ? "会话重命名不可用。" : "Session rename is unavailable.");
    await bridge.renameThread({ threadId, name: title.trim() });
    await loadThreadDirectory(false);
  }

  async function renameWorkspace(workspaceId: string, title: string) {
    const group = threadProjects.find((project) => project.id === workspaceId);
    if (!group || group.projectless) throw new Error(settings.locale === "zh" ? "该工作区不是 Studio 可命名的本地分组。" : "This workspace is not a Studio-owned local group.");
    const nextTitle = title.trim();
    if (!nextTitle) throw new Error(settings.locale === "zh" ? "工作区名称不能为空。" : "Workspace name cannot be empty.");
    updateUiMetadata({ workspaceLabels: { ...uiMetadata.workspaceLabels, [workspaceId]: nextTitle } });
  }

  async function deleteWorkspace(workspaceId: string) {
    const group = threadProjects.find((project) => project.id === workspaceId);
    if (!group || group.projectless) throw new Error(settings.locale === "zh" ? "无法删除无项目分组。" : "The projectless group cannot be deleted.");
    updateUiMetadata({
      hiddenWorkspaceIds: [...new Set([...uiMetadata.hiddenWorkspaceIds, workspaceId])],
      selectedProjectId: uiMetadata.selectedProjectId === workspaceId ? undefined : uiMetadata.selectedProjectId
    });
    if (group.threads.some((thread) => thread.id === codexThreadId)) startNewChat();
  }

  async function insertWorkspaceBefore(workspaceId: string, beforeWorkspaceId?: string) {
    const ids = visibleThreadProjects.filter((project) => !project.projectless).map((project) => project.id).filter((id) => id !== workspaceId);
    const at = beforeWorkspaceId ? ids.indexOf(beforeWorkspaceId) : -1;
    ids.splice(at >= 0 ? at : ids.length, 0, workspaceId);
    updateUiMetadata({ workspaceOrder: ids });
  }

  async function insertSessionBefore(workspaceId: string, threadId: string, beforeThreadId?: string) {
    const group = threadProjects.find((project) => project.id === workspaceId);
    if (!group) throw new Error(settings.locale === "zh" ? "找不到工作区。" : "Workspace not found.");
    const ids = group.threads.map((thread) => thread.id).filter((id) => id !== threadId);
    const at = beforeThreadId ? ids.indexOf(beforeThreadId) : -1;
    ids.splice(at >= 0 ? at : ids.length, 0, threadId);
    updateUiMetadata({ threadOrderByProject: { ...uiMetadata.threadOrderByProject, [workspaceId]: ids } });
  }

  async function createWorkspace(path: string) {
    throw new Error(settings.locale === "zh" ? `Studio 不会伪造工作区注册：${path}` : `Studio does not create synthetic workspace registrations: ${path}`);
  }

  function updateDrafts(next: (current: WorkbenchDrafts) => WorkbenchDrafts) {
    setDrafts((current) => {
      const merged = next(current);
      writeDrafts(merged);
      return merged;
    });
  }

  function updatePrompt(value: string) {
    promptRef.current = value;
    setPrompt(value);
    const key = codexThreadId ?? "new";
    updateDrafts((current) => ({ ...current, prompts: { ...current.prompts, [key]: value } }));
  }

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      stageComposerFiles(files, "paste");
    };
    const dragover = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      stageComposerFiles(files, "drop");
    };
    document.addEventListener("paste", paste, true);
    document.addEventListener("dragover", dragover, true);
    document.addEventListener("drop", drop, true);
    return () => {
      document.removeEventListener("paste", paste, true);
      document.removeEventListener("dragover", dragover, true);
      document.removeEventListener("drop", drop, true);
    };
  }, [bridge]);

  const stateReadSequence = useRef(0);
  function loadState(profile = settings.runtimeProfile, recoverStartup = false) {
    const sequence = ++stateReadSequence.current;
    setStateStatus("loading");
    setStateError("");
    const read = () => bridge.readState(profile);
    return (recoverStartup ? readStartupState(read, () => sequence === stateReadSequence.current) : read())
      .then((state) => {
        if (!state || sequence !== stateReadSequence.current) return null;
        const nextModel = deriveWorkbenchModelFromState(state);
        onHostStateChange?.(state);
        setModel(nextModel);
        writeRuntimeOverviewCache({
          runtimeOverview: nextModel.runtimeOverview,
          serviceRecovery: nextModel.serviceRecovery,
          workItemRuntime: nextModel.workItemRuntime,
          stateGeneratedAt: nextModel.stateGeneratedAt
        });
        setRuntimeSnapshotSource("live");
        setRuntimeSnapshotCachedAt(new Date().toISOString());
        writeGatewayAccountCache(nextModel.gatewayAccount);
        setProjectedManagedUpdateActions(readProjectedManagedUpdateActions(state));
        setProjectedSetupActions(readProjectedSetupActions(state));
        setProjectedManifestInstallAction(readProjectedManifestInstallAction(state));
        setCarrierDiagnostics(state.carrierDiagnostics);
        setMaintenanceStatus(state.managedUpdateMaintenance?.status ?? null);
        const nextGatewayActions = readGatewayActionsFromState(state);
        projectedGatewayActionsRef.current = nextGatewayActions;
        setProjectedGatewayActions(nextGatewayActions);
        const updateProjection = readManagedUpdateProjection(state);
        if (updateProjection) {
          setManagedUpdate((current) => mergeManagedUpdateProjections(current, updateProjection));
        }
        setStateStatus("ready");
        return nextModel;
      })
      .catch((error) => {
        if (sequence !== stateReadSequence.current) return null;
        setModel((current) => current.gatewayAccount
          ? { ...current, gatewayAccount: markGatewayAccountCacheStale(current.gatewayAccount) }
          : current);
        setStateStatus("error");
        setStateError(String(error));
        if (model.runtimeOverview || model.workItemRuntime) setRuntimeSnapshotSource("cached");
        return null;
      });
  }

  function loadInitialize() {
    setInitializeStatus("loading");
    return bridge.readInitialize()
      .then((readback) => {
        setInitializeReadback(readback);
        setInitializeStatus(readback.readback.exitCode === 0 && !readback.readback.timedOut ? "ready" : "error");
        return readback;
      })
      .catch(() => {
        setInitializeReadback(null);
        setInitializeStatus("error");
        return null;
      });
  }

  function captureManagedUpdateReceipt(receipt: OplActionReceipt) {
    const updateProjection = readManagedUpdateProjection(receipt.stdoutJson);
    if (updateProjection) {
      setManagedUpdate((current) => mergeManagedUpdateProjections(current, updateProjection));
    }
  }

  function settingsReceiptFeedback(receipt: OplActionReceipt, label: string): SettingsActionFeedback {
    if (receipt.status === "preview_ready") {
      return {
        tone: "success",
        message: settings.locale === "zh" ? `${label}已完成，只读检查结果已生成。` : `${label} completed and produced a read-only check result.`
      };
    }
    if (receipt.status === "no_op" || receipt.status === "unsupported") {
      return { tone: "neutral", message: receipt.status === "no_op" ? (settings.locale === "zh" ? "Owner 回读：无需变更。" : "Owner reports no changes needed.") : (settings.locale === "zh" ? "Owner 尚不支持此操作；请刷新或在所属服务处理。" : "This action is unsupported by the owner; refresh or use the owner service.") };
    }
    if (receipt.status === "executed") {
      if (receipt.payload?.package_id === 'opl-workbench-services' && receipt.payload?.ref === 'workbench#task_run') return { tone: 'success', message: settings.locale === 'zh' ? '运行请求已提交；请在执行历史中查看进度与结果。' : 'Run request submitted. Check history for progress and results.' };
      return {
        tone: "success",
        message: settings.locale === "zh" ? `${label}已完成，状态已刷新。` : `${label} completed and state was refreshed.`
      };
    }
    if (receipt.status === "blocked_read_only") {
      return {
        tone: "attention",
        message: settings.locale === "zh" ? "当前以只读评估模式运行，预检查可用，但执行已被阻止。" : "The app is running in read-only evaluation mode. Preview is available, but execution is blocked."
      };
    }
    if (/^(source_|knowledge_source_)/.test(receipt.actionId)) {
      return { tone: "attention", message: settings.locale === "zh" ? `${label}尚未完成，请查看当前状态并重新检查；输入已保留。` : `${label} did not complete. Review the current status and check again; your input is retained.` };
    }
    return {
      tone: "attention",
      message: receipt.blockedReason || receipt.stderr || (settings.locale === "zh" ? `${label}未完成。` : `${label} did not complete.`)
    };
  }

  function settleWorkbenchAction(key: string, result: { status: string; [key: string]: unknown }) {
    const pending = workbenchActionResolver.current;
    if (!pending || pending.key !== key) return;
    workbenchActionResolver.current = null;
    pending.resolve(result);
  }

  function cancelSettingsAction() {
    if (settingsActionBusyKey !== null) return;
    if (settingsActionConfirmation) settleWorkbenchAction(settingsActionConfirmation.request.key, { status: "cancelled" });
    setSettingsActionConfirmation(null);
  }

  async function runSettingsAction(request: SettingsActionRequest) {
    const pendingWorkbench = workbenchActionResolver.current;
    if (pendingWorkbench && pendingWorkbench.key !== request.key) {
      const result = { status: "failed", error: "Another App action is awaiting confirmation." };
      if (request.key.startsWith("workbench:task_")) settleWorkbenchAction(request.key, result);
      setSettingsActionFeedback({ tone: "attention", message: settings.locale === "zh" ? "另一个操作正在等待确认，请先完成或取消该操作。" : "Another action is awaiting confirmation. Finish or cancel it first." });
      return;
    }
    if (settingsActionBusyKey !== null || settingsActionConfirmation !== null) {
      settleWorkbenchAction(request.key, { status: "failed", error: "Another App action is awaiting confirmation." });
      setSettingsActionFeedback({ tone: "attention", message: settings.locale === "zh" ? "请先完成或取消当前操作。" : "Finish or cancel the current action first." });
      return;
    }
    setSettingsActionBusyKey(request.key);
    setSettingsActionFeedback(null);
    setSettingsActionReceipt(null);
    try {
      if (request.previewOnly) {
        const preview = await bridge.executeAction({ actionId: request.actionId, payload: request.payload, dryRun: true });
        setSettingsActionReceipt(actionReceiptView(preview));
        setSettingsActionFeedback(settingsReceiptFeedback(preview, request.label));
        return;
      }
      if (request.confirmationRequired) {
        if (request.dryRunSupported === false) {
          setSettingsActionConfirmation({ request, previewStatus: "confirmation_required" });
          return;
        }
        const preview = await bridge.executeAction({ actionId: request.actionId, payload: request.payload, dryRun: true });
        if (!["preview_ready", "confirmation_required"].includes(preview.status)) {
          setSettingsActionReceipt(actionReceiptView(preview));
          setSettingsActionFeedback(settingsReceiptFeedback(preview, request.label));
          settleWorkbenchAction(request.key, { ...preview, status: preview.status });
          return;
        }
        setSettingsActionConfirmation({ request, previewStatus: preview.status, preview: actionReceiptView(preview), confirmationId: preview.confirmationId, receiptId: preview.receiptId });
        return;
      }
      const receipt = await bridge.executeAction({
        actionId: request.actionId,
        payload: { ...request.payload, confirmed: true },
        dryRun: false
      });
      const diagnostic = request.actionId === "settings_diagnose_docker_webui"
        ? dockerDiagnosticFromReceipt(receipt)
        : null;
      let stateReadFailed = false;
      if (diagnostic) setDockerDiagnostic(diagnostic);
      if (receipt.status === "executed" || /^(source_|knowledge_source_)/.test(receipt.actionId) && receipt.status !== "blocked_read_only") {
        captureManagedUpdateReceipt(receipt);
        if (request.actionId === "settings_diagnose_docker_webui") {
          // The doctor is a receipt-only read; its result is already authoritative
          // for this check and does not require a second full App-state read.
        } else {
          const profile = model.managedCompanions.some((companion) => companion.actions.some((action) => action.actionId === request.actionId)) ? "full" : settings.runtimeProfile;
          stateReadFailed = await loadState(profile) === null;
        }
        if (initializationActionIds.has(request.actionId)) await loadInitialize();
      }
      setSettingsActionReceipt(actionReceiptView(receipt));
      settleWorkbenchAction(request.key, { ...receipt, status: receipt.status });
      setSettingsActionFeedback(stateReadFailed ? {
        tone: "attention",
        message: settings.locale === "zh" ? "操作结果已返回，但最新状态暂未读取成功。请刷新核实，无需再次提交。" : "The action returned a result, but its latest state could not be read. Refresh to verify; do not submit it again."
      } : diagnostic ? {
        tone: diagnostic.status === "attention" || (diagnostic.attentionCount ?? 0) > 0 ? "attention" : "success",
        message: settings.locale === "zh"
          ? `诊断完成${diagnostic.attentionCount ? `，发现 ${diagnostic.attentionCount} 项需要处理` : "，未发现需要处理的项目"}。`
          : `Diagnostics completed${diagnostic.attentionCount ? ` with ${diagnostic.attentionCount} item(s) requiring attention` : " with no items requiring attention"}.`
      } : settingsReceiptFeedback(receipt, request.label));
    } catch (error) {
      setSettingsActionFeedback({ tone: "attention", message: String(error) });
      settleWorkbenchAction(request.key, { status: "failed", error: String(error) });
    } finally {
      setSettingsActionBusyKey(null);
    }
  }

  async function confirmSettingsAction() {
    const confirmation = settingsActionConfirmation;
    if (!confirmation) return;
    setSettingsActionBusyKey(confirmation.request.key);
    setSettingsActionFeedback(null);
    try {
      const receipt = await bridge.executeAction({
        actionId: confirmation.request.actionId,
        payload: { ...confirmation.request.payload, confirmed: true, ...(confirmation.confirmationId ? { confirmationId: confirmation.confirmationId } : {}), ...(confirmation.receiptId ? { receiptId: confirmation.receiptId } : {}) },
        dryRun: false
      });
      let stateReadFailed = false;
      if (receipt.status === "executed" || /^(source_|knowledge_source_)/.test(receipt.actionId) && receipt.status !== "blocked_read_only") {
        captureManagedUpdateReceipt(receipt);
        const profile = model.managedCompanions.some((companion) => companion.actions.some((action) => action.actionId === confirmation.request.actionId)) ? "full" : settings.runtimeProfile;
        stateReadFailed = await loadState(profile) === null;
        if (initializationActionIds.has(confirmation.request.actionId)) await loadInitialize();
      }
      setSettingsActionReceipt(actionReceiptView(receipt));
      settleWorkbenchAction(confirmation.request.key, { ...receipt, status: receipt.status });
      setSettingsActionFeedback(stateReadFailed ? {
        tone: "attention",
        message: settings.locale === "zh" ? "操作结果已返回，但最新状态暂未读取成功。请刷新核实，无需再次提交。" : "The action returned a result, but its latest state could not be read. Refresh to verify; do not submit it again."
      } : settingsReceiptFeedback(receipt, confirmation.request.label));
      setSettingsActionConfirmation(null);
    } catch (error) {
      setSettingsActionFeedback({ tone: "attention", message: String(error) });
      settleWorkbenchAction(confirmation.request.key, { status: "failed", error: String(error) });
      setSettingsActionConfirmation(null);
    } finally {
      setSettingsActionBusyKey(null);
    }
  }

  async function runSettingsHostAction(intent: SettingsHostActionIntent) {
    if (intent.transport === "managed_update_host") {
      const projectedAction = projectedManagedUpdateHostActions.find((entry) => entry.intent.key === intent.key)?.projectedAction;
      if (!projectedAction) {
        setSettingsActionFeedback({
          tone: "attention",
          message: settings.locale === "zh" ? "此更新操作已不在最新状态中。" : "This update operation is no longer present in the latest state."
        });
        return;
      }
      await runSettingsAction({
        key: intent.key,
        actionId: projectedAction.actionId,
        label: intent.label,
        payload: {},
        confirmationRequired: projectedAction.confirmationRequired
      });
      return;
    }
    setSettingsActionBusyKey(intent.key);
    setSettingsActionFeedback(null);
    try {
      const result = intent.operation === "check"
        ? await bridge.checkNativeAppUpdate()
        : intent.operation === "apply"
          ? await bridge.applyNativeAppUpdate()
          : intent.operation === "restart"
            ? await bridge.restartNativeApp()
            : await bridge.readNativeAppUpdateStatus();
      setNativeAppUpdate(result);
      setSettingsActionFeedback({
        tone: result.supported || result.accepted ? "success" : "attention",
        message: result.supported || result.accepted
          ? (settings.locale === "zh" ? "操作已由 Native App 接受。" : "The Native App accepted the operation.")
          : (result.reasonCode ?? (settings.locale === "zh" ? "当前载体不支持此操作。" : "This carrier does not support the operation."))
      });
      await loadState(settings.runtimeProfile);
    } catch (error) {
      setSettingsActionFeedback({ tone: "attention", message: String(error) });
    } finally {
      setSettingsActionBusyKey(null);
    }
  }

  async function changeLogDirectory() {
    const key = "application.setLogDirectory";
    setSettingsActionBusyKey(key);
    setSettingsActionFeedback(null);
    try {
      const selected = (await bridge.pickDirectory()).find((item) => item.kind === "folder");
      if (!selected) return;
      const result = await bridge.setLogDirectory({ path: selected.path });
      if (result.success) {
        await loadState(settings.runtimeProfile);
        setSettingsActionFeedback({
          tone: "success",
          message: settings.locale === "zh" ? "App 日志目录已更新。" : "The App log directory was updated."
        });
      } else {
        setSettingsActionFeedback({
          tone: "attention",
          message: result.message ?? result.errorCode ?? result.reasonCode
            ?? (settings.locale === "zh" ? "App 日志目录未更新。" : "The App log directory was not updated.")
        });
      }
    } catch (error) {
      setSettingsActionFeedback({ tone: "attention", message: String(error) });
    } finally {
      setSettingsActionBusyKey(null);
    }
  }

  async function chooseWorkspaceRoot(): Promise<OplSetupOperationResult> {
    const key = "setup:workspace-root";
    if (!setupCapabilities.workspaceRoot || !workspaceRootAction) {
      const message = settings.locale === "zh" ? "当前运行方式不能修改工作目录。" : "This app mode cannot change the working directory.";
      setSettingsActionFeedback({ tone: "attention", message });
      return { status: "error", message };
    }
    setSettingsActionBusyKey(key);
    setSettingsActionFeedback(null);
    try {
      const selected = (await bridge.pickDirectory()).find((item) => item.kind === "folder");
      if (!selected) return { status: "cancelled" };
      const receipt = await bridge.executeAction({
        actionId: workspaceRootAction.actionId,
        payload: { path: selected.path, confirmed: true },
        dryRun: false
      });
      if (receipt.status !== "executed") {
        const feedback = settingsReceiptFeedback(receipt, settings.locale === "zh" ? "工作目录设置" : "Working directory setup");
        setSettingsActionFeedback(feedback);
        return { status: "error", message: feedback.message };
      }
      const nextModel = await loadState(settings.runtimeProfile);
      await loadInitialize();
      const expected = selected.path.replace(/[\\/]+$/, "");
      const actual = nextModel?.settingsProjection?.workspace.selectedPath?.replace(/[\\/]+$/, "");
      if (!actual || actual !== expected) {
        const message = settings.locale === "zh" ? "工作目录已提交，但最新状态没有确认所选位置。" : "The directory was submitted, but the fresh state did not confirm it.";
        setSettingsActionFeedback({ tone: "attention", message });
        return { status: "error", message };
      }
      const message = settings.locale === "zh" ? "工作目录已更新并通过回读确认。" : "The working directory was updated and confirmed by fresh readback.";
      setSettingsActionFeedback({ tone: "success", message });
      return { status: "completed", message };
    } catch (error) {
      const message = String(error);
      setSettingsActionFeedback({ tone: "attention", message });
      return { status: "error", message };
    } finally {
      setSettingsActionBusyKey(null);
    }
  }

  async function installCodex(): Promise<OplSetupOperationResult> {
    const key = "setup:codex-install";
    if (!setupCapabilities.codexInstall || !codexInstallAction) {
      const message = settings.locale === "zh" ? "当前运行方式不能安装本机助手。" : "This app mode cannot install the local assistant.";
      setSettingsActionFeedback({ tone: "attention", message });
      return { status: "error", message };
    }
    setSettingsActionBusyKey(key);
    setSettingsActionFeedback(null);
    try {
      const receipt = await bridge.executeAction({
        actionId: codexInstallAction.actionId,
        payload: { confirmed: true },
        dryRun: false
      });
      if (receipt.status !== "executed") {
        const feedback = settingsReceiptFeedback(receipt, settings.locale === "zh" ? "本机助手安装" : "Local assistant installation");
        setSettingsActionFeedback(feedback);
        return { status: "error", message: feedback.message };
      }
      const nextModel = await loadState(settings.runtimeProfile);
      const initialize = await loadInitialize();
      const codexReady = nextModel?.settingsProjection?.codex.installed === true
        || initialize?.systemInitialize.checklist.some((item) => ["codex", "codex_cli"].includes(item.itemId) && !item.blocking) === true;
      if (!codexReady) {
        const message = settings.locale === "zh" ? "安装命令已完成，但最新自检尚未确认本机助手可用。" : "Installation completed, but the fresh startup check has not confirmed the local assistant.";
        setSettingsActionFeedback({ tone: "attention", message });
        return { status: "error", message };
      }
      await Promise.all([loadModels(), loadCapabilities(true)]);
      const message = settings.locale === "zh" ? "本机助手已安装并通过自检。" : "The local assistant was installed and passed the startup check.";
      setSettingsActionFeedback({ tone: "success", message });
      return { status: "completed", message };
    } catch (error) {
      const message = String(error);
      setSettingsActionFeedback({ tone: "attention", message });
      return { status: "error", message };
    } finally {
      setSettingsActionBusyKey(null);
    }
  }

  async function configureCodexApiKey(apiKey: string) {
    const key = "model-access:api-key";
    let writeSucceeded = false;
    setSettingsActionBusyKey(key);
    setSettingsActionFeedback(null);
    try {
      const result = await bridge.configureCodexApiKey({ apiKey });
      if (!result.ok) {
        setSettingsActionFeedback({ tone: "attention", message: gatewayAccountErrorMessage(result.errorCode, settings.locale) });
        return false;
      }
      writeSucceeded = true;
      const nextModel = await loadState(settings.runtimeProfile);
      const initialize = await loadInitialize();
      const configReady = nextModel?.settingsProjection?.codex.apiKeyPresent === true
        || initialize?.systemInitialize.checklist.some((item) => item.itemId === "codex_config" && !item.blocking) === true;
      if (!configReady) {
        setSettingsActionFeedback({
          tone: "attention",
          message: settings.locale === "zh" ? "凭据已提交，但最新自检尚未确认模型访问可用。" : "The credential was submitted, but the fresh startup check has not confirmed model access."
        });
        return false;
      }
      setSettingsActionFeedback({
        tone: "success",
        message: settings.locale === "zh" ? "模型访问已配置并通过自检。" : "Model access was configured and passed the startup check."
      });
      return true;
    } catch {
      setSettingsActionFeedback({
        tone: "attention",
        message: writeSucceeded
          ? (settings.locale === "zh" ? "密钥已写入 Codex 配置，但状态刷新未完成。请重新自检模型访问。" : "The key was written to the Codex configuration, but the status refresh did not finish. Recheck model access.")
          : (settings.locale === "zh" ? "密钥提交未完成，尚未确认写入结果。请检查模型访问状态后再重试。" : "The key submission did not finish; its write result is unconfirmed. Check model access before retrying.")
      });
      return false;
    } finally {
      setSettingsActionBusyKey(null);
    }
  }

  async function loginGatewayAccount(credentials: { email: string; password: string }) {
    const key = "gateway:login";
    setSettingsActionBusyKey(key);
    setSettingsActionFeedback(null);
    try {
      const result = await bridge.loginGatewayAccount(credentials);
      if (result.ok) {
        let nextModel = await loadState(settings.runtimeProfile);
        if (nextModel?.gatewayAccount && !nextModel.gatewayAccount.managedKey) {
          const completeSetup = projectedGatewayActionsRef.current.find((action) => action.semantic === "complete_setup");
          const group = nextModel.gatewayAccount.availableGroups?.find((item) => item.label.trim().toLowerCase() === "codex")
            ?? nextModel.gatewayAccount.availableGroups?.[0];
          if (!completeSetup || !group) {
            setSettingsActionFeedback({
              tone: "attention",
              message: settings.locale === "zh" ? "账户已连接，但还需要选择可用组后才能完成本机设置。" : "The account is connected, but a group must be selected to finish device setup."
            });
            return false;
          }
          const setupReceipt = await bridge.executeAction({
            actionId: completeSetup.action.id,
            payload: { group_id: group.id, confirmed: true },
            dryRun: false
          });
          if (setupReceipt.status !== "executed") {
            setSettingsActionFeedback(settingsReceiptFeedback(setupReceipt, settings.locale === "zh" ? "账户设置" : "Account setup"));
            return false;
          }
          nextModel = await loadState(settings.runtimeProfile);
        }
        await loadInitialize();
        const modelAccessSource = nextModel?.settingsProjection?.codex.modelAccessSource?.trim().toLowerCase() ?? "";
        const needsModelSourceConfirmation = projectedGatewayActionsRef.current.some((action) => action.semantic === "use_for_model_access")
          && !modelAccessSource.includes("gateway");
        setSettingsActionFeedback({
          tone: "success",
          message: needsModelSourceConfirmation
            ? (settings.locale === "zh" ? "OPL Gateway 已连接；请在“本机默认模型来源”中确认使用。" : "OPL Gateway is connected; confirm it under Default model source.")
            : (settings.locale === "zh" ? "OPL Gateway 已连接。" : "OPL Gateway is connected.")
        });
        return true;
      }
      setSettingsActionFeedback({
        tone: "attention",
        message: gatewayAccountErrorMessage(result.errorCode, settings.locale)
      });
      return false;
    } catch (error) {
      setSettingsActionFeedback({ tone: "attention", message: String(error) });
      return false;
    } finally {
      setSettingsActionBusyKey(null);
    }
  }

  async function approveConnectionAccess(requestId: string): Promise<boolean> {
    const key = `connection-approve:${requestId}`;
    setSettingsActionBusyKey(key);
    setSettingsActionFeedback(null);
    setSettingsActionReceipt(null);
    try {
      const latest = await loadState(settings.runtimeProfile);
      const pending = latest?.settingsProjection?.connectionAuthorization?.requests.some(
        (request) => request.requestId === requestId && request.status === "requested"
      );
      if (!pending) {
        setSettingsActionFeedback({
          tone: "attention",
          message: settings.locale === "zh" ? "此访问请求已变化；请检查最新状态。" : "This access request has changed; review the latest state."
        });
        return false;
      }
      const result = await bridge.approveConnectionAccess({ requestId });
      if (!result.ok) {
        setSettingsActionFeedback({
          tone: "attention",
          message: settings.locale === "zh" ? `授权未完成（${result.errorCode ?? "未知错误"}）。` : `Approval did not complete (${result.errorCode ?? "unknown error"}).`
        });
        return false;
      }
      if (!result.stateRefreshRequired) {
        setSettingsActionFeedback({
          tone: "attention",
          message: settings.locale === "zh" ? "授权命令未要求状态回读，结果暂不可确认。请刷新连接状态。" : "The approval result did not request state readback. Refresh connection status before proceeding."
        });
        return false;
      }
      try {
        const verified = await loadState(settings.runtimeProfile);
        const authorization = verified?.settingsProjection?.connectionAuthorization;
        const granted = authorization?.grants.some((grant) => grant.requestId === requestId && grant.status === "granted");
        if (!granted) {
          setSettingsActionFeedback({
            tone: "attention",
            message: settings.locale === "zh" ? "授权命令已返回成功，但最新状态尚未确认该授权；请刷新后查看，不要重复授权。" : "The approval command returned success, but fresh state has not confirmed the grant. Refresh state before taking further action."
          });
          return false;
        }
      } catch {
        setSettingsActionFeedback({
          tone: "attention",
          message: settings.locale === "zh" ? "授权命令已返回成功，但状态刷新未完成；请先刷新状态，不要重复授权。" : "The approval command returned success, but state refresh failed. Refresh state before taking further action."
        });
        return false;
      }
      setSettingsActionFeedback({
        tone: "success",
        message: settings.locale === "zh" ? "已向该智能体授予所列连接能力。" : "The listed connection capabilities were granted to this Agent."
      });
      return true;
    } catch {
      setSettingsActionFeedback({
        tone: "attention",
        message: settings.locale === "zh" ? "授权结果暂不可确认，请刷新连接状态后再处理。" : "The approval result is unconfirmed. Refresh connection status before acting again."
      });
      return false;
    } finally {
      setSettingsActionBusyKey(null);
    }
  }

  async function reconcileCanonicalThread(threadId: string, reason: string, expectedTurnId?: string, snapshot?: CodexThread): Promise<CodexThread> {
    const sequence = (reconcileSequenceRef.current.get(threadId) ?? 0) + 1;
    reconcileSequenceRef.current.set(threadId, sequence);
    const readback = snapshot ?? await bridge.readThread({ threadId, includeTurns: true });
    if (reconcileSequenceRef.current.get(threadId) !== sequence) return readback;

    const trackedTurnId = trackedTurnIdsRef.current.get(threadId);
    const resolvedExpectedTurnId = expectedTurnId ?? trackedTurnId;
    const { activeTurnId, terminalTurn } = resolveCanonicalTurn(readback, resolvedExpectedTurnId);
    const selected = selectedThreadIdRef.current === threadId;

    if (activeTurnId) trackedTurnIdsRef.current.set(threadId, activeTurnId);

    if (selected) {
      const nextMessages = deriveThreadMessages(readback);
      if (activeTurnId) {
        const pendingId = `assistant-pending:${threadId}:${activeTurnId}`;
        if (!nextMessages.some((message) => message.id === pendingId)) {
          nextMessages.push({ id: pendingId, role: "assistant", text: "" });
        }
        pendingAssistantIdRef.current = pendingId;
        activeTurnRef.current = { threadId, turnId: activeTurnId };
        setActiveTurnId(activeTurnId);
        setSendState("running");
      } else {
        pendingAssistantIdRef.current = null;
        activeTurnRef.current = null;
        setActiveTurnId(null);
        setSendState("idle");
      }
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      setThreadDetail(null);
    }

    const currentSettings = settingsRef.current;
    if (terminalTurn && shouldNotifyCanonicalCompletion({
      enabled: currentSettings.notificationEnabled,
      threadId,
      turnId: terminalTurn.id,
      selectedThreadId: selectedThreadIdRef.current,
      documentVisible: document.visibilityState === "visible",
      windowFocused: document.hasFocus(),
      notifiedTurnIds: notifiedTurnIdsRef.current
    })) {
      const notificationKey = `${threadId}:${terminalTurn.id}`;
      notifiedTurnIdsRef.current.add(notificationKey);
      await bridge.notifyCompletion({
        threadId,
        turnId: terminalTurn.id,
        title: "One Person Lab",
        body: terminalTurn.status === "completed"
          ? (currentSettings.locale === "zh" ? "任务已完成。" : "Task completed.")
          : (currentSettings.locale === "zh" ? "任务已结束，请查看结果。" : "Task ended; review the result.")
      });
    }
    for (const entry of terminalTrackedComposerTurns(stagedSelectionsByTurnRef.current, readback)) {
      await releaseTrackedTurnSelections(entry);
    }
    if (!activeTurnId && resolvedExpectedTurnId && trackedTurnIdsRef.current.get(threadId) === resolvedExpectedTurnId) {
      trackedTurnIdsRef.current.delete(threadId);
    }
    if (reason !== "open") void loadThreadDirectory(false);
    return readback;
  }

  const openThreadSequence = useRef(0);
  async function openThread(thread: WorkbenchThreadItem): Promise<string | null> {
    setThreadActionBusy(true);
    setThreadActionError("");
    const previousThreadId = selectedThreadIdRef.current;
    const sequence = ++openThreadSequence.current;
    try {
      // Resolve the destination before replacing the current conversation or attachments.
      const snapshot = await bridge.readThread({ threadId: thread.id, includeTurns: true });
      if (sequence !== openThreadSequence.current || selectedThreadIdRef.current !== previousThreadId) return null;
      setPrimaryView("conversation");
      setSelectedRuntimeWorkItemId(undefined);
      selectedThreadIdRef.current = thread.id;
      setCodexThreadId(thread.id);
      const affinityProjectId = threadProjects.find(project => project.threads.some(item => item.id === thread.id))?.id;
      updateUiMetadata({ selectedThreadId: thread.id, selectedProjectId: affinityProjectId ?? uiMetadata.selectedProjectId });
      rememberThreadAffinity(thread.id, affinityProjectId);
      promptRef.current = drafts.prompts[thread.id] ?? "";
      setPrompt(promptRef.current);
      releaseComposerSelections(composerSelections);
      setComposerSelections([]);
      setComposerPaletteOpen(false);
      await reconcileCanonicalThread(thread.id, "open", undefined, snapshot);
      return null;
    } catch (error) {
      const message = String(error);
      if (sequence === openThreadSequence.current) setThreadActionError(message);
      return message;
    } finally {
      if (sequence === openThreadSequence.current) setThreadActionBusy(false);
    }
  }

  async function openCanonicalThreadRef(threadId: string): Promise<string | null> {
    const known = allThreadsRef.current.find(thread => thread.id === threadId);
    // ID comes only from an owner-projected ref or a canonical child event.
    return openThread(known ?? { id: threadId, title: threadId, status: "unknown", preview: "", archived: false,
      isTemporaryWorkspace: false, currentWorkspace: false });
  }

  async function resumeThreadAndOpen(thread: WorkbenchThreadItem) {
    setThreadActionBusy(true);
    setThreadActionError("");
    try {
      await bridge.resumeThread({ threadId: thread.id });
      await openThread(thread);
      await loadThreadDirectory(false);
    } catch (error) {
      setThreadActionError(String(error));
    } finally {
      setThreadActionBusy(false);
    }
  }

  async function loadThreadDirectory(openSavedThread = false, scope = uiMetadata.threadScope) {
    if (typeof bridge.listThreads !== "function") {
      setThreadDirectoryStatus("error");
      setThreadDirectoryError("Codex thread adapter is unavailable.");
      return;
    }
    setThreadDirectoryStatus("loading");
    setThreadDirectoryError("");
    try {
      const active = scope === "archived"
        ? null
        : await bridge.listThreads({ archived: false, limit: 100 });
      const archived = scope === "archived"
        ? await bridge.listThreads({ archived: true, limit: 100 })
        : null;
      const activeProjects = active ? deriveThreadDirectory(active) : threadProjects;
      const archivedProjects = archived ? deriveThreadDirectory(archived) : archivedThreadProjects;
      if (active) setThreadProjects(activeProjects);
      for (const thread of activeProjects.flatMap((project) => project.threads)) {
        if (thread.activeTurnId) trackedTurnIdsRef.current.set(thread.id, thread.activeTurnId);
      }
      if (archived) setArchivedThreadProjects(archivedProjects);
      const selectedThreadId = uiMetadata.selectedThreadId;
      const directoryProjects = scope === "archived" ? archivedProjects : activeProjects;
      const selectedThreadProject = directoryProjects.find((project) => !project.projectless && project.threads.some((thread) => thread.id === selectedThreadId));
      const currentWorkspaceProject = directoryProjects.find((project) => !project.projectless && project.threads.some((thread) => thread.currentWorkspace));
      const persistedProject = directoryProjects.find((project) => !project.projectless && project.id === uiMetadata.selectedProjectId);
      const selectedProject = scope === "current"
        ? currentWorkspaceProject ?? selectedThreadProject ?? persistedProject ?? directoryProjects[0]
        : persistedProject ?? selectedThreadProject ?? currentWorkspaceProject
          ?? directoryProjects.find((project) => !project.projectless);
      if (selectedProject && selectedProject.id !== uiMetadata.selectedProjectId) updateUiMetadata({ selectedProjectId: selectedProject.id });
      if (openSavedThread && scope !== "archived" && selectedThreadId && !promptRef.current && selectedThreadIdRef.current === selectedThreadId) {
        const savedThread = activeProjects.flatMap((project) => project.threads).find((thread) => thread.id === selectedThreadId);
        if (savedThread) {
          const openError = await openThread(savedThread);
          if (openError) {
            setThreadDirectoryStatus("error");
            setThreadDirectoryError(openError);
            return;
          }
        }
      }
      setThreadDirectoryStatus("ready");
    } catch (error) {
      setThreadDirectoryStatus("error");
      setThreadDirectoryError(String(error));
    }
  }

  function loadModels() {
    setModelCatalogStatus("loading");
    setModelCatalogError("");
    return bridge.readCodexModels()
      .then((catalog) => {
        setCodexCatalog(catalog.models);
        setModelCatalogStatus("ready");
        return true;
      })
      .catch((error) => {
        setCodexCatalog([]);
        setModelCatalogStatus("error");
        setModelCatalogError(String(error));
        return false;
      });
  }

  useEffect(() => {
    const loadKey = `${settings.runtimeProfile}:${startupAttempt}`;
    if (startupLoadKeyRef.current === loadKey) return;
    startupLoadKeyRef.current = loadKey;
    void Promise.all([
      loadState(settings.runtimeProfile, true),
      loadThreadDirectory(true),
      loadModels(),
      loadCapabilities(true)
    ]);
  }, [bridge, settings.runtimeProfile, startupAttempt]);

  async function retryStartup() {
    await bridge.retryDesktopHost();
    setStartupAttempt((attempt) => attempt + 1);
  }

  useEffect(() => {
    void loadInitialize();
  }, [bridge]);

  useEffect(() => () => onHostStateDispose?.(), [onHostStateDispose]);

  useEffect(() => {
    void bridge.readNativeAppUpdateStatus().then(setNativeAppUpdate).catch(() => setNativeAppUpdate(null));
  }, [bridge]);

  useEffect(() => {
    const restore = () => {
      const threadId = selectedThreadIdRef.current;
      if (document.visibilityState === "visible" && threadId) void reconcileCanonicalThread(threadId, "window-restored").catch(error => setThreadActionError(String(error)));
    };
    document.addEventListener("visibilitychange", restore);
    return () => document.removeEventListener("visibilitychange", restore);
  }, [bridge]);

  useEffect(() => bridge.subscribeEvents((event) => {
    const method = eventMethod(event);
    const params = eventParams(event);
    setEventFeed((items) => [formatEvent(event), ...items].slice(0, 8));
    if (method === "host/app-state-changed") void loadState(settings.runtimeProfile);
    if (method === "bridge.ready") {
      const targets = collectCanonicalReconcileTargets(
        selectedThreadIdRef.current,
        allThreadsRef.current,
        trackedTurnIdsRef.current
      );
      for (const target of targets) {
        void reconcileCanonicalThread(target.threadId, "bridge-ready", target.expectedTurnId).catch(() => undefined);
      }
    }
    if (method === "desktop/navigate" && (params.view === "conversation" || params.view === "runtime")) {
      setPrimaryView(params.view);
    }
    if (method === "desktop/runtime-setup" && typeof params.stage === "string") {
      setDesktopSetupStage(params.stage === "ready" ? null : params.stage);
      setDesktopSetupElapsedSeconds(params.stage !== "ready" && typeof params.elapsedSeconds === "number"
        && Number.isFinite(params.elapsedSeconds) && params.elapsedSeconds >= 0 ? Math.floor(params.elapsedSeconds) : null);
    }
    if (method === "desktop/deep-link") {
      const destination = resolveDeepLinkDestination(params);
      if (destination?.kind === "schedules") {
        setSettingsNavigation(current => ({ open: false, revision: (current?.revision ?? 0) + 1 }));
        setPrimaryView("schedules");
      } else if (destination?.kind === "application_management") {
        setSettingsNavigation(current => ({ open: false, revision: (current?.revision ?? 0) + 1 }));
        setApplicationManagementTab(destination.section ?? "applications");
        setPrimaryView("applications");
      } else if (destination?.kind === "settings") {
        setSettingsNavigation(current => ({ open: true, destination: destination.destination, revision: (current?.revision ?? 0) + 1 }));
      } else if (destination?.kind === "conversation") {
        setSettingsNavigation(current => ({ open: false, revision: (current?.revision ?? 0) + 1 }));
        setPrimaryView("conversation");
        updateUiMetadata({ threadScope: destination.scope });
        void loadThreadDirectory(false, destination.scope);
      }
    }
    if (method === "desktop/new-task") {
      startNewChat();
    }
    if (method === "desktop/open-thread" && typeof params.threadId === "string") {
      const thread = allThreadsRef.current.find((candidate) => candidate.id === params.threadId);
      if (thread) void openThread(thread);
    }
    if (method === "desktop/native-app-update" && params.schema === "opl_native_app_updater.v1") {
      setNativeAppUpdate(params as NativeAppUpdateResult);
    }
    if (method === "host/managed-update" && typeof params.status === "string") {
      setMaintenanceError(typeof params.errorCode === "string" ? params.errorCode : null);
      setMaintenanceStatus(params.status);
      if (params.status === "completed") void loadState(settings.runtimeProfile);
    }
    if (method === "codex/server-request") {
      const request = params as import("../bridge/oplBridge").CodexPendingServerRequest;
      if ((typeof request.id === "string" || typeof request.id === "number") && typeof request.method === "string") {
        setPendingServerRequests((items) => items.some((item) => item.id === request.id)
          ? items
          : [...items, { id: request.id, method: request.method, params: request.params ?? {} }]);
      }
      return;
    }
    if (method === "codex/server-requests-cleared") {
      setPendingServerRequests([]);
      setPendingServerRequestError(settings.locale === "zh"
        ? "Codex App Server 已退出，待处理请求已清除。"
        : "The Codex App Server exited; pending requests were cleared.");
      return;
    }
    if (method === "turn/started") {
      const turn = typeof params.turn === "object" && params.turn ? params.turn as Record<string, unknown> : {};
      const threadId = typeof params.threadId === "string" ? params.threadId : "";
      const turnId = typeof turn.id === "string" ? turn.id : typeof params.turnId === "string" ? params.turnId : "";
      if (threadId && turnId) {
        trackedTurnIdsRef.current.set(threadId, turnId);
        const pendingSubmission = pendingSubmissionSelectionsRef.current;
        if (pendingSubmission && (!pendingSubmission.expectedThreadId || pendingSubmission.expectedThreadId === threadId)) {
          trackComposerTurnSelections(stagedSelectionsByTurnRef.current, threadId, turnId, pendingSubmission.selections);
          pendingSubmissionSelectionsRef.current = null;
        }
      }
      if (threadId && turnId && (!selectedThreadIdRef.current || selectedThreadIdRef.current === threadId)) {
        selectedThreadIdRef.current ??= threadId;
        activeTurnRef.current = { threadId, turnId };
        setActiveTurnId(turnId);
        setCodexThreadId(threadId);
        updateUiMetadata({ selectedThreadId: threadId });
      }
    }
    if (method === "turn/completed") {
      const completedThreadId = typeof params.threadId === "string" ? params.threadId : activeTurnRef.current?.threadId;
      const completedTurnId = typeof params.turnId === "string"
        ? params.turnId
        : typeof params.turn === "object" && params.turn && "id" in params.turn
          ? String((params.turn as { id?: unknown }).id ?? "")
          : "";
      const expectedTurnId = completedThreadId
        ? completedTurnId || trackedTurnIdsRef.current.get(completedThreadId)
        : undefined;
      if (completedThreadId) void reconcileCanonicalThread(completedThreadId, "turn-completed", expectedTurnId).catch(() => undefined);
    }
    if (!pendingAssistantIdRef.current) return;
    if ((method === "item/started" || method === "item/agentMessage/delta" || method === "item/completed") && !isEventForActiveTurn(params, activeTurnRef.current)) return;
    if (method === "item/started") {
      const item = params.item as Record<string, unknown> | undefined;
      if (item?.type === "agentMessage") setMessages(items => items.map(message => message.id === pendingAssistantIdRef.current
        ? { ...message, text: typeof item.text === "string" ? item.text : "", itemId: typeof item.id === "string" ? item.id : undefined, turnId: activeTurnRef.current?.turnId,
            presentation: item.phase === "commentary" ? "progress" : undefined }
        : message));
      return;
    }
    if (method === "item/agentMessage/delta") {
      const delta = eventDelta(event);
      if (!delta) return;
      setMessages((items) => items.map((item) => item.id === pendingAssistantIdRef.current
        ? { ...item, role: "assistant", text: item.text + delta }
        : item));
      return;
    }
    if (method === "item/completed") {
      const item = params.item as Record<string, unknown> | undefined;
      const threadId = typeof params.threadId === "string" ? params.threadId : selectedThreadIdRef.current;
      if (threadId && item?.type === "mcpToolCall" && item.status === "completed" && typeof item.server === "string" && typeof item.tool === "string" && typeof item.id === "string") {
        const launch = { threadId, server: item.server, tool: item.tool, callId: item.id };
        void bridge.listMcpApps({ threadId }).then(({ apps }) => {
          const app = apps.find(app => app.server === launch.server && (app.tools?.includes(launch.tool) || app.tool === launch.tool));
          if (app && selectedThreadIdRef.current === threadId) setMcpAppLaunch({ ...launch, title: app.title });
        }).catch(() => {});
      }
      const completedText = eventCompletedText(event);
      if (!completedText) return;
      const completedItem = params.item as Record<string, unknown> | undefined;
      setMessages((items) => items.map((item) => item.id === pendingAssistantIdRef.current
        ? { ...item, role: "assistant", text: completedText, itemId: typeof completedItem?.id === "string" ? completedItem.id : undefined, turnId: activeTurnRef.current?.turnId,
            presentation: completedItem?.phase === "commentary" ? "progress" : undefined }
        : item));
    }
  }), [bridge]);

  useEffect(() => {
    const openNotifiedThread = (event: Event) => {
      const threadId = (event as CustomEvent<{ threadId?: string }>).detail?.threadId;
      const thread = threadId ? allThreadsRef.current.find((candidate) => candidate.id === threadId) : undefined;
      if (thread) void openThread(thread);
    };
    globalThis.addEventListener("opl:open-thread", openNotifiedThread);
    return () => globalThis.removeEventListener("opl:open-thread", openNotifiedThread);
  }, []);

  useEffect(() => {
    void bridge.listPendingServerRequests()
      .then(setPendingServerRequests)
      .catch((error) => setPendingServerRequestError(String(error)));
  }, [bridge]);

  async function respondToServerRequest(request: import("../bridge/oplBridge").CodexPendingServerRequest, response: { result?: unknown; error?: { code: number; message: string } }) {
    setPendingServerRequestError("");
    try {
      await bridge.respondToServerRequest({ id: request.id, response });
      setPendingServerRequests((items) => items.filter((item) => item.id !== request.id));
    } catch (error) {
      setPendingServerRequestError(String(error));
    }
  }

  function requestDetails(tab: ContextTabId) {
    setActiveContextTab(tab);
    if (
      tab === "opl-project-progress-panel"
      && projectProgress.emptyReason === "projection_unavailable"
      && stateStatus !== "loading"
    ) {
      void loadState(settings.runtimeProfile);
    }
    if (tab === "opl-agents-capabilities-panel" && (capabilityStatus === "idle" || capabilityStatus === "error")) {
      void loadCapabilities();
    }
    setDetailsRequestRevision((revision) => revision + 1);
  }

  function runDryRun(actionId: string, payload: Record<string, unknown> = {}) {
    setActiveFilesView("results");
    requestDetails("opl-files-results-panel");
    void bridge
      .executeAction({ actionId, payload, dryRun: true })
      .then((receipt) => setLastDryRun(formatReceipt(receipt)))
      .catch((error) => setLastDryRun(formatReceipt({ actionId, dryRun: true, error: String(error) })));
  }

  const contributionActionAvailable = !contributionActionBusy && model.contextActions.some(
    (action) => action.id === "package_contribution_execute"
  );
  async function executeContributionAction(
    entry: OplUiContribution,
    command: OplUiContributionCommand,
    confirmed: boolean,
    input: Record<string, unknown> = {}
  ) {
    if (disabledAppPackages.current.has(entry.packageId)) return { status: "cancelled" as const };
    setContributionActionBusy(true);
    setContributionActionConfirmation(null);
    try {
      const actionRequest = createOplContributionActionRequest(entry, command, confirmed);
      actionRequest.payload.input = input;
      const receipt = await bridge.executeAction(actionRequest);
      const outcome = contributionActionOutcome(receipt.stdoutJson, entry, command);
      setLastDryRun(formatReceipt(contributionReceiptForDisplay(entry, receipt, Boolean(outcome.presentation))));
      if (receipt.status === "executed" || receipt.status === "no_op") {
        if (outcome.status !== "succeeded") return {...outcome, message: settings.locale === "zh" ? "尚未确认操作完成，请刷新核实；输入已保留" : "Completion not confirmed; refresh to inspect. Input retained"};
        await loadState(settings.runtimeProfile);
        setContributionRefreshRevision((revision) => revision + 1);
        return {...outcome, message: outcome.presentation ? (settings.locale === "zh" ? "工作台已准备就绪" : "Workbench ready") : actionReceiptView(receipt).summary};
      }
      return {status: "failed" as const, retryable: !receipt.timedOut, message: receipt.timedOut ? (settings.locale === "zh" ? "执行结果尚不确定，请刷新核实；不会重复提交" : "Execution outcome is unknown; refresh to inspect, not resend") : receipt.blockedReason || receipt.stderr || (settings.locale === "zh" ? "操作未完成，请核实状态后重试" : "Action not completed; inspect before retrying")};
    } catch (error) {
      setLastDryRun(formatReceipt({
        actionId: "package_contribution_execute",
        dryRun: false,
        error: String(error)
      }));
      return {status: "failed" as const, retryable: false, message: settings.locale === "zh" ? "未收到执行结果，请刷新核实；输入已保留" : "No execution result; refresh to inspect. Input retained"};
    } finally {
      setContributionActionBusy(false);
    }
  }
  function cancelContributionAction() {
    contributionActionResolver.current?.({status: "cancelled", message: settings.locale === "zh" ? "已取消，输入已保留" : "Cancelled; input retained"});
    contributionActionResolver.current = null;
    setContributionActionConfirmation(null);
  }
  async function confirmContributionAction() {
    const pending = contributionActionConfirmation;
    if (!pending || contributionActionBusy) return;
    const resolve = contributionActionResolver.current;
    contributionActionResolver.current = null;
    resolve?.(await executeContributionAction(pending.entry, pending.command, true, pending.input));
  }
  const handleContributionAction: OplContributionAction = (entry, command, input = {}, preview) => {
    if (disabledAppPackages.current.has(entry.packageId)) return Promise.resolve({ status: "cancelled" });
    if (!contributionActionAvailable || contributionActionResolver.current) return Promise.resolve({status: "failed", message: settings.locale === "zh" ? "其他操作仍在处理，请稍后重试" : "Another action is in progress"});
    if (command.confirmationRequired) {
      return new Promise(resolve => {
        contributionActionResolver.current = resolve;
        setContributionActionConfirmation({ entry, command, input, preview });
      });
    }
    return executeContributionAction(entry, command, false, input);
  };
  const readContributionData = useCallback((entry: OplUiContributionsProjection["entries"][number], input: Record<string, unknown> = {}) => {
    if (disabledAppPackages.current.has(entry.packageId)) return Promise.reject(new Error("Contribution is disabled in OPL App"));
    if (!entry.view) return Promise.reject(new Error("Contribution view is unavailable"));
    return bridge.readContribution({ packageId: entry.packageId, ref: entry.view.dataRef, input }).then((readback) => readback.result);
  }, [bridge]);
  const contributionOwner = {
    locale: settings.locale,
    actionAvailable: contributionActionAvailable,
    developerDetails: settings.developerDetails,
    ...(selectedRuntimeWorkItem?.domainId
      && selectedRuntimeWorkItem.domainWorkItemId
      && selectedRuntimeWorkItem.workItemScopeId
      && selectedRuntimeWorkItem.identityState === "resolved" ? { runtimeDetailIdentity: {
      agentId: selectedRuntimeWorkItem.agentId,
      domainId: selectedRuntimeWorkItem.domainId,
      workItemId: selectedRuntimeWorkItem.workItemId,
      domainWorkItemId: selectedRuntimeWorkItem.domainWorkItemId,
      workItemScopeId: selectedRuntimeWorkItem.workItemScopeId,
      identityState: "resolved" as const
    } } : {}),
    openRuntimeWorkbench: selectedRuntimeWorkItem ? () => {
      setMcpTaskTarget({ itemId: selectedRuntimeWorkItem.id, threadId: codexThreadId }); setMcpAppSelectedLaunch(undefined); setPrimaryView("workspace");
    } : undefined,
    refreshRevision: contributionRefreshRevision,
    readData: readContributionData,
    onAction: handleContributionAction
  };
  const hasContribution = (slot: "composer.palette" | "runtime.detail" | "settings.section") => (
    model.uiContributions.entries.some((entry) => entry.slot === slot)
  );

  async function forkThread(thread: WorkbenchThreadItem) {
    setThreadActionBusy(true);
    setThreadActionError("");
    try {
      const forked: CodexThread = await bridge.forkThread({
        threadId: thread.id,
        throughTurnId: thread.activeTurnId
      });
      await loadThreadDirectory(false);
      const forkedView = deriveThreadDirectory({ data: [forked] })[0]?.threads[0];
      if (forkedView) await openThread(forkedView);
    } catch (error) {
      setThreadActionError(String(error));
    } finally {
      setThreadActionBusy(false);
    }
  }

  async function confirmThreadLifecycle() {
    if (!lifecycleConfirmation) return;
    const pending = lifecycleConfirmation;
    setThreadActionBusy(true);
    setThreadActionError("");
    try {
      if (pending.action === "fork") {
        await bridge.forkThread({
          threadId: pending.thread.id,
          throughTurnId: pending.thread.activeTurnId
        });
      } else if (pending.action === "delete") {
        const result = await bridge.deleteThread({
          threadId: pending.thread.id,
          confirmed: true,
          confirmationId: `opl-studio:${Date.now()}`
        });
        if (!result.deleted) throw new Error(settings.locale === "zh" ? "对话删除未被确认。" : "The thread deletion was not confirmed.");
        const [active, archived] = await Promise.all([
          bridge.listThreads({ archived: false, limit: 100 }),
          bridge.listThreads({ archived: true, limit: 100 })
        ]);
        if ([...active.data, ...archived.data].some((thread) => thread.id === pending.thread.id)) {
          throw new Error(settings.locale === "zh" ? "删除后仍能读到该对话，已停止刷新。" : "The deleted thread is still returned by the canonical directory.");
        }
      } else {
        await bridge.setArchived({
          threadId: pending.thread.id,
          archived: pending.action === "archive",
          confirmed: true,
          confirmationId: `opl-studio:${Date.now()}`
        });
      }
      setLifecycleConfirmation(null);
      setThreadDetail(null);
      if (pending.thread.id === codexThreadId && (pending.action === "archive" || pending.action === "delete")) startNewChat();
      await loadThreadDirectory(false);
    } catch (error) {
      setThreadActionError(String(error));
    } finally {
      setThreadActionBusy(false);
    }
  }

  function replaceEphemeralQueue(next: EphemeralQueueItem[]) {
    ephemeralQueueRef.current = next;
    setEphemeralQueue(next);
  }

  function queuedItemFromComposer(text: string, selections: ComposerSelection[], turnAgentSelection?: CodexAgentSelectionSnapshot): EphemeralQueueItem {
    return {
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      placement: "queued",
      preview: text || selections.map((selection) => selection.label).join(", "),
      text: text || null,
      prompt: text,
      inputs: selections.map((selection) => selection.input),
      selections,
      ...(turnAgentSelection ? { turnAgentSelection } : {})
    };
  }

  async function steerQueuedItem(item: EphemeralQueueItem) {
    const active = activeTurnRef.current;
    if (!active) throw new Error(settings.locale === "zh" ? "当前运行尚未提供可插话的 Turn。" : "The current run has not exposed a steerable turn yet.");
    const accepted = await bridge.steerTurn({
      threadId: active.threadId,
      expectedTurnId: active.turnId,
      prompt: item.prompt,
      inputs: item.inputs,
      ...(item.turnAgentSelection ? { turnAgentSelection: item.turnAgentSelection } : {})
    });
    trackComposerTurnSelections(stagedSelectionsByTurnRef.current, accepted.threadId, accepted.turnId, item.selections);
    replaceEphemeralQueue(ephemeralQueueRef.current.filter((candidate) => candidate.id !== item.id));
    const acceptedMessage: ChatMessage = {
      id: `user-steer-${Date.now()}`,
      role: "user",
      text: item.preview
    };
    messagesRef.current = messagesRef.current.concat(acceptedMessage);
    setMessages(messagesRef.current);
    void reconcileCanonicalThread(accepted.threadId, "steer-accepted", accepted.turnId).catch(() => undefined);
  }

  async function updateEphemeralQueue(itemId: string, action: { kind: string; content?: Array<{ type?: string; text?: string }> }) {
    const item = ephemeralQueueRef.current.find((candidate) => candidate.id === itemId);
    if (!item) return;
    if (action.kind === "remove") {
      releaseComposerSelections(item.selections);
      replaceEphemeralQueue(ephemeralQueueRef.current.filter((candidate) => candidate.id !== itemId));
      return;
    }
    if (action.kind === "edit") {
      const text = action.content?.find((part) => part.type === "text")?.text?.trim();
      if (!text) throw new Error("Queued message text is required");
      replaceEphemeralQueue(ephemeralQueueRef.current.map((candidate) => candidate.id === itemId
        ? { ...candidate, text, prompt: text, preview: text }
        : candidate));
      return;
    }
    if (action.kind === "steer") await steerQueuedItem(item);
  }

  async function steerAllQueuedItems() {
    setComposerSubmissionError("");
    try {
      for (const item of [...ephemeralQueueRef.current]) await steerQueuedItem(item);
    } catch (error) {
      setComposerSubmissionError(String(error));
    }
  }

  async function stopActiveTurn() {
    const active = activeTurnRef.current;
    const pendingId = pendingAssistantIdRef.current;
    if (!active || !pendingId || interruptRequestedForRef.current === pendingId) return;
    interruptRequestedForRef.current = pendingId;
    setComposerSubmissionError(settings.locale === "zh" ? "正在停止当前运行…" : "Stopping the current run…");
    try {
      await bridge.interruptTurn(active);
    } catch (error) {
      interruptRequestedForRef.current = null;
      setComposerSubmissionError(String(error));
    }
  }

  function selectedAgentSnapshot(): CodexAgentSelectionSnapshot | undefined {
    if (!selectedAgent?.route) return undefined;
    return {
      package_id: selectedAgent.packageId,
      shortcut_id: selectedAgent.route.shortcutId,
      codex_visible_entry: selectedAgent.route.codexVisibleEntry,
      required_skill_ids: selectedAgent.requiredSkillIds
    };
  }

  function selectedAgentInputs(): CodexComposerInput[] {
    if (!selectedAgent?.route) return [];
    const requested = [...selectedAgent.requiredSkillIds, selectedAgent.route.codexVisibleEntry];
    return capabilityCatalog.skills
      .filter((skill) => skill.enabled && requested.some((skillRef) => codexSkillMatchesRef(skill.name, skillRef)))
      .map((skill) => ({ type: "skill" as const, name: skill.name, path: skill.path }));
  }

  const mcpAppContext = useRef<{ threadId: string; text: string } | null>(null);

  function sendCodexMessage(modeOrEvent?: ComposerSubmitMode | FormEvent) {
    const mode = typeof modeOrEvent === "string" ? modeOrEvent : "queue";
    if (typeof modeOrEvent === "object") modeOrEvent.preventDefault();
    const text = prompt.trim();
    const pendingSelections = composerSelections;
    if (text === "/open") {
      updatePrompt("");
      void pickComposerFiles();
      return;
    }
    if ((!text && !pendingSelections.length) || !resolvedModel) return;
    const unavailableAttachment = pendingSelections.find((selection) => selection.attachment?.status !== undefined && selection.attachment.status !== "ready");
    if (unavailableAttachment) {
      setComposerSubmissionError(unavailableAttachment.attachment?.status === "pending"
        ? (settings.locale === "zh" ? "附件仍在准备中。" : "An attachment is still being prepared.")
        : (unavailableAttachment.attachment?.error ?? (settings.locale === "zh" ? "请移除失败的附件后重试。" : "Remove the failed attachment before retrying.")));
      return;
    }
    setComposerSubmissionError("");
    if (sendState === "running") {
      const queuedAgentSelection = selectedAgentSnapshot();
      const item = queuedItemFromComposer(text, pendingSelections, queuedAgentSelection);
      if (mcpAppContext.current?.threadId === codexThreadId && mcpAppContext.current) item.prompt = `${item.prompt}\n\n${mcpAppContext.current.text}`;
      replaceEphemeralQueue(ephemeralQueueRef.current.concat(item));
      updatePrompt("");
      setComposerSelections([]);
      setComposerPaletteOpen(false);
      if (mode === "steer") {
        void steerQueuedItem(item).catch((error) => {
          setComposerSubmissionError(String(error));
        });
      }
      return;
    }
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: text || pendingSelections.map((selection) => selection.label).join("\n")
    };
    const pendingId = `assistant-${Date.now()}`;
    const pendingMessage: ChatMessage = { id: pendingId, role: "assistant", text: "" };
    const pendingMessages = messagesRef.current.concat([userMessage, pendingMessage]);
    setHistoryPage(null);
    pendingAssistantIdRef.current = pendingId;
    messagesRef.current = pendingMessages;
    setMessages(pendingMessages);
    updatePrompt("");
    setComposerSelections([]);
    setSelectedAgent(null);
    setPendingInputFiles(pendingSelections.filter((selection) => selection.kind !== "skill").map(composerSelectionArtifact));
    setComposerPaletteOpen(false);
    setSendState("running");
    pendingSubmissionSelectionsRef.current = {
      ...(codexThreadId ? { expectedThreadId: codexThreadId } : {}),
      selections: pendingSelections
    };
    void bridge
      .sendMessage({
        prompt: mcpAppContext.current && mcpAppContext.current.threadId === codexThreadId ? `${text}\n\n${mcpAppContext.current.text}` : text,
        inputs: [
          ...pendingSelections.map((selection) => selection.input),
          ...selectedAgentInputs()
        ].filter((input, index, inputs) => inputs.findIndex((candidate) => candidate.type === input.type && "path" in candidate && "path" in input && candidate.path === input.path) === index),
        threadId: codexThreadId,
        cwd: selectedProject?.workspace,
        agentSelection: codexThreadId ? undefined : selectedAgentSnapshot(),
        turnAgentSelection: codexThreadId ? selectedAgentSnapshot() : undefined,
        additionalInstructions: codexThreadId ? undefined : additionalConversationInstructions,
        model: resolvedModel.id,
        reasoningEffort: resolvedReasoning,
        permissions: settings.agentPermissions,
        autoReview: settings.autoReview,
        timeContext: settings.timeContext
      })
      .then((reply) => {
        const wasInterrupted = interruptRequestedForRef.current === pendingId;
        const nextThreadId = typeof reply === "object" && reply && "threadId" in reply
          ? String((reply as { threadId?: unknown }).threadId ?? "")
          : "";
        const finalMessage = typeof reply === "object" && reply && "finalMessage" in reply
          ? String((reply as { finalMessage?: unknown }).finalMessage ?? "")
          : "";
        const replyTurnId = typeof reply === "object" && reply && "turnId" in reply
          ? String((reply as { turnId?: unknown }).turnId ?? "")
          : "";
        const nextMessages = messagesRef.current.map((item) => item.id === pendingId
          ? { id: pendingId, role: wasInterrupted ? "system" as const : "assistant" as const, text: wasInterrupted ? (item.text || (settings.locale === "zh" ? "运行已停止。" : "Run stopped.")) : finalMessage || formatReceipt(reply) }
          : item);
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
        const resolvedThreadId = nextThreadId || codexThreadId;
        if (resolvedThreadId && replyTurnId) {
          trackComposerTurnSelections(stagedSelectionsByTurnRef.current, resolvedThreadId, replyTurnId, pendingSelections);
        }
        pendingSubmissionSelectionsRef.current = null;
        selectedThreadIdRef.current = resolvedThreadId;
        setCodexThreadId(resolvedThreadId);
        updateUiMetadata({ selectedThreadId: resolvedThreadId });
        if (resolvedThreadId) {
          const acceptedFiles = pendingSelections.filter((selection) => selection.kind !== "skill").map(composerSelectionArtifact);
          if (acceptedFiles.length) setThreadInputFiles((current) => ({
            ...current,
            [resolvedThreadId]: [
              ...(current[resolvedThreadId] ?? []),
              ...acceptedFiles.filter((file) => !(current[resolvedThreadId] ?? []).some((candidate) => candidate.id === file.id))
            ]
          }));
          updateDrafts((current) => ({ ...current, prompts: { ...current.prompts, [resolvedThreadId]: "" } }));
        }
        setPendingInputFiles([]);
        setSelectedAgent(null);
        activeTurnRef.current = null;
        setActiveTurnId(null);
        pendingAssistantIdRef.current = null;
        interruptRequestedForRef.current = null;
        setComposerSubmissionError("");
        setSendState("idle");
        if (resolvedThreadId) void reconcileCanonicalThread(resolvedThreadId, "send-settled", replyTurnId || undefined).catch(() => undefined);
        else void loadThreadDirectory(false);
      })
      .catch(() => {
        const wasInterrupted = interruptRequestedForRef.current === pendingId;
        if (wasInterrupted) {
          const interruptedTurn = activeTurnRef.current;
          setPendingInputFiles([]);
          const nextMessages = messagesRef.current.map((item) => item.id === pendingId
            ? { id: pendingId, role: "system" as const, text: item.text || (settings.locale === "zh" ? "运行已停止。" : "Run stopped.") }
            : item);
          messagesRef.current = nextMessages;
          setMessages(nextMessages);
          pendingAssistantIdRef.current = null;
          interruptRequestedForRef.current = null;
          setComposerSubmissionError("");
          if (interruptedTurn) {
            void reconcileCanonicalThread(interruptedTurn.threadId, "interrupt-settled", interruptedTurn.turnId)
              .catch((error) => setComposerSubmissionError(String(error)));
          } else {
            setActiveTurnId(null);
            setSendState("idle");
            void loadThreadDirectory(false);
          }
          return;
        }
        const acceptedTurn = activeTurnRef.current;
        if (acceptedTurn) {
          setComposerSubmissionError(settings.locale === "zh" ? "连接已中断，正在从任务记录恢复。" : "Connection interrupted; recovering from the canonical task record.");
          void reconcileCanonicalThread(acceptedTurn.threadId, "send-recover", acceptedTurn.turnId)
            .then((thread) => {
              const turn = thread.turns.find((candidate) => candidate.id === acceptedTurn.turnId);
              if (turn && turn.status !== "inProgress") {
                setPendingInputFiles([]);
                setSelectedAgent(null);
                setComposerSubmissionError("");
              }
            })
            .catch((error) => setComposerSubmissionError(String(error)));
          return;
        }
        const message = t.sendFailed;
        pendingSubmissionSelectionsRef.current = null;
        updatePrompt(mergeComposerSubmissionPrompt(text, promptRef.current));
        setComposerSelections((current) => mergeComposerSelections(pendingSelections, current));
        setPendingInputFiles([]);
        activeTurnRef.current = null;
        setActiveTurnId(null);
        setSendState("error");
        const errorMessage: ChatMessage = { id: pendingId, role: "system", text: message };
        const nextMessages = messagesRef.current.map((item) => item.id === pendingId ? errorMessage : item);
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
        pendingAssistantIdRef.current = null;
      });
  }

  function startNewChat() {
    openThreadSequence.current += 1;
    setPrimaryView("conversation");
    setSelectedRuntimeWorkItemId(undefined);
    const currentWorkspaceProject = threadProjects.find((project) => !project.projectless && project.threads.some((thread) => thread.currentWorkspace));
    const nextMessages = createIntroMessages();
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    selectedThreadIdRef.current = undefined;
    setCodexThreadId(undefined);
    updateUiMetadata({
      selectedThreadId: undefined,
      selectedProjectId: currentWorkspaceProject?.id ?? uiMetadata.selectedProjectId
    });
    promptRef.current = drafts.prompts.new ?? "";
    setPrompt(promptRef.current);
    setLastDryRun("");
    setThreadActionError("");
    setSendState("idle");
    releaseComposerSelections(composerSelections);
    setComposerSelections([]);
    setSelectedAgent(null);
    setPendingInputFiles([]);
    replaceEphemeralQueue([]);
    activeTurnRef.current = null;
    interruptRequestedForRef.current = null;
    setActiveTurnId(null);
    setComposerPaletteOpen(false);
  }

  function startNewChatInProject(projectId?: string) {
    if (projectId) updateUiMetadata({ selectedProjectId: projectId, threadScope: "current" });
    startNewChat();
  }

  function threadById(threadId: string) {
    return allThreads.find((thread) => thread.id === threadId);
  }

  async function archiveThreadById(threadId: string) {
    const thread = threadById(threadId);
    if (!thread) throw new Error(settings.locale === "zh" ? "找不到该会话。" : "Thread not found.");
    setLifecycleConfirmation({ thread, action: "archive" });
  }

  async function searchThreads(query: string) {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    const [active, archived] = await Promise.all([
      bridge.listThreads({ searchTerm: normalized, archived: false, limit: 100 }),
      bridge.listThreads({ searchTerm: normalized, archived: true, limit: 100 })
    ]);
    return [...active.data, ...archived.data]
      .filter((thread, index, threads) => threads.findIndex((candidate) => candidate.id === thread.id) === index)
      .slice(0, 100)
      .map((thread) => ({ sessionId: thread.id, ...(typeof thread.preview === "string" && thread.preview ? { snippet: thread.preview } : {}) }));
  }

  async function selectStudioModel(modelId: string, reasoningEffort?: string) {
    if (modelId !== "__auto" && !modelOptions.some((option) => option.id === modelId && option.available)) return false;
    const nextReasoning = modelId === "__auto"
      ? resolveCodexSelection(modelOptions, "__auto", settings.reasoningLevel).reasoningEffort
      : reasoningEffort ?? resolvedReasoning;
    setSettings(writeSettings({ modelAccess: modelId, reasoningLevel: nextReasoning }));
    return true;
  }

  async function selectStudioAgentPreset(id: string) {
    if (id === "opl-manage-agents") {
      setSettingsNavigation(current => ({ open: true, destination: "agents", revision: (current?.revision ?? 0) + 1 }));
      return;
    }
    if (id === "opl-daily-work") {
      setSelectedAgent(null);
      return;
    }
    const agent = model.packageLifecycle.find((item) => item.packageId === id);
    if (!agent || agent.packageRole !== "standard_agent") {
      return settings.locale === "zh" ? "智能体目录已变化，请重新选择。" : "The agent directory changed. Please select again.";
    }
    if (!agent.appEnabled || !agent.readiness.selectable || !agent.homeShortcuts.some(shortcut => shortcut.route)) {
      setSettingsNavigation(current => ({ open: true, destination: "agents", revision: (current?.revision ?? 0) + 1 }));
      return agentAvailabilityDetail(agent, settings.locale);
    }
    setSelectedAgent(agentPackageSelectionIntent(agent));
  }

  async function loadCapabilities(force = false) {
    if (capabilityStatus === "loading" && !force) return false;
    setCapabilityStatus("loading");
    setCapabilityError("");
    try {
      const catalog = await bridge.readCodexCapabilities(codexThreadId);
      if (catalog.errors.length && !catalog.skills.length && !catalog.plugins.length && !catalog.apps.length) {
        setCapabilityStatus("error");
        setCapabilityError(catalog.errors.join("\n"));
        return false;
      } else {
        setCapabilityCatalog(catalog);
        setCapabilityStatus("ready");
        return true;
      }
    } catch (error) {
      setCapabilityStatus("error");
      setCapabilityError(String(error));
      return false;
    }
  }

  function openComposerPalette() {
    setComposerPaletteOpen(true);
    if (capabilityStatus === "idle" || capabilityStatus === "error") void loadCapabilities();
  }

  async function releaseTrackedTurnSelections(entry: TrackedComposerTurn) {
    disposeSelectionPreviews(entry.selections);
    const cleanupTokens = [...new Set(entry.selections.flatMap((selection) => (
      selection.attachment?.cleanupToken ? [selection.attachment.cleanupToken] : []
    )))];
    if (cleanupTokens.length) await bridge.releaseInputs(cleanupTokens);
    stagedSelectionsByTurnRef.current.delete(composerTurnKey(entry.threadId, entry.turnId));
  }

  async function pickComposerFiles() {
    setComposerPaletteOpen(false);
    try {
      addPickedInputs(await bridge.pickFiles());
    } catch (error) {
      setCapabilityError(String(error));
      setCapabilityStatus("error");
    }
  }

  async function pickComposerDirectory() {
    setComposerPaletteOpen(false);
    try {
      addPickedInputs(await bridge.pickDirectory());
    } catch (error) {
      setCapabilityError(String(error));
      setCapabilityStatus("error");
    }
  }

  function toggleComposerSkill(skill: CodexSkillCapability) {
    const id = `skill:${skill.path}`;
    setComposerSelections((current) => current.some((item) => item.id === id)
      ? current.filter((item) => item.id !== id)
      : current.concat({
        id,
        kind: "skill",
        label: skill.name,
        detail: skill.description,
        input: { type: "skill", name: skill.name, path: skill.path }
      }));
  }

  function updateSetting<Key extends keyof WorkbenchSettings>(key: Key, value: WorkbenchSettings[Key]) {
    if (key === "notificationEnabled" && value === true && globalThis.location?.protocol.startsWith("http") && "Notification" in globalThis && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    const nextSettings = writeSetting(key, value);
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
  }

  function setAgentPermissions(value: OplAgentPermission) {
    updateSetting("agentPermissions", value);
  }

  function updateAdditionalConversationInstructions(value: string) {
    setAdditionalConversationInstructions(writeAdditionalConversationInstructions(value));
  }

  function updateReasoning(reasoningLevel: WorkbenchSettings["reasoningLevel"]) {
    if (!resolvedModel) return;
    const modelAccess = effectiveSelection === "__auto" && reasoningLevel !== codexModelPolicy.defaultReasoningEffort
      ? resolvedModel.id
      : effectiveSelection;
    setSettings(writeSettings({ modelAccess, reasoningLevel }));
  }

  const historyControls = messages.length > 40 ? (
    <nav style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", padding: "12px 0" }} aria-label={settings.locale === "zh" ? "会话历史分页" : "Conversation history pages"}>
      <button type="button" disabled={historyStart === 0} onClick={() => setHistoryPage({ threadId: codexThreadId, end: historyStart })}><ChevronLeft size={16} />{settings.locale === "zh" ? "更早消息" : "Earlier"}</button>
      <span>{historyStart + 1}-{historyEnd} / {messages.length}</span>
      <button type="button" disabled={historyEnd === messages.length} onClick={() => setHistoryPage(historyEnd + 40 >= messages.length ? null : { threadId: codexThreadId, end: historyEnd + 40 })}>{settings.locale === "zh" ? "后续消息" : "Later"}<ArrowRight size={16} /></button>
      <button type="button" disabled={historyEnd === messages.length} onClick={() => setHistoryPage(null)}>{settings.locale === "zh" ? "最新消息" : "Latest"}</button>
    </nav>
  ) : null;

  const studioConversationBody = (
    <div className="opl-dsh-thread" ref={conversationRef as never}>
      {desktopSetupStage ? <p role="status" data-testid="opl-desktop-runtime-setup">{({
        checking_host: settings.locale === "zh" ? "正在检查本机运行环境" : "Checking the local runtime",
        enabling_wsl: settings.locale === "zh" ? "正在启用 Windows 运行环境" : "Enabling the Windows runtime",
        installing_owned_distribution: settings.locale === "zh" ? "正在安装 OPL 运行环境" : "Installing the OPL runtime",
        initializing_guest: settings.locale === "zh" ? "正在准备 OPL 组件" : "Preparing OPL components",
        validating_routes: settings.locale === "zh" ? "正在检查 OPL 组件" : "Checking OPL components"
      } as Record<string, string>)[desktopSetupStage] ?? (settings.locale === "zh" ? "正在准备运行环境" : "Preparing the runtime")}{desktopSetupElapsedSeconds !== null ? <span>{settings.locale === "zh" ? ` · 已用时 ${desktopSetupElapsedSeconds} 秒` : ` · Elapsed ${desktopSetupElapsedSeconds}s`}</span> : null}</p> : null}
      {(threadDirectoryStatus === "error" || modelCatalogStatus === "error") && <div role="status" data-testid="opl-codex-recovery"><p>{threadDirectoryError || modelCatalogError}</p><button type="button" onClick={() => void retryStartup().catch(error => setThreadActionError(String(error)))}>{settings.locale === "zh" ? "重试连接" : "Retry connection"}</button><a href="https://github.com/gaofeng21cn/opl-studio/issues/new" target="_blank" rel="noreferrer">{settings.locale === "zh" ? "报告启动问题" : "Report startup issue"}</a></div>}
      <CodexServerRequestPanel requests={pendingServerRequests} locale={settings.locale} error={pendingServerRequestError} onRespond={(request, response) => void respondToServerRequest(request, response)} />
      {threadActionError ? <p className="thread-read-error" role="alert">{threadActionError}</p> : null}
      <SubagentsPanel key={codexThreadId ?? "new"} threadId={codexThreadId} threads={allThreads} messages={messages} locale={settings.locale} onOpen={openCanonicalThreadRef} />
      {historyControls}
      <ConversationMessages threadId={codexThreadId} activeTurnId={activeTurnId ?? undefined}
        messages={messages} start={historyStart} end={historyEnd} running={sendState === "running"}
        locale={settings.locale} events={eventFeed} renderContent={(message) => <>
          <div className="message-frame">
            {message.role === "assistant" ? (
              <Streamdown controls={assistantMarkdownControls} lineNumbers={false} linkSafety={assistantMarkdownLinkSafety} mode="static">{assistantDisplayMarkdown(message.text || (sendState === "running" ? t.codexWorking : t.waitingReply))}</Streamdown>
            ) : <p>{message.text || (sendState === "running" ? t.codexWorking : t.waitingReply)}</p>}
          </div>
          {message.role === "assistant" ? <span data-testid="opl-codex-reply" hidden /> : null}
        </>} />
      {historyControls}
      {mcpAppLaunch?.threadId === codexThreadId && mcpAppLaunch ? <button onClick={() => { setMcpTaskTarget(undefined); setMcpAppSelectedLaunch(mcpAppLaunch); setPrimaryView("workspace"); }}>{settings.locale === "zh" ? "打开应用：" : "Open app: "}{mcpAppLaunch.title}</button> : null}
    </div>
  );

  const studioComposerOverlay = (
    <ComposerCapabilityPalette
      open={composerPaletteOpen}
      locale={settings.locale}
      catalog={capabilityCatalog}
      status={capabilityStatus}
      error={capabilityError}
      selections={composerSelections}
      standardAgents={standardAgentOptions}
      oplCapabilities={oplCapabilityOptions}
      selectedAgentId={selectedAgent?.packageId}
      onClose={() => setComposerPaletteOpen(false)}
      onPickFiles={() => void pickComposerFiles()}
      onPickDirectory={() => void pickComposerDirectory()}
      onToggleSkill={toggleComposerSkill}
      onSelectOplCapability={(capability) => {
        toggleComposerSkill(capability.skill);
        setComposerPaletteOpen(false);
      }}
      onSelectAgent={(agent) => {
        setSelectedAgent(agent.selection);
        setComposerPaletteOpen(false);
      }}
      contributions={hasContribution("composer.palette") ? renderContributionSlot?.("composer.palette", contributionOwner) : null}
    />
  );

  const composerImages = useMemo(() => composerSelections.flatMap((selection) => {
    const attachment = selection.attachment;
    return attachment?.kind === "image" && attachment.previewFile && attachment.previewUrl
      ? [{ id: attachment.id, file: attachment.previewFile, previewUrl: attachment.previewUrl }]
      : [];
  }), [composerSelections]);

  const studioDetails = (
    <aside className="opl-dsh-context-panel" aria-label="On-demand context panel">
      <div className="context-scroll">
        <section data-testid="opl-project-progress-panel" className="context-block project-progress-panel" hidden={activeContextTab !== "opl-project-progress-panel"}>
          <div className="context-list-head">
            <strong>{settings.locale === "zh" ? "当前项目" : "Current project"}</strong>
            <button type="button" aria-label={t.refresh} title={t.refresh} onClick={() => void loadState(settings.runtimeProfile)}><RefreshCw aria-hidden="true" size={14} /></button>
          </div>
          <ProjectProgressPanel onOpen={itemId => { setMcpTaskTarget({ itemId, threadId: codexThreadId }); setMcpAppSelectedLaunch(undefined); setPrimaryView("workspace"); }} locale={settings.locale} progress={selectedRuntimeWorkItem?.workspacePath ? selectProjectProgress(selectedRuntimeWorkItem.workspacePath, model.workItemRuntime, settings.locale) : projectProgress} refreshing={stateStatus === "loading"} />
        </section>
        <section data-testid="opl-files-results-panel" className="context-block opl-files-surface" hidden={activeContextTab !== "opl-files-results-panel"}>
          <nav className="opl-files-section-nav" aria-label={settings.locale === "zh" ? "文件与结果" : "Files and results"}>
            <button type="button" data-active={activeFilesView === "workspace" || undefined} onClick={() => { setActiveFilesView("workspace"); setArtifactPreviewOpen(false); }}><Folder aria-hidden="true" size={14} /><span>{settings.locale === "zh" ? "工作区" : "Workspace"}</span></button>
            <button type="button" data-active={activeFilesView === "inputs" || undefined} onClick={() => { setActiveFilesView("inputs"); setArtifactPreviewOpen(false); }}><FileText aria-hidden="true" size={14} /><span>{settings.locale === "zh" ? "输入" : "Inputs"}</span></button>
            <button type="button" data-active={activeFilesView === "results" || undefined} onClick={() => setActiveFilesView("results")}><Files aria-hidden="true" size={14} /><span>{settings.locale === "zh" ? "结果" : "Results"}</span></button>
          </nav>
          {activeFilesView === "workspace" ? (
            <>
            <WorkspaceGitPanel threadId={codexThreadId ?? null} locale={settings.locale} readGit={bridge.readThreadWorkspaceGit} />
            <WorkspaceFilesPanel
              threadId={codexThreadId}
              workspace={currentSession?.workspace ?? ""}
              locale={settings.locale}
              listWorkspace={bridge.listThreadWorkspace}
              readBytes={bridge.readThreadWorkspaceBytes}
              accessWorkspace={bridge.accessThreadWorkspace}
              nativeFileAccess={bridge.platformCapabilities.nativeWorkspaceFileAccess === true}
              searchWorkspace={bridge.searchThreadWorkspace}
            />
            </>
          ) : null}
          {activeFilesView === "inputs" ? (
            <div className="opl-files-list" data-testid="opl-input-files-list">
              {sidebarSources.length ? sidebarSources.map((source) => <div className="context-ref-row" key={source.id}><strong>{source.label}</strong><span>{source.summary}</span></div>) : <p className="context-empty">{settings.locale === "zh" ? "暂无输入文件" : "No input files"}</p>}
            </div>
          ) : null}
          {activeFilesView === "results" ? (
            <div className="opl-files-results" data-testid="opl-artifact-preview-tabs">
              {artifactPreviewOpen && selectedPreview ? (
                <>
                  <header className="opl-files-drilldown-header">
                    <button type="button" aria-label={settings.locale === "zh" ? "返回结果列表" : "Back to results"} title={settings.locale === "zh" ? "返回结果列表" : "Back to results"} onClick={() => setArtifactPreviewOpen(false)}><ChevronLeft aria-hidden="true" size={16} /></button>
                    <strong>{selectedPreview.title}</strong>
                  </header>
                  <div role="region" aria-label={selectedPreview.title} data-testid="opl-artifact-preview-panel" className="artifact-preview" data-preview-kind={selectedPreview.rendererModuleId}>
                    <span data-testid="opl-selected-artifact-preview" hidden />
                    <ArtifactPreviewCard preview={selectedPreview} />
                  </div>
                  {exportAction ? <button data-testid="opl-export-action" type="button" onClick={() => runDryRun(exportAction.id, { source: "artifact-panel" })}><Download aria-hidden="true" size={14} /><span data-testid="opl-export-action-dry-run">{t.previewExport}</span></button> : null}
                </>
              ) : (
                <div className="opl-file-result-list">
                  {previewItems.length ? previewItems.map((preview) => (
                    <button
                      key={preview.id}
                      data-testid="opl-artifact-preview-tab"
                      type="button"
                      onClick={() => { setSelectedPreviewId(preview.id); setArtifactPreviewOpen(true); }}
                    ><FileText aria-hidden="true" size={15} /><span><strong>{preview.title}</strong><small>{preview.previewKind}</small></span><ArrowRight aria-hidden="true" size={14} /></button>
                  )) : <p className="context-empty">{settings.locale === "zh" ? "暂无产物" : "No artifacts"}</p>}
                </div>
              )}
              {lastDryRun ? <output data-testid="opl-runtime-action-receipt">{lastDryRun}</output> : null}
            </div>
          ) : null}
        </section>
        <section data-testid="opl-agents-capabilities-panel" className="context-block" aria-label="Agents and capabilities" hidden={activeContextTab !== "opl-agents-capabilities-panel"}>
          <div className="context-list-head">
            <strong>{settings.locale === "zh" ? "当前能力" : "Current capabilities"}</strong>
            <button type="button" aria-label={t.refresh} title={t.refresh} onClick={() => void loadCapabilities()}><RefreshCw aria-hidden="true" size={14} /></button>
          </div>
          <div className="runtime-current-agent" data-testid="opl-current-agent-capabilities" data-status={sendState === "running" ? "running" : currentSession?.status ?? "idle"}>
            <span className="runtime-status-dot" aria-hidden="true" />
            <div>
              <strong>{currentSession?.agentNickname ?? currentSession?.agentRole ?? "Codex"}</strong>
              <span>{currentAgentStatus}</span>
            </div>
          </div>
          {capabilityStatus === "loading" ? <p className="context-empty">{settings.locale === "zh" ? "正在读取能力" : "Loading capabilities"}</p> : null}
          {capabilityStatus === "error" ? <p className="context-empty" role="alert">{capabilityError}</p> : null}
          {capabilityStatus === "ready" ? (
            <>
              <label className="capability-search">
                <Search aria-hidden="true" size={14} />
                <input value={capabilityQuery} onChange={(event) => setCapabilityQuery(event.currentTarget.value)} placeholder={settings.locale === "zh" ? "搜索能力" : "Search capabilities"} />
              </label>
              <div className="capability-groups" data-testid="opl-codex-capability-catalog">
              {capabilityGroups.map((group) => (
                <div className="capability-group" key={group.id}>
                  <header><strong>{group.label}</strong><span>{group.items.filter((item) => item.active).length}/{group.items.length}</span></header>
                  {group.filteredItems.length ? (group.id === "opl-modules" || normalizedCapabilityQuery ? group.filteredItems : group.filteredItems.slice(0, 5)).map((item) => <div className="capability-row" key={`${group.id}:${item.id}`} data-active={item.active}><span className="runtime-status-dot" aria-hidden="true" /><div><strong>{item.name}</strong>{item.detail ? <span>{item.detail}</span> : null}</div></div>) : <p className="context-empty">{settings.locale === "zh" ? "没有匹配项" : "No matches"}</p>}
                </div>
              ))}
              </div>
            </>
          ) : null}
        </section>
        <section data-testid="opl-runtime-contributions" className="context-block runtime-contributions" hidden={activeContextTab !== "opl-project-progress-panel"}>
          <h3>{settings.locale === "zh" ? "研究与任务模块" : "Research and task modules"}</h3>
          {runDetail.runtimeDetails.some((module) => module.state === "ready")
            ? renderContributionSlot?.("runtime.detail", contributionOwner)
            : <p className="context-empty">{settings.locale === "zh" ? "当前智能体未提供假设、路线图或其他任务模块。" : "The current agent has not provided hypotheses, a roadmap, or another task module."}</p>}
        </section>
        <div className="visually-hidden" data-testid="opl-web-transport">window.oplStudio / SSE /api/opl-events</div>
      </div>
    </aside>
  );

  const workbenchOpenThread = useRef(openCanonicalThreadRef);
  workbenchOpenThread.current = openCanonicalThreadRef;
  const workbenchRunAction = useRef(runSettingsAction);
  workbenchRunAction.current = runSettingsAction;
  const workbenchServices = useMemo(() => ({
    read: (operation: string, input: Record<string, unknown> = {}) => bridge.readContribution({ packageId: 'opl-workbench-services', ref: `workbench#${operation}`, input }).then(value => value.result),
    openThread: (id: string) => workbenchOpenThread.current(id),
    execute: (operation: string, input: Record<string, unknown>, label: string): Promise<{ status: string; [key: string]: unknown }> => {
      if (workbenchActionResolver.current) return Promise.resolve({ status: "failed", error: "Another workbench action is awaiting confirmation." });
      const requestId = crypto.randomUUID();
      const key = `workbench:${operation}:${requestId}`;
      return new Promise(resolve => {
        workbenchActionResolver.current = { key, resolve };
        void workbenchRunAction.current({ key, actionId: "package_contribution_execute", label,
          payload: { package_id: "opl-workbench-services", ref: `workbench#${operation}`, input: { ...input, requestId } },
          confirmationRequired: true, dryRunSupported: true });
      });
    },
  }), [bridge]);

  useWorkbenchShortcuts({ newChat: startNewChat, settings: () => setSettingsNavigation(current => ({ open: true, revision: (current?.revision ?? 0) + 1 })), schedules: () => setPrimaryView("schedules") });
  const renderPackageContributions = (packageId: string, renderContribution?: (options?: { only?: string }) => ReactNode) => {
    const entries = model.uiContributions.entries.filter((entry) => (
      entry.slot === "settings.section" && entry.packageId === packageId && settingsContributionDestination(entry) !== null
    ));
    return entries.length ? <div className="opl-contribution-slot" data-package-id={packageId}>
      {entries.map((entry) => <div key={entry.contributionKey}>{renderContribution?.({ only: entry.contributionKey }) ?? null}</div>)}
    </div> : null;
  };
  const renderStudioSettings = (activeDestination: SettingsDestinationId, renderContribution?: (options?: { only?: string }) => ReactNode, onNavigate?: (destination: SettingsDestinationId) => void, onClose?: () => void) => (
    <SettingsPanel
      onOpenSchedules={() => { onClose?.(); setPrimaryView("schedules"); }}
      onOpenSoftwareCenter={(section = "applications") => { onClose?.(); setSettingsNavigation(current => ({ open: false, revision: (current?.revision ?? 0) + 1 })); setApplicationManagementTab(section); setPrimaryView("applications"); }}
      model={{ ...model, features: featureRefsWithCodexStatus(model.features, threadDirectoryStatus, threadDirectoryError, stateStatus, {
        ...(activeTurnId ? { 'B0-03': { state: 'available', summary: '当前 canonical turn 已接受并运行；最终结果尚待回读。' } } : {}),
        ...(sendState === 'error' ? { 'B0-03': { state: 'unavailable', summary: composerSubmissionError || '最近一次发送失败；草稿已保留，请重试。' } } : {}),
        ...(composerSubmissionError ? { 'B0-04': { state: 'degraded', summary: composerSubmissionError } } : {}),
        ...(pendingServerRequestError ? { 'B0-05': { state: 'degraded', summary: pendingServerRequestError } } : pendingServerRequests.length ? { 'B0-05': { state: 'available', summary: '当前任务有待处理的 App Server 确认请求。' } } : {}),
        ...(threadDetail?.id === codexThreadId && threadDetail ? { 'B0-10': { state: 'available', summary: '当前任务的工作区关系已从 canonical thread 读取。' } } : {}),
        ...(messages.some(message => message.subagent) ? { 'B0-11': { state: 'available', summary: '当前任务已投影子 Agent 信息；打开结果时再次读取 canonical child thread。' } } : {}),
      }) }}
      managedUpdate={managedUpdate}
      actionViewModel={settingsActionViewModel}
      settings={settings}
      modelOptions={modelOptions}
      resolvedModel={resolvedModel}
      resolvedReasoning={resolvedReasoning}
      resolvedReasoningOptions={resolvedReasoningOptions}
      stateStatus={stateStatus}
      stateError={stateError}
      carrierDiagnostics={carrierDiagnostics}
      initializationStatus={initializeStatus}
      initialization={initializeReadback}
      nativeAppUpdate={nativeAppUpdate}
      maintenanceStatus={maintenanceStatus}
      maintenanceError={maintenanceError}
      dockerDiagnostic={dockerDiagnostic}
      capabilityCatalog={capabilityCatalog}
      capabilityStatus={capabilityStatus}
      capabilityError={capabilityError}
      onRefreshCapabilities={() => void loadCapabilities()}
      activeDestination={activeDestination}
      onNavigate={onNavigate}
      onRefresh={() => void loadState(settings.runtimeProfile)}
      readMemory={bridge.readFullDrilldown}
      workbenchServices={workbenchServices}
      onClose={onClose}
      onRefreshInitialization={() => { void loadInitialize(); }}
      setupCapabilities={{
        ...setupCapabilities,
        modelAccessSecretInput: bridge.platformCapabilities.modelAccessSecretInput
      }}
      onChooseWorkspaceRoot={chooseWorkspaceRoot}
      onInstallCodex={installCodex}
      onConfigureCodexApiKey={configureCodexApiKey}
      onChangeLogDirectory={() => void changeLogDirectory()}
      onOpenLogDirectory={bridge.platformCapabilities.nativeWorkspaceFileAccess ? () => bridge.openLogDirectory() : undefined}
      currentWorkspace={selectedProject?.workspace ?? currentProject}
      onOpenWorkspace={bridge.platformCapabilities.nativeWorkspaceFileAccess && codexThreadId ? () => bridge.accessThreadWorkspace({ threadId: codexThreadId, relativePath: "", action: "open" }) : undefined}
      onSettingChange={updateSetting}
      onReasoningChange={updateReasoning}
      additionalConversationInstructions={additionalConversationInstructions}
      onAdditionalConversationInstructionsChange={updateAdditionalConversationInstructions}
      onAction={(request) => void runSettingsAction(request)}
      onHostAction={(intent) => void runSettingsHostAction(intent)}
      onGatewayLogin={loginGatewayAccount}
      onApproveConnectionAccess={bridge.platformCapabilities.connectionAccessApproval ? approveConnectionAccess : undefined}
      manifestInstallAction={projectedManifestInstallAction}
      actionBusyKey={settingsActionBusyKey}
      actionReceipt={settingsActionReceipt}
      actionFeedback={settingsActionFeedback}
      pendingConfirmation={null}
      onConfirmAction={() => void confirmSettingsAction()}
      onCancelAction={cancelSettingsAction}
      renderPackageContributions={(packageId) => renderPackageContributions(packageId, renderContribution)}
    />
  );

  const voiceInputContext: VoiceInputContext = { threadId: codexThreadId,
    workspacePath: selectedProject?.workspace ?? currentProject,
    locale: settings.locale, revision: openThreadSequence.current };
  voiceInputContextRef.current = voiceInputContext;
  const mcpApps = {
      bridge,
      task: mcpTaskTarget?.threadId === codexThreadId ? mcpTaskTarget : undefined,
      launch: mcpAppSelectedLaunch?.threadId === codexThreadId ? mcpAppSelectedLaunch : undefined,
      onManage: () => setPrimaryView("applications"),
      onConversation: () => setPrimaryView("conversation"),
      onContext: (threadId: string, text: string) => { if (threadId === codexThreadId) mcpAppContext.current = { threadId, text }; },
      onMessage: (threadId: string, text: string) => { if (threadId === codexThreadId) { updatePrompt(prompt ? `${prompt}\n\n${text}` : text); setPrimaryView("conversation"); } }
    };
  return renderShell({
    locale: settings.locale,
    projectTitle: currentProject,
    sessionTitle: localizedSessionTitle(currentSession?.title || t.newTaskTitle, settings.locale),
    agentPermissions: settings.agentPermissions,
    workspacePath: selectedProject?.workspace ?? currentProject,
    prompt,
    promptRevision: prompt.length,
    conversationBlank: messages.length === 0,
    sending: sendState === "running",
    queue: ephemeralQueue,
    contributionOwner,
    mcpApps,
    uiContributions: model.uiContributions,
    threadProjects: visibleThreadProjects,
    threadDirectoryStatus,
    threadDirectoryError,
    currentThreadId: codexThreadId,
    selectedProjectId: uiMetadata.selectedProjectId,
    modelOptions,
    modelSelection: effectiveSelection,
    reasoningSelection: resolvedReasoning,
    reasoningOptions: resolvedReasoningOptions,
    resolvedModelId: resolvedModel?.id,
    agentPresets: [
      {
        id: "opl-daily-work",
        name: settings.locale === "zh" ? "日常工作" : "Daily Work",
        description: settings.locale === "zh" ? "One Person Lab · 默认通用智能体" : "One Person Lab's default general-purpose Agent",
        selection: null
      },
      ...model.packageLifecycle.filter((item) => (
        item.appEnabled && item.packageRole === "standard_agent" && item.official
          && (item.homeShortcuts.some(shortcut => Boolean(shortcut.route) && shortcut.visible)
            || !item.readiness.selectable)
      )).sort((left, right) => (
        (standardAgentSeatPresentationZh[left.packageId]?.order ?? Number.MAX_SAFE_INTEGER)
        - (standardAgentSeatPresentationZh[right.packageId]?.order ?? Number.MAX_SAFE_INTEGER)
        || left.label.localeCompare(right.label)
      )).map((agent) => {
        const description = (settings.locale === "zh" ? agent.descriptionI18n.zh : agent.descriptionI18n.en) ?? agent.description;
        const formalName = agent.displayNameI18n.en ?? agent.label;
        return {
          id: agent.packageId,
          name: settings.locale === "zh"
            ? standardAgentSeatPresentationZh[agent.packageId]?.name ?? agent.displayNameI18n.zh ?? agent.label
            : formalName,
          description: !agent.readiness.selectable || !agent.homeShortcuts.some(shortcut => shortcut.route)
            ? agentAvailabilityDetail(agent, settings.locale)
            : settings.locale === "zh" && description
            ? `${formalName} · ${description}`
            : description,
          selection: agentPackageSelectionIntent(agent)
        };
      }),
      { id: "opl-manage-agents", name: settings.locale === "zh" ? "管理智能体…" : "Manage agents…",
        description: stateStatus === "error" ? (settings.locale === "zh" ? "目录读取失败，打开设置检查与恢复" : "Directory unavailable. Open settings to inspect and recover.")
          : (settings.locale === "zh" ? "安装、修复或恢复官方组合" : "Install, repair, or restore the official combination"), selection: null }
    ],
    selectedAgentPresetId: selectedAgent?.packageId ?? "opl-daily-work",
    conversationBody: studioConversationBody,
    primaryView,
    applicationManagement: <ApplicationManagementPage
      model={model}
      capabilityCatalog={capabilityCatalog}
      capabilityStatus={capabilityStatus}
      capabilityError={capabilityError}
      onRefreshCapabilities={() => void loadCapabilities(true)}
      stateStatus={stateStatus}
      stateError={stateError}
      onApproveConnectionAccess={bridge.platformCapabilities.connectionAccessApproval ? approveConnectionAccess : undefined}
      settings={settings}
      managedUpdate={managedUpdate}
      actionViewModel={settingsActionViewModel}
      nativeAppUpdate={nativeAppUpdate}
      actionBusyKey={settingsActionBusyKey}
      onAction={(request) => void runSettingsAction(request)}
      onHostAction={(intent) => void runSettingsHostAction(intent)}
      onRefresh={() => void loadState(settings.runtimeProfile)}
      manifestInstallAction={projectedManifestInstallAction}
      renderPackageContributions={(packageId) => renderPackageContributions(packageId, options => renderContributionSlot?.("settings.section", contributionOwner, options))}
      onOpenSettings={(destination) => setSettingsNavigation(current => ({ open: true, destination, revision: (current?.revision ?? 0) + 1 }))}
      initialTab={applicationManagementTab}
      onTabChange={setApplicationManagementTab}
      actionFeedback={settingsActionFeedback}
      actionReceipt={settingsActionReceipt}
    />,
    scheduledTasks: <>
      <DshScheduledTasksPanel client={workbenchServices} locale={settings.locale} onAction={() => undefined} busy={settingsActionBusyKey !== null} revision={settingsActionReceipt?.receiptId} cwd={selectedProject?.workspace ?? currentProject} onOpened={() => setPrimaryView("conversation")} />
      {settingsActionFeedback ? <p role="status">{settingsActionFeedback.message}</p> : null}
    </>,
    runtimeOverview: <RuntimeOverviewPage
      locale={settings.locale}
      projection={model.workItemRuntime}
      serviceRecovery={model.serviceRecovery}
      selectedWorkItemId={detailWorkItemId}
      stateStatus={stateStatus}
      snapshotSource={runtimeSnapshotSource}
      snapshotCachedAt={runtimeSnapshotCachedAt}
      onRefresh={() => { void loadState(settings.runtimeProfile); }}
      onOpenMaintenance={() => setSettingsNavigation(current => ({ open: true, destination: "services", revision: (current?.revision ?? 0) + 1 }))}
      onOpenWorkItem={(item) => {
        setSelectedRuntimeWorkItemId(item.workItemId);
        requestDetails("opl-project-progress-panel");
      }}
      onOpenThread={openCanonicalThreadRef}
      mcpApps={{ ...mcpApps, threadId: codexThreadId }}
    />,
    openPrimaryView: setPrimaryView,
    composerAccessory: <><ComposerAccessory
      locale={settings.locale}
      recoveredDrafts={drafts.recovered}
      prompt={prompt}
      selections={composerSelections}
      selectedAgent={selectedAgent}
      sendState={sendState}
      submissionError={composerSubmissionError}
      unavailableFixedModel={unavailableFixedModel}
      onUpdatePrompt={updatePrompt}
      onRemoveSelection={removeComposerSelection}
      onClearAgent={() => setSelectedAgent(null)}
    />{settings.voiceInput ? <VoiceInput
      key={voiceInputContextKey(voiceInputContext)} locale={settings.locale}
      disabled={sendState === "running" || threadActionBusy}
      onTranscript={text => {
        if (!settingsRef.current.voiceInput || !voiceInputContextRef.current) return;
        const next = appendVoiceTranscript(promptRef.current, text, voiceInputContext, {
          ...voiceInputContextRef.current, threadId: selectedThreadIdRef.current,
          locale: settingsRef.current.locale, revision: openThreadSequence.current
        });
        if (next !== undefined) updatePrompt(next);
      }} /> : null}</>,
    composerOverlay: studioComposerOverlay,
    composerImages,
    addComposerImages: (files) => stageComposerFiles(files, "drop"),
    removeComposerImage: removeComposerSelection,
    details: studioDetails,
    detailTabs,
    activeDetailTabId: activeContextTab,
    openDetailTab: requestDetails,
    renderSettings: renderStudioSettings,
    renderSettingsContribution: (options, owner) => renderContributionSlot?.("settings.section", { ...contributionOwner, ...owner }, options),
    settingsNavigation,
    initializationStatus: initializeStatus,
    initialization: initializeReadback,
    refreshInitialization: () => { void loadInitialize(); },
    setupCapabilities,
    chooseWorkspaceRoot,
    installCodex,
    overlay: <><SettingsActionDialog settings={settings} pendingConfirmation={settingsActionConfirmation} actionBusyKey={settingsActionBusyKey} onConfirmAction={() => void confirmSettingsAction()} onCancelAction={cancelSettingsAction} /><style>{codexWorkbenchStyles}</style><ThreadDetailPopover thread={threadDetail} locale={settings.locale} busy={threadActionBusy} onClose={() => setThreadDetail(null)} onResume={(thread) => void resumeThreadAndOpen(thread)} onFork={(thread) => void forkThread(thread)} onRequestArchive={(thread, archived) => { setLifecycleConfirmation({ thread, action: archived ? "archive" : "unarchive" }); setThreadActionError(""); setThreadDetail(null); }} onRequestDelete={(thread) => { setLifecycleConfirmation({ thread, action: "delete" }); setThreadActionError(""); setThreadDetail(null); }} /><ThreadLifecycleConfirmationDialog thread={lifecycleConfirmation?.thread ?? null} action={lifecycleConfirmation?.action ?? "archive"} locale={settings.locale} busy={threadActionBusy} error={threadActionError} onClose={() => setLifecycleConfirmation(null)} onConfirm={() => void confirmThreadLifecycle()} /><Modal closeLabel={settings.locale === "zh" ? "关闭" : "Close"} open={contributionActionConfirmation !== null} onClose={cancelContributionAction} title={settings.locale === "zh" ? "确认执行能力操作" : "Confirm capability action"} description={contributionActionConfirmation ? (settings.locale === "zh" ? `此操作将由 ${contributionActionConfirmation.entry.packageId} 通过 OPL App 执行。` : `This action will be executed by ${contributionActionConfirmation.entry.packageId} through OPL App.`) : ""} footer={<><Button variant="outline" onClick={cancelContributionAction}>{settings.locale === "zh" ? "取消" : "Cancel"}</Button><Button variant="primary" disabled={contributionActionBusy || !contributionActionConfirmation} onClick={() => void confirmContributionAction()}>{settings.locale === "zh" ? "确认执行" : "Confirm"}</Button></>}>{contributionActionConfirmation ? <><h3>{contributionLabel(contributionActionConfirmation.command.label, settings.locale, contributionActionConfirmation.command.commandId)}</h3><WorkspaceReviewPreview value={{...contributionActionConfirmation.preview, ...contributionActionConfirmation.input}} zh={settings.locale === "zh"}/></> : null}</Modal></>,
    detailsRequestRevision,
    startSession: startNewChat,
    startSessionInProject: startNewChatInProject,
    openThread: (threadId) => { const thread = threadById(threadId); if (thread) void openThread(thread); },
    renameSession,
    renameWorkspace,
    deleteWorkspace,
    insertWorkspaceBefore,
    insertSessionBefore,
    createWorkspace,
    forkThread: (threadId) => { const thread = threadById(threadId); if (thread) void forkThread(thread); },
    archiveThread: archiveThreadById,
    searchThreads,
    reloadThreadDirectory: () => { void loadThreadDirectory(false); },
    selectModel: selectStudioModel,
    selectAgentPreset: selectStudioAgentPreset,
    updatePrompt,
    submitPrompt: sendCodexMessage,
    steerQueue: () => void steerAllQueuedItems(),
    updateQueue: updateEphemeralQueue,
    notifyQueue: (_level, text) => setComposerSubmissionError(text),
    openComposerPalette,
    setAgentPermissions,
    stopTurn: () => void stopActiveTurn()
  });

}

export default App;
