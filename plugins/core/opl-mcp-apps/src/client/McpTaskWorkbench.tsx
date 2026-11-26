import { useEffect, useRef, useState } from "react";
import type { McpAppSession, McpAppProps } from "@gaofeng21cn/opl-host-contracts";
import { Button, PluginErrorBoundary } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { extractMcpAuthorizationRequired, type McpAuthorizationRequired } from "./mcpAppHost";
import { McpAppFrame } from "./McpAppWorkspace";

export type TaskWorkbenchProps = McpAppProps & { itemId: string; viewId?: string };
export function McpTaskWorkbench(props: TaskWorkbenchProps) {
  const { bridge, threadId, itemId, viewId, revision, locale } = props;
  const [session, setSession] = useState<McpAppSession | null>(null);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState<McpAuthorizationRequired | null>(null);
  const [retry, setRetry] = useState(0);
  const currentLocale = useRef(locale);
  currentLocale.current = locale;
  useEffect(() => {
    let active = true;
    let opened: McpAppSession | undefined;
    setSession(null); setError(""); setAuthRequired(null);
    if (!threadId) return;
    void (async () => {
      const { apps } = await bridge.listMcpApps({ threadId });
      if (!active) return;
      const matches = apps.filter(app => app.resourceUri === "ui://opl/apps.html" && app.readOnly);
      if (matches.length !== 1) throw new Error(currentLocale.current === "zh" ? "任务工作台连接不可用，请检查 OPL Apps 连接。" : "The task workbench connection is unavailable. Check OPL Apps.");
      const result = await bridge.openMcpApp({ threadId, miniAppId: matches[0].miniAppId, server: matches[0].server, tool: matches[0].launchTool ?? matches[0].tool,
        arguments: { package_id: "opl-runtime", view_id: "opl.runtime.item", input: { item_id: itemId, ...(viewId ? { domain_view_id: viewId } : {}) } } });
      if (!active) { await bridge.closeMcpApp(result); return; }
      opened = result; setSession(result);
    })().catch(reason => {
      if (!active) return;
      setError(String(reason.message || reason));
      const auth = extractMcpAuthorizationRequired(reason);
      if (auth) setAuthRequired(auth);
    });
    return () => { active = false; if (opened) void bridge.closeMcpApp(opened).catch(() => {}); };
  }, [bridge, threadId, itemId, viewId, revision, retry]);
  if (!threadId) return <p role="status">{locale === "zh" ? "先打开一个对话，任务工作台将使用该对话的连接和权限。" : "Open a conversation to use its connections and permissions."}</p>;
  if (authRequired) {
    return (
      <section className="opl-mcp-auth-banner" data-testid="opl-mcp-auth-required" role="alert">
        <p>{locale === "zh" ? "任务工作台需要资料库或连接授权才能继续。" : "The task workbench requires library or connection authorization to continue."}</p>
        <div className="opl-mcp-auth-actions">
          {props.onOpenResourceSettings ? (
            <Button
              variant="primary"
              type="button"
              onClick={() => props.onOpenResourceSettings?.({
                section: "libraries",
                ...(authRequired.packageId ? { packageId: authRequired.packageId } : {}),
                ...(authRequired.resourceId ? { resourceId: authRequired.resourceId } : {})
              })}
            >
              {locale === "zh" ? "前往资料与连接授权" : "Authorize in Libraries & Connections"}
            </Button>
          ) : null}
          <Button variant="outline" type="button" onClick={() => setRetry(n => n + 1)}>{locale === "zh" ? "重试" : "Retry"}</Button>
        </div>
      </section>
    );
  }
  if (error) return <div className="opl-mcp-app-error">
    <p role="alert">{locale === "zh" ? "任务工作台暂时无法连接，请重试。" : "The task workbench could not connect. Try again."}</p>
    <Button variant="outline" type="button" onClick={() => setRetry(n => n + 1)}>{locale === "zh" ? "重试" : "Retry"}</Button>
    <details><summary>{locale === "zh" ? "错误详情" : "Error details"}</summary><p>{error}</p></details>
  </div>;
  return session ? (
    <PluginErrorBoundary
      pluginId={session.server}
      pluginLabel={session.title}
      locale={locale}
      onOpenSoftwareCenter={props.onManage}
      resetKey={session.id}
    >
      <McpAppFrame
        key={session.id}
        {...props}
        session={session}
        fillHeight
        onAuthorizationRequired={auth => setAuthRequired(auth)}
      />
    </PluginErrorBoundary>
  ) : <p role="status">{locale === "zh" ? "正在打开任务工作台…" : "Opening task workbench…"}</p>;
}
