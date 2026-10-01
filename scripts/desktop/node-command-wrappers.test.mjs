import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { writeNodeCommandWrappers } from './prepare-wsl-host-payload.mjs';

test('guest npm and npx resolve their packaged CLI through the public bin links', context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl guest node '));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nodeRoot = path.join(root, 'runtime/node');
  const publicBin = path.join(root, 'usr/local/bin');
  const cliRoot = path.join(nodeRoot, 'lib/node_modules/npm/bin');
  fs.mkdirSync(path.join(nodeRoot, 'bin'), { recursive: true });
  fs.mkdirSync(publicBin, { recursive: true });
  fs.mkdirSync(cliRoot, { recursive: true });
  fs.symlinkSync(process.execPath, path.join(nodeRoot, 'bin/node'));
  writeNodeCommandWrappers(nodeRoot);
  for (const command of ['npm', 'npx']) {
    fs.writeFileSync(path.join(cliRoot, `${command}-cli.js`), 'console.log(JSON.stringify(process.argv.slice(2)))\n');
    const executable = path.join(publicBin, command);
    fs.symlinkSync(path.join(nodeRoot, 'bin', command), executable);
    const result = spawnSync(executable, ['--version', 'argument with spaces'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.deepEqual(JSON.parse(result.stdout), ['--version', 'argument with spaces']);
  }
});
