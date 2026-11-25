import { EventEmitter } from "node:events";
import { OpldClient } from "./opld-client.mjs";

const errReq = (msg, code = "invalid_request") => Object.assign(new Error(msg), { code });
const readback = (cmd, args = []) => ({ command: cmd, commandArgs: args, exitCode: 0, stdout: "", stderr: "", timedOut: false });

export function createOplPassthrough(options = {}) {
  const ownClient = !options.client;
  const client = options.client ?? new OpldClient(options);
  const env = options.env ?? process.env;
  const readOnly = () => env.OPL_STUDIO_READ_ONLY === "1" || env.OPL_NATIVE_WORKBENCH_READ_ONLY === "1";

  return {
    client,
    on: (ev, fn) => client.on(ev, fn),
    off: (ev, fn) => client.off(ev, fn),
    close: () => (ownClient ? client.close() : Promise.resolve()),
    async readState(profile = "fast") {
      const p = profile === "full" ? "full" : "fast";
      const res = await client.call("app.state.get", { profile: p });
      return { ...res, profile: res?.profile ?? p, readback: readback("opld app.state.get", [p]) };
    },
    async readInitialize() { return { ...(await client.call("app.initialize.get", {})), readback: readback("opld app.initialize.get") }; },
    async readFullDrilldown() {
      const [tasks, state] = await Promise.all([client.call("runway.task.list", { detail: "full" }), client.call("app.state.get", { profile: "full" })]);
      const firstTaskId = tasks?.tasks?.[0]?.task_id;
      const timeline = firstTaskId ? await client.call("ledger.timeline", { task_id: firstTaskId }) : { entries: [], timeline: [] };
      return { detail: "full", drilldown: { ...tasks, ...timeline, state }, readback: readback("opld runway.task.list") };
    },
    async readDomainDetailView({ itemId, viewId, ifRevision } = {}) {
      if (!itemId || !viewId) throw errReq("itemId and viewId are required");
      if (ifRevision !== undefined && (!Number.isInteger(ifRevision) || ifRevision < 0)) throw errReq("ifRevision must be a non-negative integer");
      const res = await client.call("app.domainDetail.get", { item_id: itemId, view_id: viewId, ...(ifRevision !== undefined ? { if_revision: ifRevision } : {}) });
      const notMod = ifRevision !== undefined && res?.revision === ifRevision;
      const avail = res?.data?.status === "unavailable" || !res?.view ? "missing" : "available";
      const stdoutJson = res?.schema_version === "opl_domain_detail_view.v1" || res?.opl_domain_detail_view ? res : {
        schema_version: "opl_domain_detail_view.v1", surface_kind: "opl_domain_detail_view",
        item_id: res?.item_id ?? itemId, view_id: res?.view_id ?? viewId,
        view_kind: res?.view_kind ?? res?.view?.view_type ?? res?.view?.view_kind ?? (res?.view ? "mcp_app" : "unknown"),
        availability: avail, revision: Number.isInteger(res?.revision) && res.revision >= 0 ? res.revision : 0, not_modified: notMod,
        payload: notMod || avail !== "available" ? null : (res?.payload ?? { view: res.view, package: res.package ?? null, data: res.data ?? null }),
      };
      return { ...readback("opld app.domainDetail.get", [itemId, viewId]), stdoutJson };
    },
    async readContribution({ packageId, ref, input, ifRevision, consumerBindToken, sessionId } = {}) {
      if (!ref || typeof ref !== "string") throw errReq("ref is required");
      const res = await client.call("app.contribution.read", {
        ...(packageId ? { package_id: packageId } : {}), ref,
        ...(input !== undefined ? { input } : {}), ...(ifRevision !== undefined ? { if_revision: ifRevision } : {}),
        ...(consumerBindToken ? { consumer_bind_token: consumerBindToken } : {}), ...(sessionId ? { session_id: sessionId } : {}),
      });
      const stdoutJson = res?.opl_app_contribution ? res : { opl_app_contribution: {
        surface_kind: "opl_app_package_contribution.v1",
        ...(packageId !== undefined ? { package_id: packageId } : (res?.package_id ? { package_id: res.package_id } : {})),
        ref, operation: "read",
        response: { schema_version: "opl-package-app-contribution-response.v1", ok: res?.ok !== false, ref, operation: "read", result: res?.result ?? res?.data ?? res },
      } };
      return { ...readback("opld app.contribution.read", [ref]), stdoutJson };
    },
    async executeAction({ actionId, payload = {}, dryRun = true, mode, packageId } = {}) {
      if (!actionId || typeof actionId !== "string") throw errReq("actionId is required");
      const isDry = mode === "preview" || (dryRun !== false && mode !== "execute");
      if (!isDry && readOnly()) return {
        actionId, dryRun: false, confirmationRequired: false, canExecute: false, receiptKind: "blocked_read_only",
        authorityBoundary: "app_bridge_no_domain_authority", requestedMode: mode ?? "execute", status: "blocked_read_only",
        ...readback("opld app.action.execute", [actionId]), exitCode: 1, blockedReason: "read_only_host", payload,
      };
      const res = await client.call("app.action.execute", { action_id: actionId, payload, dry_run: isDry, ...(mode ? { mode } : {}), ...(packageId ? { package_id: packageId } : {}) });
      const rawStatus = res?.status === "preview" ? "preview_ready" : res?.status;
      return {
        actionId, dryRun: res?.dryRun ?? isDry, confirmationRequired: false, canExecute: true,
        receiptKind: isDry ? "preview" : "execute", authorityBoundary: "app_bridge_no_domain_authority",
        requestedMode: mode ?? (isDry ? "preview" : "execute"), status: rawStatus ?? (isDry ? "preview_ready" : "executed"),
        ...readback("opld app.action.execute", [actionId]), payload, stdoutJson: res,
      };
    },
    async runManagedUpdate(operation = "status") {
      if (!["check", "plan", "apply", "status", "activate"].includes(operation)) throw errReq(`Unsupported managed update operation: ${operation}`);
      if (["apply", "activate"].includes(operation) && readOnly()) throw errReq("Managed update is blocked in read-only mode", "blocked_read_only");
      if (operation === "check" || operation === "plan") {
        const res = await client.call("pack.list", {});
        return { managed_update: { components: [], packages: res?.packages ?? [], execution: { status: "completed" } } };
      }
      if (operation === "apply") {
        const res = await client.call("pack.updateAll", { updates: [] });
        return { managed_update: { components: [], execution: { status: "completed" }, ...res } };
      }
      return { managed_update: { components: [], execution: { status: "completed" } }, runtime_activation: { status: "active" }, health: await client.call("daemon.health", {}) };
    },
    async runStartupMaintenance() {
      if (readOnly()) throw errReq("Startup maintenance is blocked in read-only mode", "blocked_read_only");
      return { system_action: { status: "completed", details: await client.call("daemon.doctor", { includeFirstRun: false }) } };
    },
  };
}

export class OplFrameworkBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    const { workspaceRoot, opl, candidateActionAllowlist = [], gatewayAccountLogin, codexApiKeyConfiguration, connectionAccessApproval, codex, env = process.env, stateDir, apiVersion, daemonBin, autoStart, client, clientKind } = options;
    this.codex = codex;
    this.hasCustomOpl = Boolean(opl);
    this.client = client ?? new OpldClient({ stateDir, env, apiVersion, daemonBin, autoStart, clientKind });
    this.client.on("event", (ev) => this.emit("event", ev));
    this.opl = opl ?? createOplPassthrough({ client: this.client, env, cwd: workspaceRoot, candidateActionAllowlist });

    const defaultApproval = async (req = {}) => {
      const requestId = typeof req === "string" ? req : req?.requestId ?? req?.request_id;
      if (!requestId || typeof requestId !== "string" || !requestId.trim()) throw errReq("requestId is required");
      return this.client.call("connect.approveRequest", { request_id: requestId.trim() });
    };
    defaultApproval.approve = (requestId) => defaultApproval({ requestId });
    if (typeof connectionAccessApproval === "function") {
      if (typeof connectionAccessApproval.approve !== "function") connectionAccessApproval.approve = (requestId) => connectionAccessApproval({ requestId });
      this.connectionAccessApproval = connectionAccessApproval;
    } else this.connectionAccessApproval = defaultApproval;

    const nonEmptyStr = (v) => typeof v === "string" && v.trim().length > 0;
    const registerConnect = async (payload, fallback) => {
      try { await this.client.call("connect.register", payload); return { ok: true, stateRefreshRequired: true }; }
      catch (err) { return { ok: false, errorCode: err.code ?? fallback, stateRefreshRequired: false }; }
    };
    this.gatewayAccountLogin = gatewayAccountLogin ?? (async (req) => {
      const { email, password } = req && typeof req === "object" ? req : {};
      if (!nonEmptyStr(email) || !nonEmptyStr(password)) return { ok: false, errorCode: "invalid_request", stateRefreshRequired: false };
      return registerConnect({ provider_type: "opl_gateway", display_name: email, account_label: email, secret: password }, "gateway_login_failed");
    });
    this.codexApiKeyConfiguration = codexApiKeyConfiguration ?? (async (req) => {
      const { apiKey } = req && typeof req === "object" ? req : {};
      if (!nonEmptyStr(apiKey)) return { ok: false, errorCode: "invalid_request", stateRefreshRequired: false };
      return registerConnect({ provider_type: "openai_codex", display_name: "Codex API Key", secret: apiKey }, "codex_api_key_failed");
    });
    this.closePromise = null;
    this.startError = null;
  }

  async start() {
    this.startError = null;
    if (!this.hasCustomOpl) {
      try { await this.client.connect(); }
      catch (err) {
        if (err?.code !== "daemon_not_found" || this.client.daemonBin || this.client.env?.OPL_DAEMON_BIN) throw err;
        this.startError = err.code;
      }
    }
    return this.capabilities();
  }

  capabilities() {
    return {
      available: !this.startError, transport: "opld_rpc", authorityBoundary: "app_bridge_no_domain_authority",
      connected: this.client.connected, apiVersion: this.client.serverApiVersion,
      ...(this.startError ? { reasonCode: this.startError } : {}),
      channelCallback: { schema: this.codex?.capabilities?.()?.channelCallbackSchema ?? null, status: "dormant", registered: false },
    };
  }

  close() { return (this.closePromise ??= this.client.close()); }
}
