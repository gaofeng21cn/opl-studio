import type { WorkbenchModel } from "./workbenchModel";

export const RUNTIME_OVERVIEW_CACHE_KEY = "opl.studio.runtime-overview.lkg.v1";
const RUNTIME_OVERVIEW_CACHE_SCHEMA = "opl_studio_runtime_overview_cache.v1";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

export type RuntimeOverviewCacheEntry = {
  model: Pick<WorkbenchModel, "runtimeOverview" | "serviceRecovery" | "workItemRuntime" | "stateGeneratedAt">;
  cachedAt: string;
};

function browserStorage(): StorageLike | undefined {
  const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
  return storage && typeof storage.getItem === "function" ? storage : undefined;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isCacheModel(value: unknown): value is RuntimeOverviewCacheEntry["model"] {
  const model = record(value);
  return Boolean(model && (model.runtimeOverview || model.workItemRuntime || model.serviceRecovery));
}

export function readRuntimeOverviewCache(storage = browserStorage()): RuntimeOverviewCacheEntry | undefined {
  if (!storage) return undefined;
  try {
    const payload = record(JSON.parse(storage.getItem(RUNTIME_OVERVIEW_CACHE_KEY) ?? "null"));
    if (payload?.schema !== RUNTIME_OVERVIEW_CACHE_SCHEMA || !isCacheModel(payload.model)) return undefined;
    const cachedAt = typeof payload.cachedAt === "string" ? payload.cachedAt : undefined;
    if (!cachedAt || Number.isNaN(Date.parse(cachedAt))) return undefined;
    return { model: payload.model, cachedAt };
  } catch {
    return undefined;
  }
}

function readOnlySnapshot(model: RuntimeOverviewCacheEntry["model"]): RuntimeOverviewCacheEntry["model"] {
  return {
    ...model,
    ...(model.runtimeOverview ? {
      runtimeOverview: {
        ...model.runtimeOverview,
        maintenanceActions: [],
        recommendedActionId: undefined
      }
    } : {}),
    ...(model.serviceRecovery ? {
      serviceRecovery: {
        ...model.serviceRecovery,
        primaryAction: null,
        primaryActionBlockedReason: "cached_snapshot_requires_fresh_state",
        freshRecheck: { ...model.serviceRecovery.freshRecheck, beforeMutation: true }
      }
    } : {})
  };
}

export function writeRuntimeOverviewCache(model: RuntimeOverviewCacheEntry["model"], storage = browserStorage()): void {
  if (!storage || !isCacheModel(model)) return;
  try {
    storage.setItem(RUNTIME_OVERVIEW_CACHE_KEY, JSON.stringify({
      schema: RUNTIME_OVERVIEW_CACHE_SCHEMA,
      cachedAt: new Date().toISOString(),
      model: readOnlySnapshot(model)
    }));
  } catch {
    // A full or unavailable browser store must not block the live readback.
  }
}

export function runtimeOverviewModelFromCache(entry: RuntimeOverviewCacheEntry | undefined): Partial<WorkbenchModel> | undefined {
  return entry?.model;
}
