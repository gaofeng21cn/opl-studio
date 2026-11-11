import { CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type { CodexCapabilityCatalog, NativeAppUpdateResult } from "../bridge/oplBridge";
import type { ActionReceiptView } from "./actionReceiptView";
import type { ManagedUpdateProjection, WorkbenchModel } from "./workbenchModel";
import type { WorkbenchSettings } from "./settingsModel";
import type { SettingsDestinationId } from "./settings/types";
import type { SettingsActionFeedback } from "./settings/types";
import type { SettingsActionRequest, SettingsActionViewModel, SettingsHostActionIntent } from "./settingsActions";
import { agentPackageNeedsAttention, packageAccessNeedsAttention, packageInstallAllowed, packagePresentLocally, packageInstalledLocally, packageDevelopmentLinked } from "./settings/packages";
import { DshPluginManagerOwner } from "../composition/dshPluginManagerOwner";
import { UpdatesSettingsPage } from "./settings/pages/UpdatesSettingsPage";
import { SharedResourcesPage } from "./SharedResourcesPage";
import { SoftwareSourcesPage } from "./SoftwareSourcesPage";
import { knowledgeSourceNeedsAttention } from "./knowledgeSources";
import { nativeSoftwareInventory } from "./softwareSources";
import { softwareCatalogInventory, softwareCatalogPackages } from "./softwareCatalog";

export type ApplicationManagementTab = "applications" | "updates" | "resources" | "sources";

type UpdatesPageProps = Parameters<typeof UpdatesSettingsPage>[0];

type ApplicationManagementPageProps = {
  model: WorkbenchModel;
  stateStatus?: "loading" | "ready" | "error";
  stateError?: string | null;
  onApproveConnectionAccess?: (requestId: string) => Promise<boolean>;
  settings: WorkbenchSettings;
  managedUpdate: ManagedUpdateProjection | null;
  actionViewModel: SettingsActionViewModel;
  nativeAppUpdate: NativeAppUpdateResult | null;
  actionBusyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
  onHostAction?: (intent: SettingsHostActionIntent) => void;
  onRefresh: () => void;
  manifestInstallAction?: {
    actionId: string;
    payloadFields: string[];
    confirmationRequired: boolean;
    dryRunSupported: boolean;
  };
  renderPackageContributions?: (packageId: string) => ReactNode;
  onOpenSettings?: (destination: SettingsDestinationId) => void;
  initialTab?: ApplicationManagementTab;
  onTabChange?: (tab: ApplicationManagementTab) => void;
  actionFeedback?: SettingsActionFeedback | null;
  actionReceipt?: ActionReceiptView | null;
  capabilityCatalog?: CodexCapabilityCatalog;
  capabilityStatus?: "idle" | "loading" | "ready" | "error";
  capabilityError?: string;
  onRefreshCapabilities?: () => void;
};

export function ApplicationManagementPage({ model, stateStatus = "ready", stateError, onApproveConnectionAccess, settings, managedUpdate, actionViewModel, nativeAppUpdate, actionBusyKey, onAction, onHostAction, onRefresh, manifestInstallAction, renderPackageContributions, onOpenSettings, initialTab = "applications", onTabChange, actionFeedback, actionReceipt, capabilityCatalog, capabilityStatus, capabilityError, onRefreshCapabilities }: ApplicationManagementPageProps) {
  const [tab, setTab] = useState<ApplicationManagementTab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
  const zh = settings.locale === "zh";
  const catalogPackages = softwareCatalogPackages(model, "opl");
  const inventory = softwareCatalogInventory(model);
  const catalogAvailable = model.packageLifecycle.some(item => item.packageId === "agent_packages_directory" || item.statusAxes.some(axis => axis.source === "canonical_agent_packages"));
  const effectiveBusyKey = actionBusyKey ?? (stateStatus !== "ready" ? "application-management:state" : null);
  const nativeInventory = nativeSoftwareInventory(model.softwareSources);
  const installed = inventory.installed;
  const notInstalled = inventory.notInstalled;
  const updatesAvailable = inventory.updates;
  const attention = inventory.attention;
  const sourceAttention = model.softwareSources?.entries.filter((source) => source.enabled !== false && source.credentialHandlePresent && ["forbidden", "expired", "revoked", "unknown"].includes(source.status)).length ?? 0;
  const resources = model.applicationManagement?.sharedResources ?? [];
  const resourceAttentionIds = new Set(resources.filter(resource => resource.status === "attention" || resource.authorization?.status === "attention" || resource.revision?.status === "stale" || resource.freshness?.status === "stale" || resource.readiness?.status === "attention").map(resource => resource.resourceId));
  for (const source of model.knowledgeSources?.entries ?? []) {
    if (source.connected === false) resourceAttentionIds.delete(source.resourceId);
    else if (knowledgeSourceNeedsAttention(source)) resourceAttentionIds.add(source.resourceId);
  }
  const resourceAttention = resourceAttentionIds.size;
  const stateUnknown = !catalogAvailable || !model.applicationManagement || !model.softwareSources || !model.knowledgeSources || !nativeInventory.complete
    || resources.some(resource => resource.status === "unknown") || model.knowledgeSources.status === "unknown";
  const observedAt = model.stateGeneratedAt && Number.isFinite(Date.parse(model.stateGeneratedAt))
    ? new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(Date.parse(model.stateGeneratedAt)) : null;
  const updatesProps: UpdatesPageProps = {
    actionViewModel,
    managedUpdate,
    projection: model.settingsProjection,
    settings,
    nativeAppUpdate,
    model,
    actionBusyKey: effectiveBusyKey,
    onAction,
    onHostAction
  };
  const pageTabs = [
    { id: "updates", label: zh ? "更新" : "Updates", content: <UpdatesSettingsPage {...updatesProps} catalogOrigin="opl" onManageSources={() => { setTab("sources"); onTabChange?.("sources"); }} /> },
    { id: "resources", label: zh ? "共享资源" : "Shared resources", content: <SharedResourcesPage model={model} settings={settings} actionBusyKey={effectiveBusyKey} onAction={onAction} onRefresh={onRefresh} onApproveConnectionAccess={onApproveConnectionAccess} onOpenSettings={onOpenSettings} onOpenApplicationTab={(nextTab) => { setTab(nextTab); onTabChange?.(nextTab); }} /> },
    { id: "sources", label: zh ? "软件源" : "Software sources", content: <SoftwareSourcesPage projection={model.softwareSources} locale={settings.locale} actionBusyKey={effectiveBusyKey} onAction={onAction} onRefresh={onRefresh} /> }
  ];
  const headerStatus = <div className="opl-app-management-status"><div className="opl-app-management-overview"><div className="opl-app-management-environment" data-testid="opl-app-management-environment"><span>{zh ? "当前环境" : "Current environment"}</span><strong>{zh ? "本机 OPL" : "Local OPL"}</strong></div>
    <div className="opl-app-management-summary" role="status">
      {catalogAvailable ? <><span><strong>{inventory.total}</strong> {zh ? (nativeInventory.complete ? "个 OPL 软件" : "个已读取 OPL 软件") : (nativeInventory.complete ? "software items" : "software items read")}</span><span><strong>{installed}</strong> {zh ? "个已安装" : "installed"}</span><span><strong>{notInstalled}</strong> {zh ? "个未安装" : "not installed"}</span></> : <span>{zh ? "尚未读取应用目录" : "App catalog has not been read"}</span>}
      {updatesAvailable ? <span className="attention"><RefreshCw aria-hidden="true" size={14} /><strong>{updatesAvailable}</strong> {zh ? "个可更新" : "updates available"}</span> : null}
      {attention ? <span className="attention"><CircleAlert aria-hidden="true" size={14} /><strong>{attention}</strong> {zh ? "个应用需处理" : "apps need attention"}</span> : null}
      {resourceAttention ? <span className="attention"><CircleAlert aria-hidden="true" size={14} /><strong>{resourceAttention}</strong> {zh ? "项共享资源需处理" : "shared resources need attention"}</span> : null}
      {sourceAttention || model.softwareSources?.status === "attention_required" ? <span className="attention"><CircleAlert aria-hidden="true" size={14} />{sourceAttention ? (zh ? `${sourceAttention} 个软件源需处理` : `${sourceAttention} sources need attention`) : (zh ? "软件源需要处理" : "Software sources need attention")}</span> : null}
      {stateStatus === "ready" && !attention && !resourceAttention && !sourceAttention && model.softwareSources?.status !== "attention_required" ? <span>{stateUnknown ? (zh ? "部分状态待确认" : "Some status is not confirmed") : <><ShieldCheck aria-hidden="true" size={14} />{zh ? "当前没有已知问题" : "No known issues"}</>}</span> : null}
    </div></div>
    {stateStatus !== "ready" ? <div className="opl-app-management-state" data-testid="opl-app-management-state" data-tone={stateStatus === "error" ? "attention" : "neutral"} role={stateStatus === "error" ? "alert" : "status"}>
      <p>{stateStatus === "loading" ? (zh ? "正在读取应用与共享资源状态…" : "Reading apps and shared resources…") : (zh ? "状态读取失败，当前信息暂未确认。" : "Could not read the current state. Displayed information is not confirmed.")}{observedAt ? ` ${zh ? "保留上次读取：" : "Last read: "}${observedAt}` : ""}</p>
      {stateStatus === "error" ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={onRefresh}><RefreshCw size={14} aria-hidden="true" />{zh ? "重新读取" : "Retry"}</button> : null}
      {stateStatus === "error" && stateError ? <details><summary>{zh ? "错误详情" : "Error details"}</summary><p>{stateError}</p></details> : null}
    </div> : null}
    {actionFeedback ? <div className="opl-app-management-feedback" data-tone={actionFeedback.tone} role="status">{actionFeedback.message}</div> : null}
    {actionReceipt ? <details className="opl-app-management-receipt" data-testid="opl-app-management-receipt"><summary>{zh ? "操作结果" : "Action result"}</summary><p>{actionReceipt.summary}</p>{actionReceipt.nextStep ? <p>{actionReceipt.nextStep}</p> : null}{actionReceipt.receiptId ? <small>{zh ? `技术回执：${actionReceipt.receiptId}` : `Technical receipt: ${actionReceipt.receiptId}`}</small> : null}</details> : null}</div>;
  return <div className="opl-app-management" data-testid="opl-app-management"><DshPluginManagerOwner kind="all" model={model} settings={settings} actionBusyKey={effectiveBusyKey} onAction={onAction} manifestInstallAction={manifestInstallAction} capabilityCatalog={capabilityCatalog} capabilityStatus={capabilityStatus} capabilityError={capabilityError} onRefreshCapabilities={onRefreshCapabilities} onOpenSettings={onOpenSettings} renderPackageContributions={renderPackageContributions} contributedTabs={pageTabs} selectedTab={tab === "applications" ? "installed" : tab} onTabChange={(next) => { const value = next === "installed" ? "applications" : next as ApplicationManagementTab; setTab(value); onTabChange?.(value); }} pageTitle={zh ? "应用管理" : "Application management"} pageIntro={zh ? "安装、管理和更新你的应用、智能体与共享能力。" : "Install, manage, and update your apps, agents, and shared capabilities."} onRefresh={onRefresh} stateStatus={stateStatus} headerStatus={headerStatus} /></div>;
}
