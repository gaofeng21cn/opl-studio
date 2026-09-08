import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const AION_MIGRATION_SNAPSHOT_VERSION = 1;
const UI_KEYS = [
  'language', 'theme', 'theme.activeId', 'theme.appearanceMode', '__aionui_theme',
  'aionui_workspace_expansion', 'aionui_workspace_expansion_archived',
  'grouped-history-collapsed-sections',
];
const DEFAULT_LIMITS = { maxFileBytes: 128 * 1024 * 1024, maxConversations: 100000, maxMessages: 1000000 };
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const string = (value) => typeof value === 'string' ? value : null;
const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function parseJson(value, fallback = null) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function diagnostic(diagnostics, sourceId, code) {
  if (!diagnostics.some((entry) => entry.sourceId === sourceId && entry.code === code)) {
    diagnostics.push({ sourceId, code });
  }
}

export function decodeAionStorage(text) {
  try { return JSON.parse(text); } catch {
    return JSON.parse(decodeURIComponent(Buffer.from(text.trim(), 'base64').toString('utf8')));
  }
}

function readJson(file, limits) {
  if (statSync(file).size > limits.maxFileBytes) throw new Error('source-file-limit');
  return decodeAionStorage(readFileSync(file, 'utf8'));
}

// Roots include userData, the data/config subdirectories, and CLI symlinks.
export function discoverAionMigrationSources({ env = process.env, homeDir = os.homedir(), platform = process.platform, roots } = {}) {
  const explicitRoot = string(env.OPL_AIONUI_DATA_DIR)?.trim();
  const candidates = roots ?? (explicitRoot ? [explicitRoot] : [
    ...(platform === 'darwin' ? ['One Person Lab', 'OnePersonLab', 'AionUi', 'AionUI'].map((name) => path.join(homeDir, 'Library/Application Support', name)) : []),
    path.join(homeDir, '.opl-app-data'), path.join(homeDir, '.opl-app-config'),
    path.join(homeDir, '.aionui'), path.join(homeDir, '.aionui-config'),
    path.join(homeDir, '.aionui-web'), path.join(homeDir, '.opl-server'),
    path.join(homeDir, '.local/share/one-person-lab/webui/data'),
    ...(platform === 'linux' ? ['/data', env.AIONUI_DATA_DIR, env.OPL_DATA_DIR].filter(Boolean) : []),
  ]);
  const sources = [];
  const seen = new Set();
  const add = (file, kind, priority) => {
    try {
      const actual = realpathSync(file);
      if (seen.has(actual) || !statSync(actual).isFile()) return;
      seen.add(actual);
      sources.push({ id: `aion-${hash(actual).slice(0, 20)}`, kind, path: actual, priority });
    } catch { /* Missing historical locations are normal on first launch. */ }
  };
  for (const root of candidates) {
    if (typeof root !== 'string' || !root.trim()) continue;
    const directories = ['', 'opl-data', 'aionui', 'data', 'opl-config', 'config'].map((sub) => path.resolve(root, sub));
    for (const directory of directories) {
      add(path.join(directory, 'aionui-backend.db'), 'sqlite', 30);
      add(path.join(directory, 'aionui.db'), 'sqlite', 20);
      add(path.join(directory, 'aionui-chat.txt'), 'json-history', 10);
      add(path.join(directory, 'aionui-config.txt'), 'json-settings', 5);
      // This file only supplies the user's chosen cache location, never credentials.
      const envFile = path.join(directory, '.aionui-env');
      if (existsSync(envFile)) {
        try {
          const cacheDir = string(object(object(readJson(envFile, DEFAULT_LIMITS))['aionui.dir']).cacheDir);
          if (cacheDir && path.isAbsolute(cacheDir)) {
            add(path.join(cacheDir, 'aionui-chat.txt'), 'json-history', 10);
            add(path.join(cacheDir, 'aionui-config.txt'), 'json-settings', 5);
          }
        } catch { /* A broken legacy path hint must not prevent database discovery. */ }
      }
    }
  }
  return sources.sort((a, b) => b.priority - a.priority);
}

function normalizeMessage(row, sourceId, conversationId, index) {
  return {
    id: string(row.id) ?? `${conversationId}:message:${index}`,
    conversationId,
    sourceId,
    sourceMessageId: string(row.msg_id),
    type: string(row.type) ?? 'text',
    content: parseJson(row.content, row.content ?? null),
    position: string(row.position),
    status: string(row.status),
    hidden: row.hidden === true || row.hidden === 1,
    createdAt: number(row.created_at),
  };
}

function normalizeConversation(row, source, index) {
  const extra = object(parseJson(row.extra, {}));
  const nativeCodexThreadId = string(extra.canonical_thread_id);
  return {
    id: row.id,
    sourceId: source.id,
    sourceUserId: string(row.user_id),
    title: string(row.name) ?? '',
    type: string(row.type) ?? 'unknown',
    backend: string(extra.backend),
    nativeCodexThreadId,
    nativeCodexThreadIdSource: nativeCodexThreadId ? 'extra.canonical_thread_id' : null,
    workspace: string(extra.workspace) ?? string(extra.canonical_recorded_workspace),
    projectId: string(extra.canonical_project_id) ?? string(row.project_id),
    pinned: own(row, 'pinned') ? row.pinned === true || row.pinned === 1 : extra.pinned === true,
    pinnedAt: number(row.pinned_at) ?? number(extra.pinned_at),
    archived: row.archived === true || row.archived === 1 || extra.archived === true,
    archivedAt: number(row.archived_at) ?? number(extra.archived_at),
    sortOrder: number(extra.sortOrder),
    sourceIndex: index,
    createdAt: number(row.created_at),
    updatedAt: number(row.updated_at) ?? number(row.modified_at),
    messages: [],
  };
}

function columns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((row) => row.name));
}

function selectColumns(available, allowed) {
  return allowed.filter((name) => available.has(name)).map((name) => `"${name}"`).join(', ');
}

function pickUser(db, available, requested, diagnostics, sourceId) {
  if (!available.has('user_id')) return null;
  if (requested) return requested;
  const users = db.prepare("SELECT DISTINCT user_id FROM conversations ORDER BY CASE WHEN user_id = 'system_default_user' THEN 0 ELSE 1 END LIMIT 3").all().map((row) => row.user_id);
  if (users.includes('system_default_user')) return 'system_default_user';
  if (users.length <= 1) return users[0] ?? null;
  diagnostic(diagnostics, sourceId, 'source-user-selection-required');
  return false;
}

function addUi(ui, key, value, sourceId, userId = null) {
  if (UI_KEYS.includes(key) && value !== null && value !== undefined) {
    ui.push({ key, value: parseJson(value, value), sourceId, sourceUserId: userId });
  }
}

function readSqlite(source, options, diagnostics) {
  const { limits, sourceUserId } = options;
  const conversations = [];
  const ui = [];
  const db = new DatabaseSync(source.path, { readOnly: true });
  try {
    db.exec('PRAGMA query_only = ON; BEGIN');
    const available = columns(db, 'conversations');
    if (!available.has('id') || !available.has('name')) throw new Error('source-schema-unsupported');
    const userId = pickUser(db, available, sourceUserId, diagnostics, source.id);
    if (userId === false) return { conversations, ui };
    const userFilter = available.has('user_id') && userId !== null ? ' WHERE user_id = ?' : '';
    const args = userFilter ? [userId] : [];
    const selected = selectColumns(available, ['id', 'user_id', 'name', 'type', 'extra', 'pinned', 'pinned_at', 'archived', 'archived_at', 'created_at', 'updated_at', 'project_id']);
    const rows = db.prepare(`SELECT ${selected} FROM conversations${userFilter} ORDER BY id LIMIT ?`).all(...args, limits.maxConversations + 1);
    if (rows.length > limits.maxConversations) throw new Error('source-conversation-limit');
    const messageColumns = columns(db, 'messages');
    const messageSelect = selectColumns(messageColumns, ['id', 'conversation_id', 'msg_id', 'type', 'content', 'position', 'status', 'hidden', 'created_at']);
    const messageQuery = messageColumns.has('conversation_id') && messageColumns.has('content')
      ? db.prepare(`SELECT ${messageSelect} FROM messages WHERE conversation_id = ? ORDER BY ${messageColumns.has('created_at') ? 'created_at, ' : ''}rowid LIMIT ?`)
      : null;
    if (!messageQuery) diagnostic(diagnostics, source.id, 'source-messages-unavailable');
    let messageCount = 0;
    for (const [index, row] of rows.entries()) {
      if (!string(row.id)) throw new Error('source-conversation-invalid');
      if (typeof row.extra === 'string' && parseJson(row.extra) === null) diagnostic(diagnostics, source.id, 'source-extra-invalid');
      const conversation = normalizeConversation(row, source, index);
      const messages = messageQuery?.all(row.id, limits.maxMessages - messageCount + 1) ?? [];
      messageCount += messages.length;
      if (messageCount > limits.maxMessages) throw new Error('source-message-limit');
      conversation.messages = messages.map((message, index) => normalizeMessage(message, source.id, row.id, index));
      conversations.push(conversation);
    }
    const preferences = columns(db, 'client_preferences');
    if (preferences.has('key') && preferences.has('value')) {
      const scoped = preferences.has('user_id');
      const scope = scoped ? ' AND user_id = ?' : '';
      const records = db.prepare(`SELECT key, value FROM client_preferences WHERE key IN (${UI_KEYS.map(() => '?').join(',')})${scope}`).all(...UI_KEYS, ...(scoped ? [userId ?? 'system_default_user'] : []));
      for (const row of records) addUi(ui, row.key, row.value, source.id, userId);
    }
    const settings = columns(db, 'system_settings');
    if (settings.has('language')) {
      const scoped = settings.has('user_id');
      const row = db.prepare(`SELECT language FROM system_settings${scoped ? ' WHERE user_id = ?' : ''} LIMIT 1`).get(...(scoped ? [userId ?? 'system_default_user'] : []));
      if (row) addUi(ui, 'language', row.language, source.id, userId);
    }
    return { conversations, ui };
  } finally {
    db.close();
  }
}

function readLegacyHistory(source, limits, diagnostics) {
  const data = object(readJson(source.path, limits));
  if (!Array.isArray(data['chat.history'])) throw new Error('source-schema-unsupported');
  const rows = data['chat.history'];
  if (rows.length > limits.maxConversations) throw new Error('source-conversation-limit');
  const directory = path.dirname(source.path);
  const aggregatePath = path.join(directory, 'aionui-chat-message.txt');
  const aggregate = existsSync(aggregatePath) ? object(readJson(aggregatePath, limits)) : {};
  let messageCount = 0;
  const conversations = rows.map((row, index) => {
    if (!string(row?.id)) throw new Error('source-conversation-invalid');
    const conversation = normalizeConversation(row, source, index);
    // Legacy ids become file names; never let imported data select arbitrary files.
    const validFilename = row.id !== '.' && row.id !== '..' && !/[\\/\0]/.test(row.id);
    const messagePath = validFilename ? path.join(directory, 'aionui-chat-history', `${row.id}.txt`) : null;
    const messages = messagePath && existsSync(messagePath) ? readJson(messagePath, limits) : aggregate[row.id] ?? [];
    if (!Array.isArray(messages)) throw new Error('source-messages-invalid');
    if (!messagePath || (!existsSync(messagePath) && !own(aggregate, row.id))) diagnostic(diagnostics, source.id, 'source-messages-unavailable');
    messageCount += messages.length;
    if (messageCount > limits.maxMessages) throw new Error('source-message-limit');
    conversation.messages = messages.map((message, index) => normalizeMessage(message, source.id, row.id, index));
    return conversation;
  });
  return { conversations, ui: [] };
}

/** No credentials or raw configuration are returned. Callers must not log this history snapshot. */
export function readAionMigrationSnapshot(options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('invalid-migration-source-limit');
  }
  const sources = options.sources ?? discoverAionMigrationSources(options);
  const diagnostics = [];
  const conversations = new Map();
  const ui = [];
  const sourceResults = [];
  for (const source of [...sources].sort((a, b) => b.priority - a.priority)) {
    // AionCore copies the old database once. Reimporting that copy resurrects deleted history.
    if (source.kind === 'sqlite' && path.basename(source.path) === 'aionui.db' && sources.some((candidate) => candidate.kind === 'sqlite' && candidate.path === path.join(path.dirname(source.path), 'aionui-backend.db'))) {
      sourceResults.push({ ...source, status: 'superseded', conversationCount: 0 });
      continue;
    }
    try {
      let result;
      if (source.kind === 'sqlite') result = readSqlite(source, { ...options, limits }, diagnostics);
      else if (source.kind === 'json-history') result = readLegacyHistory(source, limits, diagnostics);
      else if (source.kind === 'json-settings') {
        const config = object(readJson(source.path, limits));
        result = { conversations: [], ui: [] };
        for (const key of UI_KEYS) if (own(config, key)) addUi(result.ui, key, config[key], source.id);
      } else throw new Error('source-kind-unsupported');
      for (const conversation of result.conversations) {
        if (!conversations.has(conversation.id)) conversations.set(conversation.id, conversation);
      }
      ui.push(...result.ui);
      sourceResults.push({ ...source, status: diagnostics.some((entry) => entry.sourceId === source.id) ? 'partial' : 'read', conversationCount: result.conversations.length });
    } catch (error) {
      const code = /^source-[a-z-]+$/.test(error?.message) ? error.message : 'source-read-failed';
      diagnostic(diagnostics, source.id, code);
      sourceResults.push({ ...source, status: 'failed', conversationCount: 0 });
    }
  }
  if (options.browserStorage) {
    for (const key of UI_KEYS) if (own(options.browserStorage, key)) addUi(ui, key, options.browserStorage[key], 'browser-export');
  }
  return {
    schemaVersion: AION_MIGRATION_SNAPSHOT_VERSION,
    sources: sourceResults,
    conversations: [...conversations.values()],
    ui,
    drafts: { status: 'unavailable', reasonCode: 'upstream-drafts-memory-only', records: [] },
    browserStorage: { status: options.browserStorage ? 'provided' : 'not-exported', reasonCode: options.browserStorage ? null : 'browser-origin-storage-requires-export' },
    diagnostics,
    complete: diagnostics.length === 0,
  };
}
