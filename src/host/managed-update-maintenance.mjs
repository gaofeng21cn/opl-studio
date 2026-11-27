import fs from "node:fs/promises";
import { writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";

const CHECK_INTERVAL = 6 * 60 * 60_000;
const FAILURE_RETRY_INTERVAL = 30 * 60_000;
const BUSY_RETRY_INTERVAL = 5 * 60_000;
const MAX_FAILURE_RETRIES = 3;

export function eligibleBackgroundComponents(plan) {
  const components = plan?.managed_update?.components;
  if (!Array.isArray(components)) throw new Error("Framework update plan has no components");
  return components.filter((component) => component.auto_apply?.eligible === true
    && component.auto_apply?.app_background_safe === true
    && typeof component.auto_apply?.command_ref === "string"
    && component.auto_apply.command_ref.length > 0);
}

export function createManagedUpdateMaintenance({
  opl, codex, stateFile, onStateChange = () => {}, checkAppUpdate = async () => {},
  syncDshPlugins = null,
  now = Date.now, schedule = setTimeout, unschedule = clearTimeout
}) {
  let state = {
    schema: "opl_studio_update_maintenance.v1",
    status: "idle",
    lastCompletedAt: null,
    nextAttemptAt: null,
    reloadPending: false,
    packageRestartRequired: false,
    packageRendererReloadReady: false,
    dshPluginRestartRequired: false,
    dshPluginReloadReady: false,
    dshPluginUpdateStatus: "idle",
    updatedDshPlugins: {},
    failureRetryCount: 0,
    retryExhausted: false
  };
  let packageRendererRevision = 0;
  let dshRendererRevision = 0;
  let timer;
  let inFlight;
  let stopped = false;
  let started = false;
  const emit = (next) => {
    state = { ...state, ...next };
    onStateChange({ ...state });
  };
  const persist = async () => {
    if (!stateFile) return;
    await writeFileAtomic(stateFile, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  };
  const syncProfilePlugins = async () => {
    if (!syncDshPlugins) return;
    try {
      const dshResult = await syncDshPlugins();
      const installedPlugins = dshResult?.installed ?? {};
      const dshFailures = dshResult?.failures ?? {};
      const externalStaged = Array.isArray(dshResult?.externalStaged) ? dshResult.externalStaged : [];
      const hasInstalled = Object.keys(installedPlugins).length > 0;
      if (
        dshResult?.reloadMode === "renderer_reload"
        && hasInstalled
        && !state.dshPluginRestartRequired
        && externalStaged.length === 0
      ) {
        dshRendererRevision++;
        emit({
          dshPluginReloadReady: true,
          dshPluginUpdateStatus: "reload_ready",
          updatedDshPlugins: { ...state.updatedDshPlugins, ...installedPlugins }
        });
      } else if (dshResult?.application === "restart-required" || hasInstalled || externalStaged.length > 0) {
        emit({
          dshPluginRestartRequired: true,
          dshPluginReloadReady: false,
          dshPluginUpdateStatus: "restart_required",
          updatedDshPlugins: { ...state.updatedDshPlugins, ...installedPlugins }
        });
      } else if (Object.keys(dshFailures).length > 0) {
        emit({ dshPluginUpdateStatus: "failed" });
      } else if (!state.dshPluginRestartRequired && !state.dshPluginReloadReady) {
        emit({ dshPluginUpdateStatus: "current" });
      }
    } catch {
      emit({ dshPluginUpdateStatus: "failed" });
    }
  };
  const run = async () => {
    // Reserve the next automatic attempt before invoking an external writer.
    // Failure, process exit and restart must not create an unbounded apply loop.
    emit({ status: "checking", errorCode: null, nextAttemptAt: now() + CHECK_INTERVAL, retryExhausted: false });
    await persist();
    let appUpdateFailed = false;
    // Desktop feed failures must not prevent Framework/package maintenance.
    try { await checkAppUpdate(); } catch {
      appUpdateFailed = true;
      emit({ appUpdateStatus: "failed" });
    }
    try {
      await opl.runManagedUpdate("check");
      const plan = await opl.runManagedUpdate("plan");
      const eligible = eligibleBackgroundComponents(plan);
      if (eligible.length > 0 || state.reloadPending) {
        const lease = await codex.transport.runWhenIdle(async () => {
          emit({ status: "applying", components: eligible.map((item) => item.component_id) });
          // Framework rechecks eligibility under its own cross-process update lock.
          const result = eligible.length > 0 ? await opl.runManagedUpdate("apply") : null;
          const components = result?.managed_update?.components ?? [];
          const guidance = components.filter((component) => component.component_id === "opl_packages")
            .flatMap((component) => [component.receipt?.reload_guidance, component.post_apply_guidance?.reload_guidance])
            .filter(Boolean);
          if (guidance.some((item) => item.restart_required === true || item.reload_mode === "restart_required")) {
            emit({ packageRestartRequired: true, packageRendererReloadReady: false, reloadPending: false });
            await persist();
          } else if (!state.packageRestartRequired && guidance.some((item) => item.reload_mode === "renderer_reload")) {
            packageRendererRevision++;
            emit({ packageRendererReloadReady: true });
          }
          const reload = !state.packageRestartRequired && (state.reloadPending
            || guidance.some((item) => item.reload_recommended === true && !item.reload_mode));
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
          emit({ status: "deferred", reasonCode: lease.reasonCode, nextAttemptAt: now() + BUSY_RETRY_INTERVAL });
          await persist();
          return;
        }
        emit({ reloaded: lease.result.reloaded });
      }
    } finally {
      if (state.status !== "deferred") await syncProfilePlugins();
    }
    const failedRetryCount = appUpdateFailed ? Math.min(MAX_FAILURE_RETRIES, state.failureRetryCount + 1) : 0;
    const retryExhausted = failedRetryCount >= MAX_FAILURE_RETRIES;
    emit({
      status: "completed",
      lastCompletedAt: now(),
      nextAttemptAt: now() + (appUpdateFailed && !retryExhausted ? FAILURE_RETRY_INTERVAL : CHECK_INTERVAL),
      failureRetryCount: failedRetryCount,
      retryExhausted,
      reasonCode: null
    });
    await persist();
  };
  const controller = {
    snapshot: () => ({ ...state }),
    captureRendererUpdateAcknowledgement() {
      const packageRevision = packageRendererRevision;
      const dshRevision = dshRendererRevision;
      return () => {
        const acknowledged = {};
        if (state.packageRendererReloadReady && packageRevision === packageRendererRevision) {
          acknowledged.packageRendererReloadReady = false;
        }
        if (state.dshPluginReloadReady && dshRevision === dshRendererRevision) {
          acknowledged.dshPluginReloadReady = false;
          acknowledged.dshPluginUpdateStatus = "current";
        }
        if (Object.keys(acknowledged).length) emit(acknowledged);
      };
    },
    async runNow() {
      if (stopped) return controller.snapshot();
      inFlight ??= run().catch(async (error) => {
        const failureRetryCount = Math.min(MAX_FAILURE_RETRIES, state.failureRetryCount + 1);
        const retryExhausted = failureRetryCount >= MAX_FAILURE_RETRIES;
        emit({
          status: "failed",
          errorCode: error.code ?? "managed_update_failed",
          nextAttemptAt: now() + (retryExhausted ? CHECK_INTERVAL : FAILURE_RETRY_INTERVAL),
          failureRetryCount,
          retryExhausted
        });
        try { await persist(); } catch { /* Keep the live failure state if receipt storage is unavailable. */ }
      }).finally(() => { inFlight = null; });
      await inFlight;
      return controller.snapshot();
    },
    async start() {
      if (started || stopped) return;
      started = true;
      if (stateFile) {
        try {
          const saved = JSON.parse(await fs.readFile(stateFile, "utf8"));
          if (saved.schema !== state.schema) throw new Error("Invalid maintenance receipt");
          if (Number.isFinite(saved.lastCompletedAt) && saved.lastCompletedAt <= now()) {
            state.lastCompletedAt = saved.lastCompletedAt;
          }
          state.reloadPending = saved.reloadPending === true;
          // A cold restart has already activated any previously installed DSH profile overrides.
          state.dshPluginRestartRequired = false;
          state.dshPluginReloadReady = false;
          state.updatedDshPlugins = {};
          if (typeof saved.dshPluginUpdateStatus === "string" && !["restart_required", "reload_ready"].includes(saved.dshPluginUpdateStatus)) {
            state.dshPluginUpdateStatus = saved.dshPluginUpdateStatus;
          }
          if (Number.isInteger(saved.failureRetryCount) && saved.failureRetryCount >= 0) {
            state.failureRetryCount = saved.failureRetryCount;
          }
          state.retryExhausted = saved.retryExhausted === true;
          if (["completed", "failed", "checking", "applying", "deferred"].includes(saved.status)) state.status = saved.status;
          if (Number.isFinite(saved.nextAttemptAt)) {
            state.nextAttemptAt = Math.min(saved.nextAttemptAt, now() + CHECK_INTERVAL);
          } else if (["failed", "checking", "applying"].includes(state.status)) {
            // Old failures have no timestamp. Migrate once and schedule the
            // bounded failure retry interval after every cold start.
            state.nextAttemptAt = now() + FAILURE_RETRY_INTERVAL;
            await persist();
          }
        } catch { /* A missing or invalid receipt causes a fresh check. */ }
      }
      const tick = async () => {
        await controller.runNow();
        if (!stopped) {
          timer = schedule(tick, Math.max(30_000, (state.nextAttemptAt ?? now() + CHECK_INTERVAL) - now()));
          timer?.unref?.();
        }
      };
      const dueAt = state.nextAttemptAt ?? (state.lastCompletedAt === null ? now() : state.lastCompletedAt + CHECK_INTERVAL);
      const remaining = Math.max(30_000, dueAt - now());
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
