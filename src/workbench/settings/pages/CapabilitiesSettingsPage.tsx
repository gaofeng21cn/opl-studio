import { SoftwareCenterSettingsLink } from "../SoftwareCenterSettingsLink";
import { CapabilityDirectory } from "../capabilities";
import { ManagedCompanionsGroup } from "../actions";
import type { SettingsPageContext } from "../useSettingsPageContext";

export function CapabilitiesSettingsPage({ model, capabilityCatalog, capabilityStatus, capabilityError, settings, onRefreshCapabilities, navigate, onOpenSchedules, actionBusyKey, onAction, onOpenSoftwareCenter }: Pick<SettingsPageContext, "model" | "capabilityCatalog" | "capabilityStatus" | "capabilityError" | "settings" | "onRefreshCapabilities" | "navigate" | "onOpenSchedules" | "actionBusyKey" | "onAction" | "onOpenSoftwareCenter">) {
  return <>
    <SoftwareCenterSettingsLink locale={settings.locale} onOpen={onOpenSoftwareCenter} />
    {model.managedCompanions.length ? <ManagedCompanionsGroup companions={model.managedCompanions} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /> : null}
    <details className="settings-secondary-details">
      <summary>{settings.locale === "zh" ? "查看提供的技能与连接能力" : "Explore skills and connected capabilities"}</summary>
      <CapabilityDirectory packageLifecycle={model.packageLifecycle} catalog={capabilityCatalog} status={capabilityStatus} error={capabilityError} locale={settings.locale} showTechnicalDetails={settings.developerDetails} onRefresh={onRefreshCapabilities} onNavigate={navigate} onOpenSchedules={onOpenSchedules} />
    </details>
  </>;
}
