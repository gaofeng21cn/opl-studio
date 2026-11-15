import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SuperagentProfile } from '../../plugins/opl-superagent/src/index.mjs';

// Real official CLI, bundle, database and management API; no model or external Source is configured.
test('independent Superagent profile preserves settings and setup across restart', { timeout: 45000 }, async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'opl-superagent-test-'));
  const service = new SuperagentProfile({ home });
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
    const state = await api('state');
    assert.equal(state.setup.problem.code, 'repositoryUnset');
    assert.equal(state.load.running, 0);
    const settings = await api('settings');
    await api('settings/eval', 'PUT', { revision: settings.blocks.eval.revision, value: { ...settings.blocks.eval.value, timeoutSeconds: 121 } });
    const patch = await readFile(path.join(home, 'profiles/web/cordis.patch.yml'), 'utf8');
    await service.stop();
    assert.equal(service.read().url, null);
    await service.start();
    assert.equal((await api('settings')).blocks.eval.value.timeoutSeconds, 121);
    assert.equal((await api('state')).setup.problem.code, 'repositoryUnset');
    assert.equal(await readFile(path.join(home, 'profiles/web/cordis.patch.yml'), 'utf8'), patch);
  } finally { await service.stop(); await rm(home, { recursive: true, force: true }); }
});
