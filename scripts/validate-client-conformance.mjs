import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function git(repo, ...args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function canonicalCheckout(repo) {
  const line = git(repo, "worktree", "list", "--porcelain")
    .split("\n")
    .find((entry) => entry.startsWith("worktree "));
  assert.ok(line, `cannot resolve canonical checkout for ${repo}`);
  return line.slice("worktree ".length);
}

function parseArguments(argv) {
  const outputIndex = argv.indexOf("--out");
  if (outputIndex === -1) return { output: null };
  assert.ok(argv[outputIndex + 1], "--out requires a path");
  return { output: path.resolve(studioRoot, argv[outputIndex + 1]) };
}

function readBlob(repo, ref, file) {
  return execFileSync("git", ["-C", repo, "show", `${ref}:${file}`], { encoding: "utf8" });
}

function refEvidence(repo, remote, ref = `${remote}/main`) {
  const commit = git(repo, "rev-parse", ref);
  const tree = git(repo, "rev-parse", `${ref}^{tree}`);
  const wireLine = git(repo, "ls-remote", remote, "refs/heads/main");
  const wireCommit = wireLine.split(/\s+/)[0];
  assert.equal(wireCommit, commit, `${repo} ${ref} is not at remote main`);
  return { commit, tree, wire_commit: wireCommit };
}

function pinnedRefEvidence(repo, declared, name) {
  const commit = declared?.[`${name}_commit`];
  const tree = declared?.[`${name}_tree`];
  assert.match(commit ?? "", /^[0-9a-f]{40}$/, `${name} pinned commit is invalid`);
  assert.match(tree ?? "", /^[0-9a-f]{40}$/, `${name} pinned tree is invalid`);
  assert.equal(git(repo, "rev-parse", `${commit}^{commit}`), commit);
  assert.equal(git(repo, "rev-parse", `${commit}^{tree}`), tree, `${name} pinned tree differs`);
  return { commit, tree, source: "declared_release_cohort" };
}

function writeBlobTree(root, file, contents) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

async function importFresh(file) {
  return import(`${pathToFileURL(file).href}?qualification=${Date.now()}-${Math.random()}`);
}

function packageStatus({ contributionId, slot, sortOrder, installed = true, exposureStatus = "visible" }) {
  const viewId = `${contributionId}.view`;
  const commandId = `${contributionId}.refresh`;
  return {
    presence: { installed },
    capability_exposure: { status: exposureStatus },
    app_contributions: {
      schema_version: "opl-app-contributions.v1",
      navigation: [],
      views: [{
        view_id: viewId,
        view_type: "activity_log",
        title_i18n: { "en-US": ` ${contributionId} ` },
        data_ref: `${contributionId}.v1#current`,
        command_ids: [commandId],
        badge_ids: []
      }],
      commands: [{
        command_id: commandId,
        label_i18n: { "en-US": " Refresh " },
        action_ref: `${contributionId}.v1#refresh`,
        confirmation_required: contributionId === "settings"
      }],
      badges: [],
      ui: [{
        contribution_id: contributionId,
        slot,
        contribution_kind: "view",
        trust_tier: "declarative",
        scope: "root",
        sort_order: sortOrder,
        view_id: viewId
      }]
    }
  };
}

function findActionContract(value, actionId) {
  if (!value || typeof value !== "object") return null;
  if (!Array.isArray(value) && value.action_id === actionId) return value;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findActionContract(child, actionId);
    if (found) return found;
  }
  return null;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const { output } = parseArguments(process.argv.slice(2));
const studioCanonical = canonicalCheckout(studioRoot);
const workspaceRoot = path.dirname(studioCanonical);
const repos = {
  framework: process.env.OPL_FRAMEWORK_REPO ?? path.join(workspaceRoot, "one-person-lab"),
  app: process.env.OPL_APP_REPO ?? path.join(workspaceRoot, "one-person-lab-app"),
  aionui: process.env.OPL_AIONUI_REPO ?? path.join(workspaceRoot, "opl-aion-shell")
};
for (const [name, repo] of Object.entries(repos)) {
  assert.ok(fs.existsSync(repo), `${name} checkout is unavailable at ${repo}`);
}

const candidateEvidence = JSON.parse(
  fs.readFileSync(path.join(studioRoot, "src/candidateContractEvidence.json"), "utf8")
);
const declaredExternalCohort = candidateEvidence.candidate_runtime_qualification?.external_cohort;
const pinnedCohort = process.argv.includes("--pinned-cohort");
const externalRefEvidence = (name) => pinnedCohort
  ? pinnedRefEvidence(repos[name], declaredExternalCohort, name)
  : refEvidence(repos[name], "origin");
const cohort = {
  framework: externalRefEvidence("framework"),
  app: externalRefEvidence("app"),
  aionui: externalRefEvidence("aionui"),
  studio_main: refEvidence(studioCanonical, "origin"),
  studio_candidate: {
    commit: git(studioRoot, "rev-parse", "HEAD"),
    tree: git(studioRoot, "rev-parse", "HEAD^{tree}"),
    dirty: git(studioRoot, "status", "--porcelain", "--untracked-files=no").length > 0
  }
};
assert.deepEqual(declaredExternalCohort, {
  framework_commit: cohort.framework.commit,
  framework_tree: cohort.framework.tree,
  app_commit: cohort.app.commit,
  app_tree: cohort.app.tree,
  aionui_commit: cohort.aionui.commit,
  aionui_tree: cohort.aionui.tree
}, "candidate evidence external cohort differs from the selected conformance cohort");

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "opl-client-conformance-"));
try {
  for (const file of [
    "src/read-models/operator/app-state-ui-contributions.ts",
    "src/kernel/contract-validation.ts",
    "src/kernel/json-record.ts"
  ]) {
    writeBlobTree(temporary, file, readBlob(repos.framework, cohort.framework.commit, file));
  }
  const frameworkProducer = await importFresh(path.join(temporary, "src/read-models/operator/app-state-ui-contributions.ts"));
  const hostProjection = frameworkProducer.buildAppUiContributionsProjection({
    "z-package": packageStatus({ contributionId: "runtime", slot: "runtime.detail", sortOrder: 20 }),
    "a-package": packageStatus({ contributionId: "settings", slot: "settings.section", sortOrder: 10 }),
    "b-package": packageStatus({ contributionId: "composer", slot: "composer.palette", sortOrder: 10 }),
    "disabled-package": packageStatus({
      contributionId: "disabled",
      slot: "runtime.detail",
      sortOrder: 0,
      exposureStatus: "disabled"
    })
  });
  assert.equal(hostProjection.contribution_count, 3);

  const aionParserPath = "packages/desktop/src/common/types/opl/uiContributions.ts";
  writeBlobTree(temporary, aionParserPath, readBlob(repos.aionui, cohort.aionui.commit, aionParserPath));
  const aionParser = await importFresh(path.join(temporary, aionParserPath));
  const studioProjectionModule = await importFresh(path.join(studioRoot, "src/composition/contributionProjection.ts"));
  const clientCordisModule = await importFresh(path.join(studioRoot, "src/composition/clientCordis.ts"));
  const hostState = {
    app_state: {
      ui_contributions: hostProjection,
      actions: [{ action_id: "package_contribution_execute" }]
    }
  };
  const studioProjection = studioProjectionModule.readUiContributionsProjection(hostState);
  const aionProjection = aionParser.readOplUiContributionsProjection(hostState);
  assert.deepEqual(studioProjection, aionProjection, "Studio and AionUI projection semantics differ");

  const appProfile = JSON.parse(readBlob(repos.app, cohort.app.commit, "contracts/app-product-profile.json"));
  const aionProfile = JSON.parse(readBlob(
    repos.aionui,
    cohort.aionui.commit,
    "packages/desktop/src/common/config/oplProductProfile/oplProductProfile.generated.json"
  ));
  const appComposition = appProfile.delivery_topology.minimum_complete_product.composition_model;
  const aionComposition = aionProfile.delivery_topology.minimum_complete_product.composition_model;
  assert.deepEqual(aionComposition, appComposition, "AionUI generated product composition differs from App main");
  const appCompatibility = appProfile.client_renderer_compatibility;
  const aionCompatibility = aionProfile.client_renderer_compatibility;
  assert.deepEqual(aionCompatibility, appCompatibility, "AionUI Client renderer compatibility differs from App main");

  const composition = await clientCordisModule.createOplStudioClientCordisComposition(appProfile);
  assert.deepEqual(composition.contributions.policy, {
    abi: appCompatibility.contribution_abi,
    projectionSchema: appCompatibility.host_projection_schema,
    slots: appCompatibility.typed_slots,
    stateRpc: appCompatibility.typed_state_rpc,
    actionRpc: appCompatibility.typed_action_rpc,
    event: appCompatibility.typed_client_event,
    stateSemanticsContract: appCompatibility.state_semantics_contract,
    brandCapabilityProjectionPolicy: appCompatibility.brand_capability_projection_policy
  }, "Studio Client renderer compatibility differs from App main");
  const updates = [];
  const unsubscribe = composition.contributions.subscribe((projection) => updates.push(projection));
  composition.contributions.updateHostState(hostState);
  composition.contributions.updateHostState(hostState);
  assert.equal(updates.length, 1, "Client Cordis must emit one typed event for one projection change");
  for (const slot of appComposition.package_contribution_slots) {
    assert.deepEqual(
      composition.contributions.readSlot(slot),
      studioProjection.entries.filter((entry) => entry.slot === slot)
    );
  }

  const appGuiContract = JSON.parse(readBlob(repos.app, cohort.app.commit, "contracts/app-gui-product-contract.json"));
  const actionContract = findActionContract(appGuiContract, "package_contribution_execute");
  assert.ok(actionContract, "App action contract is missing package_contribution_execute");
  assert.deepEqual(actionContract.required_payload_fields, ["package_id", "ref", "input", "confirmed"]);
  const settingsEntry = studioProjection.entries.find((entry) => entry.contributionId === "settings");
  assert.ok(settingsEntry?.commands[0], "Framework fixture did not project the settings command");
  const actionRequest = studioProjectionModule.createOplContributionActionRequest(
    settingsEntry,
    settingsEntry.commands[0],
    true
  );
  assert.equal(actionRequest.actionId, actionContract.action_id);
  assert.deepEqual(Object.keys(actionRequest.payload), actionContract.required_payload_fields);
  assert.equal(actionRequest.dryRun, false);
  assert.equal(actionRequest.payload.confirmed, true);

  const aionActionSource = readBlob(
    repos.aionui,
    cohort.aionui.commit,
    "packages/desktop/src/renderer/components/opl/OplUiContributionSlot.tsx"
  );
  for (const marker of [
    "actionId: 'package_contribution_execute'",
    "confirmed,",
    "dryRun: false",
    "appStateQuery.load('fast', { forceFresh: true })"
  ]) {
    assert.ok(aionActionSource.includes(marker), `AionUI canonical action path is missing ${marker}`);
  }
  const studioActionSource = fs.readFileSync(path.join(studioRoot, "src/workbench/App.tsx"), "utf8");
  for (const marker of [
    "createOplContributionActionRequest(entry, command, confirmed)",
    'receipt.status === "executed"',
    "loadState(settings.runtimeProfile)"
  ]) {
    assert.ok(studioActionSource.includes(marker), `Studio action path is missing ${marker}`);
  }

  unsubscribe();
  await composition.dispose();

  const receipt = {
    schema: "opl_studio_client_conformance_qualification.v1",
    status: "candidate_runtime_qualified",
    generated_at: new Date().toISOString(),
    cohort,
    host_to_client: {
      framework_producer: "src/read-models/operator/app-state-ui-contributions.ts#buildAppUiContributionsProjection",
      projection_schema: hostProjection.surface_kind,
      contribution_count: hostProjection.contribution_count,
      studio_aionui_projection_equal: true,
      app_aionui_composition_equal: true,
      app_aionui_compatibility_equal: true,
      studio_app_compatibility_equal: true,
      declared_external_cohort_equal: true,
      composition_sha256: sha256(JSON.stringify(appComposition)),
      client_cordis_event_count: updates.length,
      slots: appComposition.package_contribution_slots
    },
    action_semantics: {
      action_id: actionRequest.actionId,
      payload_fields: Object.keys(actionRequest.payload),
      confirmation_boolean_preserved: true,
      dry_run: actionRequest.dryRun,
      fresh_state_readback: true,
      aionui_focused_test: "tests/unit/opl-runtime/OplUiContributionSlot.dom.test.tsx"
    },
    authority_boundary: {
      framework_host_only: true,
      app_product_profile_owner: true,
      client_discovery_or_install: false,
      second_registry_or_currentness: false,
      client_release_operation: false
    },
    candidate_release_admission: false
  };
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
