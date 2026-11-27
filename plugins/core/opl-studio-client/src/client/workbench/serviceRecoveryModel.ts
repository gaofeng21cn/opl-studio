import type { RunwayHealth, ServiceRecoverySummary } from "@gaofeng21cn/opl-host-contracts";
import { asFiniteNumber, asOptionalBoolean, asRecord } from "./workbenchModel-primitives";

function readStatus(value: unknown): RunwayHealth["status"] {
  return value === "running" || value === "degraded" || value === "stopped" ? value : "unknown";
}

export function readRunwayHealth(value: unknown, summary: unknown): RunwayHealth {
  const runway = asRecord(value);
  const detailsStatus = readStatus(runway?.status);
  const runner = asRecord(runway?.schedule_runner);
  const interval = asFiniteNumber(runner?.tick_interval_ms);
  return {
    status: detailsStatus === "unknown" ? readStatus(summary) : detailsStatus,
    scheduleRunner: {
      running: asOptionalBoolean(runner?.running),
      tickIntervalMs: interval !== null && interval > 0 ? interval : null
    }
  };
}

export function deriveServiceRecoveryModel(runway: RunwayHealth): ServiceRecoverySummary {
  const { status, scheduleRunner } = runway;
  const scheduleRunnerStatus = scheduleRunner.running === null ? "unknown" : scheduleRunner.running ? "running" : "stopped";
  const labels = {
    running: { zh: "Runway 正在运行", en: "Runway is running" },
    degraded: { zh: "Runway 运行异常", en: "Runway is degraded" },
    stopped: { zh: "Runway 已停止", en: "Runway is stopped" },
    unknown: { zh: "Runway 状态待确认", en: "Runway status is unknown" }
  };
  const detail = status === "running" && scheduleRunnerStatus !== "running"
    ? scheduleRunnerStatus === "stopped"
      ? { zh: "定时任务执行器已停止", en: "The schedule runner is stopped" }
      : { zh: "定时任务执行器状态待确认", en: "Schedule runner status is unknown" }
    : labels[status];
  return { status, scheduleRunnerStatus, detail };
}
