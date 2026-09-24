import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPreviewHandoff, readPreviewHandoff, writePreviewHandoff, mergeShellStorage, normalizeStorageSnapshot, mergeChannelBindings, atomicJson } from './preview-handoff.mjs';
import { commitPreparedTarget, ensureVerifiedStaging } from './handoff-installer.mjs';
const target = { productName:'One Person Lab',bundleId:'cn.onepersonlab.opl',version:'26.9.2491',url:'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.9.24/One-Person-Lab-26.9.24-mac-arm64.dmg',size:1234,sha256:'a'.repeat(64),teamId:'SVVC4TA784' };
const handoff = storage => createPreviewHandoff({ source:{ bundleId:'cn.onepersonlab.opl.studio.preview',version:'0.1.19' },target,storage });
const temp = t => { const root=fs.mkdtempSync(path.join(os.tmpdir(),'opl-handoff-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root; };

test('allowlist is field-level and legacy storage keys are translated', () => {
  const storage = normalizeStorageSnapshot({ 'opl.nativeWorkbench.settings.v1':JSON.stringify({ locale:'en',theme:'dark',apiKey:'secret',fontSize:16 }),
    'opl.studio.uiMetadata.v2':JSON.stringify({workspaceLabels:{project:'Personal'},token:'secret'}), authToken:'secret' });
  assert.deepEqual(JSON.parse(storage['opl.studio.settings.v1']),{locale:'en',theme:'dark',fontSize:16});
  assert.deepEqual(JSON.parse(storage['opl_ui_metadata.v1']),{schema:'opl_ui_metadata.v1',workspaceLabels:{project:'Personal'}});
  assert.equal(JSON.stringify(storage).includes('secret'),false);
});
test('long drafts survive and malformed drafts fail before any storage write', () => {
  const text = 'long draft '.repeat(9000);
  const values = normalizeStorageSnapshot({ 'opl.studio.drafts.v2': JSON.stringify({ prompts: { thread: text } }) });
  assert.equal(JSON.parse(values['opl.studio.drafts.v2']).prompts.thread, text);
  assert.throws(() => normalizeStorageSnapshot({ 'opl.studio.drafts.v2': '{"prompts":{"thread":12}}' }), /shell_drafts_invalid/);
});
test('channel identities preserve exact canonical references and reject conflicting writers', () => {
  const entry = { provider_id:'weixin', account_id:'account', channel_session_id:'session', canonical_thread_host:'codex',canonical_thread_id:'thread' };
  const value = { schema:'opl_studio_channel_transport_bindings.v1', entries:[entry] };
  assert.deepEqual(mergeChannelBindings(value,value),value);
  assert.throws(() => mergeChannelBindings(value,{...value,entries:[{...entry,canonical_thread_id:'other'}]}),/handoff_channel_binding_conflict/);
});
test('target wins per field, metadata references union, colliding drafts remain discoverable and resumable', () => {
  const current = { 'opl.studio.settings.v1':'{"locale":"zh"}', 'opl_ui_metadata.v1':'{"workspaceLabels":{"a":"Target"},"pinnedThreadIds":["t"]}', 'opl.studio.drafts.v2':'{"prompts":{"t":"target draft"}}' };
  const source = { 'opl.studio.settings.v1':'{"locale":"en","theme":"dark"}', 'opl_ui_metadata.v1':'{"workspaceLabels":{"a":"Source","b":"Preview"},"pinnedThreadIds":["s"]}', 'opl.studio.drafts.v2':'{"prompts":{"t":"preview draft","new":"new draft"}}' };
  const merged=mergeShellStorage(current,source,'digest');
  assert.deepEqual(JSON.parse(merged['opl.studio.settings.v1']),{locale:'zh',theme:'dark'});
  const metadata=JSON.parse(merged['opl_ui_metadata.v1']);assert.deepEqual(metadata.workspaceLabels,{a:'Target',b:'Preview'});assert.deepEqual(metadata.pinnedThreadIds,['t','s']);
  const drafts=JSON.parse(merged['opl.studio.drafts.v2']);assert.equal(drafts.prompts.t,'target draft');assert.equal(drafts.recovered['preview:digest:t'],'preview draft');
  assert.deepEqual(mergeShellStorage(merged,source,'digest'),merged);
});
test('handoff rejects changed bytes, wrong target, credentials and downgrades', t => {
  const root=temp(t),file=path.join(root,'handoff.json'),value=handoff({});writePreviewHandoff(file,value);
  assert.equal(readPreviewHandoff(file,{currentVersion:target.version}).digest,value.digest);
  assert.throws(()=>readPreviewHandoff(file,{currentVersion:'0.1.19'}),/too_old/);
  assert.throws(()=>createPreviewHandoff({source:value.source,target:{...target,url:'https://evil.test/app.dmg'},storage:{}}),/url_invalid/);
  atomicJson(file,{...value,storage:{'opl.studio.settings.v1':'{"theme":"light"}'}});
  assert.throws(()=>readPreviewHandoff(file),/digest_mismatch/);
});
function fixture(t, version='26.9.2391') {
  const root=temp(t),tx=path.join(root,'transaction'),apps=path.join(root,'Applications'),user=path.join(root,'userData'),staged=path.join(tx,'One Person Lab.app');
  fs.mkdirSync(staged,{recursive:true});fs.mkdirSync(apps);const installed=path.join(apps,'One Person Lab.app');fs.mkdirSync(installed);fs.writeFileSync(path.join(installed,'version'),version);fs.writeFileSync(path.join(staged,'version'),target.version);
  writePreviewHandoff(path.join(tx,'handoff.json'),handoff({}));
  const verifyApp=(p,opts={})=>{const version=fs.readFileSync(path.join(p,'version'),'utf8');if(opts.exactVersion)assert.equal(version,opts.exactVersion);return {version};};
  const args={transactionRoot:tx,selfBundle:staged,targetUserDataRoot:user,applicationsRoot:apps,hooks:{verifyApp,copy:(a,b)=>fs.cpSync(a,b,{recursive:true})}};
  return {root,tx,apps,user,staged,installed,args};
}
test('atomic install retains old App and retries without replacing matching target', t => {
  const f=fixture(t); const result=commitPreparedTarget(f.args);assert.equal(result.version,target.version);
  const journal=JSON.parse(fs.readFileSync(path.join(f.tx,'install.json')));assert.equal(fs.readFileSync(path.join(journal.backup,'version'),'utf8'),'26.9.2391');
  assert.equal(commitPreparedTarget(f.args).version,target.version);assert.ok(fs.existsSync(path.join(f.user,'handoff/incoming.json')));
});
test('newer installed App is retained',t=>{const f=fixture(t,'26.9.2591');assert.equal(commitPreparedTarget(f.args).version,'26.9.2591');assert.equal(fs.readdirSync(f.apps).length,1);});
test('verification failure after rename restores the old executable',t=>{
  const f=fixture(t);const verify=f.args.hooks.verifyApp;let installedReads=0;f.args.hooks.verifyApp=(p,o)=>{if(p===f.installed && ++installedReads===2)throw new Error('injected_verify_failure');return verify(p,o);};
  assert.throws(()=>commitPreparedTarget(f.args),/injected_verify_failure/);assert.equal(fs.readFileSync(path.join(f.installed,'version'),'utf8'),'26.9.2391');
});
test('partial copy left by interruption is preserved and rebuilt on retry',t=>{
  const f=fixture(t);const staged=path.join(f.apps,'.partial.app');fs.mkdirSync(staged);fs.writeFileSync(path.join(staged,'incomplete'),'partial bytes');
  assert.equal(ensureVerifiedStaging({source:f.staged,staged,version:target.version,verify:f.args.hooks.verifyApp,copy:f.args.hooks.copy}),staged);
  assert.equal(fs.readFileSync(path.join(staged,'version'),'utf8'),target.version);
  const preserved=fs.readdirSync(f.apps).find(name=>name.startsWith('.partial.app.failed-'));
  assert.ok(preserved);assert.equal(fs.readFileSync(path.join(f.apps,preserved,'incomplete'),'utf8'),'partial bytes');
});
test('crash after moving original App to backup resumes the same prepared transaction',t=>{
  const f=fixture(t);const value=JSON.parse(fs.readFileSync(path.join(f.tx,'handoff.json')));
  const backup=path.join(f.apps,`.One Person Lab.previous-${value.digest.slice(0,16)}.app`);
  const staged=path.join(f.apps,`.One Person Lab.incoming-${value.digest.slice(0,16)}.app`);
  f.args.hooks.copy(f.staged,staged);
  atomicJson(path.join(f.tx,'install.json'),{schema:'opl_preview_install.v1',digest:value.digest,stage:'prepared',targetApp:f.installed,backup,staged});
  fs.renameSync(f.installed,backup);
  assert.equal(commitPreparedTarget(f.args).version,target.version);
  assert.equal(fs.readFileSync(path.join(backup,'version'),'utf8'),'26.9.2391');
});
test('journaled invalid target after interrupted replacement recovers backup and finishes',t=>{
  const f=fixture(t);const value=JSON.parse(fs.readFileSync(path.join(f.tx,'handoff.json')));
  const backup=path.join(f.apps,`.One Person Lab.previous-${value.digest.slice(0,16)}.app`);
  const staged=path.join(f.apps,`.One Person Lab.incoming-${value.digest.slice(0,16)}.app`);
  atomicJson(path.join(f.tx,'install.json'),{schema:'opl_preview_install.v1',digest:value.digest,stage:'prepared',targetApp:f.installed,backup,staged});
  fs.renameSync(f.installed,backup);fs.mkdirSync(f.installed);fs.writeFileSync(path.join(f.installed,'incomplete'),'bad replacement');
  assert.equal(commitPreparedTarget(f.args).version,target.version);
  assert.equal(fs.readFileSync(path.join(backup,'version'),'utf8'),'26.9.2391');
  assert.ok(fs.readdirSync(f.apps).some(name=>name.startsWith('One Person Lab.app.failed-')));
});
test('untrusted target without an owned prepared journal is never replaced',t=>{
  const f=fixture(t);fs.unlinkSync(path.join(f.installed,'version'));
  assert.throws(()=>commitPreparedTarget(f.args),/existing_target_untrusted/);
  assert.ok(fs.existsSync(f.installed));assert.equal(fs.existsSync(path.join(f.tx,'install.json')),false);
});
