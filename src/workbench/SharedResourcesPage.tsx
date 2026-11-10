import type { ApplicationManagementResource, WorkbenchModel } from "./workbenchModel";
import type { WorkbenchSettings } from "./settingsModel";
import type { SettingsDestinationId } from "./settings/types";
import type { SettingsActionRequest } from "./settingsActions";
import { SettingRow, SettingsGroup, StatusValue } from "./settings/primitives";
import { ConnectionsSection } from "./settings/ConnectionsSection";
import { KnowledgeSourcesSection } from "./KnowledgeSourcesSection";
import type { ApplicationManagementTab } from "./ApplicationManagementPage";

function localizedResourceLabel(resource: ApplicationManagementResource, locale: WorkbenchSettings["locale"]): string {
  const label = resource.labelI18n?.[locale] ?? resource.labelI18n?.en ?? resource.label ?? resource.resourceId ?? "Shared resource";
  if (resource.resourceKind !== "base_capability") return label;
  const kind = resource.resourceId.split(":").at(-1);
  const suffix = kind === "cli" ? (locale === "zh" ? "命令行工具" : "Command-line tool")
    : kind === "codex_skill" ? (locale === "zh" ? "智能体技能" : "Agent skill") : null;
  return suffix ? `${label} · ${suffix}` : label;
}

function resourceStatus(resource: ApplicationManagementResource): string {
  return resource.status === "ready" ? "available" : resource.status;
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
  } as Record<string, string>)[value ?? "unknown"] ?? (zh ? "未提供" : "Unknown");
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
  const readinessValue = resourceStateLabel(readiness?.status, zh);
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

type SharedResourcesPageProps = {
  model: WorkbenchModel; settings: WorkbenchSettings; actionBusyKey: string | null;
  onAction: (request: SettingsActionRequest) => void; onRefresh: () => void;
  onOpenSettings?: (destination: SettingsDestinationId) => void;
  onOpenApplicationTab: (tab: ApplicationManagementTab) => void;
  onApproveConnectionAccess?: (requestId: string) => Promise<boolean>;
};

export function SharedResourcesPage({ model, settings, actionBusyKey, onAction, onRefresh, onOpenSettings, onOpenApplicationTab, onApproveConnectionAccess }: SharedResourcesPageProps) {
  const zh = settings.locale === "zh";
  const resources = model.applicationManagement?.sharedResources ?? [];
  const packageLabel = (id: string) => { const item = model.packageLifecycle.find(candidate => candidate.packageId === id); return item?.displayNameI18n[settings.locale] ?? item?.label ?? id; };
  const renderResources = (kind: ApplicationManagementResource["resourceKind"]) => resources.filter(resource => resource.resourceKind === kind).map(resource => <SettingRow key={resource.resourceId} label={localizedResourceLabel(resource, settings.locale)} detail={resource.consumerPackageIds.length ? `${zh ? "使用者：" : "Used by: "}${resource.consumerPackageIds.map(packageLabel).join(zh ? "、" : ", ")}` : undefined}>
    <span className="runtime-setting-control"><StatusValue status={resourceStatus(resource)} locale={settings.locale} /><ResourceMetadata resource={resource} locale={settings.locale} /></span>
  </SettingRow>);
  const modelResources = renderResources("model");
  const baseResources = renderResources("base_capability");
  const dependencies = model.packageLifecycle.filter(item => item.installed === true && item.dependencies.length > 0);
  return <div className="opl-app-management-resources" data-testid="opl-app-management-resources">
    <p className="opl-resource-intro">{zh ? "在这里管理应用共用的资料库、账号连接、模型和基础依赖。为新应用授权后，即可复用已有资源。" : "Manage the libraries, account connections, models and dependencies shared by your apps. Grant a new app access to reuse an existing resource."}</p>
    <KnowledgeSourcesSection projection={model.knowledgeSources} locale={settings.locale} actionBusyKey={actionBusyKey} onAction={onAction} onRefresh={onRefresh} />
    <section className="opl-resource-section" aria-label={zh ? "账号与连接" : "Accounts & connections"}>
      <div className="opl-resource-section-heading"><h2>{zh ? "账号与连接" : "Accounts & connections"}</h2><p>{zh ? "已连接的邮箱和外部服务可分别授权给各应用。登录信息由对应服务保管。" : "Share connected mailboxes and services with individual apps. Each service manages its sign-in."}</p></div>
      <ConnectionsSection projection={model.settingsProjection} locale={settings.locale} actionBusyKey={actionBusyKey} onAction={onAction} onApproveConnectionAccess={onApproveConnectionAccess} />
      <SettingRow label={zh ? "软件源账号" : "Software source account"} detail={zh ? "GitHub 和私有软件的下载权限统一在软件源管理。" : "Manage GitHub access and private software downloads in Software sources."}><button type="button" className="settings-inline-command" onClick={() => onOpenApplicationTab("sources")}>{zh ? "管理软件源" : "Manage software sources"}</button></SettingRow>
    </section>
    <SettingsGroup title={zh ? "模型能力" : "Models"}>
      <p className="settings-inline-note">{zh ? "应用复用同一套模型访问设置，专业任务仍可声明自己的模型需求。" : "Apps share model access settings while keeping their task-specific model requirements."}</p>
      {modelResources.length ? modelResources : <p className="settings-inline-note">{zh ? "模型状态尚未返回。" : "Model status has not been returned."}</p>}
      <SettingRow label={zh ? "模型与执行" : "Models & execution"} detail={zh ? "选择默认模型及执行偏好。" : "Choose the default model and execution preferences."}>{onOpenSettings ? <button type="button" className="settings-inline-command" onClick={() => onOpenSettings("models")}>{zh ? "管理" : "Manage"}</button> : null}</SettingRow>
      <SettingRow label={zh ? "模型账号与访问" : "Model account & access"} detail={zh ? "管理 Gateway 账户或已保存的 API Key。" : "Manage a Gateway account or saved API key."}>{onOpenSettings ? <button type="button" className="settings-inline-command" onClick={() => onOpenSettings("account")}>{zh ? "管理" : "Manage"}</button> : null}</SettingRow>
    </SettingsGroup>
    <SettingsGroup title={zh ? "基础依赖" : "Shared dependencies"}>
      {baseResources.length ? baseResources : <p className="settings-inline-note">{zh ? "基础依赖状态尚未返回。" : "Dependency status has not been returned."}</p>}
      <SettingRow label={zh ? "基础服务更新" : "Foundation updates"}><button type="button" className="settings-inline-command" onClick={() => onOpenApplicationTab("updates")}>{zh ? "查看更新" : "View updates"}</button></SettingRow>
      {dependencies.length ? <details className="opl-resource-details"><summary>{zh ? "查看应用依赖关系" : "View application dependencies"}</summary>{dependencies.map(item => <SettingRow key={item.packageId} label={packageLabel(item.packageId)} detail={item.dependencies.map(dependency => packageLabel(dependency.packageId)).join(zh ? "、" : ", ")}><StatusValue status={dependencyStatus(item)} locale={settings.locale} /></SettingRow>)}</details> : null}
    </SettingsGroup>
  </div>;
}
