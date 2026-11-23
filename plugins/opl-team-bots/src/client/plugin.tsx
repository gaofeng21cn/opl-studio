import { useEffect, useState } from "react";
import { Users } from "lucide-react";
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
import type { TeamBotsState } from "@gaofeng21cn/opl-host-contracts";
import "./team-bots.css";

function appBridge() {
  const bridge = (globalThis as typeof globalThis & { window?: { oplStudio?: { readTeamBots?: () => Promise<TeamBotsState>; executeTeamBot?: (request: { operation: "start" | "stop" }) => Promise<TeamBotsState> } } }).window?.oplStudio;
  if (!bridge?.executeTeamBot) throw new Error("Team collaboration bridge is unavailable");
  return bridge;
}

/** Only application launch lives here. All session interactions belong to DSH. */
export function TeamBotsPanel() {
  const locale = useOplLocale();
  const zh = locale === "zh";
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
  return (
    <PluginErrorBoundary pluginId="@gaofeng21cn/opl-team-bots" pluginLabel={zh ? "智能体协作工作台" : "Agent collaboration"} locale={locale}>
      <section className="opl-teams" data-testid="opl-teams">
        {error ? <div className="opl-teams-launch"><p role="alert">{error}</p><Button onClick={() => setAttempt(value => value + 1)}>{zh ? "重试" : "Retry"}</Button></div>
          : state?.url ? (local
            ? <iframe title="DeepSeek Harness collaboration" src={state.url} referrerPolicy="no-referrer" />
            : <div className="opl-teams-launch"><p>{zh ? "协作工作台监听 Studio 所在机器的回环地址。请在该机器打开，或通过 SSH 转发工作台端口。" : "The collaboration workbench listens on the Studio machine's loopback address. Open it there or forward its port over SSH."}</p><a href={state.url} target="_blank" rel="noreferrer">{zh ? "本机工作台地址" : "Local workbench address"}</a></div>)
          : <div className="opl-teams-launch" role="status">{zh ? "正在打开协作工作台…" : "Opening collaboration workbench…"}</div>}
      </section>
    </PluginErrorBoundary>
  );
}

export function TeamBotsSettingsCard({ locale }: OplSettingsGroupOwner) {
  const zh = useOplLocale(locale) === "zh";
  const [state, setState] = useState<TeamBotsState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const read = (globalThis as typeof globalThis & { window?: { oplStudio?: { readTeamBots?: () => Promise<TeamBotsState> } } }).window?.oplStudio?.readTeamBots;
    if (!read) return;
    void read().then(value => { if (active) setState(value); }, () => {});
    return () => { active = false; };
  }, []);
  async function run(operation: "start" | "stop") {
    setBusy(true);
    setError("");
    try {
      setState((await appBridge().executeTeamBot!({ operation })) as TeamBotsState);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const running = state?.state === "running";
  return (
    <SettingsGroup
      packageId="@gaofeng21cn/opl-team-bots"
      title={zh ? "智能体协作工作台" : "Agent collaboration workbench"}
      description={zh ? "管理本机多智能体协作工作台进程；启用后可从左侧栏直接打开协作会话。" : "Manage the local multi-agent collaboration workbench runtime accessible from the sidebar."}
    >
      <SettingRow label={zh ? "运行状态" : "Service state"}>
        <span className="runtime-setting-control">
          <StatusPill
            state={state?.error || error ? "error" : running ? "done" : "idle"}
            label={running ? (zh ? "运行中" : "Running") : (zh ? "未运行" : "Stopped")}
          />
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(running ? "stop" : "start")}>
            {busy ? (zh ? "处理中…" : "Working…") : running ? (zh ? "停止" : "Stop") : (zh ? "启动" : "Start")}
          </Button>
        </span>
      </SettingRow>
      {error ? <p className="settings-inline-note" role="alert">{error}</p> : null}
    </SettingsGroup>
  );
}

export const teamBotsClientPlugin = {
  name: "opl-team-bots-client", inject: ["slots"],
  apply(ctx: Context) {
    const slots = ctx.get("slots") as any;
    slots.register({ name: "sidebar.panellist", id: "teams", order: 35, label: () => "Agent collaboration", registrant: "opl-team-bots" }, ({ size }: { size: number }) => <Users size={size} />);
    slots.register({ name: "main", key: "teams", registrant: "opl-team-bots" }, TeamBotsPanel);
    registerOplSettingsGroup(
      slots,
      {
        id: "opl-team-bots-settings",
        destination: "capabilities",
        packageId: "@gaofeng21cn/opl-team-bots",
        order: 30,
        registrant: "opl-team-bots",
        titleI18n: { zh: "智能体协作工作台", en: "Agent collaboration workbench" },
        searchKeywords: "team bots collaboration 协作 工作台"
      },
      TeamBotsSettingsCard
    );
  }
};
export default teamBotsClientPlugin;
