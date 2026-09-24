import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveStableBuildPlan, finalizeStableMetadata } from '../../scripts/desktop/build-release.mjs';
import { writeAppUpdateConfig } from '../../scripts/desktop/write-app-update-config.mjs';
import { parse } from 'yaml';
import crypto from 'node:crypto';
import { validateDesktopPackage } from '../../scripts/validate-desktop-package.mjs';
import { validateWslHostPayload } from '../../scripts/desktop/prepare-wsl-host-payload.mjs';
const env = { OPL_RELEASE_VERSION: '26.9.24', OPL_UPDATER_VERSION: '26.9.2491' };

test('Stable build routes each platform with calendar assets and monotonic machine metadata', () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const plan = resolveStableBuildPlan(['--platform', platform, '--arch', 'x64'], env);
    assert.equal(plan.args.includes(platform === 'darwin' ? '--mac' : platform === 'win32' ? '--win' : '--linux'), true);
    assert.ok(plan.args.includes('--config.extraMetadata.version=26.9.2491'));
    assert.ok(plan.args.includes('--config.extraMetadata.oplReleaseVersion=26.9.24'));
    assert.equal(plan.env.OPL_DESKTOP_RELEASE_IDENTITY, 'stable');
    if (platform === 'linux') assert.ok(plan.args.includes('--config.linux.artifactName=One-Person-Lab-26.9.24-linux-x64.${ext}'));
  }
});

test('Stable build rejects unknown arguments and missing required macOS notarization', () => {
  assert.throws(() => resolveStableBuildPlan(['--skip-vite'], env), /Unsupported/);
  assert.throws(() => resolveStableBuildPlan(['--platform', 'darwin'], { ...env, OPL_REQUIRE_MACOS_GATEKEEPER: 'true' }), /credentials/);
  const plan = resolveStableBuildPlan(['arm64', '--dir-only'], env, { platform: 'darwin', arch: 'arm64' });
  assert.equal(plan.directoryOnly, true);
  assert.ok(plan.args.includes('--dir'));
});

test('Stable ARM64 feed alias is byte identical and cannot accept a display version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-feed-'));
  try {
    const plan = resolveStableBuildPlan(['arm64'], env, { platform: 'darwin', arch: 'arm64' });
    fs.writeFileSync(path.join(root, 'latest-arm64-mac.yml'), 'version: 26.9.2491\nfiles: []\n');
    finalizeStableMetadata({ outputRoot: root, plan });
    assert.deepEqual(fs.readFileSync(path.join(root, 'latest-mac.yml')), fs.readFileSync(path.join(root, 'latest-arm64-mac.yml')));
    fs.writeFileSync(path.join(root, 'latest-mac.yml'), 'version: 26.9.24\n');
    assert.throws(() => finalizeStableMetadata({ outputRoot: root, plan }), /machine version/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Stable Windows and Linux package validators preserve published names', () => {
  for (const platform of ['win32', 'linux']) {
    const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-package-'));
    try {
      const unpacked = platform === 'win32' ? 'win-unpacked' : 'linux-unpacked';
      fs.mkdirSync(path.join(outRoot, unpacked, 'resources'), { recursive: true });
      fs.writeFileSync(path.join(outRoot, unpacked, 'resources/app.asar'), 'asar');
      fs.writeFileSync(path.join(outRoot, unpacked, platform === 'win32' ? 'One Person Lab.exe' : 'one-person-lab'), 'exe');
      const assets = platform === 'win32' ? ['win-x64.exe', 'win-x64.zip'] : ['linux-x64.deb'];
      for (const asset of assets) fs.writeFileSync(path.join(outRoot, `One-Person-Lab-26.9.24-${asset}`), Buffer.alloc(2048));
      const result = validateDesktopPackage({ outRoot, platform, arch: 'x64', version: '26.9.24', identity: 'stable', requireDistribution: true });
      assert.equal(result.status, 'desktop_package_validated');
      assert.equal(result.identity, 'stable');
    } finally { fs.rmSync(outRoot, { recursive: true, force: true }); }
  }
});


test('Windows and Linux updater metadata is written inside the native resources directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-feed-'));
  try {
    for (const platform of ['win32', 'linux']) {
      const output = writeAppUpdateConfig({ appOutDir: path.join(root, platform), platform, builderConfig: {
        appId: 'cn.onepersonlab.opl', productName: 'One Person Lab', publish: { provider: 'github', owner: 'gaofeng21cn', repo: 'one-person-lab-app' }
      } });
      assert.equal(output, path.join(root, platform, 'resources', 'app-update.yml'));
      assert.match(fs.readFileSync(output, 'utf8'), /repo: one-person-lab-app/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Stable Linux metadata binds the existing DEB namespace and exact bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-linux-feed-'));
  try {
    const plan = resolveStableBuildPlan(['--platform', 'linux', '--arch', 'x64'], env);
    const name = 'One-Person-Lab-26.9.24-linux-x64.deb';
    const bytes = Buffer.from('candidate deb bytes');
    fs.writeFileSync(path.join(root, name), bytes);
    finalizeStableMetadata({ outputRoot: root, plan });
    const metadata = parse(fs.readFileSync(path.join(root, 'latest-linux.yml'), 'utf8'));
    assert.equal(metadata.version, env.OPL_UPDATER_VERSION);
    assert.equal(metadata.path, name);
    assert.equal(metadata.sha512, crypto.createHash('sha512').update(bytes).digest('base64'));
    assert.deepEqual(metadata.files, [{ url: name, sha512: metadata.sha512, size: bytes.length }]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Windows guest Host requires its Linux dependency closure and exact source lock', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-wsl-host-'));
  try {
    const shellRef = 'a'.repeat(40);
    const names = ['package.json', 'package-lock.json', 'desktop/windows-guest-host.mjs', 'desktop/windows-guest-rpc.mjs', 'desktop/windows-runtime.mjs', 'scripts/webui-host/host-core.mjs', 'node_modules/@deepseek-ai/cordis/package.json'];
    for (const name of names) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), '{}');
    }
    const manifest = { schema: 'opl_studio_windows_guest_host.v1', platform: 'linux', arch: 'x64',
      entry: 'desktop/windows-guest-host.mjs', shell_ref: shellRef,
      package_lock_sha256: crypto.createHash('sha256').update('{}').digest('hex'),
      files: names.sort((a, b) => a.localeCompare(b)).map(name => ({ path: name, sha256: crypto.createHash('sha256').update('{}').digest('hex') })) };
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    assert.equal(validateWslHostPayload(root, shellRef).shell_ref, shellRef);
    assert.throws(() => validateWslHostPayload(root, 'b'.repeat(40)), /identity/);
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{"changed":true}');
    assert.throws(() => validateWslHostPayload(root, shellRef), /lock digest/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
