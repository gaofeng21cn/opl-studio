import { ExternalLink, KeyRound, Link2, LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import { useState } from "react";
import type { WorkbenchSettings } from "./settingsModel";
import type { SoftwareSourceActionRef, SoftwareSourceRef, SoftwareSourcesProjection } from "./workbenchModel-package-contracts";
import { actionPayloadComplete, type SettingsActionRequest } from "./settingsActions";
import { softwareSourceActionLabel, softwareSourceStatusLabel, softwareSourceStatusTone } from "./softwareSources";

function sourceHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function isCatalogIndex(source: SoftwareSourceRef): boolean {
  return source.sourceId === "public-registry:opl" || source.providerId === "opl_catalog";
}

function sourceDetail(source: SoftwareSourceRef, zh: boolean): string {
  if (source.enabled === false) return zh ? "此软件源已停用。重新连接后可检查和获取更新。" : "This source is disabled. Reconnect to check and download updates.";
  if (isCatalogIndex(source)) return zh ? "提供 OPL 软件目录和可用版本。受限软件按账号权限下载安装。" : "Provides the OPL software catalog and available versions. Restricted software requires an authorized account.";
  if (source.status === "signed_out") return zh ? "连接本机已登录的 GitHub 账户以检查访问权限。" : "Connect a GitHub account signed in on this device to check access.";
  if (source.status === "forbidden") return zh ? "账户已连接，但没有此软件源的访问权限。请向维护者申请权限后重新检查。" : "The connected account cannot access this source. Ask its maintainer for access, then check again.";
  if (source.status === "expired") return zh ? "账户授权已过期。重新登录 GitHub 后连接此软件源。" : "Account authorization has expired. Sign in to GitHub again and reconnect this source.";
  if (source.status === "revoked") return zh ? "访问授权已撤销。已安装软件仍保留在本机，新的下载和更新已暂停。" : "Access was revoked. Installed software remains on this device. New downloads and updates are paused.";
  if (source.status === "unknown") return zh ? "尚未确认此软件源的访问状态。检查后将显示最新结果。" : "Access to this source has not been verified. Check it to read its latest status.";
  if (source.visibility === "authorized_only") return zh ? "逐项检查软件安装权限。" : "Installation access is checked for each package.";
  return zh ? "通过 GitHub Packages 获取授权软件。" : "Provides authorized software through GitHub Packages.";
}

function checkedAt(value: string | undefined, locale: WorkbenchSettings["locale"]): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
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
  const catalogIndex = isCatalogIndex(source);
  const href = sourceHref(source.sourceRef);
  const catalogCache = source.catalogCache;
  const observedAt = checkedAt(catalogCache ? catalogCache.fetchedAt : source.verifiedAt, locale);
  const lastObservation = catalogIndex
    ? observedAt ? (zh ? `最近同步 ${observedAt}` : `Last synchronized ${observedAt}`)
      : (zh ? "尚未同步目录" : "Catalog not synchronized yet")
    : observedAt ? (zh ? `最近检查 ${observedAt}` : `Last checked ${observedAt}`)
      : (zh ? "尚未完成访问检查" : "Access has not been checked");
  const staleCatalog = source.enabled !== false && catalogCache?.cached === true && catalogCache.stale;
  const action = (id: string) => source.availableActions.find(candidate => candidate.actionId === id && candidate.status === "available");
  const configure = action("source_configure");
  const check = action("source_check");
  const refresh = action("source_refresh");
  const disconnect = action("source_disconnect");
  const sourceBusy = actionBusyKey?.startsWith(`source:${source.sourceId}:`) === true;
  const defaultPayload = configure ? {
    ...configure.payload,
    source_id: source.sourceId,
    ...(source.providerId && !configure.payload.provider_id ? { provider_id: source.providerId } : {}),
    ...(configure.payloadFields.includes("enabled") && configure.payload.enabled === undefined ? { enabled: true } : {})
  } : {};
  const canConfigure = Boolean(configure && actionPayloadComplete(defaultPayload, configure.payloadFields));
  const run = (selected: SoftwareSourceActionRef, payload = selected.payload, label = softwareSourceActionLabel(selected.actionId, locale, selected.label)) => {
    if (!actionPayloadComplete(payload, selected.payloadFields)) return;
    onAction({ key: `source:${source.sourceId}:${selected.actionId}`, actionId: selected.actionId, label, payload,
      confirmationRequired: selected.confirmationRequired, dryRunSupported: selected.dryRunSupported });
  };
  const submitAdvanced = () => {
    if (!configure || !advancedHandle.trim()) return;
    if (!["provider:github_packages:gh-cli", "provider:github_packages:docker", "provider:github_packages:ghcr", "env:OPL_GITHUB_PACKAGES_TOKEN"].includes(advancedHandle.trim())) return;
    run(configure, { ...defaultPayload, credential_handle: advancedHandle.trim() }, zh ? "连接所选凭证" : "Connect selected credential");
  };

  return <article className="opl-software-source" data-testid="opl-software-source" data-source-id={source.sourceId} aria-busy={sourceBusy}>
    <div className="opl-software-source-heading">
      <div>
        <h3>{source.displayName}</h3>
        <div className="opl-software-source-meta">
          <span>{source.visibility === "authorized_only" ? (zh ? "仅授权用户" : "Authorized users") : source.visibility === "public" ? (zh ? "公开软件源" : "Public source") : (zh ? "可见性待确认" : "Visibility unverified")}</span>
          <span>{catalogIndex ? (zh ? "目录索引" : "Catalog index") : "GitHub Packages"}</span>
          {typeof source.entryCount === "number" ? <span>{zh ? `${source.entryCount} 个可见条目` : `${source.entryCount} visible entries`}</span> : null}
        </div>
      </div>
      <span className="settings-status" data-tone={staleCatalog ? "attention" : softwareSourceStatusTone(source)}><span aria-hidden="true" />{staleCatalog ? (zh ? "使用上次同步的目录" : "Using the last synchronized catalog") : softwareSourceStatusLabel(source, locale)}</span>
    </div>
    <p className="opl-software-source-description">{sourceDetail(source, zh)}</p>
    {source.sourceRef ? <div className="opl-software-source-location">{href
      ? <a href={href} target="_blank" rel="noreferrer"><span>{source.sourceRef}</span><ExternalLink size={12} aria-hidden="true" /></a>
      : <code>{source.sourceRef}</code>}</div> : null}
    <div className="opl-software-source-footer">
      <span className="opl-software-source-checked">{lastObservation}</span>
      <div className="opl-software-source-actions">
        {check && !catalogIndex ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null || !actionPayloadComplete(check.payload, check.payloadFields)} onClick={() => run(check)}>{actionBusyKey === `source:${source.sourceId}:source_check` ? <LoaderCircle className="spin" aria-hidden="true" size={14} /> : <RefreshCw aria-hidden="true" size={14} />}{zh ? "检查访问" : "Check access"}</button> : null}
        {refresh ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null || !actionPayloadComplete(refresh.payload, refresh.payloadFields)} onClick={() => run(refresh)}>{actionBusyKey === `source:${source.sourceId}:source_refresh` ? <LoaderCircle className="spin" aria-hidden="true" size={14} /> : <RefreshCw aria-hidden="true" size={14} />}{softwareSourceActionLabel(refresh.actionId, locale, refresh.label)}</button> : null}
        {configure ? <button className={`settings-action-button${source.status !== "authorized" || source.enabled === false ? " primary" : ""}`} type="button" disabled={actionBusyKey !== null || !canConfigure} onClick={() => run(configure, defaultPayload)}>{actionBusyKey === `source:${source.sourceId}:source_configure` ? <LoaderCircle className="spin" aria-hidden="true" size={14} /> : <Link2 aria-hidden="true" size={14} />}{source.status === "authorized" && source.enabled !== false ? (zh ? "重新连接" : "Reconnect") : (zh ? "连接 GitHub 账户" : "Connect GitHub account")}</button> : null}
        {disconnect && (source.credentialHandlePresent || source.status === "authorized") ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={() => run(disconnect)}><Unplug aria-hidden="true" size={14} />{zh ? "断开连接" : "Disconnect"}</button> : null}
      </div>
    </div>
    {configure ? <div className="opl-software-source-advanced">
      <button className="settings-inline-command" type="button" aria-expanded={advancedOpen} aria-controls={`source-advanced-${source.sourceId}`} onClick={() => setAdvancedOpen(!advancedOpen)}><KeyRound aria-hidden="true" size={13} />{zh ? "其他连接方式" : "Other connection methods"}</button>
      {advancedOpen ? <form id={`source-advanced-${source.sourceId}`} className="opl-software-source-form" onSubmit={event => { event.preventDefault(); submitAdvanced(); }}>
        <label htmlFor={`source-handle-${source.sourceId}`}>{zh ? "使用已保存的登录" : "Use a saved sign-in"}</label>
        <p>{zh ? "凭证继续由所选工具保管，OPL 仅保存连接引用。" : "The selected tool continues to manage credentials. OPL saves only the connection reference."}</p>
        <div><select id={`source-handle-${source.sourceId}`} value={advancedHandle} onChange={event => setAdvancedHandle(event.currentTarget.value)}><option value="provider:github_packages:gh-cli">{zh ? "GitHub CLI 已登录账户（默认）" : "GitHub CLI account (default)"}</option><option value="provider:github_packages:docker">{zh ? "Docker 已保存的 Registry 登录" : "Docker saved registry sign-in"}</option><option value="provider:github_packages:ghcr">{zh ? "自动选择本机 GHCR 登录" : "Automatically select local GHCR sign-in"}</option><option value="env:OPL_GITHUB_PACKAGES_TOKEN">{zh ? "管理员配置的环境凭证" : "Administrator-configured environment credential"}</option></select><button type="submit" className="settings-action-button" disabled={actionBusyKey !== null}><Link2 aria-hidden="true" size={14} />{zh ? "连接" : "Connect"}</button></div>
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
      description: zh ? "OPL 公共目录提供软件发现和可用版本。" : "The OPL public catalog provides software discovery and available versions.",
      entries: sources.filter(source => source.catalogOrigin === "opl")
    },
    {
      id: "external",
      label: zh ? "GitHub Packages" : "GitHub Packages",
      description: zh ? "连接 GitHub 账户后检查已授权软件源的访问权限。" : "Connect a GitHub account to check access to authorized software sources.",
      entries: sources.filter(source => !isCatalogIndex(source) && source.catalogOrigin !== "opl")
    }
  ].filter(group => group.entries.length);
  return <div className="opl-software-sources" data-testid="opl-software-sources">
    <div className="opl-software-sources-heading"><div><h2>{zh ? "软件源" : "Software sources"}</h2><p>{zh ? "查看公共目录与软件源账户授权状态。" : "View the public catalog and software-source account access."}</p></div><button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={onRefresh}><RefreshCw aria-hidden="true" size={14} />{zh ? "重新读取软件源" : "Reload sources"}</button></div>
    {sourceGroups.length ? sourceGroups.map(group => <section key={group.id} className="opl-software-source-group" data-source-group={group.id} aria-labelledby={`opl-source-group-${group.id}`}><div className="opl-software-source-group-heading"><h2 id={`opl-source-group-${group.id}`}>{group.label}</h2><p>{group.description}</p></div><div className="opl-software-source-list">{group.entries.map(source => <SourceRow key={source.sourceId} source={source} locale={locale} actionBusyKey={actionBusyKey} onAction={onAction} />)}</div></section>) : <div className="opl-software-sources-empty"><h3>{zh ? "软件源尚未返回" : "Software sources are not available yet"}</h3><p>{zh ? "刷新以读取当前环境的软件源和访问状态。" : "Refresh to read software sources and access status for this environment."}</p><button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={onRefresh}>{zh ? "重新读取" : "Read again"}</button></div>}
    <p className="opl-software-sources-note">{zh ? "软件包的安装、更新与修复由 OPL Framework 管理；GitHub Packages 仅提供授权访问状态。" : "OPL Framework manages package installation, updates, and repair. GitHub Packages supplies authorized access status."}</p>
  </div>;
}
