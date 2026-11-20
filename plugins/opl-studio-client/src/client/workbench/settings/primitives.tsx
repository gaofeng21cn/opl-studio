import { type ReactNode } from "react";

import type { WorkbenchSettings } from "../settingsModel";

import { statusTone, formatStatus } from "./presentation";

export function SettingRow({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  return (
    <div className="settings-row" data-slot="settings.general.item">
      <div className="settings-row-label">
        <span>{label}</span>
        {detail ? <small>{detail}</small> : null}
      </div>
      <div className="settings-row-value">{children}</div>
    </div>
  );
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group" data-testid="opl-settings-section">
      <h2>{title}</h2>
      <div className="settings-rows">{children}</div>
    </section>
  );
}

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
