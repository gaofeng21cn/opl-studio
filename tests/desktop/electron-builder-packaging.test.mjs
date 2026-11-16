import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readConfig(name) {
  return parse(fs.readFileSync(path.join(root, name), 'utf8'));
}

test('desktop carriers prune non-runtime dependency material without dropping Host runtime files', () => {
  for (const name of ['electron-builder.yml', 'electron-builder.stable.yml']) {
    const config = readConfig(name);
    const unpack = config.asarUnpack ?? [];
    const files = config.files ?? [];
    assert.ok(unpack.includes('node_modules/**/*'), `${name} keeps the unpacked Host dependency graph`);
    assert.ok(files.includes('!node_modules/**/*.map'), `${name} prunes source maps`);
    assert.ok(files.includes('!node_modules/**/*.ts'), `${name} prunes TypeScript sources`);
    assert.ok(files.includes('!node_modules/**/*.tsx'), `${name} prunes TSX sources`);
    assert.ok(
      files.some(entry => String(entry).includes('{test,tests,__tests__')),
      `${name} prunes package test material`,
    );
    assert.ok(files.includes('package.json'), `${name} keeps the carrier root manifest`);
  }
});
