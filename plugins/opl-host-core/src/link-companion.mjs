import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile, rename, chmod } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ThreadAdapterError } from "@gaofeng21cn/opl-host-contracts/thread-error";
import { createWebUiAuth } from "@gaofeng21cn/opl-host-kit/webui-auth";
import { createStagedInputService } from "@gaofeng21cn/opl-host-kit/staged-inputs";
import { createLinkUploads, LINK_CHUNK_BYTES } from "./link-uploads.mjs";

export const LINK_SCHEMA = "opl_link_studio_wire.v2";
export const LINK_METHODS = Object.freeze(["listThreads", "readThread", "startTurn", "steerTurn", "interruptTurn", "listPendingServerRequests", "respondToServerRequest", "readCodexModels", "listThreadWorkspace", "readThreadWorkspaceFile", "readThreadWorkspaceGit", "renameThread", "setArchived"]);
const READ_METHODS = new Set(["listThreads", "readThread", "listPendingServerRequests", "readCodexModels", "listThreadWorkspace", "readThreadWorkspaceFile", "readThreadWorkspaceGit"]);
const PAIR_TTL = 120_000;
const DEVICE_TTL = 30 * 24 * 60 * 60 * 1_000;
const MAX_BODY = 70 * 1024 * 1024;
const MAX_CONTROL_BODY = 16 * 1024;
const MAX_ATTACHMENT = 10 * 1024 * 1024;
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const fail = (code, message, status = 400) => new ThreadAdapterError(code, message, {}, status);
const isLoopback = host => ["127.0.0.1", "::1", "[::1]", "localhost", "::ffff:127.0.0.1"].includes(host);
const record = value => value && typeof value === "object" && !Array.isArray(value);
function string(value, name, max = 8192) {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) throw fail("invalid_link_request", `${name} is invalid`);
  return value.trim();
}
function projectDevice(value) { const { tokenHash: _, remotePeerKey: _peerKey, ...device } = value; return device; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  return record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
}
function endpointUrl(value, allowLoopback) {
  let url;
  try { url = new URL(string(value, "endpoint")); } catch { throw fail("invalid_link_endpoint", "Enter a trusted HTTPS address for this OPL App"); }
  if (url.username || url.password || url.search || url.hash || !url.hostname || (url.protocol !== "https:" && !(allowLoopback && url.protocol === "http:" && isLoopback(url.hostname)))) throw fail("invalid_link_endpoint", "OPL Link requires HTTPS with system-trusted certificates");
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  return url.href;
}
function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(value));
}
async function readJson(req, limit = MAX_CONTROL_BODY) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw fail("link_request_too_large", "Request exceeds the upload limit", 413); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); if (!record(value)) throw new Error(); return value; }
  catch { throw fail("invalid_link_json", "Request must be a JSON object"); }
}

/** A scoped adapter over the existing Host. It never owns threads or starts another runtime. */
export async function createLinkCompanion({ hostCore, env = process.env, webAuth, stagedInputs, now = () => Date.now(), heartbeatMs = 15_000, internet } = {}) {
  const root = path.join(env.OPL_DATA_DIR ?? os.homedir(), ".opl-studio");
  const storeFile = env.OPL_LINK_DEVICES_FILE ?? path.join(root, "link-devices.json");
  const allowLoopback = env.OPL_LINK_ALLOW_LOOPBACK_HTTP === "1";
  const trustProxy = env.OPL_LINK_TRUST_PROXY === "1" || env.OPL_WEBUI_TRUST_PROXY === "1" || env.OPL_WEBUI_DEPLOYMENT_MODE === "cloud";
  const auth = webAuth ?? await createWebUiAuth({ env });
  let inputs = stagedInputs;
  let stored = { hostId: crypto.randomUUID(), devices: [], operations: [] };
  try {
    const parsed = JSON.parse(await readFile(storeFile, "utf8"));
    if (parsed.schema !== "opl_link_host_devices.v1" || typeof parsed.hostId !== "string" || !Array.isArray(parsed.devices) || !Array.isArray(parsed.operations)) throw fail("link_store_invalid", "The companion device store needs repair", 503);
    stored = parsed;
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const devices = new Map(stored.devices.map(device => [device.id, device]));
  // Persist only IDs and hashes for mutations. Recovered reservations are deliberately unknown.
  const operations = new Map(stored.operations.map(item => [item.key, { hash: item.hash, unknown: true }]));
  const pairs = new Map(); const clients = new Map(); const stagedTurns = new Map();
  const securePeers = new WeakMap();
  const accountClaims = new Map();
  const uploads = createLinkUploads({ root: path.join(root, "link-upload-chunks"), hostCore, now });
  const host = { id: stored.hostId, name: env.OPL_LINK_HOST_NAME || os.hostname() };
  let writes = Promise.resolve(); let closed = false;
  function persist() {
    const value = JSON.stringify({ schema: "opl_link_host_devices.v1", hostId: host.id, devices: [...devices.values()], operations: [...operations].map(([key, value]) => ({ key, hash: value.hash })) });
    const operation = writes.catch(() => {}).then(async () => {
      await mkdir(path.dirname(storeFile), { recursive: true, mode: 0o700 });
      const temporary = `${storeFile}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, value, { mode: 0o600 }); await rename(temporary, storeFile); await chmod(storeFile, 0o600);
    });
    writes = operation;
    return operation;
  }
  function availableDevice(id) {
    const device = devices.get(id);
    return device && !device.revokedAt && Date.parse(device.expiresAt) > now() ? device : null;
  }
  function assertSecure(req) {
    if (securePeers.has(req)) return;
    const incoming = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const forwarded = req.headers["x-forwarded-proto"];
    if (req.socket.encrypted === true || (trustProxy && forwarded === "https")) return;
    if (allowLoopback && isLoopback(req.socket.remoteAddress) && isLoopback(incoming.hostname) && !forwarded) return;
    throw fail("link_https_required", "OPL Link requires a trusted HTTPS connection", 403);
  }
  function assertOrigin(req) {
    if (!req.headers.origin) return;
    let origin;
    try { origin = new URL(req.headers.origin); } catch { throw fail("link_origin_rejected", "Untrusted origin", 403); }
    const expected = new Set([`http://${req.headers.host}`, `https://${req.headers.host}`]);
    if (env.OPL_LINK_PUBLIC_URL) expected.add(new URL(endpointUrl(env.OPL_LINK_PUBLIC_URL, allowLoopback)).origin);
    if (!expected.has(origin.origin)) throw fail("link_origin_rejected", "Untrusted origin", 403);
  }
  function requireDesktop(req, csrf = false) {
    assertOrigin(req);
    if (req.headers.authorization) throw fail("link_desktop_session_required", "Use the desktop session to manage devices", 403);
    if (!auth.enabled) {
      const incoming = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (!isLoopback(req.socket.remoteAddress) || !isLoopback(incoming.hostname) || req.headers["x-forwarded-proto"] || req.headers["x-forwarded-host"]) throw fail("link_desktop_session_required", "Sign in to the desktop WebUI first", 401);
    }
    const result = auth.requireSession(req, { csrf });
    if (!result.ok) throw fail(result.code, result.message, result.status);
  }
  function requireDevice(req) {
    assertSecure(req); assertOrigin(req);
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? "")?.[1];
    const hash = token ? digest(token) : "";
    const device = [...devices.values()].find(item => item.tokenHash === hash && availableDevice(item.id));
    if (!device) throw fail("link_device_unauthorized", "Reconnect this iPhone from the desktop App", 401);
    const peer = securePeers.get(req);
    if (device.remotePeerId && (peer?.peerDeviceId !== device.remotePeerId || internet?.isRemoteAccessEnabled?.() === false
      || (device.remotePeerKey && peer.peerIdentityKey !== device.remotePeerKey))) {
      throw fail("link_device_unauthorized", "Reconnect this iPhone from the desktop App", 401);
    }
    device.lastSeenAt = new Date(now()).toISOString();
    return device;
  }
  async function createPairing({ endpoint } = {}) {
    if (closed) throw fail("link_host_closed", "The desktop App is closing", 503);
    for (const [key, value] of pairs) if (value.expiresAt <= now()) pairs.delete(key);
    if (pairs.size >= 16) throw fail("link_pairing_limit", "Finish or wait for an existing pairing to expire", 429);
    if (endpoint === undefined && internet) {
      const remote = await internet.createInvitation();
      const code = crypto.randomBytes(32).toString("base64url"); const expiresAt = Math.min(now() + PAIR_TTL, remote.expiresAt);
      pairs.set(digest(code), { expiresAt, remote: true });
      const value = { serverUrl: remote.serverUrl, accountScope: remote.accountScope, hostDeviceId: remote.hostDeviceId, hostIdentityKey: remote.hostIdentityKey, enrollmentToken: remote.enrollmentToken, code, expiresAt: new Date(expiresAt).toISOString() };
      const url = new URL("opllink://pair"); for (const [key, item] of Object.entries(value)) url.searchParams.set(key, String(item));
      const hostFingerprint = crypto.createHash("sha256").update(Buffer.from(remote.hostIdentityKey, "base64url")).digest("hex").slice(0, 16).toUpperCase().match(/.{4}/g).join(" ");
      return { schema: LINK_SCHEMA, ...value, hostFingerprint, pairingURL: url.href };
    }
    const normalized = endpointUrl(endpoint ?? env.OPL_LINK_PUBLIC_URL, allowLoopback);
    for (const [key, value] of pairs) if (value.expiresAt <= now()) pairs.delete(key);
    if (pairs.size >= 16) throw fail("link_pairing_limit", "Finish or wait for an existing pairing to expire", 429);
    const code = crypto.randomBytes(32).toString("base64url"); const expiresAt = now() + PAIR_TTL;
    pairs.set(digest(code), { endpoint: normalized, expiresAt });
    const url = new URL("opllink://pair"); url.searchParams.set("endpoint", normalized); url.searchParams.set("code", code);
    return { schema: LINK_SCHEMA, endpoint: normalized, code, expiresAt: new Date(expiresAt).toISOString(), pairingURL: url.href };
  }
  async function claim({ code, deviceName }, context) {
    const key = digest(string(code, "code", 128)); const pair = pairs.get(key);
    if (!pair || pair.expiresAt <= now()) { pairs.delete(key); throw fail("link_pairing_expired", "This QR code has expired. Generate another on the desktop", 410); }
    if (pair.remote && !context?.peerDeviceId) throw fail("link_secure_pairing_required", "Scan the desktop code in OPL Link", 403);
    const name = string(deviceName, "deviceName", 80);
    pairs.delete(key);
    return issueDevice(name, context);
  }
  async function accountClaim(payload, context) {
    if (!context || !internet?.verifyAccountGrant) throw fail("link_secure_channel_required", "Authenticated desktop channel required", 403);
    if (Object.keys(payload).some(key => key !== "deviceName")) throw fail("invalid_link_request", "Only the phone name can be supplied", 400);
    const name = string(payload.deviceName, "deviceName", 80);
    const { peerDeviceId, peerIdentityKey } = context;
    const current = accountClaims.get(peerDeviceId);
    if (current && current.peerIdentityKey === peerIdentityKey) return current.result;
    const result = (async () => {
      await internet.verifyAccountGrant(context);
      if (closed || internet.isRemoteAccessEnabled?.() === false) throw fail("link_device_unauthorized", "Phone access is unavailable", 403);
      const prior = [...devices.values()].find(item => item.remotePeerId === peerDeviceId && item.remotePeerKey === peerIdentityKey);
      if (prior?.revokedAt) throw fail("link_device_unauthorized", "This device was disconnected", 403);
      return issueDevice(name, context, { prior, accountBound: true });
    })();
    accountClaims.set(peerDeviceId, { peerIdentityKey, result });
    try { return await result; }
    finally { if (accountClaims.get(peerDeviceId)?.result === result) accountClaims.delete(peerDeviceId); }
  }
  async function issueDevice(name, context, { prior, accountBound = false } = {}) {
    for (const [id, device] of devices) {
      if (availableDevice(id) || (device.remotePeerKey && device.revokedAt)) continue;
      devices.delete(id);
      for (const [key] of operations) if (key.startsWith(`${id}:`)) operations.delete(key);
    }
    if (devices.has(prior?.id) === false && [...devices.values()].filter(item => availableDevice(item.id)).length >= 32) throw fail("link_device_limit", "Remove an unused device on the desktop first", 409);
    const token = crypto.randomBytes(32).toString("base64url");
    const device = {
      id: prior?.id ?? crypto.randomUUID(), name, createdAt: prior?.createdAt ?? new Date(now()).toISOString(),
      lastSeenAt: new Date(now()).toISOString(), expiresAt: new Date(now() + DEVICE_TTL).toISOString(),
      tokenHash: digest(token), ...(context?.peerDeviceId ? { remotePeerId: context.peerDeviceId } : {}),
      ...(accountBound ? { remotePeerKey: context.peerIdentityKey } : {})
    };
    devices.set(device.id, device);
    try { await persist(); }
    catch (error) { if (prior) devices.set(prior.id, prior); else devices.delete(device.id); throw error; }
    return { schema: LINK_SCHEMA, token, expiresAt: device.expiresAt, device: projectDevice(device), host };
  }
  function readDevices() { return { schema: LINK_SCHEMA, host, endpoint: !internet && env.OPL_LINK_PUBLIC_URL ? endpointUrl(env.OPL_LINK_PUBLIC_URL, allowLoopback) : null, internet: internet?.status() ?? { status: "disabled" }, devices: [...devices.values()].filter(item => availableDevice(item.id)).map(projectDevice) }; }
  async function revokeDevice({ id }, { revokeRelay = true } = {}) {
    const deviceId = string(id, "id");
    const device = devices.get(deviceId);
    if (device) device.revokedAt = new Date(now()).toISOString();
    for (const [key] of operations) if (key.startsWith(`${deviceId}:`)) operations.delete(key);
    for (const [res, value] of clients) if (value.deviceId === deviceId) { clearInterval(value.timer); res.end(); clients.delete(res); }
    await uploads.revoke(deviceId); await persist();
    if (revokeRelay && device?.remotePeerId) await internet?.revoke(device.remotePeerId);
    if (!device?.remotePeerKey) { devices.delete(deviceId); await persist(); }
    return { id: deviceId, revoked: true };
  }
  async function clearRemoteDevices({ accountOnly = false } = {}) {
    const devicesToClear = [...devices.values()].filter(device => device.remotePeerId && !device.revokedAt && (!accountOnly || device.remotePeerKey));
    for (const device of devicesToClear) {
      for (const [res, stream] of clients) if (stream.deviceId === device.id) { clearInterval(stream.timer); res.end(); clients.delete(res); }
      await uploads.revoke(device.id);
      devices.delete(device.id);
    }
    await persist();
  }
  async function prepareAttachments(attachments, device, payload) {
    if (attachments === undefined || (Array.isArray(attachments) && attachments.length === 0)) return { inputs: [], paths: [], groupId: null };
    if (!Array.isArray(attachments) || attachments.length > 5) throw fail("link_attachment_limit", "Attach at most five files");
    const decoded = attachments.map(item => {
      if (record(item) && Object.keys(item).length === 1 && typeof item.uploadId === "string") return { uploadId: item.uploadId };
      if (!record(item) || Object.keys(item).some(key => !["name", "mimeType", "base64"].includes(key))) throw fail("invalid_link_attachment", "Attachments must contain a name, type and bytes");
      const name = string(item.name, "attachment.name", 180);
      if (name.startsWith(".") || /[\\/]/.test(name)) throw fail("invalid_link_attachment", "Attachment names must not contain paths");
      if (typeof item.base64 !== "string" || item.base64.length > Math.ceil(MAX_ATTACHMENT / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.base64)) throw fail("invalid_link_attachment", "Attachment bytes are invalid or exceed 10 MiB", 413);
      const bytes = Buffer.from(item.base64, "base64");
      if (!bytes.length || bytes.length > MAX_ATTACHMENT) throw fail("link_attachment_limit", "Each attachment must be between one byte and 10 MiB", 413);
      return { name, bytes };
    });
    if (new Set(decoded.map(item => item.uploadId ?? item.name)).size !== decoded.length) throw fail("invalid_link_attachment", "Use distinct attachments");
    inputs ??= await createStagedInputService({ root: path.join(root, "link-inputs") });
    const group = await inputs.create();
    try {
      const names = new Set();
      for (const item of decoded) {
        const name = item.uploadId ? await uploads.consume(device, item.uploadId, payload, inputs, group.id) : item.name;
        if (names.has(name)) throw fail("invalid_link_attachment", "Use distinct attachment names"); names.add(name);
        if (!item.uploadId) await inputs.put(group.id, item.name, Readable.from([item.bytes]));
      }
      const staged = await inputs.complete(group.id);
      return { groupId: group.id, inputs: staged.inputs.map(item => item.kind === "image" ? { type: "localImage", path: item.path } : { type: "mention", name: item.name, path: item.path }), paths: [] };
    } catch (error) { await inputs.remove(group.id).catch(() => {}); throw error; }
  }
  async function startTurn(payload, device) {
    if (Object.keys(payload).some(key => !["threadId", "cwd", "prompt", "model", "reasoningEffort", "attachments"].includes(key))) throw fail("link_method_payload_rejected", "Unsupported conversation setting");
    if (payload.prompt !== undefined && (typeof payload.prompt !== "string" || payload.prompt.length > 200_000)) throw fail("invalid_link_prompt", "Message is too large");
    const attachments = await prepareAttachments(payload.attachments, device, payload);
    const transport = hostCore.transport;
    let threadId = payload.threadId;
    let dispatched = false;
    try {
      if (threadId !== undefined) { threadId = string(threadId, "threadId", 200); await transport.resumeThread(threadId); }
      else { if (payload.cwd !== undefined && payload.cwd !== transport.cwd) throw fail("invalid_link_workspace", "Choose the desktop workspace", 403); const started = await transport.startThread(); threadId = started.thread?.id; }
      if (!threadId) throw fail("invalid_app_server_response", "The desktop did not return a conversation", 502);
      const prompt = [payload.prompt ?? "", ...attachments.paths.map(value => `Attached file: ${JSON.stringify(value)}`)].filter(Boolean).join("\n\n");
      const overrides = { ...(payload.model ? { model: string(payload.model, "model", 200) } : {}), ...(payload.reasoningEffort ? { effort: string(payload.reasoningEffort, "reasoningEffort", 40) } : {}) };
      // Once sent, a failed response may still follow an accepted turn. Keep
      // its bytes for the existing staged-input orphan lifecycle in that case.
      dispatched = true;
      const response = await transport.startTurn(threadId, prompt, attachments.inputs, overrides);
      const turnId = response.turn?.id;
      if (!turnId) throw fail("invalid_app_server_response", "The desktop did not confirm a turn", 502);
      if (attachments.groupId) trackAttachments(turnId, attachments.groupId);
      return { threadId, turnId, accepted: true };
    } finally { if (!dispatched && attachments.groupId) await inputs.remove(attachments.groupId).catch(() => {}); }
  }
  function trackAttachments(turnId, groupId) {
    const groups = stagedTurns.get(turnId) ?? new Set();
    groups.add(groupId); stagedTurns.set(turnId, groups);
  }
  async function steerTurn(payload, device) {
    if (Object.keys(payload).some(key => !["threadId", "expectedTurnId", "prompt", "attachments"].includes(key))) throw fail("link_method_payload_rejected", "Unsupported conversation setting");
    const threadId = string(payload.threadId, "threadId", 200);
    const expectedTurnId = string(payload.expectedTurnId, "expectedTurnId", 200);
    if (payload.prompt !== undefined && (typeof payload.prompt !== "string" || payload.prompt.length > 200_000)) throw fail("invalid_link_prompt", "Message is too large");
    const attachments = await prepareAttachments(payload.attachments, device, payload);
    if (attachments.groupId) trackAttachments(expectedTurnId, attachments.groupId);
    return hostCore.invoke("steerTurn", { threadId, expectedTurnId, prompt: payload.prompt ?? "", inputs: attachments.inputs });
  }
  async function respond(payload) {
    if (Object.keys(payload).some(key => !["id", "response"].includes(key))) throw fail("invalid_link_response", "Unexpected response fields");
    const pending = await hostCore.invoke("listPendingServerRequests");
    const request = pending.find(item => item.id === payload.id);
    if (!request) throw fail("link_request_expired", "This request was already answered or has expired", 409);
    const result = payload.response?.result;
    if (!record(payload.response) || Object.keys(payload.response).length !== 1 || !record(result)) throw fail("invalid_link_response", "A typed response result is required");
    if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(request.method)) {
      if (Object.keys(result).length !== 1 || !["accept", "decline"].includes(result.decision)) throw fail("link_approval_scope_rejected", "Only allow-once or deny is available from the phone", 403);
      if (Array.isArray(request.params?.availableDecisions) && !request.params.availableDecisions.includes(result.decision)) throw fail("link_approval_scope_rejected", "This decision is not offered by the desktop request", 403);
    } else if (request.method === "item/tool/requestUserInput") {
      if (Object.keys(result).length !== 1 || !record(result.answers)) throw fail("invalid_link_response", "Question answers are required");
      const questions = request.params?.questions;
      if (!Array.isArray(questions)) throw fail("link_request_unsupported", "Answer this request on the desktop", 403);
      const ids = new Set(questions.map(item => item.id));
      if (Object.keys(result.answers).some(id => !ids.has(id))) throw fail("invalid_link_response", "Unknown question");
      for (const answer of Object.values(result.answers)) if (!record(answer) || Object.keys(answer).length !== 1 || !Array.isArray(answer.answers) || answer.answers.length > 20 || answer.answers.some(value => typeof value !== "string" || value.length > 20_000)) throw fail("invalid_link_response", "Invalid question answer");
    } else throw fail("link_request_unsupported", "Answer this request on the desktop", 403);
    return hostCore.invoke("respondToServerRequest", { id: request.id, response: { result } });
  }
  async function dispatch(method, payload, device) {
    if (method === "startTurn") return startTurn(payload, device);
    if (method === "steerTurn") return steerTurn(payload, device);
    if (method === "respondToServerRequest") return respond(payload);
    const allowedKeys = {
      listThreads: ["archived", "limit", "searchTerm", "workspace", "projectKey"], readThread: ["threadId", "includeTurns"], interruptTurn: ["threadId", "turnId"], listPendingServerRequests: [], readCodexModels: [], listThreadWorkspace: ["threadId", "relativePath"], readThreadWorkspaceFile: ["threadId", "relativePath"], readThreadWorkspaceGit: ["threadId"], renameThread: ["threadId", "name"], setArchived: ["threadId", "archived", "confirmed"]
    }[method];
    if (!allowedKeys || Object.keys(payload).some(key => !allowedKeys.includes(key))) throw fail("link_method_payload_rejected", "Unsupported method payload");
    return hostCore.invoke(method, method === "readThread" ? { ...payload, includeTurns: true } : payload);
  }
  async function invoke(device, { method, payload = {}, requestId }) {
    if (!LINK_METHODS.includes(method) || !record(payload)) throw fail("link_method_rejected", "This action is not available to OPL Link", 403);
    if (READ_METHODS.has(method)) return dispatch(method, payload, device);
    const id = string(requestId, "requestId", 128);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(id)) throw fail("invalid_link_request_id", "Use a unique request ID");
    const key = `${device.id}:${id}`; const hash = digest(JSON.stringify(stable({ method, payload })));
    const existing = operations.get(key);
    if (existing) {
      if (existing.hash !== hash) throw fail("link_request_conflict", "This request ID was used for another action", 409);
      if (existing.unknown) throw fail("link_outcome_unknown", "Refresh the conversation before deciding what to do next", 409);
      return existing.promise;
    }
    const operation = { hash, unknown: false };
    if (operations.size >= 10_000) throw fail("link_operation_limit", "Disconnect and reconnect the device after checking its recent actions", 429);
    operations.set(key, operation);
    // Reserve durably before the owner mutation. A restart never replays a reserved request.
    operation.promise = persist().then(() => {
      if (!availableDevice(device.id)) throw fail("link_device_unauthorized", "This device was disconnected", 401);
      return dispatch(method, payload, device);
    });
    // Keep failures as unknown as well; a transport failure can follow an accepted mutation.
    operation.promise.catch(() => { operation.unknown = true; });
    return operation.promise;
  }
  function closeStream(res) { const item = clients.get(res); if (item) clearInterval(item.timer); clients.delete(res); }
  function writeFrame(res, frame) {
    const item = clients.get(res);
    if (!item) return;
    item.bytes = (item.bytes ?? 0) + Buffer.byteLength(frame);
    if (Buffer.byteLength(frame) > 1024 * 1024 || item.bytes > 64 * 1024 * 1024 || !res.write(frame)) { closeStream(res); res.end(); }
  }
  const onEvent = event => {
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const [res, item] of clients) {
      if (!availableDevice(item.deviceId)) { closeStream(res); res.end(); }
      else if (item.events) writeFrame(res, frame);
    }
    if (event.method === "turn/completed") {
      const id = event.params?.turn?.id ?? event.params?.turnId;
      const groups = stagedTurns.get(id);
      if (groups) { stagedTurns.delete(id); for (const group of groups) void inputs.remove(group).catch(() => {}); }
    }
  };
  hostCore.on("event", onEvent);
  async function handle(req, res) {
    try {
      if (closed) throw fail("link_host_closed", "The desktop App is closing", 503);
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      const suffix = pathname.slice("/api/link".length);
      if (securePeers.has(req) && (suffix === "/pair" || suffix === "/devices" || suffix.startsWith("/devices/"))) throw fail("link_remote_management_rejected", "Manage devices in the desktop App", 403);
      if (suffix === "/pair" && req.method === "POST") { requireDesktop(req, true); return sendJson(res, 200, await createPairing(await readJson(req))); }
      if (suffix === "/devices" && req.method === "GET") { requireDesktop(req); return sendJson(res, 200, readDevices()); }
      if (suffix.startsWith("/devices/") && req.method === "DELETE") { requireDesktop(req, true); return sendJson(res, 200, await revokeDevice({ id: decodeURIComponent(suffix.slice(9)) })); }
      if (suffix === "/claim" && req.method === "POST") { assertSecure(req); assertOrigin(req); return sendJson(res, 200, await claim(await readJson(req), securePeers.get(req))); }
      if (suffix === "/account/claim" && req.method === "POST") {
        const context = securePeers.get(req);
        if (!context) throw fail("link_secure_channel_required", "Authenticated desktop channel required", 403);
        return sendJson(res, 200, await accountClaim(await readJson(req), context));
      }
      const device = requireDevice(req);
      if (suffix === "/bootstrap" && req.method === "GET") return sendJson(res, 200, { schema: LINK_SCHEMA, host, cwd: hostCore.transport?.cwd, device: projectDevice(device), capabilities: LINK_METHODS.filter(method => !method.includes("Workspace") || Boolean(hostCore.threadWorkspace)) });
      if (suffix === "/invoke" && req.method === "POST") return sendJson(res, 200, { result: await invoke(device, await readJson(req, MAX_BODY)) });
      // Acknowledge local invalidation through the current Noise connection;
      // the phone then revokes its Relay token through the authenticated REST owner.
      if (suffix === "/disconnect" && req.method === "POST") return sendJson(res, 200, await revokeDevice({ id: device.id }, { revokeRelay: false }));
      if (suffix === "/uploads" && req.method === "POST") return sendJson(res, 200, await uploads.create(device, await readJson(req)));
      if (suffix.startsWith("/uploads/")) {
        const id = decodeURIComponent(suffix.slice(9));
        if (req.method === "PUT") return sendJson(res, 200, await uploads.append(device, id, await readJson(req, 720 * 1024)));
        if (req.method === "GET") return sendJson(res, 200, uploads.inspect(device, id));
        if (req.method === "DELETE") return sendJson(res, 200, await uploads.remove(device, id));
      }
      if (suffix === "/events" && req.method === "GET") {
        res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "connection": "keep-alive", "x-accel-buffering": "no" });
        const timer = setInterval(() => { if (!availableDevice(device.id)) { closeStream(res); res.end(); } else writeFrame(res, ": heartbeat\n\n"); }, heartbeatMs);
        timer.unref?.(); clients.set(res, { deviceId: device.id, timer, events: true, bytes: 0 });
        writeFrame(res, `data: ${JSON.stringify({ method: "host/ready", params: { host, capabilities: LINK_METHODS } })}\n\n`);
        req.once("close", () => closeStream(res)); res.once("close", () => closeStream(res)); return;
      }
      if (suffix === "/download" && req.method === "GET") {
        const query = new URL(req.url, "http://localhost").searchParams;
        if ([...query.keys()].some(key => !["threadId", "relativePath", "offset", "length"].includes(key))) throw fail("invalid_link_download", "Invalid file request");
        const offset = Number(query.get("offset") ?? 0); const length = Number(query.get("length") ?? LINK_CHUNK_BYTES);
        const ifMatch = req.headers["if-match"];
        if (offset > 0 && typeof ifMatch !== "string") throw fail("workspace_file_version_required", "Continue the download with its ETag", 412);
        const file = await hostCore.threadWorkspace.readBytes({ threadId: query.get("threadId"), relativePath: query.get("relativePath"), offset, length, ...(ifMatch ? { ifMatch } : {}) });
        const bytes = Buffer.from(file.data, "base64");
        res.writeHead(200, { "content-type": "application/octet-stream", "content-length": bytes.length, "etag": file.etag, "x-opl-file-size": String(file.sizeBytes), "x-opl-file-offset": String(file.offset), "x-opl-file-eof": String(file.eof), "cache-control": "no-store", "x-content-type-options": "nosniff" });
        res.end(bytes); return;
      }
      if (suffix === "/download" && req.method === "POST") {
        const payload = await readJson(req);
        if (Object.keys(payload).some(key => !["threadId", "relativePath"].includes(key))) throw fail("invalid_link_download", "Invalid file request");
        const file = await hostCore.threadWorkspace.download(payload);
        clients.set(res, { deviceId: device.id, events: false });
        try { res.writeHead(200, { "content-type": "application/octet-stream", "content-length": file.sizeBytes, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`, "cache-control": "no-store", "x-content-type-options": "nosniff" }); await pipeline(file.stream, res); }
        finally { closeStream(res); await file.close(); } return;
      }
      throw fail("link_endpoint_not_found", "Unknown companion endpoint", 404);
    } catch (error) {
      if (res.headersSent) { res.destroy(error); return; }
      sendJson(res, error.httpStatus ?? 500, { error: { code: error.code ?? "link_host_error", message: error.httpStatus ? error.message : "The desktop could not complete this request", details: {} } });
    }
  }
  function register(webServer) {
    const dispose = ["/pair", "/claim", "/account/claim", "/devices", "/bootstrap", "/invoke", "/events", "/download", "/disconnect", "/uploads"].map(suffix => webServer.register({ kind: "exact", path: `/api/link${suffix}`, handler: handle }));
    dispose.push(webServer.register({ kind: "prefix", path: "/api/link/devices/", handler: handle }));
    dispose.push(webServer.register({ kind: "prefix", path: "/api/link/uploads/", handler: handle }));
    return () => { for (const close of dispose.reverse()) close(); };
  }
  async function handleAuthenticatedPeer(req, res, context) {
    if (!context?.connectionId || !context?.peerDeviceId || !context?.peerIdentityKey) throw fail("link_secure_channel_required", "Authenticated desktop channel required", 403);
    securePeers.set(req, context);
    try { return await handle(req, res); } finally { securePeers.delete(req); }
  }
  async function close() { closed = true; pairs.clear(); hostCore.off("event", onEvent); for (const [res] of clients) { closeStream(res); res.end(); } await uploads.close(); await writes; }
  return { createPairing, readDevices, revokeDevice, clearRemoteDevices, handle, handleAuthenticatedPeer, register, close };
}
