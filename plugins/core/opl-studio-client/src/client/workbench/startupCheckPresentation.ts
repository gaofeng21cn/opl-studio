import type { OplInitializeReadback } from '../bridge/oplBridge';
import type { RuntimeOverviewRef } from './workbenchModel-runtime-contracts';

type Destination = 'account' | 'workspace' | 'services' | 'agents' | 'updates' | 'diagnostics';
export type StartupIssue = { id: string; title: string; detail: string; destination: Destination };

/**
 * The initialize checklist and fast runtime projection describe the same
 * family-runtime provider. Keep one actionable overview item when both reads
 * report that provider, while retaining the runtime impact in its detail.
 */
export function mergeBackgroundTaskIssue(
  startupIssues: StartupIssue[],
  temporal: Pick<RuntimeOverviewRef['temporal'], 'serviceReady' | 'workerReady' | 'schedulerReady'> | undefined,
  zh: boolean,
): StartupIssue[] {
  const runtimeUnready = temporal !== undefined
    && [temporal.serviceReady, temporal.workerReady, temporal.schedulerReady].some((value) => value === false);
  if (!runtimeUnready) return [...startupIssues];

  const providerIssue = startupIssues.find((issue) => issue.id === 'startup:family_runtime_provider');
  if (providerIssue) {
    const impact = zh
      ? '部分后台执行与定时能力受影响，普通对话可继续。'
      : 'Some background and scheduling capabilities are affected; chat remains available.';
    return startupIssues.map((issue) => issue.id === providerIssue.id
      ? { ...issue, detail: `${issue.detail} ${impact}` }
      : issue);
  }

  return [...startupIssues, {
    id: 'tasks',
    title: zh ? '后台任务尚未就绪' : 'Background tasks are not ready',
    detail: zh
      ? '部分后台执行与定时能力受影响，普通对话可继续。'
      : 'Some background and scheduling capabilities are affected; chat remains available.',
    destination: 'services',
  }];
}

export function startupCheckPresentation(initialization: OplInitializeReadback | null, readStatus: 'loading' | 'ready' | 'error', zh: boolean) {
  const system = initialization?.systemInitialize;
  const flow = system?.setupFlow;
  const complete = flow?.progress.required_completed_count ?? flow?.progress.ready_required_count;
  const total = flow?.progress.required_total_count ?? flow?.progress.total_required_count;
  const ready = flow?.readyToLaunch ?? system?.readiness.launchReady;
  const routes: Record<string, [string, string, Destination, string, string]> = {
    workspace_root: ['工作目录', 'Workspace', 'workspace', '检查目录是否存在且可写，或选择其他目录。', 'Check that the directory exists and is writable, or choose another directory.'],
    codex: ['本机助手', 'Local assistant', 'updates', '检查本机助手的安装状态并完成更新或修复。', 'Check the local assistant installation and update or repair it.'],
    codex_config: ['模型访问', 'Model access', 'account', '连接账户或配置模型服务密钥。', 'Connect your account or configure a model API key.'],
    family_runtime_provider: ['后台任务服务', 'Background task service', 'services', '检查后台服务与工作进程，按页面提示恢复后重新检查。', 'Check the background service and worker, recover them, then check again.'],
    domain_modules: ['智能体', 'Agents', 'agents', '检查智能体的依赖和可用性，安装或修复缺失能力。', 'Check agent dependencies and availability; install or repair missing capabilities.'],
    gui_shell: ['应用安装', 'App installation', 'updates', '检查应用版本与安装状态。', 'Check the app version and installation.'],
  };
  const issues: StartupIssue[] = (system?.checklist ?? []).filter(item => item.blocking || item.userActionRequired || flow?.blockingItems.includes(item.itemId)).map(item => {
    const route = routes[item.itemId];
    const title = route?.[zh ? 0 : 1] ?? item.label ?? item.itemId;
    const detail = item.reasonCode === 'temporal_worker_source_stale'
      ? (zh ? '后台工作进程仍使用旧版本。请在服务状态中重启后台工作进程，再重新检查。' : 'The background worker is using an older version. Restart it in Service status, then check again.')
      : route?.[zh ? 3 : 4] ?? item.nextVisibleStep ?? (zh ? '打开诊断查看此检查项，然后重新检查。' : 'Open diagnostics to inspect this check, then retry.');
    return { id: `startup:${item.itemId}`, title, detail, destination: route?.[2] ?? 'diagnostics' };
  });
  if (readStatus === 'loading') return { status: 'checking', detail: zh ? '正在读取启动检查结果…' : 'Reading startup checks…', issues: [] };
  if (readStatus === 'error') return { status: 'error', detail: zh ? '启动检查读取失败。请点“重新检查”；仍失败时打开日志与诊断。' : 'Startup checks could not be read. Retry; if it fails again, open diagnostics.', issues: [] };
  if (ready === undefined && !issues.length) return { status: 'unknown', detail: zh ? '未取得完整的启动检查结果，暂时无法判断。请点“重新检查”。' : 'Startup results are incomplete. Run the check again.', issues: [] };
  if (ready === false && !issues.length) issues.push({ id: 'startup:incomplete', title: zh ? '启动检查缺少问题详情' : 'Startup issue details are missing', detail: zh ? '服务报告尚未就绪，但未返回原因。请重新检查；仍无详情时打开日志与诊断。' : 'The service reports not ready without a reason. Retry, then open diagnostics if details remain missing.', destination: 'diagnostics' });
  const counts = complete !== undefined && total !== undefined && total > 0
    ? (zh ? `核心检查 ${complete} / ${total} 项通过。` : `Core checks: ${complete} / ${total} passed. `) : '';
  return { status: issues.length ? 'attention_needed' : ready === true ? 'ready' : 'unknown', detail: counts + (issues.length ? issues.map(item => `${item.title}：${item.detail}`).join(' ') : (zh ? '可以开始工作。' : 'Ready to start working.')), issues };
}
