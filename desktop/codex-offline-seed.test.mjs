import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { codexOfflineSeedEnvironment, ensureFullCodexFirstInstall } from "./codex-offline-seed.mjs";

test("Full projects verified archives without selecting a second executable", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-codex-seed-"));
  try {
    const seed = { schema: "opl_full_codex_offline_seed.v1", version: "1.2.3", installation_owner: "one-person-lab", archives: {} };
    for (const kind of ["package", "platform"]) {
      const relative = `runtime-payloads/codex-cli/1.2.3/${kind}.tgz`;
      const bytes = Buffer.from(kind);
      fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      fs.writeFileSync(path.join(root, relative), bytes);
      seed.archives[kind] = { path: relative, size_bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
    }
    fs.mkdirSync(path.join(root, "manifest"));
    fs.writeFileSync(path.join(root, "manifest", "full-package-manifest.json"), JSON.stringify({ codex_offline_seed: seed }));
    const env = codexOfflineSeedEnvironment(root, { PATH: "/usr/bin" });
    assert.equal(env.OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL, path.join(root, seed.archives.package.path));
    assert.equal(env.OPL_CODEX_BIN, undefined);
    fs.appendFileSync(env.OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL, "drift");
    assert.throws(() => codexOfflineSeedEnvironment(root, {}), /does not match/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("clean Full delegates installation and activation before starting Codex", async () => {
  const env = { OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: "/seed/package.tgz", OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: "/seed/platform.tgz" };
  const calls = [];
  const opl = { executeAction: async request => { calls.push(request); return { status: "executed" }; },
    runManagedUpdate: async operation => { calls.push(operation); return { runtime_activation: { codex: { runtime_binary_path: "/managed/codex" } } }; } };
  assert.equal(await ensureFullCodexFirstInstall({ env, opl, executable: file => file === "/managed/codex" }), "/managed/codex");
  assert.deepEqual(calls, [{ actionId: "codex_install", dryRun: false, payload: { confirmed: true } }, "activate"]);
  calls.length = 0;
  assert.equal(await ensureFullCodexFirstInstall({ env: { ...env, OPL_CODEX_BIN: "/existing/codex" }, opl, executable: () => true }), null);
  assert.equal(calls.length, 0);
  await assert.rejects(ensureFullCodexFirstInstall({ env, opl: { executeAction: async () => ({ status: "error" }) }, executable: () => false }), /could not initialize/);
});
