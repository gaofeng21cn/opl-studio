import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { compactFastState, createOplPassthrough } from "./opl-passthrough.mjs";

const action = (action_id) => ({ action_id, label: action_id, route: "opl app action execute", internal_trace: "omit" });

test("startup state keeps owner actions offered by retained knowledge, source, and contribution views", () => {
  const catalog = Array.from({ length: 140 }, (_, index) => action(`unrelated_${index}`));
  catalog.push(...["knowledge_source_configure", "knowledge_source_list", "source_install", "source_check", "package_command"].map(action));
  const tasks = Array.from({ length: 80 }, (_, index) => ({ action_id: `task_${index}` }));
  tasks.push({ action_id: "knowledge_source_configure", follow_up_action_ids: ["knowledge_source_list"] });
  tasks.push({ action_id: "source_install", verify_action_id: "source_check" });
  const { app_state: state } = compactFastState({ app_state: {
    actions: catalog,
    application_management: { shared_resources: [{ resource_id: "knowledge:personal", action_ids: ["knowledge_source_configure", "projection_only_action"] }] },
    agent_packages: { sources: { entries: [{ source_id: "brew", source_kind: "tap", native_items: [{
      item_id: "cask:publisher/tap/native-app", name: "native-app", available_actions: [
        { action_id: "source_install", default_payload: { item_id: "cask:publisher/tap/native-app", expected_revision: "revision", action_id: "unrelated_139" } }
      ]
    }] }] } },
    ui_contributions: { entries: [{ contribution_id: "package-view", commands: [{ command_id: "run", action_ref: "app_state.actions#package_command" }] }] },
    settings_control_center: { task_entries: tasks }
  } });
  const ids = new Set(state.actions.map((entry) => entry.action_id));
  for (const id of ["knowledge_source_configure", "knowledge_source_list", "source_install", "source_check", "package_command"]) {
    assert.ok(ids.has(id), `${id} must remain executable`);
  }
  assert.equal(ids.size, 105);
  assert.equal(ids.has("unrelated_139"), false);
  assert.equal(ids.has("projection_only_action"), false);
  assert.equal("internal_trace" in state.actions.at(-1), false);
  assert.ok(state.settings_control_center.task_entries.some((entry) => entry.action_id === "knowledge_source_configure"));
  assert.ok(state.settings_control_center.task_entries.some((entry) => entry.action_id === "source_install"));
  assert.equal(state.settings_control_center.task_entries.some((entry) => entry.action_id === "task_79"), false);
});

test("startup action retention remains bounded to retained views and closes follow-up cycles", () => {
  const catalog = Array.from({ length: 120 }, (_, index) => action(`unrelated_${index}`));
  catalog.push(action("retained"), action("verify"), action("discarded_view"));
  const resources = [{ resource_id: "first", action_ids: ["retained"] },
    ...Array.from({ length: 99 }, (_, index) => ({ resource_id: `resource_${index}` })),
    { resource_id: "outside_startup_budget", action_ids: ["discarded_view"] }];
  const { app_state: state } = compactFastState({ app_state: {
    actions: catalog,
    application_management: { shared_resources: resources },
    settings_control_center: { task_entries: [
      { action_id: "retained", follow_up_action_ids: ["verify"] },
      { action_id: "verify", follow_up_action_ids: ["retained"] }
    ] }
  } });
  const ids = new Set(state.actions.map((entry) => entry.action_id));
  assert.equal(ids.size, 102);
  assert.equal(ids.has("retained"), true);
  assert.equal(ids.has("verify"), true);
  assert.equal(ids.has("discarded_view"), false);
  assert.equal(ids.has("unrelated_119"), false);
});

test("native source receipts preserve partial readback and give Homebrew its lifecycle execution budget", async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-native-source-receipt-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const command = path.join(directory, "fake-opl");
  await writeFile(command, `#!${process.execPath}
const actionId = process.argv[process.argv.indexOf('--action') + 1];
console.log(JSON.stringify({ app_action_execution: { status: 'completed', result: {
  native_action: { action_id: actionId, status: process.env.TEST_NATIVE_STATUS,
    reason_code: process.env.TEST_NATIVE_STATUS === 'needs_attention' ? 'homebrew_native_readback_unverified' : null },
  native_inventory: { inventory_status: 'available', native_items: [{ item_id: 'cask:publisher/tap/native-app', installed: true }] }
} } }));
`);
  await chmod(command, 0o755);
  const timers = [];
  const nativeSetTimeout = globalThis.setTimeout;
  context.mock.method(globalThis, "setTimeout", (callback, delay, ...args) => {
    timers.push(delay);
    return nativeSetTimeout(callback, delay, ...args);
  });
  for (const [actionId, ownerStatus, expectedStatus] of [
    ["source_install", "completed", "executed"],
    ["source_update", "needs_attention", "error"],
    ["source_uninstall", "needs_attention", "error"],
    ["source_refresh", "completed", "executed"],
    ["source_setup", "already_connected", "no_op"]
  ]) {
    const passthrough = createOplPassthrough({ command, cwd: directory, allowActions: true,
      env: { ...process.env, TEST_NATIVE_STATUS: ownerStatus } });
    const receipt = await passthrough.executeAction({ actionId, dryRun: false, mode: "execute", payload: { confirmed: true } });
    assert.equal(receipt.exitCode, 0);
    assert.equal(receipt.status, expectedStatus);
    assert.equal(receipt.stdoutJson.app_action_execution.result.native_inventory.native_items[0].installed, true);
    assert.equal(receipt.blockedReason, ownerStatus === "needs_attention" ? "owner_needs_attention" : undefined);
    assert.equal(timers.at(-1), 20 * 60_000, `${actionId} needs the lifecycle budget`);
  }
});
