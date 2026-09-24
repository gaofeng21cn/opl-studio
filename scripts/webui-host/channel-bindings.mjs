import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const BINDING_SCHEMA = "opl_studio_channel_transport_bindings.v1";

export class ChannelBindingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ChannelBindingError";
    this.code = code;
    this.details = details;
  }
}

function exactString(value, field) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 512
    || value.trim() !== value
  ) {
    throw new ChannelBindingError(
      "invalid_channel_binding",
      `${field} must be an exact non-empty string`,
      { field }
    );
  }
  return value;
}

function identity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ChannelBindingError("invalid_channel_binding", "channel identity must be an object");
  }
  return Object.freeze({
    provider_id: exactString(value.provider_id, "provider_id"),
    account_id: exactString(value.account_id, "account_id"),
    channel_session_id: exactString(value.channel_session_id, "channel_session_id")
  });
}

function threadRef(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ChannelBindingError("invalid_channel_binding", "canonical thread ref must be an object");
  }
  return Object.freeze({
    canonical_thread_host: exactString(value.canonical_thread_host, "canonical_thread_host"),
    canonical_thread_id: exactString(value.canonical_thread_id, "canonical_thread_id")
  });
}

function identityKey(value) {
  return JSON.stringify([value.provider_id, value.account_id, value.channel_session_id]);
}

function threadKey(value) {
  return JSON.stringify([value.canonical_thread_host, value.canonical_thread_id]);
}

function emptyDocument() {
  return { schema: BINDING_SCHEMA, entries: [] };
}

export function validatedChannelBindings(value, filePath) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ChannelBindingError("channel_binding_state_invalid", "channel binding state must be an object", { filePath });
  }
  if (value.schema !== BINDING_SCHEMA || !Array.isArray(value.entries)) {
    throw new ChannelBindingError("channel_binding_state_invalid", "channel binding state schema is invalid", { filePath });
  }
  const identities = new Set();
  const threads = new Set();
  const entries = value.entries.map((entry) => {
    const normalizedIdentity = identity(entry);
    const normalizedThread = threadRef(entry);
    const currentIdentityKey = identityKey(normalizedIdentity);
    const currentThreadKey = threadKey(normalizedThread);
    if (identities.has(currentIdentityKey) || threads.has(currentThreadKey)) {
      throw new ChannelBindingError(
        "channel_binding_state_invalid",
        "channel binding state contains a duplicate identity or thread",
        { filePath }
      );
    }
    identities.add(currentIdentityKey);
    threads.add(currentThreadKey);
    return Object.freeze({ ...normalizedIdentity, ...normalizedThread });
  });
  return { schema: BINDING_SCHEMA, entries };
}

export class ChannelBindingStore {
  constructor({ filePath }) {
    if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
      throw new ChannelBindingError("invalid_channel_binding", "channel binding file path must be absolute");
    }
    this.filePath = filePath;
    this.operation = Promise.resolve();
  }

  async getOrCreate(value, create) {
    const normalizedIdentity = identity(value);
    if (typeof create !== "function") {
      throw new ChannelBindingError("invalid_channel_binding", "channel binding creator must be a function");
    }
    return this.#serialize(async () => {
      const document = await this.#read();
      const key = identityKey(normalizedIdentity);
      const existing = document.entries.find((entry) => identityKey(entry) === key);
      if (existing) return { created: false, thread: threadRef(existing) };

      const createdThread = threadRef(await create());
      if (document.entries.some((entry) => threadKey(entry) === threadKey(createdThread))) {
        throw new ChannelBindingError(
          "channel_binding_conflict",
          "canonical thread is already bound to another channel identity",
          { canonical_thread_id: createdThread.canonical_thread_id }
        );
      }
      document.entries.push({ ...normalizedIdentity, ...createdThread });
      await this.#write(document);
      return { created: true, thread: createdThread };
    });
  }

  async assertKnownThread(value) {
    const expected = threadRef(value);
    return this.#serialize(async () => {
      const document = await this.#read();
      const known = document.entries.some((entry) => threadKey(entry) === threadKey(expected));
      if (!known) {
        throw new ChannelBindingError(
          "channel_binding_unknown",
          "canonical thread has no exact channel binding",
          expected
        );
      }
      return expected;
    });
  }

  async readBindings() {
    return this.#serialize(async () => {
      const document = await this.#read();
      return Object.freeze(document.entries.map((entry) => Object.freeze({ ...entry })));
    });
  }

  #serialize(operation) {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(() => undefined, () => undefined);
    return result;
  }

  async #read() {
    let source;
    try {
      source = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return emptyDocument();
      throw error;
    }
    try {
      return validatedChannelBindings(JSON.parse(source), this.filePath);
    } catch (error) {
      if (error instanceof ChannelBindingError) throw error;
      throw new ChannelBindingError(
        "channel_binding_state_invalid",
        "channel binding state is not valid JSON",
        { filePath: this.filePath }
      );
    }
  }

  async #write(document) {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `.${path.basename(this.filePath)}.${process.pid}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600
      });
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
