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
    ["capabilities", "agents", "instructions", "memory"]
  );
  assert.deepEqual(
    presentation.settingsSubDestinations("services", "zh").map((destination) => destination.id),
    ["services", "schedules", "updates", "diagnostics"]
  );
});

test("settings pages expose a purpose statement for every destination", () => {
  for (const destination of presentation.settingsDestinations("zh")) {
    const page = presentation.settingsPagePresentationFor(destination.id, "zh");
    assert.ok(page.eyebrow.length > 0);
    assert.ok(page.description.length > 0);
  }
  const capabilities = presentation.settingsPagePresentationFor("capabilities", "zh");
  assert.match(capabilities.description, /技能/);
  assert.match(presentation.settingsPagePresentationFor("capabilities", "en").description, /skills/);
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
  assert.equal(presentation.agentPackagePresentationStatus(agent({ packageRole: "workflow_profile", homeShortcuts: [] })), "ready");
});

test("agent catalog keeps agent and workflow packages together while excluding capability packages", () => {
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "standard_agent" }), true);
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "workflow_profile" }), true);
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "capability_package" }), false);
  assert.equal(presentation.isAgentCatalogPackage({ packageRole: "framework_capability_package" }), false);
});

test("package catalog defaults to All while exposing App-owned manifest install", () => {
  assert.match(settingsSource, /useState<"official" \| "all">\("all"\)/);
  assert.match(settingsSource, /scope === "all" \|\| item\.official/);
  assert.match(settingsSource, /当前没有自定义\$\{catalogLabel\}/);
  assert.match(settingsSource, /添加\$\{catalogLabel\}/);
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
    { package_id: "private-phone", package_role: "capability_package", display_name: "Private Phone", publisher: "Local owner", installed: true, activated: true, app_enabled: false, selected_version: "2.7" },
    { package_id: "future-app", package_role: "future_extension", display_name: "Future App", installed: true, app_enabled: true }
  ] } } } });
  let statusReads = 0;
  const html = renderToStaticMarkup(createElement(presentation.PackageCatalog, { kind: "all", model, settings: { ...settingsDefaults, locale: "zh" }, actionBusyKey: null, onAction() {}, renderPackageContributions() { statusReads++; return null; } }));
  assert.match(html, /Private Phone/);
  assert.match(html, /Future App/);
  assert.match(html, /版本 2.7/);
  assert.match(html, /OPL App 已关闭/);
  assert.match(html, /在 OPL App 中启用 Private Phone/);
  assert.equal(statusReads, 0);
});
