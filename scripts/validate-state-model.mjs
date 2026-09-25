import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidence = JSON.parse(fs.readFileSync(path.join(root, "src/candidateContractEvidence.json"), "utf8"));
const stateModel = evidence.active_project_line_state_model;
const liveDerivationPolicy = evidence.workbench_model_live_derivation;
const packageLifecyclePolicy = evidence.agent_package_lifecycle_display;
const workbenchModelSource = fs.readFileSync(path.join(root, "src/workbench/workbenchModel.ts"), "utf8");
const appSource = fs.readFileSync(path.join(root, "src/workbench/App.tsx"), "utf8");
const bridgeSource = fs.readFileSync(path.join(root, "src/bridge/oplBridge.ts"), "utf8");
const sampleStatePath = "/tmp/opl-studio-state-final.json";
const sampleState = loadSampleState();

const requiredFields = [
  "status",
  "active_run_id",
  "next_visible_step",
  "progress_delta_classification",
  "deliverable_progress_delta",
  "platform_repair_delta",
  "next_forced_delta"
];
const forbiddenClaims = [
  "domain_ready",
  "production_ready",
  "clean_vm_ready",
  "full_release_ready",
  "active_shell_adopted"
];
const fakeStarterActionIds = [
  "starter.mas.dry_run",
  "starter.mag.dry_run",
  "starter.rca.dry_run",
  "starter.bookforge.dry_run"
];
const fakePackageActionIds = [
  "fallback_package_install",
  "fallback_package_update",
  "fallback_package_repair",
  "fallback_package_uninstall",
  "fallback_package_exposure",
  "legacy_modules_fallback_install",
  "legacy_modules_fallback_update",
  "legacy_modules_fallback_repair",
  "legacy_modules_fallback_uninstall",
  "legacy_modules_fallback_exposure",
  "package_lifecycle_fallback_action",
  "fallback_unavailable_fake_action_id"
];
const allowedStarterFallbackStatuses = ["preview", "payload_required", "unavailable"];
const requiredStarterActionRefs = [
  "task_action_receipt_preview",
  "task_export_bundle_preview",
  "workspace_ensure",
  "settings_sync_capabilities"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function getPath(rootValue, dottedPath) {
  return dottedPath.split(".").reduce((current, part) => {
    if (current && typeof current === "object" && part in current) return current[part];
    return undefined;
  }, rootValue);
}

function loadSampleState() {
  const existing = fs.existsSync(sampleStatePath)
    ? JSON.parse(fs.readFileSync(sampleStatePath, "utf8"))
    : null;
  try {
    const stdout = execFileSync("opl", ["app", "state", "--profile", "fast", "--json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    });
    const freshState = JSON.parse(stdout);
    fs.writeFileSync(sampleStatePath, `${JSON.stringify(freshState, null, 2)}\n`);
    return freshState;
  } catch (error) {
    if (existing) return existing;
    throw error;
  }
}

assert(stateModel?.authority === "opl_framework_active_project_line_projection", "state model authority mismatch");
assert(stateModel.validation_command === "npm run validate:state-model", "state model validation command mismatch");
assert(stateModel.consumed_projection === "opl app state --profile fast --json active_project_lines", "state model projection mismatch");
for (const field of requiredFields) {
  assert(stateModel.required_fields.includes(field), `missing required state field ${field}`);
}
for (const claim of forbiddenClaims) {
  assert(stateModel.forbidden_claims.includes(claim), `missing forbidden claim ${claim}`);
}

const starterPolicy = evidence.starter_action_ref_policy;
assert(starterPolicy?.authority === "opl app state --profile fast --json actions", "starter action policy authority mismatch");
assert(Array.isArray(starterPolicy.required_live_action_refs), "starter action policy missing required live refs");
assert(Array.isArray(starterPolicy.fake_starter_action_ids_rejected), "starter action policy missing fake starter rejects");
for (const actionRef of requiredStarterActionRefs) {
  assert(starterPolicy.required_live_action_refs.includes(actionRef), `missing starter live action ref ${actionRef}`);
  assert(workbenchModelSource.includes(actionRef), `workbench model missing starter action ref ${actionRef}`);
}
for (const fakeActionId of fakeStarterActionIds) {
  assert(starterPolicy.fake_starter_action_ids_rejected.includes(fakeActionId), `missing fake starter reject ${fakeActionId}`);
  const markerRequirements = JSON.stringify(evidence.source_marker_requirements ?? {});
  assert(!markerRequirements.includes(fakeActionId), `source marker requirements still accept fake starter action ${fakeActionId}`);
  assert(!workbenchModelSource.includes(fakeActionId), `workbench model still constructs fake starter action ${fakeActionId}`);
}
assert(!workbenchModelSource.includes("fallback_unavailable_fake_action_id"), "workbench fallback still emits fake-action fallback status");
assert(!workbenchModelSource.includes('if (/ready|completed|complete|healthy|available/.test(text)) return "ready";'), "artifactStatus still upgrades generic ready text");
assert(workbenchModelSource.includes("nonReadyBoundaryStatusPattern"), "artifactStatus missing fallback/simulated downgrade guard");
assert(workbenchModelSource.includes('"app_canonical"'), "artifactStatus missing explicit canonical ready source");
assert(!appSource.includes("Context ready"), "fallback UI still displays Context ready");
assert(!appSource.includes('status="connected"'), "fallback UI still displays connected status");
const composerRunStateSource = appSource.match(/data-testid="opl-composer-run-state"[\s\S]*?<\/span>/)?.[0];
assert(composerRunStateSource, "composer run-state surface missing");
assert(!composerRunStateSource.includes(': "Ready"'), "composer idle state still displays Ready");
assert(!bridgeSource.includes('canExecute: receiptKind !== "confirmation_required"'), "placeholder receipt still allows execution by default");
assert(bridgeSource.includes("bridge_unavailable_placeholder"), "placeholder receipt missing bridge unavailable boundary");
for (const status of allowedStarterFallbackStatuses) {
  assert(workbenchModelSource.includes(`status: "${status}"`) || workbenchModelSource.includes(`: "${status}"`), `workbench model missing starter fallback status ${status}`);
}

assert(packageLifecyclePolicy?.authority === "opl app state --profile fast --json#app_state.agent_packages.directory + app_state.agent_packages.status_index", "package lifecycle authority mismatch");
assert(packageLifecyclePolicy.legacy_fallback_projection === "opl app state --profile fast --json#app_state.modules.items[]", "package lifecycle legacy fallback mismatch");
for (const marker of [
  "appState.agent_packages",
  "canonical_agent_packages",
  "legacy_modules_fallback",
  "missing_bridge",
  "canonicalSummaryRow",
  "source !== \"canonical_agent_packages\"",
  "sourceExplanation",
  "searchMetadata",
  "packageSearchMetadata",
  "packageLifecycleDetails",
  "recommended_action",
  "physical_surface",
  "manifest_url_source",
  "git_local_developer_source",
  "ghcr_source",
  "managed_source",
  "missing_codex_surface",
  "required_skill",
  "projectedAction.action_id",
  "projectedAction.action_ref",
  "projectedAction.payload",
  "projectedAction.required_payload_fields",
  "projectedAction.confirmation_required"
]) {
  assert(workbenchModelSource.includes(marker), `workbench model missing package lifecycle marker ${marker}`);
}
const settingsPanelSource = fs.readFileSync(path.join(root, "src/workbench/SettingsPanel.tsx"), "utf8");
for (const marker of ["PackageCatalog", "opl-settings-agent-catalog", "agent-package-list"]) {
  assert(settingsPanelSource.includes(marker), `Settings renderer missing package lifecycle marker ${marker}`);
}
for (const marker of ["actionPayloadComplete"]) {
  assert(settingsPanelSource.includes(marker), `Settings renderer missing package lifecycle detail marker ${marker}`);
}
const packageActionMappingStart = workbenchModelSource.indexOf("function packageLifecycleActions(");
const packageActionMappingEnd = workbenchModelSource.indexOf("\nfunction packageLifecycleItem(", packageActionMappingStart);
assert(packageActionMappingStart >= 0 && packageActionMappingEnd > packageActionMappingStart, "package lifecycle action mapping boundary missing");
const packageActionMappingSource = workbenchModelSource.slice(packageActionMappingStart, packageActionMappingEnd);
for (const forbidden of ["agent_package_home_shortcut_preferences_set", "agent_package_install", "module_update", "settings_apply_opl_packages", "module_reinstall", "module_remove"]) {
  assert(!packageActionMappingSource.includes(forbidden), `package lifecycle action mapping must not use legacy module action ${forbidden}`);
}
for (const fakeActionId of fakePackageActionIds) {
  assert(!workbenchModelSource.includes(fakeActionId), `workbench model still constructs fake package action ${fakeActionId}`);
}
for (const claim of ["package_ready", "package_installed_ready", "package_synced"]) {
  assert(!workbenchModelSource.includes(claim), `workbench model must not infer ${claim}`);
}

const packageProjection = getPath(sampleState, "app_state.agent_packages");
assert(packageProjection && typeof packageProjection === "object", "sample state missing canonical app_state.agent_packages projection");
const sampleActions = getPath(sampleState, "app_state.actions");
assert(Array.isArray(sampleActions), "sample state missing App/root action refs");
const sampleActionIds = new Set(sampleActions.map((action) => action?.action_id).filter(Boolean));
for (const actionRef of packageLifecyclePolicy.required_action_refs ?? []) {
  assert(sampleActionIds.has(actionRef), `sample state missing package action ref ${actionRef}`);
}

assert(liveDerivationPolicy?.authority === "opl app state --profile fast --json", "live derivation authority mismatch");
assert(fs.existsSync(sampleStatePath), `missing sample state file ${sampleStatePath}`);
for (const projection of liveDerivationPolicy.required_projections ?? []) {
  assert(getPath(sampleState, projection) != null, `sample state missing required projection ${projection}`);
}
for (const marker of [
  "settings_control_center",
  "task_drilldowns",
  "current_owner_delta_next_action",
  "action_receipt",
  "artifact_or_blocker",
  "review_receipt"
]) {
  assert(workbenchModelSource.includes(marker), `workbench model missing live derivation marker ${marker}`);
}

const taskDrilldowns = getPath(sampleState, "app_state.operator.workbench.task_drilldowns");
assert(Array.isArray(taskDrilldowns), "sample state missing operator task drilldowns projection");
const domainTasks = taskDrilldowns.filter((task) => task && typeof task === "object" && task.task_id === task.domain_id);
for (const domainId of ["medautoscience", "medautogrant", "redcube", "oplbookforge"]) {
  assert(liveDerivationPolicy.required_task_domains_for_starters?.includes(domainId), `live derivation policy missing starter domain ${domainId}`);
}
for (const task of domainTasks) {
  const domainId = task.domain_id;
  assert(task.action_receipt?.preview_ref, `starter domain task ${domainId} missing action preview ref`);
  assert(
    task.artifact_or_blocker?.export_bundle_refs?.length || task.artifact_or_blocker?.export_ref,
    `starter domain task ${domainId} missing export bundle refs`
  );
}

console.log(JSON.stringify({
  status: "state_model_valid",
  consumed_projection: stateModel.consumed_projection,
  forbidden_claims: stateModel.forbidden_claims,
  starter_action_ref_policy: "real_app_action_refs_required",
  package_lifecycle_policy: "canonical_agent_packages_first_fallback_preview_unavailable",
  package_action_refs: packageLifecyclePolicy.required_action_refs,
  live_derivation: "actions_operator_settings_control_center",
  observed_task_drilldown_count: taskDrilldowns.length
}, null, 2));
