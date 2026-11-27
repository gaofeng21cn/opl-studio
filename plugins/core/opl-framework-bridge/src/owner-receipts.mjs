const contributionSchema = "opl-package-app-contribution-response.v1";
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

function invalidReceipt() {
  return Object.assign(new Error("The owner returned an invalid or mismatched receipt."), { code: "invalid_owner_receipt" });
}

function checkContributionIdentity(value, { packageId, ref, operation }) {
  if (!isRecord(value) || (value.ref !== undefined && value.ref !== ref)
    || (value.operation !== undefined && value.operation !== operation)
    || (packageId !== undefined && value.package_id !== undefined && value.package_id !== packageId)) {
    throw invalidReceipt();
  }
}

export function readContributionEnvelope(raw, packageId, ref) {
  const identity = { packageId, ref, operation: "read" };
  const outer = raw?.opl_app_contribution;
  if (outer !== undefined) {
    checkContributionIdentity(outer, identity);
    if (outer.surface_kind !== "opl_app_package_contribution.v1" || outer.ref !== ref
      || outer.operation !== "read" || (packageId !== undefined && outer.package_id !== packageId)) throw invalidReceipt();
  }
  const value = outer ? outer.response : raw;
  checkContributionIdentity(value, identity);
  if (value.schema_version !== undefined && value.schema_version !== contributionSchema) throw invalidReceipt();
  // Direct handlers can return either the contribution ABI or their domain view
  // (state, data, revision, etc.). Keep the latter together for the renderer.
  const { ok } = value;
  if (ok !== undefined && typeof ok !== "boolean") throw invalidReceipt();
  const response = {
    ...value, schema_version: contributionSchema, ref, operation: "read", ok: ok ?? true,
    result: Object.hasOwn(value, "result") ? value.result : value,
  };
  if (!("result" in value || "state" in value || "data" in value || "sha256" in value) && ok !== false) throw invalidReceipt();
  return { ...raw, opl_app_contribution: {
    ...outer, surface_kind: "opl_app_package_contribution.v1", package_id: packageId ?? outer?.package_id ?? value.package_id,
    ref, operation: "read", response,
  } };
}

function actionStatus(value, owner, isDry) {
  if (value?.status === "confirmation_required") return "confirmation_required";
  if (!isRecord(value)) return "error";
  const execution = value.app_action_execution;
  const result = execution?.result ?? value.result;
  if (execution?.action_id === "source_refresh" && result?.refreshed === false) return "error";
  if (value.ok === false || owner?.ok === false || result?.ok === false
    || execution?.success === false || result?.success === false) return "error";
  const failures = ["failed", "error", "blocked", "unavailable", "not_configured", "owner_action_required"];
  if (failures.includes(execution?.status) || failures.includes(result?.status)
    || result?.native_action?.status === "needs_attention") return "error";
  if (["no_op", "noop"].includes(result?.status) || result?.native_action?.status === "already_connected") return "no_op";
  const status = value.status ?? execution?.status;
  if (status === "no_op" || status === "unsupported" || status === "blocked_read_only" || status === "timed_out") return status;
  if (status === "preview_ready" || status === "preview") return isDry ? "preview_ready" : "error";
  if (status === "completed" || status === "executed") return isDry ? "error" : "executed";
  if (status === undefined && (owner?.ok === true || value.ok === true)) return isDry ? "preview_ready" : "executed";
  return "error";
}

export function actionOwnerReceipt(readback, value, { actionId, packageId, payload, requestedMode, dryRun }) {
  const envelope = value?.opl_app_contribution;
  for (const result of [value, value?.app_action_execution]) {
    if (result?.action_id !== undefined && result.action_id !== actionId) throw invalidReceipt();
    const returnedDryRun = result?.dry_run ?? result?.dryRun;
    if (returnedDryRun !== undefined && returnedDryRun !== dryRun) throw invalidReceipt();
  }
  if (envelope !== undefined) {
    const identity = { packageId: packageId ?? payload.package_id, ref: payload.ref, operation: "execute" };
    checkContributionIdentity(envelope, identity);
    checkContributionIdentity(envelope.response, identity);
    if (envelope.operation !== "execute" || envelope.ref !== identity.ref || envelope.package_id !== identity.packageId
      || envelope.response.ref !== identity.ref || envelope.response.operation !== "execute"
      || envelope.response.schema_version !== contributionSchema || typeof envelope.response.ok !== "boolean") throw invalidReceipt();
  }
  const owner = envelope?.response;
  const status = actionStatus(value, owner, dryRun);
  const failed = status === "error" || status === "timed_out" || status === "blocked_read_only";
  const metadata = value?.app_action_execution ?? value;
  const reason = value?.blockedReason ?? value?.blocked_reason ?? owner?.error?.code ?? value?.error?.code ?? value?.result?.error?.code;
  return {
    ...readback, actionId, payload, requestedMode, dryRun,
    authorityBoundary: "app_bridge_no_domain_authority", status,
    canExecute: !failed && status !== "confirmation_required" && status !== "unsupported" && value?.canExecute !== false,
    confirmationRequired: status === "confirmation_required" || (value?.confirmation_required ?? value?.confirmationRequired ?? envelope?.confirmation_required) === true,
    receiptKind: status === "confirmation_required" || status === "blocked_read_only" ? status : requestedMode,
    exitCode: failed ? 1 : 0, timedOut: status === "timed_out", stdoutJson: value,
    ...(reason ? { blockedReason: String(reason) } : {}),
    ...(failed ? { stderr: String(reason ?? value?.error?.message ?? owner?.error?.message ?? "Owner action failed") } : {}),
    ...(metadata?.confirmationId ?? metadata?.confirmation_id ? { confirmationId: metadata.confirmationId ?? metadata.confirmation_id } : {}),
    ...(metadata?.receiptId ?? metadata?.receipt_id ? { receiptId: metadata.receiptId ?? metadata.receipt_id } : {}),
  };
}
