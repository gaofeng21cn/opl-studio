import type { CodexPendingServerRequest } from "../bridge/oplBridge";

const TURN_SCOPED_CLEANUP_REASONS: ReadonlySet<string> = new Set(["turn_completed", "turn_timeout"]);

// Turn lifecycle events clear only the requests recorded for the turn that
// finished. App Server availability events still invalidate every request.
export function isTurnScopedServerRequestsCleanup(reason: string): boolean {
  return TURN_SCOPED_CLEANUP_REASONS.has(reason);
}

export function removeServerRequests(
  requests: CodexPendingServerRequest[],
  requestIds: readonly (string | number)[]
): CodexPendingServerRequest[] {
  const cleared = new Set(requestIds);
  return requests.filter((request) => !cleared.has(request.id));
}

export function appServerUnavailableRequestMessage(locale: "zh" | "en"): string {
  return locale === "zh"
    ? "Codex App Server 已退出，待处理请求已清除。"
    : "The Codex App Server exited; pending requests were cleared.";
}
