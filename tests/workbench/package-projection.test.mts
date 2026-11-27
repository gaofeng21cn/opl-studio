import assert from "node:assert/strict";
import test from "node:test";

import {
  agentPackageSelectionIntent,
  deriveWorkbenchModelFromState
} from "../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts";

test("contribution controls use the owner action catalog independently of task context", () => {
  const action = { action_id: "package_contribution_execute", dry_run_supported: true };
  const deliveryActions = Array.from({ length: 8 }, (_, index) => ({
    action_id: `deliver-${index}`, dry_run_supported: true
  }));
  const available = deriveWorkbenchModelFromState({ app_state: { actions: [...deliveryActions, action] } });
  assert.equal(available.canExecuteUiContributions, true);
  assert.ok(!available.contextActions.some(({ id }) => id === action.action_id));
  const withoutAction = deriveWorkbenchModelFromState({ app_state: { actions: [] } }, available);
  assert.equal(withoutAction.canExecuteUiContributions, false);
});

test("software scope and immutable artwork survive the Host projection", async () => {
  const { readManagedUpdateProjection } = await import("../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts");
  const { softwareCatalogPackages } = await import("../../plugins/core/opl-studio-client/src/client/workbench/softwareCatalog.ts");
  const { publicSoftwareIconUrl } = await import("../../plugins/core/opl-studio-client/src/client/workbench/SoftwareArtwork.tsx");
  const icon = `https://raw.githubusercontent.com/owner/app/${"a".repeat(40)}/plugins/app/assets/icon.png`;
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    { package_id: "local", catalog_origin: "opl", catalog_scope: "software", management_scope: "opl_packages", deployment_target: "local", icon_url: icon, icon_ref: "assets/icon.svg", installed: true },
    { package_id: "connector", catalog_origin: "opl", catalog_scope: "dependency", management_scope: "opl_packages", installed: true },
    { package_id: "remote", catalog_origin: "opl", management_scope: "deployment_target", deployment_target: "mobile", installed: true }
  ] } } } });
  assert.deepEqual(softwareCatalogPackages(model, "opl").map(item => item.packageId), ["local"]);
  assert.deepEqual(softwareCatalogPackages(model, "components").map(item => item.packageId), ["connector"]);
  assert.equal(model.packageLifecycle.find(item => item.packageId === "local")?.iconUrl, icon);
  assert.equal(model.packageLifecycle[0]?.managementScope, "opl_packages");
  assert.equal(model.packageLifecycle[0]?.deploymentTarget, "local");
  assert.equal(publicSoftwareIconUrl(icon), icon);
  for (const value of [icon.replace("a".repeat(40), "main"), icon.replace("raw.githubusercontent.com", "example.com"), icon + "?token=secret", "file:///private/icon.png", icon.replace(/\.png$/, ".svg")]) assert.equal(publicSoftwareIconUrl(value), undefined);
  assert.equal(publicSoftwareIconUrl(icon, true), undefined);
  const runtime = readManagedUpdateProjection({ managed_update: { components: [{ component_id: "opl_base", current: { dependency_catalog: { dependencies: [{ dependency_id: "python", dependency_kind: "runtime_tool", installed: true, binary_path: "/managed/python", version: "3.13", credential: "must-not-cross" }] } } }] } })!;
  assert.doesNotMatch(JSON.stringify(runtime), /must-not-cross/);
  assert.deepEqual(runtime.components[0]?.runtimeDependencies?.map((d) => ({ dependencyId: d.dependencyId, installed: d.installed, binaryPath: d.binaryPath, version: d.version })), [{ dependencyId: "python", installed: true, binaryPath: "/managed/python", version: "3.13" }]);
});

test("App visibility preserves native installation and callable package metadata", async () => {
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: {
    directory: { entries: [{ package_id: "private-phone", app_enabled: false, installed: true, activated: true,
      package_role: "capability_package", display_name: "Private phone", presence: { callable: true } },
      { package_id: "new-extension", installed: true, release_channel: "preview",
        installability: { installable: false, reason: "package_install_source_unavailable" } }] }
  } } });
  const hidden = model.packageLifecycle.find((item) => item.packageId === "private-phone")!;
  assert.equal(hidden.appEnabled, false);
  assert.equal(hidden.installed, true);
  assert.equal(hidden.activated, true);
  assert.equal(hidden.readiness.callable, true);
  assert.equal(model.packageLifecycle.find((item) => item.packageId === "new-extension")?.appEnabled, true);
  assert.equal(hidden.releaseChannel, undefined);
  const preview = model.packageLifecycle.find((item) => item.packageId === "new-extension")!;
  assert.equal(preview.releaseChannel, "preview");
  assert.equal(preview.installable, false);
  assert.equal(preview.installabilityReason, "package_install_source_unavailable");
});

test("registry access stays owner projected and unavailable actions remain unavailable", () => {
  const model = deriveWorkbenchModelFromState({ app_state: {
    actions: [{ action_id: "agent_package_update", label: "Update", route: "opl app action execute", payload_fields: ["package_id"] }],
    agent_packages: { directory: { entries: [{ package_id: "private-agent", installed: true,
      package_access: { visibility: "authorized_only", status: "revoked", provider_id: "github",
        source_ref: "ghcr.io/example/private-agent", access_policy_ref: "package:private-agent:read",
        verified_at: "2026-11-10T03:00:00Z", security_revision: "r2", discover_allowed: true, download_allowed: false },
      installability: { installable: false, reason: "package_access_revoked" }, available_actions: [{ action_id: "agent_package_update",
        action_ref: "app_state.actions#agent_package_update", semantic: "update", status: "unavailable", reason: "package_access_revoked" }] }] } }
  } });
  const item = model.packageLifecycle[0]!;
  assert.equal(item.access?.visibility, "authorized_only");
  assert.equal(item.access?.status, "revoked");
  assert.equal(item.access?.providerId, "github");
  assert.equal(item.access?.downloadAllowed, false);
  assert.equal(item.access?.securityRevision, "r2");
  assert.equal(item.installable, false);
  assert.equal(item.installabilityReason, "package_access_revoked");
  assert.equal(item.actions[0]?.status, "unavailable");
  assert.equal(item.actions[0]?.reason, "package_access_revoked");
  assert.match(item.searchMetadata.query, /revoked/);
});

test("software sources project public and authorized entries without exposing credential values", () => {
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { sources: {
    surface_kind: "opl_software_sources_projection.v1",
    status: "attention_required",
    authority_boundary: { owner: "opl_framework", credential_values_exposed: false },
    entries: [
      { source_id: "homebrew", display_name: "Retired tap", source_kind: "tap", native_items: [{ name: "retired" }], available_actions: [{ action_id: "source_setup" }] },
      { source_id: "public-registry:opl", display_name: "OPL Software Catalog", provider_id: "opl_catalog", status: "ready", enabled: true,
        available_actions: [{ action_id: "source_refresh", payload_fields: ["source_id"] }, { action_id: "source_check" }] },
      { source_id: "github-packages:example", display_name: "GitHub Packages", source_kind: "registry", source_ref: "ghcr.io/gaofeng21cn/one-person-lab-packages", visibility: "authorized_only", provider_id: "github_packages", status: "signed_out", enabled: true, credential_handle_present: false,
        available_actions: [{ action_id: "source_configure", label: "Configure", payload_fields: ["source_id", "provider_id", "credential_handle"], default_payload: { provider_id: "github_packages", credential_handle: "provider:github_packages:gh-cli", token: "should-not-cross" }, status: "available" }, { action_id: "source_check", label: "Check", payload_fields: ["source_id"], status: "available" }] }
    ]
  } } } });
  assert.deepEqual(model.softwareSources?.entries.map(source => source.sourceId), ["public-registry:opl", "github-packages:example"]);
  const catalog = model.softwareSources?.entries[0];
  assert.equal(catalog?.status, "ready");
  assert.deepEqual(catalog?.availableActions.map(action => [action.actionId, action.payload]), [["source_refresh", { source_id: "public-registry:opl" }]]);
  assert.doesNotMatch(JSON.stringify(model.softwareSources), /retired|source_setup|native_items/);
  const privateSource = model.softwareSources?.entries.find((entry) => entry.sourceId === "github-packages:example")!;
  assert.equal(privateSource.status, "signed_out");
  assert.equal(privateSource.credentialHandlePresent, false);
  assert.equal(privateSource.availableActions[0]?.payload.credential_handle, "provider:github_packages:gh-cli");
  assert.equal("token" in privateSource.availableActions[0]!.payload, false);
  assert.equal(model.softwareSources?.authorityBoundary?.credentialValuesExposed, false);
});

test("owner-requested access refresh checks a source once without granting software access", async () => {
  const { readSoftwareSourcesProjection, pendingSoftwareSourceAccessCheck } = await import("../../plugins/core/opl-studio-client/src/client/workbench/softwareSources.ts");
  const projection = readSoftwareSourcesProjection({
    surface_kind: "opl_software_sources_projection.v1", status: "available", entries: [{
      source_id: "private-source", display_name: "Authorized software", source_kind: "registry", visibility: "authorized_only",
      status: "authorized", enabled: true, credential_handle_present: true, access_refresh_required: true,
      available_actions: [{ action_id: "source_check", label: "Check", payload_fields: ["source_id"], confirmation_required: false }]
    }]
  })!;
  const source = projection.entries[0]!;
  assert.equal(source.accessRefreshRequired, true);
  assert.deepEqual(pendingSoftwareSourceAccessCheck(projection, new Set())?.action.payload, { source_id: "private-source" });
  assert.equal(pendingSoftwareSourceAccessCheck(projection, new Set([source.sourceId])), undefined);
  for (const patch of [{ accessRefreshRequired: false }, { enabled: false }, { credentialHandlePresent: false },
    { availableActions: [] }, { availableActions: [{ ...source.availableActions[0]!, confirmationRequired: true }] },
    { availableActions: [{ ...source.availableActions[0]!, status: "unavailable" as const }] },
    { availableActions: [{ ...source.availableActions[0]!, payload: { source_id: "another-source" } }] }]) {
    assert.equal(pendingSoftwareSourceAccessCheck({ ...projection, entries: [{ ...source, ...patch }] }, new Set()), undefined);
  }
});

test("current Package directory entries replace retired private lifecycle fields", () => {
  const model = deriveWorkbenchModelFromState({
    app_state: {
      actions: [
        {
          action_id: "agent_package_update",
          label: "Update package",
          route: "opl app action execute --action agent_package_update",
          payload_fields: ["package_id"],
          mutates: "opl_packages",
          dry_run_supported: true
        },
        {
          action_id: "agent_package_install",
          label: "Install package",
          route: "opl app action execute --action agent_package_install",
          payload_fields: ["package_id"],
          mutates: "opl_packages",
          dry_run_supported: true
        },
        {
          action_id: "agent_package_preferences_set",
          label: "Set package preferences",
          route: "opl app action execute --action agent_package_preferences_set",
          payload_fields: ["package_id", "exposure_action", "shortcut_id", "visible", "sort_order"],
          mutates: "opl_agent_package_preferences",
          dry_run_supported: true,
          confirmation_required: false
        },
        {
          action_id: "future_agent_prepare",
          label: "Prepare future agent",
          route: "opl app action execute --action future_agent_prepare",
          payload_fields: ["package_id"],
          mutates: "none",
          dry_run_supported: true,
          confirmation_required: false
        }
      ],
      agent_packages: {
        directory: {
          status: "current",
          entry_count: 1,
          installed_package_count: 1,
          entries: [
            {
              package_id: "future.agent",
              display_name: "Future Agent",
              display_name_i18n: { "zh-CN": "未来智能体", "en-US": "Future Agent" },
              description: "A future owner-projected agent.",
              description_i18n: { "zh-CN": "由未来 owner 投影的智能体。", "en-US": "A future owner-projected agent." },
              session_routing_summary_i18n: { "zh-CN": "交给未来智能体", "en-US": "Route to Future Agent" },
              publisher: "Owner",
              package_role: "standard_agent",
              capability_metadata: {
                source: "normalized_owner_manifest",
                required_skill_ids: ["future-agent"],
                optional_skill_refs: ["future-agent:optional"]
              },
              readiness: {
                status: "verification_deferred",
                operational_ready: true,
                launch_allowed: true,
                verification_deferred: true,
                reason: "live_verification_deferred",
                detail_surface: "opl packages status --package-id future.agent --json"
              },
              package_currentness: "update_available",
              required_by_package_ids: ["future.workflow"],
              home_shortcuts: [
                {
                  shortcut_id: "research",
                  label_i18n: { "zh-CN": "开展未来工作", "en-US": "Start future work" },
                  default_visible: true,
                  user_configurable: true,
                  route: {
                    route_kind: "agent_package_shortcut",
                    executor: "codex_cli",
                    codex_visible_entry: "future-agent"
                  }
                }
              ],
              installed_readiness: {
                installed: true,
                physical_status: "available",
                callability: "callable"
              },
              source_explanation: {
                kind: "installed_codex_plugin_descriptor",
                source: "installed_descriptor",
                version_source_ref: "private://source-explanation",
                effective_source_policy: {
                  effective_install_update_source: "package_channel",
                  package_channel_auto_update: true
                }
              },
              manifest_url: "file:///private/manifest",
              source: "/private/source",
              repo_url: "/private/repo",
              installed_carrier_readback: {
                kind: "codex_plugin_manager",
                identity: "future-agent@example",
                lifecycle_authority: "carrier_owned"
              },
              available_actions: [
                {
                  action_id: "agent_package_update",
                  action_ref: "app_state.actions#agent_package_update",
                  semantic: "update",
                  payload: { package_id: "future.agent" },
                  required_payload_fields: ["package_id"],
                  confirmation_required: true
                },
                {
                  action_id: "agent_package_preferences_set",
                  action_ref: "app_state.actions#agent_package_preferences_set",
                  semantic: "preferences",
                  payload: { package_id: "future.agent" },
                  required_payload_fields: ["package_id", "exposure_action or shortcut_id"],
                  confirmation_required: false
                },
                {
                  action_id: "future_agent_prepare",
                  action_ref: "app_state.actions#future_agent_prepare",
                  semantic: "prepare",
                  surface: "composer",
                  payload: { package_id: "future.agent" },
                  required_payload_fields: ["package_id"],
                  confirmation_required: false
                }
              ],
              lifecycle_receipts: [{ receipt_ref: "private://receipt" }],
              package_lock_ref: "private://lock",
              rollback_ref: "private://rollback",
              files: {
                package_lock_file: "private://lock-file",
                lifecycle_ledger_file: "private://ledger"
              }
            }
          ]
        },
        status_index: {
          packages: {
            "future.agent": {
              package_id: "future.agent",
              status: "available",
              readiness: {
                status: "status_index_must_not_override_directory"
              },
              presence: {
                registered: true,
                installed: true,
                present: true,
                callable: true,
                status: "present"
              },
              capability_exposure: {
                status: "visible",
                codex_visible: true
              },
              dependency_readiness: {
                status: "ready",
                required_count: 1,
                present_count: 1,
                callable_count: 1,
                checks: [{
                  package_id: "future.scholar-skills",
                  required: true,
                  present: true,
                  callable: true,
                  status: "callable",
                  reasons: []
                }]
              },
              actions: {
                available: ["update"],
                recommended: null
              }
            }
          },
          home_shortcut_preferences: [
            { package_id: "future.agent", shortcut_id: "research", visible: true, sort_order: 10 },
            { package_id: "future.agent", shortcut_id: "review", visible: false, sort_order: 20 }
          ]
        }
      }
    }
  });

  assert.equal(model.packageLifecycle.length, 1);
  const item = model.packageLifecycle[0];
  assert.equal(item.packageId, "future.agent");
  assert.equal(item.label, "Future Agent");
  assert.equal(item.publisher, "Owner");
  assert.equal(item.packageRole, "standard_agent");
  assert.equal(item.roleGroup, "other");
  assert.equal(item.official, false);
  assert.deepEqual(item.displayNameI18n, { zh: "未来智能体", en: "Future Agent" });
  assert.deepEqual(item.descriptionI18n, { zh: "由未来 owner 投影的智能体。", en: "A future owner-projected agent." });
  assert.deepEqual(item.requiredSkillIds, ["future-agent"]);
  assert.deepEqual(item.optionalSkillRefs, ["future-agent:optional"]);
  assert.equal(item.readiness.status, "verification_deferred");
  assert.equal(item.readiness.launchAllowed, true);
  assert.equal(item.readiness.selectionStatus, "available");
  assert.equal(item.readiness.selectable, true);
  assert.equal(item.searchMetadata.tags.includes("required_skill:future-agent"), true);
  assert.equal(item.statusAxes.find((axis) => axis.label === "Codex surface")?.value, "visible");
  assert.equal(item.details.find((detail) => detail.label === "Physical surface")?.value, "available");
  assert.equal(item.sourceMode, "package_channel");
  assert.equal(item.automaticUpdate, true);
  assert.equal(item.currentness, "update_available");
  assert.deepEqual(item.requiredByPackageIds, ["future.workflow"]);
  assert.deepEqual(item.homeShortcuts, [
    {
      shortcutId: "research",
      labelI18n: { zh: "开展未来工作", en: "Start future work" },
      defaultVisible: true,
      userConfigurable: true,
      visible: true,
      sortOrder: 10,
      route: {
        routeKind: "agent_package_shortcut",
        executor: "codex_cli",
        codexVisibleEntry: "future-agent"
      }
    },
    {
      shortcutId: "review",
      labelI18n: {},
      defaultVisible: null,
      userConfigurable: null,
      visible: false,
      sortOrder: 20
    }
  ]);
  assert.equal(item.actions.length, 3);
  assert.equal(item.actions[0]?.kind, "update");
  assert.equal(item.actions[0]?.status, "available");
  assert.deepEqual(item.actions[0]?.payload, { package_id: "future.agent" });
  assert.deepEqual(item.actions[0]?.requiredPayloadFields, ["package_id"]);
  assert.equal(item.actions[0]?.confirmationRequired, true);
  assert.equal(item.actions[1]?.kind, "preferences");
  assert.equal(item.actions[1]?.status, "available");
  assert.equal(item.actions[2]?.kind, "other");
  assert.equal(item.actions[2]?.semantic, "prepare");
  assert.equal(item.actions[2]?.surface, "composer");
  assert.deepEqual(item.dependencies, [{
    packageId: "future.scholar-skills",
    required: true,
    present: true,
    callable: true,
    status: "callable",
    reasons: []
  }]);
  assert.equal(item.actions[2]?.status, "available");
  assert.equal(item.refs.find((ref) => ref.label === "Source")?.ref, "future-agent@example");
  assert.equal(item.refs.some((ref) => ref.label === "Manifest"), false);

  const serialized = JSON.stringify(item);
  for (const retired of [
    "private://source-explanation",
    "file:///private/manifest",
    "/private/source",
    "/private/repo",
    "private://receipt",
    "private://lock",
    "private://rollback",
    "private://lock-file",
    "private://ledger"
  ]) {
    assert.equal(serialized.includes(retired), false, `retired private field leaked: ${retired}`);
  }

  const selection = agentPackageSelectionIntent(item);
  assert.deepEqual(selection, {
    kind: "agent_package_selection",
    selectionId: "agent-package:future.agent",
    packageId: "future.agent",
    label: "Future Agent",
    description: "A future owner-projected agent.",
    publisher: "Owner",
    displayNameI18n: { zh: "未来智能体", en: "Future Agent" },
    descriptionI18n: { zh: "由未来 owner 投影的智能体。", en: "A future owner-projected agent." },
    sessionRoutingSummaryI18n: { zh: "交给未来智能体", en: "Route to Future Agent" },
    requiredSkillIds: ["future-agent"],
    optionalSkillRefs: ["future-agent:optional"],
    readiness: item.readiness,
    route: {
      shortcutId: "research",
      routeKind: "agent_package_shortcut",
      executor: "codex_cli",
      codexVisibleEntry: "future-agent"
    },
    actions: item.actions,
    sourceRef: item.sourceRef
  });
  assert.equal(JSON.stringify(selection).includes("agent_package_activate"), false);
});

test("package projection keeps the complete dynamic catalog and separates OPL roles", () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    package_id: `package-${index}`,
    display_name: `Package ${index}`,
    publisher: index < 9 ? "one-person-lab" : "OpenAI",
    catalog_origin: index < 9 ? "opl" : "external",
    package_role: index < 5 ? "standard_agent" : index < 7 ? "capability_package" : index === 7 ? "workflow_profile" : "standard_agent",
    source_explanation: { kind: "first_party_framework_projection" },
    installed: true,
    activated: true,
    readiness: { status: "ready" },
    package_currentness: "unknown",
    available_actions: []
  }));
  const model = deriveWorkbenchModelFromState({
    app_state: {
      agent_packages: {
        directory: { status: "available", entry_count: entries.length, entries },
        status_index: { packages: {} }
      }
    }
  });

  assert.equal(model.packageLifecycle.length, 12);
  assert.equal(model.packageLifecycle.filter((item) => item.official && item.roleGroup === "agent").length, 6);
  assert.equal(model.packageLifecycle.filter((item) => item.packageRole === "standard_agent").length, 9);
  assert.equal(model.packageLifecycle.filter((item) => item.roleGroup === "supporting").length, 2);
  assert.equal(model.packageLifecycle.filter((item) => item.roleGroup === "workflow").length, 1);
  assert.equal(model.packageLifecycle.filter((item) => item.roleGroup === "other").length, 3);
});

test("package projection derives OPL membership from owner provenance", () => {
  const model = deriveWorkbenchModelFromState({
    app_state: {
      agent_packages: {
        directory: {
          entries: [
            { package_id: "mas", publisher: "one-person-lab", catalog_origin: "opl", package_role: "standard_agent", installed: true, activated: true, readiness: { status: "ready", callable: true, launch_allowed: true } },
            { package_id: "weixin", publisher: "one-person-lab", catalog_origin: "opl", package_role: "capability_package", installed: true, activated: true, readiness: { status: "ready", callable: true, launch_allowed: true } }
          ]
        },
        status_index: { packages: {} }
      }
    }
  });
  const standard = model.packageLifecycle.find((item) => item.packageId === "mas");
  const capability = model.packageLifecycle.find((item) => item.packageId === "weixin");
  assert.equal(standard?.official, true);
  assert.equal(capability?.official, true);
  assert.equal(standard?.roleGroup, "agent");
  assert.equal(capability?.roleGroup, "supporting");
});

test("maintenance provenance separates OPL software, external extensions and unknown origin without trusting names", async () => {
  const entries = [
    { package_id: "travel-passport", publisher: "gaofeng21cn", catalog_origin: "opl", origin_basis: "owner_manifest", catalog_scope: "software",
      catalog_source: { manager: "codex_plugin_manager", marketplace_id: "journey-atlas", delivery: "local", token: "must-not-cross" } },
    { package_id: "pdf@openai-primary-runtime", publisher: "OpenAI", catalog_origin: "external", origin_basis: "native_carrier", catalog_scope: "software",
      catalog_source: { manager: "codex_plugin_manager", marketplace_id: "openai-primary-runtime", delivery: "host_bundled" } },
    { package_id: "opl-looking-name", publisher: "one-person-lab", official: true },
    { package_id: "malformed", catalog_origin: "future", origin_basis: "future", catalog_source: { manager: { token: "must-not-cross" }, delivery: "future" } }
  ];
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries } } } });
  assert.doesNotMatch(JSON.stringify(model), /must-not-cross/);
  const [journey, pdf, unclassified, malformed] = model.packageLifecycle;
  assert.equal(journey.catalogOrigin, "opl");
  assert.equal(journey.originBasis, "owner_manifest");
  assert.equal(journey.official, true);
  assert.deepEqual(journey.catalogSource, { manager: "codex_plugin_manager", marketplaceId: "journey-atlas", delivery: "local" });
  assert.equal(pdf.catalogOrigin, "external");
  assert.equal(pdf.catalogScope, "software");
  assert.equal(pdf.catalogSource?.delivery, "host_bundled");
  assert.match(pdf.searchMetadata.query, /codex_plugin_manager/);
  assert.equal(pdf.official, false);
  assert.equal(unclassified.catalogOrigin, "unknown");
  assert.equal(unclassified.official, false);
  assert.equal(malformed.catalogOrigin, "unknown");
  assert.equal(malformed.originBasis, "unknown");
  assert.deepEqual(malformed.catalogSource, { manager: "unknown", delivery: "unknown" });
});

test("selection availability fails open for unknown diagnostics and blocks explicit owner rejection", () => {
  const model = deriveWorkbenchModelFromState({
    app_state: {
      agent_packages: {
        directory: {
          entries: [
            { package_id: "future.checking", package_role: "standard_agent", installed: true },
            { package_id: "future.missing", package_role: "standard_agent", installed: false },
            {
              package_id: "future.launch-blocked",
              package_role: "standard_agent",
              installed: true,
              readiness: { operational_ready: true, launch_allowed: false }
            },
            {
              package_id: "future.not-ready",
              package_role: "standard_agent",
              installed: true,
              readiness: { operational_ready: false, launch_allowed: true }
            }
          ]
        },
        status_index: {
          packages: {
            "future.missing": {
              package_id: "future.missing",
              presence: { present: false, callable: false }
            },
            "future.launch-blocked": {
              package_id: "future.launch-blocked",
              presence: { present: true, callable: true }
            },
            "future.not-ready": {
              package_id: "future.not-ready",
              presence: { present: true, callable: true }
            }
          }
        }
      }
    }
  });

  const checking = model.packageLifecycle.find((item) => item.packageId === "future.checking");
  const missing = model.packageLifecycle.find((item) => item.packageId === "future.missing");
  const launchBlocked = model.packageLifecycle.find((item) => item.packageId === "future.launch-blocked");
  const notReady = model.packageLifecycle.find((item) => item.packageId === "future.not-ready");
  assert.equal(checking?.packageRole, "standard_agent");
  assert.equal(checking?.readiness.selectionStatus, "checking");
  assert.equal(checking?.readiness.selectable, true);
  assert.equal(missing?.readiness.selectionStatus, "unavailable");
  assert.equal(missing?.readiness.selectable, false);
  assert.equal(launchBlocked?.readiness.launchAllowed, false);
  assert.equal(launchBlocked?.readiness.selectionStatus, "unavailable");
  assert.equal(launchBlocked?.readiness.selectable, false);
  assert.equal(notReady?.readiness.operationalReady, false);
  assert.equal(notReady?.readiness.selectionStatus, "unavailable");
  assert.equal(notReady?.readiness.selectable, false);
});


test("package version prefers installed identity over the available release", () => {
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: [
    { package_id: "native-package", installed: true, installed_version: "1.2", selected_version: "1.3" },
    { package_id: "available-package", installed: false, selected_version: "2.1" }
  ] } } } });
  assert.equal(model.packageLifecycle[0]?.version, "1.2");
  assert.equal(model.packageLifecycle[0]?.versionKind, "installed");
  assert.equal(model.packageLifecycle[0]?.installedVersion, "1.2");
  assert.equal(model.packageLifecycle[0]?.availableVersion, "1.3");
  assert.equal(model.packageLifecycle[1]?.version, "2.1");
  assert.equal(model.packageLifecycle[1]?.versionKind, "available");
  assert.equal(model.packageLifecycle[1]?.installedVersion, undefined);
  assert.equal(model.packageLifecycle[1]?.availableVersion, "2.1");
});
