import {
  AlertCircle,
  Plus,
  ArrowDown,
  ArrowUp,
  Bot,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Download,
  FolderOpen,
  LoaderCircle,
  LogIn,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Wrench
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type {
  CarrierDiagnosticsReadback,
  CodexCapabilityCatalog,
  NativeAppUpdateResult,
  OplInitializeReadback
} from "../bridge/oplBridge";
import type {
  AgentPackageDependencyRef,
  AgentPackageLifecycleRef,
  ManagedUpdateComponentRef,
  ManagedUpdateProjection,
  PackageLifecycleActionRef,
  RuntimeMaintenanceActionRef,
  WorkbenchGatewayAccount,
  WorkbenchModel,
  WorkbenchSettingsProjection
} from "./workbenchModel";
import {
  autoModelLabel,
  codexModelPolicy,
  modelLabel,
  reasoningLabel,
  type ResolvedCodexModelOption
} from "./modelPolicy";
import type { SettingKey, WorkbenchSettings } from "./settingsModel";
import type { ManagedCompanionViewModel } from "./managedCompanions";
import {
  actionPayloadComplete,
  buildSettingsActionViewModel,
  type GatewayActionViewModel,
  type SettingsExecutableIntent,
  type SettingsActionRequest,
  type SettingsHostActionIntent,
  type SettingsActionViewModel
} from "./settingsActions";
import { AppearanceRow } from "../vendor/deepseek-harness/packages/client/ui-theme/src/client/AppearanceRow";

export type { SettingsActionRequest } from "./settingsActions";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "settings.theme": "appearance.title" | "appearance.light" | "appearance.dark" | "appearance.system";
  }
}

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

type SettingsGroupId =
  | "overview"
  | "account_models"
  | "connections_deployment"
  | "workspace"
  | "agents_capabilities"
  | "runtime_maintenance"
  | "preferences";

type SettingsPanelProps = {
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
  dockerDiagnostic: SettingsDockerDiagnostic | null;
  capabilityCatalog: CodexCapabilityCatalog;
  capabilityStatus: "idle" | "loading" | "ready" | "error";
  capabilityError: string;
  onRefreshCapabilities: () => void;
  activeDestination: SettingsDestinationId;
  onRefresh: () => void;
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
  onSettingChange: <Key extends keyof WorkbenchSettings>(key: Key, value: WorkbenchSettings[Key]) => void;
  onReasoningChange: (reasoning: WorkbenchSettings["reasoningLevel"]) => void;
  additionalConversationInstructions: string;
  onAdditionalConversationInstructionsChange: (value: string) => void;
  onAction: (request: SettingsActionRequest) => void;
  onHostAction?: (intent: SettingsHostActionIntent) => void;
  onGatewayLogin?: (credentials: { email: string; password: string }) => Promise<boolean>;
  manifestInstallAction?: {
    actionId: string;
    payloadFields: string[];
    confirmationRequired: boolean;
    dryRunSupported: boolean;
  };
  actionBusyKey: string | null;
  actionFeedback: SettingsActionFeedback | null;
  pendingConfirmation: SettingsActionConfirmation | null;
  onConfirmAction: () => void;
  onCancelAction: () => void;
  contributions?: ReactNode;
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

export type SettingsActionConfirmation = {
  request: SettingsActionRequest;
  previewStatus: string;
};

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.closest('[hidden], [aria-hidden="true"]') && element.getClientRects().length > 0);
}

function trapDialogFocus(event: KeyboardEvent<HTMLElement>, root: HTMLElement | null): void {
  if (event.key !== "Tab") return;
  const focusable = focusableElements(root);
  if (focusable.length === 0) {
    event.preventDefault();
    root?.focus();
    return;
  }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (!root?.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

type NavigationDestination = {
  id: SettingsDestinationId;
  label: string;
};

type NavigationGroup = {
  id: SettingsGroupId;
  label: string;
  destinations: NavigationDestination[];
};

const navigationCopy = {
  zh: {
    groups: {
      overview: "概览",
      account_models: "账户与模型",
      connections_deployment: "连接与访问",
      workspace: "工作区",
      agents_capabilities: "智能体与能力",
      runtime_maintenance: "运行与维护",
      preferences: "偏好"
    },
    destinations: {
      overview: "概览",
      account: "账户与访问",
      models: "模型",
      resources: "资源与连接",
      workspace: "工作目录",
      storage: "数据与存储",
      agents: "智能体",
      capabilities: "能力",
      instructions: "指令",
      services: "服务状态",
      updates: "更新与修复",
      diagnostics: "日志与诊断",
      preferences: "偏好",
      about: "关于"
    }
  },
  en: {
    groups: {
      overview: "Overview",
      account_models: "Account & Models",
      connections_deployment: "Connections & Access",
      workspace: "Workspace",
      agents_capabilities: "Agents & Capabilities",
      runtime_maintenance: "Runtime & Maintenance",
      preferences: "Preferences"
    },
    destinations: {
      overview: "Overview",
      account: "Account & Access",
      models: "Models",
      resources: "Resources & Connections",
      workspace: "Working Directory",
      storage: "Data & Storage",
      agents: "Agents",
      capabilities: "Capabilities",
      instructions: "Instructions",
      services: "Service Status",
      updates: "Updates & Repair",
      diagnostics: "Logs & Diagnostics",
      preferences: "Preferences",
      about: "About"
    }
  }
} as const;

function navigationGroups(locale: WorkbenchSettings["locale"]): NavigationGroup[] {
  const copy = navigationCopy[locale];
  return [
    { id: "overview", label: copy.groups.overview, destinations: [{ id: "overview", label: copy.destinations.overview }] },
    {
      id: "account_models",
      label: copy.groups.account_models,
      destinations: [
        { id: "account", label: copy.destinations.account },
        { id: "models", label: copy.destinations.models }
      ]
    },
    {
      id: "connections_deployment",
      label: copy.groups.connections_deployment,
      destinations: [{ id: "resources", label: copy.destinations.resources }]
    },
    {
      id: "workspace",
      label: copy.groups.workspace,
      destinations: [
        { id: "workspace", label: copy.destinations.workspace },
        { id: "storage", label: copy.destinations.storage }
      ]
    },
    {
      id: "agents_capabilities",
      label: copy.groups.agents_capabilities,
      destinations: [
        { id: "agents", label: copy.destinations.agents },
        { id: "capabilities", label: copy.destinations.capabilities },
        { id: "instructions", label: copy.destinations.instructions }
      ]
    },
    {
      id: "runtime_maintenance",
      label: copy.groups.runtime_maintenance,
      destinations: [
        { id: "services", label: copy.destinations.services },
        { id: "updates", label: copy.destinations.updates },
        { id: "diagnostics", label: copy.destinations.diagnostics }
      ]
    },
    {
      id: "preferences",
      label: copy.groups.preferences,
      destinations: [{ id: "preferences", label: copy.destinations.preferences }]
    }
  ];
}

export function settingsDestinations(locale: WorkbenchSettings["locale"]): NavigationDestination[] {
  return [
    ...navigationGroups(locale).map((group) => ({
      id: group.destinations[0]!.id,
      label: group.label
    })),
    { id: "about", label: navigationCopy[locale].destinations.about }
  ];
}

export function settingsSubDestinations(
  primaryDestination: SettingsDestinationId,
  locale: WorkbenchSettings["locale"]
): NavigationDestination[] {
  return navigationGroups(locale)
    .find((group) => group.destinations[0]?.id === primaryDestination)
    ?.destinations ?? [{ id: "about", label: navigationCopy[locale].destinations.about }];
}

export function statusTone(status: string | undefined): "ready" | "attention" | "neutral" {
  if (!status) return "neutral";
  const normalized = status.toLowerCase();
  const healthRatio = normalized.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (healthRatio) {
    const available = Number(healthRatio[1]);
    const total = Number(healthRatio[2]);
    if (total > 0 && available === total) return "ready";
    if (total > 0 && available >= 0 && available < total) return "attention";
    return "neutral";
  }
  if (["error", "attention", "stale", "required", "unavailable", "not_available", "not-available", "not_installed", "restart_needed", "failed", "missing", "incompatible", "unsupported"].some((value) => normalized.includes(value))) {
    return "attention";
  }
  if (["ready", "connected", "active", "compatible", "available", "installed", "enabled", "current", "stable", "healthy"].some((value) => normalized.includes(value))) {
    return "ready";
  }
  return "neutral";
}

export function carrierLogDetail(
  diagnostics: CarrierDiagnosticsReadback,
  locale: WorkbenchSettings["locale"]
): string {
  const logDirectory = diagnostics.application?.systemInfo.logDir;
  if (logDirectory) return logDirectory;
  if (diagnostics.status === "unavailable") {
    return locale === "zh" ? "当前运行方式不提供应用日志路径" : "This app mode does not provide an application log path";
  }
  return locale === "zh" ? "应用日志路径尚未就绪" : "The application log path is not ready";
}

export function formatStatus(status: string | undefined, locale: WorkbenchSettings["locale"]): string {
  if (!status) return locale === "zh" ? "待确认" : "Not available";
  const healthRatio = status.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (healthRatio) {
    const available = Number(healthRatio[1]);
    const total = Number(healthRatio[2]);
    if (total > 0 && available === total) return locale === "zh" ? `${available} / ${total} 可用` : `${available} / ${total} available`;
    if (total > 0 && available >= 0 && available < total) return locale === "zh" ? `${available} / ${total} 可用` : `${available} / ${total} available`;
    return locale === "zh" ? "待确认" : "Not available";
  }
  const labels: Record<string, [string, string]> = {
    connected: ["已连接", "Connected"],
    loading: ["正在读取", "Loading"],
    active: ["可用", "Available"],
    ready: ["可用", "Available"],
    available: ["可用", "Available"],
    healthy: ["可用", "Available"],
    current: ["已是最新", "Up to date"],
    installed: ["已安装", "Installed"],
    enabled: ["已开启", "Enabled"],
    disabled: ["已关闭", "Disabled"],
    not_installed: ["未安装", "Not installed"],
    checking: ["正在检查", "Checking"],
    compatible: ["兼容", "Compatible"],
    required: ["需要授权", "Required"],
    permission_required: ["需要授权", "Permission required"],
    unavailable: ["不可用", "Unavailable"],
    not_available: ["不可用", "Unavailable"],
    "not-available": ["不可用", "Unavailable"],
    unsupported: ["当前不支持", "Not supported"],
    restart_needed: ["需要重新启动", "Restart required"],
    error: ["出现问题", "Needs attention"],
    attention_needed: ["需要处理", "Needs attention"],
    action_available: ["可配置", "Action available"],
    diagnose_with_doctor: ["需要诊断", "Diagnosis available"],
    not_checked: ["尚未检查", "Not checked"],
    initializing: ["初始化中", "Initializing"],
    attention: ["需要处理", "Needs attention"],
    daemon_unreachable: ["服务未运行", "Service not running"],
    unreachable: ["无法连接", "Unreachable"],
    not_visible: ["未发现访问地址", "Address not found"],
    configured: ["已配置", "Configured"],
    present: ["已配置", "Configured"],
    setup_required: ["需要设置", "Setup required"],
    reauth_required: ["需要重新登录", "Sign in again"],
    verification_deferred: ["待确认", "Pending verification"],
    not_inventoried: ["尚未盘点", "Not inventoried"],
    awaiting_inventory: ["等待盘点", "Awaiting inventory"],
    usage_not_measured: ["未统计", "Not measured"],
    inventory_refresh_failed: ["统计失败", "Inventory failed"],
    usage_unavailable: ["用量不可用", "Usage unavailable"],
    not_configured: ["尚未配置", "Not configured"],
    unknown: ["待确认", "Not available"],
    app_state_projection: ["待确认", "Not available"],
    preview_legacy_modules_fallback: ["信息有限", "Limited information"],
    stable: ["稳定版", "Stable"],
    preview: ["预览版", "Preview"]
  };
  const normalized = status.toLowerCase();
  const exact = labels[normalized]?.[locale === "zh" ? 0 : 1];
  if (exact) return exact;
  if (statusTone(normalized) === "attention") return locale === "zh" ? "需要处理" : "Needs attention";
  if (statusTone(normalized) === "ready") return locale === "zh" ? "可用" : "Available";
  return locale === "zh" ? "待确认" : "Not available";
}

function formatNumber(value: number | undefined, locale: string, compact = false): string {
  if (value === undefined) return "--";
  return new Intl.NumberFormat(locale, compact
    ? { notation: "compact", maximumFractionDigits: 2 }
    : { maximumFractionDigits: 2 }
  ).format(value);
}

function formatAmount(value: number | undefined, currency: string | undefined, locale: string): string {
  if (value === undefined) return "--";
  if (!currency) return formatNumber(value, locale);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${formatNumber(value, locale)} ${currency}`;
  }
}

function formatBytes(value: number | undefined, locale: string): string {
  if (value === undefined) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (Math.abs(size) >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(size)} ${units[unit]}`;
}

function formatDate(value: string | undefined, locale: string): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

type StorageProjection = WorkbenchSettingsProjection["storage"][keyof WorkbenchSettingsProjection["storage"]];

export function storagePresentationStatus(entry: StorageProjection | undefined): string | undefined {
  if (!entry) return undefined;
  if (entry.reasonCode === "inventory_cache_missing_or_invalid" && !entry.observedAt) return "not_inventoried";
  if (entry.reasonCode === "inventory_cache_write_failed") return "inventory_refresh_failed";
  if (["inventory_cache_stale", "carrier_owned_storage_unmeasured"].includes(entry.reasonCode ?? "")) return "usage_not_measured";
  if (entry.reasonCode === "webui_data_root_not_configured") return "not_configured";
  if (entry.status === "unavailable" && entry.observedAt) return "usage_not_measured";
  if (entry.status === "available" && entry.bytes === undefined) return "usage_not_measured";
  return entry.status;
}

function storageReason(entry: StorageProjection | undefined, locale: WorkbenchSettings["locale"]): string {
  if (!entry) return locale === "zh" ? "尚未收到存储状态" : "Storage status has not been received";
  if (entry.reasonCode === "inventory_cache_missing_or_invalid") {
    return entry.observedAt
      ? (locale === "zh" ? "暂无可确认的用量数据；现有数据不受影响" : "No confirmed usage data is available; existing data is unaffected")
      : (locale === "zh" ? "尚未统计用量；现有数据不受影响" : "Usage has not been measured; existing data is unaffected");
  }
  if (entry.reasonCode === "inventory_cache_stale") {
    return locale === "zh" ? "暂无可确认的最新用量；智能体仍可正常使用" : "No confirmed current usage is available; agents remain usable";
  }
  if (entry.reasonCode === "inventory_cache_write_failed") {
    return locale === "zh" ? "无法保存最新用量统计；现有数据和其他功能不受影响" : "The latest usage snapshot could not be saved; existing data and other features are unaffected";
  }
  if (entry.reasonCode === "carrier_owned_storage_unmeasured") {
    return locale === "zh" ? "当前只管理安装与移除，暂不统计磁盘用量" : "Installation and removal are managed here; disk usage is not currently measured";
  }
  if (entry.reasonCode === "webui_data_root_not_configured" || entry.status === "not_configured") {
    return locale === "zh" ? "启用网页端后会在这里显示其数据用量" : "Usage appears here after the Web app is enabled";
  }
  if (entry.reasonCode) {
    return locale === "zh" ? "当前没有可确认的用量数据；其他功能不受影响" : "No confirmed usage data is available; other features are unaffected";
  }
  return entry.observedAt
    ? (locale === "zh" ? `盘点于 ${formatDate(entry.observedAt, "zh-CN")}` : `Inventoried ${formatDate(entry.observedAt, "en-US")}`)
    : (locale === "zh" ? "尚未统计用量" : "Usage has not been measured");
}

function storageAmount(value: number | undefined, entry: StorageProjection | undefined, locale: string): string {
  return value === undefined
    ? (locale.startsWith("zh") ? "未统计" : "Not measured")
    : formatBytes(value, locale);
}

export function gatewayAccountInitials(name: string | undefined): string {
  if (!name) return "OP";
  const characters = Array.from(name.trim());
  if (characters.some((character) => /\p{Script=Han}/u.test(character))) return characters.find((character) => /\p{Script=Han}/u.test(character)) ?? "OP";
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "OP";
}

export type GatewayModelAccessState = "current" | "different" | "unknown";

export type GatewayConnectionPresentation = "loading" | "error" | "none" | "manual_key" | "account";

export function gatewayConnectionPresentation(
  projection: Pick<WorkbenchSettingsProjection, "gatewayConnectionMode"> | undefined,
  gateway: WorkbenchGatewayAccount | undefined,
  stateStatus: "loading" | "ready" | "error"
): GatewayConnectionPresentation {
  if (stateStatus === "loading" && !projection && !gateway) return "loading";
  if (stateStatus === "error" && !projection && !gateway) return "error";
  if (projection) {
    if (projection.gatewayConnectionMode === "account") return "account";
    if (projection.gatewayConnectionMode === "manual_key") return "manual_key";
    return "none";
  }
  if (gateway) return "account";
  return "none";
}

export function gatewayModelAccessState(projection: WorkbenchSettingsProjection | undefined): GatewayModelAccessState {
  const provider = projection?.codex.providerName?.trim().toLocaleLowerCase();
  const source = projection?.codex.modelAccessSource?.trim().toLocaleLowerCase();
  if (provider?.includes("opl gateway") || ["opl_gateway", "gateway", "gateway_account"].includes(source ?? "")) {
    return "current";
  }
  if (provider || source) return "different";
  return "unknown";
}

function SettingRow({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span>{label}</span>
        {detail ? <small>{detail}</small> : null}
      </div>
      <div className="settings-row-value">{children}</div>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group" data-testid="opl-settings-section">
      <h2>{title}</h2>
      <div className="settings-rows">{children}</div>
    </section>
  );
}

function StatusValue({ status, locale }: { status?: string; locale: WorkbenchSettings["locale"] }) {
  return (
    <span className="settings-status" data-tone={statusTone(status)}>
      <span aria-hidden="true" />
      {formatStatus(status, locale)}
    </span>
  );
}

export function packageRoleLabel(role: string, locale: WorkbenchSettings["locale"]): string {
  const labels: Record<string, [string, string]> = {
    standard_agent: ["领域智能体", "Domain agent"],
    workflow_profile: ["工作流", "Workflow"],
    capability_package: ["能力支持", "Capability support"],
    framework_capability_package: ["能力支持", "Capability support"]
  };
  return labels[role]?.[locale === "zh" ? 0 : 1] ?? (locale === "zh" ? "其他扩展" : "Other extension");
}

export function localizedPackageDescription(
  item: Pick<AgentPackageLifecycleRef, "description" | "descriptionI18n" | "packageRole">,
  locale: WorkbenchSettings["locale"]
): string {
  const ownerLocalized = item.descriptionI18n[locale]?.trim();
  if (ownerLocalized) return ownerLocalized;
  const englishFallback = item.descriptionI18n.en?.trim() || item.description.trim();
  if (englishFallback) return englishFallback;
  const fallback: Record<string, [string, string]> = {
    standard_agent: ["用于专业任务规划、执行与交付的领域智能体。", "A domain agent for planning, execution, and delivery."],
    workflow_profile: ["提供可复用的任务流程与执行步骤。", "Provides reusable task workflows and execution steps."],
    capability_package: ["为智能体提供共享能力与连接支持。", "Provides shared capabilities and connections for agents."],
    framework_capability_package: ["为智能体提供共享能力与连接支持。", "Provides shared capabilities and connections for agents."]
  };
  return fallback[item.packageRole]?.[locale === "zh" ? 0 : 1]
    ?? (locale === "zh" ? "提供可在 One Person Lab 中使用的扩展能力。" : "Adds capabilities to One Person Lab.");
}

function packageActionLabel(action: PackageLifecycleActionRef, locale: WorkbenchSettings["locale"]): string {
  const labels: Record<PackageLifecycleActionRef["kind"], [string, string]> = {
    install: ["安装", "Install"],
    update: ["更新", "Update"],
    repair: ["修复", "Repair"],
    uninstall: ["卸载", "Uninstall"],
    preferences: ["偏好", "Preferences"],
    other: ["管理", "Manage"]
  };
  return labels[action.kind][locale === "zh" ? 0 : 1];
}

function booleanStateLabel(value: boolean | null, locale: WorkbenchSettings["locale"]): string {
  if (value === null) return locale === "zh" ? "待确认" : "Not available";
  return value
    ? (locale === "zh" ? "是" : "Yes")
    : (locale === "zh" ? "否" : "No");
}

export function agentPackagePresentationStatus(item: AgentPackageLifecycleRef): string {
  if (item.installed === false) return "not_installed";
  if (item.installed === null) return "checking";
  if (item.activated === false) return "disabled";
  const launchable = item.readiness.launchAllowed === false
    ? false
    : item.packageRole !== "standard_agent" || item.homeShortcuts.some((shortcut) => Boolean(shortcut.route))
      ? item.readiness.launchAllowed
      : false;
  if (item.readiness.callable === false || launchable === false) return "unavailable";
  if (item.activated === true && item.readiness.callable === true && launchable === true) return "ready";
  return "checking";
}

export function packageDependencyPresentationStatus(dependency: AgentPackageDependencyRef): string {
  if (dependency.present === false || dependency.callable === false) return "unavailable";
  if (["ready", "available", "callable", "current", "operational"].includes(dependency.status.toLowerCase())) return "ready";
  return "checking";
}

export function isAgentCatalogPackage(item: Pick<AgentPackageLifecycleRef, "packageRole">): boolean {
  return item.packageRole === "standard_agent" || item.packageRole === "workflow_profile";
}

export function isCapabilityCatalogPackage(item: Pick<AgentPackageLifecycleRef, "packageId" | "packageRole">): boolean {
  if (item.packageId === "missing_bridge") return false;
  const role = item.packageRole.trim().toLowerCase();
  return role === "capability_package" || role.endsWith("_capability_package");
}

function PackageCatalog({
  model,
  settings,
  actionBusyKey,
  onAction,
  manifestInstallAction
}: {
  model: WorkbenchModel;
  settings: WorkbenchSettings;
  actionBusyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
  manifestInstallAction?: SettingsPanelProps["manifestInstallAction"];
}) {
  const [scope, setScope] = useState<"official" | "all">("official");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [installOpen, setInstallOpen] = useState(false);
  const [manifestUrl, setManifestUrl] = useState("");
  const [trustTier, setTrustTier] = useState<"" | "third_party_unverified" | "third_party_verified">("");
  const installDialogRef = useRef<HTMLFormElement | null>(null);
  const installTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!installOpen) return;
    const dialog = installDialogRef.current;
    const trigger = installTriggerRef.current;
    dialog?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    return () => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [installOpen]);
  const locale = settings.locale;
  const packages = model.packageLifecycle.filter((item) => item.packageId !== "missing_bridge" && isAgentCatalogPackage(item));
  const scoped = packages.filter((item) => scope === "all" || item.official);
  const customCount = packages.filter((item) => !item.official).length;
  const manifestInstallAvailable = Boolean(
    manifestInstallAction
    && manifestInstallAction.dryRunSupported
    && manifestInstallAction.confirmationRequired
    && manifestInstallAction.payloadFields.includes("manifest_url")
    && manifestInstallAction.payloadFields.includes("trust_tier")
  );
  const statusOptions = [...new Set(scoped.map(agentPackagePresentationStatus))].sort();
  const homeShortcutOrder = model.packageLifecycle.flatMap((item) => item.homeShortcuts.map((shortcut) => ({
    packageId: item.packageId,
    ...shortcut
  }))).sort((left, right) => left.sortOrder - right.sortOrder || left.shortcutId.localeCompare(right.shortcutId));
  const normalizedQuery = query.trim().toLowerCase();
  const visible = scoped.filter((item) => {
    if (statusFilter !== "all" && agentPackagePresentationStatus(item) !== statusFilter) return false;
    return !normalizedQuery || item.searchMetadata.query.includes(normalizedQuery);
  });
  const launchableCount = scoped.filter((item) => agentPackagePresentationStatus(item) === "ready").length;
  const groups = [
    { key: "standard_agent", label: locale === "zh" ? "标准智能体" : "Standard agents", icon: Bot },
    { key: "workflow_profile", label: locale === "zh" ? "工作流" : "Workflows", icon: Boxes }
  ].map((group) => ({ ...group, items: visible.filter((item) => item.packageRole === group.key) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="agent-catalog" data-testid="opl-settings-agent-catalog">
      <div className="settings-page-summary">
        <span>{locale === "zh" ? `${scoped.length} 个智能体与工作流` : `${scoped.length} agents and workflows`}</span>
        <StatusValue status={`${launchableCount}/${scoped.length}`} locale={locale} />
      </div>
      <div className="agent-catalog-toolbar">
        <label className="settings-search-field">
          <Search aria-hidden="true" size={14} />
          <input aria-label={locale === "zh" ? "搜索智能体与工作流" : "Search agents and workflows"} value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={locale === "zh" ? "搜索智能体与工作流" : "Search agents and workflows"} />
        </label>
        <div className="segmented-control" aria-label={locale === "zh" ? "目录范围" : "Catalog scope"}>
          <button type="button" data-active={scope === "official"} onClick={() => setScope("official")}>{locale === "zh" ? "官方" : "Official"}</button>
          <button type="button" data-active={scope === "all"} onClick={() => setScope("all")}>{locale === "zh" ? "全部" : "All"}</button>
        </div>
        <button
          ref={installTriggerRef}
          className="settings-action-button primary"
          type="button"
          disabled={!manifestInstallAvailable || actionBusyKey !== null}
          title={!manifestInstallAvailable
            ? (locale === "zh" ? "当前 App 尚未提供清单安装通道" : "The App does not currently expose manifest installation")
            : undefined}
          onClick={() => setInstallOpen(true)}
        >
          <Plus aria-hidden="true" size={14} />
          {locale === "zh" ? "添加智能体" : "Add agent"}
        </button>
      </div>
      {scope === "all" && customCount === 0 ? (
        <div className="settings-inline-note" role="status">
          {locale === "zh" ? "当前没有自定义智能体，因此“全部”与“官方”内容相同。" : "There are no custom agents yet, so All currently matches Official."}
        </div>
      ) : null}
      <div className="agent-catalog-filters">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value)} aria-label={locale === "zh" ? "按状态筛选" : "Filter by status"}>
          <option value="all">{locale === "zh" ? "全部状态" : "All statuses"}</option>
          {statusOptions.map((status) => <option key={status} value={status}>{formatStatus(status, locale)}</option>)}
        </select>
        <span>{locale === "zh" ? `${visible.length} 项` : `${visible.length} items`}</span>
      </div>
      {groups.length ? groups.map((group) => (
        <section key={group.key} className="agent-catalog-group">
          <h2><group.icon aria-hidden="true" size={15} />{group.label}<span>{group.items.length}</span></h2>
          <div className="agent-package-list">
            {group.items.map((item) => {
              const executableActions = item.actions.filter((action) => action.status === "available" && actionPayloadComplete(action.payload, action.requiredPayloadFields));
              const preferenceAction = item.actions.find((action) => action.kind === "preferences" && action.status === "available");
              const primaryAction = executableActions.find((action) => action.actionId === item.recommendedActionId)
                ?? (item.installed === false ? executableActions.find((action) => action.kind === "install") : undefined)
                ?? (statusTone(agentPackagePresentationStatus(item)) === "attention" ? executableActions.find((action) => action.kind === "repair") : undefined);
              return (
                <details key={item.id} className="agent-package-row" data-testid="opl-settings-agent-row">
                  <summary>
                    <span className="agent-package-copy">
                      <strong>{item.label}</strong>
                      <small>{localizedPackageDescription(item, locale)}</small>
                      <span className="agent-package-meta">
                        {item.version ? <span>{locale === "zh" ? `版本 ${item.version}` : `Version ${item.version}`}</span> : null}
                        {item.automaticUpdate !== null ? <span>{item.automaticUpdate ? (locale === "zh" ? "自动更新" : "Automatic updates") : (locale === "zh" ? "手动更新" : "Manual updates")}</span> : null}
                      </span>
                    </span>
                    <span className="agent-package-summary-actions">
                      <StatusValue status={agentPackagePresentationStatus(item)} locale={locale} />
                      {primaryAction ? (
                        <button
                          className="settings-action-button primary"
                          type="button"
                          disabled={actionBusyKey !== null}
                          onClick={(event) => {
                            event.preventDefault();
                            onAction({
                              key: `${item.packageId}:${primaryAction.actionId}`,
                              actionId: primaryAction.actionId,
                              label: `${packageActionLabel(primaryAction, locale)} ${item.label}`,
                              payload: primaryAction.payload,
                              confirmationRequired: primaryAction.confirmationRequired
                            });
                          }}
                        >
                          {actionBusyKey === `${item.packageId}:${primaryAction.actionId}` ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <Play aria-hidden="true" size={13} />}
                          {packageActionLabel(primaryAction, locale)}
                        </button>
                      ) : null}
                      <ChevronDown className="agent-package-chevron" aria-hidden="true" size={15} />
                    </span>
                  </summary>
                  <div className="agent-package-details">
                    <dl className="agent-state-axis-grid">
                      <div><dt>{locale === "zh" ? "目录" : "Directory"}</dt><dd>{locale === "zh" ? "已发现" : "Discovered"}</dd></div>
                      <div><dt>{locale === "zh" ? "安装" : "Installed"}</dt><dd>{booleanStateLabel(item.installed, locale)}</dd></div>
                      <div><dt>{locale === "zh" ? "启用" : "Enabled"}</dt><dd>{booleanStateLabel(item.activated, locale)}</dd></div>
                      <div><dt>{locale === "zh" ? "调用" : "Callable"}</dt><dd>{booleanStateLabel(item.readiness.callable, locale)}</dd></div>
                      <div><dt>{locale === "zh" ? "启动" : "Launchable"}</dt><dd>{booleanStateLabel(item.readiness.launchAllowed, locale)}</dd></div>
                    </dl>
                    {item.homeShortcuts.length ? (
                      <div className="home-shortcut-preferences">
                        {item.homeShortcuts.map((shortcut) => {
                          const orderIndex = homeShortcutOrder.findIndex((entry) => entry.packageId === item.packageId && entry.shortcutId === shortcut.shortcutId);
                          const previous = orderIndex > 0 ? homeShortcutOrder[orderIndex - 1] : undefined;
                          const next = orderIndex >= 0 && orderIndex < homeShortcutOrder.length - 1 ? homeShortcutOrder[orderIndex + 1] : undefined;
                          const submitPreference = (key: string, visible: boolean, sortOrder: number) => {
                            if (!preferenceAction) return;
                            onAction({
                              key,
                              actionId: preferenceAction.actionId,
                              label: locale === "zh" ? `更新 ${item.label} 的新任务入口` : `Update ${item.label} New Task entry`,
                              payload: {
                                ...preferenceAction.payload,
                                shortcut_id: shortcut.shortcutId,
                                visible,
                                sort_order: sortOrder
                              },
                              confirmationRequired: preferenceAction.confirmationRequired
                            });
                          };
                          const visibilityKey = `home:${item.packageId}:${shortcut.shortcutId}:visibility`;
                          const orderKey = `home:${item.packageId}:${shortcut.shortcutId}:order`;
                          return (
                            <div key={`${item.packageId}:${shortcut.shortcutId}`} className="home-shortcut-preference">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={shortcut.visible}
                                  disabled={!preferenceAction || actionBusyKey !== null}
                                  onChange={(event) => submitPreference(visibilityKey, event.currentTarget.checked, shortcut.sortOrder)}
                                />
                                <span className="home-shortcut-copy">
                                  <strong>{locale === "zh" ? "在新任务中显示" : "Show in New Task"}</strong>
                                  <small>{locale === "zh" ? "开启后，可从新任务页直接选择此智能体。" : "Makes this agent available from the New Task screen."}</small>
                                </span>
                              </label>
                              <span className="home-shortcut-order-actions">
                                <button
                                  type="button"
                                  aria-label={locale === "zh" ? "向前移动" : "Move earlier"}
                                  title={locale === "zh" ? "向前移动" : "Move earlier"}
                                  disabled={!preferenceAction || !previous || actionBusyKey !== null}
                                  onClick={() => previous && submitPreference(orderKey, shortcut.visible, previous.sortOrder - 1)}
                                ><ArrowUp aria-hidden="true" size={13} /></button>
                                <button
                                  type="button"
                                  aria-label={locale === "zh" ? "向后移动" : "Move later"}
                                  title={locale === "zh" ? "向后移动" : "Move later"}
                                  disabled={!preferenceAction || !next || actionBusyKey !== null}
                                  onClick={() => next && submitPreference(orderKey, shortcut.visible, next.sortOrder + 1)}
                                ><ArrowDown aria-hidden="true" size={13} /></button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    {executableActions.length ? (
                      <div className="agent-package-actions">
                        {executableActions.map((action) => (
                          <button
                            key={`${item.id}:${action.actionId}`}
                            className={`settings-action-button ${action.kind === "uninstall" ? "danger" : ""}`}
                            type="button"
                            disabled={actionBusyKey !== null}
                            onClick={() => onAction({
                              key: `${item.packageId}:${action.actionId}`,
                              actionId: action.actionId,
                              label: `${packageActionLabel(action, locale)} ${item.label}`,
                              payload: action.payload,
                              confirmationRequired: action.confirmationRequired
                            })}
                          >
                            {actionBusyKey === `${item.packageId}:${action.actionId}` ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : null}
                            {packageActionLabel(action, locale)}
                          </button>
                        ))}
                      </div>
                    ) : <small>{locale === "zh" ? "当前没有可直接执行的管理动作" : "No directly executable management action"}</small>}
                    {settings.developerDetails ? (
                      <details className="agent-technical-details">
                        <summary>{locale === "zh" ? "技术详情" : "Technical details"}<ChevronDown aria-hidden="true" size={13} /></summary>
                        <dl>{item.details.map((detail) => <div key={`${item.id}:${detail.label}`}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>
                      </details>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )) : (
          <div className="settings-empty-state"><Search aria-hidden="true" size={18} /><span>{locale === "zh" ? "没有符合条件的项目" : "No matching items"}</span></div>
      )}
      {installOpen ? (
        <div className="settings-action-dialog-backdrop" role="presentation">
          <form
            ref={installDialogRef}
            className="settings-action-dialog settings-add-agent-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-add-agent-title"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setInstallOpen(false);
                return;
              }
              trapDialogFocus(event, installDialogRef.current);
            }}
            onSubmit={(event) => {
              event.preventDefault();
              if (!manifestInstallAction || !manifestUrl.trim() || !trustTier) return;
              onAction({
                key: "agent-package:install-from-manifest",
                actionId: manifestInstallAction.actionId,
                label: locale === "zh" ? "安装自定义智能体" : "Install custom agent",
                payload: { manifest_url: manifestUrl.trim(), trust_tier: trustTier },
                confirmationRequired: manifestInstallAction.confirmationRequired,
                dryRunSupported: manifestInstallAction.dryRunSupported
              });
              setInstallOpen(false);
            }}
          >
            <div className="settings-action-dialog-icon"><Plus aria-hidden="true" size={18} /></div>
            <div className="settings-add-agent-fields">
              <h2 id="settings-add-agent-title">{locale === "zh" ? "添加智能体" : "Add agent"}</h2>
              <p>{locale === "zh" ? "从智能体作者提供的 OPL Package 清单安装。系统会先检查清单，确认后才会写入。" : "Install from an OPL Package manifest supplied by the agent author. The App validates it before asking for confirmation."}</p>
              <label>
                <span>{locale === "zh" ? "清单 URL" : "Manifest URL"}</span>
                <input
                  type="url"
                  value={manifestUrl}
                  onChange={(event) => setManifestUrl(event.currentTarget.value)}
                  placeholder="https://example.com/package-manifest.json"
                  autoFocus
                  required
                />
              </label>
              <label>
                <span>{locale === "zh" ? "信任级别" : "Trust level"}</span>
                <select value={trustTier} onChange={(event) => setTrustTier(event.currentTarget.value as typeof trustTier)} required>
                  <option value="">{locale === "zh" ? "请选择" : "Choose a trust level"}</option>
                  <option value="third_party_unverified">{locale === "zh" ? "未经独立验证" : "Unverified third party"}</option>
                  <option value="third_party_verified">{locale === "zh" ? "已核验来源" : "Verified third party"}</option>
                </select>
              </label>
            </div>
            <div className="settings-action-dialog-actions">
              <button type="button" onClick={() => setInstallOpen(false)}>{locale === "zh" ? "取消" : "Cancel"}</button>
              <button className="primary" type="submit" disabled={!manifestUrl.trim() || !trustTier || actionBusyKey !== null}>
                {locale === "zh" ? "检查并继续" : "Check and continue"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function SettingsContributionSection({
  contributions,
  locale,
  destination
}: {
  contributions?: ReactNode;
  locale: WorkbenchSettings["locale"];
  destination: "resources" | "services" | "capabilities";
}) {
  if (!contributions) return null;
  const titles = locale === "zh"
    ? { resources: "消息与连接", services: "已安装服务", capabilities: "模块扩展" }
    : { resources: "Messages & connections", services: "Installed services", capabilities: "Module extensions" };
  return (
    <section className="settings-contribution-section" data-testid="opl-settings-contributions">
      <h2>{titles[destination]}</h2>
      <div className="opl-contribution-slot">{contributions}</div>
    </section>
  );
}

function CapabilityDirectory({
  catalog,
  packageLifecycle,
  status,
  error,
  locale,
  showTechnicalDetails,
  onRefresh
}: {
  catalog: CodexCapabilityCatalog;
  packageLifecycle: AgentPackageLifecycleRef[];
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  locale: WorkbenchSettings["locale"];
  showTechnicalDetails: boolean;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const capabilityPackages = packageLifecycle.filter(isCapabilityCatalogPackage).map((item) => ({
    id: item.packageId,
    name: item.label,
    description: localizedPackageDescription(item, locale),
    status: agentPackagePresentationStatus(item),
    detail: packageRoleLabel(item.packageRole, locale),
    technical: item.sourceRef
  }));
  const dependencyPackages = packageLifecycle.flatMap((owner) => owner.dependencies.map((dependency) => ({
    id: dependency.packageId,
    name: dependency.packageId,
    description: locale === "zh"
      ? `${owner.label} 的必需能力包`
      : `Required capability package for ${owner.label}`,
    status: packageDependencyPresentationStatus(dependency),
    detail: locale === "zh" ? "动态依赖" : "Dynamic dependency",
    technical: `${owner.sourceRef}#dependency_readiness.checks`
  })));
  const capabilityPackageItems = [...capabilityPackages, ...dependencyPackages].filter((item, index, items) => (
    items.findIndex((candidate) => candidate.id === item.id) === index
  ));
  const groups = [
    {
      id: "capability-packages",
      label: locale === "zh" ? "能力模块" : "Capability packages",
      items: capabilityPackageItems
    },
    {
      id: "skills",
      label: locale === "zh" ? "技能" : "Skills",
      items: catalog.skills.map((item) => ({
        id: item.name,
        name: item.name,
        description: item.description,
        status: item.enabled ? "enabled" : "disabled",
        detail: item.scope,
        technical: item.path
      }))
    },
    {
      id: "plugins",
      label: locale === "zh" ? "插件" : "Plugins",
      items: catalog.plugins.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        status: item.enabled && item.callable ? "available" : item.enabled ? "attention_needed" : "disabled",
        detail: item.callable ? (locale === "zh" ? "可调用" : "Callable") : (locale === "zh" ? "当前不可调用" : "Not callable"),
        technical: item.id
      }))
    },
    {
      id: "apps",
      label: locale === "zh" ? "连接应用" : "Connected apps",
      items: catalog.apps.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        status: item.enabled && item.callable ? "available" : item.enabled ? "attention_needed" : "disabled",
        detail: item.callable ? (locale === "zh" ? "可调用" : "Callable") : (locale === "zh" ? "当前不可调用" : "Not callable"),
        technical: item.id
      }))
    }
  ].map((group) => ({
    ...group,
    visible: group.items.filter((item) => !normalizedQuery || `${item.name} ${item.description} ${item.detail}`.toLowerCase().includes(normalizedQuery))
  }));
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const visibleTotal = groups.reduce((sum, group) => sum + group.visible.length, 0);
  const refreshLabel = locale === "zh" ? "刷新能力目录" : "Refresh capability directory";

  return (
    <section className="settings-capability-directory" data-testid="opl-settings-capability-directory">
      <div className="settings-capability-toolbar">
        <label className="settings-search-field">
          <Search aria-hidden="true" size={14} />
          <input aria-label={locale === "zh" ? "搜索能力模块、技能、插件和应用" : "Search capability packages, skills, plugins, and apps"} value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={locale === "zh" ? "搜索能力模块、技能、插件和应用" : "Search capability packages, skills, plugins, and apps"} />
        </label>
        <button className="settings-icon-button" type="button" aria-label={refreshLabel} title={refreshLabel} disabled={status === "loading"} onClick={onRefresh}>
          {status === "loading" ? <LoaderCircle className="spin" aria-hidden="true" size={15} /> : <RefreshCw aria-hidden="true" size={15} />}
        </button>
      </div>
      <div className="settings-capability-summary">
        <span>{locale === "zh" ? `${visibleTotal} / ${total} 项` : `${visibleTotal} / ${total} items`}</span>
        <span>{catalog.source === "codex_app_server" ? (locale === "zh" ? "来自本机能力目录" : "From the local capability catalog") : (locale === "zh" ? "能力目录尚未连接" : "Capability catalog is not connected")}</span>
      </div>
      {status === "error" ? <div className="settings-inline-notice" role="alert"><AlertCircle aria-hidden="true" size={15} /><span>{error || (locale === "zh" ? "能力目录读取失败" : "Capability catalog could not be read")}</span></div> : null}
      {status !== "loading" && total === 0 ? (
        <div className="settings-empty-state"><Boxes aria-hidden="true" size={18} /><span>{locale === "zh" ? "当前没有可显示的技能、插件、应用或能力模块" : "No skills, plugins, apps, or capability packages are available"}</span></div>
      ) : null}
      {groups.map((group) => group.visible.length ? (
        <section className="settings-capability-group" key={group.id}>
          <h2>{group.label}<span>{group.visible.length}</span></h2>
          <div className="settings-capability-list">
            {group.visible.map((item) => (
              <details className="settings-capability-row" key={`${group.id}:${item.id}`}>
                <summary>
                  <span className="settings-capability-copy"><strong>{item.name}</strong><small>{item.description || item.detail}</small></span>
                  <span className="settings-capability-state"><StatusValue status={item.status} locale={locale} /><ChevronDown aria-hidden="true" size={14} /></span>
                </summary>
                <div className="settings-capability-details">
                  <span>{item.description || (locale === "zh" ? "该能力没有附加说明" : "No additional description is available")}</span>
                  <small>{item.detail}</small>
                  {showTechnicalDetails ? <code>{item.technical}</code> : null}
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null)}
    </section>
  );
}

function CodexInstructionsEditor({
  userAgents,
  defaultAgents,
  additionalInstructions,
  locale,
  busyKey,
  onRefresh,
  onAction,
  onAdditionalInstructionsChange
}: {
  userAgents?: WorkbenchSettingsProjection["personalization"]["userAgents"];
  defaultAgents?: WorkbenchSettingsProjection["personalization"]["oplFlowDefaultUserAgents"];
  additionalInstructions: string;
  locale: WorkbenchSettings["locale"];
  busyKey: string | null;
  onRefresh: () => void;
  onAction: (request: SettingsActionRequest) => void;
  onAdditionalInstructionsChange: (value: string) => void;
}) {
  const [userDraft, setUserDraft] = useState(userAgents?.content ?? "");
  const [additionalDraft, setAdditionalDraft] = useState(additionalInstructions);
  const [additionalSaved, setAdditionalSaved] = useState(false);
  const sameAsDefault = Boolean(userAgents?.sha256 && defaultAgents?.sha256 && userAgents.sha256 === defaultAgents.sha256);
  const refreshLabel = locale === "zh" ? "刷新本机指令" : "Refresh local instructions";
  const saveLabel = locale === "zh" ? "保存本机指令" : "Save local instructions";
  const restoreLabel = locale === "zh" ? "恢复 OPL Flow 默认" : "Restore OPL Flow default";

  useEffect(() => setUserDraft(userAgents?.content ?? ""), [userAgents?.content, userAgents?.sha256]);
  useEffect(() => setAdditionalDraft(additionalInstructions), [additionalInstructions]);

  return (
    <>
      <SettingsGroup title={locale === "zh" ? "本机指令" : "Local instructions"}>
        <div className="settings-editor-block" data-testid="opl-settings-user-instructions-editor">
          <div className="settings-editor-heading">
            <span>
              <strong>AGENTS.md</strong>
              <small>{locale === "zh" ? "Codex 会在本机任务中读取这个用户文件" : "Codex reads this user file for local tasks"}</small>
            </span>
            <StatusValue status={userAgents?.status} locale={locale} />
          </div>
          <textarea
            value={userDraft}
            aria-label={locale === "zh" ? "本机 Codex 指令" : "Local Codex instructions"}
            spellCheck={false}
            onChange={(event) => setUserDraft(event.currentTarget.value)}
          />
          <div className="settings-editor-footer">
            <small>{userAgents?.path ?? (locale === "zh" ? "本机指令路径尚未就绪" : "The local instruction path is not ready")}{userAgents?.sizeBytes !== undefined ? ` · ${formatBytes(userAgents.sizeBytes, locale === "zh" ? "zh-CN" : "en-US")}` : ""}</small>
            <span className="settings-row-actions">
              <button className="settings-icon-button" type="button" aria-label={refreshLabel} title={refreshLabel} disabled={busyKey !== null} onClick={onRefresh}>
                <RefreshCw aria-hidden="true" size={15} />
              </button>
              <button
                className="settings-action-button"
                type="button"
                disabled={busyKey !== null || userDraft === (userAgents?.content ?? "")}
                onClick={() => onAction({
                  key: "instructions:user:save",
                  actionId: "codex_user_instructions_set",
                  label: saveLabel,
                  payload: { content: userDraft, expected_sha256: userAgents?.sha256 ?? null },
                  confirmationRequired: false
                })}
              >
                {busyKey === "instructions:user:save" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <Save aria-hidden="true" size={13} />}
                {locale === "zh" ? "保存" : "Save"}
              </button>
            </span>
          </div>
          <div className="settings-default-row">
            <span>
              <strong>{locale === "zh" ? "OPL Flow 默认" : "OPL Flow default"}</strong>
              <small>{sameAsDefault
                ? (locale === "zh" ? "当前本机指令已使用此默认内容" : "The local file currently matches this default")
                : defaultAgents?.status === "available"
                  ? (locale === "zh" ? `可恢复${defaultAgents.packageVersion ? ` · 版本 ${defaultAgents.packageVersion}` : ""}` : `Available to restore${defaultAgents.packageVersion ? ` · version ${defaultAgents.packageVersion}` : ""}`)
                  : (defaultAgents?.reason ?? (locale === "zh" ? "默认内容当前不可用" : "The default is currently unavailable"))}
              </small>
            </span>
            <button
              className="settings-action-button"
              type="button"
              disabled={busyKey !== null || defaultAgents?.status !== "available" || sameAsDefault}
              onClick={() => onAction({
                key: "instructions:user:restore",
                actionId: "codex_user_instructions_restore_opl_flow_default",
                label: restoreLabel,
                payload: { expected_sha256: userAgents?.sha256 ?? null },
                confirmationRequired: true
              })}
            >
              {busyKey === "instructions:user:restore" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <RotateCcw aria-hidden="true" size={13} />}
              {locale === "zh" ? "恢复默认" : "Restore default"}
            </button>
          </div>
          {defaultAgents?.status === "available" && defaultAgents.content ? (
            <details className="settings-default-preview">
              <summary>
                <span>{locale === "zh" ? "查看 OPL Flow 默认内容" : "View OPL Flow default"}</span>
                <ChevronDown aria-hidden="true" size={14} />
              </summary>
              <pre aria-label={locale === "zh" ? "OPL Flow 默认指令只读预览" : "Read-only OPL Flow default instructions"}>{defaultAgents.content}</pre>
            </details>
          ) : null}
        </div>
      </SettingsGroup>
      <SettingsGroup title={locale === "zh" ? "新会话附加指令" : "New conversation instructions"}>
        <div className="settings-editor-block" data-testid="opl-settings-additional-instructions-editor">
          <label className="settings-editor-label">
            <span>{locale === "zh" ? "仅在之后新建的会话中附加；现有会话不会改变" : "Added only to conversations created afterward; existing conversations do not change"}</span>
            <textarea
              value={additionalDraft}
              aria-label={locale === "zh" ? "新会话附加指令" : "Additional instructions for new conversations"}
              placeholder={locale === "zh" ? "留空表示不附加任何内容" : "Leave blank to inject nothing"}
              spellCheck={false}
              onChange={(event) => { setAdditionalDraft(event.currentTarget.value); setAdditionalSaved(false); }}
            />
          </label>
          <div className="settings-editor-footer">
            <small role="status">{additionalSaved ? (locale === "zh" ? "已保存，将从下一个新会话生效" : "Saved; applies to the next new conversation") : ""}</small>
            <span className="settings-row-actions">
              <button
                className="settings-icon-button"
                type="button"
                aria-label={locale === "zh" ? "清空附加指令" : "Clear additional instructions"}
                title={locale === "zh" ? "清空附加指令" : "Clear additional instructions"}
                disabled={!additionalDraft}
                onClick={() => { setAdditionalDraft(""); setAdditionalSaved(false); }}
              >
                <Trash2 aria-hidden="true" size={15} />
              </button>
              <button
                className="settings-action-button"
                type="button"
                disabled={additionalDraft.trim() === additionalInstructions}
                onClick={() => {
                  onAdditionalInstructionsChange(additionalDraft);
                  setAdditionalDraft(additionalDraft.trim());
                  setAdditionalSaved(true);
                }}
              >
                <Save aria-hidden="true" size={13} />
                {locale === "zh" ? "保存" : "Save"}
              </button>
            </span>
          </div>
        </div>
      </SettingsGroup>
    </>
  );
}

function RuntimeActionButton({
  action,
  locale,
  busyKey,
  onAction,
  primary = false,
  previewOnly = false
}: {
  action?: RuntimeMaintenanceActionRef;
  locale: WorkbenchSettings["locale"];
  busyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
  primary?: boolean;
  previewOnly?: boolean;
}) {
  if (!action || !actionPayloadComplete(action.payload, action.requiredPayloadFields)) return null;
  const key = `runtime:${action.actionId}`;
  const labels: Record<string, [string, string]> = {
    settings_check_app_update: ["检查更新", "Check for updates"],
    settings_apply_opl_packages: ["更新能力包", "Update packages"],
    settings_sync_capabilities: ["同步能力", "Sync capabilities"],
    settings_prune_runtime_roots_dry_run: ["检查可清理内容", "Check reclaimable data"],
    provider_service_status: ["检查服务", "Check service"],
    provider_service_start: ["启动服务", "Start service"],
    provider_service_restart: ["重启服务", "Restart service"],
    provider_worker_status: ["检查任务处理", "Check task processing"],
    provider_worker_start: ["启动任务处理", "Start task processing"],
    provider_worker_restart: ["重启任务处理", "Restart task processing"],
    provider_scheduler_status: ["检查定时任务", "Check scheduled tasks"],
    provider_scheduler_install: ["启用定时任务", "Enable scheduled tasks"],
    provider_scheduler_trigger: ["立即运行", "Run now"],
    settings_install_docker_webui: ["安装网页端", "Install WebUI"],
    settings_configure_webui_api_key: ["配置访问密钥", "Configure access key"],
    settings_run_webui_startup_maintenance: ["运行启动维护", "Run startup maintenance"],
    settings_open_docker_webui: ["打开网页端", "Open WebUI"],
    settings_diagnose_docker_webui: ["运行诊断", "Run diagnostics"],
    settings_inventory_agent_package_store: ["刷新智能体与能力用量", "Refresh agents and capabilities usage"],
    settings_inventory_webui_data_volume: ["刷新网页端数据用量", "Refresh WebUI data usage"]
  };
  const label = labels[action.actionId]?.[locale === "zh" ? 0 : 1] ?? action.label;
  const refreshOnly = [
    "settings_check_app_update",
    "settings_sync_capabilities",
    "settings_inventory_agent_package_store",
    "settings_inventory_webui_data_volume",
    "provider_service_status",
    "provider_worker_status",
    "provider_scheduler_status"
  ].includes(action.actionId);
  return (
    <button
      className={`${refreshOnly ? "settings-icon-button" : "settings-action-button"} ${primary ? "primary" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      disabled={busyKey !== null}
      onClick={() => onAction({ key, actionId: action.actionId, label, payload: action.payload, confirmationRequired: action.confirmationRequired, previewOnly, dryRunSupported: action.dryRunSupported })}
    >
      {busyKey === key ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : refreshOnly ? <RefreshCw aria-hidden="true" size={13} /> : null}
      {refreshOnly ? <span className="visually-hidden">{label}</span> : label}
    </button>
  );
}

function ManagedCompanionsGroup({
  companions,
  locale,
  busyKey,
  onAction
}: {
  companions: ManagedCompanionViewModel[];
  locale: WorkbenchSettings["locale"];
  busyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
}) {
  const yesNo = (value: boolean) => value
    ? (locale === "zh" ? "是" : "Yes")
    : (locale === "zh" ? "否" : "No");
  return (
    <SettingsGroup title={locale === "zh" ? "OPL 托管" : "OPL managed"}>
      {companions.map((companion) => <div key={companion.providerId} data-testid="opl-managed-companion" data-provider-id={companion.providerId}>
        <SettingRow label={`${companion.productName}${companion.version ? ` ${companion.version}` : ""}`} detail={companion.providerId}>
          <StatusValue status={companion.status} locale={locale} />
        </SettingRow>
        <SettingRow label={locale === "zh" ? "安装与启用" : "Install and enablement"}>
          <span>{locale === "zh"
            ? `已安装 ${yesNo(companion.installed)} · 已注册 ${yesNo(companion.registered)} · 已启用 ${yesNo(companion.enabled)}`
            : `Installed ${yesNo(companion.installed)} · Registered ${yesNo(companion.registered)} · Enabled ${yesNo(companion.enabled)}`}</span>
        </SettingRow>
        <SettingRow label={locale === "zh" ? "权限" : "Permissions"} detail={companion.healthRef}>
          <StatusValue status={companion.permission} locale={locale} />
        </SettingRow>
        {companion.actions.length ? <SettingRow label={locale === "zh" ? "操作" : "Actions"}>
          <span className="runtime-setting-control">
            {companion.actions.map((action) => {
              const key = `managed-companion:${companion.providerId}:${action.actionId}`;
              return <button
                key={action.actionId}
                className={`settings-action-button ${action.dangerLevel === "medium" ? "danger" : ""}`}
                type="button"
                aria-label={action.label}
                title={action.label}
                disabled={busyKey !== null}
                onClick={() => onAction({ key, actionId: action.actionId, label: action.label, payload: {}, confirmationRequired: action.confirmationRequired })}
              >
                {busyKey === key ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <Wrench aria-hidden="true" size={13} />}
                {action.label}
              </button>;
            })}
          </span>
        </SettingRow> : null}
      </div>)}
    </SettingsGroup>
  );
}

function settingsIntentLabel(intent: SettingsExecutableIntent, locale: WorkbenchSettings["locale"]): string {
  if (intent.transport !== "app_action") return intent.label;
  const semanticLabels: Record<string, [string, string]> = {
    refresh: ["刷新", "Refresh"],
    disconnect: ["断开连接", "Disconnect"],
    repair: ["修复", "Repair"],
    complete_setup: ["完成设置", "Complete setup"],
    use_for_model_access: ["切换为 OPL Gateway", "Switch to OPL Gateway"]
  };
  return (intent.semantic ? semanticLabels[intent.semantic]?.[locale === "zh" ? 0 : 1] : undefined) ?? intent.label;
}

function SettingsIntentButton({
  intent,
  locale,
  busyKey,
  onAction,
  onHostAction,
  primary = false
}: {
  intent?: SettingsExecutableIntent;
  locale: WorkbenchSettings["locale"];
  busyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
  onHostAction?: (intent: SettingsHostActionIntent) => void;
  primary?: boolean;
}) {
  if (!intent || intent.availability !== "ready" || (intent.transport !== "app_action" && !onHostAction)) return null;
  const label = settingsIntentLabel(intent, locale);
  const isRefresh = intent.transport === "app_action"
    ? intent.semantic === "refresh" || intent.semantic === "status" || intent.semantic === "check"
    : intent.operation === "status" || intent.operation === "check";
  return (
    <button
      className={`${isRefresh ? "settings-icon-button" : "settings-action-button"} ${primary ? "primary" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      disabled={busyKey !== null}
      onClick={() => intent.transport === "app_action" ? onAction(intent) : onHostAction?.(intent)}
    >
      {busyKey === intent.key
        ? <LoaderCircle className="spin" aria-hidden="true" size={13} />
        : isRefresh ? <RefreshCw aria-hidden="true" size={13} /> : <Play aria-hidden="true" size={13} />}
      {isRefresh ? <span className="visually-hidden">{label}</span> : label}
    </button>
  );
}

export function formatUpdateChannel(value: string | undefined, locale: WorkbenchSettings["locale"]): string {
  if (!value) return locale === "zh" ? "默认" : "Default";
  const normalized = value.toLowerCase();
  if (normalized === "stable") return locale === "zh" ? "稳定版" : "Stable";
  if (normalized === "preview" || normalized === "beta") return locale === "zh" ? "预览版" : "Preview";
  return locale === "zh" ? "自定义" : "Custom";
}

function formatUpdatePolicy(value: string | undefined, eligible: boolean | null | undefined, locale: WorkbenchSettings["locale"]): string {
  const normalized = value?.toLowerCase();
  if (normalized && ["silent_background", "automatic", "auto", "enabled"].includes(normalized)) {
    return locale === "zh" ? "自动" : "Automatic";
  }
  if (normalized && ["manual", "explicit", "disabled"].includes(normalized)) {
    return locale === "zh" ? "手动" : "Manual";
  }
  if (eligible === true) return locale === "zh" ? "自动" : "Automatic";
  if (eligible === false) return locale === "zh" ? "手动" : "Manual";
  return locale === "zh" ? "待确认" : "Not available";
}

function ManagedUpdateGroup({
  component,
  nativeUpdate,
  fallbackLabel,
  managedChannel,
  actions,
  locale,
  busyKey,
  onAction,
  onHostAction,
  unavailableActionLabel
}: {
  component?: ManagedUpdateComponentRef;
  nativeUpdate?: NativeAppUpdateResult | null;
  fallbackLabel: string;
  managedChannel?: string;
  actions: SettingsExecutableIntent[];
  locale: WorkbenchSettings["locale"];
  busyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
  onHostAction?: (intent: SettingsHostActionIntent) => void;
  unavailableActionLabel?: string;
}) {
  const version = nativeUpdate?.currentVersion
    ? nativeUpdate.targetVersion && nativeUpdate.targetVersion !== nativeUpdate.currentVersion
      ? `${nativeUpdate.currentVersion} -> ${nativeUpdate.targetVersion}`
      : nativeUpdate.currentVersion
    : component?.installedVersion
    ? component.latestVersion && component.latestVersion !== component.installedVersion
      ? `${component.installedVersion} -> ${component.latestVersion}`
      : component.installedVersion
    : component?.latestVersion ?? "--";
  const autoPolicy = nativeUpdate
    ? nativeUpdate.supported
      ? (locale === "zh" ? "启动时检查，下载和安装前确认" : "Checks at startup; confirms before download and install")
      : (locale === "zh" ? "当前安装方式不可用" : "Unavailable for this installation")
    : formatUpdatePolicy(component?.autoApplyMode, component?.autoApplyEligible, locale);
  const nativeUpdateSource = nativeUpdate?.supported
    ? (locale === "zh" ? "已配置" : "Configured")
    : nativeUpdate?.reasonCode === "desktop_updater_requires_packaged_app"
      ? (locale === "zh" ? "开发预览包不启用自动更新" : "Automatic updates are disabled in a development preview")
      : nativeUpdate?.reasonCode === "desktop_update_config_unavailable"
        ? (locale === "zh" ? "当前安装包缺少更新源配置" : "The installed package has no update source configuration")
        : nativeUpdate?.reasonCode
          ? (locale === "zh" ? "当前载体没有可用更新源" : "No update source is available for this carrier")
          : undefined;
  const renderableActions = actions.filter((intent) => (
    intent.availability === "ready" && (intent.transport === "app_action" || Boolean(onHostAction))
  ));
  return (
    <SettingsGroup title={fallbackLabel}>
      <SettingRow label={locale === "zh" ? "状态" : "Status"}>
        <span className="runtime-setting-control">
          <StatusValue status={nativeUpdate?.state ?? component?.state} locale={locale} />
          {renderableActions.length
            ? renderableActions.map((intent) => <SettingsIntentButton key={intent.key} intent={intent} locale={locale} busyKey={busyKey} onAction={onAction} onHostAction={onHostAction} />)
            : <span className="settings-muted">{unavailableActionLabel ?? "--"}</span>}
        </span>
      </SettingRow>
      <SettingRow label={locale === "zh" ? "版本" : "Version"}><span>{version}</span></SettingRow>
      {component?.currentness ? <SettingRow label={locale === "zh" ? "当前状态" : "Currentness"}><StatusValue status={component.currentness} locale={locale} /></SettingRow> : null}
      <SettingRow label={locale === "zh" ? "更新通道" : "Update channel"}><span>{formatUpdateChannel(component?.channel ?? managedChannel, locale)}</span></SettingRow>
      {nativeUpdate ? <SettingRow label={locale === "zh" ? "更新源" : "Update source"}><span>{nativeUpdateSource ?? "--"}</span></SettingRow> : null}
      <SettingRow label={nativeUpdate ? (locale === "zh" ? "更新方式" : "Update behavior") : (locale === "zh" ? "自动更新" : "Automatic updates")}><span>{autoPolicy}</span></SettingRow>
      {component?.flowDependencies?.length ? <details className="settings-advanced-actions" data-testid="opl-flow-dependency-currentness">
        <summary>{locale === "zh" ? `OPL Flow 依赖 ${component.flowDependencies.length} 项` : `${component.flowDependencies.length} OPL Flow dependencies`}<ChevronDown aria-hidden="true" size={14} /></summary>
        <div>{component.flowDependencies.map((dependency) => <SettingRow key={`${dependency.dependencyId}:${dependency.dependencyKind}`} label={dependency.dependencyId} detail={[dependency.dependencyKind, dependency.version].filter(Boolean).join(" · ")}><StatusValue status={dependency.currentness || dependency.status} locale={locale} /></SettingRow>)}</div>
      </details> : null}
    </SettingsGroup>
  );
}

export function SettingsPanel({
  model,
  managedUpdate,
  actionViewModel: projectedActionViewModel,
  settings,
  modelOptions,
  resolvedModel,
  resolvedReasoning,
  resolvedReasoningOptions,
  stateStatus,
  stateError,
  carrierDiagnostics,
  initializationStatus,
  initialization,
  nativeAppUpdate,
  dockerDiagnostic,
  capabilityCatalog,
  capabilityStatus,
  capabilityError,
  onRefreshCapabilities,
  activeDestination,
  onRefresh,
  onRefreshInitialization,
  setupCapabilities,
  onChooseWorkspaceRoot,
  onInstallCodex,
  onConfigureCodexApiKey,
  onChangeLogDirectory,
  onSettingChange,
  onReasoningChange,
  additionalConversationInstructions,
  onAdditionalConversationInstructionsChange,
  onAction,
  onHostAction,
  onGatewayLogin,
  manifestInstallAction,
  actionBusyKey,
  actionFeedback,
  pendingConfirmation,
  onConfirmAction,
  onCancelAction,
  contributions
}: SettingsPanelProps) {
  const groups = useMemo(() => navigationGroups(settings.locale), [settings.locale]);
  const locale = settings.locale === "zh" ? "zh-CN" : "en-US";
  const copy = navigationCopy[settings.locale].destinations;
  const [subDestination, setSubDestination] = useState<SettingsDestinationId | null>(null);
  const activeGroup = groups.find((group) => group.destinations[0]?.id === activeDestination);
  const selectedDestination = activeGroup?.destinations.some((destination) => destination.id === subDestination)
    ? subDestination!
    : activeDestination;
  const projection = model.settingsProjection;
  const runtime = model.runtimeOverview;
  const gateway = model.gatewayAccount;
  const [gatewayEmail, setGatewayEmail] = useState("");
  const [gatewayPassword, setGatewayPassword] = useState("");
  const [accessSetupMode, setAccessSetupMode] = useState<"account" | "api_key">("account");
  const [editingAccess, setEditingAccess] = useState(false);
  const [codexApiKey, setCodexApiKey] = useState("");
  const confirmationDialogRef = useRef<HTMLElement | null>(null);
  const confirmationCancelRef = useRef<HTMLButtonElement | null>(null);
  const feedbackDestinationRef = useRef<SettingsDestinationId | null>(null);
  const confirmationOpen = pendingConfirmation !== null;
  const derivedActionViewModel = useMemo(() => buildSettingsActionViewModel(model, managedUpdate), [managedUpdate, model]);
  const actionViewModel = projectedActionViewModel ?? derivedActionViewModel;
  const unavailableFixedModel = settings.modelAccess !== "__auto" && !resolvedModel;
  const stateLoading = stateStatus === "loading";
  const stateFailed = stateStatus === "error";
  const statePlaceholder = stateLoading
    ? (settings.locale === "zh" ? "正在读取" : "Loading")
    : "--";
  const gatewayUnavailableLabel = stateLoading
    ? (settings.locale === "zh" ? "正在读取" : "Reading")
    : stateFailed
      ? (settings.locale === "zh" ? "暂时不可用" : "Temporarily unavailable")
      : (settings.locale === "zh" ? "尚未配置" : "Not configured");
  const gatewayUnavailableDetail = stateLoading
    ? (settings.locale === "zh" ? "正在读取 OPL App 状态" : "Reading OPL App state")
    : stateFailed
      ? (settings.locale === "zh" ? "刷新状态后重试" : "Refresh state to retry")
      : (settings.locale === "zh" ? "可在“账户与访问”中配置" : "Configure it in Account & Access");
  const readbackStatus = stateLoading ? "loading" : stateFailed ? "attention_needed" : "ready";
  const setupFlow = initialization?.systemInitialize.setupFlow;
  const initializationPresentationStatus = initializationStatus === "loading"
    ? "checking"
    : initializationStatus === "error"
      ? "error"
      : setupFlow?.readyToLaunch
        ? "ready"
        : "attention_needed";
  const initializationDetail = initializationStatus === "loading"
    ? (settings.locale === "zh" ? "后台读取本机启动条件，不阻塞界面" : "Reading local startup conditions in the background without blocking the interface")
    : setupFlow
      ? (settings.locale === "zh"
          ? `核心 ${setupFlow.progress.required_completed_count ?? setupFlow.progress.ready_required_count ?? 0} / ${setupFlow.progress.required_total_count ?? setupFlow.progress.total_required_count ?? 0} · 后台维护 ${setupFlow.maintenanceItems.length} 项`
          : `Core ${setupFlow.progress.required_completed_count ?? setupFlow.progress.ready_required_count ?? 0} / ${setupFlow.progress.required_total_count ?? setupFlow.progress.total_required_count ?? 0} · ${setupFlow.maintenanceItems.length} background item(s)`)
      : (settings.locale === "zh" ? "本次启动未取得自检结果，应用继续可用" : "No startup-check result was returned; the app remains usable");
  const gatewayAction = (kind: GatewayActionViewModel["kind"]) => actionViewModel.gatewayActions.find((action) => action.kind === kind);
  const modelAccessState = gatewayModelAccessState(projection);
  const gatewayConnectionState = gatewayConnectionPresentation(projection, gateway, stateStatus);
  const gatewayAccountReady = gatewayConnectionState === "account"
    && gateway !== undefined
    && !["setup_required", "reauth_required"].includes(gateway.status);

  useEffect(() => {
    if (selectedDestination === "capabilities" && capabilityStatus === "idle") onRefreshCapabilities();
  }, [capabilityStatus, onRefreshCapabilities, selectedDestination]);

  useEffect(() => {
    if (actionBusyKey !== null) feedbackDestinationRef.current = selectedDestination;
  }, [actionBusyKey, selectedDestination]);

  useEffect(() => {
    if (!confirmationOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmationCancelRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [confirmationOpen]);

  function settingValueLabel(key: SettingKey, value: WorkbenchSettings[SettingKey]): string {
    if (key === "modelAccess") return value === "__auto" ? (settings.locale === "zh" ? "自动" : "Auto") : modelLabel(value as string, settings.locale);
    if (key === "reasoningLevel") return reasoningLabel(value as string, settings.locale, true);
    if (key === "defaultWorkspace") return settings.locale === "zh" ? "当前工作区" : "Current workspace";
    if (key === "runtimeProfile") return value === "fast" ? (settings.locale === "zh" ? "快速" : "Fast") : (settings.locale === "zh" ? "完整" : "Full");
    if (key === "professionalStarterDefaults") return settings.locale === "zh" ? "科研、基金与演示" : "Research, grant, and presentation";
    if (key === "theme") {
      if (value === "system") return settings.locale === "zh" ? "跟随系统" : "System";
      return value === "dark" ? (settings.locale === "zh" ? "深色" : "Dark") : (settings.locale === "zh" ? "浅色" : "Light");
    }
    if (key === "artifactPreviewMode") return settings.locale === "zh" ? "丰富预览（仅引用）" : "Rich preview (refs only)";
    if (typeof value === "boolean") return value ? (settings.locale === "zh" ? "开" : "On") : (settings.locale === "zh" ? "关" : "Off");
    return String(value);
  }

  function renderSettingControl(key: SettingKey) {
    const value = settings[key];
    if (typeof value === "boolean") {
      return (
        <button className="setting-switch" role="switch" aria-checked={value} type="button" onClick={() => onSettingChange(key, !value)}>
          <span className="setting-switch-track" aria-hidden="true"><span /></span>
          <span>{settingValueLabel(key, value)}</span>
        </button>
      );
    }
    if (key === "locale") {
      return (
        <div className="segmented-control" data-testid="opl-locale-toggle" aria-label="Language">
          <button type="button" data-active={value === "zh"} onClick={() => onSettingChange("locale", "zh")}>中文</button>
          <button type="button" data-active={value === "en"} onClick={() => onSettingChange("locale", "en")}>English</button>
        </div>
      );
    }
    if (key === "reasoningLevel") {
      return (
        <select className="setting-select" data-testid="opl-settings-reasoning" aria-label={settings.locale === "zh" ? "推理强度" : "Reasoning effort"} value={resolvedReasoning} disabled={!resolvedModel} onChange={(event) => onReasoningChange(event.currentTarget.value)}>
          {codexModelPolicy.reasoningOptions.map((effort) => (
            <option key={effort} value={effort} disabled={!resolvedReasoningOptions.includes(effort)}>{reasoningLabel(effort, settings.locale, true)}</option>
          ))}
        </select>
      );
    }
    if (key === "modelAccess") {
      return (
        <select className="setting-select" data-testid="opl-model-access-entry" aria-label={settings.locale === "zh" ? "会话模型" : "Conversation model"} value={value} onChange={(event) => onSettingChange("modelAccess", event.currentTarget.value)}>
          <option value="__auto">{autoModelLabel(settings.locale)}</option>
          {value !== "__auto" && !modelOptions.some((option) => option.id === value) ? (
            <option value={value} disabled>{modelLabel(value, settings.locale)} ({settings.locale === "zh" ? "不可用" : "Unavailable"})</option>
          ) : null}
          {modelOptions.map((option) => (
            <option key={option.id} value={option.id} disabled={!option.available}>
              {modelLabel(option.id, settings.locale)}{option.available ? "" : ` (${settings.locale === "zh" ? "不可用" : "Unavailable"})`}
            </option>
          ))}
        </select>
      );
    }
    if (key === "runtimeProfile") {
      return <button className="setting-toggle" type="button" onClick={() => onSettingChange("runtimeProfile", value === "fast" ? "full" : "fast")}>{settingValueLabel(key, value)}</button>;
    }
    return <span>{settingValueLabel(key, value)}</span>;
  }

  function renderContent() {
    if (selectedDestination === "overview") {
      return (
        <>
          <SettingsGroup title={settings.locale === "zh" ? "账户" : "Account"}>
            <SettingRow label={settings.locale === "zh" ? "模型访问" : "Model access"}>
              {gateway ? (
                <span className="settings-inline-identity">
                  <span className="settings-avatar" aria-hidden="true">{gatewayAccountInitials(gateway.displayName)}</span>
                  <span><strong data-testid="opl-settings-gateway-username">{gateway.displayName}</strong><small>{gateway.email ?? "OPL Gateway"}</small></span>
                </span>
              ) : (
                <span className="settings-inline-identity" data-testid="opl-settings-gateway-unavailable">
                  <span><strong>{gatewayUnavailableLabel}</strong><small>{gatewayUnavailableDetail}</small></span>
                </span>
              )}
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "连接状态" : "Connection status"}><StatusValue status={gateway?.status ?? (stateLoading ? "loading" : stateFailed ? "attention_needed" : "not_configured")} locale={settings.locale} /></SettingRow>
          </SettingsGroup>
          <SettingsGroup title={settings.locale === "zh" ? "当前运行状态" : "Current status"}>
            <SettingRow label={settings.locale === "zh" ? "本机助手" : "Local assistant"} detail={projection?.codex.version ? `${settings.locale === "zh" ? "版本" : "Version"} ${projection.codex.version}` : undefined}>
              <StatusValue status={projection?.codex.versionStatus ?? (projection?.codex.installed ? "ready" : undefined)} locale={settings.locale} />
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "模型" : "Model"}><span>{modelLabel(projection?.codex.model ?? resolvedModel?.id ?? "--", settings.locale)}</span></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "工作目录" : "Working directory"}><code>{projection?.workspace.selectedPath ?? statePlaceholder}</code></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "设置状态" : "Settings status"}>
              <StatusValue status={readbackStatus} locale={settings.locale} />
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "启动自检" : "Startup check"} detail={initializationDetail}>
              <span className="runtime-setting-control">
                <StatusValue status={initializationPresentationStatus} locale={settings.locale} />
                <button className="settings-icon-button" type="button" aria-label={settings.locale === "zh" ? "重新运行启动自检" : "Run startup check again"} title={settings.locale === "zh" ? "重新运行启动自检" : "Run startup check again"} disabled={initializationStatus === "loading"} onClick={onRefreshInitialization}>
                  {initializationStatus === "loading" ? <LoaderCircle className="spin" aria-hidden="true" size={14} /> : <RefreshCw aria-hidden="true" size={14} />}
                </button>
              </span>
            </SettingRow>
          </SettingsGroup>
        </>
      );
    }

    if (selectedDestination === "account") {
      const refreshAction = gatewayAction("refresh");
      const disconnectAction = gatewayAction("disconnect");
      const useForModelAccessAction = gatewayAction("use_for_model_access");
      const exceptionActions = actionViewModel.gatewayActions.filter((action) => (
        action.availability === "ready"
        && action.kind !== "refresh"
        && action.kind !== "disconnect"
        && action.kind !== "use_for_model_access"
      ));
      const gatewayLoginVisible = Boolean(onGatewayLogin)
        && (gatewayConnectionState === "none" || gatewayConnectionState === "account" || gatewayConnectionState === "manual_key")
        && (!gatewayAccountReady || editingAccess)
        && accessSetupMode === "account";
      const apiKeySetupVisible = setupCapabilities.modelAccessSecretInput
        && (gatewayConnectionState === "none" || editingAccess)
        && accessSetupMode === "api_key";
      const showAccessChoice = gatewayConnectionState === "none"
        || (gatewayConnectionState === "account" && !gatewayAccountReady)
        || editingAccess;
      const showAccountDetails = gatewayAccountReady && !editingAccess;
      const showManualKeySummary = gatewayConnectionState === "manual_key" && !editingAccess;
      const accessModeLabel = gatewayConnectionState === "manual_key"
        ? (settings.locale === "zh" ? "API Key" : "API Key")
        : (settings.locale === "zh" ? "OPL Gateway 账户" : "OPL Gateway account");
      return (
        <>
          {projection?.codex.installed === false && setupCapabilities.codexInstall ? (
            <SettingsGroup title={settings.locale === "zh" ? "本机助手" : "Local assistant"}>
              <SettingRow label={settings.locale === "zh" ? "Codex CLI" : "Codex CLI"} detail={settings.locale === "zh" ? "安装到 OPL 管理的位置，不修改系统级工具" : "Installs into the OPL-managed location without changing system tools"}>
                <button className="settings-action-button primary" type="button" disabled={actionBusyKey !== null} onClick={() => { void onInstallCodex(); }}>
                  {actionBusyKey === "setup:codex-install" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <Download aria-hidden="true" size={13} />}
                  {settings.locale === "zh" ? "安装" : "Install"}
                </button>
              </SettingRow>
            </SettingsGroup>
          ) : null}
          {showAccessChoice ? (
            <SettingsGroup title={settings.locale === "zh" ? "模型访问设置" : "Model access setup"}>
              <div className="settings-access-setup">
                <div className="settings-access-setup-header">
                  <div className="segmented-control" role="group" aria-label={settings.locale === "zh" ? "模型访问方式" : "Model access method"}>
                    <button type="button" data-active={accessSetupMode === "account"} onClick={() => setAccessSetupMode("account")}>{settings.locale === "zh" ? "OPL Gateway 账户" : "OPL Gateway account"}</button>
                    <button type="button" data-active={accessSetupMode === "api_key"} onClick={() => setAccessSetupMode("api_key")}>API Key</button>
                  </div>
                  {editingAccess && gatewayConnectionState !== "none" ? (
                    <button
                      className="settings-action-button"
                      type="button"
                      onClick={() => {
                        setGatewayPassword("");
                        setCodexApiKey("");
                        setEditingAccess(false);
                      }}
                    >
                      {settings.locale === "zh" ? "取消" : "Cancel"}
                    </button>
                  ) : null}
                </div>
                {accessSetupMode === "account" && gatewayLoginVisible ? (
                    <form
                      className="gateway-login-form"
                      data-testid="opl-settings-gateway-login"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!onGatewayLogin || !gatewayEmail.trim() || !gatewayPassword) return;
                        const password = gatewayPassword;
                        setGatewayPassword("");
                        void onGatewayLogin({
                          email: gatewayEmail.trim(),
                          password
                        }).then((ok) => {
                          if (ok) {
                            setGatewayEmail("");
                            setEditingAccess(false);
                          }
                        });
                      }}
                    >
                      <label>
                        <span>{settings.locale === "zh" ? "邮箱" : "Email"}</span>
                        <input type="email" autoComplete="username" value={gatewayEmail} onChange={(event) => setGatewayEmail(event.currentTarget.value)} required />
                      </label>
                      <label>
                        <span>{settings.locale === "zh" ? "密码" : "Password"}</span>
                        <input type="password" autoComplete="current-password" value={gatewayPassword} onChange={(event) => setGatewayPassword(event.currentTarget.value)} required />
                      </label>
                      <button className="settings-action-button primary" type="submit" disabled={actionBusyKey !== null || !gatewayEmail.trim() || !gatewayPassword}>
                        {actionBusyKey === "gateway:login" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <LogIn aria-hidden="true" size={13} />}
                        {settings.locale === "zh" ? "登录" : "Sign in"}
                      </button>
                    </form>
                ) : accessSetupMode === "api_key" && apiKeySetupVisible ? (
                  <form
                    className="settings-api-key-form"
                    data-testid="opl-settings-codex-api-key"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const apiKey = codexApiKey.trim();
                      if (!apiKey) return;
                      setCodexApiKey("");
                      void onConfigureCodexApiKey(apiKey).then((ok) => {
                        if (ok) setEditingAccess(false);
                      });
                    }}
                  >
                    <label>
                      <span>API Key</span>
                      <input type="password" autoComplete="off" value={codexApiKey} onChange={(event) => setCodexApiKey(event.currentTarget.value)} required />
                    </label>
                    <button className="settings-action-button primary" type="submit" disabled={actionBusyKey !== null || !codexApiKey.trim()}>
                      {actionBusyKey === "model-access:api-key" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <Save aria-hidden="true" size={13} />}
                      {settings.locale === "zh" ? "配置" : "Configure"}
                    </button>
                    <small>{settings.locale === "zh" ? "密钥仅通过专用通道交给凭据所有者，Studio 不保存或回显。" : "The key goes directly to the credential owner; Studio neither stores nor echoes it."}</small>
                  </form>
                ) : (
                  <p className="settings-access-note" data-testid="opl-settings-access-unavailable">
                    {settings.locale === "zh" ? "当前没有可用的凭据配置入口。" : "No credential setup path is available right now."}
                  </p>
                )}
              </div>
            </SettingsGroup>
          ) : null}
          {showAccountDetails ? (
            <>
              <div className="gateway-identity">
                <span className="settings-avatar large" aria-hidden="true">{gatewayAccountInitials(gateway.displayName)}</span>
                <span>
                  <strong data-testid="opl-settings-gateway-username">{gateway.displayName}</strong>
                  <small>{gateway.email ?? "OPL Gateway"}</small>
                </span>
                <span className="runtime-setting-control">
                  <StatusValue status={gateway.status} locale={settings.locale} />
                  <SettingsIntentButton intent={disconnectAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} />
                </span>
              </div>
              <SettingsGroup title={settings.locale === "zh" ? "账户" : "Account"}>
                <SettingRow label={settings.locale === "zh" ? "账户状态" : "Account status"}><StatusValue status={gateway.accountStatus ?? gateway.status} locale={settings.locale} /></SettingRow>
                <SettingRow label={settings.locale === "zh" ? "余额" : "Balance"}><strong>{formatAmount(gateway.balance?.amount, gateway.balance?.currency, locale)}</strong></SettingRow>
                <SettingRow label={settings.locale === "zh" ? "今日用量" : "Usage today"}><span>{formatNumber(gateway.usage?.todayTokens, locale, true)} {settings.locale === "zh" ? "令牌" : "tokens"} · {formatAmount(gateway.usage?.todayCost, gateway.usage?.currency, locale)}</span></SettingRow>
                <SettingRow label={settings.locale === "zh" ? "累计用量" : "Total usage"}><span>{formatNumber(gateway.usage?.totalTokens, locale, true)} {settings.locale === "zh" ? "令牌" : "tokens"} · {formatAmount(gateway.usage?.totalCost, gateway.usage?.currency, locale)}</span></SettingRow>
              </SettingsGroup>
              <SettingsGroup title={settings.locale === "zh" ? "此设备" : "This device"}>
            <SettingRow
              label={settings.locale === "zh" ? "本机默认模型来源" : "Default model source on this device"}
              detail={modelAccessState === "unknown"
                ? (settings.locale === "zh" ? "刷新状态后确认" : "Refresh status to confirm")
                : modelAccessState === "different"
                  ? (settings.locale === "zh" ? "当前不是 OPL Gateway" : "OPL Gateway is not the current source")
                  : undefined}
            >
              <span className="runtime-setting-control" data-testid="opl-settings-model-access-source">
                {modelAccessState === "current" ? (
                  <span className="settings-status" data-tone="ready"><span aria-hidden="true" />OPL Gateway</span>
                ) : modelAccessState === "different" ? (
                  <span>{projection?.codex.providerName ?? projection?.codex.modelAccessSource}</span>
                ) : (
                  <span className="settings-muted">{settings.locale === "zh" ? "待确认" : "Not confirmed"}</span>
                )}
                {modelAccessState === "different" ? (
                  <SettingsIntentButton intent={useForModelAccessAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} primary />
                ) : null}
              </span>
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "本机" : "This device"}><span>{gateway?.installation?.deviceLabel ?? "--"}</span></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "设备访问" : "Device access"}><StatusValue status={gateway?.managedKey?.status} locale={settings.locale} /></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "最近刷新" : "Last refresh"} detail={gateway?.freshness?.stale ? (settings.locale === "zh" ? "数据可能已过期" : "Data may be stale") : undefined}>
              <span className="runtime-setting-control">
                <span>{formatDate(gateway?.freshness?.observedAt, locale)}</span>
                <SettingsIntentButton intent={refreshAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} />
              </span>
            </SettingRow>
            {exceptionActions.length ? (
              <SettingRow label={settings.locale === "zh" ? "账户操作" : "Account actions"}>
                <span className="runtime-setting-control">
                  {exceptionActions.map((intent) => <SettingsIntentButton key={intent.key} intent={intent} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} primary />)}
                </span>
              </SettingRow>
            ) : null}
              </SettingsGroup>
            </>
          ) : showManualKeySummary ? (
            <SettingsGroup title={settings.locale === "zh" ? "模型访问设置" : "Model access setup"}>
              <SettingRow label={settings.locale === "zh" ? "当前方式" : "Current method"} detail={settings.locale === "zh" ? "密钥由凭据所有者管理，Studio 不保存或回显。" : "The credential owner manages the key; Studio does not store or echo it."}>
                <span className="runtime-setting-control" data-testid="opl-settings-api-key-state">
                  <span className="settings-status" data-tone="ready"><span aria-hidden="true" />{accessModeLabel}</span>
                  <button className="settings-action-button" type="button" onClick={() => { setAccessSetupMode("api_key"); setEditingAccess(true); }}>
                    <Save aria-hidden="true" size={13} />
                    {settings.locale === "zh" ? "更换" : "Change"}
                  </button>
                </span>
              </SettingRow>
            </SettingsGroup>
          ) : (
            gatewayConnectionState === "loading" || gatewayConnectionState === "error" ? (
              <div className="settings-inline-notice" data-testid="opl-settings-gateway-empty">
                <AlertCircle aria-hidden="true" size={15} />
                <span>{gatewayConnectionState === "loading" ? gatewayUnavailableLabel : gatewayUnavailableDetail}</span>
              </div>
            ) : null
          )}
          {(showAccountDetails || showManualKeySummary) ? (
            <div className="settings-access-change" data-testid="opl-settings-access-change">
              <button className="settings-action-button" type="button" onClick={() => { setAccessSetupMode("account"); setEditingAccess(true); }}>
                <RotateCcw aria-hidden="true" size={13} />
                {settings.locale === "zh" ? "更换访问方式" : "Change access method"}
              </button>
            </div>
          ) : null}
          {!refreshAction ? <button className="settings-icon-button settings-page-refresh" type="button" aria-label={settings.locale === "zh" ? "刷新状态" : "Refresh status"} title={settings.locale === "zh" ? "刷新状态" : "Refresh status"} onClick={onRefresh}><RefreshCw aria-hidden="true" size={14} /></button> : null}
        </>
      );
    }

    if (selectedDestination === "models") {
      return (
        <>
          <SettingsGroup title={settings.locale === "zh" ? "会话配置" : "Session configuration"}>
            <SettingRow label={settings.locale === "zh" ? "模型" : "Model"} detail={unavailableFixedModel ? (settings.locale === "zh" ? "所选模型当前不可用" : "Selected model is unavailable") : undefined}>{renderSettingControl("modelAccess")}</SettingRow>
            <SettingRow label={settings.locale === "zh" ? "强度" : "Effort"}>{renderSettingControl("reasoningLevel")}</SettingRow>
          </SettingsGroup>
          <SettingsGroup title={settings.locale === "zh" ? "当前配置" : "Current setup"}>
            <SettingRow label={settings.locale === "zh" ? "当前模型" : "Current model"}><span>{modelLabel(projection?.codex.model ?? "--", settings.locale)}</span></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "当前强度" : "Current effort"}><span>{projection?.codex.reasoningEffort ? reasoningLabel(projection.codex.reasoningEffort, settings.locale, true) : "--"}</span></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "模型访问方式" : "Model access"}><span>{projection?.codex.providerName ?? "--"}</span></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "访问状态" : "Access status"}><StatusValue status={projection?.codex.accessStatus} locale={settings.locale} /></SettingRow>
          </SettingsGroup>
        </>
      );
    }

    if (selectedDestination === "resources") {
      const dockerActions = projection?.dockerWebui.actions ?? [];
      const diagnoseAction = dockerActions.find((action) => action.actionId === "settings_diagnose_docker_webui");
      const diagnoseBusy = actionBusyKey === "runtime:settings_diagnose_docker_webui";
      const diagnosticStatus = diagnoseBusy ? "checking" : dockerDiagnostic?.status ?? "not_checked";
      const webAccessStatus = projection?.dockerWebui.status === "action_available"
        ? "setup_required"
        : projection?.dockerWebui.status;
      const ordinaryActions = dockerActions.filter((action) => (
        action.actionId !== "settings_diagnose_docker_webui"
        && action.state !== "unavailable"
        && actionPayloadComplete(action.payload, action.requiredPayloadFields)
      ));
      return (
        <>
          <SettingsGroup title={settings.locale === "zh" ? "外部连接" : "External connections"}>
            {projection?.externalConnections.length ? projection.externalConnections.map((connection) => (
              <SettingRow key={connection.id} label={connection.name}><StatusValue status={connection.status} locale={settings.locale} /></SettingRow>
            )) : <SettingRow label={settings.locale === "zh" ? "连接" : "Connections"}><span className="settings-muted">{settings.locale === "zh" ? "暂无外部连接" : "No external connections"}</span></SettingRow>}
          </SettingsGroup>
          <SettingsContributionSection contributions={contributions} locale={settings.locale} destination="resources" />
          <SettingsGroup title={settings.locale === "zh" ? "网页访问" : "Web access"}>
            <SettingRow label={settings.locale === "zh" ? "配置状态" : "Configuration"} detail={ordinaryActions.length ? (settings.locale === "zh" ? `${ordinaryActions.length} 个可用操作` : `${ordinaryActions.length} available actions`) : undefined}><StatusValue status={webAccessStatus} locale={settings.locale} /></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "运行检查" : "Runtime check"} detail={dockerDiagnostic
              ? (settings.locale === "zh" ? `上次诊断${dockerDiagnostic.attentionCount ? `发现 ${dockerDiagnostic.attentionCount} 项需要处理` : "未发现需要处理的项目"}` : `Last check found ${dockerDiagnostic.attentionCount ?? 0} item(s) requiring attention`)
              : (settings.locale === "zh" ? "只读检查，不会启动、停止或修改 Docker" : "Read-only; does not start, stop, or modify Docker")}>
              <span className="runtime-setting-control"><StatusValue status={diagnosticStatus} locale={settings.locale} /><RuntimeActionButton action={diagnoseAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /></span>
            </SettingRow>
            {dockerDiagnostic ? (
              <>
                <SettingRow label={settings.locale === "zh" ? "Docker 服务" : "Docker service"}><StatusValue status={dockerDiagnostic.dockerRuntimeStatus} locale={settings.locale} /></SettingRow>
                <SettingRow label={settings.locale === "zh" ? "网页地址" : "Web address"}><StatusValue status={dockerDiagnostic.browserUrlStatus} locale={settings.locale} /></SettingRow>
                <SettingRow label={settings.locale === "zh" ? "启动准备" : "Startup preparation"}><StatusValue status={dockerDiagnostic.startupMaintenanceStatus ?? dockerDiagnostic.startupPhase} locale={settings.locale} /></SettingRow>
              </>
            ) : null}
            <SettingRow label={settings.locale === "zh" ? "恢复能力" : "Recovery"}><StatusValue status={projection?.dockerWebui.recoveryStatus} locale={settings.locale} /></SettingRow>
            {ordinaryActions.length ? (
              <SettingRow label={settings.locale === "zh" ? "可用操作" : "Available actions"}>
                <span className="runtime-setting-control">{ordinaryActions.map((action) => <RuntimeActionButton key={action.actionId} action={action} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} />)}</span>
              </SettingRow>
            ) : null}
          </SettingsGroup>
        </>
      );
    }

    if (selectedDestination === "workspace") {
      return (
        <SettingsGroup title={settings.locale === "zh" ? "工作目录" : "Working directory"}>
          <SettingRow
            label={settings.locale === "zh" ? "位置" : "Location"}
            detail={!setupCapabilities.workspaceRoot ? (settings.locale === "zh" ? "当前运行方式只读显示此位置" : "This app mode shows the location as read-only") : undefined}
          >
            <span className="runtime-setting-control settings-workspace-location">
              <code>{projection?.workspace.selectedPath ?? "--"}</code>
              {setupCapabilities.workspaceRoot ? (
                <button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={() => { void onChooseWorkspaceRoot(); }}>
                  {actionBusyKey === "setup:workspace-root" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <FolderOpen aria-hidden="true" size={13} />}
                  {settings.locale === "zh" ? "选择目录" : "Choose folder"}
                </button>
              ) : null}
            </span>
          </SettingRow>
          <SettingRow label={settings.locale === "zh" ? "目录存在" : "Directory exists"}><span>{projection?.workspace.exists === null || projection?.workspace.exists === undefined ? "--" : projection.workspace.exists ? (settings.locale === "zh" ? "是" : "Yes") : (settings.locale === "zh" ? "否" : "No")}</span></SettingRow>
          <SettingRow label={settings.locale === "zh" ? "可写" : "Writable"}><span>{projection?.workspace.writable === null || projection?.workspace.writable === undefined ? "--" : projection.workspace.writable ? (settings.locale === "zh" ? "是" : "Yes") : (settings.locale === "zh" ? "否" : "No")}</span></SettingRow>
          <SettingRow label={settings.locale === "zh" ? "健康状态" : "Health"}><StatusValue status={projection?.workspace.healthStatus} locale={settings.locale} /></SettingRow>
        </SettingsGroup>
      );
    }

    if (selectedDestination === "storage") {
      const agentStore = projection?.storage.agentPackageStore;
      const webuiStore = projection?.storage.webuiDataVolume;
      return (
        <>
          <div className="settings-page-summary"><span>{settings.locale === "zh" ? "仅显示可确认的用量；未知不会显示为 0" : "Only confirmed usage is shown; unknown usage is never shown as zero"}</span></div>
          <SettingsGroup title={settings.locale === "zh" ? "智能体数据" : "Agent data"}>
            <SettingRow label={settings.locale === "zh" ? "用量统计" : "Usage"} detail={storageReason(agentStore, settings.locale)}>
              <span className="runtime-setting-control">
                <StatusValue status={storagePresentationStatus(agentStore)} locale={settings.locale} />
                <RuntimeActionButton action={agentStore?.inventoryAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} />
              </span>
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "已用空间" : "Used space"}><span>{storageAmount(agentStore?.bytes, agentStore, locale)}</span></SettingRow>
            {agentStore?.projectedAction?.kind === "navigate" ? <SettingRow label={settings.locale === "zh" ? "管理位置" : "Manage in"}><span>{settings.locale === "zh" ? "智能体" : "Agents"}</span></SettingRow> : null}
            {agentStore?.reclaimableBytes !== undefined ? <SettingRow label={settings.locale === "zh" ? "可清理" : "Reclaimable"}><span>{storageAmount(agentStore.reclaimableBytes, agentStore, locale)}</span></SettingRow> : null}
          </SettingsGroup>
          <SettingsGroup title={settings.locale === "zh" ? "网页端数据" : "Web app data"}>
            <SettingRow label={settings.locale === "zh" ? "使用状态" : "Usage status"} detail={storageReason(webuiStore, settings.locale)}>
              <span className="runtime-setting-control">
                <StatusValue status={storagePresentationStatus(webuiStore)} locale={settings.locale} />
                <RuntimeActionButton action={webuiStore?.inventoryAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} />
              </span>
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "已用空间" : "Used space"}><span>{storageAmount(webuiStore?.bytes, webuiStore, locale)}</span></SettingRow>
            {webuiStore?.reclaimableBytes !== undefined ? <SettingRow label={settings.locale === "zh" ? "可清理" : "Reclaimable"}><span>{storageAmount(webuiStore.reclaimableBytes, webuiStore, locale)}</span></SettingRow> : null}
          </SettingsGroup>
          {settings.developerDetails && (projection?.localEnvironment.stateDir || projection?.localEnvironment.runtimeSourcesRoot) ? (
            <SettingsGroup title={settings.locale === "zh" ? "本机位置" : "Local locations"}>
              {projection.localEnvironment.stateDir ? <SettingRow label={settings.locale === "zh" ? "应用数据" : "App data"}><code>{projection.localEnvironment.stateDir}</code></SettingRow> : null}
              {projection.localEnvironment.runtimeSourcesRoot ? <SettingRow label={settings.locale === "zh" ? "运行环境" : "Runtime data"}><code>{projection.localEnvironment.runtimeSourcesRoot}</code></SettingRow> : null}
            </SettingsGroup>
          ) : null}
        </>
      );
    }

    if (selectedDestination === "agents") {
      return (
        <PackageCatalog model={model} settings={settings} actionBusyKey={actionBusyKey} onAction={onAction} manifestInstallAction={manifestInstallAction} />
      );
    }

    if (selectedDestination === "capabilities") {
      return (
        <>
          <CapabilityDirectory packageLifecycle={model.packageLifecycle} catalog={capabilityCatalog} status={capabilityStatus} error={capabilityError} locale={settings.locale} showTechnicalDetails={settings.developerDetails} onRefresh={onRefreshCapabilities} />
          {model.managedCompanions.length ? (
            <ManagedCompanionsGroup
              companions={model.managedCompanions}
              locale={settings.locale}
              busyKey={actionBusyKey}
              onAction={onAction}
            />
          ) : null}
          <SettingsContributionSection contributions={contributions} locale={settings.locale} destination="capabilities" />
        </>
      );
    }

    if (selectedDestination === "instructions") {
      const userAgents = projection?.personalization.userAgents;
      const defaultAgents = projection?.personalization.oplFlowDefaultUserAgents;
      return (
        <>
          <div className="settings-page-summary"><span>{settings.locale === "zh" ? "本机 AGENTS.md 与新会话附加指令" : "Local AGENTS.md and new-conversation instructions"}</span><StatusValue status={readbackStatus} locale={settings.locale} /></div>
          <CodexInstructionsEditor
            userAgents={userAgents}
            defaultAgents={defaultAgents}
            additionalInstructions={additionalConversationInstructions}
            locale={settings.locale}
            busyKey={actionBusyKey}
            onRefresh={onRefresh}
            onAction={onAction}
            onAdditionalInstructionsChange={onAdditionalConversationInstructionsChange}
          />
          <SettingsGroup title={settings.locale === "zh" ? "当前上下文来源" : "Current context sources"}>
            {model.contextSources.length ? model.contextSources.map((source) => (
              <SettingRow key={source.id} label={source.label} detail={source.summary}><code>{source.ref}</code></SettingRow>
            )) : <SettingRow label={settings.locale === "zh" ? "上下文" : "Context"}><span className="settings-muted">{settings.locale === "zh" ? "当前没有额外上下文来源" : "No additional context sources"}</span></SettingRow>}
          </SettingsGroup>
        </>
      );
    }

    if (selectedDestination === "services") {
      const runtimeActions = runtime?.maintenanceActions ?? [];
      const serviceAction = runtimeActions.find((action) => action.actionId === (runtime?.temporal.serviceReady === false ? "provider_service_start" : "provider_service_status"));
      const workerAction = runtimeActions.find((action) => action.actionId === (runtime?.temporal.workerReady === false ? "provider_worker_start" : "provider_worker_status"));
      const schedulerAction = runtimeActions.find((action) => action.actionId === (runtime?.temporal.schedulerStatus === "not_installed" ? "provider_scheduler_install" : "provider_scheduler_status"));
      return (
        <>
          <SettingsGroup title={settings.locale === "zh" ? "本机能力" : "Local capabilities"}>
            <SettingRow label={settings.locale === "zh" ? "本机助手" : "Local assistant"} detail={projection?.codex.version ? `${settings.locale === "zh" ? "版本" : "Version"} ${projection.codex.version}` : undefined}><StatusValue status={projection?.codex.installed === true ? projection?.codex.versionStatus ?? "ready" : projection?.codex.installed === false ? "unavailable" : undefined} locale={settings.locale} /></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "智能体与能力" : "Agents and capabilities"}><StatusValue status={projection?.statusSummary.agentPackageHealth} locale={settings.locale} /></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "运行环境" : "Runtime environment"}><StatusValue status={projection?.statusSummary.runtimeSourceHealth} locale={settings.locale} /></SettingRow>
          </SettingsGroup>
          <SettingsContributionSection contributions={contributions} locale={settings.locale} destination="services" />
          <SettingsGroup title={settings.locale === "zh" ? "后台任务" : "Background tasks"}>
            <SettingRow label={settings.locale === "zh" ? "任务服务" : "Task service"}>
              <span className="runtime-setting-control"><StatusValue status={runtime?.temporal.serviceStatus} locale={settings.locale} /><RuntimeActionButton action={serviceAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /></span>
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "任务处理" : "Task processing"}>
              <span className="runtime-setting-control"><StatusValue status={runtime?.temporal.workerStatus} locale={settings.locale} /><RuntimeActionButton action={workerAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /></span>
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "定时任务" : "Scheduled tasks"} detail={runtime?.temporal.observedAt ? formatDate(runtime.temporal.observedAt, locale) : undefined}>
              <span className="runtime-setting-control"><StatusValue status={runtime?.temporal.schedulerStatus} locale={settings.locale} /><RuntimeActionButton action={schedulerAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} primary={statusTone(runtime?.temporal.schedulerStatus) === "attention"} /></span>
            </SettingRow>
          </SettingsGroup>
          <SettingsGroup title={settings.locale === "zh" ? `运行环境 ${runtime?.carriers.healthy ?? 0} / ${runtime?.carriers.total ?? 0}` : `Runtime environments ${runtime?.carriers.healthy ?? 0} / ${runtime?.carriers.total ?? 0}`}>
            {runtime?.carriers.items.length ? runtime.carriers.items.map((carrier) => (
              <SettingRow key={carrier.packageId} label={carrier.label}><StatusValue status={carrier.status} locale={settings.locale} /></SettingRow>
            )) : <SettingRow label={settings.locale === "zh" ? "运行环境" : "Runtime environments"}><span className="settings-muted">--</span></SettingRow>}
          </SettingsGroup>
        </>
      );
    }

    if (selectedDestination === "updates") {
      const component = (componentId: "opl_app" | "opl_base" | "opl_packages") => (
        actionViewModel.managedUpdates.find((item) => item.componentId === componentId)
      );
      return (
        <>
          <div className="settings-page-summary">
            <span>{settings.locale === "zh" ? "分别检查应用、基础服务和智能体能力" : "Updates are checked separately for the app, base services, and agent capabilities"}</span>
            <span>{settings.locale === "zh" ? `状态刷新于 ${formatDate(model.stateGeneratedAt, locale)}` : `Status refreshed ${formatDate(model.stateGeneratedAt, locale)}`}</span>
          </div>
          <ManagedUpdateGroup
            component={component("opl_app")?.component}
            nativeUpdate={nativeAppUpdate}
            fallbackLabel="One Person Lab"
            managedChannel={managedUpdate?.channel ?? projection?.localEnvironment.releaseChannel ?? projection?.statusSummary.releaseChannel}
            actions={component("opl_app")?.actions ?? []}
            locale={settings.locale}
            busyKey={actionBusyKey}
            onAction={onAction}
            onHostAction={onHostAction}
            unavailableActionLabel={settings.locale === "zh" ? "暂不可用" : "Unavailable"}
          />
          <ManagedUpdateGroup
            component={component("opl_base")?.component}
            fallbackLabel={settings.locale === "zh" ? "基础服务" : "Base services"}
            managedChannel={managedUpdate?.channel}
            actions={component("opl_base")?.actions ?? []}
            locale={settings.locale}
            busyKey={actionBusyKey}
            onAction={onAction}
            onHostAction={onHostAction}
            unavailableActionLabel={settings.locale === "zh" ? "暂不可用" : "Unavailable"}
          />
          <ManagedUpdateGroup
            component={component("opl_packages")?.component}
            fallbackLabel={settings.locale === "zh" ? "智能体与能力" : "Agents and capabilities"}
            managedChannel={managedUpdate?.channel}
            actions={component("opl_packages")?.actions ?? []}
            locale={settings.locale}
            busyKey={actionBusyKey}
            onAction={onAction}
            onHostAction={onHostAction}
            unavailableActionLabel={settings.locale === "zh" ? "暂不可用" : "Unavailable"}
          />
          {actionViewModel.additionalMaintenanceActions.some((intent) => (
            intent.availability === "ready" && (intent.transport === "app_action" || Boolean(onHostAction))
          )) ? (
            <details className="settings-advanced-actions">
              <summary>{settings.locale === "zh" ? "更多维护操作" : "More maintenance actions"}<ChevronDown aria-hidden="true" size={14} /></summary>
              <div>{actionViewModel.additionalMaintenanceActions.map((intent) => <SettingsIntentButton key={intent.key} intent={intent} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} onHostAction={onHostAction} />)}</div>
            </details>
          ) : null}
        </>
      );
    }

    if (selectedDestination === "diagnostics") {
      const appLogDirectory = carrierDiagnostics.application?.systemInfo.logDir;
      const appLogDirectoryDetail = carrierLogDetail(carrierDiagnostics, settings.locale);
      return (
        <>
          <SettingsGroup title={settings.locale === "zh" ? "日志与诊断" : "Logs and diagnostics"}>
            <SettingRow label={settings.locale === "zh" ? "整体状态" : "Overall status"} detail={stateFailed ? (settings.locale === "zh" ? "请刷新后重试" : "Refresh to try again") : undefined}><StatusValue status={readbackStatus} locale={settings.locale} /></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "待处理项目" : "Items requiring attention"}><span>{projection?.statusSummary.issueCount ?? "--"}</span></SettingRow>
            <SettingRow
              label={settings.locale === "zh" ? "应用日志" : "Application logs"}
              detail={appLogDirectoryDetail}
            >
              <div className="settings-row-actions">
                <StatusValue status={carrierDiagnostics.status === "available" ? "ready" : carrierDiagnostics.status} locale={settings.locale} />
                {carrierDiagnostics.setLogDirectorySupported ? (
                  <button
                    className="settings-inline-command"
                    type="button"
                    disabled={actionBusyKey === "application.setLogDirectory"}
                    onClick={onChangeLogDirectory}
                  >
                    {actionBusyKey === "application.setLogDirectory"
                      ? <LoaderCircle aria-hidden="true" className="spin" size={14} />
                      : <FolderOpen aria-hidden="true" size={14} />}
                    {settings.locale === "zh" ? "更改目录" : "Change directory"}
                  </button>
                ) : null}
              </div>
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "显示技术详情" : "Show technical details"}>{renderSettingControl("developerDetails")}</SettingRow>
          </SettingsGroup>
          {settings.developerDetails ? (
            <SettingsGroup title={settings.locale === "zh" ? "高级详情" : "Advanced details"}>
              <SettingRow label={settings.locale === "zh" ? "应用日志路径" : "Application log path"}><code>{appLogDirectory ?? (settings.locale === "zh" ? "不可用" : "Unavailable")}</code></SettingRow>
              {stateError ? <SettingRow label={settings.locale === "zh" ? "最近错误" : "Latest error"}><code>{stateError}</code></SettingRow> : null}
              {carrierDiagnostics.reasonCode ? <SettingRow label={settings.locale === "zh" ? "状态代码" : "Status code"}><code>{carrierDiagnostics.reasonCode}</code></SettingRow> : null}
              <SettingRow label={settings.locale === "zh" ? "基础服务日志" : "Base service logs"}><code>{projection?.localEnvironment.logsDir ?? "--"}</code></SettingRow>
              <SettingRow label={settings.locale === "zh" ? "应用数据目录" : "Application data directory"}><code>{projection?.localEnvironment.stateDir ?? "--"}</code></SettingRow>
              <SettingRow label={settings.locale === "zh" ? "运行环境目录" : "Runtime directory"}><code>{projection?.localEnvironment.runtimeSourcesRoot ?? "--"}</code></SettingRow>
              <SettingRow label={settings.locale === "zh" ? "本机助手路径" : "Local assistant path"}><code>{projection?.codex.binaryPath ?? "--"}</code></SettingRow>
            </SettingsGroup>
          ) : null}
          <button className="settings-icon-button settings-page-refresh" type="button" aria-label={settings.locale === "zh" ? "刷新状态" : "Refresh status"} title={settings.locale === "zh" ? "刷新状态" : "Refresh status"} onClick={onRefresh}><RefreshCw aria-hidden="true" size={14} /></button>
        </>
      );
    }

    if (selectedDestination === "preferences") {
      return (
        <>
          <SettingsGroup title={settings.locale === "zh" ? "界面" : "Interface"}>
            <SettingRow label={settings.locale === "zh" ? "语言" : "Language"}>{renderSettingControl("locale")}</SettingRow>
            <AppearanceRow
              t={(key) => ({
                "appearance.title": settings.locale === "zh" ? "外观" : "Appearance",
                "appearance.light": settings.locale === "zh" ? "浅色" : "Light",
                "appearance.dark": settings.locale === "zh" ? "深色" : "Dark",
                "appearance.system": settings.locale === "zh" ? "跟随系统" : "System"
              })[key] ?? key}
              setTheme={(theme) => onSettingChange("theme", theme)}
              useStore={(selector) => selector({ preference: settings.theme, revision: 0 })}
              actions={{ sync: () => undefined }}
            />
            <SettingRow label={settings.locale === "zh" ? "文件预览" : "File previews"}>{renderSettingControl("artifactPreviewMode")}</SettingRow>
          </SettingsGroup>
          <SettingsGroup title={settings.locale === "zh" ? "执行" : "Execution"}>
            <SettingRow label={settings.locale === "zh" ? "任务完成通知" : "Task completion notifications"}>{renderSettingControl("notificationEnabled")}</SettingRow>
            <SettingRow label={settings.locale === "zh" ? "执行前确认" : "Confirm before execute"}>{renderSettingControl("confirmBeforeExecute")}</SettingRow>
            <SettingRow label={settings.locale === "zh" ? "新任务工作区" : "New task workspace"}>{renderSettingControl("defaultWorkspace")}</SettingRow>
          </SettingsGroup>
        </>
      );
    }

    const appUpdate = actionViewModel.managedUpdates.find((item) => item.componentId === "opl_app");
    const appUpdateComponent = appUpdate?.component;
    const hostUpdateActions = appUpdate?.actions.filter(
      (intent): intent is SettingsHostActionIntent => intent.transport !== "app_action"
    ) ?? [];
    const updateAction = hostUpdateActions.find((intent) => intent.operation === "restart" && intent.availability === "ready")
      ?? hostUpdateActions.find((intent) => intent.operation === "apply" && intent.availability === "ready")
      ?? hostUpdateActions.find((intent) => intent.operation === "check" && intent.availability === "ready");
    const appVersion = nativeAppUpdate?.currentVersion ?? appUpdateComponent?.installedVersion ?? "--";
    const updateChannel = appUpdateComponent?.channel
      ?? managedUpdate?.channel
      ?? projection?.localEnvironment.releaseChannel
      ?? projection?.statusSummary.releaseChannel;
    return (
      <div data-testid="settings-page-about">
        <SettingsGroup title={settings.locale === "zh" ? "One Person Lab 预览版" : "One Person Lab Preview"}>
          <div data-testid="settings-about-primary">
            <SettingRow label={settings.locale === "zh" ? "版本" : "Version"}><span>{appVersion}</span></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "发布通道" : "Release channel"}><span>{formatUpdateChannel(updateChannel, settings.locale)}</span></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "更新状态" : "Update status"}>
              <span className="runtime-setting-control">
                <StatusValue status={nativeAppUpdate?.state ?? appUpdateComponent?.state} locale={settings.locale} />
                {updateAction ? <SettingsIntentButton intent={updateAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} onHostAction={onHostAction} /> : null}
              </span>
            </SettingRow>
          </div>
          <SettingRow label={settings.locale === "zh" ? "本机助手" : "Local assistant"}><span>{projection?.codex.version ?? "--"}</span></SettingRow>
        </SettingsGroup>
      </div>
    );
  }

  return (
    <section data-testid="opl-settings-panel" className="settings-page" aria-label={settings.locale === "zh" ? "设置" : "Settings"}>
      <div className="settings-detail">
        <header className="settings-detail-header">
          <div className="settings-detail-title-row">
            <h1>{copy[selectedDestination]}</h1>
            {activeGroup && activeGroup.destinations.length > 1 ? (
              <nav className="settings-subnav" aria-label={settings.locale === "zh" ? `${activeGroup.label}分类` : `${activeGroup.label} sections`}>
                {activeGroup.destinations.filter((destination) => destination.id !== selectedDestination).map((destination) => (
                  <button
                    key={destination.id}
                    type="button"
                    onClick={() => setSubDestination(destination.id)}
                  >
                    {destination.label}
                  </button>
                ))}
              </nav>
            ) : null}
          </div>
        </header>
        <div className="settings-content" data-section={selectedDestination}>
          {actionFeedback && feedbackDestinationRef.current === selectedDestination ? (
            <div className="settings-action-feedback" data-tone={actionFeedback.tone} role="status">
              {actionFeedback.tone === "success" ? <CheckCircle2 aria-hidden="true" size={15} /> : <AlertCircle aria-hidden="true" size={15} />}
              <span>{actionFeedback.message}</span>
            </div>
          ) : null}
          {renderContent()}
        </div>
      </div>
      {pendingConfirmation ? (
        <div className="settings-action-dialog-backdrop" role="presentation">
          <section
            ref={confirmationDialogRef}
            className="settings-action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-action-dialog-title"
            data-testid="opl-settings-action-confirmation"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onCancelAction();
                return;
              }
              trapDialogFocus(event, confirmationDialogRef.current);
            }}
          >
            <div className="settings-action-dialog-icon"><Wrench aria-hidden="true" size={18} /></div>
            <div>
              <h2 id="settings-action-dialog-title">{pendingConfirmation.request.label}</h2>
              <p>{pendingConfirmation.request.actionId === "gateway_account_use_for_model_access"
                ? (settings.locale === "zh"
                    ? "确认后，本机新会话将默认通过 OPL Gateway 访问模型。账户本身不会被修改。"
                    : "New conversations on this device will use OPL Gateway for model access by default. The account itself will not be changed.")
                : (settings.locale === "zh" ? "检查已完成。确认后将执行此操作并刷新最新状态。" : "The check is complete. Confirm to run this action and refresh the latest status.")}</p>
              <small>{settings.locale === "zh" ? "预检查" : "Preview"}: {formatStatus(pendingConfirmation.previewStatus, settings.locale)}</small>
            </div>
            <div className="settings-action-dialog-actions">
              <button ref={confirmationCancelRef} type="button" onClick={onCancelAction}>{settings.locale === "zh" ? "取消" : "Cancel"}</button>
              <button className="primary" type="button" onClick={onConfirmAction} disabled={actionBusyKey !== null}>
                {actionBusyKey ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : null}
                {pendingConfirmation.request.actionId === "gateway_account_use_for_model_access"
                  ? (settings.locale === "zh" ? "切换为 OPL Gateway" : "Switch to OPL Gateway")
                  : (settings.locale === "zh" ? "确认执行" : "Confirm")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
