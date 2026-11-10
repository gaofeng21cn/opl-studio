import { parseLocalCalendar, resolveLocalInstant } from "@deepseek-ai/dsh-util-time";
import type { ScheduleCatalogEntry as DshScheduleCatalogEntry, ScheduleId } from "@deepseek-ai/dsh-schedule/client";

export type OplSchedule =
  | { kind: "once"; at: string; timeZone: string }
  | { kind: "interval"; minutes: number; timeZone: string }
  | { kind: "daily"; time: string; timeZone: string }
  | { kind: "weekly"; time: string; timeZone: string; weekdays: number[] };

export type OplScheduledTask = {
  id: string; title: string; prompt: string; cwd: string;
  permissions: ":read-only" | ":workspace"; timeoutMinutes: number;
  revision: number; schedule: OplSchedule; paused?: boolean;
  nextRuns?: (string | Date)[]; running?: unknown[];
  model?: string; reasoningEffort?: string;
};

export type ScheduleTiming = Record<string, any>;
export type ScheduleCatalogEntry = DshScheduleCatalogEntry;
export type TimingDraft = {
  frequency: string; interval: string; start: string; timeZone: string;
  weekdays: readonly number[]; dailyTime: string;
};

const validInstant = (value: unknown): value is string => typeof value === "string"
  && /(Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; }
  catch { return false; }
}
export function taskCatalogEntry(task: OplScheduledTask, observedAt = Date.now()): ScheduleCatalogEntry {
  const rule = task.schedule;
  const next = task.nextRuns?.[0];
  const scheduledAt = next instanceof Date ? next.toISOString() : validInstant(next) ? next
    : rule.kind === "once" ? rule.at : new Date(0).toISOString();
  const common = {
    id: task.id as ScheduleId, title: task.title, prompt: task.prompt, scheduledAt,
    target: { kind: "new" as const, create: { cwd: task.cwd } }, involvedSessionIds: [],
    status: task.paused ? "paused" as const : rule.kind === "once" && task.nextRuns?.length === 0 ? "ended" as const : "active" as const,
    // An opaque CAS token maps to the owner revision; it is never a browser timestamp.
    updatedAt: `opl-revision:${task.revision}`,
    ...(task.running?.length ? { executionActive: true as const } : {})
  };
  // The upstream editor reads an optional zone on typed records, preserving the
  // owner's local-clock choice for one-shot and interval edits as well.
  if (rule.kind === "once") return { ...common, kind: "at", timeZone: rule.timeZone } as ScheduleCatalogEntry;
  if (rule.kind === "interval") return { ...common, kind: "every", everySeconds: rule.minutes * 60, timeZone: rule.timeZone } as ScheduleCatalogEntry;
  if (rule.kind === "daily") return { ...common, kind: "daily", time: `${rule.time}:00`, timeZone: rule.timeZone };
  return { ...common, kind: "weekly", time: `${rule.time}:00`, timeZone: rule.timeZone,
    weekdays: rule.weekdays.map(day => day === 0 ? 7 : day).sort((a, b) => a - b) };
}

/** Keep OPL's existing recurrence model; unsupported DSH choices never reach the owner. */
export function timingFromOplDraft(draft: TimingDraft): ScheduleTiming {
  if (draft.frequency === "once") return { kind: "at", at: { date: draft.start.slice(0, 10), time: draft.start.slice(11).length === 5 ? `${draft.start.slice(11)}:00` : draft.start.slice(11), time_zone: draft.timeZone } };
  if (draft.frequency === "minutely" || draft.frequency === "hourly") {
    const seconds = Number(draft.interval) * (draft.frequency === "hourly" ? 3600 : 60);
    return { kind: "every", every_seconds: seconds, time_zone: draft.timeZone };
  }
  if (draft.frequency === "daily") return { kind: "daily", daily: { time: `${draft.dailyTime}:00`, time_zone: draft.timeZone } };
  if (draft.frequency === "weekly") return { kind: "weekly", weekly: { time: draft.start.slice(11).length === 5 ? `${draft.start.slice(11)}:00` : draft.start.slice(11), time_zone: draft.timeZone, weekdays: [...draft.weekdays] } };
  throw new Error("Unsupported OPL recurrence.");
}

export function oplScheduleFromTiming(timing: ScheduleTiming, prior?: OplSchedule): OplSchedule {
  if (timing.kind === "at") {
    if (typeof timing.at === "string") {
      if (!validInstant(timing.at)) throw Error("Invalid task time.");
      return { kind: "once", at: new Date(timing.at).toISOString(), timeZone: prior?.timeZone ?? "UTC" };
    }
    const { date, time, time_zone: timeZone } = timing.at ?? {};
    if (!validTimeZone(timeZone) || typeof date !== "string" || typeof time !== "string") throw Error("Invalid task time zone.");
    const parsed = parseLocalCalendar(date, time);
    if (parsed.kind !== "accepted") throw Error("Invalid task time.");
    const instant = resolveLocalInstant(parsed.time, timeZone);
    if (instant === undefined) throw Error("Invalid task time zone.");
    return { kind: "once", at: new Date(instant).toISOString(), timeZone };
  }
  if (timing.kind === "every") {
    const minutes = timing.every_seconds / 60;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 525600) throw Error("Invalid task interval.");
    const timeZone = timing.time_zone ?? prior?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!validTimeZone(timeZone)) throw Error("Invalid task time zone.");
    return { kind: "interval", minutes, timeZone };
  }
  const fields = timing.kind === "daily" ? timing.daily : timing.kind === "weekly" ? timing.weekly : undefined;
  if (!fields || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/.test(fields.time) || !validTimeZone(fields.time_zone)) throw Error("Unsupported task timing.");
  if (timing.kind === "daily") return { kind: "daily", time: fields.time.slice(0, 5), timeZone: fields.time_zone };
  if (!Array.isArray(fields.weekdays) || !fields.weekdays.length || fields.weekdays.some((day: unknown) => !Number.isInteger(day) || Number(day) < 1 || Number(day) > 7)) throw Error("Invalid task weekdays.");
  return { kind: "weekly", time: fields.time.slice(0, 5), timeZone: fields.time_zone,
    weekdays: fields.weekdays.map((day: number) => day === 7 ? 0 : day).sort((a: number, b: number) => a - b) };
}

export function taskOwnerValues(task?: OplScheduledTask): Readonly<Record<string, unknown>> {
  return { permissions: task?.permissions ?? ":read-only", timeoutMinutes: task?.timeoutMinutes ?? 30 };
}

export function validTaskOwnerValues(values: Readonly<Record<string, unknown>>): boolean {
  return (values.permissions === ":read-only" || values.permissions === ":workspace")
    && Number.isInteger(values.timeoutMinutes) && Number(values.timeoutMinutes) >= 1 && Number(values.timeoutMinutes) <= 120;
}

export function applyScheduleEdit(task: OplScheduledTask, request: Record<string, any>, ownerValues = taskOwnerValues(task)): OplScheduledTask {
  if (request.expectedUpdatedAt !== undefined && request.expectedUpdatedAt !== `opl-revision:${task.revision}`) throw Error("Task changed.");
  const patch = request.patch ?? {};
  if (patch.target !== undefined && patch.target.kind !== "new") throw Error("OPL tasks require a new canonical thread per run.");
  if (!validTaskOwnerValues(ownerValues)) throw Error("Invalid permissions or timeout.");
  return { ...task, title: patch.title ?? task.title, prompt: patch.prompt ?? task.prompt,
    cwd: patch.target?.create?.cwd ?? task.cwd,
    schedule: patch.timing ? oplScheduleFromTiming(patch.timing, task.schedule) : task.schedule,
    permissions: ownerValues.permissions as OplScheduledTask["permissions"], timeoutMinutes: Number(ownerValues.timeoutMinutes) };
}
