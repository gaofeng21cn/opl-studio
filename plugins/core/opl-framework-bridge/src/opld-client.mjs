import { spawn } from "node:child_process"; import { EventEmitter } from "node:events"; import fs from "node:fs"; import net from "node:net"; import os from "node:os"; import path from "node:path";
// A lost response does not tell us whether the daemon committed the request.
const replayableReads = new Set([
  "daemon.health", "daemon.info", "daemon.doctor", "app.state.get", "app.initialize.get",
  "app.operatorDrilldown.get", "app.domainDetail.get", "ledger.timeline", "runway.task.list", "pack.list", "pack.inspect", "connect.list",
]);
const codexGatewayMethods = new Set(["login", "repair", "disconnect", "completeSetup", "useForModelAccess"]);
const codexGatewayActions = new Set(["gateway_account_complete_setup", "gateway_account_repair", "gateway_account_disconnect", "gateway_account_use_for_model_access"]);

function writesCodexProfile(method, params) {
  if (method === "connect.configureCodexApiKey") return true;
  if (method.startsWith("connect.gateway.")) return codexGatewayMethods.has(method.slice("connect.gateway.".length));
  return method === "app.action.execute" && !params.dry_run && codexGatewayActions.has(params.action_id);
}

export class OpldRpcError extends Error {
  constructor(message, { rpcCode = -32000, code = "rpc_error", data } = {}) { super(message); Object.assign(this, { name: "OpldRpcError", rpcCode, code, data }); }
}

export function resolveOplStatePaths(env = process.env, explicitStateDir) {
  const home = env.HOME?.trim() || os.homedir(), explicit = explicitStateDir?.trim(), envState = env.OPL_STATE_DIR?.trim(), envData = env.OPL_DATA_DIR?.trim();
  const stateDir = explicit ? path.resolve(explicit) : envState ? path.resolve(envState) : envData ? path.join(path.resolve(envData), "opl", "state")
    : process.platform === "darwin" ? path.join(home, "Library", "Application Support", "OPL", "state")
    : process.platform === "win32" ? path.join(env.LOCALAPPDATA?.trim() || path.join(home, "AppData", "Local"), "OPL", "state")
    : path.join(env.XDG_STATE_HOME?.trim() || path.join(home, ".local", "state"), "opl");
  const runDir = path.join(stateDir, "run");
  return { stateDir, runDir, logsDir: path.join(stateDir, "logs"), sessionFile: path.join(runDir, "opld.session.json"), fallbackSessionFile: path.join(home, ".opl", "run", "opld.session.json"), hasExplicitStateDir: Boolean(explicit || envState || envData) };
}

function isExecutable(file) { try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; } }
function isPidAlive(pid) { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e?.code === "EPERM"; } }
const closedErr = () => new OpldRpcError("OpldClient is closed", { code: "client_closed" });

export function resolveDaemonBinary(env = process.env, explicitBin) {
  const names = process.platform === "win32" ? ["opld.exe", "opld.cmd", "opld"] : ["opld"];
  const candidates = [explicitBin?.trim(), env.OPL_DAEMON_BIN?.trim()].filter(Boolean);
  for (const ref of [env.OPL_APP_OPL_BIN, env.OPL_COMMAND, env.OPL_BIN]) { const t = ref?.trim(); if (t && (path.isAbsolute(t) || t.includes(path.sep))) names.forEach((n) => candidates.push(path.join(path.dirname(t), n))); }
  for (const dir of (env.PATH ?? "").split(path.delimiter).filter(Boolean)) names.forEach((n) => candidates.push(path.join(dir, n)));
  return candidates.find(isExecutable) ?? null;
}

function readSession(sessionFile) {
  try {
    const raw = fs.existsSync(sessionFile) ? JSON.parse(fs.readFileSync(sessionFile, "utf8")) : null;
    if (raw?.pid > 0 && typeof raw.socket_path === "string" && raw.socket_path && /^[0-9a-f]{64}$/i.test(raw.token ?? "")) return raw;
  } catch {}
  return null;
}
function probeSocket(socketPath, timeoutMs = 250) {
  return new Promise((resolve) => {
    if (process.platform !== "win32" && !fs.existsSync(socketPath)) return resolve(false);
    const sock = net.createConnection(socketPath); let done = false;
    const finish = (ok) => { if (!done) { done = true; sock.destroy(); resolve(ok); } };
    sock.setTimeout(timeoutMs, () => finish(false)).once("connect", () => finish(true)).once("error", () => finish(false));
  });
}

export class OpldClient extends EventEmitter {
  #socket = null; #buffer = ""; #nextId = 1; #pending = new Map();
  #connectPromise = null; #closed = false; #fatalError = null; #reconnectDelay = 100; #reconnectTimer = null;

  constructor(options = {}) {
    super();
    const env = options.env ?? process.env;
    this.codexHome = path.resolve(env.CODEX_HOME?.trim() || path.join(env.HOME?.trim() || os.homedir(), ".codex"));
    Object.assign(this, { env, paths: resolveOplStatePaths(env, options.stateDir), clientKind: options.clientKind ?? "opl_app", apiVersion: String(options.apiVersion ?? env.OPL_BRIDGE_API_VERSION ?? "2.0"), daemonBin: options.daemonBin, autoStart: options.autoStart !== false && env.OPL_DAEMON_AUTO_START !== "0", requestTimeoutMs: options.requestTimeoutMs ?? 30_000, connectTimeoutMs: options.connectTimeoutMs ?? 5_000, connected: false, serverApiVersion: null, sessionInfo: null });
  }

  #findSession() { return readSession(this.paths.sessionFile) ?? (!this.paths.hasExplicitStateDir ? readSession(this.paths.fallbackSessionFile) : null); }
  #guardOpen() { if (this.#closed) throw closedErr(); }

  async #ensureSession() {
    this.#guardOpen();
    const existing = this.#findSession();
    if (existing && isPidAlive(existing.pid) && await probeSocket(existing.socket_path)) return existing;
    this.#guardOpen();
    if (!this.autoStart) throw new OpldRpcError("opld daemon is unavailable", { code: "daemon_unavailable" });
    const bin = resolveDaemonBinary(this.env, this.daemonBin);
    if (!bin) throw new OpldRpcError("opld binary not found", { code: "daemon_not_found" });
    for (const d of [this.paths.runDir, this.paths.logsDir]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    const logFd = fs.openSync(path.join(this.paths.logsDir, "opld.log"), "a", 0o600);
    let childExit = null;
    const child = spawn(bin, [], { cwd: this.paths.stateDir, env: { ...this.env, OPL_STATE_DIR: this.paths.stateDir }, detached: true, stdio: ["ignore", logFd, logFd], windowsHide: true });
    child.once("exit", (code) => { childExit = code ?? 1; }).unref();
    fs.closeSync(logFd);
    try {
      for (let deadline = Date.now() + this.connectTimeoutMs, delay = 25; Date.now() < deadline; delay = Math.min(100, delay * 2)) {
        this.#guardOpen();
        const sess = this.#findSession(), ok = sess && isPidAlive(sess.pid) && await probeSocket(sess.socket_path, 250);
        this.#guardOpen(); if (ok) return sess;
        if (childExit !== null && childExit !== 0) {
          const r = this.#findSession();
          if (r && isPidAlive(r.pid) && await probeSocket(r.socket_path, 250)) { this.#guardOpen(); return r; }
          throw new OpldRpcError(`Detached opld exited with code ${childExit}`, { code: "DAEMON_START_FAILED" });
        }
        await new Promise((r) => setTimeout(r, delay));
      }
      throw new OpldRpcError("Timed out waiting for opld readiness", { code: "DAEMON_START_TIMEOUT" });
    } catch (err) {
      if ((this.#closed || err?.code === "DAEMON_START_TIMEOUT") && childExit === null && child.pid > 0) {
        try { process.kill(child.pid, "SIGTERM"); } catch {}
        for (let i = 0; i < 10 && childExit === null && isPidAlive(child.pid); i += 1) await new Promise((r) => setTimeout(r, 25));
        if (childExit === null && isPidAlive(child.pid)) try { process.kill(child.pid, "SIGKILL"); } catch {}
      }
      throw err;
    }
  }

  #onLine(line) {
    if (!line.trim()) return;
    let frame; try { frame = JSON.parse(line); } catch { return; }
    if (!frame || typeof frame !== "object") return;
    if (frame.id !== undefined && frame.id !== null) {
      const entry = this.#pending.get(frame.id);
      if (!entry) return;
      this.#pending.delete(frame.id); clearTimeout(entry.timer);
      if (frame.error) entry.reject(new OpldRpcError(frame.error.message ?? "RPC error", { rpcCode: frame.error.code ?? -32000, code: frame.error.data?.code ?? "rpc_error", data: frame.error.data }));
      else entry.resolve(frame.result);
    } else if (typeof frame.method === "string") this.emit("event", { method: frame.method, params: frame.params ?? {}, raw: frame });
  }

  #sendRaw(socket, method, params, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!socket || socket.destroyed || socket.writableEnded) return reject(new OpldRpcError("Socket not connected", { code: "connection_closed" }));
      const id = this.#nextId++;
      const timer = setTimeout(() => { this.#pending.delete(id); reject(new OpldRpcError(`RPC timeout calling ${method}`, { code: "rpc_timeout" })); }, timeoutMs);
      timer.unref?.();
      this.#pending.set(id, { resolve, reject, timer, socket });
      socket.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  #rejectPending(err, sock) {
    for (const [id, entry] of this.#pending) if (!sock || entry.socket === sock) { clearTimeout(entry.timer); entry.reject(err); this.#pending.delete(id); }
  }

  #scheduleReconnect() {
    if (this.#closed || this.#fatalError || this.#reconnectTimer) return;
    const delay = this.#reconnectDelay; this.#reconnectDelay = Math.min(5_000, delay * 2);
    this.#reconnectTimer = setTimeout(() => { this.#reconnectTimer = null; this.connect().catch(() => {}); }, delay);
    this.#reconnectTimer.unref?.();
  }

  async #doConnect() {
    clearTimeout(this.#reconnectTimer); this.#reconnectTimer = null;
    for (let deadline = Date.now() + this.connectTimeoutMs; ;) {
      this.#guardOpen();
      const sess = await this.#ensureSession();
      this.#guardOpen();
      const sock = net.createConnection(sess.socket_path);
      let handshaked = false;
      try {
        await new Promise((resolve, reject) => { sock.once("connect", () => { sock.off("error", reject); resolve(); }).once("error", reject); });
        this.#guardOpen();
        this.#socket = sock; this.#buffer = "";
        sock.setEncoding("utf8").on("data", (chunk) => {
          this.#buffer += chunk;
          for (let idx = this.#buffer.indexOf("\n"); idx !== -1; idx = this.#buffer.indexOf("\n")) {
            this.#onLine(this.#buffer.slice(0, idx)); this.#buffer = this.#buffer.slice(idx + 1);
          }
        }).on("error", () => {}).on("close", () => {
          if (this.#socket === sock) { this.#socket = null; this.connected = false; }
          this.#rejectPending(new OpldRpcError("opld connection closed", { code: "connection_closed" }), sock);
          if (handshaked && !this.#closed) this.#scheduleReconnect();
        });
        const profile = this.clientKind === "opl_app" ? { codex_home: this.codexHome } : {};
        const hs = await this.#sendRaw(sock, "daemon.handshake", { token: sess.token, client_kind: this.clientKind, api_version: this.apiVersion, ...profile }, Math.max(500, deadline - Date.now()));
        this.#guardOpen();
        const serverVer = String(hs?.api_version ?? sess.api_version ?? "2.0");
        if (serverVer.split(".")[0] !== this.apiVersion.split(".")[0]) throw new OpldRpcError(`Incompatible api_version '${this.apiVersion}'; base_upgrade_required`, { rpcCode: -32002, code: "base_upgrade_required", data: { code: "base_upgrade_required", expected_major: Number(serverVer.split(".")[0]) || 2, received_api_version: this.apiVersion } });
        handshaked = true; this.connected = true; this.serverApiVersion = serverVer; this.sessionInfo = hs; this.#reconnectDelay = 100;
        return hs;
      } catch (err) {
        if (this.#socket === sock) { this.#socket = null; this.connected = false; }
        sock.destroy();
        if (err?.rpcCode === -32002 || err?.code === "base_upgrade_required") { this.#fatalError = err; throw err; }
        this.#guardOpen();
        const transient = ["connection_closed", "ECONNRESET", "EPIPE", "ECONNREFUSED", "ENOENT"].includes(err?.code);
        const f = err?.rpcCode === -32001 && this.autoStart ? this.#findSession() : null;
        const staleToken = err?.rpcCode === -32001 && this.autoStart && (!isPidAlive(sess.pid) || (f && (f.pid !== sess.pid || f.token !== sess.token)));
        if ((transient || staleToken) && this.autoStart && !this.#fatalError && Date.now() + 25 < deadline) { await new Promise((r) => setTimeout(r, 25)); continue; }
        throw err;
      }
    }
  }

  async connect() {
    if (this.#fatalError) throw this.#fatalError;
    this.#guardOpen();
    if (this.connected && this.#socket && !this.#socket.destroyed && !this.#socket.writableEnded && this.#socket.writable) return this.sessionInfo;
    return (this.#connectPromise ??= this.#doConnect().finally(() => { this.#connectPromise = null; }));
  }

  async call(method, params = {}, timeoutMs = this.requestTimeoutMs) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (this.#socket && (this.#socket.destroyed || this.#socket.writableEnded || !this.#socket.writable)) { this.#socket.destroy(); this.#socket = null; this.connected = false; }
      const session = await this.connect();
      const socket = this.#socket;
      try {
        if (this.clientKind === "opl_app" && writesCodexProfile(method, params) && session.codex_home !== this.codexHome) {
          // Older daemons report their effective config file through the trusted App projection.
          const state = session.codex_home ? null : await this.#sendRaw(socket, "app.state.get", { profile: "fast" }, timeoutMs);
          const policy = state?.app_state?.settings_control_center?.app_settings_read_model?.codex_model_policy;
          if (policy?.config_path !== path.join(this.codexHome, "config.toml")) {
            throw new OpldRpcError("The daemon does not serve the selected Codex profile.", { code: "gateway_configuration_invalid" });
          }
        }
        return await this.#sendRaw(socket, method, params, timeoutMs);
      }
      catch (err) {
        if (attempt > 0 || err?.code !== "connection_closed" || this.#closed || this.#fatalError || !this.autoStart || !replayableReads.has(method)) throw err;
        this.#socket?.destroy(); this.#socket = null; this.connected = false;
      }
    }
  }

  async close() {
    this.#closed = true; clearTimeout(this.#reconnectTimer); this.#reconnectTimer = null;
    this.#rejectPending(closedErr()); this.connected = false;
    if (this.#socket) { this.#socket.destroy(); this.#socket = null; }
    await this.#connectPromise?.catch(() => {});
  }
}
