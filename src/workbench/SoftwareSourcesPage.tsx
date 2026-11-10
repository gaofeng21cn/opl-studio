import { Check, ExternalLink, KeyRound, Link2, LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import { useState } from "react";

import type { WorkbenchSettings } from "./settingsModel";
import type { SoftwareSourceActionRef, SoftwareSourceRef, SoftwareSourcesProjection } from "./workbenchModel-package-contracts";
import { actionPayloadComplete, type SettingsActionRequest } from "./settingsActions";
import { softwareSourceActionLabel, softwareSourceStatusLabel, softwareSourceStatusTone } from "./softwareSources";

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
    ? (zh ? "提供原生应用、命令行工具和系统依赖，由 Homebrew 完成安装与更新。" : "Provides native apps, command-line tools, and system dependencies installed and updated by Homebrew.")
    : source.visibility === "authorized_only"
      ? (zh ? "你有权限的软件与公开软件使用同一目录、安装和更新流程。" : "Authorized software shares the same catalog, installation, and update flow as public software.")
      : (zh ? "提供公开的智能体、工作流和共享能力。" : "Provides public agents, workflows, and shared capabilities.");
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
  const href = sourceHref(source.sourceRef);
  const observedAt = checkedAt(source.verifiedAt, locale);
  const action = (id: string) => source.availableActions.find((candidate) => candidate.actionId === id && candidate.status === "available");
  const configure = action("source_configure");
  const check = action("source_check");
  const disconnect = action("source_disconnect");
  const sourceBusy = Boolean(actionBusyKey?.startsWith(`source:${source.sourceId}:`));
  const defaultPayload = configure ? { ...configure.payload, source_id: source.sourceId, ...(source.providerId && !configure.payload.provider_id ? { provider_id: source.providerId } : {}), ...(configure.payloadFields.includes("enabled") && configure.payload.enabled === undefined ? { enabled: true } : {}) } : {};
  const canConfigure = Boolean(configure && actionPayloadComplete(defaultPayload, configure.payloadFields));
  const run = (selected: SoftwareSourceActionRef, payload = selected.payload, label = softwareSourceActionLabel(selected.actionId, locale, selected.label)) => {
    if (!actionPayloadComplete(payload, selected.payloadFields)) return;
    onAction({ key: `source:${source.sourceId}:${selected.actionId}`, actionId: selected.actionId, label, payload,
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
        {check ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null || !actionPayloadComplete(check.payload, check.payloadFields)} onClick={() => run(check)}>{actionBusyKey === `source:${source.sourceId}:source_check` ? <LoaderCircle className="spin" aria-hidden="true" size={14} /> : <RefreshCw aria-hidden="true" size={14} />}{zh ? "检查访问" : "Check access"}</button> : null}
        {configure ? <button className={`settings-action-button${source.status !== "authorized" || source.enabled === false ? " primary" : ""}`} type="button" disabled={actionBusyKey !== null || !canConfigure} onClick={() => run(configure, defaultPayload)}>{actionBusyKey === `source:${source.sourceId}:source_configure` ? <LoaderCircle className="spin" aria-hidden="true" size={14} /> : <Link2 aria-hidden="true" size={14} />}{source.status === "authorized" && source.enabled !== false ? (zh ? "重新连接" : "Reconnect") : (zh ? "连接 GitHub 账户" : "Connect GitHub account")}</button> : null}
        {disconnect && (source.credentialHandlePresent || source.status === "authorized") ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={() => run(disconnect)}><Unplug aria-hidden="true" size={14} />{zh ? "断开连接" : "Disconnect"}</button> : null}
      </div>
    </div>
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
  const listAction = projection?.entries.flatMap((source) => source.availableActions).find((action) => action.actionId === "source_list" && action.status === "available");
  const refresh = () => listAction ? onAction({ key: "source:all:source_list", actionId: listAction.actionId, label: softwareSourceActionLabel(listAction.actionId, locale, listAction.label), payload: listAction.payload, confirmationRequired: listAction.confirmationRequired, dryRunSupported: listAction.dryRunSupported }) : onRefresh();
  return <div className="opl-software-sources" data-testid="opl-software-sources">
    <div className="opl-software-sources-heading"><div><h2>{zh ? "软件源" : "Software sources"}</h2><p>{zh ? "公开与私有软件汇集在同一目录；连接账户后，只显示你有权访问的内容。" : "Public and private software share one catalog. Connect an account to see the software you can access."}</p></div><button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={refresh}><RefreshCw aria-hidden="true" size={14} />{zh ? "刷新目录" : "Refresh catalog"}</button></div>
    {projection?.entries.length ? <div className="opl-software-source-list">{projection.entries.map((source) => <SourceRow key={source.sourceId} source={source} locale={locale} actionBusyKey={actionBusyKey} onAction={onAction} />)}</div> : <div className="opl-software-sources-empty"><h3>{zh ? "软件源尚未返回" : "Software sources are not available yet"}</h3><p>{zh ? "刷新以读取当前环境的软件源和访问状态。" : "Refresh to read software sources and access status for this environment."}</p><button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={onRefresh}>{zh ? "重新读取" : "Read again"}</button></div>}
    <p className="opl-software-sources-note">{zh ? "断开软件源会暂停后续下载和更新；已安装的软件可在“我的应用”中卸载。" : "Disconnecting pauses future downloads and updates. Remove installed software from My apps."}</p>
  </div>;
}
