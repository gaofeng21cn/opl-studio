import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadUpgradeNetworkManifest, resolveFixtureResponse } from "../../scripts/desktop/stable-upgrade-network.mjs";

test("isolated updater network serves only exact repositories, tags and verified bytes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-upgrade-network-"));
  try {
    const asset = Buffer.from("exact candidate bytes");
    fs.writeFileSync(path.join(root, "candidate.zip"), asset);
    const manifest = { schema: "opl_studio_upgrade_network_fixture.v1", created_at: "2026-09-24T00:00:00Z", releases: [{ repository: "gaofeng21cn/one-person-lab-app", tag: "v26.9.24", assets: [{ name: "candidate.zip", path: "candidate.zip", size: asset.length, sha256: createHash("sha256").update(asset).digest("hex") }] }] };
    const file = path.join(root, "manifest.json");
    fs.writeFileSync(file, JSON.stringify(manifest));
    const fixture = loadUpgradeNetworkManifest(file);
    assert.equal(resolveFixtureResponse(fixture, "api.github.com", "/repos/gaofeng21cn/one-person-lab-app/releases?per_page=100&page=1").json[0].tag_name, "v26.9.24");
    assert.equal(resolveFixtureResponse(fixture, "github.com", "/gaofeng21cn/one-person-lab-app/releases/download/v26.9.24/candidate.zip").asset.size, asset.length);
    assert.equal(resolveFixtureResponse(fixture, "github.com", "/gaofeng21cn/one-person-lab-app/releases/download/v26.9.25/candidate.zip"), null);
    assert.equal(resolveFixtureResponse(fixture, "other.example", "/gaofeng21cn/one-person-lab-app/releases.atom"), null);
    assert.equal(resolveFixtureResponse(fixture, "api.github.com", "/user"), null);
    assert.deepEqual(resolveFixtureResponse(fixture, "api.github.com", "/repos/gaofeng21cn/one-person-lab-app/releases?page=2").json, []);
    fs.appendFileSync(path.join(root, "candidate.zip"), "changed");
    assert.throws(() => loadUpgradeNetworkManifest(file), /identity mismatch/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
