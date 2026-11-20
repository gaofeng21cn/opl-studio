import { Check, CircleAlert, Download, RefreshCw, Clock3 } from 'lucide-react';
import type { PackageActivity } from './packageOperations';

export function SoftwareCenterOverview({ locale, stateStatus, stateUnknown, inventory, catalogAvailable, complete, activity, issues, affected, observedAt, onUpdates, onRefresh }: {
  locale: 'zh' | 'en'; stateStatus: 'loading' | 'ready' | 'error'; stateUnknown: boolean;
  inventory: { total: number; installed: number; notInstalled: number; updates: number }; catalogAvailable: boolean; complete: boolean;
  activity: PackageActivity; issues: number; affected: number; observedAt: string | null; onUpdates(): void; onRefresh(): void;
}) {
  const zh = locale === 'zh';
  const attention = issues + activity.attention;
  const state = stateStatus === 'loading' ? 'loading'
    : stateStatus === 'error' || activity.readError ? 'unknown'
    : attention ? 'attention' : activity.running ? 'running' : stateUnknown ? 'unknown' : inventory.updates ? 'updates' : 'ready';
  const title = {
    loading: zh ? '正在读取软件状态' : 'Reading software status',
    unknown: zh ? '部分状态待确认' : 'Some status is not confirmed',
    attention: zh ? `${attention} 项需要处理` : `${attention} items need attention`,
    running: zh ? `${activity.running} 项进行中` : `${activity.running} in progress`,
    updates: zh ? `${inventory.updates} 个软件可更新` : `${inventory.updates} updates available`,
    ready: zh ? '当前没有待办' : 'No action needed',
  }[state];
  const detail = {
    loading: zh ? '正在检查软件、更新和共享资源。' : 'Checking software, updates and shared resources.',
    unknown: zh ? '保留上次读取的信息，重新读取后确认最新状态。' : 'Previous information is retained. Refresh to confirm the current state.',
    attention: zh ? (affected ? `影响 ${affected} 个软件，处理下方事项后可重新检查。` : '查看下方事项，按提示恢复。') : (affected ? `Affects ${affected} software items. Resolve the items below, then check again.` : 'Review the items below to recover.'),
    running: zh ? '任务在后台继续，你可以返回对话。完成后会重新检查软件状态。' : 'Tasks continue in the background. Software status is checked again when they finish.',
    updates: zh ? '已安装的软件可以继续使用，按需安排更新。' : 'Installed software remains available. Update when convenient.',
    ready: zh ? '软件与共享资源状态已读取。' : 'Software and shared resource status have been read.',
  }[state];
  const Icon = state === 'attention' ? CircleAlert : state === 'running' ? Download : state === 'ready' ? Check : state === 'unknown' ? Clock3 : RefreshCw;
  return <div className="opl-app-management-overview">
    <div className="opl-software-primary-status" data-state={state} data-testid="opl-software-primary-status">
      <Icon size={18} aria-hidden="true" />
      <div><strong role="status">{title}</strong><p>{detail}</p></div>
      {state === 'updates' ? <button type="button" className="settings-action-button" onClick={onUpdates}>{zh ? '查看更新' : 'View updates'}</button>
        : state === 'unknown' ? <button type="button" className="settings-action-button" onClick={onRefresh}>{zh ? '重新读取' : 'Refresh'}</button> : null}
    </div>
    <div className="opl-app-management-summary">
      <span data-testid="opl-app-management-environment">{zh ? '本机 OPL' : 'Local OPL'}</span>
      {catalogAvailable ? <><span><strong>{inventory.total}</strong>{zh ? (complete ? '个软件' : '个已读取软件') : (complete ? 'software items' : 'software items read')}</span>
        <span><strong>{inventory.installed}</strong>{zh ? '个已安装' : 'installed'}</span><span><strong>{inventory.notInstalled}</strong>{zh ? '个未安装' : 'not installed'}</span></> : null}
      {inventory.updates > 0 && state !== 'updates' ? <button type="button" onClick={onUpdates}>{zh ? `${inventory.updates} 个可更新` : `${inventory.updates} updates available`}</button> : null}
      {activity.running > 0 && state !== 'running' ? <span>{zh ? `${activity.running} 项后台进行中` : `${activity.running} in progress`}</span> : null}
      {observedAt ? <span className="opl-software-observed">{zh ? `上次读取 ${observedAt}` : `Last read ${observedAt}`}</span> : null}
    </div>
  </div>;
}
