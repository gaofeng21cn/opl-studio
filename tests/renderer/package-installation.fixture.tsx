import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/integrations/deepseek-harness/theme';
import { codexWorkbenchStyles } from '../../src/workbench/codexWorkbenchStyles';
import { ApplicationManagementPage } from '../../src/workbench/ApplicationManagementPage';
import { ShellOverlaySlot } from '../../src/composition/dshSlotHost-parts/shellSettingsSlots';
import { StudioContext, type StudioContextValue } from '../../src/composition/dshSlotHost-parts/studioContext';
import { SettingsActionDialog } from '../../src/workbench/settings/SettingsActionDialog';
import { deriveWorkbenchModelFromState } from '../../src/workbench/workbenchModel';
import { settingsDefaults } from '../../src/workbench/settingsModel';
import { buildSettingsActionViewModel } from '../../src/workbench/settingsActions';
import { packageActivity, type PackageOperation } from '../../src/workbench/packageOperations';

// Shipped Software Center and Shell controls with deterministic owner projections.
// All software, transfer values and actions in this fixture are illustrative.
const evidence = { refresh: 0, cancel: 0, retry: 0, opened: 0, used: 0 };
function Fixture() {
  const [stage, setStage] = useState('downloading');
  const [theme, setTheme] = useState('light');
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  const [conversation, setConversation] = useState(false);
  Object.assign(window, { packageEvidence: evidence, setPackageStage: setStage, setPackageTheme: setTheme, setPackageLocale: setLocale, setPackageConversation: setConversation });
  document.documentElement.dataset.theme = theme;
  document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark');
  const settings = { ...settingsDefaults, locale };
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    ['mac-media-assets', 'MAC Media Assets', 'capability', '经验证的医学动画与媒体素材库', stage === 'completed'],
    ['med-autocast', 'Med Auto Cast', 'agent', '从医学主题到可审阅科普视频', true],
    ['opl-bookforge', 'OPL Book Forge', 'agent', '编写、排版与交付长篇文稿和图书', true],
  ].map(([id, name, type, description, installed]) => ({ package_id: id, display_name: name, description,
    catalog_origin: 'opl', catalog_scope: 'software', software_type: type, installed, app_enabled: true,
    presence: { callable: installed }, miniapp_entry: { resource_uri: 'ui://fixture/app' },
  })) } } } });
  model.packageLifecycle.forEach(item => {
    item.installedVersion = item.installed ? '0.2.1' : undefined;
    item.availableVersion = '0.2.1'; item.distributionChannel = 'release';
    item.readiness.callable = item.installed === true;
    item.readiness.operationalReady = item.installed === true;
  });
  model.applicationManagement = { sharedResources: [] };
  model.softwareSources = { status: 'ready', entries: [] };
  model.knowledgeSources = { status: 'ready', contexts: [], entries: [], consumers: [], availableActions: [] } as any;
  model.stateGeneratedAt = '2026-11-13T10:30:00Z';
  const readError = stage === 'unknown';
  const operation: PackageOperation = {
    operation_id: 'fixture', package_id: 'mac-media-assets', action_id: 'agent_package_install',
    status: ['failed', 'cancelled', 'completed', 'interrupted'].includes(stage) ? stage : 'running', stage: readError ? 'downloading' : stage,
    can_cancel: ['preparing', 'downloading', 'verifying', 'extracting'].includes(stage),
    downloaded_bytes: 367001600, total_bytes: 980494343, bytes_per_second: 5242880, eta_seconds: 117, cached_bytes: 104857600,
    install_location: '/Users/example/Library/Application Support/OPL/state/codex-plugin-marketplaces/mac-media-assets/plugins/mac-media-assets', error_code: 'package_download_network_failed',
  };
  const operations = stage === 'idle' || stage === 'preview' ? [] : [operation];
  const controller = { operations, readError, supported: true, cancelling: null, accept: () => false,
    cancel: async () => { evidence.cancel++; setStage('cancelled'); }, refresh: () => { evidence.refresh++; setStage('downloading'); } };
  const openCenter = () => { evidence.opened++; setConversation(false); };
  const surface = { locale, primaryView: conversation ? 'conversation' : 'applications', overlay: null, detailsOpen: false, detailTabs: [],
    packageActivity: packageActivity(operations, readError), openPackageActivity: openCenter, openPrimaryView: openCenter } as unknown as StudioContextValue;
  return <><style>{codexWorkbenchStyles}{'body { margin: 0; overflow: auto; } #root { height: auto; min-height: 100vh; } .fixture-shell { position: relative; min-height: 100vh; background: var(--dsw-alias-bg-base); } .fixture-notice { padding: 8px 24px; color: var(--dsw-alias-label-secondary); font: 12px/1.5 sans-serif; }'}</style>
    <div className="fixture-shell"><p className="fixture-notice">交互验收示例 · 非真实安装 <button type="button" onClick={() => setConversation(value => !value)}>{conversation ? '打开软件中心' : '返回对话'}</button></p>
      {conversation ? <div style={{ padding: 48 }}><h1>继续你的任务</h1><p>后台安装仍在继续。</p></div> : <ApplicationManagementPage model={model} settings={settings} managedUpdate={null}
        packageOperations={controller} actionViewModel={buildSettingsActionViewModel(model, null)} nativeAppUpdate={null} actionBusyKey={null}
        onAction={() => { evidence.retry++; setStage('downloading'); }} onRefresh={() => { evidence.refresh++; }} onUseSoftware={() => { evidence.used++; setConversation(true); }} />}
      <StudioContext.Provider value={surface}><ShellOverlaySlot /></StudioContext.Provider>
      <SettingsActionDialog settings={settings} actionBusyKey={null} products={{ 'mac-media-assets': { name: 'MAC Media Assets', source: 'OPL Packages', distribution: 'release' } }}
        pendingConfirmation={stage === 'preview' ? { request: { key: 'fixture', label: locale === 'zh' ? '安装 MAC Media Assets' : 'Install MAC Media Assets', actionId: 'package_operation_start', payload: { action_id: 'agent_package_install', package_id: 'mac-media-assets' }, confirmationRequired: true }, previewStatus: 'preview_ready',
          preview: { actionId: 'package_operation_start', status: 'preview_ready', affectedCategories: [], downloadPlan: [{ package_id: 'mac-media-assets', version: '0.2.1', download_bytes: 980494343, cached_bytes: 367001600, available_disk_bytes: 148000000000, unpacked_bytes: null, install_location: operation.install_location! }] } } : null}
        onCancelAction={() => setStage('idle')} onConfirmAction={() => setStage('downloading')} />
    </div>
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
