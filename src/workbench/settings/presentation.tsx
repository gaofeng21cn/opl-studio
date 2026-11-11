import type { ActionReceiptView } from "../actionReceiptView";

import { type KeyboardEvent } from "react";
import type { CarrierDiagnosticsReadback } from "../../bridge/oplBridge";
import type { WorkbenchGatewayAccount, WorkbenchSettingsProjection } from "../workbenchModel";

import type { WorkbenchSettings } from "../settingsModel";

import { type SettingsActionRequest } from "../settingsActions";

import { SettingsDestinationId, SettingsGroupId, SettingsDockerDiagnostic, quietDockerDiagnosticStatuses } from "./types";

export function dockerDiagnosticPresentation(
  diagnostic: SettingsDockerDiagnostic | null,
  locale: WorkbenchSettings["locale"]
): { status: string; detail: string; issues: string[] } {
  if (!diagnostic) {
    return {
      status: "not_checked",
      detail: locale === "zh" ? "尚未运行检查" : "No check has been run",
      issues: []
    };
  }
  const issueStatuses = [
    [locale === "zh" ? "Docker 服务" : "Docker service", diagnostic.dockerRuntimeStatus],
    [locale === "zh" ? "网页访问" : "Web access", diagnostic.browserUrlStatus],
    [locale === "zh" ? "启动准备" : "Startup", diagnostic.startupMaintenanceStatus ?? diagnostic.startupPhase]
  ].flatMap(([label, value]) => {
    const normalized = value?.toLowerCase();
    return value && normalized && !quietDockerDiagnosticStatuses.has(normalized) && statusTone(value) === "attention"
      ? [`${label}: ${formatStatus(value, locale)}`]
      : [];
  });
  const attentionCount = diagnostic.attentionCount ?? 0;
  if (attentionCount > 0 || issueStatuses.length > 0 || statusTone(diagnostic.status) === "attention") {
    return {
      status: "attention_needed",
      detail: locale === "zh"
        ? `检查发现 ${attentionCount || issueStatuses.length} 项需要处理`
        : `The check found ${attentionCount || issueStatuses.length} item(s) requiring attention`,
      issues: issueStatuses
    };
  }
  return {
    status: diagnostic.browserUrlStatus === "configured" ? "configured" : "not_checked",
    detail: diagnostic.browserUrlStatus === "configured"
      ? (locale === "zh" ? "已读取访问地址；请打开网页确认服务可用" : "An access address is configured; open it to verify the service")
      : (locale === "zh" ? "尚未发现网页端访问地址，无法确认部署状态" : "No WebUI address was found; deployment has not been verified"),
    issues: []
  };
}

export type SettingsActionConfirmation = {
  request: SettingsActionRequest;
  previewStatus: string;
  preview?: ActionReceiptView;
  confirmationId?: string;
  receiptId?: string;
};

export function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(
    'summary, button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.closest('[hidden], [aria-hidden="true"]') && element.getClientRects().length > 0 && element.checkVisibility?.() !== false);
}

export function trapDialogFocus(event: KeyboardEvent<HTMLElement>, root: HTMLElement | null): void {
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

export type NavigationDestination = {
  id: SettingsDestinationId;
  label: string;
};

export type NavigationGroup = {
  id: SettingsGroupId;
  label: string;
  destinations: NavigationDestination[];
};

export function statusTone(status: string | undefined): "ready" | "attention" | "neutral" {
  if (!status) return "neutral";
  const normalized = status.toLowerCase();
  // Currentness is a separate axis from callability. Handle compound states
  // before the broad "current"/"available" matches below.
  if (["currentness_not_checked", "unknown", "not_checked", "staged", "pending"].includes(normalized)) return "neutral";
  if (["update_available", "needs_restart", "needs_reload", "failed_with_repair", "skipped_manual_required"].includes(normalized)) return "attention";
  const healthRatio = normalized.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (healthRatio) {
    const available = Number(healthRatio[1]);
    const total = Number(healthRatio[2]);
    if (total > 0 && available === total) return "ready";
    if (total > 0 && available >= 0 && available < total) return "attention";
    return "neutral";
  }
  if (["launch_route_missing", "not_ready", "read_only", "error", "attention", "stale", "required", "unavailable", "not_available", "not-available", "not_installed", "restart_needed", "failed", "missing", "incompatible", "unsupported", "unreachable"].some((value) => normalized.includes(value))) {
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
  if (status === "integrated") return locale === "zh" ? "已接入" : "Integrated";
  if (!status) return locale === "zh" ? "尚未读取" : "Not read yet";
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
    launch_route_missing: ["入口未就绪", "Launch entry unavailable"],
    not_ready: ["尚未就绪", "Not ready"],
    local_development: ["本地开发版", "Local development build"],
    development_preview: ["开发预览", "Development preview"],
    read_only: ["只读", "Read only"],
    loading: ["正在读取", "Loading"],
    active: ["可用", "Available"],
    ready: ["可用", "Available"],
    available: ["可用", "Available"],
    healthy: ["可用", "Available"],
    current: ["已是最新", "Up to date"],
    update_available: ["有可用更新", "Update available"],
    currentness_not_checked: ["尚未检查更新", "Update not checked"],
    updating: ["更新中", "Updating"],
    applying: ["正在更新", "Applying update"],
    queued: ["等待处理", "Queued"],
    staged: ["已准备更新", "Update staged"],
    needs_reload: ["需要重新加载", "Reload required"],
    installed: ["已安装", "Installed"],
    enabled: ["已开启", "Enabled"],
    planned: ["待接入", "Planned"],
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
    needs_restart: ["需要重新启动", "Restart required"],
    failed_with_repair: ["更新失败，可修复", "Update failed; repair available"],
    skipped_manual_required: ["需要手动处理", "Manual action required"],
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
    app_state_projection: ["尚未读取", "Not read yet"],
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

export function formatNumber(value: number | undefined, locale: string, compact = false): string {
  if (value === undefined) return "--";
  return new Intl.NumberFormat(locale, compact
    ? { notation: "compact", maximumFractionDigits: 2 }
    : { maximumFractionDigits: 2 }
  ).format(value);
}

export function formatAmount(value: number | undefined, currency: string | undefined, locale: string): string {
  if (value === undefined) return "--";
  if (!currency) return formatNumber(value, locale);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${formatNumber(value, locale)} ${currency}`;
  }
}

export function formatBytes(value: number | undefined, locale: string): string {
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

export function formatDate(value: string | undefined, locale: string): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export type StorageProjection = WorkbenchSettingsProjection["storage"][keyof WorkbenchSettingsProjection["storage"]];

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

export function storageReason(entry: StorageProjection | undefined, locale: WorkbenchSettings["locale"]): string {
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
    return locale === "zh" ? "当前环境未提供网页端数据目录；请在网页端部署环境中查看用量" : "This environment does not expose a WebUI data directory; check usage in the WebUI deployment";
  }
  if (entry.reasonCode) {
    return locale === "zh" ? "当前没有可确认的用量数据；其他功能不受影响" : "No confirmed usage data is available; other features are unaffected";
  }
  return entry.observedAt
    ? (locale === "zh" ? `盘点于 ${formatDate(entry.observedAt, "zh-CN")}` : `Inventoried ${formatDate(entry.observedAt, "en-US")}`)
    : (locale === "zh" ? "尚未统计用量" : "Usage has not been measured");
}

export function storageAmount(value: number | undefined, entry: StorageProjection | undefined, locale: string): string {
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
