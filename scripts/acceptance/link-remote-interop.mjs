import assert from "node:assert/strict";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import WebSocket from "ws";
import { loadWeriftFactory } from "../../vendor/dsh-remote/rtc.mjs";
import { createLinkInternet, LINK_REMOTE_REVISION } from "../../plugins/opl-host-core/src/link-internet.mjs";
import { LINK_VIRTUAL_PORT } from "../../plugins/opl-host-core/src/link-loopback.mjs";
import { IdentityStore, ClientSecureTransport } from "../../vendor/dsh-remote/host.mjs";
import { createWebUiHost } from "../../src/host/http-host.mjs";
import { CodexAppServerTransport } from "../../plugins/opl-codex-native/src/app-server-transport.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argument = name => { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw new Error(`Provide ${name}`); return path.resolve(process.argv[i + 1]); };
const relaySource = argument("--relay-source");
const upstreamSource = argument("--upstream-source");
const forcedFallback = process.argv.includes("--force-fallback");
const relayOnly = process.argv.includes("--relay-only");
assert.equal(execFileSync("git", ["-C", upstreamSource, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), LINK_REMOTE_REVISION);
const temporary = await mkdtemp(path.join(os.tmpdir(), "opl-link-interop-"));
const previousWebSocket = globalThis.WebSocket;
const banner = { js: 'import { createRequire as __createRequire } from "node:module";const require=__createRequire(import.meta.url);' };
let relay; let host; let client;
const holdFile = process.argv.includes("--hold-qr-file") ? argument("--hold-qr-file") : undefined;
let ownsHoldFile = false;
async function pause(ms) { await new Promise(resolve => setTimeout(resolve, ms)); }
async function until(check, label) { for (let i = 0; i < 100; i++) { if (await check()) return; await pause(100); } throw new Error(`Timed out: ${label}`); }
try {
  await build({ entryPoints: [path.join(relaySource, "src/relay.ts")], outfile: path.join(temporary, "relay.mjs"), bundle: true, platform: "node", format: "esm", banner,
    alias: { "@dsh-remote/protocol": path.join(relaySource, "vendor/dsh-remote/packages/protocol/src/index.ts") } });
  await build({ stdin: { contents: `export { AdaptiveTransport } from ${JSON.stringify(path.join(upstreamSource, "packages/webrtc/src/index.ts"))};export { RemoteClientCore } from ${JSON.stringify(path.join(upstreamSource, "packages/client-core/src/index.ts"))};`, resolveDir: root },
    outfile: path.join(temporary, "client.mjs"), bundle: true, platform: "node", format: "esm", banner,
    alias: { "@dsh-remote/protocol": path.join(upstreamSource, "packages/protocol/src/index.ts"), "@dsh-remote/webrtc": path.join(upstreamSource, "packages/webrtc/src/index.ts"), "@dsh-remote/client-core": path.join(upstreamSource, "packages/client-core/src/index.ts") }, nodePaths: [path.join(root, "node_modules")] });
  const { createRelayService } = await import(pathToFileURL(path.join(temporary, "relay.mjs")));
  const { AdaptiveTransport, RemoteClientCore } = await import(pathToFileURL(path.join(temporary, "client.mjs")));
  const turnUrls = (process.env.OPL_LINK_TURN_URLS ?? "").split(",").map(value=>value.trim()).filter(Boolean);
  const turnSecret = process.env.OPL_LINK_TURN_SECRET_FILE ? (await readFile(process.env.OPL_LINK_TURN_SECRET_FILE,"utf8")).trim() : undefined;
  relay = createRelayService({ publicOrigin: "http://127.0.0.1:0", dataDir: path.join(temporary, "relay"), serverSecret: crypto.randomBytes(32), gatewayOrigin: "https://gateway.test", gatewayFetch: async () => new Response(JSON.stringify({ code: 0, data: { id: 101, email: "test@example.com", status: "active", role: "user" } })), allowInsecureLoopbackForTests: true, ice: {stunUrls:[],turnUrls,turnSecret,turnTtlSeconds:300}, logLevel: process.argv.includes("--diagnostics") ? "info" : "silent" });
  if (process.argv.includes("--diagnostics")) {
    relay.server.on("upgrade", req => console.log(JSON.stringify({ stage: "relay_upgrade_observed", path: req.url, hasScope: typeof req.headers["x-opl-account"] === "string", origin: req.headers.origin ?? null })));
    relay.server.on("clientError", error => console.log(JSON.stringify({ stage: "relay_http_parse_error", code: error.code })));
  }
  await new Promise(resolve => relay.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${relay.server.address().port}`;
  const transport = new CodexAppServerTransport({ command: process.execPath, args: [path.join(root, "src/host/fixtures/fake-app-server.mjs")], cwd: temporary, env: { ...process.env, FAKE_WORKSPACE: temporary }, requestTimeoutMs: 2_000 });
  host = await createWebUiHost({ transport, env: { ...process.env, OPL_DATA_DIR: path.join(temporary, "host") }, dshHome: path.join(temporary, "dsh"), opl: { readState: async () => ({}) },
    linkInternetFactory: options => createLinkInternet({ ...options, serviceOrigin: origin, httpAllowlist: ["127.0.0.1"], ...(forcedFallback ? {rtcFactoryProvider:async()=>undefined}:{}), authorize: async ({ device }) => {
      const response = await fetch(`${origin}/api/v1/devices/register`, { method: "POST", headers: { authorization: "Bearer test-gateway-account-token", "content-type": "application/json" }, body: JSON.stringify({ v: 1, device }) });
      assert.equal(response.status, 200);
      return { schema: "opl_link_remote_credentials.v1", ...await response.json(), deviceId: device.deviceId, identityKey: device.identityKey, role: "host" };
    } }) });
  await host.core.invoke("enableLinkInternet");
  await until(() => host.core.linkInternet.status().status === "ready", "Host Relay hello");
  const pairing = await host.core.invoke("createLinkPairing", {});
  if (holdFile) {
    const listing=await host.core.invoke("listThreads",{});const selected=listing.data.find(item=>item.id==="thread-source");assert.ok(selected);const started={thread:await host.core.invoke("readThread",{threadId:selected.id,includeTurns:true})};
    const sample = Buffer.from(Array.from({length:512*1024+31},(_,index)=>index%251)); const samplePath = path.join(temporary, "native-result.bin"); await writeFile(samplePath, sample, { mode: 0o600 });
    await mkdir(path.dirname(holdFile), { recursive: true, mode: 0o700 });
    await writeFile(holdFile, pairing.pairingURL, { mode: 0o600, flag: "wx" });
    ownsHoldFile = true;
    console.log(JSON.stringify({ stage: "native_fixture_ready", pid: process.pid, desktopOrigin: host.url, qrFile: holdFile, threadId: started.thread.id, relativePath: "native-result.bin", sourcePath: samplePath, expiresAt: pairing.expiresAt, transportPolicy:"direct_first", publicInternet: false }));
    let reading=false;let previous;
    const metrics=setInterval(()=>{if(reading)return;reading=true;void host.core.linkInternet.readTransportEvidence().then(transportEvidence=>{if(transportEvidence&&JSON.stringify(transportEvidence)!==previous){previous=JSON.stringify(transportEvidence);console.log(JSON.stringify({stage:"native_public_transport_observed",pid:process.pid,transportEvidence}));}}).finally(()=>{reading=false;});},1000);metrics.unref();
    await new Promise(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
    clearInterval(metrics); process.exitCode = 0;
  } else {
  const identities = new IdentityStore({ directory: path.join(temporary, "phone"), role: "client" });
  const identity = await identities.loadOrCreate("Interop iPhone");
  const enrollment = await fetch(`${origin}/api/v1/link/enroll`, { method: "POST", headers: { "content-type": "application/json", "X-OPL-Account": pairing.accountScope }, body: JSON.stringify({ enrollmentToken: new URL(pairing.pairingURL).searchParams.get("enrollmentToken"), device: { deviceId: identity.deviceId, name: identity.name, role: "client", platform: "ios", identityKey: identity.publicKey, clientVersion: "0.6.5" } }) });
  assert.equal(enrollment.status, 200); const credentials = await enrollment.json();
  globalThis.WebSocket = class ScopedWebSocket extends WebSocket { constructor(url) { super(url, { headers: { "X-OPL-Account": pairing.accountScope }, perMessageDeflate: false }); } };
  async function connect(forceRelay = relayOnly) {
    let fallback = false;
    const factory = forceRelay ? undefined : await loadWeriftFactory({routeTargets:[origin]});
    if (!forceRelay && !factory) throw new Error("The bundled official RTC backend could not load");
    const inner = new AdaptiveTransport(`${origin.replace("http:", "ws:")}/ws/v1/connect`, { role: "client", deviceId: identity.deviceId, accessToken: credentials.accessToken, targetDeviceId: pairing.hostDeviceId, forceRelay,
      capabilities:forceRelay?["transport.relay"]:["transport.lan","transport.p2p","transport.turn","transport.relay"],preferredTransports:forceRelay?["relay"]:["lan","p2p","turn","relay"],rtcFactory:factory,negotiateTimeoutMs:forcedFallback?1000:4000,
      fetchIceServers:async connectionId=>{const response=await fetch(`${origin}/api/v1/turn/credentials?connection_id=${encodeURIComponent(connectionId)}`,{headers:{authorization:`Bearer ${credentials.accessToken}`,"X-OPL-Account":pairing.accountScope}});assert.equal(response.status,200);return (await response.json()).iceServers;},onWebRtcFallback:()=>{fallback=true;}
    });
    const remote = new RemoteClientCore(new ClientSecureTransport(inner, identity, { deviceId: pairing.hostDeviceId, publicKey: pairing.hostIdentityKey }), 5000);
    await remote.connect();
    if (fallback && !forceRelay) {
      await remote.close();
      if (!forcedFallback) throw new Error("Direct qualification fell back before proving an ICE candidate path");
      return connect(true); // A new control connection and Noise session precede business requests.
    }
    return remote;
  }
  client = await connect();
  async function request(route, { method = "GET", body, token, headers = [] } = {}) {
    const id = crypto.randomUUID();
    const head = await client.rpc("loopback.call", { op: "http.open", id, port: LINK_VIRTUAL_PORT, path: route, method, headers: [...headers, ...(token ? [["authorization", `Bearer ${token}`]] : []), ...(body ? [["content-type", "application/json"]] : [])], ...(body ? { body: Buffer.from(JSON.stringify(body)).toString("base64") } : {}) });
    const chunks = [];
    for (;;) { const part = await client.rpc("loopback.call", { op: "http.read", id }); if (part.data) chunks.push(Buffer.from(part.data, "base64")); if (part.done) break; }
    const bytes = Buffer.concat(chunks); let json; try { json = JSON.parse(bytes); } catch {}
    return { ...head, headers: Object.fromEntries(head.headers), bytes, json };
  }
  const claim = await request("/api/link/claim", { method: "POST", body: { code: pairing.code, deviceName: "Interop iPhone" } }); assert.equal(claim.status, 200); const token = claim.json.token;
  assert.equal((await request("/api/link/bootstrap", { token })).json.host.id, host.core.linkCompanion.readDevices().host.id);
  const invoke = (method, payload, requestId = crypto.randomUUID()) => request("/api/link/invoke", { method: "POST", token, body: { method, payload, requestId } });
  const mutationId = crypto.randomUUID(); const mutationPayload = { prompt: "Continue this canonical thread" };
  let turnDispatches = 0; const originalStartTurn = host.core.transport.startTurn.bind(host.core.transport);
  host.core.transport.startTurn = (...args) => { turnDispatches++; return originalStartTurn(...args); };
  const accepted = await invoke("startTurn", mutationPayload, mutationId); assert.equal(accepted.status, 200); const threadId = accepted.json.result.threadId;
  assert.ok((await invoke("readThread", { threadId })).json.result);
  assert.ok(await host.core.threads.readThread({ threadId }));
  const file = crypto.randomBytes(512 * 1024 + 31); const sha256 = crypto.createHash("sha256").update(file).digest("hex");
  const uploaded = await request("/api/link/uploads", { method: "POST", token, body: { requestId: crypto.randomUUID(), threadId, name: "interop.bin", mimeType: "application/octet-stream", size: file.length, sha256 } }); assert.equal(uploaded.status, 200);
  for (let offset = 0; offset < file.length; offset += 512 * 1024) assert.equal((await request(`/api/link/uploads/${uploaded.json.id}`, { method: "PUT", token, body: { offset, base64: file.subarray(offset, offset + 512 * 1024).toString("base64") } })).status, 200);
  assert.equal((await invoke("startTurn", { threadId, prompt: "Use this attachment", attachments: [{ uploadId: uploaded.json.id }] })).status, 200);
  await writeFile(path.join(temporary, "interop-result.bin"), file);
  const download = `/api/link/download?threadId=${encodeURIComponent(threadId)}&relativePath=interop-result.bin&length=524288`;
  const first = await request(`${download}&offset=0`, { token }); assert.equal(first.status, 200);
  const last = await request(`${download}&offset=524288`, { token, headers: [["if-match", first.headers.etag]] }); assert.equal(last.status, 200); assert.deepEqual(Buffer.concat([first.bytes, last.bytes]), file);
  const transportEvidence = await host.core.linkInternet.readTransportEvidence();
  assert.ok(transportEvidence,"The Host must observe authenticated byte counters and an actual selected path");
  if(forcedFallback){assert.equal(transportEvidence.selectedTransport,"relay");assert.equal(transportEvidence.relayFallback,true);assert.equal(transportEvidence.directAttempted,true);}
  else if(!relayOnly){assert.ok(["lan","p2p"].includes(transportEvidence.selectedTransport));assert.equal(transportEvidence.candidatePairState,"succeeded");assert.notEqual(transportEvidence.localCandidateType,"relay");assert.notEqual(transportEvidence.remoteCandidateType,"relay");}
  await client.close(); client = await connect(forcedFallback||relayOnly);
  assert.equal((await invoke("readThread", { threadId })).status, 200);
  const beforeReplay = turnDispatches;
  assert.deepEqual((await invoke("startTurn", mutationPayload, mutationId)).json.result, accepted.json.result);
  assert.equal(turnDispatches, beforeReplay);
  await host.core.invoke("revokeLinkDevice", { id: claim.json.device.id });
  assert.equal((await fetch(`${origin}/api/v1/me`, { headers: { authorization: `Bearer ${credentials.accessToken}`, "X-OPL-Account": pairing.accountScope } })).status, 401);
  assert.equal((await host.core.invoke("readLinkDevices")).devices.length, 0);
  const result = { schema: "opl_link_remote_interop.v1", upstreamRevision: LINK_REMOTE_REVISION, actualRelay: true, transportPolicy:"direct_first", transportEvidence, actualDshHost: true, officialNoiseAndFragmentation: true, sameCanonicalThread: true, chunkUploadAndRangedDownload: true, freshNoiseReconnect: true, noDuplicateMutationAfterReconnect: true, relayAndBusinessRevocation: true, publicInternet: false, nativeIos: false };
  const output = path.join(root, "output/link-remote-interop"); await mkdir(output, { recursive: true }); await writeFile(path.join(output, "result.json"), `${JSON.stringify(result, null, 2)}\n`); console.log(JSON.stringify(result));
  }
} finally {
  await client?.close().catch(() => {}); await host?.close(); await relay?.close(); globalThis.WebSocket = previousWebSocket; if (ownsHoldFile) await rm(holdFile, { force: true }); await rm(temporary, { recursive: true, force: true });
}
