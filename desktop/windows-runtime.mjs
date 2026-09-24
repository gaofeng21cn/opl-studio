import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const DISTRIBUTION = "OPL-Linux";
const USER = "opl";
const BOOTSTRAP = "/opt/opl/bootstrap/";
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const TYPES = new Set(["codex-app-server", "opl-cli"]);
const record = value => value && typeof value === "object" && !Array.isArray(value);
const error = code => Object.assign(new Error(`Existing OPL Windows runtime is unavailable (${code}).`), { code });

export function validateWindowsRuntimeIdentity(value) {
  if (!record(value) || value.schema !== "opl_linux_runtime_inspection.v1" || value.protocol_version !== 1
    || value.logical_distribution !== DISTRIBUTION || value.physical_distribution !== DISTRIBUTION
    || value.guest_user !== USER || value.architecture !== "x86_64" || value.wsl2 !== true
    || value.codex_home !== "/home/opl/.codex" || value.workspace_root !== "/home/opl/code"
    || value.native_windows_executor_fallback_allowed !== false
    || typeof value.guest_install_id !== "string" || !value.guest_install_id.trim()
    || !Number.isSafeInteger(value.distribution_generation) || value.distribution_generation < 1
    || !Number.isSafeInteger(value.active_operation_count) || value.active_operation_count < 0) throw error("wsl_identity_mismatch");
  if (typeof value.codex_path !== "string" || !value.codex_path.startsWith("/opt/opl/carrier/store/sha256/")
    || value.codex_realpath !== value.codex_path || value.codex_command_path !== "/usr/local/bin/codex"
    || value.codex_command_digest !== value.codex_digest
    || typeof value.framework_path !== "string" || !value.framework_path.startsWith("/home/opl/")
    || typeof value.framework_ref !== "string" || !/^[0-9a-f]{40}$/.test(value.framework_ref)
    || ["carrier_activation_digest", "bootstrap_digest", "codex_digest", "codex_command_digest", "framework_digest"]
      .some(field => typeof value[field] !== "string" || !SHA256.test(value[field]))) throw error("wsl_owner_executable_mismatch");
  return value;
}

export function readWindowsRuntimeReceipt(userDataPath, readFile = fs.readFileSync) {
  const file = path.join(userDataPath, "installer", "receipts", "windows-wsl2-ready.json");
  try {
    const bytes = readFile(file);
    const checksum = String(readFile(`${file}.sha256`, "utf8")).trim().split(/\s+/)[0];
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== checksum) throw error("wsl_receipt_digest_mismatch");
    const receipt = JSON.parse(String(bytes));
    if (receipt.schema !== "opl_windows_wsl2_provisioning_receipt.v1" || receipt.status !== "ready"
      || receipt.distribution !== DISTRIBUTION) throw error("wsl_receipt_invalid");
    return validateWindowsRuntimeIdentity(receipt.identity);
  } catch (cause) {
    if (String(cause.code ?? "").startsWith("wsl_")) throw cause;
    throw error("wsl_existing_install_receipt_unavailable");
  }
}

function decode(buffer) {
  if (!Buffer.isBuffer(buffer)) return String(buffer);
  return (buffer.includes(0) ? buffer.toString("utf16le") : buffer.toString("utf8")).replace(/^\uFEFF/, "");
}

function guestArgs(args) { return ["--distribution", DISTRIBUTION, "--user", USER, "--exec", ...args]; }

export function buildWindowsRuntimeCommand(kind, args, token) {
  if (!TYPES.has(kind) || !TOKEN.test(token) || !Array.isArray(args)
    || args.some(arg => typeof arg !== "string" || arg.includes("\0"))) throw error("wsl_execution_request_invalid");
  return guestArgs([`${BOOTSTRAP}opl-runtime-exec`, "--kind", kind, "--operation-token", token, "--", ...args]);
}

// Reuse the existing App-owned guest and its public execution ABI. This adapter
// never provisions, unregisters, globally stops WSL, or copies credential/thread stores.
export function createWindowsRuntime({ userDataPath, env = process.env, spawnImpl = spawn,
  readFile = fs.readFileSync, platform = process.platform, timeoutMs = 30_000 } = {}) {
  if (platform !== "win32") throw error("wsl_wrong_host");
  if (typeof userDataPath !== "string" || !userDataPath) throw error("wsl_user_data_path_missing");
  const executable = path.win32.join(env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows", "System32", "wsl.exe");
  const active = new Map();
  let identity;
  let readyPromise;
  let closing = false;

  const collected = (args, { stdin, timeout = timeoutMs, commandEnv = env, terminate } = {}) => new Promise(resolve => {
    const child = spawnImpl(executable, args, { env: commandEnv, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = [], stderr = [], size = 0, timedOut = false, settled = false;
    const finish = code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: timedOut ? -1 : (code ?? -1), stdout: decode(Buffer.concat(stdout)), stderr: decode(Buffer.concat(stderr)), timedOut });
    };
    const stop = () => terminate ? terminate() : Promise.resolve(child.kill());
    const append = (target, chunk) => {
      const bytes = Buffer.from(chunk); size += bytes.length;
      if (size > 8 * 1024 * 1024) { timedOut = true; void stop().finally(() => finish(-1)); return; }
      target.push(bytes);
    };
    child.stdout.on("data", chunk => append(stdout, chunk));
    child.stderr.on("data", chunk => append(stderr, chunk));
    child.once("error", () => finish(-1));
    child.once("close", finish);
    const timer = setTimeout(() => { timedOut = true; void stop().finally(() => finish(-1)); }, timeout);
    child.stdin?.on("error", () => {});
    child.stdin?.end(stdin);
  });

  const control = async (token, graceMs = 5000) => {
    if (!TOKEN.test(token)) throw error("wsl_operation_token_invalid");
    const result = await collected(guestArgs([`${BOOTSTRAP}opl-runtime-control`, "--operation-token", token,
      "--grace-ms", String(Math.max(0, Math.min(120000, Math.trunc(graceMs))))]), { timeout: 15000 });
    if (result.exitCode !== 0) throw error("wsl_targeted_stop_failed");
  };

  const forwardEnv = source => ({
    ...source,
    // WSL owns HOME/CODEX_HOME. Only non-credential operation correlation and the
    // ephemeral in-process MCP bearer are forwarded, never host auth variables.
    WSLENV: [...new Set([...(source.WSLENV ?? "").split(":").filter(Boolean),
      ...["OPL_APP_PROCESS_INSTANCE_ID", "OPL_STUDIO_DSH_MCP_TOKEN"].filter(key => source[key])])].join(":")
  });

  const runtime = {
    get identity() { return identity; },
    async ensureReady() {
      readyPromise ??= (async () => {
        const receipt = readWindowsRuntimeReceipt(userDataPath, readFile);
        const result = await collected(guestArgs([`${BOOTSTRAP}opl-runtime-inspect`, "--json"]));
        if (result.exitCode !== 0) throw error("wsl_inspection_failed");
        let fresh;
        try { fresh = validateWindowsRuntimeIdentity(JSON.parse(result.stdout)); }
        catch (cause) { if (cause.code) throw cause; throw error("wsl_inspection_invalid"); }
        if (fresh.guest_install_id !== receipt.guest_install_id
          || fresh.distribution_generation !== receipt.distribution_generation) throw error("wsl_foreign_distribution");
        identity = fresh;
        return { status: "available", identity, workspaceRoot: identity.workspace_root };
      })();
      try { return await readyPromise; } catch (cause) { readyPromise = undefined; throw cause; }
    },
    async projectHostPath(hostPath) {
      if (!identity || typeof hostPath !== "string" || !path.win32.isAbsolute(hostPath) || hostPath.includes("\0")) throw error("wsl_path_invalid");
      const result = await collected(guestArgs(["/usr/bin/wslpath", "-a", "-u", hostPath]));
      const projected = result.stdout.trim();
      if (result.exitCode !== 0 || !projected.startsWith("/") || /[\r\n\0]/.test(projected)) throw error("wsl_path_projection_failed");
      return projected;
    },
    async projectGuestPath(guestPath) {
      if (!identity || typeof guestPath !== "string" || !path.posix.isAbsolute(guestPath) || guestPath.includes("\0")) throw error("wsl_path_invalid");
      const result = await collected(guestArgs(["/usr/bin/wslpath", "-a", "-w", guestPath]));
      const projected = result.stdout.trim();
      if (result.exitCode !== 0 || !path.win32.isAbsolute(projected) || /[\r\n\0]/.test(projected)) throw error("wsl_path_projection_failed");
      return projected;
    },
    spawnGuestHost(entry, options = {}) {
      if (!identity || closing || typeof entry !== "string" || !entry.startsWith("/mnt/")
        || !entry.endsWith("/opl-wsl-host/desktop/windows-guest-host.mjs") || /[\r\n\0]/.test(entry)) throw error("wsl_guest_host_entry_invalid");
      // The fixed App-owned entry runs on the existing verified managed Node.
      // Agent and Framework calls remain guest-local public owner interfaces.
      const child = spawnImpl(executable, guestArgs(["/usr/bin/env", "HOME=/home/opl", "CODEX_HOME=/home/opl/.codex",
        "OPL_WORKSPACE_ROOT=/home/opl/code", "/usr/local/bin/node", entry]), {
        ...options, cwd: undefined, env: options.env ?? env, shell: false, windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"], detached: false
      });
      const token = `guest-host-${crypto.randomUUID()}`;
      const stopped = new Promise(resolve => { child.once("close", resolve); child.once("error", resolve); });
      active.set(token, async () => {
        child.stdin.end();
        let timer;
        try {
          await Promise.race([stopped, new Promise((_, reject) => {
            timer = setTimeout(() => reject(error("wsl_guest_host_shutdown_unconfirmed")), 15000);
          })]);
        } finally { clearTimeout(timer); }
      });
      child.once("close", () => active.delete(token));
      child.once("error", () => active.delete(token));
      return child;
    },
    spawn(kind, args, options = {}) {
      if (!identity || closing) throw error("wsl_runtime_not_ready");
      const token = `studio-${crypto.randomUUID()}`;
      const child = spawnImpl(executable, buildWindowsRuntimeCommand(kind, args, token), {
        ...options, cwd: undefined, env: forwardEnv(options.env ?? env), shell: false, windowsHide: true,
        detached: false, stdio: options.stdio ?? ["pipe", "pipe", "pipe"]
      });
      let stopping;
      const stop = graceMs => {
        stopping ??= control(token, graceMs).finally(() => active.delete(token));
        return stopping;
      };
      active.set(token, stop);
      // Existing callers cancel ChildProcess objects; translate to the guest
      // operation token so descendants cannot outlive the Windows wrapper.
      child.kill = signal => { void stop(signal === "SIGKILL" ? 0 : 5000).catch(() => {}); return true; };
      child.once("error", () => active.delete(token));
      child.once("close", () => { void stop(0).catch(() => {}); });
      return child;
    },
    spawnCodex(_command, args, options) { return runtime.spawn("codex-app-server", args, options); },
    spawnOpl(_command, args, options) { return runtime.spawn("opl-cli", args, options); },
    async runOpl(_command, args, options = {}) {
      await runtime.ensureReady();
      if (closing) throw error("wsl_runtime_not_ready");
      const token = `studio-${crypto.randomUUID()}`;
      let stopping;
      const stop = () => stopping ??= control(token).finally(() => active.delete(token));
      active.set(token, stop);
      try {
        return await collected(buildWindowsRuntimeCommand("opl-cli", args, token), {
          stdin: options.stdin, timeout: options.timeoutMs ?? timeoutMs,
          commandEnv: forwardEnv(options.env ?? env), terminate: stop
        });
      } finally { await stop(); }
    },
    async close() {
      closing = true;
      const results = await Promise.allSettled([...active.values()].map(stop => stop(5000)));
      if (results.some(result => result.status === "rejected")) throw error("wsl_targeted_stop_failed");
    }
  };
  return runtime;
}
