import { FolderOpen, LoaderCircle } from "lucide-react";

import { SettingRow, SettingsGroup, StatusValue } from "../primitives";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function WorkspaceSettingsPage({ settings, zh, setupCapabilities, projection, actionBusyKey, onChooseWorkspaceRoot, currentWorkspace, onOpenWorkspace, runLocal }: Pick<SettingsPageContext, "settings" | "zh" | "setupCapabilities" | "projection" | "actionBusyKey" | "onChooseWorkspaceRoot" | "currentWorkspace" | "onOpenWorkspace" | "runLocal">) {

      return (
        <SettingsGroup title={settings.locale === "zh" ? "新项目默认位置" : "Default location for new projects"}>
          <p className="settings-inline-note">{zh ? "修改默认目录不会搬动已有文件，也不会改变已有会话的项目目录。" : "Changing this default does not move existing files or change existing conversation workspaces."}</p>
          <SettingRow
            label={settings.locale === "zh" ? "位置" : "Location"}
            detail={!setupCapabilities.workspaceRoot ? (settings.locale === "zh" ? "当前运行方式只读显示此位置" : "This app mode shows the location as read-only") : undefined}
          >
            <span className="runtime-setting-control settings-workspace-location">
              <code>{projection?.workspace.selectedPath ?? "--"}</code>
              {setupCapabilities.workspaceRoot ? (
                <button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={() => { void onChooseWorkspaceRoot(); }}>
                  {actionBusyKey === "setup:workspace-root" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <FolderOpen aria-hidden="true" size={13} />}
                  {settings.locale === "zh" ? "选择目录" : "Choose folder"}
                </button>
              ) : null}
            </span>
          </SettingRow>
          <SettingRow label={settings.locale === "zh" ? "访问状态" : "Access status"}>
            <StatusValue status={projection?.workspace.exists === false ? "missing" : projection?.workspace.writable === false ? "read_only" : projection?.workspace.healthStatus} locale={settings.locale} />
          </SettingRow>
          {currentWorkspace ? <SettingRow label={zh ? "当前项目" : "Current project"} detail={currentWorkspace}><span className="runtime-setting-control">{onOpenWorkspace ? <button className="settings-action-button" type="button" onClick={() => void runLocal(onOpenWorkspace)}><FolderOpen size={14} aria-hidden="true" />{zh ? "打开文件夹" : "Open folder"}</button> : null}</span></SettingRow> : null}
          <details className="settings-secondary-details">
            <summary>{settings.locale === "zh" ? "目录检查详情" : "Directory check details"}</summary>
          <SettingRow label={settings.locale === "zh" ? "目录存在" : "Directory exists"}><span>{projection?.workspace.exists === null || projection?.workspace.exists === undefined ? "--" : projection.workspace.exists ? (settings.locale === "zh" ? "是" : "Yes") : (settings.locale === "zh" ? "否" : "No")}</span></SettingRow>
          <SettingRow label={settings.locale === "zh" ? "可写" : "Writable"}><span>{projection?.workspace.writable === null || projection?.workspace.writable === undefined ? "--" : projection.workspace.writable ? (settings.locale === "zh" ? "是" : "Yes") : (settings.locale === "zh" ? "否" : "No")}</span></SettingRow>
          <SettingRow label={settings.locale === "zh" ? "健康状态" : "Health"}><StatusValue status={projection?.workspace.healthStatus} locale={settings.locale} /></SettingRow>
          </details>
        </SettingsGroup>
      );

}
