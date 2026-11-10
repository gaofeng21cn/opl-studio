import { Box, Cable, CircleAlert, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { NativeAppUpdateResult } from "../bridge/oplBridge";
import type { ActionReceiptView } from "./actionReceiptView";
import type { ApplicationManagementResource, ManagedUpdateProjection, WorkbenchModel } from "./workbenchModel";
import type { WorkbenchSettings } from "./settingsModel";
import type { SettingsDestinationId } from "./settings/types";
import type { SettingsActionFeedback } from "./settings/types";
import type { SettingsActionRequest, SettingsActionViewModel, SettingsHostActionIntent } from "./settingsActions";
import { agentPackageNeedsAttention, PackageCatalog } from "./settings/packages";
import { UpdatesSettingsPage } from "./settings/pages/UpdatesSettingsPage";
import { SettingRow, SettingsGroup, StatusValue } from "./settings/primitives";

export type ApplicationManagementTab = "applications" | "updates" | "resources";

type UpdatesPageProps = Parameters<typeof UpdatesSettingsPage>[0];

type ApplicationManagementPageProps = {
  model: WorkbenchModel;
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

function localizedResourceLabel(resource: ApplicationManagementResource, locale: WorkbenchSettings["locale"]): string {
  return resource.labelI18n?.[locale] ?? resource.labelI18n?.en ?? resource.label ?? resource.resourceId ?? "Shared resource";
}

function resourceStatus(resource: ApplicationManagementResource): string {
  return resource.status === "ready" ? "available" : resource.status;
}

function resourceOwnerDestination(route: string | undefined): SettingsDestinationId | null {
  switch (route) {
    case "resources":
    case "connections":
      return "resources";
    case "access":
    case "models":
      return "models";
    case "workspace":
      return "workspace";
    case "updates":
      return "updates";
    case "capabilities":
      return "capabilities";
    case "agents":
      return "agents";
    default:
      return null;
  }
}

function resourceKindLabel(kind: ApplicationManagementResource["resourceKind"], zh: boolean): string {
  return ({
    knowledge_source: zh ? "知识来源" : "Knowledge source",
    connection: zh ? "连接" : "Connection",
    model: zh ? "模型" : "Model",
    base_capability: zh ? "基础能力" : "Base capability"
  })[kind];
}

function relationLabel(relation: ApplicationManagementResource["relationKind"], zh: boolean): string {
  return ({
    required: zh ? "必需" : "Required",
    optional: zh ? "可选" : "Optional",
    configured: zh ? "已配置" : "Configured"
  })[relation];
}

function resourceStateLabel(value: string | undefined, zh: boolean): string {
  return ({
    authorized: zh ? "已授权" : "Authorized",
    attention: zh ? "需要处理" : "Needs attention",
    current: zh ? "当前" : "Current",
    stale: zh ? "已过期" : "Stale",
    fresh: zh ? "最新" : "Fresh",
    ready: zh ? "就绪" : "Ready",
    unknown: zh ? "未提供" : "Unknown"
  })[value ?? "unknown"] ?? (zh ? "未提供" : "Unknown");
}

function dependencyStatus(item: { readiness: { operationalReady: boolean | null } }): string {
  if (item.readiness.operationalReady === true) return "available";
  if (item.readiness.operationalReady === false) return "unavailable";
  return "unknown";
}

function observedAtLabel(value: string | undefined, locale: WorkbenchSettings["locale"]): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

function ResourceMetadata({ resource, locale }: { resource: ApplicationManagementResource; locale: WorkbenchSettings["locale"] }) {
  const zh = locale === "zh";
  const authorization = resource.authorization;
  const revision = resource.revision;
  const freshness = resource.freshness;
  const readiness = resource.readiness;
  const authorizationCounts = [
    authorization?.consumerCount !== undefined ? `${authorization.consumerCount} ${zh ? "个应用" : "consumer(s)"}` : undefined,
    authorization?.grantCount !== undefined ? `${authorization.grantCount} ${zh ? "项授权" : "grant(s)"}` : undefined
  ].filter(Boolean).join(zh ? "，" : ", ");
  const revisionValue = [resourceStateLabel(revision?.status, zh), revision?.securityRevision ? `${zh ? "安全修订" : "security revision"} ${revision.securityRevision}` : undefined].filter(Boolean).join(zh ? "，" : ", ");
  const freshnessValue = [resourceStateLabel(freshness?.status, zh), observedAtLabel(freshness?.observedAt, locale)].filter(Boolean).join(zh ? "，" : ", ");
  const readinessValue = [resourceStateLabel(readiness?.status, zh), readiness?.reason].filter(Boolean).join(zh ? "，" : ", ");
  return <details className="opl-app-management-resource-details">
    <summary>{zh ? "查看详情" : "View details"}</summary>
    <dl>
      <div><dt>{zh ? "授权" : "Authorization"}</dt><dd>{resourceStateLabel(authorization?.status, zh)}{authorizationCounts ? `，${authorizationCounts}` : ""}</dd></div>
      <div><dt>{zh ? "版本与安全修订" : "Version & security revision"}</dt><dd>{revisionValue}</dd></div>
      <div><dt>{zh ? "数据时效" : "Freshness"}</dt><dd>{freshnessValue}</dd></div>
      <div><dt>{zh ? "就绪状态" : "Readiness"}</dt><dd>{readinessValue}</dd></div>
    </dl>
  </details>;
}

function SharedResources({ model, settings, onOpenSettings }: Pick<ApplicationManagementPageProps, "model" | "settings" | "onOpenSettings">) {
  const packageDependencies = model.packageLifecycle.filter((item) => item.dependencies.length > 0);
  const projected = model.applicationManagement?.sharedResources ?? [];
  const resources = useMemo(() => projected.filter((item) => item.resourceId || item.label), [projected]);
  const zh = settings.locale === "zh";
  const hasKnowledgeSource = resources.some((resource) => resource.resourceKind === "knowledge_source");

  return <div className="opl-app-management-resources" data-testid="opl-app-management-resources">
    <SettingsGroup title={zh ? "共享资源" : "Shared resources"}>
      <p className="settings-inline-note">{zh ? "应用只引用已授权的连接和知识来源；正文与凭证继续由对应设置管理。" : "Apps reference authorized connections and knowledge sources; source bodies and credentials stay in their settings."}</p>
      {resources.length ? <>{resources.map((resource, index) => <SettingRow key={resource.resourceId ?? `${resource.label}-${index}`} label={localizedResourceLabel(resource, settings.locale)} detail={[resourceKindLabel(resource.resourceKind, zh), relationLabel(resource.relationKind, zh), resource.consumerPackageIds.length ? `${resource.consumerPackageIds.length} ${zh ? "个应用使用" : "consumer(s)"}` : undefined].filter(Boolean).join(" · ")}>
        <span className="runtime-setting-control"><StatusValue status={resourceStatus(resource)} locale={settings.locale} />{resourceOwnerDestination(resource.ownerSettingsRoute) && onOpenSettings ? <button type="button" className="settings-inline-command" onClick={() => { const destination = resourceOwnerDestination(resource.ownerSettingsRoute); if (destination) onOpenSettings(destination); }}>{zh ? "打开设置" : "Open settings"}</button> : null}<ResourceMetadata resource={resource} locale={settings.locale} /></span>
      </SettingRow>)}{!hasKnowledgeSource ? <p className="settings-inline-note" data-testid="opl-app-management-knowledge-empty">{zh ? "知识来源尚未返回；当前仅显示已返回的共享资源。" : "Knowledge sources were not returned; only available shared resources are shown."}</p> : null}</> : <p className="settings-inline-note" data-testid="opl-app-management-resources-empty">{zh ? "共享资源尚未返回；知识来源也未提供可显示的授权关系。" : "Shared resources were not returned; no authorized knowledge relation is available to show."}</p>}
    </SettingsGroup>
    <SettingsGroup title={zh ? "应用依赖" : "Application dependencies"}>
      <p className="settings-inline-note">{zh ? "卸载或停用前先查看应用依赖关系。" : "Review application dependencies before disabling or removing anything."}</p>
      {packageDependencies.length ? packageDependencies.map((item) => <SettingRow key={item.packageId} label={item.label} detail={item.dependencies.map((dependency) => dependency.packageId).join(zh ? "、" : ", ")}><span className="runtime-setting-control"><StatusValue status={dependencyStatus(item)} locale={settings.locale} />{item.requiredByPackageIds?.length ? <span className="settings-muted">{zh ? `被 ${item.requiredByPackageIds.length} 个应用依赖` : `Required by ${item.requiredByPackageIds.length} app(s)`}</span> : null}</span></SettingRow>) : <p className="settings-inline-note">{zh ? "当前没有返回共享依赖关系。" : "No shared dependency relationships were returned."}</p>}
    </SettingsGroup>
  </div>;
}

export function ApplicationManagementPage({ model, settings, managedUpdate, actionViewModel, nativeAppUpdate, actionBusyKey, onAction, onHostAction, onRefresh, manifestInstallAction, renderPackageContributions, onOpenSettings, initialTab = "applications", onTabChange, actionFeedback, actionReceipt }: ApplicationManagementPageProps) {
  const [tab, setTab] = useState<ApplicationManagementTab>(initialTab);
  const tabRefs = useRef<Partial<Record<ApplicationManagementTab, HTMLButtonElement | null>>>({});
  useEffect(() => setTab(initialTab), [initialTab]);
  const zh = settings.locale === "zh";
  const catalogPackages = model.packageLifecycle.filter((item) => item.packageId !== "missing_bridge");
  const installed = catalogPackages.filter((item) => item.installed === true).length;
  const installable = catalogPackages.filter((item) => item.installed === false && item.actions.some((action) => action.kind === "install" && action.status === "available")).length;
  const updatesAvailable = catalogPackages.filter((item) => item.currentness.trim().toLowerCase() === "update_available").length;
  const attention = catalogPackages.filter((item) => agentPackageNeedsAttention(item)).length;
  const tabs: Array<{ id: ApplicationManagementTab; label: string; icon: typeof Box }> = [
    { id: "applications", label: zh ? "我的应用" : "My apps", icon: Box },
    { id: "updates", label: zh ? "更新" : "Updates", icon: RefreshCw },
    { id: "resources", label: zh ? "共享资源" : "Shared resources", icon: Cable }
  ];
  const updatesProps: UpdatesPageProps = {
    actionViewModel,
    managedUpdate,
    projection: model.settingsProjection,
    settings,
    nativeAppUpdate,
    model,
    actionBusyKey,
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
      <div className="opl-app-management-environment" data-testid="opl-app-management-environment"><span>{zh ? "当前环境" : "Current environment"}</span><strong>{zh ? "本机 OPL" : "Local OPL"}</strong><button type="button" className="settings-icon-button" aria-label={zh ? "刷新应用管理状态" : "Refresh application management"} title={zh ? "刷新" : "Refresh"} onClick={onRefresh} disabled={actionBusyKey !== null}><RefreshCw aria-hidden="true" size={15} /></button></div>
    </header>
    <div className="opl-app-management-summary" role="status"><span><strong>{catalogPackages.length}</strong> {zh ? "个目录条目" : "catalog entries"}</span><span><strong>{installable}</strong> {zh ? "个可安装" : "installable"}</span><span><strong>{installed}</strong> {zh ? "个已安装" : "installed"}</span>{updatesAvailable ? <span className="attention"><RefreshCw aria-hidden="true" size={14} /><strong>{updatesAvailable}</strong> {zh ? "个有更新" : "updates available"}</span> : null}{attention ? <span className="attention"><CircleAlert aria-hidden="true" size={14} /><strong>{attention}</strong> {zh ? "个需处理" : "need attention"}</span> : <span><ShieldCheck aria-hidden="true" size={14} />{zh ? "当前没有已知问题" : "No known issues"}</span>}</div>
    {actionFeedback ? <div className="opl-app-management-feedback" data-tone={actionFeedback.tone} role="status">{actionFeedback.message}</div> : null}
    {actionReceipt ? <details className="opl-app-management-receipt" data-testid="opl-app-management-receipt"><summary>{zh ? "操作结果" : "Action result"}</summary><p>{actionReceipt.summary}</p>{actionReceipt.nextStep ? <p>{actionReceipt.nextStep}</p> : null}{actionReceipt.receiptId ? <small>{zh ? `技术回执：${actionReceipt.receiptId}` : `Technical receipt: ${actionReceipt.receiptId}`}</small> : null}</details> : null}
    <nav className="opl-app-management-tabs" data-testid="opl-app-management-tabs" role="tablist" aria-label={zh ? "应用管理分区" : "Application management sections"}>
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} ref={(element) => { tabRefs.current[id] = element; }} type="button" role="tab" aria-selected={tab === id} aria-controls={`opl-app-management-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => { setTab(id); onTabChange?.(id); }} onKeyDown={handleTabKeyDown}><Icon aria-hidden="true" size={15} /><span>{label}</span></button>)}
    </nav>
    <div className="opl-app-management-content">
      {tab === "applications" ? <section id="opl-app-management-panel-applications" role="tabpanel" aria-label={tabs[0]!.label}><PackageCatalog kind="all" model={model} settings={settings} actionBusyKey={actionBusyKey} onAction={onAction} manifestInstallAction={manifestInstallAction} renderPackageContributions={renderPackageContributions} /></section> : null}
      {tab === "updates" ? <section id="opl-app-management-panel-updates" role="tabpanel" aria-label={tabs[1]!.label}><UpdatesSettingsPage {...updatesProps} /></section> : null}
      {tab === "resources" ? <section id="opl-app-management-panel-resources" role="tabpanel" aria-label={tabs[2]!.label}><SharedResources model={model} settings={settings} onOpenSettings={onOpenSettings} /></section> : null}
    </div>
  </section>;
}
