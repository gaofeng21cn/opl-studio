import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { AionMigration, MigratedThreadAdapter } from "./aion-migration.mjs";

const thread = { id: "019c1234-1111-4111-8111-123456789012", cwd: os.tmpdir(), turns: [], status: { type: "idle" }, createdAt: 100, updatedAt: 100 };
const conversation = { id: "old-1", sourceId: "opl-source", sourceUserId: "default", title: "Old label", nativeCodexThreadId: thread.id,
  workspace: os.tmpdir(), pinned: true, pinnedAt: 20, sortOrder: 2, archived: false };
const keyFor = c => createHash('sha256').update(JSON.stringify([c.sourceUserId, c.id])).digest('hex');
const snapshot = (conversations = [conversation]) => ({ conversations, sources: [{ id: "opl-source", status: "read" }], ui: [], diagnostics: [], complete: true });
class Transport extends EventEmitter {
  constructor() { super(); this.cwd = os.tmpdir(); this.reads = []; this.mutations = []; }
  async readThread(id) { this.reads.push(id); assert.equal(id, thread.id); return { thread: { ...thread } }; }
  async listThreads() { return { data: [{ ...thread }], nextCursor: null }; }
  async startThread() { this.mutations.push('start'); throw Error('startup must not create threads'); }
  async renameThread() { this.mutations.push('rename'); throw Error('startup must not rename threads'); }
  async archiveThread() { this.mutations.push('archive'); throw Error('startup must not archive threads'); }
}

test("OPL only links canonical metadata and returns the unchanged Codex directory", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'opl-canonical-metadata-'));
  const transport = new Transport();
  try {
    const migration = new AionMigration({ directory, transport, env: {}, snapshotReader: options => { assert.equal(options.includeMessages, false); return snapshot(); } });
    const adapter = new MigratedThreadAdapter(transport, migration);
    const result = await adapter.listThreads({ archived: false });
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].id, thread.id);
    assert.equal(result.data[0].importedHistory, undefined);
    assert.equal(result.migration.entries[0].threadId, thread.id);
    assert.equal(result.migration.entries[0].pinned, true);
    assert.deepEqual(transport.mutations, []);
    assert.equal(migration.document.complete, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("old pending imports are retained for recovery, canonical refs relink and unrelated history stays out", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'opl-canonical-repair-'));
  const transport = new Transport();
  const unrelated = { ...conversation, id: 'gemini-elsewhere', nativeCodexThreadId: null };
  const old = { schema: 'opl_studio_shell_migration.v2', entries: [conversation, unrelated].map(c => ({ key: keyFor(c), sourceConversationId: c.id,
    threadId: 'thread-fixture', native: false, state: 'pending' })), ui: [], diagnostics: [], complete: false };
  try {
    await writeFile(path.join(directory, 'index.json'), JSON.stringify(old));
    await writeFile(path.join(directory, keyFor(unrelated) + '.json'), 'untouched old source');
    const migration = new AionMigration({ directory, transport, env: {}, snapshotReader: () => snapshot() });
    await migration.start();
    assert.equal(migration.document.complete, true);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'index.before-canonical-metadata.json'), 'utf8')), old);
    assert.equal(migration.document.entries[0].threadId, thread.id);
    assert.equal(migration.document.entries[0].previousBindings[0].threadId, 'thread-fixture');
    assert.equal(migration.document.entries[1].state, 'ignored');
    assert.equal(migration.summary().entries.length, 1);
    assert.equal(await readFile(path.join(directory, keyFor(unrelated) + '.json'), 'utf8'), 'untouched old source');
    assert.deepEqual(transport.mutations, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("missing native identity and non-Codex history never manufacture replacement threads", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'opl-canonical-missing-'));
  const transport = new Transport();
  transport.readThread = async () => { throw Object.assign(Error('RPC rejected'), { code: 'app_server_rpc_error', details: { error: { code: -32600, message: 'no rollout found for thread id missing' } } }); };
  try {
    const migration = new AionMigration({ directory, transport, env: {}, snapshotReader: () => snapshot([conversation, { ...conversation, id: 'gemini', nativeCodexThreadId: null }]) });
    await migration.start();
    assert.equal(migration.document.complete, true);
    assert.equal(migration.summary().entries.length, 0);
    assert.deepEqual(migration.document.entries.map(e => e.state), ['ignored', 'ignored']);
    assert.deepEqual(transport.mutations, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("transient owner failure remains retryable without changing or deleting native data", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'opl-canonical-retry-'));
  const transport = new Transport();
  const reader = transport.readThread.bind(transport);
  transport.readThread = async () => { throw Error('runtime unavailable'); };
  const make = () => new AionMigration({ directory, transport, env: {}, snapshotReader: () => snapshot() });
  try {
    const failed = make(); await failed.start(); assert.equal(failed.summary().complete, false);
    transport.readThread = reader;
    const retried = make(); await retried.start(); assert.equal(retried.summary().complete, true);
    await retried.deleted(thread.id);
    const restarted = make(); await restarted.start(); assert.equal(restarted.summary().entries.length, 0);
    assert.equal(restarted.document.entries[0].state, 'deleted');
    assert.deepEqual(transport.mutations, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
