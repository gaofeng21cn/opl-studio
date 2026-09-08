import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AionMigration, MigratedThreadAdapter } from "./aion-migration.mjs";

class Transport extends EventEmitter {
  constructor() { super(); this.cwd = os.tmpdir(); this.threads = new Map(); this.created = 0; }
  async startThread({ cwd = this.cwd }) {
    const thread = { id: `native-${++this.created}`, cwd, turns: [], status: { type: "idle" }, createdAt: 100, updatedAt: 100 };
    this.threads.set(thread.id, thread); return { thread };
  }
  async readThread(id) {
    if (!this.threads.has(id)) throw new Error("thread not found");
    return { thread: { ...this.threads.get(id) } };
  }
  async listThreads() { return { data: [], nextCursor: null }; }
  async renameThread(id, name) { this.threads.get(id).name = name; }
  async archiveThread(id) { this.threads.get(id).archived = true; return { threadId: id, archived: true }; }
  async unarchiveThread(id) { this.threads.get(id).archived = false; return { threadId: id, archived: false }; }
  async deleteThread(id) { this.threads.delete(id); }
  async resumeThread(id) { return this.readThread(id); }
}

const conversation = {
  id: "old-1", sourceId: "source-1", sourceUserId: "default", title: "Prior research",
  workspace: os.tmpdir(), pinned: true, pinnedAt: 20, sortOrder: 2, archived: false,
  createdAt: 10000, updatedAt: 20000,
  messages: [{ id: "m1", type: "text", position: "right", content: { content: "Prior question" } },
    { id: "m2", type: "text", position: "left", content: { content: "Prior answer" } }],
};
const snapshot = (rows = [conversation]) => ({ conversations: rows, sources: [{ id: "source-1" }], ui: [], diagnostics: [], complete: true });

test("startup preserves history, pin/order, canonical binding, and deletion across restarts", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aion-migration-test-"));
  const transport = new Transport();
  const make = () => new AionMigration({ directory, transport, env: {}, snapshotReader: () => snapshot() });
  try {
    const first = make(); await first.start();
    const threads = new MigratedThreadAdapter(transport, first);
    const list = await threads.listThreads({ archived: false });
    assert.equal(list.data.length, 1);
    assert.equal(list.migration.entries[0].pinned, true);
    assert.equal(list.migration.entries[0].sortOrder, 2);
    const read = await threads.readThread({ threadId: "native-1", includeTurns: true });
    assert.deepEqual(read.turns, []);
    assert.deepEqual(read.importedHistory.messages.map((message) => message.text), ["Prior question", "Prior answer"]);
    assert.match(first.context("native-1"), /Prior answer/);
    const second = make(); await second.start();
    assert.equal(transport.created, 1);
    assert.equal(second.summary().entries[0].threadId, "native-1");
    await threads.deleteThread({ threadId: "native-1", confirmed: true });
    const third = make(); await third.start();
    assert.equal(transport.created, 1);
    assert.equal(third.summary().entries.length, 0);
    assert.equal(JSON.parse(await readFile(path.join(directory, `${third.document.entries[0].key}.json`), "utf8")).messages.length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("existing native history is linked without duplication or replay", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aion-migration-native-"));
  const transport = new Transport(); await transport.startThread({});
  const migration = new AionMigration({ directory, transport, env: {}, snapshotReader: () => snapshot([{ ...conversation, nativeCodexThreadId: "native-1" }]) });
  try {
    await migration.start();
    assert.equal(transport.created, 1);
    assert.equal(migration.summary().entries[0].native, true);
    assert.equal(migration.context("native-1"), undefined);
    assert.equal(migration.project((await transport.readThread("native-1")).thread, true).importedHistory, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("a failed rename resumes its saved binding without another thread", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aion-migration-retry-"));
  const transport = new Transport(); const rename = transport.renameThread.bind(transport);
  transport.renameThread = async () => { throw new Error("disconnected"); };
  const make = () => new AionMigration({ directory, transport, env: {}, snapshotReader: () => snapshot() });
  try {
    const first = make(); await first.start(); assert.equal(first.summary().complete, false);
    transport.renameThread = rename;
    const second = make(); await second.start(); assert.equal(second.summary().complete, true);
    assert.equal(transport.created, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
