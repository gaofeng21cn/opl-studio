import type { AgentPackageLifecycleRef, WorkbenchModel } from "./workbenchModel";
import type { NativeSoftwareItemRef } from "./workbenchModel-package-contracts";
import { nativeAvailableDisplayVersion, nativeSoftwareProducts } from "./softwareSources";
import { packageAccessNeedsAttention, packagePresentLocally } from "./settings/packages";

export type SoftwareCatalogScope = "opl" | "external" | "components";
export type SoftwareCatalogState = "not_installed" | "installed" | "update_available" | "attention" | "unknown";

/** Maintenance origin is supplied by Framework; technical package roles never select the source. */
export function packageCatalogScope(item: AgentPackageLifecycleRef): SoftwareCatalogScope {
  if (item.catalogScope === "host_component") return "components";
  return item.catalogOrigin === "opl" ? "opl" : "external";
}

export function softwareCatalogPackages(model: Pick<WorkbenchModel, "packageLifecycle">, scope: SoftwareCatalogScope) {
  return model.packageLifecycle.filter(item => !["missing_bridge", "agent_packages_directory"].includes(item.packageId) && packageCatalogScope(item) === scope);
}

export function softwareCatalogNativeProducts(model: Pick<WorkbenchModel, "softwareSources">, scope: SoftwareCatalogScope) {
  return nativeSoftwareProducts(model.softwareSources).filter(({ item }) => scope !== "components" && (item.catalogOrigin === "opl" ? "opl" : "external") === scope);
}

export function packageCatalogState(item: AgentPackageLifecycleRef): SoftwareCatalogState {
  if (packagePresentLocally(item)) {
    // Runtime state for a missing host plugin does not describe a standalone installation.
    if (item.installed === true && (packageAccessNeedsAttention(item) || ["staged", "needs_restart", "needs_reload", "failed_with_repair", "skipped_manual_required"].includes(item.currentness) || item.readiness.operationalReady === false || item.readiness.callable === false || item.readiness.launchAllowed === false)) return "attention";
    if (item.installed === true && item.currentness === "update_available") return "update_available";
    return "installed";
  }
  return item.installed === false ? "not_installed" : "unknown";
}

export function nativeCatalogState(item: NativeSoftwareItemRef): SoftwareCatalogState {
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
  return ({ codex_plugin_manager: "Codex", opl_packages: "OPL", homebrew: "Homebrew", opl_framework: "OPL Framework", uv: "uv", package_owner: locale === "zh" ? "软件自身" : "Software installer" })[manager ?? ""] ?? (locale === "zh" ? "管理器待确认" : "Manager not confirmed");
}

export function packageInstallationManagers(item: AgentPackageLifecycleRef): string[] {
  return [...new Set([
    ...(item.installed === true ? ["codex_plugin_manager"] : []),
    ...(item.localInstallations ?? []).map(installation => installation.manager)
  ])];
}

export function catalogInstalledVersion(item: AgentPackageLifecycleRef, locale: "zh" | "en") {
  if (item.installed === true && item.installedVersion) return item.installedVersion;
  const versions = [...new Set((item.localInstallations ?? []).map(installation => installation.version).filter(Boolean))];
  if (versions.length === 1) return versions[0];
  if (versions.length > 1) return locale === "zh" ? "多个版本" : "Multiple versions";
  return item.installed === false ? "—" : locale === "zh" ? "待检查" : "Not checked";
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

/** Multiple channels need an explicit receipt before one becomes the selected version. */
export function nativeCatalogAvailableVersion(product: ReturnType<typeof nativeSoftwareProducts>[number], locale: "zh" | "en") {
  const selected = product.channels.filter(channel => channel.item.homebrewInstalled === true);
  if (selected.length === 1) return nativeAvailableDisplayVersion(selected[0].item);
  const versions = [...new Set(product.channels.map(channel => channel.item.availableVersion).filter(Boolean))];
  return versions.length > 1 ? (locale === "zh" ? "多个渠道" : "Multiple channels")
    : nativeAvailableDisplayVersion(product.channels.find(channel => channel.item.availableVersion)?.item ?? product.item);
}
