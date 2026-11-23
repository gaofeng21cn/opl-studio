import type { WorkbenchModel } from "./workbenchModel";
import type { SettingsActionRequest } from "./settingsActions";
import { actionPayloadComplete } from "./settingsActions";
import { catalogDisplayName } from "./SoftwareCatalogMetadata";
import { activeSoftwareInstallation, catalogInstalledVersion, nativeCatalogAvailableVersion, nativeCatalogState, nativeCatalogStatusLabel, packageCatalogState, packageCatalogStatusLabel, softwareCatalogPackages, softwareCatalogNativeProducts } from "./softwareCatalog";
import { packageAccessNeedsAttention, packageActionLabel } from "./settings/packages";
import { nativeCarrierInstalled, nativeInstalledDisplayVersion, softwareSourceActionLabel } from "./softwareSources";
import { availableInstallationActions, installationActionLabel, installationActionRequest } from "./SoftwareInstallations";
import { useEffect, useState } from "react";
import type { DshPluginUpdateProjection } from "../bridge/oplBridge";

function DshPluginUpdates({ locale }: { locale: "zh" | "en" }) {
  const zh = locale === "zh";
  const [projection, setProjection] = useState<DshPluginUpdateProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [restartRequired, setRestartRequired] = useState(false);
  const bridge = typeof window === "undefined" ? undefined : window.oplStudio;
  useEffect(() => {
    let active = true;
    if (!bridge?.readDshPluginUpdates) return;
    void bridge.readDshPluginUpdates().then(value => { if (active) { setProjection(value); setError(""); } }, reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [bridge]);
  if (!bridge?.readDshPluginUpdates) return null;
  const entries = Object.entries(projection?.plugins ?? {});
  const updates = entries.filter(([, item]) => item.state === "update_available");
  const unavailable = entries.filter(([, item]) => item.state === "unavailable");
  const runUpdate = async () => {
    if (!bridge.updateDshPlugins || busy) return;
    setBusy(true); setError("");
    try {
      const result = await bridge.updateDshPlugins({ all: true });
      setRestartRequired(value => value || result.application === "restart-required");
      const failures = Object.entries(result.failures ?? {});
      if (failures.length) setError((zh ? "部分扩展组件未完成更新：" : "Some extension components could not be updated: ") + failures.map(([name, reason]) => `${name.replace(/^@gaofeng21cn\//, "")} (${reason})`).join(", "));
      setProjection(await bridge.readDshPluginUpdates!());
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  const allCurrent = Boolean(projection) && updates.length === 0 && unavailable.length === 0 && !restartRequired && !error;
  const rows = entries.map(([name, item]) => <div className="opl-package-update-row" key={name}>
    <div><strong>{name.replace(/^@gaofeng21cn\//, "")}</strong><span>{item.installed ?? "—"}{item.available && item.available !== item.installed ? ` → ${item.available}` : ""}</span></div>
    <span>{item.state === "update_available" ? (zh ? "可更新" : "Update available") : item.state === "unavailable" ? (zh ? "暂不可检查" : "Unavailable") : (zh ? "已是最新" : "Current")}</span>
  </div>);
  if (allCurrent) {
    return <details className="settings-advanced-actions opl-plugin-updates-details" data-testid="dsh-plugin-updates">
      <summary>{zh ? `应用扩展组件 · 已是最新 (${entries.length} 项)` : `App extension components · Up to date (${entries.length})`}</summary>
      {rows}
    </details>;
  }
  return <section className="opl-package-updates" data-testid="dsh-plugin-updates">
    <h2>{zh ? "应用扩展组件" : "App extension components"}</h2>
    <p>{projection ? (updates.length ? (zh ? `${updates.length} 个扩展组件有可用更新，更新后重启应用即可生效。` : `${updates.length} extension component updates are available. Restart the app after updating to apply them.`) : unavailable.length ? (zh ? `${unavailable.length} 个扩展组件暂未完成版本检查。` : `${unavailable.length} extension components could not be checked.`) : (zh ? "当前没有可独立更新的扩展组件。" : "No extension components support independent updates.")) : error ? (zh ? "扩展组件版本检查未完成。" : "Extension component update check did not complete.") : (zh ? "正在检查扩展组件版本…" : "Checking extension component versions…")}</p>
    {error ? <p role="alert">{error}</p> : null}
    <div className="opl-plugin-update-actions">
      {updates.length > 0 && bridge.updateDshPlugins ? <button type="button" className="settings-action-button primary" disabled={busy} onClick={() => void runUpdate()}>{busy ? (zh ? "更新中…" : "Updating…") : (zh ? "更新全部扩展组件" : "Update all extensions")}</button> : null}
      {restartRequired && bridge.restartNativeApp ? <button type="button" className="settings-action-button primary" disabled={busy} onClick={() => void bridge.restartNativeApp!()}>{zh ? "重启应用使更新生效" : "Restart app to apply updates"}</button> : null}
    </div>
    {entries.length ? <details className="opl-plugin-updates-list" open={updates.length > 0 || unavailable.length > 0}><summary>{zh ? `查看组件明细 (${entries.length})` : `View component details (${entries.length})`}</summary>{rows}</details> : null}
  </section>;
}

/** Each update keeps the installation owner's exact action; external plugins are never in an OPL batch. */
export function OplSoftwareUpdates({ model, locale, actionBusyKey, onAction, onManageSources }: { model: WorkbenchModel; locale: "zh" | "en"; actionBusyKey: string | null; onAction(request: SettingsActionRequest): void; onManageSources?: () => void }) {
  const zh = locale === "zh";
  const bridge = typeof window === "undefined" ? undefined : window.oplStudio;
  const packages = softwareCatalogPackages(model, "opl");
  const actionable = packages.filter(item => ["update_available", "attention"].includes(packageCatalogState(item)));
  const native = softwareCatalogNativeProducts(model, "opl").filter(({ item }) => ["update_available", "attention"].includes(nativeCatalogState(item)));
  const count = actionable.length + native.length;
  return <><section className="opl-package-updates" data-testid="opl-package-update-summary"><h2>{zh ? "OPL 软件与插件" : "OPL software & plugins"}</h2>
    <p>{count ? (zh ? `${count} 项可更新或需确认状态` : `${count} items can be updated or need review`) : (zh ? "所有已检查的 OPL 软件和插件均为当前最新。" : "All checked OPL software and plugins are up to date.")}</p>
    {actionable.map(item => {
      const state = packageCatalogState(item), name = catalogDisplayName(item.label, item.displayNameI18n, locale);
      const accessBlocked = packageAccessNeedsAttention(item);
      const action = accessBlocked ? undefined : item.actions.find(candidate => candidate.kind === (state === "update_available" ? "update" : "repair") && candidate.status === "available" && actionPayloadComplete(candidate.payload, candidate.requiredPayloadFields));
      return <div className="opl-package-update-row" key={item.packageId}><div><strong>{name}</strong><span>{catalogInstalledVersion(item, locale)}{state === "update_available" && item.availableVersion ? ` → ${item.availableVersion}` : ""}</span></div><span>{packageCatalogStatusLabel(item, locale)}</span>{accessBlocked && onManageSources ? <button type="button" className="settings-action-button" onClick={onManageSources}>{zh ? "检查软件源" : "Check source"}</button> : action ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={() => onAction({ key: `package:${item.packageId}:${action.actionId}`, actionId: action.actionId, label: `${packageActionLabel(action, locale)} ${name}`, payload: action.payload, confirmationRequired: action.confirmationRequired, dryRunSupported: action.dryRunSupported })}>{packageActionLabel(action, locale)}</button> : <span className="opl-update-owner-note">{zh ? "请在软件详情中检查来源或安装状态" : "Check the source or installation in software details"}</span>}</div>;
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
        <span>{nativeCatalogStatusLabel(item, locale)}</span>
        {request ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={() => onAction(request)}>{ownerAction ? installationActionLabel(ownerAction, locale) : softwareSourceActionLabel(sourceAction!.actionId, locale, sourceAction!.label)}</button>
          : item.updateStatus === "needs_restart" && bridge?.restartNativeApp ? <button type="button" className="settings-action-button primary" disabled={actionBusyKey !== null} onClick={() => void bridge.restartNativeApp!()}>{zh ? "重启应用生效" : "Restart to apply"}</button>
          : <span className="opl-update-owner-note">{item.updateStatus === "needs_restart" ? (zh ? "更新已暂存，重启应用后生效。" : "The update is staged and will take effect after restarting the app.") : (zh ? "请在软件详情中检查来源或安装状态" : "Check the source or installation in software details")}</span>}
      </div>;
    })}
  </section><DshPluginUpdates locale={locale}/></>;
}
