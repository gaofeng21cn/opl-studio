// The one-time shell transition carries preferences and references, never owner stores.
export const STORAGE_ALIASES = Object.freeze({
  'opl.studio.settings.v1': ['opl.studio.settings.v1', 'opl.nativeWorkbench.settings.v1'],
  'opl_ui_metadata.v1': ['opl_ui_metadata.v1', 'opl.studio.uiMetadata.v2', 'opl.nativeWorkbench.uiMetadata.v2'],
  'opl.studio.drafts.v2': ['opl.studio.drafts.v2', 'opl.nativeWorkbench.drafts.v2'],
  'codex.oplAppSessionContextAdditional': ['codex.oplAppSessionContextAdditional']
});
export const HANDOFF_STORAGE_KEYS = Object.values(STORAGE_ALIASES).flat();
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const safeKey = key => !['__proto__', 'prototype', 'constructor'].includes(key) && key.length <= 4096;
const string = value => typeof value === 'string' && value.length <= 65_536;
const strings = value => Array.isArray(value) && value.length <= 100_000 && value.every(string);
const map = (value, valid) => Object.fromEntries(Object.entries(record(value)).filter(([key, item]) => safeKey(key) && valid(item)));
const parse = value => { try { return JSON.parse(value); } catch { throw new Error('shell_storage_invalid_json'); } };
function drafts(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shell_drafts_invalid');
  // The envelope limit bounds storage. Never silently discard a user's long draft.
  for (const [key, text] of Object.entries(value)) {
    if (!safeKey(key) || typeof text !== 'string') throw new Error('shell_drafts_invalid');
  }
  return Object.fromEntries(Object.entries(value));
}

export function normalizeSettings(value) {
  const v = record(value);
  const enums = {
    locale: ['zh','en'], theme: ['system','light','dark'], reasoningLevel: ['none','minimal','low','medium','high','xhigh','max','ultra'],
    agentPermissions: [':danger-full-access',':workspace',':read-only'], defaultWorkspace: ['opl_app'], runtimeProfile: ['fast','full'],
    artifactPreviewMode: ['rich_refs_only'], professionalStarterDefaults: ['research_grant_presentation'], fontSize: [12,13,14,15,16,17]
  };
  const result = Object.fromEntries(Object.entries(enums).filter(([k, allowed]) => allowed.includes(v[k])).map(([k]) => [k, v[k]]));
  for (const k of ['confirmBeforeExecute','notificationEnabled','developerDetails']) if (typeof v[k] === 'boolean') result[k] = v[k];
  if (typeof v.modelAccess === 'string' && /^[\w.:-]{1,128}$/.test(v.modelAccess)) result.modelAccess = v.modelAccess;
  return result;
}

export function normalizeMetadata(value) {
  const v = record(value), result = { schema: 'opl_ui_metadata.v1' };
  for (const k of ['selectedProjectId','selectedThreadId','recentWorkspace']) if (string(v[k])) result[k] = v[k];
  for (const k of ['threadAffinityById','workspaceLabels']) if (v[k]) result[k] = map(v[k], string);
  for (const k of ['hiddenWorkspaceIds','workspaceOrder','pinnedThreadIds','aionMigratedThreadIds']) if (strings(v[k])) result[k] = v[k];
  if (v.threadOrderByProject) result.threadOrderByProject = map(v.threadOrderByProject, strings);
  if (['current','all','archived'].includes(v.threadScope)) result.threadScope = v.threadScope;
  if (Number.isFinite(v.sidebarWidth) && v.sidebarWidth >= 200 && v.sidebarWidth <= 420) result.sidebarWidth = v.sidebarWidth;
  if (['system','light','dark'].includes(v.theme)) result.theme = v.theme;
  if (['zh','en'].includes(v.language)) result.language = v.language;
  if (v.layout === 'default') result.layout = 'default';
  return result;
}

export function normalizeStorageSnapshot(storage = {}) {
  const result = {};
  for (const [key, aliases] of Object.entries(STORAGE_ALIASES)) {
    const raw = aliases.map(alias => storage[alias]).find(value => value !== null && value !== undefined);
    if (raw === undefined) continue;
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 16 * 1024 * 1024) throw new Error('shell_storage_size_limit');
    if (key === 'codex.oplAppSessionContextAdditional') {
      if (new TextEncoder().encode(raw).length > 65_536) throw new Error('shell_instructions_size_limit');
      result[key] = raw;
    } else if (key === 'opl.studio.settings.v1') result[key] = JSON.stringify(normalizeSettings(parse(raw)));
    else if (key === 'opl_ui_metadata.v1') result[key] = JSON.stringify(normalizeMetadata(parse(raw)));
    else {
      const v = record(parse(raw));
      result[key] = JSON.stringify({ prompts: drafts(v.prompts), recovered: drafts(v.recovered) });
    }
  }
  return result;
}

export function mergeShellStorage(current, incoming, sourceDigest) {
  const source = normalizeStorageSnapshot(incoming), target = normalizeStorageSnapshot(current), merged = { ...target };
  for (const [key, raw] of Object.entries(source)) {
    if (key === 'codex.oplAppSessionContextAdditional') { if (!(key in target)) merged[key] = raw; continue; }
    const left = target[key] ? parse(target[key]) : {}, right = parse(raw);
    if (key === 'opl.studio.drafts.v2') {
      const prompts = { ...right.prompts, ...left.prompts }, recovered = { ...right.recovered, ...left.recovered };
      for (const [id, text] of Object.entries(right.prompts)) {
        if (Object.hasOwn(left.prompts ?? {}, id) && left.prompts[id] !== text) {
          const collision = `preview:${sourceDigest}:${id}`;
          if (!Object.hasOwn(recovered, collision)) Object.defineProperty(recovered, collision, { value: text, enumerable: true, configurable: true });
        }
      }
      merged[key] = JSON.stringify({ prompts, recovered });
    } else {
      const combined = { ...right, ...left };
      for (const [field, value] of Object.entries(right)) {
        if (Array.isArray(value) && Array.isArray(left[field])) combined[field] = [...new Set([...left[field], ...value])];
        else if (value && typeof value === 'object' && left[field] && typeof left[field] === 'object') combined[field] = { ...value, ...left[field] };
      }
      merged[key] = JSON.stringify(combined);
    }
  }
  return merged;
}
