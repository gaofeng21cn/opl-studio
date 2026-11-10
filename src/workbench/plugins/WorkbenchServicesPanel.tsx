import "./WorkbenchServicesPanel.css";
import { Button } from "../../vendor/deepseek-harness/packages/client/ui-primitives/src/Button";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SettingsActionRequest } from '../settingsActions';
import { TaskManagerPage, createEditorStore, scheduleManagerEn, scheduleManagerZh } from '../../integrations/deepseek-harness/scheduleComponents.mjs';
import { createDshScheduleController } from '../../composition/dshScheduleController';
import { taskOwnerValues, timingFromOplDraft, validTaskOwnerValues } from '../../composition/dshScheduleAdapterModel';
import { bindSnapshotSelector } from '../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/bind.ts';

export type WorkbenchServicesClient = {
  read(operation: string, input?: Record<string, unknown>): Promise<unknown>;
  openThread(id: string): Promise<string | null>;
  execute(operation: string, input: Record<string, unknown>, label: string): Promise<{ status: string; [key: string]: unknown }>;
};
type Props = { onOpened?(): void; client: WorkbenchServicesClient; locale: 'zh' | 'en'; onAction(request: SettingsActionRequest): void; busy: boolean; revision?: string; cwd?: string };
const record = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const rows = (v: unknown): Record<string, any>[] => Array.isArray(v) ? v.map(record) : [];

export type WorkbenchErrorPresentation = {
  title: string;
  detail: string;
  nextStep: string;
};

/**
 * Electron adds a remote-method prefix to bridge failures. Keep that transport
 * detail out of the product UI and explain which part of the App is affected.
 */
export function presentWorkbenchError(error: unknown, locale: 'zh' | 'en'): WorkbenchErrorPresentation {
  const raw = String(error ?? '').replace(/^Error invoking remote method '[^']+':\s*Error:\s*/i, '').trim();
  const zh = locale === 'zh';
  if (/export is unavailable|update Framework/i.test(raw)) {
    return {
      title: zh ? '基础服务版本需要更新' : 'Base services need an update',
      detail: zh ? '计划任务、记忆管理和日志清理由 OPL Framework 提供，当前载体没有可用的工作台服务接口。普通 Codex 对话仍可继续。' : 'Scheduled tasks, memory management, and log cleanup are provided by OPL Framework. The active carrier does not expose the workbench service interface. Ordinary Codex conversations remain available.',
      nextStep: zh ? '在“更新与修复”中更新基础服务，重启 App 后再刷新。' : 'Update Base services in Runtime & Maintenance, restart the App, then refresh.'
    };
  }
  if (/workbench services are unavailable|workbench services have not initialized/i.test(raw)) {
    return {
      title: zh ? '基础服务暂不可用' : 'Base services are temporarily unavailable',
      detail: zh ? '计划任务、记忆管理和日志清理尚未连接到 OPL Framework。普通 Codex 对话不受影响。' : 'Scheduled tasks, memory management, and log cleanup are not connected to OPL Framework. Ordinary Codex conversations are unaffected.',
      nextStep: zh ? '先检查“更新与修复”，完成更新并重启后重新读取。' : 'Check Runtime & Maintenance, finish the update, restart, and read again.'
    };
  }
  if (/unsupported workbench schema|schema/i.test(raw)) {
    return {
      title: zh ? '基础服务接口版本不匹配' : 'Base service interface is incompatible',
      detail: zh ? 'App 与 OPL Framework 的工作台接口版本不同，因此暂时无法读取此页面。普通 Codex 对话仍可继续。' : 'The App and OPL Framework expose different workbench interface versions, so this page cannot be read yet. Ordinary Codex conversations remain available.',
      nextStep: zh ? '更新基础服务并重启 App。' : 'Update Base services and restart the App.'
    };
  }
  return {
    title: zh ? '读取失败' : 'Could not refresh this page',
    detail: zh ? '此页面暂时无法取得最新状态，已有的普通 Codex 对话不受影响。' : 'This page did not receive the latest service state. Existing ordinary Codex conversations are unaffected.',
    nextStep: zh ? '刷新一次；如果仍然失败，请在“更新与修复”中检查基础服务。' : 'Refresh once. If it still fails, check Base services in Runtime & Maintenance.'
  };
}

function useRead(client: WorkbenchServicesClient, operation: string, revision?: string) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const serial = useRef(0);
  const [observedAt, setObservedAt] = useState<Date | null>(null);
  const refresh = useCallback(async () => {
    const id = ++serial.current; setBusy(true); setError('');
    try { const value = await client.read(operation); if (id === serial.current) { setData(record(value)); setObservedAt(new Date()); } }
    catch (error) { if (id === serial.current) { setError(String(error)); } }
    finally { if (id === serial.current) setBusy(false); }
  }, [client, operation]);
  useEffect(() => { void refresh(); return () => { serial.current++; }; }, [refresh, revision]);
  return { data, error, busy, refresh, observedAt };
}
function action(props: Props, operation: string, input: Record<string, unknown>, label: string) {
  props.onAction({ key: `workbench:${operation}`, actionId: 'package_contribution_execute', label,
    payload: { package_id: 'opl-workbench-services', ref: `workbench#${operation}`, input: { ...input, requestId: crypto.randomUUID() } },
    confirmationRequired: true, dryRunSupported: true });
}
function ReadStatus({ value, zh }: { value: ReturnType<typeof useRead>; zh: boolean }) {
  const presentation = value.error ? presentWorkbenchError(value.error, zh ? 'zh' : 'en') : null;
  return <>
    {value.busy ? <p className="settings-inline-note" role="status">{zh ? '正在读取最新内容…' : 'Loading latest content…'}</p> : null}
    {value.error && value.data ? <p className="settings-inline-note">{zh ? '保留上次成功结果；涉及更改的操作暂时停用。' : 'Showing the last successful result; changes are temporarily disabled.'}</p> : null}
    {presentation && <div className="workbench-service-error" role="alert">
      <strong>{presentation.title}</strong>
      <p>{presentation.detail}</p>
      <small>{presentation.nextStep}</small>
    </div>}
  </>;
}

function formatBytes(value: unknown, locale: string, fallback: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = Math.max(0, value);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(size)} ${units[unit]}`;
}

function categoryLabel(category: Record<string, any>, zh: boolean): string {
  const id = String(category.id ?? '');
  if (id === 'codex_logs') return zh ? 'Codex 日志' : 'Codex logs';
  if (id === 'app_logs') return zh ? 'App 日志' : 'App logs';
  if (id === 'app_cache') return zh ? 'App 缓存' : 'App cache';
  return id || (zh ? '其他数据' : 'Other data');
}

function protectedCategoryLabel(category: Record<string, any>, zh: boolean): string {
  const id = String(category.id ?? '');
  if (id === 'app_data') return zh ? 'App 数据' : 'App data';
  if (id === 'runtime_substrate') return zh ? '运行环境' : 'Runtime';
  if (id === 'codex_home') return zh ? 'Codex Home' : 'Codex Home';
  return id || (zh ? '受保护数据' : 'Protected data');
}

export function remainingStorageBytes(total: unknown, selected: number): number | undefined {
  return typeof total === 'number' && Number.isFinite(total) && total >= 0 ? Math.max(0, total - selected) : undefined;
}

function translatedScheduleCopy(locale: 'zh' | 'en', key: string, params: Record<string, unknown> = {}): string {
  let value = (locale === 'zh' ? scheduleManagerZh : scheduleManagerEn)[key] ?? key;
  for (const [name, replacement] of Object.entries(params)) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}

export function scheduleRunStatus(status: unknown, zh: boolean): string {
  const labels: Record<string, [string, string]> = { completed: ['已完成', 'Completed'], failed: ['执行失败', 'Failed'], running: ['运行中', 'Running'], skipped: ['已跳过', 'Skipped'], cancelled: ['已取消', 'Cancelled'], timed_out: ['已超时', 'Timed out'] };
  return labels[String(status)]?.[zh ? 0 : 1] ?? (zh ? '待确认' : 'Pending');
}

function OplTaskHistory({ client, locale, onOpened, taskId }: { client: WorkbenchServicesClient; locale: 'zh' | 'en'; onOpened?(): void; taskId?: string }) {
  const [state, setState] = useState<{ items: Record<string, any>[]; status: 'loading' | 'ready' | 'error'; error?: string }>({ items: [], status: 'loading' });
  const serial = useRef(0);
  const [openError, setOpenError] = useState('');
  const refresh = useCallback(async () => {
    const current = ++serial.current;
    setState(current => ({ ...current, status: 'loading', error: undefined }));
    try {
      const result = record(await client.read('history', taskId ? { id: taskId } : {}));
      if (result.status !== 'available') throw new Error(String(result.reason ?? 'Task history is unavailable.'));
      if (current === serial.current) setState({ items: rows(result.items), status: 'ready' });
    } catch (error) { if (current === serial.current) setState(current => ({ ...current, status: 'error', error: String(error) })); }
  }, [client, taskId]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 15000);
    return () => { serial.current++; clearInterval(timer); };
  }, [refresh]);
  const zh = locale === 'zh';
  return <section className="opl-dsh-schedule-history" aria-label={zh ? 'OPL 执行历史' : 'OPL execution history'}>
    <div className="opl-dsh-schedule-history-heading"><h3>{zh ? (taskId ? '此任务的 Codex 执行历史' : 'Codex 执行历史') : (taskId ? 'Codex runs for this task' : 'Codex execution history')}</h3>
      <Button variant="ghost" size="sm" type="button" disabled={state.status === 'loading'} onClick={() => void refresh()}>{zh ? '刷新' : 'Refresh'}</Button></div>
    {state.status === 'loading' && <p role="status">{zh ? '正在读取…' : 'Loading…'}</p>}
    {state.status === 'error' && <div role="alert"><p>{state.error}</p><Button variant="outline" size="sm" onClick={() => void refresh()}>{zh ? '重试' : 'Retry'}</Button></div>}
    {state.status === 'ready' && state.items.length === 0 && <p>{zh ? '暂无执行记录。' : 'No executions yet.'}</p>}
    {state.items.map(run => <article key={`${run.workflowId}:${run.runId}`}>
      <div><strong>{run.title ?? run.taskId}</strong><small>{run.startTime ? new Date(run.startTime).toLocaleString(zh ? 'zh-CN' : 'en-US') : ''} · {scheduleRunStatus(run.result?.status, zh)}</small>
        {(run.result?.reason || run.result?.summary) && <p>{run.result.reason ?? run.result.summary}</p>}</div>
      {run.result?.threadId && <Button variant="ghost" size="sm" onClick={async () => { try { const error = await client.openThread(run.result.threadId); setOpenError(error ?? ''); if (!error) onOpened?.(); } catch (error) { setOpenError(String(error)); } }}>{zh ? '打开 Codex 结果' : 'Open Codex result'}</Button>}
    </article>)}
    {openError && <p role="alert">{zh ? '无法打开执行结果，请刷新后重试。' : 'Could not open this execution. Refresh and try again.'}</p>}
  </section>;
}

export function DshScheduledTasksPanel(props: Props) {
  const cwd = useRef(props.cwd ?? '');
  cwd.current = props.cwd ?? '';
  const controller = useMemo(() => createDshScheduleController({ client: props.client, getCwd: () => cwd.current }), [props.client]);
  const catalogHook = useMemo(() => bindSnapshotSelector(controller.catalog.hooks.catalog), [controller]);
  const useCatalog = useCallback((selector: (snapshot: any) => unknown) => catalogHook(selector), [catalogHook]);
  const editor = useMemo(() => createEditorStore().create(), []);
  const useEditorStore = useMemo(() => bindSnapshotSelector(editor.store), [editor]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const locale = props.locale;
  const t = useCallback((key: string, params?: Record<string, unknown>) => translatedScheduleCopy(locale, key, params), [locale]);
  const ownerView = useMemo(() => ({
    values: (entry: any) => taskOwnerValues(entry ? controller.ownerTask(entry.id) : undefined),
    validate: validTaskOwnerValues,
    targets: ['new'] as const,
    frequencies: ['once', 'minutely', 'hourly', 'daily', 'weekly'] as const,
    titleMaxLength: 160,
    promptMaxLength: 32000,
    cwdInput: true,
    minutePrecisionRecurrence: true,
    timing: timingFromOplDraft,
    renderFields: ({ values, disabled, onChange }: any) => <div className="opl-dsh-schedule-owner-fields">
      <label>{locale === 'zh' ? '执行权限' : 'Execution permissions'}<select value={String(values.permissions ?? ':read-only')} disabled={disabled}
        onChange={event => onChange({ ...values, permissions: event.target.value })}>
        <option value=":read-only">{locale === 'zh' ? '只读' : 'Read only'}</option><option value=":workspace">{locale === 'zh' ? '工作区可写' : 'Workspace write'}</option>
      </select></label>
      <label>{locale === 'zh' ? '超时（分钟）' : 'Timeout (minutes)'}<input type="number" min={1} max={120} step={1} required disabled={disabled}
        value={Number(values.timeoutMinutes ?? 30)} onChange={event => onChange({ ...values, timeoutMinutes: Number(event.target.value) })} /></label>
      <p>{locale === 'zh' ? '每次运行创建独立对话，使用 Codex 默认模型。App 保持运行时才能按计划执行。' : 'Each run creates a separate conversation with the default Codex model. Keep the App running for scheduled executions.'}</p>
    </div>,
    renderHistory: (entry: any) => <OplTaskHistory client={props.client} locale={locale} onOpened={props.onOpened} taskId={entry.id} />,
  }), [controller, locale, props.client, props.onOpened]);
  const history = historyExpanded ? <OplTaskHistory client={props.client} locale={locale} onOpened={props.onOpened} /> : null;
  const workspace = useMemo(() => ({ phase: 'ready', items: props.cwd ? [{ path: props.cwd, title: props.cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? props.cwd }] : [] }), [props.cwd]);
  const sessions = useMemo(() => ({ ids: [], byId: {} }), []);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void controller.refresh().catch(() => undefined); }, 15000);
    return () => clearInterval(timer);
  }, [controller]);
  useEffect(() => { if (props.revision) void controller.refresh().catch(() => undefined); }, [controller, props.revision]);
  const pageProps = useMemo(() => ({
    hooks: controller.catalog.hooks,
    useCatalog,
    useStore: useEditorStore,
    actions: editor.actions,
    onNewTask: () => undefined,
    manualCreateOnly: true,
    allowClearEnded: false,
    catalogFooter: <details className="opl-dsh-schedule-global-history" open={historyExpanded} onToggle={event => setHistoryExpanded(event.currentTarget.open)}>
      <summary>{locale === 'zh' ? 'Codex 执行历史（含已删除任务）' : 'Codex execution history, including deleted tasks'}</summary>{history}</details>,
    onRetry: controller.onRetry,
    onDelete: controller.catalog.onDelete,
    onCreateTask: controller.create,
    hostActions: { edit: controller.edit, run: controller.run, loadNewSessionInterval: async () => undefined },
    ownerView,
    onOpenSession: () => undefined,
    loadHistory: async () => ({ ok: false, error: { code: 'not-supported' } }),
    onOpenThread: props.client.openThread,
    useSessions: (selector: (value: any) => unknown) => selector(sessions),
    useWorkspaces: (selector: (value: any) => unknown) => selector(workspace),
    t,
  }), [controller, useCatalog, useEditorStore, editor, historyExpanded, locale, ownerView, props.client.openThread, sessions, workspace, t]);
  return <div className="opl-dsh-schedule-page" data-testid="opl-scheduled-tasks"><TaskManagerPage {...pageProps} /></div>;
}

export function MemoryManagerPanel(props: Props) {
  const { client, locale, revision } = props; const zh = locale === 'zh';
  const list = useRead(client, 'memory', revision);
  const [query, setQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [selected, setSelected] = useState<Record<string, any> | null>(null);
  const [content, setContent] = useState(''); const [correction, setCorrection] = useState(''); const [error, setError] = useState('');
  const serial = useRef(0);
  useEffect(() => { serial.current++; setSelected(null); if (revision?.split(':')[0]) setCorrection(''); }, [revision?.split(':')[0]]);
  async function open(id: string) { const seq = ++serial.current; setError(''); setSelected(null); try { const value = record(await client.read('memory_read', { id })); if (seq === serial.current) { setSelected(value); setContent(value.content); } } catch (error) { if (seq === serial.current) setError(String(error)); } }
  return <section className="feature-status-panel workbench-services" data-testid="opl-memory-manager">
    <p>{zh ? '查看现有 Codex 记忆。纠错会提交到记忆系统的用户建议目录，由记忆系统后续处理；提交不表示主记忆已被改写。' : 'Read existing Codex memory. Corrections become user notes for the memory owner to process; submission does not rewrite canonical memory.'}</p>
    <ReadStatus value={list} zh={zh} />
    {list.data && !rows(list.data.items).length && <p>{zh ? '此 Codex home 尚无记忆文件。' : 'No memory files in this Codex home yet.'}</p>}
    <label className="settings-search-field"><input aria-label={zh ? '搜索记忆文件' : 'Search memory files'} placeholder={zh ? '搜索记忆文件' : 'Search memory files'} value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="memory-file-list">{rows(list.data?.items).filter(item => !item.editable && (showHistory || query || !item.name?.includes("/")) && item.name?.toLowerCase().includes(query.toLowerCase())).map(item => <button className="memory-file-row" type="button" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => void open(item.id)}><span>{item.name}</span><small>{zh ? '查看' : 'View'}</small></button>)}</div>
    <Button variant="ghost" size="sm" type="button" onClick={() => setShowHistory(value => !value)}>{showHistory ? (zh ? '只看主要记忆' : 'Show main memory') : (zh ? '查看历史记录与其他文件' : 'Show history and other files')}</Button>
    <details className="settings-secondary-details"><summary>{zh ? '已提交的纠错建议' : 'Submitted corrections'} · {rows(list.data?.items).filter(item => item.editable).length}</summary><div className="memory-file-list">{rows(list.data?.items).filter(item => item.editable && (item.name ?? '').toLowerCase().includes(query.toLowerCase())).map(item => <button className="memory-file-row" type="button" key={item.id} onClick={() => void open(item.id)}>{new Date(item.modifiedAt).toLocaleString(locale)}</button>)}</div></details>
    {error && <div className="workbench-service-error" role="alert"><strong>{presentWorkbenchError(error, zh ? 'zh' : 'en').title}</strong><p>{presentWorkbenchError(error, zh ? 'zh' : 'en').detail}</p><small>{presentWorkbenchError(error, zh ? 'zh' : 'en').nextStep}</small></div>}
    {selected && <><label>{zh ? '记忆正文' : 'Memory content'}<textarea readOnly={!selected.editable} value={content} onChange={e => setContent(e.target.value)} rows={12} /></label>
      {selected.editable && <div><Button variant="outline" size="sm" type="button" disabled={props.busy || list.busy || Boolean(list.error)} onClick={() => action(props, 'memory_update_note', { id: selected.id, revision: selected.revision, content }, zh ? '修改纠错建议' : 'Edit correction')}>{zh ? '预览修改' : 'Preview edit'}</Button><Button variant="outline" size="sm" type="button" disabled={props.busy || list.busy || Boolean(list.error)} onClick={() => action(props, 'memory_delete_note', { id: selected.id, revision: selected.revision }, zh ? '删除纠错建议' : 'Delete correction')}>{zh ? '删除建议' : 'Delete note'}</Button></div>}</>}
    <label>{zh ? '纠错建议' : 'Correction'}<textarea value={correction} maxLength={64000} onChange={e => setCorrection(e.target.value)} /></label>
    <Button variant="outline" size="sm" type="button" disabled={props.busy || list.busy || Boolean(list.error) || !list.data || !correction.trim()} onClick={() => action(props, 'memory_correct', { content: correction, ...(selected ? { source_id: selected.id } : {}) }, zh ? '提交记忆纠错建议' : 'Submit memory correction')}>{zh ? '预览并提交建议' : 'Preview and submit correction'}</Button>
  </section>;
}

export function StorageCleanupPanel(props: Props) {
  const zh = props.locale === 'zh'; const inventory = useRead(props.client, 'inventory', props.revision);
  const [selection, setSelection] = useState<string[]>([]);
  useEffect(() => { setSelection([]); }, [inventory.data]);
  const categories = rows(inventory.data?.categories);
  const protectedCategories = rows(inventory.data?.protectedCategories);
  const eligibleFiles = categories.flatMap(category => rows(category.files));
  const selectedBytes = eligibleFiles.filter(file => selection.includes(file.id)).reduce((total, file) => total + (typeof file.bytes === 'number' ? file.bytes : 0), 0);
  const reclaimableBytes = !inventory.data ? undefined : typeof inventory.data?.reclaimable_bytes === 'number'
    ? inventory.data.reclaimable_bytes
    : categories.reduce((total, category) => total + (typeof category.reclaimableBytes === 'number' ? category.reclaimableBytes : 0), 0);
  const totalBytes = typeof inventory.data?.total_bytes === 'number' ? inventory.data.total_bytes : inventory.data?.totalBytes;
  const selectedAll = eligibleFiles.length > 0 && selection.length === eligibleFiles.length;
  const observedAt = typeof inventory.data?.observed_at === 'string' ? new Date(inventory.data.observed_at) : inventory.observedAt;
  const observedLabel = observedAt && !Number.isNaN(observedAt.getTime())
    ? observedAt.toLocaleString(props.locale)
    : inventory.data
      ? (zh ? '已完成（时间未提供）' : 'Complete (timestamp unavailable)')
      : (zh ? '尚未完成盘点' : 'Not inventoried yet');
  const selectAll = () => setSelection(selectedAll ? [] : eligibleFiles.map(file => file.id));
  const clearLabel = selectedBytes > 0
    ? (zh ? `预览并释放 ${formatBytes(selectedBytes, props.locale, '0 B')}` : `Preview and release ${formatBytes(selectedBytes, props.locale, '0 B')}`)
    : (zh ? '预览清理' : 'Preview cleanup');
  return <section className="feature-status-panel workbench-services storage-center" data-testid="opl-storage-cleanup">
    <div className="storage-center-heading">
      <div>
        <h3>{zh ? '释放空间' : 'Release space'}</h3>
        <p>{zh ? '清理过期日志和缓存。先预览、再确认；对话、项目和记忆会保留。' : 'Preview and confirm cleanup of old logs and caches. Conversations, projects and memory are retained.'}</p>
      </div>
      <span className="storage-freshness">{zh ? `读取时间：${observedLabel}` : `Read at: ${observedLabel}`}</span>
    </div>
    <ReadStatus value={inventory} zh={zh} />

    <div className="storage-intent-summary" aria-label={zh ? '存储状态摘要' : 'Storage status summary'}>
      <div className="storage-intent-stat"><span>{zh ? '已确认占用' : 'Confirmed usage'}</span><strong>{formatBytes(totalBytes, props.locale, zh ? '未统计' : 'Not measured')}</strong><small>{zh ? '只包含本次盘点覆盖的数据' : 'Only data covered by this inventory'}</small></div>
      <div className="storage-intent-stat"><span>{zh ? '现在可释放' : 'Available to release'}</span><strong>{formatBytes(reclaimableBytes, props.locale, zh ? '未统计' : 'Not measured')}</strong><small>{zh ? '超过保留期的日志和缓存' : 'Logs and caches past the retention window'}</small></div>
      <div className="storage-intent-stat"><span>{zh ? '本次选择' : 'This selection'}</span><strong>{formatBytes(selectedBytes, props.locale, '0 B')}</strong><small>{selectedBytes > 0 ? (zh ? `预计释放后保留 ${formatBytes(remainingStorageBytes(totalBytes, selectedBytes), props.locale, '未统计')}` : `Expected remaining ${formatBytes(remainingStorageBytes(totalBytes, selectedBytes), props.locale, 'not measured')}`) : (zh ? '尚未选择' : 'Nothing selected')}</small></div>
    </div>

    <div className="storage-next-step" role="status">
      <div>
        <strong>{selectedBytes > 0 ? (zh ? '下一步：确认释放' : 'Next: confirm release') : (zh ? '建议操作：先选择要释放的内容' : 'Suggested action: choose what to release')}</strong>
        <p>{selectedBytes > 0
          ? (zh ? '下一步会先显示详细预览；确认后才会删除。此类清理不可恢复。' : 'The next step shows a detailed preview first; deletion happens only after confirmation. This cleanup cannot be restored.')
          : (zh ? '选择下方类别或具体文件，再预览清理结果。' : 'Select categories or files below, then preview the cleanup.')}</p>
      </div>
      <div className="storage-next-step-actions">
        <Button variant="outline" size="sm" type="button" disabled={props.busy || inventory.busy || Boolean(inventory.error) || !eligibleFiles.length} onClick={selectAll}>{selectedAll ? (zh ? '取消全选' : 'Clear all') : (zh ? '全选' : 'Select all')}</Button>
        <Button variant="outline" size="sm" type="button" disabled={props.busy || inventory.busy || Boolean(inventory.error) || !selection.length || !inventory.data} onClick={() => action(props, 'cleanup', { ids: selection }, zh ? '预览并释放空间' : 'Preview and release space')}>{clearLabel}</Button>
      </div>
    </div>

    <section className="storage-intent-section" aria-labelledby="storage-safe-release-title">
      <h4 id="storage-safe-release-title">{zh ? '可安全释放的内容' : 'Safe to release'}</h4>
      {categories.length ? categories.map(category => {
        const files = rows(category.files);
        const categorySelected = files.filter(file => selection.includes(file.id)).length;
        const allCategorySelected = files.length > 0 && categorySelected === files.length;
        return <article key={category.id} className="storage-category-row">
          <div className="storage-category-header">
            <label><input type="checkbox" checked={allCategorySelected} disabled={!files.length || props.busy || inventory.busy || Boolean(inventory.error)} onChange={event => setSelection(current => event.target.checked
              ? [...new Set([...current, ...files.map(file => file.id)])]
              : current.filter(id => !files.some(file => file.id === id)))} /><strong>{categoryLabel(category, zh)}</strong></label>
            <span>{formatBytes(category.reclaimableBytes, props.locale, '0 B')} {zh ? '可释放' : 'reclaimable'}</span>
          </div>
          <p>{zh ? '只包含超过保留期且未被当前使用的文件。' : 'Only files past the retention window and not currently in use.'}</p>
          <details>
            <summary>{zh ? `查看明细（已选 ${categorySelected}/${files.length}）` : `View details (${categorySelected}/${files.length} selected)`}</summary>
            <div className="storage-detail-list">
              {files.length ? files.map(file => <label key={file.id}><input type="checkbox" checked={selection.includes(file.id)} disabled={props.busy || inventory.busy || Boolean(inventory.error)} onChange={event => setSelection(current => event.target.checked ? [...current, file.id] : current.filter(id => id !== file.id))} /><span>{file.name}</span><small>{formatBytes(file.bytes, props.locale, '0 B')}</small></label>) : <p>{zh ? '当前没有符合条件的文件。' : 'No files currently match the criteria.'}</p>}
            </div>
          </details>
        </article>;
      }) : <p className="storage-muted">{zh ? '当前没有已确认可释放的内容。' : 'No reclaimable content is currently confirmed.'}</p>}
    </section>

    <details className="storage-protected"><summary>{zh ? '哪些数据会被保留' : 'What stays protected'}</summary>
      <p>{zh ? '以下内容不参与本次清理。' : 'The following content is excluded from this cleanup.'}</p>
      {protectedCategories.length ? protectedCategories.map(category => <div key={category.id}><strong>{protectedCategoryLabel(category, zh)}</strong><span>{category.bytes === null || category.bytes === undefined ? (zh ? '未取得用量' : 'Usage unavailable') : formatBytes(category.bytes, props.locale, '0 B')} · {category.truncated ? (zh ? '部分统计' : 'Partial inventory') : (zh ? '保留' : 'Retained')}</span></div>) : <p className="storage-muted">{zh ? '当前没有额外的受保护数据统计。' : 'No additional protected data was reported.'}</p>}
    </details>
  </section>;
}
