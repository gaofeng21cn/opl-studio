import type { OplSettingsGroupOwner } from "@gaofeng21cn/opl-plugin-ui-kit";

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

export * from "@gaofeng21cn/opl-plugin-ui-kit";
