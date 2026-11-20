import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, realpath, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createThreadWorkspaceService } from '../../plugins/opl-host-core/src/thread-workspace-service.mjs';

test('Git reads canonical workspace, distinguishes staged/unstaged, ignores caller paths and does not mutate', async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'studio-git-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q'); await writeFile(path.join(root, 'sample.txt'), 'staged\n'); git('add', 'sample.txt');
  await writeFile(path.join(root, 'sample.txt'), 'unstaged\n');
  await writeFile(path.join(root, 'new.txt'), 'untracked');
  const before = git('status', '--porcelain=v1');
  const service = createThreadWorkspaceService({ threads: { readThread: async ({ threadId }) => {
    if (threadId !== 'allowed') throw Error('not authorized');
    return { cwd: root };
  } } });
  const result = await service.git({ threadId: 'allowed', cwd: '/', args: ['reset', '--hard'] });
  assert.equal(result.status, 'available'); assert.equal(result.threadId, 'allowed');
  assert.match(result.stagedDiff, /\+staged/); assert.match(result.unstagedDiff, /\+unstaged/);
  assert.equal(result.files.find(file => file.path === 'sample.txt').index, 'A');
  assert.equal(result.files.find(file => file.path === 'sample.txt').workingTree, 'M');
  assert.equal(git('status', '--porcelain=v1'), before);
  await assert.rejects(() => service.git({ threadId: 'other' }), /not authorized/);
  await mkdir(path.join(root, 'nested'));
  const nested = createThreadWorkspaceService({ threads: { readThread: async () => ({ cwd: path.join(root, 'nested') }) } });
  assert.equal((await nested.git({ threadId: 'allowed' })).reason, 'workspace_is_not_repository_root');
});
