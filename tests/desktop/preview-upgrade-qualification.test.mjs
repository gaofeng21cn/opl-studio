import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadPreviewCheckpoint, selectPreviewBaselines, validatePreviewUpgradeReceipt } from "../../scripts/desktop/stable-qualify-preview-upgrade.mjs";
import { qualifyPrepublicationUpdate } from "../../scripts/desktop/macos-distribution.mjs";

const target = { bundleId: "cn.onepersonlab.opl", productName: "One Person Lab", teamId: "SVVC4TA784", version: "26.9.2491", sha256: "a".repeat(64), size: 123, url: "https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.9.24/One-Person-Lab-26.9.24-mac-arm64.dmg" };
const release = (version, extra = {}) => ({ tag_name: `v${version}`, draft: false, prerelease: false, assets: [{ name: `one-person-lab-preview-${version}-mac-arm64.dmg`, digest: `sha256:${"b".repeat(64)}` }], ...extra });
const goodReceipt = () => ({ schema: "opl_studio_preview_upgrade_qualification.v1", status: "passed", previewVersion: "0.1.19", previewZipSha256: "c".repeat(64), checkpointSha256: "d".repeat(64), target, isolation: "fresh_tart_clone_per_public_baseline", userHostMutation: false, publicStableTargetVerified: true, publicPreviewCount: 3, baselineTags: ["v0.1.18", "v0.1.17"], routes: ["v0.1.18", "v0.1.17"].map((tag) => ({ tag, status: "passed", nativeUpdater: true, terminalHandoff: true, ownerReadback: true, storagePreserved: true, channelBindingsPreserved: true })) });
const expected = { previewVersion: "0.1.19", previewZipSha256: "c".repeat(64), target };

test("Preview migration selects actual latest and previous public versions and refuses an incomplete asset window", () => {
  assert.deepEqual(selectPreviewBaselines([release("0.1.16"), release("0.1.18"), release("0.1.17"), release("0.1.99", { draft: true })], "0.1.19").map((item) => item.tag_name), ["v0.1.18", "v0.1.17"]);
  assert.throws(() => selectPreviewBaselines([release("0.1.19")], "0.1.19"), /newer than/);
  assert.throws(() => selectPreviewBaselines([release("0.1.18"), release("0.1.17", { assets: [] })], "0.1.19"), /exact DMG/);
});

test("terminal qualification refuses partial routes, substituted bytes and missing previous baseline", () => {
  assert.equal(validatePreviewUpgradeReceipt(goodReceipt(), expected).status, "passed");
  assert.throws(() => validatePreviewUpgradeReceipt({ ...goodReceipt(), previewZipSha256: "e".repeat(64) }, expected), /differs/);
  assert.throws(() => validatePreviewUpgradeReceipt({ ...goodReceipt(), routes: goodReceipt().routes.slice(0, 1) }, expected), /incomplete/);
  const receipt = goodReceipt(); receipt.routes[1].ownerReadback = false;
  assert.throws(() => validatePreviewUpgradeReceipt(receipt, expected), /did not pass/);
  assert.throws(() => validatePreviewUpgradeReceipt({ ...goodReceipt(), userHostMutation: true }, expected), /isolation/);
});

test("enabled terminal Preview never invokes the host updater, even with missing or mismatched VM proof", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-preview-guard-test-")); context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let launches = 0;
  const args = { handoffPlan: { enabled: true, target }, requireReleaseTrust: true, requirePublicFeed: false, releaseTrustAccepted: true, ...expected, runLocalUpdater: async () => { launches++; return "host"; } };
  await assert.rejects(qualifyPrepublicationUpdate(args), /isolated Tart VMs/);
  const file = path.join(root, "receipt.json"); fs.writeFileSync(file, JSON.stringify(goodReceipt()));
  assert.equal((await qualifyPrepublicationUpdate({ ...args, previewUpgradeVmReceipt: file })).status, "passed");
  await assert.rejects(qualifyPrepublicationUpdate({ ...args, previewUpgradeVmReceipt: file, previewZipSha256: "e".repeat(64) }), /differs/);
  assert.equal(await qualifyPrepublicationUpdate({ ...args, requirePublicFeed: true }), null);
  assert.equal(launches, 0);
  assert.equal(await qualifyPrepublicationUpdate({ ...args, handoffPlan: { enabled: false } }), "host");
  assert.equal(launches, 1);
});

test("Preview checkpoint admission verifies exact sealed bytes before VM preparation", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-preview-checkpoint-test-")); context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"));
  const names = ["one-person-lab-preview-0.1.19-mac-arm64.dmg", "one-person-lab-preview-0.1.19-mac-arm64.zip", "one-person-lab-preview-0.1.19-mac-arm64.zip.blockmap", "latest-mac.yml", "latest-arm64-mac.yml"];
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const files = names.map((name) => { const bytes = Buffer.from(`fixture-${name}`); fs.writeFileSync(path.join(root, "assets", name), bytes); return { path: `assets/${name}`, sha256: hash(bytes), size_bytes: bytes.length }; });
  const checkpoint = { schema: "opl_studio_signed_notarized_checkpoint.v2", status: "signed_notarized", authority_owner: "one-person-lab-app", source: { repository: "gaofeng21cn/opl-studio", version: "0.1.19", tag: "v0.1.19" }, files };
  const bytes = Buffer.from(JSON.stringify(checkpoint)); fs.writeFileSync(path.join(root, "checkpoint.json"), bytes);
  assert.equal(loadPreviewCheckpoint(root, hash(bytes)).assets.length, 5);
  fs.writeFileSync(path.join(root, "assets", names[1]), "substitution");
  assert.throws(() => loadPreviewCheckpoint(root, hash(bytes)), /Checkpoint bytes differ/);
});
