import {
  codexModelPolicy,
  type CodexModelSelection,
  type CodexReasoningEffort
} from "./modelPolicy";

export const SETTINGS_STORAGE_KEY = "opl.studio.settings.v1";
const LEGACY_SETTINGS_STORAGE_KEY = "opl.nativeWorkbench.settings.v1";
export const ADDITIONAL_CONVERSATION_INSTRUCTIONS_KEY = "codex.oplAppSessionContextAdditional";
const MAX_ADDITIONAL_CONVERSATION_INSTRUCTIONS_BYTES = 65_536;

export type SettingsSectionId =
  | "overview"
  | "account_models"
  | "connections_deployment"
  | "workspace"
  | "agents_capabilities"
  | "runtime_maintenance"
  | "preferences";

export type SettingKey =
  | "locale"
  | "modelAccess"
  | "reasoningLevel"
  | "agentPermissions"
  | "defaultWorkspace"
  | "runtimeProfile"
  | "confirmBeforeExecute"
  | "notificationEnabled"
  | "artifactPreviewMode"
  | "professionalStarterDefaults"
  | "theme"
  | "developerDetails";

export type WorkbenchSettings = {
  locale: "zh" | "en";
  modelAccess: CodexModelSelection;
  reasoningLevel: CodexReasoningEffort;
  agentPermissions: ":danger-full-access" | ":workspace" | ":read-only";
  defaultWorkspace: "opl_app";
  runtimeProfile: "fast" | "full";
  confirmBeforeExecute: boolean;
  notificationEnabled: boolean;
  artifactPreviewMode: "rich_refs_only";
  professionalStarterDefaults: "research_grant_presentation";
  theme: "system" | "light" | "dark";
  developerDetails: boolean;
};

export type RuntimeProfileSetting = WorkbenchSettings["runtimeProfile"];

export type SettingsSection = {
  id: SettingsSectionId;
  title: string;
  keys: SettingKey[];
};

export const settingsSections: SettingsSection[] = [
  { id: "overview", title: "Overview", keys: [] },
  { id: "account_models", title: "Account & Models", keys: ["modelAccess", "reasoningLevel"] },
  { id: "connections_deployment", title: "Connections & Deployment", keys: [] },
  { id: "workspace", title: "Workspace", keys: ["defaultWorkspace"] },
  { id: "agents_capabilities", title: "Agents & Capabilities", keys: ["agentPermissions", "professionalStarterDefaults"] },
  { id: "runtime_maintenance", title: "Runtime & Maintenance", keys: ["runtimeProfile", "developerDetails"] },
  { id: "preferences", title: "Preferences", keys: ["locale", "theme", "artifactPreviewMode", "notificationEnabled", "confirmBeforeExecute"] }
];

export const settingsDefaults: WorkbenchSettings = {
  locale: "zh",
  modelAccess: "__auto",
  reasoningLevel: codexModelPolicy.defaultReasoningEffort,
  agentPermissions: ":danger-full-access",
  defaultWorkspace: "opl_app",
  runtimeProfile: "fast",
  confirmBeforeExecute: true,
  notificationEnabled: true,
  artifactPreviewMode: "rich_refs_only",
  professionalStarterDefaults: "research_grant_presentation",
  theme: "system",
  developerDetails: false
};

const allowedSettingsValues = {
  locale: ["zh", "en"],
  modelAccess: ["__auto", ...codexModelPolicy.modelOptions.map((option) => option.id)],
  reasoningLevel: codexModelPolicy.reasoningOptions,
  agentPermissions: [":danger-full-access", ":workspace", ":read-only"],
  defaultWorkspace: ["opl_app"],
  runtimeProfile: ["fast", "full"],
  confirmBeforeExecute: [true, false],
  notificationEnabled: [true, false],
  artifactPreviewMode: ["rich_refs_only"],
  professionalStarterDefaults: ["research_grant_presentation"],
  theme: ["system", "light", "dark"],
  developerDetails: [true, false]
} as const;

type WorkbenchSettingsPatch = Partial<WorkbenchSettings>;
export type SettingsStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

export function migrateStorageValue(storage: SettingsStorage, key: string, legacyKey: string): string | null {
  const current = storage.getItem(key);
  if (current !== null) return current;
  const legacy = storage.getItem(legacyKey);
  if (legacy === null) return null;
  storage.setItem(key, legacy);
  storage.removeItem?.(legacyKey);
  return legacy;
}

function browserStorage(): SettingsStorage | undefined {
  const storage = (globalThis as { localStorage?: SettingsStorage }).localStorage;
  return storage;
}

function normalizeSetting<Key extends SettingKey>(key: Key, value: unknown): WorkbenchSettings[Key] {
  const allowed = allowedSettingsValues[key] as readonly unknown[];
  return allowed.includes(value) ? value as WorkbenchSettings[Key] : settingsDefaults[key];
}

function normalizeSettings(value: unknown): WorkbenchSettings {
  const candidate = typeof value === "object" && value ? value as WorkbenchSettingsPatch : {};
  return Object.fromEntries(
    (Object.keys(settingsDefaults) as SettingKey[])
      .map((key) => [key, normalizeSetting(key, candidate[key])])
  ) as WorkbenchSettings;
}

export function readSettings(storage = browserStorage()): WorkbenchSettings {
  if (!storage) return settingsDefaults;
  const raw = migrateStorageValue(storage, SETTINGS_STORAGE_KEY, LEGACY_SETTINGS_STORAGE_KEY);
  if (!raw) return settingsDefaults;
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return settingsDefaults;
  }
}

export function writeSettings(patch: WorkbenchSettingsPatch, storage = browserStorage()): WorkbenchSettings {
  const nextSettings = normalizeSettings({ ...readSettings(storage), ...patch });
  storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
  return nextSettings;
}

export function readSetting<Key extends SettingKey>(key: Key, storage = browserStorage()): WorkbenchSettings[Key] {
  return readSettings(storage)[key];
}

export function readRuntimeProfile(storage = browserStorage()): RuntimeProfileSetting {
  return readSetting("runtimeProfile", storage);
}

export function normalizeRuntimeProfile(value: unknown): RuntimeProfileSetting {
  return normalizeSetting("runtimeProfile", value);
}

export function writeSetting<Key extends SettingKey>(
  key: Key,
  value: WorkbenchSettings[Key],
  storage = browserStorage()
): WorkbenchSettings {
  return writeSettings({ [key]: value } as WorkbenchSettingsPatch, storage);
}

export function readAdditionalConversationInstructions(storage = browserStorage()): string {
  const value = storage?.getItem(ADDITIONAL_CONVERSATION_INSTRUCTIONS_KEY) ?? "";
  return new TextEncoder().encode(value).byteLength <= MAX_ADDITIONAL_CONVERSATION_INSTRUCTIONS_BYTES ? value : "";
}

export function writeAdditionalConversationInstructions(
  value: string,
  storage = browserStorage()
): string {
  const normalized = value.trim();
  if (new TextEncoder().encode(normalized).byteLength > MAX_ADDITIONAL_CONVERSATION_INSTRUCTIONS_BYTES) {
    throw new Error("Additional conversation instructions exceed 64 KiB");
  }
  storage?.setItem(ADDITIONAL_CONVERSATION_INSTRUCTIONS_KEY, normalized);
  return normalized;
}
