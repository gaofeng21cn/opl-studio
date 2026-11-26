import { AlertCircle, Download, LoaderCircle, LogIn, RotateCcw, Save } from "lucide-react";

import { formatNumber, formatAmount, formatDate, gatewayAccountInitials } from "../presentation";
import { SettingRow, SettingsGroup, StatusValue } from "../primitives";

import { SettingsIntentButton } from "../actions";

import type { SettingsPageContext } from "../useSettingsPageContext";
export function AccountSettingsPage({ gatewayAction, actionViewModel, onGatewayLogin, gatewayConnectionState, gatewayAccountReady, editingAccess, accessSetupMode, setupCapabilities, settings, projection, actionBusyKey, onInstallCodex, setAccessSetupMode, setGatewayPassword, setCodexApiKey, setEditingAccess, gatewayEmail, gatewayPassword, setGatewayEmail, codexApiKey, onConfigureCodexApiKey, gateway, zh, locale, modelAccessState, onAction, gatewayUnavailableLabel, gatewayUnavailableDetail }: Pick<SettingsPageContext, "gatewayAction" | "actionViewModel" | "onGatewayLogin" | "gatewayConnectionState" | "gatewayAccountReady" | "editingAccess" | "accessSetupMode" | "setupCapabilities" | "settings" | "projection" | "actionBusyKey" | "onInstallCodex" | "setAccessSetupMode" | "setGatewayPassword" | "setCodexApiKey" | "setEditingAccess" | "gatewayEmail" | "gatewayPassword" | "setGatewayEmail" | "codexApiKey" | "onConfigureCodexApiKey" | "gateway" | "zh" | "locale" | "modelAccessState" | "onAction" | "gatewayUnavailableLabel" | "gatewayUnavailableDetail">) {

      const refreshAction = gatewayAction("refresh");
      const disconnectAction = gatewayAction("disconnect");
      const useForModelAccessAction = gatewayAction("use_for_model_access");
      const exceptionActions = actionViewModel.gatewayActions.filter((action) => (
        action.availability === "ready"
        && action.kind !== "refresh"
        && action.kind !== "disconnect"
        && action.kind !== "use_for_model_access"
      ));
      const gatewayLoginVisible = Boolean(onGatewayLogin)
        && (gatewayConnectionState === "none" || gatewayConnectionState === "account" || gatewayConnectionState === "manual_key")
        && (!gatewayAccountReady || editingAccess)
        && accessSetupMode === "account";
      const apiKeySetupVisible = setupCapabilities.modelAccessSecretInput
        && (gatewayConnectionState === "none" || editingAccess)
        && accessSetupMode === "api_key";
      const showAccessChoice = gatewayConnectionState === "none"
        || (gatewayConnectionState === "account" && !gatewayAccountReady)
        || editingAccess;
      const showAccountDetails = gatewayAccountReady && !editingAccess;
      const showManualKeySummary = gatewayConnectionState === "manual_key" && !editingAccess;
      const accessModeLabel = gatewayConnectionState === "manual_key"
        ? (settings.locale === "zh" ? "API Key" : "API Key")
        : (settings.locale === "zh" ? "OPL Gateway 账户" : "OPL Gateway account");
      return (
        <>
          {projection?.codex.installed === false && setupCapabilities.codexInstall ? (
            <SettingsGroup title={settings.locale === "zh" ? "本机助手" : "Local assistant"}>
              <SettingRow label={settings.locale === "zh" ? "Codex CLI" : "Codex CLI"} detail={settings.locale === "zh" ? "安装到 OPL 管理的位置，不修改系统级工具" : "Installs into the OPL-managed location without changing system tools"}>
                <button className="settings-action-button primary" type="button" disabled={actionBusyKey !== null} onClick={() => { void onInstallCodex(); }}>
                  {actionBusyKey === "setup:codex-install" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <Download aria-hidden="true" size={13} />}
                  {settings.locale === "zh" ? "安装" : "Install"}
                </button>
              </SettingRow>
            </SettingsGroup>
          ) : null}
          {showAccessChoice ? (
            <SettingsGroup title={settings.locale === "zh" ? "模型访问设置" : "Model access setup"}>
              <div className="settings-access-setup">
                <div className="settings-access-setup-header">
                  <div className="segmented-control" role="group" aria-label={settings.locale === "zh" ? "模型访问方式" : "Model access method"}>
                    <button type="button" data-active={accessSetupMode === "account"} onClick={() => setAccessSetupMode("account")}>{settings.locale === "zh" ? "OPL Gateway 账户" : "OPL Gateway account"}</button>
                    <button type="button" data-active={accessSetupMode === "api_key"} onClick={() => setAccessSetupMode("api_key")}>API Key</button>
                  </div>
                  {editingAccess && gatewayConnectionState !== "none" ? (
                    <button
                      className="settings-action-button"
                      type="button"
                      onClick={() => {
                        setGatewayPassword("");
                        setCodexApiKey("");
                        setEditingAccess(false);
                      }}
                    >
                      {settings.locale === "zh" ? "取消" : "Cancel"}
                    </button>
                  ) : null}
                </div>
                {accessSetupMode === "account" && gatewayLoginVisible ? (
                    <form
                      className="gateway-login-form"
                      data-testid="opl-settings-gateway-login"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!onGatewayLogin || !gatewayEmail.trim() || !gatewayPassword) return;
                        const password = gatewayPassword;
                        setGatewayPassword("");
                        void onGatewayLogin({
                          email: gatewayEmail.trim(),
                          password
                        }).then((ok) => {
                          if (ok) {
                            setGatewayEmail("");
                            setEditingAccess(false);
                          }
                        });
                      }}
                    >
                      <label>
                        <span>{settings.locale === "zh" ? "邮箱" : "Email"}</span>
                        <input type="email" autoComplete="username" value={gatewayEmail} onChange={(event) => setGatewayEmail(event.currentTarget.value)} required />
                      </label>
                      <label>
                        <span>{settings.locale === "zh" ? "密码" : "Password"}</span>
                        <input type="password" autoComplete="current-password" value={gatewayPassword} onChange={(event) => setGatewayPassword(event.currentTarget.value)} required />
                      </label>
                      <button className="settings-action-button primary" type="submit" disabled={actionBusyKey !== null || !gatewayEmail.trim() || !gatewayPassword}>
                        {actionBusyKey === "gateway:login" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <LogIn aria-hidden="true" size={13} />}
                        {settings.locale === "zh" ? "登录" : "Sign in"}
                      </button>
                    </form>
                ) : accessSetupMode === "api_key" && apiKeySetupVisible ? (
                  <form
                    className="settings-api-key-form"
                    data-testid="opl-settings-codex-api-key"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const apiKey = codexApiKey.trim();
                      if (!apiKey) return;
                      setCodexApiKey("");
                      void onConfigureCodexApiKey(apiKey).then((ok) => {
                        if (ok) setEditingAccess(false);
                      });
                    }}
                  >
                    <label>
                      <span>API Key</span>
                      <input type="password" autoComplete="off" value={codexApiKey} onChange={(event) => setCodexApiKey(event.currentTarget.value)} required />
                    </label>
                    <button className="settings-action-button primary" type="submit" disabled={actionBusyKey !== null || !codexApiKey.trim()}>
                      {actionBusyKey === "model-access:api-key" ? <LoaderCircle className="spin" aria-hidden="true" size={13} /> : <Save aria-hidden="true" size={13} />}
                      {settings.locale === "zh" ? "配置" : "Configure"}
                    </button>
                    <small>{settings.locale === "zh" ? "密钥安全保存，保存后不会显示完整内容。" : "Your key is stored securely and is not displayed in full after saving."}</small>
                  </form>
                ) : (
                  <p className="settings-access-note" data-testid="opl-settings-access-unavailable">
                    {settings.locale === "zh" ? "当前没有可用的凭据配置入口。" : "No credential setup path is available right now."}
                  </p>
                )}
              </div>
            </SettingsGroup>
          ) : null}
          {gatewayAccountReady && gateway ? (
            <div className="gateway-identity" data-testid="settings-gateway-account">
              <span className="settings-avatar large" aria-hidden="true">{gatewayAccountInitials(gateway.displayName)}</span>
              <span>
                <strong data-testid="opl-settings-gateway-username">{gateway.displayName}</strong>
                <small>{gateway.email ?? "OPL Gateway"}</small>
              </span>
              <span className="runtime-setting-control">
                <StatusValue status={gateway.status} locale={settings.locale} />
                {editingAccess ? null : (
                  <button className="settings-action-button" type="button" onClick={() => { setAccessSetupMode("account"); setEditingAccess(true); }}>{zh ? "更换访问方式" : "Change access method"}</button>
                )}
                <SettingsIntentButton intent={disconnectAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} />
              </span>
            </div>
          ) : null}
          {showAccountDetails && gateway ? (
            <>
              <SettingsGroup title={settings.locale === "zh" ? "账户用量" : "Account usage"}>
                <p className="settings-inline-note">{zh ? "以下为 Gateway 账户汇总，不限于此设备。" : "Gateway account totals across devices."}</p>
                <SettingRow label={settings.locale === "zh" ? "账户状态" : "Account status"}><StatusValue status={gateway.accountStatus ?? gateway.status} locale={settings.locale} /></SettingRow>
                <SettingRow label={settings.locale === "zh" ? "余额" : "Balance"}><strong>{formatAmount(gateway.balance?.amount, gateway.balance?.currency, locale)}</strong></SettingRow>
                <SettingRow label={settings.locale === "zh" ? "今日用量" : "Usage today"}><span>{formatNumber(gateway.usage?.todayTokens, locale, true)} {settings.locale === "zh" ? "令牌" : "tokens"} · {formatAmount(gateway.usage?.todayCost, gateway.usage?.currency, locale)}</span></SettingRow>
                <details className="settings-secondary-details">
                  <summary>{settings.locale === "zh" ? "累计用量" : "Total usage"}</summary>
                  <SettingRow label={settings.locale === "zh" ? "全部用量" : "All usage"}><span>{formatNumber(gateway.usage?.totalTokens, locale, true)} {settings.locale === "zh" ? "令牌" : "tokens"} · {formatAmount(gateway.usage?.totalCost, gateway.usage?.currency, locale)}</span></SettingRow>
                </details>
              </SettingsGroup>
              <SettingsGroup title={settings.locale === "zh" ? "此设备" : "This device"}>
            <SettingRow
              label={settings.locale === "zh" ? "本机默认模型来源" : "Default model source on this device"}
              detail={modelAccessState === "unknown"
                ? (settings.locale === "zh" ? "刷新状态后确认" : "Refresh status to confirm")
                : modelAccessState === "different"
                  ? (settings.locale === "zh" ? "当前不是 OPL Gateway" : "OPL Gateway is not the current source")
                  : undefined}
            >
              <span className="runtime-setting-control" data-testid="opl-settings-model-access-source">
                {modelAccessState === "current" ? (
                  <span className="settings-status" data-tone="ready"><span aria-hidden="true" />OPL Gateway</span>
                ) : modelAccessState === "different" ? (
                  <span>{projection?.codex.providerName ?? projection?.codex.modelAccessSource}</span>
                ) : (
                  <span className="settings-muted">{settings.locale === "zh" ? "待确认" : "Not confirmed"}</span>
                )}
                {modelAccessState === "different" ? (
                  <SettingsIntentButton intent={useForModelAccessAction} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} primary />
                ) : null}
              </span>
            </SettingRow>
            <SettingRow label={settings.locale === "zh" ? "本机" : "This device"}><span>{gateway?.installation?.deviceLabel ?? "--"}</span></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "设备访问" : "Device access"}><StatusValue status={gateway?.managedKey?.status} locale={settings.locale} /></SettingRow>
            <SettingRow label={settings.locale === "zh" ? "最近刷新" : "Last refresh"} detail={gateway?.freshness?.stale ? (settings.locale === "zh" ? "数据可能已过期" : "Data may be stale") : undefined}>
              <span className="runtime-setting-control">
                <span>{formatDate(gateway?.freshness?.observedAt, locale)}</span>
              </span>
            </SettingRow>
            {exceptionActions.length ? (
              <SettingRow label={settings.locale === "zh" ? "账户操作" : "Account actions"}>
                <span className="runtime-setting-control">
                  {exceptionActions.map((intent) => <SettingsIntentButton key={intent.key} intent={intent} locale={settings.locale} busyKey={actionBusyKey} onAction={onAction} primary />)}
                </span>
              </SettingRow>
            ) : null}
              </SettingsGroup>
            </>
          ) : showManualKeySummary ? (
            <SettingsGroup title={settings.locale === "zh" ? "模型访问设置" : "Model access setup"}>
              <SettingRow label={settings.locale === "zh" ? "当前方式" : "Current method"} detail={settings.locale === "zh" ? "已保存的密钥不会显示完整内容。" : "Saved keys are not displayed in full."}>
                <span className="runtime-setting-control" data-testid="opl-settings-api-key-state">
                  <span className="settings-status" data-tone="ready"><span aria-hidden="true" />{accessModeLabel}</span>
                  <button className="settings-action-button" type="button" onClick={() => { setAccessSetupMode("api_key"); setEditingAccess(true); }}>
                    <Save aria-hidden="true" size={13} />
                    {settings.locale === "zh" ? "更换" : "Change"}
                  </button>
                </span>
              </SettingRow>
            </SettingsGroup>
          ) : (
            gatewayConnectionState === "loading" || gatewayConnectionState === "error" ? (
              <div className="settings-inline-notice" data-testid="opl-settings-gateway-empty">
                <AlertCircle aria-hidden="true" size={15} />
                <span>{gatewayConnectionState === "loading" ? gatewayUnavailableLabel : gatewayUnavailableDetail}</span>
              </div>
            ) : null
          )}
          {showManualKeySummary ? (
            <div className="settings-access-change" data-testid="opl-settings-access-change">
              <button className="settings-action-button" type="button" onClick={() => { setAccessSetupMode("account"); setEditingAccess(true); }}>
                <RotateCcw aria-hidden="true" size={13} />
                {settings.locale === "zh" ? "更换访问方式" : "Change access method"}
              </button>
            </div>
          ) : null}
        </>
      );

}
