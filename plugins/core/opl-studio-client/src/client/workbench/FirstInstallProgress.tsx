import { useEffect, useState } from 'react';
import { Button, DisclosureRow, StateDot, Tag, IconDownloadOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PackageOperation } from './packageOperations';
import { formatBytes } from './settings/presentation';
import { packageStagePresentation } from './packageOperations';
import './first-install-progress.css';

export type FirstInstallSnapshot = {
  stage: string;
  status: string;
  source?: string;
  startedAt?: string;
  rootPackageIds?: string[];
  packageId?: string;
  packageStatus?: string;
  packageResults?: { package_id: string; status: string }[];
};

export function FirstInstallProgress({ snapshot, locale, operations, readError, labels, onOpenSoftware, onRetryRuntime }: {
  snapshot: FirstInstallSnapshot | null; locale: 'zh' | 'en'; operations: PackageOperation[];
  readError: boolean; labels: Record<string, string>; onOpenSoftware(): void; onRetryRuntime(): void | Promise<void>;
}) {
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [expanded, setExpanded] = useState(snapshot?.status === 'failed' || snapshot?.status === 'unconfirmed');
  const [retryError, setRetryError] = useState(false);
  useEffect(() => {
    if (snapshot?.status !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [snapshot?.status]);
  useEffect(() => {
    setDismissed(false);
    setExpanded(snapshot?.status === 'failed' || snapshot?.status === 'unconfirmed');
  }, [snapshot?.stage, snapshot?.status]);
  if (!snapshot || snapshot.stage === 'ready' || dismissed) return null;
  const zh = locale === 'zh';
  const packages = snapshot.stage === 'preparing_packages';
  const failed = snapshot.status === 'failed' || snapshot.status === 'unconfirmed';
  const finished = snapshot.status === 'completed';
  const titles: Record<string, [string, string]> = {
    preparing_node: ['正在准备基础运行环境', 'Preparing the base runtime'],
    preparing_framework: ['正在下载本机运行环境', 'Downloading the local runtime'],
    installing_framework: ['正在安装本机运行环境', 'Installing the local runtime'],
    installing_offline_runtime: ['正在从安装包准备本机环境', 'Preparing the bundled local runtime'],
    preparing_services: ['正在准备后台任务服务', 'Preparing background task services'],
    configuring_components: ['正在配置本机组件', 'Configuring local components'],
    checking_components: ['正在检查本机组件', 'Checking local components'],
    preparing_codex: ['正在安装本机助手', 'Installing the local assistant'],
    preparing_packages: ['正在准备官方智能体', 'Preparing official agents'],
    checking_host: ['正在检查本机环境', 'Checking the local runtime'],
    enabling_wsl: ['正在启用 Windows 运行环境', 'Enabling the Windows runtime'],
    installing_owned_distribution: ['正在安装本机运行环境', 'Installing the local runtime'],
    initializing_guest: ['正在准备本机组件', 'Preparing local components'],
    validating_routes: ['正在检查本机组件', 'Checking local components'],
  };
  const title = snapshot.status === 'unconfirmed' ? (zh ? '上次准备结果待确认' : 'Previous setup result needs checking') : finished ? (zh ? '官方智能体已准备完成' : 'Official agents are ready')
    : failed ? (zh ? '部分准备未完成' : 'Some setup needs attention')
    : (titles[snapshot.stage] ?? [zh ? '正在准备本机环境' : 'Preparing the local runtime', 'Preparing the local runtime'])[zh ? 0 : 1];
  const elapsed = snapshot.startedAt ? Math.max(0, Math.floor((now - Date.parse(snapshot.startedAt)) / 1000)) : null;
  const roots = snapshot.rootPackageIds ?? [];
  const ready = new Set((snapshot.packageResults ?? []).filter(item => ['already_present', 'installed', 'reconciled'].includes(item.status)).map(item => item.package_id));
  const active = operations.find(item => item.status === 'running' && roots.includes(item.package_id));
  const total = active?.total_bytes;
  const bytes = active?.downloaded_bytes;
  const downloading = !readError && active?.stage === 'downloading' && typeof bytes === 'number';
  const state = failed ? 'error' : finished ? 'done' : 'ongoing';
  return <section className="opl-first-install-progress" aria-label={zh ? '首次安装进度' : 'First installation progress'}>
    <div className="opl-first-install-heading">
      <StateDot state={state} appearance="step" size={18} />
      <strong role="status">{title}</strong>
      {packages && roots.length ? <Tag tone={failed ? 'warning' : finished ? 'success' : 'quiet'}>{ready.size} / {roots.length}</Tag> : null}
    </div>
    {!finished && !failed ? <p>{snapshot.source === 'bundled'
      ? (zh ? 'Full 已包含本机所需组件，正在本地安装。云端模型和账户登录仍需联网。' : 'Full includes the local components and installs them from this package. Cloud models and account sign-in need internet.')
      : (zh ? '首次使用会联网补齐本机环境和官方智能体；完成后与 Full 具有相同能力。请保持应用开启。' : 'First launch downloads the local runtime and official agents. Once ready, capabilities match Full. Keep the app open.')}</p> : null}
    {!packages && !finished ? <DisclosureRow icon={<IconDownloadOutlineRegular size={14} />} title={zh ? '准备哪些内容' : 'What is being prepared'} open={expanded} expandable expandOnRowClick onToggle={() => setExpanded(value => !value)}><p>{zh ? '基础运行环境、本机助手 Codex、后台任务服务，以及官方智能体的必需组件。已有可用内容会由安装器检查复用。' : 'The base runtime, local Codex assistant, background task service, and required agent components. The installer reuses usable components already on this computer.'}</p></DisclosureRow> : null}
    {packages && !finished && !failed ? <p>{zh ? '你可以继续使用应用；各智能体准备好后即可使用。' : 'You can continue using the app. Each agent becomes available when ready.'}</p> : null}
    {!finished && !failed && elapsed !== null && Number.isFinite(elapsed) ? <small>{zh ? `已用时 ${elapsed} 秒` : `Elapsed ${elapsed}s`}</small> : null}
    {packages && roots.length ? <DisclosureRow
      icon={<IconDownloadOutlineRegular size={14} />}
      title={zh ? '查看准备内容与进度' : 'View setup items and progress'}
      open={expanded} expandable expandOnRowClick onToggle={() => setExpanded(value => !value)}>
      <ul>{roots.map(id => {
        const result = snapshot.packageResults?.find(item => item.package_id === id);
        const status = ready.has(id) ? (zh ? '已就绪' : 'Ready')
          : result?.status === 'failed' ? (zh ? '需要处理' : 'Needs attention')
          : snapshot.packageId === id && snapshot.packageStatus === 'installing' && !failed ? (zh ? '准备中' : 'Preparing')
          : (zh ? '等待准备' : 'Waiting');
        return <li key={id}><span>{labels[id] ?? id}</span><span>{status}</span></li>;
      })}</ul>
      <p>{zh ? '包括智能体的必需依赖和 MAC 轻量素材目录；完整大素材可在软件中心按需安装。' : 'Includes required dependencies and the lightweight MAC media catalog. Install full media from Software Center when needed.'}</p>
    </DisclosureRow> : null}
    {active && !finished && !failed ? <div>
      <p>{labels[active.active_package_id ?? active.package_id] ?? active.active_package_id ?? active.package_id} · {readError ? (zh ? '进度待确认' : 'Progress unavailable') : packageStagePresentation(active, locale).label}</p>
      {downloading ? <><progress value={total && total > 0 ? Math.min(bytes!, total) : undefined} max={total && total > 0 ? total : 1} aria-label={zh ? '当前组件下载进度' : 'Current component download progress'} /><small>{formatBytes(bytes!, locale)}{total && total > 0 ? ` / ${formatBytes(total, locale)}` : ''}{active.bytes_per_second ? ` · ${formatBytes(active.bytes_per_second, locale)}/s` : ''}</small></> : null}
    </div> : null}
    {failed ? <p>{packages ? (zh ? '打开软件中心检查未完成项，或在设置中恢复官方组合。其他已就绪能力可继续使用。' : 'Check unfinished items in Software Center, or restore the official profile in Settings. Ready capabilities remain available.')
      : snapshot.source === 'bundled'
        ? (zh ? '本机准备未完成，请检查可用磁盘空间和安装包是否完整，然后重试。此步骤无需联网。' : 'Local setup did not complete. Check available disk space and the installation package, then retry. This step does not need internet.')
        : (zh ? '请检查网络和可用磁盘空间，然后重试本机准备。' : 'Check your connection and available disk space, then retry local setup.')}</p> : null}
    <div className="opl-first-install-actions">
      {packages ? <Button variant="ghost" size="sm" onClick={onOpenSoftware}>{zh ? '在软件中心查看' : 'View in Software Center'}</Button> : null}
      {retryError ? <span role="alert">{snapshot.source === 'bundled'
        ? (zh ? '本机准备仍未完成，请检查安装包和可用磁盘空间后重试。' : 'Local setup still needs attention. Check the installation package and available disk space, then retry.')
        : (zh ? '重试未完成，请检查网络和可用磁盘空间后再试。' : 'Setup could not restart. Check your connection and available disk space, then retry.')}</span> : null}
      {failed && !packages ? <Button variant="outline" size="sm" icon={<IconDownloadOutlineRegular size={14} />} disabled={retrying} onClick={async () => { setRetrying(true); setRetryError(false); try { await onRetryRuntime(); } catch { setRetryError(true); } finally { setRetrying(false); } }}>{zh ? '重试准备' : 'Retry setup'}</Button> : null}
      {finished ? <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>{zh ? '知道了' : 'Done'}</Button> : null}
    </div>
  </section>;
}
