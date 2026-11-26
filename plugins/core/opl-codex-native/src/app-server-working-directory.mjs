import path from "node:path";
import { AppServerTransportError } from "@gaofeng21cn/opl-host-kit/app-server-protocol";

export function assertAbsoluteDirectory(value, label, code = "invalid_request") {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || !path.isAbsolute(value)) {
    throw new AppServerTransportError(code, `${label} must be an absolute directory path`, { value });
  }
  return value;
}

export function responseCwdCandidates(response) {
  const candidates = [];
  if (response && typeof response === "object" && response.cwd !== undefined) {
    candidates.push(["cwd", response.cwd]);
  }
  const thread = response?.thread;
  if (!thread || typeof thread !== "object") return candidates;
  if (thread.cwd !== undefined) candidates.push(["thread.cwd", thread.cwd]);
  if (Array.isArray(thread.environments)) {
    for (const [index, environment] of thread.environments.entries()) {
      if (environment && typeof environment === "object" && environment.cwd !== undefined) {
        candidates.push([`thread.environments[${index}].cwd`, environment.cwd]);
      }
    }
  }
  return candidates;
}

export function canonicalCwdFromResponse(response, expectedThreadId, label) {
  const thread = response?.thread;
  if (!thread || typeof thread !== "object" || thread.id !== expectedThreadId) {
    throw new AppServerTransportError(
      "invalid_app_server_response",
      `${label} returned a different canonical thread`,
      { expectedThreadId, actualThreadId: thread?.id }
    );
  }
  const candidates = responseCwdCandidates(response);
  if (candidates.length === 0) {
    throw new AppServerTransportError(
      "invalid_app_server_response",
      `${label} returned no canonical cwd`,
      { threadId: expectedThreadId, reason: "missing_cwd" }
    );
  }
  const cwds = [];
  for (const [field, value] of candidates) {
    const cwd = assertAbsoluteDirectory(value, `${label} ${field}`, "invalid_app_server_response");
    if (!cwds.includes(cwd)) cwds.push(cwd);
  }
  if (cwds.length !== 1) {
    throw new AppServerTransportError(
      "invalid_app_server_response",
      `${label} returned contradictory canonical cwd`,
      { threadId: expectedThreadId, cwds }
    );
  }
  return cwds[0];
}

export async function resolveResumedThread(transport, threadId) {
  const response = await transport.resumeThread(threadId);
  if (response?.thread !== undefined && response?.thread !== null) {
    try {
      return { response, fallback: null, cwd: canonicalCwdFromResponse(response, threadId, "thread/resume") };
    } catch (error) {
      if (error?.details?.reason !== "missing_cwd") throw error;
    }
  }
  const fallback = await transport.readThread(threadId);
  return { response, fallback, cwd: canonicalCwdFromResponse(fallback, threadId, "thread/read") };
}

export async function resolveReadThread(transport, threadId, response) {
  try {
    return { response, cwd: canonicalCwdFromResponse(response, threadId, "thread/read") };
  } catch (error) {
    if (error?.details?.reason !== "missing_cwd") throw error;
  }
  const fallback = await transport.readThread(threadId);
  return { response: fallback, cwd: canonicalCwdFromResponse(fallback, threadId, "thread/read") };
}

export function assertSameCanonicalCwd(expected, actual, label) {
  if (expected === actual) return;
  throw new AppServerTransportError(
    "invalid_app_server_response",
    `${label} returned contradictory canonical cwd`,
    { cwds: [expected, actual] }
  );
}
