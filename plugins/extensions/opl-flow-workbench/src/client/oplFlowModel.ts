import type {
  OplFlowDashboardData,
  OplFlowInboxEntry,
  OplFlowSessionEntry,
  OplFlowWorkspaceOccupant
} from "./oplFlowBridge";

export type OplFlowViewTab = "attention" | "objectives" | "sessions" | "events";
export type SessionScopeFilter = "running" | "all";
export type CarrierFilter = "all" | "codex" | "antigravity" | "dsh";

type InboxWithSessions = OplFlowDashboardData["inbox"] & {
  active_sessions?: OplFlowSessionEntry[];
  active_workspace_occupants?: OplFlowWorkspaceOccupant[];
};

export function carrierLabel(carrier: string | null | undefined, zh: boolean): string {
  if (carrier === "codex") return "Codex";
  if (carrier === "antigravity") return "AntiGravity";
  if (carrier === "dsh") return "OPL DSH";
  return zh ? "自动路由" : "Auto";
}

export function formatStatusLabel(status: string | null | undefined, zh: boolean): string {
  const s = (status || "").toLowerCase();
  if (s === "active" || s === "busy") return zh ? "运行中" : "Running";
  if (s === "idle") return zh ? "空闲" : "Idle";
  if (s === "error") return zh ? "异常" : "Error";
  if (s === "deferred") return zh ? "已冻结" : "Frozen";
  if (s === "in_progress") return zh ? "推进中" : "In progress";
  if (s === "open") return zh ? "待处理" : "Open";
  if (s === "closed") return zh ? "待归档" : "Closing";
  return status || "—";
}

export function formatBlockerText(blocker: string | null | undefined, zh: boolean): string {
  if (!blocker) return "";
  if (blocker === "user_directed_freeze") {
    return zh ? "用户已冻结，等待手动重启" : "Frozen by user until manually resumed";
  }
  return blocker;
}

export function formatRelativeTime(iso: string | null | undefined, zh: boolean): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return zh ? "刚刚" : "Just now";
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return zh ? `${mins} 分钟前` : `${mins}m ago`;
  }
  if (diffSec < 86400) {
    const hrs = Math.floor(diffSec / 3600);
    return zh ? `${hrs} 小时前` : `${hrs}h ago`;
  }
  const days = Math.floor(diffSec / 86400);
  return zh ? `${days} 天前` : `${days}d ago`;
}

export function chooseSmartTab(data: OplFlowDashboardData): OplFlowViewTab {
  const c = data.counts;
  if ((c.needs_action ?? 0) + (c.safe_to_archive ?? 0) > 0) return "attention";
  if ((c.active_objectives ?? 0) + (c.blocked ?? 0) > 0) return "objectives";
  if ((c.pending_events ?? 0) > 0) return "events";
  if ((c.active_sessions ?? 0) > 0) return "sessions";
  return (c.backlog ?? 0) > 0 ? "objectives" : "attention";
}

export function isSubagentSession(sess: OplFlowSessionEntry): boolean {
  return Boolean(sess.is_subagent) || sess.surface === "subagent";
}

export function extractDashboardSessions(data: OplFlowDashboardData | undefined): OplFlowSessionEntry[] {
  if (!data) return [];
  const inbox = data.inbox as InboxWithSessions | undefined;
  if (inbox?.active_sessions?.length) return inbox.active_sessions;
  return data.active_sessions?.sessions ?? [];
}

export function extractDashboardOccupants(data: OplFlowDashboardData | undefined): OplFlowWorkspaceOccupant[] {
  if (!data) return [];
  const inbox = data.inbox as InboxWithSessions | undefined;
  if (inbox?.active_workspace_occupants?.length) return inbox.active_workspace_occupants;
  return data.active_sessions?.active_workspace_occupants ?? [];
}

export function filterSessions(
  sessions: OplFlowSessionEntry[],
  opts: {
    scope: SessionScopeFilter;
    carrier: CarrierFilter;
    includeSubagents: boolean;
    query: string;
  }
): OplFlowSessionEntry[] {
  const q = opts.query.trim().toLowerCase();
  return sessions.filter((sess) => {
    if (!opts.includeSubagents && isSubagentSession(sess)) return false;
    if (opts.carrier !== "all" && sess.carrier !== opts.carrier) return false;
    if (opts.scope === "running" && sess.status !== "active" && sess.status !== "busy") return false;
    if (!q) return true;
    const haystack = [
      sess.title,
      sess.model_label,
      sess.workspace_label,
      sess.carrier,
      sess.session_ref,
      sess.bound_bead_id
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function summarizeWorkspaces(occupants: OplFlowWorkspaceOccupant[]): {
  uniqueCount: number;
  collisions: Array<{ workspace: string; count: number; carriers: string[] }>;
} {
  const byWs = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  for (const occ of occupants) {
    const label = (occ.workspace_label || "").trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    if (!byWs.has(label)) byWs.set(label, new Set());
    byWs.get(label)!.add(occ.carrier);
  }
  const collisions = Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .map(([workspace, count]) => ({
      workspace,
      count,
      carriers: Array.from(byWs.get(workspace) ?? [])
    }));
  return { uniqueCount: counts.size, collisions };
}

export function formatObjectiveStatus(entry: OplFlowInboxEntry, zh: boolean): string {
  return formatStatusLabel(entry.status || entry.category, zh);
}
