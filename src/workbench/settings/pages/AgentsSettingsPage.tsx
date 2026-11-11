import { SoftwareCenterSettingsLink } from "../SoftwareCenterSettingsLink";
import type { SettingsPageContext } from "../useSettingsPageContext";

export function AgentsSettingsPage({ settings, onOpenSoftwareCenter }: Pick<SettingsPageContext, "settings" | "onOpenSoftwareCenter">) {
  return <SoftwareCenterSettingsLink locale={settings.locale} onOpen={onOpenSoftwareCenter} />;
}
