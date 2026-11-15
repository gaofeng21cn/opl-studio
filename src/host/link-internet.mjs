import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import WebSocket from "ws";
import { ConnectionController, HostServerApi, HostServerConnection, IdentityStore, RpcRouter, ServerCredentialStore, resolveConfig } from "./vendor/dsh-remote/host.mjs";
import { LinkLoopback } from "./link-loopback.mjs";
import { ThreadAdapterError } from "./thread-adapter.mjs";
import { loadNodeRtcFactory } from "./vendor/dsh-remote/rtc.mjs";
import { createLinkTransportEvidence } from "./link-transport-evidence.mjs";

export const LINK_SERVICE_ORIGIN = "https://link.medopl.com";
export const LINK_REMOTE_REVISION = "f214c5abb39434d0e8358956bfca8d4529981fee";
const fail = (code, message, status = 400) => new ThreadAdapterError(code, message, {}, status);
const noop = () => {};
const logger = { debug: noop, info: noop, warn: noop, error: noop };
const ACCOUNT_ERRORS = new Set(["link_account_required", "AUTH_REQUIRED", "AUTH_INVALID", "TOKEN_EXPIRED", "DEVICE_REVOKED", "MEMBERSHIP_REQUIRED"]);

export async function authorizeLinkHost({ device, env }) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "opl-link-authorize-"));
  const credentialFile = path.join(temporary, "credential.json");
  try {
    await chmod(temporary, 0o700);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(env.OPL_APP_OPL_BIN ?? "opl", ["connect", "gateway", "authorize-companion", "--request-stdin", "--credential-file", credentialFile, "--json"], { env, stdio: ["pipe", "pipe", "pipe"] });
      const stdout = []; const stderr = []; let bytes = 0; let ended = false;
      const timer = setTimeout(() => { child.kill("SIGKILL"); finish(fail("link_authorization_timeout", "Account authorization timed out. Try again.", 503)); }, 60_000);
      function finish(error, value) { if (ended) return; ended = true; clearTimeout(timer); error ? reject(error) : resolve(value); }
      function append(target, chunk) {
        bytes += chunk.length;
        if (bytes > 64 * 1024) { child.kill("SIGKILL"); finish(fail("link_authorization_failed", "Could not enable phone access", 503)); }
        else target.push(chunk);
      }
      child.stdout.on("data", chunk => append(stdout, chunk));
      child.stderr.on("data", chunk => append(stderr, chunk));
      child.once("error", () => finish(fail("link_authorization_unavailable", "Update OPL App to enable phone access", 503)));
      child.once("close", code => {
        let value; let errorValue;
        try { value = JSON.parse(Buffer.concat(stdout).toString("utf8")); } catch {}
        try { errorValue = JSON.parse(Buffer.concat(stderr).toString("utf8")); } catch {}
        if (code === 0) finish(undefined, value);
        else {
          const reasonFrom = body => body?.details?.reason_code ?? body?.error?.details?.reason_code ?? body?.error?.code ?? body?.error_code ?? body?.code ?? body?.reason_code;
          const reason = reasonFrom(errorValue) ?? reasonFrom(value);
          finish(fail(/login|sign.?in|auth.*(?:required|expired)|reauth_required|account.*required|credential.*missing|managed_key_missing/i.test(reason ?? "") ? "link_account_required" : "link_authorization_failed", "Open OPL Account in Settings, then enable phone access again.", 401));
        }
      });
      child.stdin.on("error", noop);
      child.stdin.end(JSON.stringify({ service: "opl_link", device }));
    });
    const info = await lstat(credentialFile);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600 || info.size > 16 * 1024) throw fail("link_credentials_invalid", "Phone access credentials could not be verified", 503);
    const credentials = JSON.parse(await readFile(credentialFile, "utf8"));
    if (result?.ok === false) throw fail("link_authorization_failed", "Could not enable phone access", 503);
    return credentials;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

/** The official Remote carrier feeds only the existing Link owner, with one Noise identity. */
export async function createLinkInternet({ env = process.env, handle, authorize = authorizeLinkHost, serviceOrigin = LINK_SERVICE_ORIGIN, fetchImplementation = fetch, webSocketFactory, httpAllowlist = [], rtcFactoryProvider = () => loadNodeRtcFactory({ routeTargets: [serviceOrigin] }) } = {}) {
  const directory = path.join(env.OPL_DATA_DIR ?? os.homedir(), ".opl-studio", "link-remote");
  const metadataFile = path.join(directory, "link-host.json");
  const identities = new IdentityStore({ directory, role: "host" });
  const store = new ServerCredentialStore(directory);
  const evidence = createLinkTransportEvidence();
  let identity; let metadata; let api; let connections; let connection; let operation; let errorCode; let identityError; let closed = false;
  async function saveMetadata(value) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${metadataFile}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 }); await rename(temporary, metadataFile); await chmod(metadataFile, 0o600); metadata = value;
  }
  function status() {
    const reasonCode = errorCode ?? connection?.lastError();
    return { status: closed ? "disabled" : ACCOUNT_ERRORS.has(reasonCode) ? "account_required" : reasonCode ? "error" : !metadata?.enabled ? "disabled" : connection?.isOnline() ? "ready" : connection?.isReconnecting() ? "reconnecting" : "connecting",
      ...(reasonCode ? { reasonCode } : {}) };
  }
  function scopedFetch(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.origin !== serviceOrigin || !url.pathname.startsWith("/api/v1/")) throw fail("link_service_origin_rejected", "Untrusted phone access service", 403);
    const headers = new Headers(init.headers); headers.set("X-OPL-Account", metadata.accountScope);
    return fetchImplementation(input, { ...init, headers, redirect: "error" });
  }
  async function startCarrier() {
    if (connection) return;
    if (!await store.load(serviceOrigin, identity.deviceId)) throw fail("link_account_required", "Enable phone access with your OPL account", 401);
    api = new HostServerApi(serviceOrigin, store, scopedFetch, "host", httpAllowlist); api.bindIdentity(identity);
    class LinkRouter extends RpcRouter {
      handle(message) {
        if (message.type !== "rpc.request" || message.payload?.method !== "loopback.call") return super.handle({ ...message, payload: { method: "opl.link.unavailable", params: {} } });
        return super.handle(message);
      }
    }
    connections = new ConnectionController(identities, context => new LinkRouter(32, logger, undefined, undefined, () => [], undefined, undefined, new LinkLoopback({ context, handle })), logger);
    const config = resolveConfig({ enabled: true, role: "host", serverUrl: serviceOrigin, httpServerAllowlist: httpAllowlist, forceRelay: false, rotatePinnedPeerKey: false, terminal: { enabled: false }, remoteTools: { enabled: false }, hostControl: { enabled: false }, loopback: { ports: [] }, codex: { enabled: false }, cursor: { enabled: false }, reconnect: true });
    const makeSocket = url => {
      const incoming = new URL(url); const expected = new URL(serviceOrigin);
      if (incoming.origin !== `${expected.protocol === "https:" ? "wss:" : "ws:"}//${expected.host}`) throw fail("link_service_origin_rejected", "Untrusted phone access service", 403);
      const options = { headers: { "X-OPL-Account": metadata.accountScope }, perMessageDeflate: false, followRedirects: false };
      return evidence.observeSocket(webSocketFactory ? webSocketFactory(url, options) : new WebSocket(url, options));
    };
    connection = new HostServerConnection(config, identity, identities, api, connections, logger, makeSocket, async () => { const factory = await rtcFactoryProvider(); return factory ? evidence.wrapFactory(factory) : undefined; }, () => []);
    connection.start();
  }
  function validateCredentials(value) {
    const keys = ["schema", "serverUrl", "accountScope", "deviceId", "identityKey", "role", "accessToken", "accessTokenExpiresAt", "refreshToken", "refreshTokenExpiresAt"];
    if (!value || Object.keys(value).some(key => !keys.includes(key)) || value.schema !== "opl_link_remote_credentials.v1" || value.serverUrl !== serviceOrigin || value.deviceId !== identity.deviceId || value.identityKey !== identity.publicKey || value.role !== "host" || !/^[A-Za-z0-9_-]{43}$/.test(value.accountScope ?? "") || typeof value.accessToken !== "string" || value.accessToken.length < 16 || typeof value.refreshToken !== "string" || value.refreshToken.length < 16 || !Number.isSafeInteger(value.accessTokenExpiresAt) || value.accessTokenExpiresAt <= Date.now() || !Number.isSafeInteger(value.refreshTokenExpiresAt) || value.refreshTokenExpiresAt <= value.accessTokenExpiresAt) throw fail("link_credentials_invalid", "Phone access credentials did not match this App", 503);
    if (metadata?.accountScope && metadata.accountScope !== value.accountScope) throw fail("link_account_changed", "Disconnect the existing phone access before changing its account", 409);
  }
  async function enable() {
    if (closed) throw fail("link_host_closed", "The App is closing", 503);
    if (identityError) throw identityError;
    if (operation) return operation;
    operation = (async () => {
      errorCode = undefined;
      identity ??= await identities.loadOrCreate(env.OPL_LINK_HOST_NAME || os.hostname());
      if (!metadata?.enabled || ACCOUNT_ERRORS.has(connection?.lastError()) || !await store.load(serviceOrigin, identity.deviceId)) {
        const credentials = await authorize({ device: { deviceId: identity.deviceId, name: identity.name, role: "host", platform: process.platform, identityKey: identity.publicKey, clientVersion: "0.6.5" }, env });
        validateCredentials(credentials);
        await store.save({ serverUrl: serviceOrigin, deviceId: identity.deviceId, authorizationMethod: "account", accessToken: credentials.accessToken, accessTokenExpiresAt: credentials.accessTokenExpiresAt, refreshToken: credentials.refreshToken, refreshTokenExpiresAt: credentials.refreshTokenExpiresAt });
        await saveMetadata({ schema: "opl_link_remote_host.v1", enabled: true, serverUrl: serviceOrigin, accountScope: credentials.accountScope, deviceId: identity.deviceId, identityKey: identity.publicKey });
        await connection?.stop(); await connections?.close(); api?.close(); connection = undefined;
      }
      await startCarrier(); return status();
    })().catch(error => { errorCode = error.code ?? "link_connection_failed"; throw error; }).finally(() => { operation = undefined; });
    return operation;
  }
  async function request(route, { method = "GET", body } = {}) {
    if (!api || !identity) throw fail("link_not_enabled", "Enable phone access in OPL App", 409);
    const credentials = await api.authenticate(identity);
    const response = await scopedFetch(`${serviceOrigin}${route}`, { method, headers: { authorization: `Bearer ${credentials.accessToken}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw fail("link_service_unavailable", "Phone access could not complete this request. Try again.", response.status === 401 ? 401 : 503);
    return response.json();
  }
  async function createInvitation() {
    if (!metadata?.enabled) await enable();
    if (!connection?.isOnline()) throw fail("link_host_connecting", "The App is connecting. Try again in a moment.", 409);
    const invitation = await request("/api/v1/link/invitations", { method: "POST", body: { ttlSeconds: 120 } });
    if (typeof invitation.enrollmentToken !== "string" || !Number.isSafeInteger(invitation.expiresAt) || invitation.expiresAt <= Date.now()) throw fail("link_invitation_invalid", "Could not generate a connection code", 502);
    return { serverUrl: serviceOrigin, accountScope: metadata.accountScope, hostDeviceId: identity.deviceId, hostIdentityKey: identity.publicKey, enrollmentToken: invitation.enrollmentToken, expiresAt: invitation.expiresAt };
  }
  async function revoke(deviceId) {
    await connections?.revoke(deviceId);
    await request(`/api/v1/link/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
  }
  async function reconnect() { await enable(); connection?.reconnect(); return status(); }
  async function close() { closed = true; await operation?.catch(noop); await connection?.stop(); await connections?.close(); api?.close(); }
  try {
    metadata = JSON.parse(await readFile(metadataFile, "utf8"));
    if (metadata.schema !== "opl_link_remote_host.v1" || metadata.serverUrl !== serviceOrigin || !/^[A-Za-z0-9_-]{43}$/.test(metadata.accountScope ?? "")) throw fail("link_host_identity_invalid", "Existing phone access needs repair", 503);
    identity = await identities.loadExisting();
    if (!identity || identity.deviceId !== metadata.deviceId || identity.publicKey !== metadata.identityKey) throw fail("link_host_identity_invalid", "Existing phone access identity changed", 503);
    // loadExisting verifies the files; loadOrCreate initializes the official
    // store and restores peer pins needed by trustPeer on the next connection.
    identity = await identities.loadOrCreate(identity.name);
    if (identity.deviceId !== metadata.deviceId || identity.publicKey !== metadata.identityKey) throw fail("link_host_identity_invalid", "Existing phone access identity changed", 503);
    if (metadata.enabled) await startCarrier();
  } catch (error) { if (error.code !== "ENOENT") { errorCode = error.code ?? "link_host_identity_invalid"; if (errorCode !== "link_account_required") identityError = error; } }
  return { status, enable, reconnect, createInvitation, revoke, close, readTransportEvidence: () => evidence.read({ authenticated: connections?.isOnline() === true, relayConnected: connections?.connectedPeers().some(peer => peer.mode === "Relay") === true }) };
}
