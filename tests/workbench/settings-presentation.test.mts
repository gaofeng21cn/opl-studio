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
    useHighestSupportedReasoningForUnknown: true
  }
});

const presentation = await import("../../src/workbench/SettingsPanel.tsx");
const workbenchServices = await import("../../src/workbench/plugins/WorkbenchServicesPanel.tsx");
const { startupCheckPresentation } = await import("../../src/workbench/startupCheckPresentation.ts");
const { normalizeInitializeReadback } = await import("../../src/bridge/oplBridge.ts");
const settingsSource = readFileSync(new URL("../../src/workbench/SettingsPanel.tsx", import.meta.url), "utf8") + readdirSync(new URL("../../src/workbench/settings/", import.meta.url), { recursive: true }).filter(file => String(file).endsWith(".tsx")).map(file => readFileSync(new URL(`../../src/workbench/settings/${file}`, import.meta.url), "utf8")).join("\n");

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
    checklist: [{ item_id: "family_runtime_provider", user_action_required: true, reason_code: "temporal_worker_source_stale" }]
  } });
  const view = startupCheckPresentation(input, "ready", true);
  assert.equal(view.status, "attention_needed");
  assert.equal(view.issues[0].destination, "services");
  assert.match(view.detail, /旧版本.*重启/);
  assert.match(view.detail, /3 \/ 3/);
  assert.equal(startupCheckPresentation(input, "error", true).status, "error");
  const unknownReason = startupCheckPresentation(normalizeInitializeReadback({system_initialize: {setup_flow: {ready_to_launch: false}}}), "ready", true);
  assert.equal(unknownReason.issues[0].destination, "diagnostics");
  assert.match(unknownReason.detail, /未返回原因/);
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
    ["capabilities", "agents", "instructions"]
  );
  assert.deepEqual(
    presentation.settingsSubDestinations("services", "zh").map((destination) => destination.id),
    ["services", "updates", "diagnostics"]
  );
  assert.equal(presentation.settingsDestinations("zh").some((destination) => destination.id === "about"), true);
  assert.equal(presentation.settingsDestinations("zh").some((destination) => destination.id === "schedules" || destination.id === "memory"), false);
  assert.equal(presentation.navigationGroups("zh").find((group) => group.id === "connections_deployment")?.label, "连接与部署");
  assert.equal(presentation.navigationGroups("en").find((group) => group.id === "connections_deployment")?.label, "Connections & Deployment");
  assert.equal(presentation.navigationGroups("zh").find((group) => group.id === "connections_deployment")?.destinations[0]?.label, "资源与连接");
  assert.equal(presentation.navigationGroups("en").find((group) => group.id === "connections_deployment")?.destinations[0]?.label, "Resources & Connections");
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
  assert.match(settingsSource, /Temporal 运行时/);
  assert.match(settingsSource, /已安装 Agent 与能力包/);
  assert.match(settingsSource, /managed-package-states/);
});

test("settings keeps Codex version and update channel on the maintenance owner page", () => {
  assert.match(settingsSource, /默认自动（静默）/);
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

test("package catalog defaults to OPL software and keeps manifest import in other sources", () => {
  const ownerSource = readFileSync(new URL("../../src/composition/dshPluginManagerOwner.tsx", import.meta.url), "utf8");
  assert.match(ownerSource, /useState<SoftwareCatalogScope>\("opl"\)/);
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
    ["external_package_explicit_update_only", "第三方包：当前策略要求手动更新"],
    ["user_disabled_package", "已停用：暂停自动更新"],
    ["native_carrier_attention_required", "安装状态需修复：暂不能自动更新"],
    ["local_or_user_managed_source", "本地或用户管理的来源：不自动覆盖"]
  ]) {
    assert.equal(presentation.managedPackageUpdateLabel({ updateMode: "unknown", autoApplyEligible: false, backgroundUpdateReason: reason }, "zh"), label);
  }
});

const { gatewayAccountErrorMessage } = await import("../../src/workbench/settings/gatewayAccountMessages.ts");

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
  const { deriveWorkbenchModelFromState } = await import("../../src/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../src/workbench/settingsModel.ts");
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
  const { deriveWorkbenchModelFromState } = await import("../../src/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../src/workbench/settingsModel.ts");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    { package_id: "private-agent", catalog_scope: "software", catalog_origin: "opl", package_role: "standard_agent", display_name: "Private Agent", publisher: "OPL", installed: false,
      package_access: { visibility: "authorized_only", status: "signed_out", provider_id: "github", discover_allowed: true, download_allowed: false, reason: "github_source_account_required" },
      installability: { installable: false }, available_actions: [{ action_id: "agent_package_install", action_ref: "app_state.actions#agent_package_install", semantic: "install", status: "unavailable", reason: "github_source_account_required", payload: { package_id: "private-agent" }, required_payload_fields: ["package_id"] }] }
  ] } } } });
  const html = renderToStaticMarkup(createElement(presentation.PackageCatalog, { kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {} }));
  assert.match(html, /Private Agent/);
  assert.match(html, /私有/);
  assert.match(html, /data-plugin-owner-package="private-agent"/);
  assert.doesNotMatch(html, />安装<\/button>/);
});

test("software source management keeps private credentials refs-only", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { SoftwareSourcesPage } = await import("../../src/workbench/SoftwareSourcesPage.tsx");
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

test("native software shares the application catalog and dispatches revision-bound lifecycle actions", async () => {
  const { createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const { Window } = await import("happy-dom");
  const { settingsDefaults } = await import("../../src/workbench/settingsModel.ts");
  const { deriveWorkbenchModelFromState } = await import("../../src/workbench/workbenchModel.ts");
  const { NativeSoftwareList } = await import("../../src/workbench/SoftwareSourcesPage.tsx");
  const { nativeSoftwareEntries } = await import("../../src/workbench/softwareSources.ts");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [] }, sources: {
    surface_kind: "opl_software_sources_projection.v1", status: "available", entries: [{
      source_id: "homebrew", display_name: "OPL Homebrew", source_kind: "tap", status: "public", inventory_status: "available", entry_count: 1, native_items: [{
        catalog_origin: "opl", item_id: "cask:studio", name: "studio", display_name: "Native Studio", kind: "cask", installed: true, installed_version: "1", available_version: "2", update_status: "available", revision: "r1",
        available_actions: ["source_update", "source_uninstall"].map(action_id => ({ action_id, status: "available", payload_fields: ["source_id", "item_id", "expected_revision"], default_payload: { source_id: "homebrew", item_id: "cask:studio", expected_revision: "r1" }, confirmation_required: true }))
      }]
    }]
  } } } });
  const browser = new Window({ url: "http://localhost/" });
  const keys = ["window", "document", "HTMLElement", "Node"] as const;
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  keys.forEach(key => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "window" ? browser : browser[key] }));
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Element);
  const actions: unknown[] = [];
  try {
    flushSync(() => root.render(createElement(presentation.PackageCatalog, { kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction: action => actions.push(action) })));
    assert.match(container.textContent!, /Native Studio/);
    assert.equal(container.querySelector('[data-plugin-owner-package="homebrew:cask:studio"] [data-label="可用版本"]')?.textContent, "2");
    assert.equal(container.querySelectorAll('[aria-label="按状态筛选"]').length, 1);
    const filter = container.querySelector('[aria-label="按状态筛选"]') as HTMLSelectElement;
    flushSync(() => { filter.value = "not_installed"; filter.dispatchEvent(new browser.Event("change", { bubbles: true })); });
    assert.equal(container.querySelector('[data-testid="opl-native-software-row"]'), null);
    flushSync(() => { filter.value = "update_available"; filter.dispatchEvent(new browser.Event("change", { bubbles: true })); });
    const update = [...container.querySelectorAll("button")].find(button => button.textContent === "更新")!;
    update.click();
    assert.equal((actions[0] as { actionId: string }).actionId, "source_update");
    assert.deepEqual((actions[0] as { payload: unknown }).payload, { source_id: "homebrew", item_id: "cask:studio", expected_revision: "r1" });
    assert.equal((actions[0] as { confirmationRequired: boolean }).confirmationRequired, true);
    const entries = nativeSoftwareEntries(model.softwareSources);
    entries[0]!.item.revision = "r2";
    flushSync(() => root.render(createElement(NativeSoftwareList, { entries, locale: "zh", actionBusyKey: null, onAction: action => actions.push(action) })));
    assert.equal([...container.querySelectorAll("button")].some(button => button.textContent === "更新" || button.textContent === "卸载"), false);
  } finally {
    flushSync(() => root.unmount());
    await new Promise(resolve => setImmediate(resolve));
    browser.close();
    keys.forEach(key => { const original = originals.get(key); if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); });
  }
});

async function withSettingsTestDom(run: (surface: { container: HTMLElement; render(node: unknown): void }) => void) {
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
    run({
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

test("official package restore is exposed through an explicit confirmation action", async () => {
  const { createElement } = await import("react");
  const { deriveWorkbenchModelFromState } = await import("../../src/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../src/workbench/settingsModel.ts");
  const { SettingsActionDialog } = await import("../../src/workbench/settings/SettingsActionDialog.tsx");
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

test("official catalog keeps an unknown native installation state as unconfirmed", async () => {
  const { createElement } = await import("react");
  const { deriveWorkbenchModelFromState } = await import("../../src/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../src/workbench/settingsModel.ts");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: {
    surface_kind: "opl_app_agent_packages_projection",
    directory: { entries: [] },
    sources: { surface_kind: "opl_software_sources_projection.v1", status: "available", entries: [{
      source_id: "homebrew", display_name: "OPL Homebrew", source_kind: "tap", status: "public", inventory_status: "available", native_items: [{
        catalog_origin: "opl", item_id: "cask:studio", name: "studio", display_name: "Native Studio", kind: "cask", installed: null, update_status: "unknown"
      }]
    }] }
  } } });
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(presentation.PackageCatalog, {
      kind: "all", model, settings: { ...settingsDefaults, locale: "en" }, actionBusyKey: null, onAction() {}
    }));
    const card = container.querySelector('[data-plugin-owner-package="homebrew:cask:studio"]');
    assert.ok(card);
    assert.match(card.textContent ?? "", /Native Studio/);
    assert.match(card.textContent ?? "", /Not checked/);
    assert.doesNotMatch(card.textContent ?? "", /Not installed/);
  });
});

test("application updates tab lists native software with an available update", async () => {
  const { createElement } = await import("react");
  const { deriveWorkbenchModelFromState } = await import("../../src/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../src/workbench/settingsModel.ts");
  const { ApplicationManagementPage } = await import("../../src/workbench/ApplicationManagementPage.tsx");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: {
    surface_kind: "opl_app_agent_packages_projection",
    directory: { entries: [] },
    sources: { surface_kind: "opl_software_sources_projection.v1", status: "available", entries: [{
      source_id: "homebrew", display_name: "OPL Homebrew", source_kind: "tap", status: "public", inventory_status: "available", native_items: [{
        catalog_origin: "opl", item_id: "cask:studio", name: "studio", display_name: "Native Studio", kind: "cask", installed: true, installed_version: "1", available_version: "2", update_status: "available", revision: "revision-1",
        available_actions: [{ action_id: "source_update", label: "Update", status: "available", payload_fields: ["source_id", "item_id", "expected_revision"], default_payload: { source_id: "homebrew", item_id: "cask:studio", expected_revision: "revision-1" }, confirmation_required: true, dry_run_supported: true }]
      }, {
        catalog_origin: "opl", item_id: "formula:current-tool", name: "current-tool", display_name: "Current Native Tool", kind: "formula", installed: true, installed_version: "2", available_version: "2", update_status: "current", revision: "revision-2", available_actions: []
      }]
    }] }
  } } });
  const actions: Array<{ actionId: string; payload: Record<string, unknown>; confirmationRequired: boolean }> = [];
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(ApplicationManagementPage, {
      model, settings: { ...settingsDefaults, locale: "en" }, managedUpdate: null, nativeAppUpdate: null,
      actionViewModel: { gatewayActions: [], agentLifecycle: [], managedUpdates: [], additionalMaintenanceActions: [] },
      actionBusyKey: null, initialTab: "updates", onAction: action => actions.push(action), onRefresh() {}
    }));
    assert.match(container.textContent ?? "", /Native Studio/);
    assert.match(container.textContent ?? "", /Update available/);
    assert.doesNotMatch(container.textContent ?? "", /Current Native Tool/);
    const update = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent?.trim() === "更新" || button.textContent?.trim() === "Update");
    assert.ok(update);
    update.click();
    assert.deepEqual(actions.map(({ actionId, payload, confirmationRequired }) => ({ actionId, payload, confirmationRequired })), [{
      actionId: "source_update",
      payload: { source_id: "homebrew", item_id: "cask:studio", expected_revision: "revision-1" },
      confirmationRequired: true
    }]);
  });
});


test("catalog separates owner-admitted software from host components without inventing maturity", async () => {
  const { flushSync } = await import("react-dom");
  const { createElement } = await import("react");
  const { deriveWorkbenchModelFromState } = await import("../../src/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../src/workbench/settingsModel.ts");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    { package_id: "kindle-pilot", display_name: "Kindle Pilot", catalog_scope: "software", catalog_origin: "opl", package_role: "capability_package", release_channel: "preview", distribution_channel: "source", installed: true, installed_version: "1.2.0", selected_version: "1.1.0", description: "Manage a reading device." },
    { package_id: "host-browser", display_name: "Host Browser", catalog_scope: "host_component", installed: true },
    { package_id: "legacy-unknown", display_name: "Unknown legacy item", installed: true },
  ] } } } });
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(presentation.PackageCatalog, { kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {} }));
    const text = container.textContent ?? "";
    assert.match(text, /Kindle Pilot/);
    assert.equal(container.querySelector('[data-plugin-owner-package="kindle-pilot"] [data-label="已装版本"]')?.textContent, "1.2.0");
    assert.equal(container.querySelector('[data-plugin-owner-package="kindle-pilot"] [data-label="可用版本"]')?.textContent, "1.1.0");
    assert.doesNotMatch(text, /preview|预览版|stable|稳定版|Host Browser|Unknown legacy item/);
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
  const { deriveWorkbenchModelFromState } = await import("../../src/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../src/workbench/settingsModel.ts");
  const installation = { installation_id: "owner:rednote", kind: "owner_managed", version: "0.2.3", mode: "installed", manager: "package_owner", management_scope: "owner_only", location_ref: "local-data:rednote/app/current", evidence_ref: "owner:status", entrypoint_verified: true };
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    { package_id: "persona", display_name: "Persona", catalog_scope: "software", catalog_origin: "opl", software_type: "agent", package_role: "capability_package", installed: true, installed_version: "1" },
    { package_id: "rednote", display_name: "RedNote", catalog_scope: "software", catalog_origin: "opl", software_type: "application", package_role: "capability_package", installed: false, selected_version: "0.2.3", local_installations: [installation] },
    { package_id: "vault", display_name: "Vault", catalog_scope: "software", catalog_origin: "opl", software_type: "application", package_role: "capability_package", installed: false, selected_version: "0.1.0", local_installations: [{ ...installation, installation_id: "uv:vault", kind: "uv_tool", version: "0.1.0", mode: "development", manager: "uv" }] }
  ] } } } });
  const { packageInstalledLocally, packageDevelopmentLinked } = await import("../../src/workbench/settings/packages.tsx");
  assert.equal(packageInstalledLocally(model.packageLifecycle[1]), true);
  assert.equal(packageInstalledLocally(model.packageLifecycle[2]), false);
  assert.equal(packageDevelopmentLinked(model.packageLifecycle[2]), true);
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(presentation.PackageCatalog, { kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {} }));
    const rednote = container.querySelector('[data-plugin-owner-package="rednote"]');
    assert.equal(rednote?.querySelector('[data-label="已装版本"]')?.textContent, "0.2.3");
    assert.match(rednote?.textContent ?? "", /已安装/);
    assert.doesNotMatch(rednote?.textContent ?? "", /未安装/);
    const vault = container.querySelector('[data-plugin-owner-package="vault"]');
    assert.match(vault?.textContent ?? "", /开发接入/);
    assert.match(container.textContent ?? "", /智能体/);
    assert.doesNotMatch(rednote?.textContent ?? "", /能力包/);
    render(createElement(presentation.PackageCatalog, { kind: "agents", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {} }));
    assert.match(container.textContent ?? "", /Persona/);
    assert.doesNotMatch(container.textContent ?? "", /RedNote|Vault/);
  });
});

test("OPL catalog excludes external and undeclared plugins while other sources expose independent Skills", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../src/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../src/workbench/settingsModel.ts");
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
    assert.doesNotMatch(container.textContent ?? "", /PDF|Unconfirmed publisher|Independent skill|Packaged skill/);
    assert.equal(container.querySelector('[data-plugin-owner-package="our-app"] [data-label="已装版本"]')?.textContent, "2.0");
    const external = container.querySelector<HTMLButtonElement>('#opl-catalog-scope-external')!;
    flushSync(() => external.click());
    assert.match(container.textContent ?? "", /PDF/);
    assert.match(container.textContent ?? "", /Codex 插件/);
    assert.match(container.textContent ?? "", /Independent skill|独立 Skills/);
    assert.match(container.textContent ?? "", /Unconfirmed publisher/);
    assert.doesNotMatch(container.textContent ?? "", /Our App|Packaged skill/);
    assert.equal(container.querySelectorAll('[data-plugin-owner-package^="codex-skill:"]').length, 1);
  });
});

test("catalog state counts development as installed and prioritizes blocked access over a known update", async () => {
  const { deriveWorkbenchModelFromState } = await import("../../src/workbench/workbenchModel.ts");
  const { packageCatalogState, softwareCatalogInventory, catalogInstalledVersion, nativeCatalogAvailableVersion } = await import("../../src/workbench/softwareCatalog.ts");
  const { nativeSoftwareProducts } = await import("../../src/workbench/softwareSources.ts");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    { package_id: "dev", catalog_origin: "opl", catalog_scope: "software", installed: false, local_installations: [{ installation_id: "uv:dev", kind: "uv_tool", mode: "development", version: "1.0", manager: "uv", management_scope: "owner_only", location_ref: "tool:dev", evidence_ref: "uv:dev", entrypoint_verified: true }] },
    { package_id: "private", catalog_origin: "opl", catalog_scope: "software", installed: true, installed_version: "1.0", package_currentness: { status: "update_available" }, package_access: { visibility: "authorized_only", status: "revoked", discover_allowed: false, download_allowed: false } },
    { package_id: "available", catalog_origin: "opl", catalog_scope: "software", installed: false },
    { package_id: "external", catalog_origin: "external", catalog_scope: "software", installed: true, package_currentness: { status: "update_available" } }
  ] }, sources: { surface_kind: "opl_software_sources_projection.v1", status: "available", entries: [{ source_id: "tap", display_name: "OPL Homebrew", source_kind: "tap", inventory_status: "available", native_items: [
    { item_id: "stable", product_id: "app", catalog_origin: "opl", kind: "cask", name: "app", installed: false, available_version: "1.0" },
    { item_id: "nightly", product_id: "app", catalog_origin: "opl", kind: "cask", name: "app-nightly", installed: false, available_version: "2.0-nightly" }
  ] }] } } } });
  const [dev, privateItem] = model.packageLifecycle;
  assert.equal(packageCatalogState(dev), "installed");
  assert.equal(catalogInstalledVersion(dev, "zh"), "1.0");
  assert.equal(packageCatalogState(privateItem), "attention");
  const inventory = softwareCatalogInventory(model);
  assert.deepEqual({ total: inventory.total, installed: inventory.installed, updates: inventory.updates, notInstalled: inventory.notInstalled, external: inventory.external }, { total: 4, installed: 2, updates: 0, notInstalled: 2, external: 1 });
  assert.equal(nativeCatalogAvailableVersion(nativeSoftwareProducts(model.softwareSources)[0], "zh"), "多个渠道");
});

test("source access attention opens sources and does not repair an installation", async () => {
  const { createElement } = await import("react");
  const { flushSync } = await import("react-dom");
  const { deriveWorkbenchModelFromState } = await import("../../src/workbench/workbenchModel.ts");
  const { settingsDefaults } = await import("../../src/workbench/settingsModel.ts");
  const { OplSoftwareUpdates } = await import("../../src/workbench/OplSoftwareUpdates.tsx");
  const actions: unknown[] = [], tabs: string[] = [];
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [{
    package_id: "private", display_name: "Private Agent", catalog_origin: "opl", catalog_scope: "software", installed: true, installed_version: "1.0",
    package_currentness: { status: "update_available" }, package_access: { visibility: "authorized_only", status: "signed_out", discover_allowed: false, download_allowed: false },
    available_actions: ["repair", "update"].map(semantic => ({ action_id: `agent_package_${semantic}`, semantic, status: "available", payload: { package_id: "private" }, required_payload_fields: ["package_id"] }))
  }] } } } });
  await withSettingsTestDom(({ container, render }) => {
    render(createElement(presentation.PackageCatalog, { kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction: action => actions.push(action), onTabChange: tab => tabs.push(tab) }));
    const row = container.querySelector('[data-plugin-owner-package="private"]')!;
    assert.match(row.textContent ?? "", /需处理/);
    assert.doesNotMatch(row.textContent ?? "", /修复/);
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
