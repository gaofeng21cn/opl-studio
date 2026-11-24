import assert from "node:assert/strict";
import test from "node:test";
import { parseUpgradeVmArgs } from "../../scripts/desktop/stable-upgrade-vm.mjs";

test("upgrade VM driver is restricted to task-owned Tart guests and exact targets", () => {
  const args = ["--vm", "opl-studio-cutover-preview-v26-9-23", "--route", "preview", "--target-version", "26.9.2491", "--preview-target-version", "26.9.23", "--ssh-key", "/tmp/key", "--out", "/tmp/result.json"];
  assert.equal(parseUpgradeVmArgs(args).networkMode, "controlled_exact_candidate");
  assert.throws(() => parseUpgradeVmArgs([...args, "--vm", "personal-workstation"]), /Only task-owned/);
  assert.throws(() => parseUpgradeVmArgs(args.filter((value) => value !== "--preview-target-version" && value !== "26.9.23")), /terminal bridge version/);
  assert.throws(() => parseUpgradeVmArgs([...args, "--route", "aion"]), /preview or studio/);
  assert.throws(() => parseUpgradeVmArgs([...args, "--target-version", "latest"]), /exact target version/);
  assert.throws(() => parseUpgradeVmArgs([...args, "--unknown", "1"]), /Invalid argument --unknown/);
  assert.throws(() => parseUpgradeVmArgs([...args, "--cdp-port"]), /Invalid argument --cdp-port/);
});
