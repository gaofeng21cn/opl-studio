import { expect, test } from "bun:test";
import { createCodexModelPolicy } from "../../scripts/build-renderer.mjs";
import { cloneModelPolicyProfile } from "../../scripts/model-policy-fixture.ts";

Object.assign(globalThis, {
  __OPL_CODEX_MODEL_POLICY__: {
    source: "live-catalog-behavior-test",
    defaultModel: "app-default",
    defaultReasoningEffort: "max",
    visibleModels: [
      { id: "app-default", label_zh: "App 默认", label_en: "App default" },
      { id: "known-frontier", label_zh: "已知前沿", label_en: "Known frontier" },
      { id: "known-alternative", label_zh: "已知备选", label_en: "Known alternative" }
    ],
    reasoningEfforts: ["low", "high", "max", "ultra"],
    autoLabel: { zh: "自动", en: "Auto" },
    knownModelReasoningEffortOverrides: { "app-default": "max" },
    acceptUnknownCatalogDefault: false,
    useHighestSupportedReasoningForUnknown: true
  }
});

const { normalizeCodexModelCatalog } = await import("../../src/bridge/oplBridge-normalizers-codex.ts");
const {
  codexModelPolicy,
  modelLabel,
  resolveCodexModelOptions,
  resolveCodexSelection
} = await import("../../src/workbench/modelPolicy.ts");

type CatalogEntry = Parameters<typeof resolveCodexModelOptions>[0][number];

function catalogEntry(id: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id,
    model: id,
    displayName: id,
    isDefault: false,
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: ["low", "high"],
    hidden: false,
    ...overrides
  };
}

function withUnknownCatalogDefaultAcceptance(accepted: boolean) {
  const previous = codexModelPolicy.acceptUnknownCatalogDefault;
  codexModelPolicy.acceptUnknownCatalogDefault = accepted;
  return () => { codexModelPolicy.acceptUnknownCatalogDefault = previous; };
}

test("empty catalog discovery retains the configured App fallback", () => {
  // Given an empty discovery response.
  const catalog = normalizeCodexModelCatalog({ data: [], nextCursor: null });
  // When resolving options and Auto.
  const options = resolveCodexModelOptions(catalog.models);
  const automatic = resolveCodexSelection(options, "__auto", "low");
  // Then discovery remains unavailable and only the App fallback is available.
  expect(catalog.source).toBe("bridge_unavailable");
  expect(catalog.simulated).toBe(true);
  expect(options.filter(option => option.available).map(option => option.id)).toEqual(["app-default"]);
  expect(automatic.model?.id).toBe("app-default");
  expect(automatic.reasoningEffort).toBe("max");
  expect(automatic.model?.wireModel).toBe("app-default");
});

test("catalog identity and executable model names stay separate", () => {
  // Given a live catalog row whose stable identity is an opaque display id.
  const catalog = normalizeCodexModelCatalog({
    data: [{
      id: "opaque-row",
      model: "custom-wire",
      displayName: "Custom model",
      supportedReasoningEfforts: ["low", "high"]
    }]
  });

  // When the row is resolved for an explicit selection.
  const options = resolveCodexModelOptions(catalog.models);
  const selected = resolveCodexSelection(options, "opaque-row", "low");

  // Then UI selection keeps the catalog id while execution uses the wire name.
  expect(selected.model?.id).toBe("opaque-row");
  expect(selected.model?.wireModel).toBe("custom-wire");
});

test("hidden-only discovery stays distinct from an empty catalog", () => {
  // Given a successful response containing only a hidden model.
  const catalog = normalizeCodexModelCatalog({ data: [catalogEntry("app-default", {
    hidden: true,
    isDefault: true,
    supportedReasoningEfforts: ["hidden-effort"]
  })], nextCursor: null });
  // When resolving options and Auto.
  const options = resolveCodexModelOptions(catalog.models);
  const automatic = resolveCodexSelection(options, "__auto", "low");
  // Then the response is discovered but no hidden route becomes available.
  expect(catalog.source).toBe("codex_app_server_model_list");
  expect(catalog.simulated).toBeUndefined();
  expect(options.some(option => option.available)).toBe(false);
  expect(options.find(option => option.id === "app-default")?.supportedReasoningEfforts).not.toContain("hidden-effort");
  expect(automatic.model).toBeUndefined();
});

test("hidden known defaults and alternatives cannot affect Auto or reasoning metadata", () => {
  // Given hidden known rows alongside one visible frontier model.
  const options = resolveCodexModelOptions([
    catalogEntry("app-default", { hidden: true, isDefault: true, supportedReasoningEfforts: ["hidden-default-effort"] }),
    catalogEntry("known-alternative", { hidden: true, supportedReasoningEfforts: ["hidden-alternative-effort"] }),
    catalogEntry("known-frontier")
  ]);
  // When resolving Auto.
  const automatic = resolveCodexSelection(options, "__auto", "low");
  // Then hidden rows do not claim availability, default status, or efforts.
  expect(options.find(option => option.id === "app-default")?.available).toBe(false);
  expect(options.find(option => option.id === "app-default")?.isCatalogDefault).toBe(false);
  expect(options.find(option => option.id === "known-alternative")?.available).toBe(false);
  expect(options.flatMap(option => option.supportedReasoningEfforts)).not.toContain("hidden-default-effort");
  expect(options.flatMap(option => option.supportedReasoningEfforts)).not.toContain("hidden-alternative-effort");
  expect(automatic.model?.id).toBe("known-frontier");
});

test("hidden unknown alternatives are absent from fixed selection", () => {
  // Given a visible frontier model and a hidden custom model.
  const options = resolveCodexModelOptions([
    catalogEntry("known-frontier"),
    catalogEntry("custom-hidden", { hidden: true, isDefault: true })
  ]);
  // When resolving the hidden id explicitly.
  const explicit = resolveCodexSelection(options, "custom-hidden", "low");
  // Then no option or executable selection is created for it.
  expect(options.some(option => option.id === "custom-hidden")).toBe(false);
  expect(explicit.model).toBeUndefined();
  expect(explicit.effectiveSelection).toBe("custom-hidden");
});

test("hidden alias bridges cannot claim visible catalog models", () => {
  // Given a hidden alias bridge from the App default to a visible custom row.
  const options = resolveCodexModelOptions([
    catalogEntry("app-default", { model: "shared-alias", hidden: true, isDefault: true }),
    catalogEntry("custom-current", { model: "shared-alias", supportedReasoningEfforts: ["low", "ultra"] })
  ]);
  // When resolving options and Auto.
  const automatic = resolveCodexSelection(options, "__auto", "low");
  // Then the visible row remains an unclaimed custom model.
  const custom = options.find(option => option.id === "custom-current");
  expect(options.find(option => option.id === "app-default")?.available).toBe(false);
  expect(custom?.known).toBe(false);
  expect(custom?.isCatalogDefault).toBe(false);
  expect(automatic.model?.id).toBe("custom-current");
});

test("visible known aliases collapse without inheriting hidden metadata", () => {
  // Given two visible alias-linked rows for the App default and one hidden default row.
  const options = resolveCodexModelOptions([
    catalogEntry("app-default", { model: "app-canonical", supportedReasoningEfforts: ["low", "high"] }),
    catalogEntry("app-canonical", { model: "app-current", isDefault: true, defaultReasoningEffort: "max", supportedReasoningEfforts: ["high", "max"] }),
    catalogEntry("app-hidden", { model: "app-current", hidden: true, supportedReasoningEfforts: ["hidden-effort"] })
  ]);
  // When resolving the known option.
  const appDefault = options.find(option => option.id === "app-default");
  // Then only visible rows contribute its alias group and reasoning.
  expect(appDefault?.available).toBe(true);
  expect(appDefault?.isCatalogDefault).toBe(true);
  expect(appDefault?.supportedReasoningEfforts).toEqual(codexModelPolicy.reasoningOptions);
  expect(appDefault?.supportedReasoningEfforts).not.toContain("hidden-effort");
});

test("rejected unknown catalog defaults do not win Auto over other visible models", () => {
  // Given an unknown default and another visible custom model under reject policy.
  const options = resolveCodexModelOptions([
    catalogEntry("custom-default", { isDefault: true, supportedReasoningEfforts: ["low", "high", "ultra"] }),
    catalogEntry("custom-other")
  ]);
  // When resolving Auto.
  const automatic = resolveCodexSelection(options, "__auto", "low");
  // Then Auto uses the other model while the default remains visible.
  expect(automatic.model?.id).toBe("custom-other");
  expect(options.find(option => option.id === "custom-default")?.available).toBe(true);
});

test("a lone rejected unknown catalog default produces no automatic route", () => {
  // Given only an unknown catalog default under reject policy.
  const options = resolveCodexModelOptions([catalogEntry("custom-default", { isDefault: true })]);
  // When resolving Auto.
  const automatic = resolveCodexSelection(options, "__auto", "low");
  // Then the default marker is not silently adopted.
  expect(automatic.model).toBeUndefined();
});

test("all visible unknown models remain manually selectable when their default is rejected", () => {
  // Given an unknown default and alternative under reject policy.
  const options = resolveCodexModelOptions([
    catalogEntry("custom-default", { isDefault: true, supportedReasoningEfforts: ["low", "high", "ultra"] }),
    catalogEntry("custom-other")
  ]);
  // When selecting each visible custom id explicitly.
  const selections = ["custom-default", "custom-other"].map(id => resolveCodexSelection(options, id, "low"));
  // Then both selections resolve and retain their visible identities.
  expect(selections.map(selection => selection.model?.id)).toEqual(["custom-default", "custom-other"]);
  expect(selections[0]?.reasoningEffort).toBe("low");
  expect(selections[0]?.reasoningOptions).toEqual(["low", "high", "ultra"]);
  expect(modelLabel("custom-default", "en", options)).toBe("custom-default");
});

test("accepted unknown catalog defaults use their highest advertised effort after known fallbacks", () => {
  // Given unknown models and acceptance of the unknown default.
  const restore = withUnknownCatalogDefaultAcceptance(true);
  try {
    const options = resolveCodexModelOptions([
      catalogEntry("custom-other"),
      catalogEntry("custom-default", { isDefault: true, defaultReasoningEffort: "low", supportedReasoningEfforts: ["low", "high", "ultra"] })
    ]);
    // When resolving Auto.
    const automatic = resolveCodexSelection(options, "__auto", "low");
    // Then the unknown default wins over other custom rows and uses highest effort.
    expect(automatic.model?.id).toBe("custom-default");
    expect(automatic.reasoningEffort).toBe("ultra");
    expect(automatic.reasoningOptions).toEqual(["low", "high", "ultra"]);
  } finally {
    restore();
  }
});

test("an available App default precedes frontier and accepted unknown defaults", () => {
  // Given every Auto candidate and acceptance of the unknown default.
  const restore = withUnknownCatalogDefaultAcceptance(true);
  try {
    const options = resolveCodexModelOptions([
      catalogEntry("custom-default", { isDefault: true }),
      catalogEntry("known-frontier"),
      catalogEntry("app-default")
    ]);
    // When resolving Auto.
    const automatic = resolveCodexSelection(options, "__auto", "low");
    // Then App policy wins with its configured reasoning policy.
    expect(automatic.model?.id).toBe("app-default");
    expect(automatic.reasoningEffort).toBe("max");
    expect(automatic.reasoningOptions).toEqual(codexModelPolicy.reasoningOptions);
  } finally {
    restore();
  }
});

test("known frontier preference precedes an accepted unknown default", () => {
  // Given no App default but a known frontier and unknown default, with acceptance enabled.
  const restore = withUnknownCatalogDefaultAcceptance(true);
  try {
    const options = resolveCodexModelOptions([
      catalogEntry("custom-default", { isDefault: true }),
      catalogEntry("known-frontier")
    ]);
    // When resolving Auto.
    const automatic = resolveCodexSelection(options, "__auto", "low");
    // Then known frontier order wins with catalog reasoning metadata.
    expect(automatic.model?.id).toBe("known-frontier");
    expect(automatic.reasoningEffort).toBe("high");
    expect(automatic.reasoningOptions).toEqual(["low", "high"]);
  } finally {
    restore();
  }
});

test("visible catalog aliases are claimed once for Auto and fixed options", () => {
  // Given alias-linked custom rows and acceptance of their visible default.
  const restore = withUnknownCatalogDefaultAcceptance(true);
  try {
    const options = resolveCodexModelOptions([
      catalogEntry("custom-old", { model: "custom-shared" }),
      catalogEntry("custom-current", { model: "custom-shared", isDefault: true, supportedReasoningEfforts: ["low", "ultra"] })
    ]);
    // When resolving Auto.
    const automatic = resolveCodexSelection(options, "__auto", "low");
    // Then one logical custom option represents the alias group.
    expect(options.filter(option => !option.known).map(option => option.id)).toEqual(["custom-current"]);
    expect(automatic.model?.id).toBe("custom-current");
    expect(automatic.reasoningEffort).toBe("ultra");
  } finally {
    restore();
  }
});

test("an unavailable explicit App default never falls back silently", () => {
  // Given a non-empty catalog that omits the App default.
  const options = resolveCodexModelOptions([catalogEntry("known-frontier")]);
  // When selecting the omitted App default explicitly.
  const explicit = resolveCodexSelection(options, "app-default", "low");
  // Then the fixed selection remains explicit but unavailable.
  expect(explicit.model).toBeUndefined();
  expect(explicit.effectiveSelection).toBe("app-default");
  expect(explicit.reasoningEffort).toBe("max");
});

test("renderer injection rejects unrecognized Auto policy strings", () => {
  // Given each behavior-bearing policy string with an unrecognized value.
  const invalidDefault = cloneModelPolicyProfile();
  invalidDefault.codex.auto_model_policy.unknown_default_model_policy = "invented_default_policy";
  const invalidReasoning = cloneModelPolicyProfile();
  invalidReasoning.codex.auto_model_policy.unknown_model_reasoning_effort_policy = "invented_reasoning_policy";
  const invalidFallback = cloneModelPolicyProfile();
  invalidFallback.codex.auto_model_policy.catalog_without_default_policy = "invented_fallback_policy";
  // When projecting each profile.
  // Then projection fails explicitly instead of silently selecting a boolean fallback.
  expect(() => createCodexModelPolicy(invalidDefault)).toThrow(/unknown_default_model_policy/);
  expect(() => createCodexModelPolicy(invalidReasoning)).toThrow(/unknown_model_reasoning_effort_policy/);
  expect(() => createCodexModelPolicy(invalidFallback)).toThrow(/catalog_without_default_policy/);
});

test("renderer injection preserves both unknown-default policy decisions", () => {
  // Given the supported ignore and accept policy strings.
  const acceptedProfile = cloneModelPolicyProfile();
  acceptedProfile.codex.auto_model_policy.unknown_default_model_policy = "accept_catalog_default_even_when_not_in_frontier_model_preference_order";
  // When projecting both profiles.
  const rejected = createCodexModelPolicy(cloneModelPolicyProfile());
  const accepted = createCodexModelPolicy(acceptedProfile);
  // Then only the explicit accept string enables unknown-default Auto adoption.
  expect(rejected.acceptUnknownCatalogDefault).toBe(false);
  expect(accepted.acceptUnknownCatalogDefault).toBe(true);
  expect(rejected.useHighestSupportedReasoningForUnknown).toBe(true);
});
