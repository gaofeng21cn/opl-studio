import type { PackageActivity } from './packageOperations';

export function SoftwareCenterOverview({ locale, stateStatus, stateUnknown, inventory, catalogAvailable, complete, activity, observedAt, statusFilter, onSelectStatus, onUpdates, onActivity, onRefresh }: {
  locale: 'zh' | 'en'; stateStatus: 'loading' | 'ready' | 'error'; stateUnknown: boolean;
  inventory: { total: number; installed: number; notInstalled: number; updates: number };
  catalogAvailable: boolean; complete: boolean; activity: PackageActivity; observedAt: string | null;
  statusFilter?: string; onSelectStatus?(status: string): void;
  onUpdates(): void; onActivity(): void; onRefresh(): void;
}) {
  const zh = locale === 'zh';
  const status = stateStatus === 'loading' ? (zh ? '正在刷新目录…' : 'Refreshing catalog…')
    : stateStatus === 'error' ? (zh ? '刷新失败' : 'Refresh failed')
    : stateUnknown ? (zh ? '部分状态待确认' : 'Some status is not confirmed') : '';
  const filterChip = (value: string, count: number, label: string) => onSelectStatus
    ? <button type="button" className="opl-summary-filter" aria-pressed={(statusFilter ?? 'all') === value} onClick={() => onSelectStatus(value)}><strong>{count}</strong>{label}</button>
    : <span><strong>{count}</strong>{label}</span>;
  return <div className="opl-app-management-summary">
    <span data-testid="opl-app-management-environment">{zh ? '本机 OPL' : 'Local OPL'}</span>
    {catalogAvailable ? <>
      {filterChip('all', inventory.total, zh ? (complete ? '个软件' : '个已读取软件') : (complete ? 'software items' : 'software items read'))}
      {filterChip('installed', inventory.installed, zh ? '个已安装' : 'installed')}
      {inventory.notInstalled > 0 ? filterChip('not_installed', inventory.notInstalled, zh ? '个未安装' : 'not installed') : null}
    </> : null}
    {inventory.updates > 0 ? <button type="button" onClick={onUpdates}>{zh ? `${inventory.updates} 个软件可更新` : `${inventory.updates} updates available`}</button> : null}
    {activity.running || activity.attention || activity.readError ? <button type="button" onClick={onActivity}>
      {activity.running ? (zh ? `${activity.running} 项进行中` : `${activity.running} in progress`)
        : activity.readError ? (zh ? '进度待确认' : 'Progress unavailable') : (zh ? '查看任务结果' : 'View task results')}
    </button> : null}
    {stateStatus === "error" ? <button type="button" onClick={onRefresh}>{zh ? "重新读取" : "Retry"}</button> : null}
    <span className="opl-software-observed">
      <span role="status">{status}</span>
      {observedAt ? <span>{zh ? `上次读取 ${observedAt}` : `Last read ${observedAt}`}</span> : null}
    </span>
  </div>;
}
