import { expect, test } from "bun:test";
import {
  GATEWAY_ACCOUNT_CACHE_KEY,
  markGatewayAccountCacheStale,
  readGatewayAccountCache,
  writeGatewayAccountCache
} from "../../plugins/core/opl-studio-client/src/client/workbench/gatewayAccountCache.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values
  };
}

test("Gateway LKG cache persists only the public account read model and loads it stale", () => {
  const storage = memoryStorage();
  writeGatewayAccountCache({
    displayName: "OPL User",
    email: "opl@example.com",
    status: "connected",
    accountStatus: "active",
    balance: { amount: 128.4, currency: "CNY" },
    usage: { todayTokens: 32000, totalCost: 42.18, currency: "CNY" },
    managedKey: { name: "OPL App", status: "active" },
    installation: { deviceLabel: "Test Mac", shortId: "abcd" },
    freshness: { observedAt: "2026-08-15T00:00:00Z", stale: false },
    sourceRef: "app_state.app_settings.opl_gateway_account",
    password: "must-not-persist",
    apiKey: "must-not-persist",
    receipt: { private: true }
  } as never, storage);

  const serialized = storage.values.get(GATEWAY_ACCOUNT_CACHE_KEY) ?? "";
  expect(serialized).not.toContain("must-not-persist");
  expect(serialized).not.toContain("receipt");
  expect(readGatewayAccountCache(storage)).toMatchObject({
    displayName: "OPL User",
    status: "connected",
    freshness: { stale: true }
  });
});

test("Gateway LKG cache marks refresh failures and clears on a fresh disconnected read", () => {
  const storage = memoryStorage();
  const cached = {
    displayName: "OPL User",
    status: "connected",
    sourceRef: "app_state.app_settings.opl_gateway_account"
  };
  writeGatewayAccountCache(cached, storage);
  expect(markGatewayAccountCacheStale(cached).freshness).toEqual({
    stale: true,
    lastErrorCode: "state_refresh_failed"
  });
  writeGatewayAccountCache(undefined, storage);
  expect(storage.values.has(GATEWAY_ACCOUNT_CACHE_KEY)).toBe(false);
});
