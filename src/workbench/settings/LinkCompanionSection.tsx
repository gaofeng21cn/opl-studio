import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, RefreshCw, X } from "lucide-react";
import type { LinkDeviceReadback, LinkPairing } from "../../bridge/oplBridge-types-platform-events";
import { SettingRow, SettingsGroup } from "./primitives";

export function LinkCompanionSection({ locale, onOpenAccount }: { locale: "zh" | "en"; onOpenAccount?: () => void }) {
  const zh = locale === "zh";
  const bridge = typeof window === "undefined" ? undefined : window.oplStudio?.linkCompanion;
  const [state, setState] = useState<LinkDeviceReadback | null>(null);
  const [pairing, setPairing] = useState<LinkPairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now());
  async function refresh() { if (bridge) setState(await bridge.readDevices()); }
  const connection = state?.internet?.status ?? "disabled";
  useEffect(() => {
    let alive = true;
    const read = () => bridge?.readDevices().then(value => { if (alive) setState(value); }).catch(() => { if (alive) setError(zh ? "连接状态读取失败，请刷新。" : "Could not read connection status. Refresh to try again."); });
    void read();
    const timer = window.setInterval(() => { void read(); }, 3000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [bridge, zh]);
  useEffect(() => { if (!pairing) return; const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, [pairing]);
  const expiresIn = pairing ? Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - clock) / 1000)) : 0;
  useEffect(() => { if (pairing && expiresIn === 0) setPairing(null); }, [pairing, expiresIn]);
  if (!bridge || state?.unavailable) return null;
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError("");
    try { await operation(); }
    catch { setError(zh ? "操作未完成。请查看连接状态后重试。" : "Could not complete the action. Check the connection status and try again."); await refresh().catch(() => {}); }
    finally { setBusy(false); }
  }
  const statusText = ({ disabled: zh ? "尚未开启" : "Not enabled", account_required: zh ? "请先登录 OPL 账号" : "Sign in to your OPL account", connecting: zh ? "正在连接" : "Connecting", reconnecting: zh ? "正在重新连接" : "Reconnecting", ready: zh ? "手机访问已就绪" : "Phone access is ready", error: zh ? "连接需要处理" : "Connection needs attention" })[connection];
  return <SettingsGroup title="OPL Link">
    <SettingRow label={zh ? "在 iPhone 或 iPad 上继续" : "Continue on iPhone or iPad"} detail={zh ? "继续此 App 的对话、处理请求、发送附件和查看结果。电脑需保持联网并运行 OPL App。" : "Continue this App’s conversations, answer requests, send attachments and review results. Keep this computer online with OPL App running."}>
      {connection === "disabled" || connection === "account_required" ? <button className="settings-action-button" type="button" disabled={busy} onClick={() => void run(async () => { await bridge!.enableInternet(); await refresh(); })}><Smartphone size={14} aria-hidden="true" />{zh ? "开启手机访问" : "Enable phone access"}</button> : <button className="settings-action-button" type="button" disabled={busy || connection !== "ready"} onClick={() => void run(async () => { const value = await bridge!.createPairing(); setClock(Date.now()); setPairing(value); })}><Smartphone size={14} aria-hidden="true" />{zh ? "生成连接码" : "Create pairing code"}</button>}
    </SettingRow>
    <SettingRow label={zh ? "连接状态" : "Connection status"}>
      <span role="status">{statusText}</span>
      {connection === "account_required" && onOpenAccount ? <button className="settings-inline-command" type="button" onClick={onOpenAccount}>{zh ? "打开 OPL 账号" : "Open OPL account"}</button> : null}
      {connection === "error" || connection === "reconnecting" ? <button className="settings-action-button" type="button" disabled={busy} onClick={() => void run(async () => { await bridge!.reconnectInternet(); await refresh(); })}><RefreshCw size={13} aria-hidden="true" />{zh ? "重新连接" : "Reconnect"}</button> : null}
    </SettingRow>
    {pairing && expiresIn > 0 ? <div className="opl-link-pairing" style={{ display: "grid", justifyItems: "start", gap: 12, padding: "12px 0 20px" }}>
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
