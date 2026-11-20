import assert from "node:assert/strict";
import test from "node:test";

import { readManagedCompanions } from "../../plugins/opl-studio-client/src/client/workbench/managedCompanions.ts";

function validAction(actionId: string, overrides: Record<string, unknown> = {}) {
  return {
    action_id: actionId,
    label: actionId,
    surface: "opl app action execute",
    submit_via: "opl app action execute",
    payload_fields: [],
    route_requires_domain_or_app_payload: false,
    can_submit_to_safe_action_shell: true,
    confirmation_required: false,
    ...overrides
  };
}

test("managed companions consume every Framework companion through the canonical action catalog", () => {
  const projection = readManagedCompanions({
    app_state: {
      managed_companions: [{
        surface_kind: "opl_managed_computer_use_projection",
        provider_id: "kimi-cu",
        product_name: "KimiCU",
        version: "0.5.4",
        status: "permission_required",
        ready: false,
        installed: true,
        registered: true,
        enabled: true,
        permission: "required",
        health_ref: "opl://managed-computer-use/kimi-cu",
        available_actions: [
          "settings_request_computer_use_permissions",
          "settings_recheck_computer_use",
          "settings_repair_computer_use",
          "settings_reinstall_computer_use",
          "settings_unknown_computer_use"
        ]
      }, {
        surface_kind: "opl_managed_browser_automation_projection",
        provider_id: "playwright-mcp",
        product_name: "Browser Automation",
        status: "not_registered",
        ready: false,
        installed: true,
        registered: false,
        enabled: false,
        permission: "not_required",
        available_actions: ["settings_recheck_browser_automation"]
      }],
      actions: [
        validAction("settings_request_computer_use_permissions", { label: "Allow permissions" }),
        validAction("settings_recheck_computer_use", { label: "Recheck" }),
        validAction("settings_repair_computer_use", { label: "Repair", danger_level: "low" }),
        validAction("settings_reinstall_computer_use", {
          label: "Reinstall",
          confirmation_required: true,
          danger_level: "medium"
        }),
        validAction("settings_recheck_browser_automation", { label: "Recheck browser" })
      ]
    }
  });

  assert.deepEqual(projection[0], {
    surfaceKind: "opl_managed_computer_use_projection",
    providerId: "kimi-cu",
    productName: "KimiCU",
    version: "0.5.4",
    status: "permission_required",
    ready: false,
    installed: true,
    registered: true,
    enabled: true,
    permission: "required",
    healthRef: "opl://managed-computer-use/kimi-cu",
    actions: [
      { actionId: "settings_request_computer_use_permissions", label: "Allow permissions", confirmationRequired: false },
      { actionId: "settings_recheck_computer_use", label: "Recheck", confirmationRequired: false },
      { actionId: "settings_repair_computer_use", label: "Repair", confirmationRequired: false, dangerLevel: "low" },
      { actionId: "settings_reinstall_computer_use", label: "Reinstall", confirmationRequired: true, dangerLevel: "medium" }
    ]
  });
  assert.equal(projection[1]?.providerId, "playwright-mcp");
  assert.deepEqual(projection[1]?.actions.map((action) => action.actionId), ["settings_recheck_browser_automation"]);
});

test("managed companions stay absent when the producer is absent or outside the Framework namespace", () => {
  assert.deepEqual(readManagedCompanions({ app_state: { actions: [] } }), []);
  assert.deepEqual(readManagedCompanions({
    app_state: {
      managed_companions: [{
        surface_kind: "forged_computer_use_projection",
        provider_id: "kimi-cu",
        product_name: "KimiCU"
      }],
      actions: []
    }
  }), []);
});

test("managed Computer Use drops actions that bypass the canonical App action boundary", () => {
  const projection = readManagedCompanions({
    app_state: {
      managed_companions: [{
        surface_kind: "opl_managed_computer_use_projection",
        provider_id: "kimi-cu",
        product_name: "KimiCU",
        available_actions: [
          "settings_recheck_computer_use",
          "settings_repair_computer_use",
          "settings_reinstall_computer_use"
        ]
      }],
      actions: [
        validAction("settings_recheck_computer_use", { surface: "direct provider call" }),
        validAction("settings_repair_computer_use", { payload_fields: ["provider_id"] }),
        validAction("settings_reinstall_computer_use", { can_submit_to_safe_action_shell: false })
      ]
    }
  });

  assert.equal(projection.length, 1);
  assert.deepEqual(projection[0]?.actions, []);
});
