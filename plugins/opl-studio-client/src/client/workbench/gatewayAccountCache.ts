import type { WorkbenchGatewayAccount } from "./workbenchModel";

export const GATEWAY_ACCOUNT_CACHE_KEY = "opl.app.gatewayAccount.lkg.v1";
const GATEWAY_ACCOUNT_CACHE_SCHEMA = "opl_gateway_account_cache.v1";

export type GatewayAccountCacheStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function browserStorage(): GatewayAccountCacheStorage | undefined {
  const storage = (globalThis as { localStorage?: GatewayAccountCacheStorage }).localStorage;
  return storage && typeof storage.getItem === "function" ? storage : undefined;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sanitizeGatewayAccount(value: unknown, stale: boolean): WorkbenchGatewayAccount | undefined {
  const source = record(value);
  const displayName = text(source?.displayName);
  const status = text(source?.status);
  const sourceRef = text(source?.sourceRef);
  if (!source || !displayName || !status || !sourceRef) return undefined;

  const balance = record(source.balance);
  const usage = record(source.usage);
  const managedKey = record(source.managedKey);
  const installation = record(source.installation);
  const freshness = record(source.freshness);
  const balanceAmount = number(balance?.amount);
  const balanceCurrency = text(balance?.currency);

  return {
    displayName,
    status,
    sourceRef,
    ...(text(source.email) ? { email: text(source.email) } : {}),
    ...(text(source.accountStatus) ? { accountStatus: text(source.accountStatus) } : {}),
    ...(balanceAmount !== undefined && balanceCurrency ? { balance: { amount: balanceAmount, currency: balanceCurrency } } : {}),
    ...(usage ? { usage: {
      ...(number(usage.todayTokens) !== undefined ? { todayTokens: number(usage.todayTokens) } : {}),
      ...(number(usage.totalTokens) !== undefined ? { totalTokens: number(usage.totalTokens) } : {}),
      ...(number(usage.todayCost) !== undefined ? { todayCost: number(usage.todayCost) } : {}),
      ...(number(usage.totalCost) !== undefined ? { totalCost: number(usage.totalCost) } : {}),
      ...(text(usage.currency) ? { currency: text(usage.currency) } : {}),
      ...(text(usage.timezone) ? { timezone: text(usage.timezone) } : {})
    } } : {}),
    ...(managedKey ? { managedKey: {
      ...(text(managedKey.name) ? { name: text(managedKey.name) } : {}),
      ...(text(managedKey.status) ? { status: text(managedKey.status) } : {})
    } } : {}),
    ...(installation ? { installation: {
      ...(text(installation.deviceLabel) ? { deviceLabel: text(installation.deviceLabel) } : {}),
      ...(text(installation.shortId) ? { shortId: text(installation.shortId) } : {})
    } } : {}),
    freshness: {
      ...(text(freshness?.observedAt) ? { observedAt: text(freshness?.observedAt) } : {}),
      stale,
      ...(text(freshness?.lastErrorCode) ? { lastErrorCode: text(freshness?.lastErrorCode) } : {})
    }
  };
}

export function readGatewayAccountCache(storage = browserStorage()): WorkbenchGatewayAccount | undefined {
  if (!storage) return undefined;
  try {
    const cached = record(JSON.parse(storage.getItem(GATEWAY_ACCOUNT_CACHE_KEY) ?? "null"));
    if (cached?.schema !== GATEWAY_ACCOUNT_CACHE_SCHEMA) return undefined;
    return sanitizeGatewayAccount(cached.account, true);
  } catch {
    return undefined;
  }
}

export function writeGatewayAccountCache(account: WorkbenchGatewayAccount | undefined, storage = browserStorage()): void {
  if (!storage) return;
  if (!account) {
    storage.removeItem(GATEWAY_ACCOUNT_CACHE_KEY);
    return;
  }
  const sanitized = sanitizeGatewayAccount(account, account.freshness?.stale === true);
  if (!sanitized) return;
  storage.setItem(GATEWAY_ACCOUNT_CACHE_KEY, JSON.stringify({
    schema: GATEWAY_ACCOUNT_CACHE_SCHEMA,
    account: sanitized
  }));
}

export function markGatewayAccountCacheStale(
  account: WorkbenchGatewayAccount,
  lastErrorCode = "state_refresh_failed"
): WorkbenchGatewayAccount {
  return {
    ...account,
    freshness: {
      ...account.freshness,
      stale: true,
      lastErrorCode
    }
  };
}
