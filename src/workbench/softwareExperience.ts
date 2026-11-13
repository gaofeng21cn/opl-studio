import type { AgentPackageLifecycleRef, WorkbenchModel } from "./workbenchModel";
import { agentPackageNeedsAttention, packagePresentLocally } from "./settings/packages";
import { nativeCatalogState, packageCatalogState, softwareCatalogPackages, softwareCatalogNativeProducts } from "./softwareCatalog";
import { knowledgeSourceNeedsAttention } from "./knowledgeSources";

/** Navigation only. Installation, permissions and task execution retain their owners. */
export function softwareCanStart(item: AgentPackageLifecycleRef): boolean {
  return packagePresentLocally(item) && item.appEnabled
    && item.activeInstallationStatus !== "conflict" && item.activeInstallationStatus !== "inactive"
    && item.readiness.launchAllowed !== false && item.readiness.callable !== false
    && (item.homeShortcuts.some(shortcut => Boolean(shortcut.route)) || Boolean(item.miniAppEntry));
}

export type SoftwareAttentionItem = {
  id: string; title: string; detail: string; products: string[]; productIds: string[];
  destination: "applications" | "sources" | "resources"; packageId?: string;
};

/** Merge only explicit owner relationships; a common label is not evidence of a common cause. */
export function softwareAttentionItems(model: WorkbenchModel, locale: "zh" | "en"): SoftwareAttentionItem[] {
  const zh = locale === "zh";
  const packages = softwareCatalogPackages(model, "opl");
  const name = (id: string) => { const item = packages.find(item => item.packageId === id); return item?.displayNameI18n[locale] ?? item?.label ?? id; };
  const issues: SoftwareAttentionItem[] = [];
  const covered = new Set<string>();
  for (const source of model.softwareSources?.entries ?? []) {
    const affected = packages.filter(item => item.access?.sourceRef === source.sourceRef);
    if (source.enabled === false || !["forbidden", "expired", "revoked", "signed_out"].includes(source.status)
      || (!source.credentialHandlePresent && !affected.some(packagePresentLocally))) continue;
    const products = affected.map(item => item.packageId);
    for (const id of products) covered.add(id);
    issues.push({ id: `source:${source.sourceId}`, title: zh ? `连接 ${source.displayName}` : `Connect ${source.displayName}`,
      detail: zh ? "恢复此软件源的检查、安装与更新权限。已安装软件的使用权限单独判断。" : "Restore source access for checks, installation and updates. Local use is checked separately.",
      products: products.map(name), productIds: products, destination: "sources" });
  }
  const knowledge = new Map((model.knowledgeSources?.entries ?? []).map(source => [source.resourceId, source]));
  for (const resource of model.applicationManagement?.sharedResources ?? []) {
    if (knowledge.has(resource.resourceId)) continue;
    if (!resource.consumerPackageIds.some(id => packages.some(item => item.packageId === id && packagePresentLocally(item)))) continue;
    if (resource.status !== "attention" && resource.authorization?.status !== "attention" && resource.readiness?.status !== "attention") continue;
    const products = resource.consumerPackageIds.filter(id => packages.some(item => item.packageId === id));
    issues.push({ id: resource.resourceId, title: resource.labelI18n?.[locale] ?? resource.label,
      detail: zh ? "此共享资源需要检查或重新授权。" : "This shared resource needs checking or renewed access.", products: products.map(name), productIds: products, destination: "resources" });
  }
  for (const source of knowledge.values()) {
    if (!knowledgeSourceNeedsAttention(source)) continue;
    const products = source.consumerPackageIds.filter(id => packages.some(item => item.packageId === id && packagePresentLocally(item)));
    if (!products.length) continue;
    issues.push({ id: source.resourceId, title: source.label,
      detail: zh ? "资料或授权需要复核；在原资料库中处理后重新检查。" : "Review the source or its access, then check again.", products: products.map(name), productIds: products, destination: "resources" });
  }
  for (const item of packages) {
    const independentFailure = item.activeInstallationStatus === "conflict" || agentPackageNeedsAttention(item);
    if (packageCatalogState(item) !== "attention" || (covered.has(item.packageId) && !independentFailure)) continue;
    issues.push({ id: `package:${item.packageId}`, title: name(item.packageId),
      detail: zh ? "查看此软件的配置、安装与恢复操作。" : "Review this software's setup, installation and recovery actions.",
      products: [], productIds: [item.packageId], destination: "applications", packageId: item.packageId });
  }
  for (const { productId, item } of softwareCatalogNativeProducts(model, "opl")) {
    if (nativeCatalogState(item) !== "attention") continue;
    issues.push({ id: `native:${productId}`, title: item.productDisplayName ?? item.displayName,
      detail: item.updateStatus === "needs_restart" ? (zh ? "更新已准备好，需要重新启动应用。" : "An update is ready. Restart the application to finish.") : (zh ? "需要确认当前使用的安装。" : "Confirm which installation should be used."),
      products: [], productIds: [productId], destination: "applications", packageId: productId });
  }
  return issues;
}
