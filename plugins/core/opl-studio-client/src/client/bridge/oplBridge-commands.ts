import type {
  OplActionRequest,
  OplDomainDetailViewReadRequest
} from "@gaofeng21cn/opl-host-contracts";

export const OPL_COMMANDS = {
  fastState: "opl app state --profile fast --json",
  fullState: "opl app state --profile full --json",
  fullDrilldown: "opld app.operatorDrilldown.get",
  domainDetailViewPrefix: "opl app view read",
  actionPrefix: "opl app action execute --action"
} as const;

export function buildDomainDetailViewCommandArgs(request: OplDomainDetailViewReadRequest): string[] {
  const args = ["opl", "app", "view", "read", "--item-id", request.itemId, "--view-id", request.viewId];
  if (request.ifRevision !== undefined) args.push("--if-revision", String(request.ifRevision));
  args.push("--json");
  return args;
}

export function buildDomainDetailViewCommand(request: OplDomainDetailViewReadRequest): string {
  return buildDomainDetailViewCommandArgs(request).join(" ");
}

export const CODEX_APP_SERVER = {
  transport: "codex app-server --stdio",
  initialize: "initialize",
  threadStart: "thread/start",
  threadList: "thread/list",
  threadRead: "thread/read",
  turnStart: "turn/start",
  resume: "thread/resume",
  threadFork: "thread/fork",
  threadArchive: "thread/archive",
  threadUnarchive: "thread/unarchive",
  turnSteer: "turn/steer",
  turnInterrupt: "turn/interrupt",
  turnStarted: "turn/started",
  streamEvent: "item/agentMessage/delta",
  itemCompleted: "item/completed",
  turnCompleted: "turn/completed",
  defaultPermissions: ":danger-full-access",
  approvalPolicy: "never",
  permissionProfiles: {
    ":danger-full-access": { approvalPolicy: "never", sandbox: "danger-full-access" },
    ":workspace": { approvalPolicy: "on-request", sandbox: "workspace-write" },
    ":read-only": { approvalPolicy: "on-request", sandbox: "read-only" }
  },
  requestTimeoutSeconds: 45
} as const;



export function buildActionCommandArgs(request: OplActionRequest): string[] {
  const args = ["opl", "app", "action", "execute", "--action", request.actionId];
  if (request.payload) {
    args.push("--payload", JSON.stringify(request.payload));
  }
  if (request.dryRun !== false) {
    args.push("--dry-run");
  }
  args.push("--json");
  return args;
}

export function buildActionCommand(request: OplActionRequest): string {
  const payload = request.payload ? ` --payload '${JSON.stringify(request.payload)}'` : "";
  const dryRun = request.dryRun === false ? "" : " --dry-run";
  return `${OPL_COMMANDS.actionPrefix} ${request.actionId}${payload}${dryRun} --json`;
}
