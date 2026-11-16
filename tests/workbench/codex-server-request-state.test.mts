import { expect, test } from "bun:test";
import {
  appServerUnavailableRequestMessage,
  isTurnScopedServerRequestsCleanup,
  removeServerRequests
} from "../../src/workbench/codexServerRequestState";
import type { CodexPendingServerRequest } from "../../src/bridge/oplBridge";

const approval = (id: string): CodexPendingServerRequest => ({
  id,
  method: "item/commandExecution/requestApproval",
  params: {}
});

test("turn completion clears only the request IDs belonging to that turn", () => {
  const requests = [approval("alpha-1"), approval("beta-1")];

  const remaining = removeServerRequests(requests, ["alpha-1"]);

  expect(remaining.map(request => request.id)).toEqual(["beta-1"]);
  expect(isTurnScopedServerRequestsCleanup("turn_completed")).toBe(true);
});

test("turn timeout clears only the timed-out turn's request IDs", () => {
  const requests = [approval("expire-1"), approval("live-1")];

  const remaining = removeServerRequests(requests, ["expire-1"]);

  expect(remaining.map(request => request.id)).toEqual(["live-1"]);
  expect(isTurnScopedServerRequestsCleanup("turn_timeout")).toBe(true);
});

test("App Server exit reasons keep global cleanup and the fatal message", () => {
  for (const reason of ["app_server_unavailable", "app_server_exited", "app_server_stopping"]) {
    expect(isTurnScopedServerRequestsCleanup(reason)).toBe(false);
  }
  expect(appServerUnavailableRequestMessage("en")).toBe(
    "The Codex App Server exited; pending requests were cleared."
  );
});
