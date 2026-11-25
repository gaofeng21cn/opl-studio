import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export class OpldRpcError extends Error {
  constructor(message, { rpcCode = -32000, code = "rpc_error", data } = {}) {
    super(message);
    Object.assign(this, { name: "OpldRpcError", rpcCode, code, data });
  }
}

export function resolveOplStatePaths(env = process.env, explicitStateDir) {
  const homeDir = env.HOME?.trim() || os.homedir();
  const explicit = explicitStateDir?.trim();
  const envState = env.OPL_STATE_DIR?.trim();
  const envData = env.OPL_DATA_DIR?.trim();
  const stateDir = explicit ? path.resolve(explicit)
    : envState ? path.resolve(envState)
    : envData ? path.join(path.resolve(envData), "opl", "state")
    : process.platform === "darwin" ? path.join(homeDir, "Library", "Application Support", "OPL", "state")
    : process.platform === "win32" ? path.join(env.LOCALAPPDATA?.trim() || path.join(homeDir, "AppData", "Local"), "OPL", "state")
    : path.join(env.XDG_STATE_HOME?.trim() || path.join(homeDir, ".local", "state"), "opl");
  const runDir = path.join(stateDir, "run");
  return {
    stateDir, runDir, logsDir: path.join(stateDir, "logs"),
    sessionFile: path.join(runDir, "opld.session.json"),
    fallbackSessionFile: path.join(homeDir, ".opl", "run", "opld.session.json"),
    hasExplicitStateDir: Boolean(explicit || envState),
  };
}

function isExecutable(file) {
  try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; }
}

export function resolveDaemonBinary(env = process.env, explicitBin) {
  const names = process.platform === "win32" ? ["opld.exe", "opld.cmd", "opld"] : ["opld"];
  const candidates = [explicitBin?.trim(), env.OPL_DAEMON_BIN?.trim()].filter(Boolean);
  for (const ref of [env.OPL_APP_OPL_BIN, env.OPL_COMMAND, env.OPL_BIN]) {
    const t = ref?.trim();
    if (t && (path.isAbsolute(t) || t.includes(path.sep))) names.forEach((n) => candidates.push(path.join(path.dirname(t), n)));
  }
  for (const dir of (env.PATH ?? "").split(path.delimiter).filter(Boolean)) names.forEach((n) => candidates.push(path.join(dir, n)));
  return candidates.find(isExecutable) ?? null;
}

function readSession(sessionFile) {
  try {
    if (!fs.existsSync(sessionFile)) return null;
    const raw = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
    if (raw?.pid > 0 && typeof raw.socket_path === "string" && raw.socket_path && /^[0-9a-f]{64}$/i.test(raw.token ?? "")) return raw;
  } catch { /* ignore unreadable/partial session */ }
  return null;
}

function probeSocket(socketPath, timeoutMs = 250) {
  return new Promise((resolve) => {
    if (process.platform !== "win32" && !fs.existsSync(socketPath)) return resolve(false);
    const sock = net.createConnection(socketPath);
    let done = false;
    const finish = (ok) => { if (!done) { done = true; sock.destroy(); resolve(ok); } };
    sock.setTimeout(timeoutMs, () => finish(false));
    sock.once("connect", () => finish(true));
    sock.once("error", () => finish(false));
  });
}

export class OpldClient extends EventEmitter {
  #socket = null;
  #buffer = "";
  #nextId = 1;
  #pending = new Map();
  #connectPromise = null;
  #closed = false;
  #fatalError = null;
  #reconnectDelay = 100;
  #reconnectTimer = null;

  constructor(options = {}) {
    super();
    this.env = options.env ?? process.env;
    this.paths = resolveOplStatePaths(this.env, options.stateDir);
    this.clientKind = options.clientKind ?? "opl_app";
    this.apiVersion = String(options.apiVersion ?? this.env.OPL_BRIDGE_API_VERSION ?? "2.0");
    this.daemonBin = options.daemonBin;
    this.autoStart = options.autoStart !== false && this.env.OPL_DAEMON_AUTO_START !== "0";
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5_000;
    this.connected = false;
    this.serverApiVersion = null;
    this.sessionInfo = null;
  }

  #findSession() { return readSession(this.paths.sessionFile) ?? (!this.paths.hasExplicitStateDir ? readSession(this.paths.fallbackSessionFile) : null); }

  async #ensureSession() {
    const existing = this.#findSession();
    if (existing && await probeSocket(existing.socket_path)) return existing;
    if (!this.autoStart) throw new OpldRpcError("opld daemon is unavailable", { code: "daemon_unavailable" });
    const bin = resolveDaemonBinary(this.env, this.daemonBin);
    if (!bin) throw new OpldRpcError("opld binary not found", { code: "daemon_not_found" });
    fs.mkdirSync(this.paths.runDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.paths.logsDir, { recursive: true, mode: 0o700 });
    const logFd = fs.openSync(path.join(this.paths.logsDir, "opld.log"), "a", 0o600);
    let childExit = null;
    const child = spawn(bin, [], { cwd: this.paths.stateDir, env: { ...this.env, OPL_STATE_DIR: this.paths.stateDir }, detached: true, stdio: ["ignore", logFd, logFd], windowsHide: true });
    child.once("exit", (code) => { childExit = code ?? 1; });
    child.unref();
    fs.closeSync(logFd);
    for (let deadline = Date.now() + this.connectTimeoutMs, delay = 25; Date.now() < deadline; delay = Math.min(100, delay * 2)) {
      const sess = this.#findSession();
      if (sess && await probeSocket(sess.socket_path, 250)) return sess;
      if (childExit !== null && childExit !== 0) {
        const raced = this.#findSession();
        if (raced && await probeSocket(raced.socket_path, 250)) return raced;
        throw new OpldRpcError(`Detached opld exited with code ${childExit}`, { code: "DAEMON_START_FAILED" });
      }
      await new Promise((r) => setTimeout(r, delay));
    }
    throw new OpldRpcError("Timed out waiting for opld readiness", { code: "DAEMON_START_TIMEOUT" });
  }

  #onLine(line) {
    if (!line.trim()) return;
    let frame;
    try { frame = JSON.parse(line); } catch { return; }
    if (!frame || typeof frame !== "object") return;
    if (frame.id !== undefined && frame.id !== null) {
      const entry = this.#pending.get(frame.id);
      if (!entry) return;
      this.#pending.delete(frame.id);
      clearTimeout(entry.timer);
      if (frame.error) entry.reject(new OpldRpcError(frame.error.message ?? "RPC error", { rpcCode: frame.error.code ?? -32000, code: frame.error.data?.code ?? "rpc_error", data: frame.error.data }));
      else entry.resolve(frame.result);
    } else if (typeof frame.method === "string") this.emit("event", { method: frame.method, params: frame.params ?? {}, raw: frame });
  }

  #sendRaw(socket, method, params, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!socket || socket.destroyed) return reject(new OpldRpcError("Socket not connected", { code: "connection_closed" }));
      const id = this.#nextId++;
      const timer = setTimeout(() => { this.#pending.delete(id); reject(new OpldRpcError(`RPC timeout calling ${method}`, { code: "rpc_timeout" })); }, timeoutMs);
      timer.unref?.();
      this.#pending.set(id, { resolve, reject, timer });
      socket.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  #rejectPending(err) { for (const [id, entry] of this.#pending) { clearTimeout(entry.timer); entry.reject(err); this.#pending.delete(id); } }

  #scheduleReconnect() {
    if (this.#closed || this.#fatalError || this.#reconnectTimer) return;
    const delay = this.#reconnectDelay;
    this.#reconnectDelay = Math.min(5_000, delay * 2);
    this.#reconnectTimer = setTimeout(() => { this.#reconnectTimer = null; this.connect().catch(() => {}); }, delay);
    this.#reconnectTimer.unref?.();
  }

  async #doConnect() {
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    const sess = await this.#ensureSession();
    const sock = net.createConnection(sess.socket_path);
    await new Promise((resolve, reject) => { sock.once("connect", resolve); sock.once("error", reject); });
    this.#socket = sock;
    this.#buffer = "";
    let handshaked = false;
    sock.setEncoding("utf8");
    sock.on("data", (chunk) => {
      this.#buffer += chunk;
      for (let idx = this.#buffer.indexOf("\n"); idx !== -1; idx = this.#buffer.indexOf("\n")) {
        const line = this.#buffer.slice(0, idx);
        this.#buffer = this.#buffer.slice(idx + 1);
        this.#onLine(line);
      }
    });
    sock.on("error", () => {});
    sock.on("close", () => {
      if (this.#socket === sock) this.#socket = null;
      this.connected = false;
      this.#rejectPending(new OpldRpcError("opld connection closed", { code: "connection_closed" }));
      if (handshaked) this.#scheduleReconnect();
    });
    try {
      const hs = await this.#sendRaw(sock, "daemon.handshake", { token: sess.token, client_kind: this.clientKind, api_version: this.apiVersion }, this.connectTimeoutMs);
      const serverVer = String(hs?.api_version ?? sess.api_version ?? "2.0");
      if (serverVer.split(".")[0] !== this.apiVersion.split(".")[0]) {
        throw new OpldRpcError(`Incompatible api_version '${this.apiVersion}'; base_upgrade_required`, {
          rpcCode: -32002, code: "base_upgrade_required",
          data: { code: "base_upgrade_required", expected_major: Number(serverVer.split(".")[0]) || 2, received_api_version: this.apiVersion },
        });
      }
      handshaked = true; this.connected = true; this.serverApiVersion = serverVer; this.sessionInfo = hs; this.#reconnectDelay = 100;
      return hs;
    } catch (err) {
      if (err?.rpcCode === -32002 || err?.code === "base_upgrade_required") this.#fatalError = err;
      sock.destroy();
      throw err;
    }
  }

  async connect() {
    if (this.#fatalError) throw this.#fatalError;
    if (this.#closed) throw new OpldRpcError("OpldClient is closed", { code: "client_closed" });
    if (this.connected && this.#socket && !this.#socket.destroyed) return this.sessionInfo;
    this.#connectPromise ??= this.#doConnect().finally(() => { this.#connectPromise = null; });
    return this.#connectPromise;
  }

  async call(method, params = {}, timeoutMs = this.requestTimeoutMs) {
    await this.connect();
    return this.#sendRaw(this.#socket, method, params, timeoutMs);
  }

  async close() {
    this.#closed = true;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#rejectPending(new OpldRpcError("OpldClient closed", { code: "client_closed" }));
    this.connected = false;
    if (this.#socket) { this.#socket.destroy(); this.#socket = null; }
  }
}
