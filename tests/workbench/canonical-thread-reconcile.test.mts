import { describe, expect, test } from "bun:test";
import {
  collectCanonicalReconcileTargets,
  isEventForActiveTurn,
  resolveCanonicalTurn,
  shouldNotifyCanonicalCompletion
} from "../../src/workbench/canonicalThreadReconcile";

describe("canonical thread reconcile", () => {
  test("restores an active turn and its stable pending identity from canonical readback", () => {
    const result = resolveCanonicalTurn({
      activeTurnId: "turn-active",
      turns: [{ id: "turn-active", status: "inProgress" }]
    });
    expect(result).toEqual({ activeTurnId: "turn-active" });
    expect(`assistant-pending:thread-1:${result.activeTurnId}`).toBe("assistant-pending:thread-1:turn-active");
  });

  test.each(["completed", "interrupted", "failed"] as const)("settles %s turns from canonical state", (status) => {
    const result = resolveCanonicalTurn({
      turns: [{ id: "turn-terminal", status }]
    }, "turn-terminal");
    expect(result.activeTurnId).toBeUndefined();
    expect(result.terminalTurn).toEqual({ id: "turn-terminal", status });
  });

  test("keeps a newer active turn while an older completion arrives out of order", () => {
    const result = resolveCanonicalTurn({
      activeTurnId: "turn-new",
      turns: [
        { id: "turn-old", status: "completed" },
        { id: "turn-new", status: "inProgress" }
      ]
    }, "turn-old");
    expect(result.activeTurnId).toBe("turn-new");
    expect(result.terminalTurn?.id).toBe("turn-old");
  });

  test("streams only events for the visible active turn", () => {
    const active = { threadId: "thread-selected", turnId: "turn-selected" };
    expect(isEventForActiveTurn({ threadId: "thread-selected", turnId: "turn-selected" }, active)).toBe(true);
    expect(isEventForActiveTurn({ threadId: "thread-background", turnId: "turn-background" }, active)).toBe(false);
    expect(isEventForActiveTurn({ threadId: "thread-selected", turnId: "turn-old" }, active)).toBe(false);
    expect(isEventForActiveTurn({}, active)).toBe(false);
  });

  test("reconnect reconciles selected and every known background active thread once", () => {
    const targets = collectCanonicalReconcileTargets(
      "thread-selected",
      [
        { id: "thread-selected" },
        { id: "thread-directory", activeTurnId: "turn-directory" },
        { id: "thread-tracked", activeTurnId: "stale-directory-turn" }
      ],
      new Map([["thread-tracked", "turn-tracked"]])
    );
    expect(targets).toEqual([
      { threadId: "thread-tracked", expectedTurnId: "turn-tracked" },
      { threadId: "thread-directory", expectedTurnId: "turn-directory" },
      { threadId: "thread-selected" }
    ]);
  });

  test("notifications require current preference, background state, and turn-level deduplication", () => {
    const input = {
      enabled: true,
      threadId: "thread-background",
      turnId: "turn-1",
      selectedThreadId: "thread-selected",
      documentVisible: true,
      windowFocused: true,
      notifiedTurnIds: new Set<string>()
    };
    expect(shouldNotifyCanonicalCompletion(input)).toBe(true);
    input.notifiedTurnIds.add("thread-background:turn-1");
    expect(shouldNotifyCanonicalCompletion(input)).toBe(false);
    expect(shouldNotifyCanonicalCompletion({ ...input, enabled: false, notifiedTurnIds: new Set() })).toBe(false);
    expect(shouldNotifyCanonicalCompletion({
      ...input,
      selectedThreadId: "thread-background",
      notifiedTurnIds: new Set()
    })).toBe(false);
  });
});
