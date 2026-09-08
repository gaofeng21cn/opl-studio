import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { decodeAionStorage, discoverAionMigrationSources, readAionMigrationSnapshot } from './aion-migration-source.mjs';

function temporary(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'opl-aion-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function database(file, { modern = true, wal = false } = {}) {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (wal) db.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0');
  db.exec(`CREATE TABLE conversations (
    id TEXT PRIMARY KEY, user_id TEXT, name TEXT, type TEXT, extra TEXT,
    created_at INTEGER, updated_at INTEGER${modern ? ', pinned INTEGER, pinned_at INTEGER' : ''}
  );
  CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, type TEXT, content TEXT, position TEXT, created_at INTEGER);
  CREATE TABLE client_preferences (user_id TEXT, key TEXT, value TEXT);
  CREATE TABLE system_settings (user_id TEXT, language TEXT);
  CREATE TABLE users (password_hash TEXT);
  INSERT INTO users VALUES ('never-export-this-password');`);
  return db;
}

function conversation(db, { id = 'c1', user = 'system_default_user', name = 'Saved history', extra = {}, pinned = 0, modern = true } = {}) {
  db.prepare(`INSERT INTO conversations (id, user_id, name, type, extra, created_at, updated_at${modern ? ', pinned' : ''}) VALUES (?, ?, ?, 'acp', ?, 100, 200${modern ? ', ?' : ''})`)
    .run(id, user, name, JSON.stringify(extra), ...(modern ? [pinned] : []));
}

const fingerprint = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const encode = (value) => Buffer.from(encodeURIComponent(JSON.stringify(value)), 'utf8').toString('base64');

test('discovers real desktop, direct data, and Docker roots without creating missing locations', (t) => {
  const root = temporary(t);
  const desktop = path.join(root, 'Library/Application Support/One Person Lab/opl-data');
  const db = database(path.join(desktop, 'aionui-backend.db'));
  db.close();
  symlinkSync(desktop, path.join(root, '.opl-app-data'));
  const sources = discoverAionMigrationSources({ homeDir: root, env: {}, platform: 'darwin' });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].path, realpathSync(path.join(desktop, 'aionui-backend.db')));
  assert.deepEqual(discoverAionMigrationSources({ roots: [desktop, path.join(root, '.opl-app-data')] }), sources);
  assert.equal(discoverAionMigrationSources({ env: { OPL_AIONUI_DATA_DIR: desktop }, homeDir: root }).length, 1);
  assert.deepEqual(readdirSync(root).sort(), ['.opl-app-data', 'Library']);
});

test('reads native continuity, ordering, archive and UI settings with provenance and no credential tables', (t) => {
  const root = temporary(t);
  const file = path.join(root, 'aionui-backend.db');
  const db = database(file);
  conversation(db, { pinned: 1, extra: { canonical_thread_id: 'native-1', canonical_project_id: 'p1', workspace: '/projects/a', archived: true, archived_at: 300, sortOrder: -8, gateway: { token: 'never-export-this-token' } } });
  db.prepare('INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?)').run('m1', 'c1', 'text', JSON.stringify({ content: 'History text' }), 'right', 150);
  db.exec(`INSERT INTO client_preferences VALUES ('system_default_user','theme.appearanceMode','"dark"');
    INSERT INTO client_preferences VALUES ('system_default_user','apiKey','"never-export-this-key"');
    INSERT INTO system_settings VALUES ('system_default_user','zh-CN')`);
  db.close();
  const before = fingerprint(file);
  const snapshot = readAionMigrationSnapshot({ roots: [root] });
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.complete, true);
  const [record] = snapshot.conversations;
  assert.equal(record.nativeCodexThreadId, 'native-1');
  assert.equal(record.nativeCodexThreadIdSource, 'extra.canonical_thread_id');
  assert.equal(record.workspace, '/projects/a');
  assert.equal(record.projectId, 'p1');
  assert.equal(record.archived, true);
  assert.equal(record.archivedAt, 300);
  assert.equal(record.pinned, true);
  assert.equal(record.sortOrder, -8);
  assert.equal(record.messages[0].content.content, 'History text');
  assert.equal(record.messages[0].sourceId, record.sourceId);
  assert.deepEqual(snapshot.ui.map(({ key, value }) => ({ key, value })), [{ key: 'theme.appearanceMode', value: 'dark' }, { key: 'language', value: 'zh-CN' }]);
  assert.equal(JSON.stringify(snapshot).includes('never-export'), false);
  assert.equal(fingerprint(file), before);
  assert.deepEqual(snapshot.drafts, { status: 'unavailable', reasonCode: 'upstream-drafts-memory-only', records: [] });
});

test('reads active WAL committed history without changing database or WAL bytes', (t) => {
  const root = temporary(t);
  const file = path.join(root, 'aionui-backend.db');
  const db = database(file, { wal: true });
  t.after(() => db.close());
  conversation(db);
  const before = [file, `${file}-wal`].map(fingerprint);
  const snapshot = readAionMigrationSnapshot({ roots: [root] });
  assert.equal(snapshot.conversations.length, 1);
  assert.deepEqual([file, `${file}-wal`].map(fingerprint), before);
});

test('modern database takes precedence over its stale legacy copy', (t) => {
  const root = temporary(t);
  const old = database(path.join(root, 'aionui.db'), { modern: false });
  conversation(old, { name: 'Old', modern: false });
  conversation(old, { id: 'old-only', modern: false });
  old.close();
  const current = database(path.join(root, 'aionui-backend.db'));
  conversation(current, { name: 'Current' });
  current.close();
  const snapshot = readAionMigrationSnapshot({ roots: [root] });
  assert.equal(snapshot.conversations.find((entry) => entry.id === 'c1').title, 'Current');
  assert.equal(snapshot.conversations.length, 1);
  assert.equal(snapshot.sources.find((entry) => path.basename(entry.path) === 'aionui.db').status, 'superseded');
});

test('legacy SQLite extras preserve pin metadata without guessing a native thread id', (t) => {
  const root = temporary(t);
  const db = database(path.join(root, 'aionui.db'), { modern: false });
  conversation(db, { modern: false, extra: { pinned: true, pinned_at: 12, acp_session_id: 'not-proven-native' } });
  db.close();
  const [record] = readAionMigrationSnapshot({ roots: [root] }).conversations;
  assert.equal(record.pinned, true);
  assert.equal(record.pinnedAt, 12);
  assert.equal(record.nativeCodexThreadId, null);
});

test('decodes encoded Unicode legacy JSON and per-conversation history', (t) => {
  const root = temporary(t);
  const title = '\u4e2d\u6587\u5386\u53f2';
  writeFileSync(path.join(root, 'aionui-chat.txt'), encode({ 'chat.history': [{ id: 'c1', name: title, modified_at: 99, extra: { pinned: true, sortOrder: 5 } }] }));
  mkdirSync(path.join(root, 'aionui-chat-history'));
  writeFileSync(path.join(root, 'aionui-chat-history/c1.txt'), encode([{ id: 'm1', type: 'text', content: { content: title } }]));
  writeFileSync(path.join(root, 'aionui-config.txt'), encode({ language: 'zh-CN', 'theme.appearanceMode': 'system', apiKey: 'never-export-this-key' }));
  const snapshot = readAionMigrationSnapshot({ roots: [root] });
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.conversations[0].title, title);
  assert.equal(snapshot.conversations[0].updatedAt, 99);
  assert.equal(snapshot.conversations[0].messages[0].content.content, title);
  assert.equal(JSON.stringify(snapshot).includes('never-export'), false);
  assert.deepEqual(decodeAionStorage('{"plain":true}'), { plain: true });
});

test('finds user-selected cache paths and aggregate history without traversing conversation ids', (t) => {
  const root = temporary(t);
  const cache = path.join(root, 'custom-cache');
  mkdirSync(cache);
  writeFileSync(path.join(root, '.aionui-env'), encode({ 'aionui.dir': { cacheDir: cache } }));
  writeFileSync(path.join(cache, 'aionui-chat.txt'), encode({ 'chat.history': [{ id: '../outside', name: 'Safe' }] }));
  writeFileSync(path.join(cache, 'aionui-chat-message.txt'), encode({ '../outside': [{ id: 'm1', content: 'aggregate' }] }));
  const snapshot = readAionMigrationSnapshot({ roots: [root] });
  assert.equal(snapshot.conversations[0].messages[0].content, 'aggregate');
});

test('default user projection never mixes other users and explicit selection works', (t) => {
  const root = temporary(t);
  const db = database(path.join(root, 'aionui-backend.db'));
  conversation(db);
  conversation(db, { id: 'other', user: 'other-user', name: 'Other private title' });
  db.close();
  assert.deepEqual(readAionMigrationSnapshot({ roots: [root] }).conversations.map((entry) => entry.id), ['c1']);
  assert.deepEqual(readAionMigrationSnapshot({ roots: [root], sourceUserId: 'other-user' }).conversations.map((entry) => entry.id), ['other']);
});

test('ambiguous multi-user sources require selection instead of silently importing everybody', (t) => {
  const root = temporary(t);
  const db = database(path.join(root, 'aionui-backend.db'));
  conversation(db, { user: 'alice' });
  conversation(db, { id: 'c2', user: 'bob' });
  db.close();
  const snapshot = readAionMigrationSnapshot({ roots: [root] });
  assert.equal(snapshot.conversations.length, 0);
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.diagnostics[0].code, 'source-user-selection-required');
});

test('a failed source or configured limit produces explicit incomplete evidence, not silent truncation', (t) => {
  const root = temporary(t);
  const db = database(path.join(root, 'aionui-backend.db'));
  conversation(db);
  conversation(db, { id: 'c2' });
  db.close();
  const otherRoot = path.join(root, 'other');
  mkdirSync(otherRoot);
  writeFileSync(path.join(otherRoot, 'aionui.db'), 'never-echo-secret-corrupt-file');
  const snapshot = readAionMigrationSnapshot({ roots: [root, otherRoot], limits: { maxConversations: 1 } });
  assert.equal(snapshot.complete, false);
  assert.deepEqual(snapshot.diagnostics.map((entry) => entry.code), ['source-conversation-limit', 'source-read-failed']);
  assert.equal(snapshot.conversations.length, 0);
  assert.equal(JSON.stringify(snapshot).includes('never-echo'), false);
});

test('browser exports only contribute known UI keys and do not invent persisted drafts', (t) => {
  const root = temporary(t);
  const snapshot = readAionMigrationSnapshot({ roots: [root], browserStorage: { aionui_workspace_expansion: '{"/work":true}', authToken: 'never-export' } });
  assert.equal(snapshot.ui.length, 1);
  assert.deepEqual(snapshot.ui[0].value, { '/work': true });
  assert.equal(snapshot.ui[0].sourceId, 'browser-export');
  assert.equal(snapshot.browserStorage.status, 'provided');
  assert.equal(snapshot.drafts.status, 'unavailable');
  assert.equal(JSON.stringify(snapshot).includes('never-export'), false);
});
