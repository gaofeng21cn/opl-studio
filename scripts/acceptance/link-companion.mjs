import assert from "node:assert/strict";
import crypto from "node:crypto";
import { LinkLoopback, LINK_VIRTUAL_PORT } from "../../plugins/core/opl-host-core/src/link-loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRendererEntry } from "../vite-build-renderer-entry.mjs";
import { readCodexModelPolicy } from "../build-renderer.mjs";
import { createWebUiHost } from "../../src/host/http-host.mjs";
import { CodexAppServerTransport } from "../../plugins/core/opl-codex-native/src/app-server-transport.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "opl-link-settings-"));
const output = path.join(root, "output/playwright/link-companion");
const webRoot = path.join(temporary, "web");
const session = `opl-link-${process.pid}`;
let host;
let remote;
async function phone(route, body, token) {
  const id = crypto.randomUUID();
  const head = await remote.call({op:"http.open",id,port:LINK_VIRTUAL_PORT,path:route,method:body?"POST":"GET",headers:[...(body?[["content-type","application/json"]]:[]),...(token?[["authorization",`Bearer ${token}`]]:[])],...(body?{body:Buffer.from(JSON.stringify(body)).toString("base64")}:{} )});
  const chunks=[];
  for (;;) {const part=await remote.call({op:"http.read",id});if(part.data)chunks.push(Buffer.from(part.data,"base64"));if(part.done)break;}
  return {status:head.status,value:JSON.parse(Buffer.concat(chunks))};
}
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: temporary, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", reject); child.once("close", code => code === 0 ? resolve(stdout) : reject(new Error(`${command} failed (${code}): ${stdout}\n${stderr}`)));
  });
}
const cli = args => run("npx", ["--yes", "--package", "@playwright/cli", "playwright-cli", "--json", `-s=${session}`, ...args]);
async function evaluate(expression) {
  const envelope = JSON.parse(await cli(["eval", expression]));
  return typeof envelope.result === "string" ? JSON.parse(envelope.result) : envelope.result;
}
async function interact(code) {
  await cli(["snapshot"]);
  return cli(["run-code", `async page => { ${code} }`]);
}

try {
  await mkdir(output, { recursive: true }); await symlink(path.join(root, "node_modules"), path.join(temporary, "node_modules"));
  const entry = path.join(temporary, "link-settings.tsx");
  await writeFile(entry, `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import ${JSON.stringify(path.join(root, "plugins/core/opl-studio-client/src/client/integrations/deepseek-harness/theme.ts"))};
    import { LinkCompanionSection } from ${JSON.stringify(path.join(root, "plugins/core/opl-studio-client/src/client/workbench/settings/LinkCompanionSection.tsx"))};
    import { codexWorkbenchStyles } from ${JSON.stringify(path.join(root, "plugins/core/opl-studio-client/src/client/workbench/codexWorkbenchStyles.ts"))};
    import { installWebTransport } from ${JSON.stringify(path.join(root, "src/bridge/webTransport.ts"))};
    installWebTransport();
    const original = window.oplStudio.linkCompanion.createPairing;
    window.oplStudio.linkCompanion.createPairing = async input => { const value = await original(input); window.__linkPair = value; return value; };
    createRoot(document.getElementById('root')).render(<><style>{codexWorkbenchStyles}</style><main className='settings-page'><header className='settings-detail-header'><h1>资料与连接</h1></header><div className='settings-content'><LinkCompanionSection locale='zh' /></div></main></>);
  `);
  await buildRendererEntry(entry, webRoot);
  const policy = JSON.stringify(readCodexModelPolicy()).replaceAll("<", "\\u003c");
  await writeFile(path.join(webRoot, "index.html"), `<!doctype html><html lang="zh-CN" data-platform="darwin"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OPL Link Settings acceptance</title><link rel="icon" href="data:,"><link rel="stylesheet" href="./link-settings.css"></head><body><div id="root"></div><script>globalThis.__OPL_CODEX_MODEL_POLICY__=${policy};</script><script type="module" src="./link-settings.js"></script></body></html>`);
  const transport = new CodexAppServerTransport({ command: process.execPath, args: [path.join(root, "src/host/fixtures/fake-app-server.mjs")], cwd: temporary, env: { ...process.env, FAKE_WORKSPACE: temporary }, requestTimeoutMs: 2_000 });
  host = await createWebUiHost({ transport, dshHome: path.join(temporary, "dsh"), env: { ...process.env, OPL_DATA_DIR: temporary }, webRoot,
    linkInternetFactory: async ({handle}) => {
      remote = new LinkLoopback({context:{connectionId:crypto.randomUUID(),peerDeviceId:crypto.randomUUID(),peerIdentityKey:crypto.randomBytes(32).toString("base64url")},handle});
      let enabled=false;
      return {status:()=>({status:enabled?"ready":"disabled"}),enable:async()=>{enabled=true;return {status:"ready"}},reconnect:async()=>({status:"ready"}),close:async()=>remote.closeAll(),revoke:async()=>{},createInvitation:async()=>({serverUrl:"https://link.medopl.com",accountScope:"s".repeat(43),hostDeviceId:crypto.randomUUID(),hostIdentityKey:crypto.randomBytes(32).toString("base64url"),enrollmentToken:"ui-fixture-enrollment",expiresAt:Date.now()+120000})};
    }, opl: { readState: async () => ({}) } });
  await cli(["open", host.url]); await cli(["resize", "1200", "900"]);
  const mounted = await evaluate("() => ({text:document.body.innerText,root:document.querySelector('#root')?.children.length})");
  assert.ok(mounted.text.includes("OPL Link"), `${JSON.stringify(mounted)} ${await cli(["console", "error"])}`);
  await interact(`await page.getByText('尚未连接手机或平板。', {exact:true}).waitFor(); await page.getByRole('button', {name:'开启手机访问'}).click(); await page.getByText('手机访问已就绪', {exact:true}).waitFor(); await page.getByRole('button', {name:'生成连接码'}).click(); await page.getByRole('button', {name:'复制连接链接'}).waitFor();`);
  const pair = await evaluate("() => window.__linkPair");
  assert.equal(pair.schema, "opl_link_studio_wire.v2");
  assert.equal(new URL(pair.pairingURL).protocol, "opllink:");
  assert.ok((await evaluate("() => ({qr:!!document.querySelector('.opl-link-pairing svg'),overflow:document.documentElement.scrollWidth>innerWidth})")).qr);
  await cli(["screenshot", `--filename=${path.join(output, "pairing-wide.png")}`]);
  assert.equal(new URL(pair.pairingURL).searchParams.has("endpoint"), false);
  const claimed = await phone("/api/link/claim", {code:pair.code,deviceName:"Acceptance iPhone"});
  assert.equal(claimed.status,200);const device=claimed.value;
  await interact("await page.getByRole('button', {name:'刷新', exact:true}).click(); await page.getByText('Acceptance iPhone', {exact:true}).waitFor();");
  const listed = await host.core.invoke("readLinkDevices"); assert.equal(listed.devices.length, 1);
  await cli(["resize", "430", "900"]);
  const narrow = await evaluate("() => ({overflow:document.documentElement.scrollWidth>innerWidth || document.body.scrollWidth>innerWidth, qr:!!document.querySelector('.opl-link-pairing svg')})");
  assert.equal(narrow.overflow, false); assert.equal(narrow.qr, true);
  await cli(["screenshot", `--filename=${path.join(output, "device-narrow.png")}`]);
  await interact("await page.getByRole('button', {name:'断开设备', exact:true}).click(); await page.getByText('尚未连接手机或平板。', {exact:true}).waitFor();");
  assert.equal((await host.core.invoke("readLinkDevices")).devices.length, 0);
  assert.equal((await phone("/api/link/bootstrap", undefined, device.token)).status,401);
  const errors = JSON.parse(await cli(["console", "error"]));
  assert.ok(!JSON.stringify(errors).includes("Uncaught"), "Browser must not report an uncaught error");
  const result = { schema: "opl_link_settings_acceptance.v1", actualComponent: true, productionWebBridge: true, realDshHttpHost: true, remoteTransportFixture: true, zeroAddressInput: true, pairingQr: true, claimedDeviceDisplayed: true, revocationReadback: true, narrowOverflow: false, screenshots: ["pairing-wide.png", "device-narrow.png"] };
  await writeFile(path.join(output, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, output }));
} finally {
  await cli(["close"]).catch(() => {}); await host?.close(); await rm(temporary, { recursive: true, force: true });
}
