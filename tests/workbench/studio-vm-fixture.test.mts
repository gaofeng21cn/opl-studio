import { customModelAccessFixture } from "../../scripts/model-policy-fixture.ts";
import assert from "node:assert/strict";
import test from "node:test";

Object.assign(globalThis, {
  __OPL_CODEX_MODEL_POLICY__: {
    source: "test App policy",
    defaultModel: "test-model",
    defaultReasoningEffort: "high",
    visibleModels: [{ id: "test-model" }],
    reasoningEfforts: ["high"],
    autoLabel: { zh: "自动（推荐）", en: "Auto (recommended)" },
    knownModelReasoningEffortOverrides: {},
    acceptUnknownCatalogDefault: true,
    customModelAccess: customModelAccessFixture,
    useHighestSupportedReasoningForUnknown: true
  }
});

const { deriveWorkbenchModelFromState } = await import("../../plugins/opl-studio-client/src/client/workbench/workbenchModel.ts");
const { agentPackagePresentationStatus } = await import("../../plugins/opl-studio-client/src/client/workbench/SettingsPanel.tsx");
const fixtureState = (await import("../fixtures/studio-vm-fixture/state.json", { with: { type: "json" } })).default;

test("clean-VM Agent Packages resolve from the synthetic Framework directory", () => {
  const model = deriveWorkbenchModelFromState({ app_state: fixtureState } as never);
  const agents = model.packageLifecycle.filter((item) => item.packageRole === "standard_agent");
  assert.deepEqual(agents.map((item) => item.packageId), ["med-autoscience", "med-autogrant", "redcube-ai"]);
  for (const agent of agents) {
    assert.equal(agent.installed, true, `${agent.packageId} must read as installed`);
    assert.equal(agent.activated, true, `${agent.packageId} must read as activated`);
    assert.equal(agent.readiness.callable, true, `${agent.packageId} must be callable`);
    assert.equal(agent.readiness.launchAllowed, true, `${agent.packageId} must allow launch`);
    assert.equal(
      agentPackagePresentationStatus(agent),
      "ready",
      `${agent.packageId} must present as ready instead of checking`
    );
  }
  assert.equal(agents.filter((item) => agentPackagePresentationStatus(item) === "ready").length, 3);
});

test("clean-VM fixture keeps the Runtime producer projection usable", () => {
  const model = deriveWorkbenchModelFromState({ app_state: fixtureState } as never);
  const projection = JSON.stringify(model.workItemRuntime ?? {});
  for (const producer of ["MAS", "MAG", "RCA"]) {
    assert.ok(projection.includes(producer), `runtime projection must expose ${producer}`);
  }
});
