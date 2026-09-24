// Run with Electron. This exercises Chromium's actual file-origin localStorage
// and the production import path in a fresh temporary userData directory.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { importPendingHandoff } from '../../desktop/preview-handoff-runner.mjs';
import { createPreviewHandoff, writePreviewHandoff } from '../../desktop/preview-handoff.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'opl-chromium-migration-'));
app.setPath('userData',path.join(root,'userData'));
app.on('window-all-closed',()=>{});
app.whenReady().then(async () => {
const sourcePage=path.join(root,'old-app','Contents','Resources','app-source','dist','desktop','index.html');
fs.mkdirSync(path.dirname(sourcePage),{recursive:true});fs.writeFileSync(sourcePage,'<!doctype html><html><body>Qualification</body></html>');
const seed = new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
try {
  await seed.loadFile(sourcePage);
  await seed.webContents.executeJavaScript(`localStorage.setItem('opl.studio.settings.v1','{"locale":"zh"}');localStorage.setItem('opl.studio.drafts.v2','{"prompts":{"t":"existing"}}')`);
  await seed.webContents.session.flushStorageData();seed.destroy();
  const incoming=createPreviewHandoff({source:{bundleId:'cn.onepersonlab.opl.studio.preview',version:'0.1.18'},target:{productName:'One Person Lab',bundleId:'cn.onepersonlab.opl',version:'26.9.2491',url:'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.9.24/One-Person-Lab-26.9.24-mac-arm64.dmg',size:100,sha256:'a'.repeat(64),teamId:'SVVC4TA784'},storage:{'opl.nativeWorkbench.settings.v1':'{"locale":"en","theme":"dark"}','opl.studio.drafts.v2':'{"prompts":{"t":"incoming","new":"unsent"}}'}});
  writePreviewHandoff(path.join(app.getPath('userData'),'handoff/incoming.json'),incoming);
  const facade={getPath:name=>app.getPath(name),getVersion:()=> '26.9.2491'};
  await importPendingHandoff({app:facade});await importPendingHandoff({app:facade});
  const view=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  await view.loadFile(sourcePage);
  const data=await view.webContents.executeJavaScript(`({settings:JSON.parse(localStorage.getItem('opl.studio.settings.v1')),drafts:JSON.parse(localStorage.getItem('opl.studio.drafts.v2'))})`);
  assert.deepEqual(data.settings,{locale:'zh',theme:'dark'});assert.equal(data.drafts.prompts.t,'existing');assert.equal(data.drafts.prompts.new,'unsent');assert.equal(Object.values(data.drafts.recovered)[0],'incoming');view.destroy();
  console.log(JSON.stringify({schema:'opl_chromium_shell_migration_qualification.v1',status:'passed',beforeRendererImport:true,realChromiumStorage:true,sourceAndTargetCollisionPreserved:true,retryIdempotent:true}));
  app.exit(0);
} catch(error) { console.error(error);app.exit(1); }

}).catch(error => { console.error(error); app.exit(1); });
