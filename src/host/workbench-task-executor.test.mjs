import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkbenchTaskExecutor } from '../../plugins/opl-framework-bridge/src/workbench-task-executor.mjs';
import { createOplPassthrough, compactFastState } from '../../plugins/opl-framework-bridge/src/opl-passthrough.mjs';

test('scheduled turns use the current App Server, explicit permissions and canonical readback', async () => {
  const calls = [];
  const executor = createWorkbenchTaskExecutor({
    startThread: async input => { calls.push(input); return { thread: { id: 'canonical' } }; },
    renameThread: async () => { throw Error('rename failed'); },
    startTurn: async (...input) => { calls.push(input); return { turn: { id: 'turn' } }; },
    readThread: async () => ({ thread: { id: 'canonical', turns: [{ id: 'turn', status: 'completed', items: [{ type: 'agentMessage', text: 'done' }] }] } }),
    interruptTurn: async (...input) => calls.push(input),
  });
  const task = { title: 'schedule', cwd: '/workspace', permissions: ':read-only', prompt: 'fixture' };
  const thread = await executor.createThread(task);
  const ref = await executor.startTask(task, thread);
  assert.equal(calls[0].permissions, ':read-only');
  assert.equal(calls[1][3].sandboxPolicy.type, 'readOnly');
  assert.equal(calls[1][3].sandboxPolicy.networkAccess, true);
  await executor.startTask({ ...task, permissions: ':workspace' }, thread);
  assert.equal(calls.at(-1)[3].sandboxPolicy.type, 'workspaceWrite');
  assert.equal(calls.at(-1)[3].sandboxPolicy.networkAccess, true);
  // Temporal admitted the run; time spent waiting for a worker is not a second
  // execution permission or a reason to leave a newly created thread empty.
  const delayedThread = await executor.createThread(task, Date.now() - 600_000);
  assert.deepEqual(delayedThread, { threadId: 'canonical' });
  assert.deepEqual(await executor.startTask(task, delayedThread, Date.now() - 600_000), { threadId: 'canonical', turnId: 'turn' });
  assert.deepEqual(await executor.readTask(ref), { ...ref, status: 'completed', summary: 'done' });
  await executor.interruptTask(ref);
  assert.deepEqual(calls.at(-1), ['canonical', 'turn']);
});

test('workbench action bridge retains preview/confirmation/error, protects read-only, and preserves projection', async () => {
  let executed = 0;
  const opl = createOplPassthrough({ env: { OPL_STUDIO_READ_ONLY: '1' } });
  await opl.registerWorkbenchServices(async () => ({
    appStatePatch: () => ({ workbench_services: { schema_version: 'opl-workbench-services.v1' } }),
    read: async () => ({ status: 'available', items: [] }),
    execute: async request => { executed++; return { status: 'preview_ready', confirmationId: 'confirmation', result: { summary: 'preview' } }; },
    dispose() {},
  }));
  const request = { actionId: 'package_contribution_execute', payload: { package_id: 'opl-workbench-services', ref: 'workbench#cleanup', input: { ids: ['logs:x'] } } };
  const preview = await opl.executeAction(request);
  assert.equal(preview.dryRun, true); assert.equal(preview.status, 'preview_ready'); assert.equal(preview.confirmationId, 'confirmation');
  const blocked = await opl.executeAction({ ...request, dryRun: false });
  assert.equal(blocked.status, 'failed'); assert.equal(executed, 1);
  const read = await opl.readContribution({ packageId: 'opl-workbench-services', ref: 'workbench#tasks' });
  assert.equal(read.stdoutJson.opl_app_contribution.response.result.status, 'available');
  const services = { schema_version: 'opl-workbench-services.v1', tasks: { status: 'not_configured' } };
  assert.deepEqual(compactFastState({ app_state: { workbench_services: services } }).app_state.workbench_services, services);
  await opl.closeWorkbenchServices();
});

test('an incompatible Framework workbench export degrades locally', async () => {
  let disposed = 0;
  const opl = createOplPassthrough();
  await opl.registerWorkbenchServices(async () => ({ dispose: async () => { disposed++; } }));
  assert.equal(disposed, 1);
  await assert.rejects(opl.readContribution({packageId:'opl-workbench-services',ref:'workbench#tasks'}), /Update Framework/);
  await opl.closeWorkbenchServices();
});
