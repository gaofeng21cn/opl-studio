import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import type { Context } from "@deepseek-ai/cordis";
import { Button, Input } from "../../../../src/vendor/deepseek-harness/packages/client/ui-primitives/src/index";
import { useStudio } from "../../../../src/composition/dshSlotHost-parts/studioContext";
import type { TeamBotsState } from "./types";
import "./team-bots.css";

export function TeamBotsPanel() {
  const studio = useStudio();
  const client = studio.teamBots;
  const zh = studio.locale === "zh";
  const [state, setState] = useState<TeamBotsState>({ revision: 0, bots: [], teams: [] });
  const [teamId, setTeamId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [botId, setBotId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [cwd, setCwd] = useState(studio.workspacePath);
  const [model, setModel] = useState("");
  const [permissions, setPermissions] = useState(":workspace");
  const [skills, setSkills] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = transcript.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [teamId, memberId, state.messages?.at(-1)?.seq]);
  const refresh = () => client.read({ teamId: teamId || undefined, memberId: memberId || undefined }).then(setState);
  useEffect(() => {
    let active = true;
    const read = () => client.read({ teamId: teamId || undefined, memberId: memberId || undefined })
      .then(value => { if (active) { setState(value); setError(""); } }, reason => { if (active) setError(String(reason.message ?? reason)); });
    void read();
    const timer = teamId ? setInterval(read, 2000) : undefined;
    return () => { active = false; clearInterval(timer); };
  }, [client, teamId, memberId]);
  async function execute(operation: Parameters<typeof client.execute>[0]["operation"], input: Record<string, unknown>) {
    setBusy(true); setError("");
    try { const result = await client.execute({ operation, input }) as { id?: string }; await refresh(); return result; }
    catch (reason) { setError(String((reason as Error).message)); return null; }
    finally { setBusy(false); }
  }
  return <section className="opl-team-bots" data-testid="opl-team-bots">
    <header><h1>{zh ? "团队与 Bot" : "Teams and Bots"}</h1><p>{zh ? "保存角色，为每个团队创建独立成员；在同一上下文中持续协作。" : "Save roles and create independent teammates with continuing conversations."}</p></header>
    {error && <p role="alert">{error}</p>}
    <div className="opl-team-columns">
      <aside>
        <h2>{zh ? "Bot 配置" : "Bot templates"}</h2>
        <label>{zh ? "选择 Bot" : "Choose Bot"}<select value={botId} onChange={event => {
          const id = event.target.value; setBotId(id); const bot = state.bots.find(item => item.id === id);
          setName(bot?.name ?? ""); setRole(bot?.role ?? ""); setCwd(bot?.cwd ?? studio.workspacePath);
          setModel(bot?.model === "default" ? "" : bot?.model ?? ""); setPermissions(bot?.permissions ?? ":workspace"); setSkills(bot?.skills.join(", ") ?? "");
        }}><option value="">{zh ? "新建 Bot" : "New Bot"}</option>{state.bots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>
        <label>{zh ? "名称（小写英文）" : "Name"}<Input value={name} onChange={event => setName(event.target.value)} placeholder="reviewer" /></label>
        <label>{zh ? "角色与职责" : "Role"}<textarea value={role} onChange={event => setRole(event.target.value)} rows={3} /></label>
        <label>{zh ? "工作目录" : "Workspace"}<Input value={cwd} onChange={event => setCwd(event.target.value)} /></label>
        <label>{zh ? "模型（留空使用 Codex 默认值）" : "Model (empty uses Codex default)"}<Input value={model} onChange={event => setModel(event.target.value)} /></label>
        <label>{zh ? "权限" : "Permissions"}<select value={permissions} onChange={event => setPermissions(event.target.value)}><option value=":read-only">{zh ? "只读" : "Read only"}</option><option value=":workspace">{zh ? "工作区与审批" : "Workspace with approvals"}</option><option value=":danger-full-access">{zh ? "完全访问" : "Full access"}</option></select></label>
        <label>Skills<Input value={skills} onChange={event => setSkills(event.target.value)} placeholder={zh ? "用逗号分隔已安装 Skill 名称" : "Installed Skill names, separated by commas"} /></label>
        <div className="opl-team-actions"><Button disabled={busy || !name || !cwd} onClick={() => void execute("save_bot", { ...(botId ? { id: botId } : {}), name, role, cwd, model, permissions, skills: skills.split(",").map(item => item.trim()).filter(Boolean) }).then(result => { if (result?.id) setBotId(result.id); })}>{zh ? "保存 Bot" : "Save Bot"}</Button>
          {botId && <Button disabled={busy} onClick={() => void execute("delete_bot", { id: botId }).then(result => { if (result) setBotId(""); })}>{zh ? "删除配置" : "Delete template"}</Button>}</div>
        <h2>{zh ? "团队" : "Teams"}</h2>
        <label>{zh ? "当前团队" : "Current Team"}<select value={teamId} onChange={event => { setTeamId(event.target.value); setMemberId(""); }}><option value="">{zh ? "选择团队" : "Choose Team"}</option>{state.teams.map(team => <option key={team.id} value={team.id}>{team.title}</option>)}</select></label>
        <Button disabled={busy || !botId} onClick={() => void execute("create_team", { botId, title: name }).then(result => { if (result?.id) { setTeamId(result.id); setMemberId(""); } })}>{zh ? "用所选 Bot 创建团队" : "Create Team with selected Bot"}</Button>
        <Button disabled={busy || !teamId || !botId} onClick={() => void execute("add_member", { teamId, botId })}>{zh ? "将所选 Bot 加入团队" : "Add selected Bot to Team"}</Button>
      </aside>
      <main>
        {!teamId ? <p>{zh ? "先保存 Bot 配置，再创建团队或选择已有团队。" : "Save a Bot, then create or choose a Team."}</p> : <>
          <label>{zh ? "对话成员" : "Conversation"}<select value={memberId} onChange={event => setMemberId(event.target.value)}><option value="">{zh ? "协调者" : "Lead"}</option>{state.members?.map(member => <option key={member.id} value={member.id}>{member.path ?? member.id} · {member.activity}</option>)}</select></label>
          <div ref={transcript} className="opl-team-transcript" aria-live="polite">{state.messages?.map(event => {
            const message = event.data.message ?? event.data;
            if (["runtime-context", "working-directory"].includes(message.source?.kind)) return null;
            const content = (message.content ?? []).filter((block: { type: string }) => block.type === "text").map((block: { text: string }) => block.text).join("\n");
            return <article key={event.seq}><strong>{event.type === "assistant/message" ? (zh ? "成员" : "Agent") : (zh ? "消息" : "Message")}</strong><p>{content}</p></article>;
          })}</div>
          {state.execution?.threadId && <Button onClick={() => studio.openThread(state.execution!.threadId!)}>{zh ? "查看执行会话" : "Inspect execution thread"}</Button>}
          {state.execution?.status === "dispatching" && <p role="status">{zh ? "上次执行结果待核对，请先检查关联的 Codex 会话。" : "Previous dispatch needs inspection of its linked Codex thread."}</p>}
          <label>{zh ? "发送任务或继续讨论" : "Send a task or follow up"}<textarea value={text} onChange={event => setText(event.target.value)} rows={3} /></label>
          <div className="opl-team-actions"><Button disabled={busy || !text.trim()} onClick={() => void execute("send_message", { teamId, memberId: memberId || undefined, text }).then(result => { if (result) setText(""); })}>{zh ? "发送" : "Send"}</Button><Button disabled={busy} onClick={() => void execute("cancel_member", { teamId, memberId: memberId || teamId })}>{zh ? "停止当前执行" : "Stop current work"}</Button></div>
          <h2>{zh ? "共享任务" : "Shared tasks"}</h2>
          {!state.tasks?.length && <p>{zh ? "可以让协调者创建任务、安排成员并跟进结果。" : "Ask the lead to create tasks and coordinate teammates."}</p>}
          {state.tasks?.map(task => <article className="opl-team-task" key={task.id}><strong>{task.subject}</strong><span>{task.status} · {task.ownerName ?? (zh ? "未认领" : "Unassigned")}</span><p>{task.description}</p></article>)}
        </>}
      </main>
    </div>
  </section>;
}

export const teamBotsClientPlugin = {
  name: "opl-team-bots-client", inject: ["slots"],
  apply(ctx: Context) {
    const slots = ctx.get("slots") as any;
    slots.register({ name: "sidebar.panellist", id: "teams", order: 35, label: () => "Teams and Bots", registrant: "opl-team-bots" }, ({ size }: { size: number }) => <Users size={size} />);
    slots.register({ name: "main", key: "teams", registrant: "opl-team-bots" }, TeamBotsPanel);
  }
};
