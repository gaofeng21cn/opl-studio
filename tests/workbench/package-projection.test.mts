import assert from "node:assert/strict";
import test from "node:test";

import {
  agentPackageSelectionIntent,
  deriveWorkbenchModelFromState
} from "../../src/workbench/workbenchModel.ts";

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

test("package projection derives the OPL baseline when official is omitted", () => {
  const model = deriveWorkbenchModelFromState({
    app_state: {
      agent_packages: {
        directory: {
          entries: [
            { package_id: "mas", publisher: "one-person-lab", package_role: "standard_agent", installed: true, activated: true, readiness: { status: "ready", callable: true, launch_allowed: true } },
            { package_id: "weixin", publisher: "one-person-lab", package_role: "capability_package", installed: true, activated: true, readiness: { status: "ready", callable: true, launch_allowed: true } }
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
