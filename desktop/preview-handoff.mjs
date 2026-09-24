import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { normalizeStorageSnapshot, HANDOFF_STORAGE_KEYS, mergeShellStorage } from './shell-state.mjs';
import { validatedChannelBindings } from '../scripts/webui-host/channel-bindings.mjs';
export { normalizeStorageSnapshot, HANDOFF_STORAGE_KEYS, mergeShellStorage };
export const PREVIEW_HANDOFF_SCHEMA = 'opl_studio_preview_handoff.v1';
export const PREVIEW_BUNDLE_ID = 'cn.onepersonlab.opl.studio.preview';
export const STABLE_BUNDLE_ID = 'cn.onepersonlab.opl';
export const PUBLISHER_TEAM_ID = 'SVVC4TA784';
export const digest = value => createHash('sha256').update(value).digest('hex');
export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function privateJson(file, limit = 64 * 1024 * 1024) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit
    || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) throw new Error('handoff_file_not_private_regular_file');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
export function validateTarget(target) {
  if (target?.bundleId !== STABLE_BUNDLE_ID || target?.productName !== 'One Person Lab'
    || target?.teamId !== PUBLISHER_TEAM_ID || !semver.valid(target?.version)
    || !/^[0-9a-f]{64}$/.test(target?.sha256) || !Number.isSafeInteger(target?.size) || target.size <= 0 || target.size > 2 * 1024 ** 3) throw new Error('handoff_target_identity_invalid');
  const url = new URL(target.url);
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash
    || !/^\/gaofeng21cn\/one-person-lab-app\/releases\/download\/v[0-9][\w.-]*\/One-Person-Lab-[\w.-]+-mac-arm64\.dmg$/.test(url.pathname)) throw new Error('handoff_target_url_invalid');
  return target;
}
export function mergeChannelBindings(current, incoming) {
  const entries = [...validatedChannelBindings(current).entries];
  for (const entry of validatedChannelBindings(incoming).entries) {
    const identity = entries.find(item => item.provider_id === entry.provider_id && item.account_id === entry.account_id && item.channel_session_id === entry.channel_session_id);
    if (identity) {
      if (identity.canonical_thread_host !== entry.canonical_thread_host || identity.canonical_thread_id !== entry.canonical_thread_id) throw new Error('handoff_channel_binding_conflict');
      continue;
    }
    entries.push(entry);
  }
  return validatedChannelBindings({ schema: 'opl_studio_channel_transport_bindings.v1', entries });
}
export function createPreviewHandoff({ source, target, storage, logDir = null, channelBindings }) {
  validateTarget(target);
  if (source?.bundleId !== PREVIEW_BUNDLE_ID || !semver.valid(source?.version)) throw new Error('handoff_source_identity_invalid');
  const payload = { schema: PREVIEW_HANDOFF_SCHEMA, source: { bundleId: source.bundleId, version: source.version }, target,
    storage: normalizeStorageSnapshot(storage), logDir: typeof logDir === 'string' && path.isAbsolute(logDir) ? logDir : null,
    ...(channelBindings ? { channelBindings: validatedChannelBindings(channelBindings) } : {}) };
  return { ...payload, digest: digest(JSON.stringify(payload)) };
}
export function readPreviewHandoff(file, { currentVersion, target } = {}) {
  const value = privateJson(file);
  if (value.schema !== PREVIEW_HANDOFF_SCHEMA || value.source?.bundleId !== PREVIEW_BUNDLE_ID) throw new Error('handoff_schema_or_source_invalid');
  validateTarget(value.target);
  const { digest: checksum, ...payload } = value;
  if (checksum !== digest(JSON.stringify(payload))) throw new Error('handoff_digest_mismatch');
  if (target && JSON.stringify(value.target) !== JSON.stringify(target)) throw new Error('handoff_signed_plan_mismatch');
  if (currentVersion && !semver.gte(currentVersion, value.target.version)) throw new Error('handoff_target_version_too_old');
  normalizeStorageSnapshot(value.storage);
  if (value.channelBindings) validatedChannelBindings(value.channelBindings);
  return value;
}
export function writePreviewHandoff(file, value) { atomicJson(file, value); return { file, digest: value.digest }; }
