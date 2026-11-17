import { AppServerTransportError } from "./app-server-protocol.mjs";

const requiresHumanResponse = ({ method, params }) => typeof method === "string" && (
  method.endsWith("/requestApproval")
  || (method === "item/tool/requestUserInput" && params?.isBlocking !== false)
  || method === "mcpServer/elicitation/request"
);
const eventTurnId = params => params.turnId ?? params.turn?.id;

export class TurnLifecycle {
  constructor({ defaultTimeoutMs, onIdle, onClearRequests }) {
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.onIdle = onIdle;
    this.onClearRequests = onClearRequests;
    this.turns = new Map();
    this.activeTurns = new Set();
    this.requestTurns = new Map();
    this.humanRequests = new Map();
    this.threadHumanRequests = new Map();
  }

  hasPendingWaits() {
    return [...this.turns.values()].some(bucket => bucket.waiters.length > 0);
  }

  waitForTurn(turnId, timeoutMs = this.defaultTimeoutMs) {
    const existing = this.turns.get(turnId);
    if (existing?.completed) return Promise.resolve(existing.completed);
    return new Promise((resolve, reject) => {
      const bucket = this.#bucket(turnId);
      bucket.timeoutMs = bucket.waiters.length === 0
        ? timeoutMs
        : Math.min(bucket.timeoutMs, timeoutMs);
      bucket.waiters.push({ resolve, reject });
      this.#arm(turnId, bucket);
    });
  }

  turnResult(turnId) {
    const bucket = this.turns.get(turnId);
    if (!bucket) return undefined;
    return {
      finalMessage: bucket.completed?.finalMessage ?? bucket.finalMessage ?? bucket.text,
      completed: bucket.completed?.notification
    };
  }

  recordStart(turnId) {
    const bucket = this.#bucket(turnId);
    if (bucket.completed) return;
    this.activeTurns.add(turnId);
    this.#activity(turnId, bucket);
  }

  recordServerRequest(message) {
    const params = message.params ?? {};
    const turnId = eventTurnId(params);
    // MCP permits a standalone elicitation without a correlated turn. Preserve
    // its thread scope without inventing a turn identity or clearing it on completion.
    if (!turnId && message.method === "mcpServer/elicitation/request" && params.threadId) {
      this.threadHumanRequests.set(message.id, params.threadId);
      this.#threadActivity(params.threadId);
    }
    if (!turnId) return;
    this.requestTurns.set(message.id, turnId);
    if (requiresHumanResponse(message)) {
      const requests = this.humanRequests.get(turnId) ?? new Set();
      requests.add(message.id);
      this.humanRequests.set(turnId, requests);
    }
    this.#activity(turnId, this.#bucket(turnId));
  }

  recordServerResponse(requestId) {
    const threadId = this.threadHumanRequests.get(requestId);
    if (threadId) {
      this.threadHumanRequests.delete(requestId);
      this.#threadActivity(threadId);
    }
    const turnId = this.requestTurns.get(requestId);
    if (!turnId) return;
    this.requestTurns.delete(requestId);
    const requests = this.humanRequests.get(turnId);
    requests?.delete(requestId);
    if (requests?.size === 0) this.humanRequests.delete(turnId);
    this.#activity(turnId, this.#bucket(turnId));
  }

  recordEvent(message) {
    const params = message.params ?? {};
    const turnId = eventTurnId(params);
    if (!turnId) return;
    const bucket = this.#bucket(turnId);
    if (params.threadId) bucket.threadId = params.threadId;
    if (message.method === "turn/started" && !bucket.completed) this.activeTurns.add(turnId);
    bucket.events.push(message);
    if (message.method === "item/agentMessage/delta" && typeof params.delta === "string") {
      bucket.text += params.delta;
    }
    if (message.method === "item/completed" && params.item?.type === "agentMessage") {
      bucket.finalMessage = params.item.text;
    }
    if (message.method !== "turn/completed") {
      this.#activity(turnId, bucket);
      return;
    }

    bucket.completed = {
      finalMessage: bucket.finalMessage ?? bucket.text,
      events: bucket.events,
      notification: params
    };
    bucket.lastActivityAt = Date.now();
    this.activeTurns.delete(turnId);
    this.#clearTimer(bucket);
    const waiters = bucket.waiters;
    bucket.waiters = [];
    for (const waiter of waiters) waiter.resolve(bucket.completed);
    this.#clearRequests(turnId, "turn_completed");
    this.onIdle();
  }

  failAll(error) {
    this.activeTurns.clear();
    for (const bucket of this.turns.values()) {
      this.#clearTimer(bucket);
      const waiters = bucket.waiters;
      bucket.waiters = [];
      for (const waiter of waiters) waiter.reject(error);
    }
    this.requestTurns.clear();
    this.humanRequests.clear();
    this.threadHumanRequests.clear();
  }

  #bucket(turnId) {
    const existing = this.turns.get(turnId);
    if (existing) return existing;
    const bucket = {
      events: [],
      text: "",
      waiters: [],
      lastActivityAt: Date.now(),
      timeoutMs: this.defaultTimeoutMs,
      timer: null
    };
    this.turns.set(turnId, bucket);
    return bucket;
  }

  #activity(turnId, bucket) {
    bucket.lastActivityAt = Date.now();
    this.#arm(turnId, bucket);
  }

  #threadActivity(threadId) {
    for (const [turnId, bucket] of this.turns) {
      if (bucket.threadId === threadId) this.#activity(turnId, bucket);
    }
  }

  #waitingForHuman(turnId, bucket) {
    return this.humanRequests.get(turnId)?.size
      || (bucket.threadId && [...this.threadHumanRequests.values()].includes(bucket.threadId));
  }

  #arm(turnId, bucket) {
    this.#clearTimer(bucket);
    if (bucket.completed || bucket.waiters.length === 0 || this.#waitingForHuman(turnId, bucket)) return;
    const remaining = Math.max(0, bucket.timeoutMs - (Date.now() - bucket.lastActivityAt));
    bucket.timer = setTimeout(() => this.#expire(turnId, bucket), remaining);
  }

  #expire(turnId, bucket) {
    bucket.timer = null;
    if (bucket.completed || bucket.waiters.length === 0 || this.#waitingForHuman(turnId, bucket)) return;
    const idle = Date.now() - bucket.lastActivityAt;
    if (idle < bucket.timeoutMs) {
      this.#arm(turnId, bucket);
      return;
    }
    const error = new AppServerTransportError(
      "turn_timeout",
      `Turn timed out after ${bucket.timeoutMs}ms without activity: ${turnId}`,
      { turnId }
    );
    this.activeTurns.delete(turnId);
    const waiters = bucket.waiters;
    bucket.waiters = [];
    for (const waiter of waiters) waiter.reject(error);
    this.#clearRequests(turnId, "turn_timeout");
    this.onIdle();
  }

  #clearRequests(turnId, reason) {
    const requestIds = [];
    for (const [requestId, requestTurnId] of this.requestTurns) {
      if (requestTurnId !== turnId) continue;
      requestIds.push(requestId);
      this.requestTurns.delete(requestId);
    }
    this.humanRequests.delete(turnId);
    if (requestIds.length > 0) this.onClearRequests(requestIds, reason);
  }

  #clearTimer(bucket) {
    if (bucket.timer === null) return;
    clearTimeout(bucket.timer);
    bucket.timer = null;
  }
}
