import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNTIME_OVERVIEW_CACHE_KEY,
  readRuntimeOverviewCache,
  runtimeOverviewModelFromCache,
  writeRuntimeOverviewCache
} from "../../plugins/core/opl-studio-client/src/client/workbench/runtimeOverviewCache.ts";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
}

const model = {
  runtimeOverview: { runway: { status: "degraded", scheduleRunner: { running: true, tickIntervalMs: 5000 } }, maintenanceActions: [{ actionId: "settings_check_app_update" }], recommendedActionId: "settings_check_app_update" },
  serviceRecovery: { status: "degraded", scheduleRunnerStatus: "running", detail: { en: "Runway is degraded" } },
  workItemRuntime: { schemaVersion: "work-item-projection.v2", summary: { runningCount: 0 } },
  stateGeneratedAt: "2026-08-18T06:00:00.000Z"
} as never;

test("runtime overview cache round-trips the derived model snapshot", () => {
  const store = storage();
  writeRuntimeOverviewCache(model, store);
  const entry = readRuntimeOverviewCache(store);
  assert.ok(entry);
  assert.equal(entry.model.stateGeneratedAt, model.stateGeneratedAt);
  const cached = runtimeOverviewModelFromCache(entry);
  assert.equal(cached?.runtimeOverview?.maintenanceActions.length, 0);
  assert.equal(cached?.runtimeOverview?.recommendedActionId, undefined);
  assert.equal(cached?.serviceRecovery?.status, "degraded");
  assert.equal(cached?.serviceRecovery?.scheduleRunnerStatus, "running");
  assert.match(store.getItem(RUNTIME_OVERVIEW_CACHE_KEY) ?? "", /opl_studio_runtime_overview_cache\.v2/);
});

test("runtime overview cache rejects malformed or empty snapshots", () => {
  const store = storage();
  store.setItem(RUNTIME_OVERVIEW_CACHE_KEY, JSON.stringify({ schema: "wrong", cachedAt: new Date().toISOString(), model }));
  assert.equal(readRuntimeOverviewCache(store), undefined);
  store.setItem(RUNTIME_OVERVIEW_CACHE_KEY, JSON.stringify({ schema: "opl_studio_runtime_overview_cache.v2", cachedAt: new Date().toISOString(), model: {} }));
  assert.equal(readRuntimeOverviewCache(store), undefined);
});
