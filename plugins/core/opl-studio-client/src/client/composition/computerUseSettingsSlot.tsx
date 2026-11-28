import { useEffect, useRef, useState } from "react";
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
> & {
  subscribeEvents?: (onEvent: (event: { method?: string; type?: string; params?: Record<string, unknown> }) => void) => () => void;
};

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
  const [error, setError] = useState<"read" | "action" | null>(null);
  const requestSeqRef = useRef(0);
  const connectionRef = useRef<{
    busy: boolean;
    refreshPending: boolean;
    refresh: (surfaceError: boolean) => void;
  } | null>(null);

  useEffect(() => {
    setState(null);
    setBusy(false);
    setError(null);

    const refresh = (surfaceError: boolean) => {
      if (!bridge?.readComputerUse) return;
      const seq = ++requestSeqRef.current;
      void bridge.readComputerUse().then(
        (next) => {
          if (connectionRef.current === connection && seq === requestSeqRef.current) {
            setState(next);
            setError((previous) => previous === "read" ? null : previous);
          }
        },
        () => {
          if (connectionRef.current === connection && surfaceError && seq === requestSeqRef.current) {
            setError("read");
          }
        }
      );
    };

    const connection = { busy: false, refreshPending: false, refresh };
    connectionRef.current = connection;
    refresh(true);
    const unsubscribe = bridge?.subscribeEvents?.((event) => {
      if (event?.method === "host/computer-use-changed" || event?.method === "host/availability") {
        // The host may publish an event before the settings operation returns.
        // Read again after handling its result so a failed refresh can't mask it.
        if (connection.busy) connection.refreshPending = true;
        else refresh(false);
      }
    });

    return () => {
      connectionRef.current = null;
      unsubscribe?.();
    };
  }, [bridge]);

  async function runRequest(request: () => Promise<ComputerUseState>) {
    const connection = connectionRef.current;
    if (!connection || connection.busy) return;
    connection.busy = true;
    ++requestSeqRef.current;
    setBusy(true);
    setError(null);
    try {
      const next = await request();
      if (connectionRef.current === connection) setState(next);
    } catch {
      if (connectionRef.current === connection) setError("action");
    } finally {
      if (connectionRef.current === connection) {
        connection.busy = false;
        setBusy(false);
        if (connection.refreshPending) {
          connection.refreshPending = false;
          connection.refresh(false);
        }
      }
    }
  }

  function updateSettings(patch: { enabled?: boolean; consentMode?: ComputerUseConsentMode }) {
    const setComputerUse = bridge?.setComputerUse;
    if (setComputerUse) void runRequest(() => setComputerUse(patch));
  }

  function runAction(request: ComputerUseActionRequest) {
    const performComputerUseAction = bridge?.performComputerUseAction;
    if (performComputerUseAction) void runRequest(() => performComputerUseAction({ ...request, locale }));
  }

  const label = zh ? "桌面操控（Computer Use）" : "Computer Use";
  const detail = zh
    ? "允许助手在需要时查看并操作桌面窗口与应用。"
    : "Allow the assistant to inspect and operate desktop windows and apps when needed.";

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
  const runtimeInitFailed = Boolean(state?.supported && state.available && enabled && !state.active && !state.restartPending && state.unavailableReason);
  const enabledNotActive = Boolean(state?.supported && state.available && enabled && !state.active && !state.restartPending && !state.unavailableReason);

  return (
    <div data-testid="opl-dsh-computer-use-settings">
      <SettingRow label={label} detail={detail}>
        {state && !supported ? (
          <StatusPill state="idle" label={zh ? "仅支持 macOS" : "macOS only"} />
        ) : state && !available ? (
          <StatusPill state="warning" label={zh ? "未检测到辅助程序" : "Helper missing"} />
        ) : (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {runtimeInitFailed ? (
              <StatusPill state="warning" label={zh ? "初始化异常 · 不可用" : "Init failed · Unavailable"} />
            ) : null}
            <Switch
              label={label}
              checked={enabled}
              disabled={!state || busy}
              onChange={(next) => void updateSettings({ enabled: next })}
            />
          </div>
        )}
      </SettingRow>

      {error ? (
        <p className="settings-inline-note" role="alert">
          {zh ? "无法读取或保存 Computer Use 设置" : "Could not read or update Computer Use settings"}
        </p>
      ) : null}

      {runtimeInitFailed ? (
        <p className="settings-inline-note" role="alert" data-testid="opl-cua-runtime-error">
          {zh
            ? `Computer Use 初始化异常（${state!.unavailableReason}），当前未生效且功能不可用；普通 Codex 对话不受影响。`
            : `Computer Use failed to initialize (${state!.unavailableReason}) and is currently unavailable; plain Codex chats are unaffected.`}
        </p>
      ) : enabledNotActive ? (
        <p className="settings-inline-note" role="status" data-testid="opl-cua-inactive-notice">
          {zh
            ? "Computer Use 开关已打开，但当前未在 Codex 运行进程中生效。"
            : "Computer Use is enabled, but not currently active in the running Codex process."}
        </p>
      ) : null}

      {state?.restartPending ? (
        <p className="settings-inline-note" role="status" data-testid="opl-cua-restart-pending">
          {state.active && !enabled
            ? (zh
              ? `当前有对话轮次正在运行，旧授权模式（${state.activeConsentMode ?? "elicit"}）仅在本轮内保留；轮次结束后将自动重载 Codex 并关闭 Computer Use。`
              : `A turn is currently running, so the previous mode (${state.activeConsentMode ?? "elicit"}) stays active only for this turn; Codex will reload automatically when idle to turn Computer Use off.`)
            : state.active && enabled && state.activeConsentMode && state.activeConsentMode !== consentMode
              ? (zh
                ? `当前有对话轮次正在运行，当前生效模式仍为 ${state.activeConsentMode}，目标模式 ${consentMode} 将在轮次结束后自动重载生效。`
                : `A turn is currently running, so ${state.activeConsentMode} remains active until the turn finishes and Codex reloads automatically to ${consentMode}.`)
              : (zh
                ? "当前有对话轮次正在运行，设置已保存并在空闲重启 Codex 后生效。"
                : "A turn is currently running. Changes are saved and apply after Codex restarts when idle.")}
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
