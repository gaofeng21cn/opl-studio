import { AppServerTransportError } from "./app-server-protocol.mjs";

const isHumanApproval = method => typeof method === "string" && method.endsWith("/requestApproval");
const eventTurnId = params => params.turnId ?? params.turn?.id;

export class TurnLifecycle {
  constructor({ defaultTimeoutMs, onIdle, onClearRequests }) {
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.onIdle = onIdle;
    this.onClearRequests = onClearRequests;
    this.turns = new Map();
    this.activeTurns = new Set();
    this.requestTurns = new Map();
    this.approvalRequests = new Map();
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
    const turnId = eventTurnId(message.params ?? {});
    if (!turnId) return;
    this.requestTurns.set(message.id, turnId);
    if (isHumanApproval(message.method)) {
      const approvals = this.approvalRequests.get(turnId) ?? new Set();
      approvals.add(message.id);
      this.approvalRequests.set(turnId, approvals);
    }
    this.#activity(turnId, this.#bucket(turnId));
  }

  recordServerResponse(requestId) {
    const turnId = this.requestTurns.get(requestId);
    if (!turnId) return;
    this.requestTurns.delete(requestId);
    const approvals = this.approvalRequests.get(turnId);
    approvals?.delete(requestId);
    if (approvals?.size === 0) this.approvalRequests.delete(turnId);
    this.#activity(turnId, this.#bucket(turnId));
  }

  recordEvent(message) {
    const params = message.params ?? {};
    const turnId = eventTurnId(params);
    if (!turnId) return;
    const bucket = this.#bucket(turnId);
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
    this.approvalRequests.clear();
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

  #arm(turnId, bucket) {
    this.#clearTimer(bucket);
    if (bucket.completed || bucket.waiters.length === 0 || this.approvalRequests.get(turnId)?.size) return;
    const remaining = Math.max(0, bucket.timeoutMs - (Date.now() - bucket.lastActivityAt));
    bucket.timer = setTimeout(() => this.#expire(turnId, bucket), remaining);
  }

  #expire(turnId, bucket) {
    bucket.timer = null;
    if (bucket.completed || bucket.waiters.length === 0 || this.approvalRequests.get(turnId)?.size) return;
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
    this.approvalRequests.delete(turnId);
    if (requestIds.length > 0) this.onClearRequests(requestIds, reason);
  }

  #clearTimer(bucket) {
    if (bucket.timer === null) return;
    clearTimeout(bucket.timer);
    bucket.timer = null;
  }
}
