import type { WorkbenchModel } from "./workbenchModel";
import type { SettingsActionRequest } from "./settingsActions";
import { actionPayloadComplete } from "./settingsActions";
import { catalogDisplayName } from "./SoftwareCatalogMetadata";
import { catalogInstalledVersion, catalogStateLabel, packageCatalogState, softwareCatalogPackages } from "./softwareCatalog";
import { packageAccessNeedsAttention, packageActionLabel } from "./settings/packages";

/** Each update keeps the Package owner's exact action; external plugins are never in an OPL batch. */
export function OplSoftwareUpdates({ model, locale, actionBusyKey, onAction, onManageSources }: { model: WorkbenchModel; locale: "zh" | "en"; actionBusyKey: string | null; onAction(request: SettingsActionRequest): void; onManageSources?: () => void }) {
  const zh = locale === "zh";
  const packages = softwareCatalogPackages(model, "opl");
  const actionable = packages.filter(item => ["update_available", "attention"].includes(packageCatalogState(item)));
  return <section className="opl-package-updates" data-testid="opl-package-update-summary"><h2>{zh ? "OPL 软件" : "OPL software"}</h2>
    <p>{actionable.length ? (zh ? `${actionable.length} 个软件可更新或需要处理` : `${actionable.length} software items need an update or attention`) : (zh ? "当前没有已确认的可用更新。" : "No available updates have been confirmed.")}</p>
    {actionable.map(item => {
      const state = packageCatalogState(item), name = catalogDisplayName(item.label, item.displayNameI18n, locale);
      const accessBlocked = packageAccessNeedsAttention(item);
      const action = accessBlocked ? undefined : item.actions.find(candidate => candidate.kind === (state === "update_available" ? "update" : "repair") && candidate.status === "available" && actionPayloadComplete(candidate.payload, candidate.requiredPayloadFields));
      return <div className="opl-package-update-row" key={item.packageId}><div><strong>{name}</strong><span>{catalogInstalledVersion(item, locale)}{state === "update_available" && item.availableVersion ? ` → ${item.availableVersion}` : ""}</span></div><span>{catalogStateLabel(state, locale)}</span>{accessBlocked && onManageSources ? <button type="button" className="settings-action-button" onClick={onManageSources}>{zh ? "检查软件源" : "Check source"}</button> : action ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={() => onAction({ key: `package:${item.packageId}:${action.actionId}`, actionId: action.actionId, label: `${packageActionLabel(action, locale)} ${name}`, payload: action.payload, confirmationRequired: action.confirmationRequired, dryRunSupported: action.dryRunSupported })}>{packageActionLabel(action, locale)}</button> : <span className="opl-update-owner-note">{zh ? "请在软件详情中检查来源或安装状态" : "Check the source or installation in software details"}</span>}</div>;
    })}
  </section>;
}
