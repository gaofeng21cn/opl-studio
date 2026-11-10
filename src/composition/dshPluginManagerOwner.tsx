import { useMemo, useState, type ReactNode } from "react";
import { Button, Checkbox, Input, Modal, SegmentedControl, SegmentedTabs, StateDot, Switch, Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import { PluginManagerOwnerPage, type PluginManagerOwnerItem, type PluginManagerOwnerTab, type PluginManagerOwnerPageProps } from "@opl-vendor/dsh-plugin-manager-page";
import { createNavigationStore } from "../vendor/deepseek-harness/packages/client/ui-plugin-manager/src/client/navigation-store.ts";
import { createPluginHeaderRef } from "../vendor/deepseek-harness/packages/client/ui-plugin-manager/src/client/header-scroll.ts";
import { en, zh, type PluginManagerLocaleKey } from "../vendor/deepseek-harness/packages/client/ui-plugin-manager/src/client/locales.ts";
import { bindSnapshotSelector } from "../vendor/deepseek-harness/packages/client/ui-renderer/src/client/bind.ts";
import type { AgentPackageLifecycleRef, PackageLifecycleActionRef, WorkbenchModel } from "../workbench/workbenchModel";
import type { WorkbenchSettings } from "../workbench/settingsModel";
import type { NativeSoftwareItemRef, SoftwareSourceRef } from "../workbench/workbenchModel-package-contracts";
import { actionPayloadComplete, type SettingsActionRequest } from "../workbench/settingsActions";
import type { SettingsPanelProps } from "../workbench/settings/types";
import { NativeSoftwareList } from "../workbench/SoftwareSourcesPage";
import { catalogDisplayName, SoftwareCatalogSummary } from "../workbench/SoftwareCatalogMetadata";
import { nativeSoftwareProducts, nativeSoftwareMatches, softwareSourceActionLabel, nativeInstallationLabel, nativeCarrierInstalled } from "../workbench/softwareSources";
import { formatStatus } from "../workbench/settings/presentation";
import { agentAvailabilityDetail, agentPackagePresentationStatus, agentPackageUpdateStatus, isAgentCatalogPackage, localizedPackageDescription, packageAccessStatusLabel, packageInstallAllowed, packageActionLabel, packageRoleLabel, packagePresentLocally, packageLocalVersion, agentPackageNeedsAttention, packageInstalledLocally, packageDevelopmentLinked } from "../workbench/settings/packages";

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
};

const noop = () => {};

function PackageContribution({ packageId, render }: { packageId: string; render: (packageId: string) => ReactNode }) {
  return <section className="opl-dsh-owner-section" data-testid="opl-package-state">{render(packageId)}</section>;
}

/** The Package owner supplies every fact and command; the DSH page supplies presentation and navigation. */
export function DshPluginManagerOwner(props: DshPluginManagerOwnerProps) {
  const { model, settings, onAction, actionBusyKey, kind = "agents" } = props;
  const locale = settings.locale, isZh = locale === "zh", busy = actionBusyKey !== null;
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("software");
  const [statusFilter, setStatusFilter] = useState("all");
  const [installOpen, setInstallOpen] = useState(false);
  const [manifestUrl, setManifestUrl] = useState("");
  const [trustTier, setTrustTier] = useState("third_party_unverified");
  const navigation = useMemo(() => createNavigationStore().create(), []);
  const useStore = useMemo(() => bindSnapshotSelector(navigation), [navigation]);
  const packages = model.packageLifecycle.filter(item => !["missing_bridge", "agent_packages_directory"].includes(item.packageId) && (kind === "all" || isAgentCatalogPackage(item)));
  const native = kind === "all" && scope === "software" ? nativeSoftwareProducts(model.softwareSources) : [];
  const match = (item: AgentPackageLifecycleRef) => (scope === "components" ? item.catalogScope !== "software" : item.catalogScope === "software")
    && (statusFilter === "all" || (statusFilter === "ready" ? packageInstalledLocally(item) : statusFilter === "development" ? packageDevelopmentLinked(item) : statusFilter === "not_installed" ? !packagePresentLocally(item) : statusFilter === "app_hidden" ? !item.appEnabled : statusFilter.startsWith("update:") ? agentPackageUpdateStatus(item) === statusFilter.slice(7) : agentPackagePresentationStatus(item) === statusFilter))
    && (!query.trim() || item.searchMetadata.query.includes(query.trim().toLowerCase()));
  const visible = packages.filter(match);
  const visibleNative = native.filter(({ channels, source, item }) => nativeSoftwareMatches(item, source, query, statusFilter) || channels.some(channel => nativeSoftwareMatches(channel.item, channel.source, query, statusFilter)));
  const run = (item: AgentPackageLifecycleRef, action: PackageLifecycleActionRef, payload = action.payload, key = `${item.packageId}:${action.actionId}`) => onAction({ key, actionId: action.actionId, label: `${packageActionLabel(action, locale)} ${catalogDisplayName(item.label, item.displayNameI18n, locale)}`, payload, confirmationRequired: action.confirmationRequired, dryRunSupported: action.dryRunSupported });
  const actionsFor = (item: AgentPackageLifecycleRef) => (item.catalogScope !== "software" ? [] : item.actions).filter(action => action.actionId !== "package_app_set_enabled" && action.kind !== "preferences" && action.status === "available" && actionPayloadComplete(action.payload, action.requiredPayloadFields) && (action.kind !== "install" || packageInstallAllowed(item)));
  const buttons = (item: AgentPackageLifecycleRef, all = false) => {
    const actions = actionsFor(item);
    const primaryKind = item.installed === false && !packagePresentLocally(item) ? "install"
      : agentPackageUpdateStatus(item) === "update_available" ? "update"
        : agentPackageNeedsAttention(item) ? "repair" : undefined;
    const primary = primaryKind ? actions.find(action => action.kind === primaryKind) : undefined;
    return (all ? actions : primary ? [primary] : []).map(action => <Button key={action.actionId} size="sm" variant={action.kind === "uninstall" ? "outline" : "primary"} disabled={busy} onClick={() => run(item, action)}>{action.kind === "install" && item.localInstallations?.length ? (isZh ? "安装到当前宿主" : "Install in this host") : packageActionLabel(action, locale)}</Button>);
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
    const status = agentPackagePresentationStatus(item), update = agentPackageUpdateStatus(item), name = catalogDisplayName(item.label, item.displayNameI18n, locale);
    const tags = <>{item.access?.visibility === "authorized_only" ? <Tag tone="quiet">{packageAccessStatusLabel(item.access, locale)}</Tag> : null}{update === "update_available" ? <Tag tone="info">{formatStatus(update, locale)}</Tag> : null}</>;
    return { id: item.packageId, title: name,
      description: <SoftwareCatalogSummary id={item.packageId} description={localizedPackageDescription(item, locale)} installed={packagePresentLocally(item) ? true : item.installed} installedVersion={packageLocalVersion(item)} missingLabel={isZh ? "未在此宿主安装" : "Not installed in this host"} availableVersion={item.availableVersion} locale={locale} />, tags,
      status: <Tag tone={status === "unavailable" ? "danger" : "quiet"}><StateDot state={status === "ready" ? "done" : status === "unavailable" ? "error" : "idle"} />{item.installed !== true && item.localInstallations?.length ? (item.localInstallations.some(installation => installation.mode === "installed") ? (isZh ? "独立安装" : "Standalone installation") : (isZh ? "开发接入" : "Development checkout")) : status === "not_installed" ? (isZh ? "未在此宿主安装" : "Not installed in this host") : formatStatus(status === "ready" ? "installed" : status, locale)}</Tag>,
      actions: <>{buttons(item)}{toggle(item)}</>, detailActions: <>{buttons(item, true)}{toggle(item)}</>,
      detail: <>
        <section className="opl-dsh-owner-section"><h4>{isZh ? "安装与运行状态" : "Installation and runtime"}</h4><p>{item.catalogScope !== "software" ? (item.catalogScope === "host_component" ? (isZh ? "此组件由所属宿主管理，随宿主配置维护。" : "This component is managed through its host configuration.") : (isZh ? "所属服务尚未提供软件分类，请刷新或更新基座后确认。" : "The owner has not reported a catalog classification. Refresh or update the foundation to confirm it.")) : agentAvailabilityDetail(item, locale)}</p>
          <dl><div><dt>{isZh ? "软件 ID" : "Software ID"}</dt><dd><code>{item.packageId}</code></dd></div><div><dt>{isZh ? "软件类型" : "Software type"}</dt><dd>{({ application: isZh ? "应用" : "Application", agent: isZh ? "智能体" : "Agent", capability: isZh ? "能力包" : "Capability package", unknown: isZh ? "待确认" : "Not confirmed" })[item.softwareType ?? "unknown"]}</dd></div><div><dt>{isZh ? "技术角色" : "Technical role"}</dt><dd>{packageRoleLabel(item.packageRole, locale)}</dd></div><div><dt>{isZh ? "来源类型" : "Distribution"}</dt><dd>{item.distributionChannel === "source" ? (isZh ? "固定源码版本" : "Pinned source version") : item.distributionChannel === "release" ? (isZh ? "发行包" : "Published artifact") : (isZh ? "待确认" : "Not confirmed")}</dd></div><div><dt>{isZh ? "发布者" : "Publisher"}</dt><dd>{item.publisher}</dd></div><div><dt>{isZh ? "当前宿主版本" : "Current host version"}</dt><dd>{item.installedVersion ?? (item.installed === false ? (isZh ? "未安装到此宿主" : "Not installed in this host") : (isZh ? "待确认" : "Not confirmed"))}</dd></div><div><dt>{isZh ? "来源版本" : "Source version"}</dt><dd>{item.availableVersion ?? (isZh ? "待检查" : "Not checked")}</dd></div><div><dt>{isZh ? "当前宿主更新" : "Current host update"}</dt><dd>{formatStatus(update, locale)}</dd></div></dl>
          <p>{isZh ? "开关只控制 OPL App 入口。Codex 和执行平台的启用、可调用状态独立读取。" : "The switch controls OPL App entries. Codex and execution-platform enablement and callability are read separately."}</p>
          {item.installed !== true && item.access?.visibility === "authorized_only" && !packageInstallAllowed(item) ? <p data-testid="opl-package-access-gate">{item.access.status === "signed_out" ? (isZh ? "连接软件源账号后才能安装此私有条目。" : "Connect the source account to install this private entry.") : item.access.reason ?? packageAccessStatusLabel(item.access, locale)}</p> : null}
          {item.requiredByPackageIds?.length ? <p>{isZh ? `此能力仍被 ${item.requiredByPackageIds.join("、")} 使用；卸载或停用前请先处理这些依赖。` : `Required by ${item.requiredByPackageIds.join(", ")}; resolve dependents before uninstalling or disabling it.`}</p> : null}
        </section>{item.localInstallations?.length ? <section className="opl-dsh-owner-section"><h4>{isZh ? "本机安装实例" : "Local installations"}</h4>{item.localInstallations.map(installation => <dl key={installation.installationId} data-testid="opl-local-installation"><div><dt>{isZh ? "安装方式" : "Installation method"}</dt><dd>{installation.mode === "development" ? (isZh ? "开发接入" : "Development checkout") : (isZh ? "独立安装" : "Standalone installation")} · {installation.manager === "uv" ? "uv" : (isZh ? "软件自身管理" : "Managed by the software")}</dd></div><div><dt>{isZh ? "版本" : "Version"}</dt><dd>{installation.version}</dd></div><div><dt>{isZh ? "位置引用" : "Location reference"}</dt><dd><code>{installation.locationRef}</code></dd></div></dl>)}<p>{isZh ? "这些实例通过各自的安装器管理。此页的宿主安装操作只影响当前宿主中的插件副本。" : "These installations use their own installers. Host installation actions affect only the plugin copy in this host."}</p></section> : null}{shortcuts(item)}
        {item.catalogScope === "software" && item.appEnabled && props.renderPackageContributions ? <PackageContribution packageId={item.packageId} render={props.renderPackageContributions} /> : null}
        {settings.developerDetails ? <section className="opl-dsh-owner-section"><h4>{isZh ? "技术详情" : "Technical details"}</h4><dl>{item.details.map(detail => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl></section> : null}
      </>,
    };
  };
  const nativeItem = ({ source, item, productId, channels }: ReturnType<typeof nativeSoftwareProducts>[number]): PluginManagerOwnerItem => {
    const name = item.productDisplayName ?? catalogDisplayName(item.displayName, item.displayNameI18n, locale), executable = item.availableActions.filter(action => source && action.status === "available" && Boolean(item.revision) && actionPayloadComplete(action.payload, [...action.payloadFields, "source_id", "item_id", "expected_revision"]) && action.payload.source_id === source.sourceId && action.payload.item_id === item.itemId && action.payload.expected_revision === item.revision && (action.actionId === "source_install" ? nativeCarrierInstalled(item) === false : action.actionId === "source_update" ? nativeCarrierInstalled(item) === true && item.updateStatus === "available" : nativeCarrierInstalled(item) === true));
    const nativeButtons = (all = false) => (all ? executable : executable.filter(action => action.actionId === (item.installed === false ? "source_install" : "source_update"))).map(action => <Button key={action.actionId} size="sm" variant={action.actionId === "source_uninstall" ? "outline" : "primary"} disabled={busy} onClick={() => onAction({ key: `source:${source?.sourceId}:${item.itemId}:${action.actionId}`, actionId: action.actionId, label: `${softwareSourceActionLabel(action.actionId, locale, action.label)} ${name}`, payload: action.payload, confirmationRequired: true, dryRunSupported: action.dryRunSupported })}>{softwareSourceActionLabel(action.actionId, locale, action.label)}</Button>);
    return { id: productId, title: name, description: <SoftwareCatalogSummary id={item.name} description={item.descriptionI18n?.[locale] || item.description || (isZh ? "尚未提供软件说明。" : "No software description provided.")} installed={item.installed} installedVersion={item.installedVersion} availableVersion={item.availableVersion} locale={locale} />,
      tags: null,
      actions: nativeButtons(), detailActions: nativeButtons(true), status: <Tag tone={item.updateStatus === "available" ? "info" : "quiet"}>{item.updateStatus === "available" ? (isZh ? "有更新" : "Update available") : item.installed === true ? (isZh ? "已安装" : "Installed") : item.installed === false ? (isZh ? "未安装" : "Not installed") : (isZh ? "待确认" : "Not confirmed")}</Tag>,
      detail: <>
        <section className="opl-dsh-owner-section"><h4>{isZh ? "本机安装" : "Local installation"}</h4><dl>
          <div><dt>{isZh ? "软件 ID" : "Software ID"}</dt><dd><code>{productId}</code></dd></div>
          <div><dt>{isZh ? "本机版本" : "Local version"}</dt><dd>{item.installedVersion ?? (item.installed === false ? (isZh ? "未安装" : "Not installed") : (isZh ? "待确认" : "Not confirmed"))}</dd></div>
          <div><dt>{isZh ? "安装方式" : "Installation method"}</dt><dd>{nativeInstallationLabel(item, locale)}</dd></div>
          <div><dt>{isZh ? "安装管理者" : "Installation owner"}</dt><dd>{item.installationOwner === "opl_framework" ? "OPL Framework" : item.installationOwner === "homebrew" ? "Homebrew" : item.installationOwner === "application" ? (isZh ? "软件自身管理" : "Managed by the software") : (isZh ? "待确认" : "Not confirmed")}</dd></div>
        </dl>{item.ownerSettingsRoute === "updates" && props.onTabChange ? <Button size="sm" variant="outline" onClick={() => props.onTabChange?.("updates")}>{isZh ? "前往更新" : "Go to updates"}</Button> : null}</section>
        {channels.length ? <section className="opl-dsh-owner-section"><h4>{isZh ? "可用软件源与安装渠道" : "Available sources and installation channels"}</h4><p>{isZh ? "各渠道列出来源版本及该渠道的安装记录。本机实际安装信息见上方。" : "Each channel shows its source version and installation receipt. Actual local installation is listed above."}</p><NativeSoftwareList entries={channels} locale={locale} actionBusyKey={actionBusyKey} onAction={onAction} channelView /></section> : null}
      </>,
    };
  };
  const groups = scope === "components"
    ? [{ id: "components", label: isZh ? "系统组件 · 由所属宿主管理" : "System components · managed by their host", items: visible.filter(item => item.catalogScope === "host_component").map(packageItem) }, { id: "unclassified", label: isZh ? "分类待确认" : "Classification not confirmed", items: visible.filter(item => item.catalogScope !== "host_component").map(packageItem) }].filter(group => group.items.length)
    : [
      { id: "native", label: isZh ? "应用" : "Applications", items: [...visible.filter(item => item.softwareType === "application").map(packageItem), ...visibleNative.map(nativeItem)] },
      { id: "agents", label: isZh ? "智能体" : "Agents", items: visible.filter(item => item.softwareType === "agent").map(packageItem) },
      { id: "capabilities", label: isZh ? "能力包" : "Capability packages", items: visible.filter(item => item.softwareType === "capability").map(packageItem) },
      { id: "unclassified-software", label: isZh ? "类型待确认" : "Type not confirmed", items: visible.filter(item => !["application", "agent", "capability"].includes(item.softwareType ?? "unknown")).map(packageItem) },
    ].filter(group => group.items.length);
  const dict = isZh ? zh : en;
  const translate = ((key: PluginManagerLocaleKey | "back", values?: Record<string, string>) => (key === "crumbRoot" ? isZh ? "软件目录" : "Software catalog" : key === "backToList" || key === "back" ? isZh ? "返回软件目录" : "Back to software catalog" : dict[key as PluginManagerLocaleKey]).replace(/\{([^}]+)\}/g, (_, value: string) => values?.[value] ?? `{${value}}`)) as PluginManagerOwnerPageProps["t"];
  const manifestEnabled = Boolean(props.manifestInstallAction?.dryRunSupported && props.manifestInstallAction.confirmationRequired && props.manifestInstallAction.payloadFields.includes("manifest_url") && props.manifestInstallAction.payloadFields.includes("trust_tier"));
  const filters = <div className="opl-dsh-owner-filters"><Input type="search" aria-label={isZh ? "搜索软件、名称或来源" : "Search software, name or source"} value={query} placeholder={isZh ? "搜索软件、名称或来源" : "Search software, name or source"} onChange={event => setQuery(event.target.value)} /><SegmentedControl id="opl-catalog-scope" label={isZh ? "目录范围" : "Catalog scope"} value={scope} onChange={setScope} options={[{ value: "software", label: isZh ? "软件" : "Software" }, { value: "components", label: isZh ? "系统组件" : "System components" }]} /><select aria-label={isZh ? "按状态筛选" : "Filter by status"} value={statusFilter} onChange={event => setStatusFilter(event.currentTarget.value)}><option value="all">{isZh ? "全部状态" : "All statuses"}</option><option value="not_installed">{isZh ? "未安装" : "Not installed"}</option><option value="ready">{isZh ? "已安装" : "Installed"}</option><option value="development">{isZh ? "开发接入" : "Development checkouts"}</option><option value="app_hidden">{isZh ? "在 OPL App 中已关闭" : "Off in OPL App"}</option><option value="update:update_available">{isZh ? "有更新" : "Updates available"}</option></select></div>;
  return <div className="opl-dsh-plugin-manager" data-testid="opl-settings-agent-catalog">
    <PluginManagerOwnerPage t={translate} title={props.pageTitle ?? (isZh ? "软件目录" : "Software catalog")} intro={props.pageIntro ?? (isZh ? "统一查看并管理软件" : "Browse and manage software")} installedLabel={isZh ? "软件目录" : "Software catalog"} groups={groups} tabs={props.contributedTabs} selectedTab={props.selectedTab} onTabChange={props.onTabChange} onRefresh={props.onRefresh}
      useStore={useStore} actions={navigation.actions} createHeaderRef={typeof ResizeObserver === "undefined" ? () => noop : createPluginHeaderRef} headerStatus={<>{props.headerStatus}{(props.selectedTab ?? "installed") === "installed" ? filters : null}</>}
      toolbar={<>{model.officialProfileRestore ? <Button variant="outline" size="sm" data-testid="settings-agents-restore-official-profile" disabled={busy} onClick={() => onAction({ key: "official-profile:restore", actionId: model.officialProfileRestore!.id, label: isZh ? "恢复官方组合" : "Restore official combination", payload: { intent: "explicit_restore" }, confirmationRequired: true, dryRunSupported: model.officialProfileRestore!.dryRunSupported })}>{isZh ? "恢复官方组合" : "Restore official combination"}</Button> : null}<Button variant="primary" size="sm" disabled={busy} onClick={() => setInstallOpen(true)}>{isZh ? "添加软件" : "Add software"}</Button></>} empty={<p>{props.stateStatus === "loading" ? (isZh ? "正在读取软件目录…" : "Reading the software catalog…") : (isZh ? "没有符合条件的软件。请清除筛选或刷新目录。" : "No matching software. Clear filters or refresh the catalog.")}</p>} />
    {installOpen ? <Modal open onClose={() => setInstallOpen(false)} title={isZh ? "添加软件" : "Add software"} closeLabel={isZh ? "关闭" : "Close"} description={isZh ? "提供软件清单，由软件包负责人检查后安装。" : "Provide a software manifest for its Package owner to verify and install."} footer={<><Button variant="outline" onClick={() => setInstallOpen(false)}>{isZh ? "取消" : "Cancel"}</Button><Button variant="primary" disabled={!manifestEnabled || !manifestUrl.trim() || busy} onClick={() => { if (props.manifestInstallAction) onAction({ key: "package:manifest-install", actionId: props.manifestInstallAction.actionId, label: isZh ? "从清单添加软件" : "Add software from manifest", payload: { manifest_url: manifestUrl.trim(), trust_tier: trustTier }, confirmationRequired: true, dryRunSupported: props.manifestInstallAction.dryRunSupported }); setInstallOpen(false); }}>{isZh ? "检查并安装" : "Check and install"}</Button></>}><Input aria-label={isZh ? "清单地址" : "Manifest URL"} value={manifestUrl} onChange={event => setManifestUrl(event.target.value)} /><SegmentedTabs size="sm" label={isZh ? "清单信任级别" : "Manifest trust"} value={trustTier} onChange={setTrustTier} items={[{ value: "third_party_unverified", label: isZh ? "尚未验证" : "Unverified", id: "opl-manifest-unverified", panelId: "opl-manifest-trust" }, { value: "third_party_verified", label: isZh ? "已验证" : "Verified", id: "opl-manifest-verified", panelId: "opl-manifest-trust" }]} />{!manifestEnabled ? <p>{isZh ? "当前 App 尚未提供清单安装通道。" : "Manifest installation is unavailable."}</p> : null}</Modal> : null}
  </div>;
}
