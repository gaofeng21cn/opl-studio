import type { ReactNode } from "react";
import { Pill, StateDot, type StateDotState } from "@deepseek-ai/dsh-client-ui-primitives";

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

export function SettingsGroup({ title, description, packageId, children }: {
  title: string;
  description?: string;
  packageId?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-group" data-testid="opl-settings-section" data-package-id={packageId}>
      <h2>{title}</h2>
      {description ? <p className="settings-inline-note">{description}</p> : null}
      <div className="settings-rows">{children}</div>
    </section>
  );
}

/** Accessible status badge combining an icon/dot indicator with text so status is never color-only. */
export function StatusPill({ state, label }: { state: StateDotState; label: string }) {
  return (
    <Pill>
      <StateDot state={state} size={9} />
      <span>{label}</span>
    </Pill>
  );
}

export function EmptyState({ title, detail, action }: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="opl-ui-empty-state" role="status">
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
      {action ? <div className="opl-ui-empty-state-action">{action}</div> : null}
    </div>
  );
}
