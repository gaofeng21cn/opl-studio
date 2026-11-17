import type { WorkbenchModel } from "./workbenchModel";
import type { SettingsActionRequest } from "./settingsActions";
import { actionPayloadComplete } from "./settingsActions";
import { catalogDisplayName } from "./SoftwareCatalogMetadata";
import { activeSoftwareInstallation, catalogInstalledVersion, catalogStateLabel, nativeCatalogAvailableVersion, nativeCatalogState, packageCatalogState, softwareCatalogPackages, softwareCatalogNativeProducts } from "./softwareCatalog";
import { packageAccessNeedsAttention, packageActionLabel } from "./settings/packages";
import { nativeCarrierInstalled, nativeInstalledDisplayVersion, nativeUpdateStatusLabel, softwareSourceActionLabel } from "./softwareSources";
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
      if (failures.length) setError((zh ? "部分插件未完成更新：" : "Some plugins could not be updated: ") + failures.map(([name, reason]) => `${name.replace(/^@one-person-lab\//, "")} (${reason})`).join(", "));
      setProjection(await bridge.readDshPluginUpdates!());
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  return <section className="opl-package-updates" data-testid="dsh-plugin-updates">
    <h2>{zh ? "DSH 插件" : "DSH plugins"}</h2>
    <p>{projection ? (updates.length ? (zh ? `${updates.length} 个插件有兼容更新。更新后重启 App 即可加载新 Host 与客户端字节。` : `${updates.length} compatible plugin updates are available. Restart the App after updating to load the new Host and client bytes.`) : unavailable.length ? (zh ? `${unavailable.length} 个插件暂未完成版本检查。` : `${unavailable.length} plugins could not be checked.`) : entries.length ? (zh ? "已检查的插件均为当前 DSH cohort 下的最新兼容版本。" : "All checked plugins are current for this DSH cohort.") : (zh ? "当前没有可独立更新的已装插件。" : "No installed plugins support independent updates.")) : error ? (zh ? "插件版本检查未完成。" : "Plugin update check did not complete.") : (zh ? "正在检查插件版本…" : "Checking plugin versions…")}</p>
    {error ? <p role="alert">{error}</p> : null}
    {entries.map(([name, item]) => <div className="opl-package-update-row" key={name}>
      <div><strong>{name.replace(/^@one-person-lab\//, "")}</strong><span>{item.installed ?? "—"}{item.available && item.available !== item.installed ? ` → ${item.available}` : ""}</span></div>
      <span>{item.state === "update_available" ? (zh ? "可更新" : "Update available") : item.state === "unavailable" ? (zh ? "暂不可检查" : "Unavailable") : (zh ? "当前" : "Current")}</span>
    </div>)}
    {updates.length > 0 && bridge.updateDshPlugins ? <button type="button" className="settings-action-button" disabled={busy} onClick={() => void runUpdate()}>{busy ? (zh ? "更新中…" : "Updating…") : (zh ? "更新全部 DSH 插件" : "Update all DSH plugins")}</button> : null}
    {restartRequired && bridge.restartNativeApp ? <button type="button" className="settings-action-button" disabled={busy} onClick={() => void bridge.restartNativeApp!()}>{zh ? "重启 App 使插件生效" : "Restart App to activate plugins"}</button> : null}
  </section>;
}

/** Each update keeps the installation owner's exact action; external plugins are never in an OPL batch. */
export function OplSoftwareUpdates({ model, locale, actionBusyKey, onAction, onManageSources }: { model: WorkbenchModel; locale: "zh" | "en"; actionBusyKey: string | null; onAction(request: SettingsActionRequest): void; onManageSources?: () => void }) {
  const zh = locale === "zh";
  const packages = softwareCatalogPackages(model, "opl");
  const actionable = packages.filter(item => ["update_available", "attention"].includes(packageCatalogState(item)));
  const native = softwareCatalogNativeProducts(model, "opl").filter(({ item }) => ["update_available", "attention"].includes(nativeCatalogState(item)));
  const count = actionable.length + native.length;
  return <><section className="opl-package-updates" data-testid="opl-package-update-summary"><h2>{zh ? "OPL 软件" : "OPL software"}</h2>
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
  </section><DshPluginUpdates locale={locale}/></>;
}
