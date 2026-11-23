import { dshPluginFailureMessage, OplSoftwareUpdates, packageUpdateRequests } from "../../OplSoftwareUpdates";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";

import { formatDate } from "../presentation";

import { SettingsIntentButton } from "../actions";
import { formatUpdateChannel, ManagedUpdateGroup } from "../maintenance";
import type { SettingsHostActionIntent } from "../../settingsActions";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function UpdatesSettingsPage({ actionViewModel, managedUpdate, projection, settings, nativeAppUpdate, model, actionBusyKey, onAction, onHostAction, catalogOrigin, onManageSources, onRefresh, dshRestartRequired, onDshRestartRequired }: Pick<SettingsPageContext, "actionViewModel" | "managedUpdate" | "projection" | "settings" | "nativeAppUpdate" | "model" | "actionBusyKey" | "onAction" | "onHostAction"> & {
  catalogOrigin?: "opl" | "all";
  onManageSources?: () => void;
  onRefresh?: () => void;
  dshRestartRequired?: boolean;
  onDshRestartRequired?: () => void;
}) {
      const [refreshRevision, setRefreshRevision] = useState(0);
      const [checkingAll, setCheckingAll] = useState(false);
      const [updatingAll, setUpdatingAll] = useState(false);
      const [pluginSummary, setPluginSummary] = useState({ dshUpdatesCount: 0, billionContextUpdateReady: false });
      const [updateAllNotice, setUpdateAllNotice] = useState<{ tone: "neutral" | "success" | "attention"; message: string } | null>(null);
      const handlePluginSummary = useCallback((summary: { dshUpdatesCount: number; billionContextUpdateReady: boolean }) => {
        setPluginSummary(current => (
          current.dshUpdatesCount === summary.dshUpdatesCount && current.billionContextUpdateReady === summary.billionContextUpdateReady
            ? current : summary
        ));
      }, []);
      const zh = settings.locale === "zh";
      const softwareCenterMode = Boolean(catalogOrigin);

      const component = (componentId: "opl_app" | "opl_base" | "opl_packages") => (
        actionViewModel.managedUpdates.find((item) => item.componentId === componentId)
      );
      const updateChannel = managedUpdate?.channel ?? projection?.localEnvironment.releaseChannel ?? projection?.statusSummary.releaseChannel;
      const packageComponent = component("opl_packages")?.component;
      const packageStates = packageComponent?.packageStates ?? [];
      const packageAttentionCount = packageStates.filter((item) => ["update_available", "staged", "needs_restart", "needs_reload", "failed_with_repair", "skipped_manual_required"].includes(item.state.toLowerCase())).length;
      const desktopUpdateActionable = Boolean(nativeAppUpdate?.supported && ["available", "downloading", "downloaded", "error"].includes(nativeAppUpdate.state));
      const appCheckIntent = component("opl_app")?.actions.find((intent): intent is SettingsHostActionIntent =>
        intent.transport === "native_app_updater" && intent.operation === "check" && intent.availability === "ready"
      );
      const appApplyIntent = component("opl_app")?.actions.find((intent): intent is SettingsHostActionIntent =>
        intent.transport === "native_app_updater" && intent.operation === "apply" && intent.availability === "ready"
      );
      const packageUpdates = softwareCenterMode ? packageUpdateRequests(model, settings.locale) : [];
      const desktopReadyToApply = Boolean(nativeAppUpdate?.supported && nativeAppUpdate.state === "available" && appApplyIntent && onHostAction);
      const totalAutoUpdatable = (desktopReadyToApply ? 1 : 0) + pluginSummary.dshUpdatesCount + (pluginSummary.billionContextUpdateReady ? 1 : 0) + packageUpdates.length;
      const checkAllUpdates = async () => {
        if (checkingAll || updatingAll) return;
        setCheckingAll(true);
        setUpdateAllNotice(null);
        try {
          onRefresh?.();
          setRefreshRevision(value => value + 1);
          const bridge = typeof window === "undefined" ? undefined : window.oplStudio;
          if (typeof bridge?.manageBillionContext === "function") {
            const current = await bridge.readBillionContext?.().catch(() => null);
            if (current?.installed) await bridge.manageBillionContext({ operation: "check" }).catch(() => undefined);
          }
          if (nativeAppUpdate?.supported && appCheckIntent && onHostAction) {
            onHostAction(appCheckIntent);
          }
        } finally {
          setCheckingAll(false);
        }
      };
      const updateAll = async () => {
        if (updatingAll || checkingAll || totalAutoUpdatable === 0) return;
        setUpdatingAll(true);
        setUpdateAllNotice(null);
        const failures: string[] = [];
        let appliedCount = 0;
        let restartNeeded = false;
        try {
          const bridge = typeof window === "undefined" ? undefined : window.oplStudio;
          if (pluginSummary.dshUpdatesCount > 0 && typeof bridge?.updateDshPlugins === "function") {
            try {
              const result = await bridge.updateDshPlugins({ all: true });
              const installed = Object.keys(result.installed ?? {});
              if (installed.length > 0 || result.application === "restart-required") {
                appliedCount += Math.max(installed.length, 1);
                restartNeeded = true;
                onDshRestartRequired?.();
              }
              for (const [name, reason] of Object.entries(result.failures ?? {})) {
                failures.push(`${name.replace(/^@gaofeng21cn\//, "")}（${dshPluginFailureMessage(reason, zh)}）`);
              }
            } catch (error) {
              failures.push(error instanceof Error ? error.message : String(error));
            }
          }
          if (pluginSummary.billionContextUpdateReady && typeof bridge?.manageBillionContext === "function") {
            try {
              await bridge.manageBillionContext({ operation: "update" });
              appliedCount += 1;
              restartNeeded = true;
            } catch (error) {
              failures.push(`Billion Context（${error instanceof Error ? error.message : String(error)}）`);
            }
          }
          if (desktopReadyToApply && appApplyIntent && onHostAction) {
            onHostAction(appApplyIntent);
            appliedCount += 1;
          }
          if (packageUpdates.length > 0) {
            onAction(packageUpdates[0]);
            appliedCount += 1;
          }
          onRefresh?.();
          setRefreshRevision(value => value + 1);
          const extraPackagesNotice = packageUpdates.length > 1
            ? (zh ? `已发起首项软件更新（共 ${packageUpdates.length} 项软件包需依次确认）。` : `Started first package update (${packageUpdates.length} total require individual confirmation).`)
            : "";
          if (failures.length) {
            setUpdateAllNotice({
              tone: "attention",
              message: `${zh ? "部分更新未完成：" : "Some updates could not complete: "}${failures.join("、")}${extraPackagesNotice ? ` ${extraPackagesNotice}` : ""}`
            });
          } else if (appliedCount > 0) {
            setUpdateAllNotice({
              tone: "success",
              message: [
                restartNeeded
                  ? (zh ? "扩展更新已安装，请重启应用以使新版本生效。" : "Extension updates were staged. Restart the app to activate them.")
                  : (zh ? "已触发可用更新。" : "Triggered available updates."),
                extraPackagesNotice
              ].filter(Boolean).join(" ")
            });
          }
        } finally {
          setUpdatingAll(false);
        }
      };
      const appGroup = <ManagedUpdateGroup
        component={component("opl_app")?.component}
        nativeUpdate={nativeAppUpdate}
        fallbackLabel={softwareCenterMode ? (desktopUpdateActionable ? "One Person Lab" : (zh ? "当前桌面宿主" : "Current desktop host")) : "One Person Lab"}
        actions={component("opl_app")?.actions ?? []}
        locale={settings.locale}
        busyKey={actionBusyKey}
        onAction={onAction}
        onHostAction={onHostAction}
        unavailableActionLabel={zh ? "暂不可用" : "Unavailable"}
      />;
      const baseGroup = <ManagedUpdateGroup
        component={component("opl_base")?.component}
        fallbackLabel={zh ? "基础服务" : "Base services"}
        actions={component("opl_base")?.actions ?? []}
        locale={settings.locale}
        busyKey={actionBusyKey}
        onAction={onAction}
        onHostAction={onHostAction}
        unavailableActionLabel={zh ? "暂不可用" : "Unavailable"}
      />;
      const hostMaintenance = <>{appGroup}{baseGroup}</>;
      return (
        <>
          <div className="settings-page-summary">
            <span>{softwareCenterMode ? (zh ? "统一检查与更新软件、应用扩展与运行环境；不同来源遵循一致的检查、安装与重启流程。" : "Check and update software, extensions, and runtime components together across all sources.") : (zh ? "检查应用、后台服务与智能体能力的更新状态" : "Check update status for the app, background services, and agent capabilities")}</span>
            {!softwareCenterMode ? <span>{zh ? nativeAppUpdate?.buildKind === "local-development" ? "本地开发版：应用本身不接收公开更新，基础服务与能力按各自策略维护。" : `更新通道：${formatUpdateChannel(updateChannel, settings.locale)}。已安装的软件、扩展组件与基础运行环境默认自动（静默）更新；本地开发目录或需本机安装器确认的组件保留手动确认。` : nativeAppUpdate?.buildKind === "local-development" ? "Local development build: public app updates are disabled; services follow their own policies." : `Channel: ${formatUpdateChannel(updateChannel, settings.locale)}. Installed software, extensions, and base services update automatically (silent by default); developer checkouts and local-installer tools require manual confirmation.`}</span> : null}
            <span>{zh ? `状态刷新于 ${formatDate(model.stateGeneratedAt, settings.locale)}` : `Status refreshed ${formatDate(model.stateGeneratedAt, settings.locale)}`}</span>
            {softwareCenterMode && totalAutoUpdatable > 0 ? <button type="button" className="settings-action-button primary" data-testid="opl-update-all" disabled={updatingAll || checkingAll || actionBusyKey !== null} onClick={() => void updateAll()}>{updatingAll ? (zh ? "正在更新…" : "Updating…") : (zh ? "更新全部" : "Update all")}</button> : null}
            {softwareCenterMode ? <button type="button" className="settings-action-button" data-testid="opl-check-all-updates" disabled={checkingAll || updatingAll || actionBusyKey !== null} onClick={() => void checkAllUpdates()}><RefreshCw size={13} aria-hidden="true" />{checkingAll ? (zh ? "检查中…" : "Checking…") : (zh ? "检查全部更新" : "Check all updates")}</button> : null}
            {softwareCenterMode && updateAllNotice ? <span className="settings-action-feedback" data-tone={updateAllNotice.tone} role="status">{updateAllNotice.message}</span> : null}
            {!softwareCenterMode && packageStates.length ? <span data-testid="opl-package-update-summary">{zh
              ? packageAttentionCount ? `${packageAttentionCount} 个能力包需要更新或处理` : `已读取 ${packageStates.length} 个已安装能力包`
              : packageAttentionCount ? `${packageAttentionCount} package(s) need an update or action` : `${packageStates.length} installed package(s) read`}</span> : null}
          </div>
          {!softwareCenterMode ? hostMaintenance : desktopUpdateActionable ? appGroup : null}
          {softwareCenterMode ? <OplSoftwareUpdates model={model} locale={settings.locale} actionBusyKey={actionBusyKey} onAction={onAction} onManageSources={onManageSources} dshRestartRequired={dshRestartRequired} refreshRevision={refreshRevision} onPluginUpdateSummary={handlePluginSummary} onDshRestartRequired={onDshRestartRequired} /> : <ManagedUpdateGroup
            component={component("opl_packages")?.component}
            fallbackLabel={zh ? "智能体与能力" : "Agents and capabilities"}
            actions={component("opl_packages")?.actions ?? []}
            locale={settings.locale}
            busyKey={actionBusyKey}
            onAction={onAction}
            onHostAction={onHostAction}
            unavailableActionLabel={zh ? "暂不可用" : "Unavailable"}
          />}
          {softwareCenterMode ? <details className="settings-advanced-actions" data-testid="opl-runtime-maintenance-details">
            <summary>{zh ? "桌面宿主与运行组件维护" : "Desktop host and runtime maintenance"}<ChevronDown aria-hidden="true" size={14} /></summary>
            {desktopUpdateActionable ? baseGroup : hostMaintenance}
          </details> : null}
          {!softwareCenterMode && actionViewModel.additionalMaintenanceActions.some((intent) => (
            intent.availability === "ready" && (intent.transport === "app_action" || Boolean(onHostAction))
          )) ? (
            <details className="settings-advanced-actions">
              <summary>{zh ? "更多维护操作" : "More maintenance actions"}<ChevronDown aria-hidden="true" size={14} /></summary>
              <div>{actionViewModel.additionalMaintenanceActions.map((intent) => <SettingsIntentButton key={intent.key} intent={intent} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} onHostAction={onHostAction} />)}</div>
            </details>
          ) : null}
        </>
      );

}
