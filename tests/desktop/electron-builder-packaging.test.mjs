import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { walkAsync } from '@electron/osx-sign';

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

test('macOS signing skips binary resource data while retaining native signing candidates', async context => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-signing-resources-'));
  context.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const app = path.join(temp, 'One Person Lab.app');
  const contents = path.join(app, 'Contents');
  const resources = path.join(contents, 'Resources', 'app.asar.unpacked', 'node_modules');
  const framework = path.join(contents, 'Frameworks', 'Electron Framework.framework', 'Versions', 'A');
  const frameworkRoot = path.join(contents, 'Frameworks', 'Electron Framework.framework');
  const write = (filename, bytes) => {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, bytes);
    return filename;
  };
  const data = [
    write(path.join(resources, 'katex/dist/fonts/KaTeX_AMS-Regular.ttf'), fs.readFileSync(path.join(root, 'node_modules/katex/dist/fonts/KaTeX_AMS-Regular.ttf'))),
    write(path.join(resources, 'pdfjs-dist/cmaps/78-EUC-H.bcmap'), fs.readFileSync(path.join(root, 'node_modules/pdfjs-dist/cmaps/78-EUC-H.bcmap'))),
    write(path.join(framework, 'Resources/en.lproj/locale.pak'), Buffer.alloc(512)),
    write(path.join(framework, 'Resources/resources.pak'), Buffer.alloc(512)),
    write(path.join(framework, 'Resources/icudtl.dat'), Buffer.alloc(512)),
    write(path.join(framework, 'Resources/v8_context_snapshot.arm64.bin'), Buffer.alloc(512)),
  ];
  fs.symlinkSync('Versions/A/Resources', path.join(frameworkRoot, 'Resources'));
  data.push(write(path.join(frameworkRoot, 'Resources/uk.lproj/locale.pak'), Buffer.alloc(512)));
  const executable = fs.openSync(process.execPath, 'r');
  const nativeBytes = Buffer.alloc(512);
  fs.readSync(executable, nativeBytes);
  fs.closeSync(executable);
  const native = [
    write(path.join(contents, 'MacOS/One Person Lab'), nativeBytes),
    write(path.join(framework, 'Electron Framework'), nativeBytes),
    write(path.join(framework, 'Libraries/libEGL.dylib'), nativeBytes),
    write(path.join(resources, '@scope/addon/prebuilds/darwin-arm64/binding.node'), nativeBytes),
    write(path.join(resources, '@scope/addon/lib/helper.so'), nativeBytes),
    write(path.join(resources, 'other/fonts/unrelated.ttf'), nativeBytes),
  ];
  // Exercise the upstream binary detector: these resources really enter its
  // code-sign queue before the carrier's exclusions are applied.
  const candidates = await walkAsync(contents);
  for (const file of [...data, ...native]) assert.ok(candidates.includes(file), file);
  for (const name of ['electron-builder.yml', 'electron-builder.stable.yml']) {
    const config = readConfig(name);
    const ignore = config.mac.signIgnore.map(pattern => new RegExp(pattern));
    const retained = candidates.filter(file => !ignore.some(pattern => pattern.test(file)));
    for (const file of data) assert.ok(!retained.includes(file), `${name}: data ${file}`);
    for (const file of native) assert.ok(retained.includes(file), `${name}: native ${file}`);
    assert.ok(retained.includes(path.join(contents, 'Frameworks', 'Electron Framework.framework')));
    assert.equal(config.mac.hardenedRuntime, true);
    assert.notEqual(config.mac.strictVerify, false);
  }
});
