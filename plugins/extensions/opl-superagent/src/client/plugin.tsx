import { useEffect, useState } from "react";
import { Hammer } from "lucide-react";
import type { Context } from "@deepseek-ai/cordis";
import {
  Button,
  PluginErrorBoundary,
  SettingRow,
  SettingsGroup,
  StatusPill,
  registerOplSettingsGroup,
  useOplLocale,
  type OplSettingsGroupOwner
} from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import type { SuperagentState } from "@gaofeng21cn/opl-host-contracts";
import "./superagent.css";

function appBridge() {
  const bridge = (globalThis as typeof globalThis & { window?: { oplStudio?: { readSuperagent?: () => Promise<SuperagentState>; executeSuperagent?: (request: { operation: "start" | "stop" }) => Promise<SuperagentState> } } }).window?.oplStudio;
  if (!bridge?.readSuperagent || !bridge.executeSuperagent) throw new Error("Superagent bridge is unavailable");
  return bridge;
}

export function SuperagentPanel() {
  const locale = useOplLocale();
  const zh = locale === "zh";
  const [state, setState] = useState<SuperagentState>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const local = location.protocol === "file:" || ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
  useEffect(() => {
    let active = true;
    const read = () => appBridge().readSuperagent!().then(value => { if (active) { setState(value); setError(""); } }, reason => { if (active) setError(reason.message); });
    void read(); const timer = setInterval(read, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function execute(operation: "start" | "stop") {
    setBusy(true); setError("");
    try { setState(await appBridge().executeSuperagent!({ operation })); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <PluginErrorBoundary pluginId="@gaofeng21cn/opl-superagent" pluginLabel={zh ? "Superagent 工单台" : "Superagent"} locale={locale}>
      <section className="opl-superagent" data-testid="opl-superagent">
        <header><div><h1>{zh ? "Superagent 工单台" : "Superagent Tickets"}</h1><p>{zh ? "面向外部 GitHub / 飞书来单的无人值守工单台：按来源与授权策略建立工单并通过 Codex 执行与恢复；个人跨工具长期任务请使用「OPL Flow 总控」，单会话组队请使用「智能体协作」。" : "Unattended ticket desk for external GitHub/Feishu intake via Codex. Use OPL Flow for personal cross-carrier goals and Agent collaboration for in-thread teams."}</p></div>
          <Button disabled={busy || !state} onClick={() => void execute(state?.state === "running" ? "stop" : "start")}>{busy ? (zh ? "处理中…" : "Working…") : state?.state === "running" ? (zh ? "停止" : "Stop") : (zh ? "启动工作台" : "Start workbench")}</Button></header>
        {error && <p role="alert">{error}</p>}
        {state?.error && <p role="alert">{state.error}</p>}
        {state?.state !== "running" && <p>{zh ? "使用 App 的 Codex 模型与登录状态。启动后配置仓库专用账号、来源、授权策略和执行目录；配置与工单会在停止后保留。" : "Uses the App’s Codex models and sign-in. Start the workbench to configure its repository account, Sources, Policy and execution directory. Settings and Tickets persist after stopping."}</p>}
        {state?.state === "running" && state.url && (local
          ? <div className="opl-superagent-launch"><p>{zh ? "DSH 工作台需要在顶层页面完成一次登录交换，完成后即可使用同一工作台。" : "The DSH workbench completes its sign-in exchange in a top-level page before use."}</p><a href={state.url} target="_blank" rel="noopener noreferrer">{zh ? "打开工作台" : "Open workbench"}</a></div>
          : <p>{zh ? "工作台监听 Studio 所在机器的回环地址。请在该机器打开，或通过 SSH 转发工作台端口后访问。" : "The workbench listens on the Studio machine's loopback address. Open it there or forward its port over SSH."}<br /><a href={state.url} target="_blank" rel="noreferrer">{zh ? "本机工作台地址" : "Local workbench address"}</a></p>)}
      </section>
    </PluginErrorBoundary>
  );
}

export function SuperagentSettingsCard({ locale }: OplSettingsGroupOwner) {
  const zh = useOplLocale(locale) === "zh";
  const [state, setState] = useState<SuperagentState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const read = (globalThis as typeof globalThis & { window?: { oplStudio?: { readSuperagent?: () => Promise<SuperagentState> } } }).window?.oplStudio?.readSuperagent;
    if (!read) return;
    void read().then(value => { if (active) setState(value); }, () => {});
    return () => { active = false; };
  }, []);
  async function execute(operation: "start" | "stop") {
    setBusy(true);
    setError("");
    try {
      setState(await appBridge().executeSuperagent!({ operation }));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const running = state?.state === "running";
  return (
    <SettingsGroup
      packageId="@gaofeng21cn/opl-superagent"
      title={zh ? "Superagent 工单工作台" : "Superagent ticket workbench"}
      description={zh ? "复⽤ App Codex 模型与登录状态管理工单来源与策略；配置与工单在停止后保留。" : "Run ticket intake and policy-guarded execution using the App Codex session."}
    >
      <SettingRow label={zh ? "运行状态" : "Service state"}>
        <span className="runtime-setting-control">
          <StatusPill
            state={state?.error || error ? "error" : running ? "done" : "idle"}
            label={running ? (zh ? "运行中" : "Running") : (zh ? "未运行" : "Stopped")}
          />
          <Button type="button" size="sm" variant="outline" disabled={busy || !state} onClick={() => void execute(running ? "stop" : "start")}>
            {busy ? (zh ? "处理中…" : "Working…") : running ? (zh ? "停止" : "Stop") : (zh ? "启动工作台" : "Start workbench")}
          </Button>
        </span>
      </SettingRow>
      {error ? <p className="settings-inline-note" role="alert">{error}</p> : null}
    </SettingsGroup>
  );
}

export const superagentClientPlugin = {
  name: "opl-superagent-client", inject: ["slots"],
  apply(ctx: Context) {
    const slots = ctx.get("slots") as any;
    slots.register(
      {
        name: "sidebar.panellist",
        id: "superagent",
        order: 36,
        label: (locale: string) => (locale === "zh" ? "Superagent 工单台" : "Superagent"),
        labelI18n: { zh: "Superagent 工单台", en: "Superagent" },
        registrant: "opl-superagent"
      },
      ({ size }: { size: number }) => <Hammer size={size} />
    );
    slots.register({ name: "main", key: "superagent", registrant: "opl-superagent" }, SuperagentPanel);
    registerOplSettingsGroup(
      slots,
      {
        id: "opl-superagent-settings",
        destination: "capabilities",
        packageId: "@gaofeng21cn/opl-superagent",
        order: 40,
        registrant: "opl-superagent",
        titleI18n: { zh: "Superagent 工单工作台", en: "Superagent ticket workbench" },
        searchKeywords: "superagent tickets 工单 自动执行"
      },
      SuperagentSettingsCard
    );
  }
};
export default superagentClientPlugin;
