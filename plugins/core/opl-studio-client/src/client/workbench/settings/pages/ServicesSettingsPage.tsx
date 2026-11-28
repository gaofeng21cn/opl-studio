import { SettingRow, SettingsGroup, StatusValue } from "../primitives";
import type { SettingsPageContext } from "../useSettingsPageContext";
export function ServicesSettingsPage({ runtime, settings, projection, zh, onOpenSchedules, renderSettingsContributions, renderSettingsGroupSlot }: Pick<SettingsPageContext, "runtime" | "settings" | "projection" | "zh" | "onOpenSchedules" | "renderSettingsContributions" | "renderSettingsGroupSlot">) {

      const pluginServices = renderSettingsContributions?.("services");
      const runway = runtime?.runway;
      const runner = runway?.scheduleRunner;
      const runnerStatus = runner?.running === true ? "running" : runner?.running === false ? "stopped" : "unknown";
      return (
        <>
          <SettingsGroup title={settings.locale === "zh" ? "本机能力" : "Local capabilities"}>
            <SettingRow label={settings.locale === "zh" ? "本机助手" : "Local assistant"}><StatusValue status={projection?.codex.installed === true ? projection?.codex.versionStatus ?? "ready" : projection?.codex.installed === false ? "unavailable" : undefined} locale={settings.locale} /></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "智能体与能力" : "Agents and capabilities"}><StatusValue status={projection?.statusSummary.agentPackageHealth} locale={settings.locale} /></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "基础运行底座" : "Runtime substrate"}><StatusValue status={projection?.statusSummary.runtimeSourceHealth} locale={settings.locale} /></SettingRow>
          </SettingsGroup>
          <SettingsGroup title={settings.locale === "zh" ? "后台任务" : "Background tasks"}>
            <p className="settings-inline-note">{zh ? "服务状态只负责运行条件；创建与查看任务请在工作台的计划任务中管理。" : "Service status describes runtime requirements. Manage tasks in the workbench."} {onOpenSchedules ? <button className="settings-inline-command" type="button" onClick={onOpenSchedules}>{zh ? "打开计划任务" : "Open scheduled tasks"}</button> : null}</p>
            <SettingRow label={zh ? "后台任务引擎" : "Background task engine"}><StatusValue status={runway?.status} locale={settings.locale} /></SettingRow>
            <SettingRow label={zh ? "定时任务执行器" : "Schedule runner"} detail={runner?.tickIntervalMs ? (zh ? (runner.tickIntervalMs >= 1000 ? `每 ${Math.round(runner.tickIntervalMs / 1000)} 秒检查一次` : `检查间隔 ${runner.tickIntervalMs} 毫秒`) : (runner.tickIntervalMs >= 1000 ? `Checks every ${Math.round(runner.tickIntervalMs / 1000)} s` : `Tick interval ${runner.tickIntervalMs} ms`)) : undefined}>
              <StatusValue status={runnerStatus} locale={settings.locale} />
            </SettingRow>
          </SettingsGroup>
          <SettingsGroup title={settings.locale === "zh" ? `已接入运行环境 ${runtime?.carriers.healthy ?? 0} / ${runtime?.carriers.total ?? 0}` : `Connected runtimes ${runtime?.carriers.healthy ?? 0} / ${runtime?.carriers.total ?? 0}`}>
            {runtime?.carriers.items.length ? runtime.carriers.items.map((carrier) => (
              <SettingRow key={carrier.packageId} label={carrier.label}><StatusValue status={carrier.status} locale={settings.locale} /></SettingRow>
            )) : <SettingRow label={settings.locale === "zh" ? "已接入运行环境" : "Connected runtimes"}><span className="settings-muted">--</span></SettingRow>}
          </SettingsGroup>
          {pluginServices ? <SettingsGroup title={zh ? "服务与设备" : "Services and devices"}>{pluginServices}</SettingsGroup> : null}
          {renderSettingsGroupSlot?.("services")}
        </>
      );

}
