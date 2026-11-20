import { spawn } from "node:child_process";

function boundedTimeout(value, fallback) {
  const normalized = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(normalized) || normalized < 100 || normalized > 120_000) {
    throw new Error("readStateTimeoutMs must be an integer from 100 through 120000");
  }
  return normalized;
}

function run(command, args, { cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    const terminate = (signal) => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch { /* The command may already have exited. */ }
    };
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceTimer;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate("SIGTERM");
      forceTimer = setTimeout(() => terminate("SIGKILL"), 2_000);
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(forceTimer);
      resolve({ exitCode: -1, stdout, stderr: `${stderr}${error.message}`, timedOut: false });
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      clearTimeout(forceTimer);
      resolve({ exitCode: timedOut ? -1 : (code ?? -1), stdout, stderr, timedOut });
    });
  });
}

function commandReadback(args, result) {
  return {
    command: args.join(" "),
    commandArgs: args.slice(1),
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut
  };
}

// Confirmation and receipt fields belong to the Studio bridge envelope. They
// are not part of ordinary App action payloads (which are validated strictly
// by Framework); package contribution execution is handled separately above.
function frameworkActionPayload(payload) {
  const { confirmed, confirmationId, receiptId, rollbackRef, ...fields } = payload;
  return fields;
}

function jsonValue(value) {
  if (!value.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function boundedReadback(args, result) {
  return {
    ...commandReadback(args, result),
    stdout: "",
    stdoutBytes: Buffer.byteLength(result.stdout),
    stdoutOmittedFromGuiProjection: true
  };
}

export {
  boundedReadback,
  boundedTimeout,
  commandReadback,
  frameworkActionPayload,
  jsonValue,
  run
};
