import { modelLabel } from "../../modelPolicy";

import { SettingRow, SettingsGroup, StatusValue } from "../primitives";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function OverviewSettingsPage({ zh, issueList, gateway, gatewayUnavailableDetail, navigate, displayedModelId, modelOptions, settings, projection, statePlaceholder, initializationDetail, initializationPresentationStatus, initializationStatus, onRefreshInitialization, copy, onOpenSchedules, onOpenSoftwareCenter }: Pick<SettingsPageContext, "zh" | "issueList" | "gateway" | "gatewayUnavailableDetail" | "navigate" | "displayedModelId" | "modelOptions" | "settings" | "projection" | "statePlaceholder" | "initializationDetail" | "initializationPresentationStatus" | "initializationStatus" | "onRefreshInitialization" | "copy" | "onOpenSchedules" | "onOpenSoftwareCenter">) {
      const gatewayDetail = gateway
        ? (gateway.email && gateway.email !== gateway.displayName ? gateway.email : (zh ? "已连接 OPL Gateway" : "Connected to OPL Gateway"))
        : gatewayUnavailableDetail;
      return <>
        <SettingsGroup title={zh ? "需要关注" : "Needs attention"}>{issueList}</SettingsGroup>
        <SettingsGroup title={zh ? "当前工作环境" : "Current workspace"}>
          <SettingRow label={zh ? "账户" : "Account"} detail={gatewayDetail}><button className="settings-inline-command" type="button" onClick={() => navigate("account")}>{gateway?.displayName ?? (zh ? "未连接 · 前往配置" : "Not connected · Set up")}</button></SettingRow>
          <SettingRow label={zh ? "当前模型" : "Current model"} detail={zh ? "当前会话策略下实际生效的模型" : "Effective model for the active conversation policy"}><button className="settings-inline-command" type="button" onClick={() => navigate("models")}>{modelLabel(displayedModelId ?? "--", settings.locale, modelOptions)}</button></SettingRow>
          <SettingRow label={zh ? "工作目录" : "Working directory"}><button className="settings-inline-command settings-path" type="button" onClick={() => navigate("workspace")}>{projection?.workspace.selectedPath ?? statePlaceholder}</button></SettingRow>
          <SettingRow label={zh ? "启动自检" : "Startup check"} detail={initializationDetail}><span className="runtime-setting-control"><StatusValue status={initializationPresentationStatus} locale={settings.locale} /><button type="button" className="settings-inline-command" disabled={initializationStatus === "loading"} onClick={onRefreshInitialization}>{zh ? "重新检查" : "Check again"}</button></span></SettingRow>
        </SettingsGroup>
        <SettingsGroup title={zh ? "常用功能" : "Quick access"}><div className="settings-quick-links">
          {onOpenSoftwareCenter
            ? <button className="settings-action-button" type="button" onClick={() => onOpenSoftwareCenter("applications")}>{zh ? "软件中心" : "Software Center"}</button>
            : <button className="settings-action-button" type="button" onClick={() => navigate("agents")}>{copy.agents}</button>}
          <button className="settings-action-button" type="button" onClick={() => navigate("instructions")}>{copy.instructions}</button>
          {onOpenSchedules ? <button className="settings-action-button" type="button" onClick={onOpenSchedules}>{zh ? "计划任务" : "Scheduled tasks"}</button> : null}
        </div></SettingsGroup>
      </>;

}
