import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { rendererCacheKey, sealRendererCache, verifyRendererCache } from '../../scripts/desktop/renderer-build-cache.mjs';

test('renderer reuse binds source, plugins, dependencies, contracts, environment and complete output bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-renderer-cache-'));
  const studioRoot = path.join(root, 'studio');
  const appRoot = path.join(root, 'app');
  const write = (name, bytes) => {
    fs.mkdirSync(path.dirname(name), { recursive: true });
    fs.writeFileSync(name, bytes);
  };
  try {
    fs.mkdirSync(studioRoot);
    execFileSync('git', ['init', '-q'], { cwd: studioRoot });
    write(path.join(studioRoot, '.gitignore'), 'dist/\nnode_modules/\nplugins/*/lib/\n.env.local\n');
    for (const file of ['src/main.tsx', 'plugins/client/src/client.js', 'package-lock.json', 'scripts/build-renderer.mjs']) {
      write(path.join(studioRoot, file), 'original');
    }
    write(path.join(appRoot, 'contracts/profile.json'), '{}');
    const outDir = path.join(studioRoot, 'dist/desktop');
    const key = () => rendererCacheKey({ studioRoot, appRoot });
    const original = key();
    assert.equal(verifyRendererCache(outDir, original), false);
    for (const file of ['index.html', 'renderer.js', 'renderer-build.json']) write(path.join(outDir, file), file);
    sealRendererCache(outDir, original);
    assert.equal(verifyRendererCache(outDir, key()), true);
    // Dependency downloads and rebuilt plugin lib output are excluded.
    write(path.join(studioRoot, 'node_modules/cache'), 'new');
    write(path.join(studioRoot, 'plugins/client/lib/client.js'), 'new');
    assert.equal(key(), original);
    for (const file of ['src/main.tsx', 'plugins/client/src/client.js', 'package-lock.json', 'scripts/build-renderer.mjs']) {
      write(path.join(studioRoot, file), 'changed');
      assert.notEqual(key(), original, file);
      assert.equal(verifyRendererCache(outDir, key()), false);
      write(path.join(studioRoot, file), 'original');
    }
    write(path.join(appRoot, 'contracts/profile.json'), '{"changed":true}');
    assert.notEqual(key(), original);
    write(path.join(appRoot, 'contracts/profile.json'), '{}');
    assert.notEqual(rendererCacheKey({ studioRoot, appRoot, nodeVersion: 'other' }), original);
    assert.notEqual(rendererCacheKey({ studioRoot, appRoot, arch: 'other' }), original);
    const oldEnv = process.env.VITE_OPL_CACHE_TEST;
    try {
      process.env.VITE_OPL_CACHE_TEST = 'changed';
      assert.notEqual(key(), original);
    } finally {
      if (oldEnv === undefined) delete process.env.VITE_OPL_CACHE_TEST;
      else process.env.VITE_OPL_CACHE_TEST = oldEnv;
    }
    write(path.join(studioRoot, '.env.local'), 'VITE_OPL_CACHE_TEST=local');
    assert.notEqual(key(), original);
    fs.rmSync(path.join(studioRoot, '.env.local'));
    write(path.join(outDir, 'renderer.js'), 'corrupt');
    assert.equal(verifyRendererCache(outDir, original), false);
    write(path.join(outDir, 'renderer.js'), 'renderer.js');
    write(path.join(outDir, 'unexpected.js'), 'stale');
    assert.equal(verifyRendererCache(outDir, original), false);
    fs.rmSync(path.join(outDir, 'unexpected.js'));
    assert.equal(verifyRendererCache(outDir, original), true);
    fs.symlinkSync(path.join(outDir, 'renderer.js'), path.join(outDir, 'linked.js'));
    assert.equal(verifyRendererCache(outDir, original), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
