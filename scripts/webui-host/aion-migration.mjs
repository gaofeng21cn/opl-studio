import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readAionMigrationSnapshot } from "./aion-migration-source.mjs";
import { CodexThreadAdapter } from "./thread-adapter.mjs";

const SCHEMA = "opl_studio_shell_migration.v2";
const keyFor = (conversation) => createHash("sha256").update(JSON.stringify([conversation.sourceUserId, conversation.id])).digest("hex");
function missingCanonicalThread(error) {
  const rpc = error?.details?.error;
  return error?.code === "app_server_rpc_error" && rpc?.code === -32600
    && /invalid thread id|thread .*not found|no rollout found|unknown thread/i.test(rpc.message ?? "");
}
async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

// Conversation identity and history are already owned by Codex. This adapter
// carries only OPL shell preferences and pins keyed to owner-confirmed threads.
// Historical import indexes/snapshots remain on disk; no thread is ever created,
// renamed, archived, deleted, or supplied with copied history during startup.
export class AionMigration {
  constructor({ transport, env = process.env, snapshotReader = readAionMigrationSnapshot, directory } = {}) {
    this.transport = transport;
    this.env = env;
    this.directory = directory ?? env.OPL_STUDIO_MIGRATION_DIR
      ?? path.join(env.OPL_DATA_DIR ?? env.HOME ?? os.homedir(), ".opl-studio", "aion-migration");
    this.file = path.join(this.directory, "index.json");
    this.snapshotReader = snapshotReader;
    this.document = { schema: SCHEMA, entries: [], ui: [], sourceInventory: [], diagnostics: [], complete: true };
    this.ready = null;
    this.operation = Promise.resolve();
  }
  start() { return this.ready ??= this.withMigrationLock().catch(() => {
    this.document.complete = false;
    this.document.diagnostics.push({ code: "migration-incomplete" });
  }); }
  async withMigrationLock() {
    if (this.env.OPL_STUDIO_AION_MIGRATION === "0") return;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = path.join(this.directory, "lock");
    try { await mkdir(lock); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      const pid = Number(await readFile(path.join(lock, "pid"), "utf8").catch(() => "0"));
      if (!Number.isSafeInteger(pid) || pid < 1) throw new Error("migration lock is pending");
      try { process.kill(pid, 0); throw new Error("migration is active"); }
      catch (active) {
        if (active.code !== "ESRCH") throw active;
        await rm(lock, { recursive: true });
        await mkdir(lock);
      }
    }
    try {
      await writeFile(path.join(lock, "pid"), String(process.pid), { mode: 0o600 });
      await this.initialize();
    } finally { await rm(lock, { recursive: true, force: true }); }
  }
  async initialize() {
    try {
      const saved = JSON.parse(await readFile(this.file, "utf8"));
      if (![SCHEMA, "opl_studio_aion_migration.v1"].includes(saved.schema) || !Array.isArray(saved.entries)) throw new Error("invalid migration index");
      if (saved.policy !== "canonical_metadata_only") {
        // Preserve the original index once before retiring the old import policy.
        await writeFile(path.join(this.directory, "index.before-canonical-metadata.json"), JSON.stringify(saved), { mode: 0o600, flag: "wx" })
          .catch(error => { if (error.code !== "EEXIST") throw error; });
      }
      this.document = { ...saved, schema: SCHEMA, diagnostics: [] };
    } catch (error) {
      if (error.code !== "ENOENT") {
        this.document.complete = false;
        this.document.diagnostics = [{ code: "migration-index-unreadable" }];
        return;
      }
    }
    const snapshot = this.snapshotReader({ env: this.env, homeDir: this.env.HOME ?? os.homedir(), sourceUserId: this.env.OPL_AIONUI_USER_ID, includeMessages: false });
    this.document.policy = "canonical_metadata_only";
    this.document.ui = snapshot.ui;
    this.document.sourceInventory = snapshot.sources.map(({ id, kind, path: sourcePath, status, conversationCount }) => ({ id, kind, path: sourcePath, status, conversationCount }));
    this.document.diagnostics = [...snapshot.diagnostics];
    const currentKeys = new Set(snapshot.conversations.map(keyFor));
    if (snapshot.complete) for (const entry of this.document.entries) {
      if (!currentKeys.has(entry.key) && entry.state !== "deleted") {
        entry.state = "ignored";
        entry.reasonCode = "outside_opl_metadata_sources";
      }
    }
    for (const conversation of snapshot.conversations) {
      const key = keyFor(conversation);
      let entry = this.document.entries.find(value => value.key === key);
      if (entry?.state === "deleted") continue;
      if (!entry) {
        entry = { key, sourceId: conversation.sourceId, sourceConversationId: conversation.id, threadId: null, native: false };
        this.document.entries.push(entry);
      }
      if (!conversation.nativeCodexThreadId) {
        entry.state = "ignored";
        entry.reasonCode = "no_canonical_codex_reference";
        continue;
      }
      try {
        const { thread } = await this.transport.readThread(conversation.nativeCodexThreadId, false);
        if (thread?.id !== conversation.nativeCodexThreadId) throw new Error("canonical thread identity mismatch");
        if (entry.threadId && entry.threadId !== thread.id) {
          entry.previousBindings = [...(entry.previousBindings ?? []), { threadId: entry.threadId, reason: "relinked_original_canonical_thread" }];
        }
        Object.assign(entry, { threadId: thread.id, native: true, state: "complete", workspace: thread.cwd ?? conversation.workspace,
          pinned: conversation.pinned, pinnedAt: conversation.pinnedAt, sortOrder: conversation.sortOrder });
        delete entry.reasonCode;
      } catch (error) {
        // A removed/unavailable native history remains source-owned. Do not
        // resurrect it or manufacture a new conversation to satisfy a test.
        entry.state = missingCanonicalThread(error) ? "ignored" : "pending";
        entry.reasonCode = missingCanonicalThread(error) ? "canonical_thread_unavailable" : "canonical_read_failed";
        if (entry.state === "pending") this.document.diagnostics.push({ code: "migration-thread-pending", reasonCode: entry.reasonCode, sourceConversationId: conversation.id });
      }
    }
    this.document.complete = this.document.diagnostics.length === 0 && this.document.entries.every(entry => ["complete", "ignored", "deleted"].includes(entry.state));
    if (snapshot.sources.length || this.document.entries.length) await atomicJson(this.file, this.document);
  }
  summary() {
    return { schema: SCHEMA, complete: this.document.complete,
      entries: this.document.entries.filter(entry => entry.native && entry.state === "complete").map(({ key: _key, state: _state, ...entry }) => entry),
      ui: this.document.ui, diagnostics: this.document.diagnostics };
  }
  async deleted(threadId) {
    this.operation = this.operation.catch(() => {}).then(async () => {
      const entries = this.document.entries.filter(entry => entry.threadId === threadId && entry.native);
      for (const entry of entries) entry.state = "deleted";
      if (entries.length) await atomicJson(this.file, this.document);
    });
    return this.operation;
  }
}

export class MigratedThreadAdapter extends CodexThreadAdapter {
  constructor(transport, migration) { super(transport); this.migration = migration; }
  async listThreads(request = {}) {
    const [result] = await Promise.all([super.listThreads(request), this.migration.start()]);
    return { ...result, migration: this.migration.summary() };
  }
  async deleteThread(request) {
    const result = await super.deleteThread(request);
    await this.migration.deleted(request.threadId);
    return result;
  }
}
