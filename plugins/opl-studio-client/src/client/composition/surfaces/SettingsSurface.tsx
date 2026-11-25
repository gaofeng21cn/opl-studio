import type { ReactNode } from "react";
import type { OplSettingsGroupDestination, OplSettingsGroupOwner } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import type { OplUiContribution } from "../contributionProjection";
import { settingsEntriesForNativeAppSurface } from "../contributionProjection";
import { SettingsPluginSections } from "../SettingsPluginSections";
import {
  SettingsPanel,
  type ResourceSettingsFocus,
  type SettingsDestinationId,
  type SettingsPanelProps
} from "../../workbench/SettingsPanel";
import type { WorkbenchModel } from "../../workbench/workbenchModel";

export type SettingsSurfaceProps = Omit<
  SettingsPanelProps,
  "renderSettingsContributions" | "renderSettingsGroupSlot"
> & {
  packageLifecycle: WorkbenchModel["packageLifecycle"];
  uiContributionEntries: OplUiContribution[];
  focusedPackageId?: string;
  renderContribution?: (options?: { only?: string }) => ReactNode;
  renderSettingsGroupSlot?: (
    destination: OplSettingsGroupDestination,
    owner: OplSettingsGroupOwner
  ) => ReactNode;
  onOpenSoftwareCenterRoute: (
    section?: "applications" | "updates" | "activity" | "resources" | "sources",
    packageId?: string
  ) => void;
  onOpenSettingsDestination: (destination: SettingsDestinationId, focus?: ResourceSettingsFocus) => void;
};

/** Independent settings composition surface integrating native pages, Tier 1 forms, and Tier 2 DSH groups. */
export function SettingsSurface({
  packageLifecycle,
  uiContributionEntries,
  focusedPackageId,
  renderContribution,
  renderSettingsGroupSlot,
  onOpenSoftwareCenterRoute,
  onOpenSettingsDestination,
  ...panelProps
}: SettingsSurfaceProps) {
  return (
    <SettingsPanel
      {...panelProps}
      renderSettingsContributions={(destination) => {
        const entries = settingsEntriesForNativeAppSurface(
          uiContributionEntries,
          destination,
          panelProps.settings.developerDetails
        );
        if (!entries.length) return null;
        const labels = new Map(
          packageLifecycle.map((item) => [item.packageId, item.displayNameI18n?.[panelProps.settings.locale] ?? item.label])
        );
        return (
          <SettingsPluginSections
            entries={entries}
            labels={labels}
            collapsible={destination !== "resources"}
            focusedPackageId={focusedPackageId}
            renderEntry={(entry) => renderContribution?.({ only: entry.contributionKey }) ?? null}
          />
        );
      }}
      renderSettingsGroupSlot={(destination) => renderSettingsGroupSlot?.(destination, {
        locale: panelProps.settings.locale,
        developerDetails: panelProps.settings.developerDetails,
        focusedPackageId,
        openSoftwareCenter: onOpenSoftwareCenterRoute,
        openSettingsDestination: (targetDestination: string, focus?: ResourceSettingsFocus) =>
          onOpenSettingsDestination(targetDestination as SettingsDestinationId, focus),
        billionContext: panelProps.billionContext,
        computerUse: panelProps.computerUse
      })}
    />
  );
}
