import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { Download, Check, CircleAlert, X } from 'lucide-react';
import type { SettingsActionRequest } from './settingsActions';
import { formatBytes } from './settings/presentation';
import { operationErrorMessage, type PackageOperation, type PackageDownloadPlan } from './packageOperations';
import './package-operations.css';

export function PackageDownloadPreview({ plans, locale }: { plans: PackageDownloadPlan[]; locale: 'zh' | 'en' }) {
  const zh = locale === 'zh';
  return <div className="opl-package-download-preview">{plans.map(plan => <div key={plan.package_id}>
    <strong>{plan.package_id}{plan.version ? ` · ${plan.version}` : ''}</strong>
    <dl><dt>{zh ? '下载量' : 'Download'}</dt><dd>{plan.download_bytes === null ? (zh ? '由安装器确认' : 'Provided by installer') : formatBytes(plan.download_bytes, locale)}</dd>
      {plan.cached_bytes > 0 ? <><dt>{zh ? '已有缓存' : 'Cached'}</dt><dd>{formatBytes(plan.cached_bytes, locale)}{zh ? '（安装时校验）' : ' (verified on use)'}</dd></> : null}
      <dt>{zh ? '可用空间' : 'Free space'}</dt><dd>{formatBytes(plan.available_disk_bytes, locale)}</dd>
      <dt>{zh ? '解压占用' : 'Unpacked size'}</dt><dd>{plan.unpacked_bytes === null ? (zh ? '下载后确认并检查空间' : 'Checked after download') : formatBytes(plan.unpacked_bytes, locale)}</dd></dl>
    {plan.install_location ? <p className="opl-package-location">{zh ? '安装位置：' : 'Install location: '}{plan.install_location}</p> : null}
  </div>)}<p>{zh ? '确认后在后台安装，可继续使用软件中心。下载中可取消，重试会复用已有内容。' : 'Installation runs in the background. You can cancel during download and reuse downloaded bytes when retrying.'}</p></div>;
}

export function PackageOperations({ operations, locale, labels, readError, cancelling, onCancel, onRetry, onRefresh }: {
  operations: PackageOperation[]; locale: 'zh' | 'en'; labels: Record<string, string>; readError: boolean;
  cancelling: string | null; onCancel: (id: string) => void; onRetry: (request: SettingsActionRequest) => void; onRefresh: () => void;
}) {
  const zh = locale === 'zh';
  const latest = operations.filter((item, index) => operations.findIndex(other => other.package_id === item.package_id) === index);
  const active = latest.some(item => item.status === 'running');
  const stages: Record<string, string> = zh ? { preparing: '准备安装', downloading: '正在下载', verifying: '校验文件', extracting: '解压文件', installing: '正在安装', checking: '检查安装结果', completed: '安装完成', cancelled: '已取消', failed: '安装失败', interrupted: '安装中断' } : { preparing: 'Preparing', downloading: 'Downloading', verifying: 'Verifying files', extracting: 'Extracting', installing: 'Installing', checking: 'Checking installation', completed: 'Installed', cancelled: 'Cancelled', failed: 'Installation failed', interrupted: 'Interrupted' };
  if (!operations.length && !readError) return null;
  return <section className="opl-package-operations" aria-label={zh ? '安装任务' : 'Installations'}>
    <div className="opl-package-operation-heading"><strong>{zh ? '安装任务' : 'Installations'}</strong>{active ? <span>{zh ? '在后台继续，可离开此页面' : 'Continues in the background'}</span> : null}</div>
    {readError ? <p role="alert">{zh ? '暂时无法读取安装进度，任务可能仍在继续。' : 'Progress is unavailable; installation may still be running.'} <Button size="sm" variant="outline" onClick={onRefresh}>{zh ? '重新读取' : 'Refresh'}</Button></p> : null}
    {latest.slice(0, 4).map(operation => {
      const running = operation.status === 'running';
      const downloading = running && operation.stage === 'downloading';
      const bytes = operation.downloaded_bytes ?? 0, total = operation.total_bytes ?? 0;
      const name = labels[operation.package_id] ?? operation.package_id;
      const percent = total > 0 ? Math.min(100, Math.floor(bytes / total * 100)) : undefined;
      const problem = ['failed', 'interrupted'].includes(operation.status);
      return <div key={operation.operation_id} className="opl-package-operation" data-status={operation.status}>
        <div className="opl-package-operation-title">{running ? <Download size={16} aria-hidden="true" /> : problem ? <CircleAlert size={16} aria-hidden="true" /> : operation.status === 'cancelled' ? <X size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}<strong>{name}</strong><span role="status">{stages[operation.stage] ?? operation.stage}</span></div>
        {operation.active_package_id && operation.active_package_id !== operation.package_id ? <p>{zh ? '所需组件：' : 'Required component: '}{labels[operation.active_package_id] ?? operation.active_package_id}</p> : null}
        {downloading ? <><progress value={total > 0 ? bytes : undefined} max={total || 1} aria-label={`${name} ${zh ? '下载进度' : 'download progress'}`} /><div className="opl-package-download-metrics"><span>{formatBytes(bytes, locale)}{total ? ` / ${formatBytes(total, locale)} · ${percent}%` : ''}</span><span>{operation.bytes_per_second ? `${formatBytes(operation.bytes_per_second, locale)}/s` : (zh ? '正在连接…' : 'Connecting…')}{operation.eta_seconds != null && operation.bytes_per_second ? ` · ${zh ? '约剩 ' : 'About '}${Math.max(1, Math.ceil(operation.eta_seconds / 60))}${zh ? ' 分钟' : ' min remaining'}` : ''}</span></div></> : null}
        {problem ? <p>{operationErrorMessage(operation.error_code, zh)}</p> : operation.status === 'cancelled' ? <p>{zh ? '下载内容已保留，可继续安装。' : 'Downloaded bytes are retained. You can resume installation.'}</p> : null}
        <div className="opl-package-operation-actions">{running && operation.can_cancel ? <Button size="sm" variant="outline" disabled={(cancelling === operation.operation_id || operation.cancel_requested === true)} onClick={() => onCancel(operation.operation_id)}>{(cancelling === operation.operation_id || operation.cancel_requested === true) ? (zh ? '正在取消…' : 'Cancelling…') : (zh ? '取消安装' : 'Cancel installation')}</Button> : running ? <small>{zh ? '正在完成安装，请稍候' : 'Finishing installation'}</small> : null}
          {!running && operation.status !== 'completed' ? <Button size="sm" variant="outline" disabled={active} onClick={() => onRetry({ key: `retry:${operation.operation_id}`, actionId: operation.action_id, label: `${zh ? '安装' : 'Install'} ${name}`, payload: { package_id: operation.package_id }, confirmationRequired: true, dryRunSupported: true })}>{operation.status === 'cancelled' ? (zh ? '继续安装' : 'Resume installation') : (zh ? '重试' : 'Retry')}</Button> : null}
          {operation.install_location ? <details><summary>{zh ? '安装位置' : 'Install location'}</summary><p className="opl-package-location">{operation.install_location}</p></details> : null}</div>
      </div>;
    })}
  </section>;
}
