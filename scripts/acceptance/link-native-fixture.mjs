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
const temporary = await mkdtemp(path.join(os.tmpdir(), "opl-link-native-public-"));
let host; let ownsQr = false; let refreshing = false;
async function pair() {
  if (refreshing) return;
  refreshing = true;
  try {
    const value = await host.core.invoke("createLinkPairing", {});
    const pending = `${qrFile}.${crypto.randomUUID()}.tmp`;
    await writeFile(pending, value.pairingURL, { mode: 0o600, flag: "wx" }); await rename(pending, qrFile);
    console.log(JSON.stringify({ stage: "native_public_pairing_ready", pid: process.pid, qrFile, expiresAt: value.expiresAt }));
  } finally { refreshing = false; }
}
try {
  await mkdir(path.dirname(qrFile), { recursive: true, mode: 0o700 });
  await writeFile(qrFile, "", { mode: 0o600, flag: "wx" }); ownsQr = true;
  const transport = new CodexAppServerTransport({ command: process.execPath, args: [path.join(root, "src/host/fixtures/fake-app-server.mjs")], cwd: temporary, env: { ...process.env, FAKE_WORKSPACE: temporary }, requestTimeoutMs: 2_000 });
  host = await createWebUiHost({ transport, env: { ...process.env, OPL_DATA_DIR: path.join(temporary, "host") }, dshHome: path.join(temporary, "dsh"), opl: { readState: async () => ({}) } });
  await host.core.invoke("enableLinkInternet");
  for (let attempt = 0; attempt < 100 && host.core.linkInternet.status().status !== "ready"; attempt++) {
    if (["error", "account_required"].includes(host.core.linkInternet.status().status)) throw new Error(`Phone access requires action: ${host.core.linkInternet.status().reasonCode}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (host.core.linkInternet.status().status !== "ready") throw new Error("The public Relay Host did not become ready.");
  const started = await transport.startThread();
  const sourcePath = path.join(temporary, "native-result.bin"); await writeFile(sourcePath, crypto.randomBytes(512 * 1024 + 31), { mode: 0o600 });
  console.log(JSON.stringify({ stage: "native_public_host_ready", pid: process.pid, desktopOrigin: host.url, threadId: started.thread.id, relativePath: "native-result.bin", sourcePath, publicInternet: true, businessOwnerFixture: true }));
  await pair();
  const refresh = () => { void pair().catch(() => console.error(JSON.stringify({ stage: "native_public_pairing_refresh_failed" }))); };
  process.on("SIGUSR1", refresh);
  await new Promise(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
  process.off("SIGUSR1", refresh);
} finally { await host?.close(); if (ownsQr) await rm(qrFile, { force: true }); await rm(temporary, { recursive: true, force: true }); }
