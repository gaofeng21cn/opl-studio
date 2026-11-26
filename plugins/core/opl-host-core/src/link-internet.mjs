import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { chmod, lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import WebSocket from "ws";
import { ConnectionController, HostServerApi, HostServerConnection, IdentityStore, RpcRouter, ServerCredentialStore, resolveConfig } from "../../../../vendor/dsh-remote/host.mjs";
import { LinkLoopback } from "./link-loopback.mjs";
import { ThreadAdapterError } from "@gaofeng21cn/opl-host-contracts/thread-error";
import { loadNodeRtcFactory } from "../../../../vendor/dsh-remote/rtc.mjs";
import { createLinkTransportEvidence } from "./link-transport-evidence.mjs";

export const LINK_SERVICE_ORIGIN = "https://link.medopl.com";
export const LINK_REMOTE_REVISION = "f214c5abb39434d0e8358956bfca8d4529981fee";
const fail = (code, message, status = 400) => new ThreadAdapterError(code, message, {}, status);
const noop = () => {};
const runFile = promisify(execFile);
const ACCOUNT_RECHECK_MS = 30_000;

export async function readLinkGatewayAccount(env) {
  const { stdout } = await runFile(env.OPL_APP_OPL_BIN ?? "opl", ["connect", "gateway", "status", "--json"], {
    env, timeout: 5_000, maxBuffer: 64 * 1024
  });
  const { gateway_account: account } = JSON.parse(stdout);
  if (account?.surface_kind !== "opl_gateway_account_read_model.v1") throw new Error("Unable to read the OPL Gateway account");
  if (account.connection_mode !== "account" || ["not_connected", "reauth_required", "disconnect_pending"].includes(account.status)) return null;
  if (!account.account?.email || account.account.status !== "active") return null;
  // The cache tells us when to re-check. The Relay authorizes the stable Gateway ID.
  return crypto.createHash("sha256").update(account.account.email.trim().toLowerCase()).digest("hex");
}
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
export async function createLinkInternet({ env = process.env, handle, authorize = authorizeLinkHost, readAccount, onAccountChanged = async () => {}, serviceOrigin = LINK_SERVICE_ORIGIN, fetchImplementation = fetch, webSocketFactory, httpAllowlist = [], rtcFactoryProvider = () => loadNodeRtcFactory({ routeTargets: [serviceOrigin] }) } = {}) {
  const directory = path.join(env.OPL_DATA_DIR ?? os.homedir(), ".opl-studio", "link-remote");
  const deviceName = env.OPL_LINK_HOST_NAME || os.hostname();
  const metadataFile = path.join(directory, "link-host.json");
  const identities = new IdentityStore({ directory, role: "host" });
  const store = new ServerCredentialStore(directory);
  const evidence = createLinkTransportEvidence();
  let identity;
  let metadata;
  let api;
  let connections;
  let connection;
  let retriedReplacement = false;
  let accountFingerprint;
  let discoverable = false;
  let suspended = Boolean(readAccount);
  let timer;
  let operation = Promise.resolve();
  let refresh;
  let errorCode;
  let identityError;
  let closed = false;
  async function saveMetadata(value) {
    await writeFileAtomic(metadataFile, JSON.stringify(value), { mode: 0o600, dirMode: 0o700 });
    metadata = value;
  }
  function status() {
    const reasonCode = errorCode ?? connection?.lastError();
    const enabled = !closed && (metadata?.enabled ?? Boolean(readAccount));
    return { status: closed || metadata?.enabled === false ? "disabled" : ACCOUNT_ERRORS.has(reasonCode) ? "account_required" : reasonCode ? "error" : !metadata?.enabled && !readAccount ? "disabled" : connection?.isOnline() && !suspended ? "ready" : connection?.isReconnecting() ? "reconnecting" : "connecting",
      enabled, ...(reasonCode ? { reasonCode } : {}) };
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
    retriedReplacement = false;
    connection.start();
  }
  function validateCredentials(value) {
    const keys = ["schema", "serverUrl", "accountScope", "deviceId", "identityKey", "role", "accessToken", "accessTokenExpiresAt", "refreshToken", "refreshTokenExpiresAt"];
    if (!value || Object.keys(value).some(key => !keys.includes(key)) || value.schema !== "opl_link_remote_credentials.v1" || value.serverUrl !== serviceOrigin || value.deviceId !== identity.deviceId || value.identityKey !== identity.publicKey || value.role !== "host" || !/^[A-Za-z0-9_-]{43}$/.test(value.accountScope ?? "") || typeof value.accessToken !== "string" || value.accessToken.length < 16 || typeof value.refreshToken !== "string" || value.refreshToken.length < 16 || !Number.isSafeInteger(value.accessTokenExpiresAt) || value.accessTokenExpiresAt <= Date.now() || !Number.isSafeInteger(value.refreshTokenExpiresAt) || value.refreshTokenExpiresAt <= value.accessTokenExpiresAt) throw fail("link_credentials_invalid", "Phone access credentials did not match this App", 503);
  }
  function enqueue(action) {
    const next = operation.catch(noop).then(() => {
      if (closed) throw fail("link_host_closed", "The App is closing", 503);
      return action();
    });
    operation = next;
    return next;
  }
  async function request(route, { method = "GET", body, allowUnsupported = false } = {}) {
    if (!api || !identity) throw fail("link_not_enabled", "Enable phone access in OPL App", 409);
    const credentials = await api.authenticate(identity);
    const response = await scopedFetch(`${serviceOrigin}${route}`, { method, headers: { authorization: `Bearer ${credentials.accessToken}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      await response.body?.cancel().catch(noop);
      if (response.status === 404 && allowUnsupported) return null;
      if ([401, 403, 404].includes(response.status)) throw fail("link_device_unauthorized", "This phone is not authorized for this computer", response.status === 401 ? 401 : 403);
      throw fail("link_service_unavailable", "Phone access could not complete this request. Try again.", 503);
    }
    return response.json();
  }
  async function setDiscovery(enabled) {
    const result = await request("/api/v1/link/account/host", { method: "PUT", body: { enabled }, allowUnsupported: true });
    discoverable = enabled && result !== null;
  }
  async function stopCarrier({ unpublish = false } = {}) {
    // Fence new requests before awaiting network or transport shutdown.
    suspended = true;
    discoverable = false;
    const publication = unpublish && api ? setDiscovery(false).catch(noop) : undefined;
    await connection?.stop();
    await connections?.close();
    await publication;
    api?.close();
    api = undefined;
    connections = undefined;
    connection = undefined;
  }
  async function withdrawSavedHost() {
    if (!api && metadata?.accountScope && identity && await store.load(serviceOrigin, identity.deviceId)) {
      api = new HostServerApi(serviceOrigin, store, scopedFetch, "host", httpAllowlist);
      api.bindIdentity(identity);
    }
    await stopCarrier({ unpublish: true });
  }
  async function activate(force = false) {
    if (identityError) throw identityError;
    identity ??= await identities.loadOrCreate(deviceName);
    if (force || !metadata?.enabled || ACCOUNT_ERRORS.has(connection?.lastError()) || !await store.load(serviceOrigin, identity.deviceId)) {
      const credentials = await authorize({ device: { deviceId: identity.deviceId, name: identity.name, role: "host", platform: process.platform, identityKey: identity.publicKey, clientVersion: "0.6.5" }, env });
      validateCredentials(credentials);
      if (closed) return;
      if (metadata?.accountScope && metadata.accountScope !== credentials.accountScope) {
        await stopCarrier({ unpublish: true });
        await onAccountChanged();
      } else if (connection) {
        await stopCarrier();
      }
      await store.save({ serverUrl: serviceOrigin, deviceId: identity.deviceId, authorizationMethod: "account", accessToken: credentials.accessToken, accessTokenExpiresAt: credentials.accessTokenExpiresAt, refreshToken: credentials.refreshToken, refreshTokenExpiresAt: credentials.refreshTokenExpiresAt });
      await saveMetadata({ schema: "opl_link_remote_host.v1", enabled: true, serverUrl: serviceOrigin, accountScope: credentials.accountScope, deviceId: identity.deviceId, identityKey: identity.publicKey });
    }
    await startCarrier();
    suspended = false;
    if (readAccount && !discoverable) await setDiscovery(true);
  }
  async function syncAccount({ reset = false, explicit = false } = {}) {
    if (metadata?.enabled === false && !explicit) return status();
    if (explicit && metadata?.enabled === false) await saveMetadata({ ...metadata, enabled: true });
    errorCode = undefined;
    try {
      const nextAccount = await readAccount();
      if (closed) return status();
      if (!nextAccount) {
        await withdrawSavedHost();
        accountFingerprint = undefined;
        errorCode = "link_account_required";
        return status();
      }
      const changed = nextAccount !== accountFingerprint;
      if (changed || reset) await withdrawSavedHost();
      await activate(changed || reset);
      accountFingerprint = nextAccount;
      // Let an interrupted startup recover once without competing indefinitely
      // with another process that holds the same Host identity.
      if (!explicit && !retriedReplacement && connection?.lastError() === "CONNECTION_REPLACED") {
        retriedReplacement = true;
        connection.resume();
      }
    } catch (error) {
      errorCode = error.code ?? "link_connection_failed";
      if (ACCOUNT_ERRORS.has(errorCode)) await stopCarrier({ unpublish: true });
      if (explicit) throw error;
    }
    return status();
  }
  function synchronizeAccount({ reset = false } = {}) {
    if (!readAccount || closed) return Promise.resolve(status());
    if (reset) suspended = true;
    if (refresh && !reset) return refresh;
    const current = enqueue(() => syncAccount({ reset })).finally(() => { if (refresh === current) refresh = undefined; });
    refresh = current;
    return current;
  }
  function startAccountLifecycle() {
    if (!readAccount || timer) return;
    void synchronizeAccount().catch(noop);
    timer = setInterval(() => { void synchronizeAccount().catch(noop); }, ACCOUNT_RECHECK_MS);
    timer.unref?.();
  }
  function enable() {
    return enqueue(async () => {
      if (readAccount) return syncAccount({ explicit: true });
      try { errorCode = undefined; await activate(); return status(); }
      catch (error) { errorCode = error.code ?? "link_connection_failed"; throw error; }
    });
  }
  function disable() {
    suspended = true;
    return enqueue(async () => {
      await saveMetadata(metadata ? { ...metadata, enabled: false } : { schema: "opl_link_remote_host.v1", enabled: false, serverUrl: serviceOrigin });
      await stopCarrier({ unpublish: true });
      errorCode = undefined;
      return status();
    });
  }
  function isRemoteAccessEnabled() {
    return !closed && !suspended && metadata?.enabled === true;
  }
  async function verifyAccountGrant({ peerDeviceId, peerIdentityKey }) {
    if (!discoverable || !isRemoteAccessEnabled()) throw fail("link_device_unauthorized", "Phone access is unavailable", 403);
    const current = connection;
    const result = await request(`/api/v1/link/account/grants/${encodeURIComponent(peerDeviceId)}`);
    if (!discoverable || !isRemoteAccessEnabled() || current !== connection || result?.authorized !== true || result.identityKey !== peerIdentityKey) {
      throw fail("link_device_unauthorized", "This phone is not authorized for this computer", 403);
    }
  }
  async function createInvitation() {
    if (metadata?.enabled === false) throw fail("link_not_enabled", "Enable phone access in OPL App", 409);
    if (!metadata?.enabled) await enable();
    if (!isRemoteAccessEnabled() || !connection?.isOnline()) throw fail("link_host_connecting", "The App is connecting. Try again in a moment.", 409);
    const invitation = await request("/api/v1/link/invitations", { method: "POST", body: { ttlSeconds: 120 } });
    if (typeof invitation.enrollmentToken !== "string" || !Number.isSafeInteger(invitation.expiresAt) || invitation.expiresAt <= Date.now()) throw fail("link_invitation_invalid", "Could not generate a connection code", 502);
    return { serverUrl: serviceOrigin, accountScope: metadata.accountScope, hostDeviceId: identity.deviceId, hostIdentityKey: identity.publicKey, enrollmentToken: invitation.enrollmentToken, expiresAt: invitation.expiresAt };
  }
  async function revoke(deviceId) {
    await connections?.revoke(deviceId);
    await request(`/api/v1/link/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
  }
  async function reconnect() {
    if (metadata?.enabled === false) return status();
    const wasReplaced = connection?.lastError() === "CONNECTION_REPLACED";
    if (readAccount) await synchronizeAccount();
    else await enable();
    if (isRemoteAccessEnabled() && !(wasReplaced && connection?.lastError() !== "CONNECTION_REPLACED")) {
      connection?.reconnect();
    }
    return status();
  }
  async function close() {
    closed = true;
    clearInterval(timer);
    await operation.catch(noop);
    await stopCarrier();
  }
  const carrier = { status, enable, disable, reconnect, createInvitation, revoke, close, startAccountLifecycle, synchronizeAccount, isRemoteAccessEnabled, verifyAccountGrant,
    readTransportEvidence: () => evidence.read({ authenticated: connections?.isOnline() === true, relayConnected: connections?.connectedPeers().some(peer => peer.mode === "Relay") === true }) };
  try {
    metadata = JSON.parse(await readFile(metadataFile, "utf8"));
    const hasEnrollment = [metadata.accountScope, metadata.deviceId, metadata.identityKey].some(value => value !== undefined);
    if (metadata.schema !== "opl_link_remote_host.v1" || metadata.serverUrl !== serviceOrigin || typeof metadata.enabled !== "boolean" || ((hasEnrollment || (metadata.enabled && !readAccount)) && !/^[A-Za-z0-9_-]{43}$/.test(metadata.accountScope ?? ""))) throw fail("link_host_identity_invalid", "Existing phone access needs repair", 503);
    if (!metadata.accountScope) return carrier;
    identity = await identities.loadExisting();
    if (!identity || identity.deviceId !== metadata.deviceId || identity.publicKey !== metadata.identityKey) throw fail("link_host_identity_invalid", "Existing phone access identity changed", 503);
    // The official store updates the display name in place and restores peer pins.
    identity = await identities.loadOrCreate(deviceName);
    if (identity.deviceId !== metadata.deviceId || identity.publicKey !== metadata.identityKey) throw fail("link_host_identity_invalid", "Existing phone access identity changed", 503);
    if (metadata.enabled && !readAccount) await startCarrier();
  } catch (error) { if (error.code !== "ENOENT") { errorCode = error.code ?? "link_host_identity_invalid"; if (errorCode !== "link_account_required") identityError = error; } }
  return carrier;
}
