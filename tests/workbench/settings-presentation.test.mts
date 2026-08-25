import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    useHighestSupportedReasoningForUnknown: true
  }
});

const presentation = await import("../../src/workbench/SettingsPanel.tsx");
const settingsSource = readFileSync(new URL("../../src/workbench/SettingsPanel.tsx", import.meta.url), "utf8");

test("settings navigation exposes primary categories with related destinations grouped inside", () => {
  assert.deepEqual(
    presentation.settingsDestinations("zh").map((destination) => destination.id),
    ["overview", "account", "resources", "workspace", "agents", "services", "preferences", "about"]
  );
  assert.deepEqual(
    presentation.settingsSubDestinations("account", "zh").map((destination) => destination.id),
    ["account", "models"]
  );
  assert.deepEqual(
    presentation.settingsSubDestinations("agents", "zh").map((destination) => destination.id),
    ["agents", "capabilities", "instructions"]
  );
  assert.deepEqual(
    presentation.settingsSubDestinations("services", "zh").map((destination) => destination.id),
    ["services", "updates", "diagnostics"]
  );
});

test("package descriptions prefer the active locale and allow an English fallback", () => {
  const localized = {
    description: "Raw English description.",
    descriptionI18n: {
      zh: "中文描述。",
      en: "Localized English description."
    },
    packageRole: "standard_agent"
  };
  assert.equal(presentation.localizedPackageDescription(localized, "zh"), localized.descriptionI18n.zh);
  assert.equal(presentation.localizedPackageDescription(localized, "en"), localized.descriptionI18n.en);

  const englishOnly = {
    ...localized,
    descriptionI18n: { en: "English fallback description." }
  };
  assert.equal(presentation.localizedPackageDescription(englishOnly, "zh"), englishOnly.descriptionI18n.en);

  const rawEnglishOnly = {
    ...localized,
    descriptionI18n: {}
  };
  assert.equal(presentation.localizedPackageDescription(rawEnglishOnly, "zh"), rawEnglishOnly.description);

  const roleOnly = { description: "", descriptionI18n: {}, packageRole: "standard_agent" };
  assert.notEqual(presentation.localizedPackageDescription(roleOnly, "zh"), "");
  assert.notEqual(presentation.localizedPackageDescription(roleOnly, "en"), "");
});

test("internal status and package role identifiers are projected as user-facing values", () => {
  assert.equal(presentation.statusTone("not_available"), "attention");
  assert.equal(presentation.statusTone("app_state_projection"), "neutral");
  assert.equal(presentation.statusTone("25/25"), "ready");
  assert.equal(presentation.statusTone("4/5"), "attention");
  assert.equal(presentation.formatStatus("25/25", "zh"), "25 / 25 可用");
  assert.equal(presentation.formatStatus("4/5", "en"), "4 / 5 available");
  assert.notEqual(presentation.formatStatus("preview_legacy_modules_fallback", "zh"), "preview_legacy_modules_fallback");
  assert.notEqual(presentation.packageRoleLabel("standard_agent", "zh"), "standard_agent");
  assert.notEqual(presentation.formatUpdateChannel("private_canary", "zh"), "private_canary");
});

test("standard Agent summary is derived from the same installed, enabled, callable, and launchable axes shown in the row", () => {
  const agent = (overrides: Record<string, unknown> = {}) => ({
    installed: true,
    activated: true,
    packageRole: "standard_agent",
    readiness: { callable: true, launchAllowed: true },
    homeShortcuts: [{ route: { kind: "codex_agent" } }],
    ...overrides
  }) as never;

  assert.equal(presentation.agentPackagePresentationStatus(agent()), "ready");
  assert.equal(presentation.agentPackagePresentationStatus(agent({ installed: false })), "not_installed");
  assert.equal(presentation.agentPackagePresentationStatus(agent({ activated: false })), "disabled");
  assert.equal(presentation.agentPackagePresentationStatus(agent({ readiness: { callable: false, launchAllowed: true } })), "unavailable");
  assert.equal(presentation.agentPackagePresentationStatus(agent({ readiness: { callable: true, launchAllowed: null } })), "checking");
  assert.equal(presentation.agentPackagePresentationStatus(agent({ homeShortcuts: [] })), "unavailable");
  assert.equal(presentation.agentPackagePresentationStatus(agent({ packageRole: "workflow_profile", homeShortcuts: [] })), "ready");
});

test("agent catalog keeps agent and workflow packages together while excluding capability packages", () => {
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "standard_agent" }), true);
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "workflow_profile" }), true);
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "capability_package" }), false);
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "framework_capability_package" }), false);
});

test("agent catalog keeps Official and All scoped to agents while exposing App-owned manifest install", () => {
  assert.match(settingsSource, /useState<"official" \| "all">\("official"\)/);
  assert.match(settingsSource, /scope === "all" \|\| item\.official/);
  assert.match(settingsSource, /当前没有自定义智能体/);
  assert.match(settingsSource, /添加智能体/);
  assert.match(settingsSource, /manifest_url: manifestUrl\.trim\(\), trust_tier: trustTier/);
  assert.match(settingsSource, /actionId: manifestInstallAction\.actionId/);
  assert.match(settingsSource, /dryRunSupported: manifestInstallAction\.dryRunSupported/);
  assert.doesNotMatch(settingsSource, /agent_package_install_from_manifest_url/);
});

test("capability catalog keeps projected capability package roles out of the agent page", () => {
  assert.equal(presentation.isCapabilityCatalogPackage({ packageId: "mas-scholar-skills", packageRole: "capability_package" }), true);
  assert.equal(presentation.isCapabilityCatalogPackage({ packageId: "framework-required", packageRole: "framework_required_capability_package" }), true);
  assert.equal(presentation.isCapabilityCatalogPackage({ packageId: "optional-capability", packageRole: "optional_capability_package" }), true);
  assert.equal(presentation.isCapabilityCatalogPackage({ packageId: "mas", packageRole: "standard_agent" }), false);
  assert.equal(presentation.isCapabilityCatalogPackage({ packageId: "workflow", packageRole: "workflow_profile" }), false);
  assert.equal(presentation.isCapabilityCatalogPackage({ packageId: "missing_bridge", packageRole: "capability_package" }), false);
});

test("capability package dependencies keep their dynamic status in the capability catalog", () => {
  assert.equal(presentation.packageDependencyPresentationStatus({
    packageId: "mas-scholar-skills",
    required: true,
    present: true,
    callable: true,
    status: "ready",
    reasons: []
  }), "ready");
  assert.equal(presentation.packageDependencyPresentationStatus({
    packageId: "future-capability",
    required: true,
    present: false,
    callable: false,
    status: "missing",
    reasons: ["not_installed"]
  }), "unavailable");
});

test("storage absence is neutral and does not turn missing measurements into user action", () => {
  assert.equal(presentation.storagePresentationStatus({
    status: "attention_required",
    reasonCode: "inventory_cache_stale",
    observedAt: "2026-08-17T06:08:53.852Z"
  } as never), "usage_not_measured");
  assert.equal(presentation.storagePresentationStatus({
    status: "not_configured",
    reasonCode: "webui_data_root_not_configured"
  } as never), "not_configured");
  assert.equal(presentation.statusTone("usage_not_measured"), "neutral");
  assert.equal(presentation.formatStatus("usage_not_measured", "zh"), "未统计");
  assert.equal(presentation.storagePresentationStatus({
    status: "available"
  } as never), "usage_not_measured");
  assert.equal(presentation.storagePresentationStatus({
    status: "attention_required",
    reasonCode: "inventory_cache_write_failed"
  } as never), "inventory_refresh_failed");
  assert.equal(presentation.formatStatus("inventory_refresh_failed", "zh"), "统计失败");
});

test("Gateway model access action is needed only when a different source is known", () => {
  const projection = (providerName?: string, modelAccessSource?: string) => ({
    codex: { providerName, modelAccessSource }
  }) as never;

  assert.equal(presentation.gatewayModelAccessState(projection("OPL Gateway", "codex_login")), "current");
  assert.equal(presentation.gatewayModelAccessState(projection(undefined, "gateway_account")), "current");
  assert.equal(presentation.gatewayModelAccessState(projection("Other provider", "api_key")), "different");
  assert.equal(presentation.gatewayModelAccessState(projection()), "unknown");
});

test("Gateway access presentation keeps none, API Key, and account states mutually exclusive", () => {
  const projection = (gatewayConnectionMode: "none" | "manual_key" | "account") => ({ gatewayConnectionMode }) as never;
  assert.equal(presentation.gatewayConnectionPresentation(undefined, undefined, "loading"), "loading");
  assert.equal(presentation.gatewayConnectionPresentation(undefined, undefined, "error"), "error");
  assert.equal(presentation.gatewayConnectionPresentation(projection("none"), undefined, "ready"), "none");
  assert.equal(presentation.gatewayConnectionPresentation(projection("manual_key"), undefined, "ready"), "manual_key");
  assert.equal(presentation.gatewayConnectionPresentation(projection("account"), undefined, "ready"), "account");
  assert.equal(presentation.gatewayConnectionPresentation(undefined, {
    displayName: "高峰",
    status: "connected",
    sourceRef: "test"
  } as never, "ready"), "account");
  assert.equal(presentation.gatewayConnectionPresentation(undefined, {
    displayName: "高峰",
    status: "connected",
    sourceRef: "cached"
  } as never, "loading"), "account");
  assert.equal(presentation.gatewayConnectionPresentation(projection("none"), {
    displayName: "stale account",
    status: "connected",
    sourceRef: "test"
  } as never, "ready"), "none");
});

test("settings uses the selected destination as the single page heading", () => {
  assert.match(settingsSource, /<h1>\{copy\[selectedDestination\]\}<\/h1>/);
  assert.doesNotMatch(settingsSource, /<h1>\{activeGroup\?\.label \?\? copy\[selectedDestination\]\}<\/h1>/);
  assert.match(settingsSource, /activeGroup\.destinations\.filter\(\(destination\) => destination\.id !== selectedDestination\)/);
  assert.doesNotMatch(settingsSource, /aria-current=\{destination\.id === selectedDestination \? "page" : undefined\}/);
});

test("Gateway account identity and usage render only from a real account projection", () => {
  assert.doesNotMatch(settingsSource, /missingGateway(Label|Detail)/);
  assert.match(settingsSource, /\{showAccountDetails \? \(\s*<>\s*<div className="gateway-identity">/s);
  assert.match(settingsSource, /data-testid="opl-settings-gateway-empty"/);
  assert.match(settingsSource, /<SettingRow label=\{settings\.locale === "zh" \? "余额" : "Balance"\}>/);
  assert.match(settingsSource, /showAccountDetails = gatewayAccountReady && !editingAccess/);
  assert.match(settingsSource, /showManualKeySummary = gatewayConnectionState === "manual_key" && !editingAccess/);
  assert.match(settingsSource, /gatewayConnectionState === "manual_key"\)/);
  assert.match(settingsSource, /data-testid="opl-settings-access-unavailable"/);
  assert.doesNotMatch(settingsSource, /gatewayLoginVisible = Boolean\(onGatewayLogin\) && \(!gateway/);
  assert.doesNotMatch(settingsSource, /gatewayDeviceLabel|设备名称|Device name/);
  assert.match(settingsSource, /editingAccess && gatewayConnectionState !== "none"/);
});
