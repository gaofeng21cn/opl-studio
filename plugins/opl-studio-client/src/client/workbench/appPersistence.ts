import { migrateStorageValue } from "./settingsModel";

const legacyChatSessionsStorageKey = "opl.nativeWorkbench.chatSessions.v1";
const legacyChatSessionsBackupKey = "opl.studio.chatSessions.legacyReadOnlyBackup.v1";
const legacyChatSessionsBackupStorageKey = "opl.nativeWorkbench.chatSessions.legacyReadOnlyBackup.v1";
const uiMetadataStorageKey = "opl_ui_metadata.v1";
const legacyStudioUiMetadataStorageKey = "opl.studio.uiMetadata.v2";
const legacyUiMetadataStorageKey = "opl.nativeWorkbench.uiMetadata.v2";
const draftStorageKey = "opl.studio.drafts.v2";
const legacyDraftStorageKey = "opl.nativeWorkbench.drafts.v2";
const defaultSidebarWidth = 236;
const minimumSidebarWidth = 200;
const maximumSidebarWidth = 420;

type ThreadScope = "current" | "all" | "archived";

export type WorkbenchUiMetadata = {
  schema: "opl_ui_metadata.v1";
  selectedProjectId?: string;
  selectedThreadId?: string;
  threadAffinityById: Record<string, string>;
  workspaceLabels: Record<string, string>;
  hiddenWorkspaceIds: string[];
  workspaceOrder: string[];
  threadOrderByProject: Record<string, string[]>;
  pinnedThreadIds: string[];
  threadScope: ThreadScope;
  sidebarWidth: number;
  recentWorkspace?: string;
  theme?: string;
  language?: "zh" | "en";
  layout?: "default";
};

export type WorkbenchDrafts = {
  recovered?: Record<string, string>;
  prompts: Record<string, string>;
};

function sessionStorage() {
  return globalThis.localStorage;
}

function clampSidebarWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultSidebarWidth;
  return Math.min(maximumSidebarWidth, Math.max(minimumSidebarWidth, Math.round(value)));
}

export function readPersistedWorkbenchUi(): { metadata: WorkbenchUiMetadata; drafts: WorkbenchDrafts } {
  const storage = sessionStorage();
  const fallback = {
    metadata: {
      schema: "opl_ui_metadata.v1" as const,
      threadAffinityById: {},
      workspaceLabels: {},
      hiddenWorkspaceIds: [],
      workspaceOrder: [],
      threadOrderByProject: {},
      pinnedThreadIds: [],
      threadScope: "all" as const,
      sidebarWidth: defaultSidebarWidth,
      layout: "default" as const
    },
    drafts: { prompts: {} }
  };
  if (!storage) return fallback;
  try {
    const migratedMetadata = migrateStorageValue(storage, uiMetadataStorageKey, legacyStudioUiMetadataStorageKey)
      ?? migrateStorageValue(storage, uiMetadataStorageKey, legacyUiMetadataStorageKey);
    const metadata = JSON.parse(migratedMetadata ?? "null") as Partial<WorkbenchUiMetadata> | null;
    const drafts = JSON.parse(migrateStorageValue(storage, draftStorageKey, legacyDraftStorageKey) ?? "null") as Partial<WorkbenchDrafts> | null;
    migrateStorageValue(storage, legacyChatSessionsBackupKey, legacyChatSessionsBackupStorageKey);
    const legacy = storage.getItem(legacyChatSessionsStorageKey);
    let selectedThreadId = typeof metadata?.selectedThreadId === "string" ? metadata.selectedThreadId : undefined;
    if (legacy) {
      if (!storage.getItem(legacyChatSessionsBackupKey)) storage.setItem(legacyChatSessionsBackupKey, legacy);
      if (!selectedThreadId) {
        const legacyRows = JSON.parse(legacy) as unknown;
        const first = Array.isArray(legacyRows) && legacyRows[0] && typeof legacyRows[0] === "object"
          ? legacyRows[0] as { threadId?: unknown }
          : null;
        selectedThreadId = typeof first?.threadId === "string" ? first.threadId : undefined;
      }
      storage.removeItem(legacyChatSessionsStorageKey);
    }
    return {
      metadata: {
        schema: "opl_ui_metadata.v1",
        selectedProjectId: typeof metadata?.selectedProjectId === "string" ? metadata.selectedProjectId : undefined,
        selectedThreadId,
        threadAffinityById: metadata?.threadAffinityById && typeof metadata.threadAffinityById === "object" ? metadata.threadAffinityById as Record<string, string> : {},
        workspaceLabels: metadata?.workspaceLabels && typeof metadata.workspaceLabels === "object" ? metadata.workspaceLabels as Record<string, string> : {},
        hiddenWorkspaceIds: Array.isArray(metadata?.hiddenWorkspaceIds) ? metadata.hiddenWorkspaceIds.filter((item): item is string => typeof item === "string") : [],
        workspaceOrder: Array.isArray(metadata?.workspaceOrder) ? metadata.workspaceOrder.filter((item): item is string => typeof item === "string") : [],
        threadOrderByProject: metadata?.threadOrderByProject && typeof metadata.threadOrderByProject === "object" ? metadata.threadOrderByProject as Record<string, string[]> : {},
        pinnedThreadIds: Array.isArray(metadata?.pinnedThreadIds) ? metadata.pinnedThreadIds.filter((item): item is string => typeof item === "string") : [],
        threadScope: metadata?.threadScope === "archived" ? "archived" : "all",
        sidebarWidth: clampSidebarWidth(metadata?.sidebarWidth),
        recentWorkspace: typeof metadata?.recentWorkspace === "string" ? metadata.recentWorkspace : undefined,
        theme: typeof metadata?.theme === "string" ? metadata.theme : undefined,
        language: metadata?.language === "en" ? "en" : metadata?.language === "zh" ? "zh" : undefined,
        layout: "default"
      },
      drafts: {
        prompts: drafts?.prompts && typeof drafts.prompts === "object" ? drafts.prompts : {},
        recovered: drafts?.recovered && typeof drafts.recovered === "object" ? drafts.recovered : {}
      }
    };
  } catch {
    return fallback;
  }
}

export function writeUiMetadata(metadata: WorkbenchUiMetadata) {
  sessionStorage()?.setItem(uiMetadataStorageKey, JSON.stringify(metadata));
}

export function writeDrafts(drafts: WorkbenchDrafts) {
  sessionStorage()?.setItem(draftStorageKey, JSON.stringify(drafts));
}
