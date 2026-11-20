import { StorageCleanupPanel } from "../../plugins/WorkbenchServicesPanel";

import { storagePresentationStatus, storageReason, storageAmount } from "../presentation";
import { SettingRow, SettingsGroup, StatusValue } from "../primitives";

import { RuntimeActionButton } from "../actions";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function StorageSettingsPage({ projection, workbenchServices, settings, onAction, actionBusyKey, serviceRevision, zh, locale, onNavigate, setSubDestination }: Pick<SettingsPageContext, "projection" | "workbenchServices" | "settings" | "onAction" | "actionBusyKey" | "serviceRevision" | "zh" | "locale" | "onNavigate" | "setSubDestination">) {

      const agentStore = projection?.storage.agentPackageStore;
      const webuiStore = projection?.storage.webuiDataVolume;
      return (
        <>
          {workbenchServices && <StorageCleanupPanel client={workbenchServices} locale={settings.locale} onAction={onAction} busy={actionBusyKey !== null} revision={serviceRevision} />}

          <details className="settings-secondary-details"><summary>{zh ? "智能体与网页端数据" : "Agent and web app data"}</summary>
          <SettingsGroup title={settings.locale === "zh" ? "智能体数据" : "Agent data"}>
            <SettingRow label={settings.locale === "zh" ? "用量统计" : "Usage"} detail={storageReason(agentStore, settings.locale)}>
              <span className="runtime-setting-control">
                <StatusValue status={storagePresentationStatus(agentStore)} locale={settings.locale} />
                <RuntimeActionButton action={agentStore?.inventoryAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} />
              </span>
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "已用空间" : "Used space"}><span>{storageAmount(agentStore?.bytes, agentStore, locale)}</span></SettingRow>
            {agentStore?.projectedAction?.kind === "navigate" ? <SettingRow label={settings.locale === "zh" ? "管理位置" : "Manage in"}><button type="button" onClick={() => onNavigate ? onNavigate("agents") : setSubDestination("agents")}>{settings.locale === "zh" ? "管理智能体与能力数据" : "Manage Agent and capability data"}</button></SettingRow> : null}
            {agentStore?.reclaimableBytes !== undefined ? <SettingRow label={settings.locale === "zh" ? "可清理" : "Reclaimable"}><span>{storageAmount(agentStore.reclaimableBytes, agentStore, locale)}</span></SettingRow> : null}
          </SettingsGroup>
          <SettingsGroup title={settings.locale === "zh" ? "网页端数据" : "Web app data"}>
            <SettingRow label={settings.locale === "zh" ? "使用状态" : "Usage status"} detail={storageReason(webuiStore, settings.locale)}>
              <span className="runtime-setting-control">
                <StatusValue status={storagePresentationStatus(webuiStore)} locale={settings.locale} />
                <RuntimeActionButton action={webuiStore?.inventoryAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} />
              </span>
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "已用空间" : "Used space"}><span>{storageAmount(webuiStore?.bytes, webuiStore, locale)}</span></SettingRow>
            {webuiStore?.reclaimableBytes !== undefined ? <SettingRow label={settings.locale === "zh" ? "可清理" : "Reclaimable"}><span>{storageAmount(webuiStore.reclaimableBytes, webuiStore, locale)}</span></SettingRow> : null}
          </SettingsGroup>
          </details>
          {settings.developerDetails && (projection?.localEnvironment.stateDir || projection?.localEnvironment.runtimeSourcesRoot) ? (
            <SettingsGroup title={settings.locale === "zh" ? "本机位置" : "Local locations"}>
              {projection.localEnvironment.stateDir ? <SettingRow label={settings.locale === "zh" ? "应用数据" : "App data"}><code>{projection.localEnvironment.stateDir}</code></SettingRow> : null}
              {projection.localEnvironment.runtimeSourcesRoot ? <SettingRow label={settings.locale === "zh" ? "运行环境" : "Runtime data"}><code>{projection.localEnvironment.runtimeSourcesRoot}</code></SettingRow> : null}
            </SettingsGroup>
          ) : null}
        </>
      );

}
