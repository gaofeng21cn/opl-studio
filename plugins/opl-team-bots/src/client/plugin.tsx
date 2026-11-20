import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import type { Context } from "@deepseek-ai/cordis";
import { Button } from "../../../../vendor/deepseek-harness/packages/client/ui-primitives/src/index";
import type { TeamBotsState } from "@gaofeng21cn/opl-host-contracts";
import "./team-bots.css";

function appBridge() {
  const bridge = (globalThis as typeof globalThis & { window?: { oplStudio?: { executeTeamBot?: (request: { operation: "start" | "stop" }) => Promise<TeamBotsState> } } }).window?.oplStudio;
  if (!bridge?.executeTeamBot) throw new Error("Team collaboration bridge is unavailable");
  return bridge;
}

function chineseLocale() {
  return document.documentElement.lang.toLowerCase().startsWith("zh") || navigator.language.toLowerCase().startsWith("zh");
}

/** Only application launch lives here. All session interactions belong to DSH. */
export function TeamBotsPanel() {
  const [state, setState] = useState<TeamBotsState>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const local = location.protocol === "file:" || ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
  useEffect(() => {
    let active = true;
    setError("");
    void appBridge().executeTeamBot!({ operation: "start" }).then(value => {
      if (active) setState(value as TeamBotsState);
    }, reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [attempt]);
  const zh = chineseLocale();
  return <section className="opl-teams" data-testid="opl-teams">
    {error ? <div className="opl-teams-launch"><p role="alert">{error}</p><Button onClick={() => setAttempt(value => value + 1)}>{zh ? "重试" : "Retry"}</Button></div>
      : state?.url ? (local
        ? <iframe title="DeepSeek Harness collaboration" src={state.url} referrerPolicy="no-referrer" />
        : <div className="opl-teams-launch"><p>{zh ? "协作工作台监听 Studio 所在机器的回环地址。请在该机器打开，或通过 SSH 转发工作台端口。" : "The collaboration workbench listens on the Studio machine's loopback address. Open it there or forward its port over SSH."}</p><a href={state.url} target="_blank" rel="noreferrer">{zh ? "本机工作台地址" : "Local workbench address"}</a></div>)
      : <div className="opl-teams-launch" role="status">{zh ? "正在打开协作工作台…" : "Opening collaboration workbench…"}</div>}
  </section>;
}

export const teamBotsClientPlugin = {
  name: "opl-team-bots-client", inject: ["slots"],
  apply(ctx: Context) {
    const slots = ctx.get("slots") as any;
    slots.register({ name: "sidebar.panellist", id: "teams", order: 35, label: () => "Agent collaboration", registrant: "opl-team-bots" }, ({ size }: { size: number }) => <Users size={size} />);
    slots.register({ name: "main", key: "teams", registrant: "opl-team-bots" }, TeamBotsPanel);
  }
};
export default teamBotsClientPlugin;
