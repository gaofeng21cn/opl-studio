import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function payloadFiles(directory, relative = '') {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const name = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Windows guest Host payload forbids symlink ${name}`);
    if (entry.isDirectory()) return payloadFiles(directory, name);
    if (!entry.isFile()) throw new Error(`Windows guest Host payload forbids special file ${name}`);
    return name === 'manifest.json' ? [] : [{ path: name, sha256: sha256(fs.readFileSync(path.join(directory, name))) }];
  });
}

function copyMaterializedTree(source, destination, root, ancestors = new Set()) {
  const real = fs.realpathSync(source);
  if (real !== root && !real.startsWith(root + path.sep)) throw new Error('Guest Host dependency link escapes its build root');
  const stat = fs.statSync(real);
  if (stat.isDirectory()) {
    if (ancestors.has(real)) throw new Error('Guest Host dependency link contains a cycle');
    const next = new Set([...ancestors, real]);
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(real)) copyMaterializedTree(path.join(real, entry), path.join(destination, entry), root, next);
  } else if (stat.isFile()) {
    fs.copyFileSync(real, destination);
    fs.chmodSync(destination, stat.mode);
  } else throw new Error('Guest Host dependency contains a special file');
}

function prepareBootstrapRuntime(staging, appRoot, frameworkRef) {
  if (!appRoot || !/^[0-9a-f]{40}$/.test(frameworkRef ?? '')) throw new Error('Windows bootstrap requires frozen App pins and Framework ref');
  const pins = JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts/app-windows-bootstrap-pins.json'), 'utf8'));
  const qualification = JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts/app-release-qualification-input-manifest.json'), 'utf8'));
  if (pins.schema !== 'opl_app_windows_bootstrap_pins.v1' || pins.platform !== 'linux' || pins.arch !== 'x64'
    || pins.codex.version !== qualification.runtime_payloads?.codex_cli?.version) throw new Error('Windows bootstrap pins differ from the frozen App qualification source');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-wsl-bootstrap-'));
  const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 180_000, ...options });
    if (result.status !== 0) throw new Error(`Windows bootstrap ${command} failed: ${result.stderr || result.error?.message || result.status}`);
    return result.stdout.trim();
  };
  try {
    for (const kind of ['node', 'codex']) {
      const pin = pins[kind];
      const expectedUrl = kind === 'node' ? `https://nodejs.org/dist/v${pin.version}/node-v${pin.version}-linux-x64.tar.gz`
        : `https://registry.npmjs.org/@openai/codex/-/codex-${pin.version}-linux-x64.tgz`;
      if (pin.url !== expectedUrl || !/^\d+\.\d+\.\d+$/.test(pin.version)) throw new Error('Invalid Windows bootstrap archive source');
      const archive = path.join(temporary, `${kind}.tgz`);
      run('curl', ['--fail', '--location', '--silent', '--show-error', '--output', archive, pin.url]);
      const bytes = fs.readFileSync(archive);
      const digest = kind === 'node' ? sha256(bytes) : 'sha512-' + crypto.createHash('sha512').update(bytes).digest('base64');
      if (digest !== (kind === 'node' ? pin.sha256 : pin.integrity)) throw new Error('Windows bootstrap archive digest mismatch');
      const extracted = path.join(temporary, kind);
      fs.mkdirSync(extracted);
      const entries = run('tar', ['-tzf', archive]).split('\n');
      if (entries.some(name => name.startsWith('/') || name.split('/').includes('..'))) throw new Error('Windows bootstrap archive path escapes extraction');
      run('tar', ['-xzf', archive, '--strip-components=1', '-C', extracted]);
      const destination = path.join(staging, 'runtime', kind);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      copyMaterializedTree(extracted, destination, fs.realpathSync(extracted));
    }
    const nodeRoot = path.join(staging, 'runtime/node');
    for (const name of ['npm', 'npx']) {
      fs.writeFileSync(path.join(nodeRoot, 'bin', name), `#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/../lib/node_modules/npm/bin/${name}-cli.js" "$@"\n`, { mode: 0o755 });
    }
    const codexPath = 'runtime/codex/vendor/x86_64-unknown-linux-musl/bin/codex';
    const codexEntry = path.join(staging, codexPath);
    if (run(path.join(nodeRoot, 'bin/node'), ['--version']) !== `v${pins.node.version}`) throw new Error('Pinned guest Node version mismatch');
    run(path.join(nodeRoot, 'bin/npm'), ['--version']);
    if (!run(codexEntry, ['--version']).includes(pins.codex.version)) throw new Error('Pinned guest Codex version mismatch');
    const materialize = run(process.execPath, ['--experimental-strip-types', path.join(appRoot, 'scripts/prepare-standard-release-payload.ts'), 'studio',
      '--target-root', temporary, '--framework-ref', frameworkRef], { cwd: appRoot });
    if (!materialize) throw new Error('Frozen Framework installer materialization returned no identity');
    fs.copyFileSync(path.join(temporary, 'resources/opl-framework-bootstrap/opl-install.sh'), path.join(staging, 'runtime/opl-install.sh'));
    fs.mkdirSync(path.join(staging, 'resources'), { recursive: true });
    fs.cpSync(path.join(temporary, 'resources/opl-official-profile'), path.join(staging, 'resources/opl-official-profile'), { recursive: true });
    return { node: { root: 'runtime/node', version: pins.node.version }, codex: { path: codexPath, version: pins.codex.version },
      framework_ref: frameworkRef, framework_installer: 'runtime/opl-install.sh' };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

export function validateWslHostPayload(directory, expectedShellRef) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.schema !== 'opl_studio_windows_guest_host.v1' || manifest.platform !== 'linux'
    || manifest.arch !== 'x64' || manifest.entry !== 'desktop/windows-guest-host.mjs'
    || !/^[0-9a-f]{40}$/.test(manifest.shell_ref)
    || (expectedShellRef && manifest.shell_ref !== expectedShellRef)) {
    throw new Error('Windows guest Host payload identity mismatch');
  }
  const bootstrap = manifest.bootstrap;
  if (bootstrap?.node?.root !== 'runtime/node' || !/^\d+\.\d+\.\d+$/.test(bootstrap?.node?.version ?? '')
    || bootstrap?.codex?.path !== 'runtime/codex/vendor/x86_64-unknown-linux-musl/bin/codex'
    || !/^\d+\.\d+\.\d+$/.test(bootstrap?.codex?.version ?? '')
    || !/^[0-9a-f]{40}$/.test(bootstrap?.framework_ref ?? '') || bootstrap?.framework_installer !== 'runtime/opl-install.sh') {
    throw new Error('Windows guest Host first-install bootstrap identity is missing');
  }
  for (const relative of ['package.json', 'package-lock.json', manifest.entry, 'desktop/windows-guest-rpc.mjs', 'desktop/windows-runtime.mjs',
    'desktop/windows-bootstrap.sh', 'desktop/windows-guest-inspect.mjs', 'desktop/official-profile.mjs', 'runtime/node/bin/node', 'runtime/node/bin/npm',
    'runtime/node/lib/node_modules/npm/bin/npm-cli.js', bootstrap.codex.path, bootstrap.framework_installer,
    'scripts/webui-host/host-core.mjs', 'resources/opl-official-profile/manifest.json', 'resources/opl-official-profile/app-product-profile.json',
    'resources/opl-official-profile/official-profile-package-apply.ts', 'node_modules/@deepseek-ai/cordis/package.json']) {
    if (!fs.statSync(path.join(directory, relative)).isFile()) throw new Error(`Missing Windows guest Host payload: ${relative}`);
  }
  if (sha256(fs.readFileSync(path.join(directory, 'package-lock.json'))) !== manifest.package_lock_sha256) {
    throw new Error('Windows guest Host dependency lock digest mismatch');
  }
  if (!Array.isArray(manifest.files) || JSON.stringify(manifest.files) !== JSON.stringify(payloadFiles(directory))) {
    throw new Error('Windows guest Host payload file inventory or digest mismatch');
  }
  return manifest;
}

export function prepareWslHostPayload({ root = repositoryRoot, shellRef, appRoot = process.env.OPL_APP_REPO_ROOT,
  frameworkRef = process.env.OPL_STANDARD_PAYLOAD_FRAMEWORK_REF, output = path.join(root, 'resources/opl-wsl-host') } = {}) {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Windows guest Host dependencies must be built and executed on Linux x64');
  if (!/^[0-9a-f]{40}$/.test(shellRef ?? '')) throw new Error('An exact Studio shell ref is required');
  const actual = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (actual.status !== 0 || actual.stdout.trim() !== shellRef) throw new Error('Windows guest Host source ref mismatch');
  if (fs.existsSync(output)) throw new Error('Windows guest Host output already exists');
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-wsl-host-build-'));
  try {
    const bootstrap = prepareBootstrapRuntime(staging, appRoot, frameworkRef);
    for (const relative of ['package.json', 'package-lock.json', 'packages', 'scripts/webui-host', 'desktop/windows-guest-host.mjs', 'desktop/windows-guest-rpc.mjs', 'desktop/windows-runtime.mjs', 'desktop/windows-bootstrap.sh', 'desktop/windows-guest-inspect.mjs', 'desktop/official-profile.mjs', 'resources/opl-official-profile']) {
      const destination = path.join(staging, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(path.join(root, relative), destination, { recursive: true, dereference: true,
        filter: source => !source.split(path.sep).includes('node_modules') && !source.endsWith('.test.mjs') });
    }
    const install = spawnSync('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: staging, stdio: 'inherit', env: process.env,
    });
    if (install.status !== 0) throw new Error(`Windows guest Host production dependencies failed: ${install.error?.message ?? install.status}`);
    const smoke = spawnSync(process.execPath, ['scripts/webui-host/packaged-host-smoke.mjs'], {
      cwd: staging, encoding: 'utf8', timeout: 60_000, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
    });
    if (smoke.status !== 0 || !smoke.stdout.includes('OPL_PACKAGED_HOST_READY')) {
      throw new Error(`Linux guest Host smoke failed: ${smoke.stderr || smoke.error?.message || smoke.status}`);
    }
    // NTFS resource extraction must not depend on symlink creation privileges.
    fs.mkdirSync(path.dirname(output), { recursive: true });
    copyMaterializedTree(staging, output, fs.realpathSync(staging));
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({
      schema: 'opl_studio_windows_guest_host.v1', platform: 'linux', arch: 'x64',
      entry: 'desktop/windows-guest-host.mjs', shell_ref: shellRef,
      node_version: process.version, package_lock_sha256: sha256(fs.readFileSync(path.join(output, 'package-lock.json'))),
      production_dependencies: true, linux_host_smoke: 'passed',
      bootstrap,
      files: payloadFiles(output),
    }, null, 2) + '\n');
    return validateWslHostPayload(output, shellRef);
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--validate') {
    process.stdout.write(JSON.stringify(validateWslHostPayload(path.resolve(process.argv[3]), process.env.OPL_SHELL_SOURCE_REF)) + '\n');
  } else {
    process.stdout.write(JSON.stringify(prepareWslHostPayload({ shellRef: process.env.OPL_SHELL_SOURCE_REF })) + '\n');
  }
}
