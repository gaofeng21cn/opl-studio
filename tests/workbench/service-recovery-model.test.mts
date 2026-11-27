import assert from "node:assert/strict";
import test from "node:test";
import { deriveServiceRecoveryModel, readRunwayHealth } from "../../plugins/core/opl-studio-client/src/client/workbench/serviceRecoveryModel.ts";
import { deriveWorkbenchModelFromState } from "../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts";

test("Runway reports degraded health even when the schedule runner is running", () => {
  const health = readRunwayHealth({ status: "degraded", schedule_runner: { running: true, tick_interval_ms: 5000 } }, "running");
  assert.deepEqual(health, { status: "degraded", scheduleRunner: { running: true, tickIntervalMs: 5000 } });
  assert.deepEqual(deriveServiceRecoveryModel(health), {
    status: "degraded", scheduleRunnerStatus: "running", detail: { zh: "Runway 运行异常", en: "Runway is degraded" }
  });
});

test("Runway leaves missing runner fields unknown and falls back to the status summary", () => {
  const model = deriveWorkbenchModelFromState({ app_state: { settings_control_center: { status_summary: { runway: "stopped" } } } });
  assert.deepEqual(model.runtimeOverview?.runway, { status: "stopped", scheduleRunner: { running: null, tickIntervalMs: null } });
  assert.equal(model.serviceRecovery?.status, "stopped");
  assert.equal(model.serviceRecovery?.scheduleRunnerStatus, "unknown");
  assert.equal(deriveServiceRecoveryModel(readRunwayHealth(null, null)).status, "unknown");
});

test("running Runway keeps unknown or stopped schedule runner status independent", () => {
  const unknown = deriveServiceRecoveryModel(readRunwayHealth({ status: "running", schedule_runner: { running: "yes", tick_interval_ms: -1 } }, null));
  assert.equal(unknown.scheduleRunnerStatus, "unknown");
  assert.match(unknown.detail.en ?? "", /runner status is unknown/);
  const stopped = deriveServiceRecoveryModel(readRunwayHealth({ status: "running", schedule_runner: { running: false } }, null));
  assert.equal(stopped.scheduleRunnerStatus, "stopped");
  assert.match(stopped.detail.en ?? "", /runner is stopped/);
});
