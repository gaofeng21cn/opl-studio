import { describe, expect, test } from "bun:test";
import type { ComposerSelection } from "../../src/workbench/ComposerCapabilityPalette";
import {
  composerTurnKey,
  recoverComposerSubmission,
  terminalTrackedComposerTurns,
  trackComposerTurnSelections,
  type TrackedComposerTurn
} from "../../src/workbench/composerSubmissionLifecycle";

function attachment(id: string, path: string, cleanupToken?: string): ComposerSelection {
  return {
    id,
    kind: "file",
    label: id,
    detail: path,
    input: { type: "mention", name: id, path },
    attachment: {
      id,
      kind: "file",
      source: "picker",
      name: id,
      path,
      status: "ready",
      progress: 1,
      ...(cleanupToken ? { cleanupToken } : {})
    }
  };
}

describe("composer submission lifecycle", () => {
  test("failed submission preserves later prompt and unions old attachments first", () => {
    const failed = attachment("failed", "C:\\data\\paper.pdf", "upload-old");
    const duplicatePath = attachment("duplicate", "C:/data/paper.pdf/", "upload-duplicate");
    const later = attachment("later", "/data/notes.txt", "upload-later");

    expect(recoverComposerSubmission({
      failedPrompt: "Summarize the paper",
      currentPrompt: "Also compare the notes",
      failedSelections: [failed],
      currentSelections: [duplicatePath, later]
    })).toEqual({
      prompt: "Summarize the paper\n\nAlso compare the notes",
      selections: [failed, later]
    });
  });

  test("turn tracking unions initial and steer attachments until canonical terminal state", () => {
    const tracked = new Map<string, TrackedComposerTurn>();
    const initial = attachment("initial", "/data/initial.pdf", "upload-initial");
    const steered = attachment("steered", "/data/steered.csv", "upload-steered");
    trackComposerTurnSelections(tracked, "thread-1", "turn-1", [initial]);
    trackComposerTurnSelections(tracked, "thread-1", "turn-1", [initial, steered]);

    expect(tracked.get(composerTurnKey("thread-1", "turn-1"))?.selections).toEqual([initial, steered]);
    expect(terminalTrackedComposerTurns(tracked, {
      id: "thread-1",
      turns: [{ id: "turn-1", status: "inProgress" }]
    })).toEqual([]);
    expect(terminalTrackedComposerTurns(tracked, {
      id: "thread-1",
      turns: [{ id: "turn-1", status: "completed" }]
    })).toEqual([tracked.get(composerTurnKey("thread-1", "turn-1"))]);
  });

  test("terminal selection only returns entries confirmed by the matching canonical thread", () => {
    const tracked = new Map<string, TrackedComposerTurn>();
    trackComposerTurnSelections(tracked, "thread-1", "turn-old", [attachment("old", "/data/old")]);
    trackComposerTurnSelections(tracked, "thread-1", "turn-new", [attachment("new", "/data/new")]);
    trackComposerTurnSelections(tracked, "thread-2", "turn-other", [attachment("other", "/data/other")]);

    expect(terminalTrackedComposerTurns(tracked, {
      id: "thread-1",
      turns: [
        { id: "turn-old", status: "interrupted" },
        { id: "turn-new", status: "inProgress" }
      ]
    }).map((entry) => entry.turnId)).toEqual(["turn-old"]);
  });
});
