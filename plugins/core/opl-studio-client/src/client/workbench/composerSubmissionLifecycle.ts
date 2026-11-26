import type { CodexThread } from "../threads/types";
import type { ComposerSelection } from "./ComposerCapabilityPalette";

export type TrackedComposerTurn = {
  threadId: string;
  turnId: string;
  selections: ComposerSelection[];
};

export function composerTurnKey(threadId: string, turnId: string): string {
  return JSON.stringify([threadId, turnId]);
}

function normalizedSelectionPath(selection: ComposerSelection): string {
  const rawPath = selection.attachment?.path
    || ("path" in selection.input ? selection.input.path : "");
  if (!rawPath) return "";
  const normalized = rawPath.trim().replaceAll("\\", "/").replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}

export function mergeComposerSelections(
  first: readonly ComposerSelection[],
  second: readonly ComposerSelection[]
): ComposerSelection[] {
  const merged: ComposerSelection[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const selection of [...first, ...second]) {
    const normalizedPath = normalizedSelectionPath(selection);
    if (ids.has(selection.id) || (normalizedPath && paths.has(normalizedPath))) continue;
    merged.push(selection);
    ids.add(selection.id);
    if (normalizedPath) paths.add(normalizedPath);
  }
  return merged;
}

export function mergeComposerSubmissionPrompt(failedPrompt: string, currentPrompt: string): string {
  return [failedPrompt.trim(), currentPrompt.trim()].filter(Boolean).join("\n\n");
}

export function recoverComposerSubmission(input: {
  failedPrompt: string;
  currentPrompt: string;
  failedSelections: readonly ComposerSelection[];
  currentSelections: readonly ComposerSelection[];
}): { prompt: string; selections: ComposerSelection[] } {
  return {
    prompt: mergeComposerSubmissionPrompt(input.failedPrompt, input.currentPrompt),
    selections: mergeComposerSelections(input.failedSelections, input.currentSelections)
  };
}

export function trackComposerTurnSelections(
  tracked: Map<string, TrackedComposerTurn>,
  threadId: string,
  turnId: string,
  selections: readonly ComposerSelection[]
): void {
  const attachments = selections.filter((selection) => Boolean(selection.attachment));
  if (!attachments.length) return;
  const key = composerTurnKey(threadId, turnId);
  const current = tracked.get(key);
  tracked.set(key, {
    threadId,
    turnId,
    selections: mergeComposerSelections(current?.selections ?? [], attachments)
  });
}

export function terminalTrackedComposerTurns(
  tracked: ReadonlyMap<string, TrackedComposerTurn>,
  thread: Pick<CodexThread, "id" | "turns">
): TrackedComposerTurn[] {
  const terminalTurnIds = new Set(
    thread.turns
      .filter((turn) => turn.status !== "inProgress")
      .map((turn) => turn.id)
  );
  return [...tracked.values()].filter((entry) => (
    entry.threadId === thread.id && terminalTurnIds.has(entry.turnId)
  ));
}
