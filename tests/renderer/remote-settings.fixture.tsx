import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../plugins/core/opl-studio-client/src/client/integrations/deepseek-harness/theme';
import { codexWorkbenchStyles } from '../../plugins/core/opl-studio-client/src/client/workbench/codexWorkbenchStyles';
import { ResourcesSettingsPage } from '../../plugins/core/opl-studio-client/src/client/workbench/settings/pages/ResourcesSettingsPage';
import { ProjectedContribution } from '../../plugins/core/opl-studio-client/src/client/composition/contributionComponents';
import { readUiContributionsProjection } from '../../plugins/core/opl-studio-client/src/client/composition/contributionProjection';
const entry = readUiContributionsProjection({ ui_contributions: { surface_kind: 'opl_app_ui_contributions_projection.v1', entries: [{ contribution_key: 'opl-channel-weixin:weixin', contribution_id: 'weixin', package_id: 'opl-channel-weixin', slot: 'settings.section', contribution_kind: 'view', trust_tier: 'declarative', scope: 'root', view: { view_id: 'weixin', view_type: 'channel_access', title_i18n: { en: 'Weixin', 'zh-CN': '微信' }, data_ref: 'weixin#state', command_ids: ['connect', 'submit', 'disconnect'] }, commands: [ ['connect', '连接本人微信'], ['submit', '验证并继续'], ['disconnect', '退出微信'] ].map(([id, title]) => ({ command_id: id, label_i18n: { en: title, 'zh-CN': title }, action_ref: `weixin#${id}`, confirmation_required: false })), badges: [] }] } }).entries[0]!;
function Fixture() {
  const [state, setState] = useState('disconnected');
  const [revision, setRevision] = useState(0);
  const [theme, setTheme] = useState('light');
  const owner = {
    locale: 'zh' as const, actionAvailable: true, refreshRevision: revision,
    readData: async () => ({ schema_version: 'opl-app-channel-access.v1', status: 'available', channel_id: 'weixin', connection: { state, ...(state === 'pin_required' ? { verification_challenge: { challenge_id: 'fixture-current', expires_at_ms: Date.now() + 60000, retry: false } } : {}) }, actions: [{ command_id: state === 'pin_required' ? 'submit' : state === 'disconnected' ? 'connect' : 'disconnect', input: { channel_id: 'weixin', ...(state === 'pin_required' ? { challenge_id: 'fixture-current' } : {}) } }], pending_pairings: [], authorized_users: [] }),
    onAction: (_entry: unknown, command: any, input: any) => { Object.assign(window, { lastRemoteInput: input }); setState(command.commandId === 'connect' ? 'pin_required' : command.commandId === 'submit' ? 'connected' : 'disconnected'); setRevision(value => value + 1); },
  };
  document.documentElement.dataset.theme = theme; document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark');
  Object.assign(window, { setRemoteScenario: (next: string) => { setState(next); setRevision(value => value + 1); }, setRemoteTheme: setTheme });
  return <><style>{codexWorkbenchStyles}{'body{margin:0;overflow:auto}#root{height:auto;min-height:100vh}.remote-fixture{max-width:860px;margin:0 auto;padding:24px;background:var(--dsw-alias-bg-base)}'}</style><main className="remote-fixture"><p className="settings-inline-note">交互验收示例 · 非真实微信登录</p><h1>远程连接与网页访问</h1><ResourcesSettingsPage {...({ resourceFocus: { section: 'remote' }, model: { packageLifecycle: [] }, settings: { locale: 'zh' }, zh: true, projection: null, actionBusyKey: null, dockerDiagnostic: null, onAction: () => {}, onOpenSoftwareCenter: () => {}, renderSettingsContributions: () => state === 'absent' ? null : <ProjectedContribution entry={entry} owner={owner} /> } as any)} /></main></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
