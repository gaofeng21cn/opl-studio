import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { EventEmitter, once } from "node:events";
import { mkdtemp, readFile, rm, writeFile, symlink, copyFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createLinkCompanion } from "../../plugins/core/opl-host-core/src/link-companion.mjs";
import { LinkLoopback, LINK_VIRTUAL_PORT } from "../../plugins/core/opl-host-core/src/link-loopback.mjs";
import { createThreadWorkspaceService } from "../../plugins/core/opl-host-core/src/thread-workspace-service.mjs";
import { createLinkInternet, authorizeLinkHost } from "../../plugins/core/opl-host-core/src/link-internet.mjs";
import { createLinkTransportEvidence } from "../../plugins/core/opl-host-core/src/link-transport-evidence.mjs";

async function fixture(t, { now } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-link-remote-test-"));
  const calls = [];
  const threads = { readThread: async ({ threadId }) => ({ thread: { id: threadId, cwd: root } }) };
  const transport = { cwd: root, resumeThread: async () => {}, startThread: async () => ({ thread: { id: "new-thread" } }), startTurn: async (...args) => { calls.push(args); return { turn: { id: `turn-${calls.length}` } }; } };
  const core = Object.assign(new EventEmitter(), { threads, transport, invoke: async (method, payload) => ({ method, payload }) });
  core.threadWorkspace = createThreadWorkspaceService({ threads });
  const revocations = [];
  const internet = { status: () => ({ status: "ready" }), revoke: async id => { revocations.push(id); }, createInvitation: async () => ({ serverUrl: "https://link.medopl.com", accountScope: "s".repeat(43), hostDeviceId: crypto.randomUUID(), hostIdentityKey: crypto.randomBytes(32).toString("base64url"), enrollmentToken: "test-enrollment", expiresAt: (now?.() ?? Date.now()) + 120_000 }) };
  const service = await createLinkCompanion({ hostCore: core, env: { OPL_DATA_DIR: root }, internet, heartbeatMs: 15, now });
  const loops = [];
  function peer(id = crypto.randomUUID()) {
    const context = { connectionId: crypto.randomUUID(), peerDeviceId: id, peerIdentityKey: crypto.randomBytes(32).toString("base64url") };
    const loop = new LinkLoopback({ context, handle: (...args) => service.handleAuthenticatedPeer(...args) }); loops.push(loop); return loop;
  }
  t.after(async () => { for (const loop of loops) loop.closeAll(); await service.close(); await rm(root, { recursive: true, force: true }); });
  return { root, service, peer, core, calls, revocations, internet };
}
async function http(loop, route, { method = "GET", body, token, headers = [] } = {}) {
  const id = crypto.randomUUID();
  const head = await loop.call({ op: "http.open", id, port: LINK_VIRTUAL_PORT, path: route, method,
    headers: [...headers, ...(token ? [["authorization", `Bearer ${token}`]] : []), ...(body ? [["content-type", "application/json"]] : [])],
    ...(body ? { body: Buffer.from(JSON.stringify(body)).toString("base64") } : {}) });
  const chunks = [];
  for (;;) { const next = await loop.call({ op: "http.read", id }); if (next.data) chunks.push(Buffer.from(next.data, "base64")); if (next.done) break; }
  const bytes = Buffer.concat(chunks); let json; try { json = JSON.parse(bytes); } catch {}
  return { ...head, headers: Object.fromEntries(head.headers), bytes, json };
}
async function pair(service, loop) { const pairing = await service.createPairing(); const response = await http(loop, "/api/link/claim", { method: "POST", body: { code: pairing.code, deviceName: "Test iPhone" } }); assert.equal(response.status, 200); return { pairing, ...response.json }; }

test("account claim requires a current relay grant for the authenticated phone key", async t => {
  const { service, peer, internet } = await fixture(t);
  let enabled = true;
  let trusted;
  internet.isRemoteAccessEnabled = () => enabled;
  internet.verifyAccountGrant = async context => {
    trusted ??= context.peerIdentityKey;
    if (context.peerIdentityKey !== trusted) throw Object.assign(new Error("phone key rejected"), { status: 403 });
  };
  const id = crypto.randomUUID();
  const phone = peer(id);
  const claim = loop => http(loop, "/api/link/account/claim", { method: "POST", body: { deviceName: "Test iPhone" } });
  const first = await claim(phone);
  assert.equal(first.status, 200);
  assert.equal((await http(phone, "/api/link/bootstrap", { token: first.json.token })).status, 200);
  assert.notEqual((await claim(peer(id))).status, 200);
  enabled = false;
  assert.equal((await http(phone, "/api/link/bootstrap", { token: first.json.token })).status, 401);
  enabled = true;
  await service.revokeDevice({ id: first.json.device.id });
  assert.equal((await claim(phone)).status, 403);
});

test("authenticated virtual HTTP confines targets, management, peer credentials and stream handles", async t => {
  const { service, peer, core } = await fixture(t); const loop = peer(); const second = peer();
  const claim = await pair(service, loop);
  assert.match(claim.pairing.hostFingerprint, /^(?:[A-F0-9]{4} ){3}[A-F0-9]{4}$/);
  assert.equal((await http(loop, "/api/link/bootstrap", { token: claim.token })).json.cwd, core.transport.cwd);
  assert.equal((await http(second, "/api/link/bootstrap", { token: claim.token })).status, 401);
  for (const target of ["/api/opl/state", "/api/link/../opl/state", "/api/link/pair", "/api/link/devices"]) await assert.rejects(loop.call({ op: "http.open", id: crypto.randomUUID(), port: LINK_VIRTUAL_PORT, path: target, method: "GET", headers: [] }));
  await assert.rejects(loop.call({ op: "http.open", id: crypto.randomUUID(), port: 1234, path: "/api/link/bootstrap", method: "GET", headers: [] }));
  await assert.rejects(loop.call({ op: "http.open", id: crypto.randomUUID(), port: LINK_VIRTUAL_PORT, path: "/api/link/bootstrap", method: "GET", headers: [["x-forwarded-proto", "https"]] }));
  const id = crypto.randomUUID(); const opened = await loop.call({ op: "http.open", id, port: LINK_VIRTUAL_PORT, path: "/api/link/events", method: "GET", headers: [["authorization", `Bearer ${claim.token}`]] }); assert.equal(opened.status, 200);
  assert.match(Buffer.from((await loop.call({ op: "http.read", id })).data, "base64").toString(), /host\/ready/);
  await assert.rejects(second.call({ op: "http.read", id }));
  core.emit("event", { method: "item/agentMessage/delta", params: { delta: "same owner" } });
  assert.match(Buffer.from((await loop.call({ op: "http.read", id })).data, "base64").toString(), /same owner/);
  await service.revokeDevice({ id: claim.device.id });
  assert.equal((await http(loop, "/api/link/bootstrap", { token: claim.token })).status, 401);
});

test("chunk receipts are byte-idempotent, device/thread scoped and staged into the same canonical turn", async t => {
  const { service, peer, calls } = await fixture(t); const loop = peer(); const second = peer();
  const claim = await pair(service, loop); const other = await pair(service, second);
  const bytes = crypto.randomBytes(512 * 1024 + 13); const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const payload = { requestId: crypto.randomUUID(), threadId: "thread-a", name: "sample.pdf", mimeType: "application/pdf", size: bytes.length, sha256 };
  const reversed = Object.fromEntries(Object.entries(payload).reverse());
  const [created, concurrent] = await Promise.all([payload, reversed].map(body => http(loop, "/api/link/uploads", { method: "POST", body, token: claim.token })));
  assert.equal(created.status, 200); assert.equal(concurrent.status, 200); assert.equal(concurrent.json.id, created.json.id);
  const id = created.json.id; assert.equal(created.json.status, "uploading");
  assert.equal((await http(loop, "/api/link/uploads", { method: "POST", body: payload, token: claim.token })).json.id, id);
  assert.equal((await http(second, `/api/link/uploads/${id}`, { token: other.token })).status, 404);
  const first = { offset: 0, base64: bytes.subarray(0, 512 * 1024).toString("base64") };
  assert.equal((await http(loop, `/api/link/uploads/${id}`, { method: "PUT", token: claim.token, body: first })).json.receivedBytes, 512 * 1024);
  assert.equal((await http(loop, `/api/link/uploads/${id}`, { method: "PUT", token: claim.token, body: first })).json.receivedBytes, 512 * 1024);
  assert.equal((await http(loop, `/api/link/uploads/${id}`, { method: "PUT", token: claim.token, body: { offset: 0, base64: Buffer.from("changed").toString("base64") } })).status, 409);
  const ready = await http(loop, `/api/link/uploads/${id}`, { method: "PUT", token: claim.token, body: { offset: 512 * 1024, base64: bytes.subarray(512 * 1024).toString("base64") } }); assert.equal(ready.json.status, "ready");
  const invoke = threadId => http(loop, "/api/link/invoke", { method: "POST", token: claim.token, body: { requestId: crypto.randomUUID(), method: "startTurn", payload: { threadId, prompt: "Read this", attachments: [{ uploadId: id }] } } });
  assert.equal((await invoke("thread-b")).status, 403); assert.equal(calls.length, 0);
  const accepted = await invoke("thread-a"); assert.equal(accepted.status, 200); assert.equal(calls[0][0], "thread-a");
  assert.deepEqual(await readFile(calls[0][2][0].path), bytes);
  const removed = await http(loop, `/api/link/uploads/${id}`, { method: "DELETE", token: claim.token }); assert.equal(removed.json.removed, true);
});

test("downloads use bounded canonical ranges and reject changed versions or symlink escapes", async t => {
  const { root, service, peer } = await fixture(t); const loop = peer(); const claim = await pair(service, loop);
  const bytes = crypto.randomBytes(512 * 1024 + 20); await writeFile(path.join(root, "result.bin"), bytes);
  const route = "/api/link/download?threadId=thread-a&relativePath=result.bin&length=524288";
  const first = await http(loop, `${route}&offset=0`, { token: claim.token }); assert.equal(first.status, 200); assert.deepEqual(first.bytes, bytes.subarray(0, 512 * 1024)); assert.ok(first.headers.etag);
  assert.equal((await http(loop, `${route}&offset=524288`, { token: claim.token })).status, 412);
  const end = await http(loop, `${route}&offset=524288`, { token: claim.token, headers: [["if-match", first.headers.etag]] }); assert.equal(end.status, 200); assert.deepEqual(end.bytes, bytes.subarray(512 * 1024)); assert.equal(end.headers["x-opl-file-eof"], "true");
  await writeFile(path.join(root, "result.bin"), Buffer.from("changed"));
  assert.equal((await http(loop, `${route}&offset=524288`, { token: claim.token, headers: [["if-match", first.headers.etag]] })).status, 412);
  assert.equal((await http(loop, "/api/link/download?threadId=thread-a&relativePath=../outside&offset=0&length=1", { token: claim.token })).status, 400);
  await symlink("/etc/hosts", path.join(root, "outside"));
  assert.equal((await http(loop, "/api/link/download?threadId=thread-a&relativePath=outside&offset=0&length=1", { token: claim.token })).status, 403);
});

test("carrier refuses mismatched enrollment identity before persisting or opening a socket", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-link-identity-test-")); let sockets = 0;
  const carrier = await createLinkInternet({ env: { OPL_DATA_DIR: root }, handle: () => {}, authorize: async ({ device }) => ({ schema: "opl_link_remote_credentials.v1", serverUrl: "https://link.medopl.com", accountScope: "a".repeat(43), role: "host", deviceId: crypto.randomUUID(), identityKey: device.identityKey, accessToken: "a".repeat(32), accessTokenExpiresAt: Date.now() + 120_000, refreshToken: "r".repeat(32), refreshTokenExpiresAt: Date.now() + 500_000 }), webSocketFactory: () => { sockets++; } });
  t.after(async () => { await carrier.close(); await rm(root, { recursive: true, force: true }); });
  await assert.rejects(carrier.enable(), error => error.code === "link_credentials_invalid"); assert.equal(sockets, 0);
  assert.equal(carrier.status().status, "error");
  await assert.rejects(readFile(path.join(root, ".opl-studio/link-remote/server-credentials.json")), error => error.code === "ENOENT");
});

test("phone access preference survives restart before an account is connected", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-link-preference-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let accountReads = 0;
  const options = {
    env: { OPL_DATA_DIR: root }, handle: () => {},
    readAccount: async () => { accountReads++; return null; }
  };
  let carrier = await createLinkInternet(options);
  t.after(() => carrier.close());
  assert.deepEqual(await carrier.disable(), { status: "disabled", enabled: false });
  await carrier.close();

  carrier = await createLinkInternet(options);
  assert.deepEqual(await carrier.synchronizeAccount(), { status: "disabled", enabled: false });
  assert.equal(accountReads, 0);
  assert.deepEqual(await carrier.enable(), { status: "account_required", enabled: true, reasonCode: "link_account_required" });
  await carrier.close();

  carrier = await createLinkInternet(options);
  assert.deepEqual(await carrier.synchronizeAccount(), { status: "account_required", enabled: true, reasonCode: "link_account_required" });
});

test("restarted carrier keeps its identity and recovers a replaced connection once", { timeout: 10_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-link-restart-test-"));
  const sockets = []; const created = new EventEmitter(); const peers = new Map();
  class ControlSocket extends EventEmitter {
    readyState = 0;
    frames = [];
    constructor() { super(); queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    receive(type, payload) {
      const data = JSON.stringify({ v: 1, id: crypto.randomUUID(), timestamp: Date.now(), type, payload });
      this.emit("message", data); this.onmessage?.({ data });
    }
    send(raw) {
      const frame = JSON.parse(raw); this.frames.push(frame); this.emit("sent", frame);
      if (frame.type === "hello") queueMicrotask(() => this.receive("hello.ack", { protocol: 1, serverVersion: "test", connectionSessionId: crypto.randomUUID(), heartbeatIntervalMs: 25_000, maxControlFrameBytes: 64 * 1024, maxRelayFrameBytes: 1024 * 1024, capabilities: ["transport.relay"] }));
    }
    close(code = 1000, reason = "") { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code, reason }); }
    terminate() { this.close(); }
    async next(type, connectionId) {
      for (;;) {
        const frame = this.frames.find(frame => frame.type === type && (connectionId === undefined || frame.payload.connectionId === connectionId));
        if (frame) return frame;
        await once(this, "sent", { signal: AbortSignal.timeout(2000) });
      }
    }
  }
  let authorizations = 0;
  const options = {
    env: { OPL_DATA_DIR: root, OPL_LINK_HOST_NAME: "Original Host" }, handle: () => {},
    authorize: async ({ device }) => { authorizations++; return { schema: "opl_link_remote_credentials.v1", serverUrl: "https://link.medopl.com", accountScope: "a".repeat(43), role: device.role, deviceId: device.deviceId, identityKey: device.identityKey, accessToken: "a".repeat(32), accessTokenExpiresAt: Date.now() + 120_000, refreshToken: "r".repeat(32), refreshTokenExpiresAt: Date.now() + 500_000 }; },
    fetchImplementation: async input => {
      const id = decodeURIComponent(new URL(input).pathname.split("/").at(-1));
      assert.ok(peers.has(id)); return Response.json(peers.get(id));
    },
    webSocketFactory: () => { const socket = new ControlSocket(); sockets.push(socket); created.emit("created"); return socket; },
    rtcFactoryProvider: async () => undefined,
  };
  let carrier = await createLinkInternet(options);
  t.after(async () => { await carrier.close(); await rm(root, { recursive: true, force: true }); });
  async function socketAt(index) { while (!sockets[index]) await once(created, "created", { signal: AbortSignal.timeout(2000) }); const socket = sockets[index]; await socket.next("hello"); return socket; }
  async function incoming(socket, peer) {
    peers.set(peer.deviceId, peer); const connectionId = crypto.randomUUID();
    socket.receive("connect.incoming", { connectionId, clientDeviceId: peer.deviceId, clientIdentityKey: peer.identityKey, authorization: "account", preferredTransports: ["relay"] });
    return connectionId;
  }
  const peer = () => ({ deviceId: crypto.randomUUID(), name: "Phone", platform: "ios", role: "client", identityKey: crypto.randomBytes(32).toString("base64url"), membershipId: "membership-test" });
  await carrier.enable(); const firstSocket = await socketAt(0);
  const known = peer(); await firstSocket.next("connect.accepted", await incoming(firstSocket, known));
  const directory = path.join(root, ".opl-studio/link-remote");
  const identityBefore = JSON.parse(await readFile(path.join(directory, "device.json"), "utf8"));
  const keyBefore = await readFile(path.join(directory, "device.key"), "utf8");
  const pinsBefore = await readFile(path.join(directory, "trusted-peers.json"), "utf8");
  await carrier.close();

  carrier = await createLinkInternet({ ...options, env: { ...options.env, OPL_LINK_HOST_NAME: "Changed environment name" } });
  const restarted = await socketAt(1);
  await restarted.next("connect.accepted", await incoming(restarted, known));
  const changed = { ...known, identityKey: crypto.randomBytes(32).toString("base64url") };
  await restarted.next("connect.rejected", await incoming(restarted, changed));
  assert.equal(await readFile(path.join(directory, "trusted-peers.json"), "utf8"), pinsBefore);
  const fresh = peer(); await restarted.next("connect.accepted", await incoming(restarted, fresh));
  const savedPins = JSON.parse(await readFile(path.join(directory, "trusted-peers.json"), "utf8")).peers;
  assert.equal(savedPins.find(item => item.deviceId === known.deviceId).publicKey, known.identityKey);
  assert.equal(savedPins.find(item => item.deviceId === fresh.deviceId).publicKey, fresh.identityKey);
  const identityAfter = JSON.parse(await readFile(path.join(directory, "device.json"), "utf8"));
  assert.deepEqual(identityAfter, { ...identityBefore, name: "Changed environment name" });
  assert.equal(await readFile(path.join(directory, "device.key"), "utf8"), keyBefore);
  assert.equal(authorizations, 1);

  await carrier.close();
  carrier = await createLinkInternet({
    ...options,
    readAccount: async () => "owner",
    fetchImplementation: async () => Response.json({ enabled: true })
  });
  await carrier.synchronizeAccount();
  const recoveredHost = await socketAt(2);
  async function replace(socket) {
    socket.close(4003, "CONNECTION_REPLACED");
    for (let attempt = 0; attempt < 100 && carrier.status().reasonCode !== "CONNECTION_REPLACED"; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(carrier.status().reasonCode, "CONNECTION_REPLACED");
  }
  await replace(recoveredHost);
  await carrier.synchronizeAccount();
  const replacement = await socketAt(3);
  await replace(replacement);
  assert.equal((await carrier.synchronizeAccount()).reasonCode, "CONNECTION_REPLACED");
  assert.equal(sockets.length, 4);
  await carrier.reconnect();
  await socketAt(4);
});

test("phone disconnect acknowledges durable local revocation before its separate Relay self-revoke", async t => {
  const { service, peer, revocations, internet } = await fixture(t); const loop = peer(); const claim = await pair(service, loop);
  const disconnected = await http(loop, "/api/link/disconnect", { method: "POST", body: {}, token: claim.token });
  assert.equal(disconnected.status, 200); assert.equal(disconnected.json.revoked, true); assert.equal(revocations.length, 0);
  assert.equal((await http(loop, "/api/link/bootstrap", { token: claim.token })).status, 401);
  const next = await pair(service, loop);
  internet.revoke = async () => { throw new Error("Relay unavailable"); };
  await assert.rejects(service.revokeDevice({ id: next.device.id }));
  assert.equal((await http(loop, "/api/link/bootstrap", { token: next.token })).status, 401);
  assert.equal(service.readDevices().devices.length, 0);
});

test("upload digest and TTL failures discard receipts without dispatching a turn", async t => {
  let clock = Date.now(); const { service, peer, calls } = await fixture(t, { now: () => clock }); const loop = peer(); const claim = await pair(service, loop);
  const create = () => http(loop, "/api/link/uploads", { method: "POST", token: claim.token, body: { requestId: crypto.randomUUID(), threadId: "thread-a", name: "sample.bin", mimeType: "application/octet-stream", size: 3, sha256: "0".repeat(64) } });
  const mismatch = await create();
  assert.equal((await http(loop, `/api/link/uploads/${mismatch.json.id}`, { method: "PUT", token: claim.token, body: { offset: 0, base64: Buffer.from("abc").toString("base64") } })).status, 409);
  assert.equal((await http(loop, `/api/link/uploads/${mismatch.json.id}`, { token: claim.token })).status, 404);
  const expired = await create(); clock += 600_001;
  assert.equal((await http(loop, `/api/link/uploads/${expired.json.id}`, { token: claim.token })).status, 404); assert.equal(calls.length, 0);
});

test("Framework exchange uses only private temporary files and removes them on success or rejection", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-link-cli-test-")); t.after(() => rm(root, { recursive: true, force: true }));
  const worker = path.join(root, "opl.mjs"); const cli = path.join(root, "opl"); const receipt = path.join(root, "receipt.json");
  await writeFile(worker, `import fs from 'node:fs';\nlet body='';for await (const part of process.stdin)body+=part;const request=JSON.parse(body);const file=process.argv[process.argv.indexOf('--credential-file')+1];fs.writeFileSync(process.env.TEST_RECEIPT,JSON.stringify({file,request,args:process.argv.slice(2)}));if(process.env.TEST_MODE==='login'||process.env.TEST_MODE==='login-stderr'){const output=process.env.TEST_MODE==='login-stderr'?console.error:console.log;output(JSON.stringify({ok:false,error:'Private backend detail',details:{reason_code:'auth_expired',accessToken:'private-error-secret'}}));process.exit(1)}if(process.env.TEST_MODE==='stderr-overflow'){process.stderr.write('x'.repeat(70000));process.exit(1)}fs.writeFileSync(file,JSON.stringify({schema:'opl_link_remote_credentials.v1',accessToken:'private-test-secret'}),{mode:process.env.TEST_MODE==='public'?0o644:0o600,flag:'wx'});console.log(JSON.stringify({ok:true,companion_authorization:{credential_written:true}}));\n`, { mode: 0o600 });
  await writeFile(cli, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(worker)} "$@"\n`, { mode: 0o700 });
  const env = { ...process.env, OPL_APP_OPL_BIN: cli, TEST_RECEIPT: receipt };
  const device = { deviceId: crypto.randomUUID(), role: "host", name: "Test", platform: "darwin", identityKey: crypto.randomBytes(32).toString("base64url"), clientVersion: "0.6.5" };
  assert.equal((await authorizeLinkHost({ device, env })).accessToken, "private-test-secret");
  const recorded = JSON.parse(await readFile(receipt, "utf8")); assert.deepEqual(recorded.request, { service: "opl_link", device }); assert.ok(recorded.args.includes("--request-stdin"));
  await assert.rejects(readFile(recorded.file), error => error.code === "ENOENT");
  await assert.rejects(authorizeLinkHost({ device, env: { ...env, TEST_MODE: "public" } }), error => error.code === "link_credentials_invalid");
  await assert.rejects(authorizeLinkHost({ device, env: { ...env, TEST_MODE: "login" } }), error => error.code === "link_account_required");
  await assert.rejects(authorizeLinkHost({ device, env: { ...env, TEST_MODE: "login-stderr" } }), error => error.code === "link_account_required" && !JSON.stringify(error).includes("private-error-secret") && !error.message.includes("Private backend detail"));
  await assert.rejects(authorizeLinkHost({ device, env: { ...env, TEST_MODE: "stderr-overflow" } }), error => error.code === "link_authorization_failed");
});

test("the actual Framework CLI maps an isolated signed-out account to the existing account entry", async t => {
  const frameworkRoot = process.env.OPL_LINK_FRAMEWORK_SOURCE;
  if (!frameworkRoot) { t.skip("Set OPL_LINK_FRAMEWORK_SOURCE to the matching Framework checkout"); return; }
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-link-framework-cli-"));
  const carrier = await createLinkInternet({ env: { ...process.env, NODE_ENV: "test", OPL_DATA_DIR: root, OPL_STATE_DIR: path.join(root, "framework-state"), OPL_APP_OPL_BIN: path.join(frameworkRoot, "bin/opl"), OPL_GATEWAY_CONTROL_BASE_URL: "http://127.0.0.1:1/api/v1" }, handle: () => {}, webSocketFactory: () => { throw new Error("A signed-out account must not open a Relay socket"); } });
  t.after(async () => { await carrier.close(); await rm(root, { recursive: true, force: true }); });
  await assert.rejects(carrier.enable(), error => error.code === "link_account_required");
  assert.deepEqual(carrier.status(), { status: "account_required", enabled: false, reasonCode: "link_account_required" });
});

test("RTC evidence requires an actual succeeded pair and data bytes and exposes only closed classifications", async () => {
  for (const [localType, remoteType, selectedTransport] of [["host", "host", "lan"], ["srflx", "host", "p2p"], ["host", "relay", "turn"]]) {
    const tracker = createLinkTransportEvidence();
    const stats = new Map([
      ["local", { id: "private-local-id", type: "local-candidate", candidateType: localType, address: localType === "srflx" ? "198.51.100.7" : "192.168.4.3", protocol: "udp" }],
      ["remote", { id: "private-remote-id", type: "remote-candidate", candidateType: remoteType, address: "192.168.4.4", protocol: "udp" }],
      ["pair", { id: "private-pair-id", type: "candidate-pair", state: "succeeded", nominated: true, localCandidateId: "private-local-id", remoteCandidateId: "private-remote-id" }]
    ]);
    const channel = { send() {}, onmessage: null };
    const raw = { getStats: async () => stats, createDataChannel: () => channel, close() {} };
    const pc = tracker.wrapFactory({ create: () => raw }).create({});
    assert.equal(await tracker.read({ authenticated: true, relayConnected: false }), null);
    const wrapped = pc.createDataChannel("dsh", {}); wrapped.onmessage = () => {}; wrapped.send(new Uint8Array(37)); channel.onmessage({ data: new Uint8Array(29) });
    assert.equal(await tracker.read({ authenticated: false, relayConnected: false }), null);
    const evidence = await tracker.read({ authenticated: true, relayConnected: false });
    assert.deepEqual(evidence, { selectedTransport, localCandidateType: localType, remoteCandidateType: remoteType, candidatePairState: "succeeded", bytesSent: 37, bytesReceived: 29, directAttempted: true, relayFallback: false });
    assert.equal(/192\.168|198\.51|private-.*-id|sdp/i.test(JSON.stringify(evidence)), false);
    pc.close(); assert.equal(await tracker.read({ authenticated: true, relayConnected: false }), null);
  }
});

test("Relay evidence counts actual ciphertext frames and distinguishes observed direct failure from preference", async () => {
  const tracker = createLinkTransportEvidence(); const socket = Object.assign(new EventEmitter(), { send() {} }); tracker.observeSocket(socket);
  socket.send(JSON.stringify({ type: "hello", payload: { capabilities: ["transport.lan"] } }));
  assert.equal(await tracker.read({ authenticated: true, relayConnected: true }), null);
  const frame = JSON.stringify({ type: "relay", payload: { ciphertext: Buffer.alloc(41).toString("base64url") } }); socket.send(frame); socket.emit("message", frame);
  assert.equal((await tracker.read({ authenticated: true, relayConnected: true })).directAttempted, false);
  socket.emit("message", JSON.stringify({ type: "signal.offer", payload: {} }));
  assert.deepEqual(await tracker.read({ authenticated: true, relayConnected: true }), { selectedTransport: "relay", localCandidateType: null, remoteCandidateType: null, candidatePairState: null, bytesSent: 41, bytesReceived: 41, directAttempted: true, relayFallback: true });
});

test("the shipped RTC bundle creates its required backend without external node_modules or postinstall", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-link-packaged-rtc-")); t.after(() => rm(root, { recursive: true, force: true }));
  const module = path.join(root, "rtc.mjs"); await copyFile(new URL("../../vendor/dsh-remote/rtc.mjs", import.meta.url), module);
  const result = execFileSync(process.execPath, ["--input-type=module", "-e", `const m=await import(${JSON.stringify(module)});const f=await m.loadWeriftFactory();if(typeof f?.create!=="function")throw new Error("RTC backend unavailable");const pc=f.create({iceServers:[]});await pc.getStats();pc.close();console.log(JSON.stringify({bundledFallbackCreated:true}));`], { encoding: "utf8", timeout: 15000 });
  assert.deepEqual(JSON.parse(result), { bundledFallbackCreated: true });
});
