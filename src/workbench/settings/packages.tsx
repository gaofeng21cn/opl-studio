
import type { AgentPackageDependencyRef, AgentPackageLifecycleRef, PackageLifecycleActionRef } from "../workbenchModel";

import type { WorkbenchSettings } from "../settingsModel";

import { actionPayloadComplete } from "../settingsActions";
import type { AgentPackageAccessRef } from "../workbenchModel-package-contracts";

import { statusTone } from "./presentation";
import { DshPluginManagerOwner } from "../../composition/dshPluginManagerOwner";

export function packageRoleLabel(role: string, locale: WorkbenchSettings["locale"]): string {
  const labels: Record<string, [string, string]> = {
    standard_agent: ["领域智能体", "Domain agent"],
    workflow_profile: ["工作流", "Workflow"],
    capability_package: ["能力包", "Capability package"],
    framework_capability_package: ["能力包", "Capability package"]
  };
  return labels[role]?.[locale === "zh" ? 0 : 1] ?? (locale === "zh" ? "其他扩展" : "Other extension");
}

export function localizedPackageDescription(
  item: Pick<AgentPackageLifecycleRef, "description" | "descriptionI18n">,
  locale: WorkbenchSettings["locale"]
): string {
  const ownerLocalized = item.descriptionI18n[locale]?.trim();
  if (ownerLocalized) return ownerLocalized;
  const englishFallback = item.descriptionI18n.en?.trim() || item.description.trim();
  if (englishFallback) return englishFallback;
  return locale === "zh" ? "尚未提供软件说明。" : "No software description provided.";
}

export function packageActionLabel(action: PackageLifecycleActionRef, locale: WorkbenchSettings["locale"]): string {
  const labels: Record<PackageLifecycleActionRef["kind"], [string, string]> = {
    install: ["安装到当前宿主", "Install in this host"],
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
  if (item.installed !== true && item.localInstallations?.length) return zh
    ? "本机已检测到独立安装或开发接入，当前宿主尚无插件副本。各实例通过所属安装器管理。"
    : "A standalone installation or development checkout is present. No plugin copy is installed in this host; each installation uses its own manager.";
  if (item.installed !== true && item.installabilityReason === "package_install_source_unavailable") return zh
    ? "此软件已列入目录，安装来源尚未发布。来源可用后即可从这里安装。"
    : "This software is listed in the catalog. It will be installable here when its installation source is published.";
  if (status === "ready" && item.packageRole === "standard_agent" && !agentPackageHasHomeShortcutRoute(item)) return zh
    ? "智能体已安装、已启用且可调用；首页入口需由智能体更新提供，无需重复修复安装。"
    : "The agent is installed, enabled and callable. A package update must provide its home entry; reinstalling is unnecessary.";
  if (status === "not_installed") return zh ? "此软件尚未安装到当前宿主。安装完成后可通过软件提供的入口使用。" : "This software is not installed in the current host. Install it here to use its provided entry points.";
  if (status === "disabled") return zh ? "此软件已停用。" : "This software is disabled.";
  const missing = (item.dependencies ?? []).filter(dep => dep.required !== false && (dep.present === false || dep.callable === false)).map(dep => dep.packageId);
  if (missing.length) return zh ? `必需能力不可用：${missing.join("、")}。点击“修复”补齐后重新检查。` : `Required capabilities unavailable: ${missing.join(", ")}. Choose Repair and check again.`;
  if (item.readiness.reason === "hosted_agent_source_unavailable") return zh ? "插件已登记，但执行所需文件缺失。点击“修复”恢复完整安装。" : "The plugin is registered, but its execution files are missing. Choose Repair to restore the full installation.";
  if (item.readiness.statusReadError) return zh ? "无法读取软件状态。请重新检查；若仍失败，到诊断页查看原因。" : "Software status could not be read. Refresh, then open Diagnostics if it still fails.";
  if (status === "unavailable") return zh ? "软件的调用或启动检查未通过。点击“修复”，并在检查详情中查看具体原因。" : "Calling or launch checks failed. Choose Repair and review Check details for the cause.";
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

export function isAgentCatalogPackage(item: Pick<AgentPackageLifecycleRef, "packageRole" | "softwareType">): boolean {
  return item.softwareType === "agent" || (item.softwareType === undefined && item.packageRole === "standard_agent");
}

export function isCapabilityCatalogPackage(item: Pick<AgentPackageLifecycleRef, "packageId" | "packageRole" | "softwareType">): boolean {
  if (item.packageId === "missing_bridge") return false;
  if (item.softwareType !== undefined) return item.softwareType === "capability";
  const role = item.packageRole.trim().toLowerCase();
  return role === "capability_package" || role.endsWith("_capability_package");
}


export function PackageCatalog(props: import("../../composition/dshPluginManagerOwner").DshPluginManagerOwnerProps) {
  return <DshPluginManagerOwner {...props} />;
}


export function packagePresentLocally(item: Pick<AgentPackageLifecycleRef, "installed" | "localInstallations">): boolean {
  return item.installed === true || Boolean(item.localInstallations?.length);
}

export function packageLocalVersion(item: Pick<AgentPackageLifecycleRef, "installedVersion" | "localInstallations">): string | undefined {
  return item.installedVersion ?? item.localInstallations?.find(installation => installation.mode === "installed")?.version ?? item.localInstallations?.[0]?.version;
}


export function packageInstalledLocally(item: Pick<AgentPackageLifecycleRef, "installed" | "localInstallations">): boolean {
  return item.installed === true || Boolean(item.localInstallations?.some(installation => installation.mode === "installed"));
}

export function packageDevelopmentLinked(item: Pick<AgentPackageLifecycleRef, "localInstallations">): boolean {
  return Boolean(item.localInstallations?.some(installation => installation.mode === "development"));
}
