import type { OplCommandReadback } from "@gaofeng21cn/opl-host-contracts";

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value ? value as Record<string, unknown> : null;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseJsonValue(value: string): unknown {
  const text = value.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createCommandReadback(
  command: string,
  commandArgs: string[],
  exitCode = 0,
  stdout = "",
  stderr = "",
  timedOut = false
): OplCommandReadback {
  return { command, commandArgs, exitCode, stdout, stderr, timedOut };
}
