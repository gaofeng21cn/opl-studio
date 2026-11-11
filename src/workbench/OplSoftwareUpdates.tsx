import type { WorkbenchModel } from "./workbenchModel";
import type { SettingsActionRequest } from "./settingsActions";
import { actionPayloadComplete } from "./settingsActions";
import { catalogDisplayName } from "./SoftwareCatalogMetadata";
import { activeSoftwareInstallation, catalogInstalledVersion, catalogStateLabel, nativeCatalogAvailableVersion, nativeCatalogState, packageCatalogState, softwareCatalogPackages, softwareCatalogNativeProducts } from "./softwareCatalog";
import { packageAccessNeedsAttention, packageActionLabel } from "./settings/packages";
import { nativeCarrierInstalled, nativeInstalledDisplayVersion, nativeUpdateStatusLabel, softwareSourceActionLabel } from "./softwareSources";
import { availableInstallationActions, installationActionLabel, installationActionRequest } from "./SoftwareInstallations";

/** Each update keeps the installation owner's exact action; external plugins are never in an OPL batch. */
export function OplSoftwareUpdates({ model, locale, actionBusyKey, onAction, onManageSources }: { model: WorkbenchModel; locale: "zh" | "en"; actionBusyKey: string | null; onAction(request: SettingsActionRequest): void; onManageSources?: () => void }) {
  const zh = locale === "zh";
  const packages = softwareCatalogPackages(model, "opl");
  const actionable = packages.filter(item => ["update_available", "attention"].includes(packageCatalogState(item)));
  const native = softwareCatalogNativeProducts(model, "opl").filter(({ item }) => ["update_available", "attention"].includes(nativeCatalogState(item)));
  const count = actionable.length + native.length;
  return <section className="opl-package-updates" data-testid="opl-package-update-summary"><h2>{zh ? "OPL 软件" : "OPL software"}</h2>
    <p>{count ? (zh ? `${count} 个软件可更新或需要处理` : `${count} software items need an update or attention`) : (zh ? "当前没有已确认的可用更新。" : "No available updates have been confirmed.")}</p>
    {actionable.map(item => {
      const state = packageCatalogState(item), name = catalogDisplayName(item.label, item.displayNameI18n, locale);
      const accessBlocked = packageAccessNeedsAttention(item);
      const action = accessBlocked ? undefined : item.actions.find(candidate => candidate.kind === (state === "update_available" ? "update" : "repair") && candidate.status === "available" && actionPayloadComplete(candidate.payload, candidate.requiredPayloadFields));
      return <div className="opl-package-update-row" key={item.packageId}><div><strong>{name}</strong><span>{catalogInstalledVersion(item, locale)}{state === "update_available" && item.availableVersion ? ` → ${item.availableVersion}` : ""}</span></div><span>{catalogStateLabel(state, locale)}</span>{accessBlocked && onManageSources ? <button type="button" className="settings-action-button" onClick={onManageSources}>{zh ? "检查软件源" : "Check source"}</button> : action ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={() => onAction({ key: `package:${item.packageId}:${action.actionId}`, actionId: action.actionId, label: `${packageActionLabel(action, locale)} ${name}`, payload: action.payload, confirmationRequired: action.confirmationRequired, dryRunSupported: action.dryRunSupported })}>{packageActionLabel(action, locale)}</button> : <span className="opl-update-owner-note">{zh ? "请在软件详情中检查来源或安装状态" : "Check the source or installation in software details"}</span>}</div>;
    })}
    {native.map(product => {
      const { item, source, installations, productId } = product;
      const state = nativeCatalogState(item), name = item.productDisplayName ?? catalogDisplayName(item.displayName, item.displayNameI18n, locale);
      const targetVersion = item.updateStatus === "needs_restart" ? item.pendingVersion : nativeCatalogAvailableVersion(product, locale);
      const current = activeSoftwareInstallation(installations, item.activeInstallationId, item.activeInstallationStatus);
      const version = installations.length || item.activeInstallationStatus ? current?.displayVersion ?? current?.version : nativeInstalledDisplayVersion(item);
      const ownerAction = state === "update_available" && current ? availableInstallationActions(current).find(action => action.payload.operation === "update") : undefined;
      const sourceAction = !ownerAction && state === "update_available" && (!installations.length || current?.manager === "homebrew") && nativeCarrierInstalled(item) === true
        ? item.availableActions.find(action => action.actionId === "source_update" && action.status === "available"
          && source && action.payload.source_id === source.sourceId && action.payload.item_id === item.itemId
          && Boolean(item.revision) && action.payload.expected_revision === item.revision
          && actionPayloadComplete(action.payload, action.payloadFields)) : undefined;
      const request = ownerAction && current ? installationActionRequest(current, ownerAction, locale) : sourceAction ? {
        key: `source:${source?.sourceId}:${item.itemId}:${sourceAction.actionId}`, actionId: sourceAction.actionId,
        label: `${softwareSourceActionLabel(sourceAction.actionId, locale, sourceAction.label)} ${name}`, payload: sourceAction.payload,
        confirmationRequired: sourceAction.confirmationRequired, dryRunSupported: sourceAction.dryRunSupported,
      } : undefined;
      return <div className="opl-package-update-row" key={productId} data-product-id={productId}>
        <div><strong>{name}</strong><span>{version ?? "—"}{(state === "update_available" || item.updateStatus === "needs_restart") && targetVersion ? ` → ${targetVersion}` : ""}</span></div>
        <span>{item.updateStatus === "needs_restart" ? nativeUpdateStatusLabel(item.updateStatus, locale) : catalogStateLabel(state, locale)}</span>
        {request ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={() => onAction(request)}>{ownerAction ? installationActionLabel(ownerAction, locale) : softwareSourceActionLabel(sourceAction!.actionId, locale, sourceAction!.label)}</button>
          : <span className="opl-update-owner-note">{item.updateStatus === "needs_restart" ? (zh ? "更新已暂存，重启应用后生效。" : "The update is staged and will take effect after restarting the app.") : (zh ? "请在软件详情中检查来源或安装状态" : "Check the source or installation in software details")}</span>}
      </div>;
    })}
  </section>;
}
