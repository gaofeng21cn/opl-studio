import fs from "node:fs";
import { createRequire } from "node:module";
import { verifyViewerCarrier, viewerCarrierRoot } from "./ecosystem-client-assets.mjs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveAppRepoRoot } from "./resolve-app-repo-root.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(root, "src", "renderer-shell.html");
const appRepoRoot = resolveAppRepoRoot(root);
const appProductProfilePath = path.join(appRepoRoot, "contracts", "app-product-profile.json");
const legacyModelPolicySource = "one-person-lab-app/contracts/app-product-profile.json#gui.home.codex_model_display_options";
const autoModelPolicySource = "one-person-lab-app/contracts/app-product-profile.json#codex.auto_model_policy";

function assertAsset(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing ${label}: ${filePath}`);
  }
}

function requireObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`OPL App product profile ${field} must be an object`);
  }
  return value;
}

function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`OPL App product profile ${field} must be a non-empty string`);
  }
  return value;
}

export function readAppProductProfile(profilePath = appProductProfilePath) {
  assertAsset(profilePath, "OPL App product profile");
  try {
    return JSON.parse(fs.readFileSync(profilePath, "utf8"));
  } catch (error) {
    throw new Error(`invalid OPL App product profile JSON at ${profilePath}: ${error instanceof Error ? error.message : error}`);
  }
}

export function createClientCompositionPolicy(profile) {
  const root = requireObject(profile, "root");
  const topology = requireObject(root.delivery_topology, "delivery_topology");
  const minimumProduct = requireObject(topology.minimum_complete_product, "delivery_topology.minimum_complete_product");
  const composition = requireObject(
    minimumProduct.composition_model,
    "delivery_topology.minimum_complete_product.composition_model"
  );
  const compatibility = requireObject(root.client_renderer_compatibility, "client_renderer_compatibility");
  const required = {
    app_client_contribution_abi: "opl_app_client_contributions.v1",
    framework_host_graph_source: "app_state.ui_contributions",
    framework_host_projection_schema: "opl_app_ui_contributions_projection.v1",
    host_projection_graph_policy: "allowlisted_closed_graph_from_framework_projection_only",
    host_projection_allowlist_contract: "contracts/opl-app-contributions.schema.json",
    typed_slot_policy: "mount_only_app_product_profile_declared_slots",
    typed_action_policy: "action_refs_only_via_canonical_app_action_bridge",
    framework_host_composition_authority: "one-person-lab-framework",
    app_authority_policy: "one-person-lab-app_owns_product_profile_gui_abi_active_shell_and_release",
    framework_projection_runtime_status: "framework_host_projection_active",
    shared_transport_policy: "framework_host_projected_typed_rpc_reads_typed_events_and_canonical_app_actions",
    package_gui_contribution_policy: "app_schema_admitted_declarative_only_then_framework_host_projected",
    client_authority_policy: "render_and_dispatch_only_no_plugin_discovery_install_registry_currentness_release_operation_task_package_or_product_truth",
    client_cordis_graph: "derived_from_framework_host_graph_and_app_product_profile_slot_policy",
    client_renderer_compatibility_profile: "client_renderer_compatibility",
    client_renderer_switch_policy: "explicit_adapter_selection_after_compatibility_admission_never_unverified_hot_switch",
    brand_capability_projection_policy: "dynamic_framework_host_projection_no_fixed_brand_or_domain_registry_in_app_or_client"
  };
  for (const [field, expected] of Object.entries(required)) {
    if (composition[field] !== expected) {
      throw new Error(`OPL App Client Cordis policy ${field} must equal ${expected}`);
    }
  }
  const slots = composition.package_contribution_slots;
  const expectedSlots = ["composer.palette", "runtime.detail", "settings.section"];
  if (
    !Array.isArray(slots)
    || slots.length !== expectedSlots.length
    || new Set(slots).size !== slots.length
    || !expectedSlots.every((slot) => slots.includes(slot))
  ) {
    throw new Error("OPL App Client Cordis policy must expose exactly the three App-owned contribution slots");
  }
  for (const field of [
    "independent_host_truth_allowed",
    "second_client_composition_graph_allowed",
    "second_package_registry_allowed",
    "second_currentness_authority_allowed",
    "second_state_or_action_truth_allowed"
  ]) {
    if (composition[field] !== false) throw new Error(`OPL App Client Cordis policy ${field} must remain false`);
  }
  if (composition.shared_product_state_semantics !== true) {
    throw new Error("OPL App Client Cordis policy must share product state semantics");
  }
  if (
    !Array.isArray(composition.shared_shell_consumers)
    || !composition.shared_shell_consumers.includes("opl-aion-shell")
    || !composition.shared_shell_consumers.includes("opl-studio")
  ) {
    throw new Error("OPL App Client Cordis policy must name both approved Shell consumers");
  }
  const compatibilityRequired = {
    schema: "opl_app_client_renderer_compatibility.v1",
    owner: "one-person-lab-app",
    host_composition_authority: "one-person-lab-framework",
    host_graph_source: composition.framework_host_graph_source,
    host_projection_schema: composition.framework_host_projection_schema,
    contribution_abi: composition.app_client_contribution_abi,
    allowlist_contract: composition.host_projection_allowlist_contract,
    typed_state_rpc: "opl app state --profile fast --json",
    typed_action_rpc: "opl app action execute --action <action_id> [--payload json] [--dry-run] --json",
    typed_client_event: "opl/app-client-contributions/updated",
    state_semantics_contract: "contracts/app-runtime-bridge.json",
    client_authority_policy: composition.client_authority_policy,
    switch_policy: composition.client_renderer_switch_policy,
    hot_switch_without_revalidation_allowed: false,
    brand_capability_projection_policy: composition.brand_capability_projection_policy,
    app_fixed_brand_registry_allowed: false,
    client_fixed_brand_registry_allowed: false,
    display_and_allowlist_owner: "one-person-lab-app"
  };
  for (const [field, expected] of Object.entries(compatibilityRequired)) {
    if (compatibility[field] !== expected) {
      throw new Error(`OPL App Client renderer compatibility ${field} must equal ${expected}`);
    }
  }
  if (
    !Array.isArray(compatibility.typed_slots)
    || compatibility.typed_slots.length !== expectedSlots.length
    || new Set(compatibility.typed_slots).size !== compatibility.typed_slots.length
    || !expectedSlots.every((slot) => compatibility.typed_slots.includes(slot))
  ) {
    throw new Error("OPL App Client renderer compatibility must expose exactly the App-owned contribution slots");
  }
  return {
    client_renderer_compatibility: compatibility,
    delivery_topology: {
      minimum_complete_product: {
        composition_model: composition
      }
    }
  };
}

export function createCodexModelPolicy(profile) {
  const profileObject = requireObject(profile, "root");
  const defaultSession = requireObject(profileObject.default_session_profile, "default_session_profile");
  const codex = requireObject(profileObject.codex, "codex");
  const autoPolicy = codex.auto_model_policy && typeof codex.auto_model_policy === "object" && !Array.isArray(codex.auto_model_policy)
    ? codex.auto_model_policy
    : undefined;
  const gui = requireObject(profileObject.gui, "gui");
  const home = requireObject(gui.home, "gui.home");
  const display = requireObject(home.codex_model_display_options, "gui.home.codex_model_display_options");
  const autoOption = requireObject(display.auto_option, "gui.home.codex_model_display_options.auto_option");
  const configuredDefault = requireObject(
    autoPolicy?.configured_default,
    "codex.auto_model_policy.configured_default"
  );
  const fallback = requireObject(
    autoPolicy?.catalog_unavailable_fallback,
    "codex.auto_model_policy.catalog_unavailable_fallback"
  );
  const defaultModel = requireNonEmptyString(configuredDefault.model, "codex.auto_model_policy.configured_default.model");
  const defaultReasoningEffort = requireNonEmptyString(
    configuredDefault.reasoning_effort,
    "codex.auto_model_policy.configured_default.reasoning_effort"
  );
  if (
    defaultModel !== requireNonEmptyString(defaultSession.model, "default_session_profile.model")
    || defaultReasoningEffort !== requireNonEmptyString(
      defaultSession.reasoning_effort,
      "default_session_profile.reasoning_effort"
    )
    || defaultModel !== requireNonEmptyString(fallback.model, "codex.auto_model_policy.catalog_unavailable_fallback.model")
    || defaultReasoningEffort !== requireNonEmptyString(
      fallback.reasoning_effort,
      "codex.auto_model_policy.catalog_unavailable_fallback.reasoning_effort"
    )
  ) {
    throw new Error("OPL App product profile generated defaults must match codex.auto_model_policy.configured_default");
  }

  if (!Array.isArray(display.visible_models) || display.visible_models.length === 0) {
    throw new Error("OPL App product profile gui.home.codex_model_display_options.visible_models must be a non-empty array");
  }
  let visibleModels = display.visible_models.map((value, index) => {
    const option = requireObject(value, `gui.home.codex_model_display_options.visible_models[${index}]`);
    return {
      id: requireNonEmptyString(option.id, `gui.home.codex_model_display_options.visible_models[${index}].id`),
      label_zh: requireNonEmptyString(option.label_zh, `gui.home.codex_model_display_options.visible_models[${index}].label_zh`),
      label_en: requireNonEmptyString(option.label_en, `gui.home.codex_model_display_options.visible_models[${index}].label_en`)
    };
  });
  if (new Set(visibleModels.map((option) => option.id)).size !== visibleModels.length) {
    throw new Error("OPL App product profile visible model ids must be unique");
  }
  const knownModelPreferenceOrder = autoPolicy?.frontier_model_preference_order;
  if (knownModelPreferenceOrder !== undefined) {
    if (!Array.isArray(knownModelPreferenceOrder) || !knownModelPreferenceOrder.every((value) => typeof value === "string" && value.trim())) {
      throw new Error("OPL App product profile codex.auto_model_policy.frontier_model_preference_order must be a string array");
    }
    const byId = new Map(visibleModels.map((option) => [option.id, option]));
    visibleModels = knownModelPreferenceOrder.map((id) => {
      const option = byId.get(id);
      if (!option) throw new Error(`OPL App product profile known model ${id} must be included in visible_models`);
      return option;
    });
  }
  if (!visibleModels.some((option) => option.id === defaultModel)) {
    throw new Error("OPL App product profile default model must be included in visible_models");
  }

  if (!Array.isArray(display.user_reasoning_effort_options) || display.user_reasoning_effort_options.length === 0) {
    throw new Error("OPL App product profile user_reasoning_effort_options must be a non-empty array");
  }
  const reasoningEfforts = display.user_reasoning_effort_options.map((value, index) =>
    requireNonEmptyString(value, `gui.home.codex_model_display_options.user_reasoning_effort_options[${index}]`)
  );
  if (!reasoningEfforts.includes(defaultReasoningEffort)) {
    throw new Error("OPL App product profile default reasoning effort must be included in user_reasoning_effort_options");
  }

  const knownModelReasoningEffortOverrides = autoPolicy?.known_model_reasoning_effort_overrides
    ? requireObject(autoPolicy.known_model_reasoning_effort_overrides, "codex.auto_model_policy.known_model_reasoning_effort_overrides")
    : { [defaultModel]: defaultReasoningEffort };
  for (const [model, effort] of Object.entries(knownModelReasoningEffortOverrides)) {
    requireNonEmptyString(model, "codex.auto_model_policy.known_model_reasoning_effort_overrides model");
    requireNonEmptyString(effort, `codex.auto_model_policy.known_model_reasoning_effort_overrides.${model}`);
  }

  return {
    source: autoPolicy ? autoModelPolicySource : legacyModelPolicySource,
    defaultModel,
    defaultReasoningEffort,
    visibleModels,
    reasoningEfforts,
    autoLabel: {
      zh: requireNonEmptyString(autoOption.label_zh, "gui.home.codex_model_display_options.auto_option.label_zh"),
      en: requireNonEmptyString(autoOption.label_en, "gui.home.codex_model_display_options.auto_option.label_en")
    },
    knownModelReasoningEffortOverrides,
    acceptUnknownCatalogDefault: autoPolicy
      ? autoPolicy.unknown_default_model_policy === "accept_catalog_default_even_when_not_in_frontier_model_preference_order"
      : true,
    useHighestSupportedReasoningForUnknown: autoPolicy
      ? autoPolicy.unknown_model_reasoning_effort_policy === "highest_supported_reasoning_effort_from_catalog"
      : true
  };
}

export function readCodexModelPolicy(profilePath = appProductProfilePath) {
  return createCodexModelPolicy(readAppProductProfile(profilePath));
}

export function buildRenderer({
  outDir = path.join(root, "dist"),
  htmlName = "index.html",
  jsName = "renderer.js",
  format = "esm",
  scriptType = "module"
} = {}) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  verifyViewerCarrier();
  const require = createRequire(import.meta.url);
  const pluginRoot = path.join(outDir, "ecosystem");
  fs.mkdirSync(pluginRoot, { recursive: true });
  for (const [id, name] of [["@deepseek-ai/dsh-client-modules", "dsh-client-modules"], ["@objectivex666/dsh-settings-search", "dsh-settings-search"]]) {
    fs.copyFileSync(require.resolve(`${id}/client`), path.join(pluginRoot, `${name}.js`));
    fs.copyFileSync(path.join(root, "node_modules", id, "LICENSE"), path.join(pluginRoot, `${name}.LICENSE`));
  }
  fs.copyFileSync(path.join(viewerCarrierRoot, "client.js"), path.join(pluginRoot, "dsh-file-viewer.js"));
  for (const file of ["LICENSE", "manifest.json", "upstream-package.json"]) {
    fs.copyFileSync(path.join(viewerCarrierRoot, file), path.join(pluginRoot, `dsh-file-viewer.${file}`));
  }
  const appProductProfile = readAppProductProfile();
  const modelPolicy = createCodexModelPolicy(appProductProfile);
  const clientCompositionProfile = createClientCompositionPolicy(appProductProfile);
  const clientCompositionPolicy = clientCompositionProfile.delivery_topology.minimum_complete_product.composition_model;

  const jsPath = path.join(outDir, jsName);
  const cssName = jsName.replace(/\.[^.]+$/, ".css");
  const cssPath = path.join(outDir, cssName);
  const build = spawnSync(
    "bun",
    [
      path.join(root, "scripts", "bun-build-renderer-entry.ts"),
      path.join(root, "src", "main.tsx"),
      outDir,
      format
    ],
    { encoding: "utf8", cwd: root }
  );
  if (build.status !== 0) {
    throw new Error(`renderer build failed\n${build.stdout}\n${build.stderr}`);
  }
  const emittedJsPath = path.join(outDir, "main.js");
  const emittedCssPath = path.join(outDir, "main.css");
  if (!fs.existsSync(emittedJsPath)) {
    throw new Error(`renderer build produced no JavaScript entry at ${emittedJsPath}`);
  }
  fs.renameSync(emittedJsPath, jsPath);
  const hasStylesheet = fs.existsSync(emittedCssPath);
  if (hasStylesheet) fs.renameSync(emittedCssPath, cssPath);

  const policyScript = `<script>globalThis.__OPL_CODEX_MODEL_POLICY__=${JSON.stringify(modelPolicy).replaceAll("<", "\\u003c")};globalThis.__OPL_CLIENT_COMPOSITION_POLICY__=${JSON.stringify(clientCompositionProfile).replaceAll("<", "\\u003c")};</script>`;
  const html = fs.readFileSync(templatePath, "utf8")
    .replace("</head>", hasStylesheet ? `  <link rel="stylesheet" href="./${cssName}" />\n</head>` : "</head>")
    .replace("<body>", `<body>\n  ${policyScript}`)
    .replace(
    "</body>",
    scriptType === "module"
      ? `  <script type="module" src="./${jsName}"></script>\n</body>`
      : `  <script src="./${jsName}"></script>\n</body>`
    );
  fs.writeFileSync(path.join(outDir, htmlName), html);
  const metadata = {
    status: "source_renderer_build_passed",
    renderer: "src/workbench/App.tsx",
    entry: "src/main.tsx",
    html: htmlName,
    script: jsName,
    format,
    scriptType,
    stylesheet: hasStylesheet ? cssName : null,
    modelPolicySource: modelPolicy.source,
    defaultModel: modelPolicy.defaultModel,
    defaultReasoningEffort: modelPolicy.defaultReasoningEffort,
    visibleModels: modelPolicy.visibleModels.map((option) => option.id),
    reasoningEfforts: modelPolicy.reasoningEfforts,
    clientCompositionAbi: clientCompositionPolicy.app_client_contribution_abi,
    clientProjectionSchema: clientCompositionPolicy.framework_host_projection_schema,
    clientContributionSlots: clientCompositionPolicy.package_contribution_slots
  };
  fs.writeFileSync(path.join(outDir, "renderer-build.json"), JSON.stringify(metadata, null, 2));
  return metadata;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(buildRenderer(), null, 2));
}
