import { spawn } from "node:child_process";

// Canonical consumer vocabulary. The OPL Framework gateway surface emits a
// fixed set of reason codes (see one-person-lab
// src/adapters/integration/opl-gateway-account*); every one of them has to land
// on a canonical code here. A code that reaches neither set below degrades to
// the non-actionable "gateway_account_failed" bucket, which is what left users
// staring at "invalid_credentials"/"gateway_account_failed" instead of a
// recovery step.
const ERROR_CODES = new Set([
  "invalid_credentials",
  "account_disabled",
  "mfa_or_challenge_required",
  "session_not_persistable",
  "group_selection_required",
  "auth_expired",
  "network_unreachable",
  "rate_limited",
  "managed_key_missing",
  "managed_key_conflict",
  "managed_key_identity_drift",
  "disconnect_pending",
  "account_switch_requires_disconnect",
  "gateway_busy",
  "gateway_codex_binding_failed",
  "gateway_configuration_invalid",
  "gateway_request_rejected",
  "gateway_response_invalid",
  "gateway_store_invalid",
  "credentials_stdin_too_large",
  "codex_configuration_failed",
  "invalid_request",
  "internal_contract_violation",
  "gateway_account_failed"
]);

const ERROR_ALIASES = new Map([
  ["credentials_stdin_invalid", "invalid_request"],
  ["reauth_required", "auth_expired"],
  ["network_timeout", "network_unreachable"],
  ["gateway_unavailable", "network_unreachable"],
  ["gateway_account_busy", "gateway_busy"],
  ["gateway_conflict", "gateway_request_rejected"],
  ["gateway_request_failed", "gateway_request_rejected"],
  ["gateway_response_too_large", "gateway_response_invalid"],
  ["gateway_profile_invalid", "gateway_response_invalid"],
  ["gateway_control_url_invalid", "gateway_configuration_invalid"],
  ["gateway_group_required", "group_selection_required"],
  ["gateway_account_dry_run_unsupported", "invalid_request"],
  ["gateway_account_payload_forbidden", "invalid_request"],
  ["gateway_store_json_invalid", "gateway_store_invalid"],
  ["gateway_store_owner_invalid", "gateway_store_invalid"],
  ["gateway_store_permissions_invalid", "gateway_store_invalid"],
  ["gateway_store_symlink_forbidden", "gateway_store_invalid"],
  ["gateway_store_type_invalid", "gateway_store_invalid"]
]);

const SECRET_FIELDS = new Set([
  "password", "token", "accesstoken", "refreshtoken", "apikey", "key",
  "keyvalue", "keyplaintext", "plaintextkey", "secret"
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

function normalizeErrorCode(value) {
  if (typeof value !== "string") return undefined;
  return ERROR_CODES.has(value) ? value : ERROR_ALIASES.get(value);
}

function readErrorCode(value) {
  if (!isRecord(value)) return undefined;
  const error = isRecord(value.error) ? value.error : undefined;
  const details = isRecord(value.details) ? value.details : undefined;
  const errorDetails = isRecord(error?.details) ? error.details : undefined;
  return [value.error_code, error?.code, details?.reason_code, errorDetails?.reason_code]
    .map(normalizeErrorCode)
    .find(Boolean);
}

function inferErrorCode(result, fallback = "gateway_account_failed") {
  const structured = readErrorCode(result.parsed);
  if (structured) return structured;
  const text = `${result.stderr ?? ""}`.toLowerCase();
  const encoded = [...text.matchAll(/"(?:reason_code|error_code)"\s*:\s*"([^"]+)"/gi)]
    .map((match) => normalizeErrorCode(match[1]))
    .find(Boolean);
  if (encoded) return encoded;
  // Only textual credential wording, never a bare "401": an HTTP status of 401
  // rides on several gateway failures and matching the number mislabelled them
  // all as bad passwords.
  if (/invalid credentials|invalid password|unauthorized/.test(text)) return "invalid_credentials";
  if (/disabled|suspended/.test(text)) return "account_disabled";
  if (/turnstile|captcha|totp|two-factor|mfa|challenge/.test(text)) return "mfa_or_challenge_required";
  if (/429|rate limit/.test(text)) return "rate_limited";
  if (/network|enotfound|econn|timeout|timed out/.test(text)) return "network_unreachable";
  return fallback;
}

// The secret scan exists to prove the CLI never echoes a credential back to the
// Shell. Non-secret request fields are echoed on purpose - the signed-in email
// comes back inside the account projection - so bytes covered by those fields
// are not leaks. Without that distinction a password that is also a substring of
// the submitted email turned every successful sign-in into a false
// internal_contract_violation and hid the real result.
function leakedSecret(output, secretValues, benignEchoes) {
  let haystack = output;
  for (const value of benignEchoes) {
    if (!value) continue;
    haystack = haystack.split(value).join("");
  }
  return secretValues.some((secret) => secret && haystack.includes(secret));
}

function sanitizeResult(result, secretValues = [], fallbackErrorCode = "gateway_account_failed", benignEchoes = []) {
  if (result.outputTruncated) {
    return { ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false };
  }
  if (leakedSecret(`${result.stdout ?? ""}${result.stderr ?? ""}`, secretValues, benignEchoes)) {
    return { ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false };
  }
  if (!isRecord(result.parsed)) {
    return {
      ok: false,
      errorCode: result.exitCode === 0 ? "internal_contract_violation" : inferErrorCode(result, fallbackErrorCode),
      stateRefreshRequired: false
    };
  }
  if (containsSecretField(result.parsed)) {
    return { ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false };
  }
  if (result.exitCode !== 0 || result.parsed.ok === false) {
    return { ok: false, errorCode: inferErrorCode(result, fallbackErrorCode), stateRefreshRequired: false };
  }
  return { ok: true, stateRefreshRequired: true };
}

function commandResult({ command, args, cwd, env, stdin, spawnImpl, timeoutMs, maxOutputBytes }) {
  return new Promise((resolve) => {
    const child = spawnImpl(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let outputTruncated = false;
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        parsed = undefined;
      }
      resolve({ exitCode, parsed, stdout, stderr, timedOut, outputTruncated });
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
    child.stdin.on("error", (error) => {
      stderr = append(stderr, error.message);
    });
    child.once("error", (error) => {
      stderr = append(stderr, error.message);
      finish(-1);
    });
    child.once("close", (code) => finish(timedOut ? -1 : (code ?? -1)));
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdin.end(stdin);
  });
}

export function createGatewayAccountLogin({
  command = process.env.OPL_APP_OPL_BIN ?? "opl",
  cwd = process.cwd(),
  env = process.env,
  spawnImpl = spawn,
  timeoutMs = 45_000,
  maxOutputBytes = 65_536
} = {}) {
  return async function loginGatewayAccount(request) {
    if (!isRecord(request)) {
      return { ok: false, errorCode: "invalid_request", stateRefreshRequired: false };
    }
    const allowedFields = new Set(["email", "password"]);
    if (Object.keys(request).some((field) => !allowedFields.has(field))) {
      return { ok: false, errorCode: "invalid_request", stateRefreshRequired: false };
    }
    const email = typeof request.email === "string" ? request.email.trim() : "";
    const password = typeof request.password === "string" ? request.password : "";
    if (!email || !password) {
      return { ok: false, errorCode: "invalid_request", stateRefreshRequired: false };
    }
    const stdin = `${JSON.stringify({ email, password })}\n`;
    const result = await commandResult({
      command,
      args: ["connect", "gateway", "login", "--credentials-stdin", "--json"],
      cwd,
      env,
      stdin,
      spawnImpl,
      timeoutMs,
      maxOutputBytes
    });
    // The email is a request field the CLI legitimately echoes back, so it can
    // never count as evidence that the password leaked.
    return sanitizeResult(result, [password], undefined, [email]);
  };
}

export function createCodexApiKeyConfiguration({
  command = process.env.OPL_APP_OPL_BIN ?? "opl",
  cwd = process.cwd(),
  env = process.env,
  spawnImpl = spawn,
  timeoutMs = 45_000,
  maxOutputBytes = 65_536
} = {}) {
  return async function configureCodexApiKey(request) {
    if (!isRecord(request) || Object.keys(request).some((field) => field !== "apiKey")) {
      return { ok: false, errorCode: "invalid_request", stateRefreshRequired: false };
    }
    const apiKey = typeof request.apiKey === "string" ? request.apiKey.trim() : "";
    if (!apiKey || Buffer.byteLength(apiKey, "utf8") > 65_536) {
      return { ok: false, errorCode: "invalid_request", stateRefreshRequired: false };
    }
    const result = await commandResult({
      command,
      args: ["system", "configure-codex", "--api-key-stdin", "--json"],
      cwd,
      env,
      stdin: `${apiKey}\n`,
      spawnImpl,
      timeoutMs,
      maxOutputBytes
    });
    return sanitizeResult(result, [apiKey], "codex_configuration_failed");
  };
}

export const gatewayAccountLoginTestApi = { containsSecretField, leakedSecret, sanitizeResult };
