import { Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { WorkbenchSettings } from "../../settingsModel";

import { modelLabel } from "../../modelPolicy";

import { SettingRow, SettingsGroup, StatusValue } from "../../settings/primitives";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function ModelsSettingsPage({ onSettingChange, setPermissionAcknowledged, setPermissionConfirmation, zh, unavailableFixedModel, settings, displayedModelId, modelOptions, renderSettingControl, modelAccessState, projection, navigate }: Pick<SettingsPageContext, "onSettingChange" | "setPermissionAcknowledged" | "setPermissionConfirmation" | "zh" | "unavailableFixedModel" | "settings" | "displayedModelId" | "modelOptions" | "renderSettingControl" | "modelAccessState" | "projection" | "navigate">) {

      return <>
        <p className="settings-inline-note">{zh ? "与输入框中的模型选择同步，作用于之后发送的消息和新任务；不会改变正在执行的消息。" : "Shared with the composer. Applies to subsequent messages and new tasks, without changing a running turn."}</p>
        <SettingsGroup title={zh ? "默认模型" : "Default model"}>
          <SettingRow label={zh ? "模型" : "Model"} detail={unavailableFixedModel ? (zh ? "所选模型当前不可用" : "Selected model is unavailable") : settings.modelAccess === "__auto" ? (zh ? `自动选择：${modelLabel(displayedModelId ?? "--", settings.locale, modelOptions)}` : `Auto selects ${modelLabel(displayedModelId ?? "--", settings.locale, modelOptions)}`) : undefined}>{renderSettingControl("modelAccess")}</SettingRow>
          <SettingRow label={zh ? "推理强度" : "Reasoning effort"} detail={zh ? "更高强度通常需要更长时间并消耗更多令牌；手动更改会切换为固定模型。" : "Higher effort usually takes longer and uses more tokens. A manual change switches to a fixed model."}>{renderSettingControl("reasoningLevel")}</SettingRow>
          <SettingRow label={zh ? "模型访问" : "Model access"} detail={modelAccessState === "current" ? "OPL Gateway" : (zh ? "自定义模型服务" : "Custom model service")}><span className="runtime-setting-control"><StatusValue status={projection?.codex.accessStatus} locale={settings.locale} /><button className="settings-inline-command" type="button" onClick={() => navigate("account")}>{zh ? "管理账户" : "Manage account"}</button></span></SettingRow>
        </SettingsGroup>
        <SettingsGroup title={zh ? "执行权限" : "Execution permissions"}>
            <SettingRow label={zh ? "任务权限" : "Task permissions"} detail={zh ? "与输入框权限同步，作用于之后发送的任务。设置中的清理、卸载等操作仍需单独确认。" : "Shared with the composer for subsequent tasks. Cleanup and uninstall still require separate confirmation."}><select className="setting-select" aria-label={zh ? "任务权限" : "Task permissions"} value={settings.agentPermissions} onChange={event => { const next = event.currentTarget.value as WorkbenchSettings["agentPermissions"]; if (next === ":danger-full-access" && settings.agentPermissions !== next) { setPermissionAcknowledged(false); setPermissionConfirmation(true); } else onSettingChange("agentPermissions", next); }}><option value=":read-only">{zh ? "只读" : "Read only"}</option><option value=":workspace">{zh ? "可写工作区" : "Workspace write"}</option><option value=":danger-full-access">{zh ? "完全访问" : "Full access"}</option></select></SettingRow>
        </SettingsGroup>
        <SettingsGroup title={zh ? "审阅与上下文" : "Review and context"}>
          <SettingRow label="Auto Review" detail={zh ? "由 Codex 自动审阅需要审批的操作。完全访问模式不产生此类审批；拒绝结果仍可在任务中查看。" : "Codex reviews approval requests. Full access does not generate these requests; denials remain visible in the task."}><Switch label="Auto Review" checked={settings.autoReview} onChange={value => onSettingChange("autoReview", value)} /></SettingRow>
          <SettingRow label={zh ? "时间上下文" : "Time context"} detail={zh ? "每次发送时附带当前日期、时间和时区，不读取日历或位置。" : "Include the current date, time and timezone with each message. No calendar or location access."}><Switch label={zh ? "时间上下文" : "Time context"} checked={settings.timeContext} onChange={value => onSettingChange("timeContext", value)} /></SettingRow>
        </SettingsGroup>
        <details className="settings-secondary-details"><summary>{zh ? "连接详情" : "Connection details"}</summary><SettingRow label={zh ? "服务标识" : "Provider ID"}><code>{projection?.codex.providerName ?? "--"}</code></SettingRow></details>
      </>;

}
