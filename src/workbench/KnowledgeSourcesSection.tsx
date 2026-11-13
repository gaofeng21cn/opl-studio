import { Check, FolderPlus, RefreshCw, Settings2, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { actionPayloadComplete, type SettingsActionRequest } from "./settingsActions";
import type { KnowledgeSourceHealth, KnowledgeSourceRef, KnowledgeSourcesProjection } from "./knowledgeSources";
import { knowledgeSourceStatus } from "./knowledgeSources";
import { SettingsGroup, StatusValue } from "./settings/primitives";

const splitIds = (value: string) => [...new Set(value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean))];
const dateLabel = (value: string | undefined, locale: "zh" | "en") => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(Date.parse(value)) : null;
const stateLabel = (value: string, zh: boolean) => ({ authorized: zh ? "已授权" : "Authorized", current: zh ? "当前" : "Current", fresh: zh ? "最新" : "Fresh", stale: zh ? "需要复核" : "Review needed", attention: zh ? "需要处理" : "Needs attention", ready: zh ? "就绪" : "Ready" } as Record<string, string>)[value] ?? (zh ? "待确认" : "Not confirmed");

function KnowledgeHealthDetails({ health, zh }: { health: KnowledgeSourceHealth; zh: boolean }) {
  const counts = [
    zh ? `${health.currentCount}条可用` : `${health.currentCount} available`,
    health.reviewDueCount ? (zh ? `${health.reviewDueCount}条过期记录已排除` : `${health.reviewDueCount} expired records excluded`) : null,
    health.inactiveCount ? (zh ? `${health.inactiveCount}条停用或已替代记录已排除` : `${health.inactiveCount} inactive or superseded records excluded`) : null,
    health.unavailableCount ? (zh ? `${health.unavailableCount}条暂不可用` : `${health.unavailableCount} unavailable`) : null
  ].filter(Boolean).join(" · ");
  const reason = (issue: KnowledgeSourceHealth["issues"][number]) => ({
    knowledge_review_overdue: zh ? "已过复核期限，已排除" : "Review period expired; excluded",
    knowledge_source_body_requires_review: zh ? "原文有变更，需要复核" : "Source content changed; review needed",
    knowledge_source_body_unavailable: zh ? "原文暂不可读取" : "Source content is unavailable"
  }[issue.reason] ?? (zh ? "暂不可用，需要复核" : "Unavailable; review needed"));
  return <>
    <div><dt>{zh ? "知识条目" : "Knowledge records"}</dt><dd data-testid="opl-knowledge-health">{counts}{health.truncated ? <p className="settings-inline-note">{zh ? `本次已检查${health.checkedCount}条，尚未覆盖全部记录。` : `Checked ${health.checkedCount} records; the remaining records have not been checked.`}</p> : null}</dd></div>
    {health.issues.length ? <div><dt>{zh ? "已排除记录" : "Excluded records"}</dt><dd><ul>{health.issues.map(issue => <li key={issue.knowledgeId}><code>{issue.knowledgeId}</code> · {reason(issue)}</li>)}</ul></dd></div> : null}
  </>;
}

export function KnowledgeSourcesSection({ projection, locale, actionBusyKey, onAction, onRefresh, onPickDirectory, selectedPackageId }: {
  projection?: KnowledgeSourcesProjection; locale: "zh" | "en"; actionBusyKey: string | null;
  onAction: (request: SettingsActionRequest) => void; onRefresh: () => void;
  onPickDirectory?: () => Promise<string | undefined>; selectedPackageId?: string;
}) {
  const zh = locale === "zh";
  const [editing, setEditing] = useState<KnowledgeSourceRef | "new" | null>(null);
  const [contextId, setContextId] = useState("");
  const [sourceMode, setSourceMode] = useState<"vault" | "registry">("vault");
  const [location, setLocation] = useState("");
  const [label, setLabel] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [scopeText, setScopeText] = useState("");
  const [readers, setReaders] = useState<string[]>([]);
  const [writers, setWriters] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [picking, setPicking] = useState(false);
  const [submittedRevision, setSubmittedRevision] = useState<string | undefined>();
  useEffect(() => {
    if (!submitted || actionBusyKey !== null || !editing) return;
    const currentRevision = editing === "new" ? projection?.contexts.find(context => context.contextId === contextId)?.revision
      : projection?.entries.find(source => source.resourceId === editing.resourceId)?.revisionIdentity;
    if (currentRevision && currentRevision !== submittedRevision) {
      setEditing(null); setLocation(""); setSubmitted(false);
    }
  }, [projection, submitted, submittedRevision, actionBusyKey, editing, contextId]);
  const action = (id: string) => projection?.actions.find(item => item.actionId === id && item.status === "available");
  const connect = action("knowledge_source_connect");
  const canRun = (source: KnowledgeSourceRef, id: string) => (id !== "knowledge_source_configure" || source.accessEditable !== false) && source.actionIds.includes(id) && Boolean(action(id));
  const run = (id: string, payload: Record<string, unknown>, actionLabel: string) => {
    const selected = action(id);
    if (!selected || !actionPayloadComplete(payload, selected.payloadFields)) return false;
    onAction({ key: `knowledge:${String(payload.resource_id ?? payload.context_id ?? "all")}:${id}`, actionId: id, label: actionLabel,
      payload, confirmationRequired: selected.confirmationRequired, dryRunSupported: selected.dryRunSupported });
    return true;
  };
  const openForm = (source: KnowledgeSourceRef | "new") => {
    const context = projection?.contexts.find(item => item.contextId === (source === "new" ? "" : source.contextId))
      ?? projection?.contexts.find(item => item.selected) ?? projection?.contexts[0];
    setEditing(source); setContextId(source === "new" ? context?.contextId ?? "" : source.contextId);
    setLabel(source === "new" ? "" : source.label); setSourceId(source === "new" ? "" : source.sourceId);
    setScopeText((source === "new" ? context?.defaultScopeIds ?? context?.availableScopeIds ?? [] : source.scopeIds).join(", "));
    setReaders(source === "new" ? (projection?.consumers.filter(consumer => consumer.packageId === selectedPackageId).map(consumer => consumer.domainId) ?? []) : source.consumerDomainIds); setWriters(source === "new" ? [] : source.writeDomainIds);
    setLocation(""); setError(""); setSubmitted(false);
  };
  const context = projection?.contexts.find(item => item.contextId === contextId);
  const scopeOptions = context?.scopeOptions?.length ? context.scopeOptions : (context?.availableScopeIds ?? []).map(id => ({ id, label: id }));
  const pickDirectory = async () => {
    if (!onPickDirectory) return;
    setPicking(true); setError("");
    try { const selected = await onPickDirectory(); if (selected) { setLocation(selected); if (!label.trim()) setLabel(selected.split(/[\\/]/).filter(Boolean).at(-1) ?? ""); } }
    catch { setError(zh ? "未能选择资料夹，请重试或输入位置。" : "Could not select a folder. Try again or enter its location."); }
    finally { setPicking(false); }
  };
  const submit = () => {
    const context = projection?.contexts.find(item => item.contextId === contextId);
    const scopes = splitIds(scopeText);
    if (!contextId || !scopes.length || !readers.length || editing === "new" && (!location.trim() || sourceMode === "registry" && !sourceId.trim())) {
      setError(zh ? "请选择资料库位置、使用范围和至少一个可使用的软件。" : "Choose a source location, knowledge scope, and at least one app."); return;
    }
    const payload = { scope_ids: scopes, consumer_domain_ids: readers, write_domain_ids: writers.filter(id => readers.includes(id)),
      ...(editing === "new" ? { context_id: contextId, expected_revision: context?.revision, [sourceMode === "vault" ? "vault_path" : "registry_path"]: location.trim(), ...(label.trim() ? { label: label.trim() } : {}), ...(sourceId.trim() ? { source_id: sourceId.trim() } : {}) }
        : { resource_id: editing?.resourceId, expected_revision: editing?.revisionIdentity }) };
    if (run(editing === "new" ? "knowledge_source_connect" : "knowledge_source_configure", payload, editing === "new" ? (zh ? "连接资料库" : "Connect library") : (editing?.connected === false ? (zh ? "重新连接" : "Reconnect") : (zh ? "保存授权" : "Save access")))) { setError(""); setSubmittedRevision(payload.expected_revision); setSubmitted(true); }
    else setError(zh ? "来源信息已变化或缺少操作条件，请刷新后重试。" : "Source information changed or is incomplete. Refresh and try again.");
  };
  return <SettingsGroup title={zh ? "知识与记忆" : "Knowledge & memory"}>
    <div className="opl-resource-group-heading"><p>{zh ? "连接已有的 Obsidian 或 Markdown 资料库，选择哪些应用可以使用。资料继续在原处维护。" : "Connect an existing Obsidian or Markdown library and choose which apps can use it. Keep editing your notes in their original location."}</p><div className="runtime-setting-control"><button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={() => { if (!run("knowledge_source_check", {}, zh ? "检查知识来源" : "Check knowledge sources")) onRefresh(); }}><RefreshCw size={14} aria-hidden="true" />{zh ? "检查" : "Check"}</button>{connect ? <button type="button" className="settings-action-button primary" disabled={actionBusyKey !== null} onClick={() => openForm("new")}><FolderPlus size={14} aria-hidden="true" />{zh ? "连接资料库" : "Connect library"}</button> : null}</div></div>
    {projection?.entries.length ? <div className="opl-shared-resource-list">{projection.entries.map(source => <article key={source.resourceId} className="opl-shared-resource-row" data-testid="opl-knowledge-source">
      <div className="opl-shared-resource-heading"><div><h3>{source.label}</h3><p>{projection.contexts.find(context => context.contextId === source.contextId)?.label ?? (zh ? "当前工作区" : "Current workspace")} · {source.consumerDomainIds.length ? source.consumerDomainIds.map(id => projection.consumers.find(consumer => consumer.domainId === id)?.label ?? id).join(zh ? "、" : ", ") : (zh ? "尚未授权应用" : "No apps authorized")}</p></div>{source.connected === false ? <span className="settings-status" data-tone="neutral">{zh ? "已断开" : "Disconnected"}</span> : <StatusValue status={knowledgeSourceStatus(source)} locale={locale} />}</div>
      <div className="opl-shared-resource-footer"><span className="settings-muted">{dateLabel(source.observedAt, locale) ? `${zh ? "最近检查" : "Last checked"} ${dateLabel(source.observedAt, locale)}` : (zh ? "尚未完成检查" : "Not checked yet")}</span><div className="runtime-setting-control">{canRun(source, "knowledge_source_check") ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={() => run("knowledge_source_check", { resource_id: source.resourceId }, zh ? "检查知识来源" : "Check source")}><RefreshCw size={14} aria-hidden="true" />{zh ? "检查" : "Check"}</button> : null}{canRun(source, "knowledge_source_configure") ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={() => openForm(source)}><Settings2 size={14} aria-hidden="true" />{source.connected === false ? (zh ? "重新连接" : "Reconnect") : (zh ? "管理授权" : "Manage access")}</button> : null}{canRun(source, "knowledge_source_disconnect") ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={() => run("knowledge_source_disconnect", { resource_id: source.resourceId, expected_revision: source.revisionIdentity }, zh ? "断开资料库" : "Disconnect library")}><Unplug size={14} aria-hidden="true" />{zh ? "断开" : "Disconnect"}</button> : null}</div></div>
      {source.accessEditable === false ? <p className="settings-inline-note">{zh ? "此资料库按项目分别授权，请在原资料库配置中调整权限。" : "This library has project-specific access. Ask its source manager to adjust those permissions."}</p> : null}
      <details className="opl-resource-details"><summary>{zh ? "查看详情" : "View details"}</summary><dl><div><dt>{zh ? "授权" : "Authorization"}</dt><dd>{stateLabel(source.authorizationStatus, zh)}</dd></div><div><dt>{zh ? "资料版本" : "Source revision"}</dt><dd>{stateLabel(source.revisionStatus, zh)}</dd></div><div><dt>{zh ? "资料时效" : "Freshness"}</dt><dd>{stateLabel(source.freshnessStatus, zh)}</dd></div><div><dt>{zh ? "知识归属" : "Knowledge scope"}</dt><dd>{source.scopeIds.join(zh ? "、" : ", ") || "—"}</dd></div>{source.knowledgeHealth ? <KnowledgeHealthDetails health={source.knowledgeHealth} zh={zh} /> : null}</dl></details>
    </article>)}</div> : <p className="settings-inline-note" data-testid="opl-app-management-knowledge-empty">{projection?.status === "not_configured" ? (zh ? "还没有连接资料库。连接后，可为各应用分别设置读取和维护权限。" : "No library is connected. Connect one to grant read and editing access to your apps.") : (zh ? "知识来源尚未返回。刷新状态后可查看资料库及授权。" : "Knowledge sources have not been returned. Refresh to view libraries and access.")}</p>}
    {editing ? <form className="opl-resource-form" data-testid="opl-knowledge-source-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className="opl-resource-form-heading"><h3>{editing === "new" ? (zh ? "连接资料库" : "Connect library") : `${zh ? "管理授权" : "Manage access"} · ${editing.label}`}</h3><button type="button" className="settings-inline-command" onClick={() => { setEditing(null); setLocation(""); }}>{zh ? "取消" : "Cancel"}</button></div>
      {editing === "new" ? <><label><span>{zh ? "用于哪个工作区" : "Workspace"}</span><select value={contextId} onChange={event => { setContextId(event.currentTarget.value); const next = projection?.contexts.find(context => context.contextId === event.currentTarget.value); setScopeText((next?.defaultScopeIds ?? next?.availableScopeIds ?? []).join(", ")); }}>{projection?.contexts.map(context => <option key={context.contextId} value={context.contextId}>{context.label}</option>)}</select></label><label><span>{zh ? "资料库名称" : "Library name"}</span><input value={label} onChange={event => setLabel(event.currentTarget.value)} placeholder={zh ? "例如：个人 Obsidian 资料库" : "For example: Personal Obsidian library"} /></label><label><span>{sourceMode === "vault" ? (zh ? "Obsidian / Markdown 资料夹位置" : "Obsidian / Markdown folder") : (zh ? "已有来源登记文件" : "Existing source registry")}</span><input value={location} onChange={event => setLocation(event.currentTarget.value)} autoComplete="off" placeholder={sourceMode === "vault" ? "/Users/…/Documents" : "/Users/…/knowledge-sources.json"} required />{sourceMode === "vault" && onPickDirectory ? <button type="button" className="settings-action-button" disabled={picking} onClick={() => void pickDirectory()}>{picking ? (zh ? "正在选择…" : "Selecting…") : (zh ? "选择文件夹" : "Choose folder")}</button> : null}</label></> : null}
      {scopeOptions.length ? <fieldset><legend>{zh ? "资料用于" : "Knowledge scope"}</legend>{scopeOptions.map(option => <label key={option.id}><input type="checkbox" checked={splitIds(scopeText).includes(option.id)} onChange={event => setScopeText((event.currentTarget.checked ? [...splitIds(scopeText), option.id] : splitIds(scopeText).filter(id => id !== option.id)).join(", "))} />{option.label}</label>)}</fieldset> : null}
      <fieldset><legend>{zh ? "可使用此资料库的应用" : "Apps that can use this library"}</legend><p>{zh ? "选择读取范围；维护权限允许应用经审阅流程更新资料。" : "Choose who can read. Editing access allows apps to update notes through the review flow."}</p>{projection?.consumers.length ? <div className="opl-resource-consumers">{projection.consumers.map(consumer => <div key={consumer.domainId}><label><input type="checkbox" checked={readers.includes(consumer.domainId)} onChange={event => { const checked = event.currentTarget.checked; setReaders(current => checked ? [...current, consumer.domainId] : current.filter(id => id !== consumer.domainId)); if (!checked) setWriters(current => current.filter(id => id !== consumer.domainId)); }} /><span>{consumer.label}</span></label><label><input type="checkbox" checked={writers.includes(consumer.domainId)} disabled={!readers.includes(consumer.domainId)} onChange={event => { const checked = event.currentTarget.checked; setWriters(current => checked ? [...current, consumer.domainId] : current.filter(id => id !== consumer.domainId)); }} /><span>{zh ? "可维护" : "Can edit"}</span></label></div>)}</div> : <p>{zh ? "当前没有可授权的应用，请先安装应用再刷新。" : "No apps are available to authorize. Install an app and refresh."}</p>}</fieldset>
      <details className="opl-resource-details" open={!scopeText.trim()}><summary>{zh ? "高级设置" : "Advanced settings"}</summary>{editing === "new" ? <label><span>{zh ? "来源类型" : "Source type"}</span><select value={sourceMode} onChange={event => { setSourceMode(event.currentTarget.value as "vault" | "registry"); setLocation(""); }}><option value="vault">{zh ? "Obsidian / Markdown 资料夹" : "Obsidian / Markdown folder"}</option><option value="registry">{zh ? "复用已有来源登记" : "Reuse existing source registry"}</option></select></label> : null}<label><span>{zh ? "知识归属标识" : "Knowledge scope IDs"}</span>{editing !== "new" && editing.scopeExpansionAllowed === false ? <select multiple value={splitIds(scopeText)} onChange={event => setScopeText(Array.from(event.currentTarget.selectedOptions, option => option.value).join(", "))}>{editing.availableScopeIds.map(id => <option key={id} value={id}>{id}</option>)}</select> : <input value={scopeText} onChange={event => setScopeText(event.currentTarget.value)} placeholder={zh ? "个人、主题或项目标识，以逗号分隔" : "Person, topic or project IDs, separated by commas"} required />}</label>{editing === "new" ? <label><span>{zh ? "来源标识" : "Source ID"}{sourceMode === "vault" ? (zh ? "（可选）" : " (optional)") : ""}</span><input value={sourceId} onChange={event => setSourceId(event.currentTarget.value)} required={sourceMode === "registry"} /></label> : null}</details>
      {error ? <p className="opl-resource-form-error" role="alert">{error}</p> : null}{submitted ? <p role="status">{zh ? "已提交操作，请查看上方结果。保存成功后会重新读取来源。" : "Operation submitted. Review the result above; sources are reread after saving."}</p> : null}<div className="opl-resource-form-actions"><button className="settings-action-button primary" type="submit" disabled={actionBusyKey !== null}><Check size={14} aria-hidden="true" />{editing === "new" ? (zh ? "连接资料库" : "Connect library") : (editing?.connected === false ? (zh ? "重新连接" : "Reconnect") : (zh ? "保存授权" : "Save access"))}</button></div>
    </form> : null}
  </SettingsGroup>;
}
