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

test("managed companions consume Framework browser automation through the canonical action catalog", () => {
  const projection = readManagedCompanions({
    app_state: {
      managed_companions: [{
        surface_kind: "opl_managed_browser_automation_projection",
        provider_id: "playwright-mcp",
        product_name: "Browser Automation",
        version: "0.0.70",
        status: "ready",
        ready: true,
        installed: true,
        registered: true,
        enabled: true,
        permission: "not_required",
        health_ref: "opl://managed-browser-automation/playwright-mcp",
        available_actions: [
          "settings_recheck_browser_automation",
          "settings_repair_browser_automation",
          "settings_reinstall_browser_automation",
          "settings_unknown_browser_automation"
        ]
      }],
      actions: [
        validAction("settings_recheck_browser_automation", { label: "Recheck browser" }),
        validAction("settings_repair_browser_automation", { label: "Repair", danger_level: "low" }),
        validAction("settings_reinstall_browser_automation", {
          label: "Reinstall",
          confirmation_required: true,
          danger_level: "medium"
        })
      ]
    }
  });

  assert.deepEqual(projection[0], {
    surfaceKind: "opl_managed_browser_automation_projection",
    providerId: "playwright-mcp",
    productName: "Browser Automation",
    version: "0.0.70",
    status: "ready",
    ready: true,
    installed: true,
    registered: true,
    enabled: true,
    permission: "not_required",
    healthRef: "opl://managed-browser-automation/playwright-mcp",
    actions: [
      { actionId: "settings_recheck_browser_automation", label: "Recheck browser", confirmationRequired: false },
      { actionId: "settings_repair_browser_automation", label: "Repair", confirmationRequired: false, dangerLevel: "low" },
      { actionId: "settings_reinstall_browser_automation", label: "Reinstall", confirmationRequired: true, dangerLevel: "medium" }
    ]
  });
});

test("managed companions stay absent when the producer is absent or outside the Framework namespace", () => {
  assert.deepEqual(readManagedCompanions({ app_state: { actions: [] } }), []);
  assert.deepEqual(readManagedCompanions({
    app_state: {
      managed_companions: [{
        surface_kind: "forged_browser_automation_projection",
        provider_id: "playwright-mcp",
        product_name: "Browser Automation"
      }],
      actions: []
    }
  }), []);
});

test("managed companions drop actions that bypass the canonical App action boundary", () => {
  const projection = readManagedCompanions({
    app_state: {
      managed_companions: [{
        surface_kind: "opl_managed_browser_automation_projection",
        provider_id: "playwright-mcp",
        product_name: "Browser Automation",
        available_actions: [
          "settings_recheck_browser_automation",
          "settings_repair_browser_automation",
          "settings_reinstall_browser_automation"
        ]
      }],
      actions: [
        validAction("settings_recheck_browser_automation", { surface: "direct provider call" }),
        validAction("settings_repair_browser_automation", { payload_fields: ["provider_id"] }),
        validAction("settings_reinstall_browser_automation", { can_submit_to_safe_action_shell: false })
      ]
    }
  });

  assert.equal(projection.length, 1);
  assert.deepEqual(projection[0]?.actions, []);
});
