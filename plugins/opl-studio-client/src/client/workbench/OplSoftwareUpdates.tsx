import type { WorkbenchModel } from "./workbenchModel";
import type { SettingsActionRequest } from "./settingsActions";
import { actionPayloadComplete } from "./settingsActions";
import { catalogDisplayName } from "./SoftwareCatalogMetadata";
import { activeSoftwareInstallation, catalogInstalledVersion, nativeCatalogAvailableVersion, nativeCatalogState, nativeCatalogStatusLabel, packageCatalogState, packageCatalogStatusLabel, softwareCatalogPackages, softwareCatalogNativeProducts } from "./softwareCatalog";
import { packageAccessNeedsAttention, packageActionLabel } from "./settings/packages";
import { nativeCarrierInstalled, nativeInstalledDisplayVersion, softwareSourceActionLabel } from "./softwareSources";
import { availableInstallationActions, installationActionLabel, installationActionRequest } from "./SoftwareInstallations";
import { useEffect, useState } from "react";
import type { BillionContextPreference, DshPluginUpdateProjection, NativeAppUpdateResult } from "../bridge/oplBridge";

export function restartOutcomeMessage(result: NativeAppUpdateResult | undefined, zh: boolean): string {
  if (result?.reasonCode === "app_server_busy") {
    return zh ? "当前仍有任务正在运行，请任务完成后再重启应用。" : "A task is still running. Finish or wait for it before restarting the app.";
  }
  if (result?.reasonCode === "downloaded_update_required") {
    return zh ? "当前没有待安装的应用更新。" : "No downloaded update is waiting to install.";
  }
  if (result?.reasonCode === "desktop_restart_preparation_failed" || result?.errorCode === "desktop_restart_preparation_failed") {
    return zh ? "重启前准备未完成，请手动重启应用以使更新生效。" : "Restart preparation failed. Restart the app manually to apply the updates.";
  }
  if (result?.message) return result.message;
  return zh ? "当前运行环境无法自动重启，请手动重启应用以使更新生效。" : "Automatic restart is unavailable here. Restart the app manually to apply the updates.";
}

export function dshPluginFailureMessage(reason: string | undefined, zh: boolean): string {
  const labels: Record<string, [string, string]> = {
    auth_required: ["需要登录软件源凭据后重试", "Source authentication required; retry after connecting credentials"],
    timeout: ["连接插件更新源超时", "Timed out checking plugin update source"],
    network: ["网络连接失败", "Network connection failed"],
    feed_unavailable: ["公开插件更新清单暂不可用，稍后将自动重试", "Public plugin update index is temporarily unavailable; will retry automatically"],
    no_compatible_version: ["暂无适配当前应用核心的新版本", "No newer version compatible with this app core is published yet"],
    integrity_mismatch: ["更新包校验失败，已拒绝安装以保护当前环境", "Update integrity verification failed; rejected to keep the installation safe"],
    invalid_feed_response: ["插件更新清单格式异常", "Plugin update index response was invalid"],
    invalid_registry_response: ["软件源返回了异常格式的版本信息", "Registry returned an invalid version response"],
    registry_lookup_failed: ["检查插件版本失败", "Plugin version check failed"],
    installed_version_mismatch: ["安装后的版本号与预期不一致", "Installed plugin version did not match expected target"]
  };
  const matched = reason && labels[reason];
  if (matched) return matched[zh ? 0 : 1];
  return zh ? "检查或安装未完成，稍后将重试" : "Check or install did not complete; will retry";
}

function resolvePackageLifecycleUpdateRequest(item: ReturnType<typeof softwareCatalogPackages>[number], locale: "zh" | "en", allowRepair = true): SettingsActionRequest | undefined {
  const state = packageCatalogState(item);
  if (packageAccessNeedsAttention(item)) return undefined;
  const kind = state === "update_available" ? "update" : allowRepair ? "repair" : undefined;
  if (!kind) return undefined;
  const action = item.actions.find(candidate => candidate.kind === kind && candidate.status === "available" && actionPayloadComplete(candidate.payload, candidate.requiredPayloadFields));
  if (!action) return undefined;
  const name = catalogDisplayName(item.label, item.displayNameI18n, locale);
  return {
    key: `package:${item.packageId}:${action.actionId}`,
    actionId: action.actionId,
    label: `${packageActionLabel(action, locale)} ${name}`,
    payload: action.payload,
    confirmationRequired: action.confirmationRequired,
    dryRunSupported: action.dryRunSupported
  };
}

function resolveNativeUpdateRequest(product: ReturnType<typeof softwareCatalogNativeProducts>[number], locale: "zh" | "en"): {
  request?: SettingsActionRequest;
  label?: string;
} {
  const { item, source, installations } = product;
  const state = nativeCatalogState(item);
  const name = item.productDisplayName ?? catalogDisplayName(item.displayName, item.displayNameI18n, locale);
  const current = activeSoftwareInstallation(installations, item.activeInstallationId, item.activeInstallationStatus);
  const ownerAction = state === "update_available" && current ? availableInstallationActions(current).find(action => action.payload.operation === "update") : undefined;
  const sourceAction = !ownerAction && state === "update_available" && (!installations.length || current?.manager === "homebrew") && nativeCarrierInstalled(item) === true
    ? item.availableActions.find(action => action.actionId === "source_update" && action.status === "available"
      && source && action.payload.source_id === source.sourceId && action.payload.item_id === item.itemId
      && Boolean(item.revision) && action.payload.expected_revision === item.revision
      && actionPayloadComplete(action.payload, action.payloadFields)) : undefined;
  if (ownerAction && current) {
    return { request: installationActionRequest(current, ownerAction, locale), label: installationActionLabel(ownerAction, locale) };
  }
  if (sourceAction) {
    const label = softwareSourceActionLabel(sourceAction.actionId, locale, sourceAction.label);
    return {
      request: {
        key: `source:${source?.sourceId}:${item.itemId}:${sourceAction.actionId}`,
        actionId: sourceAction.actionId,
        label: `${label} ${name}`,
        payload: sourceAction.payload,
        confirmationRequired: sourceAction.confirmationRequired,
        dryRunSupported: sourceAction.dryRunSupported
      },
      label
    };
  }
  return {};
}

export function packageUpdateRequests(model: WorkbenchModel, locale: "zh" | "en"): SettingsActionRequest[] {
  const packageRequests = softwareCatalogPackages(model, "all")
    .filter(item => packageCatalogState(item) === "update_available")
    .flatMap(item => {
      const request = resolvePackageLifecycleUpdateRequest(item, locale, false);
      return request ? [request] : [];
    });
  const nativeRequests = softwareCatalogNativeProducts(model, "all")
    .filter(({ item }) => nativeCatalogState(item) === "update_available")
    .flatMap(product => {
      const { request } = resolveNativeUpdateRequest(product, locale);
      return request ? [request] : [];
    });
  return [...packageRequests, ...nativeRequests];
}

function DshPluginUpdates({ locale, externalRestartRequired = false, refreshRevision = 0, onSummaryChange, onRestartRequired }: {
  locale: "zh" | "en";
  externalRestartRequired?: boolean;
  refreshRevision?: number;
  onSummaryChange?: (updatesCount: number) => void;
  onRestartRequired?: () => void;
}) {
  const zh = locale === "zh";
  const [projection, setProjection] = useState<DshPluginUpdateProjection | null>(null);
  const [checkNonce, setCheckNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState("");
  const [restartRequired, setRestartRequired] = useState(false);
  const bridge = typeof window === "undefined" ? undefined : window.oplStudio;
  useEffect(() => {
    let active = true;
    if (typeof bridge?.readDshPluginUpdates !== "function") return;
    void bridge.readDshPluginUpdates().then(
      value => { if (active) { setProjection(value); setError(""); } },
      reason => { if (active) setError(String(reason)); }
    );
    return () => { active = false; };
  }, [bridge, refreshRevision, checkNonce]);
  const entries = Object.entries(projection?.plugins ?? {});
  const updates = entries.filter(([, item]) => item.state === "update_available");
  const unavailable = entries.filter(([, item]) => item.state === "unavailable");
  const bootRecovery = projection?.profileBootRecovery ?? null;
  useEffect(() => {
    onSummaryChange?.(updates.length);
  }, [onSummaryChange, updates.length]);
  if (typeof bridge?.readDshPluginUpdates !== "function") return null;
  const pendingRestart = restartRequired || externalRestartRequired;
  const requestRestart = async () => {
    if (!bridge.restartNativeApp || restarting) return;
    setRestarting(true);
    setError("");
    try {
      const outcome = await bridge.restartNativeApp();
      if (outcome && outcome.accepted === false) {
        setError(restartOutcomeMessage(outcome, zh));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRestarting(false);
    }
  };
  const runUpdate = async () => {
    if (!bridge.updateDshPlugins || busy) return;
    setBusy(true); setError("");
    try {
      const result = await bridge.updateDshPlugins({ all: true });
      if (result.application === "restart-required" || Object.keys(result.installed ?? {}).length > 0) {
        setRestartRequired(true);
        onRestartRequired?.();
      }
      const failures = Object.entries(result.failures ?? {});
      if (failures.length) {
        setError((zh ? "部分扩展组件未完成更新：" : "Some extension components could not be updated: ")
          + failures.map(([name, reason]) => `${name.replace(/^@gaofeng21cn\//, "")}（${dshPluginFailureMessage(reason, zh)}）`).join("、"));
      }
      setProjection(await bridge.readDshPluginUpdates!());
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const allCurrent = Boolean(projection) && updates.length === 0 && unavailable.length === 0 && !pendingRestart && !error && !bootRecovery;
  const rows = entries.map(([name, item]) => <div className="opl-package-update-row" key={name}>
    <div><strong>{name.replace(/^@gaofeng21cn\//, "")}</strong><span>{item.installed ?? "—"}{item.available && item.available !== item.installed ? ` → ${item.available}` : ""}</span></div>
    <span>{item.state === "update_available" ? (zh ? "可更新" : "Update available") : item.state === "unavailable" ? dshPluginFailureMessage(item.reason, zh) : (zh ? "已是最新" : "Current")}</span>
  </div>);
  if (allCurrent) {
    return <details className="settings-advanced-actions opl-plugin-updates-details" data-testid="dsh-plugin-updates">
      <summary>{zh ? `应用扩展组件 · 已是最新 (${entries.length} 项)` : `App extension components · Up to date (${entries.length})`}</summary>
      <p className="settings-inline-note">{zh ? "所有扩展组件与已安装软件均为最新。OPL App 通过插件与组件自动更新保持最新，通常无需重新下载完整安装包。" : "All extension components and installed software are up to date. OPL App stays current through automatic plugin updates without full reinstalls."}</p>
      {rows}
    </details>;
  }
  return <section className="opl-package-updates" data-testid="dsh-plugin-updates">
    <h2>{zh ? "应用扩展组件" : "App extension components"}</h2>
    {bootRecovery ? <div className="opl-app-management-feedback" data-testid="dsh-profile-boot-recovery" data-tone="attention" role="alert">
      <p>{zh ? "上次启动检测到更新后的扩展组件异常，已自动回退至内置稳定版本以保障正常使用。你可以重新检查更新。" : "An updated extension failed on the previous launch and was automatically reverted to the built-in baseline to keep the app working. Check for updates to retry."}</p>
      <details className="settings-secondary-details"><summary>{zh ? "回退详情" : "Rollback details"}</summary>
        <dl>{Object.entries(bootRecovery.quarantinedPackages).map(([pkg, ver]) => <div key={pkg}><dt>{pkg.replace(/^@gaofeng21cn\//, "")}</dt><dd>{ver}</dd></div>)}</dl>
        {bootRecovery.reason ? <small>{bootRecovery.reason}</small> : null}
      </details>
    </div> : null}
    <p>{pendingRestart
      ? (zh ? "新的应用扩展组件已在后台准备就绪，重启应用即可生效。" : "Updated extension components are staged and will take effect after restarting the app.")
      : projection
        ? (updates.length
            ? (zh ? `${updates.length} 个扩展组件有可用更新，更新后重启应用即可生效。` : `${updates.length} extension component updates are available. Restart the app after updating to apply them.`)
            : unavailable.length
              ? (zh ? `${unavailable.length} 个扩展组件暂未完成版本检查（已安装功能可继续使用）。` : `${unavailable.length} extension component(s) could not finish checking; installed features keep working.`)
              : (zh ? "当前没有可独立更新的扩展组件。" : "No extension components support independent updates."))
        : error
          ? (zh ? "扩展组件版本检查未完成。" : "Extension component update check did not complete.")
          : (zh ? "正在检查扩展组件版本…" : "Checking extension component versions…")}</p>
    {error ? <p role="alert">{error}</p> : null}
    <div className="opl-plugin-update-actions">
      {updates.length > 0 && typeof bridge.updateDshPlugins === "function" ? <button type="button" className="settings-action-button primary" disabled={busy || restarting} onClick={() => void runUpdate()}>{busy ? (zh ? "更新中…" : "Updating…") : (zh ? "更新全部扩展组件" : "Update all extensions")}</button> : null}
      {pendingRestart && typeof bridge.restartNativeApp === "function" ? <button type="button" className="settings-action-button primary" disabled={busy || restarting} onClick={() => void requestRestart()}>{restarting ? (zh ? "正在重启…" : "Restarting…") : (zh ? "重启应用使更新生效" : "Restart app to apply updates")}</button> : null}
      {(unavailable.length > 0 || error || bootRecovery) ? <button type="button" className="settings-action-button" disabled={busy || restarting} onClick={() => setCheckNonce(n => n + 1)}>{zh ? "重新检查" : "Check again"}</button> : null}
    </div>
    {entries.length ? <details className="opl-plugin-updates-list" open={updates.length > 0 || unavailable.length > 0}><summary>{zh ? `查看组件明细 (${entries.length})` : `View component details (${entries.length})`}</summary>{rows}</details> : null}
  </section>;
}

function ThirdPartyDshPluginsUpdates({ locale, refreshRevision = 0, onSummaryChange }: {
  locale: "zh" | "en";
  refreshRevision?: number;
  onSummaryChange?: (updateReady: boolean) => void;
}) {
  const zh = locale === "zh";
  const bridge = typeof window === "undefined" ? undefined : window.oplStudio;
  const [contextPlugin, setContextPlugin] = useState<BillionContextPreference | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (typeof bridge?.readBillionContext !== "function") return;
    void bridge.readBillionContext().then(value => {
      if (active && value?.installed) setContextPlugin(value);
      else if (active) setContextPlugin(null);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [bridge, refreshRevision]);
  const updateReady = Boolean(contextPlugin?.installed && contextPlugin.updateAvailable && !contextPlugin.active && typeof bridge?.manageBillionContext === "function");
  useEffect(() => {
    onSummaryChange?.(updateReady);
  }, [onSummaryChange, updateReady]);
  if (!contextPlugin?.installed || (!contextPlugin.updateAvailable && contextPlugin.active === contextPlugin.enabled)) return null;
  const runAction = async () => {
    if (!bridge || busy) return;
    setBusy(true);
    setError("");
    try {
      if (contextPlugin.active !== contextPlugin.enabled) {
        const outcome = await bridge.restartNativeApp?.();
        if (outcome && outcome.accepted === false) setError(restartOutcomeMessage(outcome, zh));
        return;
      }
      if (bridge.manageBillionContext) {
        const next = await bridge.manageBillionContext({ operation: "update" });
        setContextPlugin(next);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  const needsRestart = contextPlugin.active !== contextPlugin.enabled;
  return <div className="opl-package-update-row" data-testid="third-party-dsh-plugin-update">
    <div><strong>Billion Context</strong><span>{contextPlugin.version ?? "—"}{contextPlugin.updateAvailable && contextPlugin.availableVersion ? ` → ${contextPlugin.availableVersion}` : ""}</span></div>
    <span>{needsRestart ? (zh ? "待重启生效" : "Restart required") : (zh ? "可更新" : "Update available")}</span>
    {needsRestart && bridge?.restartNativeApp
      ? <button type="button" className="settings-action-button primary" disabled={busy} onClick={() => void runAction()}>{busy ? (zh ? "正在重启…" : "Restarting…") : (zh ? "重启应用生效" : "Restart to apply")}</button>
      : contextPlugin.updateAvailable && !contextPlugin.active && bridge?.manageBillionContext
        ? <button type="button" className="settings-action-button" disabled={busy} onClick={() => void runAction()}>{busy ? (zh ? "更新中…" : "Updating…") : (zh ? "更新" : "Update")}</button>
        : <span className="opl-update-owner-note">{zh ? "需在软件详情中先停用并重启后才能更新" : "Disable and restart in software details before updating"}</span>}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}

/** Unified software & plugin updates view across all origins without carrier discrimination. */
export function OplSoftwareUpdates({ model, locale, actionBusyKey, onAction, onManageSources, dshRestartRequired = false, refreshRevision = 0, onPluginUpdateSummary, onDshRestartRequired }: {
  model: WorkbenchModel;
  locale: "zh" | "en";
  actionBusyKey: string | null;
  onAction(request: SettingsActionRequest): void;
  onManageSources?: () => void;
  dshRestartRequired?: boolean;
  refreshRevision?: number;
  onPluginUpdateSummary?: (summary: { dshUpdatesCount: number; billionContextUpdateReady: boolean }) => void;
  onDshRestartRequired?: () => void;
}) {
  const zh = locale === "zh";
  const bridge = typeof window === "undefined" ? undefined : window.oplStudio;
  const [restartError, setRestartError] = useState("");
  const [restarting, setRestarting] = useState(false);
  const [dshUpdatesCount, setDshUpdatesCount] = useState(0);
  const [billionContextUpdateReady, setBillionContextUpdateReady] = useState(false);
  useEffect(() => {
    onPluginUpdateSummary?.({ dshUpdatesCount, billionContextUpdateReady });
  }, [billionContextUpdateReady, dshUpdatesCount, onPluginUpdateSummary]);
  const packages = softwareCatalogPackages(model, "all");
  const actionable = packages.filter(item => ["update_available", "attention"].includes(packageCatalogState(item)));
  const native = softwareCatalogNativeProducts(model, "all").filter(({ item }) => ["update_available", "attention"].includes(nativeCatalogState(item)));
  const count = actionable.length + native.length;
  const triggerRestart = async () => {
    if (!bridge?.restartNativeApp || restarting) return;
    setRestarting(true);
    setRestartError("");
    try {
      const outcome = await bridge.restartNativeApp();
      if (outcome && outcome.accepted === false) {
        setRestartError(restartOutcomeMessage(outcome, zh));
      }
    } catch (reason) {
      setRestartError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRestarting(false);
    }
  };
  return <><section className="opl-package-updates" data-testid="opl-package-update-summary"><h2>{zh ? "软件与插件更新" : "Software & plugin updates"}</h2>
    <p>{count ? (zh ? `${count} 项软件或插件可更新或需确认状态` : `${count} software item(s) can be updated or need review`) : (zh ? "所有已检查的软件和插件均为当前最新。" : "All checked software and plugins are up to date.")}</p>
    {restartError ? <p role="alert">{restartError}</p> : null}
    {actionable.map(item => {
      const state = packageCatalogState(item), name = catalogDisplayName(item.label, item.displayNameI18n, locale);
      const accessBlocked = packageAccessNeedsAttention(item);
      const request = resolvePackageLifecycleUpdateRequest(item, locale, true);
      return <div className="opl-package-update-row" key={item.packageId}><div><strong>{name}</strong><span>{catalogInstalledVersion(item, locale)}{state === "update_available" && item.availableVersion ? ` → ${item.availableVersion}` : ""}</span></div><span>{packageCatalogStatusLabel(item, locale)}</span>{accessBlocked && onManageSources ? <button type="button" className="settings-action-button" onClick={onManageSources}>{zh ? "检查软件源" : "Check source"}</button> : request ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={() => onAction(request)}>{request.label.replace(` ${name}`, "")}</button> : <span className="opl-update-owner-note">{zh ? "请在软件详情中检查来源或安装状态" : "Check the source or installation in software details"}</span>}</div>;
    })}
    {native.map(product => {
      const { item, productId, installations } = product;
      const state = nativeCatalogState(item);
      const targetVersion = item.updateStatus === "needs_restart" ? item.pendingVersion : nativeCatalogAvailableVersion(product, locale);
      const current = activeSoftwareInstallation(installations, item.activeInstallationId, item.activeInstallationStatus);
      const version = installations.length || item.activeInstallationStatus ? current?.displayVersion ?? current?.version : nativeInstalledDisplayVersion(item);
      const { request, label } = resolveNativeUpdateRequest(product, locale);
      return <div className="opl-package-update-row" key={productId} data-product-id={productId}>
        <div><strong>{item.productDisplayName ?? catalogDisplayName(item.displayName, item.displayNameI18n, locale)}</strong><span>{version ?? "—"}{(state === "update_available" || item.updateStatus === "needs_restart") && targetVersion ? ` → ${targetVersion}` : ""}</span></div>
        <span>{nativeCatalogStatusLabel(item, locale)}</span>
        {request ? <button type="button" className="settings-action-button" disabled={actionBusyKey !== null} onClick={() => onAction(request)}>{label}</button>
          : item.updateStatus === "needs_restart" && typeof bridge?.restartNativeApp === "function" ? <button type="button" className="settings-action-button primary" disabled={actionBusyKey !== null || restarting} onClick={() => void triggerRestart()}>{restarting ? (zh ? "正在重启…" : "Restarting…") : (zh ? "重启应用生效" : "Restart to apply")}</button>
          : <span className="opl-update-owner-note">{item.updateStatus === "needs_restart" ? (zh ? "更新已暂存，重启应用后生效。" : "The update is staged and will take effect after restarting the app.") : (zh ? "请在软件详情中检查来源或安装状态" : "Check the source or installation in software details")}</span>}
      </div>;
    })}
    <ThirdPartyDshPluginsUpdates locale={locale} refreshRevision={refreshRevision} onSummaryChange={setBillionContextUpdateReady} />
  </section><DshPluginUpdates locale={locale} externalRestartRequired={dshRestartRequired} refreshRevision={refreshRevision} onSummaryChange={setDshUpdatesCount} onRestartRequired={onDshRestartRequired} /></>;
}
