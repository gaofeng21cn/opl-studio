import { PackageCatalog } from "../../settings/packages";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function AgentsSettingsPage({ model, settings, actionBusyKey, onAction, manifestInstallAction, renderPackageContributions }: Pick<SettingsPageContext, "model" | "settings" | "actionBusyKey" | "onAction" | "manifestInstallAction" | "renderPackageContributions">) {

      return (
        <PackageCatalog model={model} settings={settings} actionBusyKey={actionBusyKey} onAction={onAction} manifestInstallAction={manifestInstallAction} renderPackageContributions={renderPackageContributions} />
      );

}
