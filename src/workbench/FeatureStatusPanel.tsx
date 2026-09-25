import { useState } from 'react';
import type { WorkbenchActionRef, WorkbenchFeatureRef } from './workbenchModel';
import { actionPayloadComplete, type SettingsActionRequest } from './settingsActions';
import type { FeatureDestination } from './featureModel';

const stateLabels = {
  available: ['可用', 'Available'], degraded: ['部分可用 / 读取中', 'Degraded / loading'],
  not_configured: ['尚未配置', 'Not configured'], unavailable: ['不可用', 'Unavailable'],
  owner_action_required: ['需要所属服务提供能力', 'Owner action required'],
} as const;

function FeatureAction({ action, feature, busy, locale, onAction }: {
  action: WorkbenchActionRef; feature: WorkbenchFeatureRef; busy: boolean; locale: 'zh' | 'en'; onAction(request: SettingsActionRequest): void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const zh = locale === 'zh';
  const cleanup = feature.featureId === 'U1-06';
  // Cleanup stays in the existing Package/owner route, never a generic path editor.
  const disallowed = action.canSubmitToSafeActionShell === false || cleanup || feature.state === 'unavailable';
  const ready = !disallowed && actionPayloadComplete(values, action.payloadFields);
  function submit(previewOnly: boolean) {
    onAction({ key: `feature:${feature.featureId}:${action.id}`, actionId: action.id, label: action.label,
      payload: values, dryRunSupported: action.dryRunSupported,
      confirmationRequired: action.confirmationRequired || !['none', 'none_read_only'].includes(action.mutates), previewOnly });
  }
  return <div className="feature-action">
    <strong>{action.label}</strong>
    {!disallowed && action.payloadFields.map(field => <label key={field}>{field}<input aria-label={field} value={String(values[field] ?? '')} onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))} /></label>)}
    {disallowed ? <p>{zh ? '请使用此页面的所属服务操作入口；此处不直接执行。' : 'Use the owner controls on this page.'}</p> : <div>
      {action.dryRunSupported && <button type="button" disabled={busy || !ready} onClick={() => submit(true)}>{zh ? '预览操作' : 'Preview'}</button>}
      <button type="button" disabled={busy || !ready} onClick={() => submit(false)}>{zh ? '执行操作' : 'Run action'}</button>
      {!ready && <span>{zh ? '请填写所需参数。' : 'Complete the required fields.'}</span>}
    </div>}
  </div>;
}

export function FeatureStatusPanel({ features, locale, destination, onNavigate, onRefresh, onAction, busy }: {
  features: WorkbenchFeatureRef[]; locale: 'zh' | 'en'; destination: string;
  onNavigate(destination: FeatureDestination): void; onRefresh(): void;
  onAction(request: SettingsActionRequest): void; busy: boolean;
}) {
  const [query, setQuery] = useState('');
  const zh = locale === 'zh';
  const rows = features.filter(feature => (destination === 'overview' || feature.destination === destination)
    && `${feature.featureId} ${feature.label} ${feature.labelEn}`.toLowerCase().includes(query.toLowerCase()));
  if (!features.some(feature => destination === 'overview' || feature.destination === destination)) return null;
  return <details key={destination} className="feature-status-panel" data-testid="opl-feature-status-panel">
    <summary className="feature-status-heading"><span>{zh ? '功能诊断' : 'Feature diagnostics'}</span><small>{zh ? '查看详细状态与来源' : 'View detailed status and sources'}</small></summary>
    <div className="feature-status-content">
    <header><p>{zh ? '以下信息用于排查问题；尚未使用或配置的功能可能没有完整状态。' : 'Use these details for troubleshooting. Features you have not used or configured may not have a complete status.'}</p><button type="button" disabled={busy} onClick={onRefresh}>{zh ? '刷新状态' : 'Refresh status'}</button></header>
    {destination === 'overview' && <input aria-label={zh ? '搜索功能' : 'Search features'} placeholder={zh ? '搜索功能' : 'Search features'} value={query} onChange={event => setQuery(event.target.value)} />}
    {!rows.length && <p>{zh ? '没有匹配项' : 'No matches'}</p>}
    {rows.map(feature => <details className="feature-status-row" key={feature.featureId} data-testid="opl-feature-status-row" data-feature-id={feature.featureId} data-state={feature.state}>
      <summary><strong>{zh ? feature.label : feature.labelEn}</strong><span>{stateLabels[feature.state][zh ? 0 : 1]}</span></summary>
      <p>{zh ? feature.summary : feature.state === 'available' ? 'The owner surface is available.' : 'This capability is not fully ready. Refresh the owner state or configure it in the linked page.'}</p>
      <p>{zh ? feature.nextStep : 'Open the related page for results, configuration and owner actions.'}</p>
      {!feature.affectsCodex && <small>{zh ? '此功能的失败不阻塞普通 Codex 对话。' : 'Failure of this feature does not block ordinary Codex conversations.'}</small>}
      {destination !== feature.destination && <p><button type="button" onClick={() => onNavigate(feature.destination)}>{zh ? '打开功能页面' : 'Open feature page'}</button></p>}
      <details className="feature-status-source"><summary>{zh ? '状态来源' : 'State source'}</summary><dl><dt>Owner</dt><dd>{feature.owner}</dd><dt>Source</dt><dd>{feature.sourceRef}</dd><dt>ID</dt><dd>{feature.featureId}</dd></dl></details>
      {destination !== 'overview' && feature.featureId === 'B0-12' && !feature.sourceRef.startsWith('workbench_services.') && feature.actions.map(action => <FeatureAction key={action.id} action={action} feature={feature} locale={locale} onAction={onAction} busy={busy} />)}
      {!feature.actions.length && !feature.sourceRef.startsWith('workbench_services.') && feature.owner !== 'OPL Studio' && !feature.affectsCodex && <p>{zh ? '当前没有可直接执行的 owner action；刷新后仍不可用时，请在所属服务完成配置。' : 'No executable owner action is projected. Refresh or configure the owner service.'}</p>}
    </details>)}
    </div>
  </details>;
}
