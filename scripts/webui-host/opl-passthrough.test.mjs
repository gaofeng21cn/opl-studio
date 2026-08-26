import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  compactFastState,
  compactInitialize,
  createOplPassthrough,
  mergeChannelProviderState
} from "./opl-passthrough.mjs";

test("App state timeout keeps the interactive default and admits a bounded cold-start override", () => {
  assert.doesNotThrow(() => createOplPassthrough({ readStateTimeoutMs: undefined }));
  assert.doesNotThrow(() => createOplPassthrough({ readStateTimeoutMs: 120_000 }));
  assert.throws(() => createOplPassthrough({ readStateTimeoutMs: 120_001 }), /100 through 120000/);
});

test("domain detail reads use the canonical item/view command and retain owner readback", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-domain-detail-passthrough-test-"));
  const command = path.join(directory, "fake-opl");
  await writeFile(command, `#!/bin/sh
printf '%s' '{"schema_version":"opl_domain_detail_view.v1","surface_kind":"opl_domain_detail_view","item_id":"project:one:study-one","view_id":"research-roadmap","view_kind":"research-roadmap","availability":"available","revision":7,"not_modified":false,"payload":{"revision":7},"conditions":[]}'
`, "utf8");
  await chmod(command, 0o755);
  const passthrough = createOplPassthrough({ command, cwd: directory });
  const readback = await passthrough.readDomainDetailView({
    itemId: "project:one:study-one",
    viewId: "research-roadmap",
    ifRevision: 6
  });
  assert.deepEqual(readback.stdoutJson, {
    schema_version: "opl_domain_detail_view.v1",
    surface_kind: "opl_domain_detail_view",
    item_id: "project:one:study-one",
    view_id: "research-roadmap",
    view_kind: "research-roadmap",
    availability: "available",
    revision: 7,
    not_modified: false,
    payload: { revision: 7 },
    conditions: []
  });
  assert.deepEqual(readback.commandArgs, [
    "app", "view", "read", "--item-id", "project:one:study-one", "--view-id", "research-roadmap",
    "--if-revision", "6", "--json"
  ]);
});

test("domain detail reads reject arbitrary or invalid request identities before spawning OPL", async () => {
  const passthrough = createOplPassthrough({ command: "/missing/opl-domain-detail" });
  await assert.rejects(
    passthrough.readDomainDetailView({ itemId: "", viewId: "research-roadmap" }),
    (error) => error.code === "invalid_request"
  );
  await assert.rejects(
    passthrough.readDomainDetailView({ itemId: "item-1", viewId: "view-1", ifRevision: -1 }),
    (error) => error.code === "invalid_request"
  );
});

test("channel callbacks stay dormant unless an optional provider registrar is configured", async () => {
  const adapter = {
    startThread: async () => {},
    resumeThread: async () => {},
    startTurn: async () => {},
    subscribeTurn: () => ({ dispose() {} })
  };
  const dormant = await createOplPassthrough().registerChannelCallbackAdapter(adapter);
  assert.deepEqual(
    { status: dormant.status, registered: dormant.registered },
    { status: "dormant", registered: false }
  );

  let received;
  let disposeCount = 0;
  const hostCalls = [];
  const hostPatch = {
    transport_bindings: {
      surface_kind: "opl_app_transport_bindings_projection.v1",
      status: "available",
      bindings: [{
        binding_id: "binding-1",
        provider_id: "opl-channel-weixin",
        account_id: "account-1",
        channel_session_id: "session-1",
        canonical_thread_host: "studio",
        canonical_thread_id: "thread-1",
        project_affinity: "projectless",
        status: "bound"
      }]
    },
    ui_contributions: {
      surface_kind: "opl_app_ui_contributions_projection.v1",
      contribution_count: 1,
      entries: [{
        contribution_key: "opl-channel-weixin:weixin-channel-access",
        package_id: "opl-channel-weixin",
        action_boundary: "opl.connect.channel-provider-host",
        view: { view_type: "channel_access", data_ref: "weixin.channel-access#state" },
        commands: [{ action_ref: "weixin.channel-access#connect" }]
      }]
    }
  };
  const passthrough = createOplPassthrough({
    channelCallbackRegistrar: async (value) => {
      received = value;
      return {
        appStatePatch: () => hostPatch,
        readChannelAccess: async (request) => {
          hostCalls.push(["read", request]);
          return { opl_app_contribution: { response: { result: { connection: { state: "connected" } } } } };
        },
        executeChannelAccessAction: async (request) => {
          hostCalls.push(["execute", request]);
          return { opl_app_contribution: { response: { result: { connection: { state: "connecting" } } } } };
        },
        dispose: () => { disposeCount += 1; }
      };
    }
  });
  const configured = await passthrough.registerChannelCallbackAdapter(adapter);
  assert.equal(received, adapter);
  assert.equal(configured.status, "registered");
  assert.equal(configured.registered, true);
  const readback = await passthrough.readContribution({
    packageId: "opl-channel-weixin",
    ref: "weixin.channel-access#state",
    input: { channel_id: "weixin" }
  });
  assert.equal(readback.command, "opl.connect.channel-provider-host");
  const receipt = await passthrough.executeAction({
    actionId: "package_contribution_execute",
    dryRun: false,
    payload: {
      package_id: "opl-channel-weixin",
      ref: "weixin.channel-access#connect",
      input: { channel_id: "weixin" },
      confirmed: false
    }
  });
  assert.equal(receipt.status, "executed");
  assert.deepEqual(hostCalls.map(([operation]) => operation), ["read", "execute"]);
  const merged = mergeChannelProviderState({
    app_state: {
      ui_contributions: {
        entries: [
          { package_id: "legacy", view: { view_type: "channel_access" } },
          { package_id: "opl-fleet-agent", view: { view_type: "list_detail" } }
        ]
      }
    }
  }, { appStatePatch: () => hostPatch });
  assert.deepEqual(
    merged.app_state.ui_contributions.entries.map((entry) => entry.package_id),
    ["opl-fleet-agent", "opl-channel-weixin"]
  );
  assert.equal(merged.app_state.transport_bindings.bindings[0].canonical_thread_id, "thread-1");
  await configured.dispose();
  await configured.dispose();
  assert.equal(disposeCount, 1);

  await assert.rejects(
    createOplPassthrough().registerChannelCallbackAdapter({ ...adapter, subscribeTurn: undefined }),
    /missing subscribeTurn/
  );
  assert.throws(
    () => createOplPassthrough({ channelCallbackRegistrar: "enabled" }),
    /registrar must be a function/
  );
  let invalidDisposeCount = 0;
  await assert.rejects(
    createOplPassthrough({
      channelCallbackRegistrar: async () => ({ dispose() { invalidDisposeCount += 1; } })
    })
      .registerChannelCallbackAdapter(adapter),
    /Host is missing appStatePatch/
  );
  assert.equal(invalidDisposeCount, 1);
});

test("candidate blocks confirmed mutations unless the launcher explicitly enables actions", async () => {
  const blocked = createOplPassthrough({
    cwd: process.cwd(),
    command: "/missing/opl-must-not-run",
    allowActions: false
  });
  const receipt = await blocked.executeAction({
    actionId: "test.mutate",
    dryRun: false,
    payload: { confirmed: true }
  });
  assert.equal(receipt.receiptKind, "blocked_read_only");
  assert.equal(receipt.status, "blocked_read_only");
  assert.equal(receipt.canExecute, false);
  assert.equal(receipt.stderr, "candidate_read_only_policy");
});

test("candidate admits only the settings operations required by the local Studio control center", async () => {
  for (const actionId of [
    "settings_diagnose_docker_webui",
    "settings_inventory_agent_package_store",
    "settings_inventory_webui_data_volume",
    "codex_user_instructions_set",
    "codex_user_instructions_restore_opl_flow_default"
  ]) {
    const passthrough = createOplPassthrough({
      cwd: process.cwd(),
      command: process.execPath,
      allowActions: false
    });
    const receipt = await passthrough.executeAction({
      actionId,
      dryRun: false,
      payload: { confirmed: true }
    });
    assert.equal(receipt.canExecute, true);
    assert.notEqual(receipt.receiptKind, "blocked_read_only");
    assert.notEqual(receipt.stderr, "candidate_read_only_policy");
  }
});

test("desktop candidate actions require an explicit host-injected allowlist", async () => {
  const blocked = createOplPassthrough({
    command: "/missing/opl-must-not-run",
    allowActions: false
  });
  assert.equal((await blocked.executeAction({
    actionId: "workspace_root_set",
    dryRun: false,
    payload: { path: "/workspace", confirmed: true }
  })).status, "blocked_read_only");

  const admitted = createOplPassthrough({
    command: process.execPath,
    allowActions: false,
    candidateActionAllowlist: ["workspace_root_set", "codex_install"]
  });
  for (const actionId of ["workspace_root_set", "codex_install"]) {
    const receipt = await admitted.executeAction({
      actionId,
      dryRun: false,
      payload: { confirmed: true }
    });
    assert.notEqual(receipt.status, "blocked_read_only");
  }
  assert.throws(
    () => createOplPassthrough({ candidateActionAllowlist: [""] }),
    /non-empty action IDs/
  );
});

test("ordinary app actions do not forward Studio confirmation metadata to Framework", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-action-passthrough-test-"));
  const argsFile = path.join(directory, "args.json");
  const command = path.join(directory, "fake-opl");
  await writeFile(command, `#!/bin/sh
printf '%s' "$*" > ${JSON.stringify(argsFile)}
printf '%s' '{"schema":"opl_app_action_execution.v1","status":"executed"}'
`, "utf8");
  await chmod(command, 0o755);
  const passthrough = createOplPassthrough({ command, cwd: directory, allowActions: true });
  const receipt = await passthrough.executeAction({
    actionId: "gateway_account_use_for_model_access",
    dryRun: false,
    payload: { confirmed: true, confirmationId: "studio-confirmation", receiptId: "receipt-1" }
  });
  assert.equal(receipt.status, "executed");
  assert.equal(await readFile(argsFile, "utf8"), "app action execute --action gateway_account_use_for_model_access --json");
  assert.deepEqual(receipt.payload, {
    confirmed: true,
    confirmationId: "studio-confirmation",
    receiptId: "receipt-1"
  });
});

test("initialize projection keeps launch readiness while omitting private runtime details", () => {
  const compact = compactInitialize({
    system_initialize: {
      overall_state: "ready_with_background_maintenance",
      setup_flow: {
        is_first_run: false,
        phase: "ready",
        ready_to_launch: true,
        progress: {
          required_completed_count: 3,
          required_total_count: 3,
          ready_full_readiness_count: 1,
          total_full_readiness_count: 2,
          private_counter: 99
        },
        blocking_items: [],
        maintenance_items: ["family_runtime_provider"],
        private_plan: { payload: "omit" }
      },
      readiness: {
        core_ready: true,
        launch_ready: true,
        full_ready: false,
        private_probe: "omit"
      },
      checklist: [{
        item_id: "workspace_root",
        label: "Workspace root",
        status: "ready",
        required: true,
        blocking: false,
        readiness_layer: "core_launch",
        private_receipt: "omit"
      }],
      family_runtime_provider: {
        status: "initializing",
        ready: false,
        full_readiness_blocking: true,
        private_process: "omit"
      },
      private_runtime: "omit"
    }
  });

  assert.equal(compact.system_initialize.setup_flow.ready_to_launch, true);
  assert.deepEqual(compact.system_initialize.setup_flow.maintenance_items, ["family_runtime_provider"]);
  assert.equal(compact.system_initialize.checklist[0].item_id, "workspace_root");
  assert.equal(compact.system_initialize.family_runtime_provider.status, "initializing");
  const serialized = JSON.stringify(compact);
  for (const marker of ["private_counter", "private_plan", "private_probe", "private_receipt", "private_process", "private_runtime"]) {
    assert.equal(serialized.includes(marker), false, `must omit ${marker}`);
  }
});

test("fast state preserves the compact managed-update projection without the kernel envelope", () => {
  const compact = compactFastState({
    app_state: {
      managed_update: {
        surface_id: "opl_managed_updater_kernel",
        operation: "status",
        operation_mode: "controlled_status",
        update_channel: "stable",
        authority_boundary: { can_write_domain_truth: false },
        idempotency_lock: { lock_id: "private-lock" },
        receipts: { receipt_store: "private-receipts" },
        components: [
          {
            component_id: "opl_app",
            lifecycle_owner: "one-person-lab-app",
            label: "OPL App",
            state: "currentness_not_checked",
            channel: "stable",
            current: {
              installed_version: "1.0.0",
              latest_version: null,
              currentness: "unknown",
              manual_guidance: "Check from the App owner",
              private_current_payload: "omit"
            },
            auto_apply: { mode: "prompt_only", eligible: false, app_background_safe: false, private_auto_payload: "omit" },
            plan: { summary: "App owner readback required", private_plan_payload: "omit" },
            owner_route: "private"
          },
          {
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
                  observed_status: "ready",
                  status: "ready",
                  currentness: "current",
                  version: "1.0.0",
                  latest_version: "1.0.0",
                  ownership: "opl_managed",
                  private_dependency_payload: "omit"
                }]
              }
            },
            auto_apply: { mode: "silent_managed", eligible: false, app_background_safe: true },
            plan: { summary: "No update required" }
          },
          {
            component_id: "opl_packages",
            lifecycle_owner: "one-person-lab",
            label: "OPL Packages",
            state: "current",
            channel: "stable",
            current: { installed_version: "cohort-1", latest_version: "cohort-1", currentness: "current", manual_guidance: null },
            auto_apply: { mode: "eligible_native_packages", eligible: true, app_background_safe: true },
            plan: { summary: "No update required" }
          }
        ]
      }
    }
  });

  const managedUpdate = compact.app_state.managed_update;
  assert.deepEqual(managedUpdate.components.map((component) => component.component_id), [
    "opl_app", "opl_base", "opl_packages"
  ]);
  assert.equal(managedUpdate.operation, "status");
  assert.equal(managedUpdate.update_channel, "stable");
  assert.deepEqual(managedUpdate.components[1].current.dependency_catalog.flow_dependencies[0], {
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
  });
  const serialized = JSON.stringify(managedUpdate);
  for (const marker of ["surface_id", "operation_mode", "authority_boundary", "idempotency_lock", "receipts", "owner_route", "private_dependency_payload"]) {
    assert.equal(serialized.includes(marker), false, `must omit ${marker}`);
  }
  assert.equal(Buffer.byteLength(serialized, "utf8") <= 32_768, true);
});

test("fast state keeps GUI package fields without copying deep runtime payloads", () => {
  const compact = compactFastState({
    version: "test",
    app_state: {
      actions: [{ action_id: "refresh", label: "Refresh", route: "opl app action execute", internal_trace: "x".repeat(20_000) }],
      agent_packages: {
        directory: {
          status: "current",
          entry_count: 1,
          installed_package_count: 1,
          installable_package_count: 0,
          migration_required_count: 0,
          source_catalog_kind: "installed_descriptor",
          files: {
            home_shortcut_preferences_file: "state://shortcuts",
            package_lock_file: "private://lock",
            lifecycle_ledger_file: "private://ledger"
          },
          entries: [{
            package_id: "future.agent",
            display_name: "Future Agent",
            display_name_i18n: { "en-US": "Future Agent", "zh-CN": "未来智能体" },
            description_i18n: { "en-US": "Research helper" },
            session_routing_summary_i18n: { "en-US": "Routes research tasks" },
            publisher: "Owner",
            package_role: "standard_agent",
            home_shortcuts: [{
              shortcut_id: "future-agent",
              label_i18n: { "en-US": "Future Agent" },
              default_visible: true,
              user_configurable: true,
              sort_order: 7,
              route: {
                route_kind: "agent_package_shortcut",
                executor: "codex_cli",
                codex_visible_entry: "future-agent",
                private_launch_payload: "private"
              }
            }],
            app_contributions: {
              schema_version: "opl-app-contributions.v1",
              navigation: [{
                navigation_id: "future.activity",
                label_i18n: { "en-US": "Activity" },
                view_id: "future.activity",
                icon_id: "activity",
                sort_order: 20,
                private_navigation_payload: "private"
              }],
              views: [{
                view_id: "future.activity",
                view_type: "activity_log",
                title_i18n: { "en-US": "Activity" },
                data_ref: "future.activity.v1#current",
                command_ids: ["future.refresh"],
                badge_ids: ["future.health"],
                empty_state_i18n: { "en-US": "No activity" },
                executable_renderer_bytes: "x".repeat(20_000)
              }],
              commands: [{
                command_id: "future.refresh",
                label_i18n: { "en-US": "Refresh" },
                action_ref: "future.refresh",
                confirmation_required: false,
                private_command_payload: "private"
              }],
              badges: [{
                badge_id: "future.health",
                label_i18n: { "en-US": "Healthy" },
                data_ref: "future.health.v1#current",
                tone: "success",
                private_badge_payload: "private"
              }],
              ui: [{
                contribution_id: "future.activity",
                slot: "runtime.detail",
                contribution_kind: "view",
                trust_tier: "declarative",
                scope: "work_item",
                sort_order: 20,
                view_id: "future.activity",
                command_ids: ["future.refresh"],
                executable_plugin_bytes: "x".repeat(20_000)
              }]
            },
            capability_metadata: { source: "normalized_owner_manifest", required_skill_ids: ["future-agent"] },
            installed_carrier_readback: {
              kind: "codex_plugin_manager",
              identity: "future-agent@example",
              source_ref: "/private/plugin/path",
              version: "1.0.0",
              lifecycle_authority: "carrier_owned"
            },
            installed_readiness: {
              installed: true,
              physical_status: "available",
              callability: "callable",
              legacy_lifecycle_state_present: false
            },
            source_explanation: {
              kind: "installed_codex_plugin_descriptor",
              source: "installed_descriptor",
              version_source_ref: "owner://future-agent/1.0.0",
              effective_source_policy: {
                effective_install_update_source: "managed_package_channel",
                package_channel_auto_update: true,
                developer_checkout_path: "/private/checkout"
              }
            },
            available_actions: [{
              action_id: "agent_package_update",
              action_ref: "app_state.actions#agent_package_update",
              semantic: "update",
              payload: { package_id: "future.agent", private: "x".repeat(20_000) },
              required_payload_fields: ["package_id"],
              confirmation_required: true
            }],
            managed_runtime_source: { bootstrap_command: ["x".repeat(20_000)] },
            lifecycle_receipts: [{ receipt_ref: "private://receipt", physical_surface: { payload: "x".repeat(20_000) } }],
            package_lock_ref: "private://lock",
            rollback_ref: "private://rollback"
          }]
        },
        status_index: {
          home_shortcut_preferences: [{
            package_id: "future.agent",
            shortcut_id: "future-agent",
            visible: true,
            sort_order: 7,
            source: "user_preference",
            private_receipt: { payload: "x".repeat(20_000) }
          }],
          packages: {
            "future.agent": {
              package_id: "future.agent",
              status: "available",
              presence: { registered: true, installed: true, present: true, callable: true, status: "present" },
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
                  reasons: [],
                  private_dependency_payload: "private"
                }]
              },
              actions: { available: ["update"], recommended: null },
              owner_route_readback: { payload: "x".repeat(20_000) }
            }
          }
        }
      }
    }
  });

  const state = compact.app_state;
  assert.equal(state.actions[0].action_id, "refresh");
  assert.equal("internal_trace" in state.actions[0], false);
  const entry = state.agent_packages.directory.entries[0];
  assert.equal(entry.display_name, "Future Agent");
  assert.equal(entry.display_name_i18n["zh-CN"], "未来智能体");
  assert.equal(entry.description_i18n["en-US"], "Research helper");
  assert.equal(entry.session_routing_summary_i18n["en-US"], "Routes research tasks");
  assert.equal(entry.publisher, "Owner");
  assert.equal(entry.home_shortcuts[0].default_visible, true);
  assert.equal(entry.home_shortcuts[0].sort_order, 7);
  assert.deepEqual(entry.home_shortcuts[0].route, {
    route_kind: "agent_package_shortcut",
    executor: "codex_cli",
    codex_visible_entry: "future-agent"
  });
  assert.equal(entry.app_contributions.navigation[0].navigation_id, "future.activity");
  assert.equal(entry.app_contributions.views[0].data_ref, "future.activity.v1#current");
  assert.equal(entry.app_contributions.commands[0].action_ref, "future.refresh");
  assert.equal(entry.app_contributions.badges[0].tone, "success");
  assert.equal(entry.app_contributions.ui[0].slot, "runtime.detail");
  assert.equal(entry.source_explanation.effective_source_policy.package_channel_auto_update, true);
  assert.equal(entry.capability_metadata.required_skill_ids[0], "future-agent");
  assert.equal(entry.installed_carrier_readback.lifecycle_authority, "carrier_owned");
  assert.equal("version_source_ref" in entry.source_explanation, false);
  assert.equal(entry.installed_carrier_readback.identity, "future-agent@example");
  assert.equal("legacy_lifecycle_state_present" in entry.installed_readiness, false);
  assert.equal(entry.available_actions[0].action_id, "agent_package_update");
  assert.deepEqual(entry.available_actions[0].payload, { package_id: "future.agent" });
  assert.equal("source_ref" in entry.installed_carrier_readback, false);
  assert.equal("managed_runtime_source" in entry, false);
  assert.equal("lifecycle_receipts" in entry, false);
  assert.equal("package_lock_ref" in entry, false);
  assert.equal("rollback_ref" in entry, false);
  assert.equal("developer_checkout_path" in entry.source_explanation.effective_source_policy, false);
  assert.equal("private_launch_payload" in entry.home_shortcuts[0].route, false);
  assert.equal("executable_renderer_bytes" in entry.app_contributions.views[0], false);
  assert.equal("executable_plugin_bytes" in entry.app_contributions.ui[0], false);
  assert.equal("package_lock_file" in state.agent_packages.directory.files, false);
  assert.equal("lifecycle_ledger_file" in state.agent_packages.directory.files, false);
  assert.equal(state.agent_packages.status_index.packages["future.agent"].status, "available");
  assert.deepEqual(state.agent_packages.status_index.packages["future.agent"].dependency_readiness, {
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
  });
  assert.equal("owner_route_readback" in state.agent_packages.status_index.packages["future.agent"], false);
  assert.deepEqual(state.agent_packages.status_index.home_shortcut_preferences[0], {
    package_id: "future.agent",
    shortcut_id: "future-agent",
    visible: true,
    sort_order: 7
  });
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) < 10_000);
});

test("fast state keeps the bounded public UI contribution projection", () => {
  const compact = compactFastState({
    app_state: {
      transport_bindings: {
        surface_kind: "opl_app_transport_bindings_projection.v1",
        status: "available",
        bindings: [{
          binding_id: "binding-1",
          provider_id: "opl-channel-weixin",
          account_id: "account-1",
          channel_session_id: "session-1",
          canonical_thread_host: "studio",
          canonical_thread_id: "thread-1",
          project_affinity: "projectless",
          status: "bound"
        }]
      },
      ui_contributions: {
        surface_kind: "opl_app_ui_contributions_projection.v1",
        contribution_count: 1,
        source_ref: "app_state.agent_packages.status_index.packages[*].app_contributions.ui",
        entries: [{
          contribution_key: "future.agent:future.activity",
          contribution_id: "future.activity",
          package_id: "future.agent",
          slot: "runtime.detail",
          contribution_kind: "view",
          trust_tier: "declarative",
          scope: "work_item",
          sort_order: 20,
          descriptor_schema_version: "opl-app-contributions.v1",
          view: {
            view_id: "future.activity",
            view_type: "activity_log",
            title_i18n: { "en-US": "Activity" },
            data_ref: "future.activity.v1#current",
            empty_state_i18n: { "en-US": "No activity" },
            private_view_payload: "private"
          },
          commands: [{
            command_id: "future.refresh",
            label_i18n: { "en-US": "Refresh" },
            action_ref: "future.refresh",
            confirmation_required: false,
            private_command_payload: "private"
          }],
          badges: [{
            badge_id: "future.health",
            label_i18n: { "en-US": "Healthy" },
            data_ref: "future.health.v1#current",
            tone: "success",
            private_badge_payload: "private"
          }],
          executable_plugin_bytes: "x".repeat(20_000)
        }],
        private_receipts: [{ payload: "x".repeat(20_000) }]
      }
    }
  });

  const projection = compact.app_state.ui_contributions;
  assert.equal(projection.surface_kind, "opl_app_ui_contributions_projection.v1");
  assert.equal(projection.entries[0].contribution_key, "future.agent:future.activity");
  assert.equal(projection.entries[0].view.data_ref, "future.activity.v1#current");
  assert.equal(projection.entries[0].commands[0].action_ref, "future.refresh");
  assert.equal(projection.entries[0].badges[0].tone, "success");
  assert.equal(compact.app_state.transport_bindings.bindings[0].canonical_thread_id, "thread-1");
  const serialized = JSON.stringify(projection);
  for (const marker of ["private_view_payload", "private_command_payload", "private_badge_payload", "executable_plugin_bytes", "private_receipts"]) {
    assert.equal(serialized.includes(marker), false, `must omit ${marker}`);
  }
});

test("fast state keeps a bounded work-item runtime projection without private execution payloads", () => {
  const compact = compactFastState({
    app_state: {
      operator: {
        workbench: {
          work_item_projection_v2: {
            surface_kind: "opl_work_item_projection",
            schema_version: "work-item-projection.v2",
            profile: "fast",
            generated_at: "2026-08-16T08:58:46.549Z",
            summary: {
              agent_count: 1,
              project_count: 1,
              work_item_count: 1,
              running_count: 0,
              telemetry_missing_count: 1,
              private_counter: 99
            },
            agent_catalog: [{
              agent_id: "mas",
              display_name: "Med Auto Science",
              package_id: "mas",
              private_launch_payload: "omit"
            }],
            project_catalog: [{
              project_id: "project:one",
              agent_id: "mas",
              display_name: "Research",
              workspace_path: "/workspace/research"
            }],
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
                work_item_root: "/private/study"
              },
              lifecycle: {
                primary_state: "paused",
                primary_state_label: "已暂停",
                current_stage_id: null,
                lifecycle_ref: "private://lifecycle"
              },
              visibility: { state: "visible", control_ref: "private://control" },
              execution: {
                state: "idle",
                attempt_id: "attempt:analysis:1",
                current_stage_display_name: null,
                next_stage_display_name: "Analysis",
                workflow_id: "private-workflow",
                review_chain: { total_tokens_observed: null, token_observation_status: "missing", receipt_ref: "private" }
              },
              telemetry: {
                state: "missing",
                missing_reason: "no_stage_attempt_usage_telemetry_observed",
                cumulative: { state: "missing", total_tokens: null, missing_reason: "not_observed", source_refs: ["private"] }
              },
              action: { title: "等待明确后续方向", owner_display_name: "你", action_ref: "wait" },
              stage_map: [{
                stage_id: "analysis",
                display_name: "Analysis",
                display_names: { "zh-CN": "分析", "en-US": "Analysis" },
                state: "pending",
                internal_receipt: "private"
              }],
              source_refs: [{ ref: "private://source" }]
            }],
            diagnostics: { raw_payload: "private" }
          }
        }
      }
    }
  });

  const projection = compact.app_state.operator.workbench.work_item_projection_v2;
  assert.equal(projection.schema_version, "work-item-projection.v2");
  assert.equal(projection.summary.telemetry_missing_count, 1);
  assert.equal(projection.agent_catalog[0].display_name, "Med Auto Science");
  assert.equal(projection.project_catalog[0].display_name, "Research");
  assert.equal(projection.project_catalog[0].workspace_path, "/workspace/research");
  assert.equal(projection.items[0].identity.work_item_display_name, "Study one");
  assert.equal(projection.items[0].identity.domain_work_item_id, "study-one");
  assert.equal(projection.items[0].identity.work_item_scope_id, "work-item:study-one");
  assert.equal(projection.items[0].identity.identity_state, "resolved");
  assert.equal(projection.items[0].identity.workspace_path, "/workspace/research");
  assert.equal(projection.items[0].execution.attempt_id, "attempt:analysis:1");
  assert.equal(projection.items[0].telemetry.cumulative.total_tokens, null);
  assert.equal(projection.items[0].stage_map[0].display_names["zh-CN"], "分析");
  const serialized = JSON.stringify(projection);
  for (const marker of [
    "private_counter", "private_launch_payload", "work_item_root", "lifecycle_ref",
    "control_ref", "workflow_id", "receipt_ref", "source_refs", "internal_receipt", "diagnostics"
  ]) {
    assert.equal(serialized.includes(marker), false, `must omit ${marker}`);
  }
});

test("fast state exposes only the Settings read model fields needed by the shared renderer", () => {
  const compact = compactFastState({
    app_state: {
      core: {
        codex: {
          installed: true,
          parsed_version: "0.147.0",
          version_status: "compatible",
          binary_path: "/usr/local/bin/codex",
          private_runtime_payload: "private"
        }
      },
      settings_control_center: {
        status_summary: {
          model_access: "ready",
          agent_package_functional_health: "18/25",
          issue_count: 1,
          internal_issue_payload: "private"
        },
        app_settings_read_model: {
          surface_kind: "opl_app_settings_read_model.v1",
          opl_gateway_account: {
            surface_kind: "opl_gateway_account_read_model.v1",
            connection_mode: "account",
            status: "connected",
            account_card_visible: true,
            account: {
              display_name: "OPL User",
              email: "opl@example.com",
              status: "active",
              balance: { amount: 128.4, currency: "CNY", internal_ledger: "private" },
              credential: "private"
            },
            usage: { today_tokens: 32000, currency: "CNY", raw_events: ["private"] },
            managed_key: { name: "OPL App · Test", status: "active", secret: "private" },
            installation: { device_label: "Test Mac", short_id: "ABC123", host_token: "private" },
            freshness: { observed_at: "2026-08-09T03:39:22.845Z", stale: false, raw_error: "private" },
            actions: { disconnect: "gateway_account_disconnect" }
          },
          codex_model_policy: {
            model: "gpt-5.6-sol",
            reasoning_effort: "max",
            provider_name: "OPL Gateway",
            api_key_present: true,
            api_key: "private"
          },
          local_environment: {
            state_dir: "/state",
            logs_dir: "/logs",
            private_environment: "private"
          },
          connections: {
            connections: [{
              connection_id: "external",
              name: "External",
              endpoint: "https://example.com",
              status: "ready",
              credential_handle: "credential-store:private"
            }]
          }
        }
      }
    }
  });

  const state = compact.app_state;
  const readModel = state.settings_control_center.app_settings_read_model;
  assert.equal(readModel.opl_gateway_account.account.display_name, "OPL User");
  assert.equal(readModel.opl_gateway_account.account.email, "opl@example.com");
  assert.equal(readModel.opl_gateway_account.account.balance.amount, 128.4);
  assert.equal(readModel.opl_gateway_account.usage.today_tokens, 32000);
  assert.equal(readModel.opl_gateway_account.managed_key.name, "OPL App · Test");
  assert.equal(state.core.codex.parsed_version, "0.147.0");
  assert.equal(readModel.codex_model_policy.model, "gpt-5.6-sol");
  assert.equal(readModel.local_environment.logs_dir, "/logs");
  assert.equal(readModel.connections.connections[0].name, "External");
  const projected = JSON.stringify(compact);
  for (const privateMarker of ["credential_handle", "api_key\"", "internal_ledger", "raw_events", "host_token", "raw_error", "private_runtime_payload", "internal_issue_payload"]) {
    assert.equal(projected.includes(privateMarker), false, `must omit ${privateMarker}`);
  }
  assert.deepEqual(readModel.opl_gateway_account.actions, { disconnect: "gateway_account_disconnect" });
});

test("fast state keeps the complete package catalog and bounded runtime control projection", () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    package_id: `package-${index}`,
    display_name: `Package ${index}`,
    publisher: index < 9 ? "one-person-lab" : "OpenAI",
    package_role: "standard_agent",
    installed: true,
    activated: true,
    readiness: { status: "ready", private: "private" },
    package_currentness: { status: "unknown", internal: "private" },
    available_actions: []
  }));
  const compact = compactFastState({
    app_state: {
      actions: [{
        action_id: "provider_scheduler_status",
        label: "Read scheduler status",
        route: "opl app action execute --action provider_scheduler_status",
        payload_fields: [],
        dry_run_supported: true,
        confirmation_required: false,
        danger_level: "none"
      }],
      agent_packages: {
        directory: { status: "available", entry_count: entries.length, entries },
        status_index: { packages: {} }
      },
      provider: {
        status: "ready",
        temporal: {
          status: "ready",
          ready: true,
          management: { owner_surface: "opl app action execute", actions: ["provider_scheduler_status"] },
          details: {
            address: "127.0.0.1:7233",
            worker_readiness: {
              readiness_status: "ready",
              worker_ready: true,
              temporal_service_lifecycle: { supervisor: { status: "loaded_running", ready: true, database_path: "/private" } }
            },
            scheduler: { status: "attention_needed", ready: false, internal_history: "private" }
          }
        }
      },
      runtime_source_carriers: {
        summary: { default_carriers_count: 1, present_default_carriers_count: 1, healthy_default_carriers_count: 1 },
        items: [{ package_id: "mas", label: "Med Auto Science", source_health_status: "ready", source_path: "/private", git: { sync_status: "synced", dirty: false, head_sha: "private" } }]
      }
    }
  });

  assert.equal(compact.app_state.agent_packages.directory.entries.length, 12);
  assert.equal(compact.app_state.actions[0].confirmation_required, false);
  assert.equal(compact.app_state.provider.temporal.details.scheduler.status, "attention_needed");
  assert.equal(compact.app_state.runtime_source_carriers.items[0].git.sync_status, "synced");
  const serialized = JSON.stringify(compact);
  for (const marker of ["database_path", "internal_history", "source_path", "head_sha"]) {
    assert.equal(serialized.includes(marker), false, `must omit ${marker}`);
  }
});

test("fast state keeps storage reasons, Docker WebUI actions, and safe personalization content", () => {
  const compact = compactFastState({
    app_state: {
      actions: [{
        action_id: "settings_diagnose_docker_webui",
        label: "Diagnose Docker WebUI",
        route: "opl app action execute --action settings_diagnose_docker_webui",
        payload_fields: [],
        mutates: "none_read_only",
        dry_run_supported: true,
        confirmation_required: false
      }],
      codex_personalization: {
        user_agents: {
          status: "available",
          path: "/Users/test/.codex/AGENTS.md",
          content: "Use concise answers.",
          sha256: "sha-user",
          size_bytes: 20,
          private_file_stat: "omit"
        },
        opl_flow_default_user_agents: {
          status: "available",
          content: "Use the OPL workflow.",
          package_version: "0.1.0",
          source_path: "/private/template"
        }
      },
      settings_control_center: {
        app_settings_read_model: {
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
              observed_at: null,
              stale: true,
              bytes: null,
              reason_code: "inventory_cache_missing_or_invalid",
              owner_route: "/settings/agents",
              inventory_action_id: "settings_inventory_agent_package_store",
              projected_action: { kind: "navigate", status: "available", route: "/settings/agents" }
            }
          }
        }
      }
    }
  });

  const state = compact.app_state;
  assert.equal(state.codex_personalization.user_agents.content, "Use concise answers.");
  assert.equal(state.codex_personalization.opl_flow_default_user_agents.package_version, "0.1.0");
  assert.equal(state.settings_control_center.app_settings_read_model.docker_webui.ordinary_next_actions[0].action_id, "settings_diagnose_docker_webui");
  assert.equal(state.settings_control_center.app_settings_read_model.storage_lifecycle.agent_package_store.reason_code, "inventory_cache_missing_or_invalid");
  assert.equal(state.settings_control_center.app_settings_read_model.storage_lifecycle.agent_package_store.inventory_action_id, "settings_inventory_agent_package_store");
  assert.equal(state.settings_control_center.app_settings_read_model.storage_lifecycle.agent_package_store.projected_action.route, "/settings/agents");
  assert.equal(JSON.stringify(state).includes("private_file_stat"), false);
});
