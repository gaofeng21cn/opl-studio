import { actionPayloadComplete } from "../../settingsActions";
import { Check, Link2, LoaderCircle, Undo2, X } from "lucide-react";
import { useState } from "react";

import { dockerDiagnosticPresentation } from "../../settings/presentation";
import { SettingRow, SettingsGroup, StatusValue } from "../../settings/primitives";

import { RuntimeActionButton } from "../../settings/actions";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function ResourcesSettingsPage({ projection, actionBusyKey, dockerDiagnostic, settings, zh, capabilityCatalog, capabilityStatus, onAction, onApproveConnectionAccess }: Pick<SettingsPageContext, "projection" | "actionBusyKey" | "dockerDiagnostic" | "settings" | "zh" | "capabilityCatalog" | "capabilityStatus" | "onAction" | "onApproveConnectionAccess">) {

      const dockerActions = projection?.dockerWebui.actions ?? [];
      const diagnoseAction = dockerActions.find((action) => action.actionId === "settings_diagnose_docker_webui");
      const diagnoseBusy = actionBusyKey === "runtime:settings_diagnose_docker_webui";
      const diagnosticStatus = diagnoseBusy ? "checking" : dockerDiagnostic?.status ?? "not_checked";
      const dockerPresentation = dockerDiagnosticPresentation(dockerDiagnostic, settings.locale);
      const ordinaryActions = dockerActions.filter((action) => (
        action.actionId === "settings_open_docker_webui"
        && dockerDiagnostic?.browserUrlStatus === "configured"
        && action.state !== "unavailable"
        && actionPayloadComplete(action.payload, action.requiredPayloadFields)
      ));
      const authorization = projection?.connectionAuthorization;
      const connectionAction = (actionId: string) => projection?.connectionActions.find((action) => action.actionId === actionId);
      const canRunConnectionAction = (actionId: string, payload: Record<string, unknown>) => {
        const action = connectionAction(actionId);
        return Boolean(action && actionPayloadComplete(payload, action.payloadFields));
      };
      const [mailboxRef, setMailboxRef] = useState("");
      const submitConnectionAction = (actionId: string, key: string, label: string, payload: Record<string, unknown>) => {
        const action = connectionAction(actionId);
        if (!action || !actionPayloadComplete(payload, action.payloadFields)) return;
        onAction({ key, actionId, label, payload, confirmationRequired: action.confirmationRequired, dryRunSupported: action.dryRunSupported });
      };
      return (
        <>
          <details className="settings-secondary-details"><summary>{zh ? `连接应用 · ${capabilityCatalog.apps.length}` : `Connected apps · ${capabilityCatalog.apps.length}`}</summary><SettingsGroup title={settings.locale === "zh" ? "应用状态" : "App status"}>
            <p className="settings-inline-note">{zh ? "这里显示本机助手提供的应用；微信、远程设备和网页访问在下方分别管理。" : "Apps exposed by the local assistant. Messaging, remote devices and web access are managed below."}</p>
            {capabilityStatus === "error" ? <p role="alert">{zh ? "应用列表刷新失败，已保留上次结果。" : "App list refresh failed; previous results are retained."}</p> : null}
            {capabilityCatalog.apps.length ? capabilityCatalog.apps.map(app => <SettingRow key={app.id} label={app.name} detail={app.description}><StatusValue status={app.enabled && app.callable ? "available" : app.enabled ? "checking" : "disabled"} locale={settings.locale} /></SettingRow>) : <p className="settings-inline-note">{capabilityStatus === "loading" || capabilityStatus === "idle" ? (zh ? "正在读取应用…" : "Loading apps…") : (zh ? "尚未发现连接应用。" : "No connected apps found.")}</p>}
          </SettingsGroup></details>
          {projection?.externalConnections.length ? <SettingsGroup title={settings.locale === "zh" ? "其他资源" : "Other resources"}>
            {projection?.externalConnections.length ? projection.externalConnections.map((connection) => (
              <SettingRow key={connection.id} label={connection.name}><StatusValue status={connection.status} locale={settings.locale} /></SettingRow>
            )) : <SettingRow label={settings.locale === "zh" ? "连接" : "Connections"}><span className="settings-muted">{settings.locale === "zh" ? "暂无外部连接" : "No external connections"}</span></SettingRow>}
          </SettingsGroup> : null}
          {authorization ? <>
            {authorization.connections.length ? <SettingsGroup title={settings.locale === "zh" ? "OPL Connect · 已连接账户" : "OPL Connect · Connected accounts"}>
              {authorization.connections.map((connection) => <SettingRow key={connection.id} label={connection.displayName} detail={[connection.accountLabel, connection.providerType].filter(Boolean).join(" · ")}>
                <span className="runtime-setting-control"><StatusValue status={connection.status} locale={settings.locale} />{connection.capabilities.length ? <span>{connection.capabilities.map((capability) => capability.label).join(settings.locale === "zh" ? "、" : ", ")}</span> : null}</span>
              </SettingRow>)}
            </SettingsGroup> : null}
            {authorization.requests.length ? <SettingsGroup title={settings.locale === "zh" ? "待处理的访问请求" : "Pending access requests"}>
              {authorization.requests.map((request) => {
                const pending = request.status === "requested";
                const deny = connectionAction("connection_access_request_deny");
                const canDeny = pending && canRunConnectionAction("connection_access_request_deny", { request_id: request.requestId });
                const canApprove = pending && Boolean(onApproveConnectionAccess);
                return <div key={request.requestId} data-testid="opl-connection-access-request" data-request-id={request.requestId}>
                  <SettingRow label={request.consumer.displayName} detail={`${request.connection.displayName}${request.connection.accountLabel ? ` · ${request.connection.accountLabel}` : ""} · ${request.status}`}>
                    {canApprove || canDeny ? <span className="runtime-setting-control">
                      {canApprove ? <button className="settings-action-button primary" type="button" disabled={actionBusyKey !== null} onClick={() => void onApproveConnectionAccess?.(request.requestId)}>
                        {actionBusyKey === `connection-approve:${request.requestId}` ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <Check aria-hidden="true" size={13} />}{settings.locale === "zh" ? "授权" : "Approve"}
                      </button> : null}
                      {canDeny && deny ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={() => submitConnectionAction(deny.actionId, `connection-deny:${request.requestId}`, settings.locale === "zh" ? "拒绝请求" : "Deny request", { request_id: request.requestId })}>
                        <X aria-hidden="true" size={13} />{settings.locale === "zh" ? "拒绝" : "Deny"}
                      </button> : null}
                    </span> : <StatusValue status={request.status} locale={settings.locale} />}
                  </SettingRow>
                  <SettingRow label={settings.locale === "zh" ? "请求能力" : "Requested capabilities"}>
                    <span>{request.capabilities.map((capability) => `${capability.label}${capability.risk ? ` (${capability.risk})` : ""}`).join(settings.locale === "zh" ? "、" : ", ") || "--"}</span>
                  </SettingRow>
                </div>;
              })}
            </SettingsGroup> : null}
            {authorization.grants.length ? <SettingsGroup title={settings.locale === "zh" ? "已授予的访问权限" : "Granted access"}>
              {authorization.grants.map((grant) => {
                const revoke = connectionAction("connection_grant_revoke");
                const canRevoke = grant.status === "granted" && canRunConnectionAction("connection_grant_revoke", { grant_id: grant.grantId });
                return <SettingRow key={grant.grantId} label={grant.consumer.displayName} detail={`${grant.connection.displayName}${grant.connection.accountLabel ? ` · ${grant.connection.accountLabel}` : ""} · ${grant.capabilities.map((capability) => capability.label).join(settings.locale === "zh" ? "、" : ", ")}`}>
                  <span className="runtime-setting-control"><StatusValue status={grant.staleReason ? "stale" : grant.status} locale={settings.locale} />{canRevoke && revoke ? <button className="settings-action-button" type="button" disabled={actionBusyKey !== null} onClick={() => submitConnectionAction(revoke.actionId, `connection-revoke:${grant.grantId}`, settings.locale === "zh" ? "撤销授权" : "Revoke grant", { grant_id: grant.grantId })}><Undo2 aria-hidden="true" size={13} />{settings.locale === "zh" ? "撤销" : "Revoke"}</button> : null}</span>
                </SettingRow>;
              })}
            </SettingsGroup> : null}
            {authorization.invocations.length ? <SettingsGroup title={settings.locale === "zh" ? "最近使用" : "Recent use"}>
              {authorization.invocations.map((invocation) => <SettingRow key={invocation.invocationId} label={`${invocation.consumerDisplayName} · ${invocation.capabilityLabel}`} detail={`${invocation.connectionDisplayName} · ${invocation.startedAt ?? "--"}`}>
                <StatusValue status={invocation.disposition} locale={settings.locale} />
              </SettingRow>)}
            </SettingsGroup> : null}
            {connectionAction("connection_relay_import") ? <SettingsGroup title={settings.locale === "zh" ? "导入 Relay 邮箱连接" : "Import Relay mailbox"}>
              {authorization.availableRelayConnections.length ? <label className="settings-row-label"><span>{settings.locale === "zh" ? "选择已连接邮箱" : "Select a connected mailbox"}<select className="setting-select" aria-label={settings.locale === "zh" ? "选择 Relay 邮箱" : "Select Relay mailbox"} value={mailboxRef} onChange={(event) => setMailboxRef(event.currentTarget.value)}><option value="">{settings.locale === "zh" ? "选择邮箱" : "Select a mailbox"}</option>{authorization.availableRelayConnections.map((connection) => <option key={connection.mailboxRef} value={connection.mailboxRef}>{connection.displayName}{connection.accountLabel ? ` · ${connection.accountLabel}` : ""}</option>)}</select></span></label> : <label className="settings-row-label"><span>{settings.locale === "zh" ? "邮箱引用" : "Mailbox reference"}<input className="setting-select" aria-label={settings.locale === "zh" ? "邮箱引用" : "Mailbox reference"} value={mailboxRef} onChange={(event) => setMailboxRef(event.currentTarget.value)} placeholder="mailbox-ref" /></span></label>}
              <SettingRow label={settings.locale === "zh" ? "添加到 OPL Connect" : "Add to OPL Connect"} detail={settings.locale === "zh" ? "只导入 Relay 所有者提供的安全邮箱引用，不读取凭据。" : "Imports a safe mailbox reference from the Relay owner; credentials are not read."}>
                <button className="settings-action-button" type="button" disabled={actionBusyKey !== null || !mailboxRef.trim()} onClick={() => submitConnectionAction("connection_relay_import", "connection-relay-import", settings.locale === "zh" ? "导入邮箱连接" : "Import mailbox", { mailbox_ref: mailboxRef.trim() })}><Link2 aria-hidden="true" size={13} />{settings.locale === "zh" ? "导入" : "Import"}</button>
              </SettingRow>
            </SettingsGroup> : null}
          </> : <SettingsGroup title={settings.locale === "zh" ? "OPL Connect" : "OPL Connect"}>
            <SettingRow label={settings.locale === "zh" ? "授权状态" : "Authorization status"} detail={settings.locale === "zh" ? "连接授权投影暂不可用，请刷新状态。" : "Connection authorization projection is unavailable; refresh status."}>
              <StatusValue status="unavailable" locale={settings.locale} />
            </SettingRow>
          </SettingsGroup>}
          <SettingsGroup title={settings.locale === "zh" ? "网页访问" : "Web access"}>
            <SettingRow label={zh ? "部署网页端" : "Deploy WebUI"} detail={zh ? "网页端独立部署。指南包含安装、访问认证、数据目录和启动步骤。" : "WebUI is a separate deployment. The guide covers installation, authentication, data directories and startup."}><a className="settings-support-link" target="_blank" rel="noreferrer" href="https://github.com/gaofeng21cn/opl-studio/blob/main/docs/oci-distribution.md">{zh ? "配置指南" : "Setup guide"}</a></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "运行检查" : "Runtime check"} detail={diagnosticStatus === "checking"
              ? (settings.locale === "zh" ? "正在读取运行环境" : "Reading the runtime")
              : dockerPresentation.detail}>
              <span className="runtime-setting-control"><StatusValue status={diagnosticStatus === "checking" ? diagnosticStatus : dockerPresentation.status} locale={settings.locale} /><RuntimeActionButton action={diagnoseAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /></span>
            </SettingRow>
            {dockerPresentation.issues.length ? <SettingRow label={settings.locale === "zh" ? "需要处理" : "Needs attention"}><span>{dockerPresentation.issues.join(settings.locale === "zh" ? "，" : ", ")}</span></SettingRow> : null}
            {ordinaryActions.length ? (
              <>{ordinaryActions.map((action) => <SettingRow key={action.actionId} label={action.label}><RuntimeActionButton action={action} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} /></SettingRow>)}</>
            ) : null}
          </SettingsGroup>
        </>
      );

}
