import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import semver from 'semver';
import { digest, privateJson, atomicJson, readPreviewHandoff, validateTarget, PUBLISHER_TEAM_ID, STABLE_BUNDLE_ID } from './preview-handoff.mjs';

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], timeout: 120_000 });
function plist(bundle, key) { return run('/usr/bin/plutil', ['-extract',key,'raw','-o','-',path.join(bundle,'Contents/Info.plist')]).trim(); }
function preserveFailedBundle(bundle) {
  const preserved = `${bundle}.failed-${randomUUID()}`;
  fs.renameSync(bundle, preserved);
  return preserved;
}
export function ensureVerifiedStaging({ source, staged, version, verify = verifyApp, copy = (from,to) => run('/usr/bin/ditto',[from,to]) }) {
  if (fs.existsSync(staged)) {
    try { verify(staged,{ exactVersion:version }); return staged; }
    catch { preserveFailedBundle(staged); }
  }
  copy(source,staged);
  verify(staged,{ exactVersion:version });
  return staged;
}
export function verifyApp(bundle, { minimumVersion, exactVersion, requireStaple = true } = {}) {
  run('/usr/bin/codesign', ['--verify','--deep','--strict',bundle]);
  // A designated requirement binds both bundle and publisher, not just an optional team string.
  run('/usr/bin/codesign', ['--verify','-R',`identifier "${STABLE_BUNDLE_ID}" and anchor apple generic and certificate leaf[subject.OU] = "${PUBLISHER_TEAM_ID}"`,bundle]);
  if (requireStaple) run('/usr/bin/xcrun', ['stapler','validate',bundle]);
  run('/usr/sbin/spctl', ['--assess','--type','execute',bundle]);
  const version = plist(bundle,'CFBundleShortVersionString');
  if (plist(bundle,'CFBundleIdentifier') !== STABLE_BUNDLE_ID || !semver.valid(version)
    || (exactVersion && version !== exactVersion) || (minimumVersion && semver.lt(version,minimumVersion))) throw new Error('handoff_bundle_identity_mismatch');
  return { version, bundleId: STABLE_BUNDLE_ID, teamId: PUBLISHER_TEAM_ID };
}
export async function prepareTarget({ target, transactionRoot, fetchImpl = fetch }) {
  validateTarget(target);
  fs.mkdirSync(transactionRoot, { recursive:true, mode:0o700 });
  const dmg = path.join(transactionRoot,'target.dmg');
  if (fs.existsSync(dmg)) {
    const bytes = fs.readFileSync(dmg);
    if (bytes.length !== target.size || digest(bytes) !== target.sha256) fs.unlinkSync(dmg);
  }
  if (!fs.existsSync(dmg)) {
    const response = await fetchImpl(target.url, { signal: AbortSignal.timeout(15 * 60_000) });
    if (!response.ok || !response.body) throw new Error('handoff_download_failed');
    const tmp = `${dmg}.partial`, fd = fs.openSync(tmp,'w',0o600);
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > target.size) throw new Error('handoff_download_size_mismatch');
        fs.writeSync(fd,chunk);
      }
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    if (size !== target.size || digest(fs.readFileSync(tmp)) !== target.sha256) throw new Error('handoff_download_digest_mismatch');
    fs.renameSync(tmp,dmg);
  }
  run('/usr/bin/hdiutil',['verify',dmg]);
  run('/usr/bin/xcrun',['stapler','validate',dmg]);
  const mount = path.join(transactionRoot,'mount');
  fs.mkdirSync(mount,{ recursive:true });
  run('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);
  const staged = path.join(transactionRoot,'One Person Lab.app');
  try {
    const source = path.join(mount,'One Person Lab.app');
    verifyApp(source,{ exactVersion:target.version });
    ensureVerifiedStaging({ source,staged,version:target.version });
  } finally { run('/usr/bin/hdiutil',['detach',mount]); }
  return staged;
}

// Called in the signed target executable, with the canonical Electron singleton
// held. Neither a running legacy target nor another installation can race this commit.
export function commitPreparedTarget({ transactionRoot, selfBundle, targetUserDataRoot, applicationsRoot = '/Applications', hooks = {} }) {
  const verify = hooks.verifyApp ?? verifyApp;
  const copy = hooks.copy ?? ((from,to) => run('/usr/bin/ditto',[from,to]));
  const handoff = readPreviewHandoff(path.join(transactionRoot,'handoff.json'));
  const target = handoff.target;
  verify(selfBundle,{ exactVersion:target.version });
  const targetApp = path.join(applicationsRoot,'One Person Lab.app');
  const receiptPath = path.join(transactionRoot,'install.json');
  const hadJournal = fs.existsSync(receiptPath);
  let journal = hadJournal ? privateJson(receiptPath) : {
    schema:'opl_preview_install.v1', digest:handoff.digest, stage:'prepared',
    targetApp, backup:path.join(applicationsRoot,`.One Person Lab.previous-${handoff.digest.slice(0,16)}.app`),
    staged:path.join(applicationsRoot,`.One Person Lab.incoming-${handoff.digest.slice(0,16)}.app`)
  };
  if (journal.schema !== 'opl_preview_install.v1' || !['prepared','installed'].includes(journal.stage)
    || journal.digest !== handoff.digest || journal.targetApp !== targetApp) throw new Error('handoff_install_journal_mismatch');
  const expectedBackup = path.join(applicationsRoot,`.One Person Lab.previous-${handoff.digest.slice(0,16)}.app`);
  const expectedStage = path.join(applicationsRoot,`.One Person Lab.incoming-${handoff.digest.slice(0,16)}.app`);
  if (journal.backup !== expectedBackup || journal.staged !== expectedStage) throw new Error('handoff_install_path_mismatch');
  // An existing newer valid stable target must never be downgraded.
  let existing;
  if (fs.existsSync(targetApp)) {
    try { existing = verify(targetApp, { requireStaple:false }); }
    catch {
      // Only a prior owned, journaled replacement may recover from its retained backup.
      if (!hadJournal || journal.stage !== 'prepared' || !fs.existsSync(journal.backup)) throw new Error('handoff_existing_target_untrusted');
      const backupIdentity = verify(journal.backup,{ requireStaple:false });
      preserveFailedBundle(targetApp);
      fs.renameSync(journal.backup,targetApp);
      existing = backupIdentity;
    }
  }
  if (!existing || semver.lt(existing.version,target.version)) {
    ensureVerifiedStaging({ source:selfBundle,staged:journal.staged,version:target.version,verify,copy });
    atomicJson(receiptPath,journal);
    if (fs.existsSync(targetApp)) {
      if (fs.existsSync(journal.backup)) throw new Error('handoff_backup_collision');
      fs.renameSync(targetApp,journal.backup);
    }
    try {
      fs.renameSync(journal.staged,targetApp);
      verify(targetApp,{ exactVersion:target.version });
    } catch (error) {
      // Preserve failed bytes and restore the only previous install, never delete it.
      if (fs.existsSync(targetApp)) preserveFailedBundle(targetApp);
      if (fs.existsSync(journal.backup)) fs.renameSync(journal.backup,targetApp);
      throw error;
    }
  }
  journal = { ...journal, stage:'installed', version:verify(targetApp,{ minimumVersion:target.version, requireStaple: !existing || semver.lt(existing.version,target.version) }).version };
  atomicJson(receiptPath,journal);
  atomicJson(path.join(targetUserDataRoot,'handoff','incoming.json'),handoff);
  return { appPath:targetApp, version:journal.version, digest:handoff.digest };
}

export function launchInstallHelper(staged, transactionRoot, sourcePid) {
  const child = spawn(path.join(staged,'Contents/MacOS/One Person Lab'),
    ['--opl-install-preview-handoff',transactionRoot, String(sourcePid)],
    { detached:true, stdio:'ignore', env:{ ...process.env, ELECTRON_RUN_AS_NODE:'', NODE_OPTIONS:'' } });
  child.unref();
  return child;
}
