import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/integrations/deepseek-harness/theme';
import { PackageOperations, PackageDownloadPreview } from '../../src/workbench/PackageInstallationProgress';
import type { PackageOperation } from '../../src/workbench/packageOperations';

// Rendered interaction evidence uses shipped components and the official DSH theme.
// The progress values below are deterministic fixtures, not a live installation.
function Fixture() {
  const [stage, setStage] = useState('downloading');
  const [theme, setTheme] = useState('light');
  Object.assign(window, { setPackageStage: setStage, setPackageTheme: setTheme });
  document.documentElement.dataset.theme = theme;
  const operation: PackageOperation = { operation_id: 'fixture', package_id: 'mac-media-assets', action_id: 'agent_package_install', status: ['failed', 'cancelled', 'completed'].includes(stage) ? stage : 'running', stage, can_cancel: ['preparing', 'downloading', 'verifying', 'extracting'].includes(stage), downloaded_bytes: 367001600, total_bytes: 980494343, bytes_per_second: 5242880, eta_seconds: 117, install_location: '/Users/example/Library/Application Support/OPL/state/codex-plugin-marketplaces/mac-media-assets/plugins/mac-media-assets', error_code: 'package_download_network_failed' };
  return <main style={{ maxWidth: 760, margin: '32px auto', padding: '0 24px', color: 'var(--dsw-alias-label-primary)' }}>
    <h1 style={{ fontSize: 24, marginBottom: 8 }}>软件中心</h1>
    <p>安装与更新 · 交互验收示例</p>
    {stage === 'preview' ? <PackageDownloadPreview locale="zh" plans={[{ package_id: 'mac-media-assets', version: '0.2.1', download_bytes: 983535677, cached_bytes: 367001600, available_disk_bytes: 148000000000, unpacked_bytes: null, install_location: operation.install_location! }]} /> : <PackageOperations operations={[operation]} locale="zh" labels={{ 'mac-media-assets': 'MAC Media Assets' }} readError={false} cancelling={null} onCancel={() => setStage('cancelled')} onRetry={() => setStage('downloading')} onRefresh={() => {}} />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
