import test from 'node:test';
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initProfile } from '@deepseek-ai/dsh-app-boot';
import { SuperagentProfile } from '../../plugins/opl-superagent/src/index.mjs';

// Real official CLI, bundle, database and management API; Codex catalog via the parent IPC, with no external Source.
test('independent Superagent profile preserves settings and setup across restart', { timeout: 45000 }, async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'opl-superagent-test-'));
  const transport = new EventEmitter();
  transport.listModels = async () => ({ data: [{ id: "codex-test", isDefault: true }] });
  const service = new SuperagentProfile({ dshHome: home, workspaceRoot: home }, { transport });
  initProfile(path.join(service.home, "profiles/web"), ["@one-person-lab/opl-codex-agents"]);
  const api = async (route, method = 'GET', value) => {
    const response = await fetch(new URL(`/orchestrator/api/${route}`, service.url), {
      method, headers: { 'x-orchestrator-request': '1', 'content-type': 'application/json' },
      ...(value ? { body: JSON.stringify(value) } : {})
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  try {
    assert.equal(service.read().state, 'stopped');
    const [first, concurrent] = await Promise.all([service.start(), service.start()]);
    assert.equal(first.url, concurrent.url);
    assert.equal(first.teamDependency, false);
    assert.equal(first.executor, "codex");
    const manifest = JSON.parse(await readFile(path.join(service.home, "profiles/web/package.json"), "utf8"));
    assert.ok(manifest.dsh.profile.bundles.includes("@gaofeng21cn/opl-codex-agents"));
    assert.ok(!manifest.dsh.profile.bundles.includes("@one-person-lab/opl-codex-agents"));
    const state = await api('state');
    assert.equal(state.setup.problem.code, 'repositoryUnset');
    assert.equal(state.load.running, 0);
    const settings = await api('settings');
    await api('settings/eval', 'PUT', { revision: settings.blocks.eval.revision, value: { ...settings.blocks.eval.value, timeoutSeconds: 121 } });
    const patch = await readFile(path.join(service.home, 'profiles/web/cordis.patch.yml'), 'utf8');
    assert.equal((await service.stop()).state, "stopped");
    assert.equal(service.read().url, null);
    await service.start();
    assert.equal((await api('settings')).blocks.eval.value.timeoutSeconds, 121);
    assert.equal((await api('state')).setup.problem.code, 'repositoryUnset');
    assert.equal(await readFile(path.join(service.home, 'profiles/web/cordis.patch.yml'), 'utf8'), patch);
  } finally { await service.stop(); await rm(home, { recursive: true, force: true }); }
});
