import {
  AppServerTransportError,
  DEFAULT_PERMISSION_PROFILE,
  assertChannelThreadHost,
  assertChannelThreadReadback,
  channelThreadRef,
  requiredChannelObject,
  requiredChannelString,
  requiredChannelText,
  turnPermissionOverrides
} from "@gaofeng21cn/opl-host-kit/app-server-protocol";
import {
  assertSameCanonicalCwd,
  canonicalCwdFromResponse,
  resolveReadThread,
  resolveResumedThread,
  responseCwdCandidates
} from "./app-server-working-directory.mjs";

export function createChannelCallbackAdapter(transport) {
  const bindingStore = transport.channelBindingStore;
  if (
    !bindingStore
    || typeof bindingStore.getOrCreate !== "function"
    || typeof bindingStore.assertKnownThread !== "function"
    || typeof bindingStore.readBindings !== "function"
  ) {
    throw new AppServerTransportError(
      "channel_binding_store_unavailable",
      "channel callbacks require an exact transport binding store"
    );
  }
  return Object.freeze({
    readTransportBindings: () => bindingStore.readBindings(),
    startThread: async (request = {}) => {
      const value = requiredChannelObject(request, "startThread request");
      const channelIdentity = {
        provider_id: requiredChannelString(value.provider_id, "provider_id"),
        account_id: requiredChannelString(value.account_id, "account_id"),
        channel_session_id: requiredChannelString(value.channel_session_id, "channel_session_id")
      };
      const binding = await bindingStore.getOrCreate(channelIdentity, async () => {
        const response = await transport.startThread();
        const startedThread = {
          canonical_thread_host: transport.host,
          canonical_thread_id: requiredChannelString(response.thread?.id, "thread/start thread id")
        };
        const readback = await transport.readThread(startedThread.canonical_thread_id);
        assertChannelThreadReadback(startedThread, readback, "thread/start readback", transport.host);
        return startedThread;
      });
      const canonicalThread = channelThreadRef(binding.thread, "channel binding");
      assertChannelThreadHost(canonicalThread, "channel binding", transport.host);
      if (!binding.created) {
        const readback = await transport.readThread(canonicalThread.canonical_thread_id);
        assertChannelThreadReadback(canonicalThread, readback, "channel binding readback", transport.host);
      }
      return canonicalThread;
    },
    resumeThread: async (request = {}) => {
      const canonicalThread = channelThreadRef(request, "resumeThread request");
      assertChannelThreadHost(canonicalThread, "thread/resume", transport.host);
      await bindingStore.assertKnownThread(canonicalThread);
      const readback = await transport.readThread(canonicalThread.canonical_thread_id);
      assertChannelThreadReadback(canonicalThread, readback, "thread/resume readback", transport.host);
      const resumed = await resolveResumedThread(transport, canonicalThread.canonical_thread_id);
      assertChannelThreadReadback(canonicalThread, resumed.fallback ?? resumed.response, "thread/resume", transport.host);
      if (responseCwdCandidates(readback).length > 0) {
        assertSameCanonicalCwd(
          canonicalCwdFromResponse(readback, canonicalThread.canonical_thread_id, "thread/read"),
          resumed.cwd,
          "thread/resume"
        );
      }
    },
    startTurn: async (request = {}) => {
      const value = requiredChannelObject(request, "startTurn request");
      const canonicalThread = channelThreadRef(value, "startTurn request");
      assertChannelThreadHost(canonicalThread, "turn/start", transport.host);
      await bindingStore.assertKnownThread(canonicalThread);
      const readback = await transport.readThread(canonicalThread.canonical_thread_id);
      assertChannelThreadReadback(canonicalThread, readback, "turn/start readback", transport.host);
      const resolved = await resolveReadThread(transport, canonicalThread.canonical_thread_id, readback);
      assertChannelThreadReadback(canonicalThread, resolved.response, "turn/start readback", transport.host);
      const response = await transport.startTurn(
        canonicalThread.canonical_thread_id,
        requiredChannelText(value.text),
        [],
        {
          cwd: resolved.cwd,
          ...turnPermissionOverrides(DEFAULT_PERMISSION_PROFILE, resolved.cwd)
        }
      );
      const turnId = response.turn?.id;
      if (typeof turnId !== "string" || !turnId.trim()) {
        throw new AppServerTransportError(
          "invalid_app_server_response",
          "turn/start returned no turn id"
        );
      }
      const canonicalTurn = {
        ...canonicalThread,
        canonical_turn_id: turnId
      };
      transport.channelTurns.add(JSON.stringify(canonicalTurn));
      return canonicalTurn;
    },
    subscribeTurn(request = {}, observer) {
      const value = requiredChannelObject(request, "subscribeTurn request");
      const canonicalThread = channelThreadRef(value, "subscribeTurn request");
      const canonicalTurnId = requiredChannelString(value.canonical_turn_id, "canonical_turn_id");
      if (!observer || typeof observer !== "object" || typeof observer.onTerminal !== "function") {
        throw new AppServerTransportError("invalid_request", "subscribeTurn observer requires onTerminal");
      }
      return transport.subscribeChannelTurn({
        ...canonicalThread,
        canonical_turn_id: canonicalTurnId
      }, observer);
    }
  });
}

export function subscribeChannelTurn(transport, { canonical_thread_host, canonical_thread_id, canonical_turn_id }, observer) {
  const normalizedThreadHost = requiredChannelString(canonical_thread_host, "canonical_thread_host");
  const normalizedThreadId = requiredChannelString(canonical_thread_id, "canonical_thread_id");
  const normalizedTurnId = requiredChannelString(canonical_turn_id, "canonical_turn_id");
  assertChannelThreadHost({
    canonical_thread_host: normalizedThreadHost,
    canonical_thread_id: normalizedThreadId
  }, "turn/subscribe", transport.host);
  const canonicalTurnKey = JSON.stringify({
    canonical_thread_host: normalizedThreadHost,
    canonical_thread_id: normalizedThreadId,
    canonical_turn_id: normalizedTurnId
  });
  if (!transport.channelTurns.has(canonicalTurnKey)) {
    throw new AppServerTransportError(
      "channel_binding_unknown",
      "canonical turn was not created through the exact channel binding"
    );
  }
  if (!observer || typeof observer !== "object" || typeof observer.onTerminal !== "function") {
    throw new AppServerTransportError("invalid_request", "channel turn observer requires onTerminal");
  }

  let settled = false;
  const terminal = () => {
    if (settled) return;
    const result = transport.turnResult(normalizedTurnId);
    const notification = result?.completed;
    const eventThreadId = notification?.threadId ?? notification?.thread?.id;
    if (eventThreadId && eventThreadId !== normalizedThreadId) return;
    settled = true;
    transport.off("event", onEvent);
    transport.channelTurns.delete(canonicalTurnKey);
    const status = notification?.turn?.status ?? notification?.status ?? "completed";
    const base = {
      canonical_thread_host: normalizedThreadHost,
      canonical_thread_id: normalizedThreadId,
      canonical_turn_id: normalizedTurnId
    };
    const event = status === "failed"
      ? {
          ...base,
          status: "failed",
          error: {
            code: notification?.turn?.error?.code ?? "codex_turn_failed",
            message: notification?.turn?.error?.message ?? "Canonical Codex turn failed."
          }
        }
      : status === "interrupted" || status === "cancelled"
        ? { ...base, status: "cancelled" }
        : { ...base, status: "completed", response_text: result?.finalMessage ?? "" };
    void Promise.resolve(observer.onTerminal(event)).catch(() => {
      // Provider callback errors must not change the canonical turn result.
    });
  };
  const onEvent = (event) => {
    if (event?.method !== "turn/completed") return;
    const params = event.params ?? {};
    const eventThreadId = params.threadId ?? params.thread?.id;
    const eventTurnId = params.turnId ?? params.turn?.id;
    if (eventTurnId !== normalizedTurnId || (eventThreadId && eventThreadId !== normalizedThreadId)) return;
    terminal();
  };

  transport.on("event", onEvent);
  if (transport.turnResult(normalizedTurnId)?.completed) queueMicrotask(terminal);
  return Object.freeze({
    dispose: () => {
      if (settled) return;
      settled = true;
      transport.off("event", onEvent);
      transport.channelTurns.delete(canonicalTurnKey);
    }
  });
}
