import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexAppServerTransport } from '../../plugins/core/opl-codex-native/src/app-server-transport.mjs';

class CapturingTransport extends CodexAppServerTransport {
  constructor() { super({ cwd: '/tmp/opl-preferences-test' }); }
  async resumeThread(threadId) { return { thread: { id: threadId, cwd: '/tmp/opl-preferences-test' } }; }
  async startThread() { return { thread: { id: 'new-thread' } }; }
  async startTurn(threadId, prompt, inputs, options) { this.observed = { threadId, prompt, inputs, options }; throw Error('captured before execution'); }
}
for (const threadId of [undefined, 'existing-thread']) {
  test(`execution preferences reach the canonical turn for ${threadId ?? 'new thread'}`, async () => {
    const transport = new CapturingTransport();
    await assert.rejects(transport.sendMessage({ threadId, prompt: 'A task', permissions: ':workspace', autoReview: true, timeContext: true }), /captured before execution/);
    assert.equal(transport.observed.options.approvalsReviewer, 'auto_review');
    assert.equal(transport.observed.options.approvalPolicy, 'on-request');
    assert.equal(transport.observed.options.sandboxPolicy.type, 'workspaceWrite');
    assert.match(transport.observed.prompt, /^\[Application time context: .*timezone:.*\]\n\nA task$/);
    assert.equal(transport.observed.options.additionalContext, undefined);
    await assert.rejects(transport.sendMessage({ threadId, prompt: 'Next task', permissions: ':workspace', autoReview: false, timeContext: false }), /captured before execution/);
    assert.equal(transport.observed.options.approvalsReviewer, 'user');
    assert.equal(transport.observed.options.additionalContext, undefined);
  });
}

test('malformed execution preferences cannot change approval routing', async () => {
  const transport = new CapturingTransport();
  await assert.rejects(transport.sendMessage({ prompt: 'A task', autoReview: 'false' }), /must be booleans/);
  await assert.rejects(transport.sendMessage({ prompt: 'A task', timeContext: 1 }), /must be booleans/);
  assert.equal(transport.observed, undefined);
});
