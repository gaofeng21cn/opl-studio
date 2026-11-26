import type { DshPluginIntentCategory, SoftwareProductType } from "@gaofeng21cn/opl-host-contracts";
import type { AgentPackageLifecycleRef, ManagedRuntimeDependencyRef, WorkbenchModel } from "./workbenchModel";
import type { NativeSoftwareItemRef, SoftwareActivationStatus, SoftwareInstallationRef } from "./workbenchModel-package-contracts";
import { nativeAvailableDisplayVersion, nativeSoftwareProducts } from "./softwareSources";
import { packageAccessNeedsAttention, packagePresentLocally } from "./settings/packages";

export type SoftwareCatalogScope = "all" | "opl" | "external" | "components";
export type SoftwareCatalogState = "not_installed" | "installed" | "update_available" | "attention" | "unknown";
export const visibleSoftwareTypes = ["agent", "application", "extension", "channel"] as const satisfies readonly SoftwareProductType[];

/** Maintenance origin is supplied by Framework; technical package roles never select the source. */
export function packageCatalogScope(item: AgentPackageLifecycleRef): Exclude<SoftwareCatalogScope, "all"> {
  if (item.softwareType === "dependency" || item.catalogScope === "host_component" || (item.catalogScope !== "software" && item.managementScope === "local_component")) return "components";
  return item.catalogOrigin === "opl" ? "opl" : "external";
}

export function softwareCatalogPackages(model: Pick<WorkbenchModel, "packageLifecycle">, scope: SoftwareCatalogScope) {
  return model.packageLifecycle.filter(item => {
    if (item.managementScope === "deployment_target" || ["missing_bridge", "agent_packages_directory"].includes(item.packageId)) return false;
    const itemScope = packageCatalogScope(item);
    return scope === "all" ? itemScope !== "components" : itemScope === scope;
  });
}

export function softwareCatalogNativeProducts(model: Pick<WorkbenchModel, "softwareSources">, scope: SoftwareCatalogScope) {
  return nativeSoftwareProducts(model.softwareSources).filter(({ item }) => {
    if (scope === "components") return false;
    return scope === "all" || (item.catalogOrigin === "opl" ? "opl" : "external") === scope;
  });
}

export function packageCatalogState(item: AgentPackageLifecycleRef): SoftwareCatalogState {
  if (item.activeInstallationStatus === "conflict") return "attention";
  if (packagePresentLocally(item)) {
    // Runtime state for a missing host plugin does not describe a standalone installation.
    if (item.installed === true && (packageAccessNeedsAttention(item) || ["staged", "needs_restart", "needs_reload", "failed_with_repair", "skipped_manual_required"].includes(item.currentness) || item.readiness.operationalReady === false || item.readiness.callable === false || item.readiness.launchAllowed === false)) return "attention";
    if (item.installed === true && item.currentness === "update_available") return "update_available";
    return "installed";
  }
  return item.installed === false ? "not_installed" : "unknown";
}

export function nativeCatalogState(item: NativeSoftwareItemRef): SoftwareCatalogState {
  if (item.activeInstallationStatus === "conflict" || item.updateStatus === "needs_restart") return "attention";
  return item.updateStatus === "available" && item.installed === true ? "update_available"
    : item.installed === true ? "installed" : item.installed === false ? "not_installed" : "unknown";
}

export function catalogStateLabel(state: SoftwareCatalogState, locale: "zh" | "en") {
  return ({ not_installed: ["未安装", "Not installed"], installed: ["已安装", "Installed"], update_available: ["可更新", "Update available"], attention: ["需检查", "Needs check"], unknown: ["状态待确认", "Status not confirmed"] })[state][locale === "zh" ? 0 : 1];
}

/** Express the concrete owner-projected reason instead of a vague "needs attention" label. */
export function packageCatalogStatusLabel(item: AgentPackageLifecycleRef, locale: "zh" | "en"): string {
  const zh = locale === "zh";
  const state = packageCatalogState(item);
  if (!packagePresentLocally(item) && packageDownloadAuthorizationRequired(item)) {
    return zh ? "需授权安装" : "Authorization required to install";
  }
  if (state === "not_installed" && item.installabilityReason === "package_install_source_unavailable") {
    return zh ? "安装来源不可用" : "Install source unavailable";
  }
  if (state !== "attention") return catalogStateLabel(state, locale);
  if (item.activeInstallationStatus === "conflict") return zh ? "安装冲突" : "Installation conflict";
  if (packageAccessNeedsAttention(item)) return zh ? "需连接软件源" : "Connect source";
  if (item.currentness === "needs_restart") return zh ? "待重启生效" : "Restart required";
  if (item.currentness === "needs_reload") return zh ? "需重新加载" : "Reload required";
  if (item.currentness === "staged") return zh ? "已暂存待生效" : "Staged";
  if (item.readiness.reason === "hosted_agent_source_unavailable") return zh ? "安装不完整" : "Incomplete installation";
  if (item.currentness === "failed_with_repair" || item.currentness === "skipped_manual_required"
    || item.readiness.operationalReady === false || item.readiness.callable === false || item.readiness.launchAllowed === false) {
    return zh ? "需恢复安装" : "Needs restore";
  }
  return catalogStateLabel(state, locale);
}

export function nativeCatalogStatusLabel(item: NativeSoftwareItemRef, locale: "zh" | "en"): string {
  const zh = locale === "zh";
  if (item.updateStatus === "needs_restart") return zh ? "待重启生效" : "Restart required";
  if (item.activeInstallationStatus === "conflict") return zh ? "安装冲突" : "Installation conflict";
  return catalogStateLabel(nativeCatalogState(item), locale);
}

const productTypeLabels: Record<SoftwareProductType, { zh: string; en: string; plural: string }> = {
  agent: { zh: "智能体", en: "Agent", plural: "Agents" },
  application: { zh: "应用", en: "Application", plural: "Applications" },
  extension: { zh: "效率扩展", en: "Extension", plural: "Efficiency extensions" },
  channel: { zh: "连接通道", en: "Channel", plural: "Channels" },
  dependency: { zh: "运行组件", en: "Runtime dependency", plural: "Runtime dependencies" }
};

export function catalogTypeLabel(type: SoftwareProductType, locale: "zh" | "en") {
  return productTypeLabels[type][locale];
}

export function intentCategoryLabel(type: SoftwareProductType, locale: "zh" | "en") {
  return productTypeLabels[type][locale === "zh" ? "zh" : "plural"];
}

export function packageIntentCategory(
  item: Pick<AgentPackageLifecycleRef, "softwareType" | "catalogScope" | "packageRole">
): SoftwareProductType {
  if (item.softwareType && item.softwareType !== "unknown") return item.softwareType;
  if (item.catalogScope === "host_component") return "dependency";
  if (item.packageRole === "standard_agent") return "agent";
  return "extension";
}

export function dshIntentCategory(type: DshPluginIntentCategory): SoftwareProductType {
  if (type === "efficiency") return "extension";
  if (type === "runtime") return "dependency";
  return type;
}

export function packageDownloadAuthorizationRequired(item: Pick<AgentPackageLifecycleRef, "access">): boolean {
  return item.access?.visibility === "authorized_only" && (item.access.status !== "authorized" || item.access.downloadAllowed === false);
}

export function packagePermissionsSummary(
  item: Pick<AgentPackageLifecycleRef, "packageId" | "access" | "catalogOrigin" | "catalogSource" | "catalogScope">,
  model: Pick<WorkbenchModel, "applicationManagement" | "knowledgeSources">,
  locale: "zh" | "en"
): string[] {
  const zh = locale === "zh";
  const permissions: string[] = [];
  if (item.catalogScope === "host_component") {
    permissions.push(zh ? "作为宿主核心运行组件自动维护" : "Automatically maintained as a host runtime component");
  }
  if (item.access?.visibility === "authorized_only") {
    permissions.push(zh ? "仅授权账号可下载、安装或更新此软件" : "Downloading, installing, and updating require an authorized source account");
  }
  const connections = (model.applicationManagement?.sharedResources ?? []).filter(
    resource => resource.resourceKind === "connection" && resource.consumerPackageIds.includes(item.packageId)
  );
  for (const resource of connections) {
    const label = resource.labelI18n?.[locale] ?? resource.label;
    permissions.push(zh ? `外部连接权限：${label}` : `External connection access: ${label}`);
  }
  const libraries = (model.knowledgeSources?.entries ?? []).filter(
    source => source.connected !== false && source.consumerPackageIds.includes(item.packageId)
  );
  for (const library of libraries) {
    const canPropose = model.knowledgeSources?.consumers.some(
      consumer => consumer.packageId === item.packageId && library.writeDomainIds.includes(consumer.domainId)
    );
    permissions.push(zh
      ? `资料库访问：${library.label}（${canPropose ? "可提议修改" : "只读"}）`
      : `Library access: ${library.label} (${canPropose ? "can propose changes" : "read-only"})`);
  }
  const manager = item.catalogSource?.manager;
  if (manager === "codex_plugin_manager") {
    permissions.push(zh ? "以 Codex 扩展形式接入，受当前线程审批策略约束" : "Runs as a Codex extension governed by active thread approval policy");
  } else if (permissions.length === 0) {
    permissions.push(zh ? "按需使用已授权的工作区、资料库与连接资源" : "Uses explicitly authorized workspace, library, and connection resources");
  }
  return permissions;
}

export function catalogManagerLabel(manager: string | undefined, locale: "zh" | "en") {
  return ({ codex_plugin_manager: locale === "zh" ? "Codex 插件" : "Codex plugin", opl_packages: "OPL", homebrew: "Homebrew", homebrew_formula: "Homebrew", opl_managed: "OPL Framework", opl_managed_runtime_generation: "OPL Framework", global_path: locale === "zh" ? "系统环境" : "System environment", user_managed: locale === "zh" ? "用户管理" : "User managed", opl_framework: "OPL Framework", uv: "uv", application: locale === "zh" ? "应用自身" : "Application", package_owner: locale === "zh" ? "软件自身" : "Software installer" })[manager ?? ""] ?? (locale === "zh" ? "管理器待确认" : "Manager not confirmed");
}

export function packageInstallationManagers(item: AgentPackageLifecycleRef): string[] {
  return [...new Set([
    ...(item.installed === true ? ["codex_plugin_manager"] : []),
    ...(item.localInstallations ?? []).map(installation => installation.manager)
  ])];
}

export function activeSoftwareInstallation(installations: SoftwareInstallationRef[] | undefined, activeId?: string, status?: SoftwareActivationStatus) {
  if (status && status !== "active") return undefined;
  const active = (installations ?? []).filter(installation => installation.active);
  return active.length === 1 && (!activeId || active[0].installationId === activeId) ? active[0] : undefined;
}

export function catalogInstalledVersion(item: AgentPackageLifecycleRef, _locale: "zh" | "en") {
  if (item.installations !== undefined) return activeSoftwareInstallation(item.installations, item.activeInstallationId, item.activeInstallationStatus)?.displayVersion
    ?? activeSoftwareInstallation(item.installations, item.activeInstallationId, item.activeInstallationStatus)?.version ?? "—";
  if (item.installed === true && item.installedVersion) return item.installedVersion;
  const versions = [...new Set((item.localInstallations ?? []).map(installation => installation.version).filter(Boolean))];
  return versions.length === 1 ? versions[0] : "—";
}

export function softwareActivationLabel(status: SoftwareActivationStatus | undefined, locale: "zh" | "en") {
  return ({ active: ["已激活", "Active"], inactive: ["尚未激活", "Not activated"], unknown: ["尚未确认当前使用的安装", "Active installation not confirmed"], conflict: ["激活状态冲突", "Conflicting active installations"] })[status ?? "unknown"][locale === "zh" ? 0 : 1];
}

export function softwareCatalogInventory(model: Pick<WorkbenchModel, "packageLifecycle" | "softwareSources">) {
  const packages = softwareCatalogPackages(model, "all");
  const native = softwareCatalogNativeProducts(model, "all");
  const states = [...packages.map(packageCatalogState), ...native.map(({ item }) => nativeCatalogState(item))];
  return {
    total: states.length,
    installed: states.filter(state => ["installed", "update_available", "attention"].includes(state)).length,
    notInstalled: states.filter(state => state === "not_installed").length,
    updates: states.filter(state => state === "update_available").length,
    attention: states.filter(state => state === "attention").length,
    opl: softwareCatalogPackages(model, "opl").length + softwareCatalogNativeProducts(model, "opl").length,
    external: softwareCatalogPackages(model, "external").length + softwareCatalogNativeProducts(model, "external").length,
    components: softwareCatalogPackages(model, "components").length
  };
}

/** The owner selects one update source independently of installed replicas. */
export function nativeCatalogAvailableVersion(product: Pick<ReturnType<typeof nativeSoftwareProducts>[number], "item">, _locale: "zh" | "en") {
  return nativeAvailableDisplayVersion(product.item);
}

/** Currentness describes the dependency as a whole; presence can mean only a partial install. */
export function runtimeDependencyStatus(dependency: ManagedRuntimeDependencyRef, locale: "zh" | "en"): {
  state: SoftwareCatalogState; label?: string;
} {
  const zh = locale === "zh";
  if (dependency.installed === false) return { state: "not_installed" };
  if (dependency.installed !== true) return { state: "unknown" };
  if (dependency.currentness === "missing") {
    return { state: "attention", label: zh ? "组件安装不完整" : "Incomplete installation" };
  }
  if (dependency.currentness === "update_available") return { state: "update_available" };
  if (["failed", "attention_required", "attention_needed", "unavailable"].includes(dependency.status)) {
    return { state: "attention", label: zh ? "运行检查未通过" : "Runtime check failed" };
  }
  if (dependency.dependencyKind === "external_cli" && !dependency.version) {
    return { state: "installed", label: zh ? "已检测到，版本未读" : "Detected, version not read" };
  }
  return { state: "installed" };
}
