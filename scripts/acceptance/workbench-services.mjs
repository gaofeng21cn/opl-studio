import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, access, rm, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CodexAppServerTransport } from '../webui-host/app-server-transport.mjs';
import { createWorkbenchTaskExecutor } from '../webui-host/workbench-task-executor.mjs';
import { OplFrameworkBridge } from '../webui-host/opl-framework-bridge.mjs';
import { createOplPassthrough } from '../webui-host/opl-passthrough.mjs';
import { createWebUiHost } from '../webui-host/http-host.mjs';
import { buildRenderer } from '../build-renderer.mjs';

const framework = process.env.OPL_FRAMEWORK_REPO_ROOT;
const address = process.env.OPL_TEST_TEMPORAL_ADDRESS;
if (!framework || !address || !/^(127\.0\.0\.1|localhost):\d+$/.test(address)) throw Error('Set OPL_FRAMEWORK_REPO_ROOT and an isolated loopback OPL_TEST_TEMPORAL_ADDRESS.');
const { startCordisWorkbenchServicesHost } = await import(pathToFileURL(path.join(framework, 'dist/host/composition-profiles.js')));
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'opl-workbench-acceptance-')));
const logRoot = path.join(root, 'app-logs');
const cacheRoot = path.join(root, 'app-cache');
const env = { ...process.env, CODEX_HOME: root, OPL_STATE_DIR: path.join(root, 'state'), OPL_FRAMEWORK_PACKAGE_ROOT: framework, OPL_TEMPORAL_ADDRESS: address, OPL_TEMPORAL_NAMESPACE: 'default', OPL_STUDIO_READ_ONLY: '0', OPL_DATA_DIR: root, OPL_STUDIO_LOG_ROOT: logRoot, OPL_STUDIO_CACHE_ROOT: cacheRoot, FAKE_APP_SERVER_LOG: path.join(root, 'codex.jsonl') };
const fixture = path.resolve('scripts/webui-host/fixtures/fake-app-server.mjs');
const transport = new CodexAppServerTransport({ command: process.execPath, args: [fixture], cwd: root, env, requestTimeoutMs: 3000 });
let service; let webHost;
const evidence = [];
const read = (op, input = {}) => service.read({ package_id: 'opl-workbench-services', ref: `workbench#${op}`, input });
const execute = async (op, input, { confirm = true } = {}) => {
  const request = { package_id: 'opl-workbench-services', ref: `workbench#${op}`, input };
  const preview = await service.execute(request); assert.equal(preview.status, 'preview_ready');
  return service.execute({ ...request, dryRun: false, confirmed: confirm, confirmationId: preview.confirmationId });
};
const waitUntil = async (fn, timeout = 20_000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) { const result = await fn(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 250)); }
  throw Error('Timed out waiting for authoritative readback.');
};
try {
  await mkdir(path.join(root, 'memories')); await writeFile(path.join(root, 'memories', 'MEMORY.md'), 'Existing fixture memory');
  await mkdir(logRoot); await mkdir(cacheRoot);
  const staleLog = path.join(logRoot, 'stale.log'); const staleCache = path.join(cacheRoot, 'stale.bin');
  await writeFile(staleLog, 'old log'); await writeFile(staleCache, 'old cache');
  await utimes(staleLog, new Date(0), new Date(0)); await utimes(staleCache, new Date(0), new Date(0));
  await transport.start();
  const bootstrap = new OplFrameworkBridge({ env, workspaceRoot: root, codex: { transport, capabilities: () => ({}) } });
  await bootstrap.start();
  try {
    const readback = await bootstrap.opl.readContribution({ packageId: 'opl-workbench-services', ref: 'workbench#tasks' });
    assert.equal(readback.stdoutJson.opl_app_contribution.response.result.status, 'available');
    evidence.push('production-framework-bootstrap/public-export/isolated-plugin-lifecycle');
  } finally { await bootstrap.close(); }
  service = await startCordisWorkbenchServicesHost({ env, executor: createWorkbenchTaskExecutor(transport) });
  const inventory = await read('inventory');
  assert.equal(inventory.schema, 'opl_local_data_lifecycle_inventory.v1');
  const cleanupIds = inventory.categories.flatMap(category => category.files).filter(file => file.name === 'stale.log' || file.name === 'stale.bin').map(file => file.id);
  assert.equal(cleanupIds.length, 2);
  const cleanup = await execute('cleanup', { ids: cleanupIds });
  assert.equal(cleanup.result.status, 'executed');
  assert.equal(cleanup.result.removed.length, 2);
  assert.equal(typeof cleanup.result.receipt_ref, 'string');
  await assert.rejects(access(staleLog)); await assert.rejects(access(staleCache));
  const receiptPath = path.join(env.OPL_STATE_DIR, 'receipts', 'workbench-cleanup', `${cleanup.result.receipt_ref.split(':').at(-1)}.json`);
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  assert.equal(receipt.removed_count, 2);
  evidence.push('owner-log-cache-inventory/preview-confirm/fingerprint-guard/receipt');
  await read('tasks');
  const task = { id: 'integration', title: 'Isolated scheduled test', prompt: 'fixture only', cwd: root, permissions: ':read-only', timeoutMinutes: 1, schedule: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' } };
  await assert.rejects(execute('task_create', task, { confirm: false }), /confirmation/);
  await execute('task_create', task);
  assert.equal((await read('tasks')).items.length, 1);
  await execute('task_pause', { id: task.id, revision: 1 });
  assert.equal((await read('tasks')).items[0].paused, true);
  await assert.rejects(execute('task_resume', { id: task.id, revision: 1 }), /changed/);
  await execute('task_update', { ...task, title: 'Edited scheduled test', revision: 2, schedule: { kind: 'weekly', time: '16:30', weekdays: [1, 3], timeZone: 'Europe/Berlin' } });
  await execute('task_resume', { id: task.id, revision: 3 });
  await execute('task_run', { id: task.id, revision: 4, requestId: 'isolated-manual-trigger' });
  const run = await waitUntil(async () => (await read('history')).items.find(item => item.result?.status === 'completed'));
  const canonical = await transport.readThread(run.result.threadId, true);
  assert.equal(canonical.thread.turns.find(turn => turn.id === run.result.turnId).status, 'completed');
  evidence.push('create/preview/confirm/update/timezone/pause/resume/conflict/manual-trigger/canonical-result');
  const concurrent = { ...task, id: 'concurrent' };
  await execute('task_create', concurrent);
  const raceRequest = { package_id: 'opl-workbench-services', ref: 'workbench#task_pause', input: { id: 'concurrent', revision: 1 } };
  const racePreviews = await Promise.all([service.execute(raceRequest), service.execute(raceRequest)]);
  const race = await Promise.allSettled(racePreviews.map(preview => service.execute({ ...raceRequest, dryRun: false, confirmed: true, confirmationId: preview.confirmationId })));
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1, 'Concurrent updates must not silently overwrite each other.');
  await execute('task_delete', { id: 'concurrent', revision: 2 });
  evidence.push('concurrent-schedule-update-conflict');
  // Timed dispatch is exercised separately from the manual-trigger action.
  const once = { ...task, id: 'clock', title: 'Clock trigger', schedule: { kind: 'once', timeZone: 'Asia/Shanghai', at: new Date(Date.now() + 6000).toISOString() } };
  await execute('task_create', once);
  await waitUntil(async () => (await read('history')).items.find(item => item.taskId === 'clock' && item.result?.status === 'completed'));
  evidence.push('actual-once-time-trigger');
  await execute('task_delete', { id: task.id, revision: 4 });
  assert.equal((await read('tasks')).items.some(item => item.id === task.id), false);
  assert.ok((await read('history')).items.some(item => item.taskId === task.id));
  await service.dispose();
  service = await startCordisWorkbenchServicesHost({ env, executor: createWorkbenchTaskExecutor(transport) });
  assert.ok((await read('tasks')).items.some(item => item.id === 'clock'));
  assert.ok((await read('history')).items.some(item => item.taskId === task.id));
  evidence.push('host-restart/deleted-task-history-retained');
  const memory = await read('memory');
  assert.equal(memory.items.length, 1);
  await execute('memory_correct', { source_id: memory.items[0].id, content: 'Fixture correction' });
  assert.equal((await read('memory')).items.length, 2);
  assert.equal(await readFile(path.join(root, 'memories/MEMORY.md'), 'utf8'), 'Existing fixture memory');
  evidence.push('real-memory-read/correction-note/main-memory-preserved');
  const log = (await readFile(path.join(root, 'codex.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(log.some(row => row.method === 'turn/start' && row.params.sandboxPolicy.type === 'readOnly'));
  assert.ok(!log.some(row => row.method === 'turn/start' && row.params.sandboxPolicy.type === 'dangerFullAccess'));
  evidence.push('canonical-app-server/explicit-readonly-permission');
  if (process.env.OPL_WORKBENCH_RENDER === '1') {
    buildRenderer({ outDir: path.resolve('dist/webui'), htmlName: 'index.html', jsName: 'renderer.js' });
    const opl = createOplPassthrough({ env });
    // Production bridge and owner implementation, deterministic App state only.
    await opl.registerWorkbenchServices(async () => service);
    opl.registerWorkbenchServices = undefined;
    opl.readState = async profile => ({ profile, app_state: { app_state: { ...service.appStatePatch(), codex_personalization: {}, settings_control_center: { app_settings_read_model: { workspace: { selected_path: root } } } } }, readback: { exitCode: 0 } });
    opl.readInitialize = async () => ({ readback: { exitCode: 0 } });
    opl.readFullDrilldown = async () => ({ detail: 'full', drilldown: { app_operator_drilldown: { ref_family_refs: { memory_refs: { refs: [{ ref: 'memory://fixture', role: 'consumed_memory_ref' }] } } } }, readback: { exitCode: 0 } });
    webHost = await createWebUiHost({ transport, opl, env, dshHome: path.join(root, 'dsh'), webRoot: path.resolve('dist/webui') });
    await writeFile('/tmp/opl-workbench-ui-context.json', JSON.stringify({ url: webHost.url, root }));
    console.log(`UI_READY ${webHost.url}`);
    await waitUntil(async () => { try { await access(path.join(root, 'ui-complete')); return true; } catch { return false; } }, 30 * 60_000);
    evidence.push('browser-interaction-see-rendered-readback');
  }
  await mkdir('out/acceptance', { recursive: true });
  await writeFile(`out/acceptance/workbench-services${process.versions.electron ? '-electron' : ''}.json`, JSON.stringify({ status: 'passed', evidence, testedAt: new Date().toISOString(), electron: process.versions.electron ?? null, runtime: 'isolated Temporal + fake App Server', active_shell_adopted: false, release_ready: false }, null, 2));
  console.log(JSON.stringify({ status: 'passed', evidence }));
} finally {
  await webHost?.close(); await service?.dispose(); await transport.stop();
  await rm(root, { recursive: true, force: true });
}
