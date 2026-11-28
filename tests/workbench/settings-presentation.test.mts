import { customModelAccessFixture } from "../../scripts/model-policy-fixture.ts";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

const presentation = await import("../../plugins/core/opl-studio-client/src/client/workbench/SettingsPanel.tsx");
const workbenchServices = await import("../../plugins/core/opl-studio-client/src/client/workbench/plugins/WorkbenchServicesPanel.tsx");
const { mergeBackgroundTaskIssue, startupCheckPresentation } = await import("../../plugins/core/opl-studio-client/src/client/workbench/startupCheckPresentation.ts");
const { normalizeInitializeReadback } = await import("../../plugins/core/opl-studio-client/src/client/bridge/oplBridge.ts");
const settingsSource = readFileSync(new URL("../../plugins/core/opl-studio-client/src/client/workbench/SettingsPanel.tsx", import.meta.url), "utf8") + readdirSync(new URL("../../plugins/core/opl-studio-client/src/client/workbench/settings/", import.meta.url), { recursive: true }).filter(file => String(file).endsWith(".tsx")).map(file => readFileSync(new URL(`../../plugins/core/opl-studio-client/src/client/workbench/settings/${file}`, import.meta.url), "utf8")).join("\n");

test("missing startup data never becomes false readiness or fabricated 0/0 counts", () => {
  const input = normalizeInitializeReadback({ readback: { exitCode: 0 } });
  assert.equal(input.systemInitialize.setupFlow.readyToLaunch, undefined);
  const view = startupCheckPresentation(input, "ready", true);
  assert.equal(view.status, "unknown");
  assert.match(view.detail, /重新检查/);
  assert.doesNotMatch(view.detail, /0 \/ 0/);
});

test("startup blockers and maintenance project specific reasons and setting destinations", () => {
  const input = normalizeInitializeReadback({ system_initialize: {
    setup_flow: { ready_to_launch: true, progress: { required_completed_count: 3, required_total_count: 3 } },
    checklist: [{ item_id: "family_runtime_provider", user_action_required: true, reason_code: "runway_degraded" }]
  } });
  const view = startupCheckPresentation(input, "ready", true);
  assert.equal(view.status, "attention_needed");
  assert.equal(view.issues[0].destination, "services");
  assert.match(view.detail, /Runway.*定时任务/);
  assert.match(view.detail, /3 \/ 3/);
  assert.equal(startupCheckPresentation(input, "error", true).status, "error");
  const unknownReason = startupCheckPresentation(normalizeInitializeReadback({system_initialize: {setup_flow: {ready_to_launch: false}}}), "ready", true);
  assert.equal(unknownReason.issues[0].destination, "diagnostics");
  assert.match(unknownReason.detail, /未返回原因/);
});

test("background runtime readiness does not duplicate its initialize issue", () => {
  const startupIssue = {
    id: "startup:family_runtime_provider",
    title: "后台任务服务",
    detail: "在服务状态中检查 Runway 和定时任务。",
    destination: "services" as const
  };
  const merged = mergeBackgroundTaskIssue([startupIssue], {
    status: "degraded",
    scheduleRunner: { running: true, tickIntervalMs: 5000 }
  }, true);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.id, "startup:family_runtime_provider");
  assert.match(merged[0]?.detail ?? "", /普通对话可继续/);

  const runtimeOnly = mergeBackgroundTaskIssue([], {
    status: "stopped",
    scheduleRunner: { running: false, tickIntervalMs: 5000 }
  }, true);
  assert.deepEqual(runtimeOnly.map((issue) => issue.id), ["tasks"]);
  assert.deepEqual(mergeBackgroundTaskIssue([], {
    status: "unknown",
    scheduleRunner: { running: null, tickIntervalMs: null }
  }, true), []);

  const original = [startupIssue];
  const unchanged = mergeBackgroundTaskIssue(original, {
    status: "running",
    scheduleRunner: { running: true, tickIntervalMs: 5000 }
  }, true);
  unchanged.push({ id: "state", title: "状态刷新失败", detail: "请重试。", destination: "diagnostics" });
  assert.deepEqual(original, [startupIssue]);
});

test("schedule history presents human states rather than internal executor values", () => {
  assert.equal(workbenchServices.scheduleRunStatus("completed", true), "已完成");
  assert.equal(workbenchServices.scheduleRunStatus("running", true), "运行中");
  assert.equal(workbenchServices.scheduleRunStatus(undefined, true), "待确认");
});

test("settings navigation exposes primary categories with related destinations grouped inside", () => {
  assert.deepEqual(
    presentation.settingsDestinations("zh").map((destination) => destination.id),
    ["overview", "account", "resources", "workspace", "capabilities", "services", "preferences", "about"]
  );
  assert.deepEqual(
    presentation.settingsSubDestinations("account", "zh").map((destination) => destination.id),
    ["account", "models"]
  );
  assert.deepEqual(
    presentation.settingsSubDestinations("capabilities", "zh").map((destination) => destination.id),
    ["capabilities", "instructions"]
  );
  assert.deepEqual(
    presentation.settingsSubDestinations("services", "zh").map((destination) => destination.id),
    ["services", "updates", "diagnostics"]
  );
  assert.equal(presentation.settingsDestinations("zh").some((destination) => destination.id === "about"), true);
  assert.equal(presentation.settingsDestinations("zh").some((destination) => destination.id === "schedules" || destination.id === "memory"), false);
  assert.equal(presentation.navigationGroups("zh").find((group) => group.id === "connections_deployment")?.label, "资料与连接");
  assert.equal(presentation.navigationGroups("en").find((group) => group.id === "connections_deployment")?.label, "Libraries & Connections");
  assert.equal(presentation.navigationGroups("zh").find((group) => group.id === "connections_deployment")?.destinations[0]?.label, "资料与连接");
  assert.equal(presentation.navigationGroups("en").find((group) => group.id === "connections_deployment")?.destinations[0]?.label, "Libraries & connections");
  assert.match(settingsSource, /role="tablist"/);
  assert.match(settingsSource, /role=\{usesDestinationTabs \? "tabpanel" : "region"\}/);
  assert.match(settingsSource, /ArrowRight|ArrowLeft/);
  assert.match(settingsSource, /settings-memory-context/);
  assert.match(settingsSource, /settings-mobile-back/);
  assert.match(settingsSource, /data-mobile-nav/);
  assert.match(settingsSource, /onOpenSchedules/);
  assert.match(settingsSource, /groups\.find\(\(group\) => group\.destinations\.some\(\(destination\) => destination\.id === selectedDestination\)\)/);
});

test("settings pages expose a purpose statement for every destination", () => {
  for (const destination of presentation.settingsDestinations("zh")) {
    const page = presentation.settingsPagePresentationFor(destination.id, "zh");
    assert.ok(page.eyebrow.length > 0);
    assert.ok(page.description.length > 0);
  }
});

test("official DSH capabilities expose adoption status and owner semantics", () => {
  assert.deepEqual(presentation.officialDshCapabilities.map((capability) => capability.id), [
    "dsh-plugin-manager",
    "dsh-auto-review",
    "dsh-shortcuts",
    "dsh-time-context",
    "dsh-schedule",
    "dsh-inspector",
    "dsh-voice-input"
  ]);
  const schedule = presentation.officialDshCapabilities.find((capability) => capability.id === "dsh-schedule");
  assert.ok(schedule);
  assert.equal(presentation.officialDshCapabilityStatus(schedule, [], "zh").status, "integrated");
  const pluginManager = presentation.officialDshCapabilities.find((capability) => capability.id === "dsh-plugin-manager");
  assert.ok(pluginManager);
  assert.equal(presentation.officialDshCapabilityStatus(pluginManager, [], "zh").status, "integrated");
  assert.match(presentation.officialDshCapabilityStatus(pluginManager, [{ id: "plugin-manager", name: "plugin-manager", description: "", enabled: true, callable: false }], "zh").detail, /实际可用性/);
  assert.equal(presentation.formatStatus("planned", "zh"), "待接入");
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
  assert.equal(presentation.localizedPackageDescription(roleOnly, "zh"), "尚未提供软件说明。");
  assert.equal(presentation.localizedPackageDescription(roleOnly, "en"), "No software description provided.");
});

test("internal status and package role identifiers are projected as user-facing values", () => {
  assert.equal(presentation.statusTone("not_available"), "attention");
  assert.equal(presentation.statusTone("app_state_projection"), "neutral");
  assert.equal(presentation.statusTone("25/25"), "ready");
  assert.equal(presentation.statusTone("4/5"), "attention");
  assert.equal(presentation.formatStatus("25/25", "zh"), "25 / 25 可用");
  assert.equal(presentation.formatStatus("4/5", "en"), "4 / 5 available");
  assert.equal(presentation.formatStatus(undefined, "zh"), "尚未读取");
  assert.equal(presentation.formatStatus("unknown", "zh"), "待确认");
  assert.notEqual(presentation.formatStatus("preview_legacy_modules_fallback", "zh"), "preview_legacy_modules_fallback");
  assert.notEqual(presentation.packageRoleLabel("standard_agent", "zh"), "standard_agent");
  assert.notEqual(presentation.formatUpdateChannel("private_canary", "zh"), "private_canary");
});

test("Docker runtime checks collapse quiet probe states into one useful summary", () => {
  assert.deepEqual(presentation.dockerDiagnosticPresentation(null, "zh"), {
    status: "not_checked",
    detail: "尚未运行检查",
    issues: []
  });
  assert.deepEqual(presentation.dockerDiagnosticPresentation({
    status: "unknown",
    attentionCount: 0,
    dockerRuntimeStatus: "not_visible",
    browserUrlStatus: "initializing",
    startupMaintenanceStatus: "verification_deferred"
  }, "zh"), {
    status: "not_checked",
    detail: "尚未发现网页端访问地址，无法确认部署状态",
    issues: []
  });
  assert.deepEqual(presentation.dockerDiagnosticPresentation({
    status: "attention",
    attentionCount: 1,
    dockerRuntimeStatus: "daemon_unreachable"
  }, "zh"), {
    status: "attention_needed",
    detail: "检查发现 1 项需要处理",
    issues: ["Docker 服务: 服务未运行"]
  });
});

test("a configured WebUI address is not proof of an HTTP-ready deployment", () => {
  const result = presentation.dockerDiagnosticPresentation({ status: "unknown", attentionCount: 0, browserUrlStatus: "configured", dockerRuntimeStatus: "daemon_reachable" }, "zh");
  assert.equal(result.status, "configured");
  assert.match(result.detail, /打开网页确认/);
});

test("managed update policy keeps silent ownership separate from current eligibility", () => {
  assert.equal(presentation.formatUpdatePolicy("controlled_apply", false, "zh"), "自动（静默）");
  assert.equal(presentation.formatUpdatePolicy("projection_only", false, "zh"), "自动（静默）");
  assert.equal(presentation.formatUpdatePolicy("native_host", false, "zh"), "由 App 更新器管理");
  assert.equal(presentation.formatUpdatePolicy("prompt_only", false, "zh"), "手动");
  assert.equal(presentation.formatUpdatePolicy(undefined, false, "zh"), "待处理");
});

test("updates page explains internal ownership for runtime dependencies and packages", () => {
  assert.match(settingsSource, /managed-runtime-dependencies/);
  assert.match(settingsSource, /由 OPL 托管自动更新/);
  assert.match(settingsSource, /仅检测并提示，不自动接管维护/);
  assert.match(settingsSource, /Temporal 工作流组件（OPL 内置）/);
  assert.match(settingsSource, /已安装 Agent 与能力包/);
  assert.match(settingsSource, /managed-package-states/);
});

test("settings keeps Codex version and update channel on the maintenance owner page", () => {
  assert.match(settingsSource, /软件包与扩展按各自策略更新/);
  assert.doesNotMatch(settingsSource, /`版本` \$\{projection\?\.codex\.version\}/);
  assert.doesNotMatch(settingsSource, /<SettingRow label=\{locale === "zh" \? "更新通道"/);
  assert.match(settingsSource, /component\?\.state !== "failed_with_repair"/);
});

test("workbench service errors explain the affected surface without exposing Electron transport text", () => {
  const error = workbenchServices.presentWorkbenchError(
    "Error invoking remote method 'opl:invoke': Error: Framework workbench services are unavailable. Update Framework and restart the App.",
    "zh"
  );
  assert.equal(error.title, "基础服务版本需要更新");
  assert.match(error.detail, /普通 Codex 对话/);
  assert.match(error.nextStep, /更新基础服务/);
  assert.doesNotMatch(error.detail, /remote method|opl:invoke/);
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
  assert.equal(presentation.agentPackagePresentationStatus(agent({ homeShortcuts: [] })), "ready");
  assert.equal(presentation.agentPackageHasHomeShortcutRoute(agent({ homeShortcuts: [] })), false);
  assert.match(presentation.agentAvailabilityDetail(agent({ homeShortcuts: [] }), "zh"), /首页入口/);
  const previewWithoutSource = agent({ installed: false, releaseChannel: "preview", installabilityReason: "package_install_source_unavailable" });
  assert.match(presentation.agentAvailabilityDetail(previewWithoutSource, "zh"), /安装来源尚未发布/);
  assert.doesNotMatch(presentation.agentAvailabilityDetail(previewWithoutSource, "zh"), /点击“安装”/);
  assert.equal(presentation.agentPackagePresentationStatus(agent({ packageRole: "workflow_profile", homeShortcuts: [] })), "ready");
});

test("package update state remains separate from installed and callable state", () => {
  assert.equal(presentation.agentPackageUpdateStatus({ currentness: "update_available", installed: true }), "update_available");
  assert.equal(presentation.agentPackageUpdateStatus({ currentness: "currentness_not_checked", installed: true }), "currentness_not_checked");
  assert.equal(presentation.agentPackageUpdateStatus({ currentness: "unknown", installed: true }), "currentness_not_checked");
  assert.equal(presentation.agentPackageUpdateStatus({ currentness: "unknown", installed: false }), "not_installed");
  assert.equal(presentation.statusTone("currentness_not_checked"), "neutral");
  assert.equal(presentation.statusTone("update_available"), "attention");
  assert.equal(presentation.formatStatus("update_available", "zh"), "有可用更新");
  assert.equal(presentation.formatStatus("currentness_not_checked", "zh"), "尚未检查更新");
});

test("uninstalled packages are available choices rather than attention items", () => {
  assert.equal(presentation.agentPackageNeedsAttention({
    installed: false,
    currentness: "unknown",
    readiness: { operationalReady: false, callable: false, launchAllowed: false }
  }), false);
  assert.equal(presentation.agentPackageNeedsAttention({
    installed: true,
    currentness: "unknown",
    readiness: { operationalReady: false, callable: false, launchAllowed: false }
  }), true);
});

test("private package access is visible and gates install without inventing auth state", () => {
  const access = { visibility: "authorized_only", status: "signed_out", discoverAllowed: true, downloadAllowed: false } as const;
  assert.equal(presentation.packageAccessVisibilityLabel(access, "zh"), "私有授权源");
  assert.equal(presentation.packageAccessStatusLabel(access, "zh"), "未连接软件源账号");
  assert.equal(presentation.packageAccessNeedsAttention({ installed: true, access }), true);
  assert.equal(presentation.packageAccessNeedsAttention({ installed: false, access }), false);
  assert.equal(presentation.packageInstallAllowed({
    installed: false,
    access,
    installable: true,
    actions: [{ kind: "install", status: "available", payload: {}, requiredPayloadFields: [] }]
  } as never), false);
  assert.equal(presentation.packageInstallAllowed({
    installed: false,
    access: { ...access, status: "authorized", downloadAllowed: true },
    installable: true,
    actions: [{ kind: "install", status: "available", payload: {}, requiredPayloadFields: [] }]
  } as never), true);
});

test("agent catalog follows declared product type and preserves legacy standard-agent compatibility", () => {
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "standard_agent" }), true);
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "workflow_profile" }), false);
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "capability_package", softwareType: "agent" }), true);
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "standard_agent", softwareType: "application" }), false);
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "capability_package" }), false);
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "framework_capability_package" }), false);
});

test("package catalog defaults to unified all-software scope and keeps manifest import in other sources", () => {
  const ownerSource = readFileSync(new URL("../../plugins/core/opl-studio-client/src/client/composition/dshPluginManagerOwner.tsx", import.meta.url), "utf8");
  assert.match(ownerSource, /useState<SoftwareCatalogScope>\("all"\)/);
  assert.match(ownerSource, /PluginManagerOwnerPage/);
  assert.match(ownerSource, /manifest_url: manifestUrl\.trim\(\), trust_tier: trustTier/);
  assert.match(ownerSource, /actionId: props\.manifestInstallAction\.actionId/);
  assert.match(ownerSource, /dryRunSupported: props\.manifestInstallAction\.dryRunSupported/);
  assert.doesNotMatch(ownerSource, /agent_package_install_from_manifest_url|PluginManagerController/);
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

test("settings uses one group heading and a named destination panel", () => {
  assert.match(settingsSource, /<h1[^>]*>\{usesDestinationTabs \? activeGroup!\.label : destinationLabel\}<\/h1>/);
  assert.match(settingsSource, /aria-controls="settings-tabpanel"/);
  assert.match(settingsSource, /aria-labelledby=\{usesDestinationTabs \? `settings-tab-\$\{selectedDestination\}` : headingId\}/);
  assert.match(settingsSource, /event\.key === "Home"/);
  assert.match(settingsSource, /event\.key === "End"/);
  assert.match(settingsSource, /activeGroup\.destinations\.map/);
  assert.match(settingsSource, /aria-current=\{destination\.id === selectedDestination \? "page" : undefined\}/);
});

test("Gateway account identity and usage render only from a real account projection", () => {
  assert.doesNotMatch(settingsSource, /missingGateway(Label|Detail)/);
  // The identity row carries the disconnect control, so it must survive the
  // credential-entry state (App contract: disconnect_placement stays on the
  // identity row and the page offers an explicit switch); only the usage
  // summary narrows to the settled account view.
  assert.match(settingsSource, /\{gatewayAccountReady && gateway \? \(\s*<div className="gateway-identity"/s);
  assert.match(settingsSource, /\{showAccountDetails && gateway \? \(\s*<>\s*<SettingsGroup/s);
  assert.doesNotMatch(settingsSource, /账户管理|Account management/);
  assert.match(settingsSource, /<SettingsIntentButton intent=\{disconnectAction\}/);
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


test("component readiness cannot borrow healthy state from its aggregate", () => {
  assert.equal(presentation.componentReadinessStatus(false, "ready"), "not_ready");
  assert.equal(presentation.componentReadinessStatus(null, "available"), "unknown");
  assert.equal(presentation.componentReadinessStatus(true, "available"), "ready");
});

test("unknown total storage never yields a fabricated zero remainder", () => {
  assert.equal(workbenchServices.remainingStorageBytes(undefined, 100), undefined);
  assert.equal(workbenchServices.remainingStorageBytes(null, 100), undefined);
  assert.equal(workbenchServices.remainingStorageBytes(NaN, 100), undefined);
  assert.equal(workbenchServices.remainingStorageBytes(300, 100), 200);
});

test("search covers actual controls and unsupported input features without fake switches", () => {
  const labels = presentation.searchableSettings.flatMap(item => item.labels);
  for (const label of ["快捷键", "语音输入", "任务权限", "今日用量", "应用日志"]) assert.ok(labels.includes(label));
  assert.doesNotMatch(settingsSource, /renderSettingControl\("confirmBeforeExecute"\)/);
});


test("maintenance permission is not inferred from publisher, installer, or temporary eligibility", () => {
  assert.equal(presentation.managedDependencyPolicyLabel("explicit_owner_delegated", "detect_only_no_overwrite", "zh"), "确认后由原安装器更新");
  assert.equal(presentation.managedDependencyPolicyLabel("unknown", "unmanaged", "zh"), "维护方式待确认");
  for (const [reason, label] of [
    ["external_package_explicit_update_only", "按来源策略手动更新"],
    ["user_disabled_package", "已停用：暂停自动更新"],
    ["native_carrier_attention_required", "安装状态需修复：暂不能自动更新"],
    ["local_or_user_managed_source", "本地或用户管理的来源：不自动覆盖"]
  ]) {
    assert.equal(presentation.managedPackageUpdateLabel({ updateMode: "unknown", autoApplyEligible: false, backgroundUpdateReason: reason }, "zh"), label);
  }
});

const { gatewayAccountErrorMessage } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/gatewayAccountMessages.ts");

const CANONICAL_GATEWAY_ERROR_CODES = [
  "invalid_credentials",
  "account_disabled",
  "mfa_or_challenge_required",
  "session_not_persistable",
  "group_selection_required",
  "auth_expired",
  "network_unreachable",
  "rate_limited",
  "managed_key_missing",
  "managed_key_conflict",
  "managed_key_identity_drift",
  "disconnect_pending",
  "account_switch_requires_disconnect",
  "gateway_busy",
  "gateway_codex_binding_failed",
  "gateway_configuration_invalid",
  "gateway_request_rejected",
  "gateway_response_invalid",
  "gateway_store_invalid",
  "credentials_stdin_too_large",
  "invalid_request",
  "internal_contract_violation",
  "codex_configuration_failed",
  "gateway_account_failed"
];

test("every canonical gateway error code renders a localized sentence, never the raw code", () => {
  for (const code of CANONICAL_GATEWAY_ERROR_CODES) {
    for (const locale of ["zh-CN", "en-US"]) {
      const message = gatewayAccountErrorMessage(code, locale);
      assert.equal(typeof message, "string");
      assert.notEqual(message.trim(), "", `${code}/${locale} rendered an empty message`);
      assert.notEqual(message, code, `${code}/${locale} echoed the raw machine code`);
      assert.doesNotMatch(message, /^[a-z_]+$/, `${code}/${locale} rendered a bare enum value`);
    }
    assert.notEqual(
      gatewayAccountErrorMessage(code, "zh-CN"),
      gatewayAccountErrorMessage(code, "en-US"),
      `${code} is not localized`
    );
  }
});

test("gateway error messages give an actionable step for the account-switch case", () => {
  const zh = gatewayAccountErrorMessage("account_switch_requires_disconnect", "zh-CN");
  assert.match(zh, /断开/);
  const en = gatewayAccountErrorMessage("account_switch_requires_disconnect", "en-US");
  assert.match(en, /[Dd]isconnect/);
});

test("an unknown gateway error code falls back to a localized sentence, never raw text", () => {
  assert.notEqual(gatewayAccountErrorMessage(undefined, "zh-CN"), "undefined");
  assert.equal(gatewayAccountErrorMessage(undefined, "zh-CN"), "登录失败。");
  assert.equal(gatewayAccountErrorMessage(undefined, "en-US"), "Login failed.");
});


test("unified catalog includes private capability packages and defers package status reads", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    { package_id: "private-phone", catalog_scope: "software", catalog_origin: "opl", package_role: "capability_package", display_name: "Private Phone", publisher: "Local owner", installed: true, activated: true, app_enabled: false, selected_version: "2.7" },
    { package_id: "future-app", catalog_scope: "software", catalog_origin: "opl", package_role: "future_extension", display_name: "Future App", installed: true, app_enabled: true }
  ] } } } });
  let statusReads = 0;
  const html = renderToStaticMarkup(createElement(presentation.PackageCatalog, { kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {}, renderPackageContributions() { statusReads++; return null; } }));
  assert.match(html, /Private Phone/);
  assert.match(html, /Future App/);
  assert.match(html, /可用版本/);
  assert.match(html, /2\.7/);
  assert.match(html, /data-plugin-owner-package="private-phone"/);
  assert.doesNotMatch(html, /role="switch"/);
  assert.equal(statusReads, 0);
});

test("unified catalog shows private source access and hides gated install", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    { package_id: "private-agent", catalog_scope: "software", catalog_origin: "opl", package_role: "standard_agent", display_name: "Private Agent", publisher: "OPL", installed: false,
      package_access: { visibility: "authorized_only", status: "signed_out", provider_id: "github", discover_allowed: true, download_allowed: false, reason: "github_source_account_required" },
      installability: { installable: false }, available_actions: [{ action_id: "agent_package_install", action_ref: "app_state.actions#agent_package_install", semantic: "install", status: "unavailable", reason: "github_source_account_required", payload: { package_id: "private-agent" }, required_payload_fields: ["package_id"] }] }
  ] } } } });
  const html = renderToStaticMarkup(createElement(presentation.PackageCatalog, { kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {} }));
  assert.match(html, /Private Agent/);
  assert.match(html, /需授权安装/);
  assert.match(html, /data-plugin-owner-package="private-agent"/);
  assert.doesNotMatch(html, />安装<\/button>/);
});

test("software source management keeps private credentials refs-only", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { SoftwareSourcesPage } = await import("../../plugins/core/opl-studio-client/src/client/workbench/SoftwareSourcesPage.tsx");
  const projection = {
    status: "attention_required",
    entries: [{
      sourceId: "github-packages", displayName: "GitHub Packages", sourceKind: "registry", sourceRef: "ghcr.io/gaofeng21cn/one-person-lab-packages", visibility: "authorized_only", providerId: "github_packages", status: "signed_out", enabled: true, credentialHandlePresent: false,
      availableActions: [{ actionId: "source_configure", label: "Configure", payload: { provider_id: "github_packages", credential_handle: "provider:github_packages:gh-cli" }, payloadFields: ["source_id", "provider_id", "credential_handle", "enabled"], status: "available", dryRunSupported: true, confirmationRequired: false, followUpActionIds: [] }]
    }]
  } as const;
  const html = renderToStaticMarkup(createElement(SoftwareSourcesPage, { projection, locale: "zh", actionBusyKey: null, onAction() {}, onRefresh() {} }));
  assert.match(html, /软件源/);
  assert.match(html, /连接 GitHub 账户/);
  assert.match(html, /仅授权用户/);
  assert.doesNotMatch(html, /provider:github_packages:gh-cli/);
  assert.doesNotMatch(html, /访问令牌/);
});

async function withSettingsTestDom(run: (surface: { container: HTMLElement; render(node: unknown): void }) => void | Promise<void>) {
  const { createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const { Window } = await import("happy-dom");
  const browser = new Window({ url: "http://localhost/" });
  const keys = ["window", "document", "HTMLElement", "Node", "ResizeObserver"] as const;
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  keys.forEach(key => Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: key === "window" ? browser : key === "ResizeObserver" ? undefined : browser[key]
  }));
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Element);
  try {
    await run({
      container: container as unknown as HTMLElement,
      render(node) { flushSync(() => root.render(node as ReturnType<typeof createElement>)); }
    });
  } finally {
    flushSync(() => root.unmount());
    await new Promise(resolve => setImmediate(resolve));
    browser.close();
    keys.forEach(key => {
      const original = originals.get(key);
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
}


test("first-run actions use host capabilities or open the matching settings destination", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { FirstRunOnboardingSlot } = await import("../../plugins/core/opl-studio-client/src/client/composition/slotHost/firstRunOnboarding.tsx");
  const { SettingsMainSlot } = await import("../../plugins/core/opl-studio-client/src/client/composition/slotHost/shellSettingsSlots.tsx");
  const { StudioContext } = await import("../../plugins/core/opl-studio-client/src/client/composition/slotHost/studioContext.tsx");

  await withSettingsTestDom(async ({ container, render }) => {
    for (const [itemId, locale, hostAction, label, expected] of [
      ["workspace_root", "zh", false, "查看工作目录", "workspace"],
      ["codex", "zh", false, "查看本机助手", "updates"],
      ["codex_cli", "en", false, "View local assistant", "updates"],
      ["codex_config", "en", false, "Set up model access", "account"],
      ["workspace_root", "en", true, "Choose working directory", "choose"],
      ["codex", "zh", true, "安装本机助手", "install"],
    ] as const) {
      const actions: string[] = [];
      const surface = {
        locale, initializationStatus: "ready", firstRunVisible: true,
        initialization: normalizeInitializeReadback({ system_initialize: {
          setup_flow: { is_first_run: true, ready_to_launch: false },
          checklist: [{ item_id: itemId, blocking: true, readiness_layer: "core_launch" }]
        } }),
        setupCapabilities: { workspaceRoot: hostAction, codexInstall: hostAction },
        chooseWorkspaceRoot: async () => { actions.push("choose"); return { status: "completed" }; },
        installCodex: async () => { actions.push("install"); return { status: "completed" }; },
        completeFirstRun: () => actions.push("finish"),
        openSettingsDestination: (destination: string) => actions.push(destination),
      };
      render(createElement(StudioContext.Provider, { value: surface as never },
        createElement(FirstRunOnboardingSlot, { complete: () => actions.push("complete") })));
      const primary = [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
        .find(button => button.textContent === label);
      assert.ok(primary, itemId);
      flushSync(() => primary.click());
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(actions, hostAction ? [expected] : ["finish", "complete", expected]);
      if (expected === "install" || expected === "choose") continue;
      const group = presentation.settingsDestinations(locale).find(page =>
        presentation.settingsSubDestinations(page.id, locale).some(subpage => subpage.id === expected));
      assert.ok(group);
      render(createElement(StudioContext.Provider, { value: {
        ...surface, settingsNavigation: { destination: expected, open: true, revision: 1 },
        renderSettings: (destination: string) => createElement("span", { "data-destination": destination }),
      } as never }, createElement(SettingsMainSlot, { destination: group.id })));
      await new Promise(resolve => setImmediate(resolve));
      assert.ok(container.querySelector(`[data-destination="${expected}"]`), expected);
    }
  });
});

test("settings delegates software and update management to one software center", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { SoftwareCenterSettingsLink } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/SoftwareCenterSettingsLink.tsx");
  const opened: string[] = [];
  await withSettingsTestDom(({ container, render }) => {
    for (const section of ["applications", "updates"] as const) {
      render(createElement(SoftwareCenterSettingsLink, { locale: "zh", section, onOpen: value => opened.push(value) }));
      flushSync(() => container.querySelector<HTMLButtonElement>("button")!.click());
      assert.equal(container.querySelector('[data-plugin-owner-package]'), null);
    }
    assert.deepEqual(opened, ["applications", "updates"]);
    render(createElement(SoftwareCenterSettingsLink, { locale: "zh" }));
    assert.equal(container.querySelector<HTMLButtonElement>("button")!.disabled, true);
  });
});

test("runtime catalog versions stay concise while mixed SDK versions remain explicit", async () => {
  const { managedDependencyVersionSummary } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/maintenance.tsx");
  assert.equal(managedDependencyVersionSummary("ffmpeg version 9.0.2 Copyright 2000-2026\nffprobe version 9.0.2"), "9.0.2");
  assert.equal(managedDependencyVersionSummary({ client: "1.25.0", worker: "1.25.0" }), "1.25.0");
  assert.equal(managedDependencyVersionSummary({ client: "1.25.0", worker: "1.26.0" }), "client 1.25.0, worker 1.26.0");
  assert.equal(managedDependencyVersionSummary(null), "—");
});

test("runtime dependencies stay outside software counts and preserve owner maintenance routing", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState, readManagedUpdateProjection } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { DshPluginManagerOwner } = await import("../../plugins/core/opl-studio-client/src/client/composition/dshPluginManagerOwner.tsx");
  const tabs: string[] = [];
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [] } } } });
  const managedUpdate = readManagedUpdateProjection({ managed_update: { components: [{ component_id: "opl_base", label: "OPL Base", current: {
    dependency_catalog: { dependencies: [{ dependency_id: "codex-cli", dependency_kind: "cli", installed: true, version: "1.2.3", latest_version: "1.2.4", status: "available", currentness: "update_available", ownership: "user", update_mode: "explicit_owner_delegated", binary_path: "/opt/homebrew/bin/codex" }] }
  } }] } });
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(DshPluginManagerOwner, { kind: "all", model, managedUpdate, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {}, onTabChange: tab => tabs.push(tab) }));
    assert.equal(container.querySelector('[data-plugin-owner-package="runtime:opl_base:codex-cli"]'), null);
    flushSync(() => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "运行组件")!.click());
    const row = container.querySelector('[data-plugin-owner-package="runtime:opl_base:codex-cli"]')!;
    assert.match(row.textContent ?? "", /Codex CLI/);
    assert.match(row.textContent ?? "", /1\.2\.3/);
    assert.match(row.textContent ?? "", /1\.2\.4/);
    flushSync(() => [...row.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "查看更新与维护")!.click());
    assert.deepEqual(tabs, ["updates"]);
  });
});

test("official package restore is exposed through an explicit confirmation action", async () => {
  const { createElement } = await import("react");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { SettingsActionDialog } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/SettingsActionDialog.tsx");
  const model = deriveWorkbenchModelFromState({ app_state: {
    agent_packages: { surface_kind: "opl_app_agent_packages_projection", directory: { entries: [], status: "ready" }, sources: { surface_kind: "opl_software_sources_projection.v1", status: "available", entries: [] } },
    actions: [{ action_id: "official_profile_restore", label: "Restore official combination", payload_fields: ["intent"], mutates: "opl_packages", dry_run_supported: true, confirmation_required: true }]
  } });
  const actions: Array<{ actionId: string; payload: Record<string, unknown>; confirmationRequired: boolean; dryRunSupported?: boolean }> = [];
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(presentation.PackageCatalog, {
      kind: "all", model: { ...model, officialProfileRestore: undefined }, settings: { ...settingsDefaults, locale: "en" }, actionBusyKey: null,
      onAction: action => actions.push(action)
    }));
    assert.equal(container.querySelector('[data-testid="settings-agents-restore-official-profile"]'), null);
    render(createElement(presentation.PackageCatalog, {
      kind: "all", model, settings: { ...settingsDefaults, locale: "en" }, actionBusyKey: null,
      onAction: action => actions.push(action)
    }));
    const restore = container.querySelector<HTMLButtonElement>('[data-testid="settings-agents-restore-official-profile"]');
    assert.ok(restore);
    restore.click();
    assert.deepEqual(actions.map(({ actionId, payload, confirmationRequired, dryRunSupported }) => ({ actionId, payload, confirmationRequired, dryRunSupported })), [{
      actionId: "official_profile_restore",
      payload: { intent: "explicit_restore" },
      confirmationRequired: true,
      dryRunSupported: true
    }]);
    render(createElement(SettingsActionDialog, {
      settings: { ...settingsDefaults, locale: "en" },
      pendingConfirmation: { request: { key: "official-profile:restore", label: "Restore official combination", ...actions[0] }, previewStatus: "confirmation_required" },
      actionBusyKey: null, onCancelAction() {}, onConfirmAction() {}
    }));
    const dialog = document.querySelector('[data-testid="opl-settings-action-confirmation"]');
    assert.ok(dialog);
    assert.match(dialog.textContent ?? "", /Install or repair missing agents and required capabilities/);
    assert.match(dialog.textContent ?? "", /Confirm/);
  });
});

test("preview host identity never falls back to an installed App version", async () => {
  const { createElement } = await import("react");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { AboutSettingsPage } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/pages/AboutSettingsPage.tsx");
  const { ManagedUpdateGroup } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/maintenance.tsx");
  const component: import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts").ManagedUpdateComponentRef = {
    componentId: "opl_app", lifecycleOwner: "opl_app", label: "OPL App", state: "current",
    installedVersion: "26.11.10", autoApplyEligible: null, backgroundSafe: null
  };
  const preview: import("../../plugins/core/opl-studio-client/src/client/bridge/oplBridge.ts").NativeAppUpdateResult = {
    schema: "opl_native_app_updater.v1", owner: "one-person-lab-app_desktop_host", host: "electron",
    operation: "status", supported: false, state: "unsupported", reasonCode: "desktop_updater_requires_packaged_app"
  };
  await withSettingsTestDom(({ container, render }) => {
    for (const nativeUpdate of [preview, { ...preview, currentVersion: "26.11.11", buildKind: "local-development", reasonCode: "local_development_updates_disabled" }]) {
      const expected = nativeUpdate.buildKind ? /26\.11\.11/ : /未发布/;
      render(createElement(ManagedUpdateGroup, { component, nativeUpdate, fallbackLabel: "当前桌面宿主", actions: [], locale: "zh", busyKey: null, onAction() {} }));
      assert.match(container.textContent ?? "", expected);
      assert.doesNotMatch(container.textContent ?? "", /26\.11\.10/);
      render(createElement(AboutSettingsPage, {
        actionViewModel: { gatewayActions: [], agentLifecycle: [], managedUpdates: [{ componentId: "opl_app", component, actions: [] }], additionalMaintenanceActions: [] },
        nativeAppUpdate: nativeUpdate, managedUpdate: null, projection: undefined, settings: { ...settingsDefaults, locale: "zh" }, zh: true,
        carrierDiagnostics: { schema: "opl_app_carrier_diagnostics.v1", owner: "one-person-lab-app_desktop_host", carrier: "electron_desktop", status: "available", setLogDirectorySupported: false },
        actionBusyKey: null, onAction() {}, onHostAction: undefined, maintenanceStatus: null, maintenanceError: null, stateStatus: "ready"
      }));
      assert.match(container.textContent ?? "", expected);
      assert.match(container.textContent ?? "", nativeUpdate.buildKind ? /本地开发版/ : /开发预览/);
      assert.doesNotMatch(container.textContent ?? "", /26\.11\.10/);
    }
  });
});

test("catalog defaults to unified all-software view and separates host components without inventing maturity", async () => {
  const { flushSync } = await import("react-dom");
  const { createElement } = await import("react");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    { package_id: "kindle-pilot", display_name: "Kindle Pilot", catalog_scope: "software", catalog_origin: "opl", package_role: "capability_package", release_channel: "preview", distribution_channel: "source", installed: true, installed_version: "1.2.0", selected_version: "1.1.0", description: "Manage a reading device." },
    { package_id: "host-browser", display_name: "Host Browser", catalog_scope: "dependency", installed: true },
    { package_id: "legacy-unknown", display_name: "Unknown legacy item", installed: true },
  ] } } } });
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(presentation.PackageCatalog, { kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {} }));
    const text = container.textContent ?? "";
    assert.match(text, /Kindle Pilot/);
    assert.match(text, /Unknown legacy item/);
    assert.equal(container.querySelector('[data-plugin-owner-package="kindle-pilot"] [data-label="当前版本"]')?.textContent, "1.2.0");
    assert.equal(container.querySelector('[data-plugin-owner-package="kindle-pilot"] [data-label="可用版本"]')?.textContent, "1.1.0");
    assert.doesNotMatch(text, /preview|预览版|stable|稳定版|Host Browser/);
    const oplScope = [...container.querySelectorAll("button")].find(button => button.textContent === "OPL 软件")!;
    flushSync(() => oplScope.click());
    assert.match(container.textContent ?? "", /Kindle Pilot/);
    assert.doesNotMatch(container.textContent ?? "", /Host Browser|Unknown legacy item/);
    const scope = [...container.querySelectorAll("button")].find(button => button.textContent === "运行组件");
    assert.ok(scope);
    flushSync(() => scope.click());
    assert.match(container.textContent ?? "", /Host Browser/);
    assert.doesNotMatch(container.textContent ?? "", /Unknown legacy item/);
    const external = [...container.querySelectorAll("button")].find(button => button.textContent === "其他来源")!;
    flushSync(() => external.click());
    assert.match(container.textContent ?? "", /Unknown legacy item/);
    assert.doesNotMatch(container.textContent ?? "", /Kindle Pilot/);
  });
});


test("nonstandard agents use declared type and local installations never masquerade as host plugins", async () => {
  const { createElement } = await import("react");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const installation = { installation_id: "owner:rednote", kind: "owner_managed", version: "0.2.3", mode: "installed", manager: "package_owner", management_scope: "owner_only", location_ref: "local-data:rednote/app/current", evidence_ref: "owner:status", entrypoint_verified: true };
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    { package_id: "persona", display_name: "Persona", catalog_scope: "software", catalog_origin: "opl", software_type: "agent", package_role: "capability_package", installed: true, installed_version: "1" },
    { package_id: "rednote", display_name: "RedNote", catalog_scope: "software", catalog_origin: "opl", software_type: "application", package_role: "capability_package", installed: false, selected_version: "0.2.3", local_installations: [installation] },
    { package_id: "vault", display_name: "Vault", catalog_scope: "software", catalog_origin: "opl", software_type: "application", package_role: "capability_package", installed: false, selected_version: "0.1.0", local_installations: [{ ...installation, installation_id: "uv:vault", kind: "uv_tool", version: "0.1.0", mode: "development", manager: "uv" }] }
  ] } } } });
  const { packageInstalledLocally, packageDevelopmentLinked } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/packages.tsx");
  assert.equal(packageInstalledLocally(model.packageLifecycle[1]), true);
  assert.equal(packageInstalledLocally(model.packageLifecycle[2]), false);
  assert.equal(packageDevelopmentLinked(model.packageLifecycle[2]), true);
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(presentation.PackageCatalog, { kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {} }));
    const rednote = container.querySelector('[data-plugin-owner-package="rednote"]');
    assert.equal(rednote?.querySelector('[data-label="当前版本"]')?.textContent, "0.2.3");
    assert.match(rednote?.textContent ?? "", /已安装/);
    assert.doesNotMatch(rednote?.textContent ?? "", /未安装/);
    const vault = container.querySelector('[data-plugin-owner-package="vault"]');
    assert.match(vault?.textContent ?? "", /开发版/);
    assert.match(container.textContent ?? "", /智能体/);
    assert.doesNotMatch(rednote?.textContent ?? "", /能力包/);
    render(createElement(presentation.PackageCatalog, { kind: "agents", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {} }));
    assert.match(container.textContent ?? "", /Persona/);
    assert.doesNotMatch(container.textContent ?? "", /RedNote|Vault/);
  });
});

test("unified catalog shows all software origins while OPL filter and other sources keep independent Skills separated", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    { package_id: "our-app", display_name: "Our App", catalog_origin: "opl", catalog_scope: "software", software_type: "application", installed: true, installed_version: "2.0", selected_version: "1.0" },
    { package_id: "pdf@openai", display_name: "PDF", catalog_origin: "external", catalog_scope: "software", catalog_source: { manager: "codex_plugin_manager", marketplace_id: "openai", delivery: "host_bundled" }, installed: true, installed_version: "1.2" },
    { package_id: "opl-imitation", display_name: "Unconfirmed publisher", publisher: "one-person-lab", catalog_scope: "software", installed: true }
  ] } } } });
  const catalog = { source: "codex_app_server", plugins: [], apps: [], errors: [], skills: [
    { name: "Independent skill", path: "/user/.codex/skills/example/SKILL.md", scope: "user", description: "A local skill", enabled: true },
    { name: "Packaged skill", path: "/user/.codex/plugins/cache/pdf/1.2/skills/pdf/SKILL.md", scope: "user", description: "Exported by PDF", enabled: true }
  ] } as const;
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(presentation.PackageCatalog, { kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, capabilityCatalog: catalog, capabilityStatus: "ready", actionBusyKey: null, onAction() {} }));
    assert.match(container.textContent ?? "", /Our App/);
    assert.match(container.textContent ?? "", /PDF/);
    assert.match(container.textContent ?? "", /Unconfirmed publisher/);
    assert.doesNotMatch(container.textContent ?? "", /Independent skill|Packaged skill/);
    assert.equal(container.querySelector('[data-plugin-owner-package="our-app"] [data-label="当前版本"]')?.textContent, "2.0");
    const opl = container.querySelector<HTMLButtonElement>('#opl-catalog-scope-opl')!;
    flushSync(() => opl.click());
    assert.match(container.textContent ?? "", /Our App/);
    assert.doesNotMatch(container.textContent ?? "", /PDF|Unconfirmed publisher|Independent skill|Packaged skill/);
    const external = container.querySelector<HTMLButtonElement>('#opl-catalog-scope-external')!;
    flushSync(() => external.click());
    assert.match(container.textContent ?? "", /PDF/);
    assert.equal(container.querySelector('[data-plugin-owner-package="pdf@openai"] [data-label="类型"]')?.textContent, "效率扩展");
    assert.match(container.textContent ?? "", /Independent skill|独立 Skills/);
    assert.match(container.textContent ?? "", /Unconfirmed publisher/);
    assert.doesNotMatch(container.textContent ?? "", /Our App|Packaged skill/);
    assert.equal(container.querySelectorAll('[data-plugin-owner-package^="codex-skill:"]').length, 1);
  });
});

test("catalog state counts development as installed and prioritizes blocked access over a known update", async () => {
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { packageCatalogState, softwareCatalogInventory, catalogInstalledVersion } = await import("../../plugins/core/opl-studio-client/src/client/workbench/softwareCatalog.ts");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    { package_id: "dev", catalog_origin: "opl", catalog_scope: "software", installed: false, local_installations: [{ installation_id: "uv:dev", kind: "uv_tool", mode: "development", version: "1.0", manager: "uv", management_scope: "owner_only", location_ref: "tool:dev", evidence_ref: "uv:dev", entrypoint_verified: true }] },
    { package_id: "private", catalog_origin: "opl", catalog_scope: "software", installed: true, installed_version: "1.0", package_currentness: "update_available", package_access: { visibility: "authorized_only", status: "revoked", discover_allowed: false, download_allowed: false } },
    { package_id: "available", catalog_origin: "opl", catalog_scope: "software", installed: false },
    { package_id: "external", catalog_origin: "external", catalog_scope: "software", installed: true, package_currentness: "update_available" }
  ] }, sources: { surface_kind: "opl_software_sources_projection.v1", status: "available", entries: [{ source_id: "tap", display_name: "OPL Homebrew", source_kind: "tap", inventory_status: "available", native_items: [
    { item_id: "stable", product_id: "app", catalog_origin: "opl", kind: "cask", name: "app", installed: false, available_version: "1.0" },
    { item_id: "nightly", product_id: "app", catalog_origin: "opl", kind: "cask", name: "app-nightly", installed: false, available_version: "2.0-nightly" }
  ] }] } } } });
  const [dev, privateItem] = model.packageLifecycle;
  assert.equal(packageCatalogState(dev), "installed");
  assert.equal(catalogInstalledVersion(dev, "zh"), "1.0");
  assert.equal(packageCatalogState(privateItem), "attention");
  const inventory = softwareCatalogInventory(model);
  assert.deepEqual({ total: inventory.total, installed: inventory.installed, updates: inventory.updates, notInstalled: inventory.notInstalled, opl: inventory.opl, external: inventory.external }, { total: 4, installed: 3, updates: 1, notInstalled: 1, opl: 3, external: 1 });
});

test("source access attention opens sources and does not repair an installation", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { OplSoftwareUpdates } = await import("../../plugins/core/opl-studio-client/src/client/workbench/OplSoftwareUpdates.tsx");
  const actions: unknown[] = [], tabs: string[] = [];
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [{
    package_id: "private", display_name: "Private Agent", catalog_origin: "opl", catalog_scope: "software", installed: true, installed_version: "1.0",
    package_currentness: "update_available", package_access: { visibility: "authorized_only", status: "signed_out", discover_allowed: false, download_allowed: false },
    available_actions: ["repair", "update"].map(semantic => ({ action_id: `agent_package_${semantic}`, semantic, status: "available", payload: { package_id: "private" }, required_payload_fields: ["package_id"] }))
  }] } } } });
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(presentation.PackageCatalog, { kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction: action => actions.push(action), onTabChange: tab => tabs.push(tab) }));
    const row = container.querySelector('[data-plugin-owner-package="private"]')!;
    assert.match(row.textContent ?? "", /需连接软件源/);
    assert.doesNotMatch(row.textContent ?? "", /修复|需要处理/);
    const sourceButton = [...row.querySelectorAll("button")].find(button => button.textContent === "检查软件源")!;
    flushSync(() => sourceButton.click());
    assert.deepEqual(tabs, ["sources"]);
    render(createElement(OplSoftwareUpdates, { model, locale: "zh", actionBusyKey: null, onAction: action => actions.push(action), onManageSources: () => tabs.push("sources") }));
    assert.doesNotMatch(container.textContent ?? "", /修复/);
    flushSync(() => container.querySelector<HTMLButtonElement>("button")!.click());
    assert.deepEqual(tabs, ["sources", "sources"]);
    assert.deepEqual(actions, []);
  });
});

test("a missing Weixin component distinguishes a directory version from a verified install action", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { DshPluginManagerOwner } = await import("../../plugins/core/opl-studio-client/src/client/composition/dshPluginManagerOwner.tsx");
  const packageId = "opl-channel-weixin";
  const request = { action_id: "agent_package_install", action_ref: "app_state.actions#agent_package_install", semantic: "install",
    payload: { package_id: packageId }, required_payload_fields: ["package_id"], confirmation_required: true };
  const model = (installable: boolean) => deriveWorkbenchModelFromState({ app_state: {
    actions: [{ action_id: "agent_package_install", label: "Install package", dry_run_supported: true, confirmation_required: true }],
    agent_packages: { directory: { entries: [{
    package_id: packageId, display_name: "OPL Channel Weixin", display_name_i18n: { "zh-CN": "微信远程" }, catalog_origin: "opl", catalog_scope: installable ? "software" : "dependency",
    management_scope: "opl_packages", software_type: "channel", installed: false, selected_version: "0.2.0",
    installability: { installable, reason: installable ? null : "package_install_source_unavailable" },
    available_actions: installable ? [request] : [],
  }] } } } });
  const actions: unknown[] = [];
  await withSettingsTestDom(({ container, render }) => {
    const show = (installable: boolean) => render(createElement(DshPluginManagerOwner, {
      key: String(installable), kind: "all", model: model(installable), settings: { ...settingsDefaults, locale: "zh" },
      actionBusyKey: null, onAction: action => actions.push(action),
    }));
    const click = (label: string) => flushSync(() => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === label)!.click());
    show(false);
    click("运行组件");
    const row = container.querySelector(`[data-plugin-owner-package="${packageId}"]`)!;
    assert.match(row.textContent ?? "", /安装来源不可用/);
    assert.doesNotMatch(row.textContent ?? "", /0\.2\.0/);
    click("微信远程");
    assert.match(container.querySelector("[data-plugin-owner-detail]")?.textContent ?? "", /软件源暂未提供可验证的安装文件/);
    assert.equal(actions.length, 0);

    show(true);
    assert.match(container.querySelector(`[data-plugin-owner-package="${packageId}"]`)?.textContent ?? "", /0\.2\.0/);
    click("安装");
    assert.deepEqual(actions, [{
      key: `${packageId}:agent_package_install`, actionId: "agent_package_install", label: "安装 微信远程",
      payload: { package_id: packageId }, confirmationRequired: true, dryRunSupported: true,
    }]);
  });
});

test("installed configurable plugin offers direct configure action from the software list and interactive summary filters work", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { ApplicationManagementPage } = await import("../../plugins/core/opl-studio-client/src/client/workbench/ApplicationManagementPage.tsx");
  const opened: Array<{ destination: string; focus?: unknown }> = [];
  const model = deriveWorkbenchModelFromState({ app_state: {
    ui_contributions: {
      surface_kind: "opl_app_ui_contributions_projection.v1",
      entries: [{
        contribution_key: "opl-channel-weixin:weixin-channel-access",
        contribution_id: "weixin-channel-access",
        package_id: "opl-channel-weixin",
        slot: "settings.section",
        contribution_kind: "view",
        trust_tier: "declarative",
        scope: "root",
        sort_order: 30,
        view: {
          view_id: "weixin-channel-access",
          view_type: "channel_access",
          title_i18n: { "zh-CN": "微信", en: "Weixin" },
          data_ref: "weixin.channel-access#state"
        },
        commands: [],
        badges: []
      }]
    },
    agent_packages: {
      surface_kind: "opl_app_agent_packages_projection",
      directory: {
        entries: [
          {
            package_id: "opl-channel-weixin", display_name: "OPL Channel Weixin", display_name_i18n: { "zh-CN": "微信远程" },
            catalog_origin: "opl", catalog_scope: "software", software_type: "capability",
            installed: true, installed_version: "0.2.0", activated: true,
            app_enabled: true, readiness: { operational_ready: true, callable: true, launch_allowed: true },
            available_actions: []
          },
          {
            package_id: "optional-agent", display_name: "Optional Agent", display_name_i18n: { "zh-CN": "可选智能体" },
            catalog_origin: "opl", catalog_scope: "software", software_type: "agent",
            installed: false, selected_version: "1.0.0", installability: { installable: true },
            available_actions: []
          }
        ]
      }
    }
  } });
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(ApplicationManagementPage, {
      model, settings: { ...settingsDefaults, locale: "zh" }, managedUpdate: null, nativeAppUpdate: null,
      actionViewModel: { gatewayActions: [], agentLifecycle: [], managedUpdates: [], additionalMaintenanceActions: [] },
      actionBusyKey: null, onAction() {}, onRefresh() {},
      onOpenSettings: (destination, focus) => opened.push({ destination, focus })
    }));
    const weixinRow = container.querySelector('[data-plugin-owner-package="opl-channel-weixin"]')!;
    assert.ok(weixinRow);
    const configureButton = [...weixinRow.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "配置")!;
    assert.ok(configureButton, "installed configurable plugin exposes one-click configure button");
    flushSync(() => configureButton.click());
    assert.deepEqual(opened, [{ destination: "resources", focus: { section: "remote", packageId: "opl-channel-weixin" } }]);

    const notInstalledChip = [...container.querySelectorAll<HTMLButtonElement>("button.opl-summary-filter")].find(button => button.textContent?.includes("未安装"))!;
    assert.ok(notInstalledChip);
    flushSync(() => notInstalledChip.click());
    assert.equal(container.querySelector('[data-plugin-owner-package="opl-channel-weixin"]'), null);
    assert.ok(container.querySelector('[data-plugin-owner-package="optional-agent"]'));
  });
});

test("updates tab surfaces actionable desktop app updates and collapses up-to-date extension components", async () => {
  const { createElement } = await import("react");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { ApplicationManagementPage } = await import("../../plugins/core/opl-studio-client/src/client/workbench/ApplicationManagementPage.tsx");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [] } } } });
  await withSettingsTestDom(async ({ container, render }) => {
    const previousBridge = (window as unknown as { oplStudio?: unknown }).oplStudio;
    (window as unknown as { oplStudio?: unknown }).oplStudio = {
      readDshPluginUpdates: async () => ({
        plugins: { "@gaofeng21cn/opl-studio-client": { installed: "0.1.25", available: "0.1.25", state: "current" } }
      })
    };
    try {
      render(createElement(ApplicationManagementPage, {
        model, settings: { ...settingsDefaults, locale: "zh" }, managedUpdate: null,
        nativeAppUpdate: { schema: "opl_native_app_updater.v1", owner: "one-person-lab-app_desktop_host", host: "electron", operation: "status",
          supported: true, state: "available", currentVersion: "26.11.20", targetVersion: "26.11.23" },
        actionViewModel: { gatewayActions: [], agentLifecycle: [], managedUpdates: [], additionalMaintenanceActions: [] },
        actionBusyKey: null, initialTab: "updates", onAction() {}, onRefresh() {}
      }));
      await new Promise(resolve => setTimeout(resolve, 20));
      const runtimeDetails = container.querySelector<HTMLDetailsElement>('[data-testid="opl-runtime-maintenance-details"]')!;
      assert.equal(runtimeDetails.open, false);
      assert.match(container.textContent ?? "", /26\.11\.20 -> 26\.11\.23/);
      const extensions = container.querySelector<HTMLDetailsElement>('[data-testid="dsh-plugin-updates"]')!;
      assert.equal(extensions.tagName, "DETAILS");
      assert.equal(extensions.open, false);
      assert.match(extensions.textContent ?? "", /应用扩展组件 · 已是最新/);
      assert.doesNotMatch(extensions.textContent ?? "", /DSH cohort|Host 与客户端字节/);
    } finally {
      (window as unknown as { oplStudio?: unknown }).oplStudio = previousBridge;
    }
  });
});

test("nativeAppUpdateFeedback and formatStatus translate updater outcomes without false success", async () => {
  const { nativeAppUpdateFeedback } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/maintenance.tsx");
  const { formatStatus } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/presentation.tsx");
  const base = { schema: "opl_native_app_updater.v1", owner: "one-person-lab-app_desktop_host", host: "electron" } as const;

  const failed = nativeAppUpdateFeedback({ ...base, operation: "check", supported: true, state: "error", message: "Network unreachable" }, "check", "zh");
  assert.equal(failed.tone, "attention");
  assert.equal(failed.message, "Network unreachable");

  const busy = nativeAppUpdateFeedback({ ...base, operation: "restart", supported: false, state: "unsupported", accepted: false, reasonCode: "app_server_busy" }, "restart", "zh");
  assert.equal(busy.tone, "attention");
  assert.match(busy.message, /仍有任务正在运行/);

  const pluginRestart = nativeAppUpdateFeedback({ ...base, operation: "restart", supported: false, state: "restart_scheduled", accepted: true }, "restart", "zh");
  assert.equal(pluginRestart.tone, "success");
  assert.match(pluginRestart.message, /正在重启应用/);

  const current = nativeAppUpdateFeedback({ ...base, operation: "check", supported: true, state: "not_available", currentVersion: "26.11.20" }, "check", "zh");
  assert.equal(current.tone, "success");
  assert.match(current.message, /26\.11\.20/);

  const available = nativeAppUpdateFeedback({ ...base, operation: "check", supported: true, state: "available", targetVersion: "26.11.23" }, "check", "zh");
  assert.equal(available.tone, "neutral");
  assert.match(available.message, /26\.11\.23/);

  const downloaded = nativeAppUpdateFeedback({ ...base, operation: "apply", supported: true, state: "downloaded", targetVersion: "26.11.23" }, "apply", "zh");
  assert.equal(downloaded.tone, "success");
  assert.match(downloaded.message, /新版本 26\.11\.23 已下载完成/);

  assert.equal(formatStatus("downloading", "zh"), "正在下载更新");
  assert.equal(formatStatus("downloaded", "zh"), "已下载，待重启安装");
  assert.equal(formatStatus("installing", "zh"), "正在安装更新");
  assert.equal(formatStatus("restart_scheduled", "zh"), "正在重启");
  assert.equal(formatStatus("idle", "zh"), "就绪");
});

test("OplSoftwareUpdates manages external packages, Billion Context restarts, and DSH plugin retries uniformly", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { OplSoftwareUpdates } = await import("../../plugins/core/opl-studio-client/src/client/workbench/OplSoftwareUpdates.tsx");
  const model = deriveWorkbenchModelFromState({ app_state: {
    actions: [{ action_id: "agent_package_update", label: "Update package", dry_run_supported: true, confirmation_required: true }],
    agent_packages: { directory: { entries: [{
    package_id: "external-tool", display_name: "External Tool", catalog_origin: "external", catalog_scope: "software",
    installed: true, installed_version: "1.0.0", selected_version: "1.2.0",
    package_currentness: "update_available",
    available_actions: [{ action_id: "agent_package_update", action_ref: "app_state.actions#agent_package_update", semantic: "update", status: "available", payload: { package_id: "external-tool" }, required_payload_fields: ["package_id"] }]
  }] } } } });
  const actions: unknown[] = [];
  let pluginReads = 0, restartCalls = 0;
  await withSettingsTestDom(async ({ container, render }) => {
    const previousBridge = (window as unknown as { oplStudio?: unknown }).oplStudio;
    (window as unknown as { oplStudio?: unknown }).oplStudio = {
      readDshPluginUpdates: async () => {
        pluginReads += 1;
        return { plugins: { "@gaofeng21cn/opl-studio-client": { installed: "0.1.25", state: "unavailable", reason: "feed_unavailable" } } };
      },
      readBillionContext: async () => ({ installed: true, enabled: false, active: true, version: "0.2.0" }),
      manageBillionContext: async () => ({ installed: true, enabled: false, active: true, version: "0.2.0" }),
      restartNativeApp: async () => {
        restartCalls += 1;
        return { schema: "opl_native_app_updater.v1", owner: "one-person-lab-app_desktop_host", host: "electron", operation: "restart", supported: false, state: "unsupported", accepted: false, reasonCode: "app_server_busy" };
      }
    };
    try {
      render(createElement(OplSoftwareUpdates, { model, locale: "zh", actionBusyKey: null, onAction: action => actions.push(action), dshRestartRequired: true }));
      await new Promise(resolve => setTimeout(resolve, 30));
      const text = container.textContent ?? "";
      assert.match(text, /External Tool/);
      assert.match(text, /1\.0\.0 → 1\.2\.0/);
      assert.match(text, /公开插件更新清单暂不可用，稍后将自动重试/);
      assert.doesNotMatch(text, /feed_unavailable/);

      const extUpdateBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "更新")!;
      assert.ok(extUpdateBtn);
      flushSync(() => extUpdateBtn.click());
      assert.equal(actions.length, 1);

      const retryBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "重新检查")!;
      assert.ok(retryBtn);
      flushSync(() => retryBtn.click());
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.ok(pluginReads >= 2);

      const contextRow = container.querySelector('[data-testid="third-party-dsh-plugin-update"]')!;
      assert.ok(contextRow);
      const contextRestartBtn = [...contextRow.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "重启应用生效")!;
      flushSync(() => contextRestartBtn.click());
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(restartCalls, 1);
      assert.match(contextRow.querySelector('[role="alert"]')?.textContent ?? "", /当前仍有任务正在运行/);

      const dshRestartBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "重启应用使更新生效")!;
      assert.ok(dshRestartBtn);
    } finally {
      (window as unknown as { oplStudio?: unknown }).oplStudio = previousBridge;
    }
  });
});

test("AboutSettingsPage navigates to Software Center Updates and isolates raw maintenance codes", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { AboutSettingsPage } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/pages/AboutSettingsPage.tsx");
  const opened: Array<string | undefined> = [];
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(AboutSettingsPage, {
      actionViewModel: { gatewayActions: [], agentLifecycle: [], managedUpdates: [], additionalMaintenanceActions: [] },
      nativeAppUpdate: null, managedUpdate: null, projection: undefined, settings: { ...settingsDefaults, locale: "zh" }, zh: true,
      carrierDiagnostics: { schema: "opl_app_carrier_diagnostics.v1", owner: "one-person-lab-app_native_host", carrier: "electron_desktop", status: "available", setLogDirectorySupported: false },
      actionBusyKey: null, onAction() {}, onHostAction: undefined, onOpenSoftwareCenter: section => opened.push(section),
      maintenanceStatus: "failed", maintenanceError: "framework_sync_timeout", stateStatus: "ready"
    }));
    const primary = container.querySelector('[data-testid="settings-about-primary"]')!.textContent ?? "";
    const statusRow = container.querySelector('[data-testid="opl-maintenance-error"]')!.textContent ?? "";
    assert.match(statusRow, /软件中心 > 更新/);
    assert.doesNotMatch(primary, /framework_sync_timeout/);
    const details = container.querySelector("details")!;
    assert.equal(details.open, false);
    assert.match(details.textContent ?? "", /framework_sync_timeout/);
    const updatesBtn = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "软件中心 > 更新")!;
    assert.ok(updatesBtn);
    flushSync(() => updatesBtn.click());
    assert.deepEqual(opened, ["updates"]);
  });
});

test("UpdatesSettingsPage exposes Check all updates button and shows desktop update error details", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { UpdatesSettingsPage } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/pages/UpdatesSettingsPage.tsx");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [] } } } });
  const hostCheck: import("../../plugins/core/opl-studio-client/src/client/workbench/settingsActions.ts").SettingsHostActionIntent = {
    transport: "native_app_updater", key: "app-check", label: "检查桌面更新", operation: "check",
    componentIds: ["opl_app"], confirmationRequired: false, availability: "ready", sourceRef: "desktop:updater"
  };
  let refreshed = 0;
  const hostActions: unknown[] = [];
  await withSettingsTestDom(async ({ container, render }) => {
    render(createElement(UpdatesSettingsPage, {
      actionViewModel: { gatewayActions: [], agentLifecycle: [], managedUpdates: [{ componentId: "opl_app", actions: [hostCheck] }], additionalMaintenanceActions: [] },
      managedUpdate: null, projection: model.settingsProjection, settings: { ...settingsDefaults, locale: "zh" },
      nativeAppUpdate: { schema: "opl_native_app_updater.v1", owner: "one-person-lab-app_desktop_host", host: "electron", operation: "check", supported: true, state: "error", currentVersion: "26.11.20", message: "Network unreachable" },
      model, actionBusyKey: null, onAction() {}, onHostAction: intent => hostActions.push(intent), catalogOrigin: "all", onRefresh: () => { refreshed += 1; }
    }));
    const checkAll = container.querySelector<HTMLButtonElement>('[data-testid="opl-check-all-updates"]')!;
    assert.ok(checkAll);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Network unreachable/);
    flushSync(() => checkAll.click());
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(refreshed, 1);
    assert.deepEqual(hostActions, [hostCheck]);
  });
});

test("DshPluginManagerOwner unified all-software scope displays Billion Context with direct install action", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { DshPluginManagerOwner } = await import("../../plugins/core/opl-studio-client/src/client/composition/dshPluginManagerOwner.tsx");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [] } } } });
  const ops: string[] = [];
  await withSettingsTestDom(async ({ container, render }) => {
    const previousBridge = (window as unknown as { oplStudio?: unknown }).oplStudio;
    (window as unknown as { oplStudio?: unknown }).oplStudio = {
      readBillionContext: async () => ({ installed: false, enabled: false, active: false, availableVersion: "0.3.0" }),
      manageBillionContext: async ({ operation }: { operation: string }) => {
        ops.push(operation);
        return { installed: true, enabled: true, active: false, version: "0.3.0", availableVersion: "0.3.0" };
      },
      restartNativeApp: async () => ({ schema: "opl_native_app_updater.v1", owner: "desktop", host: "electron", operation: "restart", supported: false, state: "restart_scheduled", accepted: true })
    };
    try {
      render(createElement(DshPluginManagerOwner, {
        kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {}
      }));
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(container.querySelector('[data-testid="opl-settings-agent-catalog"]')?.getAttribute("data-catalog-scope"), "all");
      const row = container.querySelector('[data-plugin-owner-package="billion-context"]')!;
      assert.ok(row);
      const installBtn = [...row.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "安装")!;
      assert.ok(installBtn);
      flushSync(() => installBtn.click());
      const confirmModal = document.body.querySelector('[data-testid="opl-dsh-confirm-modal"]');
      assert.ok(confirmModal);
      const confirmBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="opl-dsh-confirm-submit"]')!;
      assert.ok(confirmBtn);
      flushSync(() => confirmBtn.click());
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.deepEqual(ops, ["install"]);
      assert.ok([...row.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "重启应用生效"));
    } finally {
      (window as unknown as { oplStudio?: unknown }).oplStudio = previousBridge;
    }
  });
});

test("OplSoftwareUpdates surfaces quarantined DSH profile boot recovery notice without collapsing", async () => {
  const { createElement } = await import("react");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { OplSoftwareUpdates } = await import("../../plugins/core/opl-studio-client/src/client/workbench/OplSoftwareUpdates.tsx");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [] } } } });
  await withSettingsTestDom(async ({ container, render }) => {
    const previousBridge = (window as unknown as { oplStudio?: unknown }).oplStudio;
    (window as unknown as { oplStudio?: unknown }).oplStudio = {
      readDshPluginUpdates: async () => ({
        schema: "opl_dsh_plugin_updates.v1",
        profile: "opl-studio",
        checkedAt: "2026-11-23T06:00:00Z",
        plugins: { "@gaofeng21cn/opl-studio-client": { installed: "0.1.5", available: "0.1.5", state: "current" } },
        profileBootRecovery: {
          schema: "opl_dsh_profile_recovery.v1",
          recoveredAt: "2026-11-23T05:59:00Z",
          quarantinedPackages: { "@gaofeng21cn/opl-studio-client": "0.1.9" },
          reason: "SyntaxError in overridden plugin"
        }
      })
    };
    try {
      render(createElement(OplSoftwareUpdates, { model, locale: "zh", actionBusyKey: null, onAction() {} }));
      await new Promise(resolve => setTimeout(resolve, 30));
      const recovery = container.querySelector('[data-testid="dsh-profile-boot-recovery"]');
      assert.ok(recovery);
      assert.match(recovery.textContent ?? "", /已自动回退至内置稳定版本/);
      assert.match(recovery.textContent ?? "", /0\.1\.9/);
      assert.ok([...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "重新检查"));
    } finally {
      (window as unknown as { oplStudio?: unknown }).oplStudio = previousBridge;
    }
  });
});

test("UpdatesSettingsPage Update All orchestrates DSH plugins, desktop updates, and package updates", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { UpdatesSettingsPage } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/pages/UpdatesSettingsPage.tsx");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [] } } } });
  const appApply: import("../../plugins/core/opl-studio-client/src/client/workbench/settingsActions.ts").SettingsHostActionIntent = {
    transport: "native_app_updater", key: "app-apply", label: "下载桌面更新", operation: "apply",
    componentIds: ["opl_app"], confirmationRequired: false, availability: "ready", sourceRef: "desktop:updater"
  };
  let pluginUpdatesCalled = 0, restartSignaled = 0;
  const hostActions: unknown[] = [];
  await withSettingsTestDom(async ({ container, render }) => {
    const previousBridge = (window as unknown as { oplStudio?: unknown }).oplStudio;
    (window as unknown as { oplStudio?: unknown }).oplStudio = {
      readDshPluginUpdates: async () => ({
        schema: "opl_dsh_plugin_updates.v1",
        profile: "opl-studio",
        checkedAt: "2026-11-23T06:00:00Z",
        plugins: { "@gaofeng21cn/opl-studio-client": { installed: "0.1.5", available: "0.1.6", state: "update_available" } }
      }),
      updateDshPlugins: async ({ all }: { all?: boolean }) => {
        if (all) pluginUpdatesCalled += 1;
        return { application: "restart-required", installed: { "@gaofeng21cn/opl-studio-client": "0.1.6" }, failures: {} };
      }
    };
    try {
      render(createElement(UpdatesSettingsPage, {
        actionViewModel: { gatewayActions: [], agentLifecycle: [], managedUpdates: [{ componentId: "opl_app", actions: [appApply] }], additionalMaintenanceActions: [] },
        managedUpdate: null, projection: model.settingsProjection, settings: { ...settingsDefaults, locale: "zh" },
        nativeAppUpdate: { schema: "opl_native_app_updater.v1", owner: "one-person-lab-app_desktop_host", host: "electron", operation: "status", supported: true, state: "available", currentVersion: "26.11.20", targetVersion: "26.11.23" },
        model, actionBusyKey: null, onAction() {}, onHostAction: intent => hostActions.push(intent), catalogOrigin: "all",
        onDshRestartRequired: () => { restartSignaled += 1; }
      }));
      await new Promise(resolve => setTimeout(resolve, 30));
      const updateAllBtn = container.querySelector<HTMLButtonElement>('[data-testid="opl-update-all"]')!;
      assert.ok(updateAllBtn);
      flushSync(() => updateAllBtn.click());
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(pluginUpdatesCalled, 1);
      assert.equal(restartSignaled, 1);
      assert.deepEqual(hostActions, [appApply]);
      assert.match(container.textContent ?? "", /扩展更新已安装/);
    } finally {
      (window as unknown as { oplStudio?: unknown }).oplStudio = previousBridge;
    }
  });
});

test("ShellOverlaySlot shows global lightweight restart pill outside Software Center and hides inside it", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { ShellOverlaySlot } = await import("../../plugins/core/opl-studio-client/src/client/composition/slotHost/shellSettingsSlots.tsx");
  const { StudioContext } = await import("../../plugins/core/opl-studio-client/src/client/composition/slotHost/studioContext.tsx");
  let restarted = 0;
  await withSettingsTestDom(({ container, render }) => {
    const baseSurface = {
      locale: "zh", primaryView: "conversation", overlay: null, detailsOpen: false, detailTabs: [],
      pendingUpdateRestart: true, onRestartForUpdates: () => { restarted += 1; }, openPrimaryView() {}
    } as never;
    render(createElement(StudioContext.Provider, { value: baseSurface }, createElement(ShellOverlaySlot)));
    const trigger = container.querySelector<HTMLButtonElement>('[data-testid="opl-global-restart-trigger"]')!;
    assert.ok(trigger);
    assert.match(trigger.textContent ?? "", /更新已就绪 · 重启生效/);
    flushSync(() => trigger.click());
    assert.equal(restarted, 1);

    const hiddenSurface = { ...baseSurface, primaryView: "applications" } as never;
    render(createElement(StudioContext.Provider, { value: hiddenSurface }, createElement(ShellOverlaySlot)));
    assert.equal(container.querySelector('[data-testid="opl-global-restart-trigger"]'), null);

    const packageSurface = { ...hiddenSurface, pendingUpdateRestart: false, packageUpdateActivation: "restart" } as never;
    render(createElement(StudioContext.Provider, { value: packageSurface }, createElement(ShellOverlaySlot)));
    flushSync(() => container.querySelector<HTMLButtonElement>('[data-testid="opl-global-restart-trigger"]')!.click());
    assert.equal(restarted, 2);
    const reloadSurface = { ...packageSurface, packageUpdateActivation: "reload" } as never;
    render(createElement(StudioContext.Provider, { value: reloadSurface }, createElement(ShellOverlaySlot)));
    assert.equal(container.querySelector('[data-testid="opl-global-restart-trigger"]'), null);
    assert.ok(container.querySelector('[data-testid="opl-global-reload-trigger"]'));
  });
});

test("Software Center generic DSH catalog renders optional plugins, staged single-restart Billion Context, core runtime under components, and unified activity tab", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { ApplicationManagementPage } = await import("../../plugins/core/opl-studio-client/src/client/workbench/ApplicationManagementPage.tsx");
  const model = deriveWorkbenchModelFromState({
    app_state: {
      agent_packages: {
        directory: {
          entries: [
            { package_id: "wechat-bridge", display_name: "WeChat Remote", catalog_scope: "software", catalog_origin: "opl", software_type: "capability", installed: true, installed_version: "0.2.0" }
          ]
        }
      }
    }
  });
  const managedActions: Array<{ pluginId: string; operation: string }> = [];
  let restartSignaled = 0;
  await withSettingsTestDom(async ({ container, render }) => {
    const previousBridge = (window as unknown as { oplStudio?: unknown }).oplStudio;
    const baseCatalog = {
      schema: "opl_dsh_plugin_catalog.v1",
      checkedAt: "2026-11-23T12:00:00Z",
      restartRequired: true,
      activity: [
        {
          id: "act-1",
          pluginId: "billion-context",
          packageName: "billion-context",
          labelI18n: { zh: "Billion Context", en: "Billion Context" },
          action: "update",
          status: "staged_restart",
          startedAt: "2026-11-23T12:00:00Z",
          finishedAt: "2026-11-23T12:00:00Z",
          targetVersion: "0.3.2",
          restartRequired: true
        }
      ],
      entries: [
        {
          pluginId: "opl-team-bots",
          packageName: "@gaofeng21cn/opl-team-bots",
          tier: "optional_product",
          origin: "opl",
          intentCategory: "efficiency",
          canToggle: true,
          canInstall: false,
          canUninstall: false,
          settingsDestination: "capabilities",
          labelI18n: { zh: "智能体协作", en: "Agent Collaboration" },
          descriptionI18n: { zh: "多智能体协同对话。", en: "Collaborative workbench." },
          permissionsI18n: { zh: ["复用当前 Codex 会话"], en: ["Reuses Codex threads"] },
          installed: true,
          enabled: true,
          active: true,
          version: "0.1.0",
          activeVersion: "0.1.0",
          availableVersion: null,
          updateAvailable: false,
          startupFailed: false,
          pendingRestart: false,
          pendingOperation: null,
          pendingVersion: null
        },
        {
          pluginId: "billion-context",
          packageName: "billion-context",
          tier: "external_plugin",
          origin: "external",
          intentCategory: "efficiency",
          canToggle: true,
          canInstall: true,
          canUninstall: true,
          settingsDestination: "models",
          labelI18n: { zh: "Billion Context", en: "Billion Context" },
          descriptionI18n: { zh: "压缩长对话。", en: "Compress long conversations." },
          permissionsI18n: { zh: ["Codex 启动包装代理"], en: ["Codex launcher wrapper"] },
          installed: true,
          enabled: true,
          active: true,
          version: "0.3.0",
          activeVersion: "0.3.0",
          availableVersion: "0.3.2",
          updateAvailable: true,
          startupFailed: false,
          pendingRestart: true,
          pendingOperation: "update",
          pendingVersion: "0.3.2"
        },
        {
          pluginId: "opl-host-core",
          packageName: "@gaofeng21cn/opl-host-core",
          tier: "core_runtime",
          origin: "opl",
          intentCategory: "runtime",
          canToggle: false,
          canInstall: false,
          canUninstall: false,
          labelI18n: { zh: "OPL 宿主核心服务", en: "OPL Host Core" },
          descriptionI18n: { zh: "核心服务。", en: "Core runtime." },
          permissionsI18n: { zh: ["必需核心服务"], en: ["Required core runtime"] },
          installed: true,
          enabled: true,
          active: true,
          version: "0.1.0",
          activeVersion: "0.1.0",
          availableVersion: null,
          updateAvailable: false,
          startupFailed: false,
          pendingRestart: false,
          pendingOperation: null,
          pendingVersion: null
        }
      ]
    };
    (window as unknown as { oplStudio?: unknown }).oplStudio = {
      readDshPluginCatalog: async () => baseCatalog,
      manageDshPlugin: async ({ pluginId, operation }: { pluginId: string; operation: string }) => {
        managedActions.push({ pluginId, operation });
        return baseCatalog;
      },
      restartNativeApp: async () => ({ schema: "opl_native_app_updater.v1", owner: "desktop", host: "electron", operation: "restart", supported: false, state: "restart_scheduled", accepted: true })
    };
    try {
      render(createElement(ApplicationManagementPage, {
        model,
        settings: { ...settingsDefaults, locale: "zh" },
        managedUpdate: null,
        actionViewModel: { gatewayActions: [], agentLifecycle: [], managedUpdates: [], additionalMaintenanceActions: [] },
        nativeAppUpdate: null,
        actionBusyKey: null,
        onAction() {},
        onRefresh() {},
        onDshRestartRequired: () => { restartSignaled += 1; }
      }));
      await new Promise(resolve => setTimeout(resolve, 30));
      // All-software view shows optional plugin and staged external plugin, hides core_runtime
      assert.ok(container.querySelector('[data-plugin-owner-package="opl-team-bots"]'));
      assert.ok(container.querySelector('[data-plugin-owner-package="billion-context"]'));
      assert.equal(container.querySelector('[data-plugin-owner-package="opl-host-core"]'), null);
      assert.ok(restartSignaled >= 1);

      // Components view reveals core_runtime
      const componentsBtn = container.querySelector<HTMLButtonElement>('#opl-catalog-scope-components')!;
      flushSync(() => componentsBtn.click());
      assert.ok(container.querySelector('[data-plugin-owner-package="opl-host-core"]'));

      // Activity tab shows unified DSH plugin staged record
      const activityTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(el => el.textContent?.includes("安装记录"))!;
      flushSync(() => activityTab.click());
      assert.match(container.textContent ?? "", /Billion Context/);
      assert.match(container.textContent ?? "", /已暂存，重启应用后生效/);
    } finally {
      (window as unknown as { oplStudio?: unknown }).oplStudio = previousBridge;
    }
  });
});

test("ShellOverlaySlot shows global reload pill for renderer_reload updates outside Software Center", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { ShellOverlaySlot } = await import("../../plugins/core/opl-studio-client/src/client/composition/slotHost/shellSettingsSlots.tsx");
  const { StudioContext } = await import("../../plugins/core/opl-studio-client/src/client/composition/slotHost/studioContext.tsx");
  let reloaded = 0;
  await withSettingsTestDom(({ container, render }) => {
    const baseSurface = {
      locale: "zh", primaryView: "conversation", overlay: null, detailsOpen: false, detailTabs: [],
      pendingUpdateRestart: false, pendingUpdateReload: true, onReloadForUpdates: () => { reloaded += 1; }, openPrimaryView() {}
    } as never;
    render(createElement(StudioContext.Provider, { value: baseSurface }, createElement(ShellOverlaySlot)));
    const trigger = container.querySelector<HTMLButtonElement>('[data-testid="opl-global-reload-trigger"]')!;
    assert.ok(trigger);
    assert.match(trigger.textContent ?? "", /界面更新已就绪 · 刷新生效/);
    flushSync(() => trigger.click());
    assert.equal(reloaded, 1);

    const hiddenSurface = { ...baseSurface, primaryView: "applications" } as never;
    render(createElement(StudioContext.Provider, { value: hiddenSurface }, createElement(ShellOverlaySlot)));
    assert.equal(container.querySelector('[data-testid="opl-global-reload-trigger"]'), null);
  });
});

test("UpdatesSettingsPage Update All displays OPL Base read-only and handles renderer_reload, external DSH plugins, and batch package queue without duplicate DSH bulk button", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { UpdatesSettingsPage } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/pages/UpdatesSettingsPage.tsx");
  const makePkg = (id: string) => ({
    package_id: id, display_name: id, catalog_origin: "opl", catalog_scope: "software",
    installed: true, installed_version: "1.0.0", selected_version: "1.1.0",
    package_currentness: "update_available",
    available_actions: [{ action_id: "agent_package_update", action_ref: "app_state.actions#agent_package_update", semantic: "update", status: "available", payload: { package_id: id }, required_payload_fields: ["package_id"] }]
  });
  const model = deriveWorkbenchModelFromState({ app_state: {
    actions: [{ action_id: "agent_package_update", label: "Update package", dry_run_supported: true, confirmation_required: true }],
    agent_packages: { directory: { entries: [makePkg("pkg-a"), makePkg("pkg-b")] } }
  } });
  const hostActions: unknown[] = [];
  const batches: unknown[][] = [];
  let reloadReadySignaled = 0;
  let restartSignaled = 0;
  await withSettingsTestDom(async ({ container, render }) => {
    const previousBridge = (window as unknown as { oplStudio?: unknown }).oplStudio;
    (window as unknown as { oplStudio?: unknown }).oplStudio = {
      readDshPluginUpdates: async () => ({
        schema: "opl_dsh_plugin_updates.v1",
        profile: "opl-studio",
        checkedAt: "2026-11-24T01:00:00Z",
        plugins: { "@gaofeng21cn/opl-runtime-status": { installed: "0.1.1", available: "0.1.2", state: "update_available" } }
      }),
      readDshPluginCatalog: async () => ({
        schema: "opl_dsh_plugin_catalog.v1",
        checkedAt: "2026-11-24T01:00:00Z",
        restartRequired: false,
        activity: [],
        entries: [{
          pluginId: "opl-runtime-status",
          packageName: "@gaofeng21cn/opl-runtime-status",
          tier: "optional_product",
          origin: "opl",
          intentCategory: "efficiency",
          canToggle: true,
          canInstall: false,
          canUninstall: false,
          labelI18n: { zh: "运行概览", en: "Runtime Overview" },
          descriptionI18n: { zh: "", en: "" },
          permissionsI18n: { zh: [], en: [] },
          installed: true,
          enabled: true,
          active: true,
          version: "0.1.1",
          activeVersion: "0.1.1",
          availableVersion: "0.1.2",
          updateAvailable: true,
          startupFailed: false,
          pendingRestart: false,
          pendingOperation: null,
          pendingVersion: null
        }]
      }),
      updateDshPlugins: async () => ({
        application: "renderer-reload",
        reloadMode: "renderer_reload",
        installed: { "@gaofeng21cn/opl-runtime-status": "0.1.2" },
        failures: {}
      })
    };
    try {
      render(createElement(UpdatesSettingsPage, {
        actionViewModel: {
          gatewayActions: [],
          agentLifecycle: [],
          managedUpdates: [{
            componentId: "opl_base",
            component: { componentId: "opl_base", lifecycleOwner: "opl", label: "基础服务", state: "current", installedVersion: "2.1.0", autoApplyEligible: false, backgroundSafe: false },
            actions: []
          }],
          additionalMaintenanceActions: []
        },
        managedUpdate: null, projection: model.settingsProjection, settings: { ...settingsDefaults, locale: "zh" },
        nativeAppUpdate: null, model, actionBusyKey: null,
        onAction() {},
        onActionBatch: items => batches.push(items),
        onHostAction: intent => hostActions.push(intent),
        catalogOrigin: "all",
        onDshRestartRequired: () => { restartSignaled += 1; },
        onDshReloadReady: () => { reloadReadySignaled += 1; }
      }));
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal([...container.querySelectorAll<HTMLButtonElement>("button")].some(b => b.textContent === "更新全部扩展组件"), false);
      assert.match(container.textContent ?? "", /运行概览/);
      const updateAllBtn = container.querySelector<HTMLButtonElement>('[data-testid="opl-update-all"]')!;
      assert.ok(updateAllBtn);
      flushSync(() => updateAllBtn.click());
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(reloadReadySignaled, 1);
      assert.equal(restartSignaled, 0);
      assert.deepEqual(hostActions, []);
      assert.equal(batches.length, 1);
      assert.equal(batches[0].length, 2);
      assert.match(container.textContent ?? "", /界面扩展已更新，刷新界面即可立即生效/);
    } finally {
      (window as unknown as { oplStudio?: unknown }).oplStudio = previousBridge;
    }
  });
});

test("DshPluginManagerOwner unifies external scope without jargon groups and opens npm install modal", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
  const { DshPluginManagerOwner } = await import("../../plugins/core/opl-studio-client/src/client/composition/dshPluginManagerOwner.tsx");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [{
    package_id: "codex-plugin-a", display_name: "Codex Tool", catalog_origin: "external", catalog_scope: "software",
    catalog_source: { manager: "codex_plugin_manager" }, installed: true, installed_version: "1.0.0"
  }] } } } });
  const managedCalls: Array<{ pluginId: string; packageName?: string; operation: string }> = [];
  await withSettingsTestDom(async ({ container, render }) => {
    const previousBridge = (window as unknown as { oplStudio?: unknown }).oplStudio;
    const baseCatalog = {
      schema: "opl_dsh_plugin_catalog.v1",
      checkedAt: "2026-11-24T01:00:00Z",
      restartRequired: false,
      activity: [],
      entries: []
    };
    (window as unknown as { oplStudio?: unknown }).oplStudio = {
      readDshPluginCatalog: async () => baseCatalog,
      manageDshPlugin: async (req: { pluginId: string; packageName?: string; operation: string }) => {
        managedCalls.push(req);
        return { ...baseCatalog, restartRequired: true };
      }
    };
    try {
      render(createElement(DshPluginManagerOwner, {
        kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {}
      }));
      await new Promise(resolve => setTimeout(resolve, 30));
      const extBtn = container.querySelector<HTMLButtonElement>('#opl-catalog-scope-external')!;
      flushSync(() => extBtn.click());
      const headings = [...container.querySelectorAll("h2, h3, summary")].map(el => el.textContent ?? "");
      assert.equal(headings.some(text => text === "DSH 插件" || text === "Codex 插件" || text === "独立 Skills"), false);
      assert.match(container.textContent ?? "", /Codex Tool/);

      const openInstallBtn = container.querySelector<HTMLButtonElement>('[data-testid="opl-open-dsh-install-trigger"]')!;
      flushSync(() => openInstallBtn.click());
      const modal = document.body.querySelector('[data-testid="opl-open-dsh-install-modal"]')!;
      assert.ok(modal);
      const input = modal.querySelector<HTMLInputElement>("input")!;
      const win = window as unknown as {
        HTMLInputElement: typeof HTMLInputElement;
        Event: typeof Event;
        KeyboardEvent: typeof KeyboardEvent;
      };
      Object.assign(input, { attachEvent() {}, detachEvent() {} });
      flushSync(() => input.focus());
      flushSync(() => {
        const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
        setter.call(input, "@community/dsh-notes");
        input.dispatchEvent(new win.Event("input", { bubbles: true }));
        input.dispatchEvent(new win.Event("change", { bubbles: true }));
        input.dispatchEvent(new win.KeyboardEvent("keyup", { key: "s", bubbles: true }));
      });
      const submitBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="opl-open-dsh-install-submit"]')!;
      assert.equal(submitBtn.disabled, false);
      flushSync(() => submitBtn.click());
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.deepEqual(managedCalls, [{ pluginId: "@community/dsh-notes", packageName: "@community/dsh-notes", operation: "install" }]);
    } finally {
      (window as unknown as { oplStudio?: unknown }).oplStudio = previousBridge;
    }
  });
});
