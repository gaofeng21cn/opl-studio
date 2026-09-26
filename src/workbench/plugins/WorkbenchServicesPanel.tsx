import "./WorkbenchServicesPanel.css";
import { Button } from "../../vendor/deepseek-harness/packages/client/ui-primitives/src/Button";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SettingsActionRequest } from '../settingsActions';

export type WorkbenchServicesClient = {
  read(operation: string, input?: Record<string, unknown>): Promise<unknown>;
  openThread(id: string): Promise<string | null>;
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
    title: zh ? '读取所属服务失败' : 'Could not read the owner service',
    detail: zh ? '此页面暂时没有拿到所属服务的最新状态，已有的普通 Codex 对话不受影响。' : 'This page did not receive the latest owner-service state. Existing ordinary Codex conversations are unaffected.',
    nextStep: zh ? '刷新一次；如果仍然失败，请在“更新与修复”中检查基础服务。' : 'Refresh once. If it still fails, check Base services in Runtime & Maintenance.'
  };
}

function useRead(client: WorkbenchServicesClient, operation: string, revision?: string) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const serial = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++serial.current; setBusy(true); setError('');
    try { const value = await client.read(operation); if (id === serial.current) setData(record(value)); }
    catch (error) { if (id === serial.current) { setError(String(error)); setData(null); } }
    finally { if (id === serial.current) setBusy(false); }
  }, [client, operation]);
  useEffect(() => { void refresh(); return () => { serial.current++; }; }, [refresh, revision]);
  return { data, error, busy, refresh };
}
function action(props: Props, operation: string, input: Record<string, unknown>, label: string) {
  props.onAction({ key: `workbench:${operation}`, actionId: 'package_contribution_execute', label,
    payload: { package_id: 'opl-workbench-services', ref: `workbench#${operation}`, input: { ...input, requestId: crypto.randomUUID() } },
    confirmationRequired: true, dryRunSupported: true });
}
function ReadStatus({ value, zh }: { value: ReturnType<typeof useRead>; zh: boolean }) {
  const presentation = value.error ? presentWorkbenchError(value.error, zh ? 'zh' : 'en') : null;
  return <>
    <Button variant="outline" size="sm" type="button" disabled={value.busy} onClick={() => void value.refresh()}>{value.busy ? (zh ? '读取中…' : 'Loading…') : (zh ? '刷新' : 'Refresh')}</Button>
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

export function ScheduledTasksPanel(props: Props) {
  const { client, locale, revision } = props;
  const zh = locale === 'zh';
  const tasks = useRead(client, 'tasks', revision);
  const history = useRead(client, 'history', revision);
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === 'visible') void history.refresh(); }, 15000); return () => clearInterval(timer); }, [history.refresh]);
  const blank = () => ({ id: crypto.randomUUID(), title: '', prompt: '', cwd: props.cwd ?? '', permissions: ':read-only', timeoutMinutes: 30, revision: 0,
    schedule: { kind: 'daily', time: '09:00', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, weekdays: [1], minutes: 60, at: '' } });
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [openError, setOpenError] = useState('');
  useEffect(() => { if (revision) setDraft(null); }, [revision]);
  const set = (key: string, value: unknown) => setDraft(current => ({ ...current, [key]: value }));
  const schedule = (key: string, value: unknown) => setDraft(current => ({ ...current, schedule: { ...current?.schedule, [key]: value } }));
  return <section className="feature-status-panel workbench-services" data-testid="opl-scheduled-tasks">
    <h3>{zh ? '计划任务' : 'Scheduled tasks'}</h3>
    <p>{zh ? '按指定时间启动独立 Codex 任务。App 需保持运行，可最小化；退出期间不保证执行。重叠运行跳过，超过五分钟未启动的执行跳过。' : 'Start independent Codex tasks on a schedule. Keep the App running; minimizing is supported. Overlaps and starts delayed beyond five minutes are skipped.'}</p>
    <ReadStatus value={tasks} zh={zh} />
    <Button variant="outline" size="sm" type="button" disabled={props.busy || !tasks.data || tasks.busy} onClick={() => setDraft(blank())}>{zh ? '创建计划任务' : 'Create scheduled task'}</Button>
    {tasks.data && !rows(tasks.data.items).length && <p>{zh ? '还没有计划任务。' : 'No scheduled tasks yet.'}</p>}
    {rows(tasks.data?.items).map(task => <article key={task.id}>
      <h4>{task.title}</h4><p>{task.paused ? (zh ? '已暂停' : 'Paused') : (task.running?.length ? (zh ? '运行中' : 'Running') : task.schedule?.kind === 'once' && !task.nextRuns?.length ? (zh ? '已触发' : 'Triggered') : (zh ? '已启用' : 'Enabled'))} · {task.schedule?.timeZone} · {task.schedule?.kind} {task.schedule?.time ?? task.schedule?.at ?? `${task.schedule?.minutes} min`}</p>
      <p>{zh ? '下次运行：' : 'Next run: '}{(task.nextRuns?.[0] ? new Date(task.nextRuns[0]).toLocaleString(locale) : (zh ? '没有后续触发时间' : 'No future trigger'))}</p>
      <p>{task.prompt}</p><code>{task.cwd}</code>
      <div><Button variant="outline" size="sm" type="button" disabled={props.busy} onClick={() => setDraft(structuredClone(task))}>{zh ? '编辑' : 'Edit'}</Button>
        {[['task_run', zh ? '立即运行' : 'Run now'], [task.paused ? 'task_resume' : 'task_pause', task.paused ? (zh ? '恢复' : 'Resume') : (zh ? '暂停' : 'Pause')], ['task_delete', zh ? '删除' : 'Delete']].map(([op, label]) => <Button variant="outline" size="sm" key={op} type="button" disabled={props.busy} onClick={() => action(props, op, { id: task.id, revision: task.revision }, label)}>{label}</Button>)}</div>
    </article>)}
    {draft && <form aria-label={zh ? '计划任务编辑器' : 'Schedule editor'} onSubmit={event => { event.preventDefault(); action(props, draft.revision ? 'task_update' : 'task_create', draft, zh ? '保存计划任务' : 'Save scheduled task'); }}>
      <label>{zh ? '名称' : 'Title'}<input required maxLength={160} value={draft.title} onChange={e => set('title', e.target.value)} /></label>
      <label>{zh ? '任务内容' : 'Prompt'}<textarea required maxLength={32000} value={draft.prompt} onChange={e => set('prompt', e.target.value)} /></label>
      <label>{zh ? '工作目录' : 'Workspace'}<input required value={draft.cwd} onChange={e => set('cwd', e.target.value)} /></label>
      <label>{zh ? '周期' : 'Schedule'}<select value={draft.schedule.kind} onChange={e => schedule('kind', e.target.value)}>{[['once', '单次', 'Once'], ['daily', '每天', 'Daily'], ['weekly', '每周', 'Weekly'], ['interval', '固定间隔', 'Interval']].map(([id, cn, en]) => <option key={id} value={id}>{zh ? cn : en}</option>)}</select></label>
      <label>{zh ? '时区' : 'Time zone'}<input required value={draft.schedule.timeZone} onChange={e => schedule('timeZone', e.target.value)} /></label>
      {draft.schedule.kind === 'once' ? <label>{zh ? '时间（含 UTC 偏移，如 2026-10-01T09:00:00+08:00）' : 'ISO time including UTC offset'}<input required value={draft.schedule.at ?? ''} onChange={e => schedule('at', e.target.value)} /></label>
        : draft.schedule.kind === 'interval' ? <label>{zh ? '间隔分钟' : 'Interval minutes'}<input type="number" min={1} max={525600} value={draft.schedule.minutes ?? 60} onChange={e => schedule('minutes', Number(e.target.value))} /></label>
        : <label>{zh ? '运行时间' : 'Time'}<input type="time" required value={draft.schedule.time ?? '09:00'} onChange={e => schedule('time', e.target.value)} /></label>}
      {draft.schedule.kind === 'weekly' && <fieldset><legend>{zh ? '星期' : 'Weekdays'}</legend>{['日', '一', '二', '三', '四', '五', '六'].map((day, n) => <label key={n}><input type="checkbox" checked={draft.schedule.weekdays?.includes(n) ?? false} onChange={e => schedule('weekdays', e.target.checked ? [...(draft.schedule.weekdays ?? []), n] : draft.schedule.weekdays.filter((v: number) => v !== n))} />{zh ? day : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n]}</label>)}</fieldset>}
      <label>{zh ? '权限' : 'Permissions'}<select value={draft.permissions} onChange={e => set('permissions', e.target.value)}><option value=":read-only">{zh ? '只读' : 'Read only'}</option><option value=":workspace">{zh ? '可写工作区' : 'Workspace write'}</option></select></label>
      <label>{zh ? '超时分钟' : 'Timeout minutes'}<input type="number" min={1} max={120} required value={draft.timeoutMinutes} onChange={e => set('timeoutMinutes', Number(e.target.value))} /></label>
      <p>{zh ? '模型采用 Codex 当前默认值。日历按当地时钟匹配，夏令时跳时可能跳过，回拨可能触发两次。' : 'Uses the current Codex default model. DST gaps may skip a run and clock rollback may trigger twice.'}</p>
      <Button variant="outline" size="sm" type="submit" disabled={props.busy}>{zh ? '预览并保存' : 'Preview and save'}</Button><Button variant="outline" size="sm" type="button" onClick={() => setDraft(null)}>{zh ? '关闭编辑器' : 'Close editor'}</Button>
    </form>}
    <h4>{zh ? '最近执行（含已删除任务）' : 'Recent runs (including deleted tasks)'}</h4><ReadStatus value={history} zh={zh} />
    {history.data && !rows(history.data.items).length && <p>{zh ? '暂无执行记录。' : 'No runs yet.'}</p>}
    {rows(history.data?.items).map(run => <article key={`${run.workflowId}:${run.runId}`}><strong>{run.title ?? run.taskId}</strong><p>{new Date(run.startTime).toLocaleString(locale)} · {run.result?.status}</p><p>{run.result?.summary ?? run.result?.reason}</p>{run.result?.threadId && <Button variant="outline" size="sm" type="button" onClick={async () => { try { const error = await client.openThread(run.result.threadId); setOpenError(error ?? ''); if (!error) props.onOpened?.(); } catch (e) { setOpenError(String(e)); } }}>{zh ? '打开结果任务' : 'Open result task'}</Button>}</article>)}
    {openError && <div className="workbench-service-error" role="alert"><strong>{presentWorkbenchError(openError, zh ? 'zh' : 'en').title}</strong><p>{presentWorkbenchError(openError, zh ? 'zh' : 'en').detail}</p><small>{presentWorkbenchError(openError, zh ? 'zh' : 'en').nextStep}</small></div>}
  </section>;
}

export function MemoryManagerPanel(props: Props) {
  const { client, locale, revision } = props; const zh = locale === 'zh';
  const list = useRead(client, 'memory', revision);
  const [selected, setSelected] = useState<Record<string, any> | null>(null);
  const [content, setContent] = useState(''); const [correction, setCorrection] = useState(''); const [error, setError] = useState('');
  const serial = useRef(0);
  useEffect(() => { serial.current++; setSelected(null); if (revision) setCorrection(''); }, [revision]);
  async function open(id: string) { const seq = ++serial.current; setError(''); setSelected(null); try { const value = record(await client.read('memory_read', { id })); if (seq === serial.current) { setSelected(value); setContent(value.content); } } catch (error) { if (seq === serial.current) setError(String(error)); } }
  return <section className="feature-status-panel workbench-services" data-testid="opl-memory-manager"><h3>{zh ? '记忆与纠错' : 'Memory and corrections'}</h3>
    <p>{zh ? '查看现有 Codex 记忆。纠错会提交到记忆系统的用户建议目录，由记忆系统后续处理；提交不表示主记忆已被改写。' : 'Read existing Codex memory. Corrections become user notes for the memory owner to process; submission does not rewrite canonical memory.'}</p>
    <ReadStatus value={list} zh={zh} />
    {list.data && !rows(list.data.items).length && <p>{zh ? '此 Codex home 尚无记忆文件。' : 'No memory files in this Codex home yet.'}</p>}
    <ul>{rows(list.data?.items).map(item => <li key={item.id}><Button variant="outline" size="sm" type="button" onClick={() => void open(item.id)}>{item.editable ? `${zh ? '纠错建议' : 'Correction'} · ${new Date(item.modifiedAt).toLocaleString(locale)}` : item.name}</Button>{item.editable && <span> · {zh ? '用户纠错建议' : 'User correction'}</span>}</li>)}</ul>
    {error && <div className="workbench-service-error" role="alert"><strong>{presentWorkbenchError(error, zh ? 'zh' : 'en').title}</strong><p>{presentWorkbenchError(error, zh ? 'zh' : 'en').detail}</p><small>{presentWorkbenchError(error, zh ? 'zh' : 'en').nextStep}</small></div>}
    {selected && <><label>{zh ? '记忆正文' : 'Memory content'}<textarea readOnly={!selected.editable} value={content} onChange={e => setContent(e.target.value)} rows={12} /></label>
      {selected.editable && <div><Button variant="outline" size="sm" type="button" disabled={props.busy} onClick={() => action(props, 'memory_update_note', { id: selected.id, revision: selected.revision, content }, zh ? '修改纠错建议' : 'Edit correction')}>{zh ? '预览修改' : 'Preview edit'}</Button><Button variant="outline" size="sm" type="button" disabled={props.busy} onClick={() => action(props, 'memory_delete_note', { id: selected.id, revision: selected.revision }, zh ? '删除纠错建议' : 'Delete correction')}>{zh ? '删除建议' : 'Delete note'}</Button></div>}</>}
    <label>{zh ? '纠错建议' : 'Correction'}<textarea value={correction} maxLength={64000} onChange={e => setCorrection(e.target.value)} /></label>
    <Button variant="outline" size="sm" type="button" disabled={props.busy || !list.data || !correction.trim()} onClick={() => action(props, 'memory_correct', { content: correction, ...(selected ? { source_id: selected.id } : {}) }, zh ? '提交记忆纠错建议' : 'Submit memory correction')}>{zh ? '预览并提交建议' : 'Preview and submit correction'}</Button>
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
  const reclaimableBytes = typeof inventory.data?.reclaimable_bytes === 'number'
    ? inventory.data.reclaimable_bytes
    : categories.reduce((total, category) => total + (typeof category.reclaimableBytes === 'number' ? category.reclaimableBytes : 0), 0);
  const totalBytes = typeof inventory.data?.total_bytes === 'number' ? inventory.data.total_bytes : inventory.data?.totalBytes;
  const selectedAll = eligibleFiles.length > 0 && selection.length === eligibleFiles.length;
  const observedAt = typeof inventory.data?.observed_at === 'string' ? new Date(inventory.data.observed_at) : null;
  const observedLabel = observedAt && !Number.isNaN(observedAt.getTime())
    ? observedAt.toLocaleString(props.locale)
    : (zh ? '尚未完成盘点' : 'Not inventoried yet');
  const selectAll = () => setSelection(selectedAll ? [] : eligibleFiles.map(file => file.id));
  const clearLabel = selectedBytes > 0
    ? (zh ? `预览并释放 ${formatBytes(selectedBytes, props.locale, '0 B')}` : `Preview and release ${formatBytes(selectedBytes, props.locale, '0 B')}`)
    : (zh ? `选择可释放内容（最多 ${formatBytes(reclaimableBytes, props.locale, '0 B')}）` : `Choose reclaimable data (up to ${formatBytes(reclaimableBytes, props.locale, '0 B')})`);
  return <section className="feature-status-panel workbench-services storage-center" data-testid="opl-storage-cleanup">
    <div className="storage-center-heading">
      <div>
        <h3>{zh ? '释放空间' : 'Release space'}</h3>
        <p>{zh ? '先看结果，再决定是否执行。当前路径只处理所属服务声明的旧日志和缓存，不触碰对话、项目、凭据、任务会话或记忆。' : 'See the outcome before deciding. This path only handles old owner-declared logs and caches; conversations, projects, credentials, task sessions and memory are untouched.'}</p>
      </div>
      <span className="storage-freshness">{zh ? `最近盘点：${observedLabel}` : `Last inventory: ${observedLabel}`}</span>
    </div>
    <ReadStatus value={inventory} zh={zh} />

    <div className="storage-intent-summary" aria-label={zh ? '存储状态摘要' : 'Storage status summary'}>
      <div className="storage-intent-stat"><span>{zh ? '已确认占用' : 'Confirmed usage'}</span><strong>{formatBytes(totalBytes, props.locale, zh ? '未统计' : 'Not measured')}</strong><small>{zh ? '只包含本次盘点覆盖的数据' : 'Only data covered by this inventory'}</small></div>
      <div className="storage-intent-stat"><span>{zh ? '现在可释放' : 'Available to release'}</span><strong>{formatBytes(reclaimableBytes, props.locale, '0 B')}</strong><small>{zh ? '超过保留期的日志和缓存' : 'Logs and caches past the retention window'}</small></div>
      <div className="storage-intent-stat"><span>{zh ? '本次选择' : 'This selection'}</span><strong>{formatBytes(selectedBytes, props.locale, '0 B')}</strong><small>{selectedBytes > 0 ? (zh ? `预计释放后保留 ${formatBytes(Math.max(0, (totalBytes ?? 0) - selectedBytes), props.locale, '未统计')}` : `Expected remaining ${formatBytes(Math.max(0, (totalBytes ?? 0) - selectedBytes), props.locale, 'not measured')}`) : (zh ? '尚未选择' : 'Nothing selected')}</small></div>
    </div>

    <div className="storage-next-step" role="status">
      <div>
        <strong>{selectedBytes > 0 ? (zh ? '下一步：确认释放' : 'Next: confirm release') : (zh ? '建议操作：先选择要释放的内容' : 'Suggested action: choose what to release')}</strong>
        <p>{selectedBytes > 0
          ? (zh ? '下一步会先显示详细预览；确认后才会删除。此类清理不可恢复。' : 'The next step shows a detailed preview first; deletion happens only after confirmation. This cleanup cannot be restored.')
          : (zh ? '默认可以一次选择全部安全候选，也可以展开类别只选其中一部分。' : 'You can select all safe candidates or expand a category and choose only part of it.')}</p>
      </div>
      <div className="storage-next-step-actions">
        <Button variant="outline" size="sm" type="button" disabled={props.busy || !eligibleFiles.length} onClick={selectAll}>{selectedAll ? (zh ? '取消全选' : 'Clear all') : (zh ? '选择全部可释放内容' : 'Select all reclaimable')}</Button>
        <Button variant="outline" size="sm" type="button" disabled={props.busy || !selection.length || !inventory.data} onClick={() => action(props, 'cleanup', { ids: selection }, zh ? '预览并释放空间' : 'Preview and release space')}>{clearLabel}</Button>
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
            <label><input type="checkbox" checked={allCategorySelected} disabled={!files.length || props.busy} onChange={event => setSelection(current => event.target.checked
              ? [...new Set([...current, ...files.map(file => file.id)])]
              : current.filter(id => !files.some(file => file.id === id)))} /><strong>{categoryLabel(category, zh)}</strong></label>
            <span>{formatBytes(category.reclaimableBytes, props.locale, '0 B')} {zh ? '可释放' : 'reclaimable'}</span>
          </div>
          <p>{zh ? `${category.owner ?? '所属服务'} · 只包含超过保留期且未被当前使用的文件。` : `${category.owner ?? 'Owner service'} · Only files past the retention window and not currently in use.`}</p>
          <details>
            <summary>{zh ? `查看明细（已选 ${categorySelected}/${files.length}）` : `View details (${categorySelected}/${files.length} selected)`}</summary>
            <div className="storage-detail-list">
              {files.length ? files.map(file => <label key={file.id}><input type="checkbox" checked={selection.includes(file.id)} disabled={props.busy} onChange={event => setSelection(current => event.target.checked ? [...current, file.id] : current.filter(id => id !== file.id))} /><span>{file.name}</span><small>{formatBytes(file.bytes, props.locale, '0 B')}</small></label>) : <p>{zh ? '当前没有符合条件的文件。' : 'No files currently match the criteria.'}</p>}
            </div>
          </details>
        </article>;
      }) : <p className="storage-muted">{zh ? '当前没有可安全释放的内容。' : 'There is currently nothing safe to release.'}</p>}
    </section>

    <section className="storage-intent-section" aria-labelledby="storage-organize-title">
      <h4 id="storage-organize-title">{zh ? '整理我的内容' : 'Organize my content'}</h4>
      <article className="storage-capability-row"><div><strong>{zh ? '对话、项目与附件' : 'Conversations, projects and attachments'}</strong><p>{zh ? '当前没有可用的归档、导出、恢复或删除 owner 动作。这里的空间不会被“释放空间”操作触碰。' : 'No archive, export, restore or delete owner action is available yet. This data is not touched by the release-space action.'}</p></div><span className="storage-state-neutral">{zh ? '暂不支持整理' : 'Not available yet'}</span></article>
      <article className="storage-capability-row"><div><strong>{zh ? '网页端数据' : 'Web app data'}</strong><p>{zh ? '当前由部署方决定是否可盘点和处理；App 只显示已确认的状态，不会伪造清理入口。' : 'The deployment owner decides whether this data can be inventoried or managed. The App shows confirmed state only and does not invent a cleanup action.'}</p></div><span className="storage-state-neutral">{zh ? '由部署方管理' : 'Deployment managed'}</span></article>
    </section>

    <details className="storage-protected"><summary>{zh ? '哪些数据会被保留' : 'What stays protected'}</summary>
      <p>{zh ? '以下数据不属于本次释放空间范围，仍由各自 owner 管理。' : 'The following data is outside this release-space action and remains managed by its owner.'}</p>
      {protectedCategories.length ? protectedCategories.map(category => <div key={category.id}><strong>{protectedCategoryLabel(category, zh)}</strong><span>{category.bytes === null || category.bytes === undefined ? (zh ? '未取得用量' : 'Usage unavailable') : formatBytes(category.bytes, props.locale, '0 B')} · {category.truncated ? (zh ? '部分统计' : 'Partial inventory') : (zh ? '保留' : 'Retained')}</span></div>) : <p className="storage-muted">{zh ? '当前没有额外的受保护数据统计。' : 'No additional protected data was reported.'}</p>}
    </details>
  </section>;
}
