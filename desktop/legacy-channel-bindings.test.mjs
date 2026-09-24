import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { convertLegacyChannelBindings, importLegacyChannelBindings } from './legacy-channel-bindings.mjs';

const entry = { provider_id:'weixin',account_id:'account-exact',channel_session_id:'session-exact',canonical_thread_host:'codex',canonical_thread_id:'thread-exact' };
const source = { schema:'opl_app_transport_bindings_adapter_state.v1',bindings:[entry] };
test('legacy Aion channel bindings retain exact identities and reject duplicates', () => {
  assert.deepEqual(convertLegacyChannelBindings(source),{schema:'opl_studio_channel_transport_bindings.v1',entries:[entry]});
  assert.throws(()=>convertLegacyChannelBindings({...source,bindings:[entry,entry]}),/duplicate/);
  assert.throws(()=>convertLegacyChannelBindings({schema:'unknown',bindings:[entry]}),/schema_invalid/);
});
test('one-time legacy import preserves source, is idempotent and refuses a conflicting live target', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'opl-legacy-binding-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'channel-bindings.json');const bytes=JSON.stringify(source);fs.writeFileSync(file,bytes);
  const first=importLegacyChannelBindings({userDataRoot:root});assert.equal(first.imported,1);
  assert.equal(importLegacyChannelBindings({userDataRoot:root}).imported,0);
  assert.equal(fs.readFileSync(file,'utf8'),bytes);
  const target=path.join(root,'channel-transport-bindings.json');const conflict=JSON.stringify({schema:'opl_studio_channel_transport_bindings.v1',entries:[{...entry,canonical_thread_id:'other'}]});fs.writeFileSync(target,conflict);
  assert.throws(()=>importLegacyChannelBindings({userDataRoot:root}),/binding_conflict/);
  assert.equal(fs.readFileSync(target,'utf8'),conflict);
  assert.equal(fs.readFileSync(file,'utf8'),bytes);
});
