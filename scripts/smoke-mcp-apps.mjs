import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpAppHost } from '../plugins/opl-mcp-apps/src/service.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCP_APP_MIME } from '../src/host/mcp-app-protocol.mjs';

// Real Studio host service, React workspace, opaque iframe and official SDK;
// use a synthetic owner by default, or a real Relay owner with seeded local
// mailbox data through --relay-root. Neither mode sends mail or uses an account.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'opl-mcp-app-browser-'));
let relayClient;
async function main() {
await symlink(path.join(root, 'node_modules'), path.join(temporaryRoot, 'node_modules'));
const outputRoot = process.env.OPL_MCP_APP_SMOKE_OUTPUT?.trim();
const relayIndex=process.argv.indexOf('--relay-root');
const relayRoot=relayIndex>=0?path.resolve(process.argv[relayIndex+1]):undefined;
let launch;
if (outputRoot) await mkdir(outputRoot, { recursive: true });
const sessionName = `opl-mcp-app-${process.pid}`;
const state = { revision: 1, revoked: false, unknown: false, calls: [], applied: 0 };
const catalog = () => ({ name: 'fixture-owner', resources: [{ uri: 'ui://fixture/review' }], tools: {
  open_review: { name: 'open_review', title: 'Review item', annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: 'ui://fixture/review' } } },
  apply_review: { name: 'apply_review', _meta: { ui: { visibility: ['app'] } } },
  inspect_review: { name: 'inspect_review', annotations: { readOnlyHint: true }, _meta: { ui: { visibility: ['app'] } } }
} });
const snapshot = () => ({ item_id: 'item-7', revision: state.revision, applied: state.applied });
const result = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
let resourceHtml;
const syntheticTransport = {
  async request(method, params) {
    state.calls.push({ method, params });
    if (method === 'mcpServerStatus/list') return { data: state.revoked ? [] : [catalog()] };
    if (method === 'mcpServer/resource/read') return { contents: [{ uri: params.uri, mimeType: MCP_APP_MIME, text: resourceHtml }] };
    if (method !== 'mcpServer/tool/call') throw new Error(`Unexpected method: ${method}`);
    if (['open_review', 'inspect_review'].includes(params.tool)) return result(snapshot());
    if (params.tool === 'apply_review') {
      if (params.arguments?.revision !== state.revision) return { isError: true, content: [{ type: 'text', text: 'revision conflict' }] };
      if (state.unknown) return result({ status: 'unknown', operation_id: 'op-unknown-7', ...snapshot() });
      state.revision += 1; state.applied += 1;
      return result({ status: 'applied', receipt: 'receipt-7', ...snapshot() });
    }
    throw new Error(`Unexpected tool: ${params.tool}`);
  },
  async readThread() { return { thread: { turns: [] } }; }
};
let domainTransport=syntheticTransport;
if(relayRoot) {
  const profile=path.join(temporaryRoot,'relay-profile');
  const seed=spawnSync('python3',[path.join(relayRoot,'workbench/test/seed_profile.py'),profile],{encoding:'utf8'});
  assert.equal(seed.status,0,seed.stderr);
  relayClient=new Client({name:'Studio isolated Relay acceptance',version:'1.0.0'},{capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:[MCP_APP_MIME]}}}});
  await relayClient.connect(new StdioClientTransport({command:'python3',args:[path.join(relayRoot,'plugins/opl-relay/bin/opl-relay'),'--json','workbench','mcp'],cwd:relayRoot,env:{...getDefaultEnvironment(),OPL_PROFILE_WORKSPACE:profile}}));
  const messages=await relayClient.callTool({name:'relay_messages',arguments:{account_id:'demo',folder:'inbox'}});
  assert.equal(messages.isError,undefined,JSON.stringify(messages));
  const source=messages.structuredContent.messages[0].storage_ref;
  const created=await relayClient.callTool({name:'relay_reply',arguments:{account_id:'demo',storage_ref:source,request_id:'studio-controlled-review',body:'Initial synthetic draft.'}});
  assert.equal(created.isError,undefined,JSON.stringify(created));
  const draft=created.structuredContent.draft;
  launch={threadId:'thread-fixture',server:'relay',tool:'open_workbench',arguments:{account_id:'demo',draft_id:draft.id,revision:draft.revision}};
  domainTransport={
    async request(method,params) {
      assert.equal(params.threadId,'thread-fixture');
      if(method==='mcpServerStatus/list') {const [tools,resources]=await Promise.all([relayClient.listTools(),relayClient.listResources()]);return {data:[{name:'relay',tools:Object.fromEntries(tools.tools.map(tool=>[tool.name,tool])),resources:resources.resources}]};}
      assert.equal(params.server,'relay');
      if(method==='mcpServer/tool/call') return relayClient.callTool({name:params.tool,arguments:params.arguments});
      if(method==='mcpServer/resource/read') return relayClient.readResource({uri:params.uri});
      throw new Error('Unexpected Relay adapter request: '+method);
    }
  };
}
const host = new McpAppHost(domainTransport);

function bundle(name, source) {
  const input = path.join(temporaryRoot, `${name}.tsx`);
  const outputDirectory = path.join(temporaryRoot, `${name}-bundle`);
  const output = path.join(outputDirectory, `${name}.js`);
  return writeFile(input, source).then(async () => {
    const built = spawnSync('bun', [path.join(root, 'scripts/bun-build-renderer-entry.ts'), input, outputDirectory, 'esm'], { cwd: root, encoding: 'utf8' });
    assert.equal(built.status, 0, built.stderr || built.stdout);
    return readFile(output, 'utf8');
  });
}
const uiSource = `import { App } from ${JSON.stringify(path.join(root, 'node_modules/@modelcontextprotocol/ext-apps/dist/src/app.js'))};
const app = new App({name:'Synthetic owner review',version:'1.0.0'},{}); let revision;
const output = document.querySelector('#owner-result');
function display(value) { if(value.isError) { output.textContent = value.content?.find(item=>item.type==='text')?.text || 'error'; return; } const data=value.structuredContent; revision=data.revision; output.textContent=JSON.stringify(data); }
app.ontoolresult = display;
for (const [id,name,args] of [['apply','apply_review',()=>({item_id:'item-7',revision})],['stale','apply_review',()=>({item_id:'item-7',revision:0})],['inspect','inspect_review',()=>({item_id:'item-7'})]]) document.querySelector('#'+id).onclick=async()=>{try{display(await app.callServerTool({name,arguments:args()}))}catch(error){output.textContent=String(error.message||error)}};
await app.connect();`;
const uiBundle = relayRoot ? '' : await bundle('app', uiSource);
resourceHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Review item-7</h1><pre id="owner-result">loading</pre><button id="apply">Apply decision</button><button id="stale">Apply stale revision</button><button id="inspect">Read owner</button><script type="module">${uiBundle.replaceAll('</script', '<\\/script')}</script></body></html>`;
const rendererBundle = await bundle('renderer', `import React from ${JSON.stringify(path.join(root, 'node_modules/react/index.js'))};
import {createRoot} from ${JSON.stringify(path.join(root, 'node_modules/react-dom/client.js'))};
import {McpAppWorkspace} from ${JSON.stringify(path.join(root, 'plugins/opl-mcp-apps/src/client/McpAppWorkspace.tsx'))};
const rpc=async(method,payload)=>{const response=await fetch('/api/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const value=await response.json();if(!response.ok)throw new Error(value.error);return value};
const launch=await fetch('/launch').then(response=>response.json());
const bridge={listMcpApps:args=>rpc('list',args),openMcpApp:args=>rpc('open',args),callMcpAppTool:args=>rpc('call',args),readMcpAppResource:args=>rpc('read',args),closeMcpApp:args=>rpc('close',args)};
createRoot(document.querySelector('#root')).render(<McpAppWorkspace bridge={bridge} threadId="thread-fixture" locale="en" launch={launch??undefined} onContext={()=>{}} onMessage={()=>{}}/>);`);
const pageHtml = '<!doctype html><html><head><meta charset="utf-8"><title>Studio MCP App acceptance</title></head><body><div id="root"></div><script type="module" src="/renderer.js"></script></body></html>';
const server = http.createServer(async (request, response) => {
  const send = (value, status = 200) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
  try {
    if (request.url === '/launch') { send(launch??null); return; }
    if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    if (request.url === '/') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(pageHtml); return; }
    if (request.url === '/renderer.js') { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(rendererBundle); return; }
    if (request.method !== 'POST' || !request.url?.startsWith('/api/')) { response.writeHead(404); response.end(); return; }
    let body=''; for await (const chunk of request) body+=chunk;
    const method=request.url.slice(5);
    if (!['list','open','call','read','close'].includes(method)) throw new Error('Unknown fixture route');
    send(await host[method](JSON.parse(body || '{}')));
  } catch (error) { send({ error: String(error.message || error) }, 400); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const cli = (...args) => new Promise((resolve, reject) => {
  const child=spawn('npx',['--yes','--package','@playwright/cli','playwright-cli','--json',`-s=${sessionName}`,...args],{cwd:temporaryRoot,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr=''; child.stdout.on('data',chunk=>stdout+=chunk); child.stderr.on('data',chunk=>stderr+=chunk);
  child.once('error',reject); child.once('close',code=>code===0?resolve(stdout):reject(new Error(stderr||stdout)));
});
const run = async code => {
  const envelope=JSON.parse((await cli('run-code',code)).trim());
  if(envelope.isError) throw new Error(JSON.stringify(envelope));
  return envelope.result;
};
try {
  await cli('open',baseUrl);
  await run(`async page => { if(await page.title() !== 'Studio MCP App acceptance') throw new Error('Wrong page'); await page.getByRole('region',{name:'MCP Apps',exact:true}).waitFor(); }`);
  if(relayRoot) {
    await run(`async page => { const frame=page.frameLocator('iframe'); await frame.locator('#reply-body').waitFor(); await frame.locator('#reply-body').fill('Reviewed in Studio opaque iframe.'); await frame.getByRole('button',{name:'保存编辑',exact:true}).click(); await frame.locator('#operation-status').filter({hasText:'编辑已保存，尚未发送'}).waitFor(); }`);
    const saved=await relayClient.callTool({name:'relay_draft',arguments:{account_id:'demo',draft_id:launch.arguments.draft_id}});
    assert.equal(saved.structuredContent.draft.body,'Reviewed in Studio opaque iframe.');
    assert.equal(saved.structuredContent.draft.revision,2);
    assert.equal(saved.structuredContent.draft.state,'editing');
    const stale=await relayClient.callTool({name:'relay_save',arguments:{...launch.arguments,body:'Stale replacement',attachment_ids:[]}});
    assert.equal(stale.isError,true);
    assert.equal(stale.structuredContent.error.code,'revision_conflict');
    launch.arguments.revision=2;
    await run(`async page => { await page.reload(); await page.frameLocator('iframe').locator('#reply-body').waitFor(); if(await page.frameLocator('iframe').locator('#reply-body').inputValue()!=='Reviewed in Studio opaque iframe.') throw new Error('Reopened the wrong draft'); }`);
    const consoleOutput=JSON.parse(await cli('console','error')).result;
    assert.equal(consoleOutput.split('\n').filter(line=>line.startsWith('[ERROR]')).length,0,consoleOutput);
    await cli('screenshot',...(outputRoot?[`--filename=${path.join(outputRoot,'relay-mcp-app-browser.png')}`]:[]));
    const evidence={status:'relay_mcp_apps_browser_passed',host:'Studio source McpAppWorkspace + McpAppHost + official ext-apps',owner:'Real Relay stdio server and SQLite ledger with synthetic mailbox',scenarios:['exact_draft_focus','ui_save_owner_readback','reopen_same_draft','stale_revision_rejected'],source:'passed',browser:'passed',installed:'not_run',release:'not_run',draft:{id:saved.structuredContent.draft.id,revision:2,state:'editing'},external_mutations:0,console_errors:0};
    if(outputRoot) await writeFile(path.join(outputRoot,'relay-mcp-app-browser.json'),JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify(evidence,null,2));
    return;
  }
  await run(`async page => { await page.getByRole('button',{name:'Open app',exact:true}).click(); await page.frameLocator('iframe').locator('#owner-result').filter({hasText:'"revision":1'}).waitFor(); }`);
  await run(`async page => { await page.frameLocator('iframe').getByRole('button',{name:'Apply decision',exact:true}).click(); await page.frameLocator('iframe').locator('#owner-result').filter({hasText:'"status":"applied"'}).waitFor(); }`);
  assert.equal(state.applied,1);
  await run(`async page => { await page.getByRole('button',{name:'Close app',exact:true}).click(); await page.getByRole('button',{name:'Open app',exact:true}).click(); await page.frameLocator('iframe').locator('#owner-result').filter({hasText:'"revision":2'}).waitFor(); await page.frameLocator('iframe').getByRole('button',{name:'Apply stale revision',exact:true}).click(); await page.frameLocator('iframe').locator('#owner-result').filter({hasText:'revision conflict'}).waitFor(); }`);
  assert.equal(state.applied,1);
  state.revoked=true;
  const callsBeforeRevocation=state.calls.filter(item=>item.method==='mcpServer/tool/call').length;
  await run(`async page => { await page.frameLocator('iframe').getByRole('button',{name:'Apply decision',exact:true}).click(); await page.frameLocator('iframe').locator('#owner-result').filter({hasText:/unavailable|no longer available|denied|declared|revoked|closed|changed/i}).waitFor(); }`);
  assert.equal(state.calls.filter(item=>item.method==='mcpServer/tool/call').length,callsBeforeRevocation,'revoked view must not reach its former owner');
  state.revoked=false; state.unknown=true;
  const writesBeforeUnknown=state.calls.filter(item=>item.method==='mcpServer/tool/call' && item.params.tool==='apply_review').length;
  await run(`async page => { await page.getByRole('button',{name:'Close app',exact:true}).click(); await page.getByRole('button',{name:'Open app',exact:true}).click(); await page.frameLocator('iframe').locator('#owner-result').filter({hasText:'"revision":2'}).waitFor(); await page.frameLocator('iframe').getByRole('button',{name:'Apply decision',exact:true}).click(); await page.frameLocator('iframe').locator('#owner-result').filter({hasText:'"status":"unknown"'}).waitFor(); await page.frameLocator('iframe').getByRole('button',{name:'Read owner',exact:true}).click(); await page.frameLocator('iframe').locator('#owner-result').filter({hasText:'"revision":2'}).waitFor(); }`);
  assert.equal(state.applied,1,'unknown result must not be treated as applied');
  assert.equal(state.calls.filter(item=>item.method==='mcpServer/tool/call' && item.params.tool==='apply_review').length,writesBeforeUnknown+1,'unknown result must not automatically retry mutation');
  assert.equal(host.views.size,1,'reopening must release the earlier ephemeral binding');
  const fallback=await host.transport.request('mcpServer/tool/call',{threadId:'thread-fixture',server:'fixture-owner',tool:'inspect_review',arguments:{item_id:'item-7'}});
  assert.equal(fallback.structuredContent.item_id,'item-7');
  assert.equal(fallback.structuredContent.revision,2);
  const consoleOutput=JSON.parse(await cli('console','error')).result;
  const consoleErrors=consoleOutput.split('\n').filter(line=>line.startsWith('[ERROR]'));
  assert.equal(consoleErrors.length,1,'Only the intentional revocation response may fail in the browser');
  assert.match(consoleErrors[0],/400.*api\/call/);
  await cli('screenshot',...(outputRoot?[`--filename=${path.join(outputRoot,'mcp-app-browser.png')}`]:[]));
  const evidence={status:'mcp_apps_browser_fixture_passed',url:baseUrl,host:'Studio source McpAppWorkspace + McpAppHost + official ext-apps',scenarios:['owner_apply_readback','reopen','stale_revision','revocation','unknown_no_retry','no_ui_structured_result'],source:'passed',browser:'passed',installed:'not_run',release:'not_run',owner:snapshot(),console:{unexpected_errors:0,expected_error:'HTTP 400 from the intentionally revoked view call',log:consoleOutput}};
  if(outputRoot) await writeFile(path.join(outputRoot,'mcp-app-browser.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
} catch (error) {
  try { console.error('browser console:', await cli('console','error')); console.error('snapshot:', (await cli('snapshot')).slice(0,8000)); } catch {}
  throw error;
} finally {
  await cli('close').catch(()=>{});
  host.dispose();
  await new Promise(resolve=>server.close(resolve));
}
}

await main().finally(async()=>{
  if(relayClient) await relayClient.close();
  await rm(temporaryRoot,{recursive:true,force:true});
});
