import assert from "node:assert/strict";
import test from "node:test";
import { aionInvokeExpression, parseUpgradeVmArgs } from "../../scripts/desktop/stable-upgrade-vm.mjs";

test("upgrade VM driver is restricted to task-owned Tart guests and exact targets", () => {
  const args = ["--vm", "opl-studio-cutover-aion-v26-9-23", "--route", "aion", "--target-version", "26.9.2491", "--ssh-key", "/tmp/key", "--out", "/tmp/result.json"];
  assert.equal(parseUpgradeVmArgs(args).networkMode, "controlled_exact_candidate");
  assert.throws(() => parseUpgradeVmArgs([...args, "--vm", "personal-workstation"]), /Only task-owned/);
  assert.throws(() => parseUpgradeVmArgs([...args, "--route", "preview"]), /terminal bridge version/);
  assert.throws(() => parseUpgradeVmArgs([...args, "--target-version", "latest"]), /exact target version/);
});

test("legacy upgrade driver calls original exposed IPC without injecting a new updater", () => {
  const expression = aionInvokeExpression("auto-update.check", { channel: "stable" });
  assert.match(expression, /window\.electronAPI\.emit\('subscribe-'/);
  assert.match(expression, /subscribe\.callback-/);
  assert.doesNotMatch(expression, /require\(|eval\(|setFeedURL|autoUpdater/);
  assert.throws(() => aionInvokeExpression("arbitrary-code"), /Unsupported/);
});
