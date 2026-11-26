import { FolderOpen, LoaderCircle } from "lucide-react";

import { carrierLogDetail } from "../presentation";
import { SettingRow, SettingsGroup, StatusValue } from "../primitives";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function DiagnosticsSettingsPage({ carrierDiagnostics, settings, issueList, stateFailed, issues, readbackStatus, onOpenLogDirectory, runLocal, zh, actionBusyKey, onChangeLogDirectory, nativeAppUpdate, stateStatus, setLocalNotice, renderSettingControl, stateError, projection }: Pick<SettingsPageContext, "carrierDiagnostics" | "settings" | "issueList" | "stateFailed" | "issues" | "readbackStatus" | "onOpenLogDirectory" | "runLocal" | "zh" | "actionBusyKey" | "onChangeLogDirectory" | "nativeAppUpdate" | "stateStatus" | "setLocalNotice" | "renderSettingControl" | "stateError" | "projection">) {

      const appLogDirectory = carrierDiagnostics.application?.systemInfo.logDir;
      const appLogDirectoryDetail = carrierLogDetail(carrierDiagnostics, settings.locale);
      return (
        <>
          <SettingsGroup title={settings.locale === "zh" ? "需要处理的问题" : "Issues to resolve"}>{issueList}</SettingsGroup>
          <SettingsGroup title={settings.locale === "zh" ? "诊断工具" : "Diagnostic tools"}>
            <SettingRow label={settings.locale === "zh" ? "整体状态" : "Overall status"} detail={stateFailed ? (settings.locale === "zh" ? "请刷新后重试" : "Refresh to try again") : undefined}><StatusValue status={issues.length ? "attention_needed" : readbackStatus} locale={settings.locale} /></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "待处理项目" : "Items requiring attention"}><span>{issues.length}</span></SettingRow>
            <SettingRow
              label={settings.locale === "zh" ? "应用日志" : "Application logs"}
              detail={appLogDirectoryDetail}
            >
              <div className="settings-row-actions">
                <StatusValue status={carrierDiagnostics.status === "available" ? "ready" : carrierDiagnostics.status} locale={settings.locale} />
                {onOpenLogDirectory && appLogDirectory ? <button className="settings-action-button" type="button" onClick={() => void runLocal(onOpenLogDirectory)}><FolderOpen size={14} aria-hidden="true" />{zh ? "打开日志文件夹" : "Open logs folder"}</button> : null}
                {carrierDiagnostics.setLogDirectorySupported ? (
                  <button
                    className="settings-inline-command"
                    type="button"
                    disabled={actionBusyKey === "application.setLogDirectory"}
                    onClick={onChangeLogDirectory}
                  >
                    {actionBusyKey === "application.setLogDirectory"
                      ? <LoaderCircle aria-hidden="true" className="spin" size={14} />
                      : <FolderOpen aria-hidden="true" size={14} />}
                    {settings.locale === "zh" ? "更改目录" : "Change directory"}
                  </button>
                ) : null}
              </div>
            </SettingRow>
            <SettingRow label={zh ? "反馈摘要" : "Feedback summary"} detail={zh ? "仅含版本、平台与状态，不含路径、账户或凭据。" : "Includes version, platform and status only; no paths, accounts or credentials."}><button className="settings-action-button" type="button" onClick={() => void navigator.clipboard.writeText(JSON.stringify({ version: nativeAppUpdate?.currentVersion, platform: carrierDiagnostics.application?.systemInfo.platform, state: stateStatus, issueTypes: issues.map(issue => issue.id), updater: nativeAppUpdate?.state }, null, 2)).then(() => setLocalNotice(zh ? "已复制诊断摘要" : "Diagnostic summary copied"), () => setLocalNotice(zh ? "无法复制，请重试。" : "Could not copy. Please retry."))}>{zh ? "复制诊断摘要" : "Copy diagnostic summary"}</button></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "显示技术详情" : "Show technical details"}>{renderSettingControl("developerDetails")}</SettingRow>
          </SettingsGroup>
          {settings.developerDetails ? (
            <SettingsGroup title={settings.locale === "zh" ? "高级详情" : "Advanced details"}>
              <SettingRow label={settings.locale === "zh" ? "应用日志路径" : "Application log path"}><code>{appLogDirectory ?? (settings.locale === "zh" ? "不可用" : "Unavailable")}</code></SettingRow>
              {stateError ? <SettingRow label={settings.locale === "zh" ? "最近错误" : "Latest error"}><code>{stateError}</code></SettingRow> : null}
              {carrierDiagnostics.reasonCode ? <SettingRow label={settings.locale === "zh" ? "状态代码" : "Status code"}><code>{carrierDiagnostics.reasonCode}</code></SettingRow> : null}
              <SettingRow label={settings.locale === "zh" ? "基础服务日志" : "Base service logs"}><code>{projection?.localEnvironment.logsDir ?? "--"}</code></SettingRow>
              <SettingRow label={settings.locale === "zh" ? "应用数据目录" : "Application data directory"}><code>{projection?.localEnvironment.stateDir ?? "--"}</code></SettingRow>
              <SettingRow label={settings.locale === "zh" ? "运行环境目录" : "Runtime directory"}><code>{projection?.localEnvironment.runtimeSourcesRoot ?? "--"}</code></SettingRow>
              <SettingRow label={settings.locale === "zh" ? "本机助手路径" : "Local assistant path"}><code>{projection?.codex.binaryPath ?? "--"}</code></SettingRow>
            </SettingsGroup>
          ) : null}
        </>
      );

}
