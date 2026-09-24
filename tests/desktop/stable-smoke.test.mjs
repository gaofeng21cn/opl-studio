import assert from "node:assert/strict";
import test from "node:test";
import { runCodexReadiness, runFrameworkReadiness, runRuntimeRefresh, runStableSmoke, validateStableRuntimeEvidence, STABLE_PRODUCT } from "../../scripts/desktop/stable-smoke.mjs";

function completeEvidence() {
  return {
    schema: "opl_studio_stable_smoke.v1", status: "passed", package: STABLE_PRODUCT, generationRequested: false,
    checks: {
      gateway: { status: "passed" }, codexTurn: { status: "skipped" },
      frameworkReadiness: { status: "passed", launchReady: true, packageDirectoryPresent: true, missingRootPackageIds: [] },
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

test("Framework readiness requires owner-projected installed Official Profile roots", async () => {
  const readback = { initializeExitCode: 0, stateExitCode: 0, launchReady: true, packageDirectoryPresent: true, packages: [{ id: "mas", present: true, installed: true }] };
  assert.equal((await runFrameworkReadiness({ evaluate: async () => readback, expectedRootPackageIds: ["mas"] })).status, "passed");
  const missing = await runFrameworkReadiness({ evaluate: async () => readback, expectedRootPackageIds: ["mas", "mag"] });
  assert.equal(missing.status, "failed");
  assert.deepEqual(missing.missingRootPackageIds, ["mag"]);
  assert.equal((await runFrameworkReadiness({ evaluate: async () => ({ ...readback, launchReady: false }), expectedRootPackageIds: ["mas"] })).status, "failed");
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

test("Framework readiness waits for background Official Profile installation", async () => {
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
    expectedRootPackageIds: ["mas"],
    timeoutMs: 1500,
    evaluate: async () => { reads += 1; return reads === 1 ? { readback: { exitCode: 0 }, app_state: { agent_packages: { directory: { entries: [{ package_id: "mas", installed: false }] } } } } : completeState; }
  });
  assert.equal(reads, 2);
  assert.equal(result.status, "passed");
  assert.deepEqual(result.missingRootPackageIds, []);

  const missing = await runFrameworkReadiness({ projection: incomplete, expectedRootPackageIds: ["mas"], timeoutMs: 0, evaluate: async () => ({ readback: { exitCode: 0 }, app_state: { agent_packages: { directory: { entries: [{ package_id: "mas", installed: false }] } } } }) });
  assert.equal(missing.status, "failed");
  assert.deepEqual(missing.missingRootPackageIds, ["mas"]);

  let failedReads = 0;
  const failed = await runFrameworkReadiness({ projection: incomplete, expectedRootPackageIds: ["mas"], timeoutMs: 1500, evaluate: async () => {
    failedReads += 1;
    return { readback: { exitCode: 3 }, app_state: { agent_packages: { directory: { entries: [] } } } };
  } });
  assert.equal(failedReads, 1);
  assert.equal(failed.status, "failed");
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
  const preview = completeEvidence(); preview.schema = "opl_studio_preview_smoke.v1";
  assert.throws(() => validateStableRuntimeEvidence(preview), /passed Studio Stable/);
  const failure = completeEvidence(); failure.checks.runtimeRefresh.busyObserved = false;
  assert.throws(() => validateStableRuntimeEvidence(failure), /Runtime UI refresh/);
  const turn = completeEvidence(); turn.checks.codexTurn.status = "connectivity_confirmed";
  assert.throws(() => validateStableRuntimeEvidence(turn), /generation attempt/);
  const simulated = completeEvidence(); simulated.checks.codexReadiness.simulated = true;
  assert.throws(() => validateStableRuntimeEvidence(simulated), /protocol readiness/);
});
