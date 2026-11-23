export type OplContributionInput = Record<string, unknown>;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function asStableId(value: unknown): string | null {
  const normalized = asString(value);
  return normalized
    && normalized.length <= 128
    && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(normalized)
    ? normalized
    : null;
}

export function hasOnlyKeys(record: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}
