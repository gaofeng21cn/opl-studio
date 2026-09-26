import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseStableArgs, buildDistributionCommand, buildStableSummary, runStableCleanVm } from "../../scripts/desktop/stable-clean-vm.mjs";

const required = ["--artifacts", "/tmp/evidence", "--expected-sha256", "a".repeat(64), "--expected-version", "2026.9.2400", "--expected-team-id", "ABCDEFGHIJ", "--gateway-account-email-file", "/tmp/email", "--gateway-account-password-file", "/tmp/password", "--codex-platform-package-tarball", "/tmp/codex.tgz", "--codex-version", "0.116.0", "--require-gatekeeper", "--product-profile", "/tmp/profile.json"];

test("Stable parser pins production identity and rejects preview/attach/turn overrides", () => {
  const options = parseStableArgs(required);
  assert.equal(options.productName, "One Person Lab");
  assert.equal(options.bundleId, "cn.onepersonlab.opl");
  assert.deepEqual(options.runtimeProfiles, ["standard"]);
  for (const arg of ["--attach", "--skip-clone", "--require-codex-turn", "--product-name", "--bundle-id", "--runtime-profiles"]) {
    assert.throws(() => parseStableArgs([...required, arg]), /forbids/);
  }
  assert.throws(() => parseStableArgs([...required, "--expected-sha256", "bad"]), /SHA-256/);
  assert.throws(() => parseStableArgs([...required, "--expected-team-id", "wrong"]), /Developer ID/);
});

test("Installed distribution validation preserves quarantine and verifies the expected team", () => {
  const command = buildDistributionCommand({ guestApp: "/Applications/One Person Lab.app", expectedTeamId: "ABCDEFGHIJ", requireGatekeeper: true });
  assert.match(command, /codesign --verify --deep --strict/);
  assert.match(command, /TeamIdentifier=ABCDEFGHIJ/);
  assert.match(command, /xattr -w com.apple.quarantine/);
  assert.match(command, /spctl --assess --type execute/);
  assert.doesNotMatch(command, /xattr -[rd]|codesign --force|--sign -|NODE_TLS_REJECT_UNAUTHORIZED/);
});

test("Nightly admission cannot waive Stable or Full trust gates", () => {
  const unsigned = required.filter((arg) => arg !== "--require-gatekeeper");
  assert.throws(() => parseStableArgs(unsigned), /requires Gatekeeper/);
  assert.throws(() => parseStableArgs([...unsigned, "--channel", "nightly"]), /exact Nightly machine version/);
  const nightly = [...unsigned, "--channel", "nightly", "--expected-version", "26.9.2691-nightly.1"];
  assert.equal(parseStableArgs(nightly).channel, "nightly");
  assert.throws(() => parseStableArgs([...nightly, "--runtime-profile", "full"]), /Standard preview only/);
  assert.throws(() => parseStableArgs([...nightly, "--require-gatekeeper"]), /Standard preview only/);
});

test("Nightly installation proof never becomes signed Stable evidence", () => {
  const options = parseStableArgs([...required.filter((arg) => arg !== "--require-gatekeeper"), "--channel", "nightly", "--expected-version", "26.9.2691-nightly.1"]);
  const distribution = { status: "passed", qualificationChannel: "nightly", candidateDigestVerified: true, installedVersion: options.expectedVersion, signatureVerified: null, stapledDmgNotarizationVerifiedOnHost: null, gatekeeperAccepted: null };
  const receipt = { status: "passed", checks: { smoke: { status: "passed" }, distribution } };
  assert.equal(buildStableSummary(options, receipt).status, "passed");
  assert.equal(buildStableSummary(options, receipt).schema, "opl_studio_nightly_clean_vm.v1");
  assert.equal(buildStableSummary({ ...options, channel: "stable" }, receipt).status, "failed");
  assert.equal(buildStableSummary(options, { ...receipt, checks: { ...receipt.checks, distribution: { ...distribution, installedVersion: "26.9.2691" } } }).status, "failed");
  assert.equal(buildStableSummary(options, { ...receipt, checks: { ...receipt.checks, distribution: { ...distribution, candidateDigestVerified: false } } }).status, "failed");
});

test("Summary never promotes missing distribution or smoke evidence to passed", () => {
  const options = parseStableArgs(required);
  const receipt = { status: "passed", checks: { smoke: { status: "passed" }, distribution: { status: "passed", signatureVerified: true, stapledDmgNotarizationVerifiedOnHost: true, gatekeeperAccepted: true, installedVersion: options.expectedVersion } } };
  assert.equal(buildStableSummary(options, receipt).status, "passed");
  assert.equal(buildStableSummary(options, { ...receipt, checks: { smoke: { status: "passed" } } }).status, "failed");
  assert.equal(buildStableSummary(options, receipt, new Error("verification failed")).status, "failed");
});

test("Wrong candidate bytes fail before credentials or VM launch and persist failed evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-stable-vm-test-"));
  try {
    const dmg = path.join(root, "candidate.dmg");
    await writeFile(dmg, "wrong bytes");
    const options = { ...parseStableArgs(required), artifacts: path.join(root, "evidence"), dmg };
    const result = await runStableCleanVm(options);
    assert.equal(result.status, "failed");
    assert.match(result.failure.message, /digest differs/);
    const saved = JSON.parse(await readFile(path.join(options.artifacts, "tart-smoke-summary.json"), "utf8"));
    assert.equal(saved.status, "failed");
    assert.equal(saved.generation_requested, false);
    assert.equal(saved.distribution, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
