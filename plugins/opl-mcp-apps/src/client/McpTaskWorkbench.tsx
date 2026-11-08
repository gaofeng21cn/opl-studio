import { useEffect, useRef, useState } from "react";
import type { McpAppSession } from "../../../../src/bridge/mcpApps";
import { McpAppFrame, type McpAppProps } from "./McpAppWorkspace";

export type TaskWorkbenchProps = McpAppProps & { itemId: string; viewId?: string };
export function McpTaskWorkbench(props: TaskWorkbenchProps) {
  const { bridge, threadId, itemId, viewId, revision, locale } = props;
  const [session, setSession] = useState<McpAppSession | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const currentLocale = useRef(locale);
  currentLocale.current = locale;
  useEffect(() => {
    let active = true;
    let opened: McpAppSession | undefined;
    setSession(null); setError("");
    if (!threadId) return;
    void (async () => {
      const { apps } = await bridge.listMcpApps({ threadId });
      if (!active) return;
      const matches = apps.filter(app => app.tool === "open_opl_apps" && app.resourceUri === "ui://opl/apps.html" && app.readOnly);
      if (matches.length !== 1) throw new Error(currentLocale.current === "zh" ? "任务工作台连接不可用，请检查 OPL Apps 连接。" : "The task workbench connection is unavailable. Check OPL Apps.");
      const result = await bridge.openMcpApp({ threadId, server: matches[0].server, tool: matches[0].tool,
        arguments: { package_id: "opl-runtime", view_id: "opl.runtime.item", input: { item_id: itemId, ...(viewId ? { domain_view_id: viewId } : {}) } } });
      if (!active) { await bridge.closeMcpApp(result); return; }
      opened = result; setSession(result);
    })().catch(reason => { if (active) setError(String(reason.message || reason)); });
    return () => { active = false; if (opened) void bridge.closeMcpApp(opened).catch(() => {}); };
  }, [bridge, threadId, itemId, viewId, revision, retry]);
  if (!threadId) return <p role="status">{locale === "zh" ? "先打开一个对话，任务工作台将使用该对话的连接和权限。" : "Open a conversation to use its connections and permissions."}</p>;
  if (error) return <div role="alert"><p>{error}</p><button onClick={() => setRetry(n => n + 1)}>{locale === "zh" ? "重试" : "Retry"}</button></div>;
  return session ? <McpAppFrame key={session.id} {...props} session={session}/> : <p role="status">{locale === "zh" ? "正在打开任务工作台…" : "Opening task workbench…"}</p>;
}
