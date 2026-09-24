import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { captureOfficialProfileAdmission, readOfficialProfileResources, buildOfficialProfileCommand, startOfficialProfileFirstInstall } from "../../desktop/official-profile.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-official-profile-"));
  const homeDir = path.join(root, "home");
  fs.mkdirSync(homeDir);
  const resourcesPath = path.join(root, "Resources");
  const resources = path.join(resourcesPath, "opl-official-profile");
  fs.mkdirSync(resources, { recursive: true });
  const profile = Buffer.from(JSON.stringify({ official_profile: { authority: "one-person-lab-app", apply_on: ["first_install", "explicit_restore"], never_apply_on: ["app_update"], desired_root_package_ids: ["mas", "mag"] } }));
  const helper = Buffer.from("// exact App-owned helper bytes\n");
  fs.writeFileSync(path.join(resources, "app-product-profile.json"), profile);
  fs.writeFileSync(path.join(resources, "official-profile-package-apply.ts"), helper);
  fs.writeFileSync(path.join(resources, "manifest.json"), JSON.stringify({ schema: "opl_app_official_profile_resources.v1", authority: "one-person-lab-app", helper_sha256: createHash("sha256").update(helper).digest("hex"), profile_sha256: createHash("sha256").update(profile).digest("hex") }));
  return { root, homeDir, resourcesPath, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const ready = async () => ({ readback: { exitCode: 0 }, system_initialize: { setup_flow: { ready_to_launch: true } } });
const result = (failed = false) => ({ status: failed ? 1 : 0, stdout: JSON.stringify({ official_profile_package_apply: { surface_kind: "opl_app_official_profile_package_apply.v1", status: failed ? "partial_failure" : "completed", intent: "first_install", dry_run: false, root_package_ids: ["mas", "mag"], items: [{ package_id: "mas", status: "already_present", changed: false }, { package_id: "mag", status: failed ? "failed" : "installed", changed: !failed, ...(failed ? { error: { code: "offline", message: "password-value download failed" } } : {}) }] } }) });

test("pre-bootstrap admission preserves old completion marker, existing Framework and owner preferences", () => {
  for (const existing of ["marker", "runtime", "state", "preview"]) {
    const f = fixture();
    try {
      const fresh = captureOfficialProfileAdmission({ homeDir: f.homeDir, env: {}, persistIntent: false });
      assert.equal(fresh.eligible, true);
      if (existing === "marker") { fs.mkdirSync(fresh.stateDir, { recursive: true }); fs.writeFileSync(fresh.completePath, "legacy completion"); }
      if (existing === "state") fs.mkdirSync(fresh.stateDir, { recursive: true });
      if (existing === "runtime") fs.mkdirSync(path.join(f.homeDir, ".opl", "one-person-lab"), { recursive: true });
      if (existing === "preview") fs.mkdirSync(path.join(f.homeDir, "Library", "Application Support", "opl-studio", "runtime", "current"), { recursive: true });
      assert.equal(captureOfficialProfileAdmission({ homeDir: f.homeDir, env: {} }).eligible, false);
    } finally { f.cleanup(); }
  }
});

test("resource digests and App policy are verified before owner actions", () => {
  const f = fixture();
  try {
    const resources = readOfficialProfileResources(f.resourcesPath);
    const spec = buildOfficialProfileCommand({ resources, env: { OPL_APP_OPL_BIN: "/managed/bin/opl" } });
    assert.deepEqual(spec.args.slice(-4), ["--root-package-id", "mas", "--root-package-id", "mag"]);
    assert.ok(spec.args.includes("/managed/bin/opl"));
    assert.equal(spec.args.includes("--profile"), false);
    fs.appendFileSync(path.join(f.resourcesPath, "opl-official-profile", "official-profile-package-apply.ts"), "changed");
    assert.throws(() => readOfficialProfileResources(f.resourcesPath), /digest mismatch/);
  } finally { f.cleanup(); }
});

test("fresh install waits for core readiness, shares one worker, and records only actual completion", async () => {
  const f = fixture();
  try {
    const admission = captureOfficialProfileAdmission({ homeDir: f.homeDir, env: {} });
    let calls = 0;
    const options = { admission, resourcesPath: f.resourcesPath, env: {}, readInitialize: ready, execute: async () => { calls++; return result(); } };
    const [first, second] = await Promise.all([startOfficialProfileFirstInstall(options), startOfficialProfileFirstInstall(options)]);
    assert.equal(calls, 1);
    assert.equal(first.status, "completed");
    assert.deepEqual(second, first);
    assert.equal(JSON.parse(fs.readFileSync(admission.completePath)).status, "completed");
    assert.equal((await startOfficialProfileFirstInstall(options)).reason, "first_install_already_completed");
    assert.equal(calls, 1);
  } finally { f.cleanup(); }
});

test("failed package application remains diagnosed and requires explicit retry", async () => {
  const f = fixture();
  try {
    const admission = captureOfficialProfileAdmission({ homeDir: f.homeDir, env: {} });
    let calls = 0;
    const options = { admission, resourcesPath: f.resourcesPath, env: { API_PASSWORD: "password-value" }, readInitialize: ready, execute: async () => { calls++; return result(true); } };
    const failed = await startOfficialProfileFirstInstall(options);
    assert.equal(failed.status, "failed");
    assert.equal(fs.existsSync(admission.completePath), false);
    assert.equal(JSON.stringify(failed).includes("password-value"), false);
    const restarted = captureOfficialProfileAdmission({ homeDir: f.homeDir, env: {} });
    assert.equal((await startOfficialProfileFirstInstall({ ...options, admission: restarted })).status, "skipped");
    assert.equal(calls, 1);
    const recovered = await startOfficialProfileFirstInstall({ ...options, admission: restarted, explicitRetry: true, execute: async () => result() });
    assert.equal(recovered.status, "completed");
  } finally { f.cleanup(); }
});

test("missing core readiness defers without claiming an attempt and can resume after onboarding", async () => {
  const f = fixture();
  try {
    const admission = captureOfficialProfileAdmission({ homeDir: f.homeDir, env: {} });
  const output = await startOfficialProfileFirstInstall({ admission, resourcesPath: f.resourcesPath, env: {}, readInitialize: async () => ({ readback: { exitCode: 1 }, system_initialize: { setup_flow: { ready_to_launch: false } } }), readinessTimeoutMs: 5, execute: async () => { throw new Error("must not execute"); } });
    assert.equal(output.status, "deferred");
    assert.equal(output.reason, "framework_core_not_ready");
    assert.equal(fs.existsSync(admission.completePath), false);
    assert.equal(fs.existsSync(admission.attemptPath), false);
    fs.mkdirSync(path.join(f.homeDir, ".opl", "one-person-lab"), { recursive: true });
    const afterRestart = captureOfficialProfileAdmission({ homeDir: f.homeDir, env: {} });
    assert.equal(afterRestart.eligible, true);
    const resumed = await startOfficialProfileFirstInstall({ admission: afterRestart, resourcesPath: f.resourcesPath, env: {}, readInitialize: ready, readinessTimeoutMs: 0, execute: async () => result() });
    assert.equal(resumed.status, "completed");
  } finally { f.cleanup(); }
});
