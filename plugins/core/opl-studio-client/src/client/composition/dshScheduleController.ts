import { createCatalogSource } from "../integrations/deepseek-harness/scheduleComponents.mjs";
import type { ScheduleCreateRequest, ScheduleEditRequest } from "@deepseek-ai/dsh-schedule/client";
import {
  applyScheduleEdit, oplScheduleFromTiming, taskCatalogEntry, taskOwnerValues, validTaskOwnerValues,
} from "./dshScheduleAdapterModel";
import type { OplScheduledTask, ScheduleCatalogEntry } from "./dshScheduleAdapterModel";

export type DshScheduleClient = {
  read(operation: string, input?: Record<string, unknown>): Promise<any>;
  /** Resolves only after the owning App's preview, human decision, and execution. */
  execute?(operation: string, input: Record<string, unknown>, label: string): Promise<{ status: string; [key: string]: unknown }>;
};

type CreateFailure = "host.createError" | "host.notFuture" | "host.invalidRule";
type EditFailure = "host.saveError" | "host.conflict" | "host.notFuture" | "host.invalidRule" | "detail.missing";
type RunFailure = "host.runError" | "host.executionPending" | "detail.missing";
type OwnerValues = Readonly<Record<string, unknown>>;

class TaskInputError extends Error {
  constructor(readonly failure: "host.conflict" | "host.notFuture" | "host.invalidRule" | "detail.missing") { super(failure); }
}

class TaskActionError extends Error {
  constructor(readonly status: string) { super("The task action was not confirmed."); }
}

/** Reuse DSH's catalog lifecycle while Framework / Temporal owns every task. */
export function createDshScheduleController({ client, workspacePath, getCwd, id, requestId, now = Date.now }: {
  client: DshScheduleClient;
  workspacePath?: string;
  getCwd?: () => string;
  id?: () => string;
  requestId?: () => string;
  now?: () => number;
}) {
  let tasks = new Map<string, OplScheduledTask>();
  let requestedRead = 0;
  let acceptedRead = 0;
  const pendingCreates = new Map<string, OplScheduledTask>();
  // App receipt updates can request a refresh while a write is reading back.
  // Serialize controller-owned refreshes so a newer catalog request cannot
  // supersede the read that settles the write which just received its receipt.
  let refreshTail: Promise<void> = Promise.resolve();
  const nextId = id ?? (() => `task-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`);
  const nextRequestId = requestId ?? (() => crypto.randomUUID());

  const ownerTask = (taskId: string): OplScheduledTask | undefined => tasks.get(taskId);
  const catalog = createCatalogSource({
    list: async () => {
      const read = ++requestedRead;
      const result = await client.read("tasks");
      if (result?.status !== "available" || !Array.isArray(result.items)) throw Error("Scheduled tasks are unavailable.");
      const items = result.items as OplScheduledTask[];
      if (items.some(task => typeof task?.id !== "string" || !Number.isInteger(task.revision) || !task.schedule)) throw Error("Invalid owner task catalog.");
      // A slower list sent before the latest read must not replace its owner data.
      const readAt = Number.isFinite(Date.parse(result.readAt)) ? Date.parse(result.readAt) : now();
      const records = items.map(task => taskCatalogEntry(task, readAt));
      if (read === requestedRead && read > acceptedRead) { tasks = new Map(items.map(task => [task.id, task])); acceptedRead = read; }
      return { ok: true as const, value: records };
    },
    remove: async (taskId: string) => {
      try {
        const task = requireTask(taskId);
        await execute("task_delete", { id: task.id, revision: task.revision }, "Delete scheduled task");
        await refresh();
        if (ownerTask(task.id)) throw Error("Task deletion was not confirmed.");
        return { ok: true as const, value: { id: taskId, deleted: true as const } };
      } catch { return { ok: false as const, error: { code: "opl/task-delete-unconfirmed", details: {} } }; }
    },
    // The owner read is pull based. DSH still controls mount/unmount and retry;
    // successful writes explicitly request a read newer than every previous one.
    subscribeChanged: () => () => undefined,
    subscribeReset: () => () => undefined,
  });

  function refresh(): Promise<void> {
    const run = refreshTail.then(async () => {
      let since = catalog.hooks.catalog.getSnapshot().readRequest;
      await catalog.onRetry(since);
      let current = catalog.hooks.catalog.getSnapshot();
      // A non-controller catalog subscriber may still have superseded this
      // request. Retry the read once from the newest ordinal before declaring
      // the owner readback unavailable.
      if (current.status === "loading" && current.readRequest > since + 1) {
        since = current.readRequest;
        await catalog.onRetry(since);
        current = catalog.hooks.catalog.getSnapshot();
      }
      if (current.status !== "ready" || current.readSettled <= since) throw Error("The owner task readback failed.");
    });
    refreshTail = run.catch(() => undefined);
    return run;
  }

  function requireTask(taskId: string): OplScheduledTask {
    const task = ownerTask(taskId);
    if (!task) throw new TaskInputError("detail.missing");
    return task;
  }

  async function execute(operation: string, input: Record<string, unknown>, label: string): Promise<void> {
    if (!client.execute) throw Error("Task actions are unavailable.");
    const receipt = await client.execute(operation, { ...input, requestId: nextRequestId() }, label);
    if (receipt?.status !== "executed" && receipt?.status !== "no_op") throw new TaskActionError(receipt?.status ?? "unknown");
  }

  function validate(task: OplScheduledTask, checkFuture: boolean): void {
    if (!/^[a-z0-9-]{1,64}$/.test(task.id) || !task.title.trim() || task.title.length > 160
      || !task.prompt.trim() || task.prompt.length > 32_000 || !task.cwd.startsWith("/")
      || !validTaskOwnerValues(taskOwnerValues(task))) throw new TaskInputError("host.invalidRule");
    if (checkFuture && task.schedule.kind === "once" && Date.parse(task.schedule.at) <= now()) throw new TaskInputError("host.notFuture");
  }

  function definition(task: OplScheduledTask): Record<string, unknown> {
    return { id: task.id, title: task.title, prompt: task.prompt, cwd: task.cwd, permissions: task.permissions,
      timeoutMinutes: task.timeoutMinutes, revision: task.revision, schedule: task.schedule,
      ...(task.model === undefined ? {} : { model: task.model }),
      ...(task.reasoningEffort === undefined ? {} : { reasoningEffort: task.reasoningEffort }) };
  }

  function sameDefinition(actual: OplScheduledTask, expected: OplScheduledTask): boolean {
    const { revision: _actual, ...a } = definition(actual);
    const { revision: _expected, ...b } = definition(expected);
    const schedule = (task: OplScheduledTask) => task.schedule.kind === "weekly"
      ? { kind: task.schedule.kind, time: task.schedule.time, timeZone: task.schedule.timeZone, weekdays: [...task.schedule.weekdays].sort((x, y) => x - y) }
      : task.schedule.kind === "daily" ? { kind: task.schedule.kind, time: task.schedule.time, timeZone: task.schedule.timeZone }
      : task.schedule.kind === "interval" ? { kind: task.schedule.kind, minutes: task.schedule.minutes, timeZone: task.schedule.timeZone }
      : { kind: task.schedule.kind, at: Date.parse(task.schedule.at), timeZone: task.schedule.timeZone };
    return JSON.stringify({ ...a, schedule: schedule(actual) }) === JSON.stringify({ ...b, schedule: schedule(expected) });
  }

  function createFingerprint(task: OplScheduledTask): string {
    const definitionWithoutIdentity = { ...definition(task), id: "", revision: 0 };
    return JSON.stringify(definitionWithoutIdentity);
  }

  async function recoverPendingCreate(key: string, expected: OplScheduledTask): Promise<OplScheduledTask | null> {
    await refresh();
    const found = ownerTask(expected.id);
    if (!found) return null;
    if (found.revision < 1 || !sameDefinition(found, expected)) throw Error("The task identity now belongs to a different owner definition.");
    pendingCreates.delete(key);
    catalog.retainCreated(taskCatalogEntry(found, now()));
    return found;
  }

  async function create(request: ScheduleCreateRequest, values: OwnerValues = taskOwnerValues()): Promise<{ created: ScheduleCatalogEntry } | { failed: CreateFailure }> {
    let task: OplScheduledTask;
    let key = "";
    try {
      if (request.target?.kind !== "new" || !validTaskOwnerValues(values)) throw new TaskInputError("host.invalidRule");
      task = { id: nextId(), title: request.title.trim(), prompt: request.prompt,
        cwd: request.target.create?.cwd ?? getCwd?.() ?? workspacePath ?? "",
        permissions: values.permissions as OplScheduledTask["permissions"], timeoutMinutes: Number(values.timeoutMinutes),
        revision: 0, schedule: oplScheduleFromTiming(request.timing) };
      key = createFingerprint(task);
      const pending = pendingCreates.get(key);
      if (pending) {
        const recovered = await recoverPendingCreate(key, pending).catch(() => undefined);
        if (recovered === undefined) return { failed: "host.createError" };
        if (recovered !== null) return { created: taskCatalogEntry(recovered, now()) };
        // A user-requested retry may resubmit only after fresh owner absence,
        // reusing the task id which the owner already treats idempotently.
        task = { ...task, id: pending.id };
      }
      validate(task, true);
    } catch (error) { return { failed: error instanceof TaskInputError && error.failure === "host.notFuture" ? error.failure : "host.invalidRule" }; }
    // Keep the attempt identity before awaiting a transport or user decision.
    // An unknown result is reconciled by this id on retry, never sent as a new task.
    pendingCreates.set(key, task);
    try {
      await execute("task_create", definition(task), "Create scheduled task");
      await refresh();
      const created = ownerTask(task.id);
      if (!created || created.revision < 1 || !sameDefinition(created, task)) throw Error("Task creation was not confirmed.");
      pendingCreates.delete(key);
      return { created: taskCatalogEntry(created, now()) };
    } catch (error) {
      if (error instanceof TaskActionError && error.status === "cancelled") pendingCreates.delete(key);
      return { failed: "host.createError" };
    }
  }

  async function edit(request: ScheduleEditRequest, values?: OwnerValues): Promise<"saved" | { failed: EditFailure }> {
    let previous: OplScheduledTask;
    let next: OplScheduledTask;
    let operation = "task_update";
    try {
      previous = requireTask(request.id);
      if (request.expectedUpdatedAt !== undefined && request.expectedUpdatedAt !== `opl-revision:${previous.revision}`) throw new TaskInputError("host.conflict");
      if (request.action !== "update") throw new TaskInputError("host.invalidRule");
      const patch = request.patch;
      if (patch.active !== undefined) {
        if (typeof patch.active !== "boolean" || Object.keys(patch).some(key => key !== "active")
          || values !== undefined && JSON.stringify(values) !== JSON.stringify(taskOwnerValues(previous))) throw new TaskInputError("host.invalidRule");
        next = { ...previous, paused: !patch.active };
        operation = patch.active ? "task_resume" : "task_pause";
      } else next = applyScheduleEdit(previous, request, values ?? taskOwnerValues(previous));
      // Content-only edits retain an expired one-shot rule; the owner remains
      // responsible for deciding whether that stored rule may be changed.
      validate(next, patch.timing !== undefined);
    } catch (error) { return { failed: error instanceof TaskInputError ? error.failure : "host.invalidRule" }; }
    try {
      await execute(operation, operation === "task_update" ? definition(next) : { id: previous.id, revision: previous.revision }, "Save scheduled task");
      await refresh();
      const saved = ownerTask(previous.id);
      if (!saved || saved.revision <= previous.revision || !sameDefinition(saved, next)
        || Boolean(saved.paused) !== Boolean(next.paused)) throw Error("Task update was not confirmed.");
      return "saved";
    } catch { return { failed: "host.saveError" }; }
  }

  async function run(taskId: string): Promise<"queued" | { failed: RunFailure }> {
    const task = ownerTask(taskId);
    if (!task) return { failed: "detail.missing" };
    if (task.running?.length) return { failed: "host.executionPending" };
    try {
      await execute("task_run", { id: task.id, revision: task.revision }, "Run scheduled task");
      await refresh();
      if (!ownerTask(task.id)) throw Error("Task run target is unavailable.");
      // This acknowledges only the owner's run request. Execution and canonical
      // thread/turn results are displayed separately from Temporal history.
      return "queued";
    } catch { return { failed: "host.runError" }; }
  }

  const onCreateTask = (request: ScheduleCreateRequest, values?: OwnerValues) => create(request, values);
  const hostActions = {
    edit: (request: ScheduleEditRequest, values?: OwnerValues) => edit(request, values),
    run,
    loadNewSessionInterval: async () => undefined,
  };
  return { catalog, ownerTask, create, edit, run, refresh, onRetry: refresh, onDelete: catalog.onDelete, onCreateTask, hostActions };
}
