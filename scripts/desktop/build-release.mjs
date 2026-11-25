import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import semver from 'semver';
import { validateWslHostPayload } from './prepare-wsl-host-payload.mjs';
import { fullBuildEnvironment } from './full-payload.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function resolveStableBuildPlan(argv, env = process.env, host = { platform: process.platform, arch: process.arch }) {
  let arch = host.arch, platform = host.platform, directoryOnly = false, reuseRenderer = false;
  const builderOptions = [];
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: true,
      tokens: true,
      options: {
        'dir-only': { type: 'boolean' },
        'skip-vite': { type: 'boolean' },
        platform: { type: 'string' },
        arch: { type: 'string' },
        'config.nsis.differentialPackage': { type: 'string' }
      }
    });
  } catch (error) {
    const token = error.message.match(/'([^']+)'/)?.[1]?.split(' ')[0] ?? argv[0];
    throw new Error(`Unsupported Stable build option: ${token}`);
  }
  for (const token of parsed.tokens) {
    if (token.kind === 'positional') {
      if (['x64', 'arm64', 'universal'].includes(token.value)) arch = token.value;
      else throw new Error(`Unsupported Stable build option: ${token.value}`);
    } else if (token.kind === 'option') {
      if (token.name === 'dir-only') directoryOnly = true;
      else if (token.name === 'skip-vite') reuseRenderer = true;
      else if (token.name === 'platform') platform = token.value;
      else if (token.name === 'arch') arch = token.value;
      else if (token.name === 'config.nsis.differentialPackage' && token.inlineValue && token.value === 'true') builderOptions.push('--config.nsis.differentialPackage=true');
      else throw new Error(`Unsupported Stable build option: ${token.rawName}${token.inlineValue ? `=${token.value}` : ''}`);
    } else {
      throw new Error('Unsupported Stable build option: --');
    }
  }
  if (!['darwin', 'win32', 'linux'].includes(platform) || !['arm64', 'x64', 'universal'].includes(arch)
    || (arch === 'universal' && platform !== 'darwin')) throw new Error('Unsupported release platform or architecture');
  const display = env.OPL_RELEASE_VERSION, machine = env.OPL_UPDATER_VERSION;
  if (!semver.valid(display) || !semver.valid(machine)) throw new Error('App release controller must provide display and updater versions');
  const commandEnvironment = { ...env, OPL_DESKTOP_RELEASE_IDENTITY: 'stable' };
  if (platform === 'darwin' && typeof commandEnvironment.CSC_NAME === 'string') {
    commandEnvironment.CSC_NAME = commandEnvironment.CSC_NAME.trim().replace(/^Developer ID Application:\s*/i, '');
  }
  const appleId = env.APPLE_ID || env.appleId;
  const applePassword = env.APPLE_APP_SPECIFIC_PASSWORD || env.appleIdPassword;
  const appleTeam = env.APPLE_TEAM_ID || env.teamId;
  if (platform === 'darwin' && env.OPL_REQUIRE_MACOS_GATEKEEPER === 'true' && (!appleId || !applePassword || !appleTeam)) throw new Error('Stable App notarization credentials are required');
  if (appleId && applePassword && appleTeam) Object.assign(commandEnvironment, { APPLE_ID: appleId, APPLE_APP_SPECIFIC_PASSWORD: applePassword, APPLE_TEAM_ID: appleTeam });
  const platformFlag = platform === 'darwin' ? '--mac' : platform === 'win32' ? '--win' : '--linux';
  const args = [platformFlag, ...(directoryOnly ? ['--dir'] : []), `--${arch}`, '--config', 'electron-builder.stable.yml',
    `--config.extraMetadata.version=${machine}`, `--config.extraMetadata.oplReleaseVersion=${display}`, '--publish', 'never', ...builderOptions];
  // Preserve the existing Linux installer namespace (x64, rather than Debian's amd64).
  if (platform === 'linux') args.push(`--config.linux.artifactName=One-Person-Lab-${display}-linux-${arch}.` + "${ext}");
  return { platform, arch, directoryOnly, reuseRenderer, display, machine, args, env: commandEnvironment };
}

export function finalizeStableMetadata({ outputRoot, plan }) {
  if (plan.directoryOnly) return;
  if (plan.platform === 'linux') {
    const name = `One-Person-Lab-${plan.display}-linux-${plan.arch}.deb`;
    const file = path.join(outputRoot, name);
    const bytes = fs.readFileSync(file);
    if (!bytes.length) throw new Error('Stable Linux updater requires a nonempty DEB');
    const sha512 = crypto.createHash('sha512').update(bytes).digest('base64');
    const metadata = plan.arch === 'x64' ? 'latest-linux.yml' : `latest-linux-${plan.arch}.yml`;
    fs.writeFileSync(path.join(outputRoot, metadata), stringify({ version: plan.machine,
      files: [{ url: name, sha512, size: bytes.length }], path: name, sha512 }));
    return;
  }
  const metadata = plan.platform === 'darwin' ? 'latest-mac.yml' : plan.arch === 'arm64' ? 'latest-arm64.yml' : 'latest.yml';
  const primary = path.join(outputRoot, metadata);
  const alias = plan.platform === 'darwin' && plan.arch === 'arm64' ? path.join(outputRoot, 'latest-arm64-mac.yml') : null;
  if (!fs.existsSync(primary) && alias && fs.existsSync(alias)) fs.copyFileSync(alias, primary);
  const feed = parse(fs.readFileSync(primary, 'utf8'));
  if (feed.version !== plan.machine) throw new Error('Stable updater machine version mismatch');
  const bytes = stringify(feed);
  if (alias) fs.writeFileSync(alias, bytes);
  fs.writeFileSync(primary, bytes);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = resolveStableBuildPlan(process.argv.slice(2));
  Object.assign(plan.env, fullBuildEnvironment({ appRoot: plan.env.OPL_APP_REPO_ROOT, studioRoot: root, env: plan.env, releaseIdentity: plan }));
  if (plan.platform === 'win32') validateWslHostPayload(path.join(root, 'resources/opl-wsl-host'), process.env.OPL_SHELL_SOURCE_REF);
  const run = (command, args) => {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: plan.env, releaseIdentity: plan });
    if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status})`);
  };
  run(process.execPath, ['scripts/build-desktop.mjs', ...(plan.reuseRenderer ? ['--reuse-required'] : [])]);
  const builderEntry = path.join(root, 'node_modules/electron-builder/cli.js');
  run(process.execPath, [builderEntry, ...plan.args]);
  finalizeStableMetadata({ outputRoot: path.join(root, 'out'), plan });
}
