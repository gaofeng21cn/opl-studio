import { actionPayloadComplete } from "../../settingsActions";
import { SoftwareCenterSettingsLink } from "../SoftwareCenterSettingsLink";

import { dockerDiagnosticPresentation } from "../../settings/presentation";
import { SettingRow, SettingsGroup, StatusValue } from "../../settings/primitives";

import { RuntimeActionButton } from "../../settings/actions";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function ResourcesSettingsPage({ projection, actionBusyKey, dockerDiagnostic, settings, zh, capabilityCatalog, capabilityStatus, onAction, onApproveConnectionAccess, onOpenSoftwareCenter }: Pick<SettingsPageContext, "projection" | "actionBusyKey" | "dockerDiagnostic" | "settings" | "zh" | "capabilityCatalog" | "capabilityStatus" | "onAction" | "onApproveConnectionAccess" | "onOpenSoftwareCenter">) {

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
          <SoftwareCenterSettingsLink locale={settings.locale} section="resources" onOpen={onOpenSoftwareCenter} />
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
