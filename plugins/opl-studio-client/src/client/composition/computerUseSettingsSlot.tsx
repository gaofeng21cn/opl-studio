import { useEffect, useState } from "react";
import type {
  ComputerUseActionRequest,
  ComputerUseConsentMode,
  ComputerUseState,
  OplBridge
} from "@gaofeng21cn/opl-host-contracts";
import {
  SettingRow,
  StatusPill,
  Switch,
  registerOplSettingsGroup,
  type OplSettingsGroupOwner,
  type OplSettingsGroupSlotRegistry
} from "@gaofeng21cn/opl-dsh-adapters/ui-kit";

type ComputerUseBridge = Pick<
  OplBridge,
  "readComputerUse" | "setComputerUse" | "performComputerUseAction"
>;

export function ComputerUseSettingsSection({
  zh,
  locale,
  bridge
}: {
  zh: boolean;
  locale: "zh" | "en";
  bridge?: ComputerUseBridge;
}) {
  const [state, setState] = useState<ComputerUseState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setState(null);
    setError(false);
    bridge?.readComputerUse?.().then(
      (next) => {
        if (active) setState(next);
      },
      () => {
        if (active) setError(true);
      }
    );
    return () => {
      active = false;
    };
  }, [bridge]);

  async function updateSettings(patch: { enabled?: boolean; consentMode?: ComputerUseConsentMode }) {
    if (!bridge?.setComputerUse || busy) return;
    setBusy(true);
    setError(false);
    try {
      setState(await bridge.setComputerUse(patch));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function runAction(request: ComputerUseActionRequest) {
    if (!bridge?.performComputerUseAction || busy) return;
    setBusy(true);
    setError(false);
    try {
      setState(await bridge.performComputerUseAction({ ...request, locale }));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const label = zh ? "Computer Use（桌面操控）" : "Computer Use";
  const detail = zh
    ? "使用 DSH 原生 MCP 能力直接控制桌面应用，动态注入给 Codex。"
    : "Use DSH native MCP desktop automation, dynamically injected into Codex.";

  if (!bridge?.readComputerUse) {
    return (
      <SettingRow label={label} detail={detail}>
        <StatusPill state="idle" label={zh ? "当前宿主不可用" : "Unavailable"} />
      </SettingRow>
    );
  }

  const supported = state?.supported ?? true;
  const available = state?.available ?? false;
  const enabled = state?.enabled ?? false;
  const consentMode = state?.consentMode ?? "elicit";

  return (
    <div data-testid="opl-dsh-computer-use-settings">
      <SettingRow label={label} detail={detail}>
        {state && !supported ? (
          <StatusPill state="idle" label={zh ? "仅支持 macOS" : "macOS only"} />
        ) : state && !available ? (
          <StatusPill state="warning" label={zh ? "未检测到辅助程序" : "Helper missing"} />
        ) : (
          <Switch
            label={label}
            checked={enabled}
            disabled={!state || busy}
            onChange={(next) => void updateSettings({ enabled: next })}
          />
        )}
      </SettingRow>

      {error ? (
        <p className="settings-inline-note" role="alert">
          {zh ? "无法读取或保存 Computer Use 设置" : "Could not read or update Computer Use settings"}
        </p>
      ) : null}

      {state?.restartPending ? (
        <p className="settings-inline-note" role="status" data-testid="opl-cua-restart-pending">
          {zh
            ? "当前有对话轮次正在运行，设置已保存并在空闲重启 Codex 后生效。"
            : "A turn is currently running. Changes are saved and apply after Codex restarts when idle."}
        </p>
      ) : null}

      {state?.supported && state.available && enabled ? (
        <>
          <SettingRow
            label={zh ? "授权模式" : "Consent mode"}
            detail={zh
              ? "默认按应用弹出确认（elicit）；无人值守允许跳过确认。"
              : "Per-application prompt via MCP elicitation by default; unattended allow grants access automatically."}
          >
            <select
              className="setting-select"
              data-testid="opl-computer-use-consent-select"
              aria-label={zh ? "Computer Use 授权模式" : "Computer Use consent mode"}
              disabled={busy}
              value={consentMode}
              onChange={(event) => void updateSettings({
                consentMode: event.currentTarget.value === "allow" ? "allow" : "elicit"
              })}
            >
              <option value="elicit">
                {zh ? "逐应用确认（推荐）" : "Ask per app (elicit, recommended)"}
              </option>
              <option value="allow">
                {zh ? "无人值守自动允许（allow）" : "Unattended auto-allow (allow)"}
              </option>
            </select>
          </SettingRow>

          {consentMode === "allow" ? (
            <p className="settings-inline-note" role="status" data-testid="opl-cua-unattended-warning">
              {zh
                ? "警告：无人值守模式将在不经过人工确认的情况下自动授予桌面应用操控与输入权限，同时自动放行 cua_run_code 工具调用。"
                : "Warning: Unattended mode grants application control and pointer access automatically without confirmation prompts, and auto-approves cua_run_code calls."}
            </p>
          ) : null}

          <SettingRow
            label={zh ? "辅助功能权限" : "Accessibility permission"}
            detail={state.permissions.helperAppPath ?? undefined}
          >
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <StatusPill
                state={state.permissions.accessibility ? "done" : "warning"}
                label={state.permissions.accessibility
                  ? (zh ? "已授权" : "Granted")
                  : (zh ? "需要授权" : "Permission required")}
              />
              {!state.permissions.accessibility ? (
                <button
                  className="settings-inline-command"
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction({ action: "request_permission", permission: "accessibility" })}
                >
                  {zh ? "请求授权" : "Request access"}
                </button>
              ) : null}
              <button
                className="settings-inline-command"
                type="button"
                disabled={busy}
                onClick={() => void runAction({ action: "open_settings", permission: "accessibility" })}
              >
                {zh ? "打开系统设置" : "System Settings"}
              </button>
            </div>
          </SettingRow>

          <SettingRow
            label={zh ? "屏幕录制权限" : "Screen Recording permission"}
            detail={zh ? "用于捕获屏幕画面并定位桌面元素。" : "Required to capture screenshots and inspect desktop UI."}
          >
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <StatusPill
                state={state.permissions.screenRecording ? "done" : "warning"}
                label={state.permissions.screenRecording
                  ? (zh ? "已授权" : "Granted")
                  : (zh ? "需要授权" : "Permission required")}
              />
              {!state.permissions.screenRecording ? (
                <button
                  className="settings-inline-command"
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction({ action: "request_permission", permission: "screenRecording" })}
                >
                  {zh ? "请求授权" : "Request access"}
                </button>
              ) : null}
              <button
                className="settings-inline-command"
                type="button"
                disabled={busy}
                onClick={() => void runAction({ action: "open_settings", permission: "screenRecording" })}
              >
                {zh ? "打开系统设置" : "System Settings"}
              </button>
              <button
                className="settings-inline-command"
                type="button"
                disabled={busy}
                onClick={() => void runAction({ action: "recheck" })}
              >
                {zh ? "重新检查" : "Recheck"}
              </button>
            </div>
          </SettingRow>

          {state.allowedApps.map((app) => (
            <SettingRow
              key={`allow:${app.id}`}
              label={app.name}
              detail={app.executablePath ?? (zh ? "已保存长期允许" : "Always allowed")}
            >
              <button
                className="settings-inline-command"
                type="button"
                disabled={busy}
                onClick={() => void runAction({ action: "revoke_app", appId: app.id })}
              >
                {zh ? "撤销" : "Revoke"}
              </button>
            </SettingRow>
          ))}

          {state.blockedApps.map((app) => (
            <SettingRow
              key={`block:${app.id}`}
              label={app.name}
              detail={app.executablePath ?? (zh ? "已在会话中拒绝" : "Blocked in session")}
            >
              <button
                className="settings-inline-command"
                type="button"
                disabled={busy}
                onClick={() => void runAction({ action: "retry_app", appId: app.id })}
              >
                {zh ? "允许重试询问" : "Retry prompt"}
              </button>
            </SettingRow>
          ))}
        </>
      ) : null}
    </div>
  );
}

export function registerComputerUseSettingsSlot(slots: OplSettingsGroupSlotRegistry) {
  return registerOplSettingsGroup(
    slots,
    {
      id: "dsh-computer-use",
      packageId: "dsh-computer-use",
      destination: "capabilities",
      order: 10,
      registrant: "opl-studio",
      titleI18n: { zh: "桌面操控（Computer Use）", en: "Computer Use" },
      searchKeywords: "computer use cua 桌面操控 电脑操作 辅助功能 屏幕录制 无人值守 elicit allow"
    },
    (owner: OplSettingsGroupOwner) => (
      <ComputerUseSettingsSection
        zh={owner.locale === "zh"}
        locale={owner.locale}
        bridge={owner.computerUse}
      />
    )
  );
}
