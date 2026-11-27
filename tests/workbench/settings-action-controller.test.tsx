import React, { act } from "react";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { deriveWorkbenchModelFromState } from "../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel";
import { useSettingsActions } from "../../plugins/core/opl-studio-client/src/client/workbench/useSettingsActions";

let browser: Window;
let root: ReturnType<typeof import("react-dom/client").createRoot>;
let controller: ReturnType<typeof useSettingsActions>;
const keys = ["window", "document", "navigator", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"];
let originals: Map<string, PropertyDescriptor | undefined>;
let dependencies: Parameters<typeof useSettingsActions>[0];
let calls: unknown[];
const request = { key: "workbench:task_demo", actionId: "demo", label: "Demo", payload: { target: "item" }, confirmationRequired: true };

beforeEach(async () => {
  browser = new Window({ url: "http://localhost/" });
  originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : key === "window" ? browser : (browser as any)[key] });
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  calls = [];
  dependencies = {
    bridge: { executeAction: async input => {
      calls.push(input);
      return { actionId: input.actionId, payload: input.payload, status: input.dryRun ? "preview_ready" : "executed", stdoutJson: {}, stderr: "", confirmationId: "confirmation-1", receiptId: "receipt-1" } as any;
    } },
    settings: { locale: "en", runtimeProfile: "fast" }, model: { managedCompanions: [] },
    packageOperations: { supportsBackground: undefined, accept: () => false },
    captureManagedUpdateReceipt: () => { calls.push("capture"); },
    loadState: async profile => { calls.push(["state", profile]); return deriveWorkbenchModelFromState({}); },
    loadInitialize: async () => { calls.push("initialize"); return {}; }
  };
});
afterEach(async () => {
  await act(async () => root.unmount()); browser.close();
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
});
function Harness() {
  controller = useSettingsActions(dependencies);
  return <><button onClick={() => void controller.runSettingsAction(request)}>Run</button><button onClick={() => void controller.confirmSettingsAction()}>Confirm</button><button onClick={controller.cancelSettingsAction}>Cancel</button><output>{controller.settingsActionConfirmation ? "Confirm required" : controller.settingsActionFeedback?.message ?? "Ready"}</output></>;
}
async function mount() { await act(async () => root.render(<Harness />)); }
async function click(label: string) { await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === label)!.click()); }

test("preview survives rerender and confirmation executes once with the exact owner tokens before fresh readback", async () => {
  await mount(); const settled: unknown[] = [];
  controller.workbenchActionResolver.current = { key: request.key, resolve: result => settled.push(result) };
  await click("Run");
  expect(document.querySelector("output")!.textContent).toBe("Confirm required");
  await mount(); await click("Confirm");
  expect(calls).toEqual([
    { actionId: "demo", payload: { target: "item" }, dryRun: true },
    { actionId: "demo", payload: { target: "item", confirmed: true, confirmationId: "confirmation-1", receiptId: "receipt-1" }, dryRun: false },
    "capture", ["state", "fast"]
  ]);
  expect(settled).toHaveLength(1); expect((settled[0] as any).status).toBe("executed");
  expect(document.querySelector("output")!.textContent).toContain("completed and state was refreshed");
  await click("Confirm"); expect(calls).toHaveLength(4);
});
test("cancel and unmount settle pending workbench requests without executing the mutation", async () => {
  await mount(); const settled: unknown[] = [];
  controller.workbenchActionResolver.current = { key: request.key, resolve: result => settled.push(result) };
  await click("Run"); await click("Cancel");
  expect(settled).toEqual([{ status: "cancelled" }]); expect(calls).toHaveLength(1);
  controller.workbenchActionResolver.current = { key: "other", resolve: result => settled.push(result) };
  await act(async () => root.unmount());
  expect(settled).toEqual([{ status: "cancelled" }, { status: "cancelled" }]);
  // afterEach can safely unmount the already-closed root.
});
test("an executed action with failed fresh readback reports attention and settles the original receipt", async () => {
  dependencies.loadState = async () => null;
  await mount(); const settled: unknown[] = [];
  controller.workbenchActionResolver.current = { key: request.key, resolve: result => settled.push(result) };
  await click("Run"); await click("Confirm");
  expect(controller.settingsActionFeedback?.tone).toBe("attention");
  expect(controller.settingsActionFeedback?.message).toContain("do not submit it again");
  expect((settled[0] as any).status).toBe("executed");
});


test("Gateway login and manual refresh only finish setup with a group resolved by the owner", async () => {
  const first = { group_id: "team", label: "Research" };
  const code = { group_id: "models", label: "Team Codex Premium" };
  const setup = "gateway_account_complete_setup";
  function pending(groups: typeof first[], resolution: { resolved_group_id?: string | null }, hasKey = false) {
    return deriveWorkbenchModelFromState({ app_state: {
      actions: [{ action_id: setup, payload_fields: ["group_id"] }],
      settings_control_center: { app_settings_read_model: { opl_gateway_account: {
        surface_kind: "opl_gateway_account_read_model.v1", connection_mode: "account", account_card_visible: true,
        account: { display_name: "OPL User" }, status: hasKey ? "connected" : "setup_required",
        managed_key: hasKey ? { name: "Test key", status: "active" } : null,
        available_groups: groups, ...resolution, actions: { complete_setup: setup }
      } } }
    } });
  }
  const ready = pending([first, code], { resolved_group_id: code.group_id }, true);
  let model = pending([first, code], { resolved_group_id: null });
  dependencies.loadState = async () => model;
  await mount();
  // Login has no authority to re-interpret the labels or arbitrarily choose the first group.
  await expect(controller.finishGatewaySetup()).rejects.toThrow("Check the available groups");
  expect(calls).toEqual([]);
  // Earlier Framework projections omit the resolved ID. Duplicates remain ambiguous.
  model = pending([code, { ...first, label: "Codex Test" }], {});
  await expect(controller.finishGatewaySetup()).rejects.toThrow("Check the available groups");
  expect(calls).toEqual([]);
  expect(pending([first, code], {}).gatewayAccount?.resolvedGroupId).toBe(code.group_id);
  expect(pending([first], {}).gatewayAccount?.resolvedGroupId).toBe(first.group_id);
  expect(pending([first, code], { resolved_group_id: "removed" }).gatewayAccount?.resolvedGroupId).toBeUndefined();

  model = pending([first, code], { resolved_group_id: code.group_id });
  const reads: string[] = [];
  dependencies.loadState = async profile => {
    reads.push(profile);
    return reads.length === 1 ? model : ready;
  };
  await mount();
  await act(async () => controller.runSettingsAction({
    key: "gateway:refresh", actionId: "gateway_account_refresh", label: "Refresh",
    payload: {}, confirmationRequired: false
  }));
  expect(calls).toEqual([
    { actionId: "gateway_account_refresh", payload: { confirmed: true }, dryRun: false },
    "capture",
    { actionId: setup, payload: { group_id: "models", confirmed: true }, dryRun: false }
  ]);
  expect(reads).toEqual(["fast", "fast"]);
  expect(controller.settingsActionFeedback?.tone).toBe("success");
  await controller.finishGatewaySetup();
  expect(calls).toHaveLength(3);
});
