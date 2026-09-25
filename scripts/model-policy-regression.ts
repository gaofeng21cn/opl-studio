import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createCodexModelPolicy } from "./build-renderer.mjs";

const syntheticProfile = {
  default_session_profile: {
    model: "codex-future-primary",
    reasoning_effort: "max"
  },
  codex: {
    auto_model_policy: {
      configured_default: {
        model: "codex-future-primary",
        reasoning_effort: "max"
      },
      mode_default: "auto",
      frontier_model_preference_order: ["codex-future-primary", "codex-future-secondary"],
      known_model_reasoning_effort_overrides: {
        "codex-future-primary": "max"
      },
      unknown_default_model_policy: "accept_catalog_default_even_when_not_in_frontier_model_preference_order",
      unknown_model_reasoning_effort_policy: "highest_supported_reasoning_effort_from_catalog",
      catalog_unavailable_fallback: {
        model: "codex-future-primary",
        reasoning_effort: "max"
      }
    }
  },
  gui: {
    home: {
      codex_model_display_options: {
        auto_option: {
          label_zh: "自动（推荐）",
          label_en: "Auto (recommended)"
        },
        visible_models: [
          { id: "codex-future-primary", label_zh: "Future primary zh", label_en: "Future primary" },
          { id: "codex-future-secondary", label_zh: "Future secondary zh", label_en: "Future secondary" }
        ],
        user_reasoning_effort_options: ["low", "high", "xhigh", "max", "ultra"]
      }
    }
  }
};

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
assert.equal(runtimeOptions.find((option) => option.id === "codex-future-primary")?.available, true);
assert.equal(runtimeOptions.find((option) => option.id === "codex-future-secondary")?.available, true);
const runtimeAuto = resolveCodexSelection(runtimeOptions, "__auto", "low");
assert.equal(runtimeAuto.model.id, "codex-future-primary");
assert.equal(runtimeAuto.reasoningEffort, "max");
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
const pinnedPrimary = resolveCodexSelection(runtimeOptions, "codex-future-primary", "low");
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
  }],
  nextCursor: null
});
const futureOptions = resolveCodexModelOptions(futureCatalog.models);
const futureAuto = resolveCodexSelection(futureOptions, "__auto", "low");
assert.equal(futureCatalog.source, "codex_app_server_model_list");
assert.equal(futureAuto.model?.id, "codex-6");
assert.equal(futureAuto.reasoningEffort, "ultra");
assert.deepEqual(futureAuto.reasoningOptions, ["low", "high", "xhigh", "max", "ultra"]);
assert.equal(futureAuto.effectiveSelection, "__auto");
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

const cloneProfile = () => structuredClone(syntheticProfile);

const missingDisplay = cloneProfile();
delete (missingDisplay.gui.home as { codex_model_display_options?: unknown }).codex_model_display_options;
assert.throws(() => createCodexModelPolicy(missingDisplay), /gui\.home\.codex_model_display_options/);

const emptyModels = cloneProfile();
emptyModels.gui.home.codex_model_display_options.visible_models = [];
assert.throws(() => createCodexModelPolicy(emptyModels), /visible_models must be a non-empty array/);

const duplicateModels = cloneProfile();
duplicateModels.gui.home.codex_model_display_options.visible_models[1].id = "codex-future-primary";
assert.throws(() => createCodexModelPolicy(duplicateModels), /model ids must be unique/);

const missingDefault = cloneProfile();
missingDefault.default_session_profile.model = "codex-future-unlisted";
assert.throws(() => createCodexModelPolicy(missingDefault), /generated defaults must match codex\.auto_model_policy\.configured_default/);

const futureEffort = cloneProfile();
futureEffort.gui.home.codex_model_display_options.user_reasoning_effort_options = ["low", "future-high"];
futureEffort.codex.auto_model_policy.configured_default.reasoning_effort = "future-high";
futureEffort.default_session_profile.reasoning_effort = "future-high";
futureEffort.codex.auto_model_policy.catalog_unavailable_fallback.reasoning_effort = "future-high";
futureEffort.codex.auto_model_policy.known_model_reasoning_effort_overrides["codex-future-primary"] = "future-high";
assert.equal(createCodexModelPolicy(futureEffort).defaultReasoningEffort, "future-high");

const ultraEffort = cloneProfile();
ultraEffort.codex.auto_model_policy.configured_default.reasoning_effort = "ultra";
ultraEffort.default_session_profile.reasoning_effort = "ultra";
ultraEffort.codex.auto_model_policy.catalog_unavailable_fallback.reasoning_effort = "ultra";
ultraEffort.codex.auto_model_policy.known_model_reasoning_effort_overrides["codex-future-primary"] = "ultra";
ultraEffort.gui.home.codex_model_display_options.user_reasoning_effort_options = ["low", "ultra"];
assert.equal(createCodexModelPolicy(ultraEffort).defaultReasoningEffort, "ultra");

const missingDefaultEffort = cloneProfile();
missingDefaultEffort.gui.home.codex_model_display_options.user_reasoning_effort_options = ["low"];
assert.throws(() => createCodexModelPolicy(missingDefaultEffort), /default reasoning effort must be included/);

console.log(JSON.stringify({ status: "dynamic_app_model_policy_regression_passed" }));
