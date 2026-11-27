import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { collectFullDaemonProof } from "../../scripts/desktop/qualify-clean-vm.mjs";
import { buildStableSummary } from "../../scripts/desktop/stable-clean-vm.mjs";

test("Full VM checks the installed Framework, enabled packages and SQLite across daemon restart", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-full-daemon-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = path.join(root, "runtime", "current");
  const binDir = path.join(runtime, "bin");
  const stateDir = path.join(root, "guest", "Library", "Application Support", "OPL", "state");
  await mkdir(binDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });
  const frameworkSha = "4".repeat(40);
  const manifest = JSON.stringify({
    components: { opl: { framework_api_version: "2.0", framework_daemon_version: "2.0.0", git_commit: frameworkSha } },
    resolved_refs: { opl_framework: { resolved_commit: frameworkSha } }
  });
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, manifest);
  await writeFile(path.join(stateDir, "opl.db"), Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(1024)]));
  await writeFile(path.join(binDir, "opl"), `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2).filter(arg => arg !== "--json");
const state = process.env.OPL_STATE_DIR;
const marker = path.join(state, "stopped");
const restarted = fs.existsSync(marker);
const mode = process.env.PROOF_TEST_MODE;
let result;
switch (args.slice(0, 2).join(" ")) {
  case "--version":
    result = {version:"2.0.0", api_version:"2.0"}; break;
  case "daemon doctor":
    result = {ok:true, api_version:"2.0", version:"2.0.0", pid:restarted ? 902 : 901,
      paths:{state_dir:state, db_file:path.join(state,"opl.db")}, sqlite:{schema_version:4001, db_file:path.join(state,"opl.db")},
      first_run:{needs_onboarding:false, installed_package_count:2}}; break;
  case "pack list":
    result = {packages:[{package_id:"sample", version:restarted && mode === "upgrade" ? "1.1.0" : "1.0.0", enabled:mode !== "disabled"},
      {package_id:"inactive", version:"3.0.0", enabled:false}]}; break;
  case "daemon stop":
    fs.writeFileSync(marker, "yes");
    result = {ok:true, stopped:true}; break;
  default: throw Error("unexpected arguments " + args.join(" "));
}
console.log(JSON.stringify(result));
`, { mode: 0o755 });
  const input = { runtime, manifestPath, expectedRootPackageIds: ["sample"] };
  const script = `const collect = (${collectFullDaemonProof.toString()}); console.log(JSON.stringify(await collect(${JSON.stringify(input)})));`;
  async function run(mode) {
    await rm(path.join(stateDir, "stopped"), { force: true });
    return spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      env: { ...process.env, HOME: path.join(root, "guest"), OPL_STATE_DIR: stateDir, PROOF_TEST_MODE: mode },
      encoding: "utf8", timeout: 15_000
    });
  }
  const success = await run("normal");
  assert.equal(success.status, 0, success.stderr);
  const proof = JSON.parse(success.stdout);
  assert.equal(proof.framework_sha, frameworkSha);
  assert.equal(proof.full_package_manifest_sha256, createHash("sha256").update(manifest).digest("hex"));
  assert.deepEqual(proof.before_restart.packages, [{ package_id: "sample", version: "1.0.0" }]);
  assert.deepEqual(proof.after_restart.packages, proof.before_restart.packages);
  assert.notEqual(proof.before_restart.pid, proof.after_restart.pid);
  assert.equal(proof.before_restart.database_file_identity, proof.after_restart.database_file_identity);
  assert.equal(buildStableSummary({ runtimeProfile: "full" }, { checks: { framework_daemon_proof: proof } }).framework_daemon_proof, proof);
  for (const mode of ["disabled", "upgrade"]) {
    const failure = await run(mode);
    assert.notEqual(failure.status, 0, mode);
    assert.match(failure.stderr, /package|root/i);
  }
  await writeFile(path.join(stateDir, "opl.db"), "not a SQLite database");
  assert.notEqual((await run("normal")).status, 0);
  await writeFile(manifestPath, JSON.stringify({
    ...JSON.parse(manifest), resolved_refs: { opl_framework: { resolved_commit: "c".repeat(40) } }
  }));
  await writeFile(path.join(stateDir, "opl.db"), Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(1024)]));
  assert.notEqual((await run("normal")).status, 0);
});
