import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createLinkCompanion, LINK_SCHEMA } from "../../plugins/opl-host-core/src/link-companion.mjs";
import { CodexAppServerTransport } from "../../plugins/opl-codex-native/src/app-server-transport.mjs";
import { createWebUiHost } from "./http-host.mjs";
import { createWebUiAuth } from "../../packages/host-kit/webui-auth.mjs";

const fixture = new URL("./fixtures/fake-app-server.mjs", import.meta.url).pathname;
async function post(url, route, body, token, headers = {}) {
  return fetch(`${url}${route}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: JSON.stringify(body) });
}
async function pairing(base, headers = {}) {
  const response = await post(base, "/api/link/pair", { endpoint: base }, undefined, headers);
  assert.equal(response.status, 200); const value = await response.json();
  const claimed = await post(base, "/api/link/claim", { code: value.code, deviceName: "Test iPhone" }, undefined, headers);
  assert.equal(claimed.status, 200); return { pair: value, claim: await claimed.json() };
}
const streamBuffers = new WeakMap();
async function nextFrame(reader) {
  let buffer = streamBuffers.get(reader) ?? "";
  for (;;) {
    const boundary = buffer.indexOf("\n\n");
    if (boundary >= 0) {
      const chunk = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); streamBuffers.set(reader, buffer);
      const data = chunk.split("\n").find(line => line.startsWith("data: "));
      if (data) return JSON.parse(data.slice(6));
      continue;
    }
    const { value, done } = await reader.read(); if (done) return null;
    buffer += new TextDecoder().decode(value);
  }
}
async function directHost(t, { now, secure = true, auth, core } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-link-http-"));
  const hostCore = core ?? Object.assign(new EventEmitter(), { invoke: async (method, payload) => ({ method, payload }), capabilities: () => ({ appServerAvailable: true }) });
  const env = { OPL_DATA_DIR: root, ...(secure ? { OPL_LINK_ALLOW_LOOPBACK_HTTP: "1" } : {}) };
  const service = await createLinkCompanion({ hostCore, env, now, webAuth: auth, heartbeatMs: 20 });
  const server = http.createServer((req, res) => { void service.handle(req, res); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await service.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  return { root, service, hostCore, base };
}

test("pair codes are one-use; devices persist as hashes; expiry and revoke close existing streams", async t => {
  let clock = Date.now();
  const host = await directHost(t, { now: () => clock });
  const { pair, claim } = await pairing(host.base);
  assert.equal(claim.schema, LINK_SCHEMA); assert.ok(claim.host.id); assert.equal(claim.device.name, "Test iPhone");
  assert.equal((await post(host.base, "/api/link/claim", { code: pair.code, deviceName: "Other phone" })).status, 410);
  const stored = await readFile(path.join(host.root, ".opl-studio/link-devices.json"), "utf8");
  assert.ok(!stored.includes(claim.token)); assert.ok(!stored.includes(pair.code)); assert.match(stored, /tokenHash/);
  const devices = await fetch(`${host.base}/api/link/devices`).then(r => r.json());
  assert.equal(devices.devices.length, 1); assert.ok(!JSON.stringify(devices).includes("tokenHash"));
  const controller = new AbortController(); t.after(() => controller.abort());
  const stream = await fetch(`${host.base}/api/link/events`, { headers: { authorization: `Bearer ${claim.token}` }, signal: controller.signal });
  const reader = stream.body.getReader(); assert.equal((await nextFrame(reader)).method, "host/ready");
  const revoked = await fetch(`${host.base}/api/link/devices/${claim.device.id}`, { method: "DELETE" });
  assert.equal(revoked.status, 200); assert.equal((await reader.read()).done, true);
  assert.equal((await fetch(`${host.base}/api/link/bootstrap`, { headers: { authorization: `Bearer ${claim.token}` } })).status, 401);
  const pending = await host.service.createPairing({ endpoint: host.base }); clock += 121_000;
  assert.equal((await post(host.base, "/api/link/claim", { code: pending.code, deviceName: "Expired" })).status, 410);
  const current = await pairing(host.base); clock += 31 * 24 * 60 * 60 * 1000;
  assert.equal((await fetch(`${host.base}/api/link/bootstrap`, { headers: { authorization: `Bearer ${current.claim.token}` } })).status, 401);
});

test("production routes require TLS; local control rejects hostile Origin and device credentials", async t => {
  const host = await directHost(t, { secure: false });
  assert.equal((await post(host.base, "/api/link/pair", { endpoint: host.base })).status, 400);
  assert.equal((await post(host.base, "/api/link/claim", { code: "unknown", deviceName: "Phone" })).status, 403);
  assert.equal((await post(host.base, "/api/link/pair", { endpoint: "https://example.test" }, undefined, { origin: "https://evil.test" })).status, 403);
  const local = await directHost(t);
  const { claim } = await pairing(local.base);
  assert.equal((await post(local.base, "/api/link/pair", { endpoint: local.base }, claim.token)).status, 403);
  assert.equal((await post(local.base, "/api/link/invoke", { method: "executeAction", payload: {} }, claim.token)).status, 403);
  assert.equal((await post(local.base, "/api/link/invoke", { method: "listThreads", payload: { injected: true } }, claim.token)).status, 400);
  assert.equal((await post(local.base, "/api/link/pair", { endpoint: local.base, padding: "x".repeat(17 * 1024) })).status, 413);
  assert.equal((await post(local.base, "/api/link/claim", { code: "x".repeat(17 * 1024), deviceName: "Phone" })).status, 413);
});

test("desktop password pairing retains session CSRF requirements", async t => {
  const auth = await createWebUiAuth({ env: { OPL_WEBUI_AUTH_MODE: "password", OPL_WEBUI_PASSWORD: "test-only-password", OPL_WEBUI_SESSION_SECRET: "x".repeat(32) } });
  const host = await directHost(t, { auth });
  assert.equal((await post(host.base, "/api/link/pair", { endpoint: host.base })).status, 401);
  const res = { setHeader(name, value) { this[name] = value; } };
  const signed = auth.issueSession(res, {}); const cookie = res["set-cookie"].split(";")[0];
  assert.equal((await post(host.base, "/api/link/pair", { endpoint: host.base }, undefined, { cookie })).status, 403);
  assert.equal((await post(host.base, "/api/link/pair", { endpoint: host.base }, undefined, { cookie, "x-csrf-token": signed.csrfToken })).status, 200);
});

test("mutations reserve request IDs before dispatch, share concurrent results, and never replay recovered outcomes", async t => {
  let writes = 0;
  const core = Object.assign(new EventEmitter(), { invoke: async () => { writes++; return { accepted: true }; } });
  const host = await directHost(t, { core });
  const { claim } = await pairing(host.base);
  const input = { method: "renameThread", payload: { threadId: "t1", name: "New title" }, requestId: "mutation-request-0001" };
  const results = await Promise.all([post(host.base, "/api/link/invoke", input, claim.token), post(host.base, "/api/link/invoke", input, claim.token)]);
  assert.ok(results.every(result => result.status === 200)); assert.equal(writes, 1);
  assert.equal((await post(host.base, "/api/link/invoke", { ...input, payload: { threadId: "t1", name: "Different" } }, claim.token)).status, 409);
  await host.service.close();
  const restarted = await createLinkCompanion({ hostCore: core, env: { OPL_DATA_DIR: host.root, OPL_LINK_ALLOW_LOOPBACK_HTTP: "1" } });
  const server = http.createServer((req, res) => { void restarted.handle(req, res); }); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await restarted.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const response = await post(`http://127.0.0.1:${server.address().port}`, "/api/link/invoke", input, claim.token);
  assert.equal(response.status, 409); assert.equal((await response.json()).error.code, "link_outcome_unknown"); assert.equal(writes, 1);
});

test("approval replies are bound to canonical pending IDs and limited to allow-once, deny, or typed question answers", async t => {
  const pending = [{ id: 9, method: "item/commandExecution/requestApproval", params: { threadId: "t1" } }, { id: "q1", method: "item/tool/requestUserInput", params: { questions: [{ id: "choice" }] } }, { id: "p1", method: "item/permissions/requestApproval", params: {} }, { id: "deny-only", method: "item/fileChange/requestApproval", params: { availableDecisions: ["decline"] } }];
  let answered;
  const core = Object.assign(new EventEmitter(), { invoke: async (method, payload) => { if (method === "listPendingServerRequests") return pending; answered = payload; return { accepted: true }; } });
  const host = await directHost(t, { core }); const { claim } = await pairing(host.base);
  const send = (id, result, requestId) => post(host.base, "/api/link/invoke", { method: "respondToServerRequest", payload: { id, response: { result } }, requestId }, claim.token);
  assert.equal((await send(9, { decision: "acceptForSession" }, "approval-request-0001")).status, 403);
  assert.equal((await send(9, { decision: "accept" }, "approval-request-0002")).status, 200); assert.equal(answered.id, 9);
  assert.equal((await send("q1", { answers: { choice: { answers: ["first"] } } }, "question-request-0001")).status, 200);
  assert.equal((await send("q1", { answers: { unknown: { answers: ["first"] } } }, "question-request-0002")).status, 400);
  assert.equal((await send("p1", { decision: "accept" }, "approval-request-0003")).status, 403);
  assert.equal((await send("missing", { decision: "accept" }, "approval-request-0004")).status, 409);
  assert.equal((await send("deny-only", { decision: "accept" }, "approval-request-0005")).status, 403);
  assert.equal((await send("deny-only", { decision: "decline" }, "approval-request-0006")).status, 200);
});

test("steering stages uploaded bytes in the same turn and rejects runtime setting changes", async t => {
  let steered;
  const core = Object.assign(new EventEmitter(), { invoke: async (method, payload) => { steered = { method, payload }; if (payload.prompt === "lost response") throw new Error("Response lost after owner dispatch"); return { threadId: payload.threadId, turnId: payload.expectedTurnId, accepted: true }; } });
  const host = await directHost(t, { core }); const { claim } = await pairing(host.base);
  const input = { method: "steerTurn", payload: { threadId: "thread-1", expectedTurnId: "turn-1", prompt: "Use this context", attachments: [{ name: "context.md", mimeType: "text/markdown", base64: Buffer.from("x".repeat(18 * 1024)).toString("base64") }] }, requestId: "steer-request-0001" };
  assert.equal((await post(host.base, "/api/link/invoke", input, claim.token)).status, 200);
  assert.equal(steered.method, "steerTurn"); assert.equal(steered.payload.expectedTurnId, "turn-1");
  const file = steered.payload.inputs[0]; assert.equal(file.type, "mention"); assert.equal(await readFile(file.path, "utf8"), "x".repeat(18 * 1024));
  assert.equal((await post(host.base, "/api/link/invoke", { ...input, payload: { ...input.payload, model: "forbidden" }, requestId: "steer-request-0002" }, claim.token)).status, 400);
  const unknown = { ...input, payload: { ...input.payload, prompt: "lost response" }, requestId: "steer-request-0003" };
  assert.equal((await post(host.base, "/api/link/invoke", unknown, claim.token)).status, 500);
  assert.equal(await readFile(steered.payload.inputs[0].path, "utf8"), "x".repeat(18 * 1024));
  assert.equal((await post(host.base, "/api/link/invoke", unknown, claim.token)).status, 409);
});

test("real DSH HTTP Host pairs a phone to its single Codex transport, streams and reads the same thread, and confines downloads", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-link-canonical-"));
  const logPath = path.join(root, "rpc.jsonl");
  await writeFile(path.join(root, "index.html"), "<!doctype html><title>OPL Link source test</title>");
  await writeFile(path.join(root, "report.md"), "# Result from the canonical workspace\n");
  const transport = new CodexAppServerTransport({ command: process.execPath, args: [fixture], cwd: root, env: { ...process.env, FAKE_WORKSPACE: root, FAKE_APP_SERVER_LOG: logPath, FAKE_APP_SERVER_PENDING_APPROVAL: "1" }, requestTimeoutMs: 2000 });
  const host = await createWebUiHost({ transport, dshHome: path.join(root, "dsh"), env: { ...process.env, OPL_DATA_DIR: root, OPL_LINK_ALLOW_LOOPBACK_HTTP: "1" }, webRoot: root, opl: { readState: async () => ({}) } });
  t.after(async () => { await host.close(); await rm(root, { recursive: true, force: true }); });
  const { claim } = await pairing(host.url);
  const invoke = async (method, payload = {}, requestId = crypto.randomUUID()) => {
    const response = await post(host.url, "/api/link/invoke", { method, payload, requestId }, claim.token);
    assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).result;
  };
  assert.equal((await post(host.url, "/api/opl/action", { actionId: "forbidden" }, claim.token)).status, 403);
  assert.equal((await fetch(`${host.url}/api/opl-events`, { headers: { authorization: `Bearer ${claim.token}` } })).status, 403);
  assert.equal((await fetch(`${host.url}/api/opl/state`, { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "app.example.test" } })).status, 401);
  const list = await invoke("listThreads"); assert.ok(list.data.some(item => item.id === "thread-source"));
  await invoke("readThread", { threadId: "thread-source" });
  let rpc = (await readFile(logPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(!rpc.some(item => item.method === "thread/resume"));
  const abort = new AbortController(); t.after(() => abort.abort());
  const events = await fetch(`${host.url}/api/link/events`, { headers: { authorization: `Bearer ${claim.token}` }, signal: abort.signal });
  const reader = events.body.getReader(); assert.equal((await nextFrame(reader)).method, "host/ready");
  const started = await invoke("startTurn", { threadId: "thread-source", prompt: "Continue this same conversation", attachments: [{ name: "context.md", mimeType: "text/markdown", base64: Buffer.from("Research context").toString("base64") }] });
  assert.equal(started.threadId, "thread-source"); assert.ok(started.turnId);
  let found = false, answered = false;
  for (let index = 0; index < 12 && !found; index++) {
    const frame = await nextFrame(reader);
    if (frame?.method === "codex/server-request") {
      const requests = await invoke("listPendingServerRequests");
      assert.equal(requests.length, 1);
      await invoke("respondToServerRequest", { id: requests[0].id, response: { result: { decision: "accept" } } });
      answered = true;
    }
    found = frame?.method === "turn/completed";
  }
  assert.ok(answered);
  assert.ok(found);
  const readback = await invoke("readThread", { threadId: started.threadId }); assert.ok(readback.turns.some(turn => turn.id === started.turnId));
  const desktop = await host.core.invoke("readThread", { threadId: started.threadId, includeTurns: true }); assert.equal(desktop.id, readback.id);
  const pending = await invoke("listPendingServerRequests"); assert.deepEqual(pending, []);
  rpc = (await readFile(logPath, "utf8")).trim().split("\n").map(JSON.parse);
  const resumed = rpc.find(item => item.direction === "client_to_server" && item.method === "thread/resume");
  assert.deepEqual(resumed.params, { threadId: "thread-source" });
  const turn = rpc.find(item => item.direction === "client_to_server" && item.method === "turn/start");
  assert.ok(turn.params.input.some(item => item.type === "mention" && item.name === "context.md"));
  assert.equal(turn.params.permissions, undefined); assert.equal(turn.params.sandboxPolicy, undefined);
  const files = await invoke("listThreadWorkspace", { threadId: started.threadId }); assert.ok(files.entries.some(item => item.name === "report.md"));
  const download = await post(host.url, "/api/link/download", { threadId: started.threadId, relativePath: "report.md" }, claim.token); assert.equal(await download.text(), "# Result from the canonical workspace\n");
  assert.equal((await post(host.url, "/api/link/download", { threadId: started.threadId, relativePath: "../private.txt" }, claim.token)).status, 400);
  abort.abort();
});
