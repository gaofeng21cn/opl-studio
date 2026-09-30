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

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Mirrors the real Windows guest Host payload shape closely enough to exercise the
// post-pack byte-inventory gate: manifest declared files must equal packaged bytes.
function writePackagedWslHostPayload(payloadRoot, { includeNodeModules = true } = {}) {
  const contents = {
    'package.json': '{"name":"opl-studio","version":"0.1.19"}',
    'package-lock.json': '{"lockfileVersion":3}',
    'desktop/windows-guest-host.mjs': 'guest-host',
    'desktop/windows-guest-rpc.mjs': 'rpc',
    'desktop/windows-runtime.mjs': 'runtime',
    'desktop/windows-bootstrap.sh': 'bootstrap',
    'desktop/windows-guest-inspect.mjs': 'inspect',
    'desktop/official-profile.mjs': 'profile',
    'src/host/create-host.mjs': 'create-host',
    'plugins/opl-host-core/lib/index.mjs': 'host-core',
    'runtime/node/bin/node': 'node',
    'runtime/node/bin/npm': 'npm',
    'runtime/node/lib/node_modules/npm/bin/npm-cli.js': 'npm-cli',
    'runtime/codex/vendor/x86_64-unknown-linux-musl/bin/codex': 'codex',
    'runtime/opl-install.sh': 'installer',
    'resources/opl-official-profile/manifest.json': '{}',
    'resources/opl-official-profile/app-product-profile.json': '{}',
    'resources/opl-official-profile/official-profile-package-apply.ts': 'apply',
    'node_modules/@deepseek-ai/cordis/package.json': '{"name":"@deepseek-ai/cordis"}',
    'node_modules/@one-person-lab/opl-host-core/lib/index.mjs': 'host-core-dep'
  };
  if (includeNodeModules) contents['node_modules/dependency-closure/index.js'] = 'closure';
  for (const [relative, body] of Object.entries(contents)) {
    const file = path.join(payloadRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  const inventory = (directory, relative = '') => fs.readdirSync(path.join(directory, relative), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return inventory(directory, name);
      return name === 'manifest.json' ? [] : [{ path: name, sha256: sha256(fs.readFileSync(path.join(directory, name))) }];
    });
  const manifest = {
    schema: 'opl_studio_windows_guest_host.v1', platform: 'linux', arch: 'x64',
    entry: 'desktop/windows-guest-host.mjs', shell_ref: 'a'.repeat(40), node_version: 'v24.21.0',
    package_lock_sha256: sha256(fs.readFileSync(path.join(payloadRoot, 'package-lock.json'))),
    production_dependencies: true, linux_host_smoke: 'passed',
    bootstrap: {
      node: { root: 'runtime/node', version: '24.21.0' },
      codex: { path: 'runtime/codex/vendor/x86_64-unknown-linux-musl/bin/codex', version: '0.157.0' },
      framework_ref: 'a'.repeat(40), framework_installer: 'runtime/opl-install.sh'
    },
    files: inventory(payloadRoot)
  };
  fs.writeFileSync(path.join(payloadRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

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
      if (platform === 'win32') writePackagedWslHostPayload(path.join(outRoot, unpacked, 'resources', 'opl-wsl-host'));
      const assets = platform === 'win32' ? ['win-x64.exe', 'win-x64.zip'] : ['linux-x64.deb'];
      for (const asset of assets) fs.writeFileSync(path.join(outRoot, `One-Person-Lab-26.9.24-${asset}`), Buffer.alloc(2048));
      const result = validateDesktopPackage({ outRoot, platform, arch: 'x64', version: '26.9.24', identity: 'stable', requireDistribution: true });
      assert.equal(result.status, 'desktop_package_validated');
      assert.equal(result.identity, 'stable');
      if (platform === 'win32') assert.equal(result.packagedWslHostPayload.declared_file_count > 0, true);
      else assert.equal(result.packagedWslHostPayload, null);
    } finally { fs.rmSync(outRoot, { recursive: true, force: true }); }
  }
});

test('Stable Windows package validation rejects a packaged guest Host payload that lost node_modules', () => {
  // Regression: electron-builder omits the root-level node_modules of an
  // extraResources directory, so the bytes inside the built package no longer
  // match the manifest.json written before packing. Pre-pack validation passed
  // and the defect only surfaced as an App startup failure.
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-payload-'));
  try {
    const unpacked = path.join(outRoot, 'win-unpacked');
    fs.mkdirSync(path.join(unpacked, 'resources'), { recursive: true });
    fs.writeFileSync(path.join(unpacked, 'resources/app.asar'), 'asar');
    fs.writeFileSync(path.join(unpacked, 'One Person Lab.exe'), 'exe');
    const payload = path.join(unpacked, 'resources', 'opl-wsl-host');
    writePackagedWslHostPayload(payload);
    fs.rmSync(path.join(payload, 'node_modules'), { recursive: true, force: true });
    assert.throws(
      () => validateDesktopPackage({ outRoot, platform: 'win32', arch: 'x64', version: '26.9.24', identity: 'stable' }),
      /payload bytes differ from the packaged manifest: missing \d+/
    );
  } finally { fs.rmSync(outRoot, { recursive: true, force: true }); }
});

test('Post-pack qualification emits a structured receipt for the packaged guest Host payload', () => {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-payload-receipt-'));
  try {
    const unpacked = path.join(outRoot, 'win-unpacked');
    fs.mkdirSync(path.join(unpacked, 'resources'), { recursive: true });
    fs.writeFileSync(path.join(unpacked, 'resources/app.asar'), 'asar');
    fs.writeFileSync(path.join(unpacked, 'One Person Lab.exe'), 'exe');
    const payload = path.join(unpacked, 'resources', 'opl-wsl-host');
    const manifest = writePackagedWslHostPayload(payload);
    const result = validateDesktopPackage({ outRoot, platform: 'win32', arch: 'x64', version: '26.9.24', identity: 'stable', writeReceipt: true });
    const receipt = result.packagedWslHostPayload;
    assert.equal(receipt.schema, 'opl_studio_windows_guest_host_payload_qualification.v1');
    assert.equal(receipt.status, 'passed');
    assert.equal(receipt.stage, 'post_pack');
    assert.equal(receipt.subject, 'packaged_windows_guest_host_payload');
    assert.equal(receipt.payload_root_relative, 'resources/opl-wsl-host');
    assert.equal(receipt.shell_ref, manifest.shell_ref);
    assert.equal(receipt.declared_file_count, manifest.files.length);
    assert.equal(receipt.actual_file_count, manifest.files.length);
    assert.equal(receipt.missing_file_count, 0);
    assert.equal(receipt.extra_file_count, 0);
    assert.equal(receipt.changed_file_count, 0);
    assert.equal(receipt.symlink_count, 0);
    assert.match(receipt.manifest_sha256, /^[0-9a-f]{64}$/);
    assert.equal(receipt.package_lock_sha256, manifest.package_lock_sha256);
    const written = JSON.parse(fs.readFileSync(path.join(outRoot, receipt.receipt), 'utf8'));
    assert.equal(written.shell_ref, manifest.shell_ref);
  } finally { fs.rmSync(outRoot, { recursive: true, force: true }); }
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
    const names = ['package.json', 'package-lock.json', 'desktop/windows-guest-host.mjs', 'desktop/windows-guest-rpc.mjs', 'desktop/windows-runtime.mjs',
      'desktop/windows-bootstrap.sh', 'desktop/windows-guest-inspect.mjs', 'desktop/official-profile.mjs', 'runtime/node/bin/node', 'runtime/node/bin/npm',
      'runtime/node/lib/node_modules/npm/bin/npm-cli.js', 'runtime/codex/vendor/x86_64-unknown-linux-musl/bin/codex', 'runtime/opl-install.sh',
      'node_modules/@one-person-lab/opl-host-core/lib/index.mjs', 'resources/opl-official-profile/manifest.json', 'resources/opl-official-profile/app-product-profile.json',
      'resources/opl-official-profile/official-profile-package-apply.ts', 'node_modules/@deepseek-ai/cordis/package.json'];
    for (const name of names) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), '{}');
    }
    const manifest = { schema: 'opl_studio_windows_guest_host.v1', platform: 'linux', arch: 'x64',
      entry: 'desktop/windows-guest-host.mjs', shell_ref: shellRef,
      package_lock_sha256: crypto.createHash('sha256').update('{}').digest('hex'),
      bootstrap: { node: { root: 'runtime/node', version: '24.21.0' }, codex: { path: 'runtime/codex/vendor/x86_64-unknown-linux-musl/bin/codex', version: '0.144.5' },
        framework_ref: 'b'.repeat(40), framework_installer: 'runtime/opl-install.sh' },
      files: names.sort((a, b) => a.localeCompare(b)).map(name => ({ path: name, sha256: crypto.createHash('sha256').update('{}').digest('hex') })) };
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    assert.equal(validateWslHostPayload(root, shellRef).shell_ref, shellRef);
    assert.throws(() => validateWslHostPayload(root, 'b'.repeat(40)), /identity/);
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{"changed":true}');
    assert.throws(() => validateWslHostPayload(root, shellRef), /lock digest/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
