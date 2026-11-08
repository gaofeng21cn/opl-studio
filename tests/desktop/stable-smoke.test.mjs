import assert from "node:assert/strict";
import test from "node:test";
import { runDesktopHostReadiness, runCodexReadiness, runFrameworkReadiness, runRuntimeRefresh, runStableSmoke, validateStableRuntimeEvidence, STABLE_PRODUCT } from "../../scripts/desktop/stable-smoke.mjs";

test("Desktop host readiness gives first-install setup its own budget and rejects bootstrap failure", async () => {
  const result = await runDesktopHostReadiness({ evaluate: async (expression, timeoutMs) => {
    assert.equal(timeoutMs, 600_000);
    assert.match(expression, /readState\("fast"\)/);
    assert.doesNotMatch(expression, /executeAction|retryDesktopHost|loginGateway/);
    return { exitCode: 0, bootstrapStatus: "available" };
  } });
  assert.equal(result.status, "passed");
  await assert.rejects(runDesktopHostReadiness({ evaluate: async () => ({ exitCode: 0, bootstrapStatus: "framework_bootstrap_failed" }) }), /bootstrap failed/);
  await assert.rejects(runDesktopHostReadiness({ evaluate: async () => ({ exitCode: -1, bootstrapStatus: "available" }) }), /initial readback failed/);
  await assert.rejects(runDesktopHostReadiness({ evaluate: async () => { throw new Error("setup timeout"); } }), /setup timeout/);
});

function completeEvidence() {
  return {
    schema: "opl_studio_stable_smoke.v1", status: "passed", package: STABLE_PRODUCT, generationRequested: false,
    checks: {
      gateway: { status: "passed" }, codexTurn: { status: "skipped" },
      frameworkReadiness: { status: "passed", launchReady: true, packageDirectoryPresent: true, requireRootPackages: false, missingRootPackageIds: [] },
      codexReadiness: { status: "passed", generationRequested: false, modelListValid: true, threadListValid: true, simulated: false },
      runtimeRefresh: { status: "passed", panelReady: true, buttonReadyBefore: true, clicked: true, busyObserved: true, buttonReadyAfter: true, errorVisible: false }
    }
  };
}

test("Stable VM rejects every generative probe before invoking the renderer", async () => {
  for (const context of [{ turnRequest: { prompt: "hello" } }, { options: { requireCodexTurn: true } }, { options: { codexTurnPrompt: "hello" } }]) {
    await assert.rejects(runStableSmoke({ ...context, evaluate: () => { throw new Error("must not execute"); } }), /forbids model generation/);
  }
});

test("Stable smoke forwards a bounded phase timeout and emits readiness progress", async () => {
  const events = [];
  const context = {
    credentials: null,
    options: { timeoutMs: 10_000, phaseTimeoutMs: 25 },
    progress: (event) => events.push(event),
    evaluate: async (_expression, timeoutMs) => { assert.equal(timeoutMs, 25); return {}; }
  };
  await assert.rejects(runStableSmoke(context), /dedicated Gateway account/);
  assert.ok(events.some((event) => event.phase === "stable-smoke" && event.status === "started"));
});

test("Standard readiness reports optional Profile failures without waiting or masking host failures", async () => {
  const projection = { initializeExitCode: 0, stateExitCode: 0, launchReady: true,
    packageDirectoryPresent: true, packages: [] };
  for (const status of ["running", "failed", "completed"]) {
    const readback = await runFrameworkReadiness({ projection, expectedRootPackageIds: ["selected-package"],
      readFirstInstallAttempt: async () => ({ status }),
      evaluate: async () => { throw new Error("optional packages must not cause a second read"); } });
    assert.equal(readback.status, "passed");
    assert.equal(readback.requireRootPackages, false);
    assert.equal(readback.firstInstallStatus, status);
    assert.deepEqual(readback.missingRootPackageIds, ["selected-package"]);
  }
  for (const failure of [{ initializeExitCode: 1 }, { stateExitCode: 3 }, { launchReady: false }, { packageDirectoryPresent: false }]) {
    assert.equal((await runFrameworkReadiness({ projection: { ...projection, ...failure } })).status, "failed");
  }
});

test("Framework readiness projects a real owner read when no cached projection exists", async () => {
  let reads = 0;
  const result = await runFrameworkReadiness({ expectedRootPackageIds: ["selected-package"],
    evaluate: async expression => {
      assert.equal(expression, "window.oplStudio.readState('fast')");
      reads += 1;
      return { readback: { exitCode: 0 }, app_state: { agent_packages: { directory: { entries: [] } } } };
    } });
  assert.equal(reads, 1);
  assert.equal(result.status, "passed");
  assert.deepEqual(result.missingRootPackageIds, ["selected-package"]);
});

test("Stable smoke gives background Official Profile installation its own bounded budget", async () => {
  const events = [];
  await assert.rejects(runStableSmoke({
    credentials: { email: "release@example.invalid", password: "x" },
    options: { timeoutMs: 120_000, phaseTimeoutMs: 120_000, expectedRootPackageIds: ["opl-channel-weixin"] },
    progress: event => events.push(event),
    evaluate: async expression => {
      if (expression.includes("readState(\"fast\")") || expression.includes("readState('fast')")) return { readback: { exitCode: 1 } };
      return {};
    }
  }), /bootstrap failed|initial readback failed|readback/);
  assert.ok(events.every(event => event.phase !== "framework-readiness" || event.phaseTimeoutMs === 900000));
});

test("Framework readiness reuses the Standard runtime projection without a second bridge read", async () => {
  const projection = {
    initializeExitCode: 0,
    stateExitCode: 0,
    launchReady: true,
    packageDirectoryPresent: true,
    packages: [{ id: "mas", present: true, installed: true }]
  };
  const result = await runFrameworkReadiness({
    projection,
    expectedRootPackageIds: ["mas"],
    evaluate: async () => { throw new Error("duplicate Framework bridge read"); }
  });
  assert.equal(result.status, "passed");
});

test("Full readiness waits for selected seeded Package installation", async () => {
  const incomplete = {
    initializeExitCode: 0,
    stateExitCode: 0,
    launchReady: true,
    packageDirectoryPresent: true,
    packages: [{ id: "mas", present: false, installed: false }]
  };
  const completeState = {
    readback: { exitCode: 0 },
    app_state: {
      agent_packages: {
        directory: { entries: [{ package_id: "mas", installed: true, presence: { present: true, installed: true } }] }
      }
    }
  };
  let reads = 0;
  const result = await runFrameworkReadiness({
    projection: incomplete,
    expectedRootPackageIds: ["mas"], requireRootPackages: true,
    timeoutMs: 1500,
    evaluate: async () => { reads += 1; return reads === 1 ? { readback: { exitCode: 0 }, app_state: { agent_packages: { directory: { entries: [{ package_id: "mas", installed: false }] } } } } : completeState; }
  });
  assert.equal(reads, 2);
  assert.equal(result.status, "passed");
  assert.deepEqual(result.missingRootPackageIds, []);

  const missing = await runFrameworkReadiness({ projection: incomplete, expectedRootPackageIds: ["mas"], requireRootPackages: true, timeoutMs: 0, evaluate: async () => ({ readback: { exitCode: 0 }, app_state: { agent_packages: { directory: { entries: [{ package_id: "mas", installed: false }] } } } }) });
  assert.equal(missing.status, "failed");
  assert.deepEqual(missing.missingRootPackageIds, ["mas"]);

  let failedReads = 0;
  const failed = await runFrameworkReadiness({ projection: incomplete, expectedRootPackageIds: ["mas"], requireRootPackages: true, timeoutMs: 1500, evaluate: async () => {
    failedReads += 1;
    return { readback: { exitCode: 3 }, app_state: { agent_packages: { directory: { entries: [] } } } };
  } });
  assert.equal(failedReads, 1);
  assert.equal(failed.status, "failed");
});

test("Full readiness stops on current first-install failure without waiting out the package budget", async () => {
  const projection = { initializeExitCode: 0, stateExitCode: 0, launchReady: true,
    packageDirectoryPresent: true, packages: [] };
  const failed = await runFrameworkReadiness({
    projection, expectedRootPackageIds: ["mas"], requireRootPackages: true, timeoutMs: 900_000,
    readFirstInstallAttempt: async () => ({ status: "failed" }),
    evaluate: async () => { throw new Error("must stop before another bridge call"); }
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.firstInstallStatus, "failed");
  assert.deepEqual(failed.missingRootPackageIds, ["mas"]);
  for (const attempt of [null, { status: "running" }, { status: "completed" }]) {
    const ready = await runFrameworkReadiness({
      projection, expectedRootPackageIds: ["mas"], requireRootPackages: true, timeoutMs: 0,
      readFirstInstallAttempt: async () => attempt,
      evaluate: async () => ({ readback: { exitCode: 0 }, app_state: {
        agent_packages: { directory: { entries: [{ package_id: "mas", installed: true }] } }
      } })
    });
    assert.equal(ready.status, "passed");
  }
});

test("Codex readiness requests protocol catalogs only and rejects simulated or malformed responses", async () => {
  let expression;
  const receipt = await runCodexReadiness({ evaluate: async (value) => { expression = value; return { modelListValid: true, threadListValid: true, modelCount: 0, simulated: false }; } });
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.generationRequested, false);
  assert.doesNotMatch(expression, /sendMessage|turn\/start|thread\/start/);
  for (const result of [{ modelListValid: true, threadListValid: true, simulated: true }, { modelListValid: true, threadListValid: false, simulated: false }]) {
    assert.equal((await runCodexReadiness({ evaluate: async () => result })).status, "failed");
  }
});

test("Runtime refresh requires real click, busy transition and returned ready state", async () => {
  const complete = completeEvidence().checks.runtimeRefresh;
  assert.equal((await runRuntimeRefresh({ timeoutMs: 500, evaluate: async () => complete })).status, "passed");
  for (const missing of ["panelReady", "buttonReadyBefore", "clicked", "busyObserved", "buttonReadyAfter"]) {
    const { status, ...observed } = complete;
    assert.equal((await runRuntimeRefresh({ timeoutMs: 500, evaluate: async () => ({ ...observed, [missing]: false }) })).status, "failed");
  }
});

test("Stable evidence validator fails closed on old Preview and incomplete readback", () => {
  assert.equal(validateStableRuntimeEvidence(completeEvidence()).status, "passed");
  const optional = completeEvidence();
  optional.checks.frameworkReadiness.missingRootPackageIds = ["selected-package"];
  optional.checks.frameworkReadiness.firstInstallStatus = "failed";
  assert.equal(validateStableRuntimeEvidence(optional).status, "passed");
  const full = completeEvidence();
  full.checks.runtime = { full: { status: "passed" } };
  assert.throws(() => validateStableRuntimeEvidence(full), /selected Full seed/);
  full.checks.frameworkReadiness.requireRootPackages = true;
  assert.equal(validateStableRuntimeEvidence(full).status, "passed");
  full.checks.frameworkReadiness.missingRootPackageIds = ["selected-package"];
  assert.throws(() => validateStableRuntimeEvidence(full), /selected Full seed/);
  full.checks.frameworkReadiness.missingRootPackageIds = [];
  full.checks.frameworkReadiness.firstInstallStatus = "failed";
  assert.throws(() => validateStableRuntimeEvidence(full), /selected Full seed/);
  const preview = completeEvidence(); preview.schema = "opl_studio_preview_smoke.v1";
  assert.throws(() => validateStableRuntimeEvidence(preview), /passed Studio Stable/);
  const failure = completeEvidence(); failure.checks.runtimeRefresh.busyObserved = false;
  assert.throws(() => validateStableRuntimeEvidence(failure), /Runtime UI refresh/);
  const turn = completeEvidence(); turn.checks.codexTurn.status = "connectivity_confirmed";
  assert.throws(() => validateStableRuntimeEvidence(turn), /generation attempt/);
  const simulated = completeEvidence(); simulated.checks.codexReadiness.simulated = true;
  assert.throws(() => validateStableRuntimeEvidence(simulated), /protocol readiness/);
});
