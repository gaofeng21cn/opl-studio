import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensureGuestFramework } from './windows-framework-install.mjs';

function fixture(context) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'opl-windows-framework-install-'));
  context.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const payload=path.join(root,'payload'),installRoot=path.join(root,'framework'),calls=path.join(root,'calls');
  fs.mkdirSync(path.join(payload,'runtime'),{recursive:true});
  fs.writeFileSync(path.join(payload,'manifest.json'),JSON.stringify({bootstrap:{framework_ref:'a'.repeat(40)}}));
  fs.writeFileSync(path.join(payload,'runtime/opl-install.sh'),'#!/bin/bash\nset -eu\nprintf "%s|%s|%s\\n" "$*" "$OPL_INSTALL_BRANCH" "$OPL_INSTALL_DIR" > "$FIXTURE_CALLS"\nmkdir -p "$OPL_INSTALL_DIR"\n');
  return {payload,installRoot,calls,env:{...process.env,FIXTURE_CALLS:calls}};
}

test('WSL repair preserves a working Framework artifact owner without the archive installer marker', context=>{
  const fx=fixture(context);
  fs.mkdirSync(path.join(fx.installRoot,'bin'),{recursive:true});
  const pkg=JSON.stringify({name:'opl-framework',version:'0.3.6'});
  fs.writeFileSync(path.join(fx.installRoot,'package.json'),pkg);
  fs.writeFileSync(path.join(fx.installRoot,'bin/opl'),'#!/bin/sh\n[ "$1" = "--version" ] || exit 2\nprintf "0.3.6\\n"\n',{mode:0o755});
  assert.deepEqual(ensureGuestFramework(fx),{status:'retained_existing_owner'});
  assert.equal(fs.existsSync(fx.calls),false);
  assert.equal(fs.readFileSync(path.join(fx.installRoot,'package.json'),'utf8'),pkg);
});

test('first install delegates the pinned source and managed root to the Framework installer', context=>{
  const fx=fixture(context);
  assert.deepEqual(ensureGuestFramework(fx),{status:'installed'});
  assert.equal(fs.readFileSync(fx.calls,'utf8'),`--headless --skip-packages|${'a'.repeat(40)}|${fx.installRoot}\n`);
});
