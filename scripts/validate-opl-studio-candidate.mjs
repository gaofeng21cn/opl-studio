import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assert,
  assertFallbackBoundaryDowngrades,
  assertRendererTestIds,
  deliverySurfaceTestIds,
  read,
  readJson,
  readRendererSource,
  root,
  validateNonLiveDeliveryEvidence
} from "./opl-studio-gates.mjs";
import { readCodexModelPolicy } from "./build-renderer.mjs";
import { resolveAppRepoRoot } from "./resolve-app-repo-root.mjs";

const requiredFiles = [
  "AGENTS.md",
  "README.md",
  "docs/README.md",
  "docs/architecture.md",
  "docs/whitepaper.md",
  "docs/active/current-state-vs-ideal-gap.md",
  "docs/verification.md",
  "docs/history/README.md",
  "docs/history/2026-07-candidate-baseline.md",
  "contracts/opl-studio-profile.json",
  "THIRD_PARTY_NOTICES.md",
  "package.json",
  "src/bridge/oplBridge.ts",
  "src/bridge/webTransport.ts",
  "src/main.tsx",
  "src/composition/clientCordis.ts",
  "src/composition/contributionProjection.ts",
  "src/composition/contributionComponents.tsx",
  "src/composition/deepseekHarnessSourceManifest.json",
  "src/composition/dshSlotHost.tsx",
  "src/integrations/deepseek-harness/oplAdapter.css",
  "src/integrations/deepseek-harness/runtimeShim.ts",
  "src/vendor/deepseek-harness/LICENSE",
  "src/vendor/deepseek-harness/packages/client/ui-layout/src/client/AppFrame.tsx",
  "src/vendor/deepseek-harness/packages/client/ui-sidebar/src/client/SidebarRoot.tsx",
  "src/vendor/deepseek-harness/packages/client/ui-workspace/src/client/WorkspaceBrowser.tsx",
  "src/vendor/deepseek-harness/packages/client/ui-agent-preset/src/client/AgentPresetSeat.tsx",
  "src/vendor/deepseek-harness/packages/client/ui-model-selection/src/client/ModelSelect.tsx",
  "src/vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx",
  "src/vendor/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar.tsx",
  "src/vendor/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.tsx",
  "src/vendor/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css",
  "src/vendor/deepseek-harness/packages/client/ui-primitives/src/index.ts",
  "src/vendor/deepseek-harness/packages/client/ui-renderer/src/client/scoped-slots.tsx",
  "src/types/use-sync-external-store.d.ts",
  "src/renderer-shell.html",
  "src/workbench/App.tsx",
  "src/workbench/ProjectProgressPanel.tsx",
  "src/workbench/WorkspaceFilesPanel.tsx",
  "src/workbench/codexWorkbenchStyles.ts",
  "src/workbench/modelPolicy.ts",
  "src/workbench/projectProgress.ts",
  "src/workbench/workbenchModel.ts",
  "src/workbench/settingsModel.ts",
  "src/workbench/gatewayAccountCache.ts",
  "src/threads/types.ts",
  "src/workbench/threads/ThreadDetailPopover.tsx",
  "src/workbench/threads/ThreadLifecycleConfirmationDialog.tsx",
  "src/candidateContractEvidence.json",
  "scripts/build-renderer.mjs",
  "scripts/validate-client-conformance.mjs",
  "scripts/build-desktop.mjs",
  "scripts/package-candidate-carriers.mjs",
  "scripts/bun-build-renderer-entry.ts",
  "scripts/deepseek-harness-gui-vendor.mjs",
  "scripts/model-policy-regression.ts",
  "scripts/validate-state-model.mjs",
  "scripts/validate-desktop-package.mjs",
  "scripts/smoke-webui.mjs",
  "scripts/smoke-desktop-live.mjs",
  "scripts/smoke-visual.mjs",
  "scripts/resolve-app-repo-root.mjs",
  "desktop/main.mjs",
  "desktop/preload.cjs",
  "desktop/updater.mjs",
  "scripts/webui-host/app-server-transport.mjs",
  "scripts/webui-host/dsh/cordis.yml",
  "scripts/webui-host/dsh/host.mjs",
  "scripts/webui-host/dsh/web.patch.yml",
  "scripts/webui-host/dsh/plugins/opl-codex-native.mjs",
  "scripts/webui-host/dsh/plugins/opl-dsh-tool-mcp.mjs",
  "scripts/webui-host/dsh/plugins/opl-framework-bridge.mjs",
  "scripts/webui-host/dsh/plugins/opl-host-core.mjs",
  "scripts/webui-host/dsh/plugins/opl-web-routes.mjs",
  "scripts/webui-host/dsh-tool-mcp.mjs",
  "scripts/webui-host/dsh-tool-mcp.test.mjs",
  "scripts/webui-host/host-core.mjs",
  "scripts/webui-host/host-core.test.mjs",
  "scripts/webui-host/http-host.mjs",
  "scripts/webui-host/thread-adapter.mjs",
  "scripts/webui-host/thread-adapter.test.mjs",
  "scripts/webui-host/thread-workspace-service.mjs",
  "scripts/webui-host/thread-workspace-service.test.mjs",
  "tests/workbench/project-progress.test.mts",
  "tests/renderer/thread-renderer-source.test.mjs"
];

const requiredScripts = [
  "dev",
  "dev:desktop",
  "build",
  "webui",
  "build:webui",
  "build:desktop",
  "verify:dsh-gui",
  "package",
  "test:desktop",
  "test:threads",
  "test:ui-contributions",
  "test:client-cordis",
  "test:storage-migration",
  "test:webui-host",
  "validate:client-conformance",
  "validate:candidate",
  "validate:state-model",
  "validate:package",
  "smoke:webui",
  "smoke:visual",
  "test"
];

const requiredTestIds = [
  "opl-context-tabs",
  "opl-project-progress-panel",
  "opl-project-progress",
  "opl-runtime-contributions",
  "opl-files-results-panel",
  "opl-input-files-list",
  "opl-agents-capabilities-panel",
  "opl-current-agent-capabilities",
  "opl-codex-capability-catalog",
  "opl-web-transport",
  "opl-locale-toggle",
  "opl-thread-detail-popover",
  "opl-thread-lifecycle-confirmation"
];

const retiredPrivateThreadFiles = [
  "src/coordination/foundation.ts",
  "src/coordination/index.ts",
  "src/coordination/types.ts",
  "src/workbench/coordination/CoordinationDialog.tsx",
  "src/workbench/coordination/CoordinationEvents.tsx",
  "scripts/webui-host/coordination-host.mjs",
  "scripts/webui-host/coordination-ledger.mjs",
  "scripts/smoke-coordination-dynamic-tools-live.mjs",
  "scripts/smoke-coordination-live.mjs"
];

for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(root, file)), `missing ${file}`);
}
for (const file of retiredPrivateThreadFiles) {
  assert(!fs.existsSync(path.join(root, file)), `retired private thread file must stay removed: ${file}`);
}

const pkg = JSON.parse(read("package.json"));
const studioProfile = readJson("contracts/opl-studio-profile.json");
const expectedDshRef = "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e";
const expectedDshVersion = "0.1.1-rc.2";
const expectedDshModules = [
  "@deepseek-ai/cordis@4.0.1",
  "@deepseek-ai/cordis-plugin-group@1.0.1",
  "@deepseek-ai/cordis-plugin-include@1.0.6",
  "@deepseek-ai/cordis-plugin-loader@1.0.2",
  "@deepseek-ai/dsh-app-boot@0.1.1-rc.2",
  "@deepseek-ai/dsh-brand@0.1.1-rc.2",
  "@deepseek-ai/dsh-client-modules@0.1.1-rc.2",
  "@deepseek-ai/dsh-client-ui-primitives@0.1.1-rc.2",
  "@deepseek-ai/dsh-client-ui-slots@0.1.1-rc.2",
  "@deepseek-ai/dsh-client-web@0.1.1-rc.2",
  "@deepseek-ai/dsh-home-paths@0.1.1-rc.2",
  "@deepseek-ai/dsh-host-frontend-static@0.1.1-rc.2",
  "@deepseek-ai/dsh-host-plugin-inventory@0.1.1-rc.2",
  "@deepseek-ai/dsh-host-webserver@0.1.1-rc.2",
  "@deepseek-ai/dsh-invariants@0.1.1-rc.2",
  "@deepseek-ai/dsh-launch-environment@0.1.1-rc.2",
  "@deepseek-ai/dsh-llm@0.1.1-rc.2",
  "@deepseek-ai/dsh-scope@0.1.1-rc.2",
  "@deepseek-ai/dsh-session@0.1.1-rc.2",
  "@deepseek-ai/dsh-system-prompt@0.1.1-rc.2",
  "@deepseek-ai/dsh-timeout@0.1.1-rc.2",
  "@deepseek-ai/dsh-tools@0.1.1-rc.2",
  "@deepseek-ai/dsh-typert-protocol@0.1.1-rc.2",
  "use-sync-external-store@1.2.0"
];
for (const script of requiredScripts) {
  assert(pkg.scripts?.[script], `missing package script ${script}`);
}
assert(
  pkg.scripts.package === "node scripts/package-candidate-carriers.mjs",
  "package must qualify and record all three App-contracted candidate carriers"
);
const carrierPackager = read("scripts/package-candidate-carriers.mjs");
for (const marker of [
  "app-shell-candidates.json",
  "carrier_evidence_contract",
  "expected.qualification_commands",
  "passed_local_candidate_build",
  "candidate_only: true",
  "release_authority: false"
]) {
  assert(carrierPackager.includes(marker), `candidate carrier packager is missing ${marker}`);
}

assert(
  studioProfile.product_status_owner === "docs/active/current-state-vs-ideal-gap.md",
  "Studio profile must identify the single current product status owner"
);
assert(
  studioProfile.product_development_policy?.role === "first_party_native_successor_implementation"
    && studioProfile.product_development_policy.automatic_or_scheduled_work_allowed === false
    && studioProfile.product_development_policy.product_development_required === true
    && studioProfile.product_development_policy.current_mainline === false
    && studioProfile.product_development_policy.minimum_complete_product_obligation === true
    && studioProfile.product_development_policy.aionui_feature_parity_obligation === false
    && studioProfile.product_development_policy.release_blocking === false,
  "Studio profile must require the OPL minimum-complete product without making release or AionUI parity implicit"
);
const expectedDeliveryEvaluation = {
  role: "unified_opl_app_delivery_target",
  current_mainline: false,
  future_mainline_cutover_target: true,
  renderer_technology: "react",
  desktop_host: "electron",
  desktop_platforms: ["macos", "windows", "linux"],
  headless_host: "node_http_sse",
  docker_host: "node_http_sse",
  shared_host_core: "scripts/webui-host/host-core.mjs",
  workspace_product_name: "One Person Lab",
  shared_renderer_and_bridge_shape_required: true,
  runtime_backend_scope: "codex_cli_only",
  aionui_runtime_dependency_allowed: false,
  aioncore_runtime_dependency_allowed: false,
  cross_platform_wrapper_selection: "electron_selected",
  windows_linux_source_support: true,
  release_adoption_requires_separate_app_qualification: true
};
assert(
  JSON.stringify(studioProfile.delivery_evaluation) === JSON.stringify(expectedDeliveryEvaluation),
  "Studio profile must declare one renderer and host core across desktop, headless, and Docker targets"
);
assert(
  studioProfile.application_host?.role === "deepseek_harness_cordis_application_host"
    && studioProfile.application_host.implementation_status === "source_implemented_release_admission_separate"
    && studioProfile.application_host.upstream_version === expectedDshVersion
    && studioProfile.application_host.upstream_ref === expectedDshRef
    && studioProfile.application_host.profile === "opl-studio"
    && studioProfile.application_host.dsh_base_loaded === false
    && studioProfile.application_host.codex_runtime_owner === "opl-codex-native"
    && studioProfile.application_host.dsh_tool_bridge === "authenticated_stateful_loopback_mcp"
    && studioProfile.application_host.active_shell_adopted === false
    && studioProfile.application_host.release_ready === false,
  "Studio profile must declare the pinned DSH Application Host and Codex ownership boundary"
);
assert(
  JSON.stringify(studioProfile.application_host.startup_order) === JSON.stringify([
    "dsh_host_tree_and_tool_mcp",
    "codex_app_server",
    "framework_bridge"
  ])
    && JSON.stringify(studioProfile.application_host.shutdown_order) === JSON.stringify([
      "framework_channel_callback",
      "codex_app_server",
      "dsh_cordis_tree"
    ]),
  "Studio profile must preserve the Application Host lifecycle order"
);
assert(
  studioProfile.runtime_dependency_policy?.aioncore_required === false
    && studioProfile.runtime_dependency_policy.aionui_required === false
    && studioProfile.runtime_dependency_policy.codex_app_server_source === "OPL_CODEX_BIN_or_exact_external_codex"
    && studioProfile.runtime_dependency_policy.opl_integration === "framework_app_state_action_authentication_and_channel_callbacks_only"
    && studioProfile.runtime_dependency_policy.multi_backend_abstraction_required === false
    && studioProfile.runtime_dependency_policy.thread_store_owner === "codex_core_app_server",
  "candidate profile must keep Native independent from AionUI/AionCore and scoped to Codex App Server"
);
assert(
  JSON.stringify(studioProfile.carrier_policy?.enabled) === JSON.stringify(["codex_app_server_stdio"])
    && JSON.stringify(studioProfile.carrier_policy?.reserved_disabled) === JSON.stringify(["pi", "hermes"])
    && studioProfile.carrier_policy.disabled_carriers_add_runtime_dependencies === false
    && studioProfile.carrier_policy.thread_store_owner === "codex_core_app_server"
    && studioProfile.carrier_policy.thread_overview.includes("Codex-visible default source set")
    && !studioProfile.carrier_policy.thread_overview.includes("useStateDbOnly")
    && studioProfile.carrier_policy.thread_history.includes("includeTurns=true"),
  "candidate profile must keep Codex as the only enabled carrier and reserve Pi/Hermes without dependencies"
);
assert(
  !Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((name) =>
    ["aioncore", "aionui", "tauri"].some((forbidden) => name.toLowerCase().includes(forbidden))
  ) && pkg.devDependencies?.electron === "43.4.0"
    && pkg.devDependencies?.["electron-builder"] === "26.15.3"
    && pkg.dependencies?.["electron-updater"] === "6.8.9",
  "candidate package must use the selected Electron carrier without AionUI, AionCore, or Tauri dependencies"
);

const app = read("src/workbench/App.tsx");
const rendererSource = readRendererSource();
const evidence = readJson("src/candidateContractEvidence.json");
assert(
  JSON.stringify(evidence.delivery_evaluation) === JSON.stringify(expectedDeliveryEvaluation),
  "candidate evidence must record the bounded lightweight GUI delivery evaluation"
);
assert(
  JSON.stringify(evidence.carrier_policy?.enabled) === JSON.stringify(["codex_app_server_stdio"])
    && JSON.stringify(evidence.carrier_policy?.reserved_disabled) === JSON.stringify(["pi", "hermes"])
    && evidence.carrier_policy.aioncore_required === false
    && evidence.carrier_policy.disabled_carriers_add_runtime_dependencies === false,
  "candidate evidence must record the single enabled Codex carrier boundary"
);
assert(
  JSON.stringify(evidence.application_host) === JSON.stringify(studioProfile.application_host),
  "candidate evidence and Studio profile must share one Application Host contract"
);

function assertApplicationHost(evidence) {
  const host = evidence.application_host;
  const profile = read("scripts/webui-host/dsh/cordis.yml");
  const webOverlay = read("scripts/webui-host/dsh/web.patch.yml");
  const hostBoot = read("scripts/webui-host/dsh/host.mjs");
  const codexPlugin = read("scripts/webui-host/dsh/plugins/opl-codex-native.mjs");
  const toolPlugin = read("scripts/webui-host/dsh/plugins/opl-dsh-tool-mcp.mjs");
  const frameworkPlugin = read("scripts/webui-host/dsh/plugins/opl-framework-bridge.mjs");
  const toolMcp = read("scripts/webui-host/dsh-tool-mcp.mjs");
  const codexNative = read("scripts/webui-host/opl-codex-native.mjs");
  assert(host?.upstream_ref === expectedDshRef && host.upstream_version === expectedDshVersion, "Application Host must bind the pinned DSH cohort");
  assert(host.dsh_base_loaded === false, "Application Host must not load dsh-base");
  assert(host.active_shell_adopted === false && host.release_ready === false, "Application Host implementation must not claim active-shell adoption or release readiness");
  assert(!profile.includes("dsh-base"), "Studio DSH profile must exclude dsh-base");
  for (const id of ["system-prompt", "tools", "webserver", "opl-dsh-tool-mcp", "opl-codex-native", "opl-framework-bridge", "opl-host-core", "plugin-inventory"]) {
    assert(profile.includes(`id: ${id}`), `Studio DSH profile is missing ${id}`);
  }
  for (const id of ["frontend-static", "client-modules", "opl-studio-client", "opl-web-routes"]) {
    assert(webOverlay.includes(`id: ${id}`), `Studio web overlay is missing ${id}`);
  }
  for (const marker of ["initProfile(profileDir, [])", "healProfilesModuleFallback", "loadProfile", "loadOverlayPatches", "boot("]) {
    assert(hostBoot.includes(marker), `DSH Host boot is missing ${marker}`);
  }
  assert(toolPlugin.includes('inject = ["webServer", "tools"]'), "DSH Tool MCP plugin must consume the native DSH tool registry");
  assert(codexPlugin.includes('inject = ["oplStudioHostOptions", "oplDshToolMcp"]'), "Codex plugin must depend on the DSH Tool MCP");
  assert(frameworkPlugin.includes('inject = ["oplStudioHostOptions", "oplCodexNative"]'), "Framework bridge must start after Codex");
  for (const marker of ["StreamableHTTPServerTransport", "ListToolsRequestSchema", "CallToolRequestSchema", "sendToolListChanged", "timingSafeEqual"]) {
    assert(toolMcp.includes(marker), `DSH Tool MCP is missing ${marker}`);
  }
  assert(codexNative.includes('const name = "opl_studio_dsh"'), "Codex launch configuration must use the fixed Studio DSH MCP name");
  for (const marker of ["mcp_servers.${name}.url", "bearer_token_env_var", "required=true", "default_tools_approval_mode", "auto"]) {
    assert(codexNative.includes(marker), `Codex launch configuration is missing ${marker}`);
  }
}

function assertFunctionalMvpCloseout(evidence) {
  const closeout = evidence.functional_mvp_closeout;
  assert(closeout, "missing functional_mvp_closeout");
  for (const key of ["implemented", "partial", "not_ready"]) {
    assert(Array.isArray(closeout[key]) && closeout[key].length > 0, `missing functional MVP ${key} inventory`);
  }
  for (const field of evidence.false_ready_boundary.forbidden_true_fields) {
    assert(closeout.not_ready.includes(field), `functional MVP closeout must mark ${field} not-ready`);
  }
}

function assertSourceMarkerRequirements(evidence) {
  const requirements = evidence.source_marker_requirements;
  assert(requirements, "missing source_marker_requirements");
  for (const group of Object.keys(requirements)) {
    assert(Array.isArray(requirements[group]) && requirements[group].length > 0, `missing marker group ${group}`);
    for (const requirement of requirements[group]) {
      const source = read(requirement.file);
      for (const marker of requirement.contains) {
        assert(source.includes(marker), `missing ${group} marker ${marker} in ${requirement.file}`);
      }
    }
  }
}

function assertPrivateThreadLayerRemoved(evidence) {
  const runtimeSources = [
    "desktop/main.mjs",
    "desktop/preload.cjs",
    "scripts/webui-host/host-core.mjs",
    "scripts/webui-host/app-server-transport.mjs",
    "scripts/webui-host/http-host.mjs",
    "scripts/webui-host/thread-adapter.mjs",
    "src/bridge/oplBridge.ts",
    "src/bridge/webTransport.ts",
    "src/main.tsx",
    "src/workbench/App.tsx",
    "src/workbench/workbenchModel.ts",
    "src/workbench/codexWorkbenchStyles.ts"
  ].map(read).join("\n");
  for (const marker of [
    "prepareCoordination",
    "dispatchCoordination",
    "waitCoordination",
    "CoordinationLedger",
    "ThreadCoordinationHost",
    "CoordinationDialog",
    "host_queue",
    "item/tool/call",
    "dynamicTools",
    "/api/coordination/"
  ]) {
    assert(!runtimeSources.includes(marker), `retired private thread marker must stay removed: ${marker}`);
  }
  assert(evidence.functional_mvp?.private_coordination_layer === false, "functional MVP must reject a private coordination layer");
  assert(evidence.webui_transport?.private_coordination_layer === false, "WebUI must reject a private coordination layer");
  assert(
    evidence.webui_transport?.host_core === "scripts/webui-host/host-core.mjs"
      && evidence.webui_transport.native_host === "desktop/main.mjs"
      && evidence.webui_transport.native_transport === "desktop/preload.cjs#window.oplStudio",
    "desktop and WebUI evidence must share the Node host core through thin transport adapters"
  );
  assert(evidence.functional_mvp?.codex_subagent_projection?.includes("collabAgentToolCall"), "functional MVP must record Codex subagent item projection");
  assert(evidence.thread_list_pagination_regression?.validation_command === "npm run test:webui-host", "candidate evidence must record the thread/list regression command");
  assert(evidence.thread_list_pagination_regression?.fixtures?.includes("scripts/webui-host/thread-adapter.test.mjs"), "candidate evidence must record the WebUI thread adapter fixture");
  for (const retired of [
    "typed_cross_top_level_thread_host_bridge",
    "client_executed_dynamic_tools_coordination_bridge",
    "local_cross_thread_p0_p1",
    "turn_start_steer_with_host_queue",
    "cross_thread_safety_gates",
    "bilateral_coordination_receipts",
    "desktop_webui_coordination_parity"
  ]) {
    assert(!evidence.capabilities.includes(retired), `retired capability must stay removed: ${retired}`);
  }
}

function assertDeepSeekHarnessReuse(evidence, rendererSource) {
  const alignment = evidence.default_home_layout?.primary_visual_reference;
  const visualStyle = evidence.default_home_layout?.visual_style_reference;
  const slotHost = read("src/composition/dshSlotHost.tsx");
  const rendererShell = read("src/renderer-shell.html");
  const appSource = read("src/workbench/App.tsx");
  const mainSource = read("src/main.tsx");
  const themeSource = read("src/vendor/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css");
  const sourceManifest = readJson("src/composition/deepseekHarnessSourceManifest.json");
  const packageJson = readJson("package.json");
  const tsconfig = readJson("tsconfig.json");
  const typecheckConfig = readJson("tsconfig.typecheck.json");
  const primitiveIndex = read("src/vendor/deepseek-harness/packages/client/ui-primitives/src/index.ts");
  const composerPalette = read("src/workbench/ComposerCapabilityPalette.tsx");
  const contributionComponents = read("src/composition/contributionComponents.tsx");
  const runtimeShim = read("src/integrations/deepseek-harness/runtimeShim.ts");
  const bunBuild = read("scripts/bun-build-renderer-entry.ts");
  const notices = read("THIRD_PARTY_NOTICES.md");
  const architecture = read("docs/architecture.md");
  const activePlan = read("docs/active/current-state-vs-ideal-gap.md");
  const publicEntry = read("README.md");
  assert(alignment, "missing DeepSeek Harness GUI source-reuse evidence");
  assert(alignment.reference_product === "DeepSeek Harness", "DeepSeek Harness must be the primary GUI reference");
  assert(alignment.reference_version === expectedDshRef, "pinned DeepSeek Harness source ref must be recorded");
  assert(alignment.reference_date === "2026-08-22", "DeepSeek Harness inspection date must be recorded");
  assert(alignment.source_usage === "direct_gui_source_reuse_with_application_host_cohort", "DeepSeek Harness GUI use must bind the Application Host cohort");
  assert(alignment.left_side === "persistent project and conversation rail with search and Settings only", "project rail placement must be recorded");
  assert(alignment.center === "single dominant conversation timeline with bottom composer", "conversation placement must be recorded");
  assert(alignment.model_controls === "composer_bottom_row", "model controls must stay in the composer");
  assert(alignment.right_side === "on-demand DSH details column for run status, files and results, and agents and capabilities", "task details must use the DSH details column");
  assert(evidence.default_home_layout?.workspace_rail_default_open === true, "project rail must be visible by default");
  assert(evidence.default_home_layout?.details_default_open === false, "task details must be closed by default");
  assert(evidence.webui_parity?.desktop_and_webui_default_home === "chat_first_default_collapsed", "desktop and WebUI must share the chat-first default-collapsed home");
  assert(visualStyle?.reference_version === alignment.reference_version, "visual tokens must bind to the same DeepSeek Harness source ref");
  assert(visualStyle?.scope === "eleven_pinned_gui_package_source_trees_with_opl_slot_adapters", "visual source scope must cover all eleven pinned DSH GUI package trees");
  assert(visualStyle?.token_source === "src/vendor/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css", "DeepSeek Harness token source must be exact");
  for (const marker of ["--dsw-static-deepseek-450", "--dsw-alias-button-primary-fill", "--dsw-alias-tooltip-bg"]) {
    assert(themeSource.includes(marker), `missing vendored DeepSeek Harness design token ${marker}`);
  }
  for (const marker of ["SlotCore", "createSlotRenderer", "core.register", "core.onEntryError", "active.dispose()"]){
    assert(slotHost.includes(marker), `missing DeepSeek Harness slot lifecycle marker ${marker}`);
  }
  assert(
    slotHost.includes('import { createSlotRenderer } from "../vendor/deepseek-harness/packages/client/ui-renderer/src/client/scoped-slots.tsx"'),
    "createSlotRenderer must come from the pinned rc2 source cohort"
  );
  for (const [component, moduleName] of [
    ["AppFrame", "@opl-vendor/dsh-app-frame"],
    ["SidebarRoot", "@opl-vendor/dsh-sidebar-root"],
    ["WorkspaceBrowser", "@opl-vendor/dsh-workspace-browser"],
    ["ConversationRoot", "@opl-vendor/dsh-conversation-root"],
    ["InputBar", "@opl-vendor/dsh-input-bar"],
    ["QueueDock", "@opl-vendor/dsh-queue-dock"],
    ["AgentPresetSeat", "@opl-vendor/dsh-agent-preset-seat"],
    ["SettingsRoot", "@opl-vendor/dsh-settings-root"]
  ]) {
    assert(slotHost.includes(`import { ${component} } from "${moduleName}"`), `missing direct ${component} vendor import`);
    assert(slotHost.includes(`<${component}`), `missing live ${component} render`);
  }
  assert(slotHost.includes("updateQueue={studio.updateQueue}"), "DSH QueueDock must use the Studio queue update surface");
  assert(
    slotHost.includes('register({ name: "conversation.input.dock", id: "queue", order: 20, registrant: "dsh-ui-conversation" }, QueueDockSlot)'),
    "DSH QueueDock must occupy the ordered conversation input dock slot"
  );
  for (const slot of ["sidebar.brand.mark", "sidebar.brand.name", "conversation.hero.brand.mark", "conversation.input.attachments"]) {
    assert(slotHost.includes(`register({ name: "${slot}", registrant: "opl-studio" }`), `missing rc2 OPL slot occupant ${slot}`);
  }
  assert(slotHost.includes("function OplBrandNameSlot() { return <>One Person Lab</>; }"), "rc2 brand name slot must render One Person Lab text");
  assert(slotHost.includes("function OplBrandMarkSlot(): null { return null; }"), "rc2 product identity must suppress the upstream mark without inventing an OPL logo");
  assert(!slotHost.includes(">\n      OPL\n    </span>"), "product identity must not render OPL as a pseudo logo");
  assert(rendererShell.includes('[data-opl-desktop-drag]') && rendererShell.includes('-webkit-app-region: drag'), "desktop shell must expose a boot-phase window drag region");
  assert(slotHost.includes("function EmptyAttachmentSlot() { return null; }"), "rc2 attachment slot must remain an empty adapter");
  assert(slotHost.includes("useHostDescription={(selector: any) => selector(undefined)}"), "workspace host description must remain unavailable without a new App ABI field");
  assert(runtimeShim.includes("export function abbreviateHomePath") && runtimeShim.includes("isWindowsStylePath"), "runtime shim must provide POSIX home abbreviation with Windows fail-open");
  assert(bunBuild.includes('"process.env.DSH_CLIENT_COMMIT_HASH": JSON.stringify("")'), "browser build must not read Node process for the DSH commit hash");
  assert(
    /bridge\.steerTurn\(\{\s*threadId: active\.threadId,\s*expectedTurnId: active\.turnId,/s.test(appSource),
    "queued follow-ups must steer the exact active Codex thread and turn"
  );
  for (const marker of ["return renderShell({", "threadProjects,", "agentPresets:", "modelOptions,", "conversationBody: studioConversationBody", "renderSettings: renderStudioSettings", "detailsRequestRevision"]) {
    assert(appSource.includes(marker), `missing App-to-DSH surface handoff marker ${marker}`);
  }
  assert(mainSource.includes('import { mountOplStudioClient, oplStudioClientPlugin } from "./composition/oplStudioClientPlugin"'), "main must import the DSH client plugin");
  assert(mainSource.includes("mountOplStudioClient(rootElement)"), "main must mount the DSH client plugin composition root");
  assert(sourceManifest.upstream?.ref === alignment.reference_version, "vendor manifest must bind to the pinned DSH ref");
  assert(sourceManifest.upstream?.source_package_version === expectedDshVersion, "vendor manifest must record the pinned source package version");
  assert(sourceManifest.application_host?.role === "deepseek_harness_cordis_application_host", "vendor manifest must bind the DSH Application Host role");
  assert(JSON.stringify(sourceManifest.application_host?.package_cohort) === JSON.stringify(expectedDshModules.slice(0, -1)), "vendor manifest must bind the DSH Host package cohort");
  assert(JSON.stringify(sourceManifest.application_host?.excluded_upstream_profiles) === JSON.stringify(["dsh-base"]), "vendor manifest must exclude dsh-base");
  assert(sourceManifest.snapshot?.local_root === "src/vendor/deepseek-harness", "vendor manifest root must be canonical");
  assert(sourceManifest.snapshot?.byte_identical === true, "vendor snapshot must remain byte-identical");
  assert(sourceManifest.snapshot?.byte_identical_to_pinned_ref === true, "vendor snapshot byte identity must bind to the pinned DSH ref");
  assert(sourceManifest.snapshot?.file_count === 277 && sourceManifest.files?.length === 277, "vendor manifest must inventory 277 files");
  assert(sourceManifest.snapshot?.package_roots?.includes("packages/client/ui-renderer/src"), "vendor manifest must include the rc2 ui-renderer source root");
  assert(JSON.stringify(sourceManifest.snapshot?.package_roots) === JSON.stringify(evidence.reused_oss_module_policy.vendored_package_roots), "candidate evidence package roots must match the vendor manifest");
  const vendorCheck = spawnSync(process.execPath, [path.join(root, "scripts/deepseek-harness-gui-vendor.mjs"), "check"], { cwd: root, encoding: "utf8" });
  assert(vendorCheck.status === 0, `vendored DSH GUI byte parity failed: ${vendorCheck.stderr}`);
  assert(packageJson.dependencies?.clsx === "2.1.1", "DeepSeek Harness GUI closure must declare clsx directly");
  assert(packageJson.dependencies?.["@deepseek-ai/dsh-client-ui-slots"] === expectedDshVersion, "DSH slot runtime must be pinned to rc2");
  assert(packageJson.dependencies?.["@deepseek-ai/dsh-invariants"] === expectedDshVersion, "DSH invariants must be pinned to rc2");
  for (const module of expectedDshModules.slice(0, -1)) {
    const at = module.lastIndexOf("@");
    assert(packageJson.dependencies?.[module.slice(0, at)] === module.slice(at + 1), `DSH Application Host dependency must match ${module}`);
  }
  assert(packageJson.dependencies?.["@deepseek-ai/cordis"] === "4.0.1", "Cordis boundary must remain pinned to 4.0.1");
  assert(packageJson.dependencies?.["use-sync-external-store"] === "1.2.0", "vendored rc2 renderer closure must declare use-sync-external-store directly");
  assert(packageJson.dependencies?.["@deepseek-ai/dsh-client-web-react"] === undefined, "obsolete dsh-client-web-react must stay removed");
  assert(packageJson.dependencies?.["@deepseek-ai/dsh-client-ui-renderer"] === undefined, "ui-renderer must be reused as pinned source, not installed as a package");
  const primitiveAlias = ["src/vendor/deepseek-harness/packages/client/ui-primitives/src/index.ts"];
  assert(JSON.stringify(tsconfig.compilerOptions?.paths?.["@deepseek-ai/dsh-client-ui-primitives"]) === JSON.stringify(primitiveAlias), "renderer imports must resolve the DSH primitives specifier to the vendored upstream index");
  assert(JSON.stringify(typecheckConfig.compilerOptions?.paths?.["@deepseek-ai/dsh-client-ui-primitives"]) === JSON.stringify(primitiveAlias), "typecheck imports must resolve the DSH primitives specifier to the vendored upstream index");
  assert(!fs.existsSync(path.join(root, "src/integrations/deepseek-harness/uiPrimitives.tsx")), "the handwritten DSH primitive shim must stay absent");
  for (const [source, names] of [
    [appSource, ["MessageText", "Pill"]],
    [composerPalette, ["Button", "Input"]],
    [contributionComponents, ["Button", "Pill", "StateDot", "Tooltip"]]
  ]) {
    assert(source.includes('from "@deepseek-ai/dsh-client-ui-primitives"'), "OPL primitive consumers must import the upstream DSH package specifier directly");
    for (const name of names) assert(primitiveIndex.includes(`export { ${name} }`), `vendored DSH primitive index must export ${name}`);
  }
  assert(!mainSource.includes("--opl-brand-logo") && !mainSource.includes("branding/opl-app-logo.png"), "renderer must keep OPL identity text-only without a Logo asset");
  assert(notices.includes(expectedDshRef) && notices.includes(expectedDshVersion) && notices.includes("use-sync-external-store") && notices.includes("MIT License"), "third-party notices must preserve pinned rc2 source and runtime licenses");
  assert(architecture.includes("Model And Settings Boundary") && architecture.includes("App product profile"), "architecture must route model and settings authority to App");
  assert(architecture.includes("Codex App Server owns canonical thread identity"), "architecture must route thread truth to Codex App Server");
  assert(architecture.includes("AionUI is the current active release shell"), "architecture must preserve the active-shell boundary");
  assert(
    activePlan.includes("Purpose: `single_active_truth_plan`")
      && activePlan.includes("State: `active_product_development_reference`")
      && activePlan.includes("active_product_development_release_admission_separate"),
    "Active Truth must preserve product development and separate release admission"
  );
  const legacyClaims = `${publicEntry}\n${architecture}\n${JSON.stringify(evidence)}`.toLowerCase();
  for (const claim of ["imagegen", "image-generated", "three-column", "chat_first_with_preview_inspector", "preview inspector default-open"]) {
    assert(!legacyClaims.includes(claim), `legacy visual baseline claim must be removed: ${claim}`);
  }
  const compositionSource = `${rendererSource}\n${slotHost}`;
  for (const markers of Object.values(alignment.implementation_markers ?? {})) {
    for (const marker of markers) {
      assert(compositionSource.includes(marker), `missing OPL Studio composition implementation marker ${marker}`);
    }
  }
}

function assertCodexModelControls(evidence, app, rendererSource) {
  const settings = read("src/workbench/settingsModel.ts");
  const settingsPanel = read("src/workbench/SettingsPanel.tsx");
  const slotHost = read("src/composition/dshSlotHost.tsx");
  const policySource = read("src/workbench/modelPolicy.ts");
  const rendererBuilder = read("scripts/build-renderer.mjs");
  const appRepoResolver = read("scripts/resolve-app-repo-root.mjs");
  const bridge = read("src/bridge/oplBridge.ts");
  const hostTransport = read("scripts/webui-host/app-server-transport.mjs");
  const codexNative = read("scripts/webui-host/opl-codex-native.mjs");
  const oplPassthrough = read("scripts/webui-host/opl-passthrough.mjs");
  const appRepoRoot = resolveAppRepoRoot(root);
  const appProductProfilePath = path.join(appRepoRoot, "contracts", "app-product-profile.json");
  const appProductProfile = JSON.parse(fs.readFileSync(appProductProfilePath, "utf8"));
  const profileModels = appProductProfile.gui.home.codex_model_display_options.visible_models;
  const profileReasoning = appProductProfile.gui.home.codex_model_display_options.user_reasoning_effort_options;
  const injectedPolicy = readCodexModelPolicy(appProductProfilePath);
  assert(evidence.functional_mvp?.codex_model_reasoning_controls?.includes("turn/start") && evidence.functional_mvp.codex_model_reasoning_controls.includes("model and effort overrides"), "functional MVP must record app-server model and effort overrides");
  assert(evidence.functional_mvp.codex_model_reasoning_controls.includes("App default route") && evidence.functional_mvp.codex_model_reasoning_controls.includes("fixed alternatives"), "functional MVP must record the App-default catalog exception and fixed-model filtering");
  assert(evidence.functional_mvp?.default_agent_permissions_profile === ":danger-full-access", "functional MVP must record full access as the default Agent permission profile");
  assert(evidence.functional_mvp?.agent_permissions_controls?.includes("permission profiles") && evidence.functional_mvp.agent_permissions_controls.includes("turn/start"), "functional MVP must record the Agent permission selector and transport");
  assert(settings.includes('agentPermissions: ":danger-full-access"'), "renderer settings must default Agent permissions to full access");
  assert(app.includes("permissions: settings.agentPermissions"), "composer must send the selected Agent permission profile");
  assert(bridge.includes('defaultPermissions: ":danger-full-access"'), "browser bridge must default Agent permissions to full access");
  assert(hostTransport.includes('DEFAULT_PERMISSION_PROFILE = ":danger-full-access"'), "shared host core must default Agent permissions to full access");
  assert(injectedPolicy.defaultModel === appProductProfile.default_session_profile.model, "injected default model must match the App product profile");
  assert(injectedPolicy.defaultReasoningEffort === appProductProfile.default_session_profile.reasoning_effort, "injected default reasoning effort must match the App product profile");
  assert(injectedPolicy.autoLabel.zh === appProductProfile.gui.home.codex_model_display_options.auto_option.label_zh, "injected Chinese Auto label must match the App product profile");
  assert(injectedPolicy.autoLabel.en === appProductProfile.gui.home.codex_model_display_options.auto_option.label_en, "injected English Auto label must match the App product profile");
  assert(injectedPolicy.visibleModels.length === profileModels.length, "injected model list length must match the App product profile");
  for (const [index, expected] of profileModels.entries()) {
    const actual = injectedPolicy.visibleModels[index];
    for (const field of ["id", "label_zh", "label_en"]) {
      assert(actual?.[field] === expected[field], `injected model ${index} ${field} must match the App product profile`);
    }
  }
  assert(injectedPolicy.reasoningEfforts.length === profileReasoning.length, "injected reasoning list length must match the App product profile");
  for (const [index, effort] of profileReasoning.entries()) {
    assert(injectedPolicy.reasoningEfforts[index] === effort, `injected reasoning effort ${index} must match the App product profile`);
  }
  const regression = spawnSync("bun", ["run", path.join(root, "scripts", "model-policy-regression.ts")], {
    cwd: root,
    encoding: "utf8"
  });
  assert(
    regression.status === 0,
    `dynamic model policy regression failed\n${regression.stdout ?? ""}\n${regression.stderr ?? ""}`
  );
  assert(evidence.model_policy_regression?.fixture === "scripts/model-policy-regression.ts", "candidate evidence must record the dynamic model policy regression fixture");
  assert(evidence.model_policy_regression?.validation_command === "npm run validate:candidate", "candidate evidence must record the model policy regression command");
  assert(evidence.model_list_pagination_regression?.fixture === "scripts/webui-host/host-core.test.mjs", "candidate evidence must record the model/list pagination fixture");
  assert(evidence.model_list_pagination_regression?.validation_command === "npm run test:webui-host", "candidate evidence must record the model/list pagination command");
  assert(settings.includes('modelAccess: "__auto"'), "settings must default to App-owned Auto model resolution");
  assert(settings.includes("codexModelPolicy.defaultReasoningEffort"), "settings default reasoning must consume the App-derived policy");
  assert(settingsPanel.includes("modelOptions.map") && slotHost.includes("studio.modelOptions.filter"), "DSH composer and Settings must render the App-derived model list");
  assert(settingsPanel.includes("codexModelPolicy.reasoningOptions.map") && slotHost.includes("studio.reasoningOptions.map"), "DSH composer and Settings must render the App-derived reasoning list");
  assert(policySource.includes('invalidPolicy("policy is missing")'), "missing App model policy injection must fail explicitly");
  assert(!policySource.includes("fallbackModelOptions") && !policySource.includes("fallbackReasoningOptions"), "source model policy must not keep versioned fallback lists");
  assert(app.includes("bridge.readCodexModels()"), "renderer must read app-server model availability");
  assert(app.includes("resolveCodexModelOptions(codexCatalog)"), "renderer must filter fixed alternatives through the app-server catalog");
  assert(app.includes("setCodexCatalog(catalog.models)") && app.includes("setCodexCatalog([])"), "renderer must retain the App default route when model catalog discovery is empty or unavailable");
  assert(policySource.includes("available: isAppDefault"), "model/list must not veto the App default route");
  assert(app.includes('if ((!text && !pendingSelections.length) || !resolvedModel) return;'), "composer must require text or selected inputs and block unavailable fixed selections before turn/start");
  assert(
    app.includes('if (sendState === "running")')
      && app.includes("replaceEphemeralQueue(ephemeralQueueRef.current.concat(item))"),
    "composer submissions during an active turn must enter the DSH queue"
  );
  assert(slotHost.includes('from "@deepseek-ai/dsh-client-ui-primitives"') && slotHost.includes("<Menu"), "composer must build its product menu from the pinned DSH Menu primitive");
  assert(slotHost.includes('id: "automatic"') && slotHost.includes("label: autoModelLabel(studio.locale)") && slotHost.includes('studio.selectModel("__auto")'), "composer must expose App-owned Auto as the third root recommendation action");
  assert(!slotHost.includes('{ id: "__auto", name:'), "Auto must not be represented as a model row");
  assert(settingsPanel.includes('<option value="__auto">{autoModelLabel(settings.locale)}</option>'), "Settings must expose Auto model restoration");
  assert(app.includes("model: resolvedModel.id"), "composer must send the App-resolved model");
  assert(app.includes("reasoningEffort: resolvedReasoning"), "composer must send a supported reasoning effort");
  assert(bridge.includes("model?: string"), "bridge request must carry the App-selected model override");
  assert(bridge.includes("reasoningEffort?: string"), "bridge request must carry the App-selected reasoning override");
  assert(bridge.includes("readCodexModels()"), "bridge must expose the app-server model catalog");
  assert(hostTransport.includes('this.request("model/list"'), "shared host core must read app-server model/list");
  assert(hostTransport.includes("...(cursor ? { cursor } : {})"), "shared host core must follow app-server model/list cursors");
  assert(hostTransport.includes("data.push(...page.data)"), "shared host core must merge model/list pages");
  assert(hostTransport.includes("...(model ? { model } : {})"), "shared host core must pass model to app-server turn/start");
  assert(hostTransport.includes("...(reasoningEffort ? { effort: reasoningEffort } : {})"), "shared host core must pass effort to app-server turn/start");
  assert(hostTransport.includes("env.OPL_CODEX_BIN"), "shared host core must consume the App launcher Codex executable from its injected environment");
  assert(codexNative.includes("process.env.OPL_NATIVE_WORKBENCH_CODEX_CWD"), "opl-codex-native must consume the App launcher workspace");
  for (const marker of ["OPL_APP_OPL_BIN", "OPL_NATIVE_WORKBENCH_READ_ONLY", "blocked_read_only", "candidate_read_only_policy"]) {
    assert(oplPassthrough.includes(marker), `shared host core must preserve launcher/runtime safety marker ${marker}`);
  }
  assert(rendererBuilder.includes("__OPL_CODEX_MODEL_POLICY__"), "renderer build must inject the App-owned model policy");
  assert(rendererBuilder.includes("resolveAppRepoRoot"), "renderer build must resolve the App repo through the shared helper");
  assert(appRepoResolver.includes('"contracts", "app-product-profile.json"'), "App repo resolver must require the App product profile");
  const alignment = evidence.default_home_layout?.product_layout_contract;
  assert(alignment && typeof alignment === "object", "candidate evidence must define the App-owned product layout contract");
  assert(alignment.reference_product === "DeepSeek Harness Web client", "product layout contract must bind the DSH GUI baseline");
  assert(JSON.stringify(alignment.left_rail_items) === JSON.stringify(["projects", "conversations", "search", "settings"]), "left rail must contain only projects, conversations, search, and Settings");
  assert(JSON.stringify(alignment.right_context_modules) === JSON.stringify(["project_progress", "files_results", "agents_capabilities"]), "right context must contain only project progress, files and results, and agents and capabilities");
  assert(alignment.project_progress_sources?.includes("codex_app_server_current_thread_workspace") && alignment.project_progress_sources.includes("opl_app_state_work_item_projection_v2"), "project progress must join the canonical thread workspace to the Framework work-item projection");
  assert(alignment.files_workspace_policy === "canonical_thread_workspace_bounded_read_only", "files and results must keep workspace browsing below the canonical thread workspace");
  assert(alignment.runtime_detail_slot === "ui_contributions.runtime.detail", "hypotheses and roadmaps must use runtime.detail contribution readback");
  assert(alignment.files_input_policy === "user_selected_files_and_directories_only" && alignment.results_policy === "owner_projected_artifacts_only_no_action_json", "files and results must preserve their real owner boundaries");
  assert(alignment.package_lifecycle_surface === "settings", "Agent Package lifecycle must remain in Settings");
  assert(JSON.stringify(alignment.product_identity?.visible_text) === JSON.stringify(["One Person Lab"]) && alignment.product_identity.logo_visible === false && alignment.product_identity.bundle_icon_allowed === true, "product identity must be text-only One Person Lab while preserving the bundle icon");
  assert(
    !("codex_2026_07_11_alignment" in (evidence.default_home_layout ?? {})),
    "candidate evidence must not restore the retired dated Codex authority key"
  );
  assert(
    !("reference_version" in alignment)
      && !("reference_date" in alignment)
      && !("reference_observed_at" in alignment),
    "product layout contract must not duplicate the pinned DSH source-reuse evidence"
  );
  assert(!("default_model" in alignment) && !("default_reasoning_effort" in alignment), "candidate evidence must not copy App model defaults");

  assert(app.includes('effectiveSelection === "__auto" && reasoningLevel !== codexModelPolicy.defaultReasoningEffort') && app.includes("writeSettings({ modelAccess, reasoningLevel })"), "changing Auto reasoning must pin the resolved model before applying the override");
}

validateNonLiveDeliveryEvidence(evidence);
assertFallbackBoundaryDowngrades({
  "src/workbench/App.tsx": app,
  "src/workbench/SettingsPanel.tsx": read("src/workbench/SettingsPanel.tsx"),
  "src/bridge/oplBridge.ts": read("src/bridge/oplBridge.ts"),
  "src/workbench/workbenchModel.ts": read("src/workbench/workbenchModel.ts")
});
assertFunctionalMvpCloseout(evidence);
assertSourceMarkerRequirements(evidence);
assertPrivateThreadLayerRemoved(evidence);
assertApplicationHost(evidence);
assertDeepSeekHarnessReuse(evidence, rendererSource);
assertCodexModelControls(evidence, app, rendererSource);
assertRendererTestIds(rendererSource, requiredTestIds);
assertRendererTestIds(rendererSource, deliverySurfaceTestIds(evidence));

const bridge = read("src/bridge/oplBridge.ts");
for (const command of [
  "opl app state --profile fast --json",
  "opl app state --profile full --json",
  "opl runtime app-operator-drilldown --detail full --json",
  "opl app action execute --action"
]) {
  assert(bridge.includes(command), `missing bridge command ${command}`);
}

assert(evidence.owner === "one-person-lab-app", "evidence owner must be one-person-lab-app");
assert(evidence.shell === "opl-studio", "evidence shell must match");
for (const capability of [
  "native_react_workbench_renderer",
  "dynamic_app_product_profile_model_policy",
  "codex_app_server_thread_turn_backend",
  "electron_context_isolated_ipc_bridge",
  "shared_node_host_core",
  "cross_platform_electron_desktop",
  "headless_webui",
  "results_and_delivery_first_presentation",
  "opl_app_state_bridge",
  "opl_app_action_bridge",
  "default_context_collapsed_chat_first_home",
  "dsh_chat_first_visual_baseline",
  "dsh_cordis_application_host",
  "dsh_profile_loader_and_overlay",
  "dsh_host_plugin_inventory",
  "dsh_tools_to_codex_mcp_bridge",
  "dsh_tool_plugin_compatibility",
  "opl_codex_native_plugin",
  "opl_framework_bridge_plugin",
  "upstream_dsh_upgrade_replay_contract",
  "dsh_slot_core_composition_host",
  "dsh_create_slot_renderer_root",
  "dsh_ui_primitives_direct_reuse",
  "dsh_contribution_entry_error_isolation",
  "framework_ui_contributions_projection",
  "host_derived_client_cordis",
  "shared_aionui_studio_client_conformance",
  "canonical_contribution_action_execute_and_readback",
  "dynamic_contribution_registration_disposal",
  "single_codex_app_server_thread_adapter",
  "thread_list_read_start_resume_fork_archive_unarchive",
  "turn_start_steer",
  "codex_subagent_event_projection",
  "desktop_webui_thread_lifecycle_parity",
  "private_coordination_layer_removed",
  "dsh_resizable_details_column",
  "webui_renderer_parity",
  "candidate_app_bundle_package",
  "settings_persistence",
  "execute_confirmation",
  "artifact_preview_mvp",
  "source_visual_smoke",
  "artifact_preview_tabs",
  "project_progress_panel",
  "files_results_panel",
  "agents_capabilities_panel",
  "runtime_detail_contributions",
  "mobile_details_overlay",
  "text_only_product_brand",
  "export_action"
]) {
  assert(evidence.capabilities.includes(capability), `missing evidence capability ${capability}`);
}
assert(evidence.reuse_policy.deepseek_harness_source_usage === "pinned_application_host_runtime_and_gui_source_reuse", "DeepSeek Harness Application Host and GUI use must be direct and pinned");
assert(evidence.reuse_policy.deepseek_harness_source_ref === expectedDshRef, "DeepSeek Harness source ref must be pinned");
assert(evidence.reuse_policy.deepseek_harness_package_version === expectedDshVersion, "DeepSeek Harness packages must use the verified version");
assert(evidence.reuse_policy.application_host_runtime_adopted === true, "DeepSeek Harness Application Host runtime must be adopted");
assert(evidence.reuse_policy.dsh_product_runtime_authority_adopted === false, "DeepSeek Harness product runtime authority must stay excluded");
assert(evidence.reuse_policy.deepseek_harness_selected_source_reused === true, "selected DeepSeek Harness source must be declared as reused");
assert(evidence.reused_oss_module_policy.vendored_source_root === "src/vendor/deepseek-harness", "DeepSeek Harness source must have one explicit vendor root");
assert(evidence.reused_oss_module_policy.source_manifest === "src/composition/deepseekHarnessSourceManifest.json", "DeepSeek Harness source manifest must be canonical");
assert(evidence.reused_oss_module_policy.vendored_file_count === 277, "DeepSeek Harness source inventory must contain 277 files");
assert(evidence.reused_oss_module_policy.byte_identical === true, "DeepSeek Harness vendor source must remain byte-identical");
assert(evidence.reused_oss_module_policy.byte_identical_to_pinned_ref === true, "DeepSeek Harness vendor source byte identity must bind to the pinned ref");
assert(evidence.reused_oss_module_policy.vendored_package_roots?.includes("packages/client/ui-primitives/src"), "DeepSeek Harness source reuse must include the complete ui-primitives tree");
assert(evidence.reused_oss_module_policy.vendored_package_roots?.includes("packages/client/ui-renderer/src"), "DeepSeek Harness source reuse must include the complete ui-renderer tree");
assert(evidence.reused_oss_module_policy.ui_primitives_index === "packages/client/ui-primitives/src/index.ts", "DeepSeek Harness primitive reuse must name the upstream index");
assert(JSON.stringify(evidence.reused_oss_module_policy.direct_reuse_modules) === JSON.stringify(expectedDshModules), "DeepSeek Harness runtime closure must match the rc2 Application Host boundary");
  for (const primitive of ["Button", "Pill", "Input", "Tooltip", "StateDot", "MessageText", "Menu", "icons"]) {
  assert(evidence.reused_oss_module_policy.direct_ui_primitives?.includes(primitive), `missing direct DeepSeek Harness primitive evidence ${primitive}`);
}
assert(evidence.reused_oss_module_policy.brand_override === "upstream_rc2_brand_slots_with_text_only_opl_occupants", "OPL branding must use the rc2 brand slots");
assert(evidence.reused_oss_module_policy.slot_renderer_source === "packages/client/ui-renderer/src/client/scoped-slots.tsx#createSlotRenderer", "candidate evidence must name the pinned slot renderer source");
assert(evidence.reused_oss_module_policy.attachment_slot_policy === "registered_empty_occupant_no_multimodal_runtime", "candidate evidence must not claim multimodal attachment support");
assert(evidence.reused_oss_module_policy.workspace_host_description_policy === "unavailable_until_app_abi_exists", "candidate evidence must not claim a host-description ABI");
for (const rootName of ["AppFrame", "SidebarRoot", "ConversationRoot", "InputBar", "SettingsRoot"]) {
  assert(evidence.reused_oss_module_policy.active_gui_roots.some((entry) => entry.includes(rootName)), `missing active DeepSeek Harness GUI root ${rootName}`);
}
for (const rootName of ["WorkspaceBrowser", "AgentPresetSeat"]) {
  assert(evidence.reused_oss_module_policy.active_gui_roots.some((entry) => entry.includes(rootName)), `missing active DeepSeek Harness product control ${rootName}`);
}
const clientComposition = evidence.client_composition_boundary;
assert(clientComposition?.app_client_contribution_abi === "opl_app_client_contributions.v1", "missing App Client Contribution ABI binding");
assert(clientComposition?.framework_host_projection_schema === "opl_app_ui_contributions_projection.v1", "missing Framework Host projection schema binding");
assert(clientComposition?.host_projection_graph === "allowlisted_closed_graph_from_framework_projection_only", "Client Cordis must consume only the allowlisted Host projection graph");
assert(clientComposition?.host_projection_allowlist_contract === "contracts/opl-app-contributions.schema.json", "Client graph allowlist must remain App-owned");
assert(JSON.stringify(clientComposition?.typed_slots) === JSON.stringify(["settings.section", "runtime.detail", "composer.palette"]), "Client Cordis typed slots must match the App product profile");
assert(clientComposition?.typed_action_policy === "action_refs_only_via_canonical_app_action_bridge", "Client actions must remain typed App action refs");
assert(clientComposition?.framework_host_composition_authority === "one-person-lab-framework", "Framework must remain the Client Host projection authority");
assert(clientComposition?.framework_host_composition_authority_scope === "framework_runtime_package_graph_and_app_projection", "Framework Host authority must remain scoped to runtime, Package graph, and App projection");
assert(clientComposition?.framework_runtime_and_package_composition_authority === "one-person-lab-framework", "Framework must remain the runtime and Package composition authority consumed by Studio");
assert(clientComposition?.studio_application_host === "opl-studio", "Studio must identify its independent Application Host");
assert(clientComposition?.studio_application_host_scope === "dsh_profile_plugin_lifecycle_codex_and_delivery_transport_composition", "Studio Application Host must remain scoped to DSH, Codex, and delivery transport composition");
assert(clientComposition?.studio_application_host_may_exist_without_authority_transfer === true, "Studio Application Host must coexist without transferring Framework or App authority");
assert(clientComposition?.app_authority_policy === "one-person-lab-app_owns_product_profile_gui_abi_active_shell_and_release", "App product authorities must remain App-owned");
assert(clientComposition?.framework_projection_runtime_status === "framework_host_projection_active", "candidate evidence must consume the active Framework Host projection");
assert(clientComposition?.shared_transport_policy === "framework_host_projected_typed_rpc_reads_typed_events_and_canonical_app_actions", "shells must share typed RPC, event, and App action semantics");
assert(clientComposition?.shared_product_state_semantics === true, "shells must share product state semantics");
assert(clientComposition?.package_gui_contribution_policy === "app_schema_admitted_declarative_only_then_framework_host_projected", "Package GUI contributions must remain App-schema-admitted Host projections");
assert(clientComposition?.client_authority_policy === "render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth", "Client Cordis must remain a render-and-dispatch consumer");
assert(clientComposition?.client_cordis_graph === "derived_from_framework_host_graph_and_app_product_profile_slot_policy", "Client Cordis must derive from the Framework Host graph and App slot policy");
assert(clientComposition?.shared_product_profile_and_slot_policy === true, "shells must share the App product profile and slot policy");
for (const field of ["independent_host_truth", "second_package_registry", "second_currentness_authority", "second_action_authority", "second_client_composition_graph"]) {
  assert(clientComposition?.[field] === false, `${field} must remain false`);
}
const clientCordisSource = read("src/composition/clientCordis.ts");
const oplStudioClientPluginSource = read("src/composition/oplStudioClientPlugin.tsx");
for (const marker of [
  "opl.app.client-contributions",
  "opl/app-client-contributions/updated",
  "framework_host_projection_active",
  "updateHostState",
  "readSlot"
]) {
  assert(clientCordisSource.includes(marker), `Client Cordis runtime is missing ${marker}`);
}
assert(
  oplStudioClientPluginSource.includes("provideOplStudioClientContributions(ctx)")
    && oplStudioClientPluginSource.includes("ctx.plugin(oplStudioClientPlugin)"),
  "OPL Studio client plugin must provide and load the Host-derived Client Cordis composition"
);
assert(app.includes("onHostStateChange?.(state)"), "App state caller must feed fresh Host state into Client Cordis");
assert(app.includes("createOplContributionActionRequest(entry, command, confirmed)"), "projected commands must use the typed canonical App action request");
assert(app.includes('receipt.status === "executed"') && app.includes("loadState(settings.runtimeProfile)"), "successful contribution actions must refresh App state");
const qualification = evidence.candidate_runtime_qualification;
assert(qualification?.status === "host_app_studio_aionui_conformance_qualified", "missing Client runtime qualification status");
assert(qualification?.validation_command === "npm run validate:client-conformance -- --out out/qualification/client-conformance.json", "Client qualification command mismatch");
assert(qualification?.receipt_is_git_ignored === true, "qualification receipt must stay outside Git truth");
assert(qualification?.host_app_studio_e2e === true, "Host-App-Studio E2E must be qualified");
assert(qualification?.studio_aionui_projection_equal === true && qualification?.app_aionui_composition_equal === true, "both GUI clients must share projection and composition semantics");
assert(qualification?.app_aionui_compatibility_equal === true && qualification?.studio_app_compatibility_equal === true, "both GUI clients must derive the same App Client compatibility profile");
assert(qualification?.typed_slot_event_action_state_semantics_equal === true, "typed slot/event/action/state semantics must be qualified");
assert(qualification?.dynamic_brand_capability_policy === "consume_current_App_and_Framework_projection_without_a_candidate_owned_fixed_brand_roster", "Studio must not own a fixed brand capability roster");
assert(qualification?.active_shell_adopted === false && qualification?.release_ready === false, "candidate qualification must not become release admission");
assert(JSON.stringify(Object.keys(qualification.external_cohort ?? {}).sort()) === JSON.stringify([
  "aionui_commit",
  "aionui_tree",
  "app_commit",
  "app_tree",
  "framework_commit",
  "framework_tree"
]), "external qualification cohort must contain only the three external owner repositories");
for (const value of Object.values(qualification.external_cohort ?? {})) {
  assert(typeof value === "string" && /^[0-9a-f]{40}$/.test(value), "external qualification cohort must use exact Git object ids");
}
assert(evidence.reuse_policy.other_external_gui_source_copied === false, "other external GUI sources must remain reference-only");
assert(evidence.false_ready_boundary.runtime_authority_transfer === false, "Framework, Codex, product, and domain authority must not transfer");
assert(evidence.user_visible_protocol_copy.agui === false, "AGUI must not be ordinary UI copy");
assert(evidence.user_visible_protocol_copy.copilotkit_surface === false, "CopilotKit must not be ordinary native UI copy");
assert(evidence.settings_information_architecture?.persistence_model?.storage_key === "opl.studio.settings.v1", "settings persistence storage key must be recorded");
assert(evidence.settings_information_architecture?.persistence_model?.system_write_permission === false, "settings persistence must not request system write permission");
assert(evidence.settings_information_architecture?.gateway_account_lkg_cache?.storage_key === "opl.app.gatewayAccount.lkg.v1", "Gateway account LKG cache key must be recorded");
assert(evidence.settings_information_architecture?.gateway_account_lkg_cache?.secret_fields_cached === false, "Gateway account LKG cache must exclude secrets");
assert(evidence.false_ready_boundary.settings_system_write_permission === false, "settings system write permission must stay false");
assert(evidence.false_ready_boundary.artifact_authority === false, "artifact authority must stay false");
assert(evidence.false_ready_boundary.starter_execution_authority === false, "starter execution authority must stay false");

console.log(JSON.stringify({
  status: "opl_studio_candidate_valid",
  shell: "opl-studio",
  non_live_delivery_surface_testids: deliverySurfaceTestIds(evidence).length,
  settings_persistence: "localStorage_candidate_only",
  active_shell_adopted: false,
  release_ready: false,
  live_evidence: false
}, null, 2));
