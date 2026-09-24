import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveAppRepoRoot } from "../scripts/resolve-app-repo-root.mjs";
import {
  createDeepLinkDelivery, createDeepLinkPolicy, extractDeepLinkPayloadFromArgv,
  extractSecondInstanceDeepLinkPayload, parseDeepLinkUrl, validateDeepLinkPayload
} from "./deep-links.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolveAppRepoRoot(root);
const gui = JSON.parse(fs.readFileSync(path.join(appRoot, "contracts/app-gui-product-contract.json"), "utf8"));
const settings = JSON.parse(fs.readFileSync(path.join(appRoot, "contracts/app-settings-control-plane.json"), "utf8"));
const policy = createDeepLinkPolicy(gui, settings);
const payload = route => ({ action: "navigate", params: { route } });

test("deep links consume every exact App route without a second route registry", () => {
  const routes = [...gui.branded_deep_link_policy.route_registry.static_exact_routes,
    ...settings.ordinary_routes.map(entry => entry.path), ...settings.secondary_pages.map(entry => entry.path)];
  assert.deepEqual(policy.routes, routes);
  for (const route of routes) {
    assert.deepEqual(parseDeepLinkUrl(`opl://navigate?route=${encodeURIComponent(route)}`, policy),
      { valid: true, payload: payload(route) });
    assert.equal(validateDeepLinkPayload(payload(route), policy).valid, true);
  }
});

test("deep links reject secret actions, payloads, authority, duplicates and route aliases without retaining input", () => {
  const invalid = [
    "aionui://navigate?route=/guid", "https://navigate?route=/guid", "opl://provider/add?token=secret",
    "opl://add-provider?data=eyJjcmVkZW50aWFsIjoic2VjcmV0In0=", "opl://user:secret@navigate?route=/guid",
    "opl://navigate:123?route=/guid", "opl://navigate/?route=/guid", "opl:///navigate?route=/guid",
    "opl://navigate?route=/guid#", "opl://navigate?route=/guid#secret", "opl://navigate?route=/guid&route=/archived",
    "opl://navigate?route=/guid&source=mail", "opl://navigate?route=/guid&token=secret", "opl://navigate?route=sk-example",
    "opl://navigate?route=Bearer%20secret", "opl://navigate?route=github_pat_secret", "opl://navigate?route=ghp_secret",
    "opl://navigate?route=eyJleGFtcGxlIg==", "opl://navigate?route=%252Fguid", "opl://navigate?route=%2Fguid%3Fx=1",
    "opl://navigate?route=/runtime", "opl://navigate?route=/conversation/thread-id", "opl://navigate?route=/first-run",
    "opl://navigate?route=/guid/../archived", "opl://navigate?route=//guid", "opl://navigate?route=/guid/",
    "opl://navigate?route=", "opl://navigate", " opl://navigate?route=/guid", "opl://navigate?route=/gu\tid",
    `opl://navigate?route=${"x".repeat(2048)}`, null
  ];
  for (const raw of invalid) {
    const result = parseDeepLinkUrl(raw, policy);
    assert.equal(result.valid, false, String(raw));
    assert.deepEqual(Object.keys(result).sort(), ["reason", "valid"]);
    assert.match(result.reason, /^[a-z_]+$/);
  }
  assert.equal(validateDeepLinkPayload({ ...payload("/guid"), token: "secret" }, policy).valid, false);
  assert.equal(validateDeepLinkPayload({ action: "navigate", params: { route: "/guid", data: "secret" } }, policy).valid, false);
  assert.equal(validateDeepLinkPayload({ action: "navigate", params: Object.assign(Object.create({ route: "/guid" }), { other: true }) }, policy).valid, false);
  assert.equal(validateDeepLinkPayload(payload("/guid"), undefined).valid, false);
});

test("cold argv, macOS URL and second-instance payloads share validation and fail open", () => {
  const rejections = [];
  const rejected = reason => rejections.push(reason);
  const argv = ["electron", "--flag", "opl://navigate?route=/unknown", "opl://navigate?route=%2Fguid"];
  assert.deepEqual(extractDeepLinkPayloadFromArgv(argv, policy, rejected), payload("/guid"));
  assert.deepEqual(extractSecondInstanceDeepLinkPayload(argv, { deepLinkPayload: payload("/archived") }, policy, rejected), payload("/archived"));
  assert.deepEqual(extractSecondInstanceDeepLinkPayload(argv, { deepLinkPayload: { token: "secret" } }, policy, rejected), payload("/guid"));
  assert.equal(rejections.every(reason => /^[a-z_]+$/.test(reason)), true);
});

test("delivery queues only validated links until the renderer has subscribed and keeps a bounded queue", () => {
  const received = [], reasons = [];
  const delivery = createDeepLinkDelivery({ policy, emit: value => received.push(value), onReject: reason => reasons.push(reason) });
  delivery.acceptArgv(["opl://navigate?route=/guid"]);
  delivery.acceptUrl("opl://navigate?route=/archived");
  delivery.acceptSecondInstance([], { deepLinkPayload: payload("/scheduled") });
  delivery.acceptUrl("opl://navigate?token=secret");
  assert.deepEqual(received, []);
  assert.equal(delivery.pendingCount(), 3);
  assert.deepEqual(delivery.takePending(), [payload("/guid"), payload("/archived"), payload("/scheduled")]);
  delivery.acceptUrl("opl://navigate?route=/settings/general");
  assert.deepEqual(received, [payload("/settings/general")]);
  assert.equal(delivery.pendingCount(), 0);
  assert.deepEqual(reasons, ["sensitive_data"]);
  delivery.deactivate();
  for (let index = 0; index < 20; index++) delivery.acceptUrl("opl://navigate?route=/guid");
  assert.equal(delivery.pendingCount(), 16);
  assert.equal(delivery.takePending().length, 16);
});
