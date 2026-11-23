import {
  SettingRow,
  SettingsGroup
} from "@gaofeng21cn/opl-dsh-adapters/ui-kit";

import type { WorkbenchSettings } from "../settingsModel";

import { statusTone, formatStatus } from "./presentation";

export { SettingRow, SettingsGroup };

export function StatusValue({ status, locale }: { status?: string; locale: WorkbenchSettings["locale"] }) {
  return (
    <span className="settings-status" data-tone={statusTone(status)}>
      <span aria-hidden="true" />
      {formatStatus(status, locale)}
    </span>
  );
}

export type OfficialDshCapability = {
  id: string;
  pluginIds: string[];
  label: { zh: string; en: string };
  description: { zh: string; en: string };
  owner: { zh: string; en: string };
  integrated: boolean;
};
