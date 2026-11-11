import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Checkbox, Input, Modal, SegmentedTabs, StateDot, Switch, Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import { PluginManagerOwnerPage, type PluginManagerOwnerItem, type PluginManagerOwnerTab, type PluginManagerOwnerPageProps } from "@opl-vendor/dsh-plugin-manager-page";
import { createNavigationStore } from "../vendor/deepseek-harness/packages/client/ui-plugin-manager/src/client/navigation-store.ts";
import { createPluginHeaderRef } from "../vendor/deepseek-harness/packages/client/ui-plugin-manager/src/client/header-scroll.ts";
import { en, zh, type PluginManagerLocaleKey } from "../vendor/deepseek-harness/packages/client/ui-plugin-manager/src/client/locales.ts";
import { bindSnapshotSelector } from "../vendor/deepseek-harness/packages/client/ui-renderer/src/client/bind.ts";
import type { AgentPackageLifecycleRef, PackageLifecycleActionRef, WorkbenchModel } from "../workbench/workbenchModel";
import type { WorkbenchSettings } from "../workbench/settingsModel";
import type { CodexCapabilityCatalog, CodexSkillCapability } from "../bridge/oplBridge";
import type { SettingsDestinationId } from "../workbench/settings/types";
import { actionPayloadComplete, type SettingsActionRequest } from "../workbench/settingsActions";
import type { SettingsPanelProps } from "../workbench/settings/types";
import { SoftwareInstallations, SoftwareReleaseOptions, availableInstallationActions, installationActionLabel, installationActionRequest } from "../workbench/SoftwareInstallations";
import { catalogDisplayName } from "../workbench/SoftwareCatalogMetadata";
import { nativeSoftwareProducts, nativeSoftwareMatches, softwareSourceActionLabel, nativeInstallationLabel, nativeCarrierInstalled, nativeInstalledDisplayVersion, nativeUpdateStatusLabel } from "../workbench/softwareSources";
import { catalogInstalledVersion, catalogManagerLabel, activeSoftwareInstallation, softwareActivationLabel, catalogStateLabel, catalogTypeLabel, nativeCatalogState, nativeCatalogAvailableVersion, packageCatalogState, softwareCatalogPackages, softwareCatalogNativeProducts, type SoftwareCatalogScope, type SoftwareCatalogState } from "../workbench/softwareCatalog";
import { formatStatus } from "../workbench/settings/presentation";
import { agentAvailabilityDetail, agentPackageUpdateStatus, isAgentCatalogPackage, localizedPackageDescription, packageAccessStatusLabel, packageInstallAllowed, packageActionLabel, packagePresentLocally, packageAccessNeedsAttention, agentPackageNeedsAttention, packageDevelopmentLinked } from "../workbench/settings/packages";

export type DshPluginManagerOwnerProps = {
  kind?: "agents" | "all";
  model: WorkbenchModel;
  settings: WorkbenchSettings;
  actionBusyKey: string | null;
  onAction(request: SettingsActionRequest): void;
  manifestInstallAction?: SettingsPanelProps["manifestInstallAction"];
  renderPackageContributions?: (packageId: string) => ReactNode;
  contributedTabs?: readonly PluginManagerOwnerTab[];
  selectedTab?: string;
  onTabChange?: (tab: string) => void;
  pageTitle?: string;
  pageIntro?: string;
  onRefresh?: () => void;
  stateStatus?: "loading" | "ready" | "error";
  headerStatus?: ReactNode;
  capabilityCatalog?: CodexCapabilityCatalog;
  capabilityStatus?: "idle" | "loading" | "ready" | "error";
  capabilityError?: string;
  onRefreshCapabilities?: () => void;
  onOpenSettings?: (destination: SettingsDestinationId) => void;
};

const noop = () => {};

function PackageContribution({ packageId, render }: { packageId: string; render: (packageId: string) => ReactNode }) {
  return <section className="opl-dsh-owner-section" data-testid="opl-package-state">{render(packageId)}</section>;
}

function isPluginSkill(skill: CodexSkillCapability): boolean {
  return skill.scope === "plugin" || /(?:^|\/)plugins\/(?:cache|marketplaces)\//.test(skill.path.replaceAll("\\", "/"));
}

function CatalogRowFacts({ type, installedVersion, availableVersion, locale }: { type: string; installedVersion?: string; availableVersion?: string; state: SoftwareCatalogState; locale: "zh" | "en" }) {
  const zh = locale === "zh";
  return <span className="opl-catalog-row-facts" data-testid="opl-package-version-summary">
    <span className="opl-catalog-cell-type" data-label={zh ? "类型" : "Type"}>{type}</span>
    <span className="opl-catalog-cell-version" data-label={zh ? "当前版本" : "In use"}>{installedVersion || "—"}</span>
    <span className="opl-catalog-cell-version" data-label={zh ? "可用版本" : "Available"}>{availableVersion || "—"}</span>

  </span>;
}

function CatalogState({ state, locale, label }: { state: SoftwareCatalogState; locale: "zh" | "en"; label?: string }) {
  return <span className="opl-catalog-state" data-label={locale === "zh" ? "状态" : "Status"}><StateDot state={state === "installed" ? "done" : state === "attention" || state === "update_available" ? "warning" : "idle"} />{label ?? catalogStateLabel(state, locale)}</span>;
}

/** The Package owner supplies every fact and command; the DSH page supplies presentation and navigation. */
export function DshPluginManagerOwner(props: DshPluginManagerOwnerProps) {
  const { model, settings, onAction, actionBusyKey, kind = "agents" } = props;
  const locale = settings.locale, isZh = locale === "zh", busy = actionBusyKey !== null;
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SoftwareCatalogScope>("opl");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [installOpen, setInstallOpen] = useState(false);
  const [manifestUrl, setManifestUrl] = useState("");
  const [trustTier, setTrustTier] = useState("third_party_unverified");
  const navigation = useMemo(() => createNavigationStore().create(), []);
  const useStore = useMemo(() => bindSnapshotSelector(navigation), [navigation]);
  useEffect(() => {
    if (scope === "external" && props.capabilityStatus === "idle") props.onRefreshCapabilities?.();
  }, [scope, props.capabilityStatus, props.onRefreshCapabilities]);
  const packages = softwareCatalogPackages(model, scope).filter(item => kind === "all" || isAgentCatalogPackage(item));
  const native = kind === "all" ? softwareCatalogNativeProducts(model, scope) : [];
  const matchesState = (state: SoftwareCatalogState) => statusFilter === "all" || (statusFilter === "installed" ? ["installed", "update_available", "attention"].includes(state) : state === statusFilter);
  const visible = packages.filter(item => matchesState(packageCatalogState(item))
    && (typeFilter === "all" || (typeFilter === "plugin" ? item.catalogOrigin !== "opl" && item.catalogSource?.manager === "codex_plugin_manager" : item.softwareType === typeFilter))
    && (!query.trim() || item.searchMetadata.query.includes(query.trim().toLowerCase())));
  const visibleNative = native.filter(({ channels, source, item }) => matchesState(nativeCatalogState(item))
    && (typeFilter === "all" || typeFilter === "application")
    && (nativeSoftwareMatches(item, source, query, "all") || channels.some(channel => nativeSoftwareMatches(channel.item, channel.source, query, "all"))));
  const run = (item: AgentPackageLifecycleRef, action: PackageLifecycleActionRef, payload = action.payload, key = `${item.packageId}:${action.actionId}`) => onAction({ key, actionId: action.actionId, label: `${packageActionLabel(action, locale)} ${catalogDisplayName(item.label, item.displayNameI18n, locale)}`, payload, confirmationRequired: action.confirmationRequired, dryRunSupported: action.dryRunSupported });
  const actionsFor = (item: AgentPackageLifecycleRef) => (item.catalogScope !== "software" ? [] : item.actions).filter(action => action.actionId !== "package_app_set_enabled" && action.kind !== "preferences" && action.status === "available" && actionPayloadComplete(action.payload, action.requiredPayloadFields) && (action.kind !== "install" || packageInstallAllowed(item)) && (action.kind !== "update" || item.currentness === "update_available") && (!["update", "repair"].includes(action.kind) || !packageAccessNeedsAttention(item)));
  const buttons = (item: AgentPackageLifecycleRef, all = false) => {
    const actions = actionsFor(item);
    if (!all && packageAccessNeedsAttention(item)) return props.onTabChange ? <Button size="sm" variant="outline" onClick={() => props.onTabChange?.("sources")}>{isZh ? "检查软件源" : "Check source"}</Button> : null;
    const primaryKind = item.installed === false && !packagePresentLocally(item) ? "install"
      : packageCatalogState(item) === "update_available" ? "update"
        : agentPackageNeedsAttention(item) ? "repair" : undefined;
    const primary = primaryKind ? actions.find(action => action.kind === primaryKind) : undefined;
    return (all ? actions : primary ? [primary] : []).map(action => <Button key={action.actionId} size="sm" variant={action.kind === "uninstall" ? "outline" : "primary"} disabled={busy} onClick={() => run(item, action)}>{action.kind === "install" && item.localInstallations?.length ? (isZh ? "安装到当前宿主" : "Install in this host") : action.kind === "install" ? (isZh ? "安装" : "Install") : packageActionLabel(action, locale)}</Button>);
  };
  const toggle = (item: AgentPackageLifecycleRef) => {
    if (item.installed !== true || item.catalogScope !== "software") return null;
    const action = item.actions.find(action => action.actionId === "package_app_set_enabled" && action.status === "available");
    const name = catalogDisplayName(item.label, item.displayNameI18n, locale);
    return <Switch checked={item.appEnabled} disabled={!action || busy} label={isZh ? `在 OPL App 中启用 ${name}` : `Enable ${name} in OPL App`} onChange={enabled => { if (action) run(item, action, { ...action.payload, package_id: item.packageId, enabled }, `app:${item.packageId}:enabled`); }} />;
  };
  const shortcutOrder = model.packageLifecycle.flatMap(item => item.homeShortcuts.map(shortcut => ({ packageId: item.packageId, ...shortcut }))).sort((a, b) => a.sortOrder - b.sortOrder || a.shortcutId.localeCompare(b.shortcutId));
  const shortcuts = (item: AgentPackageLifecycleRef) => {
    const action = item.actions.find(action => action.kind === "preferences" && action.status === "available");
    if (!item.appEnabled || !item.homeShortcuts.length) return null;
    return <section className="opl-dsh-owner-section"><h4>{isZh ? "新任务入口" : "New Task entries"}</h4>{item.homeShortcuts.map(shortcut => {
      const index = shortcutOrder.findIndex(entry => entry.packageId === item.packageId && entry.shortcutId === shortcut.shortcutId), prev = shortcutOrder[index - 1], next = shortcutOrder[index + 1];
      const submit = (visible: boolean, sortOrder: number) => { if (action) run(item, action, { ...action.payload, shortcut_id: shortcut.shortcutId, visible, sort_order: sortOrder }, `home:${item.packageId}:${shortcut.shortcutId}:preferences`); };
      return <div key={shortcut.shortcutId} className="opl-dsh-owner-shortcut"><Checkbox checked={shortcut.visible} disabled={!action || busy} label={isZh ? "在新任务中显示" : "Show in New Task"} onChange={value => submit(value, shortcut.sortOrder)} /><Button size="sm" disabled={!action || !prev || busy} onClick={() => prev && submit(shortcut.visible, prev.sortOrder - 1)}>{isZh ? "向前移动" : "Move earlier"}</Button><Button size="sm" disabled={!action || !next || busy} onClick={() => next && submit(shortcut.visible, next.sortOrder + 1)}>{isZh ? "向后移动" : "Move later"}</Button></div>;
    })}</section>;
  };
  const packageItem = (item: AgentPackageLifecycleRef): PluginManagerOwnerItem => {
    const update = agentPackageUpdateStatus(item), state = packageCatalogState(item), name = catalogDisplayName(item.label, item.displayNameI18n, locale);
    const current = activeSoftwareInstallation(item.installations, item.activeInstallationId, item.activeInstallationStatus);
    const development = item.installations ? current?.mode === "development" : packageDevelopmentLinked(item);
    const instanceCount = item.installations?.length ?? ((item.installed === true ? 1 : 0) + (item.localInstallations?.length ?? 0));
    const currentVersion = catalogInstalledVersion(item, locale);
    const tags = <>{item.access?.visibility === "authorized_only" ? <Tag tone="quiet">{isZh ? "私有" : "Private"}</Tag> : null}{development ? <Tag tone="quiet">{isZh ? "开发版" : "Development"}</Tag> : null}{instanceCount > 1 ? <Tag tone="quiet">{isZh ? `${instanceCount} 份安装` : `${instanceCount} installations`}</Tag> : null}<CatalogRowFacts type={catalogTypeLabel(item, locale)} installedVersion={currentVersion} availableVersion={item.availableVersion} state={state} locale={locale} /></>;
    return { id: item.packageId, title: name,
      description: <span className="opl-catalog-row-description">{localizedPackageDescription(item, locale)}</span>, tags,
      status: <CatalogState state={state} locale={locale} />,
      actions: <span className="opl-catalog-row-actions">{buttons(item)}</span>, detailActions: toggle(item),
      detail: <>
        <section className="opl-dsh-owner-section"><h4>{isZh ? "当前使用" : "Currently in use"}</h4>
          <dl><div><dt>{isZh ? "软件 ID" : "Software ID"}</dt><dd><code>{item.packageId}</code></dd></div><div><dt>{isZh ? "类型" : "Type"}</dt><dd>{catalogTypeLabel(item, locale)}</dd></div><div><dt>{isZh ? "当前版本" : "Current version"}</dt><dd>{currentVersion}{development ? ` · ${isZh ? "开发版" : "Development"}` : ""}</dd></div>{item.activeInstallationStatus ? <div><dt>{isZh ? "激活状态" : "Activation"}</dt><dd>{softwareActivationLabel(item.activeInstallationStatus, locale)}</dd></div> : null}<div><dt>{isZh ? "可用版本" : "Available version"}</dt><dd>{item.availableVersion ?? "—"}</dd></div><div><dt>{isZh ? "更新状态" : "Update status"}</dt><dd>{formatStatus(update, locale)}</dd></div></dl>
          {!item.availableVersion ? <p>{item.catalogOrigin === "external" && item.catalogSource?.manager === "codex_plugin_manager" ? (isZh ? "此扩展由 Codex 维护；平台未提供单独的可用版本。" : "Codex maintains this extension and has not provided a separate available version.") : (isZh ? "软件源尚未提供可验证的安装目标，可在软件源中检查。" : "The source has not provided a verified installation target. Check its software source.")}</p> : null}
          {item.catalogScope !== "software" ? <p>{item.catalogScope === "host_component" ? (isZh ? "此组件随所属软件维护。" : "This component is maintained with its parent software.") : (isZh ? "所属服务尚未提供软件分类。" : "The owner has not provided a software classification.")}</p> : null}
          {item.access?.visibility === "authorized_only" && packageAccessNeedsAttention(item) ? <p data-testid="opl-package-access-gate">{item.access.status === "signed_out" ? (isZh ? "连接软件源账号以检查和更新此私有软件。" : "Connect the source account to check and update this private software.") : item.access.reason ?? packageAccessStatusLabel(item.access, locale)}</p> : null}
          {item.requiredByPackageIds?.length ? <p>{isZh ? `此能力仍被 ${item.requiredByPackageIds.join("、")} 使用；卸载或停用前请先处理这些依赖。` : `Required by ${item.requiredByPackageIds.join(", ")}; resolve dependents before uninstalling or disabling it.`}</p> : null}
        </section>
        {item.installations !== undefined ? <SoftwareInstallations installations={item.installations} packageId={item.packageId} productActions={item.installationActions} activeId={item.activeInstallationId} activationStatus={item.activeInstallationStatus} locale={locale} actionBusyKey={actionBusyKey} onAction={onAction} onUpdates={props.onTabChange ? () => props.onTabChange?.("updates") : undefined} /> : item.localInstallations?.length ? <section className="opl-dsh-owner-section"><h4>{isZh ? "本机安装" : "Installations on this device"}</h4>{item.localInstallations.map(installation => <dl key={installation.installationId} data-testid="opl-local-installation"><div><dt>{isZh ? "版本" : "Version"}</dt><dd>{installation.version} · {installation.mode === "development" ? (isZh ? "开发版" : "Development") : (isZh ? "安装版" : "Installed")}</dd></div><div><dt>{isZh ? "位置引用" : "Location reference"}</dt><dd><code>{installation.locationRef}</code></dd></div><div><dt>{isZh ? "管理方式" : "Managed by"}</dt><dd>{catalogManagerLabel(installation.manager, locale)}</dd></div></dl>)}<p>{isZh ? "安装器尚未提供激活状态和完整路径，请更新基座后重新读取。" : "The installer has not provided active state and the full path. Update the foundation and refresh."}</p></section> : null}
        {item.installationManagementReason === "installation_helper_update_required" ? <section className="opl-dsh-owner-section"><p>{isZh ? "更新此软件的 OPL 集成后，可在这里管理桌面安装。现有安装位置与版本仍可查看。" : "Update this software's OPL integration to manage desktop installations here. Existing locations and versions remain visible."}{buttons(item)}</p></section> : null}
        <section className="opl-dsh-owner-section"><h4>{isZh ? "软件来源" : "Software source"}</h4><dl><div><dt>{isZh ? "维护者" : "Publisher"}</dt><dd>{item.publisher}</dd></div><div><dt>{isZh ? "软件源" : "Source"}</dt><dd>{item.catalogSource?.marketplaceId ?? (item.catalogOrigin === "opl" ? "OPL" : "—")}{item.catalogSource?.delivery === "host_bundled" ? (isZh ? " · Codex 随附" : " · Bundled with Codex") : ""}</dd></div><div><dt>{isZh ? "安装器" : "Installer"}</dt><dd>{catalogManagerLabel(item.catalogSource?.manager, locale)}</dd></div></dl>{item.installations === undefined ? buttons(item, true) : item.installed === false ? buttons(item) : null}</section>
        {shortcuts(item)}
        {item.catalogScope === "software" && item.appEnabled && props.renderPackageContributions ? <PackageContribution packageId={item.packageId} render={props.renderPackageContributions} /> : null}
        {settings.developerDetails ? <section className="opl-dsh-owner-section"><h4>{isZh ? "技术详情" : "Technical details"}</h4><p>{agentAvailabilityDetail(item, locale)}</p><dl>{item.details.map(detail => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl></section> : null}
      </>,
    };
  };
  const nativeItem = (product: ReturnType<typeof nativeSoftwareProducts>[number]): PluginManagerOwnerItem => {
    const { source, item, productId, installations } = product;
    const current = activeSoftwareInstallation(installations, item.activeInstallationId, item.activeInstallationStatus);
    const version = installations.length || item.activeInstallationStatus ? current?.displayVersion ?? current?.version : nativeInstalledDisplayVersion(item);
    const development = current ? current.mode === "development" : item.installedBuildKind === "local-development";
    const name = item.productDisplayName ?? catalogDisplayName(item.displayName, item.displayNameI18n, locale);
    const ownerUpdate = item.updateStatus === "available" && current ? availableInstallationActions(current).find(action => action.payload.operation === "update") : undefined;
    const executable = item.availableActions.filter(action => source && action.status === "available" && Boolean(item.revision) && actionPayloadComplete(action.payload, [...action.payloadFields, "source_id", "item_id", "expected_revision"]) && action.payload.source_id === source.sourceId && action.payload.item_id === item.itemId && action.payload.expected_revision === item.revision && (action.actionId === "source_install" ? nativeCarrierInstalled(item) === false : action.actionId === "source_update" ? nativeCarrierInstalled(item) === true && item.updateStatus === "available" : nativeCarrierInstalled(item) === true));
    const nativeButtons = (all = false) => (all ? executable : executable.filter(action => action.actionId === (item.installed === false ? "source_install" : "source_update"))).map(action => <Button key={action.actionId} size="sm" variant={action.actionId === "source_uninstall" ? "outline" : "primary"} disabled={busy} onClick={() => onAction({ key: `source:${source?.sourceId}:${item.itemId}:${action.actionId}`, actionId: action.actionId, label: `${softwareSourceActionLabel(action.actionId, locale, action.label)} ${name}`, payload: action.payload, confirmationRequired: true, dryRunSupported: action.dryRunSupported })}>{softwareSourceActionLabel(action.actionId, locale, action.label)}</Button>);
    return { id: productId, title: name,
      description: <span className="opl-catalog-row-description">{item.descriptionI18n?.[locale] || item.description || (isZh ? "尚未提供软件说明。" : "No software description provided.")}</span>,
      tags: <><CatalogRowFacts type={isZh ? "应用" : "Application"} installedVersion={version ?? "—"} availableVersion={nativeCatalogAvailableVersion(product, locale)} state={nativeCatalogState(item)} locale={locale} />{development ? <Tag tone="quiet">{isZh ? "开发版" : "Development"}</Tag> : null}{installations.length > 1 ? <Tag tone="quiet">{isZh ? `${installations.length} 份安装` : `${installations.length} installations`}</Tag> : null}</>,
      actions: <span className="opl-catalog-row-actions">{ownerUpdate && current ? <Button size="sm" variant="primary" disabled={busy} onClick={() => onAction(installationActionRequest(current, ownerUpdate, locale))}>{installationActionLabel(ownerUpdate, locale)}</Button> : nativeButtons()}</span>,
      status: <CatalogState state={nativeCatalogState(item)} locale={locale} label={item.updateStatus === "needs_restart" ? nativeUpdateStatusLabel(item.updateStatus, locale) : undefined} />,
      detail: <>
        <section className="opl-dsh-owner-section"><h4>{isZh ? "当前使用" : "Currently in use"}</h4><dl>
          <div><dt>{isZh ? "软件 ID" : "Software ID"}</dt><dd><code>{productId}</code></dd></div>
          <div><dt>{isZh ? "当前版本" : "Current version"}</dt><dd>{version ?? "—"}{development ? ` · ${isZh ? "开发版" : "Development"}` : ""}</dd></div>
          {item.activeInstallationStatus ? <div><dt>{isZh ? "激活状态" : "Activation"}</dt><dd>{softwareActivationLabel(item.activeInstallationStatus, locale)}</dd></div> : null}
          <div><dt>{isZh ? "可用版本" : "Available version"}</dt><dd>{nativeCatalogAvailableVersion(product, locale) ?? "—"}</dd></div>
          <div><dt>{isZh ? "更新状态" : "Update status"}</dt><dd>{nativeUpdateStatusLabel(item.updateStatus, locale)}</dd></div>
          {item.updateStatus === "needs_restart" && item.pendingVersion ? <div><dt>{isZh ? "待启用版本" : "Staged version"}</dt><dd>{item.pendingVersion}</dd></div> : null}
        </dl>{item.updateStatus === "needs_restart" ? <p>{isZh ? "更新已暂存，重启应用后生效。" : "The update is staged and will take effect after restarting the app."}</p> : !nativeCatalogAvailableVersion(product, locale) ? <p>{isZh ? "软件源尚未提供推荐的安装目标，请检查软件源。" : "The source has not provided a recommended installation target. Check its software source."}</p> : null}</section>
        {installations.length ? <SoftwareInstallations installations={installations} activeId={item.activeInstallationId} activationStatus={item.activeInstallationStatus} locale={locale} actionBusyKey={actionBusyKey} onAction={onAction} onUpdates={props.onTabChange ? () => props.onTabChange?.("updates") : undefined} /> : item.installed ? <section className="opl-dsh-owner-section"><h4>{isZh ? "本机安装" : "Installations on this device"}</h4><dl><div><dt>{isZh ? "安装方式" : "Installation method"}</dt><dd>{nativeInstallationLabel(item, locale)}</dd></div><div><dt>{isZh ? "管理方式" : "Managed by"}</dt><dd>{catalogManagerLabel(item.installationOwner, locale)}</dd></div>{item.location ? <div><dt>{isZh ? "安装位置" : "Location"}</dt><dd><code>{item.location}</code></dd></div> : null}</dl>{nativeButtons(true)}{item.ownerSettingsRoute === "updates" && props.onTabChange ? <Button size="sm" variant="outline" onClick={() => props.onTabChange?.("updates")}>{isZh ? "管理此安装" : "Manage installation"}</Button> : null}</section> : null}
        <SoftwareReleaseOptions product={product} locale={locale} actionBusyKey={actionBusyKey} onAction={onAction} />
        {settings.developerDetails ? <section className="opl-dsh-owner-section"><h4>{isZh ? "技术详情" : "Technical details"}</h4><dl>{item.installedDisplayVersion && item.installedVersion !== item.installedDisplayVersion ? <div><dt>{isZh ? "机器版本" : "Machine version"}</dt><dd>{item.installedVersion}</dd></div> : null}{item.installedBuildId ? <div><dt>{isZh ? "构建 ID" : "Build ID"}</dt><dd><code>{item.installedBuildId}</code></dd></div> : null}</dl></section> : null}
      </>,
    };
  };
  // A plugin's exported skills belong to its package. Only independent Skill files are listed here.
  const looseSkills = scope === "external" && kind === "all" ? (props.capabilityCatalog?.skills ?? []).filter(skill => !isPluginSkill(skill)) : [];
  const skillItem = (skill: CodexSkillCapability): PluginManagerOwnerItem => ({
    id: `codex-skill:${skill.path || skill.name}`, title: skill.name,
    description: <span className="opl-catalog-row-description">{skill.description}</span>,
    tags: <Tag tone="quiet">Skill</Tag>,
    status: <CatalogState state="installed" locale={locale} />,
    actions: <span className="opl-catalog-row-actions" />,
    detail: <section className="opl-dsh-owner-section"><h4>{isZh ? "Codex Skill" : "Codex Skill"}</h4><p>{isZh ? "独立技能由 Codex 读取，不使用 OPL 软件发布版本。" : "Codex reads this independent skill. It does not use OPL software release versions."}</p><dl><div><dt>{isZh ? "安装器" : "Manager"}</dt><dd>Codex</dd></div><div><dt>{isZh ? "使用范围" : "Scope"}</dt><dd>{skill.scope}</dd></div><div><dt>{isZh ? "启用状态" : "Enabled"}</dt><dd>{skill.enabled ? (isZh ? "已启用" : "Enabled") : (isZh ? "已停用" : "Disabled")}</dd></div><div><dt>{isZh ? "文件位置" : "File location"}</dt><dd><code>{skill.path}</code></dd></div></dl>{props.onOpenSettings ? <Button variant="outline" size="sm" onClick={() => props.onOpenSettings?.("capabilities")}>{isZh ? "打开 Codex 能力设置" : "Open Codex capability settings"}</Button> : null}</section>
  });
  const skillItems = looseSkills.filter(skill => (typeFilter === "all" || typeFilter === "skill") && matchesState("installed") && (!query.trim() || `${skill.name} ${skill.description}`.toLowerCase().includes(query.trim().toLowerCase()))).map(skillItem);
  const sortItems = (items: PluginManagerOwnerItem[]) => items.sort((a, b) => a.title.localeCompare(b.title, isZh ? "zh-CN" : "en"));
  const groups = scope === "external"
    ? [
      { id: "codex-plugins", label: isZh ? "Codex 插件" : "Codex plugins", items: sortItems(visible.filter(item => item.catalogSource?.manager === "codex_plugin_manager").map(packageItem)) },
      { id: "codex-skills", label: isZh ? "独立 Skills" : "Independent Skills", items: sortItems(skillItems) },
      { id: "other-sources", label: isZh ? "其他软件与待确认来源" : "Other software and unconfirmed sources", items: sortItems([...visible.filter(item => item.catalogSource?.manager !== "codex_plugin_manager").map(packageItem), ...visibleNative.map(nativeItem)]) }
    ].filter(group => group.items.length)
    : [{ id: scope === "opl" ? "opl-software" : "runtime-components", label: scope === "opl" ? (isZh ? "OPL 软件" : "OPL software") : (isZh ? "运行组件" : "Runtime components"), items: sortItems([...visible.map(packageItem), ...visibleNative.map(nativeItem)]) }];
  const dict = isZh ? zh : en;
  const translate = ((key: PluginManagerLocaleKey | "back", values?: Record<string, string>) => (key === "crumbRoot" ? isZh ? "软件目录" : "Software catalog" : key === "backToList" || key === "back" ? isZh ? "返回软件目录" : "Back to software catalog" : dict[key as PluginManagerLocaleKey]).replace(/\{([^}]+)\}/g, (_, value: string) => values?.[value] ?? `{${value}}`)) as PluginManagerOwnerPageProps["t"];
  const manifestEnabled = Boolean(props.manifestInstallAction?.dryRunSupported && props.manifestInstallAction.confirmationRequired && props.manifestInstallAction.payloadFields.includes("manifest_url") && props.manifestInstallAction.payloadFields.includes("trust_tier"));
  const changeScope = (value: string) => { setScope(value as SoftwareCatalogScope); setTypeFilter("all"); setStatusFilter("all"); };
  const scopeNote = scope === "opl" ? (isZh ? "我们维护的软件，使用统一目录安装与更新。" : "Software we maintain, installed and updated through one catalog.")
    : scope === "external" ? (isZh ? "外部扩展按原来源管理；插件内的 Skills 随插件维护。" : "External extensions use their original managers; packaged Skills are maintained with their plugin.")
      : (isZh ? "仅列出明确声明的宿主运行依赖，随所属宿主维护。" : "Declared host runtime dependencies, maintained with their host.");
  const filters = <div className="opl-catalog-controls">
    <div className="opl-catalog-scope"><div className="opl-catalog-scope-options" role="group" aria-label={isZh ? "维护归属" : "Maintenance origin"}>{[{ value: "opl", label: isZh ? "OPL 软件" : "OPL software" }, { value: "external", label: isZh ? "其他来源" : "Other sources" }, { value: "components", label: isZh ? "运行组件" : "Runtime components" }].map(option => <Button key={option.value} id={`opl-catalog-scope-${option.value}`} size="sm" variant="outline" aria-pressed={scope === option.value} onClick={() => changeScope(option.value)}>{option.label}</Button>)}</div><p>{scopeNote}</p></div>
    <div className="opl-dsh-owner-filters"><Input type="search" aria-label={isZh ? "搜索软件、名称或来源" : "Search software, name or source"} value={query} placeholder={isZh ? "搜索软件" : "Search software"} onChange={event => setQuery(event.target.value)} />
      <select aria-label={isZh ? "按类型筛选" : "Filter by type"} value={typeFilter} onChange={event => setTypeFilter(event.currentTarget.value)}><option value="all">{isZh ? "全部类型" : "All types"}</option>{scope === "external" ? <><option value="plugin">{isZh ? "Codex 插件" : "Codex plugins"}</option><option value="skill">Skills</option></> : null}<option value="application">{isZh ? "应用" : "Applications"}</option><option value="agent">{isZh ? "智能体" : "Agents"}</option><option value="capability">{isZh ? "能力包" : "Capabilities"}</option></select>
      <select aria-label={isZh ? "按状态筛选" : "Filter by status"} value={statusFilter} onChange={event => setStatusFilter(event.currentTarget.value)}><option value="all">{isZh ? "全部状态" : "All statuses"}</option>{(["installed", "update_available", "not_installed", "attention", "unknown"] as const).map(state => <option key={state} value={state}>{catalogStateLabel(state, locale)}</option>)}</select>
    </div>
    {scope === "external" ? <div className="opl-catalog-external-status"><span>{props.capabilityStatus === "loading" ? (isZh ? "正在读取独立 Skills…" : "Reading independent Skills…") : props.capabilityStatus === "error" ? (props.capabilityError || (isZh ? "Skills 读取失败，请重试。" : "Could not read Skills. Try again.")) : props.capabilityStatus === "ready" ? (isZh ? `${packages.filter(item => item.catalogSource?.manager === "codex_plugin_manager").length} 个 Codex 插件 · ${looseSkills.length} 个独立 Skills` : `${packages.filter(item => item.catalogSource?.manager === "codex_plugin_manager").length} Codex plugins · ${looseSkills.length} independent Skills`) : (isZh ? "独立 Skills 尚未读取" : "Independent Skills have not been read")}</span>{props.onRefreshCapabilities ? <Button size="sm" variant="outline" disabled={props.capabilityStatus === "loading"} onClick={props.onRefreshCapabilities}>{isZh ? "刷新 Skills" : "Refresh Skills"}</Button> : null}<Button size="sm" variant="outline" disabled={busy} onClick={() => setInstallOpen(true)}>{isZh ? "从清单导入" : "Import manifest"}</Button></div> : null}
  </div>;
  return <div className="opl-dsh-plugin-manager opl-software-center" data-testid="opl-settings-agent-catalog" data-catalog-scope={scope}>
    <PluginManagerOwnerPage t={translate} title={props.pageTitle ?? (isZh ? "软件目录" : "Software catalog")} intro={props.pageIntro ?? (isZh ? "统一查看并管理软件" : "Browse and manage software")} installedLabel={isZh ? "软件目录" : "Software catalog"} groups={groups} tabs={props.contributedTabs} selectedTab={props.selectedTab} onTabChange={props.onTabChange} onRefresh={props.onRefresh}
      useStore={useStore} actions={navigation.actions} createHeaderRef={typeof ResizeObserver === "undefined" ? () => noop : createPluginHeaderRef} headerStatus={<>{props.headerStatus}{(props.selectedTab ?? "installed") === "installed" ? filters : null}</>}
      toolbar={<>{model.officialProfileRestore ? <details className="opl-catalog-more"><summary>{isZh ? "更多" : "More"}</summary><Button variant="outline" size="sm" data-testid="settings-agents-restore-official-profile" disabled={busy} onClick={() => onAction({ key: "official-profile:restore", actionId: model.officialProfileRestore!.id, label: isZh ? "恢复官方组合" : "Restore official combination", payload: { intent: "explicit_restore" }, confirmationRequired: true, dryRunSupported: model.officialProfileRestore!.dryRunSupported })}>{isZh ? "恢复官方组合" : "Restore official combination"}</Button></details> : null}{props.onTabChange ? <Button variant="outline" size="sm" onClick={() => props.onTabChange?.("sources")}>{isZh ? "管理软件源" : "Manage sources"}</Button> : null}</>} empty={<p>{props.stateStatus === "loading" ? (isZh ? "正在读取软件目录…" : "Reading the software catalog…") : (isZh ? scope === "components" ? "当前没有单独列出的运行组件。" : "没有符合条件的软件。请调整筛选或刷新目录。" : scope === "components" ? "No runtime components are listed separately." : "No matching software. Adjust filters or refresh the catalog.")}</p>} />
    {installOpen ? <Modal open onClose={() => setInstallOpen(false)} title={isZh ? "添加软件" : "Add software"} closeLabel={isZh ? "关闭" : "Close"} description={isZh ? "提供软件清单，由软件包负责人检查后安装。" : "Provide a software manifest for its Package owner to verify and install."} footer={<><Button variant="outline" onClick={() => setInstallOpen(false)}>{isZh ? "取消" : "Cancel"}</Button><Button variant="primary" disabled={!manifestEnabled || !manifestUrl.trim() || busy} onClick={() => { if (props.manifestInstallAction) onAction({ key: "package:manifest-install", actionId: props.manifestInstallAction.actionId, label: isZh ? "从清单添加软件" : "Add software from manifest", payload: { manifest_url: manifestUrl.trim(), trust_tier: trustTier }, confirmationRequired: true, dryRunSupported: props.manifestInstallAction.dryRunSupported }); setInstallOpen(false); }}>{isZh ? "检查并安装" : "Check and install"}</Button></>}><Input aria-label={isZh ? "清单地址" : "Manifest URL"} value={manifestUrl} onChange={event => setManifestUrl(event.target.value)} /><SegmentedTabs size="sm" label={isZh ? "清单信任级别" : "Manifest trust"} value={trustTier} onChange={setTrustTier} items={[{ value: "third_party_unverified", label: isZh ? "尚未验证" : "Unverified", id: "opl-manifest-unverified", panelId: "opl-manifest-trust" }, { value: "third_party_verified", label: isZh ? "已验证" : "Verified", id: "opl-manifest-verified", panelId: "opl-manifest-trust" }]} />{!manifestEnabled ? <p>{isZh ? "当前 App 尚未提供清单安装通道。" : "Manifest installation is unavailable."}</p> : null}</Modal> : null}
  </div>;
}
