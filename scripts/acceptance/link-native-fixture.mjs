import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { createWebUiHost } from "../../src/host/http-host.mjs";
import { CodexAppServerTransport } from "../../src/host/app-server-transport.mjs";

// A disposable canonical Host for public WSS/native qualification. Account
// authorization uses the real Framework bridge; no token is accepted as an argument.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const index = process.argv.indexOf("--qr-file");
if (index < 0 || !process.argv[index + 1]) throw new Error("Provide --qr-file inside a private directory.");
const qrFile = path.resolve(process.argv[index + 1]);
const checkFixture = process.argv.includes("--check-fixture");
const temporary = await mkdtemp(path.join(os.tmpdir(), "opl-link-native-public-"));
let host; let ownsQr = false; let refreshing = false; let disconnectMonitor; let evidencePending = false;
const observations = new Map();
async function observeTransport() {
  if (evidencePending) return; evidencePending = true;
  try {
    const transportEvidence = await host.core.linkInternet.readTransportEvidence();
    if (!transportEvidence || JSON.stringify(observations.get(transportEvidence.selectedTransport)) === JSON.stringify(transportEvidence)) return;
    observations.set(transportEvidence.selectedTransport, transportEvidence);
    console.log(JSON.stringify({ stage: "native_public_transport_observed", pid: process.pid, transportEvidence }));
  } finally { evidencePending = false; }
}
async function pair() {
  if (refreshing) return;
  refreshing = true;
  try {
    const value = await host.core.invoke("createLinkPairing", {});
    const pending = `${qrFile}.${crypto.randomUUID()}.tmp`;
    await writeFile(pending, value.pairingURL, { mode: 0o600, flag: "wx" }); await rename(pending, qrFile);
    console.log(JSON.stringify({ stage: "native_public_pairing_ready", pid: process.pid, expiresAt: value.expiresAt }));
  } finally { refreshing = false; }
}
try {
  await mkdir(path.dirname(qrFile), { recursive: true, mode: 0o700 });
  await writeFile(qrFile, "", { mode: 0o600, flag: "wx" }); ownsQr = true;
  const transport = new CodexAppServerTransport({ command: process.execPath, args: [path.join(root, "src/host/fixtures/fake-app-server.mjs")], cwd: temporary, env: { ...process.env, FAKE_WORKSPACE: temporary }, requestTimeoutMs: 2_000 });
  host = await createWebUiHost({ transport, env: { ...process.env, OPL_DATA_DIR: path.join(temporary, "host") }, dshHome: path.join(temporary, "dsh"), opl: { readState: async () => ({}) } });
  const directory = await host.core.invoke("listThreads", {});
  const selected = directory.data?.find(thread => thread.id === "thread-source");
  if (!selected) throw new Error("The canonical fixture conversation is missing from its directory.");
  const thread = await host.core.invoke("readThread", { threadId: selected.id, includeTurns: true });
  if (thread.id !== selected.id) throw new Error("The canonical fixture conversation did not match its directory.");
  const relativePath = "native-result.bin";
  const sample = Buffer.from(Array.from({ length: 512 * 1024 + 31 }, (_, index) => index % 251));
  await writeFile(path.join(temporary, relativePath), sample, { mode: 0o600 });
  const expectedFile = { size: sample.length, sha256: crypto.createHash("sha256").update(sample).digest("hex"), algorithm: "index-mod-251-v1" };
  const first = await host.core.threadWorkspace.readBytes({ threadId: thread.id, relativePath, offset: 0, length: 512 * 1024 });
  const last = await host.core.threadWorkspace.readBytes({ threadId: thread.id, relativePath, offset: 512 * 1024, length: 512 * 1024, ifMatch: first.etag });
  const digest = crypto.createHash("sha256").update(Buffer.from(first.data, "base64")).update(Buffer.from(last.data, "base64")).digest("hex");
  if (digest !== expectedFile.sha256 || last.sizeBytes !== expectedFile.size || !last.eof) throw new Error("The canonical fixture file did not match its bounded download metadata.");
  if (checkFixture) {
    console.log(JSON.stringify({ stage: "native_fixture_checked", pid: process.pid, threadId: thread.id, relativePath, expectedFile, transportPolicy: "direct_first", publicInternet: false, businessOwnerFixture: true }));
  } else {
  await host.core.invoke("enableLinkInternet");
  for (let attempt = 0; attempt < 100 && host.core.linkInternet.status().status !== "ready"; attempt++) {
    if (["error", "account_required"].includes(host.core.linkInternet.status().status)) throw new Error(`Phone access requires action: ${host.core.linkInternet.status().reasonCode}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (host.core.linkInternet.status().status !== "ready") throw new Error("The public Relay Host did not become ready.");
  console.log(JSON.stringify({ stage: "native_public_host_ready", pid: process.pid, threadId: thread.id, relativePath, expectedFile, transportPolicy: "direct_first", publicInternet: true, businessOwnerFixture: true }));
  await pair();
  let sawDevice = false; let emptySince;
  disconnectMonitor = setInterval(() => {
    void observeTransport().catch(() => {});
    void host.core.invoke("readLinkDevices").then(state => {
      if (state.devices.length) { sawDevice = true; emptySince = undefined; }
      else if (sawDevice) {
        emptySince ??= Date.now();
        if (Date.now() - emptySince >= 3000) { clearInterval(disconnectMonitor); console.log(JSON.stringify({ stage: "native_public_pairing_removed", pid: process.pid })); }
      }
    }).catch(() => {});
  }, 1000); disconnectMonitor.unref();
  const refresh = () => { void pair().catch(() => console.error(JSON.stringify({ stage: "native_public_pairing_refresh_failed" }))); };
  process.on("SIGUSR1", refresh);
  await new Promise(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
  process.off("SIGUSR1", refresh);
  }
} finally { clearInterval(disconnectMonitor); await host?.close(); if (ownsQr) await rm(qrFile, { force: true }); await rm(temporary, { recursive: true, force: true }); }
