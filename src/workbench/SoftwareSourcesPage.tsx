import { Box, Check, ChevronDown, ExternalLink, KeyRound, Link2, LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import { useState } from "react";
import { catalogDisplayName, SoftwareCatalogIdentity, SoftwareCatalogVersions } from "./SoftwareCatalogMetadata";

import type { WorkbenchSettings } from "./settingsModel";
import type { CatalogOrigin, NativeSoftwareItemRef, SoftwareSourceActionRef, SoftwareSourceRef, SoftwareSourcesProjection } from "./workbenchModel-package-contracts";
import { actionPayloadComplete, type SettingsActionRequest } from "./settingsActions";
import { nativeSoftwareEntries, nativeSoftwareMatches, nativeCarrierInstalled, nativeInstallationLabel, softwareSourceActionLabel, softwareSourceStatusLabel, softwareSourceStatusTone } from "./softwareSources";

function sourceHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

function sourceDetail(source: SoftwareSourceRef, zh: boolean): string {
  if (source.enabled === false) return zh ? "此软件源已停用。重新连接后可检查和获取更新。" : "This source is disabled. Reconnect to check and download updates.";
  if (source.status === "signed_out") return zh ? "连接本机已登录的 GitHub 账户，显示你有权安装的软件。" : "Connect the GitHub account signed in on this device to discover software you can access.";
  if (source.status === "forbidden") return zh ? "账户已连接，但没有此软件源的访问权限。请向维护者申请权限后重新检查。" : "The connected account cannot access this source. Ask its maintainer for access, then check again.";
  if (source.status === "expired") return zh ? "账户授权已过期。重新登录 GitHub 后连接此软件源。" : "Account authorization has expired. Sign in to GitHub again and reconnect this source.";
  if (source.status === "revoked") return zh ? "访问授权已撤销。已安装软件仍保留在本机，新的下载和更新已暂停。" : "Access was revoked. Installed software remains on this device; new downloads and updates are paused.";
  if (source.status === "unknown") return zh ? "尚未确认此软件源的访问状态。检查后将显示最新结果。" : "Access to this source has not been verified. Check it to read its latest status.";
  return source.sourceKind === "tap"
    ? (zh ? "通过 Homebrew 获取和维护原生软件。软件仍在统一目录中展示。" : "Install and maintain native software through Homebrew. It remains part of the unified catalog.")
    : source.visibility === "authorized_only"
      ? (zh ? "账户已连接，软件安装权限逐项检查。有权访问的软件使用统一的安装和更新流程。" : "The account is connected. Installation access is checked for each item; accessible software uses the same installation and update flow.")
      : (zh ? "提供公开软件的安装与更新来源。" : "Provides installation and update sources for public software.");
}

function checkedAt(value: string | undefined, locale: WorkbenchSettings["locale"]): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

function nativeUpdateLabel(item: NativeSoftwareItemRef, zh: boolean): string {
  return ({ available: zh ? "有更新" : "Update available", current: zh ? "与来源版本一致" : "Matches source version", not_installed: zh ? "未由 Homebrew 安装" : "Not installed through Homebrew", unknown: zh ? "更新状态待确认" : "Update status not confirmed" })[item.updateStatus];
}

type NativeSoftwareListProps = {
  entries: Array<{ source: SoftwareSourceRef; item: NativeSoftwareItemRef }>;
  locale: WorkbenchSettings["locale"]; actionBusyKey: string | null; channelView?: boolean;
  onAction: (request: SettingsActionRequest) => void;
};

export function NativeSoftwareList({ entries, locale, actionBusyKey, onAction, channelView = false }: NativeSoftwareListProps) {
  const zh = locale === "zh";
  return <div className="agent-package-list" data-testid="opl-native-software-list">{entries.map(({ source, item }) => {
    const carrierInstalled = nativeCarrierInstalled(item);
    const displayInstalled = channelView ? carrierInstalled : item.installed;
    const displayVersion = channelView ? (item.homebrewInstalled === undefined ? item.installedVersion : item.homebrewInstalledVersion) : item.installedVersion;
    const displayName = catalogDisplayName(item.displayName, item.displayNameI18n, locale);
    const description = item.descriptionI18n?.[locale]?.trim() || item.description?.trim()
      || (zh ? "尚未提供软件说明。" : "No software description provided.");
    const executable = item.availableActions.filter(action => action.status === "available" && Boolean(item.revision) && actionPayloadComplete(action.payload, [...action.payloadFields, "source_id", "item_id", "expected_revision"])
      && action.payload.source_id === source.sourceId && action.payload.item_id === item.itemId && action.payload.expected_revision === item.revision
      && (action.actionId === "source_install" ? carrierInstalled === false : action.actionId === "source_update" ? carrierInstalled === true && item.updateStatus === "available" : carrierInstalled === true));
    const primary = executable.find(action => action.actionId === (carrierInstalled === false ? "source_install" : "source_update"));
    const run = (action: SoftwareSourceActionRef) => onAction({ key: `source:${source.sourceId}:${item.itemId}:${action.actionId}`, actionId: action.actionId,
      label: `${softwareSourceActionLabel(action.actionId, locale, action.label)} ${displayName}`, payload: action.payload,
      confirmationRequired: true, dryRunSupported: action.dryRunSupported });
    const busy = actionBusyKey?.startsWith(`source:${source.sourceId}:${item.itemId}:`) === true;
    return <details key={`${source.sourceId}:${item.itemId}`} className="agent-package-row software-catalog-row" data-testid="opl-native-software-row" data-item-id={item.itemId} aria-busy={busy}>
      <summary>
        <SoftwareCatalogIdentity name={displayName} id={item.name} description={description} kind={item.kind === "cask" ? (zh ? "桌面应用" : "Desktop app") : (zh ? "命令行工具" : "Command-line tool")} publisher={source.displayName} />
        <SoftwareCatalogVersions installedLabel={channelView ? (zh ? "渠道版本" : "Channel version") : undefined} missingLabel={channelView ? (zh ? "无记录" : "No receipt") : undefined} installed={displayInstalled} installedVersion={displayVersion} availableVersion={item.availableVersion} locale={locale} />
        <span className="agent-package-summary-actions">
          <span className="settings-status" data-tone={item.updateStatus === "available" ? "attention" : displayInstalled === true ? "ready" : "neutral"}><span aria-hidden="true" />{item.updateStatus === "available" ? (zh ? "有更新" : "Update available") : displayInstalled === true ? (zh ? "已安装" : "Installed") : displayInstalled === false ? (zh ? (channelView ? "无渠道安装记录" : "未安装") : (channelView ? "No channel receipt" : "Not installed")) : (zh ? "待确认" : "Not confirmed")}</span>
          {primary ? <button type="button" className="settings-action-button primary" disabled={actionBusyKey !== null} onClick={event => { event.preventDefault(); run(primary); }}>{busy ? <LoaderCircle className="spin" size={13} aria-hidden="true" /> : null}{softwareSourceActionLabel(primary.actionId, locale, primary.label)}</button> : null}
          <ChevronDown className="agent-package-chevron" size={15} aria-hidden="true" />
        </span>
      </summary>
      <div className="agent-package-details"><dl className="agent-state-axis-grid"><div><dt>{zh ? "软件 ID" : "Software ID"}</dt><dd><code>{item.name}</code></dd></div><div><dt>{zh ? "软件源" : "Software source"}</dt><dd>{source.displayName}</dd></div><div><dt>{zh ? "安装位置" : "Installation"}</dt><dd>{nativeInstallationLabel(item, locale)}</dd></div><div><dt>{zh ? "来源版本" : "Source version"}</dt><dd>{item.availableVersion ?? (zh ? "待确认" : "Not confirmed")}</dd></div><div><dt>{zh ? "已安装版本" : "Installed version"}</dt><dd>{item.installedVersion ?? (item.installed === false ? (zh ? "未由 Homebrew 安装" : "Not installed through Homebrew") : (zh ? "待确认" : "Not confirmed"))}</dd></div><div><dt>{zh ? "更新状态" : "Update status"}</dt><dd>{nativeUpdateLabel(item, zh)}</dd></div></dl><p className="settings-inline-note">{zh ? "版本来自本机 Homebrew 目录。更新软件源目录后可检查新的发布版本。" : "Versions come from the local Homebrew catalog. Update the source catalog to check new releases."}</p>{executable.length ? <div className="agent-package-actions">{executable.map(action => <button key={action.actionId} type="button" className={`settings-action-button${action.actionId === "source_uninstall" ? " danger" : ""}`} disabled={actionBusyKey !== null} onClick={() => run(action)}>{softwareSourceActionLabel(action.actionId, locale, action.label)}</button>)}</div> : <p className="settings-inline-note">{channelView && carrierInstalled === false ? (zh ? "此渠道尚无安装记录。" : "This channel has no installation receipt.") : (zh ? "当前没有可执行的管理操作，请检查软件源状态。" : "No management action is available. Check the software source status.")}</p>}</div>
    </details>;
  })}</div>;
}

export function NativeSoftwareCatalog({ projection, locale, actionBusyKey, onAction, query = "", statusFilter = "all", catalogOrigin }: Omit<NativeSoftwareListProps, "entries"> & { projection?: SoftwareSourcesProjection; query?: string; statusFilter?: string; catalogOrigin?: CatalogOrigin }) {
  const entries = nativeSoftwareEntries(projection).filter(({ source, item }) => (!catalogOrigin || (item.catalogOrigin ?? "unknown") === catalogOrigin) && nativeSoftwareMatches(item, source, query, statusFilter));
  if (!entries.length) return null;
  return <section className="agent-catalog-group"><h2><Box size={15} aria-hidden="true" />{locale === "zh" ? "桌面应用与命令行工具" : "Desktop apps and command-line tools"}<span>{entries.length}</span></h2><NativeSoftwareList entries={entries} locale={locale} actionBusyKey={actionBusyKey} onAction={onAction} /></section>;
}

function SourceRow({ source, locale, actionBusyKey, onAction }: {
  source: SoftwareSourceRef;
  locale: WorkbenchSettings["locale"];
  actionBusyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
}) {
  const zh = locale === "zh";
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedHandle, setAdvancedHandle] = useState("provider:github_packages:gh-cli");
  const href = sourceHref(source.sourceRef);
  const observedAt = checkedAt(source.verifiedAt, locale);
  const action = (id: string) => source.availableActions.find((candidate) => candidate.actionId === id && candidate.status === "available");
  const configure = action("source_configure");
  const check = action("source_check");
  const refresh = action("source_refresh");
  const setup = action("source_setup");
  const disconnect = action("source_disconnect");
  const sourceBusy = Boolean(actionBusyKey?.startsWith(`source:${source.sourceId}:`));
  const defaultPayload = configure ? { ...configure.payload, source_id: source.sourceId, ...(source.providerId && !configure.payload.provider_id ? { provider_id: source.providerId } : {}), ...(configure.payloadFields.includes("enabled") && configure.payload.enabled === undefined ? { enabled: true } : {}) } : {};
  const canConfigure = Boolean(configure && actionPayloadComplete(defaultPayload, configure.payloadFields));
  const run = (selected: SoftwareSourceActionRef, payload = selected.payload, label = softwareSourceActionLabel(selected.actionId, locale, selected.label)) => {
    if (!actionPayloadComplete(payload, selected.payloadFields)) return;
    onAction({ key: `source:${source.sourceId}:${selected.actionId}`, actionId: selected.actionId, label: selected.actionId === "source_refresh" ? (zh ? "更新全部 Homebrew 软件目录（保留已安装版本）" : "Update all Homebrew catalogs (keep installed versions)") : label, payload,
      confirmationRequired: selected.confirmationRequired, dryRunSupported: selected.dryRunSupported });
  };
  const submitAdvanced = () => {
    const handle = advancedHandle.trim();
    if (!configure || !handle) return;
    if (!["provider:github_packages:gh-cli", "provider:github_packages:docker", "provider:github_packages:ghcr", "env:OPL_GITHUB_PACKAGES_TOKEN"].includes(handle)) return;
    run(configure, { ...defaultPayload, credential_handle: handle }, zh ? "连接所选凭证" : "Connect selected credential");
  };

  return <article className="opl-software-source" data-testid="opl-software-source" data-source-id={source.sourceId} aria-busy={sourceBusy}>
    <div className="opl-software-source-heading">
      <div>
        <h3>{source.displayName}</h3>
        <div className="opl-software-source-meta"><span>{source.visibility === "authorized_only" ? (zh ? "仅授权用户" : "Authorized users") : source.visibility === "public" ? (zh ? "公开软件源" : "Public source") : (zh ? "可见性待确认" : "Visibility unverified")}</span><span>{source.sourceKind === "tap" ? "Homebrew tap" : "Package Registry"}</span>{typeof source.entryCount === "number" ? <span>{zh ? `${source.entryCount} 个可见条目` : `${source.entryCount} visible entries`}</span> : null}</div>
      </div>
      <span className="settings-status" data-tone={softwareSourceStatusTone(source)}><span aria-hidden="true" />{softwareSourceStatusLabel(source, locale)}</span>
    </div>
    <p className="opl-software-source-description">{sourceDetail(source, zh)}</p>
    {source.sourceRef ? <div className="opl-software-source-location">{href ? <a href={href} target="_blank" rel="noreferrer"><span>{source.sourceRef}</span><ExternalLink size={12} aria-hidden="true" /></a> : <code>{source.sourceRef}</code>}</div> : null}
    <div className="opl-software-source-footer">
      <span className="opl-software-source-checked">{observedAt ? (zh ? `最近检查 ${observedAt}` : `Last checked ${observedAt}`) : (zh ? "尚未完成访问检查" : "Access has not been checked")}</span>
      <div className="opl-software-source-actions">
        {setup ? <button className="settings-action-button primary" type="button" disabled={actionBusyKey !== null || !actionPayloadComplete(setup.payload, setup.payloadFields)} onClick={() => run(setup)}><Link2 aria-hidden="true" size={14} />{zh ? "启用此软件源" : "Enable source"}</button> : null}
        {check ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null || !actionPayloadComplete(check.payload, check.payloadFields)} onClick={() => run(check)}>{actionBusyKey === `source:${source.sourceId}:source_check` ? <LoaderCircle className="spin" aria-hidden="true" size={14} /> : <RefreshCw aria-hidden="true" size={14} />}{source.sourceKind === "tap" ? (zh ? "检查本机状态" : "Check local status") : (zh ? "检查访问" : "Check access")}</button> : null}
        {refresh ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null || !actionPayloadComplete(refresh.payload, refresh.payloadFields)} onClick={() => run(refresh)}><RefreshCw aria-hidden="true" size={14} />{zh ? "更新目录" : "Update catalog"}</button> : null}
        {configure ? <button className={`settings-action-button${source.status !== "authorized" || source.enabled === false ? " primary" : ""}`} type="button" disabled={actionBusyKey !== null || !canConfigure} onClick={() => run(configure, defaultPayload)}>{actionBusyKey === `source:${source.sourceId}:source_configure` ? <LoaderCircle className="spin" aria-hidden="true" size={14} /> : <Link2 aria-hidden="true" size={14} />}{source.status === "authorized" && source.enabled !== false ? (zh ? "重新连接" : "Reconnect") : (zh ? "连接 GitHub 账户" : "Connect GitHub account")}</button> : null}
        {disconnect && (source.credentialHandlePresent || source.status === "authorized") ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={() => run(disconnect)}><Unplug aria-hidden="true" size={14} />{zh ? "断开连接" : "Disconnect"}</button> : null}
      </div>
    </div>
    {source.sourceKind === "tap" ? <details className="opl-software-source-advanced"><summary>{zh ? "此来源的软件" : "Software from this source"}{source.inventoryStatus === "available" ? ` (${source.nativeItems?.length ?? 0})` : ""}</summary>{source.inventoryStatus === "available" ? source.nativeItems?.length ? <NativeSoftwareList channelView entries={source.nativeItems.map(item => ({ source, item }))} locale={locale} actionBusyKey={actionBusyKey} onAction={onAction} /> : <p className="settings-inline-note">{zh ? "此来源当前没有软件条目。" : "This source currently has no software entries."}</p> : <p className="settings-inline-note">{source.inventoryStatus === "unavailable" ? (zh ? "暂时无法读取本机 Homebrew 目录。检查 Homebrew 后重新读取。" : "The local Homebrew catalog could not be read. Check Homebrew and read it again.") : (zh ? "尚未读取软件清单。检查本机状态后可查看安装情况和来源版本。" : "The software list has not been read. Check local status to view installations and source versions.")}</p>}{checkedAt(source.inventoryCheckedAt, locale) ? <p className="settings-inline-note">{zh ? "清单读取于" : "Catalog read at"} {checkedAt(source.inventoryCheckedAt, locale)}</p> : null}</details> : null}
    {source.sourceKind === "tap" && source.inventoryReason === "homebrew_unavailable" ? <p className="settings-inline-note">{zh ? "本机尚未找到 Homebrew。" : "Homebrew was not found on this device."} <a href="https://brew.sh" target="_blank" rel="noreferrer">{zh ? "查看安装指南" : "View installation guide"}</a></p> : null}
    {configure ? <div className="opl-software-source-advanced">
      <button className="settings-inline-command" type="button" aria-expanded={advancedOpen} aria-controls={`source-advanced-${source.sourceId}`} onClick={() => setAdvancedOpen(!advancedOpen)}><KeyRound aria-hidden="true" size={13} />{zh ? "其他连接方式" : "Other connection methods"}</button>
      {advancedOpen ? <form id={`source-advanced-${source.sourceId}`} className="opl-software-source-form" onSubmit={(event) => { event.preventDefault(); submitAdvanced(); }}>
        <label htmlFor={`source-handle-${source.sourceId}`}>{zh ? "使用已保存的登录" : "Use a saved sign-in"}</label>
        <p>{zh ? "凭证继续由所选工具保管，OPL 仅保存连接引用。" : "The selected tool continues to manage credentials; OPL saves only the connection reference."}</p>
        <div><select id={`source-handle-${source.sourceId}`} value={advancedHandle} onChange={(event) => setAdvancedHandle(event.currentTarget.value)}><option value="provider:github_packages:gh-cli">{zh ? "GitHub CLI 已登录账户（默认）" : "GitHub CLI account (default)"}</option><option value="provider:github_packages:docker">{zh ? "Docker 已保存的 Registry 登录" : "Docker saved registry sign-in"}</option><option value="provider:github_packages:ghcr">{zh ? "自动选择本机 GHCR 登录" : "Automatically select local GHCR sign-in"}</option><option value="env:OPL_GITHUB_PACKAGES_TOKEN">{zh ? "管理员配置的环境凭证" : "Administrator-configured environment credential"}</option></select><button type="submit" className="settings-action-button" disabled={actionBusyKey !== null}><Check aria-hidden="true" size={14} />{zh ? "连接" : "Connect"}</button></div>
      </form> : null}
    </div> : null}
  </article>;
}

export function SoftwareSourcesPage({ projection, locale, actionBusyKey, onAction, onRefresh }: {
  projection?: SoftwareSourcesProjection;
  locale: WorkbenchSettings["locale"];
  actionBusyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
  onRefresh: () => void;
}) {
  const zh = locale === "zh";
  const sources = projection?.entries ?? [];
  const sourceGroups = [
    {
      id: "opl",
      label: zh ? "OPL 软件源" : "OPL software sources",
      description: zh ? "公共软件、授权软件和 Homebrew 安装渠道共用 OPL 软件目录。一个软件可以有多个获取渠道，目录按软件身份合并展示。" : "Public software, authorized software, and Homebrew installation channels share the OPL catalog. Multiple channels for one product appear as one software entry.",
      entries: sources.filter(source => source.catalogOrigin === "opl")
    },
    {
      id: "external",
      label: zh ? "其他来源" : "Other sources",
      description: zh ? "这些来源由各自的发布者和管理器维护。来源未声明维护归属时，也保留在这里。" : "These sources are maintained by their own publishers and managers. Sources without declared ownership are also listed here.",
      entries: sources.filter(source => source.catalogOrigin !== "opl")
    }
  ].filter(group => group.entries.length);
  const listAction = projection?.entries.flatMap((source) => source.availableActions).find((action) => action.actionId === "source_list" && action.status === "available");
  const refresh = () => listAction ? onAction({ key: "source:all:source_list", actionId: listAction.actionId, label: softwareSourceActionLabel(listAction.actionId, locale, listAction.label), payload: listAction.payload, confirmationRequired: listAction.confirmationRequired, dryRunSupported: listAction.dryRunSupported }) : onRefresh();
  return <div className="opl-software-sources" data-testid="opl-software-sources">
    <div className="opl-software-sources-heading"><div><h2>{zh ? "软件源" : "Software sources"}</h2><p>{zh ? "管理软件的获取渠道和访问权限。安装与更新沿用各渠道的管理器。" : "Manage download channels and access. Each channel retains its installation and update manager."}</p></div><button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={refresh}><RefreshCw aria-hidden="true" size={14} />{zh ? "刷新目录" : "Refresh catalog"}</button></div>
    {sourceGroups.length ? sourceGroups.map(group => <section key={group.id} className="opl-software-source-group" data-source-group={group.id} aria-labelledby={`opl-source-group-${group.id}`}><div className="opl-software-source-group-heading"><h2 id={`opl-source-group-${group.id}`}>{group.label}</h2><p>{group.description}</p></div><div className="opl-software-source-list">{group.entries.map(source => <SourceRow key={source.sourceId} source={source} locale={locale} actionBusyKey={actionBusyKey} onAction={onAction} />)}</div></section>) : <div className="opl-software-sources-empty"><h3>{zh ? "软件源尚未返回" : "Software sources are not available yet"}</h3><p>{zh ? "刷新以读取当前环境的软件源和访问状态。" : "Refresh to read software sources and access status for this environment."}</p><button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={onRefresh}>{zh ? "重新读取" : "Read again"}</button></div>}
    <p className="opl-software-sources-note">{zh ? "OPL 软件在统一目录中管理；外部扩展在“其他来源”中查看其管理入口。断开来源会暂停后续下载和更新，已安装软件保留在本机。" : "Manage OPL software in its catalog and find external extension managers under Other sources. Disconnecting a source pauses downloads and updates; installed software stays on this device."}</p>
  </div>;
}
