import type { AgentPackageLifecycleRef, WorkbenchModel } from "./workbenchModel";
import type { NativeSoftwareItemRef, SoftwareActivationStatus, SoftwareInstallationRef } from "./workbenchModel-package-contracts";
import { nativeAvailableDisplayVersion, nativeSoftwareProducts } from "./softwareSources";
import { packageAccessNeedsAttention, packagePresentLocally } from "./settings/packages";

export type SoftwareCatalogScope = "opl" | "external" | "components";
export type SoftwareCatalogState = "not_installed" | "installed" | "update_available" | "attention" | "unknown";

/** Maintenance origin is supplied by Framework; technical package roles never select the source. */
export function packageCatalogScope(item: AgentPackageLifecycleRef): SoftwareCatalogScope {
  if (item.managementScope === "local_component" || item.catalogScope === "host_component") return "components";
  return item.catalogOrigin === "opl" ? "opl" : "external";
}

export function softwareCatalogPackages(model: Pick<WorkbenchModel, "packageLifecycle">, scope: SoftwareCatalogScope) {
  return model.packageLifecycle.filter(item => item.managementScope !== "deployment_target" && !["missing_bridge", "agent_packages_directory"].includes(item.packageId) && packageCatalogScope(item) === scope);
}

export function softwareCatalogNativeProducts(model: Pick<WorkbenchModel, "softwareSources">, scope: SoftwareCatalogScope) {
  return nativeSoftwareProducts(model.softwareSources).filter(({ item }) => scope !== "components" && (item.catalogOrigin === "opl" ? "opl" : "external") === scope);
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
  return ({ not_installed: ["未安装", "Not installed"], installed: ["已安装", "Installed"], update_available: ["可更新", "Update available"], attention: ["需处理", "Needs attention"], unknown: ["待检查", "Not checked"] })[state][locale === "zh" ? 0 : 1];
}

export function catalogTypeLabel(item: Pick<AgentPackageLifecycleRef, "softwareType" | "catalogOrigin" | "catalogSource">, locale: "zh" | "en") {
  if (item.catalogOrigin !== "opl" && item.catalogSource?.manager === "codex_plugin_manager") return locale === "zh" ? "Codex 插件" : "Codex plugin";
  return ({ application: ["应用", "Application"], agent: ["智能体", "Agent"], capability: ["能力包", "Capability"], unknown: ["未分类", "Unclassified"] })[item.softwareType ?? "unknown"][locale === "zh" ? 0 : 1];
}

export function catalogManagerLabel(manager: string | undefined, locale: "zh" | "en") {
  return ({ codex_plugin_manager: "Codex", opl_packages: "OPL", homebrew: "Homebrew", homebrew_formula: "Homebrew", opl_managed: "OPL Framework", opl_managed_runtime_generation: "OPL Framework", global_path: locale === "zh" ? "系统环境" : "System environment", user_managed: locale === "zh" ? "用户管理" : "User managed", opl_framework: "OPL Framework", uv: "uv", application: locale === "zh" ? "应用自身" : "Application", package_owner: locale === "zh" ? "软件自身" : "Software installer" })[manager ?? ""] ?? (locale === "zh" ? "管理器待确认" : "Manager not confirmed");
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
  const packages = softwareCatalogPackages(model, "opl");
  const native = softwareCatalogNativeProducts(model, "opl");
  const states = [...packages.map(packageCatalogState), ...native.map(({ item }) => nativeCatalogState(item))];
  return {
    total: states.length,
    installed: states.filter(state => ["installed", "update_available", "attention"].includes(state)).length,
    notInstalled: states.filter(state => state === "not_installed").length,
    updates: states.filter(state => state === "update_available").length,
    attention: states.filter(state => state === "attention").length,
    external: softwareCatalogPackages(model, "external").length + softwareCatalogNativeProducts(model, "external").length,
    components: softwareCatalogPackages(model, "components").length
  };
}

/** The owner selects one update source independently of installed replicas. */
export function nativeCatalogAvailableVersion(product: Pick<ReturnType<typeof nativeSoftwareProducts>[number], "item">, _locale: "zh" | "en") {
  return nativeAvailableDisplayVersion(product.item);
}
