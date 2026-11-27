import type { OplActionReceipt, OplStudioShellService } from "@gaofeng21cn/opl-host-contracts";

export type OplFlowCarrier = "codex" | "antigravity" | "dsh";
export type OplFlowJumpMode = "native_switch" | "launch_new" | "external_focus_only";
export type OplFlowTabId =
  | "needs_action"
  | "safe_to_archive"
  | "active_objectives"
  | "active_sessions"
  | "blocked"
  | "backlog"
  | "pending_events";

export type OplFlowServiceSnapshot = {
  schema?: string;
  platform?: string;
  label?: string;
  installed?: boolean;
  running?: boolean;
  bridge?: "auto" | "codex" | "antigravity" | "custom" | null;
};

export type OplFlowInboxEntry = {
  bead_id: string;
  title: string;
  status?: string;
  execution_mode?: string | null;
  execution_carrier?: string | null;
  preferred_adapter?: string | null;
  bound_session_ref?: string | null;
  category?: string;
  first_blocker?: string | null;
  next_action?: string | null;
  remaining?: string[];
  remaining_count?: number;
  archive_performed?: boolean;
  user_approval_required?: boolean;
  workspace_path?: string | null;
  session_id?: string | null;
  thread_id?: string | null;
  jump_mode?: OplFlowJumpMode;
};

export type OplFlowSessionEntry = {
  session_ref: string;
  carrier: OplFlowCarrier | string;
  surface?: string;
  harness?: string;
  model_label?: string;
  title?: string;
  workspace_label?: string | null;
  workspace_path?: string | null;
  session_id?: string | null;
  thread_id?: string | null;
  jump_mode?: OplFlowJumpMode;
  status?: string;
  updated_at?: string;
  bound_bead_id?: string | null;
};

export type OplFlowPendingEvent = {
  event_id: string;
  event_type: string;
  objective_id: string;
  source?: string;
  status?: string;
  created_at?: string;
  summary?: string;
};

export type OplFlowWorkspaceOccupant = {
  workspace_label: string;
  workspace_path?: string;
  carrier: string;
  harness?: string | null;
  session_ref: string;
  session_id?: string | null;
  bound_bead_id?: string | null;
};

export type OplFlowDashboardData = {
  schema?: string;
  instance_name?: string;
  fetched_at?: string;
  service: OplFlowServiceSnapshot;
  counts: {
    needs_action: number;
    safe_to_archive: number;
    active_objectives: number;
    active_sessions: number;
    blocked: number;
    backlog: number;
    pending_events: number;
    total_objectives?: number;
  };
  inbox: {
    needs_action?: OplFlowInboxEntry[];
    safe_to_archive?: OplFlowInboxEntry[];
    active_objectives?: OplFlowInboxEntry[];
    active_sessions?: OplFlowSessionEntry[];
    active_workspace_occupants?: OplFlowWorkspaceOccupant[];
    blocked?: OplFlowInboxEntry[];
    backlog?: OplFlowInboxEntry[];
    pending_events?: OplFlowPendingEvent[];
  };
  active_sessions?: {
    sessions?: OplFlowSessionEntry[];
    active_workspace_occupants?: OplFlowWorkspaceOccupant[];
  };
  items?: Array<Record<string, unknown>>;
  validation_errors?: string[];
};

export type OplFlowDashboardEnvelope = {
  ok?: boolean;
  state: "ready" | "unavailable" | "error";
  reason?: string;
  data?: OplFlowDashboardData;
  error?: { code?: string; message?: string };
};

export type StudioWindowBridge = {
  readState?: (profile?: "fast" | "full", includeSetup?: boolean) => Promise<unknown>;
  readContribution?: (request: {
    packageId: string;
    ref: string;
    input?: Record<string, unknown>;
  }) => Promise<unknown>;
  executeAction?: (request: {
    actionId: string;
    payload?: Record<string, unknown>;
    dryRun?: boolean;
  }) => Promise<OplActionReceipt>;
};

export function resolveStudioWindowBridge(): StudioWindowBridge | undefined {
  return (globalThis as typeof globalThis & { window?: { oplStudio?: StudioWindowBridge } }).window?.oplStudio;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function evaluatePackageRecord(rec: Record<string, unknown> | null): "enabled" | "disabled" | "absent" {
  if (!rec) return "absent";
  if (rec.exposure_status === "disabled") return "disabled";
  if (rec.app_enabled === false || rec.enabled === false || rec.installed === false) {
    return "disabled";
  }
  if (rec.app_enabled === true || rec.enabled === true || rec.installed === true) {
    return "enabled";
  }
  return "absent";
}

function matchOplFlowPackageRecord(list: unknown): "enabled" | "disabled" | "absent" {
  if (!Array.isArray(list)) return "absent";
  for (const item of list) {
    const rec = asRecord(item);
    if (!rec) continue;
    const pid = rec.package_id ?? rec.id ?? rec.name;
    if (pid !== "opl-flow") continue;
    const verdict = evaluatePackageRecord(rec);
    if (verdict !== "absent") return verdict;
  }
  return "absent";
}

/**
 * Determine strictly from Framework `opld` `app.state.get` readback whether `opl-flow`
 * Package is both installed and enabled. Absent/disabled packages render zero UI.
 */
export function isOplFlowPackageEnabled(stateReadback: unknown): boolean {
  const root = asRecord(stateReadback);
  if (!root) return false;
  const appState = asRecord(root.app_state) ?? root;

  const agentPackages = asRecord(appState.agent_packages);
  const statusPackages = asRecord(asRecord(agentPackages?.status_index)?.packages);
  const indexedRecord = asRecord(statusPackages?.["opl-flow"]);
  if (indexedRecord) {
    const verdict = evaluatePackageRecord(indexedRecord);
    if (verdict === "enabled") return true;
    if (verdict === "disabled") return false;
  }

  const explicitPackageLists = [
    asRecord(agentPackages?.directory)?.entries,
    agentPackages?.packages,
    agentPackages?.items,
    root.packages,
    root.installed_packages,
    appState.packages,
    appState.installed_packages
  ];
  for (const candidate of explicitPackageLists) {
    const verdict = matchOplFlowPackageRecord(candidate);
    if (verdict === "enabled") return true;
    if (verdict === "disabled") return false;
  }

  const contribEntries = asRecord(appState.ui_contributions)?.entries;
  if (Array.isArray(contribEntries)) {
    const found = contribEntries.some((entry) => asRecord(entry)?.package_id === "opl-flow");
    if (found) return true;
  }

  const modules = asRecord(appState.modules)?.items;
  if (Array.isArray(modules)) {
    for (const item of modules) {
      const rec = asRecord(item);
      if (rec?.module_id === "opl-flow") {
        return rec.installed === true && rec.enabled !== false && rec.app_enabled !== false;
      }
    }
  }
  return false;
}

export function extractContributionResult<T = unknown>(raw: unknown): T {
  const rec = asRecord(raw);
  if (!rec) throw new Error("Empty contribution response");
  if (typeof rec.exitCode === "number" && rec.exitCode !== 0 && !rec.stdoutJson && !rec.parsed) {
    throw new Error(String(rec.stderr || "Contribution read failed"));
  }
  const jsonBody = asRecord(rec.parsed)
    ?? asRecord(rec.stdoutJson)
    ?? (typeof rec.stdout === "string" && rec.stdout.trim() ? asRecord(JSON.parse(rec.stdout)) : null)
    ?? rec;
  const envelope = asRecord(jsonBody.opl_app_contribution);
  if (envelope) {
    const response = asRecord(envelope.response);
    if (response?.ok === false) {
      const err = asRecord(response.error);
      throw new Error(String(err?.message || "OPL Flow contribution returned error"));
    }
    if (response && "result" in response) {
      return response.result as T;
    }
  }
  return jsonBody as T;
}

export async function readOplFlowDashboard(bridge = resolveStudioWindowBridge()): Promise<OplFlowDashboardEnvelope> {
  if (!bridge?.readContribution) {
    throw new Error("OPL contribution bridge is unavailable in this host");
  }
  const raw = await bridge.readContribution({
    packageId: "opl-flow",
    ref: "opl-flow.decision.v1#dashboard",
    input: {
      include_local_navigation: true,
      host_carrier: "codex"
    }
  });
  const result = extractContributionResult<OplFlowDashboardEnvelope>(raw);
  if (!result || typeof result !== "object") {
    throw new Error("Invalid OPL Flow dashboard payload");
  }
  if (result.ok === false || result.state === "error") {
    throw new Error(result.error?.message || result.reason || "OPL Flow dashboard read failed");
  }
  return result;
}

export async function executeOplFlowAction(
  shell: Pick<OplStudioShellService, "executeAction">,
  ref: "opl-flow.decision.v1#send" | "opl-flow.decision.v1#approve" | "opl-flow.decision.v1#tick" | "opl-flow.decision.v1#service",
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const receipt = await shell.executeAction({
    actionId: "package_contribution_execute",
    payload: {
      package_id: "opl-flow",
      ref,
      input,
      confirmed: true
    },
    dryRun: false
  });
  if (receipt.status === "blocked_read_only") {
    throw new Error(receipt.blockedReason || "Read-only host blocks control-tower mutations");
  }
  if (receipt.status !== "executed" && receipt.status !== "no_op") {
    const errText = receipt.stderr || receipt.blockedReason || `Action ${ref} returned status ${receipt.status}`;
    throw new Error(errText);
  }
  const stdoutJson = asRecord(receipt.stdoutJson);
  if (!stdoutJson) return {};
  const execution = asRecord(stdoutJson.app_action_execution);
  const inner = execution ? asRecord(execution.result) ?? stdoutJson : stdoutJson;
  const envelope = asRecord(inner.opl_app_contribution);
  if (envelope) {
    const response = asRecord(envelope.response);
    if (response?.ok === false) {
      throw new Error(String(asRecord(response.error)?.message || `Action ${ref} failed`));
    }
    const ownerRes = asRecord(response?.result);
    if (ownerRes?.ok === false) {
      throw new Error(String(asRecord(ownerRes.error)?.message || `Action ${ref} rejected`));
    }
    return ownerRes ?? {};
  }
  if (inner.ok === false) {
    throw new Error(String(asRecord(inner.error)?.message || `Action ${ref} failed`));
  }
  return inner;
}
