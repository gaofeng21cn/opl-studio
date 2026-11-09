import { modelLabel } from "../../modelPolicy";

import { SettingRow, SettingsGroup, StatusValue } from "../../settings/primitives";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function OverviewSettingsPage({ zh, issueList, gateway, gatewayUnavailableDetail, navigate, displayedModelId, settings, projection, statePlaceholder, initializationDetail, initializationPresentationStatus, initializationStatus, onRefreshInitialization, copy, onOpenSchedules }: Pick<SettingsPageContext, "zh" | "issueList" | "gateway" | "gatewayUnavailableDetail" | "navigate" | "displayedModelId" | "settings" | "projection" | "statePlaceholder" | "initializationDetail" | "initializationPresentationStatus" | "initializationStatus" | "onRefreshInitialization" | "copy" | "onOpenSchedules">) {

      return <>
        <SettingsGroup title={zh ? "需要关注" : "Needs attention"}>{issueList}</SettingsGroup>
        <SettingsGroup title={zh ? "当前工作环境" : "Current workspace"}>
          <SettingRow label={zh ? "账户与模型" : "Account & model"} detail={gateway?.displayName ?? gatewayUnavailableDetail}><button className="settings-inline-command" type="button" onClick={() => navigate("account")}>{modelLabel(displayedModelId ?? "--", settings.locale)}</button></SettingRow>
          <SettingRow label={zh ? "工作目录" : "Working directory"}><button className="settings-inline-command settings-path" type="button" onClick={() => navigate("workspace")}>{projection?.workspace.selectedPath ?? statePlaceholder}</button></SettingRow>
          <SettingRow label={zh ? "启动自检" : "Startup check"} detail={initializationDetail}><span className="runtime-setting-control"><StatusValue status={initializationPresentationStatus} locale={settings.locale} /><button type="button" className="settings-inline-command" disabled={initializationStatus === "loading"} onClick={onRefreshInitialization}>{zh ? "重新检查" : "Check again"}</button></span></SettingRow>
        </SettingsGroup>
        <SettingsGroup title={zh ? "常用功能" : "Quick access"}><div className="settings-quick-links">
          {(["agents", "instructions"] as const).map(destination => <button className="settings-action-button" type="button" key={destination} onClick={() => navigate(destination)}>{copy[destination]}</button>)}
          {onOpenSchedules ? <button className="settings-action-button" type="button" onClick={onOpenSchedules}>{zh ? "计划任务" : "Scheduled tasks"}</button> : null}
        </div></SettingsGroup>
      </>;

}
