import { useEffect, useState, type ReactNode } from "react";
import { Boxes, ChevronLeft, ChevronRight, RefreshCw, Search, X } from "lucide-react";
import { diffLines } from "diff";
import type { SlotCore } from "@deepseek-ai/dsh-client-ui-slots";
import type { OplStudioSurface } from "./oplStudioSurface";
import { contributionLabel, type OplContributionActionOutcome, type OplContributionSlotOwner, type OplUiContribution, type OplUiContributionCommand } from "./contributionProjection";
import { declaredItemActions, itemIdentity, itemSummary, itemTitle, parseWorkspaceInput, record, workspaceEntries, workspaceGroups, type WorkspaceCollection, type WorkspaceCommandInput, type WorkspaceField } from "./workspaceViewModel";
import { ProjectedContribution } from "./contributionComponents";
import "./workspace.css";

function label(name: string, zh: boolean) {
  const labels: Record<string, string> = {
    title: "标题", summary: "摘要", body: "正文", source_refs: "来源证据", evidence_refs: "证据引用", status: "状态", name: "姓名", aliases: "其他称呼",
    context_id: "场景", entity_id: "人物", memory_id: "记忆", proposal_id: "提案", approval_ref: "审核记录", expected_digest: "内容指纹",
    target_path: "目标路径", operation: "操作", frontmatter: "笔记属性", links: "相关链接", tags: "标签", statement: "内容", category: "类别",
    content: "内容", relationship: "关系", preferences: "偏好", instructions: "要求", output_target: "输出目标", decision: "审核决定",
    enabled: "启用", reason: "原因", approval: "审批", receipt: "执行回执", entity_kind: "类型", display_name: "名称",
    created_at: "创建时间", updated_at: "更新时间", external_write_allowed: "允许对外写入", required: "需要确认",
    proposal: "拟执行内容", proposal_digest: "内容指纹", proposal_kind: "提案类型", target: "输出目标", payload: "内容",
    guidance: "场景要求", person_id: "人物", owner_package_id: "来源模块", owner_ref: "来源接口", confidence: "可信度",
    capture_id: "捕获记录", item_kind: "条目类型", scope: "授权范围", expires_at: "到期时间",
    external_approval: "写入授权", binding_id: "知识库绑定", provider_id: "资源提供方", capability_id: "能力",
    external_approval_ref: "写入授权记录", resource_ref: "资源位置", authority_ref: "实际输出位置",
    readback: "写入核验", matches_written_bytes: "内容与写入一致", bytes: "文件大小", digest: "内容指纹",
    memory_kind: "记忆类型", person_ids: "关联人物", context_ids: "适用场景", mode: "工作模式", review: "审核记录", confirmation: "确认写入",
    source_ref: "邮件来源", policy_refs: "处理规则", query: "搜索", account: "邮箱", folder: "文件夹", since: "开始日期", until: "结束日期",
    to: "收件人", cc: "抄送", bcc: "密送", subject: "主题", draft_ref: "草稿", before: "修改前", after: "修改后",
    body_text: "正文", review_target: "审核对象", headers: "邮件头", attachments: "附件", memories: "相关记忆"
  };
  return zh ? labels[name] ?? name.replaceAll("_", " ") : name.replaceAll("_", " ");
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function initialValues(spec: WorkspaceCommandInput, defaults: Record<string, unknown>) {
  const result: Record<string, string | boolean> = {};
  for (const [name, field] of Object.entries(spec.fields)) {
    const value = defaults[name] ?? spec.defaults[name];
    result[name] = field.type === "boolean" ? value === true : field.type === "string_list" && Array.isArray(value) ? value.join("\n")
      : name === "approval_ref" && value === undefined ? `studio-review:${crypto.randomUUID()}` : valueText(value);
  }
  return result;
}

export function WorkspaceInputForm({ title, spec, defaults, zh, available, developer, submitInput, close }: {
  title: string; spec: WorkspaceCommandInput; defaults: Record<string, unknown>; zh: boolean; available: boolean;
  developer?: boolean; submitInput(input: Record<string, unknown>): Promise<OplContributionActionOutcome>; close?(): void;
}) {
  const [values, setValues] = useState(() => initialValues(spec, defaults));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [inspectRequired, setInspectRequired] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || inspectRequired) return;
    setError(""); setBusy(true);
    try {
      const result = await submitInput(parseWorkspaceInput(spec.fields, values));
      if (result.status === "succeeded") close?.();
      else {setError(result.message ?? (zh ? "已取消，输入已保留" : "Cancelled; input retained")); setInspectRequired(result.retryable === false);}
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  const fieldControl = (name: string, field: WorkspaceField): ReactNode => {
    const common = { id: `workspace-field-${name}`, required: field.required && field.type !== "string_list", disabled: !available || busy };
    if (field.type === "boolean") return <input {...common} type="checkbox" required={false} checked={values[name] === true} onChange={e => setValues({...values, [name]: e.target.checked})} />;
    if (field.enum) return <select {...common} value={String(values[name] ?? "")} onChange={e => setValues({...values, [name]: e.target.value})}><option value="">{zh ? "请选择" : "Select"}</option>{field.enum.map(option => <option key={option} value={option}>{displayValue(option, zh)}</option>)}</select>;
    if (field.options?.length) return <select {...common} multiple={field.type === "string_list"} value={field.type === "string_list" ? String(values[name] ?? "").split("\n").filter(Boolean) : String(values[name] ?? "")} onChange={e => setValues({...values, [name]: field.type === "string_list" ? Array.from(e.target.selectedOptions).map(option => option.value).join("\n") : e.target.value})}>{field.type !== "string_list" ? <option value="">{zh ? "请选择" : "Select"}</option> : null}{field.options.map(option => <option key={option.value} value={option.value}>{contributionLabel(option.label, zh ? "zh" : "en", option.value)}</option>)}</select>;
    if (field.type === "object" || field.type === "string_list" || ["body", "content", "summary", "statement", "instructions"].includes(name)) return <textarea {...common} rows={field.type === "object" ? 4 : 3} value={String(values[name] ?? "")} onChange={e => setValues({...values, [name]: e.target.value})} />;
    return <input {...common} min={field.minimum} max={field.maximum} step={field.type === "number" ? "any" : undefined} readOnly={name in defaults && ["proposal_id", "memory_id", "person_id", "expected_digest"].includes(name)} type={field.type === "number" || field.type === "integer" ? "number" : "text"} value={String(values[name] ?? "")} onChange={e => setValues({...values, [name]: e.target.value})} />;
  };
  const technical = (name: string) => !developer && ((name in defaults && technicalFields.has(name)) || name === "approval_ref");
  const field = ([name, spec]: [string, WorkspaceField]) => <label key={name} htmlFor={`workspace-field-${name}`}><span>{label(name, zh)}{spec.required ? " *" : ""}</span>{fieldControl(name, spec)}</label>;
  return <form className="opl-workspace-form" onSubmit={submit} aria-label={title}>
    <header><h3>{title}</h3>{close ? <button type="button" disabled={busy} title={zh ? "取消" : "Cancel"} aria-label={zh ? "取消" : "Cancel"} onClick={close}><X size={16}/></button> : null}</header>
    {Object.entries(spec.fields).filter(([name]) => !technical(name)).map(field)}
    {Object.keys(spec.fields).some(technical) ? <details><summary>{zh ? "审核绑定信息" : "Review binding details"}</summary>{Object.entries(spec.fields).filter(([name]) => technical(name)).map(field)}</details> : null}
    {error ? <p role="alert">{error}</p> : null}
    <footer>{close ? <button type="button" disabled={busy} onClick={close}>{zh ? "取消" : "Cancel"}</button> : null}<button type="submit" disabled={!available || busy || inspectRequired}>{busy ? (zh ? "处理中" : "Working") : title}</button></footer>
  </form>;
}

function displayValue(value: unknown, zh: boolean) {
  const states: Record<string, string> = {pending: "待审核", approved: "已批准", rejected: "已拒绝", applied: "已应用", candidate: "候选", forgotten: "已忘记", staged: "待整理", routed: "已安排", consumed: "已处理", discarded: "已丢弃", confirmed: "确认", create: "新建", update: "更新", true: "是", false: "否", all: "全部", active: "当前", history: "历史", unreviewed: "未审核", open: "待处理", waiting: "等待回复", closed: "已完成", none: "未分类"};
  const text = valueText(value);
  return zh ? states[text] ?? text : text;
}

const technicalFields = new Set(["schema_version", "proposal_id", "person_id", "memory_id", "proposal_digest", "expected_digest", "approval_ref", "external_approval_ref", "digest", "created_at", "updated_at", "owner_ref", "owner_package_id"]);
const detailOrder = ["summary", "status", "payload", "body", "content", "statement", "proposal", "source_refs", "evidence_refs", "external_approval", "receipt", "approval"];
function orderedDetails(value: Record<string, unknown>) {
  const order = (key: string) => detailOrder.indexOf(key) < 0 ? detailOrder.length : detailOrder.indexOf(key);
  return Object.entries(value).filter(([key]) => key !== "schema_version").sort(([a], [b]) => order(a) - order(b));
}

function DetailValue({ value, zh, depth = 0, developer = false }: { value: unknown; zh: boolean; depth?: number; developer?: boolean }): ReactNode {
  if (depth > 8) return <span>...</span>;
  if (Array.isArray(value)) return <ul>{value.map((item, index) => <li key={index}><DetailValue value={item} zh={zh} depth={depth + 1} developer={developer}/></li>)}</ul>;
  if (value && typeof value === "object") {
    const entries = orderedDetails(value as Record<string, unknown>);
    const rows = (items: [string, unknown][]) => <dl>{items.map(([key, item]) => <div key={key}><dt>{label(key, zh)}</dt><dd><DetailValue value={item} zh={zh} depth={depth + 1} developer={developer}/></dd></div>)}</dl>;
    const technical = entries.filter(([key]) => technicalFields.has(key));
    return <>{rows(entries.filter(([key]) => developer || !technicalFields.has(key)))}{!developer && technical.length ? <details><summary>{zh ? "技术详情" : "Technical details"}</summary>{rows(technical)}</details> : null}</>;
  }
  return <span>{displayValue(value, zh) || "-"}</span>;
}

export function WorkspaceReviewPreview({ value, zh }: { value: Record<string, unknown>; zh: boolean }) {
  const preview = record(value.preview) ?? value;
  const payload = record(value.payload) ?? {};
  const reviewTarget = record(value.review_target) ?? {};
  const after = typeof preview.after === "string" ? preview.after : preview.body ?? payload.body ?? value.body_text ?? value.body ?? value.content ?? value.statement ?? value.summary;
  const before = preview.before;
  const target = preview.target ?? value.target_path ?? payload.target_path ?? reviewTarget.to ?? reviewTarget.source_ref ?? value.to ?? value.display_name ?? value.title ?? value.draft_ref ?? value.proposal_id ?? value.person_id ?? value.memory_id ?? value.source_ref;
  const evidence = preview.evidence_refs ?? value.evidence_refs ?? value.source_refs;
  return <section className="opl-workspace-review" aria-label={zh ? "审核内容" : "Review content"}>
    {target ? <p><strong>{zh ? "目标" : "Target"}</strong><span>{valueText(target)}</span></p> : null}
    {value.subject || payload.subject || reviewTarget.subject ? <p><strong>{zh ? "主题" : "Subject"}</strong><span>{valueText(value.subject ?? payload.subject ?? reviewTarget.subject)}</span></p> : null}
    {["cc", "bcc", "attachments"].filter(key => value[key] || reviewTarget[key]).map(key => <p key={key}><strong>{label(key, zh)}</strong><span>{valueText(value[key] ?? reviewTarget[key])}</span></p>)}
    {typeof before === "string" && typeof after === "string" ? <div className="opl-workspace-diff" aria-label={zh ? "修改差异" : "Changes"}>{diffLines(before, after).map((part, index) => <pre key={index} data-change={part.added ? "added" : part.removed ? "removed" : "unchanged"}><span aria-hidden="true">{part.added ? "+ " : part.removed ? "- " : "  "}</span>{part.value}</pre>)}</div>
      : after !== undefined ? <pre className="opl-workspace-document">{valueText(after)}</pre> : null}
    {evidence ? <details><summary>{zh ? "来源证据" : "Evidence"}</summary><DetailValue value={evidence} zh={zh}/></details> : null}
  </section>;
}

export function WorkspaceCollectionView({ collection, entry, owner, onRead, readValues = {}, readBusy = false, readError = "" }: {
  collection: WorkspaceCollection; entry: OplUiContribution; owner: OplContributionSlotOwner;
  onRead?(input: Record<string, unknown>): void; readValues?: Record<string, unknown>; readBusy?: boolean; readError?: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [action, setAction] = useState<{command: OplUiContributionCommand; defaults: Record<string, unknown>; title?: string} | null>(null);
  const [feedback, setFeedback] = useState("");
  const zh = owner.locale === "zh";
  const items = collection.items.map((item, index) => ({item, id: itemIdentity(item, index), title: itemTitle(item, index, owner.locale), summary: itemSummary(item, owner.locale)}));
  const serverSearch = Boolean(onRead && collection.readInput.fields.query);
  const filtered = serverSearch ? items : items.filter(({item, title, summary}) => `${title} ${summary} ${valueText(item.status)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const current = filtered.find(item => item.id === selected) ?? filtered[0];
  const collectionActions = declaredItemActions({actions: collection.collectionActions}, entry.commands);
  useEffect(() => { setAction(null); setSelected(null); setQuery(""); }, [entry.contributionKey]);
  const runAction = async (command: OplUiContributionCommand, defaults: Record<string, unknown>) => {
    const result = await owner.onAction(entry, command, defaults, current?.item);
    const outcome = result ?? {status: "failed" as const, message: zh ? "未收到执行结果，请刷新核实" : "No execution result; refresh to inspect"};
    setFeedback(outcome.message ?? (outcome.status === "succeeded" ? (zh ? "操作已完成" : "Completed") : zh ? "已取消，输入已保留" : "Cancelled; input retained"));
    return outcome;
  };
  const prepareAction = (command: OplUiContributionCommand, defaults: Record<string, unknown> = {}, title?: string) => {
    const spec = collection.commandInputs[command.actionRef];
    if (!command.confirmationRequired && spec && Object.entries(spec.fields).every(([name, field]) => !field.required || name in defaults)) void runAction(command, defaults).catch(reason => setFeedback(String(reason)));
    else if (spec && Object.keys(spec.fields).length) setAction({command, defaults, title});
    else if (spec || Object.keys(defaults).length) void runAction(command, defaults).catch(reason => setFeedback(String(reason)));
  };
  const advancedFields = Object.fromEntries(Object.entries(collection.readInput.fields).filter(([name]) => !["query", "status", "offset", "limit"].includes(name)));
  const advanced = Object.keys(advancedFields).length && onRead ? <WorkspaceInputForm title={zh ? "读取" : "Read"} spec={{...collection.readInput, fields: advancedFields}} defaults={readValues} zh={zh} available={!readBusy} submitInput={async input => {onRead({...readValues, ...input, offset: 0}); return {status: "succeeded"};}}/> : null;
  return <div className="opl-workspace-collection">
    {Object.keys(readValues).some(key => key.endsWith("_ref") && collection.readInput.fields[key]) && onRead ? <button type="button" onClick={() => onRead({})}><ChevronLeft size={14}/>{zh ? "返回列表" : "Back to list"}</button> : null}
    {collection.state === "input_required" ? advanced : <><form className="opl-workspace-toolbar" onSubmit={e => {e.preventDefault(); if (serverSearch) onRead?.({...readValues, query, offset: 0});}}><label><Search size={15} aria-hidden="true"/><input type="search" aria-label={zh ? "搜索条目" : "Search items"} value={query} onChange={e => setQuery(e.target.value)}/></label>{serverSearch ? <button type="submit" title={zh ? "搜索" : "Search"} aria-label={zh ? "搜索" : "Search"} disabled={readBusy}><Search size={15}/></button> : null}
      {collection.readInput.fields.status?.enum && onRead ? <select aria-label={zh ? "筛选状态" : "Filter status"} value={String(readValues.status ?? collection.readInput.defaults.status ?? "")} onChange={e => onRead({...readValues, status: e.target.value || undefined, offset: 0})}><option value="">{zh ? "默认状态" : "Default status"}</option>{collection.readInput.fields.status.enum.map(status => <option key={status} value={status}>{displayValue(status, zh)}</option>)}</select> : null}<span>{collection.pagination?.total ?? filtered.length}</span></form>{advanced ? <details><summary>{zh ? "读取条件" : "Read options"}</summary>{advanced}</details> : null}</>}
    {readBusy ? <p role="status">{zh ? "正在读取" : "Loading"}</p> : null}
    {readError ? <p role="alert">{readError}<button type="button" onClick={() => onRead?.(readValues)}>{zh ? "重新读取" : "Retry read"}</button></p> : null}
    {feedback ? <p role="status" className="opl-workspace-feedback">{feedback}</p> : null}
    <div className="opl-workspace-commandbar">{collectionActions.map(({command, input, label}) => <button key={command.commandId} type="button" disabled={!owner.actionAvailable} onClick={() => prepareAction(command, input, contributionLabel(label ?? command.label, owner.locale, command.commandId))}>{contributionLabel(label ?? command.label, owner.locale, command.commandId)}</button>)}</div>
    {action && collection.commandInputs[action.command.actionRef] ? <WorkspaceInputForm key={`${action.command.actionRef}:${valueText(action.defaults)}`} title={action.title ?? contributionLabel(action.command.label, owner.locale, action.command.commandId)} defaults={action.defaults} spec={collection.commandInputs[action.command.actionRef]} zh={zh} available={owner.actionAvailable} developer={owner.developerDetails} submitInput={input => runAction(action.command, input)} close={() => setAction(null)}/> : null}
    {collection.state !== "ready" ? <p role="status" title={collection.reason}>{collection.state === "input_required" ? (zh ? "请选择读取对象" : "Choose what to read") : (zh ? "数据暂不可用" : "Data unavailable")}</p> : !filtered.length ? <p className="opl-workspace-empty" role="status">{query ? (zh ? "没有匹配条目" : "No matches") : contributionLabel(entry.view?.emptyState ?? {}, owner.locale, zh ? "暂无条目" : "No items")}</p> : <div className="opl-workspace-split" data-view-type={entry.view?.viewType}>
      <div className="opl-workspace-items" role="list" aria-label={zh ? "条目" : "Items"}>{filtered.map(({item, id, title, summary}) => <div role="listitem" key={id}><button type="button" aria-current={current?.id === id ? "true" : undefined} onClick={() => {setSelected(id); setAction(null);}}><span>{["timeline", "activity_log"].includes(entry.view?.viewType ?? "") && (item.created_at || item.updated_at || item.date) ? <time>{valueText(item.created_at ?? item.updated_at ?? item.date)}</time> : null}<strong>{title}</strong>{summary && summary !== title ? <small>{summary}</small> : null}<small>{item.status ? displayValue(item.status, zh) : ""}</small></span><ChevronRight size={14} aria-hidden="true"/></button></div>)}</div>
      {current ? <article className="opl-workspace-detail"><h3>{current.title}</h3>
        {record(current.item.read_input) && onRead ? <button type="button" disabled={readBusy} onClick={() => onRead(record(current.item.read_input)!)}>{zh ? "读取详情" : "Read details"}</button> : null}
        {declaredItemActions(current.item, entry.commands).length ? <div className="opl-workspace-commandbar">{declaredItemActions(current.item, entry.commands).map(({command, input, label}) => <button type="button" key={`${command.commandId}:${valueText(input)}`} disabled={!owner.actionAvailable} onClick={() => prepareAction(command, input, contributionLabel(label ?? command.label, owner.locale, command.commandId))}>{contributionLabel(label ?? command.label, owner.locale, command.commandId)}</button>)}</div> : null}
        <WorkspaceReviewPreview value={current.item} zh={zh}/>
        <DetailValue value={Object.fromEntries(orderedDetails(current.item).filter(([name]) => !["actions", "read_input", "preview", "title", "display_name", "name", "id", "proposal_digest", "label_i18n", "title_i18n", "summary_i18n", "summary", "source_refs", "evidence_refs", "body", "body_text", "content", "payload", "proposal", "review_target"].includes(name)))} zh={zh} developer={owner.developerDetails}/>
        {current.item.payload || current.item.proposal || current.item.review_target ? <details><summary>{zh ? "完整记录" : "Full record"}</summary><DetailValue value={current.item.payload ?? current.item.proposal ?? current.item.review_target} zh={zh} developer={owner.developerDetails}/></details> : null}
      </article> : null}
    </div>}
    {collection.pagination && onRead ? <footer className="opl-workspace-pagination"><button type="button" title={zh ? "上一页" : "Previous page"} aria-label={zh ? "上一页" : "Previous page"} disabled={readBusy || collection.pagination.offset === 0} onClick={() => onRead({...readValues, offset: Math.max(0, collection.pagination!.offset - collection.pagination!.limit)})}><ChevronLeft size={16}/></button><span>{collection.pagination.total ? `${collection.pagination.offset + 1}-${collection.pagination.offset + items.length} / ${collection.pagination.total}` : "0"}</span><button type="button" title={zh ? "下一页" : "Next page"} aria-label={zh ? "下一页" : "Next page"} disabled={readBusy || !collection.pagination.hasMore} onClick={() => onRead({...readValues, offset: collection.pagination!.offset + collection.pagination!.limit})}><ChevronRight size={16}/></button></footer> : null}
  </div>;
}

export const name = "opl-workspace-client";

// DSH owns the main-page and sidebar slots. This client plugin consumes the
// admitted Package views and keeps only the selected view across page visits.
export function installWorkspaceClientPlugin(core: SlotCore, useSurface: () => OplStudioSurface) {
  let selectedView: string | null = null;
  function Page() {
    const surface = useSurface();
    const [selection, setSelection] = useState<string | null>(() => selectedView);
    const [revision, setRevision] = useState(0);
    const entries = workspaceEntries(surface.uiContributions.entries);
    const groups = workspaceGroups(entries);
    const current = entries.find(entry => entry.contributionKey === selection) ?? entries[0];
    const zh = surface.locale === "zh";
    const groupLabel = (key: string) => ({personal: zh ? "个人" : "Personal", communications: zh ? "通信" : "Communication", knowledge: zh ? "知识" : "Knowledge", other: zh ? "其他能力" : "Other capabilities"}[key] ?? key);
    return <section className="opl-workspace-page" aria-label={zh ? "能力工作台" : "Capability workspace"}>
      <header><div><Boxes size={18} aria-hidden="true"/><h2>{zh ? "能力工作台" : "Capability workspace"}</h2></div><span title={surface.workspacePath}>{surface.workspacePath.split("/").filter(Boolean).at(-1)}</span><button type="button" aria-label={zh ? "刷新" : "Refresh"} title={zh ? "刷新" : "Refresh"} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16}/></button><button type="button" aria-label={zh ? "返回聊天" : "Back to chat"} title={zh ? "返回聊天" : "Back to chat"} onClick={() => surface.openPrimaryView("conversation")}><ChevronLeft size={18}/></button></header>
      <div className="opl-workspace-body"><nav aria-label={zh ? "工作台视图" : "Workspace views"}>{groups.map(group => <section key={group.key}><h3>{groupLabel(group.key)}</h3>{group.entries.map(entry => <button key={entry.contributionKey} type="button" title={surface.contributionOwner.developerDetails ? entry.packageId : undefined} aria-current={current?.contributionKey === entry.contributionKey ? "page" : undefined} onClick={() => {selectedView = entry.contributionKey; setSelection(selectedView);}}>{contributionLabel(entry.view?.title ?? {}, surface.locale, entry.contributionId)}</button>)}</section>)}</nav>
        <div className="opl-workspace-content">{current ? <ProjectedContribution key={current.contributionKey} entry={current} owner={{...surface.contributionOwner, refreshRevision: surface.contributionOwner.refreshRevision + revision}}/> : <p role="status">{zh ? "当前没有可用的能力视图，请检查模块安装和运行状态。" : "No capability views are available. Check module installation and runtime status."}</p>}</div>
      </div>
    </section>;
  }
  const disposers = [
    core.register({name: "sidebar.panellist", id: "workspace", order: 10, registrant: name}, ({ size }: {size: number}) => <Boxes size={size} aria-hidden="true"/>),
    core.register({name: "main", key: "workspace", registrant: name}, Page)
  ];
  return () => {disposers.forEach(dispose => dispose()); selectedView = null;};
}

export const workspaceClientPlugin = { name, install: installWorkspaceClientPlugin };
