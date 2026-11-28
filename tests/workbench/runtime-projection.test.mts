import { customModelAccessFixture } from "../../scripts/model-policy-fixture.ts";
import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveWorkbenchModelFromState,
  mergeManagedUpdateProjections,
  parseDomainDetailViewDescriptors,
  readManagedUpdateProjection
} from "../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel.ts";
import { createOplPassthrough } from "../../plugins/core/opl-framework-bridge/src/index.mjs";

test("runtime projection keeps component health, carriers, and only App-projected maintenance actions", () => {
  const model = deriveWorkbenchModelFromState({
    app_state: {
      actions: [
        {
          action_id: "settings_check_app_update",
          label: "Check App update",
          route: "opl app action execute --action settings_check_app_update",
          payload_fields: [],
          mutates: "none_read_only",
          dry_run_supported: true,
          confirmation_required: false
        },
        {
          action_id: "unrelated_action",
          label: "Unrelated",
          route: "opl app action execute --action unrelated_action",
          payload_fields: [],
          mutates: "none_read_only",
          dry_run_supported: true
        }
      ],
      settings_control_center: {
        app_settings_read_model: {
          local_environment: {
            app_update_action_id: "settings_check_app_update"
          }
        }
      },
      services: { runway: { status: "degraded", schedule_runner: { running: true, tick_interval_ms: 5000 } } },
      runtime_source_carriers: {
        summary: {
          default_carriers_count: 2,
          present_default_carriers_count: 2,
          healthy_default_carriers_count: 1
        },
        items: [
          { package_id: "mas", label: "Med Auto Science", source_present: true, source_health_status: "ready", git: { sync_status: "synced", dirty: false } },
          { package_id: "mag", label: "Med Auto Grant", source_present: true, source_health_status: "attention_needed", git: { sync_status: "behind", dirty: false } }
        ]
      }
    }
  });

  assert.deepEqual(model.runtimeOverview?.runway, { status: "degraded", scheduleRunner: { running: true, tickIntervalMs: 5000 } });
  assert.equal(model.runtimeOverview?.carriers.healthy, 1);
  assert.equal(model.runtimeOverview?.carriers.items[1]?.syncStatus, "behind");
  assert.deepEqual(model.runtimeOverview?.maintenanceActions.map((action) => action.actionId), [
    "settings_check_app_update"
  ]);
  assert.equal(model.runtimeOverview?.recommendedActionId, "settings_check_app_update");
});

test("work-item projection parses typed domain detail view locators without agent-specific branching", () => {
  const model = deriveWorkbenchModelFromState({
    app_state: {
      operator: {
        workbench: {
          work_item_projection_v2: {
            schema_version: "work-item-projection.v2",
            summary: {},
            agent_catalog: [{ agent_id: "other-agent", display_name: "Other Agent" }],
            project_catalog: [{ project_id: "project:one", agent_id: "other-agent", display_name: "Project" }],
            items: [{
              item_id: "project:one:study-one",
              identity: {
                agent_id: "other-agent",
                project_id: "project:one",
                project_display_name: "Project",
                work_item_id: "study-one",
                work_item_display_name: "Study one"
              },
              lifecycle: { primary_state: "active" },
              execution: { state: "idle" },
              domain_detail_views: [{
                item_id: "project:one:study-one",
                view_id: "research-roadmap",
                view_kind: "research-roadmap",
                title: "Research roadmap",
                schema_ref: "contracts/schemas/v2/mas-research-trajectory-snapshot-v2.schema.json",
                schema_version: "mas-research-trajectory-snapshot.v2",
                revision: 4,
                digest: "sha256:abc",
                availability: "unread"
              }, {
                item_id: "wrong-item",
                view_id: "unknown-view",
                view_kind: "future_view",
                availability: "available"
              }]
            }]
          }
        }
      }
    }
  });

  assert.deepEqual(model.workItemRuntime?.items[0]?.domainDetailViews, [{
    itemId: "project:one:study-one",
    viewId: "research-roadmap",
    viewKind: "research-roadmap",
    title: "Research roadmap",
    schemaRef: "contracts/schemas/v2/mas-research-trajectory-snapshot-v2.schema.json",
    schemaVersion: "mas-research-trajectory-snapshot.v2",
    revision: 4,
    digest: "sha256:abc",
    availability: "unread",
    valid: true
  }, {
    itemId: "wrong-item",
    viewId: "unknown-view",
    viewKind: "future_view",
    availability: "invalid",
    valid: false,
    invalidReason: "item_id_mismatch"
  }]);
  assert.equal(parseDomainDetailViewDescriptors(undefined, "project:one:study-one").length, 0);
});

test("work-item runtime projection preserves user status semantics and unknown telemetry", () => {
  const model = deriveWorkbenchModelFromState({
    app_state: {
      operator: {
        workbench: {
          work_item_projection_v2: {
            schema_version: "work-item-projection.v2",
            generated_at: "2026-08-16T08:58:46.549Z",
            summary: {
              agent_count: 1,
              project_count: 1,
              work_item_count: 2,
              archived_work_item_count: 1,
              running_count: 0,
              active_session_count: 0,
              user_attention_count: 1,
              system_attention_count: 0,
              telemetry_observed_count: 0,
              telemetry_missing_count: 2
            },
            agent_catalog: [{ agent_id: "mas", display_name: "Med Auto Science" }],
            project_catalog: [{ project_id: "project:one", agent_id: "mas", display_name: "Research", workspace_path: "/workspace/research" }],
            items: [{
              item_id: "project:one:study-one",
              identity: {
                agent_id: "mas",
                agent_display_name: "Med Auto Science",
                project_id: "project:one",
                project_display_name: "Research",
                workspace_path: "/workspace/research",
                work_item_id: "study-one",
                domain_work_item_id: "study-one",
                work_item_scope_id: "work-item:study-one",
                identity_state: "resolved",
                work_item_display_name: "Study one",
                work_item_kind: "study"
              },
              lifecycle: { primary_state: "paused", primary_state_label: "已暂停", primary_state_reason: "paused_until_new_direction" },
              visibility: { state: "visible" },
              execution: {
                state: "idle",
                attempt_id: "attempt:analysis:1",
                next_stage_id: "analysis",
                next_stage_display_name: "Analysis",
                quality_budget: { elapsed_ms: null, tokens_used: null }
              },
              session_activity: { state: "inactive", active_session_count: 0 },
              attention: { kind: "user", owner: "user" },
              telemetry: {
                state: "missing",
                current_stage: { state: "missing", total_tokens: null },
                cumulative: { state: "missing", total_tokens: null, missing_reason: "not_observed" }
              },
              action: { title: "等待明确后续方向", owner_display_name: "你", kind: "user_action",
                action_ref: "app_state.actions#runway_human_gate_resolve",
                action_payload: { stage_run_id: "stage-1", expected_revision: 2, notes: "not part of the binding" } },
              stage_map: [{
                stage_id: "analysis",
                display_name: "Analysis",
                display_names: { "zh-CN": "分析", "en-US": "Analysis" },
                state: "pending",
                elapsed_seconds: null,
                usage: null
              }]
            }, {
              item_id: "project:one:archived",
              identity: {
                agent_id: "mas",
                project_id: "project:one",
                work_item_id: "archived",
                work_item_display_name: "Archived study"
              },
              lifecycle: { primary_state: "stopped" },
              visibility: { state: "archived" },
              execution: { state: "idle" }
            }]
          }
        }
      }
    }
  });

  assert.deepEqual(model.workItemRuntime?.items[0]?.humanGate, { stageRunId: "stage-1", expectedRevision: 2 });
  assert.equal(model.workItemRuntime?.summary.telemetryMissingCount, 2);
  assert.equal(model.workItemRuntime?.items[0]?.statusLabel, "已暂停");
  assert.equal(model.workItemRuntime?.items[0]?.domainWorkItemId, "study-one");
  assert.equal(model.workItemRuntime?.items[0]?.workItemScopeId, "work-item:study-one");
  assert.equal(model.workItemRuntime?.items[0]?.identityState, "resolved");
  assert.equal(model.workItemRuntime?.projects[0]?.workspacePath, "/workspace/research");
  assert.equal(model.workItemRuntime?.items[0]?.workspacePath, "/workspace/research");
  assert.equal(model.workItemRuntime?.items[0]?.attemptId, "attempt:analysis:1");
  assert.equal(model.workItemRuntime?.items[0]?.nextStageName, "Analysis");
  assert.equal(model.workItemRuntime?.items[0]?.totalTokens, null);
  assert.equal(model.workItemRuntime?.items[0]?.stages[0]?.displayNameI18n.zh, "分析");
  assert.equal(model.workItemRuntime?.items[1]?.archived, true);
});

test("settings projection does not infer storage refresh from the global action catalog", () => {
  const model = deriveWorkbenchModelFromState({
    app_state: {
      actions: [{
        action_id: "settings_diagnose_docker_webui",
        label: "Diagnose Docker WebUI",
        payload_fields: [],
        mutates: "none_read_only",
        dry_run_supported: true,
        confirmation_required: false
      }, {
        action_id: "settings_inventory_agent_package_store",
        label: "Refresh Agent Package storage inventory",
        payload_fields: [],
        mutates: "opl_storage_owner_inventory_snapshot_cache",
        dry_run_supported: true,
        confirmation_required: false
      }, {
        action_id: "settings_inventory_webui_data_volume",
        label: "Refresh WebUI data storage inventory",
        payload_fields: [],
        mutates: "opl_storage_owner_inventory_snapshot_cache",
        dry_run_supported: true,
        confirmation_required: false
      }],
      codex_personalization: {
        user_agents: {
          status: "available",
          content: "User instructions",
          path: "/Users/test/.codex/AGENTS.md",
          size_bytes: 17
        },
        opl_flow_default_user_agents: {
          status: "available",
          content: "OPL defaults",
          package_version: "0.1.0"
        }
      },
      core: {
        codex: {
          model_access_source: "codex_login"
        }
      },
      settings_control_center: {
        app_settings_read_model: {
          codex_model_policy: {
            provider_name: "OPL Gateway"
          },
          docker_webui: {
            ordinary_status: "action_available",
            runtime_proxy: { status: "diagnose_with_doctor" },
            ordinary_next_actions: [{
              action_id: "settings_diagnose_docker_webui",
              label: "Diagnose Docker WebUI",
              state: "ready",
              dry_run_route: "opl app action execute --action settings_diagnose_docker_webui --dry-run"
            }]
          },
          storage_lifecycle: {
            agent_package_store: {
              status: "unavailable",
              reason_code: "inventory_cache_missing_or_invalid",
              stale: true,
              owner_route: "/settings/agents",
              projected_action: { kind: "navigate", status: "available", route: "/settings/agents" }
            },
            webui_data_volume: {
              status: "unavailable",
              stale: true
            }
          }
        }
      }
    }
  });

  assert.equal(model.settingsProjection?.dockerWebui.actions[0]?.actionId, "settings_diagnose_docker_webui");
  assert.equal(model.settingsProjection?.dockerWebui.actions[0]?.mutates, "none_read_only");
  assert.equal(model.settingsProjection?.storage.agentPackageStore.reasonCode, "inventory_cache_missing_or_invalid");
  assert.equal(model.settingsProjection?.storage.agentPackageStore.projectedAction?.route, "/settings/agents");
  assert.equal(model.settingsProjection?.storage.agentPackageStore.inventoryAction, undefined);
  assert.equal(model.settingsProjection?.storage.webuiDataVolume.inventoryAction, undefined);
  assert.equal(model.settingsProjection?.personalization.userAgents?.content, "User instructions");
  assert.equal(model.settingsProjection?.personalization.oplFlowDefaultUserAgents?.packageVersion, "0.1.0");
  assert.equal(model.settingsProjection?.codex.providerName, "OPL Gateway");
  assert.equal(model.settingsProjection?.codex.modelAccessSource, "codex_login");
});

test("settings projection exposes storage refresh only when the storage owner projects it", () => {
  const model = deriveWorkbenchModelFromState({
    app_state: {
      actions: [{
        action_id: "settings_inventory_agent_package_store",
        label: "Refresh Agent Package storage inventory",
        payload_fields: [],
        mutates: "opl_storage_owner_inventory_snapshot_cache",
        dry_run_supported: true,
        confirmation_required: false
      }],
      settings_control_center: {
        app_settings_read_model: {
          storage_lifecycle: {
            agent_package_store: {
              status: "available",
              inventory_action_id: "settings_inventory_agent_package_store"
            }
          }
        }
      }
    }
  });

  assert.equal(
    model.settingsProjection?.storage.agentPackageStore.inventoryAction?.actionId,
    "settings_inventory_agent_package_store"
  );
});

test("settings projection aligns with Framework v2 core.codex, storage_lifecycle, status_summary, local_environment, and connections.authorization", () => {
  const model = deriveWorkbenchModelFromState({
    app_state: {
      core: {
        codex: {
          installed_version: null,
          selected_version: null,
          parsed_version: null,
          startup_ready: false,
          executable_status: "unavailable",
          runtime_root: "/tmp/opl/runtime",
          runtime_binary_path: null,
          managed_binary_path: "/tmp/opl/runtime/current/bin/codex"
        }
      },
      settings_control_center: {
        status_summary: {
          codex_version: null,
          model_access: "ready",
          runway: "running"
        },
        app_settings_read_model: {
          connections: {
            authorization: {
              connections: [{
                connection_id: "conn-1",
                name: "PubMed API",
                connection_type: "http_bearer",
                status: "connected"
              }]
            }
          },
          storage_lifecycle: {
            package_store: { path: "/tmp/opl/packages", size_bytes: 4096, file_count: 3, complete: true },
            package_cache: { path: "/tmp/opl/cache", size_bytes: 1024, file_count: 1, complete: true }
          },
          local_environment: {
            state_dir: "/tmp/opl/state",
            logs_dir: "/tmp/opl/state/logs",
            runtime_root: "/tmp/opl/runtime",
            packages_root: "/tmp/opl/state/packages"
          }
        }
      }
    }
  });

  assert.equal(model.settingsProjection?.codex.installed, false);
  assert.equal(model.settingsProjection?.codex.versionStatus, "unavailable");
  assert.equal(model.settingsProjection?.codex.binaryPath, "/tmp/opl/runtime/current/bin/codex");
  assert.equal(model.settingsProjection?.statusSummary.runtimeSourceHealth, "running");
  assert.equal(model.settingsProjection?.statusSummary.agentPackageHealth, "ready");
  assert.equal(model.settingsProjection?.localEnvironment.runtimeSourcesRoot, "/tmp/opl/runtime");
  assert.equal(model.settingsProjection?.storage.agentPackageStore.bytes, 4096);
  assert.equal(model.settingsProjection?.storage.agentPackageStore.status, "ready");
  assert.equal(model.settingsProjection?.storage.webuiDataVolume.bytes, 1024);
  assert.equal(model.settingsProjection?.externalConnections[0]?.id, "conn-1");
});

test("runtime projection hides bridge placeholders but keeps real active work", () => {
  const placeholder = deriveWorkbenchModelFromState({
    app_state: {
      active_project_lines: [{
        status: "candidate_preview_only",
        active_run_id: "placeholder-fast",
        next_visible_step: "Read runtime refs before execution"
      }]
    }
  });
  assert.deepEqual(placeholder.activeProjectLines, []);

  const real = deriveWorkbenchModelFromState({
    app_state: {
      active_project_lines: [{
        status: "running",
        active_run_id: "run-42",
        next_visible_step: "Validate the hypothesis",
        progress_delta_classification: "analysis",
        deliverable_progress_delta: "draft updated",
        next_forced_delta: "review"
      }]
    }
  });
  assert.equal(real.activeProjectLines[0]?.activeRunId, "run-42");
});

test("actions do not masquerade as files or results", () => {
  const model = deriveWorkbenchModelFromState({
    app_state: {
      actions: [{
        action_id: "workspace_ensure",
        label: "Ensure workspace",
        route: "opl app action execute --action workspace_ensure",
        dry_run_supported: true,
        payload_fields: []
      }]
    }
  });
  assert.deepEqual(model.artifactPreviews, []);
  assert.equal(model.contextActions[0]?.id, "workspace_ensure");
});

test("managed update action results preserve owner components across fresh actions", () => {
  const app = readManagedUpdateProjection({
    app_action_execution: {
      result: {
        managed_update: {
          operation: "check",
          update_channel: "stable",
          components: [{
            component_id: "opl_app",
            lifecycle_owner: "one-person-lab-app",
            label: "OPL App",
            state: "current",
            current: { installed_version: "1.2.0", latest_version: "1.2.0" },
            auto_apply: { mode: "native_host", eligible: false, app_background_safe: false }
          }]
        }
      }
    }
  });
  assert.ok(app);
  assert.deepEqual(app.components[0], {
    componentId: "opl_app",
    lifecycleOwner: "one-person-lab-app",
    label: "OPL App",
    state: "current",
    channel: "stable",
    installedVersion: "1.2.0",
    latestVersion: "1.2.0",
    autoApplyMode: "native_host",
    autoApplyEligible: false,
    backgroundSafe: false
  });

  const packages = readManagedUpdateProjection({
    result: {
      managed_update: {
        operation: "apply",
        components: [{
          component_id: "opl_packages",
          lifecycle_owner: "one-person-lab",
          label: "OPL Packages",
          state: "restart_needed",
          current: { installed_version: "cohort-4", latest_version: "cohort-5" },
          auto_apply: { mode: "eligible_native_packages", eligible: true, app_background_safe: true }
        }]
      }
    }
  });
  assert.ok(packages);
  const merged = mergeManagedUpdateProjections(app, packages);
  assert.deepEqual(merged.components.map((component) => component.componentId), ["opl_app", "opl_packages"]);
  assert.equal(merged.components[1]?.autoApplyEligible, true);
  assert.equal(merged.channel, "stable");
});

test("managed update reads fast-state currentness and runtime dependencies without legacy flowDependencies projection", () => {
  const projection = readManagedUpdateProjection({
    app_state: {
      managed_update: {
        operation: "status",
        update_channel: "stable",
        components: [{
          component_id: "opl_base",
          lifecycle_owner: "one-person-lab",
          label: "OPL Base",
          state: "current",
          channel: "stable",
          current: {
            installed_version: "0.125.0",
            latest_version: "0.125.0",
            currentness: "current",
            manual_guidance: null,
            dependency_catalog: {
              dependencies: [{
                dependency_id: "codex-cli",
                dependency_kind: "runtime_executor",
                installed: true,
                version: "0.42.0",
                latest_version: "0.42.0",
                currentness: "current",
                status: "ready",
                ownership: "opl_managed",
                update_policy: "silent_stage_verify",
                update_mode: "silent_managed",
                activation_policy: "app_restart_generation_switch",
                binary_path: "/opt/opl/codex"
              }, {
                dependency_id: "ffmpeg",
                dependency_kind: "external_cli",
                installed: true,
                version: "1.2.3",
                latest_version: "1.2.4",
                currentness: "update_available",
                status: "update_available",
                ownership: "homebrew",
                update_policy: "explicit_owner_delegated_after_confirmation",
                update_mode: "explicit_owner_delegated",
                activation_policy: "external_owner",
                binary_path: "/opt/homebrew/bin/ffmpeg",
                note: "确认后由外部安装器更新"
              }]
            }
          },
          auto_apply: { mode: "silent_managed", eligible: false, app_background_safe: true },
          plan: { summary: "No update required" }
        }]
      }
    }
  });

  assert.ok(projection);
  assert.equal(projection.components[0]?.currentness, "current");
  assert.equal(projection.components[0]?.runtimeDependencies?.find((dependency) => dependency.dependencyId === "codex-cli")?.updateMode, "silent_managed");
  assert.equal(projection.components[0]?.runtimeDependencies?.find((dependency) => dependency.dependencyId === "ffmpeg")?.updatePolicy, "explicit_owner_delegated_after_confirmation");
  assert.equal("flowDependencies" in (projection.components[0] ?? {}), false);
});

test("Framework fast managed-update output survives Host bridge and renderer parsing", async () => {
  Object.assign(globalThis, {
    __OPL_CODEX_MODEL_POLICY__: {
      source: "test App policy", defaultModel: "test-model", defaultReasoningEffort: "high", visibleModels: [{ id: "test-model" }], reasoningEfforts: ["high"],
      autoLabel: { zh: "自动（推荐）", en: "Auto (recommended)" }, knownModelReasoningEffortOverrides: {}, acceptUnknownCatalogDefault: true,
      customModelAccess: customModelAccessFixture, useHighestSupportedReasoningForUnknown: true
    }
  });
  const { normalizeStateReadback } = await import("../../plugins/core/opl-studio-client/src/client/bridge/oplBridge.ts");
  const compressed = normalizeStateReadback(await createOplPassthrough({
    client: {
      call: async () => ({
        app_state: {
          managed_update: {
        operation: "status",
        update_channel: "stable",
        components: [
          ["opl_app", "OPL App", "currentness_not_checked"],
          ["opl_base", "OPL Base", "current"],
          ["opl_packages", "OPL Packages", "current"]
        ].map(([componentId, label, state]) => ({
          component_id: componentId,
          lifecycle_owner: componentId === "opl_app" ? "one-person-lab-app" : "one-person-lab",
          label,
          state,
          channel: "stable",
          current: {
            installed_version: componentId === "opl_base" ? "0.125.0" : "1.0.0",
            latest_version: componentId === "opl_app" ? null : componentId === "opl_base" ? "0.125.0" : "cohort-1",
            currentness: componentId === "opl_app" ? "unknown" : "current",
            manual_guidance: null,
            ...(componentId === "opl_base" ? {
              dependency_catalog: {
                dependencies: [{
                  dependency_id: "codex-cli",
                  dependency_kind: "runtime_executor",
                  installed: true,
                  version: "0.42.0",
                  latest_version: "0.42.0",
                  currentness: "current",
                  status: "ready",
                  ownership: "opl_managed",
                  update_policy: "silent_stage_verify",
                  update_mode: "silent_managed",
                  activation_policy: "app_restart_generation_switch",
                  binary_path: "/opt/opl/codex"
                }]
              }
            } : {})
          },
          auto_apply: { mode: "prompt_only", eligible: false, app_background_safe: false },
          plan: { summary: "No update required" }
        }))
      }
    }
      }),
      on() {}, off() {}, close: async () => {}
    }
  }).readState("fast"), "fast");

  const projection = readManagedUpdateProjection(compressed);
  assert.ok(projection);
  assert.deepEqual(projection.components.map((component) => component.componentId), [
    "opl_app", "opl_base", "opl_packages"
  ]);
  assert.equal(projection.components.find((component) => component.componentId === "opl_app")?.currentness, "unknown");
  const oplBase = projection.components.find((component) => component.componentId === "opl_base");
  assert.equal(oplBase?.runtimeDependencies?.[0]?.dependencyId, "codex-cli");
  assert.equal(oplBase?.runtimeDependencies?.[0]?.currentness, "current");
  assert.equal("flowDependencies" in (oplBase ?? {}), false);
});

test("managed update projects installed Agent and capability package carrier states", () => {
  const projection = readManagedUpdateProjection({
    result: {
      managed_update: {
        operation: "status",
        components: [{
          component_id: "opl_packages",
          lifecycle_owner: "one-person-lab",
          label: "OPL Packages",
          state: "currentness_not_checked",
          current: {
            package_states: [{
              package_id: "mas",
              label: "Med Auto Science",
              state: "currentness_not_checked",
              background_update: { eligible: true },
              installed_owner_descriptor: {
                package_version: "0.4.0",
                source_path: "/opt/opl/packages/mas"
              },
              native_carrier: {
                kind: "codex_plugin_manager",
                identity: "mas@opl",
                status: "installed",
                readiness: { physical_status: "available", callability: "callable" }
              }
            }, {
              package_id: "third-party-agent",
              label: "Third Party Agent",
              state: "currentness_not_checked",
              background_update: { eligible: false, reason: "external_package_explicit_update_only" },
              installed_owner_descriptor: { package_version: "1.0.0" },
              native_carrier: { kind: "codex_plugin_manager", identity: "third-party@market", status: "installed" }
            }]
          },
          auto_apply: { mode: "projection_only", eligible: false, app_background_safe: false }
        }]
      }
    }
  });

  assert.ok(projection);
  assert.equal(projection.components[0]?.packageStates?.[0]?.packageId, "mas");
  assert.equal(projection.components[0]?.packageStates?.[0]?.updateMode, "silent_managed");
  assert.equal(projection.components[0]?.packageStates?.[1]?.updateMode, "unknown");
  assert.equal(projection.components[0]?.packageStates?.[1]?.backgroundUpdateReason, "external_package_explicit_update_only");
  assert.equal(projection.components[0]?.packageStates?.[0]?.carrierStatus, "installed");
});

test("browser bridge normalization preserves App-projected Runway health", async () => {
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
  const { normalizeCodexCapabilityCatalog, normalizeStateReadback } = await import("../../plugins/core/opl-studio-client/src/client/bridge/oplBridge.ts");
  const readback = normalizeStateReadback({
    profile: "fast",
    app_state: {
      app_state: {
        operator: {
          workbench: {
            work_item_projection_v2: {
              schema_version: "work-item-projection.v2",
              summary: { work_item_count: 1, telemetry_missing_count: 1 },
              agent_catalog: [{ agent_id: "mas", display_name: "Med Auto Science" }],
              project_catalog: [{ project_id: "project:one", agent_id: "mas", display_name: "Research" }],
              items: [{
                item_id: "project:one:study-one",
                identity: {
                  agent_id: "mas",
                  project_id: "project:one",
                  work_item_id: "study-one",
                  work_item_display_name: "Study one"
                },
                lifecycle: { primary_state: "paused" },
                visibility: { state: "visible" },
                execution: { state: "idle" }
              }]
            }
          }
        },
        services: { runway: { status: "degraded", schedule_runner: { running: true, tick_interval_ms: 5000 } } },
        managed_companions: [{
          surface_kind: "opl_managed_browser_automation_projection",
          provider_id: "playwright-mcp",
          product_name: "Browser Automation",
          available_actions: ["settings_reinstall_browser_automation"]
        }],
        actions: [{
          action_id: "settings_reinstall_browser_automation",
          label: "Reinstall Browser Automation",
          route: "opl app action execute --action settings_reinstall_browser_automation",
          surface: "opl app action execute",
          submit_via: "opl app action execute",
          payload_fields: [],
          mutates: "opl_managed_playwright_mcp_bundle_service_and_codex_mcp_registration",
          dry_run_supported: true,
          confirmation_required: true,
          danger_level: "medium",
          owner: "one-person-lab",
          delegated_surface: "OPL managed Browser Automation reinstall",
          can_submit_to_safe_action_shell: true,
          route_requires_domain_or_app_payload: false
        }]
      }
    },
    carrierDiagnostics: {
      schema: "opl_app_carrier_diagnostics.v1",
      owner: "one-person-lab-app_desktop_host",
      carrier: "electron_desktop",
      status: "available",
      application: { systemInfo: { logDir: "/tmp/opl-app-logs" } },
      setLogDirectorySupported: true
    }
  }, "fast");

  const model = deriveWorkbenchModelFromState(readback);
  assert.deepEqual(model.runtimeOverview?.runway, { status: "degraded", scheduleRunner: { running: true, tickIntervalMs: 5000 } });
  assert.equal(model.managedCompanions[0]?.providerId, "playwright-mcp");
  assert.equal(model.workItemRuntime?.items[0]?.title, "Study one");
  assert.deepEqual(readback.app_state.managed_companions.map((item) => item.provider_id), ["playwright-mcp"]);
  assert.deepEqual(readback.app_state.actions[0], {
    action_id: "settings_reinstall_browser_automation",
    label: "Reinstall Browser Automation",
    route: "opl app action execute --action settings_reinstall_browser_automation",
    surface: "opl app action execute",
    submit_via: "opl app action execute",
    payload_fields: [],
    mutates: "opl_managed_playwright_mcp_bundle_service_and_codex_mcp_registration",
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: "medium",
    owner: "one-person-lab",
    delegated_surface: "OPL managed Browser Automation reinstall",
    can_submit_to_safe_action_shell: true,
    route_requires_domain_or_app_payload: false
  });
  assert.deepEqual(readback.carrierDiagnostics, {
    schema: "opl_app_carrier_diagnostics.v1",
    owner: "one-person-lab-app_desktop_host",
    carrier: "electron_desktop",
    status: "available",
    application: { systemInfo: { logDir: "/tmp/opl-app-logs" } },
    setLogDirectorySupported: true
  });

  const capabilities = normalizeCodexCapabilityCatalog({
    skills: [
      { name: "MinerU", path: "/skills/mineru", enabled: true },
      { name: "MinerU", path: "/agents/mineru", enabled: true }
    ],
    plugins: [
      { id: "github", name: "GitHub", enabled: true, callable: true },
      { id: "github", name: "GitHub", enabled: true, callable: true }
    ],
    apps: []
  });
  assert.deepEqual(capabilities.skills.map((item) => item.name), ["MinerU"]);
  assert.deepEqual(capabilities.plugins.map((item) => item.id), ["github"]);
});

// The overview must preserve the distinction between task data and service health.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RuntimeStatusPanel } from "../../plugins/extensions/opl-runtime-status/src/client/RuntimeStatusPanel";
import { StageProgressStepper } from "../../plugins/extensions/opl-runtime-status/src/client/StageProgressStepper";
import { deriveServiceRecoveryModel, readRunwayHealth } from "../../plugins/core/opl-studio-client/src/client/workbench/serviceRecoveryModel";
import { runtimeOverviewFixture } from "../fixtures/runtime-overview";

function renderOverview(overrides: Record<string, unknown> = {}) {
  const model = runtimeOverviewFixture();
  return renderToStaticMarkup(createElement(RuntimeStatusPanel, {
    locale: "zh", projection: model.workItemRuntime, serviceRecovery: model.serviceRecovery,
    stateStatus: "ready", snapshotSource: "live", onRefresh() {}, onOpenMaintenance() {}, onOpenWorkItem() {}, ...overrides
  }));
}

test("overview reports a concrete service cause without degrading the task list or counting service issues as tasks", () => {
  const html = renderOverview();
  assert.match(html, /Runway 运行异常/);
  assert.match(html, /打开维护/);
  assert.doesNotMatch(html, /部分可用|整体状态|确认执行/);
  const summary = html.match(/<div class="runtime-list-summary">(.*?)<\/div>/)?.[1] ?? "";
  assert.match(summary, /2 项工作 · 运行中 1 · 需关注 1/);
  assert.doesNotMatch(summary, /99/);
});

test("unknown and cached service observations are neutral instead of confirmed failures", () => {
  const html = renderOverview({ serviceRecovery: deriveServiceRecoveryModel(readRunwayHealth(undefined, undefined)) });
  assert.match(html, /data-tone="unknown"/);
  assert.match(html, /Runway 状态待确认/);
  assert.doesNotMatch(html, /尚未就绪/);
  const cached = renderOverview({ stateStatus: "error", snapshotSource: "cached" });
  assert.match(cached, /上次服务检查/);
  assert.match(cached, /data-tone="unknown"/);
  assert.match(cached, /最新读取失败/);
});

test("initial loading and a failed read without a snapshot have distinct recovery states", () => {
  const loading = renderOverview({ projection: undefined, stateStatus: "loading", snapshotSource: "none" });
  assert.match(loading, /正在读取任务/);
  assert.doesNotMatch(loading, /当前范围没有工作|Runway 运行异常/);
  const failed = renderOverview({ projection: undefined, stateStatus: "error", snapshotSource: "none" });
  assert.match(failed, /重试/);
  assert.match(failed, /打开维护/);
  assert.doesNotMatch(failed, /当前范围没有工作|Runway 运行异常/);
});

test("work item projection preserves control generation, root, package status, heartbeat, action keys, and does not fall back to diagnostic stage", async () => {
  Object.assign(globalThis, {
    __OPL_CODEX_MODEL_POLICY__: {
      source: "test App policy", defaultModel: "test-model", defaultReasoningEffort: "high", visibleModels: [{ id: "test-model" }], reasoningEfforts: ["high"],
      autoLabel: { zh: "自动（推荐）", en: "Auto (recommended)" }, knownModelReasoningEffortOverrides: {}, acceptUnknownCatalogDefault: true,
      customModelAccess: customModelAccessFixture, useHighestSupportedReasoningForUnknown: true
    }
  });
  const { normalizeStateReadback } = await import("../../plugins/core/opl-studio-client/src/client/bridge/oplBridge.ts");
  const compacted = normalizeStateReadback(await createOplPassthrough({
    client: {
      call: async () => ({
        app_state: {
          operator: {
        workbench: {
          work_item_projection_v2: {
            schema_version: "work-item-projection.v2",
            summary: { work_item_count: 1, project_count: 1, agent_count: 1 },
            agent_catalog: [{ agent_id: "mas", display_name: "MAS" }],
            project_catalog: [
              { project_id: "mas:dm", agent_id: "mas", display_name: "DM", workspace_path: "/tmp/dm", binding_status: "active" },
              { project_id: "med-autocast:video", agent_id: "med-autocast", agent_display_name: "Med Auto Cast", display_name: "科普视频", workspace_path: "/tmp/cast", binding_status: "active" }
            ],
            items: [{
              item_id: "mas:dm::study-1",
              identity: {
                agent_id: "mas",
                agent_display_name: "MAS",
                project_id: "mas:dm",
                project_display_name: "DM",
                workspace_binding_id: "bind-1",
                workspace_path: "/tmp/dm",
                work_item_id: "study-1",
                work_item_root: "studies/study-1",
                work_item_display_name: "Study 1"
              },
              lifecycle: {
                primary_state: "delivered_auto_paused",
                primary_state_label: "已交付自动暂停",
                current_stage_id: null,
                package_status: "milestone_delivered"
              },
              visibility: {
                state: "visible",
                source: "operator_override",
                control_ref: "work_item_visibility_set",
                generation: 4
              },
              execution: {
                state: "idle",
                stage_id: "legacy_exec_stage",
                stage_status: "completed",
                current_stage_id: "diagnostic_stage",
                last_heartbeat_at: "2026-11-23T12:00:00Z",
                elapsed_ms: 42000
              },
              action: {
                title_key: "lifecycle.deliveredPaused.title",
                summary_key: "lifecycle.deliveredPaused.summary",
                message_args: { milestone: "manuscript" },
                owner_kind: "user"
              },
              stage_map: [
                { stage_id: "plan", display_name: "Plan", display_names: { zh: "研究设计", en: "Study design" }, state: "completed" },
                { stage_id: "manuscript", display_name: "Manuscript", display_names: { zh: "成稿撰写", en: "Manuscript" }, state: "delivered" },
                { stage_id: "future_tail", display_name: "Tail", display_names: { zh: "后续收尾", en: "Follow-up" }, state: "pending" }
              ]
            }]
          }
        }
      }
    }
      }),
      on() {}, off() {}, close: async () => {}
    }
  }).readState("fast"), "fast");

  const model = deriveWorkbenchModelFromState(compacted);
  const item = model.workItemRuntime?.items[0];
  assert.ok(item);
  assert.equal(item.workItemRoot, "studies/study-1");
  assert.equal(item.packageStatus, "milestone_delivered");
  assert.equal(item.visibilitySource, "operator_override");
  assert.equal(item.visibilityControlRef, "work_item_visibility_set");
  assert.equal(item.visibilityGeneration, 4);
  assert.equal(item.lastHeartbeatAt, "2026-11-23T12:00:00Z");
  assert.equal(item.elapsedMs, 42000);
  assert.equal(item.actionTitleKey, "lifecycle.deliveredPaused.title");
  assert.equal(item.actionSummaryKey, "lifecycle.deliveredPaused.summary");
  assert.deepEqual(item.actionMessageArgs, { milestone: "manuscript" });
  assert.equal(item.currentStageId, undefined, "must not fall back from lifecycle.current_stage_id=null to diagnostic execution stage");
  assert.equal(item.executionStageId, "diagnostic_stage");
  assert.ok(model.workItemRuntime?.agents.some((agent) => agent.id === "med-autocast"), "project_catalog agents missing from agent_catalog must be merged");

  const deliveredHtml = renderToStaticMarkup(createElement(StageProgressStepper, {
    item,
    locale: "zh",
    open: true,
    onToggle() {},
    onClose() {}
  }));
  assert.match(deliveredHtml, /已交付 \(2\/2\)/);
  assert.match(deliveredHtml, /已完成/);
  assert.doesNotMatch(deliveredHtml, /后续收尾/);
  assert.doesNotMatch(deliveredHtml, />completed<|>delivered<|>running</);

  const enHtml = renderToStaticMarkup(createElement(RuntimeStatusPanel, {
    locale: "en",
    projection: model.workItemRuntime,
    stateStatus: "ready",
    snapshotSource: "live",
    onRefresh() {},
    onOpenMaintenance() {}
  }));
  assert.match(enHtml, /Delivered and auto-paused/);
  assert.doesNotMatch(enHtml, /已交付自动暂停/);
});
