import { expect, test } from 'bun:test';
import { featureCompletenessFixture } from '../fixtures/feature-completeness.mjs';
import { agentPackageSelectionIntent, deriveWorkbenchModelFromState } from '../../src/workbench/workbenchModel';
import { compactFastState } from '../../scripts/webui-host/opl-passthrough.mjs';
Object.assign(globalThis, { __OPL_CODEX_MODEL_POLICY__: {
  source: 'test-fixture', defaultModel: 'codex-fixture', defaultReasoningEffort: 'high', visibleModels: [{ id: 'codex-fixture' }], reasoningEfforts: ['high'],
  autoLabel: { zh: '自动（推荐）', en: 'Auto (recommended)' }, knownModelReasoningEffortOverrides: {}, acceptUnknownCatalogDefault: true, useHighestSupportedReasoningForUnknown: true,
} });
const { normalizeActionReceipt } = await import('../../src/bridge/oplBridge');
import { actionReceiptView } from '../../src/workbench/actionReceiptView';
import { readMemoryRefs } from '../../src/workbench/MemoryRefsPanel';

test('MAS MAG RCA directory, selection, lifecycle actions and Runtime survive real fast projection', () => {
  const model = deriveWorkbenchModelFromState(compactFastState({ app_state: featureCompletenessFixture() }));
  expect(model.packageLifecycle.map(item => item.packageId)).toEqual(['med-autoscience', 'med-autogrant', 'redcube-ai']);
  for (const item of model.packageLifecycle) {
    expect(item.readiness.selectionStatus).toBe('available');
    expect(item.readiness.selectable).toBe(true);
    const selection = agentPackageSelectionIntent(item);
    expect(selection.packageId).toBe(item.packageId); expect(selection.requiredSkillIds).toHaveLength(1);
    expect(selection.route?.codexVisibleEntry).toBeTruthy();
  }
  expect(model.workItemRuntime?.items).toHaveLength(3);
  expect(model.workItemRuntime?.items[0]?.canonicalThreadIds).toEqual(['thread-source']);
  expect(model.workItemRuntime?.items[1]?.canonicalThreadIds).toEqual(['missing-thread']);
  expect(model.workItemRuntime?.items[2]?.canonicalThreadIds).toEqual([]);
  expect(model.workItemRuntime?.items[0]?.domainDetailViews?.[0]?.availability).toBe('stale');
  expect(model.workItemRuntime?.items[1]?.domainDetailViews?.[0]?.viewKind).toBe('future-view');
  expect(model.workItemRuntime?.items[2]?.domainDetailViews?.[0]?.availability).toBe('invalid');
});

test('typed action statuses preserve unsupported, no-op and owner errors; raw secrets stay out of receipt view', () => {
  for (const status of ['unsupported', 'no_op', 'error'] as const) {
    const receipt = normalizeActionReceipt({ actionId: 'fixture', dryRun: false, status, receiptKind: 'execute', exitCode: 0, stdout: JSON.stringify({ result: { summary: 'api_key=private', affected_categories: ['cache'], owner: 'Framework' } }), stderr: '', command: 'opl', commandArgs: ['secret'], timedOut: false }, { actionId: 'fixture', dryRun: false, payload: { confirmed: true } });
    expect(receipt.status).toBe(status); expect(actionReceiptView(receipt).summary).toBeUndefined();
    expect(actionReceiptView(receipt).affectedCategories).toEqual(['cache']);
    expect(JSON.stringify(actionReceiptView(receipt))).not.toContain('private');
  }
});

test('storage action receipts expose expected and verified user outcomes without raw payloads', () => {
  const receipt = normalizeActionReceipt({ actionId: 'package_contribution_execute', dryRun: false, status: 'executed', receiptKind: 'execute', exitCode: 0, stdout: JSON.stringify({ result: {
    user_goal: 'release_space', selected_bytes: 4096, expected_state: { retained_bytes: 8192 },
    terminal_readback: { inventory_status: 'confirmed', inventory: { total_bytes: 8192, reclaimable_bytes: 0 } },
    recoverability: 'not_restorable', impact: { will_not_change: ['projects', 'credentials'] }, summary: 'Released cache space'
  } }), stderr: '', command: 'opl', commandArgs: [], timedOut: false }, { actionId: 'package_contribution_execute', dryRun: false, payload: { confirmed: true } });
  const view = actionReceiptView(receipt);
  expect(view.userGoal).toBe('release_space');
  expect(view.selectedBytes).toBe(4096);
  expect(view.expectedRemainingBytes).toBe(8192);
  expect(view.readbackStatus).toBe('confirmed');
  expect(view.actualReclaimableBytes).toBe(0);
  expect(view.protectedFromChange).toEqual(['projects', 'credentials']);
});

test('memory reads only explicit locator projection, never memory content', () => {
  expect(readMemoryRefs({ drilldown: { ref_family_refs: { memory_refs: { refs: [{ ref: 'memory://item', role: 'consumed_memory_ref', content: 'private body' }] } } } } as never)).toEqual([{ ref: 'memory://item', role: 'consumed_memory_ref' }]);
});

 test('memory refs unwrap the real operator envelope', () => {
  expect(readMemoryRefs({ drilldown: { app_operator_drilldown: { ref_family_refs: { memory_refs: { refs: [{ ref: 'memory://real', role: 'consumed_memory_ref' }] } } } } } as never)).toEqual([{ ref: 'memory://real', role: 'consumed_memory_ref' }]);
});
