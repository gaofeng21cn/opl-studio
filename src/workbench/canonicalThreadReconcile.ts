import type { CodexThread, CodexTurn } from "../threads/types";

export type CanonicalReconcileTarget = {
  threadId: string;
  expectedTurnId?: string;
};

export function isEventForActiveTurn(
  params: Readonly<Record<string, unknown>>,
  activeTurn: { threadId: string; turnId: string } | null
): boolean {
  return Boolean(
    activeTurn
    && params.threadId === activeTurn.threadId
    && params.turnId === activeTurn.turnId
  );
}

export function resolveCanonicalTurn(
  thread: Pick<CodexThread, "activeTurnId" | "turns">,
  expectedTurnId?: string
): { activeTurnId?: string; terminalTurn?: CodexTurn } {
  const activeTurn = thread.activeTurnId
    ? thread.turns.find((turn) => turn.id === thread.activeTurnId)
    : [...thread.turns].reverse().find((turn) => turn.status === "inProgress");
  const expectedTurn = expectedTurnId
    ? thread.turns.find((turn) => turn.id === expectedTurnId)
    : undefined;
  return {
    ...(activeTurn ? { activeTurnId: activeTurn.id } : {}),
    ...(expectedTurn && expectedTurn.status !== "inProgress" ? { terminalTurn: expectedTurn } : {})
  };
}

export function collectCanonicalReconcileTargets(
  selectedThreadId: string | undefined,
  directoryThreads: ReadonlyArray<{ id: string; activeTurnId?: string }>,
  trackedTurnIds: ReadonlyMap<string, string>
): CanonicalReconcileTarget[] {
  const targets = new Map<string, string | undefined>(trackedTurnIds);
  for (const thread of directoryThreads) {
    if (thread.activeTurnId && !targets.has(thread.id)) targets.set(thread.id, thread.activeTurnId);
  }
  if (selectedThreadId && !targets.has(selectedThreadId)) targets.set(selectedThreadId, undefined);
  return [...targets].map(([threadId, expectedTurnId]) => ({
    threadId,
    ...(expectedTurnId ? { expectedTurnId } : {})
  }));
}

export function shouldNotifyCanonicalCompletion(input: {
  enabled: boolean;
  threadId: string;
  turnId: string;
  selectedThreadId?: string;
  documentVisible: boolean;
  windowFocused: boolean;
  notifiedTurnIds: ReadonlySet<string>;
}): boolean {
  if (!input.enabled) return false;
  const notificationKey = `${input.threadId}:${input.turnId}`;
  if (input.notifiedTurnIds.has(notificationKey)) return false;
  return input.selectedThreadId !== input.threadId || !input.documentVisible || !input.windowFocused;
}
