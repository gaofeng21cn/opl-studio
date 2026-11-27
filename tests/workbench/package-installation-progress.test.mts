import { FirstInstallProgress } from '../../plugins/core/opl-studio-client/src/client/workbench/FirstInstallProgress';
import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PackageOperations, PackageDownloadPreview, PackageActivityButton } from '../../plugins/core/opl-studio-client/src/client/workbench/PackageInstallationProgress';
import { packageActivity, packageRemainingTime, packageOperationRequest, preparePackageOperationRequest, readPackageOperation, readStartedPackageOperation } from '../../plugins/core/opl-studio-client/src/client/workbench/packageOperations';
import { SoftwareCenterOverview } from '../../plugins/core/opl-studio-client/src/client/workbench/SoftwareCenterOverview';
import { runtimeDependencyStatus } from "../../plugins/core/opl-studio-client/src/client/workbench/softwareCatalog";
import { actionReceiptView } from '../../plugins/core/opl-studio-client/src/client/workbench/actionReceiptView';

const operation = { operation_id: 'fixture', package_id: 'mac-media-assets', action_id: 'agent_package_install', status: 'running', stage: 'downloading', can_cancel: true, downloaded_bytes: 250, total_bytes: 1000, bytes_per_second: 50, eta_seconds: 15 };
const render = (fields = {}) => renderToStaticMarkup(createElement(PackageOperations, { operations: [{ ...operation, ...fields }], locale: 'zh', labels: { 'mac-media-assets': 'MAC Media Assets' }, readError: false, cancelling: null, onCancel() {}, onRetry() {}, onRefresh() {} }));

test('download has measured progress while extraction and final readback never fake a percentage', () => {
  expect(render()).toContain('25%');
  expect(render()).toContain('value="250"');
  expect(render()).toContain('MAC Media Assets');
  expect(render()).toContain('约剩 15 秒');
  expect(render()).toContain('接下来：校验文件');
  const extracting = render({ stage: 'extracting' });
  expect(extracting).toContain('解压文件');
  expect(extracting).not.toContain('<progress');
  const installing = render({ stage: 'installing', can_cancel: false });
  expect(installing).not.toContain('取消安装');
  expect(installing).toContain('正在完成安装');
});

test('cancelled and failed operations expose explicit recovery without claiming installed', () => {
  expect(render({ stage: 'cancelled', status: 'cancelled', can_cancel: false })).toContain('继续安装');
  const failed = render({ stage: 'failed', status: 'failed', error_code: 'package_download_insufficient_space', can_cancel: false });
  expect(failed).toContain('磁盘空间不足');
  expect(failed).toContain('重试');
  expect(failed).not.toContain('安装完成');
});

test('preflight carries size and location through the real receipt projection, without inventing unpacked size', () => {
  const plan = { package_id: 'mac-media-assets', version: '0.2.1', install_location: '/example/assets', download_bytes: 983535677, cached_bytes: 1000, available_disk_bytes: 5e9, unpacked_bytes: null };
  const receipt = actionReceiptView({ actionId: 'package_operation_start', stdoutJson: { app_action_execution: { result: { download_plan: [plan] } } } } as any);
  const html = renderToStaticMarkup(createElement(PackageDownloadPreview, { plans: receipt.downloadPlan!, locale: 'zh', products: { 'mac-media-assets': { name: 'MAC Media Assets', source: 'OPL Packages', distribution: 'release' } } }));
  expect(html).toContain('/example/assets');
  expect(html).toContain('0.2.1');
  expect(html).toContain('<strong>MAC Media Assets</strong>');
  expect(html).toContain('OPL Packages');
  expect(html).toContain('发布版');
  expect(html).toContain('下载后确认并检查空间');
});

test('only Package lifecycle requests use the background owner and acceptance is still running', () => {
  const request = { key: 'install', label: 'Install', actionId: 'agent_package_install', payload: { package_id: 'mac-media-assets' }, confirmationRequired: true };
  expect(packageOperationRequest(request).payload).toEqual({ action_id: 'agent_package_install', package_id: 'mac-media-assets' });
  expect(packageOperationRequest({ ...request, actionId: 'source_install' }).actionId).toBe('source_install');
  expect(readPackageOperation(operation)?.status).toBe('running');
  const receipt = {
    status: 'executed', actionId: 'package_operation_start',
    payload: { action_id: 'agent_package_repair', package_id: 'mac-media-assets' },
    stdoutJson: { app_action_execution: { result: { operation_id: 'opl-op-42', status: 'running' } } }
  } as any;
  expect(readStartedPackageOperation(receipt)).toEqual({
    operation_id: 'opl-op-42', package_id: 'mac-media-assets', action_id: 'agent_package_repair',
    status: 'running', stage: 'preparing', can_cancel: false
  });
  expect(readStartedPackageOperation({ ...receipt, payload: {} })).toBeNull();
  expect(readStartedPackageOperation({ ...receipt, status: 'preview_ready' })).toBeNull();
});

test('the first install waits for owner capability discovery instead of racing into a blocking download', async () => {
  const request = { key: 'install', label: 'Install', actionId: 'agent_package_install', payload: { package_id: 'mac-media-assets' }, confirmationRequired: true };
  const owner = async () => ({ stdoutJson: { app_action_execution: { result: { operations: [] } } } }) as any;
  const synchronous = async () => ({ stdoutJson: { app_action_execution: { result: { supports_background: false, operations: [operation] } } } }) as any;
  expect(await preparePackageOperationRequest(request, undefined, synchronous)).toBe(request);
  expect(await preparePackageOperationRequest(request, false, () => { throw new Error('unexpected probe'); })).toBe(request);
  expect((await preparePackageOperationRequest(request, undefined, owner)).actionId).toBe('package_operation_start');
  expect((await preparePackageOperationRequest(request, undefined, async () => ({ status: 'error' }) as any)).actionId).toBe('agent_package_install');
});


test('stale progress is not shown as live and an interrupted result offers inspection before another write', () => {
  const stale = renderToStaticMarkup(createElement(PackageOperations, { operations: [operation], locale: 'zh', labels: {}, readError: true, cancelling: null, onCancel() {}, onRetry() {}, onRefresh() {} }));
  expect(stale).toContain('结果待确认');
  expect(stale).not.toContain('<progress');
  expect(stale).not.toContain('50 B/s');
  const interrupted = render({ status: 'interrupted', stage: 'interrupted', can_cancel: false });
  expect(interrupted).toContain('检查软件状态');
  expect(interrupted).not.toContain('>重试');
  expect(interrupted).not.toContain('安装完成');
});

test('a newer successful attempt clears an old failure and active tasks are never hidden by recent history', () => {
  const old = { ...operation, status: 'failed', stage: 'failed' };
  expect(packageActivity([{ ...old, operation_id: 'new', status: 'completed' }, old], false)).toEqual({ running: 0, attention: 0, readError: false });
  const rows = Array.from({ length: 5 }, (_, i) => ({ ...operation, package_id: `finished-${i}`, operation_id: `finished-${i}`, status: 'completed', stage: 'completed' }));
  const html = renderToStaticMarkup(createElement(PackageOperations, { operations: [...rows, operation], locale: 'en', labels: { 'mac-media-assets': 'MAC Media Assets' }, readError: false, cancelling: null, onCancel() {}, onRetry() {}, onRefresh() {} }));
  expect(html).toContain('value="250"');
  expect(html.indexOf('MAC Media Assets')).toBeLessThan(html.indexOf('Recent tasks'));
  expect(render({ status: 'completed', stage: 'completed', action_id: 'agent_package_repair' })).toContain('<details class="opl-package-operation-history">');
  expect(render({ status: 'completed', stage: 'completed', action_id: 'agent_package_repair' })).toContain('恢复安装完成');
});

test('global activity and overview distinguish unknown results, background work and ordinary updates', () => {
  const activity = packageActivity([operation], false);
  expect(renderToStaticMarkup(createElement(PackageActivityButton, { activity, locale: 'zh', onOpen() {} }))).toContain('1 项进行中');
  expect(renderToStaticMarkup(createElement(PackageActivityButton, { activity: { ...activity, readError: true }, locale: 'zh', onOpen() {} }))).toContain('进度待确认');
  expect(renderToStaticMarkup(createElement(PackageActivityButton, { activity: { running: 0, attention: 0, readError: false }, locale: 'zh', onOpen() {} }))).toBe('');
  const props = { locale: 'zh' as const, stateStatus: 'ready' as const, stateUnknown: false, inventory: { total: 5, installed: 3, notInstalled: 2, updates: 1 }, catalogAvailable: true, complete: true, activity: { running: 0, attention: 0, readError: false }, observedAt: null, onUpdates() {}, onActivity() {}, onRefresh() {} };
  expect(renderToStaticMarkup(createElement(SoftwareCenterOverview, props))).toContain('1 个软件可更新');
  const unknown = renderToStaticMarkup(createElement(SoftwareCenterOverview, { ...props, stateStatus: 'error' }));
  expect(unknown).toContain('刷新失败');
  expect(unknown).not.toContain('当前没有待办');
  expect(packageRemainingTime(3660, 'zh')).toBe('约剩 1.1 小时');
});


test('first installation separates offline payloads, network services and measured component transfer', () => {
  const snapshot = { stage: 'preparing_packages', source: 'bundled', status: 'running', rootPackageIds: ['mac-media-assets'], packageId: 'mac-media-assets', packageStatus: 'installing', packageResults: [] };
  const view = (readError = false, overrides = {}) => renderToStaticMarkup(createElement(FirstInstallProgress, {
    snapshot: { ...snapshot, ...overrides }, locale: 'zh', labels: { 'mac-media-assets': 'MAC 素材目录' }, operations: [operation], readError, onOpenSoftware() {}, onRetryRuntime() {},
  }));
  const html = view();
  expect(html).toContain('Full 已包含本机所需组件');
  expect(html).toContain('账户登录仍需联网');
  expect(html).toContain('MAC 素材目录');
  expect(html).toContain('value="250"');
  expect(html).toContain('软件中心');
  expect(html).not.toContain('25%');
  const unknown = view(true);
  expect(unknown).toContain('进度待确认');
  expect(unknown).not.toContain('<progress');
  const done = view(false, { status: 'completed', packageResults: [{ package_id: 'mac-media-assets', status: 'already_present' }] });
  expect(done).toContain('官方智能体已准备完成');
  expect(done).toContain('1 / 1');
  expect(done).not.toContain('<progress');
  const failed = view(false, { status: 'failed' });
  expect(failed).toContain('部分准备未完成');
  expect(failed).toContain('检查未完成项');
  expect(failed).not.toContain('请保持应用开启');
  const localFailure = view(false, { stage: 'installing_offline_runtime', status: 'failed', source: 'bundled' });
  expect(localFailure).toContain('此步骤无需联网');
  expect(localFailure).toContain('磁盘空间');
  expect(localFailure).not.toContain('检查网络');
});

test('a partially present SDK and a detected system CLI report distinct states', () => {
  const sdk = { dependencyId: 'temporal-runtime', dependencyKind: 'runtime_substrate', installed: true, version: { worker: '1.25.0', client: null }, latestVersion: '1.25.0',
    currentness: 'missing', status: 'attention_needed', updatePolicy: 'updated_with_opl_base_framework_generation', updateMode: 'silent_managed', activationPolicy: 'app_launch_reconcile_generation_switch' };
  expect(runtimeDependencyStatus(sdk, 'zh')).toEqual({ state: 'attention', label: '组件安装不完整' });
  expect(runtimeDependencyStatus({ ...sdk, currentness: 'current', status: 'ready' }, 'zh')).toEqual({ state: 'installed' });
  expect(runtimeDependencyStatus({ ...sdk, dependencyKind: 'external_cli', status: 'unknown', currentness: 'unknown', version: null }, 'zh')).toEqual({ state: 'installed', label: '已检测到，版本未读' });
});
