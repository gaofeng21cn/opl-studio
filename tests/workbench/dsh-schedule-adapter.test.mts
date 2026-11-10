import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ScheduleCreateRequest, ScheduleEditRequest, ScheduleId } from "@deepseek-ai/dsh-schedule/client";
import { createDshScheduleController } from "../../src/composition/dshScheduleController.ts";
import type { DshScheduleClient } from "../../src/composition/dshScheduleController.ts";
import {
  applyScheduleEdit, oplScheduleFromTiming, taskCatalogEntry, taskOwnerValues, timingFromOplDraft, validTaskOwnerValues,
} from "../../src/composition/dshScheduleAdapterModel.ts";
import type { OplScheduledTask } from "../../src/composition/dshScheduleAdapterModel.ts";

const NOW = Date.parse("2030-01-01T00:00:00Z");
const baseTask = (overrides: Partial<OplScheduledTask> = {}): OplScheduledTask => ({
  id: "existing", title: "Task", prompt: "Read the workspace", cwd: "/workspace", permissions: ":workspace", timeoutMinutes: 75,
  revision: 4, schedule: { kind: "weekly", time: "18:30", timeZone: "Asia/Shanghai", weekdays: [0, 2] },
  nextRuns: ["2030-01-06T10:30:00Z"], model: "model-from-owner", reasoningEffort: "high", ...overrides,
});
const createRequest = (): ScheduleCreateRequest => ({ title: "Create me", prompt: "Read the project", target: { kind: "new", create: { cwd: "/workspace" } },
  timing: { kind: "at", at: { date: "2030-01-02", time: "10:23:45", time_zone: "Asia/Shanghai" } } });
const update = (patch: Record<string, any> = { title: "Changed" }): ScheduleEditRequest => ({
  id: "existing" as ScheduleId, action: "update", patch, expectedUpdatedAt: "opl-revision:4",
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(predicate(), true, "expected async operation to reach the observable boundary");
}

function fixture(initial: OplScheduledTask[] = []) {
  let items = structuredClone(initial);
  let status = "executed";
  let apply = true;
  let failRead = false;
  const calls: { operation: string; input: Record<string, unknown>; label: string }[] = [];
  const reads: string[] = [];
  const readBarriers: ReturnType<typeof deferred<any>>[] = [];
  let executeBarrier: ReturnType<typeof deferred<{ status: string }>> | undefined;
  const client: DshScheduleClient = {
    read: async operation => {
      reads.push(operation);
      const barrier = readBarriers.shift();
      if (barrier) await barrier.promise;
      if (failRead) throw Error("owner read unavailable");
      return { status: "available", items: structuredClone(items) };
    },
    execute: async (operation, input, label) => {
      calls.push({ operation, input: structuredClone(input), label });
      const receipt = executeBarrier ? await executeBarrier.promise : { status };
      if (apply && ["executed", "no_op"].includes(receipt.status)) {
        const previous = items.find(task => task.id === input.id);
        if (operation === "task_create") items.push({ ...(input as unknown as OplScheduledTask), revision: 1 });
        if (operation === "task_update") items = items.map(task => task.id === input.id ? { ...(input as unknown as OplScheduledTask), paused: task.paused, revision: task.revision + 1 } : task);
        if (operation === "task_pause" || operation === "task_resume") items = items.map(task => task.id === input.id ? { ...task, paused: operation === "task_pause", revision: task.revision + 1 } : task);
        if (operation === "task_delete") items = items.filter(task => task.id !== input.id);
        assert.ok(operation === "task_create" || previous, "owner action must address an existing task");
      }
      return receipt;
    },
  };
  let generatedRequestIds = 0;
  const controller = createDshScheduleController({ client, workspacePath: "/fallback", id: () => "new-task",
    requestId: () => `request-${++generatedRequestIds}`, now: () => NOW });
  return { client, controller, calls, reads,
    setStatus(value: string) { status = value; }, setApply(value: boolean) { apply = value; },
    setFailRead(value: boolean) { failRead = value; },
    setItems(value: OplScheduledTask[]) { items = structuredClone(value); },
    deferExecute() { executeBarrier = deferred<{ status: string }>(); return executeBarrier; },
    deferRead() { const barrier = deferred<any>(); readBarriers.push(barrier); return barrier; },
  };
}

describe("DSH schedule model adapter", () => {
  test("preserves the one-shot instant, zone, and seconds through the official draft", () => {
    const timing = timingFromOplDraft({ frequency: "once", interval: "1", start: "2030-01-02T10:23:45", timeZone: "Asia/Shanghai", weekdays: [], dailyTime: "10:23" });
    assert.deepEqual(oplScheduleFromTiming(timing), { kind: "once", at: "2030-01-02T02:23:45.000Z", timeZone: "Asia/Shanghai" });
    const entry = taskCatalogEntry(baseTask({ schedule: oplScheduleFromTiming(timing), nextRuns: ["2030-01-02T02:23:45.000Z"] }));
    assert.equal(entry.scheduledAt, "2030-01-02T02:23:45.000Z");
    assert.equal((entry as any).timeZone, "Asia/Shanghai");
    assert.equal("lastDelivery" in entry, false, "Temporal executions are not DSH inbox deliveries");
    assert.deepEqual(oplScheduleFromTiming({ kind: "at", at: entry.scheduledAt }, { kind: "once", at: entry.scheduledAt, timeZone: "Asia/Shanghai" }),
      { kind: "once", at: "2030-01-02T02:23:45.000Z", timeZone: "Asia/Shanghai" });
  });

  test("converts OPL Sunday zero only at the owner boundary; official draft weekdays stay ISO", () => {
    const entry = taskCatalogEntry(baseTask());
    assert.deepEqual((entry as any).weekdays, [2, 7]);
    const timing = timingFromOplDraft({ frequency: "weekly", interval: "1", start: "2030-01-06T18:30:00", timeZone: "Asia/Shanghai", weekdays: [2, 7], dailyTime: "18:30" });
    assert.deepEqual(timing.weekly.weekdays, [2, 7]);
    assert.deepEqual(oplScheduleFromTiming(timing), { kind: "weekly", time: "18:30", timeZone: "Asia/Shanghai", weekdays: [0, 2] });
  });

  test("keeps a 90 minute recurrence and all private owner execution fields on content edits", () => {
    const task = baseTask({ schedule: { kind: "interval", minutes: 90, timeZone: "Asia/Shanghai" } });
    assert.equal((taskCatalogEntry(task) as any).everySeconds, 5400);
    assert.deepEqual(oplScheduleFromTiming({ kind: "every", every_seconds: 5400 }, task.schedule), task.schedule);
    const interval = timingFromOplDraft({ frequency: "minutely", interval: "90", start: "2030-01-06T18:30:00", timeZone: "Europe/Berlin", weekdays: [], dailyTime: "18:30" });
    assert.deepEqual(oplScheduleFromTiming(interval), { kind: "interval", minutes: 90, timeZone: "Europe/Berlin" });
    const edited = applyScheduleEdit(task, update());
    assert.deepEqual({ ...edited, title: task.title }, task);
    assert.deepEqual(taskOwnerValues(edited), { permissions: ":workspace", timeoutMinutes: 75 });
    for (const values of [{ permissions: ":full-access", timeoutMinutes: 30 }, { permissions: ":workspace", timeoutMinutes: 0 }, { permissions: ":workspace", timeoutMinutes: 121 }]) {
      assert.equal(validTaskOwnerValues(values), false);
      assert.throws(() => applyScheduleEdit(task, update(), values));
    }
  });

  test("rejects unrepresentable recurrence precision, invalid zones, and offset-free timestamps", () => {
    for (const timing of [
      { kind: "every", every_seconds: 90 },
      { kind: "daily", daily: { time: "24:00:00", time_zone: "UTC" } },
      { kind: "daily", daily: { time: "10:30:01", time_zone: "UTC" } },
      { kind: "daily", daily: { time: "10:30:00", time_zone: "not/a-zone" } },
      { kind: "at", at: "2030-01-02T10:30:00" },
    ]) assert.throws(() => oplScheduleFromTiming(timing));
  });
});

describe("DSH schedule owner controller", () => {
  test("uses official catalog subscription lifecycle and authoritative list records", async () => {
    const f = fixture([baseTask()]);
    assert.equal(f.reads.length, 0);
    let publications = 0;
    const dispose = f.controller.catalog.hooks.catalog.subscribe(() => { publications++; });
    await f.controller.refresh();
    assert.ok(publications > 0);
    assert.equal(f.controller.catalog.hooks.catalog.getSnapshot().status, "ready");
    assert.equal(f.controller.ownerTask("existing")?.revision, 4);
    dispose();
  });

  test("a late stale owner list cannot overwrite the newest revision", async () => {
    const pendingReads: ReturnType<typeof deferred<any>>[] = [];
    const client: DshScheduleClient = {
      read: async () => {
        const pending = deferred<any>();
        pendingReads.push(pending);
        return pending.promise;
      },
    };
    const controller = createDshScheduleController({ client, workspacePath: "/workspace" });
    const first = controller.catalog.onRetry();
    await waitFor(() => pendingReads.length === 1);
    assert.equal(pendingReads.length, 1);
    const second = controller.catalog.onRetry(controller.catalog.hooks.catalog.getSnapshot().readRequest);
    await waitFor(() => pendingReads.length === 2);
    assert.equal(pendingReads.length, 2);
    pendingReads[1].resolve({ status: "available", items: [baseTask({ revision: 5, title: "Newest" })] });
    await second;
    pendingReads[0].resolve({ status: "available", items: [baseTask({ revision: 4, title: "Stale" })] });
    await first;
    assert.equal(controller.ownerTask("existing")?.revision, 5);
    assert.equal(controller.catalog.hooks.catalog.getSnapshot().records[0].title, "Newest");
  });

  test("creates only after the settled execute and fresh owner readback", async () => {
    const f = fixture();
    const gate = f.deferExecute();
    let settled = false;
    const pending = f.controller.create(createRequest(), { permissions: ":workspace", timeoutMinutes: 120 }).then(result => { settled = true; return result; });
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(f.reads.length, 0);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].operation, "task_create");
    assert.equal(f.calls[0].input.cwd, "/workspace");
    assert.equal(f.calls[0].input.permissions, ":workspace");
    assert.equal(f.calls[0].input.timeoutMinutes, 120);
    assert.equal(f.calls[0].input.requestId, "request-1");
    gate.resolve({ status: "executed" });
    const result = await pending;
    assert.ok("created" in result);
    assert.equal(result.created.updatedAt, "opl-revision:1");
    assert.equal(f.reads.length, 1);
    assert.equal(f.controller.catalog.hooks.catalog.getSnapshot().records[0].id, "new-task" as ScheduleId);
  });

  test("writes survive a receipt revision refresh superseding their first owner read", async () => {
    const f = fixture();
    await f.controller.refresh();
    const staleRead = f.deferRead();
    const creating = f.controller.create(createRequest());
    await waitFor(() => f.reads.length === 2);
    assert.equal(f.reads.length, 2);
    const appRevisionRead = f.deferRead();
    const revisionRefresh = f.controller.refresh();
    assert.equal(f.reads.length, 2, "the receipt-triggered refresh waits behind the write readback");
    staleRead.resolve(undefined);
    assert.ok("created" in await creating, "the superseded write read is followed by a settling owner read");
    await waitFor(() => f.reads.length === 3);
    appRevisionRead.resolve(undefined);
    await revisionRefresh;
    assert.equal(f.controller.ownerTask("new-task")?.revision, 1);
    assert.equal(f.calls.filter(call => call.operation === "task_create").length, 1);
  });

  test("an edited task accepts its confirmed revision when App refresh overlaps the write readback", async () => {
    const f = fixture([baseTask()]);
    await f.controller.refresh();
    const staleRead = f.deferRead();
    const editing = f.controller.edit(update());
    await waitFor(() => f.reads.length === 2);
    assert.equal(f.reads.length, 2);
    const appRevisionRead = f.deferRead();
    const revisionRefresh = f.controller.refresh();
    assert.equal(f.reads.length, 2, "the receipt-triggered refresh waits behind the write readback");
    staleRead.resolve(undefined);
    assert.equal(await editing, "saved", "the write read settles before the receipt refresh and cannot yield a stale revision");
    await waitFor(() => f.reads.length === 3);
    appRevisionRead.resolve(undefined);
    await revisionRefresh;
    assert.equal(f.controller.ownerTask("existing")?.revision, 5);
    assert.equal(f.calls.filter(call => call.operation === "task_update").length, 1);
  });

  test("cancelled, failed, rejected, and unknown receipts never report creation or resend", async () => {
    for (const status of ["cancelled", "failed", "rejected", "unknown"]) {
      const f = fixture();
      f.setStatus(status);
      assert.deepEqual(await f.controller.create(createRequest()), { failed: "host.createError" });
      assert.equal(f.calls.length, 1);
      assert.equal(f.reads.length, 0);
      assert.equal(f.controller.catalog.hooks.catalog.getSnapshot().records.length, 0);
    }
  });

  test("successful receipt without the created owner task has no local fallback", async () => {
    const f = fixture();
    f.setApply(false);
    assert.deepEqual(await f.controller.create(createRequest()), { failed: "host.createError" });
    assert.equal(f.calls.length, 1);
    assert.equal(f.reads.length, 1);
    assert.equal(f.controller.ownerTask("new-task"), undefined);
    assert.equal(f.controller.catalog.hooks.catalog.getSnapshot().records.length, 0);
  });

  test("creation readback recovery inspects the same task identity before any retry write", async () => {
    const f = fixture();
    f.setFailRead(true);
    assert.deepEqual(await f.controller.create(createRequest()), { failed: "host.createError" });
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].input.id, "new-task");

    f.setFailRead(false);
    const recovered = await f.controller.create(createRequest());
    assert.ok("created" in recovered);
    assert.equal(recovered.created.id, "new-task");
    assert.equal(f.calls.length, 1, "an owner task found during reconciliation must not be created again");
    assert.equal(f.controller.ownerTask("new-task")?.revision, 1);
  });

  test("unknown creation receipt retains its id but an explicit cancellation releases it", async () => {
    const unknown = fixture();
    unknown.setStatus("unknown");
    assert.deepEqual(await unknown.controller.create(createRequest()), { failed: "host.createError" });
    assert.deepEqual(await unknown.controller.create(createRequest()), { failed: "host.createError" });
    assert.equal(unknown.calls.length, 2, "unknown outcome is inspected before a retry with the original id");
    assert.equal(unknown.calls[0].input.id, unknown.calls[1].input.id);
    assert.equal(unknown.reads.length, 1);

    const cancelled = fixture();
    cancelled.setStatus("cancelled");
    assert.deepEqual(await cancelled.controller.create(createRequest()), { failed: "host.createError" });
    cancelled.setStatus("executed");
    assert.ok("created" in await cancelled.controller.create(createRequest()));
    assert.equal(cancelled.calls.length, 2, "an explicit cancel did not execute, so a later submit may start a fresh attempt");

    const failed = fixture();
    failed.setStatus("failed");
    assert.deepEqual(await failed.controller.create(createRequest()), { failed: "host.createError" });
    failed.setStatus("executed");
    assert.ok("created" in await failed.controller.create(createRequest()));
    assert.equal(failed.calls.length, 2, "a failed/unknown result is inspected before a retry with the original id");
    assert.equal(failed.calls[0].input.id, failed.calls[1].input.id);
  });

  test("readback failure and unknown transport outcomes never automatically repeat writes", async () => {
    const f = fixture();
    f.setFailRead(true);
    assert.deepEqual(await f.controller.create(createRequest()), { failed: "host.createError" });
    assert.equal(f.calls.length, 1);
    assert.equal(f.controller.catalog.hooks.catalog.getSnapshot().status, "error");
    const unknown = fixture();
    const gate = unknown.deferExecute();
    const pending = unknown.controller.create(createRequest());
    gate.reject(Error("transport outcome unknown"));
    assert.deepEqual(await pending, { failed: "host.createError" });
    assert.equal(unknown.calls.length, 1);
  });

  test("rejects stale CAS and unsupported targets before execution", async () => {
    const f = fixture([baseTask()]);
    await f.controller.refresh();
    assert.deepEqual(await f.controller.edit({ ...update(), expectedUpdatedAt: "opl-revision:3" }), { failed: "host.conflict" });
    assert.deepEqual(await f.controller.edit(update({ target: { kind: "session", sessionId: "canonical" } })), { failed: "host.invalidRule" });
    assert.deepEqual(await f.controller.create({ ...createRequest(), target: { kind: "new_once" } }), { failed: "host.invalidRule" });
    assert.equal(f.calls.length, 0);
  });

  test("retains full update fields, waits for confirmation, and requires a newer matching revision", async () => {
    const original = baseTask({ schedule: { kind: "interval", minutes: 90, timeZone: "Asia/Shanghai" } });
    const f = fixture([original]);
    await f.controller.refresh();
    const gate = f.deferExecute();
    let settled = false;
    const pending = f.controller.edit(update(), { permissions: ":read-only", timeoutMinutes: 5 }).then(value => { settled = true; return value; });
    await Promise.resolve();
    assert.equal(settled, false);
    const sent = f.calls[0].input as unknown as OplScheduledTask;
    assert.equal(sent.id, original.id);
    assert.equal(sent.cwd, original.cwd);
    assert.equal(sent.prompt, original.prompt);
    assert.deepEqual(sent.schedule, original.schedule);
    assert.equal(sent.permissions, ":read-only");
    assert.equal(sent.timeoutMinutes, 5);
    assert.equal(sent.model, original.model);
    assert.equal(sent.reasoningEffort, original.reasoningEffort);
    assert.equal(sent.title, "Changed");
    assert.equal(sent.requestId, "request-1");
    gate.resolve({ status: "executed" });
    assert.equal(await pending, "saved");
    assert.equal(f.controller.ownerTask("existing")?.revision, 5);
    assert.equal(f.controller.ownerTask("existing")?.model, original.model);
    const unchanged = fixture([original]);
    await unchanged.controller.refresh();
    unchanged.setApply(false);
    assert.deepEqual(await unchanged.controller.edit(update()), { failed: "host.saveError" });
    assert.equal(unchanged.calls.length, 1);
  });

  test("maps active-only edits to owner pause/resume and keeps the current revision", async () => {
    const f = fixture([baseTask()]);
    await f.controller.refresh();
    assert.equal(await f.controller.edit(update({ active: false })), "saved");
    assert.deepEqual(f.calls[0].input, { id: "existing", revision: 4, requestId: "request-1" });
    assert.equal(f.calls[0].operation, "task_pause");
    assert.equal(f.controller.ownerTask("existing")?.paused, true);
    assert.equal(await f.controller.edit({ ...update({ active: true }), expectedUpdatedAt: "opl-revision:5" }), "saved");
    assert.equal(f.calls[1].operation, "task_resume");
    assert.equal(f.calls[1].input.revision, 5);
    assert.equal(f.controller.ownerTask("existing")?.paused, false);
    assert.deepEqual(await f.controller.edit({ ...update({ active: false, title: "mixed" }), expectedUpdatedAt: "opl-revision:6" }), { failed: "host.invalidRule" });
    assert.equal(f.calls.length, 2, "unsupported multi-operation edit must not partially execute");
  });

  test("deletion needs fresh owner absence and preserves the row on cancellation or unchanged readback", async () => {
    for (const accepted of [false, true]) {
      const f = fixture([baseTask()]);
      await f.controller.refresh();
      if (accepted) f.setApply(false); else f.setStatus("cancelled");
      assert.equal(await f.controller.onDelete("existing" as ScheduleId), "failed");
      assert.equal(f.calls.length, 1);
      assert.equal(f.controller.catalog.hooks.catalog.getSnapshot().records.length, 1);
    }
    const f = fixture([baseTask()]);
    await f.controller.refresh();
    assert.equal(await f.controller.onDelete("existing" as ScheduleId), "deleted");
    assert.equal(f.controller.ownerTask("existing"), undefined);
    assert.equal(f.controller.catalog.hooks.catalog.getSnapshot().records.length, 0);
  });

  test("queues a run only from an accepted action and fresh catalog, without fabricating delivery receipts", async () => {
    const f = fixture([baseTask()]);
    await f.controller.refresh();
    assert.equal(await f.controller.run("existing"), "queued");
    assert.equal(f.calls[0].operation, "task_run");
    assert.equal(f.calls[0].input.revision, 4);
    assert.equal("lastDelivery" in f.controller.catalog.hooks.catalog.getSnapshot().records[0], false);
    assert.equal(f.controller.ownerTask("existing")?.revision, 4, "run admission does not change the task definition");
    f.setStatus("cancelled");
    assert.deepEqual(await f.controller.run("existing"), { failed: "host.runError" });
    const running = fixture([baseTask({ running: [{ workflowId: "current" }] })]);
    await running.controller.refresh();
    assert.deepEqual(await running.controller.run("existing"), { failed: "host.executionPending" });
    assert.equal(running.calls.length, 0);
  });

  test("past one-shot, malformed owner settings, and unsupported timing never reach execute", async () => {
    const f = fixture();
    assert.deepEqual(await f.controller.create({ ...createRequest(), timing: { kind: "at", at: "2029-01-01T00:00:00Z" } }), { failed: "host.notFuture" });
    assert.deepEqual(await f.controller.create(createRequest(), { permissions: ":full-access", timeoutMinutes: 10 }), { failed: "host.invalidRule" });
    assert.deepEqual(await f.controller.create({ ...createRequest(), timing: { kind: "after", after_seconds: 300 } }), { failed: "host.invalidRule" });
    assert.equal(f.calls.length, 0);
  });
});
