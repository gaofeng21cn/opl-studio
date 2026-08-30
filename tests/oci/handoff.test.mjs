import assert from "node:assert/strict";
import test from "node:test";
import { createCloudWorkspaceImageHandoff } from "../../scripts/oci/handoff.mjs";

test("Cloud handoff binds dual architecture digests, auth ABI, and false-ready boundary", () => {
  const handoff = createCloudWorkspaceImageHandoff({
    version: "0.1.5",
    studioRef: "a".repeat(40),
    appRef: "b".repeat(40),
    frameworkRef: "c".repeat(40),
    dshRef: "d".repeat(40),
    indexDigest: `sha256:${"1".repeat(64)}`,
    amd64Digest: `sha256:${"2".repeat(64)}`,
    arm64Digest: `sha256:${"3".repeat(64)}`,
    previousDigest: `sha256:${"4".repeat(64)}`,
    verification: "passed"
  });
  assert.equal(handoff.schema, "opl_studio_cloud_workspace_image_handoff.v1");
  assert.equal(handoff.runtime.endpoint, "http:3000");
  assert.equal(handoff.runtime.cookie_name, "aionui-session");
  assert.deepEqual(handoff.image.child_manifests.map((item) => item.platform), ["linux/amd64", "linux/arm64"]);
  assert.deepEqual(handoff.image.forbidden_tags, ["stable", "latest"]);
  assert.equal(handoff.supply_chain.cosign, "index_and_child_digests_verified");
  assert.equal(handoff.adoption.active_shell_adopted, false);
  assert.equal(handoff.adoption.release_ready, false);
  assert.equal(handoff.adoption.cloud_activated, false);
});
test("Cloud handoff rejects unverified or mutable identities", () => {
  assert.throws(() => createCloudWorkspaceImageHandoff({
    version: "0.1.5",
    studioRef: "main",
    verification: "failed"
  }), /studioRef/);
});
