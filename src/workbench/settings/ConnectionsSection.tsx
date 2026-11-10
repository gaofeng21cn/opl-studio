import { Check, Link2, LoaderCircle, RefreshCw, Undo2, X } from "lucide-react";
import { useState } from "react";

import type { WorkbenchSettingsProjection } from "../workbenchModel-settings-contracts";
import type { ConnectionAuthorizationCapability } from "../workbenchModel-connection-contracts";
import type { WorkbenchSettings } from "../settingsModel";
import { actionPayloadComplete, type SettingsActionRequest } from "../settingsActions";
import { SettingRow, SettingsGroup, StatusValue } from "./primitives";

type ConnectionsSectionProps = {
  projection?: WorkbenchSettingsProjection;
  locale: WorkbenchSettings["locale"];
  actionBusyKey: string | null;
  onAction: (request: SettingsActionRequest) => void;
  onApproveConnectionAccess?: (requestId: string) => Promise<boolean>;
};

function ConnectionStatusValue({ status, locale }: { status?: string; locale: WorkbenchSettings["locale"] }) {
  const states: Record<string, { label: [string, string]; tone: "ready" | "attention" | "neutral" }> = {
    requested: { label: ["等待授权", "Awaiting approval"], tone: "neutral" },
    granted: { label: ["已授权", "Authorized"], tone: "ready" },
    denied: { label: ["已拒绝", "Denied"], tone: "neutral" },
    superseded: { label: ["请求已失效", "Request no longer valid"], tone: "neutral" },
    revoked: { label: ["已撤销", "Revoked"], tone: "attention" },
    stale: { label: ["需要重新授权", "Authorization needs renewal"], tone: "attention" },
    completed: { label: ["已完成", "Completed"], tone: "ready" },
    not_dispatched: { label: ["未执行", "Not executed"], tone: "neutral" },
    provider_reported: { label: ["服务已返回结果", "Provider result received"], tone: "neutral" },
    unknown_after_dispatch: { label: ["执行结果待核对", "Execution result needs verification"], tone: "attention" }
  };
  const state = states[status ?? ""];
  return state ? <span className="settings-status" data-tone={state.tone}><span aria-hidden="true" />{state.label[locale === "zh" ? 0 : 1]}</span> : <StatusValue status={status} locale={locale} />;
}

function capabilitySummary(capability: ConnectionAuthorizationCapability, locale: WorkbenchSettings["locale"]): string {
  const riskLabels: Record<string, [string, string]> = {
    read: ["读取", "Read"],
    local_write: ["本地修改", "Local changes"],
    external_write: ["对外操作", "External changes"]
  };
  const risk = capability.risk ? riskLabels[capability.risk]?.[locale === "zh" ? 0 : 1] : undefined;
  return `${capability.label}${risk ? ` (${risk})` : ""}`;
}

/** One shared connection and grant UI for Settings and application management. */
export function ConnectionsSection({ projection, locale, actionBusyKey, onAction, onApproveConnectionAccess }: ConnectionsSectionProps) {
  const zh = locale === "zh";
  const authorization = projection?.connectionAuthorization;
  const connectionAction = (actionId: string) => projection?.connectionActions.find((action) => action.actionId === actionId);
  const canRunConnectionAction = (actionId: string, payload: Record<string, unknown>) => {
    const action = connectionAction(actionId);
    return Boolean(action && actionPayloadComplete(payload, action.payloadFields));
  };
  const [mailboxRef, setMailboxRef] = useState("");
  const selectedMailbox = authorization?.availableRelayConnections.find(connection => connection.mailboxRef === mailboxRef);
  const relayAvailable = authorization?.availableRelayConnectionsStatus === "available";
  const submitConnectionAction = (actionId: string, key: string, label: string, payload: Record<string, unknown>) => {
    const action = connectionAction(actionId);
    if (!action || !actionPayloadComplete(payload, action.payloadFields)) return;
    onAction({ key, actionId, label, payload, confirmationRequired: action.confirmationRequired, dryRunSupported: action.dryRunSupported });
  };
  return <>
    {authorization ? <>
      {authorization.connections.length ? <SettingsGroup title={zh ? "已连接账户" : "Connected accounts"}>
        {authorization.connections.map((connection) => {
          const disabled = connection.disabled === true || connection.status === "disabled";
          const payload = { connection_id: connection.id };
          const togglePayload = { ...payload, disabled: !disabled };
          const isDefault = authorization.defaultConnectionId === connection.id;
          return <SettingRow key={connection.id} label={connection.displayName} detail={[connection.accountLabel, connection.providerType, isDefault ? (zh ? "默认连接" : "Default connection") : undefined].filter(Boolean).join(" · ")}>
            <span className="runtime-setting-control">
              <ConnectionStatusValue status={disabled ? "disabled" : connection.status} locale={locale} />
              {connection.capabilities.length ? <span>{connection.capabilities.map((capability) => capability.label).join(zh ? "、" : ", ")}</span> : null}
              {canRunConnectionAction("connection_test", payload) ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null} title={zh ? "检查本地连接配置与凭据引用" : "Check local connection configuration and credential references"} onClick={() => submitConnectionAction("connection_test", `connection-test:${connection.id}`, zh ? "检查连接配置" : "Check connection configuration", payload)}><RefreshCw aria-hidden="true" size={13} />{zh ? "检查配置" : "Check configuration"}</button> : null}
              {canRunConnectionAction("connection_update", togglePayload) ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null} title={zh ? "更改共享状态后，应用需要重新获得授权" : "Apps need fresh authorization after changing sharing status"} onClick={() => submitConnectionAction("connection_update", `connection-update:${connection.id}`, disabled ? (zh ? "启用共享连接" : "Enable shared connection") : (zh ? "停用共享连接" : "Disable shared connection"), togglePayload)}>{disabled ? (zh ? "启用共享" : "Enable sharing") : (zh ? "停用共享" : "Disable sharing")}</button> : null}
              {!isDefault && canRunConnectionAction("connection_delete", payload) ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null} title={zh ? "移除共享连接，保留原服务中的登录账户" : "Remove sharing while keeping the account signed in with its provider"} onClick={() => submitConnectionAction("connection_delete", `connection-delete:${connection.id}`, zh ? "移除共享连接" : "Remove shared connection", payload)}><X aria-hidden="true" size={13} />{zh ? "移除共享" : "Remove sharing"}</button> : null}
            </span>
          </SettingRow>;
        })}
      </SettingsGroup> : null}
      {authorization.requests.length ? <SettingsGroup title={zh ? "待处理的访问请求" : "Pending access requests"}>
        {authorization.requests.map((request) => {
          const pending = request.status === "requested";
          const deny = connectionAction("connection_access_request_deny");
          const canDeny = pending && canRunConnectionAction("connection_access_request_deny", { request_id: request.requestId });
          const canApprove = pending && Boolean(onApproveConnectionAccess);
          return <div key={request.requestId} data-testid="opl-connection-access-request" data-request-id={request.requestId}>
            <SettingRow label={request.consumer.displayName} detail={`${request.connection.displayName}${request.connection.accountLabel ? ` · ${request.connection.accountLabel}` : ""}`}>
              {canApprove || canDeny ? <span className="runtime-setting-control">
                {canApprove ? <button className="settings-action-button primary" type="button" disabled={actionBusyKey !== null} onClick={() => void onApproveConnectionAccess?.(request.requestId)}>
                  {actionBusyKey === `connection-approve:${request.requestId}` ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <Check aria-hidden="true" size={13} />}{zh ? "授权" : "Approve"}
                </button> : null}
                {canDeny && deny ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={() => submitConnectionAction(deny.actionId, `connection-deny:${request.requestId}`, zh ? "拒绝请求" : "Deny request", { request_id: request.requestId })}>
                  <X aria-hidden="true" size={13} />{zh ? "拒绝" : "Deny"}
                </button> : null}
              </span> : <ConnectionStatusValue status={request.status} locale={locale} />}
            </SettingRow>
            <SettingRow label={zh ? "请求能力" : "Requested capabilities"}>
              <span>{request.capabilities.map((capability) => capabilitySummary(capability, locale)).join(zh ? "、" : ", ") || "--"}</span>
            </SettingRow>
          </div>;
        })}
      </SettingsGroup> : null}
      {authorization.grants.length ? <SettingsGroup title={zh ? "已授予的访问权限" : "Granted access"}>
        {authorization.grants.map((grant) => {
          const revoke = connectionAction("connection_grant_revoke");
          const canRevoke = grant.status === "granted" && canRunConnectionAction("connection_grant_revoke", { grant_id: grant.grantId });
          return <SettingRow key={grant.grantId} label={grant.consumer.displayName} detail={`${grant.connection.displayName}${grant.connection.accountLabel ? ` · ${grant.connection.accountLabel}` : ""} · ${grant.capabilities.map((capability) => capability.label).join(zh ? "、" : ", ")}`}>
            <span className="runtime-setting-control"><ConnectionStatusValue status={grant.staleReason ? "stale" : grant.status} locale={locale} />{canRevoke && revoke ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={() => submitConnectionAction(revoke.actionId, `connection-revoke:${grant.grantId}`, zh ? "撤销授权" : "Revoke grant", { grant_id: grant.grantId })}><Undo2 aria-hidden="true" size={13} />{zh ? "撤销" : "Revoke"}</button> : null}</span>
          </SettingRow>;
        })}
      </SettingsGroup> : null}
      {authorization.invocations.length ? <SettingsGroup title={zh ? "最近使用" : "Recent use"}>
        {authorization.invocations.map((invocation) => <SettingRow key={invocation.invocationId} label={`${invocation.consumerDisplayName} · ${invocation.capabilityLabel}`} detail={`${invocation.connectionDisplayName} · ${invocation.startedAt ?? "--"}`}>
          <ConnectionStatusValue status={invocation.disposition} locale={locale} />
        </SettingRow>)}
      </SettingsGroup> : null}
      {connectionAction("connection_relay_import") ? <SettingsGroup title={zh ? "添加已有邮箱" : "Add an existing mailbox"}>
        {relayAvailable && authorization.availableRelayConnections.length ? <label className="settings-row-label"><span>{zh ? "选择已连接邮箱" : "Select a connected mailbox"}<select className="setting-select" aria-label={zh ? "选择 Relay 邮箱" : "Select Relay mailbox"} value={selectedMailbox?.mailboxRef ?? ""} onChange={(event) => setMailboxRef(event.currentTarget.value)}><option value="">{zh ? "选择邮箱" : "Select a mailbox"}</option>{authorization.availableRelayConnections.map((connection) => <option key={connection.mailboxRef} value={connection.mailboxRef}>{connection.displayName}{connection.accountLabel ? ` · ${connection.accountLabel}` : ""}</option>)}</select></span></label> : <p className="settings-inline-note">{relayAvailable ? (zh ? "还没有可添加的邮箱。请先在 Relay 登录邮箱，再刷新此页面。" : "No mailboxes are available to add. Sign in to a mailbox in Relay, then refresh this page.") : (zh ? "暂时无法读取 Relay 邮箱列表，请检查 Relay 后刷新。" : "The Relay mailbox list is unavailable. Check Relay, then refresh.")}</p>}
        <SettingRow label={zh ? "共享此邮箱连接" : "Share this mailbox connection"} detail={zh ? "选择已在 Relay 登录的邮箱，随后按应用授予所需权限。" : "Choose a mailbox signed in to Relay, then grant the access each app needs."}>
          <button className="settings-action-button" type="button" disabled={actionBusyKey !== null || !relayAvailable || !selectedMailbox} onClick={() => { if (relayAvailable && selectedMailbox) submitConnectionAction("connection_relay_import", "connection-relay-import", zh ? "添加邮箱连接" : "Add mailbox", { mailbox_ref: selectedMailbox.mailboxRef }); }}><Link2 aria-hidden="true" size={13} />{zh ? "添加" : "Add"}</button>
        </SettingRow>
      </SettingsGroup> : null}
    </> : <SettingsGroup title={zh ? "账号与连接" : "Accounts & connections"}>
      <SettingRow label={zh ? "授权状态" : "Authorization status"} detail={zh ? "连接状态尚未返回，请刷新后查看。" : "Connection status has not been returned. Refresh to check again."}>
        <ConnectionStatusValue status="unknown" locale={locale} />
      </SettingRow>
    </SettingsGroup>}
  </>;
}
