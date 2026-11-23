import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PROFILE_RECOVERY_SCHEMA,
  clearProfileBootRecovery,
  quarantineProfileOverrides,
  readProfileBootRecovery,
  readProfileOplOverrides
} from "../../packages/host-kit/profile-boot-recovery.mjs";

test("profile boot recovery isolates broken @gaofeng21cn overrides while keeping non-OPL bundles", () => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "opl-boot-recovery-"));
  try {
    fs.writeFileSync(path.join(profileDir, "package.json"), JSON.stringify({
      name: "dsh-profile-opl-studio",
      private: true,
      dsh: { profile: { bundles: ["billion-context"] } },
      dependencies: {
        "@gaofeng21cn/opl-studio-client": "0.1.99",
        "@gaofeng21cn/opl-host-core": "0.1.88",
        "billion-context": "0.2.0"
      }
    }, null, 2));

    assert.deepEqual(readProfileOplOverrides(profileDir), {
      "@gaofeng21cn/opl-studio-client": "0.1.99",
      "@gaofeng21cn/opl-host-core": "0.1.88"
    });

    const record = quarantineProfileOverrides(profileDir, new Error("SyntaxError in overridden client bundle"), { now: () => 1795410000000 });
    assert.ok(record);
    assert.equal(record.schema, PROFILE_RECOVERY_SCHEMA);
    assert.deepEqual(record.quarantinedPackages, {
      "@gaofeng21cn/opl-studio-client": "0.1.99",
      "@gaofeng21cn/opl-host-core": "0.1.88"
    });
    assert.match(record.reason, /SyntaxError/);

    assert.deepEqual(readProfileOplOverrides(profileDir), {});
    const updatedManifest = JSON.parse(fs.readFileSync(path.join(profileDir, "package.json"), "utf8"));
    assert.deepEqual(updatedManifest.dependencies, { "billion-context": "0.2.0" });
    assert.deepEqual(updatedManifest.dsh.profile.bundles, ["billion-context"]);
    assert.ok(fs.existsSync(path.join(profileDir, "package.json.quarantined.1795410000000")));
    assert.deepEqual(readProfileBootRecovery(profileDir), record);
    assert.equal(fs.statSync(path.join(profileDir, "profile-boot-recovery.json")).mode & 0o777, 0o600);

    // Second quarantine when no OPL overrides remain is a safe no-op returning null.
    assert.equal(quarantineProfileOverrides(profileDir, new Error("base crash")), null);

    clearProfileBootRecovery(profileDir);
    assert.equal(readProfileBootRecovery(profileDir), null);
    clearProfileBootRecovery(profileDir);
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
});
