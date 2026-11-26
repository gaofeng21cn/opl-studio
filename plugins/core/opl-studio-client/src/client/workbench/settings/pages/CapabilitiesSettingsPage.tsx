import { SoftwareCenterSettingsLink } from "../SoftwareCenterSettingsLink";
import { CapabilityDirectory } from "../capabilities";
import { SettingsGroup } from "../primitives";
import { ManagedCompanionsGroup } from "../actions";
import { ComputerUseSettingsSection } from "../../../composition/computerUseSettingsSlot";
import type { SettingsPageContext } from "../useSettingsPageContext";

export function CapabilitiesSettingsPage({ model, capabilityCatalog, capabilityStatus, capabilityError, settings, onRefreshCapabilities, navigate, onOpenSchedules, actionBusyKey, onAction, computerUse, onOpenSoftwareCenter, onOpenAppWorkspace, renderSettingsContributions, renderSettingsGroupSlot }: Pick<SettingsPageContext, "model" | "capabilityCatalog" | "capabilityStatus" | "capabilityError" | "settings" | "onRefreshCapabilities" | "navigate" | "onOpenSchedules" | "actionBusyKey" | "onAction" | "computerUse" | "onOpenSoftwareCenter" | "onOpenAppWorkspace" | "renderSettingsContributions" | "renderSettingsGroupSlot">) {
  return <>
    <SoftwareCenterSettingsLink locale={settings.locale} onOpen={onOpenSoftwareCenter} />
    {model.managedCompanions.length ? <ManagedCompanionsGroup companions={model.managedCompanions} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /> : null}
    <SettingsGroup title={settings.locale === "zh" ? "应用工作台" : "App workspace"}>
      <p className="settings-inline-note">{settings.locale === "zh" ? "邮件、审阅、制作与发布在应用工作台中完成。" : "Use the app workspace for mail, reviews, production and publishing."}</p>
      <button className="settings-action-button" type="button" disabled={!onOpenAppWorkspace} onClick={onOpenAppWorkspace}>{settings.locale === "zh" ? "打开应用工作台" : "Open app workspace"}</button>
    </SettingsGroup>
    {renderSettingsContributions?.("capabilities")}
    {renderSettingsGroupSlot
      ? renderSettingsGroupSlot("capabilities")
      : <SettingsGroup title={settings.locale === "zh" ? "桌面操控（Computer Use）" : "Computer Use"}><ComputerUseSettingsSection zh={settings.locale === "zh"} locale={settings.locale} bridge={computerUse} /></SettingsGroup>}
    <details className="settings-secondary-details">
      <summary>{settings.locale === "zh" ? "查看提供的技能与连接能力" : "Explore skills and connected capabilities"}</summary>
      <CapabilityDirectory packageLifecycle={model.packageLifecycle} catalog={capabilityCatalog} status={capabilityStatus} error={capabilityError} locale={settings.locale} showTechnicalDetails={settings.developerDetails} onRefresh={onRefreshCapabilities} onNavigate={navigate} onOpenSchedules={onOpenSchedules} />
    </details>
  </>;
}
