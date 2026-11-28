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
  is_subagent?: boolean;
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
    running_sessions?: number;
    primary_sessions?: number;
    subagent_sessions?: number;
    unique_occupied_workspaces?: number;
    collision_workspaces?: number;
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
  const directoryVerdict = matchOplFlowPackageRecord(asRecord(agentPackages?.directory)?.entries);
  if (directoryVerdict === "enabled") return true;
  if (directoryVerdict === "disabled") return false;

  const statusPackages = asRecord(asRecord(agentPackages?.status_index)?.packages);
  const indexedRecord = asRecord(statusPackages?.["opl-flow"]);
  if (indexedRecord) {
    const verdict = evaluatePackageRecord(indexedRecord);
    if (verdict === "enabled") return true;
    if (verdict === "disabled") return false;
  }

  const explicitPackageLists = [
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

  return false;
}

function unwrapContributionBody(raw: unknown): {
  jsonBody: Record<string, unknown>;
  response: Record<string, unknown> | null;
} {
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
  return {
    jsonBody,
    response: envelope ? asRecord(envelope.response) : null
  };
}

export function extractContributionResult<T = unknown>(raw: unknown): T {
  const { jsonBody, response } = unwrapContributionBody(raw);
  if (response) {
    if (response.ok === false) {
      const err = asRecord(response.error);
      throw new Error(String(err?.message || "OPL Flow contribution returned error"));
    }
    if ("result" in response) {
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

export const OPL_FLOW_RESOURCE_URI = "ui://opl-flow/decision-dashboard.html";
export const OPL_FLOW_UI_RESOURCE_REF = "opl-flow.decision.v1#ui_resource";
export const OPL_FLOW_NAVIGATION_SCHEMA = "opl_flow_host_navigation_intent.v1";

export type OplFlowUiResource = {
  uri: string;
  mimeType: string;
  version?: string;
  text: string;
  _meta?: {
    ui?: {
      prefersBorder?: boolean;
      csp?: {
        connectDomains?: string[];
        resourceDomains?: string[];
        frameDomains?: string[];
      };
    };
  };
};

export type OplFlowUiResourceEnvelope = {
  ok?: boolean;
  state: "ready" | "unavailable" | "error";
  reason?: string;
  data?: OplFlowUiResource;
  error?: { code?: string; message?: string };
};

export type OplFlowHostNavigationIntent = {
  schema: typeof OPL_FLOW_NAVIGATION_SCHEMA;
  jump_mode: OplFlowJumpMode;
  execution_carrier?: string | null;
  bead_id?: string | null;
  session_ref?: string | null;
  session_id?: string | null;
  thread_id?: string | null;
  workspace_path?: string | null;
};

const OPL_FLOW_UPGRADE_GUIDANCE =
  "Installed OPL Flow package does not expose the canonical MCP App UI resource yet. Update OPL Flow in Software Center and retry.";

export async function readOplFlowUiResource(bridge = resolveStudioWindowBridge()): Promise<OplFlowUiResource> {
  if (!bridge?.readContribution) {
    throw new Error("OPL contribution bridge is unavailable in this host");
  }
  const raw = await bridge.readContribution({
    packageId: "opl-flow",
    ref: OPL_FLOW_UI_RESOURCE_REF,
    input: {}
  });
  const { jsonBody, response } = unwrapContributionBody(raw);
  if (response?.ok === false) {
    const err = asRecord(response.error);
    if (err?.code === "invalid_request") {
      throw new Error(OPL_FLOW_UPGRADE_GUIDANCE);
    }
    throw new Error(String(err?.message || OPL_FLOW_UPGRADE_GUIDANCE));
  }
  const envelope = ((response && "result" in response ? response.result : null) ?? jsonBody) as OplFlowUiResourceEnvelope;
  if (!envelope || typeof envelope !== "object") {
    throw new Error("Invalid OPL Flow MCP App resource payload");
  }
  if (envelope.ok === false || envelope.state !== "ready" || !envelope.data?.text) {
    if (envelope.error?.code === "invalid_request") {
      throw new Error(OPL_FLOW_UPGRADE_GUIDANCE);
    }
    throw new Error(
      envelope.error?.message
      || envelope.reason
      || OPL_FLOW_UPGRADE_GUIDANCE
    );
  }
  return envelope.data;
}

function allowedCspDomains(value: unknown): string {
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    if (typeof item !== "string") return [];
    try {
      const url = new URL(item);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
        return [];
      }
      if (typeof location !== "undefined" && url.origin === location.origin) return [];
      return [url.origin];
    } catch {
      return [];
    }
  }).join(" ");
}

export function sandboxOplFlowDocument(resource: Pick<OplFlowUiResource, "text" | "_meta">): string {
  const csp = resource._meta?.ui?.csp ?? {};
  const assets = allowedCspDomains(csp.resourceDomains);
  const connections = allowedCspDomains(csp.connectDomains);
  const frames = allowedCspDomains(csp.frameDomains);
  const policy = `default-src 'none'; script-src 'unsafe-inline' ${assets}; style-src 'unsafe-inline' ${assets}; img-src data: blob: ${assets}; media-src data: blob:; font-src data: ${assets}; connect-src ${connections || "'none'"}; frame-src blob: ${frames}; base-uri 'none'; form-action 'none'; object-src 'none'`;
  return `<meta http-equiv="Content-Security-Policy" content="${policy.replaceAll('"', "&quot;")}">${resource.text}`;
}

export function summarizeOplFlowDashboard(payload: OplFlowDashboardEnvelope): string {
  if (!payload || payload.state === "unavailable") {
    return payload?.reason || "OPL Flow 决策看板当前不可用。";
  }
  const data = payload.data;
  const counts = data?.counts;
  const svc = data?.service;
  const engineState = svc?.running
    ? "后台事件引擎运行中"
    : svc?.installed
      ? "后台事件引擎已安装未启动"
      : "后台事件引擎未启动";
  const instanceLabel = data?.instance_name ? `（${data.instance_name}）` : "";
  const runningSessions = counts?.running_sessions ?? counts?.active_sessions ?? 0;
  return `OPL Flow 决策看板${instanceLabel}：${engineState}；需你拍板 ${counts?.needs_action ?? 0}，待批归档 ${counts?.safe_to_archive ?? 0}，进行中 ${counts?.active_objectives ?? 0}，运行中对话 ${runningSessions}（总 ${counts?.active_sessions ?? 0}），外部阻塞 ${counts?.blocked ?? 0}，待排期 ${counts?.backlog ?? 0}，待处理事件 ${counts?.pending_events ?? 0}。`;
}

export function formatDashboardToolResult(
  payload: OplFlowDashboardEnvelope,
  focus: Record<string, unknown> = { host_carrier: "codex" }
) {
  return {
    content: [{ type: "text" as const, text: summarizeOplFlowDashboard(payload) }],
    structuredContent: {
      data: payload,
      focus: { ...focus, host_carrier: "codex" },
      presentation: { mode: "mcp-app", resource_uri: OPL_FLOW_RESOURCE_URI }
    }
  };
}

export async function dispatchOplFlowMcpToolCall(
  name: string,
  rawArgs: Record<string, unknown> | undefined,
  {
    bridge,
    shell
  }: {
    bridge?: StudioWindowBridge;
    shell: Pick<OplStudioShellService, "executeAction">;
  }
) {
  const args = asRecord(rawArgs) ?? {};
  try {
    if (name === "open_opl_flow_dashboard") {
      const payload = await readOplFlowDashboard(bridge);
      return formatDashboardToolResult(payload, args);
    }
    const actionRefMap: Record<
      string,
      "opl-flow.decision.v1#send" | "opl-flow.decision.v1#approve" | "opl-flow.decision.v1#tick" | "opl-flow.decision.v1#service"
    > = {
      opl_flow_send: "opl-flow.decision.v1#send",
      opl_flow_approve_archive: "opl-flow.decision.v1#approve",
      opl_flow_router_tick: "opl-flow.decision.v1#tick",
      opl_flow_router_service: "opl-flow.decision.v1#service"
    };
    const ref = actionRefMap[name];
    if (!ref) {
      return {
        isError: true,
        structuredContent: { error: { code: "unknown_tool", message: `Unsupported OPL Flow MCP tool: ${name}` } },
        content: [{ type: "text" as const, text: `Unsupported OPL Flow MCP tool: ${name}` }]
      };
    }
    const res = await executeOplFlowAction(shell, ref, args);
    const innerResult = asRecord(res.result);
    const text = String(innerResult?.message || res.message || "操作已完成。");
    return {
      content: [{ type: "text" as const, text }],
      structuredContent: res
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      structuredContent: { error: { code: "opl_flow_tool_failed", message } },
      content: [{ type: "text" as const, text: message }]
    };
  }
}

export function parseOplFlowHostNavigationIntent(raw: unknown): OplFlowHostNavigationIntent | null {
  const rec = asRecord(raw);
  if (!rec || rec.schema !== OPL_FLOW_NAVIGATION_SCHEMA) return null;
  const mode = rec.jump_mode;
  if (mode !== "native_switch" && mode !== "launch_new" && mode !== "external_focus_only") {
    return null;
  }
  const strOrNull = (val: unknown) => (typeof val === "string" && val.trim() ? val.trim() : null);
  return {
    schema: OPL_FLOW_NAVIGATION_SCHEMA,
    jump_mode: mode,
    execution_carrier: strOrNull(rec.execution_carrier),
    bead_id: strOrNull(rec.bead_id),
    session_ref: strOrNull(rec.session_ref),
    session_id: strOrNull(rec.session_id),
    thread_id: strOrNull(rec.thread_id),
    workspace_path: strOrNull(rec.workspace_path)
  };
}

export async function executeOplFlowHostNavigation(
  intent: OplFlowHostNavigationIntent,
  shell: Pick<OplStudioShellService, "openPrimaryView" | "openThread" | "startConversationInWorkspace">
): Promise<boolean> {
  if (intent.jump_mode === "native_switch") {
    const targetThread = intent.thread_id || intent.session_id;
    if (!targetThread) return false;
    await shell.openThread(targetThread);
    shell.openPrimaryView("chat");
    return true;
  }
  if (intent.jump_mode === "launch_new") {
    if (!intent.workspace_path) return false;
    await shell.startConversationInWorkspace(intent.workspace_path);
    shell.openPrimaryView("chat");
    return true;
  }
  return false;
}
