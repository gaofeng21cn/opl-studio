import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createCodexModelPolicy } from "./build-renderer.mjs";
import { cloneModelPolicyProfile, syntheticProfile } from "./model-policy-fixture.ts";

const missingInjection = spawnSync(
  "bun",
  ["--eval", 'await import("./src/workbench/modelPolicy.ts")'],
  { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8" }
);
assert.notEqual(missingInjection.status, 0);
assert.match(missingInjection.stderr, /invalid App-owned Codex model policy injection: policy is missing/);

const injectedPolicy = createCodexModelPolicy(syntheticProfile);
(globalThis as typeof globalThis & { __OPL_CODEX_MODEL_POLICY__?: typeof injectedPolicy })
  .__OPL_CODEX_MODEL_POLICY__ = injectedPolicy;

const {
  codexModelPolicy,
  autoModelLabel,
  conversationModelLabel,
  reasoningLabel,
  resolveCodexModelOptions,
  resolveCodexSelection
} = await import("../src/workbench/modelPolicy.ts");
const { normalizeCodexModelCatalog } = await import("../src/bridge/oplBridge.ts");

assert.deepEqual(
  codexModelPolicy.modelOptions.map((option) => option.id),
  syntheticProfile.gui.home.codex_model_display_options.visible_models.map((option) => option.id)
);
assert.equal(codexModelPolicy.defaultModel, syntheticProfile.default_session_profile.model);
assert.equal(codexModelPolicy.source, "one-person-lab-app/contracts/app-product-profile.json#codex.auto_model_policy");
assert.deepEqual(
  codexModelPolicy.reasoningOptions,
  syntheticProfile.gui.home.codex_model_display_options.user_reasoning_effort_options
);
assert.equal(codexModelPolicy.defaultReasoningEffort, syntheticProfile.default_session_profile.reasoning_effort);
assert.equal(codexModelPolicy.autoLabel.zh, "自动（推荐）");
assert.equal(codexModelPolicy.autoLabel.en, "Auto (recommended)");

const runtimeOptions = resolveCodexModelOptions([{
  id: "codex-future-secondary",
  defaultReasoningEffort: "high",
  supportedReasoningEfforts: ["low", "high"]
}]);
assert.deepEqual(runtimeOptions.map((option) => option.id), ["codex-future-primary", "codex-future-secondary"]);
assert.equal(runtimeOptions.find((option) => option.id === "codex-future-primary")?.available, false);
assert.equal(runtimeOptions.find((option) => option.id === "codex-future-secondary")?.available, true);
const runtimeAuto = resolveCodexSelection(runtimeOptions, "__auto", "low");
assert.equal(runtimeAuto.model.id, "codex-future-secondary");
assert.equal(runtimeAuto.reasoningEffort, "high");
assert.equal(reasoningLabel("max", "zh"), "推理最大");
assert.equal(reasoningLabel("max", "en", true), "Max");
assert.equal(runtimeAuto.effectiveSelection, "__auto");
assert.equal(autoModelLabel("zh"), "自动（推荐）");
assert.equal(autoModelLabel("en"), "Auto (recommended)");
assert.equal(conversationModelLabel("__auto", runtimeAuto.model?.id, "en"), "Auto (recommended)");
assert.equal(conversationModelLabel("__auto", undefined, "en"), "Auto (recommended)");
const pinnedSecondary = resolveCodexSelection(runtimeOptions, "codex-future-secondary", "low");
assert.equal(pinnedSecondary.model.id, "codex-future-secondary");
assert.equal(pinnedSecondary.reasoningEffort, "low");
assert.equal(conversationModelLabel("codex-future-secondary", pinnedSecondary.model?.id, "zh"), "Future secondary zh");
const unavailablePrimary = resolveCodexSelection(runtimeOptions, "codex-future-primary", "low");
assert.equal(unavailablePrimary.model, undefined);
assert.equal(unavailablePrimary.effectiveSelection, "codex-future-primary");
const primaryCatalogOptions = resolveCodexModelOptions([{
  id: "codex-future-primary",
  defaultReasoningEffort: "max",
  supportedReasoningEfforts: ["low", "max"]
}]);
const pinnedPrimary = resolveCodexSelection(primaryCatalogOptions, "codex-future-primary", "low");
assert.equal(pinnedPrimary.model?.id, "codex-future-primary");
assert.equal(pinnedPrimary.reasoningEffort, "low");
assert.equal(pinnedPrimary.effectiveSelection, "codex-future-primary");

const aliasLinkedOptions = resolveCodexModelOptions([{
  id: "codex-future-primary",
  model: "codex-primary-canonical",
  displayName: "Legacy primary alias",
  isDefault: false,
  defaultReasoningEffort: "high",
  supportedReasoningEfforts: ["low", "high"]
}, {
  id: "codex-primary-canonical",
  model: "codex-primary-current",
  displayName: "Current catalog default",
  isDefault: true,
  defaultReasoningEffort: "max",
  supportedReasoningEfforts: ["high", "max"]
}]);
assert.deepEqual(
  aliasLinkedOptions.map((option) => option.id),
  ["codex-future-primary", "codex-future-secondary"]
);
const aliasLinkedPrimary = aliasLinkedOptions.find((option) => option.id === "codex-future-primary");
assert.equal(aliasLinkedPrimary?.isCatalogDefault, true);
assert.deepEqual(aliasLinkedPrimary?.supportedReasoningEfforts, codexModelPolicy.reasoningOptions);
const aliasLinkedAuto = resolveCodexSelection(aliasLinkedOptions, "__auto", "low");
assert.equal(aliasLinkedAuto.model?.id, "codex-future-primary");
assert.equal(aliasLinkedAuto.reasoningEffort, "max");

const futureCatalog = normalizeCodexModelCatalog({
  data: [{
    id: "codex-future-secondary",
    isDefault: false,
    supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }]
  }, {
    id: "codex-6",
    displayName: "Codex 6",
    isDefault: true,
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: [
      { reasoningEffort: "low" },
      { reasoningEffort: "high" },
      { reasoningEffort: "xhigh" },
      { reasoningEffort: "max" },
      { reasoningEffort: "ultra" }
    ]
  }, {
    id: "codex-hidden",
    displayName: "Hidden catalog model",
    hidden: true,
    supportedReasoningEfforts: [{ reasoningEffort: "low" }]
  }],
  nextCursor: null
});
const futureOptions = resolveCodexModelOptions(futureCatalog.models, true);
const futureAuto = resolveCodexSelection(futureOptions, "__auto", "low");
assert.equal(futureCatalog.source, "codex_app_server_model_list");
assert.equal(futureAuto.model?.id, "codex-future-secondary");
assert.equal(futureAuto.reasoningEffort, "high");
assert.deepEqual(futureAuto.reasoningOptions, ["low", "high"]);
assert.equal(futureAuto.effectiveSelection, "__auto");
assert.equal(futureOptions.some((option) => option.id === "codex-6"), true);
assert.equal(futureOptions.find((option) => option.id === "codex-6")?.label_en, "Codex 6");
assert.equal(futureCatalog.models.find((model) => model.id === "codex-hidden")?.hidden, true);
assert.equal(futureOptions.some((option) => option.id === "codex-hidden"), false);

const localProviderDefaultOptions = resolveCodexModelOptions([{
  id: "deepseek-flash",
  displayName: "DeepSeek Flash",
  isDefault: false,
  defaultReasoningEffort: "high",
  supportedReasoningEfforts: ["low", "high"]
}]);
assert.equal(localProviderDefaultOptions.some((option) => option.id === "deepseek-flash"), false);
assert.equal(resolveCodexSelection(localProviderDefaultOptions, "__auto", "low").model, undefined);
const emptyOptions = resolveCodexModelOptions([]);
assert.equal(emptyOptions.find((option) => option.id === "codex-future-primary")?.available, true);
assert.equal(emptyOptions.find((option) => option.id === "codex-future-secondary")?.available, false);
const emptyCatalogAuto = resolveCodexSelection(emptyOptions, "__auto", "low");
assert.equal(emptyCatalogAuto.model?.id, "codex-future-primary");
assert.equal(emptyCatalogAuto.reasoningEffort, "max");
const unavailableSecondary = resolveCodexSelection(emptyOptions, "codex-future-secondary", "high");
assert.equal(unavailableSecondary.effectiveSelection, "codex-future-secondary");
assert.equal(unavailableSecondary.model, undefined);
assert.equal(unavailableSecondary.reasoningEffort, "max");

const missingDisplay = cloneModelPolicyProfile();
delete (missingDisplay.gui.home as { codex_model_display_options?: unknown }).codex_model_display_options;
assert.throws(() => createCodexModelPolicy(missingDisplay), /gui\.home\.codex_model_display_options/);

const emptyModels = cloneModelPolicyProfile();
emptyModels.gui.home.codex_model_display_options.visible_models = [];
assert.throws(() => createCodexModelPolicy(emptyModels), /visible_models must be a non-empty array/);

const duplicateModels = cloneModelPolicyProfile();
duplicateModels.gui.home.codex_model_display_options.visible_models[1].id = "codex-future-primary";
assert.throws(() => createCodexModelPolicy(duplicateModels), /model ids must be unique/);

const missingDefault = cloneModelPolicyProfile();
missingDefault.default_session_profile.model = "codex-future-unlisted";
assert.throws(() => createCodexModelPolicy(missingDefault), /generated defaults must match codex\.auto_model_policy\.configured_default/);

const futureEffort = cloneModelPolicyProfile();
futureEffort.gui.home.codex_model_display_options.user_reasoning_effort_options = ["low", "future-high"];
futureEffort.codex.auto_model_policy.configured_default.reasoning_effort = "future-high";
futureEffort.default_session_profile.reasoning_effort = "future-high";
futureEffort.codex.auto_model_policy.catalog_unavailable_fallback.reasoning_effort = "future-high";
futureEffort.codex.auto_model_policy.known_model_reasoning_effort_overrides["codex-future-primary"] = "future-high";
assert.equal(createCodexModelPolicy(futureEffort).defaultReasoningEffort, "future-high");

const ultraEffort = cloneModelPolicyProfile();
ultraEffort.codex.auto_model_policy.configured_default.reasoning_effort = "ultra";
ultraEffort.default_session_profile.reasoning_effort = "ultra";
ultraEffort.codex.auto_model_policy.catalog_unavailable_fallback.reasoning_effort = "ultra";
ultraEffort.codex.auto_model_policy.known_model_reasoning_effort_overrides["codex-future-primary"] = "ultra";
ultraEffort.gui.home.codex_model_display_options.user_reasoning_effort_options = ["low", "ultra"];
assert.equal(createCodexModelPolicy(ultraEffort).defaultReasoningEffort, "ultra");

const missingDefaultEffort = cloneModelPolicyProfile();
missingDefaultEffort.gui.home.codex_model_display_options.user_reasoning_effort_options = ["low"];
assert.throws(() => createCodexModelPolicy(missingDefaultEffort), /default reasoning effort must be included/);

console.log(JSON.stringify({ status: "dynamic_app_model_policy_regression_passed" }));
