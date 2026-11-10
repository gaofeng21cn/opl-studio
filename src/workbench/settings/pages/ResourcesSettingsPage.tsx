import { actionPayloadComplete } from "../../settingsActions";
import { ConnectionsSection } from "../ConnectionsSection";

import { dockerDiagnosticPresentation } from "../../settings/presentation";
import { SettingRow, SettingsGroup, StatusValue } from "../../settings/primitives";

import { RuntimeActionButton } from "../../settings/actions";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function ResourcesSettingsPage({ projection, actionBusyKey, dockerDiagnostic, settings, zh, capabilityCatalog, capabilityStatus, onAction, onApproveConnectionAccess }: Pick<SettingsPageContext, "projection" | "actionBusyKey" | "dockerDiagnostic" | "settings" | "zh" | "capabilityCatalog" | "capabilityStatus" | "onAction" | "onApproveConnectionAccess">) {

      const dockerActions = projection?.dockerWebui.actions ?? [];
      const diagnoseAction = dockerActions.find((action) => action.actionId === "settings_diagnose_docker_webui");
      const diagnoseBusy = actionBusyKey === "runtime:settings_diagnose_docker_webui";
      const diagnosticStatus = diagnoseBusy ? "checking" : dockerDiagnostic?.status ?? "not_checked";
      const dockerPresentation = dockerDiagnosticPresentation(dockerDiagnostic, settings.locale);
      const ordinaryActions = dockerActions.filter((action) => (
        action.actionId === "settings_open_docker_webui"
        && dockerDiagnostic?.browserUrlStatus === "configured"
        && action.state !== "unavailable"
        && actionPayloadComplete(action.payload, action.requiredPayloadFields)
      ));
      return (
        <>
          <details className="settings-secondary-details"><summary>{zh ? `连接应用 · ${capabilityCatalog.apps.length}` : `Connected apps · ${capabilityCatalog.apps.length}`}</summary><SettingsGroup title={settings.locale === "zh" ? "应用状态" : "App status"}>
            <p className="settings-inline-note">{zh ? "这里显示本机助手提供的应用；微信、远程设备和网页访问在下方分别管理。" : "Apps exposed by the local assistant. Messaging, remote devices and web access are managed below."}</p>
            {capabilityStatus === "error" ? <p role="alert">{zh ? "应用列表刷新失败，已保留上次结果。" : "App list refresh failed; previous results are retained."}</p> : null}
            {capabilityCatalog.apps.length ? capabilityCatalog.apps.map(app => <SettingRow key={app.id} label={app.name} detail={app.description}><StatusValue status={app.enabled && app.callable ? "available" : app.enabled ? "checking" : "disabled"} locale={settings.locale} /></SettingRow>) : <p className="settings-inline-note">{capabilityStatus === "loading" || capabilityStatus === "idle" ? (zh ? "正在读取应用…" : "Loading apps…") : (zh ? "尚未发现连接应用。" : "No connected apps found.")}</p>}
          </SettingsGroup></details>
          {projection?.externalConnections.length ? <SettingsGroup title={settings.locale === "zh" ? "其他资源" : "Other resources"}>
            {projection?.externalConnections.length ? projection.externalConnections.map((connection) => (
              <SettingRow key={connection.id} label={connection.name}><StatusValue status={connection.status} locale={settings.locale} /></SettingRow>
            )) : <SettingRow label={settings.locale === "zh" ? "连接" : "Connections"}><span className="settings-muted">{settings.locale === "zh" ? "暂无外部连接" : "No external connections"}</span></SettingRow>}
          </SettingsGroup> : null}
          <ConnectionsSection projection={projection} locale={settings.locale} actionBusyKey={actionBusyKey} onAction={onAction} onApproveConnectionAccess={onApproveConnectionAccess} />
          <SettingsGroup title={settings.locale === "zh" ? "网页访问" : "Web access"}>
            <SettingRow label={zh ? "部署网页端" : "Deploy WebUI"} detail={zh ? "网页端独立部署。指南包含安装、访问认证、数据目录和启动步骤。" : "WebUI is a separate deployment. The guide covers installation, authentication, data directories and startup."}><a className="settings-support-link" target="_blank" rel="noreferrer" href="https://github.com/gaofeng21cn/opl-studio/blob/main/docs/oci-distribution.md">{zh ? "配置指南" : "Setup guide"}</a></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "运行检查" : "Runtime check"} detail={diagnosticStatus === "checking"
              ? (settings.locale === "zh" ? "正在读取运行环境" : "Reading the runtime")
              : dockerPresentation.detail}>
              <span className="runtime-setting-control"><StatusValue status={diagnosticStatus === "checking" ? diagnosticStatus : dockerPresentation.status} locale={settings.locale} /><RuntimeActionButton action={diagnoseAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /></span>
            </SettingRow>
            {dockerPresentation.issues.length ? <SettingRow label={settings.locale === "zh" ? "需要处理" : "Needs attention"}><span>{dockerPresentation.issues.join(settings.locale === "zh" ? "，" : ", ")}</span></SettingRow> : null}
            {ordinaryActions.length ? (
              <>{ordinaryActions.map((action) => <SettingRow key={action.actionId} label={action.label}><RuntimeActionButton action={action} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /></SettingRow>)}</>
            ) : null}
          </SettingsGroup>
        </>
      );

}
