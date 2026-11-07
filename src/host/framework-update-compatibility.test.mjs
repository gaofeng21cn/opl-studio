import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { frameworkUpdateEnvironment } from './framework-update-compatibility.mjs';
import { createOplPassthrough } from './opl-passthrough.mjs';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'opl-update-compatibility-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'framework');
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'opl-framework', version: '0.3.5' }));
  const env = { ...process.env, OPL_FRAMEWORK_PACKAGE_ROOT: root, OPL_FRAMEWORK_UPDATE_TARGET_ROOT: root };
  const source = {
    target_root: root, update_available: true, channel_version: '0.3.6',
    channel_artifact: 'ghcr.io/gaofeng21cn/one-person-lab-framework:latest-stable',
    channel_artifact_digest: `sha256:${'a'.repeat(64)}`
  };
  const plan = { managed_update: { components: [{ component_id: 'opl_base', current: { opl_framework_runtime: source } }] } };
  return { directory, root, env, source, plan };
}

test('automatic apply rejects stale channels, unknown versions and mismatched targets', async (t) => {
  const f = await fixture(t);
  for (const [change, code] of [
    [{ channel_version: '0.3.4' }, 'framework_update_downgrade_blocked'],
    [{ channel_version: '0.3.5-alpha.1' }, 'framework_update_downgrade_blocked'],
    [{ channel_version: null }, 'framework_update_version_unverified'],
    [{ source_archive_configured: true }, 'framework_update_version_unverified'],
    [{ target_root: '/another-root' }, 'framework_update_target_unverified']
  ]) {
    const original = { ...f.source };
    Object.assign(f.source, change);
    await assert.rejects(frameworkUpdateEnvironment(f.env, { operation: 'apply', plan: f.plan }), { code });
    for (const key of Object.keys(f.source)) delete f.source[key];
    Object.assign(f.source, original);
  }
  await assert.rejects(frameworkUpdateEnvironment({}, { operation: 'activate' }), { code: 'framework_update_target_unbound' });
});

test('eligible apply binds the owner command to the inspected immutable artifact without changing the current root', async (t) => {
  const f = await fixture(t);
  const command = path.join(f.directory, 'fake-opl');
  const record = path.join(f.directory, 'calls.jsonl');
  await fs.writeFile(command, `#!/usr/bin/env node\nimport fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(record)}, JSON.stringify({args:process.argv.slice(2),artifact:process.env.OPL_FRAMEWORK_ARTIFACT_REF})+'\\n');
console.log(JSON.stringify(process.argv[3]==='plan'?${JSON.stringify(f.plan)}:{managed_update:{execution:{status:'completed'}}}));\n`, { mode: 0o755 });
  const opl = createOplPassthrough({ command, env: f.env, cwd: f.directory });
  await opl.runManagedUpdate('apply');
  const calls = (await fs.readFile(record, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls.map(c => c.args), [['update', 'plan', '--json'], ['update', 'apply', '--json']]);
  assert.equal(calls[1].artifact, `ghcr.io/gaofeng21cn/one-person-lab-framework@sha256:${'a'.repeat(64)}`);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.root, 'package.json'))).version, '0.3.5');
  f.source.channel_version = '0.3.4';
  await assert.rejects(frameworkUpdateEnvironment(f.env, { operation: 'apply', plan: f.plan }), { code: 'framework_update_downgrade_blocked' });
});

test('cold-start activation rejects older pending generations and permits a forward generation without writing owner state', async (t) => {
  const f = await fixture(t);
  assert.equal(await frameworkUpdateEnvironment(f.env, { operation: 'activate' }), f.env);
  await fs.mkdir(`${f.root}.pending`);
  const pending = { surface_kind: 'opl_framework_pending_generation.v1', target_root: f.root, pending_root: `${f.root}.pending` };
  const bytes = JSON.stringify(pending);
  await fs.writeFile(`${f.root}.pending.json`, bytes);
  await fs.writeFile(path.join(`${f.root}.pending`, 'package.json'), JSON.stringify({ name: 'opl-framework', version: '0.3.4' }));
  // Repeated launches must not consume or rewrite the rejected generation.
  for (let i = 0; i < 2; i++) await assert.rejects(frameworkUpdateEnvironment(f.env, { operation: 'activate' }), { code: 'framework_update_downgrade_blocked' });
  assert.equal(await fs.readFile(`${f.root}.pending.json`, 'utf8'), bytes);
  await fs.writeFile(path.join(`${f.root}.pending`, 'package.json'), JSON.stringify({ name: 'opl-framework', version: '0.3.6' }));
  assert.equal(await frameworkUpdateEnvironment(f.env, { operation: 'activate' }), f.env);
});
