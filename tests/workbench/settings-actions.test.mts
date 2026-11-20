import { customModelAccessFixture } from "../../scripts/model-policy-fixture.ts";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSettingsActionViewModel,
  readGatewayActionsFromState
} from "../../plugins/opl-studio-client/src/client/workbench/settingsActions.ts";
import { initialWorkbenchModel, type WorkbenchModel } from "../../plugins/opl-studio-client/src/client/workbench/workbenchModel.ts";

function modelWith(overrides: Partial<WorkbenchModel>): WorkbenchModel {
  return { ...initialWorkbenchModel, ...overrides };
}

test("carrier diagnostics keep unavailable states human-readable and attention-toned", async () => {
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
  const { carrierLogDetail, statusTone } = await import("../../plugins/opl-studio-client/src/client/workbench/SettingsPanel.tsx");
  const diagnostics = {
    schema: "opl_app_carrier_diagnostics.v1",
    owner: "one-person-lab-app_native_host",
    carrier: "standalone_headless_webui",
    status: "unavailable" as const,
    setLogDirectorySupported: false,
    reasonCode: "carrier_log_directory_unavailable"
  };

  assert.equal(statusTone("unavailable"), "attention");
  assert.equal(statusTone("incompatible"), "attention");
  assert.equal(statusTone("available"), "ready");
  assert.equal(carrierLogDetail(diagnostics, "zh"), "当前运行方式不提供应用日志路径");
  assert.equal(carrierLogDetail(diagnostics, "en"), "This app mode does not provide an application log path");
});

test("managed update host actions come only from the App-projected action catalog", async () => {
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
  const { readProjectedManagedUpdateActions, readProjectedManifestInstallAction } = await import("../../plugins/opl-studio-client/src/client/workbench/App.tsx");
  const actions = readProjectedManagedUpdateActions({
    app_state: {
      app_state: {
        actions: [{
          action_id: "settings_check_opl_base_update",
          label: "Check OPL Base update",
          payload_fields: [],
          dry_run_supported: true,
          confirmation_required: false
        }, {
          action_id: "settings_apply_opl_base_update",
          label: "Apply OPL Base update",
          payload_fields: [],
          dry_run_supported: true
        }, {
          action_id: "settings_apply_opl_packages",
          label: "Apply OPL packages",
          payload_fields: [],
          dry_run_supported: true
        }, {
          action_id: "unprojected_update",
          label: "Must not become executable",
          payload_fields: [],
          dry_run_supported: true,
          confirmation_required: false
        }],
        settings_control_center: { task_entries: [] }
      }
    }
  });

  assert.deepEqual(actions, [{
    actionId: "settings_check_opl_base_update",
    label: "Check OPL Base update",
    payloadFields: [],
    confirmationRequired: false,
    dryRunSupported: true
  }, {
    actionId: "settings_apply_opl_base_update",
    label: "Apply OPL Base update",
    payloadFields: [],
    confirmationRequired: true,
    dryRunSupported: true
  }, {
    actionId: "settings_apply_opl_packages",
    label: "Apply OPL packages",
    payloadFields: [],
    confirmationRequired: true,
    dryRunSupported: true
  }]);

  assert.deepEqual(readProjectedManifestInstallAction({
    app_state: {
      actions: [{
        action_id: "install_from_manifest_url",
        payload_fields: ["manifest_url", "trust_tier"],
        confirmation_required: true,
        dry_run_supported: true
      }]
    }
  }), {
    actionId: "install_from_manifest_url",
    payloadFields: ["manifest_url", "trust_tier"],
    confirmationRequired: true,
    dryRunSupported: true
  });
  assert.equal(readProjectedManifestInstallAction({
    app_state: { actions: [{ action_id: "agent_package_install", payload_fields: ["package_id"] }] }
  }), undefined);
});

test("settings actions consume projected Gateway actions without creating a credential transport", () => {
  const refreshAction = {
      id: "gateway_account_refresh",
      label: "Refresh Gateway account",
      route: "opl app action execute --action gateway_account_refresh",
      payloadFields: [],
      mutates: "gateway_account_cache",
      dryRunSupported: true,
      confirmationRequired: false
    };
  const disconnectAction = {
      id: "gateway_account_disconnect",
      label: "Disconnect Gateway account",
      route: "opl app action execute --action gateway_account_disconnect",
      payloadFields: [],
      mutates: "gateway_account_connection",
      dryRunSupported: true,
      confirmationRequired: true
    };
  const state = {
    app_state: {
      actions: [
        { action_id: refreshAction.id, label: refreshAction.label, route: refreshAction.route, payload_fields: [], mutates: refreshAction.mutates, dry_run_supported: true },
        { action_id: disconnectAction.id, label: disconnectAction.label, route: disconnectAction.route, payload_fields: [], mutates: disconnectAction.mutates, dry_run_supported: true, confirmation_required: true },
        { action_id: "gateway_account_login", label: "Secret login", route: "forbidden generic route", payload_fields: ["password"] }
      ],
      settings_control_center: {
        app_settings_read_model: {
          opl_gateway_account: {
            actions: {
              refresh: refreshAction.id,
              disconnect: disconnectAction.id
            }
          }
        }
      }
    }
  };
  const viewModel = buildSettingsActionViewModel(modelWith({
    contextActions: [refreshAction, disconnectAction, {
      id: "gateway_account_login",
      label: "Password login must use the secret bridge",
      route: "forbidden generic route",
      payloadFields: ["password"],
      mutates: "gateway_account_connection",
      dryRunSupported: false,
      confirmationRequired: true
    }]
  }), null, {
    gatewayActions: readGatewayActionsFromState(state)
  });

  assert.deepEqual(viewModel.gatewayActions.map((action) => [action.actionId, action.kind, action.availability]), [
    ["gateway_account_refresh", "refresh", "ready"],
    ["gateway_account_disconnect", "disconnect", "ready"]
  ]);
  assert.equal(JSON.stringify(viewModel.gatewayActions).includes("password"), false);
});

test("settings actions preserve package-projected lifecycle payloads and availability", () => {
  const viewModel = buildSettingsActionViewModel(modelWith({
    packageLifecycle: [{
      ...initialWorkbenchModel.packageLifecycle[0]!,
      id: "package-mas",
      packageId: "mas",
      label: "Med Auto Science",
      installed: true,
      status: "ready",
      actions: [{
        kind: "update",
        semantic: "update",
        label: "Update",
        status: "available",
        actionId: "agent_package_update",
        actionRef: "app_state.actions#agent_package_update",
        payload: { package_id: "mas" },
        requiredPayloadFields: ["package_id"],
        confirmationRequired: true,
        dryRunSupported: true,
        sourceRef: "app_state.actions#agent_package_update",
        reason: "Projected by the package owner"
      }, {
        kind: "preferences",
        semantic: "preferences",
        label: "Preferences",
        status: "available",
        actionId: "agent_package_preferences_set",
        actionRef: "app_state.actions#agent_package_preferences_set",
        payload: { package_id: "mas" },
        requiredPayloadFields: ["package_id", "exposure_action or shortcut_id"],
        confirmationRequired: false,
        dryRunSupported: true,
        sourceRef: "app_state.actions#agent_package_preferences_set",
        reason: "Projected by the package owner"
      }]
    }]
  }), null);

  const actions = viewModel.agentLifecycle[0]?.actions ?? [];
  assert.equal(actions[0]?.availability, "ready");
  assert.deepEqual(actions[0]?.payload, { package_id: "mas" });
  assert.equal(actions[1]?.availability, "payload_required");
});

test("managed update actions bind to the software objects declared by each projected action", () => {
  const viewModel = buildSettingsActionViewModel(modelWith({
    contextActions: [{
      id: "settings_check_app_update",
      label: "Check App update",
      route: "opl app action execute --action settings_check_app_update",
      payloadFields: [],
      mutates: "none_read_only",
      dryRunSupported: true,
      confirmationRequired: false
    }, {
      id: "settings_apply_opl_packages",
      label: "Apply OPL Packages",
      route: "opl app action execute --action settings_apply_opl_packages",
      payloadFields: [],
      mutates: "opl_packages",
      dryRunSupported: true,
      confirmationRequired: true
    }, {
      id: "owner_projected_managed_update",
      label: "Apply eligible updates",
      route: "opl app action execute --action owner_projected_managed_update",
      payloadFields: [],
      mutates: "managed_update",
      dryRunSupported: true,
      confirmationRequired: true
    }]
  }), {
    operation: "status",
    channel: "stable",
    components: [{
      componentId: "opl_base",
      lifecycleOwner: "one-person-lab",
      label: "OPL Base",
      state: "current",
      autoApplyEligible: false,
      backgroundSafe: false
    }]
  }, {
    managedUpdateActions: [{
      transport: "native_app_updater",
      key: "native-app:check",
      label: "Check App update",
      operation: "check",
      componentIds: ["opl_app"],
      confirmationRequired: false,
      availability: "ready",
      sourceRef: "native_app_updater"
    }, {
      transport: "managed_update_host",
      key: "managed-update:apply",
      label: "Apply eligible managed updates",
      operation: "apply",
      componentIds: ["opl_base", "opl_packages"],
      confirmationRequired: true,
      availability: "ready",
      sourceRef: "opl-runtime.run-managed-update-apply"
    }]
  });

  const byId = Object.fromEntries(viewModel.managedUpdates.map((item) => [item.componentId, item]));
  assert.deepEqual(byId.opl_app.actions.map((action) => [action.transport, action.operation]), [["native_app_updater", "check"]]);
  assert.deepEqual(byId.opl_base.actions.map((action) => [action.transport, action.operation]), [["managed_update_host", "apply"]]);
  assert.deepEqual(byId.opl_packages.actions.map((action) => [action.transport, action.operation]), [["managed_update_host", "apply"]]);
  assert.equal(byId.opl_base.component?.lifecycleOwner, "one-person-lab");
});
