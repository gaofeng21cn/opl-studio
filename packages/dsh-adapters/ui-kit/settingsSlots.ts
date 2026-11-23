import { createElement, type ComponentType } from "react";
import type { OplBridge } from "@gaofeng21cn/opl-host-contracts";
import { PluginErrorBoundary } from "./PluginErrorBoundary";

export const OPL_SETTINGS_GROUP_DESTINATIONS = [
  "models",
  "resources",
  "workspace",
  "capabilities",
  "services",
  "preferences"
] as const;

export type OplSettingsGroupDestination = (typeof OPL_SETTINGS_GROUP_DESTINATIONS)[number];

export type OplSettingsGroupSlotName = `settings.group.${OplSettingsGroupDestination}`;

export function oplSettingsGroupSlotName(destination: OplSettingsGroupDestination): OplSettingsGroupSlotName {
  return `settings.group.${destination}`;
}

export type OplSettingsGroupMeta = {
  id: string;
  destination: OplSettingsGroupDestination;
  packageId: string;
  order?: number;
  registrant: string;
  titleI18n: { zh: string; en: string };
  searchKeywords?: string;
};

export type OplSettingsGroupOwner = {
  locale: "zh" | "en";
  developerDetails?: boolean;
  focusedPackageId?: string;
  openSoftwareCenter?: (section?: "applications" | "updates" | "resources" | "sources", packageId?: string) => void;
  openSettingsDestination?: (
    destination: string,
    focus?: { packageId?: string; resourceId?: string; section?: "libraries" | "remote" }
  ) => void;
  billionContext?: Pick<OplBridge, "readBillionContext" | "setBillionContext">;
};

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "settings.group.models": { kind: "list"; scope: "root"; owner: OplSettingsGroupOwner };
    "settings.group.resources": { kind: "list"; scope: "root"; owner: OplSettingsGroupOwner };
    "settings.group.workspace": { kind: "list"; scope: "root"; owner: OplSettingsGroupOwner };
    "settings.group.capabilities": { kind: "list"; scope: "root"; owner: OplSettingsGroupOwner };
    "settings.group.services": { kind: "list"; scope: "root"; owner: OplSettingsGroupOwner };
    "settings.group.preferences": { kind: "list"; scope: "root"; owner: OplSettingsGroupOwner };
  }
}

/** Shared global symbol so separately compiled plugin CJS bundles agree on metadata identity. */
export const OPL_SETTINGS_GROUP_META = Symbol.for("opl.settings.group.meta.v1");

export type OplSettingsGroupSlotRegistry = {
  register(
    spec: {
      name: OplSettingsGroupSlotName;
      id: string;
      order?: number;
      registrant: string;
      label?: string | (() => string);
    },
    component: ComponentType<OplSettingsGroupOwner>
  ): unknown;
};

/**
 * Registers a Tier 2 settings group card inside an existing App destination
 * wrapped in PluginErrorBoundary and tagged with search/deep-link metadata.
 */
export function registerOplSettingsGroup(
  slots: OplSettingsGroupSlotRegistry,
  meta: OplSettingsGroupMeta,
  Component: ComponentType<OplSettingsGroupOwner>
) {
  function GuardedSettingsGroup(props: OplSettingsGroupOwner) {
    const locale = props.locale ?? "zh";
    return createElement(
      PluginErrorBoundary,
      {
        pluginId: meta.packageId,
        pluginLabel: locale === "en" ? meta.titleI18n.en : meta.titleI18n.zh,
        locale,
        onOpenSoftwareCenter: props.openSoftwareCenter
          ? () => props.openSoftwareCenter?.("applications", meta.packageId)
          : undefined,
        children: createElement(Component, props)
      }
    );
  }
  Object.defineProperty(GuardedSettingsGroup, OPL_SETTINGS_GROUP_META, {
    value: meta,
    enumerable: false,
    configurable: false
  });
  return slots.register(
    {
      name: oplSettingsGroupSlotName(meta.destination),
      id: meta.id,
      order: meta.order ?? 50,
      registrant: meta.registrant,
      label: () => meta.titleI18n.en
    },
    GuardedSettingsGroup
  );
}

/** Reads metadata attached to currently live `settings.group.<dest>` registrations. */
export function readOplSettingsGroupMeta(
  entries: readonly { component?: unknown; options?: { id?: string } }[]
): OplSettingsGroupMeta[] {
  const result: OplSettingsGroupMeta[] = [];
  for (const entry of entries) {
    const component = entry?.component;
    if (!component || (typeof component !== "function" && typeof component !== "object")) continue;
    const meta = (component as Record<symbol, unknown>)[OPL_SETTINGS_GROUP_META];
    if (!meta || typeof meta !== "object") continue;
    const record = meta as Partial<OplSettingsGroupMeta>;
    if (
      typeof record.id === "string"
      && typeof record.destination === "string"
      && OPL_SETTINGS_GROUP_DESTINATIONS.includes(record.destination as OplSettingsGroupDestination)
      && typeof record.packageId === "string"
      && typeof record.titleI18n?.zh === "string"
      && typeof record.titleI18n?.en === "string"
    ) {
      result.push(record as OplSettingsGroupMeta);
    }
  }
  return result;
}
