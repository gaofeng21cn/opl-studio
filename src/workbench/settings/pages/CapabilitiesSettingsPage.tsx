import { PackageCatalog } from "../packages";
import { CapabilityDirectory } from "../capabilities";
import { ManagedCompanionsGroup } from "../actions";
import type { SettingsPageContext } from "../useSettingsPageContext";

export function CapabilitiesSettingsPage({ manifestInstallAction, model, capabilityCatalog, capabilityStatus, capabilityError, settings, onRefreshCapabilities, navigate, actionBusyKey, onAction, renderPackageContributions }: Pick<SettingsPageContext, "manifestInstallAction" | "model" | "capabilityCatalog" | "capabilityStatus" | "capabilityError" | "settings" | "onRefreshCapabilities" | "navigate" | "actionBusyKey" | "onAction" | "renderPackageContributions">) {
  return <>
    <PackageCatalog kind="all" model={model} settings={settings} actionBusyKey={actionBusyKey} onAction={onAction} manifestInstallAction={manifestInstallAction} renderPackageContributions={renderPackageContributions} />
    {model.managedCompanions.length ? <ManagedCompanionsGroup companions={model.managedCompanions} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /> : null}
    <details className="settings-secondary-details">
      <summary>{settings.locale === "zh" ? "查看提供的技能与连接能力" : "Explore skills and connected capabilities"}</summary>
      <CapabilityDirectory packageLifecycle={model.packageLifecycle} catalog={capabilityCatalog} status={capabilityStatus} error={capabilityError} locale={settings.locale} showTechnicalDetails={settings.developerDetails} onRefresh={onRefreshCapabilities} onNavigate={navigate} />
    </details>
  </>;
}
