import type { OplActionReceipt } from '../bridge/oplBridge';

export type ActionReceiptView = {
  actionId: string;
  status: string;
  receiptId?: string;
  owner?: string;
  summary?: string;
  affectedFiles?: { name: string; bytes: number }[];
  affectedCategories: string[];
  nextStep?: string;
  userGoal?: string;
  selectedBytes?: number;
  expectedRemainingBytes?: number;
  readbackStatus?: string;
  actualRemainingBytes?: number;
  actualReclaimableBytes?: number;
  recoverability?: string;
  protectedFromChange?: string[];
};
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const safeText = (value: unknown): string | undefined => typeof value === 'string' && !/(?:sk-[\w-]+|bearer\s|password|api[_ -]?key|token\s*[:=]|secret\s*[:=])/i.test(value) ? value.slice(0, 2000) : undefined;
// Never render raw command args, payload, stdout or stderr in a receipt/diagnostic summary.
export function actionReceiptView(receipt: OplActionReceipt): ActionReceiptView {
  const root = record(receipt.stdoutJson);
  const execution = record(root.app_action_execution);
  const result = record(execution.result ?? root.result);
  const currentState = record(result.current_state);
  const expectedState = record(result.expected_state);
  const terminalReadback = record(result.terminal_readback);
  const readbackInventory = record(terminalReadback.inventory);
  const impact = record(result.impact);
  return { actionId: receipt.actionId, status: receipt.status, receiptId: safeText(receipt.receiptId),
    owner: safeText(result.owner ?? execution.owner), summary: safeText(result.summary), nextStep: safeText(result.next_visible_step),
    affectedFiles: Array.isArray(result.files) ? result.files.slice(0, 2000).flatMap(value => { const row = record(value); const name = safeText(row.name); return name && typeof row.bytes === 'number' ? [{ name, bytes: row.bytes }] : []; }) : undefined,
    affectedCategories: Array.isArray(result.affected_categories) ? result.affected_categories.flatMap(value => safeText(value) ?? []) : [],
    userGoal: safeText(result.user_goal),
    selectedBytes: typeof (result.selected_bytes ?? currentState.selected_bytes) === 'number' ? Number(result.selected_bytes ?? currentState.selected_bytes) : undefined,
    expectedRemainingBytes: typeof expectedState.retained_bytes === 'number' ? expectedState.retained_bytes : undefined,
    readbackStatus: safeText(terminalReadback.inventory_status),
    actualRemainingBytes: typeof readbackInventory.total_bytes === 'number' ? readbackInventory.total_bytes : undefined,
    actualReclaimableBytes: typeof readbackInventory.reclaimable_bytes === 'number' ? readbackInventory.reclaimable_bytes : undefined,
    recoverability: safeText(result.recoverability) ?? (result.restore_supported === false ? 'not_restorable' : undefined),
    protectedFromChange: Array.isArray(impact.will_not_change) ? impact.will_not_change.flatMap(value => safeText(value) ?? []) : undefined,
  };
}
