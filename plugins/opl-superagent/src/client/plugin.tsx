import { useEffect, useState } from "react";
import { Hammer } from "lucide-react";
import type { Context } from "@deepseek-ai/cordis";
import { Button } from "../../../../src/vendor/deepseek-harness/packages/client/ui-primitives/src/index";
import { useStudio } from "../../../../src/composition/dshSlotHost-parts/studioContext";
import type { SuperagentState } from "./types";
import "./superagent.css";

export function SuperagentPanel() {
  const studio = useStudio();
  const client = studio.superagent;
  const zh = studio.locale === "zh";
  const [state, setState] = useState<SuperagentState>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const local = location.protocol === "file:" || ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
  useEffect(() => {
    let active = true;
    const read = () => client.read().then(value => { if (active) { setState(value); setError(""); } }, reason => { if (active) setError(reason.message); });
    void read(); const timer = setInterval(read, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [client]);
  async function execute(operation: "start" | "stop") {
    setBusy(true); setError("");
    try { setState(await client.execute({ operation })); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="opl-superagent" data-testid="opl-superagent">
    <header><div><h1>Superagent</h1><p>{zh ? "按来源和授权策略接收请求，建立工单，并通过 Codex 执行与恢复。" : "Receive requests from Sources under a Policy, create Tickets, and execute or recover each in its own Session."}</p></div>
      <Button disabled={busy || !state} onClick={() => void execute(state?.state === "running" ? "stop" : "start")}>{busy ? (zh ? "处理中…" : "Working…") : state?.state === "running" ? (zh ? "停止" : "Stop") : (zh ? "启动工作台" : "Start workbench")}</Button></header>
    {error && <p role="alert">{error}</p>}
    {state?.error && <p role="alert">{state.error}</p>}
    {state?.state !== "running" && <p>{zh ? "使用 App 的 Codex 模型与登录状态。启动后配置仓库专用账号、来源、授权策略和执行目录；配置与工单会在停止后保留。" : "Uses the App’s Codex models and sign-in. Start the workbench to configure its repository account, Sources, Policy and execution directory. Settings and Tickets persist after stopping."}</p>}
    {state?.state === "running" && state.url && (local
      ? <iframe title="Superagent workbench" src={state.url} referrerPolicy="no-referrer" />
      : <p>{zh ? "工作台监听 Studio 所在机器的回环地址。请在该机器打开，或通过 SSH 转发工作台端口后访问。" : "The workbench listens on the Studio machine's loopback address. Open it there or forward its port over SSH."}<br /><a href={state.url} target="_blank" rel="noreferrer">{zh ? "本机工作台地址" : "Local workbench address"}</a></p>)}
  </section>;
}
export const superagentClientPlugin = {
  name: "opl-superagent-client", inject: ["slots"],
  apply(ctx: Context) {
    const slots = ctx.get("slots") as any;
    slots.register({ name: "sidebar.panellist", id: "superagent", order: 36, label: () => "Superagent", registrant: "opl-superagent" }, ({ size }: { size: number }) => <Hammer size={size} />);
    slots.register({ name: "main", key: "superagent", registrant: "opl-superagent" }, SuperagentPanel);
  }
};
