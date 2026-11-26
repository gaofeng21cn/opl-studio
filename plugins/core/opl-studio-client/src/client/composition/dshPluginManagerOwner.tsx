import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { settingsEntriesForNativeAppSurface } from "./contributionProjection";
import { latestPackageOperations, packageStagePresentation, type PackageOperation } from "../workbench/packageOperations";
import { restartOutcomeMessage } from "../workbench/OplSoftwareUpdates";
import { softwareCanStart } from "../workbench/softwareExperience";
import { SoftwareArtwork } from "../workbench/SoftwareArtwork";
import { managedDependencyLabel, managedDependencyMissingPackages, managedDependencySummary, managedDependencyVersion, managedDependencyVersionSummary, managedDependencyPolicyLabel } from "../workbench/settings/maintenance";
import type { ManagedUpdateProjection } from "../workbench/workbenchModel";
import { Button, Checkbox, Input, Modal, SegmentedTabs, StateDot, Switch, Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import { PluginManagerOwnerPage, type PluginManagerOwnerItem, type PluginManagerOwnerTab, type PluginManagerOwnerPageProps } from "@opl-vendor/dsh-plugin-manager-page";
import {
  bindSnapshotSelector,
  createNavigationStore,
  createPluginHeaderRef
} from "@gaofeng21cn/opl-dsh-adapters/dsh-shell";
import {
  pluginManagerEn as en,
  pluginManagerZh as zh,
  type PluginManagerLocaleKey
} from "@gaofeng21cn/opl-dsh-adapters/dsh-locales";
import type { AgentPackageLifecycleRef, PackageLifecycleActionRef, WorkbenchModel } from "../workbench/workbenchModel";
import type { WorkbenchSettings } from "../workbench/settingsModel";
import type { CodexCapabilityCatalog, CodexSkillCapability } from "../bridge/oplBridge";
import type {
  BillionContextPreference,
  DshPluginCatalogEntry,
  DshPluginCatalogProjection,
  DshPluginManageRequest,
  SoftwareProductType
} from "@gaofeng21cn/opl-host-contracts";
import type { SettingsDestinationId } from "../workbench/settings/types";
import { actionPayloadComplete, type SettingsActionRequest } from "../workbench/settingsActions";
import type { ResourceSettingsFocus, SettingsPanelProps } from "../workbench/settings/types";
import { SoftwareInstallations, SoftwareReleaseOptions, availableInstallationActions, installationActionLabel, installationActionRequest } from "../workbench/SoftwareInstallations";
import { knowledgeLibraryLabel } from "../workbench/knowledgeSources";
import { catalogDisplayName } from "../workbench/SoftwareCatalogMetadata";
import { nativeSoftwareProducts, nativeSoftwareMatches, softwareSourceActionLabel, nativeInstallationLabel, nativeCarrierInstalled, nativeInstalledDisplayVersion, nativeUpdateStatusLabel } from "../workbench/softwareSources";
import { catalogInstalledVersion, catalogManagerLabel, activeSoftwareInstallation, softwareActivationLabel, catalogStateLabel, catalogTypeLabel, dshIntentCategory, intentCategoryLabel, packageDownloadAuthorizationRequired, packageIntentCategory, packagePermissionsSummary, visibleSoftwareTypes, nativeCatalogState, nativeCatalogStatusLabel, nativeCatalogAvailableVersion, packageCatalogScope, packageCatalogState, packageCatalogStatusLabel, softwareCatalogPackages, softwareCatalogNativeProducts, runtimeDependencyStatus, type SoftwareCatalogScope, type SoftwareCatalogState } from "../workbench/softwareCatalog";
import { formatStatus } from "../workbench/settings/presentation";
import { agentAvailabilityDetail, agentPackageUpdateStatus, isAgentCatalogPackage, localizedPackageDescription, packageAccessStatusLabel, packageInstallAllowed, packageActionLabel, packagePresentLocally, packageAccessNeedsAttention, agentPackageNeedsAttention, packageDevelopmentLinked } from "../workbench/settings/packages";

export type DshPluginManagerOwnerProps = {
  kind?: "agents" | "all";
  managedUpdate?: ManagedUpdateProjection | null;
  model: WorkbenchModel;
  settings: WorkbenchSettings;
  actionBusyKey: string | null;
  onAction(request: SettingsActionRequest): void;
  manifestInstallAction?: SettingsPanelProps["manifestInstallAction"];
  contributedTabs?: readonly PluginManagerOwnerTab[];
  selectedTab?: string;
  onTabChange?: (tab: string) => void;
  pageTitle?: string;
  pageIntro?: string;
  onRefresh?: () => void;
  stateStatus?: "loading" | "ready" | "error";
  headerStatus?: ReactNode;
  packageOperations?: PackageOperation[];
  operationsReadError?: boolean;
  capabilityCatalog?: CodexCapabilityCatalog;
  capabilityStatus?: "idle" | "loading" | "ready" | "error";
  capabilityError?: string;
  onRefreshCapabilities?: () => void;
  onUseSoftware?: (packageId: string) => void;
  onConfigureSoftware?: (packageId: string) => void;
  onOpenInstallationLocation?: (path: string) => void;
  focus?: { packageId: string; revision: number };
  onOpenSettings?: (destination: SettingsDestinationId, focus?: ResourceSettingsFocus) => void;
  statusFilter?: string;
  onStatusFilterChange?: (status: string) => void;
  onDshRestartRequired?: () => void;
  onDshPluginActivityChange?: (catalog: DshPluginCatalogProjection) => void;
  dshCatalogRevision?: number;
};

const noop = () => {};


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
  return <span className="opl-catalog-state" data-label={locale === "zh" ? "状态" : "Status"}><StateDot state={state === "installed" ? "done" : state === "attention" ? "warning" : "idle"} />{label ?? catalogStateLabel(state, locale)}</span>;
}

/** The Package owner supplies every fact and command; the DSH page supplies presentation and navigation. */
export function DshPluginManagerOwner(props: DshPluginManagerOwnerProps) {
  const { model, settings, onAction, actionBusyKey, kind = "agents" } = props;
  const locale = settings.locale, isZh = locale === "zh", busy = actionBusyKey !== null;
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SoftwareCatalogScope>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [localStatusFilter, setLocalStatusFilter] = useState("all");
  const statusFilter = props.statusFilter ?? localStatusFilter;
  const setStatusFilter = (next: string) => { setLocalStatusFilter(next); props.onStatusFilterChange?.(next); };
    const [installOpen, setInstallOpen] = useState(false);
    const [manifestUrl, setManifestUrl] = useState("");
    const [trustTier, setTrustTier] = useState("third_party_unverified");
    const [openPluginModalOpen, setOpenPluginModalOpen] = useState(false);
    const [openPluginPackageName, setOpenPluginPackageName] = useState("");
    const [dshPendingConfirm, setDshPendingConfirm] = useState<{
      entry: DshPluginCatalogEntry;
      operation: "install" | "update" | "remove";
    } | null>(null);
    const navigation = useMemo(() => createNavigationStore().create(), []);
    const useStore = useMemo(() => bindSnapshotSelector(navigation), [navigation]);
  const modelRef = useRef(model);
  modelRef.current = model;
  useEffect(() => {
    if (props.focus) {
      const focusId = props.focus.packageId;
      const matchedDsh = dshEntriesRef.current.find(entry => entry.pluginId === focusId || entry.packageName === focusId);
      if (matchedDsh) {
        setScope((matchedDsh.tier === "core_runtime" || dshIntentCategory(matchedDsh.intentCategory) === "dependency") ? "components" : "all");
        setQuery(focusId);
        setTypeFilter("all");
        setStatusFilter("all");
        navigation.actions.setView({ kind: "list" });
        return;
      }
      const matched = modelRef.current.packageLifecycle.find(item => item.packageId === focusId);
      setScope(matched && packageCatalogScope(matched) === "components" ? "components" : "all");
      setQuery(focusId);
      setTypeFilter("all");
      setStatusFilter("all");
    }
  }, [props.focus, navigation]);
  const dshBridge = typeof window !== "undefined" ? window.oplStudio : undefined;
  const [dshCatalog, setDshCatalog] = useState<DshPluginCatalogProjection | null>(null);
  const [dshBusyId, setDshBusyId] = useState<string | null>(null);
  const [dshRestartingId, setDshRestartingId] = useState<string | null>(null);
  const [dshError, setDshError] = useState("");
  const dshEntriesRef = useRef<DshPluginCatalogEntry[]>([]);

  const synthesizeBillionContextCatalog = (bc: BillionContextPreference): DshPluginCatalogProjection => ({
    schema: "opl_dsh_plugin_catalog.v1",
    checkedAt: new Date().toISOString(),
    restartRequired: Boolean(bc.pendingOperation) || bc.active !== bc.enabled,
    activity: [],
    entries: [{
      pluginId: "billion-context",
      packageName: "billion-context",
      tier: "external_plugin",
      origin: "external",
      intentCategory: "extension",
      canToggle: true,
      canInstall: true,
      canUninstall: true,
      settingsDestination: "models",
      upstreamUrl: "https://github.com/ranxianglei/billion-context",
      labelI18n: { zh: "Billion Context", en: "Billion Context" },
      descriptionI18n: { zh: "通过本机代理压缩 Codex 长对话。", en: "Compress long Codex conversations through a local proxy." },
      permissionsI18n: {
        zh: ["作为本机 Codex 启动包装代理运行", "从 npm 安装且全程禁用生命周期脚本"],
        en: ["Runs as a local Codex launch wrapper proxy", "Installed from npm with lifecycle scripts disabled"]
      },
      installed: bc.installed,
      enabled: bc.enabled,
      active: bc.active,
      version: bc.version ?? null,
      activeVersion: bc.activeVersion ?? null,
      availableVersion: bc.availableVersion ?? null,
      updateAvailable: Boolean(bc.updateAvailable),
      startupFailed: Boolean(bc.startupFailed),
      pendingRestart: Boolean(bc.pendingOperation) || bc.active !== bc.enabled,
      pendingOperation: bc.pendingOperation ?? null,
      pendingVersion: bc.pendingVersion ?? null
    }]
  });

  useEffect(() => {
    if (kind !== "all" || (props.selectedTab ?? "installed") !== "installed") return;
    let mounted = true;
    const loader = dshBridge?.readDshPluginCatalog
      ? dshBridge.readDshPluginCatalog()
      : dshBridge?.readBillionContext
        ? dshBridge.readBillionContext().then(synthesizeBillionContextCatalog)
        : undefined;
    if (!loader) return;
    void loader.then(catalog => {
      if (!mounted) return;
      dshEntriesRef.current = catalog.entries;
      setDshCatalog(catalog);
      setDshError("");
      props.onDshPluginActivityChange?.(catalog);
      if (catalog.restartRequired) props.onDshRestartRequired?.();
    }, error => {
      if (mounted) setDshError(error instanceof Error ? error.message : String(error));
    });
    return () => { mounted = false; };
  }, [dshBridge, kind, props.selectedTab, props.dshCatalogRevision]);

  async function runDshPluginAction(pluginId: string, operation: DshPluginManageRequest["operation"], packageName?: string) {
    setDshBusyId(pluginId);
    setDshError("");
    try {
      let nextCatalog: DshPluginCatalogProjection | undefined;
      if (dshBridge?.manageDshPlugin) {
        nextCatalog = await dshBridge.manageDshPlugin({ pluginId, ...(packageName ? { packageName } : {}), operation });
      } else if (pluginId === "billion-context") {
        const bc = operation === "enable" || operation === "disable"
          ? await dshBridge?.setBillionContext?.({ enabled: operation === "enable" })
          : dshBridge?.manageBillionContext
            ? await dshBridge.manageBillionContext({ operation })
            : undefined;
        if (bc) nextCatalog = synthesizeBillionContextCatalog(bc);
      }
      if (nextCatalog) {
        dshEntriesRef.current = nextCatalog.entries;
        setDshCatalog(nextCatalog);
        props.onDshPluginActivityChange?.(nextCatalog);
        if (nextCatalog.restartRequired) props.onDshRestartRequired?.();
      }
    } catch (error) {
      setDshError(error instanceof Error ? error.message : String(error));
    } finally {
      setDshBusyId(null);
    }
  }

  async function restartForDshPlugin(pluginId: string) {
    if (!dshBridge?.restartNativeApp || dshRestartingId) return;
    setDshRestartingId(pluginId);
    setDshError("");
    try {
      const outcome = await dshBridge.restartNativeApp();
      if (outcome && outcome.accepted === false) {
        setDshError(restartOutcomeMessage(outcome, isZh));
      }
    } catch (error) {
      setDshError(error instanceof Error ? error.message : String(error));
    } finally {
      setDshRestartingId(null);
    }
  }

  useEffect(() => {
    if (scope === "external" && props.capabilityStatus === "idle") props.onRefreshCapabilities?.();
  }, [scope, props.capabilityStatus, props.onRefreshCapabilities]);
  const packages = softwareCatalogPackages(model, scope).filter(item => kind === "all" || isAgentCatalogPackage(item));
  const native = kind === "all" ? softwareCatalogNativeProducts(model, scope) : [];
  const matchesState = (state: SoftwareCatalogState) => statusFilter === "all" || (statusFilter === "installed" ? ["installed", "update_available", "attention"].includes(state) : state === statusFilter);
  const visible = packages.filter(item => matchesState(packageCatalogState(item))
    && (typeFilter === "all" || packageIntentCategory(item) === typeFilter)
    && (!query.trim() || `${item.searchMetadata.query} ${item.displayNameI18n[locale] ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())));
  const visibleNative = native.filter(({ productId, channels, source, item }) => matchesState(nativeCatalogState(item))
    && (typeFilter === "all" || typeFilter === "application")
    && (productId === query.trim().toLowerCase() || nativeSoftwareMatches(item, source, query, "all") || channels.some(channel => nativeSoftwareMatches(channel.item, channel.source, query, "all"))));
  const run = (item: AgentPackageLifecycleRef, action: PackageLifecycleActionRef, payload = action.payload, key = `${item.packageId}:${action.actionId}`) => onAction({ key, actionId: action.actionId, label: `${packageActionLabel(action, locale)} ${catalogDisplayName(item.label, item.displayNameI18n, locale)}`, payload, confirmationRequired: action.confirmationRequired, dryRunSupported: action.dryRunSupported });
  const activeOperations = latestPackageOperations(props.packageOperations ?? []).filter(operation => operation.status === 'running');
  const operationFor = (item: AgentPackageLifecycleRef) => activeOperations.find(operation => operation.package_id === item.packageId || operation.active_package_id === item.packageId);
  const actionsFor = (item: AgentPackageLifecycleRef) => item.actions.filter(action => (item.catalogScope === "software" || (item.catalogScope === "host_component" && action.kind === "install")) && action.actionId !== "package_app_set_enabled" && action.kind !== "preferences" && action.status === "available" && actionPayloadComplete(action.payload, action.requiredPayloadFields) && (action.kind !== "install" || packageInstallAllowed(item)) && (action.kind !== "update" || item.currentness === "update_available") && (!["update", "repair"].includes(action.kind) || !packageAccessNeedsAttention(item)));
  const settingsDestinationsFor = (item: AgentPackageLifecycleRef) => item.appEnabled && props.onOpenSettings
    ? (["resources", "services"] as const).filter(destination => settingsEntriesForNativeAppSurface(model.uiContributions.entries.filter(entry => entry.packageId === item.packageId), destination, settings.developerDetails).length > 0)
    : [];
  const configureAction = (item: AgentPackageLifecycleRef) => {
    const destination = settingsDestinationsFor(item)[0];
    if (!destination || !props.onOpenSettings || operationFor(item)) return null;
    return <Button size="sm" variant="primary" disabled={busy} onClick={() => props.onOpenSettings?.(destination, destination === "resources" ? { section: "remote", packageId: item.packageId } : undefined)}>{isZh ? "配置" : "Configure"}</Button>;
  };
  const manageSourcesAction = (installed = false) => props.onTabChange
    ? <Button size="sm" variant="outline" onClick={() => props.onTabChange?.("sources")}>{installed ? (isZh ? "检查软件源" : "Check source") : (isZh ? "管理软件源" : "Manage sources")}</Button>
    : null;
  const buttons = (item: AgentPackageLifecycleRef, all = false) => {
    if (operationFor(item)) return <Button size="sm" variant="outline" disabled>{isZh ? '进行中' : 'In progress'}</Button>;
    if (!all && (packageAccessNeedsAttention(item) || (!packagePresentLocally(item) && packageDownloadAuthorizationRequired(item)))) {
      return manageSourcesAction(packagePresentLocally(item));
    }
    const actions = actionsFor(item);
    const primaryKind = item.installed === false && !packagePresentLocally(item) ? "install"
      : packageCatalogState(item) === "update_available" ? "update"
        : agentPackageNeedsAttention(item) ? "repair" : undefined;
    const primary = primaryKind ? actions.find(action => action.kind === primaryKind) : undefined;
    if (!all && !primary && packagePresentLocally(item) && !(props.onUseSoftware && softwareCanStart(item))) {
      const quickConfigure = configureAction(item);
      if (quickConfigure) return quickConfigure;
      return <Button size="sm" variant="outline" disabled={busy} onClick={() => navigation.actions.setView({ kind: "item", id: item.packageId })}>{isZh ? "查看详情" : "Details"}</Button>;
    }
    return (all ? actions : primary ? [primary] : []).map(action => <Button key={action.actionId} size="sm" variant={action.kind === "uninstall" || softwareCanStart(item) ? "outline" : "primary"} disabled={busy} onClick={() => run(item, action)}>{action.kind === "install" ? (isZh ? "安装" : "Install") : packageActionLabel(action, locale)}</Button>);
  };
  const useAction = (item: AgentPackageLifecycleRef) => props.onUseSoftware && softwareCanStart(item) && !operationFor(item)
    ? <Button size="sm" variant="primary" disabled={busy} onClick={() => props.onUseSoftware?.(item.packageId)}>{isZh ? "开始使用" : "Start using"}</Button> : null;
  const toggle = (item: AgentPackageLifecycleRef) => {
    if (item.installed !== true || item.catalogScope !== "software") return null;
    const action = item.actions.find(action => action.actionId === "package_app_set_enabled" && action.status === "available");
    const name = catalogDisplayName(item.label, item.displayNameI18n, locale);
    return <Switch checked={item.appEnabled} disabled={!action || busy || Boolean(operationFor(item))} label={isZh ? `在 OPL App 中启用 ${name}` : `Enable ${name} in OPL App`} onChange={enabled => { if (action) run(item, action, { ...action.payload, package_id: item.packageId, enabled }, `app:${item.packageId}:enabled`); }} />;
  };
  const shortcutOrder = model.packageLifecycle.flatMap(item => item.homeShortcuts.map(shortcut => ({ packageId: item.packageId, ...shortcut }))).sort((a, b) => a.sortOrder - b.sortOrder || a.shortcutId.localeCompare(b.shortcutId));
  const shortcuts = (item: AgentPackageLifecycleRef) => {
    const action = item.actions.find(action => action.kind === "preferences" && action.status === "available");
    if (!item.appEnabled || !item.homeShortcuts.length) return null;
    return <section className="opl-dsh-owner-section"><h4>{isZh ? "新任务入口" : "New Task entries"}</h4>{item.homeShortcuts.map(shortcut => {
      const index = shortcutOrder.findIndex(entry => entry.packageId === item.packageId && entry.shortcutId === shortcut.shortcutId), prev = shortcutOrder[index - 1], next = shortcutOrder[index + 1];
      const submit = (visible: boolean, sortOrder: number) => { if (action) run(item, action, { ...action.payload, shortcut_id: shortcut.shortcutId, visible, sort_order: sortOrder }, `home:${item.packageId}:${shortcut.shortcutId}:preferences`); };
      return <div key={shortcut.shortcutId} className="opl-dsh-owner-shortcut"><Checkbox checked={shortcut.visible} disabled={!action || busy || Boolean(operationFor(item))} label={isZh ? "在新任务中显示" : "Show in New Task"} onChange={value => submit(value, shortcut.sortOrder)} /><Button size="sm" disabled={!action || !prev || busy} onClick={() => prev && submit(shortcut.visible, prev.sortOrder - 1)}>{isZh ? "向前移动" : "Move earlier"}</Button><Button size="sm" disabled={!action || !next || busy} onClick={() => next && submit(shortcut.visible, next.sortOrder + 1)}>{isZh ? "向后移动" : "Move later"}</Button></div>;
    })}</section>;
  };
  const packageItem = (item: AgentPackageLifecycleRef): PluginManagerOwnerItem => {
    const update = agentPackageUpdateStatus(item), state = packageCatalogState(item), name = catalogDisplayName(item.label, item.displayNameI18n, locale);
    const current = activeSoftwareInstallation(item.installations, item.activeInstallationId, item.activeInstallationStatus);
    const development = item.installations ? current?.mode === "development" : packageDevelopmentLinked(item);
    const instanceCount = item.installations?.length ?? ((item.installed === true ? 1 : 0) + (item.localInstallations?.length ?? 0));
    const hasPerInstallationActions = Boolean(item.installations?.some(inst => availableInstallationActions(inst).length > 0)) || Boolean(item.installationActions?.length);
    const currentVersion = catalogInstalledVersion(item, locale);
    const installAuthorizationRequired = !packagePresentLocally(item) && packageDownloadAuthorizationRequired(item);
    const missingInstallSource = !installAuthorizationRequired && state === "not_installed" && item.installabilityReason === "package_install_source_unavailable";
    const availableVersion = missingInstallSource ? undefined : item.availableVersion;
    const typeLabel = catalogTypeLabel(packageIntentCategory(item), locale);
    const tags = <>{development ? <Tag tone="quiet">{isZh ? "开发版" : "Development"}</Tag> : null}{instanceCount > 1 ? <Tag tone="quiet">{isZh ? `${instanceCount} 份安装` : `${instanceCount} installations`}</Tag> : null}<CatalogRowFacts type={typeLabel} installedVersion={currentVersion} availableVersion={availableVersion} state={state} locale={locale} /></>;
    const rowConfigure = !softwareCanStart(item) && state === "update_available" ? configureAction(item) : null;
    return { id: item.packageId, title: name, icon: <SoftwareArtwork identity={item.packageId} label={name} kind={item.softwareType} iconUrl={item.iconUrl} privateAsset={item.access?.visibility === "authorized_only"} />,
      description: <span className="opl-catalog-row-description">{localizedPackageDescription(item, locale)}</span>, tags,
      status: <CatalogState state={operationFor(item) ? 'unknown' : state} locale={locale} label={operationFor(item)
        ? props.operationsReadError ? (isZh ? '进度待确认' : 'Progress unavailable') : packageStagePresentation(operationFor(item)!, locale).label : packageCatalogStatusLabel(item, locale)} />,
      actions: <span className="opl-catalog-row-actions">{props.onUseSoftware && softwareCanStart(item) && !operationFor(item) ? <>{useAction(item)}{state === "update_available" ? buttons(item) : null}</> : rowConfigure ? <>{rowConfigure}{buttons(item)}</> : buttons(item)}</span>, detailActions: <>{useAction(item)}{toggle(item)}{installAuthorizationRequired ? manageSourcesAction() : null}</>,
      detail: <>
        <section className="opl-dsh-owner-section"><h4>{isZh ? "当前使用" : "Currently in use"}</h4>
          <dl><div><dt>{isZh ? "软件 ID" : "Software ID"}</dt><dd><code>{item.packageId}</code></dd></div><div><dt>{isZh ? "类型" : "Type"}</dt><dd>{typeLabel}</dd></div><div><dt>{isZh ? "当前版本" : "Current version"}</dt><dd>{currentVersion}{development ? ` · ${isZh ? "开发版" : "Development"}` : ""}</dd></div>{item.activeInstallationStatus ? <div><dt>{isZh ? "激活状态" : "Activation"}</dt><dd>{softwareActivationLabel(item.activeInstallationStatus, locale)}</dd></div> : null}<div><dt>{isZh ? "可用版本" : "Available version"}</dt><dd>{availableVersion ?? "—"}</dd></div><div><dt>{isZh ? "更新状态" : "Update status"}</dt><dd>{formatStatus(update, locale)}</dd></div></dl>
          {missingInstallSource ? <p>{isZh
            ? "软件源暂未提供可验证的安装文件。"
            : "The software source has not provided verified installation files."}</p> : null}
          {!availableVersion && !missingInstallSource && !installAuthorizationRequired ? <p>{item.catalogOrigin === "external" && item.catalogSource?.manager === "codex_plugin_manager" ? (isZh ? "此扩展由 Codex 维护；平台未提供单独的可用版本。" : "Codex maintains this extension and has not provided a separate available version.") : (isZh ? "软件源尚未提供可验证的安装目标，可在软件源中检查。" : "The source has not provided a verified installation target. Check its software source.")}</p> : null}
          {item.catalogScope !== "software" && !missingInstallSource && !installAuthorizationRequired ? <p>{item.catalogScope === "host_component" ? (isZh ? "此组件随所属软件维护。" : "This component is maintained with its parent software.") : (isZh ? "所属服务尚未提供软件分类。" : "The owner has not provided a software classification.")}</p> : null}
          {installAuthorizationRequired ? <p data-testid="opl-package-access-gate">{isZh ? "连接有安装权限的软件源账号后即可安装。" : "Connect a source account with installation access to install this software."}</p> : null}
          {item.access?.visibility === "authorized_only" && packageAccessNeedsAttention(item) ? <p data-testid="opl-package-access-gate">{item.access.status === "signed_out" ? (isZh ? "连接软件源账号以检查更新。" : "Connect the source account to check for updates.") : item.access.reason ?? packageAccessStatusLabel(item.access, locale)}</p> : null}
          {item.requiredByPackageIds?.length ? <p>{isZh ? `此能力仍被 ${item.requiredByPackageIds.join("、")} 使用；卸载或停用前请先处理这些依赖。` : `Required by ${item.requiredByPackageIds.join(", ")}; resolve dependents before uninstalling or disabling it.`}</p> : null}
        </section>
        {item.installations !== undefined ? <SoftwareInstallations installations={item.installations} packageId={item.packageId} productActions={item.installationActions} activeId={item.activeInstallationId} activationStatus={item.activeInstallationStatus} locale={locale} actionBusyKey={operationFor(item) ? "package-operation:running" : actionBusyKey} onAction={onAction} onOpenLocation={props.onOpenInstallationLocation} onUpdates={props.onTabChange ? () => props.onTabChange?.("updates") : undefined} /> : item.localInstallations?.length ? <section className="opl-dsh-owner-section"><h4>{isZh ? "本机安装" : "Installations on this device"}</h4>{item.localInstallations.map(installation => <dl key={installation.installationId} data-testid="opl-local-installation"><div><dt>{isZh ? "版本" : "Version"}</dt><dd>{installation.version} · {installation.mode === "development" ? (isZh ? "开发版" : "Development") : (isZh ? "发布版" : "Release")}</dd></div><div><dt>{isZh ? "位置引用" : "Location reference"}</dt><dd><code>{installation.locationRef}</code></dd></div><div><dt>{isZh ? "管理方式" : "Managed by"}</dt><dd>{catalogManagerLabel(installation.manager, locale)}</dd></div></dl>)}<p>{isZh ? "安装器尚未提供激活状态和完整路径，请更新基座后重新读取。" : "The installer has not provided active state and the full path. Update the foundation and refresh."}</p></section> : null}
        {item.installationManagementReason === "installation_helper_update_required" ? <section className="opl-dsh-owner-section"><p>{isZh ? "更新此软件的 OPL 集成后，可在这里管理桌面安装。现有安装位置与版本仍可查看。" : "Update this software's OPL integration to manage desktop installations here. Existing locations and versions remain visible."}{buttons(item)}</p></section> : null}
        <section className="opl-dsh-owner-section"><h4>{isZh ? "软件来源" : "Software source"}</h4><dl><div><dt>{isZh ? "维护者" : "Publisher"}</dt><dd>{item.publisher}</dd></div><div><dt>{isZh ? "软件源" : "Source"}</dt><dd>{item.catalogSource?.marketplaceId ?? (item.catalogOrigin === "opl" ? "OPL" : "—")}{item.catalogSource?.delivery === "host_bundled" ? (isZh ? " · Codex 随附" : " · Bundled with Codex") : ""}</dd></div><div><dt>{isZh ? "安装器" : "Installer"}</dt><dd>{catalogManagerLabel(item.catalogSource?.manager, locale)}</dd></div></dl>{installAuthorizationRequired ? null : item.installations === undefined ? buttons(item, true) : item.installed === false ? buttons(item) : !hasPerInstallationActions ? buttons(item, true) : null}</section>
        {item.catalogScope !== "host_component" ? <section className="opl-dsh-owner-section"><h4>{isZh ? "资料与账户授权" : "Libraries & account access"}</h4>
          {model.applicationManagement?.sharedResources.filter(resource => resource.resourceKind === "connection" && resource.consumerPackageIds.includes(item.packageId)).map(resource => <p key={resource.resourceId}>{resource.labelI18n?.[locale] ?? resource.label}</p>)}
          {model.knowledgeSources?.entries.filter(source => source.connected !== false && source.consumerPackageIds.includes(item.packageId)).map(source => <p key={source.resourceId}>{model.knowledgeSources ? knowledgeLibraryLabel(source, model.knowledgeSources, locale) : source.label} · {model.knowledgeSources?.consumers.some(consumer => consumer.packageId === item.packageId && source.writeDomainIds.includes(consumer.domainId)) ? (isZh ? "可提议修改" : "Can propose changes") : (isZh ? "只读" : "Read only")}</p>)}
          <p>{isZh ? "复用已有资料库与账户，并为此软件单独授权。" : "Reuse existing libraries and accounts with access granted to this software."}</p>
          {props.onConfigureSoftware ? <Button size="sm" variant="outline" onClick={() => props.onConfigureSoftware?.(item.packageId)}>{isZh ? "去资料与连接设置" : "Open resource settings"}</Button> : null}
        </section> : null}
        <section className="opl-dsh-owner-section"><h4>{isZh ? "权限与运行方式" : "Permissions & runtime"}</h4>
          <ul>{packagePermissionsSummary(item, model, locale).map(line => <li key={line}>{line}</li>)}</ul>
        </section>
        {shortcuts(item)}
        {item.appEnabled && props.onOpenSettings ? (["models", "resources", "workspace", "capabilities", "services", "preferences"] as const).filter(destination => settingsEntriesForNativeAppSurface(model.uiContributions.entries.filter(entry => entry.packageId === item.packageId), destination, settings.developerDetails).length > 0).map(destination => <section key={destination} className="opl-dsh-owner-section"><Button size="sm" variant="outline" onClick={() => props.onOpenSettings?.(destination, { packageId: item.packageId, ...(destination === "resources" ? { section: "remote" } : {}) })}>{destination === 'resources' ? (isZh ? '配置远程连接' : 'Configure remote connection') : destination === 'services' ? (isZh ? '打开服务状态' : 'Open service status') : (isZh ? '配置扩展参数' : 'Configure extension')}</Button></section>) : null}
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
    return { id: productId, title: name, icon: <SoftwareArtwork identity={productId} label={name} kind={item.kind === "formula" ? "cli" : "application"} iconUrl={item.iconUrl} />,
      description: <span className="opl-catalog-row-description">{item.descriptionI18n?.[locale] || item.description || (isZh ? "尚未提供软件说明。" : "No software description provided.")}</span>,
      tags: <><CatalogRowFacts type={isZh ? "应用" : "Application"} installedVersion={version ?? "—"} availableVersion={nativeCatalogAvailableVersion(product, locale)} state={nativeCatalogState(item)} locale={locale} />{development ? <Tag tone="quiet">{isZh ? "开发版" : "Development"}</Tag> : null}{installations.length > 1 ? <Tag tone="quiet">{isZh ? `${installations.length} 份安装` : `${installations.length} installations`}</Tag> : null}</>,
      actions: <span className="opl-catalog-row-actions">{ownerUpdate && current ? <Button size="sm" variant="primary" disabled={busy} onClick={() => onAction(installationActionRequest(current, ownerUpdate, locale))}>{installationActionLabel(ownerUpdate, locale)}</Button> : nativeButtons()}</span>,
      status: <CatalogState state={nativeCatalogState(item)} locale={locale} label={nativeCatalogStatusLabel(item, locale)} />,
      detail: <>
        <section className="opl-dsh-owner-section"><h4>{isZh ? "当前使用" : "Currently in use"}</h4><dl>
          <div><dt>{isZh ? "软件 ID" : "Software ID"}</dt><dd><code>{productId}</code></dd></div>
          <div><dt>{isZh ? "当前版本" : "Current version"}</dt><dd>{version ?? "—"}{development ? ` · ${isZh ? "开发版" : "Development"}` : ""}</dd></div>
          {item.activeInstallationStatus ? <div><dt>{isZh ? "激活状态" : "Activation"}</dt><dd>{softwareActivationLabel(item.activeInstallationStatus, locale)}</dd></div> : null}
          <div><dt>{isZh ? "可用版本" : "Available version"}</dt><dd>{nativeCatalogAvailableVersion(product, locale) ?? "—"}</dd></div>
          <div><dt>{isZh ? "更新状态" : "Update status"}</dt><dd>{nativeUpdateStatusLabel(item.updateStatus, locale)}</dd></div>
          {item.updateStatus === "needs_restart" && item.pendingVersion ? <div><dt>{isZh ? "待启用版本" : "Staged version"}</dt><dd>{item.pendingVersion}</dd></div> : null}
        </dl>{item.updateStatus === "needs_restart" ? <p>{isZh ? "更新已暂存，重启应用后生效。" : "The update is staged and will take effect after restarting the app."}</p> : !nativeCatalogAvailableVersion(product, locale) ? <p>{isZh ? "软件源尚未提供推荐的安装目标，请检查软件源。" : "The source has not provided a recommended installation target. Check its software source."}</p> : null}</section>
        {installations.length ? <SoftwareInstallations installations={installations} activeId={item.activeInstallationId} activationStatus={item.activeInstallationStatus} locale={locale} actionBusyKey={actionBusyKey} onAction={onAction} onOpenLocation={props.onOpenInstallationLocation} onUpdates={props.onTabChange ? () => props.onTabChange?.("updates") : undefined} /> : item.installed ? <section className="opl-dsh-owner-section"><h4>{isZh ? "本机安装" : "Installations on this device"}</h4><dl><div><dt>{isZh ? "安装方式" : "Installation method"}</dt><dd>{nativeInstallationLabel(item, locale)}</dd></div><div><dt>{isZh ? "管理方式" : "Managed by"}</dt><dd>{catalogManagerLabel(item.installationOwner, locale)}</dd></div>{item.location ? <div><dt>{isZh ? "安装位置" : "Location"}</dt><dd><code>{item.location}</code></dd></div> : null}</dl>{nativeButtons(true)}{item.ownerSettingsRoute === "updates" && props.onTabChange ? <Button size="sm" variant="outline" onClick={() => props.onTabChange?.("updates")}>{isZh ? "管理此安装" : "Manage installation"}</Button> : null}</section> : null}
        <SoftwareReleaseOptions product={product} locale={locale} actionBusyKey={actionBusyKey} onAction={onAction} />
        {settings.developerDetails ? <section className="opl-dsh-owner-section"><h4>{isZh ? "技术详情" : "Technical details"}</h4><dl>{item.installedDisplayVersion && item.installedVersion !== item.installedDisplayVersion ? <div><dt>{isZh ? "机器版本" : "Machine version"}</dt><dd>{item.installedVersion}</dd></div> : null}{item.installedBuildId ? <div><dt>{isZh ? "构建 ID" : "Build ID"}</dt><dd><code>{item.installedBuildId}</code></dd></div> : null}</dl></section> : null}
      </>,
    };
  };
  // A plugin's exported skills belong to its package. Only independent Skill files are listed here.
  const looseSkills = scope === "external" && kind === "all" ? (props.capabilityCatalog?.skills ?? []).filter(skill => !isPluginSkill(skill)) : [];
  const skillItem = (skill: CodexSkillCapability): PluginManagerOwnerItem => ({
    id: `codex-skill:${skill.path || skill.name}`, title: skill.name, icon: <SoftwareArtwork identity={skill.path || skill.name} label={skill.name} kind="skill" />,
    description: <span className="opl-catalog-row-description">{skill.description}</span>,
    tags: <Tag tone="quiet">Skill</Tag>,
    status: <CatalogState state="installed" locale={locale} />,
    actions: <span className="opl-catalog-row-actions" />,
    detail: <section className="opl-dsh-owner-section"><h4>{isZh ? "Codex Skill" : "Codex Skill"}</h4><p>{isZh ? "独立技能由 Codex 读取，不使用 OPL 软件发布版本。" : "Codex reads this independent skill. It does not use OPL software release versions."}</p><dl><div><dt>{isZh ? "安装器" : "Manager"}</dt><dd>Codex</dd></div><div><dt>{isZh ? "使用范围" : "Scope"}</dt><dd>{skill.scope}</dd></div><div><dt>{isZh ? "启用状态" : "Enabled"}</dt><dd>{skill.enabled ? (isZh ? "已启用" : "Enabled") : (isZh ? "已停用" : "Disabled")}</dd></div><div><dt>{isZh ? "文件位置" : "File location"}</dt><dd><code>{skill.path}</code></dd></div></dl>{props.onOpenSettings ? <Button variant="outline" size="sm" onClick={() => props.onOpenSettings?.("capabilities")}>{isZh ? "打开 Codex 能力设置" : "Open Codex capability settings"}</Button> : null}</section>
  });
  const skillItems = looseSkills.filter(skill => (typeFilter === "all" || typeFilter === "skill") && matchesState("installed") && (!query.trim() || `${skill.name} ${skill.description}`.toLowerCase().includes(query.trim().toLowerCase()))).map(skillItem);
  const runtimeItems: PluginManagerOwnerItem[] = [];
  const systemTools: PluginManagerOwnerItem[] = [];
  if (scope === "components" && kind === "all") {
    for (const component of props.managedUpdate?.components ?? []) {
      for (const dependency of component.runtimeDependencies ?? []) {
        const systemTool = dependency.dependencyKind === "external_cli";
        if (systemTool && dependency.installed !== true) continue;
        const name = managedDependencyLabel(dependency.dependencyId, locale);
        if (query.trim() && !`${name} ${dependency.dependencyId} ${component.label}`.toLowerCase().includes(query.trim().toLowerCase())) continue;
        const { state, label } = runtimeDependencyStatus(dependency, locale);
        if (!matchesState(state)) continue;
        const type = systemTool ? (isZh ? "本机工具" : "Local tool") : (isZh ? "内置组件" : "Built-in runtime");
        const installedVersion = managedDependencyVersionSummary(dependency.version);
        const availableVersion = managedDependencyVersionSummary(dependency.latestVersion);
        const summary = managedDependencySummary(dependency, locale);
        const missingPackages = managedDependencyMissingPackages(dependency.version);
        const row: PluginManagerOwnerItem = {
          id: `runtime:${component.componentId}:${dependency.dependencyId}`, title: name,
          icon: <SoftwareArtwork identity={dependency.dependencyId} label={name} kind="runtime" />,
          description: <span className="opl-catalog-row-description">{summary}</span>,
          tags: <CatalogRowFacts type={type} installedVersion={installedVersion} availableVersion={availableVersion} state={state} locale={locale} />,
          status: <CatalogState state={state} locale={locale} label={label} />,
          actions: props.onTabChange && ["attention", "update_available", "not_installed"].includes(state)
            ? <Button size="sm" variant="outline" onClick={() => props.onTabChange?.("updates")}>{isZh ? "查看更新与维护" : "View updates and maintenance"}</Button> : null,
          detail: <section className="opl-dsh-owner-section"><h4>{type}</h4><dl>
            {!systemTool ? <div><dt>{isZh ? "所属组件" : "Parent component"}</dt><dd>{component.label}</dd></div> : null}
            <div><dt>{isZh ? "维护方" : "Maintained by"}</dt><dd>{catalogManagerLabel(dependency.ownership ?? component.lifecycleOwner, locale)}</dd></div>
            <div><dt>{isZh ? "当前版本" : "In use"}</dt><dd>{managedDependencyVersion(dependency.version, locale)}</dd></div>
            <div><dt>{isZh ? "状态" : "Status"}</dt><dd>{label ?? catalogStateLabel(state, locale)}</dd></div>
            {missingPackages.length ? <div><dt>{isZh ? "缺失子包" : "Missing packages"}</dt><dd><code>{missingPackages.join(", ")}</code></dd></div> : null}
            {dependency.binaryPath ? <div><dt>{isZh ? "安装位置" : "Location"}</dt><dd><code>{dependency.binaryPath}</code></dd></div> : null}
          </dl>{dependency.note ? <p>{dependency.note}</p> : null}<p>{summary}</p>
          </section>
        };
        (systemTool ? systemTools : runtimeItems).push(row);
      }
    }
  }
  const sortItems = (items: PluginManagerOwnerItem[]) => items.sort((a, b) => a.title.localeCompare(b.title, isZh ? "zh-CN" : "en"));

  const dshEntryState = (entry: DshPluginCatalogEntry): SoftwareCatalogState => {
    if (entry.startupFailed || entry.pendingRestart || entry.pendingOperation) return "attention";
    if (entry.updateAvailable) return "update_available";
    return entry.installed ? "installed" : "not_installed";
  };

  const dshPluginItem = (entry: DshPluginCatalogEntry): PluginManagerOwnerItem => {
    const state = dshEntryState(entry);
    const title = entry.labelI18n[locale] ?? entry.pluginId;
    const description = entry.descriptionI18n[locale] ?? "";
    const entryBusy = busy || dshBusyId === entry.pluginId;
    const restarting = dshRestartingId === entry.pluginId;
    const canManage = Boolean(dshBridge?.manageDshPlugin || (entry.pluginId === "billion-context" && dshBridge?.manageBillionContext));
    const canToggle = entry.canToggle && Boolean(dshBridge?.manageDshPlugin || (entry.pluginId === "billion-context" && dshBridge?.setBillionContext));
    const pendingRestart = entry.pendingRestart || Boolean(entry.pendingOperation);
    const category = dshIntentCategory(entry.intentCategory);
    const typeLabel = catalogTypeLabel(category, locale);
    const statusLabel = entry.startupFailed
      ? (isZh ? "启动异常" : "Startup issue")
      : pendingRestart
        ? (isZh ? "待重启生效" : "Restart required")
        : entry.installed && !entry.enabled && !entry.updateAvailable
          ? (isZh ? "已停用" : "Disabled")
          : undefined;

    const rowAction = entry.tier === "core_runtime"
      ? (entry.updateAvailable && props.onTabChange
        ? <Button size="sm" variant="primary" onClick={() => props.onTabChange?.("updates")}>{isZh ? "去更新" : "Update"}</Button>
        : <Button size="sm" variant="outline" onClick={() => navigation.actions.setView({ kind: "item", id: entry.pluginId })}>{isZh ? "查看详情" : "Details"}</Button>)
      : !entry.installed && entry.canInstall && canManage
        ? <Button size="sm" variant="primary" disabled={entryBusy} onClick={() => setDshPendingConfirm({ entry, operation: "install" })}>{entryBusy ? (isZh ? "安装中…" : "Installing…") : (isZh ? "安装" : "Install")}</Button>
        : pendingRestart && dshBridge?.restartNativeApp
          ? <Button size="sm" variant="primary" disabled={entryBusy || restarting} onClick={() => void restartForDshPlugin(entry.pluginId)}>{restarting ? (isZh ? "正在重启…" : "Restarting…") : (isZh ? "重启应用生效" : "Restart to apply")}</Button>
          : entry.updateAvailable && canManage
            ? <Button size="sm" variant="primary" disabled={entryBusy} onClick={() => setDshPendingConfirm({ entry, operation: "update" })}>{entryBusy ? (isZh ? "更新中…" : "Updating…") : (isZh ? "更新" : "Update")}</Button>
            : entry.enabled && entry.settingsDestination && props.onOpenSettings
              ? <Button size="sm" variant="primary" disabled={entryBusy} onClick={() => props.onOpenSettings?.(entry.settingsDestination!, { packageId: entry.pluginId, ...(category === "channel" && entry.settingsDestination === "resources" ? { section: "remote" } : {}) })}>{isZh ? "配置" : "Configure"}</Button>
              : !entry.enabled && canToggle
                ? <Button size="sm" variant="outline" disabled={entryBusy} onClick={() => void runDshPluginAction(entry.pluginId, "enable", entry.packageName)}>{isZh ? "启用" : "Enable"}</Button>
                : <Button size="sm" variant="outline" disabled={entryBusy} onClick={() => navigation.actions.setView({ kind: "item", id: entry.pluginId })}>{isZh ? "查看详情" : "Details"}</Button>;

    const restartNoteForMutate = Boolean(entry.requiresRestartOnMutate ?? (entry.active && entry.tier === "external_plugin"));
    return {
      id: entry.pluginId,
      title,
      icon: <SoftwareArtwork identity={entry.pluginId} label={title} kind={category} />,
      description: <span className="opl-catalog-row-description">{description}</span>,
      tags: <CatalogRowFacts type={typeLabel} installedVersion={entry.version ?? undefined} availableVersion={entry.pendingVersion ?? entry.availableVersion ?? undefined} state={state} locale={locale} />,
      status: <CatalogState state={state} locale={locale} label={statusLabel} />,
      actions: <span className="opl-catalog-row-actions">{rowAction}</span>,
      detailActions: entry.installed && canToggle
        ? <Switch checked={entry.enabled} disabled={entryBusy} label={isZh ? `在 OPL App 中启用 ${title}` : `Enable ${title} in OPL App`} onChange={next => void runDshPluginAction(entry.pluginId, next ? "enable" : "disable", entry.packageName)} />
        : undefined,
      detail: <>
        <section className="opl-dsh-owner-section">
          <h4>{title}</h4>
          <p>{description}{entry.upstreamUrl ? <> <a href={entry.upstreamUrl} target="_blank" rel="noreferrer">{isZh ? "上游项目" : "Upstream project"}</a></> : null}</p>
          {dshError && <p role="alert">{dshError}</p>}
          <dl>
            <div><dt>{isZh ? "插件 ID" : "Plugin ID"}</dt><dd><code>{entry.pluginId}</code></dd></div>
            <div><dt>{isZh ? "包名" : "Package"}</dt><dd><code>{entry.packageName}</code></dd></div>
            <div><dt>{isZh ? "来源" : "Source"}</dt><dd>{entry.sourceLabel ?? (entry.origin === "opl" ? "OPL" : "npm")}</dd></div>
            <div><dt>{isZh ? "安装方式" : "Installation method"}</dt><dd>{entry.tier === "external_plugin" ? "DSH / npm" : (isZh ? "内置 DSH 插件" : "Built-in DSH plugin")}</dd></div>
            <div><dt>{isZh ? "当前版本" : "Current version"}</dt><dd>{entry.version ?? "—"}</dd></div>
            {entry.activeVersion ? <div><dt>{isZh ? "运行版本" : "Running version"}</dt><dd>{entry.activeVersion}</dd></div> : null}
            <div><dt>{isZh ? "可用版本" : "Available version"}</dt><dd>{entry.availableVersion ?? "—"}</dd></div>
          </dl>
          {pendingRestart ? <div className="opl-software-continuation">
            <p role="status">{entry.pendingOperation === "update"
              ? (isZh ? `已暂存更新至 ${entry.pendingVersion}，重启应用即可一步完成升级。` : `Update to ${entry.pendingVersion} is staged and applies in a single restart.`)
              : entry.pendingOperation === "remove"
                ? (isZh ? "已暂存卸载请求，重启应用后自动完成清理。" : "Removal is staged and completes automatically after restart.")
                : (isZh ? "状态变更已保存，重启应用后生效。" : "Changes are saved and apply after restarting the app.")}</p>
            {typeof dshBridge?.restartNativeApp === "function" ? <Button size="sm" variant="primary" disabled={entryBusy || restarting} onClick={() => void restartForDshPlugin(entry.pluginId)}>{restarting ? (isZh ? "正在重启…" : "Restarting…") : (isZh ? "立即重启应用" : "Restart app now")}</Button> : null}
            {entry.pendingOperation && entry.canCancelPending !== false && canManage ? <Button size="sm" variant="outline" disabled={entryBusy} onClick={() => void runDshPluginAction(entry.pluginId, "cancel_pending", entry.packageName)}>{isZh ? "取消待生效变更" : "Cancel staged change"}</Button> : null}
          </div> : null}
          {entry.installed && entry.tier !== "core_runtime" ? <div className="opl-dsh-plugin-actions">
            {canToggle ? <Button size="sm" disabled={entryBusy} onClick={() => void runDshPluginAction(entry.pluginId, entry.enabled ? "disable" : "enable", entry.packageName)}>{entry.enabled ? (isZh ? "停用" : "Disable") : (isZh ? "启用" : "Enable")}</Button> : null}
            {canManage ? <Button size="sm" variant="outline" disabled={entryBusy} onClick={() => void runDshPluginAction(entry.pluginId, "check", entry.packageName)}>{isZh ? "检查更新" : "Check for updates"}</Button> : null}
            {entry.updateAvailable && canManage ? <Button size="sm" variant="primary" disabled={entryBusy} onClick={() => setDshPendingConfirm({ entry, operation: "update" })}>{restartNoteForMutate ? (isZh ? "更新（重启后生效）" : "Update (applies on restart)") : (isZh ? "更新" : "Update")}</Button> : null}
            {entry.canUninstall && canManage ? <Button size="sm" variant="outline" disabled={entryBusy} onClick={() => setDshPendingConfirm({ entry, operation: "remove" })}>{restartNoteForMutate ? (isZh ? "卸载（重启后生效）" : "Uninstall (applies on restart)") : (isZh ? "卸载" : "Uninstall")}</Button> : null}
            {entry.enabled && entry.settingsDestination && props.onOpenSettings ? <Button size="sm" variant="outline" disabled={entryBusy} onClick={() => props.onOpenSettings?.(entry.settingsDestination!, { packageId: entry.pluginId, ...(category === "channel" && entry.settingsDestination === "resources" ? { section: "remote" } : {}) })}>{isZh ? "打开设置" : "Open settings"}</Button> : null}
          </div> : !entry.installed && entry.canInstall && canManage ? <Button size="sm" variant="primary" disabled={entryBusy} onClick={() => setDshPendingConfirm({ entry, operation: "install" })}>{entryBusy ? (isZh ? "安装中…" : "Installing…") : (isZh ? "安装" : "Install")}</Button> : null}
        </section>
        <section className="opl-dsh-owner-section"><h4>{isZh ? "权限与运行方式" : "Permissions & runtime"}</h4>
          <ul>{entry.permissionsI18n[locale].map(line => <li key={line}>{line}</li>)}</ul>
        </section>
      </>
    };
  };

  const dshCatalogEntries = kind === "all" ? (dshCatalog?.entries ?? []) : [];
  const dshMatches = (entry: DshPluginCatalogEntry) => {
    const state = dshEntryState(entry);
    if (!matchesState(state)) return false;
    const text = `${entry.pluginId} ${entry.packageName} ${entry.labelI18n.zh} ${entry.labelI18n.en} ${entry.descriptionI18n.zh} ${entry.descriptionI18n.en}`.toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  };
  const visibleOptionalAndExternalDsh = dshCatalogEntries
    .filter(entry => entry.tier !== "core_runtime" && dshIntentCategory(entry.intentCategory) !== "dependency")
    .filter(entry => scope === "all" || scope === entry.origin)
    .filter(entry => typeFilter === "all" || dshIntentCategory(entry.intentCategory) === typeFilter)
    .filter(dshMatches);
  const visibleCoreRuntimeDsh = scope === "components"
    ? dshCatalogEntries.filter(entry => (entry.tier === "core_runtime" || dshIntentCategory(entry.intentCategory) === "dependency") && dshMatches(entry)).map(dshPluginItem)
    : [];
  const softwareItems: Array<{ category: SoftwareProductType; item: PluginManagerOwnerItem }> = [
    ...(scope === "components" ? [] : visible.map(entry => ({ category: packageIntentCategory(entry), item: packageItem(entry) }))),
    ...visibleNative.map(entry => ({ category: "application" as const, item: nativeItem(entry) })),
    ...visibleOptionalAndExternalDsh.map(entry => ({ category: dshIntentCategory(entry.intentCategory), item: dshPluginItem(entry) }))
  ];
  const groups = scope === "components"
    ? [
        { id: "runtime-components", label: isZh ? "软件运行组件" : "Software runtime dependencies", items: sortItems([...visible.map(packageItem), ...runtimeItems]) },
        { id: "dsh-core-runtime", label: isZh ? "OPL 内置运行组件" : "OPL built-in runtime", items: sortItems(visibleCoreRuntimeDsh) },
        { id: "system-tools", label: isZh ? "本机已检测的外部工具" : "Detected local tools", items: sortItems(systemTools) }
      ]
    : [
        ...visibleSoftwareTypes.map(category => ({
          id: category,
          label: intentCategoryLabel(category, locale),
          items: sortItems(softwareItems.filter(entry => entry.category === category).map(entry => entry.item))
        })),
        { id: "independent-skills", label: isZh ? "独立技能" : "Independent skills", items: sortItems(skillItems) }
      ];
  const visibleGroups = groups.filter(group => group.items.length > 0);
  const dict = isZh ? zh : en;
  const translate = ((key: PluginManagerLocaleKey | "back", values?: Record<string, string>) => (key === "crumbRoot" ? isZh ? "软件目录" : "Software catalog" : key === "backToList" || key === "back" ? isZh ? "返回软件目录" : "Back to software catalog" : dict[key as PluginManagerLocaleKey]).replace(/\{([^}]+)\}/g, (_, value: string) => values?.[value] ?? `{${value}}`)) as PluginManagerOwnerPageProps["t"];
  const manifestEnabled = Boolean(props.manifestInstallAction?.dryRunSupported && props.manifestInstallAction.confirmationRequired && props.manifestInstallAction.payloadFields.includes("manifest_url") && props.manifestInstallAction.payloadFields.includes("trust_tier"));
  const openNpmPluginSupported = Boolean(dshBridge?.manageDshPlugin);
  const changeScope = (value: string) => { setScope(value as SoftwareCatalogScope); setTypeFilter("all"); setStatusFilter("all"); };
  const scopeNote = scope === "all" || scope === "opl" ? null
    : scope === "external" ? (isZh ? "第三方扩展与软件沿用同一目录、权限预检与更新流程。" : "Third-party extensions and software share the same catalog, permissions review, and update flow.")
      : (isZh ? "底层运行组件随 OPL 基座或原安装器自动维护，无需手动单独安装。" : "Runtime dependencies are maintained with OPL Base or their original installers; no manual setup required.");
  const filters = <search className="opl-catalog-controls" aria-label={isZh ? "软件目录筛选" : "Filter software catalog"}>
    <div className="opl-catalog-scope"><div className="opl-catalog-scope-options" role="group" aria-label={isZh ? "软件来源" : "Software origin"}>{[{ value: "all", label: isZh ? "全部软件" : "All software" }, { value: "opl", label: isZh ? "OPL 软件" : "OPL software" }, { value: "external", label: isZh ? "其他来源" : "Other sources" }, { value: "components", label: isZh ? "运行组件" : "Runtime components" }].map(option => <Button key={option.value} id={`opl-catalog-scope-${option.value}`} size="sm" variant="outline" aria-pressed={scope === option.value} onClick={() => changeScope(option.value)}>{option.label}</Button>)}</div>{scopeNote ? <p>{scopeNote}</p> : null}</div>
    <div className="opl-dsh-owner-filters"><Input type="search" aria-label={isZh ? "搜索软件、名称或来源" : "Search software, name or source"} value={query} placeholder={isZh ? "搜索软件或插件" : "Search software or plugins"} onChange={event => setQuery(event.target.value)} />
      {scope !== "components" ? <select aria-label={isZh ? "按类型筛选" : "Filter by type"} value={typeFilter} onChange={event => setTypeFilter(event.currentTarget.value)}><option value="all">{isZh ? "全部类型" : "All types"}</option>{visibleSoftwareTypes.map(category => <option key={category} value={category}>{intentCategoryLabel(category, locale)}</option>)}{scope === "external" ? <option value="skill">{isZh ? "独立技能" : "Independent Skills"}</option> : null}</select> : null}
      <select aria-label={isZh ? "按状态筛选" : "Filter by status"} value={statusFilter} onChange={event => setStatusFilter(event.currentTarget.value)}><option value="all">{isZh ? "全部状态" : "All statuses"}</option>{(["installed", "update_available", "not_installed", "attention", "unknown"] as const).map(state => <option key={state} value={state}>{catalogStateLabel(state, locale)}</option>)}</select>
    </div>
    {scope === "external" ? <div className="opl-catalog-external-status"><span>{props.capabilityStatus === "loading" ? (isZh ? "正在读取独立技能…" : "Reading independent Skills…") : props.capabilityStatus === "error" ? (props.capabilityError || (isZh ? "读取失败，请重试。" : "Could not load external extensions. Try again.")) : props.capabilityStatus === "ready" ? (isZh ? `已读取 ${softwareItems.length} 项第三方扩展与软件 · ${looseSkills.length} 项独立技能` : `${softwareItems.length} third-party items · ${looseSkills.length} independent Skills`) : (isZh ? "按需安装或检查第三方扩展。" : "Install or inspect third-party extensions on demand.")}</span>{props.onRefreshCapabilities ? <Button size="sm" variant="outline" disabled={props.capabilityStatus === "loading"} onClick={props.onRefreshCapabilities}>{isZh ? "刷新列表" : "Refresh"}</Button> : null}{openNpmPluginSupported ? <Button size="sm" variant="outline" data-testid="opl-open-dsh-install-trigger" disabled={busy || dshBusyId !== null} onClick={() => setOpenPluginModalOpen(true)}>{isZh ? "按包名安装插件…" : "Install plugin by name…"}</Button> : null}<Button size="sm" variant="outline" disabled={busy} onClick={() => setInstallOpen(true)}>{isZh ? "从清单导入" : "Import manifest"}</Button></div> : null}
  </search>;
  return <div className="opl-dsh-plugin-manager opl-software-center" data-testid="opl-settings-agent-catalog" data-catalog-scope={scope}>
    <PluginManagerOwnerPage t={translate} title={props.pageTitle ?? (isZh ? "软件目录" : "Software catalog")} intro={props.pageIntro ?? (isZh ? "按需安装、组合与更新软件和插件" : "Install, compose, and update software and plugins")} installedLabel={isZh ? "软件" : "Software"} groups={visibleGroups} tabs={props.contributedTabs} selectedTab={props.selectedTab} onTabChange={props.onTabChange} onRefresh={props.onRefresh}
      useStore={useStore} actions={navigation.actions} createHeaderRef={typeof ResizeObserver === "undefined" ? () => noop : createPluginHeaderRef} headerStatus={<>{props.headerStatus}{(props.selectedTab ?? "installed") === "installed" ? filters : null}</>}
      toolbar={<>{openNpmPluginSupported ? <Button variant="outline" size="sm" data-testid="opl-toolbar-open-dsh-install" disabled={busy || dshBusyId !== null} onClick={() => setOpenPluginModalOpen(true)}>{isZh ? "安装扩展包…" : "Install extension…"}</Button> : null}{props.onTabChange ? <Button variant="outline" size="sm" onClick={() => props.onTabChange?.("sources")}>{isZh ? "管理软件源" : "Manage sources"}</Button> : null}{model.officialProfileRestore ? <details className="opl-catalog-more"><summary>{isZh ? "更多" : "More"}</summary><div className="opl-catalog-more-menu"><Button variant="outline" size="sm" data-testid="settings-agents-restore-official-profile" disabled={busy} onClick={() => onAction({ key: "official-profile:restore", actionId: model.officialProfileRestore!.id, label: isZh ? "恢复官方组合" : "Restore official combination", payload: { intent: "explicit_restore" }, confirmationRequired: true, dryRunSupported: model.officialProfileRestore!.dryRunSupported })}>{isZh ? "恢复官方组合" : "Restore official combination"}</Button></div></details> : null}</>} empty={<p>{props.stateStatus === "loading" ? (isZh ? "正在读取软件目录…" : "Reading the software catalog…") : (isZh ? scope === "components" ? "当前没有单独列出的运行组件。" : "没有符合条件的软件。请调整筛选或刷新目录。" : scope === "components" ? "No runtime components are listed separately." : "No matching software. Adjust filters or refresh the catalog.")}</p>} />
    {dshPendingConfirm ? <Modal open onClose={() => setDshPendingConfirm(null)} closeLabel={isZh ? "关闭" : "Close"} title={
      dshPendingConfirm.operation === "install"
        ? (isZh ? `确认安装 ${dshPendingConfirm.entry.labelI18n[locale] ?? dshPendingConfirm.entry.pluginId}` : `Confirm install ${dshPendingConfirm.entry.labelI18n[locale] ?? dshPendingConfirm.entry.pluginId}`)
        : dshPendingConfirm.operation === "update"
          ? (isZh ? `确认更新 ${dshPendingConfirm.entry.labelI18n[locale] ?? dshPendingConfirm.entry.pluginId}` : `Confirm update ${dshPendingConfirm.entry.labelI18n[locale] ?? dshPendingConfirm.entry.pluginId}`)
          : (isZh ? `确认卸载 ${dshPendingConfirm.entry.labelI18n[locale] ?? dshPendingConfirm.entry.pluginId}` : `Confirm uninstall ${dshPendingConfirm.entry.labelI18n[locale] ?? dshPendingConfirm.entry.pluginId}`)
    } description={
      dshPendingConfirm.entry.requiresRestartOnMutate
        ? (isZh ? "操作完成后需要重启 OPL App 生效，期间禁用第三方安装生命周期脚本（--ignore-scripts）。" : "Takes effect after restarting OPL App; package lifecycle scripts are disabled (--ignore-scripts).")
        : (isZh ? "操作由 OPL App 校验并写入插件配置目录，失败时可回退。" : "Verified and staged by OPL App with automatic boot fallback on startup issues.")
    } footer={<><Button variant="outline" onClick={() => setDshPendingConfirm(null)}>{isZh ? "取消" : "Cancel"}</Button><Button variant="primary" data-testid="opl-dsh-confirm-submit" disabled={dshBusyId !== null} onClick={() => {
      const pending = dshPendingConfirm;
      setDshPendingConfirm(null);
      void runDshPluginAction(pending.entry.pluginId, pending.operation, pending.entry.packageName);
    }}>{dshPendingConfirm.operation === "install" ? (isZh ? "确认安装" : "Confirm install") : dshPendingConfirm.operation === "update" ? (isZh ? "确认更新" : "Confirm update") : (isZh ? "确认卸载" : "Confirm uninstall")}</Button></>}>
      <div data-testid="opl-dsh-confirm-modal">
        <dl>
          <div><dt>{isZh ? "包名" : "Package"}</dt><dd><code>{dshPendingConfirm.entry.packageName}</code></dd></div>
          <div><dt>{isZh ? "来源" : "Source"}</dt><dd>{dshPendingConfirm.entry.sourceLabel ?? (dshPendingConfirm.entry.origin === "opl" ? "OPL" : "npm")}</dd></div>
          {dshPendingConfirm.entry.availableVersion ? <div><dt>{isZh ? "目标版本" : "Target version"}</dt><dd>{dshPendingConfirm.entry.availableVersion}</dd></div> : null}
        </dl>
        {dshPendingConfirm.entry.permissionsI18n[locale].length ? <><h4>{isZh ? "所需权限与运行说明" : "Permissions & runtime notes"}</h4><ul>{dshPendingConfirm.entry.permissionsI18n[locale].map(line => <li key={line}>{line}</li>)}</ul></> : null}
      </div>
    </Modal> : null}
    {openPluginModalOpen ? <Modal open onClose={() => setOpenPluginModalOpen(false)} closeLabel={isZh ? "关闭" : "Close"} title={isZh ? "安装 npm DSH 扩展包" : "Install npm DSH plugin"} description={isZh ? "输入公开 npm 包名（例如 @scope/dsh-plugin 或 community-dsh-plugin）。安装过程将校验 DSH 兼容声明与 Node 版本，并禁用脚本执行（--ignore-scripts）。" : "Enter a public npm package name. OPL validates its DSH manifest and engine compatibility and installs with --ignore-scripts."} footer={<><Button variant="outline" onClick={() => setOpenPluginModalOpen(false)}>{isZh ? "取消" : "Cancel"}</Button><Button variant="primary" data-testid="opl-open-dsh-install-submit" disabled={!openPluginPackageName.trim() || !openNpmPluginSupported || busy || dshBusyId !== null} onClick={() => {
      const pkg = openPluginPackageName.trim();
      setOpenPluginModalOpen(false);
      setOpenPluginPackageName("");
      void runDshPluginAction(pkg, "install", pkg);
    }}>{isZh ? "校验并安装" : "Verify & install"}</Button></>}>
      <div data-testid="opl-open-dsh-install-modal">
        <Input aria-label={isZh ? "npm 包名" : "npm package name"} placeholder="@scope/dsh-plugin" value={openPluginPackageName} onChange={event => setOpenPluginPackageName(event.target.value)} />
        {dshError ? <p role="alert">{dshError}</p> : null}
      </div>
    </Modal> : null}
    {installOpen ? <Modal open onClose={() => setInstallOpen(false)} title={isZh ? "添加软件" : "Add software"} closeLabel={isZh ? "关闭" : "Close"} description={isZh ? "提供软件清单，由软件包负责人检查后安装。" : "Provide a software manifest for its Package owner to verify and install."} footer={<><Button variant="outline" onClick={() => setInstallOpen(false)}>{isZh ? "取消" : "Cancel"}</Button><Button variant="primary" disabled={!manifestEnabled || !manifestUrl.trim() || busy} onClick={() => { if (props.manifestInstallAction) onAction({ key: "package:manifest-install", actionId: props.manifestInstallAction.actionId, label: isZh ? "从清单添加软件" : "Add software from manifest", payload: { manifest_url: manifestUrl.trim(), trust_tier: trustTier }, confirmationRequired: true, dryRunSupported: props.manifestInstallAction.dryRunSupported }); setInstallOpen(false); }}>{isZh ? "检查并安装" : "Check and install"}</Button></>}><Input aria-label={isZh ? "清单地址" : "Manifest URL"} value={manifestUrl} onChange={event => setManifestUrl(event.target.value)} /><SegmentedTabs size="sm" label={isZh ? "清单信任级别" : "Manifest trust"} value={trustTier} onChange={setTrustTier} items={[{ value: "third_party_unverified", label: isZh ? "尚未验证" : "Unverified", id: "opl-manifest-unverified", panelId: "opl-manifest-trust" }, { value: "third_party_verified", label: isZh ? "已验证" : "Verified", id: "opl-manifest-verified", panelId: "opl-manifest-trust" }]} />{!manifestEnabled ? <p>{isZh ? "当前 App 尚未提供清单安装通道。" : "Manifest installation is unavailable."}</p> : null}</Modal> : null}
  </div>;
}
