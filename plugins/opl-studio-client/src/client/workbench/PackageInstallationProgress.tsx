import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { ArrowRight, Download, Check, CircleAlert, Clock3, X } from 'lucide-react';
import type { SettingsActionRequest } from './settingsActions';
import { formatBytes } from './settings/presentation';
import {
  latestPackageOperations, operationErrorMessage, packageActionVerb, packageRemainingTime, packageStagePresentation,
  type PackageActivity, type PackageOperation, type PackageDownloadPlan, type PackageDisplayInfo,
} from './packageOperations';
import './package-operations.css';

export function PackageDownloadPreview({ plans, locale, products = {} }: {
  plans: PackageDownloadPlan[]; locale: 'zh' | 'en'; products?: Record<string, PackageDisplayInfo>;
}) {
  const zh = locale === 'zh';
  return <div className="opl-package-download-preview">
    {plans.map(plan => {
      const product = products[plan.package_id];
      return <div key={plan.package_id}>
        <div className="opl-package-preview-title"><strong>{product?.name ?? plan.package_id}</strong>
          {plan.version ? <span>{plan.version}</span> : null}
          {product?.distribution === 'release' ? <span>{zh ? '发布版' : 'Release'}</span> : product?.distribution === 'development' ? <span>{zh ? '开发版' : 'Development'}</span> : null}
        </div>
        <dl>
          <dt>{zh ? '软件源' : 'Source'}</dt><dd>{product?.source ?? (zh ? '由软件安装器确认' : 'Provided by installer')}</dd>
          <dt>{zh ? '下载量' : 'Download size'}</dt><dd>{plan.download_bytes === null ? (zh ? '由安装器确认' : 'Provided by installer') : formatBytes(plan.download_bytes, locale)}</dd>
          {plan.cached_bytes > 0 ? <><dt>{zh ? '已缓存' : 'Cached'}</dt><dd>{formatBytes(plan.cached_bytes, locale)}{zh ? '（校验后复用）' : ' (verified before reuse)'}</dd></> : null}
          <dt>{zh ? '可用空间' : 'Free space'}</dt><dd>{formatBytes(plan.available_disk_bytes, locale)}</dd>
          <dt>{zh ? '解压占用' : 'Unpacked size'}</dt><dd>{plan.unpacked_bytes === null ? (zh ? '下载后确认并检查空间' : 'Checked after download') : formatBytes(plan.unpacked_bytes, locale)}</dd>
        </dl>
        {plan.install_location ? <p className="opl-package-location">{zh ? '安装位置：' : 'Install location: '}{plan.install_location}</p> : null}
        <details className="opl-package-technical"><summary>{zh ? '技术详情' : 'Technical details'}</summary><p>ID · <code>{plan.package_id}</code></p></details>
      </div>;
    })}
    <p className="opl-package-background-note">{zh ? '确认后在后台继续，你可以回到对话或离开此页面。下载中可取消；重试会校验并复用已缓存内容。' : 'Continues in the background, including when you return to your conversation. You can cancel during download; retries verify and reuse cached data.'}</p>
  </div>;
}

/** A window-local link to Framework operations, not a second task manager. */
export function PackageActivityButton({ activity, locale, onOpen }: { activity: PackageActivity; locale: 'zh' | 'en'; onOpen(): void }) {
  if (!activity.running && !activity.attention && !activity.readError) return null;
  const zh = locale === 'zh';
  const label = activity.readError ? (zh ? '进度待确认' : 'Progress unavailable')
    : activity.running ? (zh ? `${activity.running} 项进行中` : `${activity.running} in progress`)
    : (zh ? `${activity.attention} 项需要处理` : `${activity.attention} need attention`);
  const needsAttention = activity.readError || activity.attention > 0;
  return <button type="button" className="opl-package-activity-trigger" data-testid="opl-package-activity-trigger" data-tone={needsAttention ? 'attention' : 'active'}
    onClick={onOpen} aria-label={`${zh ? '软件中心' : 'Software Center'} · ${label}`} title={zh ? '打开软件中心查看进度与结果' : 'Open Software Center to view progress and results'}>
    {needsAttention ? <CircleAlert size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
    <span role="status">{label}</span>
    {activity.running > 0 && activity.attention > 0 && !activity.readError ? <span>{zh ? `· ${activity.attention} 项需要处理` : `· ${activity.attention} need attention`}</span> : null}
  </button>;
}

export function PackageOperations({ operations, locale, labels, readError, cancelling, onCancel, onRetry, onRefresh, onUse, readyPackageIds = [], onOpenLocation }: {
  operations: PackageOperation[]; locale: 'zh' | 'en'; labels: Record<string, string>; readError: boolean;
  cancelling: string | null; onCancel: (id: string) => void; onRetry: (request: SettingsActionRequest) => void; onRefresh: () => void;
  onUse?: (packageId: string) => void; readyPackageIds?: readonly string[]; onOpenLocation?: (path: string) => void;
}) {
  const zh = locale === 'zh';
  const latest = latestPackageOperations(operations);
  const active = latest.some(item => item.status === 'running');
  const current = latest.filter(item => ['running', 'failed', 'interrupted'].includes(item.status));
  const history = latest.filter(item => !current.includes(item));
  if (!operations.length && !readError) return null;

  const renderOperation = (operation: PackageOperation) => {
    const running = operation.status === 'running';
    const downloading = running && operation.stage === 'downloading' && !readError;
    const bytes = operation.downloaded_bytes ?? 0, total = operation.total_bytes ?? 0;
    const name = labels[operation.package_id] ?? operation.package_id;
    const percent = total > 0 ? Math.min(100, Math.floor(bytes / total * 100)) : undefined;
    const problem = ['failed', 'interrupted'].includes(operation.status);
    const presentation = packageStagePresentation(operation, locale);
    const verb = packageActionVerb(operation.action_id, locale);
    const interrupted = operation.status === 'interrupted';
    return <article key={operation.operation_id} className="opl-package-operation" data-status={operation.status} aria-label={name}>
      <div className="opl-package-operation-title">
        {running ? <Download size={16} aria-hidden="true" /> : interrupted ? <Clock3 size={16} aria-hidden="true" /> : problem ? <CircleAlert size={16} aria-hidden="true" /> : operation.status === 'cancelled' ? <X size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
        <strong>{name}</strong><span role="status">{running && readError ? (zh ? '结果待确认' : 'Result not confirmed') : presentation.label}</span>
      </div>
      {operation.active_package_id && operation.active_package_id !== operation.package_id ? <p>{zh ? '所需组件：' : 'Required component: '}{labels[operation.active_package_id] ?? operation.active_package_id}</p> : null}
      {downloading ? <>
        <progress value={total > 0 ? Math.min(bytes, total) : undefined} max={total || 1} aria-label={`${name} ${zh ? '下载进度' : 'download progress'}`} />
        <div className="opl-package-download-metrics"><span>{formatBytes(bytes, locale)}{total ? ` / ${formatBytes(total, locale)} · ${percent}%` : ''}</span>
          <span>{operation.bytes_per_second ? `${formatBytes(operation.bytes_per_second, locale)}/s` : (zh ? '等待下载数据…' : 'Waiting for download data…')}
            {operation.eta_seconds != null && operation.bytes_per_second ? ` · ${packageRemainingTime(operation.eta_seconds, locale)}` : ''}</span>
        </div>
      </> : null}
      <div className="opl-package-operation-context">{running && !readError && presentation.next ? <p className="opl-package-operation-next"><ArrowRight size={14} aria-hidden="true" />{zh ? `接下来：${presentation.next}` : `Next: ${presentation.next}`}</p> : null}
      {running && !readError && (operation.cached_bytes ?? 0) > 0 ? <p>{zh ? '已缓存：' : 'Cached: '}{formatBytes(operation.cached_bytes, locale)}{zh ? ' · 校验后复用' : ' · verified before reuse'}</p> : null}</div>
      {problem ? <p>{operationErrorMessage(interrupted ? 'package_operation_interrupted' : operation.error_code, zh)}</p>
        : operation.status === 'cancelled' ? <p>{zh ? '已缓存内容会保留，继续时将先校验。' : 'Cached data is retained and verified when you resume.'}</p> : null}
      <div className="opl-package-operation-actions">
        {running && operation.can_cancel ? <Button size="sm" variant="outline" disabled={readError || cancelling === operation.operation_id || operation.cancel_requested === true} onClick={() => onCancel(operation.operation_id)}>
          {cancelling === operation.operation_id || operation.cancel_requested === true ? (zh ? '正在取消…' : 'Cancelling…') : (zh ? `取消${verb}` : `Cancel ${verb.toLowerCase()}`)}
        </Button> : running && !readError ? <small>{zh ? '正在完成安装，请稍候' : 'Finishing installation'}</small> : null}
        {interrupted ? <Button size="sm" variant="outline" onClick={onRefresh}>{zh ? '检查软件状态' : 'Check software status'}</Button> : null}
        {!running && !interrupted && operation.status !== 'completed' ? <Button size="sm" variant="outline" disabled={active || readError} onClick={() => onRetry({
          key: `retry:${operation.operation_id}`, actionId: operation.action_id, label: `${verb} ${name}`, payload: { package_id: operation.package_id }, confirmationRequired: true, dryRunSupported: true,
        })}>{operation.status === 'cancelled' ? (zh ? `继续${verb}` : `Resume ${verb.toLowerCase()}`) : (zh ? `重试${verb}` : `Retry ${verb.toLowerCase()}`)}</Button> : null}
        {operation.status === 'completed' && onUse && readyPackageIds.includes(operation.package_id) ? <Button size="sm" variant="primary" onClick={() => onUse(operation.package_id)}>{zh ? '开始使用' : 'Start using'}</Button> : null}
        {operation.install_location ? <details><summary>{zh ? '安装位置' : 'Install location'}</summary><p className="opl-package-location">{operation.install_location}</p>
          {onOpenLocation ? <Button size="sm" variant="outline" onClick={() => onOpenLocation(operation.install_location!)}>{zh ? '在文件管理器中查看' : 'Show in file manager'}</Button> : null}
        </details> : null}
      </div>
    </article>;
  };

  return <section className="opl-package-operations" aria-label={zh ? '安装与更新任务' : 'Installation and update tasks'}>
    <div className="opl-package-operation-heading"><strong>{zh ? '安装与更新任务' : 'Installation and update tasks'}</strong>{active ? <span>{zh ? '后台继续，可返回对话' : 'Continues in the background'}</span> : null}</div>
    {readError ? <div className="opl-package-operation-read-error" role="alert"><p>{zh ? '暂时无法读取进度，任务可能仍在继续。重新读取后再决定下一步。' : 'Progress is unavailable; the task may still be running. Refresh before taking further action.'}</p><Button size="sm" variant="outline" onClick={onRefresh}>{zh ? '重新读取' : 'Refresh'}</Button></div> : null}
    {current.map(renderOperation)}
    {history.length ? <details className="opl-package-operation-history" open={!current.length && history.length === 1}><summary>{zh ? `最近任务 · ${history.length}` : `Recent tasks · ${history.length}`}</summary>{history.map(renderOperation)}</details> : null}
  </section>;
}
