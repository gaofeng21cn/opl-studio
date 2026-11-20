import { asBoolean, asNumber, asRecord, asString, parseJsonValue } from "@gaofeng21cn/opl-host-contracts/bridge-primitives";
import { buildActionCommand, buildActionCommandArgs } from "./oplBridge-commands";
import { normalizeCommandReadback } from "./oplBridge-normalizers-state";
import type { OplActionMode, OplActionReceipt, OplActionReceiptKind, OplActionReceiptStatus, OplActionRequest } from "@gaofeng21cn/opl-host-contracts";

function actionMode(request: OplActionRequest): OplActionMode {
  if (request.mode) return request.mode;
  if (request.payload?.rollbackRef) return "rollback";
  return request.dryRun === false ? "execute" : "preview";
}

function actionReceiptKind(request: OplActionRequest): OplActionReceiptKind {
  if (request.dryRun === false && request.payload?.confirmed !== true) return "confirmation_required";
  return actionMode(request);
}

function actionReceiptStatus(
  receiptKind: OplActionReceiptKind,
  dryRun: boolean,
  exitCode: number,
  timedOut: boolean
): OplActionReceiptStatus {
  if (timedOut) return "timed_out";
  if (receiptKind === "blocked_read_only") return "blocked_read_only";
  if (receiptKind === "confirmation_required") return "confirmation_required";
  if (exitCode !== 0) return "error";
  return dryRun ? "preview_ready" : "executed";
}

export function createPlaceholderActionReceipt(request: OplActionRequest): OplActionReceipt {
  const command = buildActionCommand(request);
  const commandArgs = buildActionCommandArgs(request);
  const receiptKind = actionReceiptKind(request);
  const dryRun = request.dryRun !== false;
  const exitCode = -1;
  const stderr = receiptKind === "confirmation_required"
    ? "confirmation_required"
    : JSON.stringify({
        error: "bridge_unavailable_placeholder",
        boundary: "preview_only_no_native_action_record"
      });
  return {
    actionId: request.actionId,
    dryRun,
    confirmationRequired: receiptKind === "confirmation_required",
    canExecute: false,
    receiptKind,
    authorityBoundary: "app_bridge_no_domain_authority",
    requestedMode: actionMode(request),
    status: actionReceiptStatus(receiptKind, dryRun, exitCode, false),
    command,
    commandArgs,
    exitCode,
    stdout: "",
    stderr,
    timedOut: false,
    payload: request.payload,
    stdoutJson: undefined,
    stderrJson: parseJsonValue(stderr),
    confirmationId: request.payload?.confirmationId,
    receiptId: request.payload?.receiptId,
    rollbackRef: request.payload?.rollbackRef
  };
}

function hasActionReceiptRecord(record: Record<string, unknown>): boolean {
  return Boolean(
    asString(record.actionId)
      || asString(record.command)
      || typeof record.exitCode === "number"
      || typeof record.stdout === "string"
      || typeof record.stderr === "string"
      || asString(record.receiptKind)
  );
}



export function projectedActionStatus(value: unknown): OplActionReceiptStatus | undefined {
  return ["preview_ready", "confirmation_required", "blocked_read_only", "executed", "no_op", "unsupported", "error", "timed_out"].includes(String(value)) ? value as OplActionReceiptStatus : undefined;
}

export function normalizeActionReceipt(value: unknown, request: OplActionRequest): OplActionReceipt {
  const fallback = createPlaceholderActionReceipt(request);
  const record = asRecord(value);
  if (!record || !hasActionReceiptRecord(record)) return fallback;
  const readback = normalizeCommandReadback(record, fallback.command, fallback.commandArgs);
  const receiptKind = (asString(record.receiptKind) as OplActionReceiptKind | undefined) ?? fallback.receiptKind;
  return {
    ...fallback,
    actionId: asString(record.actionId) ?? fallback.actionId,
    dryRun: asBoolean(record.dryRun) ?? fallback.dryRun,
    confirmationRequired: asBoolean(record.confirmationRequired) ?? fallback.confirmationRequired,
    canExecute: asBoolean(record.canExecute) ?? fallback.canExecute,
    receiptKind,
    requestedMode: fallback.requestedMode,
    status: (readback.exitCode === 0 && !readback.timedOut ? projectedActionStatus(record.status) : undefined) ?? actionReceiptStatus(
      receiptKind,
      asBoolean(record.dryRun) ?? fallback.dryRun,
      readback.exitCode,
      readback.timedOut
    ),
    authorityBoundary: (asString(record.authorityBoundary) as "app_bridge_no_domain_authority" | undefined) ?? fallback.authorityBoundary,
    command: readback.command,
    commandArgs: readback.commandArgs,
    exitCode: readback.exitCode,
    stdout: readback.stdout,
    stderr: readback.stderr,
    timedOut: readback.timedOut,
    payload: request.payload,
    stdoutJson: parseJsonValue(readback.stdout) ?? record.stdoutJson,
    stderrJson: parseJsonValue(readback.stderr),
    confirmationId: asString(record.confirmationId) ?? fallback.confirmationId,
    receiptId: asString(record.receiptId) ?? fallback.receiptId,
    rollbackRef: asString(record.rollbackRef) ?? fallback.rollbackRef,
    blockedReason: asString(record.blockedReason) ?? fallback.blockedReason
  };
}
