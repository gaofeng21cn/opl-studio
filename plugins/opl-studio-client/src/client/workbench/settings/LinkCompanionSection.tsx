import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, RefreshCw, X } from "lucide-react";
import type { LinkDeviceReadback, LinkPairing } from "../../bridge/oplBridge-types-platform-events";
import { SettingRow, SettingsGroup } from "./primitives";

function needsRecovery(internet: LinkDeviceReadback["internet"]) {
  return internet?.enabled !== false && internet?.reasonCode !== "CONNECTION_REPLACED" && (internet?.status === "error" || internet?.status === "reconnecting");
}

export function LinkCompanionSection({ locale, onOpenAccount }: { locale: "zh" | "en"; onOpenAccount?: () => void }) {
  const zh = locale === "zh";
  const studio = typeof window === "undefined" ? undefined : window.oplStudio;
  const bridge = studio?.linkCompanion;
  const [state, setState] = useState<LinkDeviceReadback | null>(null);
  const [pairing, setPairing] = useState<LinkPairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now());
  const recoveryTimer = useRef<number | null>(null);
  const recoveryAttempt = useRef(0);
  const recoveryInFlight = useRef(false);
  const actionInFlight = useRef(false);
  const updateGeneration = useRef(0);
  const latestConnection = useRef<LinkDeviceReadback["internet"]>(undefined);
  const connection = state?.internet?.status;
  const connectionReplaced = state?.internet?.reasonCode === "CONNECTION_REPLACED";
  const remoteEnabled = state?.internet?.enabled ?? (connection !== undefined && connection !== "disabled" && connection !== "account_required");

  function updateState(next: LinkDeviceReadback) {
    latestConnection.current = next.internet;
    setState(next);
  }

  function updateStatus(next: NonNullable<LinkDeviceReadback["internet"]>) {
    latestConnection.current = next;
    setState(current => current ? { ...current, internet: next } : current);
  }

  async function refresh() { if (bridge) updateState(await bridge.readDevices()); }

  function clearRecoveryTimer() {
    if (recoveryTimer.current === null) return;
    window.clearTimeout(recoveryTimer.current);
    recoveryTimer.current = null;
  }

  function recoveryDelay() {
    return [3000, 10000, 30000][Math.min(recoveryAttempt.current, 2)] ?? 30000;
  }

  function scheduleRecovery(delay = 0) {
    if (!bridge || actionInFlight.current || !needsRecovery(latestConnection.current) || recoveryTimer.current !== null || recoveryInFlight.current) return;
    recoveryTimer.current = window.setTimeout(() => {
      recoveryTimer.current = null;
      if (actionInFlight.current || !needsRecovery(latestConnection.current)) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        scheduleRecovery(30000);
        return;
      }
      const generation = updateGeneration.current;
      recoveryInFlight.current = true;
      void bridge.reconnectInternet()
        .then((next) => {
          if (generation !== updateGeneration.current) return;
          updateStatus(next);
          if (next.status === "ready") {
            recoveryAttempt.current = 0;
            setError("");
          } else if (needsRecovery(next)) {
            recoveryAttempt.current = Math.min(recoveryAttempt.current + 1, 3);
          }
        })
        .catch(() => {
          if (generation === updateGeneration.current) recoveryAttempt.current = Math.min(recoveryAttempt.current + 1, 3);
        })
        .finally(() => {
          recoveryInFlight.current = false;
          scheduleRecovery(recoveryDelay());
        });
    }, delay);
  }

  useEffect(() => {
    let alive = true;
    async function read() {
      if (!bridge || actionInFlight.current) return;
      const generation = updateGeneration.current;
      try {
        const value = await bridge.readDevices();
        if (alive && generation === updateGeneration.current) updateState(value);
      } catch {
        if (alive && generation === updateGeneration.current) setError(zh ? "连接状态读取失败，请刷新。" : "Could not read connection status. Refresh to try again.");
      }
    }
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void read(); };
    void read();
    const timer = window.setInterval(() => { void read(); }, 3000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [bridge, zh]);
  useEffect(() => {
    if (!bridge) return;
    if (!needsRecovery(latestConnection.current)) {
      recoveryAttempt.current = 0;
      clearRecoveryTimer();
      return;
    }
    scheduleRecovery(connection === "error" && recoveryAttempt.current === 0 ? 0 : recoveryDelay());
    return clearRecoveryTimer;
  }, [bridge, connection, connectionReplaced, remoteEnabled]);
  useEffect(() => () => { updateGeneration.current++; clearRecoveryTimer(); }, []);
  useEffect(() => { if (!pairing) return; const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, [pairing]);
  const expiresIn = pairing ? Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - clock) / 1000)) : 0;
  useEffect(() => { if (pairing && (expiresIn === 0 || !remoteEnabled)) setPairing(null); }, [pairing, expiresIn, remoteEnabled]);
  if (!bridge || state?.unavailable) return null;
  async function run(operation: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    updateGeneration.current++;
    clearRecoveryTimer();
    setBusy(true); setError("");
    try { await operation(); }
    catch { setError(zh ? "操作未完成。请查看连接状态后重试。" : "Could not complete the action. Check the connection status and try again."); await refresh().catch(() => {}); }
    finally {
      actionInFlight.current = false;
      setBusy(false);
      scheduleRecovery(recoveryDelay());
    }
  }
  const statusText = connectionReplaced
    ? (zh ? "电脑连接已被替换" : "This computer’s connection was replaced")
    : connection
    ? ({ disabled: zh ? "手机访问已关闭" : "Phone access is off", account_required: zh ? "请先登录 OPL 账号" : "Sign in to your OPL account", connecting: zh ? "正在连接" : "Connecting", reconnecting: zh ? "正在自动恢复" : "Automatically recovering", ready: zh ? "手机访问已就绪" : "Phone access is ready", error: zh ? "正在自动恢复" : "Automatically recovering" })[connection]
    : (zh ? "正在读取连接状态" : "Reading connection status");
  return <SettingsGroup title="OPL Link">
    <SettingRow label={zh ? "在 iPhone 或 iPad 上继续" : "Continue on iPhone or iPad"} detail={zh ? "登录同一个 OPL 账号，即可在 OPL Link 中连接这台电脑。电脑需保持联网并运行 OPL App。" : "Sign in to the same OPL account to connect to this computer in OPL Link. Keep this computer online with OPL App running."}>
      {remoteEnabled ? <button className="settings-action-button" type="button" disabled={busy} onClick={() => void run(async () => {
        setPairing(null);
        if (bridge.disableInternet) {
          updateStatus(await bridge.disableInternet());
          return;
        }
        const receipt = await studio?.executeAction?.({ actionId: "link_disable_internet", mode: "execute", dryRun: false, payload: { confirmed: true } });
        const next = await bridge.readDevices();
        updateState(next);
        if (receipt?.status !== "executed" || next.internet?.status !== "disabled") throw new Error("Phone access could not be turned off");
      })}>{zh ? "关闭手机访问" : "Turn off phone access"}</button> :
        <button className="settings-action-button" type="button" disabled={busy || !connection} onClick={() => void run(async () => {
          updateStatus(await bridge.enableInternet());
        })}><Smartphone size={14} aria-hidden="true" />{zh ? "开启手机访问" : "Enable phone access"}</button>}
    </SettingRow>
    <SettingRow label={zh ? "连接状态" : "Connection status"}>
      <span role="status" aria-live="polite">{statusText}</span>
      {connection === "account_required" && onOpenAccount ? <button className="settings-inline-command" type="button" onClick={onOpenAccount}>{zh ? "打开 OPL 账号" : "Open OPL account"}</button> : null}
      {(connectionReplaced || needsRecovery(state?.internet)) ? <button className="settings-action-button" type="button" disabled={busy} onClick={() => void run(async () => { recoveryAttempt.current = 0; updateStatus(await bridge.reconnectInternet()); })}><RefreshCw size={13} aria-hidden="true" />{zh ? "立即重连" : "Reconnect now"}</button> : null}
    </SettingRow>
    {remoteEnabled && connection === "ready" ? <SettingRow label={zh ? "备用连接方式" : "Fallback connection"}>
      <button className="settings-action-button" type="button" disabled={busy} onClick={() => void run(async () => { const value = await bridge.createPairing(); setClock(Date.now()); setPairing(value); })}>{zh ? "生成连接码" : "Create pairing code"}</button>
    </SettingRow> : null}
    {remoteEnabled && pairing && expiresIn > 0 ? <div className="opl-link-pairing" style={{ display: "grid", justifyItems: "start", gap: 12, padding: "12px 0 20px" }}>
      <div style={{ background: "white", padding: 16, borderRadius: 12 }}><QRCodeSVG value={pairing.pairingURL} size={184} title={zh ? "用 OPL Link 扫描连接码" : "Scan in OPL Link"} /></div>
      <p className="settings-inline-note">{zh ? `在 OPL Link 中扫描，一次有效，${expiresIn} 秒后过期。` : `Scan in OPL Link. Single use; expires in ${expiresIn} seconds.`}</p>
      {pairing.hostFingerprint ? <p className="settings-inline-note">{zh ? "核对此电脑的指纹：" : "Verify this computer’s fingerprint: "}<code>{pairing.hostFingerprint}</code></p> : null}
      <button className="settings-inline-command" type="button" onClick={() => { void navigator.clipboard.writeText(pairing.pairingURL).catch(() => setError(zh ? "复制失败，请直接扫码。" : "Could not copy. Scan the code instead.")); }}>{zh ? "复制连接链接" : "Copy pairing link"}</button>
    </div> : null}
    <SettingRow label={zh ? "已连接设备" : "Connected devices"}>
      <button className="settings-action-button" type="button" disabled={busy} onClick={() => void run(refresh)}><RefreshCw size={13} aria-hidden="true" />{zh ? "刷新" : "Refresh"}</button>
    </SettingRow>
    {state?.devices.map(device => <SettingRow key={device.id} label={device.name} detail={`${zh ? "上次连接：" : "Last connected: "}${new Date(device.lastSeenAt).toLocaleString(zh ? "zh-CN" : "en-US")}`}>
      <button className="settings-action-button" type="button" disabled={busy} onClick={() => void run(async () => { await bridge!.revokeDevice({ id: device.id }); await refresh(); })}><X size={13} aria-hidden="true" />{zh ? "断开设备" : "Disconnect"}</button>
    </SettingRow>)}
    {state && !state.devices.length ? <p className="settings-inline-note">{zh ? "尚未连接手机或平板。" : "No phones or tablets connected."}</p> : null}
    {error ? <p className="settings-inline-note" role="alert">{error}</p> : null}
    <a className="settings-support-link" target="_blank" rel="noreferrer" href="https://github.com/gaofeng21cn/opl-studio/blob/main/docs/opl-link.md">{zh ? "连接指南" : "Connection guide"}</a>
  </SettingsGroup>;
}
