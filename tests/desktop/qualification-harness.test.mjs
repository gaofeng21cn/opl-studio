import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { verifyPreviewIdentity } from "../../scripts/desktop/preview-smoke.mjs";
import { parseArgs as parseCleanVmArgs } from "../../scripts/desktop/qualify-clean-vm.mjs";

const root = path.resolve(new URL("../..", import.meta.url).pathname);

test("clean VM and Gateway qualification remain candidate-only surfaces", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const cleanVm = fs.readFileSync(path.join(root, "scripts/desktop/qualify-clean-vm.mjs"), "utf8");
  const previewSmoke = fs.readFileSync(path.join(root, "scripts/desktop/preview-smoke.mjs"), "utf8");
  const gateway = fs.readFileSync(path.join(root, "scripts/desktop/diagnose-gateway-credential-persistence.mjs"), "utf8");
  const docs = fs.readFileSync(path.join(root, "docs/delivery/desktop-distribution.md"), "utf8");

  assert.equal(packageJson.scripts["qualify:desktop:clean-vm"], "node scripts/desktop/qualify-clean-vm.mjs");
  assert.equal(packageJson.scripts["diagnose:gateway:persistence"], "node scripts/desktop/diagnose-gateway-credential-persistence.mjs");
  assert.match(cleanVm, /cleanVmReady: false/);
  assert.match(cleanVm, /releaseReady: false/);
  assert.match(cleanVm, /activeShellAdopted: false/);
  assert.match(cleanVm, /--attach/);
  assert.match(cleanVm, /verifyPreviewIdentity/);
  assert.match(previewSmoke, /readbackStderr/);
  assert.match(previewSmoke, /appServerErrors/);
  assert.match(previewSmoke, /OPL_Framework_runtime_readback_not_proven_in_clean_VM/);
  assert.equal(packageJson.scripts["smoke:preview"], "node scripts/desktop/preview-smoke.mjs");
  assert.match(gateway, /credentials\.json/);
  assert.match(gateway, /sha256/);
  assert.match(gateway, /mode0600After/);
  assert.match(gateway, /window\.oplStudio\.readState/);
  assert.match(docs, /candidate evidence only/);
  assert.match(docs, /Framework-owned/);
});

test("attach identity is unavailable without an app path and does not self-certify", async () => {
  const identity = await verifyPreviewIdentity({ appPath: path.join(root, "missing-preview.app") });
  assert.equal(identity.status, "unavailable");
  assert.equal(identity.actual.productName, null);
  assert.equal(identity.actual.bundleId, null);
});

test("clean VM preserves explicit smoke and receipt paths", () => {
  const options = parseCleanVmArgs([
    "--attach",
    "--cdp-port", "9334",
    "--out", "out/custom-clean-vm.json",
    "--runtime-profiles", "standard"
  ]);
  assert.equal(options.attach, true);
  assert.equal(options.cdpPort, 9334);
  assert.equal(options.outPath, path.resolve(root, "out/custom-clean-vm.json"));
  assert.deepEqual(options.runtimeProfiles, ["standard"]);
});
