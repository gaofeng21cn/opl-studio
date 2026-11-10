import { Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import { Plus, ArrowDown, ArrowUp, Bot, Boxes, ChevronDown, LoaderCircle, Search } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import type { AgentPackageDependencyRef, AgentPackageLifecycleRef, PackageLifecycleActionRef, WorkbenchModel } from "../workbenchModel";

import type { WorkbenchSettings } from "../settingsModel";

import { actionPayloadComplete, type SettingsActionRequest } from "../settingsActions";
import type { AgentPackageAccessRef } from "../workbenchModel-package-contracts";

import { SettingsPanelProps } from "./types";
import { trapDialogFocus, statusTone, formatStatus } from "./presentation";
import { StatusValue } from "./primitives";

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

export function packageActionLabel(action: PackageLifecycleActionRef, locale: WorkbenchSettings["locale"]): string {
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

export function booleanStateLabel(value: boolean | null, locale: WorkbenchSettings["locale"]): string {
  if (value === null) return locale === "zh" ? "待确认" : "Not available";
  return value
    ? (locale === "zh" ? "是" : "Yes")
    : (locale === "zh" ? "否" : "No");
}

export function agentPackagePresentationStatus(item: AgentPackageLifecycleRef): string {
  if (item.installed === false) return "not_installed";
  if (item.installed === null) return "checking";
  if (item.activated === false && ["carrier_disabled", "configured_native_carrier_disabled", "package_disabled"].includes(item.readiness.reason ?? "")) return "disabled";
  if (item.readiness.operationalReady === false) return "unavailable";
  if (item.activated === false && item.readiness.callable !== false && item.readiness.launchAllowed !== false) return "disabled";
  if (item.readiness.callable === false || item.readiness.launchAllowed === false) return "unavailable";
  if (item.activated === true && item.readiness.callable === true && item.readiness.launchAllowed === true) return "ready";
  return "checking";
}

const packageUpdateAttentionStatuses = new Set([
  "update_available",
  "staged",
  "needs_restart",
  "needs_reload",
  "failed_with_repair",
  "skipped_manual_required"
]);

/**
 * Return the owner-projected update axis without deriving it from an action.
 * An available `update` action is an affordance; it is not proof that a new
 * version was found. This distinction keeps the catalog truthful when the
 * carrier has not performed a currentness check.
 */
export function agentPackageUpdateStatus(item: Pick<AgentPackageLifecycleRef, "currentness" | "installed">): string {
  const currentness = item.currentness.trim().toLowerCase();
  if (currentness && currentness !== "unknown") return currentness;
  if (item.installed === false) return "not_installed";
  return "currentness_not_checked";
}

export function agentPackageNeedsAttention(item: Pick<AgentPackageLifecycleRef, "currentness" | "installed" | "readiness">): boolean {
  // An uninstalled package is an available choice, not a broken installed state.
  // Required dependencies are reported through the installed consumer that needs them.
  if (item.installed === false) return false;
  const updateStatus = agentPackageUpdateStatus(item);
  return packageUpdateAttentionStatuses.has(updateStatus)
    || item.readiness.operationalReady === false
    || item.readiness.callable === false
    || item.readiness.launchAllowed === false;
}

export function agentPackageHasHomeShortcutRoute(item: Pick<AgentPackageLifecycleRef, "homeShortcuts">): boolean {
  return item.homeShortcuts.some((shortcut) => Boolean(shortcut.route));
}

export function componentReadinessStatus(ready: boolean | null | undefined, status?: string): string {
  if (ready === false) return "not_ready";
  if (ready === true) return "ready";
  // An aggregate healthy word is not explicit component readiness.
  return statusTone(status) === "attention" ? status! : "unknown";
}

export function agentAvailabilityDetail(item: AgentPackageLifecycleRef, locale: WorkbenchSettings["locale"]): string {
  const zh = locale === "zh";
  const status = agentPackagePresentationStatus(item);
  if (status === "ready" && item.packageRole === "standard_agent" && !agentPackageHasHomeShortcutRoute(item)) return zh
    ? "智能体已安装、已启用且可调用；首页入口需由智能体更新提供，无需重复修复安装。"
    : "The agent is installed, enabled and callable. A package update must provide its home entry; reinstalling is unnecessary.";
  if (status === "not_installed") return zh ? "此智能体尚未安装。点击“安装”，完成后即可从新任务中选择。覆盖升级会保留原有安装选择。" : "This agent is not installed. Choose Install to make it available in New Task. App upgrades preserve existing package choices.";
  if (status === "disabled") return zh ? "此智能体已停用。" : "This agent is disabled.";
  const missing = (item.dependencies ?? []).filter(dep => dep.required !== false && (dep.present === false || dep.callable === false)).map(dep => dep.packageId);
  if (missing.length) return zh ? `必需能力不可用：${missing.join("、")}。点击“修复”补齐后重新检查。` : `Required capabilities unavailable: ${missing.join(", ")}. Choose Repair and check again.`;
  if (item.readiness.reason === "hosted_agent_source_unavailable") return zh ? "智能体插件已登记，但执行所需文件缺失。点击“修复”恢复完整安装。" : "The plugin is registered, but its execution files are missing. Choose Repair to restore the full installation.";
  if (item.readiness.statusReadError) return zh ? "无法读取智能体状态。请重新检查；若仍失败，到诊断页查看原因。" : "Agent status could not be read. Refresh, then open Diagnostics if it still fails.";
  if (status === "unavailable") return zh ? "智能体的调用或启动检查未通过。点击“修复”，并在检查详情中查看具体原因。" : "Calling or launch checks failed. Choose Repair and review Check details for the cause.";
  return zh ? "状态来自本机安装与运行检查。" : "Based on local installation and runtime checks.";
}

export function packageSourceLabel(source: string, locale: WorkbenchSettings["locale"]): string {
  if (/local|checkout|git|developer/.test(source)) return locale === "zh" ? "本地开发源" : "Local development source";
  if (/package_channel|ghcr|oci|registry|managed/.test(source)) return locale === "zh" ? "软件包发布源" : "Package release source";
  if (/native|codex/.test(source)) return locale === "zh" ? "执行平台安装" : "Execution platform";
  return locale === "zh" ? "已登记来源" : "Registered source";
}

export function packageAccessStatusLabel(access: AgentPackageAccessRef | undefined, locale: WorkbenchSettings["locale"]): string {
  const zh = locale === "zh";
  if (!access) return zh ? "访问状态尚未返回" : "Access status not reported";
  const labels: Record<AgentPackageAccessRef["status"], string> = {
    public: zh ? "公开源" : "Public source",
    authorized: zh ? "已授权私有源" : "Authorized private source",
    signed_out: zh ? "未连接软件源账号" : "Source account not connected",
    forbidden: zh ? "无权访问私有源" : "Private source access denied",
    expired: zh ? "授权已过期" : "Authorization expired",
    revoked: zh ? "访问已撤销" : "Access revoked",
    unknown: zh ? "访问状态未知" : "Access status unknown"
  };
  return labels[access.status];
}

export function packageAccessVisibilityLabel(access: AgentPackageAccessRef | undefined, locale: WorkbenchSettings["locale"]): string {
  if (access?.visibility === "authorized_only") return locale === "zh" ? "私有授权源" : "Authorized-only source";
  if (access?.visibility === "public") return locale === "zh" ? "公开源" : "Public source";
  return locale === "zh" ? "来源可见性未知" : "Source visibility unknown";
}

export function packageAccessNeedsAttention(item: Pick<AgentPackageLifecycleRef, "installed" | "access">): boolean {
  if (item.installed !== true) return false;
  return ["signed_out", "forbidden", "expired", "revoked"].includes(item.access?.status ?? "unknown");
}

export function packageInstallAllowed(item: Pick<AgentPackageLifecycleRef, "installed" | "actions" | "access" | "installable">): boolean {
  if (item.installed === true) return false;
  if (item.installable === false) return false;
  if (item.access?.visibility === "authorized_only" && item.access.status !== "authorized") return false;
  if (item.access?.downloadAllowed === false) return false;
  return item.actions.some((action) => action.kind === "install" && action.status === "available" && actionPayloadComplete(action.payload, action.requiredPayloadFields));
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

function packageVersionLabel(item: Pick<AgentPackageLifecycleRef, "installedVersion" | "availableVersion" | "version" | "versionKind">, locale: WorkbenchSettings["locale"]): string | null {
  const installed = item.installedVersion ?? (item.versionKind === "installed" ? item.version : undefined);
  const available = item.availableVersion ?? (item.versionKind === "available" ? item.version : undefined);
  if (installed && available && installed !== available) {
    return locale === "zh" ? `已安装 ${installed} · 可安装 ${available}` : `Installed ${installed} · Available ${available}`;
  }
  if (installed) return locale === "zh" ? `已安装 ${installed}` : `Installed ${installed}`;
  if (available) return locale === "zh" ? `可安装 ${available}` : `Available ${available}`;
  return null;
}

export function PackageCatalog({
  model,
  settings,
  actionBusyKey,
  onAction,
  manifestInstallAction,
  renderPackageContributions,
  kind = "agents"
}: {
  kind?: "agents" | "all";
  model: WorkbenchModel;
  settings: WorkbenchSettings;
  actionBusyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
  manifestInstallAction?: SettingsPanelProps["manifestInstallAction"];
  renderPackageContributions?: (packageId: string) => ReactNode;
}) {
  const [scope, setScope] = useState<"official" | "all">("all");
  const [query, setQuery] = useState("");
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState("all");
  const [installOpen, setInstallOpen] = useState(false);
  const [customInstall, setCustomInstall] = useState(false);
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
  const catalogLabel = kind === "agents" ? "智能体" : "扩展";
  const catalogLabelEn = kind === "agents" ? "agents and workflows" : "extensions and apps";
  const packages = model.packageLifecycle.filter((item) => !["missing_bridge", "agent_packages_directory"].includes(item.packageId) && (kind === "all" || isAgentCatalogPackage(item)));
  const scoped = packages.filter((item) => scope === "all" || item.official);
  const manifestInstallAvailable = Boolean(
    manifestInstallAction
    && manifestInstallAction.dryRunSupported
    && manifestInstallAction.confirmationRequired
    && manifestInstallAction.payloadFields.includes("manifest_url")
    && manifestInstallAction.payloadFields.includes("trust_tier")
  );
  const statusOptions = [...new Set(["not_installed", ...scoped.map(agentPackagePresentationStatus)])].sort();
  const updateStatusOptions = [...new Set(scoped.map(agentPackageUpdateStatus).filter((status) => status !== "not_installed"))].sort();
  const homeShortcutOrder = model.packageLifecycle.flatMap((item) => item.homeShortcuts.map((shortcut) => ({
    packageId: item.packageId,
    ...shortcut
  }))).sort((left, right) => left.sortOrder - right.sortOrder || left.shortcutId.localeCompare(right.shortcutId));
  const normalizedQuery = query.trim().toLowerCase();
  const visible = scoped.filter((item) => {
    if (statusFilter === "app_hidden" ? item.appEnabled : statusFilter.startsWith("update:")
      ? agentPackageUpdateStatus(item) !== statusFilter.slice("update:".length)
      : statusFilter !== "all" && agentPackagePresentationStatus(item) !== statusFilter) return false;
    return !normalizedQuery || item.searchMetadata.query.includes(normalizedQuery);
  });
  const installedCount = packages.filter((item) => item.installed === true).length;
  const installableCount = packages.filter((item) => packageInstallAllowed(item)).length;
  const updateCount = packages.filter((item) => agentPackageUpdateStatus(item) === "update_available").length;
  const groups = [
    { key: "standard_agent", label: locale === "zh" ? "领域智能体" : "Domain agents", icon: Bot },
    { key: "workflow_profile", label: locale === "zh" ? "工作流" : "Workflows", icon: Boxes },
    { key: "extensions", label: locale === "zh" ? "应用与共享能力" : "Apps and shared capabilities", icon: Boxes }
  ].map((group) => ({ ...group, items: visible.filter((item) => group.key === "extensions" ? !isAgentCatalogPackage(item) : item.packageRole === group.key) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="agent-catalog" data-testid="opl-settings-agent-catalog">
      <div className="agent-catalog-heading">
        <div>
          <h2>{locale === "zh" ? "软件目录" : "Software catalog"}</h2>
          <p>{locale === "zh" ? "来自 OPL Package Directory 的可发现条目；Homebrew 只负责系统依赖，不作为 Agent 目录。" : "Discoverable entries from the OPL Package Directory; Homebrew remains a system dependency carrier, not the Agent catalog."}</p>
        </div>
        <span className="agent-catalog-source">{locale === "zh" ? "Framework owner projection" : "Framework owner projection"}</span>
      </div>
      <div className="agent-catalog-inventory" role="status" aria-label={locale === "zh" ? "软件目录统计" : "Software catalog totals"}>
        <span><strong>{packages.length}</strong>{locale === "zh" ? "个目录条目" : "catalog entries"}</span>
        <span><strong>{installableCount}</strong>{locale === "zh" ? "个可安装" : "installable"}</span>
        <span><strong>{installedCount}</strong>{locale === "zh" ? "个已安装" : "installed"}</span>
        <span className={updateCount ? "has-update" : undefined}><strong>{updateCount}</strong>{locale === "zh" ? "个有更新" : "updates available"}</span>
      </div>
      <div className="agent-catalog-toolbar">
        <label className="settings-search-field">
          <Search aria-hidden="true" size={14} />
          <input aria-label={locale === "zh" ? `搜索${catalogLabel}、名称或来源` : `Search ${catalogLabelEn}`} value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={locale === "zh" ? `搜索${catalogLabel}、名称或来源` : `Search ${catalogLabelEn}`} />
        </label>
        <button
          ref={installTriggerRef}
          className="settings-action-button primary"
          type="button"
          disabled={actionBusyKey !== null}
          title={!manifestInstallAvailable
            ? (locale === "zh" ? "当前 App 尚未提供清单安装通道" : "The App does not currently expose manifest installation")
            : undefined}
          onClick={() => { setCustomInstall(false); setInstallOpen(true); }}
        >
          <Plus aria-hidden="true" size={14} />
          {locale === "zh" ? `添加${catalogLabel}` : "Add extension"}
        </button>
      </div>
      <p className="settings-inline-note">{locale === "zh" ? "开关控制扩展在 OPL App 中的入口和状态。关闭后仍可在 Codex 中使用。" : "Switches control entries and status in OPL App. Turning one off keeps it available in Codex."}</p>
      <div className="agent-catalog-filters">
        <div className="segmented-control" role="group" aria-label={locale === "zh" ? "目录范围" : "Catalog scope"}>
          <button type="button" data-active={scope === "official"} aria-pressed={scope === "official"} onClick={() => setScope("official")}>{locale === "zh" ? "官方" : "Official"}</button>
          <button type="button" data-active={scope === "all"} aria-pressed={scope === "all"} onClick={() => setScope("all")}>{locale === "zh" ? "全部" : "All"}</button>
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value)} aria-label={locale === "zh" ? "按状态筛选" : "Filter by status"}>
          <option value="all">{locale === "zh" ? "全部状态" : "All statuses"}</option>
          <option value="app_hidden">{locale === "zh" ? "在 OPL App 中已关闭" : "Off in OPL App"}</option>
          {statusOptions.map((status) => <option key={status} value={status}>{formatStatus(status === "ready" ? "installed" : status, locale)}</option>)}
          {updateStatusOptions.map((status) => <option key={`update:${status}`} value={`update:${status}`}>{locale === "zh" ? `更新：${formatStatus(status, locale)}` : `Update: ${formatStatus(status, locale)}`}</option>)}
        </select>
        <span>{locale === "zh" ? `显示 ${visible.length} / ${packages.length} 个条目` : `Showing ${visible.length} of ${packages.length} entries`}</span>
      </div>
      {groups.length ? groups.map((group) => (
        <section key={group.key} className="agent-catalog-group">
          <h2><group.icon aria-hidden="true" size={15} />{group.label}</h2>
          <div className="agent-package-list">
            {group.items.map((item) => {
              const appAction = item.actions.find((action) => action.actionId === "package_app_set_enabled" && action.status === "available");
              const executableActions = item.actions.filter((action) => action.actionId !== "package_app_set_enabled" && action.status === "available" && actionPayloadComplete(action.payload, action.requiredPayloadFields) && (action.kind !== "install" || packageInstallAllowed(item)));
              const preferenceAction = item.actions.find((action) => action.kind === "preferences" && action.actionId !== "package_app_set_enabled" && action.status === "available");
              const presentationStatus = agentPackagePresentationStatus(item);
              const primaryAction = executableActions.find((action) => action.actionId === item.recommendedActionId)
                ?? (item.installed === false && packageInstallAllowed(item) ? executableActions.find((action) => action.kind === "install") : undefined)
                ?? (agentPackageUpdateStatus(item) === "update_available" ? executableActions.find((action) => action.kind === "update") : undefined)
                ?? (agentPackagePresentationStatus(item) === "unavailable" ? executableActions.find((action) => action.kind === "repair") : undefined);
              const updateStatus = agentPackageUpdateStatus(item);
              return (
                <details key={item.id} className="agent-package-row" data-testid="opl-settings-agent-row" data-package-id={item.packageId}
                  onToggle={(event) => { const open = event.currentTarget.open; setExpandedPackages(previous => { const next = new Set(previous); if (open) next.add(item.packageId); else next.delete(item.packageId); return next; }); }}>
                  <summary>
                    <span className="agent-package-copy">
                      <strong>{item.label}</strong>
                      <small>{localizedPackageDescription(item, locale)}</small>
                      <span className="agent-package-meta">
                        {packageVersionLabel(item, locale) ? <span data-testid="opl-package-version-summary">{packageVersionLabel(item, locale)}</span> : <span>{locale === "zh" ? "版本尚未返回" : "Version not reported"}</span>}
                        <span>{item.official ? (locale === "zh" ? "官方" : "Official") : item.publisher}</span>
                        {item.automaticUpdate !== null ? <span>{item.automaticUpdate ? (locale === "zh" ? "自动更新" : "Automatic updates") : (locale === "zh" ? "手动更新" : "Manual updates")}</span> : null}
                        <span data-testid="opl-package-access-status">{packageAccessStatusLabel(item.access, locale)}</span>
                        <span data-testid="opl-package-update-status">{locale === "zh" ? `更新：${formatStatus(updateStatus, locale)}` : `Update: ${formatStatus(updateStatus, locale)}`}</span>
                      </span>
                    </span>
                    <span className="agent-package-summary-actions">
                      <StatusValue status={packageAccessNeedsAttention(item) ? "attention" : presentationStatus === "ready" ? "installed" : presentationStatus} locale={locale} />
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
                          {actionBusyKey === `${item.packageId}:${primaryAction.actionId}` ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : null}
                          {packageActionLabel(primaryAction, locale)}
                        </button>
                      ) : null}
                      {item.installed === true ? <span className="agent-package-app-toggle" onClick={(event) => event.stopPropagation()}>
                        <span>OPL App</span>
                        <Switch checked={item.appEnabled} disabled={!appAction || actionBusyKey !== null}
                          label={locale === "zh" ? `在 OPL App 中启用 ${item.label}` : `Enable ${item.label} in OPL App`}
                          onChange={(enabled) => { if (appAction) onAction({ key: `app:${item.packageId}:enabled`, actionId: appAction.actionId,
                            label: locale === "zh" ? `${enabled ? "启用" : "关闭"} ${item.label} 的 OPL App 入口` : `${enabled ? "Enable" : "Turn off"} ${item.label} in OPL App`,
                            payload: { ...appAction.payload, package_id: item.packageId, enabled }, confirmationRequired: false, dryRunSupported: appAction.dryRunSupported }); }} />
                      </span> : null}
                      <ChevronDown className="agent-package-chevron" aria-hidden="true" size={15} />
                    </span>
                  </summary>
                  <div className="agent-package-details">
                    {(agentPackagePresentationStatus(item) !== "ready" || (item.packageRole === "standard_agent" && !agentPackageHasHomeShortcutRoute(item))) ? <p className="settings-inline-note">{agentAvailabilityDetail(item, locale)}</p> : null}
                    {(item.readiness.reason || item.readiness.statusReadError) && agentPackagePresentationStatus(item) !== "ready" ? <details className="settings-secondary-details"><summary>{locale === "zh" ? "检查详情" : "Check details"}</summary><p>{item.readiness.reason}</p><code>{item.readiness.statusReadError}</code></details> : null}
                    <dl className="agent-state-axis-grid">
                      <div><dt>{locale === "zh" ? "来源" : "Source"}</dt><dd>{packageSourceLabel(item.sourceMode, locale)} · {packageAccessVisibilityLabel(item.access, locale)}</dd></div>
                      <div><dt>{locale === "zh" ? "访问" : "Access"}</dt><dd>{packageAccessStatusLabel(item.access, locale)}{item.access?.providerId ? ` · ${item.access.providerId}` : ""}</dd></div>
                      <div><dt>{locale === "zh" ? "安装" : "Installed"}</dt><dd>{booleanStateLabel(item.installed, locale)}{item.installedVersion ? ` · ${item.installedVersion}` : ""}</dd></div>
                      <div><dt>{locale === "zh" ? "可用版本" : "Available version"}</dt><dd>{item.availableVersion ?? (item.versionKind === "available" ? item.version : undefined) ?? (locale === "zh" ? "尚未检查" : "Not checked")}</dd></div>
                      <div><dt>{locale === "zh" ? "执行平台启用" : "Enabled on platform"}</dt><dd>{booleanStateLabel(item.activated, locale)}</dd></div>
                      <div><dt>{locale === "zh" ? "更新检查" : "Update check"}</dt><dd><StatusValue status={updateStatus} locale={locale} /></dd></div>
                    </dl>
                    {packageAccessNeedsAttention(item) ? <p className="settings-inline-note" data-testid="opl-package-access-attention">
                      {item.access?.reason ?? (locale === "zh" ? "私有来源访问已失效；重新连接软件源后才能继续更新。" : "Private source access is unavailable; reconnect the source before updating.")}
                    </p> : null}
                    {item.installed !== true && item.access?.visibility === "authorized_only" && !packageInstallAllowed(item) ? <p className="settings-inline-note" data-testid="opl-package-access-gate">
                      {item.access.status === "signed_out"
                        ? (locale === "zh" ? "连接软件源账号后才能安装此私有条目。" : "Connect the source account to install this private entry.")
                        : item.access.reason ?? packageAccessStatusLabel(item.access, locale)}
                    </p> : null}
                    {item.requiredByPackageIds?.length ? <p className="settings-inline-note" data-testid="opl-package-dependent-guard">
                      {locale === "zh"
                        ? `此能力仍被 ${item.requiredByPackageIds.join("、")} 使用；卸载或停用前请先处理这些依赖。`
                        : `This capability is still required by ${item.requiredByPackageIds.join(", ")}; resolve those dependents before uninstalling or disabling it.`}
                    </p> : null}
                    {item.appEnabled && item.homeShortcuts.length ? (
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
                                  <small>{locale === "zh" ? `开启后，可从新任务页直接选择此${catalogLabel}。` : "Makes this agent available from the New Task screen."}</small>
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
                    {item.appEnabled && expandedPackages.has(item.packageId) && renderPackageContributions ? (
                      <div className="opl-contribution-slot" data-testid="opl-package-state">{renderPackageContributions(item.packageId)}</div>
                    ) : null}
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
      {model.officialProfileRestore ? <details className="settings-secondary-details agent-catalog-recovery">
        <summary>{locale === "zh" ? "找不到原有扩展？" : "Missing a previously installed extension?"}</summary>
        <p className="settings-inline-note">{locale === "zh" ? "升级会保留安装选择。可恢复官方组合，或通过“添加扩展”逐项安装。" : "Upgrades preserve installation choices. Restore the official combination or use Add extension to install individually."}</p>
        <button type="button" className="settings-inline-command" data-testid="settings-agents-restore-official-profile" disabled={actionBusyKey !== null}
          onClick={() => onAction({ key: "official-profile:restore", actionId: model.officialProfileRestore!.id,
            label: locale === "zh" ? "恢复官方组合" : "Restore official combination", payload: { intent: "explicit_restore" },
            confirmationRequired: true, dryRunSupported: model.officialProfileRestore!.dryRunSupported })}>
          {locale === "zh" ? "恢复官方组合" : "Restore official combination"}
        </button>
      </details> : null}
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
              if (!customInstall || !manifestInstallAction || !manifestUrl.trim() || !trustTier) return;
              onAction({
                key: "agent-package:install-from-manifest",
                actionId: manifestInstallAction.actionId,
                label: locale === "zh" ? `安装自定义${catalogLabel}` : "Install custom extension",
                payload: { manifest_url: manifestUrl.trim(), trust_tier: trustTier },
                confirmationRequired: manifestInstallAction.confirmationRequired,
                dryRunSupported: manifestInstallAction.dryRunSupported
              });
              setInstallOpen(false);
            }}
          >
            <div className="settings-action-dialog-icon"><Plus aria-hidden="true" size={18} /></div>
            <div className="settings-add-agent-fields">
              <h2 id="settings-add-agent-title">{locale === "zh" ? `添加${catalogLabel}` : "Add extension"}</h2>
              {!customInstall ? <>
                <p>{locale === "zh" ? `从目录选择需要的${catalogLabel}；安装后可独立选择是否在 OPL App 中启用。` : "Choose an extension from the catalog; after installation, choose whether to enable it in OPL App."}</p>
                <button className="settings-action-button" type="button" onClick={() => { setScope("official"); setStatusFilter("not_installed"); setQuery(""); setInstallOpen(false); }}>{locale === "zh" ? `浏览可安装${catalogLabel}` : "Browse modules to install"}</button>
                <button className="settings-inline-command" type="button" disabled={!manifestInstallAvailable} onClick={() => setCustomInstall(true)}>{locale === "zh" ? "高级：通过清单链接安装" : "Advanced: install from manifest link"}</button>
              </> : <>
              <p>{locale === "zh" ? `从${catalogLabel}作者提供的 OPL Package 清单安装。系统会先检查清单，确认后才会写入。` : "Install from an OPL Package manifest supplied by the module author. The App validates it before asking for confirmation."}</p>
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
              <small>{locale === "zh" ? "仅在你已独立核验发布者与来源时选择“已核验”。选择信任级别不会代替系统检查。" : "Choose Verified only after independently verifying the publisher and source. This does not bypass validation."}</small>
              </>}
            </div>
            <div className="settings-action-dialog-actions">
              <button type="button" onClick={() => setInstallOpen(false)}>{locale === "zh" ? "取消" : "Cancel"}</button>
              {customInstall ? <button className="primary" type="submit" disabled={!manifestUrl.trim() || !trustTier || actionBusyKey !== null}>
                {locale === "zh" ? "检查并继续" : "Check and continue"}
              </button> : null}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
