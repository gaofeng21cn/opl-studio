import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readDshBinding, parsePackageSpec, root } from "./dsh-upstream.mjs";

test("DSH binding status is sourced from the manifest and does not write", () => {
  const result = spawnSync(process.execPath, ["scripts/dsh-upgrade.mjs", "status"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  const binding = readDshBinding({ repositoryRoot: root });
  assert.equal(output.status, "dsh_binding_ready");
  assert.equal(output.writes, false);
  assert.equal(output.upstream.ref, binding.ref);
  assert.equal(output.upstream.version, binding.version);
  assert.deepEqual(output.package_cohort, binding.packageCohort);
  assert.equal(output.vendored_gui.file_count, binding.fileCount);
});

test("DSH package specs preserve scoped package names", () => {
  assert.deepEqual(parsePackageSpec("@deepseek-ai/dsh-tools@0.1.1-rc.2"), {
    name: "@deepseek-ai/dsh-tools",
    version: "0.1.1-rc.2"
  });
});

test("DSH binding rejects omitted runtime dependencies and version drift", (t) => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "opl-dsh-binding-"));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  mkdirSync(path.join(fixtureRoot, "src/composition"), { recursive: true });
  mkdirSync(path.join(fixtureRoot, "contracts"), { recursive: true });
  const binding = readDshBinding();
  const name = "@deepseek-ai/dsh-client-ui-dockkit";
  const write = (file, value) => writeFileSync(path.join(fixtureRoot, file), JSON.stringify(value));
  write("contracts/opl-studio-profile.json", binding.profile);
  write("package.json", binding.packageJson);
  write("package-lock.json", binding.packageLock);
  const manifest = structuredClone(binding.manifest);
  manifest.application_host.package_cohort = manifest.application_host.package_cohort.filter(spec => parsePackageSpec(spec).name !== name);
  write("src/composition/deepseekHarnessSourceManifest.json", manifest);
  assert.throws(() => readDshBinding({ repositoryRoot: fixtureRoot }), /dsh-client-ui-dockkit is missing from the package cohort/);

  write("src/composition/deepseekHarnessSourceManifest.json", binding.manifest);
  const lock = structuredClone(binding.packageLock);
  lock.packages[""].dependencies[name] = "0.1.3-alpha.2";
  write("package-lock.json", lock);
  assert.throws(() => readDshBinding({ repositoryRoot: fixtureRoot }), /package-lock.json DSH dependency @deepseek-ai\/dsh-client-ui-dockkit must be/);
  write("package-lock.json", binding.packageLock);
  assert.equal(readDshBinding({ repositoryRoot: fixtureRoot }).version, binding.version);
});

test("DSH preflight refuses a missing source checkout instead of writing", () => {
  const result = spawnSync(process.execPath, ["scripts/dsh-upgrade.mjs", "preflight"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires --source/);
});

test("DSH preflight refuses a non-DeepSeek Git worktree", () => {
  const result = spawnSync(process.execPath, ["scripts/dsh-upgrade.mjs", "preflight", "--source", root], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /has no https:\/\/github\.com\/deepseek-ai\/deepseek-harness remote/);
});
