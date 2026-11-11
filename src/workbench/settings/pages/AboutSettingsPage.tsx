import { type SettingsHostActionIntent } from "../../settingsActions";

import { SettingRow, SettingsGroup, StatusValue } from "../../settings/primitives";

import { SettingsIntentButton } from "../../settings/actions";
import { formatUpdateChannel } from "../../settings/maintenance";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function AboutSettingsPage({ actionViewModel, nativeAppUpdate, managedUpdate, projection, settings, zh, carrierDiagnostics, actionBusyKey, onAction, onHostAction, maintenanceStatus, maintenanceError, stateStatus }: Pick<SettingsPageContext, "actionViewModel" | "nativeAppUpdate" | "managedUpdate" | "projection" | "settings" | "zh" | "carrierDiagnostics" | "actionBusyKey" | "onAction" | "onHostAction" | "maintenanceStatus" | "maintenanceError" | "stateStatus">) {
const appUpdate = actionViewModel.managedUpdates.find((item) => item.componentId === "opl_app");
const appUpdateComponent = appUpdate?.component;
const hostUpdateActions = appUpdate?.actions.filter(
      (intent): intent is SettingsHostActionIntent => intent.transport !== "app_action"
    ) ?? [];
const updateAction = hostUpdateActions.find((intent) => intent.operation === "restart" && intent.availability === "ready")
      ?? hostUpdateActions.find((intent) => intent.operation === "apply" && intent.availability === "ready")
      ?? hostUpdateActions.find((intent) => intent.operation === "check" && intent.availability === "ready");
const unpackagedPreview = nativeAppUpdate?.reasonCode === "desktop_updater_requires_packaged_app";
const appVersion = unpackagedPreview ? (zh ? "未发布" : "Unreleased") : nativeAppUpdate?.currentVersion ?? appUpdateComponent?.installedVersion ?? "--";
const updateChannel = appUpdateComponent?.channel
      ?? managedUpdate?.channel
      ?? projection?.localEnvironment.releaseChannel
      ?? projection?.statusSummary.releaseChannel;
return (
      <div data-testid="settings-page-about">
        <SettingsGroup title="One Person Lab App">
          <div data-testid="settings-about-primary">
            <SettingRow label={settings.locale === "zh" ? "版本" : "Version"}><span>{appVersion}</span></SettingRow>
            <SettingRow label={zh ? "版本类型" : "Build type"}><span>{unpackagedPreview ? (zh ? "开发预览" : "Development preview") : nativeAppUpdate?.buildKind === "local-development" ? (zh ? "本地开发版 · 不接收公开自动更新" : "Local development · public updates disabled") : formatUpdateChannel(updateChannel, settings.locale)}</span></SettingRow>
            <SettingRow label={zh ? "运行平台" : "Platform"}><span>{carrierDiagnostics.application?.systemInfo.platform === "darwin" ? `macOS · ${carrierDiagnostics.application?.systemInfo.arch === "arm64" ? (zh ? "Apple 芯片" : "Apple silicon") : "Intel"}` : carrierDiagnostics.application?.systemInfo.platform ?? (zh ? "网页端" : "Web")}</span></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "更新状态" : "Update status"}>
              <span className="runtime-setting-control">
                <StatusValue status={unpackagedPreview ? "development_preview" : nativeAppUpdate?.buildKind === "local-development" ? "local_development" : nativeAppUpdate?.state === "not_available" ? "current" : nativeAppUpdate?.state ?? appUpdateComponent?.state} locale={settings.locale} />
                {updateAction && nativeAppUpdate?.supported !== false ? <SettingsIntentButton intent={updateAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} onHostAction={onHostAction} /> : null}
              </span>
            </SettingRow>
          </div>
          {maintenanceStatus ? <SettingRow label={settings.locale === "zh" ? "组件维护" : "Component maintenance"}>
            <span role="status">{({
              idle: settings.locale === "zh" ? "等待检查" : "Pending check",
              checking: settings.locale === "zh" ? "检查中" : "Checking",
              applying: settings.locale === "zh" ? "后台更新中" : "Updating",
              deferred: settings.locale === "zh" ? "等待任务完成" : "Waiting for tasks",
              completed: settings.locale === "zh" ? "已检查" : "Checked",
              failed: settings.locale === "zh" ? "更新未完成，将重试" : "Update incomplete, retry pending"
            } as Record<string, string>)[maintenanceStatus] ?? maintenanceStatus}</span>
            {maintenanceError ? <span data-testid="opl-maintenance-error">
              {maintenanceError === "framework_update_downgrade_blocked"
                ? (settings.locale === "zh" ? "当前已安装的运行环境比更新源更新，已保留当前版本。无需降级，普通会话不受影响。" : "Your installed runtime is newer than the update source. The current version was kept; no downgrade is needed and conversations remain available.")
                : (settings.locale === "zh" ? "请在运行与维护中检查更新源或重试。" : "Check the update source or retry in Runtime & Maintenance.")}
              <code>{maintenanceError}</code>
            </span> : null}
          </SettingRow> : null}
        </SettingsGroup>
        <SettingsGroup title={settings.locale === "zh" ? "支持与反馈" : "Support"}>

          {carrierDiagnostics.frameworkBootstrapStatus && carrierDiagnostics.frameworkBootstrapStatus !== "available" ? (
            <SettingRow label={settings.locale === "zh" ? "运行环境恢复" : "Runtime recovery"}>
              <span>{settings.locale === "zh" ? "本机工作环境未能完成准备，部分专业功能暂不可用。已有可用模型配置时仍可对话；请先检查网络，再点击下方“检查更新”获取修复。" : "Local setup could not finish, so some specialist features are unavailable. Chat remains available with an existing model connection. Check your network, then use Check for updates below to get a repair."}</span>
              <code>{carrierDiagnostics.frameworkBootstrapStatus}</code>
            </SettingRow>
          ) : null}
          {carrierDiagnostics.frameworkActivationStatus?.startsWith("framework_") ? (
            <SettingRow label={settings.locale === "zh" ? "运行环境更新" : "Runtime update"}>
              <span>{settings.locale === "zh" ? "新运行环境暂不兼容，已保留可用的当前版本。你可以继续工作，稍后在“运行与维护”中重新检查更新。" : "The new runtime is not compatible, so the working version was kept. Continue working and check again later in Runtime and maintenance."}</span>
              <code>{carrierDiagnostics.frameworkActivationStatus}</code>
            </SettingRow>
          ) : null}
          <a className="settings-support-link" target="_blank" rel="noreferrer" href="https://github.com/gaofeng21cn/one-person-lab-app/blob/main/docs/delivery/install/README.zh-CN.md">{settings.locale === "zh" ? "安装与使用指南" : "Installation and getting started"}</a>
          <a className="settings-support-link" data-testid="opl-support-link" target="_blank" rel="noreferrer" href={`https://github.com/gaofeng21cn/one-person-lab-app/issues/new?title=${encodeURIComponent("One Person Lab App feedback")}&body=${encodeURIComponent(JSON.stringify({ version: appVersion, carrier: carrierDiagnostics.carrier, platform: carrierDiagnostics.application?.systemInfo.platform, arch: carrierDiagnostics.application?.systemInfo.arch, state: stateStatus, update: nativeAppUpdate?.state ?? "unknown" }, null, 2))}`}>{settings.locale === "zh" ? "反馈问题（附脱敏诊断摘要）" : "Report an issue (safe diagnostic summary)"}</a>
        </SettingsGroup>
        <details className="settings-secondary-details"><summary>{zh ? "技术详情" : "Technical details"}</summary>
          <SettingRow label={zh ? "运行方式" : "Carrier"}><code>{carrierDiagnostics.carrier}</code></SettingRow>
          <SettingRow label={zh ? "平台 / 架构" : "Platform / architecture"}><code>{carrierDiagnostics.application?.systemInfo.platform ?? "--"} / {carrierDiagnostics.application?.systemInfo.arch ?? "--"}</code></SettingRow>
          {nativeAppUpdate?.localBuildId ? <SettingRow label={zh ? "构建标识" : "Build ID"}><code>{nativeAppUpdate.localBuildId}</code></SettingRow> : null}
        </details>
      </div>
    );
}
