import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { resolveDeepLinkDestination } from "../../src/workbench/deepLinkNavigation.ts";
import { createDeepLinkPolicy } from "../../desktop/deep-links.mjs";
import { resolveAppRepoRoot } from "../../scripts/resolve-app-repo-root.mjs";
import { applySettingsNavigationOverlay, SETTINGS_NAVIGATION_ANCHOR, verifySettingsNavigationOverlay } from "../../scripts/dsh-settings-navigation-overlay.mjs";

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
  assert.deepEqual(resolveDeepLinkDestination({ action: "navigate", params: { route: "/scheduled" } }, policy), { kind: "settings", destination: "services" });
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

test("settings navigation overlay binds pristine upstream bytes and rejects an ambiguous or changed anchor", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "src/composition/deepseekHarnessSourceManifest.json"), "utf8"));
  const transformed = verifySettingsNavigationOverlay(root, manifest);
  assert.match(transformed, /openSection\(navigationRequest.sectionId\)/);
  assert.match(transformed, /if \(!navigationRequest.sectionId\) \{ close\(\); return \}/);
  assert.throws(() => applySettingsNavigationOverlay("changed source"), /one exact pinned source anchor/);
  assert.throws(() => applySettingsNavigationOverlay(SETTINGS_NAVIGATION_ANCHOR.repeat(2)), /one exact pinned source anchor/);
  const changed = structuredClone(manifest);
  changed.build_overlays[0].source_sha256 = "0".repeat(64);
  assert.throws(() => verifySettingsNavigationOverlay(root, changed), /exact source and pinned target/);
});
