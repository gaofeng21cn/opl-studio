import fs from 'node:fs';
import path from 'node:path';
import { atomicJson, digest, mergeChannelBindings, privateJson } from './preview-handoff.mjs';
import { validatedChannelBindings } from '../scripts/webui-host/channel-bindings.mjs';

export function convertLegacyChannelBindings(value) {
  if (value?.schema !== 'opl_app_transport_bindings_adapter_state.v1' || !Array.isArray(value.bindings)) {
    throw new Error('legacy_channel_binding_schema_invalid');
  }
  // Both adapters use these exact five canonical identity fields. Never create
  // replacement threads or infer identities from labels during the transition.
  return validatedChannelBindings({ schema:'opl_studio_channel_transport_bindings.v1', entries:value.bindings });
}

export function importLegacyChannelBindings({ userDataRoot }) {
  if (!path.isAbsolute(userDataRoot ?? '')) throw new Error('legacy_channel_binding_userdata_required');
  const source = path.join(userDataRoot,'channel-bindings.json');
  if (!fs.existsSync(source)) return { status:'not_present', imported:0 };
  const incoming = convertLegacyChannelBindings(privateJson(source));
  const sourceDigest = digest(fs.readFileSync(source));
  const target = path.join(userDataRoot,'channel-transport-bindings.json');
  const current = fs.existsSync(target) ? validatedChannelBindings(privateJson(target)) : { schema:'opl_studio_channel_transport_bindings.v1',entries:[] };
  const merged = mergeChannelBindings(current,incoming);
  const root = path.join(userDataRoot,'handoff');
  const backup = path.join(root,`${sourceDigest}.legacy-channel-bindings.backup.json`);
  if (!fs.existsSync(backup)) atomicJson(backup,current);
  if (JSON.stringify(current) !== JSON.stringify(merged)) atomicJson(target,merged);
  const observed = fs.existsSync(target) ? validatedChannelBindings(privateJson(target)) : current;
  if (JSON.stringify(observed) !== JSON.stringify(merged)) throw new Error('legacy_channel_binding_readback_failed');
  const receipt = { schema:'opl_legacy_channel_binding_import.v1',status:'imported',source_sha256:sourceDigest,
    imported:merged.entries.length-current.entries.length,total:merged.entries.length,sourceRetained:true,canonicalReferencesPreserved:true };
  atomicJson(path.join(root,`${sourceDigest}.legacy-channel-bindings.receipt.json`),receipt);
  return receipt;
}
