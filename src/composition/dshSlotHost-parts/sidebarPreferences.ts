import { createPanelPins } from "../../vendor/deepseek-harness/packages/client/ui-sidebar/src/client/panel-pins";

declare global { var __OPL_SIDEBAR_DEFAULT_PINS__: readonly string[] | undefined; }

const STORAGE_KEY = "opl.sidebar.panel-pins.v1";
type StoragePort = Pick<Storage, "getItem" | "setItem">;

/** App preferences wrap the official pin store; registered slots remain the navigation authority. */
export function createSidebarPanelPins(ids: readonly string[], defaults: readonly string[], storage?: StoragePort) {
  if (!storage) { try { storage = globalThis.localStorage; } catch {} }
  let choices: Record<string, boolean> = {};
  try {
    const value = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) choices = Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean>;
  } catch {}
  const pins = createPanelPins();
  const known = new Set<string>();
  const reconcile = (registered: readonly string[]) => {
    for (const id of registered) {
      if (known.has(id)) continue;
      known.add(id);
      pins.setPinned(id, Object.hasOwn(choices, id) ? choices[id] : defaults.includes(id));
    }
  };
  reconcile(ids);
  return {
    unpinned: pins.unpinned, reconcile,
    setPinned(id: string, pinned: boolean) {
      pins.setPinned(id, pinned);
      choices[id] = pinned;
      try { storage?.setItem(STORAGE_KEY, JSON.stringify(choices)); } catch {}
    },
  };
}
