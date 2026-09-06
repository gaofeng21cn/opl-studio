import fs from "node:fs/promises";
import path from "node:path";

const DAY = 24 * 60 * 60_000;
const RETRY = 5 * 60_000;

export function eligibleBackgroundComponents(plan) {
  const components = plan?.managed_update?.components;
  if (!Array.isArray(components)) throw new Error("Framework update plan has no components");
  return components.filter((component) => ["opl_base", "opl_packages"].includes(component.component_id)
    && component.auto_apply?.eligible === true
    && component.auto_apply?.app_background_safe === true
    && typeof component.auto_apply?.command_ref === "string"
    && component.auto_apply.command_ref.length > 0);
}

export function createManagedUpdateMaintenance({
  opl, codex, stateFile, onStateChange = () => {}, checkAppUpdate = async () => {},
  now = Date.now, schedule = setTimeout, unschedule = clearTimeout
}) {
  let state = { schema: "opl_studio_update_maintenance.v1", status: "idle", lastCompletedAt: null, reloadPending: false };
  let timer;
  let inFlight;
  let stopped = false;
  const emit = (next) => {
    state = { ...state, ...next };
    onStateChange({ ...state });
  };
  const persist = async () => {
    if (!stateFile) return;
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    const temporary = `${stateFile}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await fs.rename(temporary, stateFile);
  };
  const run = async () => {
    emit({ status: "checking", errorCode: null });
    // Desktop feed failures must not prevent Framework/package maintenance.
    try { await checkAppUpdate(); } catch { emit({ appUpdateStatus: "failed" }); }
    await opl.runManagedUpdate("check");
    const plan = await opl.runManagedUpdate("plan");
    const eligible = eligibleBackgroundComponents(plan);
    if (eligible.length > 0 || state.reloadPending) {
      const lease = await codex.transport.runWhenIdle(async () => {
        emit({ status: "applying", components: eligible.map((item) => item.component_id) });
        // Framework rechecks eligibility under its own cross-process update lock.
        const result = eligible.length > 0 ? await opl.runManagedUpdate("apply") : null;
        const components = result?.managed_update?.components ?? [];
        const reload = state.reloadPending || components.some((component) => component.component_id === "opl_packages"
          && (component.receipt?.reload_guidance?.reload_recommended === true
            || component.post_apply_guidance?.reload_guidance?.reload_recommended === true));
        if (reload) {
          emit({ reloadPending: true });
          await persist();
          await codex.reloadConfiguration({ maintenanceHeld: true });
          emit({ reloadPending: false });
        }
        const executionStatus = result?.managed_update?.execution?.status;
        if (result && !["completed", "skipped"].includes(executionStatus)) {
          throw Object.assign(new Error("Framework update did not complete"), { code: "managed_update_incomplete" });
        }
        await opl.runManagedUpdate("status");
        return { reloaded: reload };
      });
      if (lease.status === "deferred") {
        emit({ status: "deferred", reasonCode: lease.reasonCode });
        return;
      }
      emit({ reloaded: lease.result.reloaded });
    }
    emit({ status: "completed", lastCompletedAt: now(), reasonCode: null });
    await persist();
  };
  const controller = {
    snapshot: () => ({ ...state }),
    async runNow() {
      if (stopped) return controller.snapshot();
      inFlight ??= run().catch(async (error) => {
        emit({ status: "failed", errorCode: error.code ?? "managed_update_failed" });
        try { await persist(); } catch { /* Keep the live failure state if receipt storage is unavailable. */ }
      }).finally(() => { inFlight = null; });
      await inFlight;
      return controller.snapshot();
    },
    async start() {
      if (stateFile) {
        try {
          const saved = JSON.parse(await fs.readFile(stateFile, "utf8"));
          if (Number.isFinite(saved.lastCompletedAt) && saved.lastCompletedAt <= now()) {
            state.lastCompletedAt = saved.lastCompletedAt;
          }
          state.reloadPending = saved.reloadPending === true;
          if (["completed", "failed", "applying", "deferred"].includes(saved.status)) state.status = saved.status;
        } catch { /* A missing or invalid receipt causes a fresh check. */ }
      }
      const tick = async () => {
        await controller.runNow();
        if (!stopped) {
          timer = schedule(tick, state.status === "completed" ? DAY : RETRY);
          timer?.unref?.();
        }
      };
      const remaining = state.status !== "completed" || state.reloadPending || state.lastCompletedAt === null
        ? 30_000 : Math.max(30_000, DAY - (now() - state.lastCompletedAt));
      timer = schedule(tick, remaining);
      timer?.unref?.();
    },
    async close() {
      stopped = true;
      unschedule(timer);
      await inFlight;
    }
  };
  return controller;
}
