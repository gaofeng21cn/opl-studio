import { LinkCompanionSection } from "../LinkCompanionSection";
import { actionPayloadComplete } from "../../settingsActions";
import { useState } from "react";
import { SharedResourcesPage } from "../../SharedResourcesPage";

import { dockerDiagnosticPresentation } from "../presentation";
import { SettingRow, SettingsGroup, StatusValue } from "../primitives";

import { RuntimeActionButton } from "../actions";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function ResourcesSettingsPage({ model, resourceFocus, onPickKnowledgeDirectory, onRefresh, projection, actionBusyKey, dockerDiagnostic, settings, zh, capabilityCatalog, capabilityStatus, onAction, onApproveConnectionAccess, onOpenSoftwareCenter, navigate, renderSettingsContributions, renderSettingsGroupSlot }: Pick<SettingsPageContext, "model" | "resourceFocus" | "onPickKnowledgeDirectory" | "onRefresh" | "projection" | "actionBusyKey" | "dockerDiagnostic" | "settings" | "zh" | "capabilityCatalog" | "capabilityStatus" | "onAction" | "onApproveConnectionAccess" | "onOpenSoftwareCenter" | "navigate" | "renderSettingsContributions" | "renderSettingsGroupSlot">) {

      const [section, setSection] = useState<"libraries" | "remote">(resourceFocus?.section ?? "libraries");
      const remoteConnections = renderSettingsContributions?.("resources");
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
          <div className="segmented-control" role="group" aria-label={zh ? "连接设置分组" : "Connection settings sections"}>
            <button type="button" aria-pressed={section === "libraries"} data-active={section === "libraries"} onClick={() => setSection("libraries")}>{zh ? "资料与连接" : "Libraries & connections"}</button>
            <button type="button" aria-pressed={section === "remote"} data-active={section === "remote"} onClick={() => setSection("remote")}>{zh ? "远程访问与网页端" : "Remote & web access"}</button>
          </div>
          {section === "libraries" ? <SharedResourcesPage model={model} settings={settings} actionBusyKey={actionBusyKey} onAction={onAction} onRefresh={onRefresh} onApproveConnectionAccess={onApproveConnectionAccess} onPickKnowledgeDirectory={onPickKnowledgeDirectory} selectedPackageId={resourceFocus?.packageId} focusedResourceId={resourceFocus?.resourceId} onManageSources={onOpenSoftwareCenter ? () => onOpenSoftwareCenter("sources") : undefined} /> : <>
          <SettingsGroup title={zh ? "消息与远程连接" : "Messages & remote connections"}>
            <p className="settings-inline-note">{zh ? "通过微信等消息通道远程使用 OPL。已启用的远程扩展在这里统一连接和管理。" : "Use OPL remotely through Weixin and other messaging channels. Connect and manage enabled remote extensions here."}</p>
            {remoteConnections ?? <SettingRow label={zh ? "微信及其他远程扩展" : "Weixin and other remote extensions"} detail={zh ? "在软件中心搜索并安装所需的远程插件，然后回到这里连接账号。" : "Find and install a remote plugin in Software Center, then return here to connect an account."}>
              <button className="settings-action-button" type="button" disabled={!onOpenSoftwareCenter} onClick={() => onOpenSoftwareCenter?.("applications")}>{zh ? "管理远程扩展" : "Manage remote extensions"}</button>
            </SettingRow>}
          </SettingsGroup>
          {renderSettingsGroupSlot?.("resources")}
          <LinkCompanionSection locale={settings.locale} onOpenAccount={() => navigate("account")} />
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
          </>}
        </>
      );

}
