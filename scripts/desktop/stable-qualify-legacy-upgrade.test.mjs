import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { loadSealedCandidate } from "./stable-qualify-legacy-upgrade.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("sealed candidate loader consumes exact bound assets and rejects identity drift", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-sealed-candidate-"));
  try {
    fs.mkdirSync(path.join(root, "assets"));
    const names = ["One-Person-Lab-26.9.24-mac-arm64.dmg", "One-Person-Lab-26.9.24-mac-arm64.zip", "latest-mac.yml", "latest-arm64-mac.yml", "opl-app-component-manifest.json"];
    const records = {};
    for (const name of names) {
      const bytes = Buffer.from(`exact-${name}`);
      fs.writeFileSync(path.join(root, "assets", name), bytes);
      records[name] = { name, sha256: sha(bytes) };
    }
    const identity = {
      schema: "opl_standard_release_identity_receipt.v2", status: "passed",
      source: { repository: "gaofeng21cn/one-person-lab-app" },
      release: { channel: "stable", tag: "v26.9.24", updater_version: "26.9.2491" },
      cohort: { framework_sha: "a".repeat(40) },
      apple_distribution_trust: { final_dmg: records[names[0]] },
      updater_zip: records[names[1]], updater_metadata: records[names[2]],
      updater_compatibility_metadata: records[names[3]], component_manifest: records[names[4]]
    };
    fs.writeFileSync(path.join(root, "standard-identity-receipt.json"), `${JSON.stringify(identity)}\n`);
    const identityDigest = sha(fs.readFileSync(path.join(root, "standard-identity-receipt.json")));
    const candidate = loadSealedCandidate(root, identityDigest);
    assert.equal(candidate.assets.length, names.length);
    fs.writeFileSync(path.join(root, "assets", names[1]), "drift");
    assert.throws(() => loadSealedCandidate(root, identityDigest), /Sealed update artifact mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
