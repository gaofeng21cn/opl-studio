import { SoftwareCenterSettingsLink } from "../SoftwareCenterSettingsLink";
import { CapabilityDirectory } from "../capabilities";
import { SettingsGroup } from "../primitives";
import { ManagedCompanionsGroup } from "../actions";
import type { SettingsPageContext } from "../useSettingsPageContext";

export function CapabilitiesSettingsPage({ model, capabilityCatalog, capabilityStatus, capabilityError, settings, onRefreshCapabilities, navigate, onOpenSchedules, actionBusyKey, onAction, onOpenSoftwareCenter, renderSettingsContributions }: Pick<SettingsPageContext, "model" | "capabilityCatalog" | "capabilityStatus" | "capabilityError" | "settings" | "onRefreshCapabilities" | "navigate" | "onOpenSchedules" | "actionBusyKey" | "onAction" | "onOpenSoftwareCenter" | "renderSettingsContributions">) {
  const pluginSettings = renderSettingsContributions?.("capabilities");
  return <>
    <SoftwareCenterSettingsLink locale={settings.locale} onOpen={onOpenSoftwareCenter} />
    {model.managedCompanions.length ? <ManagedCompanionsGroup companions={model.managedCompanions} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /> : null}
    {pluginSettings ? <SettingsGroup title={settings.locale === "zh" ? "扩展设置" : "Extension settings"}>{pluginSettings}</SettingsGroup> : null}
    <details className="settings-secondary-details">
      <summary>{settings.locale === "zh" ? "查看提供的技能与连接能力" : "Explore skills and connected capabilities"}</summary>
      <CapabilityDirectory packageLifecycle={model.packageLifecycle} catalog={capabilityCatalog} status={capabilityStatus} error={capabilityError} locale={settings.locale} showTechnicalDetails={settings.developerDetails} onRefresh={onRefreshCapabilities} onNavigate={navigate} onOpenSchedules={onOpenSchedules} />
    </details>
  </>;
}
