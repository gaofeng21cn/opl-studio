import { Box, Cable, CircleAlert, Globe2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { NativeAppUpdateResult } from "../bridge/oplBridge";
import type { ActionReceiptView } from "./actionReceiptView";
import type { ManagedUpdateProjection, WorkbenchModel } from "./workbenchModel";
import type { WorkbenchSettings } from "./settingsModel";
import type { SettingsDestinationId } from "./settings/types";
import type { SettingsActionFeedback } from "./settings/types";
import type { SettingsActionRequest, SettingsActionViewModel, SettingsHostActionIntent } from "./settingsActions";
import { agentPackageNeedsAttention, packageAccessNeedsAttention, packageInstallAllowed, PackageCatalog } from "./settings/packages";
import { UpdatesSettingsPage } from "./settings/pages/UpdatesSettingsPage";
import { SharedResourcesPage } from "./SharedResourcesPage";
import { NativeSoftwareCatalog, SoftwareSourcesPage } from "./SoftwareSourcesPage";
import { knowledgeSourceNeedsAttention } from "./knowledgeSources";
import { nativeSoftwareInventory } from "./softwareSources";

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
};

export function ApplicationManagementPage({ model, stateStatus = "ready", stateError, onApproveConnectionAccess, settings, managedUpdate, actionViewModel, nativeAppUpdate, actionBusyKey, onAction, onHostAction, onRefresh, manifestInstallAction, renderPackageContributions, onOpenSettings, initialTab = "applications", onTabChange, actionFeedback, actionReceipt }: ApplicationManagementPageProps) {
  const [tab, setTab] = useState<ApplicationManagementTab>(initialTab);
  const tabRefs = useRef<Partial<Record<ApplicationManagementTab, HTMLButtonElement | null>>>({});
  useEffect(() => setTab(initialTab), [initialTab]);
  const zh = settings.locale === "zh";
  const catalogPackages = model.packageLifecycle.filter((item) => !["missing_bridge", "agent_packages_directory"].includes(item.packageId));
  const catalogAvailable = model.packageLifecycle.some(item => item.packageId === "agent_packages_directory" || item.statusAxes.some(axis => axis.source === "canonical_agent_packages"));
  const effectiveBusyKey = actionBusyKey ?? (stateStatus !== "ready" ? "application-management:state" : null);
  const nativeInventory = nativeSoftwareInventory(model.softwareSources);
  const installed = nativeInventory.installed + catalogPackages.filter((item) => item.installed === true).length;
  const installable = nativeInventory.installable + catalogPackages.filter((item) => packageInstallAllowed(item)).length;
  const updatesAvailable = nativeInventory.updatesAvailable + catalogPackages.filter((item) => item.currentness.trim().toLowerCase() === "update_available").length;
  const attention = catalogPackages.filter((item) => agentPackageNeedsAttention(item) || packageAccessNeedsAttention(item)).length;
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
  const tabs: Array<{ id: ApplicationManagementTab; label: string; icon: typeof Box }> = [
    { id: "applications", label: zh ? "我的应用" : "My apps", icon: Box },
    { id: "updates", label: zh ? "更新" : "Updates", icon: RefreshCw },
    { id: "resources", label: zh ? "共享资源" : "Shared resources", icon: Cable },
    { id: "sources", label: zh ? "软件源" : "Software sources", icon: Globe2 }
  ];
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
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const current = tabs.findIndex((entry) => entry.id === tab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : event.key === "ArrowRight" || event.key === "ArrowDown" ? (current + 1) % tabs.length
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (current - 1 + tabs.length) % tabs.length : null;
    if (next === null) return;
    event.preventDefault();
    const nextTab = tabs[next]!.id;
    setTab(nextTab);
    onTabChange?.(nextTab);
    tabRefs.current[nextTab]?.focus();
  };
  return <section className="opl-app-management" data-testid="opl-app-management" aria-label={zh ? "应用管理" : "Application management"}>
    <header className="opl-app-management-header">
      <div>
        <div className="opl-app-management-title"><Sparkles aria-hidden="true" size={18} /><h1>{zh ? "应用管理" : "Application management"}</h1></div>
        <p>{zh ? "在一个地方安装、管理和更新 Agent、工作流与共享能力。" : "Install, manage, and update Agents, workflows, and shared capabilities in one place."}</p>
      </div>
      <div className="opl-app-management-environment" data-testid="opl-app-management-environment"><span>{zh ? "当前环境" : "Current environment"}</span><strong>{zh ? "本机 OPL" : "Local OPL"}</strong><button type="button" className="settings-icon-button" aria-label={zh ? "刷新应用管理状态" : "Refresh application management"} title={zh ? "刷新" : "Refresh"} onClick={onRefresh} disabled={actionBusyKey !== null || stateStatus === "loading"}><RefreshCw aria-hidden="true" size={15} /></button></div>
    </header>
    <div className="opl-app-management-summary" role="status">
      {catalogAvailable ? <><span><strong>{catalogPackages.length + nativeInventory.total}</strong> {zh ? (nativeInventory.complete ? "个目录条目" : "个已读取条目") : (nativeInventory.complete ? "catalog entries" : "entries read")}</span><span><strong>{installable}</strong> {zh ? "个可安装" : "installable"}</span><span><strong>{installed}</strong> {zh ? "个已安装" : "installed"}</span></> : <span>{zh ? "尚未读取应用目录" : "App catalog has not been read"}</span>}
      {updatesAvailable ? <span className="attention"><RefreshCw aria-hidden="true" size={14} /><strong>{updatesAvailable}</strong> {zh ? "个有更新" : "updates available"}</span> : null}
      {attention ? <span className="attention"><CircleAlert aria-hidden="true" size={14} /><strong>{attention}</strong> {zh ? "个应用需处理" : "apps need attention"}</span> : null}
      {resourceAttention ? <span className="attention"><CircleAlert aria-hidden="true" size={14} /><strong>{resourceAttention}</strong> {zh ? "项共享资源需处理" : "shared resources need attention"}</span> : null}
      {sourceAttention || model.softwareSources?.status === "attention_required" ? <span className="attention"><CircleAlert aria-hidden="true" size={14} />{sourceAttention ? (zh ? `${sourceAttention} 个软件源需处理` : `${sourceAttention} sources need attention`) : (zh ? "软件源需要处理" : "Software sources need attention")}</span> : null}
      {stateStatus === "ready" && !attention && !resourceAttention && !sourceAttention && model.softwareSources?.status !== "attention_required" ? <span>{stateUnknown ? (zh ? "部分状态待确认" : "Some status is not confirmed") : <><ShieldCheck aria-hidden="true" size={14} />{zh ? "当前没有已知问题" : "No known issues"}</>}</span> : null}
    </div>
    {stateStatus !== "ready" ? <div className="opl-app-management-state" data-testid="opl-app-management-state" data-tone={stateStatus === "error" ? "attention" : "neutral"} role={stateStatus === "error" ? "alert" : "status"}>
      <p>{stateStatus === "loading" ? (zh ? "正在读取应用与共享资源状态…" : "Reading apps and shared resources…") : (zh ? "状态读取失败，当前信息暂未确认。" : "Could not read the current state. Displayed information is not confirmed.")}{observedAt ? ` ${zh ? "保留上次读取：" : "Last read: "}${observedAt}` : ""}</p>
      {stateStatus === "error" ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={onRefresh}><RefreshCw size={14} aria-hidden="true" />{zh ? "重新读取" : "Retry"}</button> : null}
      {stateStatus === "error" && stateError ? <details><summary>{zh ? "错误详情" : "Error details"}</summary><p>{stateError}</p></details> : null}
    </div> : null}
    {actionFeedback ? <div className="opl-app-management-feedback" data-tone={actionFeedback.tone} role="status">{actionFeedback.message}</div> : null}
    {actionReceipt ? <details className="opl-app-management-receipt" data-testid="opl-app-management-receipt"><summary>{zh ? "操作结果" : "Action result"}</summary><p>{actionReceipt.summary}</p>{actionReceipt.nextStep ? <p>{actionReceipt.nextStep}</p> : null}{actionReceipt.receiptId ? <small>{zh ? `技术回执：${actionReceipt.receiptId}` : `Technical receipt: ${actionReceipt.receiptId}`}</small> : null}</details> : null}
    <nav className="opl-app-management-tabs" data-testid="opl-app-management-tabs" role="tablist" aria-label={zh ? "应用管理分区" : "Application management sections"}>
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} ref={(element) => { tabRefs.current[id] = element; }} type="button" role="tab" aria-selected={tab === id} aria-controls={`opl-app-management-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => { setTab(id); onTabChange?.(id); }} onKeyDown={handleTabKeyDown}><Icon aria-hidden="true" size={15} /><span>{label}</span></button>)}
    </nav>
    <div className="opl-app-management-content">
      {tab === "applications" ? <section id="opl-app-management-panel-applications" role="tabpanel" aria-label={tabs[0]!.label}>{catalogAvailable ? <PackageCatalog kind="all" model={model} settings={settings} actionBusyKey={effectiveBusyKey} onAction={onAction} manifestInstallAction={manifestInstallAction} renderPackageContributions={renderPackageContributions} /> : <p className="settings-inline-note">{zh ? "读取目录后，可查看可安装的软件、已安装版本及可用更新。" : "Read the catalog to view available apps, installed versions and updates."}</p>}</section> : null}
      {tab === "updates" ? <section id="opl-app-management-panel-updates" role="tabpanel" aria-label={tabs[1]!.label}><UpdatesSettingsPage {...updatesProps} /><NativeSoftwareCatalog projection={model.softwareSources} locale={settings.locale} actionBusyKey={effectiveBusyKey} onAction={onAction} statusFilter="update:update_available" /></section> : null}
      {tab === "resources" ? <section id="opl-app-management-panel-resources" role="tabpanel" aria-label={tabs[2]!.label}><SharedResourcesPage model={model} settings={settings} actionBusyKey={effectiveBusyKey} onAction={onAction} onRefresh={onRefresh} onApproveConnectionAccess={onApproveConnectionAccess} onOpenSettings={onOpenSettings} onOpenApplicationTab={(nextTab) => { setTab(nextTab); onTabChange?.(nextTab); }} /></section> : null}
      {tab === "sources" ? <section id="opl-app-management-panel-sources" role="tabpanel" aria-label={tabs[3]!.label}><SoftwareSourcesPage projection={model.softwareSources} locale={settings.locale} actionBusyKey={effectiveBusyKey} onAction={onAction} onRefresh={onRefresh} /></section> : null}
    </div>
  </section>;
}
