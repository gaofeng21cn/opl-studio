import { OplSoftwareUpdates } from "../../OplSoftwareUpdates";
import { ChevronDown } from "lucide-react";

import { formatDate } from "../../settings/presentation";

import { SettingsIntentButton } from "../../settings/actions";
import { formatUpdateChannel, ManagedUpdateGroup } from "../../settings/maintenance";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function UpdatesSettingsPage({ actionViewModel, managedUpdate, projection, settings, nativeAppUpdate, model, actionBusyKey, onAction, onHostAction, catalogOrigin, onManageSources }: Pick<SettingsPageContext, "actionViewModel" | "managedUpdate" | "projection" | "settings" | "nativeAppUpdate" | "model" | "actionBusyKey" | "onAction" | "onHostAction"> & { catalogOrigin?: "opl"; onManageSources?: () => void }) {

      const component = (componentId: "opl_app" | "opl_base" | "opl_packages") => (
        actionViewModel.managedUpdates.find((item) => item.componentId === componentId)
      );
      const updateChannel = managedUpdate?.channel ?? projection?.localEnvironment.releaseChannel ?? projection?.statusSummary.releaseChannel;
      const packageComponent = component("opl_packages")?.component;
      const packageStates = packageComponent?.packageStates ?? [];
      const packageAttentionCount = packageStates.filter((item) => ["update_available", "staged", "needs_restart", "needs_reload", "failed_with_repair", "skipped_manual_required"].includes(item.state.toLowerCase())).length;
      const hostMaintenance = <>
        <ManagedUpdateGroup
          component={component("opl_app")?.component}
          nativeUpdate={nativeAppUpdate}
          fallbackLabel={catalogOrigin ? (settings.locale === "zh" ? "当前桌面宿主" : "Current desktop host") : "One Person Lab"}
          actions={component("opl_app")?.actions ?? []}
          locale={settings.locale}
          busyKey={actionBusyKey}
          onAction={onAction}
          onHostAction={onHostAction}
          unavailableActionLabel={settings.locale === "zh" ? "暂不可用" : "Unavailable"}
        />
        <ManagedUpdateGroup
          component={component("opl_base")?.component}
          fallbackLabel={settings.locale === "zh" ? "基础服务" : "Base services"}
          actions={component("opl_base")?.actions ?? []}
          locale={settings.locale}
          busyKey={actionBusyKey}
          onAction={onAction}
          onHostAction={onHostAction}
          unavailableActionLabel={settings.locale === "zh" ? "暂不可用" : "Unavailable"}
        />
      </>;
      return (
        <>
          <div className="settings-page-summary">
            <span>{catalogOrigin ? (settings.locale === "zh" ? "查看可用更新，按软件选择操作。" : "Review available updates and choose an action for each software item.") : (settings.locale === "zh" ? "检查应用、后台服务与智能体能力的更新状态" : "Check update status for the app, background services, and agent capabilities")}</span>
            {!catalogOrigin ? <span>{settings.locale === "zh" ? nativeAppUpdate?.buildKind === "local-development" ? "本地开发版：应用本身不接收公开更新，基础服务与能力按各自策略维护。" : `更新通道：${formatUpdateChannel(updateChannel, settings.locale)}。OPL 托管的基础服务与已安装能力默认自动（静默）维护；外部组件仅检测并提示。` : nativeAppUpdate?.buildKind === "local-development" ? "Local development build: public app updates are disabled; services follow their own policies." : `Channel: ${formatUpdateChannel(updateChannel, settings.locale)}. OPL-managed base services and installed capabilities update automatically; external components are detected and surfaced for confirmation.`}</span> : null}
            <span>{settings.locale === "zh" ? `状态刷新于 ${formatDate(model.stateGeneratedAt, settings.locale)}` : `Status refreshed ${formatDate(model.stateGeneratedAt, settings.locale)}`}</span>
            {!catalogOrigin && packageStates.length ? <span data-testid="opl-package-update-summary">{settings.locale === "zh"
              ? packageAttentionCount ? `${packageAttentionCount} 个能力包需要更新或处理` : `已读取 ${packageStates.length} 个已安装能力包`
              : packageAttentionCount ? `${packageAttentionCount} package(s) need an update or action` : `${packageStates.length} installed package(s) read`}</span> : null}
          </div>
          {!catalogOrigin ? hostMaintenance : null}
          {catalogOrigin === "opl" ? <OplSoftwareUpdates model={model} locale={settings.locale} actionBusyKey={actionBusyKey} onAction={onAction} onManageSources={onManageSources} /> : <ManagedUpdateGroup
            component={component("opl_packages")?.component}
            fallbackLabel={settings.locale === "zh" ? "智能体与能力" : "Agents and capabilities"}
            actions={component("opl_packages")?.actions ?? []}
            locale={settings.locale}
            busyKey={actionBusyKey}
            onAction={onAction}
            onHostAction={onHostAction}
            unavailableActionLabel={settings.locale === "zh" ? "暂不可用" : "Unavailable"}
          />}
          {catalogOrigin ? <details className="settings-advanced-actions" data-testid="opl-runtime-maintenance-details">
            <summary>{settings.locale === "zh" ? "桌面宿主与运行组件维护" : "Desktop host and runtime maintenance"}<ChevronDown aria-hidden="true" size={14} /></summary>
            {hostMaintenance}
          </details> : null}
          {!catalogOrigin && actionViewModel.additionalMaintenanceActions.some((intent) => (
            intent.availability === "ready" && (intent.transport === "app_action" || Boolean(onHostAction))
          )) ? (
            <details className="settings-advanced-actions">
              <summary>{settings.locale === "zh" ? "更多维护操作" : "More maintenance actions"}<ChevronDown aria-hidden="true" size={14} /></summary>
              <div>{actionViewModel.additionalMaintenanceActions.map((intent) => <SettingsIntentButton key={intent.key} intent={intent} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} onHostAction={onHostAction} />)}</div>
            </details>
          ) : null}
        </>
      );

}
