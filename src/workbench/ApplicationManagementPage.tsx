import { PackageOperations } from './PackageInstallationProgress';
import type { usePackageOperations } from './usePackageOperations';
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { softwareAttentionItems, softwareCanStart } from "./softwareExperience";
import { RefreshCw } from "lucide-react";
import { packageActivity, latestPackageOperations } from "./packageOperations";
import { SoftwareCenterOverview } from "./SoftwareCenterOverview";
import { useEffect, useState, type ReactNode } from "react";

import type { CodexCapabilityCatalog, NativeAppUpdateResult } from "../bridge/oplBridge";
import type { ActionReceiptView } from "./actionReceiptView";
import type { ManagedUpdateProjection, WorkbenchModel } from "./workbenchModel";
import type { WorkbenchSettings } from "./settingsModel";
import type { SettingsDestinationId } from "./settings/types";
import type { SettingsActionFeedback } from "./settings/types";
import type { SettingsActionRequest, SettingsActionViewModel, SettingsHostActionIntent } from "./settingsActions";
import { DshPluginManagerOwner } from "../composition/dshPluginManagerOwner";
import { UpdatesSettingsPage } from "./settings/pages/UpdatesSettingsPage";
import { SharedResourcesPage } from "./SharedResourcesPage";
import { SoftwareSourcesPage } from "./SoftwareSourcesPage";
import { nativeSoftwareInventory } from "./softwareSources";
import { softwareCatalogInventory } from "./softwareCatalog";

export type ApplicationManagementTab = "applications" | "updates" | "resources" | "sources";

type UpdatesPageProps = Parameters<typeof UpdatesSettingsPage>[0];

type ApplicationManagementPageProps = {
  packageOperations?: ReturnType<typeof usePackageOperations>;
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
  onUseSoftware?: (packageId: string) => void;
  onPickKnowledgeDirectory?: () => Promise<string | undefined>;
  onOpenInstallationLocation?: (path: string) => void;
};

export function ApplicationManagementPage({ packageOperations, model, stateStatus = "ready", stateError, onApproveConnectionAccess, settings, managedUpdate, actionViewModel, nativeAppUpdate, actionBusyKey, onAction, onHostAction, onRefresh, manifestInstallAction, renderPackageContributions, onOpenSettings, initialTab = "applications", onTabChange, actionFeedback, actionReceipt, capabilityCatalog, capabilityStatus, capabilityError, onRefreshCapabilities, onUseSoftware, onPickKnowledgeDirectory, onOpenInstallationLocation }: ApplicationManagementPageProps) {
  const [tab, setTab] = useState<ApplicationManagementTab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
  const zh = settings.locale === "zh";
  const [pendingPackageId, setPendingPackageId] = useState<string>();
  const [focus, setFocus] = useState<{ packageId: string; revision: number }>();
  const pendingPackage = model.packageLifecycle.find(item => item.packageId === pendingPackageId);
  const pendingPackageReady = stateStatus === "ready" && pendingPackage && softwareCanStart(pendingPackage)
    && !packageOperations?.operations.some(operation => operation.status === "running"
      && (operation.package_id === pendingPackageId || operation.active_package_id === pendingPackageId));
  const navigate = (next: ApplicationManagementTab) => { setTab(next); onTabChange?.(next); };
  const configureSoftware = (packageId: string) => { setPendingPackageId(packageId); navigate("resources"); };
  const runAction = (request: SettingsActionRequest) => {
    const operation = request.payload.operation;
    const preparing = operation === "install" || operation === "repair"
      || operation === undefined && /(?:^|_)(?:install|repair)$/.test(request.actionId);
    if (typeof request.payload.package_id === "string" && preparing) setPendingPackageId(request.payload.package_id);
    onAction(request);
  };
  const issues = softwareAttentionItems(model, settings.locale);
  const inventory = softwareCatalogInventory(model);
  const catalogAvailable = model.packageLifecycle.some(item => item.packageId === "agent_packages_directory" || item.statusAxes.some(axis => axis.source === "canonical_agent_packages"));
  const effectiveBusyKey = actionBusyKey ?? (stateStatus !== "ready" ? "application-management:state" : null);
  const nativeInventory = nativeSoftwareInventory(model.softwareSources);
  const activity = packageActivity(packageOperations?.operations ?? [], packageOperations?.readError ?? false);
  const affected = new Set([...issues.flatMap(issue => issue.productIds), ...latestPackageOperations(packageOperations?.operations ?? [])
    .filter(operation => ['failed', 'interrupted'].includes(operation.status)).map(operation => operation.package_id)]).size;
  const resources = model.applicationManagement?.sharedResources ?? [];
  const stateUnknown = inventory.total > inventory.installed + inventory.notInstalled || !catalogAvailable || !model.applicationManagement || !model.softwareSources || !model.knowledgeSources || !nativeInventory.complete
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
    { id: "resources", label: zh ? "共享资源" : "Shared resources", content: <SharedResourcesPage model={model} settings={settings} actionBusyKey={effectiveBusyKey} onAction={onAction} onRefresh={onRefresh} onApproveConnectionAccess={onApproveConnectionAccess} onPickKnowledgeDirectory={onPickKnowledgeDirectory} selectedPackageId={pendingPackageId} onOpenSettings={onOpenSettings} onOpenApplicationTab={(nextTab) => { setTab(nextTab); onTabChange?.(nextTab); }} /> },
    ...(tab === "sources" ? [{ id: "sources", label: zh ? "软件源" : "Software sources", content: <SoftwareSourcesPage projection={model.softwareSources} locale={settings.locale} actionBusyKey={effectiveBusyKey} onAction={onAction} onRefresh={onRefresh} /> }] : [])
  ];
  const refreshAll = () => { onRefresh(); packageOperations?.refresh(); };
  const headerStatus = <div className="opl-app-management-status">
    <SoftwareCenterOverview locale={settings.locale} stateStatus={stateStatus} stateUnknown={stateUnknown} inventory={inventory}
      catalogAvailable={catalogAvailable} complete={nativeInventory.complete} activity={activity} issues={issues.length} affected={affected}
      observedAt={observedAt} onUpdates={() => navigate('updates')} onRefresh={refreshAll} />
    {pendingPackage ? <div className="opl-software-continuation" role="status"><div><strong>{pendingPackage.displayNameI18n[settings.locale] ?? pendingPackage.label}</strong><p>{pendingPackageReady ? (zh ? "已可使用，可以继续原来的任务。" : "Ready to use. Continue your task.") : (zh ? "完成安装或必要授权后，可在这里继续。" : "Continue here after installation or required access is ready.")}</p></div><div className="runtime-setting-control">{pendingPackageReady && onUseSoftware ? <Button size="sm" variant="primary" disabled={effectiveBusyKey !== null} onClick={() => onUseSoftware(pendingPackage.packageId)}>{zh ? "继续使用" : "Continue"}</Button> : <Button size="sm" variant="outline" onClick={() => { navigate("applications"); setFocus({ packageId: pendingPackage.packageId, revision: Date.now() }); }}>{zh ? "返回软件" : "Back to software"}</Button>}<Button size="sm" variant="outline" onClick={() => setPendingPackageId(undefined)}>{zh ? "收起" : "Dismiss"}</Button></div></div> : null}
    {issues.length ? <details className="opl-software-attention" open><summary>{zh ? "需要处理" : "Needs attention"} · {issues.length}</summary>{issues.map(issue => <div className="opl-software-attention-row" key={issue.id}><div><strong>{issue.title}</strong><p>{issue.detail}</p>{issue.products.length ? <small>{zh ? `影响 ${issue.productIds.length} 个软件：` : `Affects ${issue.productIds.length} software items: `}{issue.products.join(zh ? "、" : ", ")}</small> : null}</div><Button size="sm" variant="outline" disabled={effectiveBusyKey !== null} onClick={() => { navigate(issue.destination); if (issue.packageId) setFocus({ packageId: issue.packageId, revision: Date.now() }); }}>{issue.destination === "sources" ? (zh ? "管理连接" : "Manage connection") : issue.destination === "resources" ? (zh ? "查看共享资源" : "Review resources") : (zh ? "查看并处理" : "Review")}</Button></div>)}</details> : null}
    {stateStatus !== "ready" ? <div className="opl-app-management-state" data-testid="opl-app-management-state" data-tone={stateStatus === "error" ? "attention" : "neutral"} role={stateStatus === "error" ? "alert" : "status"}>
      <p>{stateStatus === "loading" ? (zh ? "正在读取应用与共享资源状态…" : "Reading apps and shared resources…") : (zh ? "状态读取失败，当前信息暂未确认。" : "Could not read the current state. Displayed information is not confirmed.")}{observedAt ? ` ${zh ? "保留上次读取：" : "Last read: "}${observedAt}` : ""}</p>
      {stateStatus === "error" ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={onRefresh}><RefreshCw size={14} aria-hidden="true" />{zh ? "重新读取" : "Retry"}</button> : null}
      {stateStatus === "error" && stateError ? <details><summary>{zh ? "错误详情" : "Error details"}</summary><p>{stateError}</p></details> : null}
    </div> : null}
    {packageOperations ? <PackageOperations operations={packageOperations.operations} locale={settings.locale} labels={Object.fromEntries(model.packageLifecycle.map(item => [item.packageId, item.displayNameI18n[settings.locale] ?? item.label]))} readError={packageOperations.readError} cancelling={packageOperations.cancelling} onCancel={id => void packageOperations.cancel(id)} onRetry={runAction} onRefresh={refreshAll} onUse={onUseSoftware} readyPackageIds={stateStatus === "ready" ? model.packageLifecycle.filter(softwareCanStart).map(item => item.packageId) : []} onOpenLocation={onOpenInstallationLocation} /> : null}
    {actionFeedback ? <div className="opl-app-management-feedback" data-tone={actionFeedback.tone} role="status">{actionFeedback.message}</div> : null}
    {actionReceipt ? <details className="opl-app-management-receipt" data-testid="opl-app-management-receipt"><summary>{zh ? "操作结果" : "Action result"}</summary><p>{actionReceipt.summary}</p>{actionReceipt.nextStep ? <p>{actionReceipt.nextStep}</p> : null}{actionReceipt.receiptId ? <small>{zh ? `技术回执：${actionReceipt.receiptId}` : `Technical receipt: ${actionReceipt.receiptId}`}</small> : null}</details> : null}</div>;
  return <div className="opl-app-management" data-testid="opl-app-management"><DshPluginManagerOwner packageOperations={packageOperations?.operations} operationsReadError={packageOperations?.readError} kind="all" managedUpdate={managedUpdate} model={model} settings={settings} actionBusyKey={effectiveBusyKey} onAction={runAction} onUseSoftware={onUseSoftware} onConfigureSoftware={configureSoftware} focus={focus} onOpenInstallationLocation={onOpenInstallationLocation} manifestInstallAction={manifestInstallAction} capabilityCatalog={capabilityCatalog} capabilityStatus={capabilityStatus} capabilityError={capabilityError} onRefreshCapabilities={onRefreshCapabilities} onOpenSettings={onOpenSettings} renderPackageContributions={renderPackageContributions} contributedTabs={pageTabs} selectedTab={tab === "applications" ? "installed" : tab} onTabChange={(next) => { const value = next === "installed" ? "applications" : next as ApplicationManagementTab; setTab(value); onTabChange?.(value); }} pageTitle={zh ? "软件中心" : "Software Center"} pageIntro={zh ? "找到需要的软件，开始使用，并管理更新与共享资源。" : "Find software, start using it, and manage updates and shared resources."} onRefresh={refreshAll} stateStatus={stateStatus} headerStatus={headerStatus} /></div>;
}
