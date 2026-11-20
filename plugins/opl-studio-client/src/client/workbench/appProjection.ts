import type { OplActionReceipt } from "../bridge/oplBridge";
import type { SettingsDockerDiagnostic } from "./SettingsPanel";

export const managedUpdateActionSpecs = [
  {
    actionId: "settings_check_opl_base_update",
    operation: "check",
    componentIds: ["opl_base"],
    confirmationRequired: false,
    labels: ["检查 OPL Base 更新", "Check OPL Base update"]
  },
  {
    actionId: "settings_apply_opl_base_update",
    operation: "apply",
    componentIds: ["opl_base"],
    confirmationRequired: true,
    labels: ["更新 OPL Base", "Update OPL Base"]
  },
  {
    actionId: "settings_apply_opl_packages",
    operation: "apply",
    componentIds: ["opl_packages"],
    confirmationRequired: true,
    labels: ["更新能力包", "Update packages"]
  }
] as const;

export type ProjectedManagedUpdateAction = {
  actionId: string;
  label: string;
  payloadFields: string[];
  confirmationRequired: boolean;
  dryRunSupported: boolean;
};

export type ProjectedSetupAction = {
  actionId: "workspace_root_set" | "codex_install";
  payloadFields: string[];
  confirmationRequired: boolean;
  dryRunSupported: boolean;
};

export type ProjectedManifestInstallAction = {
  actionId: string;
  payloadFields: string[];
  confirmationRequired: boolean;
  dryRunSupported: boolean;
};

function appStateActionRecords(state: unknown): Record<string, unknown>[] {
  const root = typeof state === "object" && state !== null && !Array.isArray(state)
    ? state as Record<string, unknown>
    : null;
  const first = typeof root?.app_state === "object" && root.app_state !== null && !Array.isArray(root.app_state)
    ? root.app_state as Record<string, unknown>
    : root;
  const appState = typeof first?.app_state === "object" && first.app_state !== null && !Array.isArray(first.app_state)
    ? first.app_state as Record<string, unknown>
    : first;
  return Array.isArray(appState?.actions)
    ? appState.actions.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value))
    : [];
}

export function readProjectedManagedUpdateActions(state: unknown): ProjectedManagedUpdateAction[] {
  return appStateActionRecords(state).flatMap((action): ProjectedManagedUpdateAction[] => {
    const actionId = typeof action.action_id === "string" ? action.action_id.trim() : "";
    const spec = managedUpdateActionSpecs.find((candidate) => candidate.actionId === actionId);
    if (!spec) return [];
    const payloadFields = Array.isArray(action.payload_fields)
      ? action.payload_fields.filter((field): field is string => typeof field === "string" && Boolean(field.trim()))
      : [];
    return [{
      actionId,
      label: typeof action.label === "string" && action.label.trim() ? action.label : actionId,
      payloadFields,
      confirmationRequired: spec.confirmationRequired || action.confirmation_required === true,
      dryRunSupported: action.dry_run_supported === true
    }];
  });
}

export function readProjectedSetupActions(state: unknown): ProjectedSetupAction[] {
  const supported = new Set<ProjectedSetupAction["actionId"]>(["workspace_root_set", "codex_install"]);
  return appStateActionRecords(state).flatMap((action): ProjectedSetupAction[] => {
    const actionId = typeof action.action_id === "string" ? action.action_id.trim() : "";
    if (!supported.has(actionId as ProjectedSetupAction["actionId"])) return [];
    return [{
      actionId: actionId as ProjectedSetupAction["actionId"],
      payloadFields: Array.isArray(action.payload_fields)
        ? action.payload_fields.filter((field): field is string => typeof field === "string" && Boolean(field.trim()))
        : [],
      confirmationRequired: action.confirmation_required === true,
      dryRunSupported: action.dry_run_supported === true
    }];
  });
}

export function readProjectedManifestInstallAction(state: unknown): ProjectedManifestInstallAction | undefined {
  return appStateActionRecords(state).flatMap((action): ProjectedManifestInstallAction[] => {
    if (action.action_id !== "install_from_manifest_url") return [];
    const payloadFields = Array.isArray(action.payload_fields)
      ? action.payload_fields.filter((field): field is string => typeof field === "string" && Boolean(field.trim()))
      : [];
    if (!payloadFields.includes("manifest_url") || !payloadFields.includes("trust_tier")) return [];
    return [{
      actionId: action.action_id,
      payloadFields,
      confirmationRequired: action.confirmation_required === true,
      dryRunSupported: action.dry_run_supported === true
    }];
  })[0];
}

export function dockerDiagnosticFromReceipt(receipt: OplActionReceipt): SettingsDockerDiagnostic | null {
  const root = typeof receipt.stdoutJson === "object" && receipt.stdoutJson !== null && !Array.isArray(receipt.stdoutJson)
    ? receipt.stdoutJson as Record<string, unknown>
    : null;
  const execution = typeof root?.app_action_execution === "object" && root.app_action_execution !== null && !Array.isArray(root.app_action_execution)
    ? root.app_action_execution as Record<string, unknown>
    : null;
  const result = typeof execution?.result === "object" && execution.result !== null && !Array.isArray(execution.result)
    ? execution.result as Record<string, unknown>
    : null;
  const doctor = typeof result?.docker_webui_doctor === "object" && result.docker_webui_doctor !== null && !Array.isArray(result.docker_webui_doctor)
    ? result.docker_webui_doctor as Record<string, unknown>
    : null;
  if (!doctor) return null;
  const diagnosticSummary = typeof doctor.diagnostic_summary === "object" && doctor.diagnostic_summary !== null && !Array.isArray(doctor.diagnostic_summary)
    ? doctor.diagnostic_summary as Record<string, unknown>
    : null;
  const summary = typeof doctor.summary === "object" && doctor.summary !== null && !Array.isArray(doctor.summary)
    ? doctor.summary as Record<string, unknown>
    : null;
  const startupState = typeof doctor.startup_state === "object" && doctor.startup_state !== null && !Array.isArray(doctor.startup_state)
    ? doctor.startup_state as Record<string, unknown>
    : null;
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value : undefined;
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
  return {
    status: text(doctor.status) ?? text(diagnosticSummary?.status) ?? "unknown",
    ...(number(summary?.attention_count) !== undefined ? { attentionCount: number(summary?.attention_count) } : {}),
    ...(text(startupState?.phase) ? { startupPhase: text(startupState?.phase) } : {}),
    ...(text(diagnosticSummary?.docker_runtime_status) ? { dockerRuntimeStatus: text(diagnosticSummary?.docker_runtime_status) } : {}),
    ...(text(diagnosticSummary?.browser_url_status) ? { browserUrlStatus: text(diagnosticSummary?.browser_url_status) } : {}),
    ...(text(diagnosticSummary?.startup_maintenance_status) ? { startupMaintenanceStatus: text(diagnosticSummary?.startup_maintenance_status) } : {})
  };
}
