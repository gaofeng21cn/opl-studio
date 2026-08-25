import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
