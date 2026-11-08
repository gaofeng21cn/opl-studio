import { statusTone, formatDate } from "../../settings/presentation";
import { SettingRow, SettingsGroup, StatusValue } from "../../settings/primitives";
import { componentReadinessStatus } from "../../settings/packages";

import { RuntimeActionButton } from "../../settings/actions";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function ServicesSettingsPage({ runtime, settings, projection, zh, navigate, copy, actionBusyKey, onAction, locale }: Pick<SettingsPageContext, "runtime" | "settings" | "projection" | "zh" | "navigate" | "copy" | "actionBusyKey" | "onAction" | "locale">) {

      const runtimeActions = runtime?.maintenanceActions ?? [];
      const serviceAction = runtimeActions.find((action) => action.actionId === (runtime?.temporal.serviceReady === false ? "provider_service_start" : "provider_service_status"));
      const workerAction = runtimeActions.find((action) => action.actionId === (runtime?.temporal.workerReady === false ? "provider_worker_start" : "provider_worker_status"));
      const schedulerAction = runtimeActions.find((action) => action.actionId === (runtime?.temporal.schedulerStatus === "not_installed" ? "provider_scheduler_install" : "provider_scheduler_status"));
      return (
        <>
          <SettingsGroup title={settings.locale === "zh" ? "本机能力" : "Local capabilities"}>
            <SettingRow label={settings.locale === "zh" ? "本机助手" : "Local assistant"}><StatusValue status={projection?.codex.installed === true ? projection?.codex.versionStatus ?? "ready" : projection?.codex.installed === false ? "unavailable" : undefined} locale={settings.locale} /></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "智能体与能力" : "Agents and capabilities"}><StatusValue status={projection?.statusSummary.agentPackageHealth} locale={settings.locale} /></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "运行环境" : "Runtime environment"}><StatusValue status={projection?.statusSummary.runtimeSourceHealth} locale={settings.locale} /></SettingRow>
          </SettingsGroup>
          <SettingsGroup title={settings.locale === "zh" ? "后台任务" : "Background tasks"}>
            <p className="settings-inline-note">{zh ? "服务状态只负责运行条件；创建与查看任务请打开计划任务。" : "Service status describes runtime requirements. Manage tasks in Scheduled Tasks."} <button className="settings-inline-command" type="button" onClick={() => navigate("schedules")}>{copy.schedules}</button></p>
            <SettingRow label={settings.locale === "zh" ? "任务服务" : "Task service"}>
              <span className="runtime-setting-control"><StatusValue status={componentReadinessStatus(runtime?.temporal.serviceReady, runtime?.temporal.serviceStatus)} locale={settings.locale} /><RuntimeActionButton action={serviceAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /></span>
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "任务处理" : "Task processing"}>
              <span className="runtime-setting-control"><StatusValue status={componentReadinessStatus(runtime?.temporal.workerReady, runtime?.temporal.workerStatus)} locale={settings.locale} /><RuntimeActionButton action={workerAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /></span>
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "定时任务" : "Scheduled tasks"} detail={runtime?.temporal.observedAt ? formatDate(runtime.temporal.observedAt, locale) : undefined}>
              <span className="runtime-setting-control"><StatusValue status={componentReadinessStatus(runtime?.temporal.schedulerReady, runtime?.temporal.schedulerStatus)} locale={settings.locale} /><RuntimeActionButton action={schedulerAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} primary={statusTone(runtime?.temporal.schedulerStatus) === "attention"} /></span>
            </SettingRow>
          </SettingsGroup>
          <SettingsGroup title={settings.locale === "zh" ? `运行环境 ${runtime?.carriers.healthy ?? 0} / ${runtime?.carriers.total ?? 0}` : `Runtime environments ${runtime?.carriers.healthy ?? 0} / ${runtime?.carriers.total ?? 0}`}>
            {runtime?.carriers.items.length ? runtime.carriers.items.map((carrier) => (
              <SettingRow key={carrier.packageId} label={carrier.label}><StatusValue status={carrier.status} locale={settings.locale} /></SettingRow>
            )) : <SettingRow label={settings.locale === "zh" ? "运行环境" : "Runtime environments"}><span className="settings-muted">--</span></SettingRow>}
          </SettingsGroup>
        </>
      );

}
