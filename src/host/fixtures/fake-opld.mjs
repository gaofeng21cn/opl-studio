import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export async function startFakeOpld({ apiVersion = "2.0", onCall = async () => ({}), onHandshake } = {}) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "opl-rpc-"));
  const runDir = path.join(stateDir, "run");
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const socketPath = process.platform === "win32"
    ? `\\\\.\\pipe\\opld-${crypto.randomBytes(6).toString("hex")}`
    : path.join(runDir, "opld.sock");
  const sessionFile = path.join(runDir, "opld.session.json");
  const token = crypto.randomBytes(32).toString("hex");
  const sockets = new Set();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding("utf8");
    let buf = "";
    let handshaked = false;
    let clientKind = "opl_app";
    const sessionId = `sess-${crypto.randomUUID()}`;

    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.on("data", (chunk) => {
      buf += chunk;
      for (let idx = buf.indexOf("\n"); idx !== -1; idx = buf.indexOf("\n")) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let frame;
        try { frame = JSON.parse(line); } catch { continue; }
        const { id, method, params = {} } = frame ?? {};
        const send = (payload) => { if (!socket.destroyed && socket.writable) socket.write(`${JSON.stringify({ jsonrpc: "2.0", id, ...payload })}\n`); };

        if (method === "daemon.handshake") {
          if (params?.token !== token) {
            send({ error: { code: -32001, message: "Unauthorized", data: { code: "UNAUTHORIZED" } } });
            socket.destroy();
            return;
          }
          handshaked = true;
          clientKind = params?.client_kind ?? "opl_app";
          Promise.resolve(onHandshake ? onHandshake(params, { sessionId, clientKind }) : {
            session_id: sessionId,
            api_version: apiVersion,
            base_version: "0.3.26",
            reload_capabilities: ["none", "renderer_reload", "restart_required"]
          }).then((result) => send({ result })).catch((err) => send({
            error: { code: err?.rpcCode ?? -32000, message: err?.message ?? "Handshake failed", data: { code: err?.code ?? "rpc_error", ...err?.data } }
          }));
          continue;
        }
        if (!handshaked) {
          send({ error: { code: -32001, message: "Handshake required", data: { code: "HANDSHAKE_REQUIRED" } } });
          continue;
        }
        Promise.resolve(onCall(method, params, { clientKind, sessionId, socket, token }))
          .then((result) => {
            if (result && typeof result === "object" && result.__rpcError) send({ error: result.__rpcError });
            else send({ result: result ?? {} });
          })
          .catch((err) => send({
            error: { code: err?.rpcCode ?? -32000, message: err?.message ?? "RPC error", data: { code: err?.code ?? "rpc_error", ...err?.data } }
          }));
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  if (process.platform !== "win32") fs.chmodSync(socketPath, 0o600);
  fs.writeFileSync(sessionFile, JSON.stringify({ pid: process.pid, socket_path: socketPath, token, api_version: apiVersion }), { mode: 0o600 });

  return {
    stateDir,
    runDir,
    sessionFile,
    socketPath,
    token,
    env: { ...process.env, OPL_STATE_DIR: stateDir },
    emitEvent(method, params = {}) {
      const payload = `${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`;
      for (const s of sockets) if (!s.destroyed && s.writable) s.write(payload);
    },
    dropSockets() {
      for (const s of sockets) s.destroy();
    },
    async close() {
      for (const s of sockets) s.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  };
}
