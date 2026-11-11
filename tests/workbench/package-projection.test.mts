import assert from "node:assert/strict";
import test from "node:test";

import {
  agentPackageSelectionIntent,
  deriveWorkbenchModelFromState
} from "../../src/workbench/workbenchModel.ts";

test("App visibility preserves native installation and callable package metadata", async () => {
  const { compactPackageRows } = await import("../../src/host/opl-passthrough-parts/contributions-packages.mjs");
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: {
    directory: { entries: compactPackageRows([{ package_id: "private-phone", app_enabled: false, installed: true, activated: true,
      package_role: "capability_package", display_name: "Private phone", presence: { callable: true } },
      { package_id: "new-extension", installed: true, release_channel: "preview",
        installability: { installable: false, reason: "package_install_source_unavailable" } }]) }
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
      { source_id: "homebrew", display_name: "OPL Homebrew", source_kind: "tap", source_ref: "https://github.com/gaofeng21cn/homebrew-one-person-lab", visibility: "public", status: "public", enabled: true, entry_count: 6,
        available_actions: [{ action_id: "source_list", label: "List", payload_fields: [], status: "available" }] },
      { source_id: "github-packages", display_name: "GitHub Packages", source_kind: "registry", source_ref: "ghcr.io/gaofeng21cn/one-person-lab-packages", visibility: "authorized_only", provider_id: "github_packages", status: "signed_out", enabled: true, credential_handle_present: false,
        available_actions: [{ action_id: "source_configure", label: "Configure", payload_fields: ["source_id", "provider_id", "credential_handle"], default_payload: { provider_id: "github_packages", credential_handle: "provider:github_packages:gh-cli", token: "should-not-cross" }, status: "available" }, { action_id: "source_check", label: "Check", payload_fields: ["source_id"], status: "available" }] }
    ]
  } } } });
  assert.equal(model.softwareSources?.entries.length, 2);
  const privateSource = model.softwareSources?.entries.find((entry) => entry.sourceId === "github-packages")!;
  assert.equal(privateSource.status, "signed_out");
  assert.equal(privateSource.credentialHandlePresent, false);
  assert.equal(privateSource.availableActions[0]?.payload.credential_handle, "provider:github_packages:gh-cli");
  assert.equal("token" in privateSource.availableActions[0]!.payload, false);
  assert.equal(model.softwareSources?.authorityBoundary?.credentialValuesExposed, false);
});

test("native source inventory preserves unknown state and version-bound owner actions", async () => {
  const { compactSoftwareSources } = await import("../../src/host/opl-passthrough-parts/contributions-packages.mjs");
  const { readSoftwareSourcesProjection, nativeSoftwareInventory, nativeSoftwareMatches, softwareSourceStatusLabel } = await import("../../src/workbench/softwareSources.ts");
  const projection = readSoftwareSourcesProjection(compactSoftwareSources({
    surface_kind: "opl_software_sources_projection.v1", status: "available", entries: [{
      source_id: "homebrew", display_name: "OPL Homebrew", source_kind: "tap", status: "public", inventory_status: "available", version_authority: "homebrew_local_metadata", entry_count: 1,
      native_items: [{ item_id: "cask:opl-studio", name: "opl-studio", display_name: "OPL Studio", display_name_i18n: { "zh-CN": "OPL 应用宿主", "en-US": "OPL Studio", malformed: { token: "private-value" } }, description_i18n: { zh: "管理和运行智能体应用。", en: "Manage and run agent apps." }, kind: "cask", installed: true, installed_version: "1", available_version: "2", update_status: "available", revision: "r1", token: "private-value", available_actions: [
        { action_id: "source_update", status: "available", default_payload: { source_id: "homebrew", item_id: "cask:opl-studio", expected_revision: "r1", token: "private-value", shell: "untrusted" }, payload_fields: ["source_id", "item_id", "expected_revision"], confirmation_required: true }
      ] }]
    }, { source_id: "unread", display_name: "Unread", source_kind: "tap", status: "public", inventory_status: "not_checked", entry_count: null, native_items: [] }]
  }))!;
  const source = projection.entries[0]!;
  const item = source.nativeItems![0]!;
  assert.equal(item.displayName, "OPL Studio");
  assert.equal(item.name, "opl-studio");
  assert.deepEqual(item.displayNameI18n, { zh: "OPL 应用宿主", en: "OPL Studio" });
  assert.deepEqual(item.descriptionI18n, { zh: "管理和运行智能体应用。", en: "Manage and run agent apps." });
  assert.deepEqual(item.availableActions[0]!.payload, { source_id: "homebrew", item_id: "cask:opl-studio", expected_revision: "r1" });
  assert.doesNotMatch(JSON.stringify(projection), /private-value|untrusted/);
  assert.deepEqual(nativeSoftwareInventory(projection), { total: 1, installed: 1, installable: 0, updatesAvailable: 1, complete: false });
  assert.equal(projection.entries[1]!.entryCount, undefined);
  assert.equal(nativeSoftwareMatches(item, source, "studio", "update:update_available"), true);
  assert.equal(nativeSoftwareMatches(item, source, "应用宿主", "all"), true);
  assert.equal(nativeSoftwareMatches(item, source, "管理和运行", "all"), true);
  assert.equal(nativeSoftwareMatches(item, source, "cask:opl-studio", "all"), true);
  assert.equal(nativeSoftwareMatches(item, source, "studio", "not_installed"), false);
  assert.equal(softwareSourceStatusLabel({ ...source, status: "authorized" }, "zh"), "账户已连接");
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
              package_currentness: { status: "update_available" },
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
    package_currentness: { status: "unknown" },
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
  const { compactPackageRows } = await import("../../src/host/opl-passthrough-parts/contributions-packages.mjs");
  const entries = compactPackageRows([
    { package_id: "travel-passport", publisher: "gaofeng21cn", catalog_origin: "opl", origin_basis: "owner_manifest", catalog_scope: "software",
      catalog_source: { manager: "codex_plugin_manager", marketplace_id: "journey-atlas", delivery: "local", token: "must-not-cross" } },
    { package_id: "pdf@openai-primary-runtime", publisher: "OpenAI", catalog_origin: "external", origin_basis: "native_carrier", catalog_scope: "software",
      catalog_source: { manager: "codex_plugin_manager", marketplace_id: "openai-primary-runtime", delivery: "host_bundled" } },
    { package_id: "opl-looking-name", publisher: "one-person-lab", official: true },
    { package_id: "malformed", catalog_origin: "future", origin_basis: "future", catalog_source: { manager: { token: "must-not-cross" }, delivery: "future" } }
  ]);
  assert.doesNotMatch(JSON.stringify(entries), /must-not-cross/);
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries } } } });
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

test("native products preserve maintenance provenance separately from installation and distribution managers", async () => {
  const { compactSoftwareSources } = await import("../../src/host/opl-passthrough-parts/contributions-packages.mjs");
  const { readSoftwareSourcesProjection, nativeSoftwareProducts } = await import("../../src/workbench/softwareSources.ts");
  const raw = {
    surface_kind: "opl_software_sources_projection.v1",
    installed_products: [{ item_id: "managed:framework", product_id: "framework", name: "framework", kind: "managed_runtime", installed: true, installed_version: "0.3.12",
      catalog_origin: "opl", origin_basis: "owner_manifest", catalog_source: { manager: "opl_framework", delivery: "local" } }],
    entries: [{ source_id: "tap", display_name: "OPL Homebrew", source_kind: "tap", inventory_status: "available",
      catalog_origin: "opl", origin_basis: "owner_projection", catalog_source: { manager: "homebrew", delivery: "marketplace", token: "must-not-cross" },
      native_items: [{ item_id: "formula:opl", product_id: "framework", name: "opl", kind: "formula", installed: false, available_version: "0.3.11",
        catalog_origin: "opl", origin_basis: "owner_projection", catalog_source: { manager: "homebrew", delivery: "marketplace" } }] }]
  };
  const projection = readSoftwareSourcesProjection(compactSoftwareSources(raw))!;
  assert.doesNotMatch(JSON.stringify(projection), /must-not-cross/);
  assert.equal(projection.entries[0].catalogOrigin, "opl");
  assert.equal(projection.entries[0].catalogSource?.manager, "homebrew");
  const [product] = nativeSoftwareProducts(projection);
  assert.equal(product.item.catalogOrigin, "opl");
  assert.equal(product.item.catalogSource?.manager, "opl_framework");
  assert.equal(product.item.installedVersion, "0.3.12");
  assert.equal(product.item.availableVersion, "0.3.11");
  assert.equal(product.channels[0].item.catalogSource?.manager, "homebrew");
  const unknown = readSoftwareSourcesProjection({ surface_kind: "opl_software_sources_projection.v1", entries: [{ source_id: "one-person-lab", display_name: "OPL", source_kind: "tap" }] })!;
  assert.equal(unknown.entries[0].catalogOrigin, "unknown");
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


test("native product counts collapse distribution channels and retain actual installation authority", async () => {
  const { readSoftwareSourcesProjection, nativeSoftwareInventory, nativeSoftwareProducts, nativeCarrierInstalled } = await import("../../src/workbench/softwareSources.ts");
  const { compactSoftwareSources, compactPackageRows } = await import("../../src/host/opl-passthrough-parts/contributions-packages.mjs");
  const projection = readSoftwareSourcesProjection(compactSoftwareSources({ surface_kind: "opl_software_sources_projection.v1", entries: [{ source_id: "tap", display_name: "OPL Homebrew", source_kind: "tap", inventory_status: "available", native_items: [
    ...["app", "app-full", "app-nightly"].map(name => ({ item_id: `cask:${name}`, name, display_name: "OPL App", kind: "cask", product_id: "github:owner/app", installed: true, installed_version: "26.11.1091", homebrew_installed: false, homebrew_installed_version: null, installation_kind: "app_bundle", installation_owner: "application", available_version: "26.11.890", update_status: "unknown" })),
    { item_id: "formula:opl", name: "opl", display_name: "OPL Framework", kind: "formula", product_id: "github:owner/framework", installed: true, installed_version: "0.3.12", homebrew_installed: false, installation_kind: "managed_runtime", installation_owner: "opl_framework", owner_settings_route: "updates", available_version: "0.3.10", update_status: "unknown" }
  ] }] }))!;
  assert.deepEqual(nativeSoftwareInventory(projection), { total: 2, installed: 2, installable: 0, updatesAvailable: 0, complete: true });
  const products = nativeSoftwareProducts(projection);
  assert.equal(products[0].channels.length, 3);
  assert.equal(products[0].item.installedVersion, "26.11.1091");
  assert.equal(nativeCarrierInstalled(products[0].item), false);
  assert.equal(products[1].item.installationKind, "managed_runtime");
  assert.equal(products[1].item.ownerSettingsRoute, "updates");
  const rows = compactPackageRows([{ package_id: "device", catalog_scope: "software", distribution_channel: "source" }, { package_id: "browser", catalog_scope: "host_component" }]);
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: rows } } } });
  assert.equal(model.packageLifecycle[0].catalogScope, "software");
  assert.equal(model.packageLifecycle[0].distributionChannel, "source");
  assert.equal(model.packageLifecycle[1].catalogScope, "host_component");
});


test("owner-managed Framework remains visible without Homebrew and merges with its optional distribution channel", async () => {
  const { readSoftwareSourcesProjection, nativeSoftwareInventory, nativeSoftwareProducts } = await import("../../src/workbench/softwareSources.ts");
  const { compactSoftwareSources } = await import("../../src/host/opl-passthrough-parts/contributions-packages.mjs");
  const product = { product_id: "github:owner/framework", product_display_name: "OPL Framework", item_id: "managed:framework", name: "opl-framework", display_name: "OPL Framework", kind: "managed_runtime", installed: true, installed_version: "0.3.12", installation_kind: "managed_runtime", installation_owner: "opl_framework", owner_settings_route: "updates", installation_id: "runtime:/home/user/.opl/one-person-lab", location: "/home/user/.opl/one-person-lab", active: true, mode: "installed", token: "must-not-cross" };
  const raw = { surface_kind: "opl_software_sources_projection.v1", installed_products: [product], entries: [] };
  const projection = readSoftwareSourcesProjection(compactSoftwareSources(raw))!;
  const products = nativeSoftwareProducts(projection);
  assert.equal(products.length, 1);
  assert.equal(products[0].source, undefined);
  assert.equal(products[0].item.installedVersion, "0.3.12");
  assert.equal(products[0].channels.length, 0);
  assert.equal(nativeSoftwareInventory(projection).installed, 1);
  assert.doesNotMatch(JSON.stringify(projection), /must-not-cross/);
  const withTap = readSoftwareSourcesProjection(compactSoftwareSources({ ...raw, entries: [{ source_id: "tap", display_name: "OPL Homebrew", source_kind: "tap", inventory_status: "available", native_items: [{ ...product, item_id: "formula:opl", name: "opl", kind: "formula", installed: false, installed_version: null, homebrew_installed: false, available_version: "0.3.11" }] }] }))!;
  const merged = nativeSoftwareProducts(withTap);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].item.installed, true);
  assert.equal(merged[0].item.installedVersion, "0.3.12");
  assert.equal(merged[0].item.availableVersion, "0.3.11");
  assert.equal(merged[0].channels.length, 1);
  assert.equal(merged[0].installations.length, 1);
  assert.equal(merged[0].installations[0].location, "/home/user/.opl/one-person-lab");
  assert.equal(merged[0].installations[0].version, "0.3.12");
  assert.equal(merged[0].installations[0].active, true);
});

test("native display identities survive the host bridge without changing machine versions or channel selection", async () => {
  const { compactSoftwareSources } = await import("../../src/host/opl-passthrough-parts/contributions-packages.mjs");
  const { readSoftwareSourcesProjection, nativeSoftwareProducts, nativeInstalledDisplayVersion } = await import("../../src/workbench/softwareSources.ts");
  const { nativeCatalogAvailableVersion, nativeCatalogState } = await import("../../src/workbench/softwareCatalog.ts");
  const installed = {
    product_id: "github:owner/app", item_id: "installed:app", name: "app", kind: "cask", installed: true,
    installed_version: "26.11.1091", installed_display_version: "26.11.10", installed_build_kind: "local-development",
    installed_build_id: "local.src079635b92c5c", update_status: "unknown", token: "must-not-cross"
  };
  const channel = {
    product_id: installed.product_id, item_id: "cask:app", name: "app", kind: "cask", installed: true,
    installed_version: "26.11.1091", homebrew_installed: false, available_version: "26.11.991,26.11.9",
    available_display_version: "26.11.9", update_status: "unknown", available_actions: []
  };
  const raw = { surface_kind: "opl_software_sources_projection.v1", installed_products: [installed], entries: [{
    source_id: "tap", display_name: "OPL Homebrew", source_kind: "tap", inventory_status: "available", native_items: [channel]
  }] };
  const projection = readSoftwareSourcesProjection(compactSoftwareSources(raw))!;
  const product = nativeSoftwareProducts(projection)[0];
  assert.equal(nativeInstalledDisplayVersion(product.item), "26.11.10");
  assert.equal(product.item.installedVersion, "26.11.1091");
  assert.equal(product.item.installedBuildKind, "local-development");
  assert.equal(product.item.installedBuildId, "local.src079635b92c5c");
  assert.equal(product.item.availableVersion, "26.11.991,26.11.9");
  assert.equal(nativeCatalogAvailableVersion(product, "zh"), "26.11.9");
  assert.equal(nativeCatalogState(product.item), "installed");
  assert.deepEqual(product.item.availableActions, []);
  assert.doesNotMatch(JSON.stringify(projection), /must-not-cross/);
  raw.entries[0].native_items.push({ ...channel, item_id: "cask:app-full", name: "app-full", available_version: "26.11.992,26.11.9" });
  const multiple = nativeSoftwareProducts(readSoftwareSourcesProjection(compactSoftwareSources(raw))!)[0];
  assert.equal(nativeCatalogAvailableVersion(multiple, "zh"), undefined);
  const unknown = readSoftwareSourcesProjection(compactSoftwareSources({ ...raw, installed_products: [{ ...installed,
    installed_display_version: null, installed_build_kind: "guessed-development"
  }] }))!;
  assert.equal(nativeInstalledDisplayVersion(unknown.installedProducts![0]), "26.11.1091");
  assert.equal(unknown.installedProducts![0].installedBuildKind, undefined);
});

test("software installations preserve exact paths and active selection across the compact bridge", async () => {
  const { compactPackageRows } = await import("../../src/host/opl-passthrough-parts/contributions-packages.mjs");
  const { catalogInstalledVersion } = await import("../../src/workbench/softwareCatalog.ts");
  const release = { installation_id: "release", kind: "macos_bundle", mode: "installed", manager: "package_owner", version: "1.0", location: "/Applications/Example.app", active: true, entrypoint_verified: true, revision: "r1", private_token: "must-not-cross" };
  const development = { ...release, installation_id: "development", kind: "developer_checkout", mode: "development", version: "9.0", location: "/work/example", active: false };
  const installPayload = { package_id: "example", operation: "install", version: "1.1", expected_revision: "catalog-r2" };
  const entry = { package_id: "example", catalog_origin: "opl", catalog_scope: "software", installed: true, installed_version: "0.9", selected_version: "1.1", active_installation_id: "release", active_installation_status: "active", installations: [release, development], installation_actions: [{ action_id: "software_installation_execute", status: "available", payload: { ...installPayload, private_token: "must-not-cross" }, required_payload_fields: Object.keys(installPayload), confirmation_required: true }] };
  const compact = compactPackageRows([entry]);
  const item = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: compact } } } }).packageLifecycle[0];
  assert.equal(item.installations?.length, 2);
  assert.equal(item.installations?.[0].location, "/Applications/Example.app");
  assert.equal(item.installations?.[1].mode, "development");
  assert.equal(catalogInstalledVersion(item, "zh"), "1.0");
  assert.equal(item.availableVersion, "1.1");
  assert.deepEqual(item.installationActions?.[0].payload, installPayload);
  assert.deepEqual(item.installationActions?.[0].payloadFields, Object.keys(installPayload));
  assert.doesNotMatch(JSON.stringify(item), /must-not-cross/);
  assert.equal(catalogInstalledVersion({ ...item, activeInstallationStatus: "conflict", installations: [item.installations![0], { ...item.installations![1], active: true }] }, "zh"), "—");
  assert.equal(catalogInstalledVersion({ ...item, activeInstallationStatus: "unknown", activeInstallationId: undefined }, "zh"), "—");
});

test("recommended native release is owner-selected and never chosen from a newer development or Nightly version", async () => {
  const { compactSoftwareSources } = await import("../../src/host/opl-passthrough-parts/contributions-packages.mjs");
  const { readSoftwareSourcesProjection, nativeSoftwareProducts } = await import("../../src/workbench/softwareSources.ts");
  const { nativeCatalogAvailableVersion } = await import("../../src/workbench/softwareCatalog.ts");
  const base = { product_id: "app", kind: "cask", installed: false, available_actions: [] };
  const raw = { surface_kind: "opl_software_sources_projection.v1", entries: [{ source_id: "tap", display_name: "OPL Homebrew", source_kind: "tap", inventory_status: "available", native_items: [
    { ...base, item_id: "nightly", name: "app-nightly", available_version: "3.0-nightly", selected_for_product: false, release_channel: "nightly" },
    { ...base, item_id: "full", name: "app-full", available_version: "2.0", selected_for_product: false, release_channel: "stable", installation_variant: "full" },
    { ...base, item_id: "standard", name: "app", available_version: "2.0", selected_for_product: true, recommended_for_product: true, selection_basis: "publisher_default", release_channel: "stable", installation_variant: "standard" }
  ] }] };
  const product = nativeSoftwareProducts(readSoftwareSourcesProjection(compactSoftwareSources(raw))!)[0];
  assert.equal(product.item.itemId, "standard");
  assert.equal(product.item.releaseChannel, "stable");
  assert.equal(product.item.installationVariant, "standard");
  assert.equal(nativeCatalogAvailableVersion(product, "zh"), "2.0");
  assert.equal(product.installations.length, 0);
  const ambiguous = { ...raw, entries: [{ ...raw.entries[0], native_items: raw.entries[0].native_items.map(item => ({ ...item, selected_for_product: false })) }] };
  assert.equal(nativeCatalogAvailableVersion(nativeSoftwareProducts(readSoftwareSourcesProjection(compactSoftwareSources(ambiguous))!)[0], "zh"), undefined);
});
