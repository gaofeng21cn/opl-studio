import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, RefreshCw, X } from "lucide-react";
import { Input } from "@deepseek-ai/dsh-client-ui-primitives";
import type { LinkDeviceReadback, LinkPairing } from "../../bridge/oplBridge-types-platform-events";
import { SettingRow, SettingsGroup } from "./primitives";

/** A first-party Host connection, separate from domain Package and service account grants. */
export function LinkCompanionSection({ locale }: { locale: "zh" | "en" }) {
  const zh = locale === "zh";
  const bridge = typeof window === "undefined" ? undefined : window.oplStudio?.linkCompanion;
  const [state, setState] = useState<LinkDeviceReadback | null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [pairing, setPairing] = useState<LinkPairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now());
  async function refresh() {
    if (!bridge) return;
    const value = await bridge.readDevices();
    setState(value); setEndpoint(current => current || value.endpoint || "");
  }
  useEffect(() => { let alive = true; if (bridge) void bridge.readDevices().then(value => { if (alive) { setState(value); setEndpoint(value.endpoint || ""); } }).catch(() => { if (alive) setError(zh ? "连接状态读取失败，请重试。" : "Could not read connections. Try again."); }); return () => { alive = false; }; }, [bridge, zh]);
  useEffect(() => { if (!pairing) return; const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, [pairing]);
  const expiresIn = pairing ? Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - clock) / 1000)) : 0;
  useEffect(() => { if (pairing && expiresIn === 0) setPairing(null); }, [pairing, expiresIn]);
  if (!bridge || state?.unavailable) return null;
  async function run(operation: () => Promise<void>) { setBusy(true); setError(""); try { await operation(); } catch { setError(zh ? "操作未完成，请检查连接地址后重试。" : "Could not complete the action. Check the connection address and try again."); } finally { setBusy(false); } }
  return <SettingsGroup title="OPL Link">
    <SettingRow label={zh ? "连接 iPhone 或 iPad" : "Connect iPhone or iPad"} detail={zh ? "在手机上继续此 App 的对话、处理请求和查看结果。" : "Continue this App’s conversations, answer requests and review results on your phone."}>
      <button className="settings-action-button" type="button" disabled={busy || !endpoint.trim()} onClick={() => void run(async () => { const value = await bridge!.createPairing({ endpoint: endpoint.trim() }); setClock(Date.now()); setPairing(value); })}><Smartphone size={14} aria-hidden="true" />{zh ? "生成连接码" : "Create pairing code"}</button>
    </SettingRow>
    <SettingRow label={zh ? "此 App 的 HTTPS 地址" : "This App’s HTTPS address"} detail={zh ? "使用能从手机访问此 App 的可信地址；详细配置见连接指南。" : "Use a trusted address that reaches this App from your phone. See the connection guide for setup."}>
      <Input className="opl-link-endpoint" type="url" value={endpoint} placeholder="https://" autoComplete="url" aria-label={zh ? "此 App 的 HTTPS 地址" : "This App’s HTTPS address"} onChange={event => { setEndpoint(event.target.value); setPairing(null); }} />
    </SettingRow>
    {pairing && expiresIn > 0 ? <div className="opl-link-pairing" style={{ display: "grid", justifyItems: "start", gap: 12, padding: "12px 0 20px" }}>
      <div style={{ background: "white", padding: 16, borderRadius: 12 }}><QRCodeSVG value={pairing.pairingURL} size={184} title={zh ? "用 OPL Link 扫描连接码" : "Scan in OPL Link"} /></div>
      <p className="settings-inline-note">{zh ? `在 OPL Link 中扫描，一次有效，${expiresIn} 秒后过期。` : `Scan in OPL Link. Single use; expires in ${expiresIn} seconds.`}</p>
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
