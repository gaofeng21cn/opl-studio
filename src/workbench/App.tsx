import { Button, MessageText, Modal, Pill } from "@deepseek-ai/dsh-client-ui-primitives";
import { Streamdown } from "streamdown";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  CircleEllipsis,
  Clock3,
  Download,
  Files,
  FileText,
  Folder,
  LoaderCircle,
  Puzzle,
  RefreshCw,
  Search,
  X
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
  type CodexAgentSelectionSnapshot,
  type CodexCapabilityCatalog,
  type CodexComposerInput,
  type CodexModelCatalogEntry,
  type CodexPickedInput,
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
  type WorkbenchActionRef,
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
  migrateStorageValue,
  readAdditionalConversationInstructions,
  readSettings,
  writeAdditionalConversationInstructions,
  writeSetting,
  writeSettings,
  type WorkbenchSettings
} from "./settingsModel";
import { codexWorkbenchStyles } from "./codexWorkbenchStyles";
import { RuntimeOverviewPage } from "./RuntimeOverviewPage";
import type { DomainDetailViewReadRequest } from "./domainDetailViews";
import {
  readRuntimeOverviewCache,
  runtimeOverviewModelFromCache,
  writeRuntimeOverviewCache
} from "./runtimeOverviewCache";
import type { ServiceRecoveryAction } from "./serviceRecoveryModel";
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
import { assistantDisplayMarkdown } from "./messageDisplay";
import {
  ComposerCapabilityPalette,
  type ComposerSelection
} from "./ComposerCapabilityPalette";
import {
  buildRunDetailViewModel,
  type ScopedRunDetailItem
} from "./runDetailModel";
import type {
  OplContributionAction,
  OplUiContribution,
  OplUiContributionCommand,
  OplUiContributionsProjection,
  RenderOplContributionSlot
} from "../composition/contributionProjection";
import { groupSettingsContributions, settingsContributionDestination } from "../composition/contributionProjection";
import { createOplContributionActionRequest } from "../composition/contributionProjection";
import type { OplAgentPermission, OplSetupOperationResult, OplStudioPrimaryView, RenderOplStudioShell } from "../composition/oplStudioSurface";
import type { OplStudioDetailTab } from "../composition/clientCordis";
import { CodexServerRequestPanel } from "./CodexServerRequestPanel";
import { WorkspaceFilesPanel } from "./WorkspaceFilesPanel";
import { ProjectProgressPanel } from "./ProjectProgressPanel";
import { selectProjectProgress } from "./projectProgress";

type ContextTabId = OplStudioDetailTab["id"];
type FilesDetailView = "workspace" | "inputs" | "results";

type StartupReadStatus = "loading" | "ready" | "error" | "timeout";

type StartupReadinessStage = {
  id: "app-state-and-agents" | "conversations" | "models" | "capabilities";
  label: string;
  status: StartupReadStatus;
  detail?: string;
};

const managedUpdateActionSpecs = [
  {
    actionId: "settings_check_opl_base_update",
    operation: "check",
    componentIds: ["opl_base"],
    confirmationRequired: false,
    labels: ["检查 OPL Base 更新", "Check OPL Base update"]
  },
  {
    actionId: "settings_apply_opl_base_update",
    operation: "apply",
    componentIds: ["opl_base"],
    confirmationRequired: true,
    labels: ["更新 OPL Base", "Update OPL Base"]
  },
  {
    actionId: "settings_apply_opl_packages",
    operation: "apply",
    componentIds: ["opl_packages"],
    confirmationRequired: true,
    labels: ["更新能力包", "Update packages"]
  }
] as const;

const initializationActionIds = new Set([
  "workspace_root_set",
  "codex_install",
  "gateway_account_complete_setup",
  "gateway_account_use_for_model_access"
]);

type ProjectedManagedUpdateAction = {
  actionId: string;
  label: string;
  payloadFields: string[];
  confirmationRequired: boolean;
  dryRunSupported: boolean;
};

type ProjectedSetupAction = {
  actionId: "workspace_root_set" | "codex_install";
  payloadFields: string[];
  confirmationRequired: boolean;
  dryRunSupported: boolean;
};

type ProjectedManifestInstallAction = {
  actionId: string;
  payloadFields: string[];
  confirmationRequired: boolean;
  dryRunSupported: boolean;
};

function appStateActionRecords(state: unknown): Record<string, unknown>[] {
  const root = typeof state === "object" && state !== null && !Array.isArray(state)
    ? state as Record<string, unknown>
    : null;
  const first = typeof root?.app_state === "object" && root.app_state !== null && !Array.isArray(root.app_state)
    ? root.app_state as Record<string, unknown>
    : root;
  const appState = typeof first?.app_state === "object" && first.app_state !== null && !Array.isArray(first.app_state)
    ? first.app_state as Record<string, unknown>
    : first;
  return Array.isArray(appState?.actions)
    ? appState.actions.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value))
    : [];
}

export function readProjectedManagedUpdateActions(state: unknown): ProjectedManagedUpdateAction[] {
  return appStateActionRecords(state).flatMap((action): ProjectedManagedUpdateAction[] => {
    const actionId = typeof action.action_id === "string" ? action.action_id.trim() : "";
    const spec = managedUpdateActionSpecs.find((candidate) => candidate.actionId === actionId);
    if (!spec) return [];
    const payloadFields = Array.isArray(action.payload_fields)
      ? action.payload_fields.filter((field): field is string => typeof field === "string" && Boolean(field.trim()))
      : [];
    return [{
      actionId,
      label: typeof action.label === "string" && action.label.trim() ? action.label : actionId,
      payloadFields,
      confirmationRequired: spec.confirmationRequired || action.confirmation_required === true,
      dryRunSupported: action.dry_run_supported === true
    }];
  });
}

export function readProjectedSetupActions(state: unknown): ProjectedSetupAction[] {
  const supported = new Set<ProjectedSetupAction["actionId"]>(["workspace_root_set", "codex_install"]);
  return appStateActionRecords(state).flatMap((action): ProjectedSetupAction[] => {
    const actionId = typeof action.action_id === "string" ? action.action_id.trim() : "";
    if (!supported.has(actionId as ProjectedSetupAction["actionId"])) return [];
    return [{
      actionId: actionId as ProjectedSetupAction["actionId"],
      payloadFields: Array.isArray(action.payload_fields)
        ? action.payload_fields.filter((field): field is string => typeof field === "string" && Boolean(field.trim()))
        : [],
      confirmationRequired: action.confirmation_required === true,
      dryRunSupported: action.dry_run_supported === true
    }];
  });
}

export function readProjectedManifestInstallAction(state: unknown): ProjectedManifestInstallAction | undefined {
  return appStateActionRecords(state).flatMap((action): ProjectedManifestInstallAction[] => {
    if (action.action_id !== "install_from_manifest_url") return [];
    const payloadFields = Array.isArray(action.payload_fields)
      ? action.payload_fields.filter((field): field is string => typeof field === "string" && Boolean(field.trim()))
      : [];
    if (!payloadFields.includes("manifest_url") || !payloadFields.includes("trust_tier")) return [];
    return [{
      actionId: action.action_id,
      payloadFields,
      confirmationRequired: action.confirmation_required === true,
      dryRunSupported: action.dry_run_supported === true
    }];
  })[0];
}

function dockerDiagnosticFromReceipt(receipt: OplActionReceipt): SettingsDockerDiagnostic | null {
  const root = typeof receipt.stdoutJson === "object" && receipt.stdoutJson !== null && !Array.isArray(receipt.stdoutJson)
    ? receipt.stdoutJson as Record<string, unknown>
    : null;
  const execution = typeof root?.app_action_execution === "object" && root.app_action_execution !== null && !Array.isArray(root.app_action_execution)
    ? root.app_action_execution as Record<string, unknown>
    : null;
  const result = typeof execution?.result === "object" && execution.result !== null && !Array.isArray(execution.result)
    ? execution.result as Record<string, unknown>
    : null;
  const doctor = typeof result?.docker_webui_doctor === "object" && result.docker_webui_doctor !== null && !Array.isArray(result.docker_webui_doctor)
    ? result.docker_webui_doctor as Record<string, unknown>
    : null;
  if (!doctor) return null;
  const diagnosticSummary = typeof doctor.diagnostic_summary === "object" && doctor.diagnostic_summary !== null && !Array.isArray(doctor.diagnostic_summary)
    ? doctor.diagnostic_summary as Record<string, unknown>
    : null;
  const summary = typeof doctor.summary === "object" && doctor.summary !== null && !Array.isArray(doctor.summary)
    ? doctor.summary as Record<string, unknown>
    : null;
  const startupState = typeof doctor.startup_state === "object" && doctor.startup_state !== null && !Array.isArray(doctor.startup_state)
    ? doctor.startup_state as Record<string, unknown>
    : null;
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value : undefined;
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
  return {
    status: text(doctor.status) ?? text(diagnosticSummary?.status) ?? "unknown",
    ...(number(summary?.attention_count) !== undefined ? { attentionCount: number(summary?.attention_count) } : {}),
    ...(text(startupState?.phase) ? { startupPhase: text(startupState?.phase) } : {}),
    ...(text(diagnosticSummary?.docker_runtime_status) ? { dockerRuntimeStatus: text(diagnosticSummary?.docker_runtime_status) } : {}),
    ...(text(diagnosticSummary?.browser_url_status) ? { browserUrlStatus: text(diagnosticSummary?.browser_url_status) } : {}),
    ...(text(diagnosticSummary?.startup_maintenance_status) ? { startupMaintenanceStatus: text(diagnosticSummary?.startup_maintenance_status) } : {})
  };
}

const assistantMarkdownLinkSafety = { enabled: false } as const;
const assistantMarkdownControls = {
  code: { copy: true, download: false },
  table: true,
  mermaid: true
} as const;

function threadRuntimeStatusLabel(status: string | undefined, locale: "zh" | "en") {
  const labels: Record<string, [string, string]> = {
    unloaded: ["未加载", "Not loaded"],
    notLoaded: ["未加载", "Not loaded"],
    idle: ["空闲", "Idle"],
    running: ["运行中", "Running"],
    paused: ["已暂停", "Paused"],
    delivered: ["已交付", "Delivered"],
    delivered_paused: ["已交付，自动暂停", "Delivered and paused"],
    completed: ["已完成", "Completed"],
    stopped: ["已停止", "Stopped"],
    failed: ["运行失败", "Failed"],
    system_error: ["运行异常", "System error"],
    systemError: ["运行异常", "System error"]
  };
  const label = status ? labels[status] : undefined;
  return label ? label[locale === "zh" ? 0 : 1] : status ?? (locale === "zh" ? "未启动" : "Not started");
}

const uiCopy = {
  zh: {
    newTask: "新建任务",
    scheduled: "已安排",
    agents: "智能体与能力",
    chat: "聊天",
    projects: "项目",
    local: "本地",
    projectContext: "项目上下文",
    filesOutputs: "文件与结果",
    settings: "设置",
    openSettings: "打开设置",
    hideSidebar: "隐藏侧边栏",
    showSidebar: "显示侧边栏",
    conversationMenu: "对话菜单",
    refreshContext: "刷新项目上下文",
    backToChat: "返回聊天",
    previewExport: "预览导出操作",
    openEnvironment: "打开环境信息",
    closeEnvironment: "关闭环境信息",
    newTaskTitle: "新任务",
    emptyTitle: "想从哪里开始？",
    emptyDescription: (project: string) => `已选择 ${project}。OPL 会在任务需要时使用该项目的上下文。`,
    prompt: "让 OPL 审阅、撰写、导出，或启动专业工作流",
    attachFiles: "添加文件",
    agentPermissions: "Agent 权限",
    fullAccess: "完全访问",
    workspaceAccess: "工作区访问",
    readOnlyAccess: "只读",
    working: "正在工作",
    running: "运行中",
    retry: "重试",
    send: "发送",
    sendFailed: "发送失败，请重试。",
    modelSelectionUnavailable: "所选固定模型当前不可用，请选择自动或其他模型。",
    high: "高",
    standard: "标准",
    you: "你",
    assistant: "One Person Lab",
    runtime: "运行时",
    codexWorking: "Codex 正在处理...",
    waitingReply: "等待回复。",
    openPreview: "打开预览",
    currentPreview: "当前预览",
    environment: "环境信息",
    environmentStatus: "当前项目的来源、结果、操作、工作流与运行环境。",
    backEnvironment: "返回环境信息",
    close: "关闭",
    refresh: "刷新",
    sources: "来源",
    sourcesDescription: "项目输入、资料和 refs-only 上下文",
    results: "结果与文件",
    resultsDescription: "交付物、附件和内容预览",
    actions: "操作与回执",
    actionsDescription: "预览、确认、执行回执和回滚入口",
    workflows: "工作流",
    workflowsDescription: "OPL 专业智能体的任务启动器",
    packages: "智能体与能力包",
    packagesDescription: "能力包、安装状态和可用入口",
    runtimeMenu: "运行环境",
    runtimeDescription: "Codex、OPL App bridge 和本地状态",
    settingsRuntime: "运行状态",
    stateProfile: "状态配置",
    contextState: "上下文状态",
    refreshState: "立即刷新状态",
    defaultLabel: "默认值",
    on: "开",
    off: "关",
    previewAction: "预览操作",
    executeConfirmed: "确认并执行",
    previewRollback: "预览回滚",
    actionReceipts: "操作回执",
    workflowStarters: "工作流启动器",
    previewFirst: "先预览，再确认",
    previewReceipt: "预览回执",
    unavailable: "不可用",
    previewWorkflow: "预览工作流",
    agentPackages: "智能体能力包",
    readbackOnly: "仅读取",
    fullDrilldown: "查看完整状态",
    deliverables: "交付结果",
    recentRefs: "最近的引用与回执",
    stateProfileHelp: "控制项目状态读取的详细程度。",
    noReadbackTimestamp: "暂无状态读取时间。",
    sourcesBoundary: "由 OPL App state/action 合同提供的 refs-only 界面。",
    traceAndActions: "追踪与操作",
    traceBoundary: "仅显示来源、回执、重放和导出引用，不复制产物正文。",
    appRootRefs: "仅 App/root 引用",
    packageBoundary: "能力包状态和操作来自 App/root 合同；缺少 bridge 或只存在旧模块回退时保持预览或不可用。",
    search: "搜索",
    filterTags: "筛选标签",
    runtimeNoAuthority: "这里不持有领域正文或产物正文。",
    skills: "技能",
    skillsBoundary: "仅显示 Codex Skill 引用，不持有领域权威。",
    routing: "路由",
    routingBoundary: "路由建议继续作为 App 所有的引用和预览操作。",
    memory: "记忆",
    memoryBoundary: "仅显示记忆引用，不持有记忆正文真相。",
    alwaysOn: "常驻上下文",
    alwaysOnBoundary: "常驻上下文只汇总为引用、回执和下一步操作。",
    workflowRun: "工作流运行",
    workflowSteps: ["规划", "检索", "起草", "验证", "完成"],
    receipt: "回执",
    projectGroup: "项目",
    executionGroup: "执行",
    systemGroup: "系统",
    stateLoading: "载入中",
    stateReady: "已连接",
    stateError: "不可用",
    scheduledDescription: "计划任务和自动运行引用",
    memoryDescription: "当前项目的记忆引用与边界",
    alwaysOnDescription: "常驻上下文、回执和下一步"
  },
  en: {
    newTask: "New task",
    scheduled: "Scheduled",
    agents: "Agents & Capabilities",
    chat: "Chat",
    projects: "Projects",
    local: "Local",
    projectContext: "Project context",
    filesOutputs: "Files & outputs",
    settings: "Settings",
    openSettings: "Open settings",
    hideSidebar: "Hide sidebar",
    showSidebar: "Show sidebar",
    conversationMenu: "Conversation menu",
    refreshContext: "Refresh project context",
    backToChat: "Back to chat",
    previewExport: "Preview export action",
    openEnvironment: "Open environment details",
    closeEnvironment: "Close environment details",
    newTaskTitle: "New task",
    emptyTitle: "What should we work on?",
    emptyDescription: (project: string) => `${project} is selected. OPL will use its project context only when the task needs it.`,
    prompt: "Ask OPL to review, draft, export, or start a workflow",
    attachFiles: "Attach files",
    agentPermissions: "Agent permissions",
    fullAccess: "Full access",
    workspaceAccess: "Workspace access",
    readOnlyAccess: "Read only",
    working: "Working",
    running: "Running",
    retry: "Retry",
    send: "Send",
    sendFailed: "Message could not be sent. Please retry.",
    modelSelectionUnavailable: "The selected fixed model is unavailable. Choose Auto or another model.",
    high: "High",
    standard: "Standard",
    you: "You",
    assistant: "One Person Lab",
    runtime: "Runtime",
    codexWorking: "Codex is working...",
    waitingReply: "Waiting for reply.",
    openPreview: "Open preview",
    currentPreview: "Current preview",
    environment: "Environment",
    environmentStatus: "Sources, results, actions, workflows, and runtime for the current project.",
    backEnvironment: "Back to Environment",
    close: "Close",
    refresh: "Refresh",
    sources: "Sources",
    sourcesDescription: "Project inputs, materials, and refs-only context",
    results: "Results & files",
    resultsDescription: "Deliverables, attachments, and content previews",
    actions: "Actions & receipts",
    actionsDescription: "Preview, confirmation, receipts, and rollback",
    workflows: "Workflows",
    workflowsDescription: "Task starters for OPL professional agents",
    packages: "Agents & packages",
    packagesDescription: "Capability packages, install state, and entry points",
    runtimeMenu: "Runtime",
    runtimeDescription: "Codex, OPL App bridge, and local state",
    settingsRuntime: "Runtime readback",
    stateProfile: "State profile",
    contextState: "Context state",
    refreshState: "Refresh state now",
    defaultLabel: "Default",
    on: "on",
    off: "off",
    previewAction: "Preview action",
    executeConfirmed: "Execute confirmed",
    previewRollback: "Preview rollback",
    actionReceipts: "Action receipts",
    workflowStarters: "Workflow starters",
    previewFirst: "Preview first, then confirm",
    previewReceipt: "Preview receipt",
    unavailable: "Unavailable",
    previewWorkflow: "Preview workflow",
    agentPackages: "Agent packages",
    readbackOnly: "Readback only",
    fullDrilldown: "Full drilldown",
    deliverables: "Deliverables",
    recentRefs: "Recent refs and receipts",
    stateProfileHelp: "Controls the level of detail used for project state reads.",
    noReadbackTimestamp: "No current readback timestamp.",
    sourcesBoundary: "Refs-only surface backed by OPL App state/action contracts.",
    traceAndActions: "Trace and actions",
    traceBoundary: "Source, receipt, replay, and export refs without artifact bodies.",
    appRootRefs: "App/root refs only",
    packageBoundary: "Package status and actions come from App/root contracts. Missing bridge or legacy module fallback stays preview/unavailable.",
    search: "Search",
    filterTags: "Filter tags",
    runtimeNoAuthority: "No domain body or artifact body is owned here.",
    skills: "Skills",
    skillsBoundary: "Codex Skill references only; no domain authority is owned here.",
    routing: "Routing",
    routingBoundary: "Route suggestions remain App-owned refs and preview actions.",
    memory: "Memory",
    memoryBoundary: "Memory refs are shown without owning memory body truth.",
    alwaysOn: "Always-on context",
    alwaysOnBoundary: "Always-on context is summarized as refs, receipts, and next actions.",
    workflowRun: "Workflow run",
    workflowSteps: ["Plan", "Retrieve", "Draft", "Validate", "Complete"],
    receipt: "Receipt",
    projectGroup: "Project",
    executionGroup: "Execution",
    systemGroup: "System",
    stateLoading: "Loading",
    stateReady: "Connected",
    stateError: "Unavailable",
    scheduledDescription: "Scheduled task and automation refs",
    memoryDescription: "Memory refs and boundaries for this project",
    alwaysOnDescription: "Persistent context, receipts, and next actions"
  }
} as const;

const exportActionRefId = "task_export_bundle_preview";
const standardAgentSeatPresentationZh: Record<string, { name: string; order: number }> = {
  mas: { name: "医学科研", order: 10 },
  mag: { name: "医学基金", order: 20 },
  rca: { name: "汇报展示", order: 30 },
  obf: { name: "书籍写作", order: 40 },
  oma: { name: "智能演进", order: 50 }
};
const emptyCapabilityCatalog: CodexCapabilityCatalog = {
  source: "bridge_unavailable",
  skills: [],
  plugins: [],
  apps: [],
  errors: []
};
const legacyChatSessionsStorageKey = "opl.nativeWorkbench.chatSessions.v1";
const legacyChatSessionsBackupKey = "opl.studio.chatSessions.legacyReadOnlyBackup.v1";
const legacyChatSessionsBackupStorageKey = "opl.nativeWorkbench.chatSessions.legacyReadOnlyBackup.v1";
const uiMetadataStorageKey = "opl_ui_metadata.v1";
const legacyStudioUiMetadataStorageKey = "opl.studio.uiMetadata.v2";
const legacyUiMetadataStorageKey = "opl.nativeWorkbench.uiMetadata.v2";
const draftStorageKey = "opl.studio.drafts.v2";
const legacyDraftStorageKey = "opl.nativeWorkbench.drafts.v2";
const defaultSidebarWidth = 236;
const minimumSidebarWidth = 200;
const maximumSidebarWidth = 420;

type ThreadScope = "current" | "all" | "archived";

type WorkbenchUiMetadata = {
  schema: "opl_ui_metadata.v1";
  selectedProjectId?: string;
  selectedThreadId?: string;
  threadAffinityById: Record<string, string>;
  workspaceLabels: Record<string, string>;
  hiddenWorkspaceIds: string[];
  workspaceOrder: string[];
  threadOrderByProject: Record<string, string[]>;
  pinnedThreadIds: string[];
  threadScope: ThreadScope;
  sidebarWidth: number;
  recentWorkspace?: string;
  theme?: string;
  language?: "zh" | "en";
  layout?: "default";
};

type WorkbenchDrafts = {
  prompts: Record<string, string>;
};

function formatReceipt(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function contributionReceiptForDisplay(entry: OplUiContribution, receipt: OplActionReceipt): OplActionReceipt | Record<string, unknown> {
  if (entry.view?.viewType !== "remote_companion_access") return receipt;
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

function firstPreviewAction(actions: WorkbenchActionRef[]): WorkbenchActionRef | undefined {
  return actions.find((action) => action.dryRunSupported && action.payloadFields.length === 0)
    ?? actions.find((action) => action.dryRunSupported);
}

function createIntroMessages(): ChatMessage[] {
  return [];
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

function sessionStorage() {
  return globalThis.localStorage;
}

function clampSidebarWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultSidebarWidth;
  return Math.min(maximumSidebarWidth, Math.max(minimumSidebarWidth, Math.round(value)));
}

function readPersistedWorkbenchUi(): { metadata: WorkbenchUiMetadata; drafts: WorkbenchDrafts } {
  const storage = sessionStorage();
  const fallback = {
    metadata: {
      schema: "opl_ui_metadata.v1" as const,
      threadAffinityById: {},
      workspaceLabels: {},
      hiddenWorkspaceIds: [],
      workspaceOrder: [],
      threadOrderByProject: {},
      pinnedThreadIds: [],
      threadScope: "all" as const,
      sidebarWidth: defaultSidebarWidth,
      layout: "default" as const
    },
    drafts: { prompts: {} }
  };
  if (!storage) return fallback;
  try {
    const migratedMetadata = migrateStorageValue(storage, uiMetadataStorageKey, legacyStudioUiMetadataStorageKey)
      ?? migrateStorageValue(storage, uiMetadataStorageKey, legacyUiMetadataStorageKey);
    const metadata = JSON.parse(migratedMetadata ?? "null") as Partial<WorkbenchUiMetadata> | null;
    const drafts = JSON.parse(migrateStorageValue(storage, draftStorageKey, legacyDraftStorageKey) ?? "null") as Partial<WorkbenchDrafts> | null;
    migrateStorageValue(storage, legacyChatSessionsBackupKey, legacyChatSessionsBackupStorageKey);
    const legacy = storage.getItem(legacyChatSessionsStorageKey);
    let selectedThreadId = typeof metadata?.selectedThreadId === "string" ? metadata.selectedThreadId : undefined;
    if (legacy) {
      if (!storage.getItem(legacyChatSessionsBackupKey)) storage.setItem(legacyChatSessionsBackupKey, legacy);
      if (!selectedThreadId) {
        const legacyRows = JSON.parse(legacy) as unknown;
        const first = Array.isArray(legacyRows) && legacyRows[0] && typeof legacyRows[0] === "object"
          ? legacyRows[0] as { threadId?: unknown }
          : null;
        selectedThreadId = typeof first?.threadId === "string" ? first.threadId : undefined;
      }
      storage.removeItem(legacyChatSessionsStorageKey);
    }
    return {
      metadata: {
        schema: "opl_ui_metadata.v1",
        selectedProjectId: typeof metadata?.selectedProjectId === "string" ? metadata.selectedProjectId : undefined,
        selectedThreadId,
        threadAffinityById: metadata?.threadAffinityById && typeof metadata.threadAffinityById === "object" ? metadata.threadAffinityById as Record<string, string> : {},
        workspaceLabels: metadata?.workspaceLabels && typeof metadata.workspaceLabels === "object" ? metadata.workspaceLabels as Record<string, string> : {},
        hiddenWorkspaceIds: Array.isArray(metadata?.hiddenWorkspaceIds) ? metadata.hiddenWorkspaceIds.filter((item): item is string => typeof item === "string") : [],
        workspaceOrder: Array.isArray(metadata?.workspaceOrder) ? metadata.workspaceOrder.filter((item): item is string => typeof item === "string") : [],
        threadOrderByProject: metadata?.threadOrderByProject && typeof metadata.threadOrderByProject === "object" ? metadata.threadOrderByProject as Record<string, string[]> : {},
        pinnedThreadIds: Array.isArray(metadata?.pinnedThreadIds) ? metadata.pinnedThreadIds.filter((item): item is string => typeof item === "string") : [],
        threadScope: metadata?.threadScope === "archived" ? "archived" : "all",
        sidebarWidth: clampSidebarWidth(metadata?.sidebarWidth),
        recentWorkspace: typeof metadata?.recentWorkspace === "string" ? metadata.recentWorkspace : undefined,
        theme: typeof metadata?.theme === "string" ? metadata.theme : undefined,
        language: metadata?.language === "en" ? "en" : metadata?.language === "zh" ? "zh" : undefined,
        layout: "default"
      },
      drafts: {
        prompts: drafts?.prompts && typeof drafts.prompts === "object" ? drafts.prompts : {}
      }
    };
  } catch {
    return fallback;
  }
}

function writeUiMetadata(metadata: WorkbenchUiMetadata) {
  sessionStorage()?.setItem(uiMetadataStorageKey, JSON.stringify(metadata));
}

function writeDrafts(drafts: WorkbenchDrafts) {
  sessionStorage()?.setItem(draftStorageKey, JSON.stringify(drafts));
}

function eventMethod(event: unknown): string {
  if (typeof event === "object" && event && "method" in event && typeof (event as { method?: unknown }).method === "string") {
    return (event as { method: string }).method;
  }
  if (typeof event === "object" && event && "type" in event && typeof (event as { type?: unknown }).type === "string") {
    return (event as { type: string }).type;
  }
  return "";
}

function eventParams(event: unknown): Record<string, unknown> {
  return typeof event === "object" && event && "params" in event && typeof (event as { params?: unknown }).params === "object"
    ? ((event as { params: Record<string, unknown> }).params ?? {})
    : {};
}

function eventDelta(event: unknown): string {
  const params = eventParams(event);
  return typeof params.delta === "string" ? params.delta : "";
}

function eventCompletedText(event: unknown): string {
  const params = eventParams(event);
  const item = typeof params.item === "object" && params.item ? params.item as Record<string, unknown> : {};
  return typeof item.text === "string" ? item.text : "";
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
  const readDomainDetailView = useCallback(
    (request: DomainDetailViewReadRequest) => bridge.readDomainDetailView(request),
    [bridge]
  );
  const persistedUi = useMemo(() => readPersistedWorkbenchUi(), []);
  const cachedRuntime = useMemo(() => readRuntimeOverviewCache(), []);
  const conversationRef = useRef<HTMLElement | null>(null);
  const pendingAssistantIdRef = useRef<string | null>(null);
  const interruptRequestedForRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>(createIntroMessages());
  const activeTurnRef = useRef<{ threadId: string; turnId: string } | null>(null);
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
  } | null>(null);
  const [settingsActionBusyKey, setSettingsActionBusyKey] = useState<string | null>(null);
  const [settingsActionFeedback, setSettingsActionFeedback] = useState<SettingsActionFeedback | null>(null);
  const [dockerDiagnostic, setDockerDiagnostic] = useState<SettingsDockerDiagnostic | null>(null);
  const [settingsActionConfirmation, setSettingsActionConfirmation] = useState<SettingsActionConfirmation | null>(null);
  const [uiMetadata, setUiMetadata] = useState<WorkbenchUiMetadata>(persistedUi.metadata);
  const [drafts, setDrafts] = useState<WorkbenchDrafts>(persistedUi.drafts);
  const [prompt, setPrompt] = useState(persistedUi.drafts.prompts[persistedUi.metadata.selectedThreadId ?? "new"] ?? "");
  const [sendState, setSendState] = useState<"idle" | "running" | "error">("idle");
  const [threadProjects, setThreadProjects] = useState<WorkbenchProjectGroup[]>([]);
  const [archivedThreadProjects, setArchivedThreadProjects] = useState<WorkbenchProjectGroup[]>([]);
  const [threadDirectoryStatus, setThreadDirectoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [threadDirectoryError, setThreadDirectoryError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(createIntroMessages());
  const [eventFeed, setEventFeed] = useState<string[]>(["bridge.preview_only"]);
  const [codexThreadId, setCodexThreadId] = useState<string | undefined>(persistedUi.metadata.selectedThreadId);
  const [threadDetail, setThreadDetail] = useState<WorkbenchThreadItem | null>(null);
  const [threadActionBusy, setThreadActionBusy] = useState(false);
  const [threadActionError, setThreadActionError] = useState("");
  const [lifecycleConfirmation, setLifecycleConfirmation] = useState<{ thread: WorkbenchThreadItem; action: ThreadLifecycleAction } | null>(null);
  const [settings, setSettings] = useState<WorkbenchSettings>(() => readSettings());
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
  const [selectedAgent, setSelectedAgent] = useState<AgentPackageSelectionIntent | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [serviceRecoveryBusy, setServiceRecoveryBusy] = useState(false);
  const [serviceRecoveryFeedback, setServiceRecoveryFeedback] = useState<{
    tone: "success" | "attention";
    message: string;
  } | null>(null);
  const [ephemeralQueue, setEphemeralQueue] = useState<EphemeralQueueItem[]>([]);
  const [composerSubmissionError, setComposerSubmissionError] = useState("");
  const [threadInputFiles, setThreadInputFiles] = useState<Record<string, WorkbenchArtifactRef[]>>({});
  const [pendingInputFiles, setPendingInputFiles] = useState<WorkbenchArtifactRef[]>([]);
  const [activeContextTab, setActiveContextTab] = useState<ContextTabId>(detailTabs[0]?.id ?? "opl-project-progress-panel");
  const [activeFilesView, setActiveFilesView] = useState<FilesDetailView>("workspace");
  const [artifactPreviewOpen, setArtifactPreviewOpen] = useState(false);
  const [primaryView, setPrimaryView] = useState<OplStudioPrimaryView>("conversation");
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [startupTimedOut, setStartupTimedOut] = useState(false);
  const [startupGateOpen, setStartupGateOpen] = useState(false);
  const t = uiCopy[settings.locale];
  const normalizedCapabilityQuery = capabilityQuery.trim().toLowerCase();
  const capabilityGroups = [
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
  const defaultWorkItemId = model.activeProjectLines.find((line) => line.status === "running")?.activeRunId
    ?? model.activeProjectLines[0]?.activeRunId
    ?? undefined;
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
  const startupStages: StartupReadinessStage[] = [
    {
      id: "app-state-and-agents",
      label: settings.locale === "zh" ? "应用状态与智能体" : "App state and Agents",
      status: stateStatus === "loading" && startupTimedOut ? "timeout" : stateStatus,
      ...(stateError ? { detail: stateError } : {})
    },
    {
      id: "conversations",
      label: settings.locale === "zh" ? "对话" : "Conversations",
      status: threadDirectoryStatus === "loading" && startupTimedOut ? "timeout" : threadDirectoryStatus,
      ...(threadDirectoryError ? { detail: threadDirectoryError } : {})
    },
    {
      id: "models",
      label: settings.locale === "zh" ? "模型" : "Models",
      status: modelCatalogStatus === "loading" && startupTimedOut ? "timeout" : modelCatalogStatus,
      ...(modelCatalogError ? { detail: modelCatalogError } : {})
    },
    {
      id: "capabilities",
      label: settings.locale === "zh" ? "Skill、Plugin 与 App" : "Skills, plugins, and apps",
      status: (capabilityStatus === "idle" || capabilityStatus === "loading") && startupTimedOut
        ? "timeout"
        : capabilityStatus === "idle" ? "loading" : capabilityStatus,
      ...(capabilityError ? { detail: capabilityError } : {})
    }
  ];
  const startupReadyCount = startupStages.filter((stage) => stage.status === "ready").length;
  const startupHasFailure = startupStages.some((stage) => stage.status === "error" || stage.status === "timeout");
  const startupAllReady = startupReadyCount === startupStages.length;
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
    ephemeralQueueRef.current = ephemeralQueue;
  }, [ephemeralQueue]);

  useEffect(() => {
    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && media?.matches === true);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      document.body.toggleAttribute("data-ds-dark-theme", dark);
    };
    applyTheme();
    if (settings.theme !== "system" || !media) return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [settings.theme]);

  useEffect(() => {
    if (!codexThreadId || !messages.length) return;
    globalThis.requestAnimationFrame?.(() => {
      const conversation = conversationRef.current;
      if (conversation) conversation.scrollTop = conversation.scrollHeight;
    });
  }, [codexThreadId, messages.length]);

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
    setPrompt(value);
    const key = codexThreadId ?? "new";
    updateDrafts((current) => ({ ...current, prompts: { ...current.prompts, [key]: value } }));
  }

  function loadState(profile = settings.runtimeProfile) {
    setStateStatus("loading");
    setStateError("");
    return bridge
      .readState(profile)
      .then((state) => {
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
    if (receipt.status === "executed") {
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
    return {
      tone: "attention",
      message: receipt.blockedReason || receipt.stderr || (settings.locale === "zh" ? `${label}未完成。` : `${label} did not complete.`)
    };
  }

  async function runSettingsAction(request: SettingsActionRequest) {
    setSettingsActionBusyKey(request.key);
    setSettingsActionFeedback(null);
    try {
      if (request.previewOnly) {
        const preview = await bridge.executeAction({ actionId: request.actionId, payload: request.payload, dryRun: true });
        setSettingsActionFeedback(settingsReceiptFeedback(preview, request.label));
        return;
      }
      if (request.confirmationRequired) {
        if (request.dryRunSupported === false) {
          setSettingsActionConfirmation({ request, previewStatus: "confirmation_required" });
          return;
        }
        const preview = await bridge.executeAction({ actionId: request.actionId, payload: request.payload, dryRun: true });
        if (preview.status === "error" || preview.status === "timed_out") {
          setSettingsActionFeedback(settingsReceiptFeedback(preview, request.label));
          return;
        }
        setSettingsActionConfirmation({ request, previewStatus: preview.status });
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
      if (diagnostic) setDockerDiagnostic(diagnostic);
      if (receipt.status === "executed") {
        captureManagedUpdateReceipt(receipt);
        if (request.actionId === "settings_diagnose_docker_webui") {
          // The doctor is a receipt-only read; its result is already authoritative
          // for this check and does not require a second full App-state read.
        } else if (model.managedCompanions.some((companion) => companion.actions.some((action) => action.actionId === request.actionId))) await loadState("full");
        else await loadState(settings.runtimeProfile);
        if (initializationActionIds.has(request.actionId)) await loadInitialize();
      }
      setSettingsActionFeedback(diagnostic ? {
        tone: diagnostic.status === "attention" || (diagnostic.attentionCount ?? 0) > 0 ? "attention" : "success",
        message: settings.locale === "zh"
          ? `诊断完成${diagnostic.attentionCount ? `，发现 ${diagnostic.attentionCount} 项需要处理` : "，未发现需要处理的项目"}。`
          : `Diagnostics completed${diagnostic.attentionCount ? ` with ${diagnostic.attentionCount} item(s) requiring attention` : " with no items requiring attention"}.`
      } : settingsReceiptFeedback(receipt, request.label));
    } catch (error) {
      setSettingsActionFeedback({ tone: "attention", message: String(error) });
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
        payload: { ...confirmation.request.payload, confirmed: true },
        dryRun: false
      });
      if (receipt.status === "executed") {
        captureManagedUpdateReceipt(receipt);
        if (model.managedCompanions.some((companion) => companion.actions.some((action) => action.actionId === confirmation.request.actionId))) await loadState("full");
        else await loadState(settings.runtimeProfile);
        if (initializationActionIds.has(confirmation.request.actionId)) await loadInitialize();
      }
      setSettingsActionFeedback(settingsReceiptFeedback(receipt, confirmation.request.label));
      setSettingsActionConfirmation(null);
    } catch (error) {
      setSettingsActionFeedback({ tone: "attention", message: String(error) });
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
    setSettingsActionBusyKey(key);
    setSettingsActionFeedback(null);
    try {
      const result = await bridge.configureCodexApiKey({ apiKey });
      if (!result.ok) {
        setSettingsActionFeedback({ tone: "attention", message: result.errorCode });
        return false;
      }
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
        message: settings.locale === "zh" ? "模型访问配置失败，密钥没有保存在 Studio 中。" : "Model access setup failed; the key was not stored by Studio."
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
        message: result.errorCode ?? (settings.locale === "zh" ? "登录失败。" : "Login failed.")
      });
      return false;
    } catch (error) {
      setSettingsActionFeedback({ tone: "attention", message: String(error) });
      return false;
    } finally {
      setSettingsActionBusyKey(null);
    }
  }

  async function openThread(thread: WorkbenchThreadItem): Promise<string | null> {
    setPrimaryView("conversation");
    setSelectedRuntimeWorkItemId(undefined);
    setThreadActionBusy(true);
    setThreadActionError("");
    setCodexThreadId(thread.id);
    const affinityProjectId = threadProjects.find((project) => project.threads.some((item) => item.id === thread.id))?.id;
    updateUiMetadata({
      selectedThreadId: thread.id,
      selectedProjectId: affinityProjectId
        ?? uiMetadata.selectedProjectId
    });
    rememberThreadAffinity(thread.id, affinityProjectId);
    setPrompt(drafts.prompts[thread.id] ?? "");
    activeTurnRef.current = null;
    setActiveTurnId(null);
    setSendState("idle");
    setComposerSelections([]);
    setComposerPaletteOpen(false);
    try {
      const readback = await bridge.readThread({ threadId: thread.id, includeTurns: true });
      const nextMessages = deriveThreadMessages(readback);
      const readbackThreadId = readback.id || thread.id;
      const readbackTurnId = readback.activeTurnId;
      activeTurnRef.current = readbackTurnId ? { threadId: readbackThreadId, turnId: readbackTurnId } : null;
      setActiveTurnId(readbackTurnId ?? null);
      setSendState(readbackTurnId ? "running" : "idle");
      setMessages(nextMessages);
      messagesRef.current = nextMessages;
      setThreadDetail(null);
      return null;
    } catch (error) {
      const message = String(error);
      setThreadActionError(message);
      return message;
    } finally {
      setThreadActionBusy(false);
    }
  }

  async function runServiceRecoveryAction(action: ServiceRecoveryAction) {
    setServiceRecoveryBusy(true);
    setServiceRecoveryFeedback(null);
    try {
      const refreshedModel = await loadState(settings.runtimeProfile);
      const refreshedRecovery = refreshedModel?.serviceRecovery;
      if (
        !refreshedRecovery
        || refreshedRecovery.primaryAction?.actionId !== action.actionId
        || refreshedRecovery.primaryAction.mutates !== action.mutates
        || (action.mutates && refreshedRecovery.mutationGuard.allowed === false)
      ) {
        setServiceRecoveryFeedback({
          tone: "attention",
          message: settings.locale === "zh"
            ? "服务状态已经变化，请查看刷新后的恢复建议。"
            : "Service state changed; review the refreshed recovery action."
        });
        return;
      }
      const receipt = await bridge.executeAction({
        actionId: action.actionId,
        payload: { confirmed: true },
        dryRun: false
      });
      await loadState(settings.runtimeProfile);
      setServiceRecoveryFeedback({
        tone: receipt.status === "executed" ? "success" : "attention",
        message: receipt.status === "executed"
          ? (settings.locale === "zh" ? "恢复操作已完成，服务状态已重新读取。" : "Recovery completed and service state was re-read.")
          : (receipt.blockedReason ?? (settings.locale === "zh" ? "恢复操作未执行。" : "Recovery was not executed."))
      });
    } catch (error) {
      setServiceRecoveryFeedback({ tone: "attention", message: String(error) });
    } finally {
      setServiceRecoveryBusy(false);
    }
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
      if (openSavedThread && scope !== "archived" && selectedThreadId) {
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
    setStartupTimedOut(false);
    void Promise.all([
      loadState(settings.runtimeProfile),
      loadThreadDirectory(true),
      loadModels(),
      loadCapabilities(true)
    ]);
  }, [bridge, settings.runtimeProfile, startupAttempt]);

  useEffect(() => {
    if (startupGateOpen || startupAllReady) {
      if (startupAllReady && !startupGateOpen) setStartupGateOpen(true);
      return;
    }
    const timeout = globalThis.setTimeout(() => setStartupTimedOut(true), 20_000);
    return () => globalThis.clearTimeout(timeout);
  }, [startupAllReady, startupAttempt, startupGateOpen]);

  useEffect(() => {
    void loadInitialize();
  }, [bridge]);

  useEffect(() => () => onHostStateDispose?.(), [onHostStateDispose]);

  useEffect(() => {
    void bridge.readNativeAppUpdateStatus().then(setNativeAppUpdate).catch(() => setNativeAppUpdate(null));
  }, [bridge]);

  useEffect(() => bridge.subscribeEvents((event) => {
    const method = eventMethod(event);
    const params = eventParams(event);
    setEventFeed((items) => [formatEvent(event), ...items].slice(0, 8));
    if (method === "desktop/navigate" && (params.view === "conversation" || params.view === "runtime")) {
      setPrimaryView(params.view);
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
    if (method === "turn/started" && pendingAssistantIdRef.current) {
      const turn = typeof params.turn === "object" && params.turn ? params.turn as Record<string, unknown> : {};
      const threadId = typeof params.threadId === "string" ? params.threadId : "";
      const turnId = typeof turn.id === "string" ? turn.id : typeof params.turnId === "string" ? params.turnId : "";
      if (threadId && turnId) {
        activeTurnRef.current = { threadId, turnId };
        setActiveTurnId(turnId);
        setCodexThreadId(threadId);
        updateUiMetadata({ selectedThreadId: threadId });
      }
    }
    if (method === "turn/completed") {
      const completedTurnId = typeof params.turnId === "string"
        ? params.turnId
        : typeof params.turn === "object" && params.turn && "id" in params.turn
          ? String((params.turn as { id?: unknown }).id ?? "")
          : "";
      if (!completedTurnId || activeTurnRef.current?.turnId === completedTurnId) {
        activeTurnRef.current = null;
        setActiveTurnId(null);
      }
    }
    if (!pendingAssistantIdRef.current) return;
    if (method === "item/agentMessage/delta") {
      const delta = eventDelta(event);
      if (!delta) return;
      setMessages((items) => items.map((item) => item.id === pendingAssistantIdRef.current
        ? { ...item, role: "assistant", text: item.text + delta }
        : item));
      return;
    }
    if (method === "item/completed") {
      const completedText = eventCompletedText(event);
      if (!completedText) return;
      setMessages((items) => items.map((item) => item.id === pendingAssistantIdRef.current
        ? { ...item, role: "assistant", text: completedText }
        : item));
    }
  }), [bridge]);

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
    setContributionActionBusy(true);
    setContributionActionConfirmation(null);
    setActiveFilesView("results");
    requestDetails("opl-files-results-panel");
    try {
      const actionRequest = createOplContributionActionRequest(entry, command, confirmed);
      actionRequest.payload.input = input;
      const receipt = await bridge.executeAction(actionRequest);
      setLastDryRun(formatReceipt(contributionReceiptForDisplay(entry, receipt)));
      if (receipt.status === "executed") {
        await loadState(settings.runtimeProfile);
        setContributionRefreshRevision((revision) => revision + 1);
      }
    } catch (error) {
      setLastDryRun(formatReceipt({
        actionId: "package_contribution_execute",
        dryRun: false,
        error: String(error)
      }));
    } finally {
      setContributionActionBusy(false);
    }
  }
  const handleContributionAction: OplContributionAction = (entry, command, input = {}) => {
    if (!contributionActionAvailable) return;
    if (command.confirmationRequired) {
      setContributionActionConfirmation({ entry, command, input });
      return;
    }
    void executeContributionAction(entry, command, false, input);
  };
  const readContributionData = useCallback((entry: OplUiContributionsProjection["entries"][number], input: Record<string, unknown> = {}) => {
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
    setThreadActionBusy(true);
    setThreadActionError("");
    try {
      if (lifecycleConfirmation.action === "fork") {
        await bridge.forkThread({
          threadId: lifecycleConfirmation.thread.id,
          throughTurnId: lifecycleConfirmation.thread.activeTurnId
        });
      } else {
        await bridge.setArchived({
          threadId: lifecycleConfirmation.thread.id,
          archived: lifecycleConfirmation.action === "archive",
          confirmed: true,
          confirmationId: `opl-studio:${Date.now()}`
        });
      }
      setLifecycleConfirmation(null);
      setThreadDetail(null);
      if (lifecycleConfirmation.thread.id === codexThreadId && lifecycleConfirmation.action === "archive") startNewChat();
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

  function queuedItemFromComposer(text: string, selections: ComposerSelection[]): EphemeralQueueItem {
    return {
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      placement: "queued",
      preview: text || selections.map((selection) => selection.label).join(", "),
      text: text || null,
      prompt: text,
      inputs: selections.map((selection) => selection.input),
      selections
    };
  }

  async function steerQueuedItem(item: EphemeralQueueItem) {
    const active = activeTurnRef.current;
    if (!active) throw new Error(settings.locale === "zh" ? "当前运行尚未提供可插话的 Turn。" : "The current run has not exposed a steerable turn yet.");
    await bridge.steerTurn({
      threadId: active.threadId,
      expectedTurnId: active.turnId,
      prompt: item.prompt,
      inputs: item.inputs
    });
    replaceEphemeralQueue(ephemeralQueueRef.current.filter((candidate) => candidate.id !== item.id));
    const acceptedMessage: ChatMessage = {
      id: `user-steer-${Date.now()}`,
      role: "user",
      text: item.preview
    };
    messagesRef.current = messagesRef.current.concat(acceptedMessage);
    setMessages(messagesRef.current);
  }

  async function updateEphemeralQueue(itemId: string, action: { kind: string; content?: Array<{ type?: string; text?: string }> }) {
    const item = ephemeralQueueRef.current.find((candidate) => candidate.id === itemId);
    if (!item) return;
    if (action.kind === "remove") {
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
    const requested = new Set([...selectedAgent.requiredSkillIds, selectedAgent.route.codexVisibleEntry].map((value) => value.toLowerCase()));
    return capabilityCatalog.skills
      .filter((skill) => skill.enabled && requested.has(skill.name.toLowerCase()))
      .map((skill) => ({ type: "skill" as const, name: skill.name, path: skill.path }));
  }

  function sendCodexMessage(modeOrEvent?: ComposerSubmitMode | FormEvent) {
    const mode = typeof modeOrEvent === "string" ? modeOrEvent : "queue";
    if (typeof modeOrEvent === "object") modeOrEvent.preventDefault();
    const text = prompt.trim();
    const pendingSelections = composerSelections;
    if ((!text && !pendingSelections.length) || !resolvedModel) return;
    setComposerSubmissionError("");
    if (sendState === "running") {
      const item = queuedItemFromComposer(text, pendingSelections);
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
    pendingAssistantIdRef.current = pendingId;
    messagesRef.current = pendingMessages;
    setMessages(pendingMessages);
    updatePrompt("");
    setComposerSelections([]);
    setPendingInputFiles(pendingSelections.filter((selection) => selection.kind !== "skill").map(composerSelectionArtifact));
    setComposerPaletteOpen(false);
    setSendState("running");
    void bridge
      .sendMessage({
        prompt: text,
        inputs: [
          ...pendingSelections.map((selection) => selection.input),
          ...(codexThreadId ? [] : selectedAgentInputs())
        ].filter((input, index, inputs) => inputs.findIndex((candidate) => candidate.type === input.type && "path" in candidate && "path" in input && candidate.path === input.path) === index),
        threadId: codexThreadId,
        cwd: selectedProject?.workspace,
        agentSelection: codexThreadId ? undefined : selectedAgentSnapshot(),
        additionalInstructions: codexThreadId ? undefined : additionalConversationInstructions,
        model: resolvedModel.id,
        reasoningEffort: resolvedReasoning,
        permissions: settings.agentPermissions
      })
      .then((reply) => {
        const wasInterrupted = interruptRequestedForRef.current === pendingId;
        const nextThreadId = typeof reply === "object" && reply && "threadId" in reply
          ? String((reply as { threadId?: unknown }).threadId ?? "")
          : "";
        const finalMessage = typeof reply === "object" && reply && "finalMessage" in reply
          ? String((reply as { finalMessage?: unknown }).finalMessage ?? "")
          : "";
        const nextMessages = messagesRef.current.map((item) => item.id === pendingId
          ? { id: pendingId, role: wasInterrupted ? "system" as const : "assistant" as const, text: wasInterrupted ? (item.text || (settings.locale === "zh" ? "运行已停止。" : "Run stopped.")) : finalMessage || formatReceipt(reply) }
          : item);
        messagesRef.current = nextMessages;
        setMessages(nextMessages);
        const resolvedThreadId = nextThreadId || codexThreadId;
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
        void loadThreadDirectory(false);
      })
      .catch(() => {
        const wasInterrupted = interruptRequestedForRef.current === pendingId;
        if (wasInterrupted) {
          setPendingInputFiles([]);
          activeTurnRef.current = null;
          setActiveTurnId(null);
          setSendState("idle");
          const nextMessages = messagesRef.current.map((item) => item.id === pendingId
            ? { id: pendingId, role: "system" as const, text: item.text || (settings.locale === "zh" ? "运行已停止。" : "Run stopped.") }
            : item);
          messagesRef.current = nextMessages;
          setMessages(nextMessages);
          pendingAssistantIdRef.current = null;
          interruptRequestedForRef.current = null;
          setComposerSubmissionError("");
          void loadThreadDirectory(false);
          return;
        }
        const message = t.sendFailed;
        updatePrompt(text);
        setComposerSelections(pendingSelections);
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
    setPrimaryView("conversation");
    setSelectedRuntimeWorkItemId(undefined);
    const currentWorkspaceProject = threadProjects.find((project) => !project.projectless && project.threads.some((thread) => thread.currentWorkspace));
    const nextMessages = createIntroMessages();
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setCodexThreadId(undefined);
    updateUiMetadata({
      selectedThreadId: undefined,
      selectedProjectId: currentWorkspaceProject?.id ?? uiMetadata.selectedProjectId
    });
    setPrompt(drafts.prompts.new ?? "");
    setLastDryRun("");
    setThreadActionError("");
    setSendState("idle");
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
    if (id === "opl-daily-work") {
      setSelectedAgent(null);
      return;
    }
    const agent = model.packageLifecycle.find((item) => item.packageId === id);
    if (!agent || agent.packageRole !== "standard_agent" || !agent.readiness.selectable) {
      throw new Error(settings.locale === "zh" ? "该智能体当前不可用。" : "This Agent is unavailable.");
    }
    setSelectedAgent(agentPackageSelectionIntent(agent));
  }

  async function loadCapabilities(force = false) {
    if (capabilityStatus === "loading" && !force) return false;
    setCapabilityStatus("loading");
    setCapabilityError("");
    try {
      const catalog = await bridge.readCodexCapabilities(codexThreadId);
      setCapabilityCatalog(catalog);
      if (catalog.errors.length && !catalog.skills.length && !catalog.plugins.length && !catalog.apps.length) {
        setCapabilityStatus("error");
        setCapabilityError(catalog.errors.join("\n"));
        return false;
      } else {
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

  function addPickedInputs(items: CodexPickedInput[]) {
    const selections = items.map((item): ComposerSelection => ({
      id: `${item.kind}:${item.path}`,
      kind: item.kind,
      label: item.name,
      detail: item.path,
      input: item.kind === "image"
        ? { type: "localImage", path: item.path, detail: "auto" }
        : { type: "mention", name: item.name, path: item.path }
    }));
    setComposerSelections((current) => [
      ...current,
      ...selections.filter((selection) => !current.some((item) => item.id === selection.id))
    ]);
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
    setSettings(writeSetting(key, value));
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

  const studioConversationBody = (
    <div className="opl-dsh-thread" ref={conversationRef as never}>
      <CodexServerRequestPanel requests={pendingServerRequests} locale={settings.locale} error={pendingServerRequestError} onRespond={(request, response) => void respondToServerRequest(request, response)} />
      {threadActionError ? <p className="thread-read-error" role="alert">{threadActionError}</p> : null}
      {messages.map((message, index) => (
        <article key={message.id} data-testid={message.role === "assistant" ? "opl-conversation-event" : undefined} className={`message ${message.role}${message.subagent ? " subagent" : ""}`}>
          {message.role === "system" ? <span className="message-label">{message.subagent ? (settings.locale === "zh" ? "子智能体" : "Subagent") : t.runtime}</span> : null}
          <div className="message-frame">
            {message.role === "assistant" ? (
              <Streamdown controls={assistantMarkdownControls} lineNumbers={false} linkSafety={assistantMarkdownLinkSafety} mode="static">{assistantDisplayMarkdown(message.text || (sendState === "running" ? t.codexWorking : t.waitingReply))}</Streamdown>
            ) : <MessageText text={message.text || (sendState === "running" ? t.codexWorking : t.waitingReply)} />}
          </div>
          {message.role === "assistant" && index === messages.length - 1 && sendState === "running" ? <div className="run-events">{eventFeed.slice(0, 4).reverse().map((item, eventIndex) => <span key={`${item}-${eventIndex}`}>{item}</span>)}</div> : null}
          {message.role === "assistant" ? <span data-testid="opl-codex-reply" hidden /> : null}
        </article>
      ))}
    </div>
  );

  const studioComposerAccessory = (
    <>
      {composerSelections.length ? (
        <div className="composer-selections" aria-label={settings.locale === "zh" ? "已添加的内容" : "Added content"}>
          {composerSelections.map((selection) => <span key={selection.id} className="composer-selection" title={selection.detail}><FileText aria-hidden="true" size={13} /><span>{selection.label}</span><button type="button" aria-label={`${settings.locale === "zh" ? "移除" : "Remove"} ${selection.label}`} onClick={() => setComposerSelections((current) => current.filter((item) => item.id !== selection.id))}><X aria-hidden="true" size={12} /></button></span>)}
        </div>
      ) : null}
      {selectedAgent ? (
        <div className="composer-selections" aria-label={settings.locale === "zh" ? "已选择的标准智能体" : "Selected standard Agent"}>
          <span className="composer-selection" title={selectedAgent.description}>
            <Puzzle aria-hidden="true" size={13} />
            <span>{settings.locale === "zh" ? selectedAgent.displayNameI18n.zh ?? selectedAgent.label : selectedAgent.displayNameI18n.en ?? selectedAgent.label}</span>
            <button type="button" aria-label={settings.locale === "zh" ? "移除智能体" : "Remove Agent"} onClick={() => setSelectedAgent(null)}><X aria-hidden="true" size={12} /></button>
          </span>
        </div>
      ) : null}
      <span
        className={`composer-status ${sendState === "error" || unavailableFixedModel ? "error" : sendState}`}
        data-testid="opl-composer-run-state"
        aria-live="polite"
      >
        {composerSubmissionError || (sendState === "running" ? t.working : sendState === "error" ? t.sendFailed : unavailableFixedModel ? t.modelSelectionUnavailable : "")}
      </span>
    </>
  );

  const studioComposerOverlay = (
    <ComposerCapabilityPalette
      open={composerPaletteOpen}
      locale={settings.locale}
      catalog={capabilityCatalog}
      status={capabilityStatus}
      error={capabilityError}
      selections={composerSelections}
      onClose={() => setComposerPaletteOpen(false)}
      onPickFiles={() => void pickComposerFiles()}
      onPickDirectory={() => void pickComposerDirectory()}
      onToggleSkill={toggleComposerSkill}
      contributions={hasContribution("composer.palette") ? renderContributionSlot?.("composer.palette", contributionOwner) : null}
    />
  );

  const studioDetails = (
    <aside className="opl-dsh-context-panel" aria-label="On-demand context panel">
      <div className="context-scroll">
        <section data-testid="opl-project-progress-panel" className="context-block project-progress-panel" hidden={activeContextTab !== "opl-project-progress-panel"}>
          <div className="context-list-head">
            <strong>{settings.locale === "zh" ? "当前项目" : "Current project"}</strong>
            <button type="button" aria-label={t.refresh} title={t.refresh} onClick={() => void loadState(settings.runtimeProfile)}><RefreshCw aria-hidden="true" size={14} /></button>
          </div>
          <ProjectProgressPanel locale={settings.locale} progress={projectProgress} refreshing={stateStatus === "loading"} />
        </section>
        <section data-testid="opl-files-results-panel" className="context-block opl-files-surface" hidden={activeContextTab !== "opl-files-results-panel"}>
          <nav className="opl-files-section-nav" aria-label={settings.locale === "zh" ? "文件与结果" : "Files and results"}>
            <button type="button" data-active={activeFilesView === "workspace" || undefined} onClick={() => { setActiveFilesView("workspace"); setArtifactPreviewOpen(false); }}><Folder aria-hidden="true" size={14} /><span>{settings.locale === "zh" ? "工作区" : "Workspace"}</span></button>
            <button type="button" data-active={activeFilesView === "inputs" || undefined} onClick={() => { setActiveFilesView("inputs"); setArtifactPreviewOpen(false); }}><FileText aria-hidden="true" size={14} /><span>{settings.locale === "zh" ? "输入" : "Inputs"}</span></button>
            <button type="button" data-active={activeFilesView === "results" || undefined} onClick={() => setActiveFilesView("results")}><Files aria-hidden="true" size={14} /><span>{settings.locale === "zh" ? "结果" : "Results"}</span></button>
          </nav>
          {activeFilesView === "workspace" ? (
            <WorkspaceFilesPanel
              threadId={codexThreadId}
              locale={settings.locale}
              listWorkspace={bridge.listThreadWorkspace}
              readFile={bridge.readThreadWorkspaceFile}
              searchWorkspace={bridge.searchThreadWorkspace}
            />
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
                  {group.filteredItems.length ? group.filteredItems.slice(0, normalizedCapabilityQuery ? 20 : 5).map((item) => <div className="capability-row" key={`${group.id}:${item.id}`} data-active={item.active}><span className="runtime-status-dot" aria-hidden="true" /><div><strong>{item.name}</strong>{item.detail ? <span>{item.detail}</span> : null}</div></div>) : <p className="context-empty">{settings.locale === "zh" ? "没有匹配项" : "No matches"}</p>}
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

  const renderStudioSettings = (activeDestination: SettingsDestinationId, renderContribution?: (options?: { only?: string }) => ReactNode) => (
    <SettingsPanel
      model={model}
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
      dockerDiagnostic={dockerDiagnostic}
      capabilityCatalog={capabilityCatalog}
      capabilityStatus={capabilityStatus}
      capabilityError={capabilityError}
      onRefreshCapabilities={() => void loadCapabilities()}
      activeDestination={activeDestination}
      onRefresh={() => void loadState(settings.runtimeProfile)}
      onRefreshInitialization={() => { void loadInitialize(); }}
      setupCapabilities={{
        ...setupCapabilities,
        modelAccessSecretInput: bridge.platformCapabilities.modelAccessSecretInput
      }}
      onChooseWorkspaceRoot={chooseWorkspaceRoot}
      onInstallCodex={installCodex}
      onConfigureCodexApiKey={configureCodexApiKey}
      onChangeLogDirectory={() => void changeLogDirectory()}
      onSettingChange={updateSetting}
      onReasoningChange={updateReasoning}
      additionalConversationInstructions={additionalConversationInstructions}
      onAdditionalConversationInstructionsChange={updateAdditionalConversationInstructions}
      onAction={(request) => void runSettingsAction(request)}
      onHostAction={(intent) => void runSettingsHostAction(intent)}
      onGatewayLogin={loginGatewayAccount}
      manifestInstallAction={projectedManifestInstallAction}
      actionBusyKey={settingsActionBusyKey}
      actionFeedback={settingsActionFeedback}
      pendingConfirmation={settingsActionConfirmation}
      onConfirmAction={() => void confirmSettingsAction()}
      onCancelAction={() => setSettingsActionConfirmation(null)}
      contributions={(() => {
        const destination = activeDestination === "resources" || activeDestination === "services" || activeDestination === "capabilities"
          ? activeDestination
          : null;
        if (!destination || !hasContribution("settings.section")) return null;
        const packageLabels = new Map(model.packageLifecycle.map((item) => [item.packageId, item.label]));
        const groups = groupSettingsContributions(model.uiContributions.entries.filter((entry) => (
          entry.slot === "settings.section" && settingsContributionDestination(entry) === destination
        )));
        return groups.length ? groups.map((group, index) => (
          <section className="settings-contribution-package" data-package-id={group.packageId} key={group.packageId}>
            <h3>{packageLabels.get(group.packageId) ?? (settings.locale === "zh" ? `已安装模块 ${index + 1}` : `Installed module ${index + 1}`)}</h3>
            <div className="opl-contribution-slot">
              {group.entries.map((entry) => (
                <div key={entry.contributionKey}>{renderContribution?.({ only: entry.contributionKey }) ?? null}</div>
              ))}
            </div>
          </section>
        )) : null;
      })()}
    />
  );

  if (!startupGateOpen) {
    const statusLabel: Record<StartupReadStatus, string> = settings.locale === "zh"
      ? { loading: "加载中", ready: "已就绪", error: "失败", timeout: "超时" }
      : { loading: "Loading", ready: "Ready", error: "Failed", timeout: "Timed out" };
    const statusIcon = (status: StartupReadStatus) => {
      if (status === "ready") return <Check aria-hidden="true" size={16} />;
      if (status === "error") return <AlertTriangle aria-hidden="true" size={16} />;
      if (status === "timeout") return <Clock3 aria-hidden="true" size={16} />;
      return <LoaderCircle aria-hidden="true" className="startup-readiness-spinner" size={16} />;
    };
    return (
      <>
        <style>{codexWorkbenchStyles}</style>
        <main className="startup-readiness" data-testid="opl-startup-readiness" aria-busy={!startupHasFailure}>
          <section className="startup-readiness-content" aria-labelledby="opl-startup-title">
            <div className="startup-readiness-wordmark">One Person Lab</div>
            <h1 id="opl-startup-title">{settings.locale === "zh" ? "正在准备工作区" : "Preparing your workspace"}</h1>
            <p className="startup-readiness-count" aria-live="polite">
              {settings.locale === "zh"
                ? `已就绪 ${startupReadyCount} / ${startupStages.length}`
                : `${startupReadyCount} / ${startupStages.length} ready`}
            </p>
            <ol className="startup-readiness-stages">
              {startupStages.map((stage) => (
                <li key={stage.id} data-status={stage.status}>
                  <span className="startup-readiness-stage-icon">{statusIcon(stage.status)}</span>
                  <span className="startup-readiness-stage-copy">
                    <strong>{stage.label}</strong>
                    {stage.detail && stage.status !== "ready" ? <span title={stage.detail}>{stage.detail}</span> : null}
                  </span>
                  <span className="startup-readiness-stage-status">{statusLabel[stage.status]}</span>
                </li>
              ))}
            </ol>
            {startupHasFailure ? (
              <div className="startup-readiness-actions">
                <button type="button" className="startup-readiness-retry" onClick={() => {
                  setStartupGateOpen(false);
                  setStartupTimedOut(false);
                  setStartupAttempt((attempt) => attempt + 1);
                }}><RefreshCw aria-hidden="true" size={16} />{settings.locale === "zh" ? "重新加载" : "Retry"}</button>
                <button type="button" className="startup-readiness-limited" onClick={() => setStartupGateOpen(true)}>
                  {settings.locale === "zh" ? "受限进入" : "Enter with limits"}<ArrowRight aria-hidden="true" size={16} />
                </button>
                <p>{settings.locale === "zh"
                  ? "未就绪的功能将保持不可用，已加载的功能可以继续使用。"
                  : "Unavailable features remain disabled; loaded features can still be used."}</p>
              </div>
            ) : null}
          </section>
        </main>
      </>
    );
  }

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
        item.packageRole === "standard_agent"
        && item.official
        && item.readiness.selectable
        && item.homeShortcuts.some((shortcut) => Boolean(shortcut.route))
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
          description: settings.locale === "zh" && description
            ? `${formalName} · ${description}`
            : description,
          selection: agentPackageSelectionIntent(agent)
        };
      })
    ],
    selectedAgentPresetId: selectedAgent?.packageId ?? "opl-daily-work",
    conversationBody: studioConversationBody,
    primaryView,
    runtimeOverview: <RuntimeOverviewPage
      locale={settings.locale}
      projection={model.workItemRuntime}
      serviceRecovery={model.serviceRecovery}
      serviceRecoveryBusy={serviceRecoveryBusy}
      serviceRecoveryFeedback={serviceRecoveryFeedback}
      selectedWorkItemId={detailWorkItemId}
      stateStatus={stateStatus}
      stateError={stateError}
      snapshotSource={runtimeSnapshotSource}
      snapshotCachedAt={runtimeSnapshotCachedAt}
      onRefresh={() => { void loadState(settings.runtimeProfile); }}
      onRunServiceRecovery={(action) => { void runServiceRecoveryAction(action); }}
      onOpenWorkItem={(item) => {
        setSelectedRuntimeWorkItemId(item.workItemId);
        requestDetails("opl-project-progress-panel");
      }}
      readDomainDetailView={readDomainDetailView}
    />,
    openPrimaryView: setPrimaryView,
    composerAccessory: studioComposerAccessory,
    composerOverlay: studioComposerOverlay,
    details: studioDetails,
    detailTabs,
    activeDetailTabId: activeContextTab,
    openDetailTab: requestDetails,
    renderSettings: renderStudioSettings,
    initializationStatus: initializeStatus,
    initialization: initializeReadback,
    refreshInitialization: () => { void loadInitialize(); },
    setupCapabilities,
    chooseWorkspaceRoot,
    installCodex,
    overlay: <><style>{codexWorkbenchStyles}</style><ThreadDetailPopover thread={threadDetail} locale={settings.locale} busy={threadActionBusy} onClose={() => setThreadDetail(null)} onResume={(thread) => void resumeThreadAndOpen(thread)} onFork={(thread) => void forkThread(thread)} onRequestArchive={(thread, archived) => { setLifecycleConfirmation({ thread, action: archived ? "archive" : "unarchive" }); setThreadActionError(""); setThreadDetail(null); }} /><ThreadLifecycleConfirmationDialog thread={lifecycleConfirmation?.thread ?? null} action={lifecycleConfirmation?.action ?? "archive"} locale={settings.locale} busy={threadActionBusy} error={threadActionError} onClose={() => setLifecycleConfirmation(null)} onConfirm={() => void confirmThreadLifecycle()} /><Modal open={contributionActionConfirmation !== null} onClose={() => setContributionActionConfirmation(null)} title={settings.locale === "zh" ? "确认执行能力操作" : "Confirm capability action"} description={contributionActionConfirmation ? (settings.locale === "zh" ? `此操作将由 ${contributionActionConfirmation.entry.packageId} 通过 OPL App 执行。` : `This action will be executed by ${contributionActionConfirmation.entry.packageId} through OPL App.`) : ""} footer={<><Button variant="outline" onClick={() => setContributionActionConfirmation(null)}>{settings.locale === "zh" ? "取消" : "Cancel"}</Button><Button variant="primary" disabled={contributionActionBusy || !contributionActionConfirmation} onClick={() => { const pending = contributionActionConfirmation; if (pending) void executeContributionAction(pending.entry, pending.command, true, pending.input); }}>{settings.locale === "zh" ? "确认执行" : "Confirm"}</Button></>} /></>,
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

function formatEvent(event: unknown): string {
  if (typeof event === "object" && event && "method" in event) {
    return String((event as { method?: unknown }).method);
  }
  if (typeof event === "object" && event && "type" in event) {
    return String((event as { type?: unknown }).type);
  }
  return "event";
}

export default App;
