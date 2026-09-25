import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyApp } from '../../desktop/handoff-installer.mjs';

function systemCommands({ notarized = true, gatekeeperStatus = 0 } = {}) {
  const calls = [];
  const execute = (command, args) => {
    calls.push({ command, args });
    if (command === '/usr/sbin/spctl') return { status:gatekeeperStatus, stdout:'', stderr:`app: accepted\nsource=${notarized ? 'Notarized Developer ID' : 'Developer ID'}\n` };
    if (command === '/usr/bin/plutil') return { status:0, stdout:args[1] === 'CFBundleIdentifier' ? 'cn.onepersonlab.opl\n' : '26.9.2491\n', stderr:'' };
    if (command === '/usr/bin/codesign') return { status:0, stdout:'', stderr:'' };
    throw new Error(`Unavailable on customer Mac: ${command}`);
  };
  return { execute, calls };
}

test('handoff checks notarization with built-in macOS tools and stderr verdict', () => {
  const system = systemCommands();
  assert.equal(verifyApp('/Applications/One Person Lab.app', { exactVersion:'26.9.2491', execute:system.execute }).version, '26.9.2491');
  const requirement = system.calls.find(call => call.command === '/usr/bin/codesign' && call.args.includes('-R'));
  assert.match(requirement.args[requirement.args.indexOf('-R') + 1], /^=identifier "cn\.onepersonlab\.opl" and anchor apple generic/);
  assert.ok(system.calls.every(call => call.command !== '/usr/bin/xcrun'));
});

test('handoff rejects missing notarization, Gatekeeper failure, and wrong version', () => {
  assert.throws(() => verifyApp('/app', { execute:systemCommands({ notarized:false }).execute }), /notarization_not_verified/);
  assert.throws(() => verifyApp('/app', { execute:systemCommands({ gatekeeperStatus:3 }).execute }), /distribution_check_failed/);
  assert.throws(() => verifyApp('/app', { exactVersion:'26.9.2492', execute:systemCommands().execute }), /identity_mismatch/);
  assert.equal(verifyApp('/app', { requireNotarization:false, execute:systemCommands({ notarized:false }).execute }).bundleId, 'cn.onepersonlab.opl');
});
