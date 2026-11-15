import React, { act } from "react";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { useSettingsActions } from "../../src/workbench/useSettingsActions";

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
    packageOperations: { supported: false, accept: () => false },
    captureManagedUpdateReceipt: () => { calls.push("capture"); },
    loadState: async profile => { calls.push(["state", profile]); return {}; },
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
