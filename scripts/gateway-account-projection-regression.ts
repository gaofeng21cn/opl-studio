import assert from "node:assert/strict";
import { deriveWorkbenchModelFromState } from "../plugins/core/opl-studio-client/src/client/workbench/workbenchModel";

function stateWithGateway(overrides: Record<string, unknown> = {}) {
  return {
    app_state: {
      core: {
        codex: {
          installed: true,
          parsed_version: "0.147.0",
          version_status: "compatible",
          binary_path: "/usr/local/bin/codex",
          update_available: false
        }
      },
      settings_control_center: {
        status_summary: {
          runtime_source_carrier_health: "5/5",
          agent_package_functional_health: "18/25",
          temporal_provider: "ready",
          release_channel: "stable",
          issue_count: 1
        },
        app_settings_read_model: {
          codex_model_policy: {
            model: "gpt-5.6-sol",
            reasoning_effort: "max",
            provider_name: "OPL Gateway",
            config_path: "/Users/test/.codex/config.toml",
            api_key_present: true,
            access_status: "ready"
          },
          local_environment: {
            state_dir: "/state",
            runtime_sources_root: "/runtime-sources",
            logs_dir: "/logs",
            release_channel: "stable",
            temporal_provider: "ready"
          },
          workspace_services: {
            workspace_root: {
              selected_path: "/Users/test/workspace",
              exists: true,
              writable: true,
              health_status: "ready"
            },
            personalization_refs: { source_refs: ["user-agents", "opl-context"] }
          },
          connections: {
            connections: [
              { connection_id: "opl-gateway-account", connection_type: "opl_gateway_account", name: "Gateway" },
              { connection_id: "lab-hpc", connection_type: "ssh_hpc", name: "Lab HPC", status: "ready" }
            ]
          },
          docker_webui: {
            ordinary_status: "action_available",
            runtime_proxy: { status: "diagnose_with_doctor" },
            failure_recovery: { status: "available" }
          },
          storage_lifecycle: {
            agent_package_store: { status: "ready", bytes: 2048, reclaimable_bytes: 512 },
            webui_data_volume: { status: "unavailable", reason_code: "inventory_missing" }
          },
          opl_gateway_account: {
            surface_kind: "opl_gateway_account_read_model.v1",
            connection_mode: "account",
            status: "connected",
            account_card_visible: true,
            account: {
              display_name: "OPL User",
              email: "opl-user@example.com",
              masked_email: "masked-value-must-not-be-consumed",
              status: "active",
              balance: { amount: 128.4, currency: "CNY" }
            },
            usage: {
              today_tokens: 32800,
              total_tokens: 983200,
              today_actual_cost: 1.42,
              total_actual_cost: 42.18,
              currency: "CNY",
              day_timezone: "Asia/Shanghai"
            },
            managed_key: { name: "OPL App · Test Mac · 7F31A9C2", status: "active" },
            installation: { device_label: "Test Mac", short_id: "7F31A9C2" },
            freshness: { observed_at: "2026-08-09T03:39:22.845Z", stale: false, last_error_code: null },
            ...overrides
          }
        }
      }
    }
  };
}

const connected = deriveWorkbenchModelFromState(stateWithGateway());
assert.equal(connected.gatewayAccount?.displayName, "OPL User");
assert.equal(connected.gatewayAccount?.email, "opl-user@example.com");
assert.equal(connected.gatewayAccount?.accountStatus, "active");
assert.deepEqual(connected.gatewayAccount?.balance, { amount: 128.4, currency: "CNY" });
assert.equal(connected.gatewayAccount?.usage?.todayTokens, 32800);
assert.equal(connected.gatewayAccount?.usage?.totalCost, 42.18);
assert.equal(connected.gatewayAccount?.managedKey?.status, "active");
assert.equal(connected.gatewayAccount?.installation?.deviceLabel, "Test Mac");
assert.equal(connected.gatewayAccount?.freshness?.stale, false);
assert.equal(JSON.stringify(connected.gatewayAccount).includes("masked-value-must-not-be-consumed"), false);
assert.equal(connected.settingsProjection?.codex.version, "0.147.0");
assert.equal(connected.settingsProjection?.codex.model, "gpt-5.6-sol");
assert.equal(connected.settingsProjection?.workspace.selectedPath, "/Users/test/workspace");
assert.equal(connected.settingsProjection?.workspace.personalizationSourceCount, 2);
assert.deepEqual(connected.settingsProjection?.externalConnections.map((item) => item.id), ["lab-hpc"]);
assert.equal(connected.settingsProjection?.storage.agentPackageStore.bytes, 2048);
assert.equal(connected.settingsProjection?.statusSummary.issueCount, 1);
assert.equal(connected.settingsProjection?.gatewayConnectionMode, "account");

for (const [projection, expectedMode] of [
  [{ connection_mode: "manual_key" }, "manual_key"],
  [{ connection_mode: "none" }, "none"],
  [{ status: "not_connected" }, "account"],
  [{ account_card_visible: false }, "account"],
  [{ account: { display_name: "" } }, "account"],
  [{ surface_kind: "unknown" }, "none"]
] as const) {
  const projected = deriveWorkbenchModelFromState(stateWithGateway(projection));
  assert.equal(projected.gatewayAccount, undefined);
  assert.equal(projected.settingsProjection?.gatewayConnectionMode, expectedMode);
}

for (const projection of [
  { connection_mode: "manual-key" },
  { connection_mode: "api_key" }
]) {
  assert.equal(deriveWorkbenchModelFromState(stateWithGateway(projection)).settingsProjection?.gatewayConnectionMode, "none");
}

for (const status of ["setup_required", "reauth_required", "attention_needed", "disconnect_pending"]) {
  assert.equal(deriveWorkbenchModelFromState(stateWithGateway({ status })).gatewayAccount?.displayName, "OPL User");
}
