import { spawn } from "node:child_process";

const SAFE_CODE = /^[a-z][a-z0-9_]{0,79}$/;
const SECRET_FIELDS = new Set([
  "password", "token", "accesstoken", "refreshtoken", "apikey", "key",
  "keyvalue", "keyplaintext", "plaintextkey", "secret", "credentialhandle"
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsSecretField(value) {
  if (Array.isArray(value)) return value.some(containsSecretField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([field, nested]) => {
    const normalized = field.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    return SECRET_FIELDS.has(normalized) || containsSecretField(nested);
  });
}

function commandResult({ command, args, cwd, env, spawnImpl, timeoutMs, maxOutputBytes }) {
  return new Promise((resolve) => {
    const child = spawnImpl(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let outputTruncated = false;
    let settled = false;
    let timedOut = false;
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      let parsed;
      try { parsed = JSON.parse(stdout); } catch { parsed = undefined; }
      resolve({ exitCode, parsed, outputTruncated });
    };
    const append = (current, chunk) => {
      const combined = `${current}${chunk}`;
      if (Buffer.byteLength(combined) > maxOutputBytes) outputTruncated = true;
      return combined.slice(-maxOutputBytes);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.once("error", () => finish(-1));
    child.once("close", (code) => finish(timedOut ? -1 : (code ?? -1)));
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
  });
}

function failureCode(result) {
  const code = result.parsed?.error?.details?.reason_code
    ?? result.parsed?.error?.code
    ?? result.parsed?.error_code;
  return typeof code === "string" && SAFE_CODE.test(code)
    ? code
    : "connection_authorization_approval_failed";
}

export function createConnectionAccessApproval({
  command = process.env.OPL_APP_OPL_BIN ?? process.env.OPL_COMMAND ?? "opl",
  cwd = process.cwd(),
  env = process.env,
  spawnImpl = spawn,
  timeoutMs = 45_000,
  maxOutputBytes = 65_536
} = {}) {
  return async function approveConnectionAccess(request) {
    if (
      !isRecord(request)
      || Object.keys(request).length !== 1
      || typeof request.requestId !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(request.requestId)
    ) {
      return { ok: false, errorCode: "invalid_request" };
    }

    const result = await commandResult({
      command,
      args: ["connect", "authorization", "approve", "--request-id", request.requestId, "--json"],
      cwd,
      env,
      spawnImpl,
      timeoutMs,
      maxOutputBytes
    });
    if (result.outputTruncated || !isRecord(result.parsed)) {
      return { ok: false, errorCode: "internal_contract_violation" };
    }
    if (result.exitCode !== 0 || result.parsed.error) {
      return { ok: false, errorCode: failureCode(result) };
    }
    if (containsSecretField(result.parsed) || !isRecord(result.parsed.connection_authorization)) {
      return { ok: false, errorCode: "internal_contract_violation" };
    }
    return { ok: true, stateRefreshRequired: true };
  };
}

export const connectionAccessApprovalTestApi = { containsSecretField, failureCode };
