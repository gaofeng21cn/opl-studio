import { PackageOperations } from './PackageInstallationProgress';
import type { usePackageOperations } from './usePackageOperations';
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { softwareAttentionItems, softwareCanStart } from "./softwareExperience";
import { packageActivity } from "./packageOperations";
import { SoftwareCenterOverview } from "./SoftwareCenterOverview";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { CodexCapabilityCatalog, NativeAppUpdateResult } from "../bridge/oplBridge";
import type { ActionReceiptView } from "./actionReceiptView";
import type { ManagedUpdateProjection, WorkbenchModel } from "./workbenchModel";
import type { WorkbenchSettings } from "./settingsModel";
import type { ResourceSettingsFocus, SettingsDestinationId } from "./settings/types";
import type { SettingsActionFeedback } from "./settings/types";
import type { SettingsActionRequest, SettingsActionViewModel, SettingsHostActionIntent } from "./settingsActions";
import { DshPluginManagerOwner } from "../composition/dshPluginManagerOwner";
import { UpdatesSettingsPage } from "./settings/pages/UpdatesSettingsPage";
import { SoftwareSourcesPage } from "./SoftwareSourcesPage";
import { nativeSoftwareInventory, pendingSoftwareSourceAccessCheck, softwareSourceActionLabel } from "./softwareSources";
import { softwareCatalogInventory } from "./softwareCatalog";

export type ApplicationManagementTab = "applications" | "updates" | "activity" | "resources" | "sources";

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
  onOpenSettings?: (destination: SettingsDestinationId, focus?: ResourceSettingsFocus) => void;
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

export function ApplicationManagementPage({ packageOperations, model, stateStatus = "ready", stateError, onApproveConnectionAccess, settings, managedUpdate, actionViewModel, nativeAppUpdate, actionBusyKey, onAction, onHostAction, onRefresh, manifestInstallAction, onOpenSettings, initialTab = "applications", onTabChange, actionFeedback, actionReceipt, capabilityCatalog, capabilityStatus, capabilityError, onRefreshCapabilities, onUseSoftware, onPickKnowledgeDirectory, onOpenInstallationLocation }: ApplicationManagementPageProps) {
  const [tab, setTab] = useState<ApplicationManagementTab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
  const zh = settings.locale === "zh";
  const accessChecks = useRef(new Set<string>());
  useEffect(() => {
    for (const sourceId of accessChecks.current) {
      if (!model.softwareSources?.entries.some(source => source.sourceId === sourceId && source.accessRefreshRequired)) accessChecks.current.delete(sourceId);
    }
    if (stateStatus !== "ready" || actionBusyKey !== null) return;
    const pending = pendingSoftwareSourceAccessCheck(model.softwareSources, accessChecks.current);
    if (!pending) return;
    const { source, action } = pending;
    accessChecks.current.add(source.sourceId);
    onAction({ key: `source:${source.sourceId}:source_check`, actionId: action.actionId,
      label: softwareSourceActionLabel(action.actionId, settings.locale, action.label), payload: action.payload,
      confirmationRequired: action.confirmationRequired, dryRunSupported: action.dryRunSupported });
  }, [actionBusyKey, model.softwareSources, onAction, settings.locale, stateStatus]);
  const [pendingPackageId, setPendingPackageId] = useState<string>();
  const [statusFilter, setStatusFilter] = useState("all");
  const [focus, setFocus] = useState<{ packageId: string; revision: number }>();
  const pendingPackage = model.packageLifecycle.find(item => item.packageId === pendingPackageId);
  const pendingPackageReady = stateStatus === "ready" && pendingPackage && softwareCanStart(pendingPackage)
    && !packageOperations?.operations.some(operation => operation.status === "running"
      && (operation.package_id === pendingPackageId || operation.active_package_id === pendingPackageId));
  const navigate = (next: ApplicationManagementTab, resourceFocus?: ResourceSettingsFocus) => {
    if (next === "resources" && onOpenSettings) { onOpenSettings("resources", resourceFocus); return; }
    setTab(next); onTabChange?.(next);
  };
  useEffect(() => {
    if (tab === "resources" && onOpenSettings) {
      setTab("applications"); onTabChange?.("applications"); onOpenSettings("resources");
    }
  }, [tab, onOpenSettings, onTabChange]);
  const configureSoftware = (packageId: string) => { setPendingPackageId(packageId); navigate("resources", { packageId }); };
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
  const resources = (model.applicationManagement?.sharedResources ?? []).filter(resource => ["knowledge_source", "connection"].includes(resource.resourceKind) && resource.consumerPackageIds.some(id => model.packageLifecycle.some(item => item.packageId === id && item.installed === true)));
  const stateUnknown = inventory.total > inventory.installed + inventory.notInstalled || !catalogAvailable || !model.softwareSources || !nativeInventory.complete
    || resources.some(resource => resource.status === "unknown");
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
  const refreshAll = () => { accessChecks.current.clear(); onRefresh(); packageOperations?.refresh(); };
  const updatesLabel = inventory.updates > 0 ? (zh ? `更新 (${inventory.updates})` : `Updates (${inventory.updates})`) : (zh ? "更新" : "Updates");
  const activityLabel = activity.running > 0 ? (zh ? `安装记录 (${activity.running})` : `Activity (${activity.running})`) : (zh ? "安装记录" : "Installation activity");
  const pageTabs = [
    { id: "updates", label: updatesLabel, content: <UpdatesSettingsPage {...updatesProps} catalogOrigin="opl" onManageSources={() => navigate("sources")} /> },
    { id: "activity", label: activityLabel, content: packageOperations && (packageOperations.operations.length || packageOperations.readError)
      ? <PackageOperations operations={packageOperations.operations} locale={settings.locale}
          labels={Object.fromEntries(model.packageLifecycle.map(item => [item.packageId, item.displayNameI18n[settings.locale] ?? item.label]))}
          readError={packageOperations.readError} cancelling={packageOperations.cancelling} onCancel={id => void packageOperations.cancel(id)}
          onRetry={runAction} onRefresh={refreshAll} onUse={onUseSoftware}
          readyPackageIds={stateStatus === "ready" ? model.packageLifecycle.filter(softwareCanStart).map(item => item.packageId) : []}
          onOpenLocation={onOpenInstallationLocation} />
      : <p className="opl-app-management-feedback">{zh ? "暂无安装、更新或恢复记录。" : "No installation, update or recovery activity yet."}</p> },
    ...(tab === "sources" ? [{ id: "sources", label: zh ? "软件源" : "Software sources", content: <SoftwareSourcesPage projection={model.softwareSources} locale={settings.locale} actionBusyKey={effectiveBusyKey} onAction={onAction} onRefresh={onRefresh} /> }] : [])
  ];
  const headerStatus = <div className="opl-app-management-status">
    {tab === "applications" ? <>
      <SoftwareCenterOverview locale={settings.locale} stateStatus={stateStatus} stateUnknown={stateUnknown}
        inventory={inventory} catalogAvailable={catalogAvailable} complete={nativeInventory.complete}
        activity={activity} observedAt={observedAt} statusFilter={statusFilter} onSelectStatus={setStatusFilter}
        onUpdates={() => navigate("updates")} onActivity={() => navigate("activity")} onRefresh={refreshAll} />
      {stateStatus === "error" && stateError ? <details className="opl-app-management-receipt" data-testid="opl-app-management-state">
        <summary>{zh ? "读取错误详情" : "Read error details"}</summary><p>{stateError}</p>
      </details> : null}
      {issues.length ? <details className="opl-software-attention">
        <summary>{zh ? `软件与来源问题 · ${issues.length}` : `Software and source issues · ${issues.length}`}</summary>
        {issues.map(issue => <div className="opl-software-attention-row" key={issue.id}>
          <div><strong>{issue.title}</strong><p>{issue.detail}</p>
            {issue.products.length ? <small>{issue.products.join(zh ? "、" : ", ")}</small> : null}</div>
          <Button size="sm" variant="outline" onClick={() => {
            navigate(issue.destination, { packageId: issue.productIds[0], resourceId: issue.id });
            if (issue.packageId) setFocus({ packageId: issue.packageId, revision: Date.now() });
          }}>{issue.destination === "sources" ? (zh ? "管理软件源" : "Manage sources")
            : issue.destination === "resources" ? (zh ? "打开资料与连接" : "Open resource settings")
              : (zh ? "在目录中查看" : "Find in catalog")}</Button>
        </div>)}
      </details> : null}
      {pendingPackageReady && onUseSoftware ? <div className="opl-software-continuation">
        <span role="status">{pendingPackage.displayNameI18n[settings.locale] ?? pendingPackage.label} {zh ? "已可使用" : "is ready"}</span>
        <div className="runtime-setting-control">
          <Button size="sm" variant="primary" disabled={actionBusyKey !== null} onClick={() => onUseSoftware(pendingPackage.packageId)}>{zh ? "继续使用" : "Continue"}</Button>
          <Button size="sm" variant="outline" onClick={() => setPendingPackageId(undefined)}>{zh ? "收起" : "Dismiss"}</Button>
        </div>
      </div> : null}
    </> : null}
    {actionFeedback ? <div className="opl-app-management-feedback" data-tone={actionFeedback.tone} role="status">{actionFeedback.message}</div> : null}
    {actionReceipt ? <details className="opl-app-management-receipt" data-testid="opl-app-management-receipt"><summary>{zh ? "操作结果" : "Action result"}</summary><p>{actionReceipt.summary}</p>{actionReceipt.nextStep ? <p>{actionReceipt.nextStep}</p> : null}{actionReceipt.receiptId ? <small>{zh ? `技术回执：${actionReceipt.receiptId}` : `Technical receipt: ${actionReceipt.receiptId}`}</small> : null}</details> : null}</div>;
  return <div className="opl-app-management" data-testid="opl-app-management"><DshPluginManagerOwner packageOperations={packageOperations?.operations} operationsReadError={packageOperations?.readError} kind="all" managedUpdate={managedUpdate} model={model} settings={settings} actionBusyKey={effectiveBusyKey} onAction={runAction} onUseSoftware={onUseSoftware} onConfigureSoftware={configureSoftware} focus={focus} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} onOpenInstallationLocation={onOpenInstallationLocation} manifestInstallAction={manifestInstallAction} capabilityCatalog={capabilityCatalog} capabilityStatus={capabilityStatus} capabilityError={capabilityError} onRefreshCapabilities={onRefreshCapabilities} onOpenSettings={onOpenSettings} contributedTabs={pageTabs} selectedTab={tab === "applications" ? "installed" : tab} onTabChange={(next) => { const value = next === "installed" ? "applications" : next as ApplicationManagementTab; setTab(value); onTabChange?.(value); }} pageTitle={zh ? "软件中心" : "Software Center"} pageIntro={zh ? "按需安装、组合与更新软件和插件。" : "Install, compose, and update software and plugins."} onRefresh={refreshAll} stateStatus={stateStatus} headerStatus={headerStatus} /></div>;
}
