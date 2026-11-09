import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { applySettingsShellNavigation, resolveDeepLinkDestination } from "../../src/workbench/deepLinkNavigation.ts";
import { createDeepLinkPolicy } from "../../desktop/deep-links.mjs";
import { resolveAppRepoRoot } from "../../scripts/resolve-app-repo-root.mjs";
import { createSettingsShellStore } from "../../src/vendor/deepseek-harness/packages/client/ui-settings-general/src/client/shell-store.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appRoot = resolveAppRepoRoot(root);
const readContract = file => JSON.parse(fs.readFileSync(path.join(appRoot, "contracts", file), "utf8"));
const policy = createDeepLinkPolicy(readContract("app-gui-product-contract.json"), readContract("app-settings-control-plane.json"));

test("every admitted App deep-link route has an existing Studio presentation and renderer rejects unadmitted routes", () => {
  for (const route of policy.routes) {
    const result = resolveDeepLinkDestination({ action: "navigate", params: { route } }, policy);
    assert.ok(result, route);
  }
  assert.deepEqual(resolveDeepLinkDestination({ action: "navigate", params: { route: "/archived" } }, policy), { kind: "conversation", scope: "archived" });
  assert.deepEqual(resolveDeepLinkDestination({ action: "navigate", params: { route: "/scheduled" } }, policy), { kind: "schedules" });
  assert.deepEqual(resolveDeepLinkDestination({ action: "navigate", params: { route: "/apps" } }, policy), { kind: "application_management" });
  assert.deepEqual(resolveDeepLinkDestination({ action: "navigate", params: { route: "/apps?section=resources" } }, policy), { kind: "application_management", section: "resources" });
  assert.deepEqual(resolveDeepLinkDestination({ action: "navigate", params: { route: "/settings/environment?section=updates" } }, policy), { kind: "application_management", section: "updates" });
  assert.equal(resolveDeepLinkDestination({ action: "navigate", params: { route: "/apps?section=invalid" } }, policy), null);
  assert.deepEqual(resolveDeepLinkDestination({ action: "navigate", params: { route: "/settings/access" } }, policy), { kind: "settings", destination: "models" });
  assert.equal(resolveDeepLinkDestination({ action: "navigate", params: { route: "/runtime" } }, policy), null);
  assert.equal(resolveDeepLinkDestination({ action: "navigate", params: { route: "/settings/access", token: "secret" } }, policy), null);
  assert.equal(resolveDeepLinkDestination({ action: "navigate", params: { route: "/guid" } }, null), null);
});

test("preload installs the live listener before taking pending links and does not redeliver on resubscription", async () => {
  const calls = [], handlers = new Map();
  let exposed;
  let releasePending;
  const pending = new Promise(resolve => { releasePending = resolve; });
  vm.runInNewContext(fs.readFileSync(path.join(root, "desktop/preload.cjs"), "utf8"), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { exposed = value; } },
      ipcRenderer: {
        on: (event, callback) => { calls.push("subscribe"); handlers.set(callback, event); },
        removeListener: (_event, callback) => handlers.delete(callback),
        invoke: (_channel, request) => { calls.push(request.method); return pending; }
      }, webUtils: {} })
  });
  const events = [];
  const dispose = exposed.subscribeEvents(value => events.push(value));
  assert.deepEqual(calls, ["subscribe", "readPendingDeepLinks"]);
  const payload = { action: "navigate", params: { route: "/guid" } };
  releasePending([payload]);
  await Promise.resolve();
  assert.equal(events.length, 1);
  assert.equal(events[0].method, "desktop/deep-link");
  assert.deepEqual(events[0].params, payload);
  dispose();
  exposed.subscribeEvents(value => events.push(value));
  assert.equal(calls.filter(call => call === "readPendingDeepLinks").length, 1);
  assert.equal(events.length, 1);
});

test("native settings store shares section navigation and dialog dismissal across entry points", () => {
  const settings = createSettingsShellStore().create();
  assert.deepEqual(settings.getSnapshot(), { open: false, activeId: undefined });

  settings.actions.openSection("opl-studio-settings-preferences");
  assert.deepEqual(settings.getSnapshot(), { open: true, activeId: "opl-studio-settings-preferences" });

  settings.actions.select("opl-studio-settings-agents");
  assert.deepEqual(settings.getSnapshot(), { open: true, activeId: "opl-studio-settings-agents" });

  settings.actions.close();
  assert.deepEqual(settings.getSnapshot(), { open: false, activeId: undefined });

  settings.actions.openSection("opl-studio-settings-account");
  assert.deepEqual(settings.getSnapshot(), { open: true, activeId: "opl-studio-settings-account" });
});

test("shortcut opens settings and non-settings navigation closes the same native store", () => {
  const settings = createSettingsShellStore().create();
  applySettingsShellNavigation({ open: true, revision: 1 }, settings.actions);
  assert.equal(settings.getSnapshot().open, true);
  applySettingsShellNavigation({ open: true, destination: "preferences", revision: 2 }, settings.actions, "opl-studio-settings-preferences");
  assert.equal(settings.getSnapshot().activeId, "opl-studio-settings-preferences");
  applySettingsShellNavigation({ open: false, revision: 3 }, settings.actions);
  assert.deepEqual(settings.getSnapshot(), { open: false, activeId: undefined });
  applySettingsShellNavigation({ open: true, revision: 4 }, settings.actions);
  assert.deepEqual(settings.getSnapshot(), { open: true, activeId: undefined });
});
