import type { WorkbenchModel } from "./workbenchModel";
import type { WorkbenchSettings } from "./settingsModel";
import type { SettingsActionRequest } from "./settingsActions";
import { ConnectionsSection } from "./settings/ConnectionsSection";
import { knowledgeLibraryLabel, knowledgeSourceNeedsAttention } from "./knowledgeSources";
import { KnowledgeSourcesSection } from "./KnowledgeSourcesSection";

/** App-owned settings composition over the existing resource owners. */
export function SharedResourcesPage({ model, settings, actionBusyKey, onAction, onRefresh, onApproveConnectionAccess, onPickKnowledgeDirectory, selectedPackageId, focusedResourceId, onManageSources }: {
  model: WorkbenchModel; settings: WorkbenchSettings; actionBusyKey: string | null;
  onAction: (request: SettingsActionRequest) => void; onRefresh: () => void;
  onApproveConnectionAccess?: (requestId: string) => Promise<boolean>;
  onPickKnowledgeDirectory?: () => Promise<string | undefined>;
  selectedPackageId?: string; focusedResourceId?: string; onManageSources?: () => void;
}) {
  const zh = settings.locale === "zh";
  const products = new Map(model.packageLifecycle.map(item => [item.packageId, item]));
  const knowledge = model.knowledgeSources ? { ...model.knowledgeSources,
    consumers: model.knowledgeSources.consumers.map(consumer => {
      const product = consumer.packageId ? products.get(consumer.packageId) : undefined;
      return { ...consumer, label: product?.displayNameI18n[settings.locale] ?? product?.label ?? consumer.label };
    }) } : undefined;
  const attention = knowledge?.entries.filter(source => source.connected !== false && (knowledgeSourceNeedsAttention(source) || Boolean(source.knowledgeHealth?.reviewDueCount))) ?? [];
  const pending = model.settingsProjection?.connectionAuthorization?.requests.filter(request => request.status === "requested") ?? [];
  return <div className="opl-app-management-resources" data-testid="opl-resource-settings">
    <p className="opl-resource-intro">{zh ? "连接已有资料库和业务账号，分别决定哪些应用可以读取或维护。" : "Connect existing libraries and business accounts, and choose which apps can read or maintain them."}</p>
    {selectedPackageId && products.has(selectedPackageId) ? <p className="settings-inline-note" role="status">{zh ? "正在为以下软件配置：" : "Configuring access for: "}{products.get(selectedPackageId)?.displayNameI18n[settings.locale] ?? products.get(selectedPackageId)?.label}</p> : null}
    {attention.length + pending.length ? <details className="opl-software-attention" open><summary>{zh ? "需要处理" : "Needs attention"} · {attention.length + pending.length}</summary>{attention.map(source => <p key={source.resourceId}><a href={`#knowledge-${source.resourceId}`}>{knowledgeLibraryLabel(source, knowledge!, settings.locale)}</a> · {source.knowledgeHealth?.reviewDueCount ? (zh ? `${source.knowledgeHealth.reviewDueCount} 项待复核` : `${source.knowledgeHealth.reviewDueCount} need review`) : (zh ? "资料或授权需要检查" : "Check source or access")}</p>)}{pending.length ? <p><a href="#business-connections">{zh ? `${pending.length} 项账户访问请求等待授权` : `${pending.length} account access requests await approval`}</a></p> : null}</details> : null}
    <KnowledgeSourcesSection projection={knowledge} locale={settings.locale} actionBusyKey={actionBusyKey} onAction={onAction} onRefresh={onRefresh} onPickDirectory={onPickKnowledgeDirectory} selectedPackageId={selectedPackageId} focusedResourceId={focusedResourceId} />
    <section id="business-connections" className="opl-resource-section" aria-label={zh ? "外部服务与邮箱" : "External services & mailboxes"}>
      <div className="opl-resource-section-heading"><h2>{zh ? "外部服务与邮箱" : "External services & mailboxes"}</h2><p>{zh ? "为应用授权使用已连接的邮箱与外部服务。" : "Grant apps access to connected mailboxes and external services."}</p></div>
      <ConnectionsSection projection={model.settingsProjection} locale={settings.locale} actionBusyKey={actionBusyKey} onAction={onAction} onApproveConnectionAccess={onApproveConnectionAccess} />
    </section>
    {onManageSources ? <p className="settings-inline-note">{zh ? "软件的下载权限在软件源中管理。" : "Manage software download access in Software sources."} <button type="button" className="settings-inline-command" onClick={onManageSources}>{zh ? "管理软件源" : "Manage software sources"}</button></p> : null}
  </div>;
}
