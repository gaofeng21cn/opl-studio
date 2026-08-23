import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveWorkbenchModelFromState,
  mergeManagedUpdateProjections,
  parseDomainDetailViewDescriptors,
  readManagedUpdateProjection
} from "../../src/workbench/workbenchModel.ts";
import { compactFastState } from "../../scripts/webui-host/opl-passthrough.mjs";

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
          action_id: "provider_scheduler_status",
          label: "Read Temporal scheduler status",
          route: "opl app action execute --action provider_scheduler_status",
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
      provider: {
        status: "ready",
        temporal: {
          status: "ready",
          ready: true,
          management: { actions: ["provider_scheduler_status", "missing_action"] },
          details: {
            address: "127.0.0.1:7233",
            namespace: "opl-foundry",
            task_queue: "opl-stage-attempts",
            worker_readiness: {
              readiness_status: "ready",
              service_ready: true,
              worker_ready: true,
              temporal_service_lifecycle: {
                service_status: "running",
                supervisor: { status: "loaded_running", ready: true }
              }
            },
            scheduler: { status: "attention_needed", ready: false, observed_at: "2026-08-10T00:00:00Z" }
          }
        }
      },
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

  assert.equal(model.runtimeOverview?.temporal.serviceStatus, "loaded_running");
  assert.equal(model.runtimeOverview?.temporal.workerStatus, "ready");
  assert.equal(model.runtimeOverview?.temporal.schedulerStatus, "attention_needed");
  assert.equal(model.runtimeOverview?.carriers.healthy, 1);
  assert.equal(model.runtimeOverview?.carriers.items[1]?.syncStatus, "behind");
  assert.deepEqual(model.runtimeOverview?.maintenanceActions.map((action) => action.actionId), [
    "settings_check_app_update",
    "provider_scheduler_status"
  ]);
  assert.equal(model.runtimeOverview?.recommendedActionId, "provider_scheduler_status");
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
            project_catalog: [{ project_id: "project:one", agent_id: "mas", display_name: "Research" }],
            items: [{
              item_id: "project:one:study-one",
              identity: {
                agent_id: "mas",
                agent_display_name: "Med Auto Science",
                project_id: "project:one",
                project_display_name: "Research",
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
              action: { title: "等待明确后续方向", owner_display_name: "你" },
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

  assert.equal(model.workItemRuntime?.summary.telemetryMissingCount, 2);
  assert.equal(model.workItemRuntime?.items[0]?.statusLabel, "已暂停");
  assert.equal(model.workItemRuntime?.items[0]?.domainWorkItemId, "study-one");
  assert.equal(model.workItemRuntime?.items[0]?.workItemScopeId, "work-item:study-one");
  assert.equal(model.workItemRuntime?.items[0]?.identityState, "resolved");
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

test("managed update reads fast-state currentness and OPL Flow dependencies", () => {
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
              flow_dependencies: [{
                dependency_id: "officecli",
                dependency_kind: "cli",
                activation: "task_routed",
                offline_bundle: "none",
                online_install_default: true,
                source: "installed_owner_descriptor",
                source_path: "/opt/opl-flow",
                owner: "opl-flow",
                bundle_id: "officecli",
                version_requirement: ">=1.0.0",
                install_source: "native",
                relationship: "required",
                lifecycle_owner: "opl_base",
                update_mode: "silent_managed",
                installed: true,
                observed_status: null,
                status: "ready",
                currentness: "current",
                version: "1.0.0",
                latest_version: "1.0.0",
                ownership: "opl_managed"
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
  assert.deepEqual(projection.components[0]?.flowDependencies, [{
    dependencyId: "officecli",
    dependencyKind: "cli",
    activation: "task_routed",
    offlineBundle: "none",
    onlineInstallDefault: true,
    source: "installed_owner_descriptor",
    sourcePath: "/opt/opl-flow",
    owner: "opl-flow",
    bundleId: "officecli",
    versionRequirement: ">=1.0.0",
    installSource: "native",
    relationship: "required",
    lifecycleOwner: "opl_base",
    updateMode: "silent_managed",
    installed: true,
    observedStatus: null,
    status: "ready",
    currentness: "current",
    version: "1.0.0",
    latestVersion: "1.0.0",
    ownership: "opl_managed"
  }]);
});

test("Framework fast managed-update output survives Host compression and renderer parsing", () => {
  const compressed = compactFastState({
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
                flow_dependencies: [{
                  dependency_id: "officecli",
                  dependency_kind: "cli",
                  activation: "task_routed",
                  offline_bundle: "none",
                  online_install_default: true,
                  source: "installed_owner_descriptor",
                  source_path: "/opt/opl-flow",
                  owner: "opl-flow",
                  bundle_id: "officecli",
                  version_requirement: ">=1.0.0",
                  install_source: "native",
                  relationship: "required",
                  lifecycle_owner: "opl_base",
                  update_mode: "silent_managed",
                  installed: true,
                  observed_status: "ready",
                  status: "ready",
                  currentness: "current",
                  version: "1.0.0",
                  latest_version: "1.0.0",
                  ownership: "opl_managed"
                }]
              }
            } : {})
          },
          auto_apply: { mode: "prompt_only", eligible: false, app_background_safe: false },
          plan: { summary: "No update required" }
        }))
      }
    }
  });

  const projection = readManagedUpdateProjection(compressed);
  assert.ok(projection);
  assert.deepEqual(projection.components.map((component) => component.componentId), [
    "opl_app", "opl_base", "opl_packages"
  ]);
  assert.equal(projection.components.find((component) => component.componentId === "opl_app")?.currentness, "unknown");
  assert.equal(projection.components.find((component) => component.componentId === "opl_base")?.flowDependencies?.[0]?.dependencyId, "officecli");
  assert.equal(projection.components.find((component) => component.componentId === "opl_base")?.flowDependencies?.[0]?.currentness, "current");
});

test("browser bridge normalization preserves App-projected Temporal runtime details", async () => {
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
  const { normalizeCodexCapabilityCatalog, normalizeStateReadback } = await import("../../src/bridge/oplBridge.ts");
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
        provider: {
          selected_provider: "temporal",
          temporal: {
            status: "ready",
            ready: true,
            details: {
              worker_readiness: {
                readiness_status: "ready",
                worker_ready: true,
                temporal_service_lifecycle: {
                  service_status: "running",
                  supervisor: { status: "loaded_running", ready: true }
                }
              },
              scheduler: { status: "attention_needed", ready: false }
            }
          }
        },
        managed_companions: [{
          surface_kind: "opl_managed_computer_use_projection",
          provider_id: "kimi-cu",
          product_name: "KimiCU",
          available_actions: ["settings_reinstall_computer_use"]
        }],
        actions: [{
          action_id: "settings_reinstall_computer_use",
          label: "Reinstall Computer Use",
          route: "opl app action execute --action settings_reinstall_computer_use",
          surface: "opl app action execute",
          submit_via: "opl app action execute",
          payload_fields: [],
          mutates: "opl_managed_kimi_cu_bundle_service_and_codex_mcp_registration",
          dry_run_supported: true,
          confirmation_required: true,
          danger_level: "medium",
          owner: "one-person-lab",
          delegated_surface: "OPL managed KimiCU reinstall",
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
  assert.equal(model.runtimeOverview?.temporal.serviceStatus, "loaded_running");
  assert.equal(model.runtimeOverview?.temporal.workerStatus, "ready");
  assert.equal(model.runtimeOverview?.temporal.schedulerStatus, "attention_needed");
  assert.equal(model.managedCompanions[0]?.providerId, "kimi-cu");
  assert.equal(model.workItemRuntime?.items[0]?.title, "Study one");
  assert.deepEqual(readback.app_state.managed_companions.map((item) => item.provider_id), ["kimi-cu"]);
  assert.deepEqual(readback.app_state.actions[0], {
    action_id: "settings_reinstall_computer_use",
    label: "Reinstall Computer Use",
    route: "opl app action execute --action settings_reinstall_computer_use",
    surface: "opl app action execute",
    submit_via: "opl app action execute",
    payload_fields: [],
    mutates: "opl_managed_kimi_cu_bundle_service_and_codex_mcp_registration",
    dry_run_supported: true,
    confirmation_required: true,
    danger_level: "medium",
    owner: "one-person-lab",
    delegated_surface: "OPL managed KimiCU reinstall",
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
