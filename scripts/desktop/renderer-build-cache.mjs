import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveAppRepoRoot } from '../resolve-app-repo-root.mjs';

const manifestName = 'renderer-cache.json';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function inventory(root, relative = '', ignoreManifest = false) {
  return fs.readdirSync(path.join(root, relative)).sort().flatMap((name) => {
    const entry = path.posix.join(relative, name);
    if (ignoreManifest && entry === manifestName) return [];
    const file = path.join(root, entry);
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) return inventory(root, entry, ignoreManifest);
    if (!stat.isFile()) throw new Error(`Renderer cache contains a non-regular file: ${entry}`);
    return [{ path: entry, size: stat.size, sha256: hash(fs.readFileSync(file)) }];
  });
}

export function rendererCacheKey({ studioRoot, appRoot = resolveAppRepoRoot(studioRoot), nodeVersion = process.version,
  platform = process.platform, arch = process.arch }) {
  // Use working bytes so local edits and newly added source also invalidate reuse.
  // Git's ignore rules exclude dependencies, generated plugins and build outputs.
  const trackedFiles = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--',
    'src', 'desktop', 'scripts', 'plugins', 'packages', 'vendor', 'LICENSE', '.env*', 'package.json', 'package-lock.json', 'bun.lock', 'bun.lockb', 'tsconfig*.json'], {
    cwd: studioRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  }).split('\0').filter(Boolean);
  // Vite reads ignored local env files too. Hash their bytes without logging values.
  const files = [...new Set([...trackedFiles, ...fs.readdirSync(studioRoot).filter((name) => /^\.env(?:\.|$)/.test(name))])].sort();
  const inputs = files.map((name) => {
    const file = path.join(studioRoot, name);
    if (!fs.existsSync(file)) return [name, 'deleted'];
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) throw new Error(`Renderer input is not a file: ${name}`);
    return [name, hash(fs.readFileSync(file))];
  });
  const contracts = inventory(path.join(appRoot, 'contracts'));
  const environment = Object.entries(process.env).filter(([name]) => name === 'NODE_ENV' || name.startsWith('VITE_')).sort();
  return `full-shell-vite-output-v1-${platform}-${arch}-${hash(JSON.stringify({ inputs, contracts, nodeVersion, environment }))}`;
}

export function verifyRendererCache(outDir, key) {
  try {
    if (!fs.lstatSync(outDir).isDirectory() || !fs.lstatSync(path.join(outDir, manifestName)).isFile()) return false;
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, manifestName), 'utf8'));
    if (manifest.schema !== 'opl_studio_renderer_cache.v1' || manifest.key !== key) return false;
    const files = inventory(outDir, '', true);
    return ['index.html', 'renderer.js', 'renderer-build.json'].every((file) => files.some((entry) => entry.path === file))
      && JSON.stringify(files) === JSON.stringify(manifest.files);
  } catch { return false; }
}

export function sealRendererCache(outDir, key) {
  fs.writeFileSync(path.join(outDir, manifestName), `${JSON.stringify({
    schema: 'opl_studio_renderer_cache.v1', key, files: inventory(outDir, '', true),
  }, null, 2)}\n`);
  if (!verifyRendererCache(outDir, key)) throw new Error('Compiled renderer cache is incomplete');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const key = rendererCacheKey({ studioRoot });
  const reusable = verifyRendererCache(path.join(studioRoot, 'dist/desktop'), key);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `key=${key}\nreusable=${reusable}\n`);
  process.stdout.write(`${JSON.stringify({ key, reusable })}\n`);
}
