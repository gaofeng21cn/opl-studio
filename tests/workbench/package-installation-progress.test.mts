import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PackageOperations, PackageDownloadPreview } from '../../src/workbench/PackageInstallationProgress';
import { packageOperationRequest, preparePackageOperationRequest, readPackageOperation } from '../../src/workbench/packageOperations';
import { actionReceiptView } from '../../src/workbench/actionReceiptView';

const operation = { operation_id: 'fixture', package_id: 'mac-media-assets', action_id: 'agent_package_install', status: 'running', stage: 'downloading', can_cancel: true, downloaded_bytes: 250, total_bytes: 1000, bytes_per_second: 50, eta_seconds: 15 };
const render = (fields = {}) => renderToStaticMarkup(createElement(PackageOperations, { operations: [{ ...operation, ...fields }], locale: 'zh', labels: { 'mac-media-assets': 'MAC Media Assets' }, readError: false, cancelling: null, onCancel() {}, onRetry() {}, onRefresh() {} }));

test('download has measured progress while extraction and final readback never fake a percentage', () => {
  expect(render()).toContain('25%');
  expect(render()).toContain('value="250"');
  expect(render()).toContain('MAC Media Assets');
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
  const html = renderToStaticMarkup(createElement(PackageDownloadPreview, { plans: receipt.downloadPlan!, locale: 'zh' }));
  expect(html).toContain('/example/assets');
  expect(html).toContain('0.2.1');
  expect(html).toContain('下载后确认并检查空间');
});

test('only Package lifecycle requests use the background owner and acceptance is still running', () => {
  const request = { key: 'install', label: 'Install', actionId: 'agent_package_install', payload: { package_id: 'mac-media-assets' }, confirmationRequired: true };
  expect(packageOperationRequest(request).payload).toEqual({ action_id: 'agent_package_install', package_id: 'mac-media-assets' });
  expect(packageOperationRequest({ ...request, actionId: 'source_install' }).actionId).toBe('source_install');
  expect(readPackageOperation(operation)?.status).toBe('running');
});

test('the first install waits for owner capability discovery instead of racing into a blocking download', async () => {
  const request = { key: 'install', label: 'Install', actionId: 'agent_package_install', payload: { package_id: 'mac-media-assets' }, confirmationRequired: true };
  const owner = async () => ({ stdoutJson: { app_action_execution: { result: { operations: [] } } } }) as any;
  expect((await preparePackageOperationRequest(request, false, owner)).actionId).toBe('package_operation_start');
  expect((await preparePackageOperationRequest(request, false, async () => ({ status: 'error' }) as any)).actionId).toBe('agent_package_install');
});
