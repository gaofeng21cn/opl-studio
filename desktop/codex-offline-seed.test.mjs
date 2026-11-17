import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { codexOfflineSeedEnvironment, ensureFullCodexFirstInstall, prepareDesktopCodexRuntime } from "./codex-offline-seed.mjs";

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

test('Full installs its local Codex even when automatic updates are disabled', async () => {
  const calls = [], progress = [];
  const result = await prepareDesktopCodexRuntime({
    env: { OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: '/seed/package.tgz', OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: '/seed/platform.tgz' },
    activatePending: false, executable: file => file === '/managed/codex', onProgress: value => progress.push(value),
    opl: {
      executeAction: async request => { calls.push(request.actionId); return { status: 'executed' }; },
      runManagedUpdate: async operation => { calls.push(operation); return { runtime_activation: { codex: { runtime_binary_path: '/managed/codex' } } }; }
    }
  });
  assert.equal(result.activatedCodexPath, '/managed/codex');
  assert.equal(result.activationStatus, 'disabled');
  assert.deepEqual(calls, ['codex_install', 'activate']);
  assert.deepEqual(progress, [{ stage: 'preparing_codex', source: 'bundled' }]);
});

test('a broken pending update cannot suppress Full first installation', async () => {
  const calls = [];
  const result = await prepareDesktopCodexRuntime({
    env: { OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: '/seed/package.tgz', OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: '/seed/platform.tgz' },
    executable: file => file === '/managed/codex',
    opl: {
      executeAction: async request => { calls.push(request.actionId); return { status: 'executed' }; },
      runManagedUpdate: async operation => {
        calls.push(operation);
        if (calls.length === 1) throw Object.assign(new Error('old staged update unavailable'), { code: 'pending_update_invalid' });
        return { runtime_activation: { codex: { runtime_binary_path: '/managed/codex' } } };
      }
    }
  });
  assert.equal(result.activatedCodexPath, '/managed/codex');
  assert.equal(result.activationStatus, 'pending_update_invalid');
  assert.deepEqual(calls, ['activate', 'codex_install', 'activate']);
});

test('failed local installation is returned to startup instead of a false ready result', async () => {
  await assert.rejects(prepareDesktopCodexRuntime({
    env: { OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: '/seed/package.tgz', OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: '/seed/platform.tgz' },
    activatePending: false, executable: () => false,
    opl: { executeAction: async () => ({ status: 'error' }) }
  }), /could not initialize/);
});

test('each cold start checks native owners and applies before activation even without a pending generation', async () => {
  const calls = [];
  const opl = { runManagedUpdate: async operation => {
    calls.push(operation);
    return operation === 'apply' ? { managed_update: { execution: { status: 'skipped' } } }
      : { runtime_activation: { status: 'no_pending_generation' } };
  } };
  for (let start = 0; start < 2; start++) {
    const result = await prepareDesktopCodexRuntime({ env: {}, opl, refreshUpdates: true });
    assert.equal(result.activationStatus, 'no_pending_generation');
  }
  assert.deepEqual(calls, ['check', 'apply', 'activate', 'check', 'apply', 'activate']);
});

test('failed freshness refresh still activates verified pending bytes and remains visible', async () => {
  const calls = [];
  const result = await prepareDesktopCodexRuntime({ env: {}, refreshUpdates: true, executable: () => true,
    opl: { runManagedUpdate: async operation => {
      calls.push(operation);
      if (operation === 'check') throw Object.assign(new Error('offline'), { code: 'startup_channel_unavailable' });
      return { runtime_activation: { status: 'activated', codex: { runtime_binary_path: '/managed/new-codex' } } };
    } }
  });
  assert.equal(result.activationStatus, 'startup_channel_unavailable');
  assert.equal(result.activatedCodexPath, '/managed/new-codex');
  assert.deepEqual(calls, ['check', 'activate']);
});
