import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, net } from 'electron';
import { createPreviewHandoff, writePreviewHandoff, readPreviewHandoff, privateJson, atomicJson, digest,
  normalizeStorageSnapshot, mergeShellStorage, mergeChannelBindings, HANDOFF_STORAGE_KEYS, validateTarget } from './preview-handoff.mjs';
import { prepareTarget, launchInstallHelper } from './handoff-installer.mjs';

const page = path.join(path.dirname(fileURLToPath(import.meta.url)),'migration.html');
async function storageWindow() {
  const window = new BrowserWindow({ show:false, webPreferences:{ sandbox:true, nodeIntegration:false, contextIsolation:true } });
  window.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  await window.loadFile(page);
  return window;
}
export function packagedPreviewPlan(resourcesPath, isPackaged) {
  if (!isPackaged) return null;
  const file = path.join(resourcesPath,'preview-handoff.json');
  if (!fs.existsSync(file)) return null;
  const plan = JSON.parse(fs.readFileSync(file,'utf8'));
  if (plan.schema !== 'opl_studio_preview_handoff_plan.v1' || plan.enabled !== true) return null;
  validateTarget(plan.target);
  return plan;
}
export async function runPreviewHandoff({ app, plan, onStatus = () => {} }) {
  const transactionRoot = path.join(app.getPath('userData'),'handoff',plan.target.sha256);
  onStatus('downloading');
  const staged = await prepareTarget({ target:plan.target, transactionRoot, fetchImpl: (...args) => net.fetch(...args) });
  const window = await storageWindow();
  try {
    const storage = await window.webContents.executeJavaScript(`Object.fromEntries(${JSON.stringify(HANDOFF_STORAGE_KEYS)}.map(k => [k, localStorage.getItem(k)]))`);
    const bindingFile = path.join(app.getPath('userData'),'channel-transport-bindings.json');
    const channelBindings = fs.existsSync(bindingFile) ? privateJson(bindingFile) : undefined;
    const value = createPreviewHandoff({ source:{ bundleId:'cn.onepersonlab.opl.studio.preview',version:app.getVersion() }, target:plan.target,storage,logDir:app.getPath('logs'),channelBindings });
    writePreviewHandoff(path.join(transactionRoot,'handoff.json'),value);
    // The terminal bridge never starts a Host. Only its storage reader is alive.
    await window.webContents.session.flushStorageData();
    onStatus('installing');
    const child = launchInstallHelper(staged,transactionRoot,process.pid);
    await new Promise((resolve,reject) => { child.once('spawn',resolve); child.once('error',reject); });
    return { status:'helper_started' };
  } finally { window.destroy(); }
}

export async function importPendingHandoff({ app }) {
  const root = path.join(app.getPath('userData'),'handoff');
  const file = path.join(root,'incoming.json');
  if (!fs.existsSync(file)) return null;
  const incoming = readPreviewHandoff(file,{ currentVersion:app.getVersion() });
  const receiptFile = path.join(root,`${incoming.digest}.receipt.json`);
  if (fs.existsSync(receiptFile)) {
    const receipt = privateJson(receiptFile);
    if (receipt.digest === incoming.digest && receipt.stage === 'storage_imported') return incoming;
  }
  const window = await storageWindow();
  try {
    if (incoming.channelBindings) {
      const bindingFile = path.join(app.getPath('userData'),'channel-transport-bindings.json');
      const currentBindings = fs.existsSync(bindingFile) ? privateJson(bindingFile) : { schema:'opl_studio_channel_transport_bindings.v1',entries:[] };
      const mergedBindings = mergeChannelBindings(currentBindings, incoming.channelBindings);
      const backupFile = path.join(root,`${incoming.digest}.channel-bindings.backup.json`);
      if (!fs.existsSync(backupFile)) atomicJson(backupFile,currentBindings);
      atomicJson(bindingFile,mergedBindings);
      if (JSON.stringify(privateJson(bindingFile)) !== JSON.stringify(mergedBindings)) throw new Error('handoff_channel_binding_readback_failed');
    }
    const current = await window.webContents.executeJavaScript(`Object.fromEntries(${JSON.stringify(HANDOFF_STORAGE_KEYS)}.map(k => [k, localStorage.getItem(k)]))`);
    const backup = path.join(root,`${incoming.digest}.backup.json`);
    if (!fs.existsSync(backup)) atomicJson(backup,{ schema:'opl_shell_storage_backup.v1',storage:normalizeStorageSnapshot(current), digest:digest(JSON.stringify(normalizeStorageSnapshot(current))) });
    const merged = mergeShellStorage(current,incoming.storage,incoming.digest);
    const actual = await window.webContents.executeJavaScript(`(() => {
      const values = ${JSON.stringify(merged)};
      for (const [k,v] of Object.entries(values)) localStorage.setItem(k,v);
      return Object.fromEntries(Object.keys(values).map(k => [k,localStorage.getItem(k)]));
    })()`);
    if (JSON.stringify(actual) !== JSON.stringify(merged)) throw new Error('handoff_storage_readback_failed');
    await window.webContents.session.flushStorageData();
    const logFile = path.join(app.getPath('userData'),'system-info.json');
    if (incoming.logDir && !fs.existsSync(logFile)) atomicJson(logFile,{ schema:'opl_desktop_client_system_info.v1',desktop_client_system_info:{ logDir:incoming.logDir } });
    atomicJson(receiptFile,{ schema:'opl_shell_storage_import_receipt.v1',digest:incoming.digest,stage:'storage_imported',keys:Object.keys(merged),version:app.getVersion() });
    return incoming;
  } finally { window.destroy(); }
}
