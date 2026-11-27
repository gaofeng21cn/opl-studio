import { restoreAction, runOfficialProfileAction, withOfficialProfileAction } from "./official-profile-action.mjs";
import { actionOwnerReceipt, readContributionEnvelope } from "./owner-receipts.mjs";
import { EventEmitter } from "node:events"; import { OpldClient } from "./opld-client.mjs";
const errReq = (msg, code = "invalid_request") => Object.assign(new Error(msg), { code });
const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v), nonEmptyStr = (v) => typeof v === "string" && v.trim().length > 0;
const onlyKeys = (o, allowed) => isObj(o) && Object.keys(o).every((k) => allowed.includes(k));
const readback = (cmd, args = []) => ({ command: cmd, commandArgs: args, exitCode: 0, stdout: "", stderr: "", timedOut: false });
const SAFE_CODE = /^[a-z][a-z0-9_]{0,79}$/, SECRET_KEYS = new Set("password token accesstoken refreshtoken apikey key keyvalue keyplaintext plaintextkey secret credentialhandle".split(" "));
const hasSecret = (v, seen = new Set()) => {
  if (!v || typeof v !== "object" || seen.has(v)) return false;
  seen.add(v);
  return Array.isArray(v) ? v.some((x) => hasSecret(x, seen)) : Object.entries(v).some(([k, val]) => SECRET_KEYS.has(k.replace(/[^a-z0-9]/gi, "").toLowerCase()) || hasSecret(val, seen));
};
const hasSecretText = (v, secrets, echoes, seen = new Set()) => {
  if (typeof v === "string") {
    let s = v;
    for (const e of echoes) if (e) s = s.split(e).join("");
    return secrets.some((sec) => sec && s.includes(sec));
  }
  if (!v || typeof v !== "object" || seen.has(v)) return false;
  seen.add(v);
  return Array.isArray(v) ? v.some((x) => hasSecretText(x, secrets, echoes, seen)) : Object.values(v).some((x) => hasSecretText(x, secrets, echoes, seen));
};
const leakedSecret = (res, secrets, echoes = []) => hasSecret(res) || hasSecretText(res, secrets, echoes);
const GW_CODES = new Set("invalid_credentials account_disabled mfa_or_challenge_required session_not_persistable group_selection_required auth_expired network_unreachable rate_limited managed_key_missing managed_key_conflict managed_key_identity_drift disconnect_pending account_switch_requires_disconnect gateway_busy gateway_codex_binding_failed gateway_configuration_invalid gateway_request_rejected gateway_response_invalid gateway_store_invalid credentials_stdin_too_large codex_configuration_failed invalid_request internal_contract_violation gateway_account_failed".split(" "));
const GW_ALIASES = new Map([["UNAUTHORIZED", "auth_expired"], ["reauth_required", "auth_expired"], ["INVALID_INPUT", "invalid_request"], ["credentials_stdin_invalid", "invalid_request"], ["TRUSTED_HOST_REQUIRED", "internal_contract_violation"], ["gateway_account_dry_run_unsupported", "invalid_request"], ["gateway_account_payload_forbidden", "invalid_request"], ["network_timeout", "network_unreachable"], ["gateway_unavailable", "network_unreachable"], ["daemon_unavailable", "network_unreachable"], ["daemon_not_found", "network_unreachable"], ["connection_closed", "network_unreachable"], ["rpc_timeout", "network_unreachable"], ["ECONNREFUSED", "network_unreachable"], ["ECONNRESET", "network_unreachable"], ["EPIPE", "network_unreachable"], ["ENOENT", "network_unreachable"], ["DAEMON_START_FAILED", "network_unreachable"], ["DAEMON_START_TIMEOUT", "network_unreachable"], ["gateway_account_busy", "gateway_busy"], ["gateway_conflict", "gateway_request_rejected"], ["gateway_request_failed", "gateway_request_rejected"], ["gateway_response_too_large", "gateway_response_invalid"], ["gateway_profile_invalid", "gateway_response_invalid"], ["gateway_control_url_invalid", "gateway_configuration_invalid"], ["gateway_group_required", "group_selection_required"], ["gateway_store_json_invalid", "gateway_store_invalid"], ["gateway_store_owner_invalid", "gateway_store_invalid"], ["gateway_store_permissions_invalid", "gateway_store_invalid"], ["gateway_store_symlink_forbidden", "gateway_store_invalid"], ["gateway_store_type_invalid", "gateway_store_invalid"]]);
const resolveGwCode = (c) => (typeof c !== "string" ? undefined : GW_CODES.has(c) ? c : (GW_ALIASES.get(c) ?? GW_ALIASES.get(c.toUpperCase()) ?? GW_ALIASES.get(c.toLowerCase())));
const mapGwErr = (err, fallback) => [err?.data?.reason_code, err?.data?.code, err?.code].map(resolveGwCode).find(Boolean) ?? fallback;
export function createOplPassthrough(options = {}) {
  const ownClient = !options.client, client = options.client ?? new OpldClient(options), env = options.env ?? process.env;
  const readOnly = () => env.OPL_STUDIO_READ_ONLY === "1" || env.OPL_NATIVE_WORKBENCH_READ_ONLY === "1";
  return {
    client, on: (ev, fn) => client.on(ev, fn), off: (ev, fn) => client.off(ev, fn), close: () => (ownClient ? client.close() : Promise.resolve()),
    async readState(profile = "fast") {
      const p = profile === "full" ? "full" : "fast", res = await client.call("app.state.get", { profile: p }), patch = options.getWeixinHost?.()?.appStatePatch?.();
      const appState = withOfficialProfileAction(res?.app_state, env.OPL_OFFICIAL_PROFILE_RESOURCES);
      if (!patch) return { ...res, ...(appState ? { app_state: appState } : {}), profile: res?.profile ?? p, readback: readback("opld app.state.get", [p]) };
      const baseApp = appState ?? {}, baseUi = baseApp.ui_contributions, entries = (baseUi?.entries ?? []).filter((e) => e?.package_id !== "opl-channel-weixin" && e?.view?.view_type !== "channel_access");
      const ui = patch.ui_contributions ? { ...baseUi, ...patch.ui_contributions, entries: [...entries, ...(patch.ui_contributions.entries ?? [])], contribution_count: entries.length + (patch.ui_contributions.entries?.length ?? 0) } : baseUi;
      return { ...res, profile: res?.profile ?? p, app_state: { ...baseApp, ...patch, ...(ui ? { ui_contributions: ui } : {}) }, readback: readback("opld app.state.get", [p]) };
    },
    async readInitialize() { return { ...(await client.call("app.initialize.get", {})), readback: readback("opld app.initialize.get") }; },
    async readFullDrilldown() {
      const [tasks, state] = await Promise.all([client.call("runway.task.list", { detail: "full" }), client.call("app.state.get", { profile: "full" })]);
      const firstTaskId = tasks?.tasks?.[0]?.task_id, timeline = firstTaskId ? await client.call("ledger.timeline", { task_id: firstTaskId }) : { entries: [], timeline: [] };
      return { detail: "full", drilldown: { ...tasks, ...timeline, state }, readback: readback("opld runway.task.list") };
    },
    async readDomainDetailView({ itemId, viewId, ifRevision } = {}) {
      if (!nonEmptyStr(itemId) || !nonEmptyStr(viewId)) throw errReq("itemId and viewId are required");
      if (ifRevision !== undefined && (!Number.isInteger(ifRevision) || ifRevision < 0)) throw errReq("ifRevision must be a non-negative integer");
      const res = await client.call("app.domainDetail.get", { item_id: itemId, view_id: viewId, ...(ifRevision !== undefined ? { if_revision: ifRevision } : {}) });
      const notMod = ifRevision !== undefined && res?.revision === ifRevision, avail = res?.data?.status === "unavailable" || !res?.view ? "missing" : "available";
      const stdoutJson = res?.schema_version === "opl_domain_detail_view.v1" || res?.opl_domain_detail_view ? res : {
        schema_version: "opl_domain_detail_view.v1", surface_kind: "opl_domain_detail_view", item_id: res?.item_id ?? itemId, view_id: res?.view_id ?? viewId,
        view_kind: res?.view_kind ?? res?.view?.view_type ?? res?.view?.view_kind ?? (res?.view ? "mcp_app" : "unknown"),
        availability: avail, revision: Number.isInteger(res?.revision) && res.revision >= 0 ? res.revision : 0, not_modified: notMod,
        payload: notMod || avail !== "available" ? null : (res?.payload ?? { view: res.view, package: res.package ?? null, data: res.data ?? null }),
      };
      return { ...readback("opld app.domainDetail.get", [itemId, viewId]), stdoutJson };
    },
    async readContribution({ packageId, ref, input, ifRevision, consumerBindToken, sessionId } = {}) {
      if (!nonEmptyStr(ref)) throw errReq("ref is required");
      if (packageId !== undefined && !nonEmptyStr(packageId)) throw errReq("packageId must be a non-empty string");
      const wh = options.getWeixinHost?.();
      if (wh && packageId === "opl-channel-weixin") return { ...readback("opl-channel-weixin readChannelAccess", [ref]), stdoutJson: await wh.readChannelAccess({ package_id: packageId, ref, input: input ?? {} }) };
      const res = await client.call("app.contribution.read", { ...(packageId ? { package_id: packageId } : {}), ref, ...(input !== undefined ? { input } : {}), ...(ifRevision !== undefined ? { if_revision: ifRevision } : {}), ...(consumerBindToken ? { consumer_bind_token: consumerBindToken } : {}), ...(sessionId ? { session_id: sessionId } : {}) });
      const stdoutJson = readContributionEnvelope(res, packageId, ref);
      const failed = !stdoutJson.opl_app_contribution.response.ok;
      return { ...readback("opld app.contribution.read", [ref]), stdoutJson,
        ...(failed ? { exitCode: 1, stderr: String(stdoutJson.opl_app_contribution.response.error?.message ?? "Owner contribution read failed") } : {}) };
    },
    async executeAction({ actionId, payload = {}, dryRun = true, mode, packageId } = {}) {
      if (!nonEmptyStr(actionId) || !isObj(payload)) throw errReq("actionId and an object payload are required");
      if (packageId !== undefined && (!nonEmptyStr(packageId) || (payload.package_id !== undefined && payload.package_id !== packageId))) throw errReq("Conflicting or invalid package identity");
      const requestedMode = mode ?? (payload.rollbackRef ? "rollback" : dryRun === false ? "execute" : "preview");
      if (!["preview", "execute", "rollback"].includes(requestedMode)) throw errReq("Unknown action mode");
      const isDry = requestedMode === "preview";
      const request = { actionId, payload, requestedMode, dryRun: isDry };
      const command = readback("opld app.action.execute", [actionId]);
      if (!isDry && readOnly()) return actionOwnerReceipt(command, { status: "blocked_read_only", blocked_reason: "read_only_host" }, request);
      if (requestedMode === "rollback") return actionOwnerReceipt(command, { status: "unsupported", blocked_reason: "opld_rollback_unavailable" }, request);
      if (actionId === restoreAction.action_id) {
        const result = await runOfficialProfileAction(env, request);
        return actionOwnerReceipt(readback(restoreAction.route), result, request);
      }
      const pkg = packageId ?? payload.package_id;
      const wh = options.getWeixinHost?.();
      if (wh && pkg === "opl-channel-weixin" && actionId === "package_contribution_execute") {
        const commandReadback = readback("opl-channel-weixin executeChannelAccessAction", [payload.ref ?? ""]);
        const entry = wh.appStatePatch()?.ui_contributions?.entries?.filter(view => view.package_id === pkg)
          .flatMap(view => view.commands ?? []).find(entry => entry.action_ref === payload.ref);
        if (!entry) throw errReq("Unknown Weixin channel action");
        let value;
        if (isDry) value = { status: "preview", confirmation_required: entry.confirmation_required };
        else if (entry.confirmation_required && payload.confirmed !== true) value = { status: "confirmation_required" };
        else value = await wh.executeChannelAccessAction({ package_id: pkg, ref: payload.ref, input: payload.input ?? {}, confirmed: payload.confirmed === true });
        return actionOwnerReceipt(commandReadback, value, request);
      }
      try {
        const value = await client.call("app.action.execute", { action_id: actionId, payload, dry_run: isDry, ...(mode ? { mode } : {}), ...(packageId ? { package_id: packageId } : {}) });
        return actionOwnerReceipt(command, value, request);
      } catch (error) {
        if (error?.code !== "CONFIRMATION_REQUIRED") throw error;
        return actionOwnerReceipt(command, { status: "confirmation_required", blocked_reason: error.code }, request);
      }
    },
    async runManagedUpdate(operation = "status") {
      if (!["check", "plan", "apply", "status", "activate"].includes(operation)) throw errReq(`Unsupported managed update operation: ${operation}`);
      if (["apply", "activate"].includes(operation) && readOnly()) throw errReq("Managed update is blocked in read-only mode", "blocked_read_only");
      if (operation === "check" || operation === "plan") return { managed_update: { components: [], packages: (await client.call("pack.list", {}))?.packages ?? [], execution: { status: "completed" } } };
      if (operation === "apply") return { managed_update: { components: [], execution: { status: "completed" }, ...(await client.call("pack.updateAll", { updates: [] })) } };
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
    this.codex = codex; this.hasCustomOpl = Boolean(opl);
    this.client = client ?? new OpldClient({ stateDir, env, apiVersion, daemonBin, autoStart, clientKind });
    this.client.on("event", (ev) => this.emit("event", ev));
    this.nativeWeixinHost = null; this.closePromise = null; this.startError = null; this.nativeWeixin = false;
    this.opl = opl ?? createOplPassthrough({ client: this.client, env, cwd: workspaceRoot, candidateActionAllowlist, getWeixinHost: () => this.nativeWeixinHost });
    const defaultApproval = async (req = {}) => {
      const isStr = typeof req === "string", keys = isObj(req) ? Object.keys(req) : null, requestId = isStr ? req : req?.requestId ?? req?.request_id;
      if ((!isStr && (!keys || keys.length !== 1 || (keys[0] !== "requestId" && keys[0] !== "request_id"))) || typeof requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(requestId)) throw errReq("requestId is invalid");
      try {
        const res = await this.client.call("connect.approveRequest", { request_id: requestId });
        return hasSecret(res) ? { ok: false, errorCode: "internal_contract_violation" } : { ok: true, stateRefreshRequired: true };
      } catch (err) {
        if (err?.rpcCode === -32003 || err?.code === "TRUSTED_HOST_REQUIRED") throw err;
        const c = [err?.data?.reason_code, err?.data?.code, err?.code].find((x) => typeof x === "string" && SAFE_CODE.test(x));
        return { ok: false, errorCode: c ?? "connection_authorization_approval_failed" };
      }
    };
    defaultApproval.approve = (requestId) => defaultApproval({ requestId });
    if (typeof connectionAccessApproval === "function") {
      if (typeof connectionAccessApproval.approve !== "function") connectionAccessApproval.approve = (requestId) => connectionAccessApproval({ requestId });
      this.connectionAccessApproval = connectionAccessApproval;
    } else this.connectionAccessApproval = defaultApproval;
    this.gatewayAccountLogin = gatewayAccountLogin ?? (async (req) => {
      if (!onlyKeys(req, ["email", "password"])) return { ok: false, errorCode: "invalid_request", stateRefreshRequired: false };
      const email = typeof req.email === "string" ? req.email.trim() : "", password = typeof req.password === "string" ? req.password : "";
      if (!email || !nonEmptyStr(password) || Buffer.byteLength(email + password) > 65_536) return { ok: false, errorCode: "invalid_request", stateRefreshRequired: false };
      try {
        const result = await this.client.call("connect.gateway.login", { email, password });
        const gateway = result?.gateway_account;
        if (leakedSecret(result, [password], [email]) || gateway?.surface_kind !== "opl_gateway_account_read_model.v1"
          || gateway.connection_mode !== "account" || gateway.account?.status !== "active"
          || !["connected", "setup_required", "attention_needed"].includes(gateway.status)) {
          return { ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false };
        }
        return { ok: true, stateRefreshRequired: true };
      } catch (err) {
        return { ok: false, errorCode: mapGwErr(err, "gateway_account_failed"), stateRefreshRequired: false };
      }
    });
    this.codexApiKeyConfiguration = codexApiKeyConfiguration ?? (async (req) => {
      if (!onlyKeys(req, ["apiKey"])) return { ok: false, errorCode: "invalid_request", stateRefreshRequired: false };
      const apiKey = typeof req.apiKey === "string" ? req.apiKey.trim() : "";
      if (!apiKey || Buffer.byteLength(apiKey, "utf8") > 65_536) return { ok: false, errorCode: "invalid_request", stateRefreshRequired: false };
      try {
        const result = await this.client.call("connect.configureCodexApiKey", { api_key: apiKey });
        if (leakedSecret(result, [apiKey])) return { ok: false, errorCode: "internal_contract_violation", stateRefreshRequired: false };
        if (result?.ok !== true) return { ok: false, errorCode: "codex_configuration_failed", stateRefreshRequired: false };
        return { ok: true, stateRefreshRequired: true };
      } catch (error) {
        return { ok: false, errorCode: mapGwErr(error, "codex_configuration_failed"), stateRefreshRequired: false };
      }
    });
  }
  async start(studioWeixin) {
    this.startError = null; this.nativeWeixin = studioWeixin !== undefined;
    if (!this.hasCustomOpl) {
      try { await this.client.connect(); }
      catch (err) {
        if (err?.code !== "daemon_not_found" || this.client.daemonBin || this.client.env?.OPL_DAEMON_BIN) throw err;
        this.startError = err.code;
      }
    }
    if (!this.closePromise && studioWeixin && typeof studioWeixin.connect === "function" && this.codex?.channelCallbackAdapter && !this.nativeWeixinHost) {
      try {
        const host = await studioWeixin.connect(this.codex.channelCallbackAdapter);
        if (this.closePromise) {
          try { await host?.dispose?.(); } catch {}
        } else {
          this.nativeWeixinHost = host;
        }
      } catch {}
    }
    return this.capabilities();
  }
  hasNativeWeixinChannel() { return this.nativeWeixin; }
  capabilities() {
    return {
      available: !this.startError, transport: "opld_rpc", authorityBoundary: "app_bridge_no_domain_authority", connected: this.client.connected, apiVersion: this.client.serverApiVersion,
      ...(this.startError ? { reasonCode: this.startError } : {}),
      channelCallback: { schema: this.codex?.capabilities?.()?.channelCallbackSchema ?? null, status: "dormant", registered: false },
    };
  }
  close() {
    return (this.closePromise ??= Promise.allSettled([this.nativeWeixinHost?.dispose?.(), this.client.close()]).then(() => { this.nativeWeixinHost = null; }));
  }
}
