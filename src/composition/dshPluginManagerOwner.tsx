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
import { catalogDisplayName } from "../workbench/SoftwareCatalogMetadata";
import { nativeSoftwareEntries, nativeSoftwareMatches, softwareSourceActionLabel } from "../workbench/softwareSources";
import { formatStatus } from "../workbench/settings/presentation";
import { agentAvailabilityDetail, agentPackagePresentationStatus, agentPackageUpdateStatus, isAgentCatalogPackage, localizedPackageDescription, packageAccessStatusLabel, packageInstallAllowed, packageActionLabel, packageRoleLabel } from "../workbench/settings/packages";

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
  const [scope, setScope] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [installOpen, setInstallOpen] = useState(false);
  const [manifestUrl, setManifestUrl] = useState("");
  const [trustTier, setTrustTier] = useState("third_party_unverified");
  const navigation = useMemo(() => createNavigationStore().create(), []);
  const useStore = useMemo(() => bindSnapshotSelector(navigation), [navigation]);
  const packages = model.packageLifecycle.filter(item => !["missing_bridge", "agent_packages_directory"].includes(item.packageId) && (kind === "all" || isAgentCatalogPackage(item)));
  const native = kind === "all" ? nativeSoftwareEntries(model.softwareSources) : [];
  const match = (item: AgentPackageLifecycleRef) => (scope === "all" || item.official)
    && (statusFilter === "all" || (statusFilter === "app_hidden" ? !item.appEnabled : statusFilter.startsWith("update:") ? agentPackageUpdateStatus(item) === statusFilter.slice(7) : agentPackagePresentationStatus(item) === statusFilter))
    && (!query.trim() || item.searchMetadata.query.includes(query.trim().toLowerCase()));
  const visible = packages.filter(match);
  const visibleNative = native.filter(({ source, item }) => nativeSoftwareMatches(item, source, query, statusFilter));
  const run = (item: AgentPackageLifecycleRef, action: PackageLifecycleActionRef, payload = action.payload, key = `${item.packageId}:${action.actionId}`) => onAction({ key, actionId: action.actionId, label: `${packageActionLabel(action, locale)} ${catalogDisplayName(item.label, item.displayNameI18n, locale)}`, payload, confirmationRequired: action.confirmationRequired, dryRunSupported: action.dryRunSupported });
  const actionsFor = (item: AgentPackageLifecycleRef) => item.actions.filter(action => action.actionId !== "package_app_set_enabled" && action.kind !== "preferences" && action.status === "available" && actionPayloadComplete(action.payload, action.requiredPayloadFields) && (action.kind !== "install" || packageInstallAllowed(item)));
  const buttons = (item: AgentPackageLifecycleRef, all = false) => {
    const actions = actionsFor(item), primary = actions.find(action => action.actionId === item.recommendedActionId) ?? actions.find(action => action.kind === (item.installed === false ? "install" : agentPackageUpdateStatus(item) === "update_available" ? "update" : "repair"));
    return (all ? actions : primary ? [primary] : []).map(action => <Button key={action.actionId} size="sm" variant={action.kind === "uninstall" ? "outline" : "primary"} disabled={busy} onClick={() => run(item, action)}>{packageActionLabel(action, locale)}</Button>);
  };
  const toggle = (item: AgentPackageLifecycleRef) => {
    if (item.installed !== true) return null;
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
    const tags = <><Tag tone="quiet">{packageRoleLabel(item.packageRole, locale)}</Tag>{item.releaseChannel ? <Tag tone="info">{item.releaseChannel}</Tag> : null}<Tag tone="quiet">{packageAccessStatusLabel(item.access, locale)}</Tag>{item.availableVersion ? <Tag tone="neutral">{isZh ? "来源版本 " : "Source version "}{item.availableVersion}</Tag> : null}{update === "update_available" ? <Tag tone="info">{formatStatus(update, locale)}</Tag> : null}</>;
    return { id: item.packageId, title: name, description: localizedPackageDescription(item, locale), tags,
      status: <Tag tone={status === "unavailable" ? "danger" : "quiet"}><StateDot state={status === "ready" ? "done" : status === "unavailable" ? "error" : "idle"} />{formatStatus(status === "ready" ? "installed" : status, locale)}</Tag>,
      actions: <>{buttons(item)}{toggle(item)}</>, detailActions: <>{buttons(item, true)}{toggle(item)}</>,
      detail: <>
        <section className="opl-dsh-owner-section"><h4>{isZh ? "安装与运行状态" : "Installation and runtime"}</h4><p>{agentAvailabilityDetail(item, locale)}</p>
          <dl><div><dt>{isZh ? "软件 ID" : "Software ID"}</dt><dd><code>{item.packageId}</code></dd></div><div><dt>{isZh ? "发布者" : "Publisher"}</dt><dd>{item.publisher}</dd></div><div><dt>{isZh ? "本机版本" : "Local version"}</dt><dd>{item.installedVersion ?? (item.installed === false ? (isZh ? "未安装" : "Not installed") : (isZh ? "待确认" : "Not confirmed"))}</dd></div><div><dt>{isZh ? "来源版本" : "Source version"}</dt><dd>{item.availableVersion ?? (isZh ? "待检查" : "Not checked")}</dd></div><div><dt>{isZh ? "更新状态" : "Update status"}</dt><dd>{formatStatus(update, locale)}</dd></div></dl>
          <p>{isZh ? "开关只控制 OPL App 入口。Codex 和执行平台的启用、可调用状态独立读取。" : "The switch controls OPL App entries. Codex and execution-platform enablement and callability are read separately."}</p>
          {item.installed !== true && item.access?.visibility === "authorized_only" && !packageInstallAllowed(item) ? <p data-testid="opl-package-access-gate">{item.access.status === "signed_out" ? (isZh ? "连接软件源账号后才能安装此私有条目。" : "Connect the source account to install this private entry.") : item.access.reason ?? packageAccessStatusLabel(item.access, locale)}</p> : null}
          {item.requiredByPackageIds?.length ? <p>{isZh ? `此能力仍被 ${item.requiredByPackageIds.join("、")} 使用；卸载或停用前请先处理这些依赖。` : `Required by ${item.requiredByPackageIds.join(", ")}; resolve dependents before uninstalling or disabling it.`}</p> : null}
        </section>{shortcuts(item)}
        {item.appEnabled && props.renderPackageContributions ? <PackageContribution packageId={item.packageId} render={props.renderPackageContributions} /> : null}
        {settings.developerDetails ? <section className="opl-dsh-owner-section"><h4>{isZh ? "技术详情" : "Technical details"}</h4><dl>{item.details.map(detail => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl></section> : null}
      </>,
    };
  };
  const nativeItem = ({ source, item }: { source: SoftwareSourceRef; item: NativeSoftwareItemRef }): PluginManagerOwnerItem => {
    const name = catalogDisplayName(item.displayName, item.displayNameI18n, locale), executable = item.availableActions.filter(action => action.status === "available" && Boolean(item.revision) && actionPayloadComplete(action.payload, [...action.payloadFields, "source_id", "item_id", "expected_revision"]) && action.payload.source_id === source.sourceId && action.payload.item_id === item.itemId && action.payload.expected_revision === item.revision && (action.actionId === "source_install" ? item.installed === false : action.actionId === "source_update" ? item.installed === true && item.updateStatus === "available" : item.installed === true));
    const nativeButtons = (all = false) => (all ? executable : executable.filter(action => action.actionId === (item.installed === false ? "source_install" : "source_update"))).map(action => <Button key={action.actionId} size="sm" variant={action.actionId === "source_uninstall" ? "outline" : "primary"} disabled={busy} onClick={() => onAction({ key: `source:${source.sourceId}:${item.itemId}:${action.actionId}`, actionId: action.actionId, label: `${softwareSourceActionLabel(action.actionId, locale, action.label)} ${name}`, payload: action.payload, confirmationRequired: true, dryRunSupported: action.dryRunSupported })}>{softwareSourceActionLabel(action.actionId, locale, action.label)}</Button>);
    return { id: `${source.sourceId}:${item.itemId}`, title: name, description: item.descriptionI18n?.[locale] || item.description,
      tags: <><Tag tone="quiet">{item.kind === "cask" ? (isZh ? "桌面应用" : "Desktop app") : (isZh ? "命令行工具" : "Command-line tool")}</Tag><Tag tone="neutral">{isZh ? "来源版本 " : "Source version "}{item.availableVersion ?? (isZh ? "待检查" : "Not checked")}</Tag></>,
      actions: nativeButtons(), detailActions: nativeButtons(true), status: <Tag tone={item.updateStatus === "available" ? "info" : "quiet"}>{item.updateStatus === "available" ? (isZh ? "有更新" : "Update available") : item.installed === true ? (isZh ? "已安装" : "Installed") : item.installed === false ? (isZh ? "未安装" : "Not installed") : (isZh ? "待确认" : "Not confirmed")}</Tag>,
      detail: <section className="opl-dsh-owner-section"><h4>{isZh ? "来源信息" : "Source"}</h4><dl><div><dt>{isZh ? "软件 ID" : "Software ID"}</dt><dd>{item.name}</dd></div><div><dt>{isZh ? "软件源" : "Software source"}</dt><dd>{source.displayName}</dd></div><div><dt>{isZh ? "本机版本" : "Local version"}</dt><dd>{item.installedVersion ?? (item.installed === false ? (isZh ? "未由 Homebrew 安装" : "Not installed through Homebrew") : (isZh ? "待确认" : "Not confirmed"))}</dd></div><div><dt>{isZh ? "来源版本" : "Source version"}</dt><dd>{item.availableVersion ?? (isZh ? "待确认" : "Not confirmed")}</dd></div></dl></section>,
    };
  };
  const groups = [
    { id: "agents", label: isZh ? "领域智能体" : "Domain agents", items: visible.filter(item => item.packageRole === "standard_agent").map(packageItem) },
    { id: "workflows", label: isZh ? "工作流" : "Workflows", items: visible.filter(item => item.packageRole === "workflow_profile").map(packageItem) },
    { id: "extensions", label: isZh ? "应用与共享能力" : "Apps and shared capabilities", items: visible.filter(item => !isAgentCatalogPackage(item)).map(packageItem) },
    { id: "native", label: isZh ? "桌面应用与命令行工具" : "Desktop apps and command-line tools", items: visibleNative.map(nativeItem) },
  ].filter(group => group.items.length);
  const dict = isZh ? zh : en;
  const translate = ((key: PluginManagerLocaleKey | "back", values?: Record<string, string>) => (key === "crumbRoot" ? isZh ? "软件目录" : "Software catalog" : key === "backToList" || key === "back" ? isZh ? "返回软件目录" : "Back to software catalog" : dict[key as PluginManagerLocaleKey]).replace(/\{([^}]+)\}/g, (_, value: string) => values?.[value] ?? `{${value}}`)) as PluginManagerOwnerPageProps["t"];
  const manifestEnabled = Boolean(props.manifestInstallAction?.dryRunSupported && props.manifestInstallAction.confirmationRequired && props.manifestInstallAction.payloadFields.includes("manifest_url") && props.manifestInstallAction.payloadFields.includes("trust_tier"));
  const filters = <div className="opl-dsh-owner-filters"><Input type="search" aria-label={isZh ? "搜索软件、名称或来源" : "Search software, name or source"} value={query} placeholder={isZh ? "搜索软件、名称或来源" : "Search software, name or source"} onChange={event => setQuery(event.target.value)} /><SegmentedControl id="opl-catalog-scope" label={isZh ? "目录范围" : "Catalog scope"} value={scope} onChange={setScope} options={[{ value: "all", label: isZh ? "全部" : "All" }, { value: "official", label: isZh ? "官方" : "Official" }]} /><select aria-label={isZh ? "按状态筛选" : "Filter by status"} value={statusFilter} onChange={event => setStatusFilter(event.currentTarget.value)}><option value="all">{isZh ? "全部状态" : "All statuses"}</option><option value="not_installed">{isZh ? "未安装" : "Not installed"}</option><option value="ready">{isZh ? "已安装" : "Installed"}</option><option value="app_hidden">{isZh ? "在 OPL App 中已关闭" : "Off in OPL App"}</option><option value="update:update_available">{isZh ? "有更新" : "Updates available"}</option></select></div>;
  return <div className="opl-dsh-plugin-manager" data-testid="opl-settings-agent-catalog">
    <PluginManagerOwnerPage t={translate} title={props.pageTitle ?? (isZh ? "软件目录" : "Software catalog")} intro={props.pageIntro ?? (isZh ? "统一查看并管理软件" : "Browse and manage software")} installedLabel={isZh ? "我的应用" : "My apps"} groups={groups} tabs={props.contributedTabs} selectedTab={props.selectedTab} onTabChange={props.onTabChange} onRefresh={props.onRefresh}
      useStore={useStore} actions={navigation.actions} createHeaderRef={typeof ResizeObserver === "undefined" ? () => noop : createPluginHeaderRef} headerStatus={<>{props.headerStatus}{(props.selectedTab ?? "installed") === "installed" ? filters : null}</>}
      toolbar={<>{model.officialProfileRestore ? <Button variant="outline" size="sm" data-testid="settings-agents-restore-official-profile" disabled={busy} onClick={() => onAction({ key: "official-profile:restore", actionId: model.officialProfileRestore!.id, label: isZh ? "恢复官方组合" : "Restore official combination", payload: { intent: "explicit_restore" }, confirmationRequired: true, dryRunSupported: model.officialProfileRestore!.dryRunSupported })}>{isZh ? "恢复官方组合" : "Restore official combination"}</Button> : null}<Button variant="primary" size="sm" disabled={busy} onClick={() => setInstallOpen(true)}>{isZh ? "添加软件" : "Add software"}</Button></>} empty={<p>{isZh ? "没有符合条件的软件。请清除筛选或刷新目录。" : "No matching software. Clear filters or refresh the catalog."}</p>} />
    {installOpen ? <Modal open onClose={() => setInstallOpen(false)} title={isZh ? "添加软件" : "Add software"} closeLabel={isZh ? "关闭" : "Close"} description={isZh ? "提供软件清单，由软件包负责人检查后安装。" : "Provide a software manifest for its Package owner to verify and install."} footer={<><Button variant="outline" onClick={() => setInstallOpen(false)}>{isZh ? "取消" : "Cancel"}</Button><Button variant="primary" disabled={!manifestEnabled || !manifestUrl.trim() || busy} onClick={() => { if (props.manifestInstallAction) onAction({ key: "package:manifest-install", actionId: props.manifestInstallAction.actionId, label: isZh ? "从清单添加软件" : "Add software from manifest", payload: { manifest_url: manifestUrl.trim(), trust_tier: trustTier }, confirmationRequired: true, dryRunSupported: props.manifestInstallAction.dryRunSupported }); setInstallOpen(false); }}>{isZh ? "检查并安装" : "Check and install"}</Button></>}><Input aria-label={isZh ? "清单地址" : "Manifest URL"} value={manifestUrl} onChange={event => setManifestUrl(event.target.value)} /><SegmentedTabs size="sm" label={isZh ? "清单信任级别" : "Manifest trust"} value={trustTier} onChange={setTrustTier} items={[{ value: "third_party_unverified", label: isZh ? "尚未验证" : "Unverified", id: "opl-manifest-unverified", panelId: "opl-manifest-trust" }, { value: "third_party_verified", label: isZh ? "已验证" : "Verified", id: "opl-manifest-verified", panelId: "opl-manifest-trust" }]} />{!manifestEnabled ? <p>{isZh ? "当前 App 尚未提供清单安装通道。" : "Manifest installation is unavailable."}</p> : null}</Modal> : null}
  </div>;
}
