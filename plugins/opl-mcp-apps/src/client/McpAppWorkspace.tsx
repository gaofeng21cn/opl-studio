import { useEffect, useRef, useState } from "react";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { McpAppDescriptor, McpAppSession, McpAppsBridge, McpAppOpen } from "../../../../src/bridge/mcpApps";
import type { OplBridge } from "../../../../src/bridge/oplBridge";
import { EcosystemFilePreview } from "../../../../src/integrations/deepseek-harness/EcosystemFilePreview";
import { allowedMcpLink, modelContextText, resolvedMcpTheme, sandboxDocument, workspaceArtifactLink, workspaceArtifactPath, type WorkspaceArtifact } from "./mcpAppHost";

export type McpAppProps = {
  bridge: McpAppsBridge & Partial<Pick<OplBridge, "readThread" | "listThreadWorkspace" | "readThreadWorkspaceBytes" | "accessThreadWorkspace" | "platformCapabilities">>; launch?: McpAppOpen; threadId?: string; locale: "zh" | "en"; revision?: number;
  onManage?: () => void;
  onContext(threadId: string, context: string): void;
  onMessage(threadId: string, text: string): void;
};

function descriptorId(app: McpAppDescriptor): string {
  return app.miniAppId || `mcp:${app.server}:${app.resourceUri}`;
}

function launchTool(app: McpAppDescriptor): string {
  return app.launchTool || app.tool;
}

function initialInputs(app: McpAppDescriptor | undefined): Record<string, string> {
  if (!app) return {};
  return Object.fromEntries(Object.entries(app.inputSchema.properties ?? {})
    .filter(([, field]) => field.default !== undefined)
    .map(([name, field]) => [name, typeof field.default === "string" ? field.default : JSON.stringify(field.default)]));
}

function missingRequiredInput(app: McpAppDescriptor | undefined, inputs: Record<string, string>): boolean {
  return Boolean(app?.inputSchema.required?.some(name => !String(inputs[name] ?? "").trim()));
}

function readinessLabel(app: McpAppDescriptor, zh: boolean): string {
  if (app.readiness === "replay_only") return zh ? "仅可从会话结果打开" : "Open from a conversation result";
  if (app.readiness === "input_required") return zh ? "需要输入" : "Input required";
  return zh ? "可启动" : "Ready to start";
}

export function McpAppFrame({ session, bridge: host, locale, onContext, onMessage }: McpAppProps & { session: McpAppSession }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const activeBridge = useRef<AppBridge | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(580);
  const [expanded, setExpanded] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<WorkspaceArtifact | null>(null);
  const handlers = useRef({ onContext, onMessage, locale });
  handlers.current = { onContext, onMessage, locale };
  useEffect(() => { activeBridge.current?.setHostContext({ displayMode: expanded ? "fullscreen" : "inline" }); }, [expanded]);
  useEffect(() => { activeBridge.current?.setHostContext({ locale: locale === "zh" ? "zh-CN" : "en" }); }, [locale]);
  useEffect(() => {
    const iframe = frame.current!;
    let disposed = false;
    const requireActive = () => { if (disposed) throw new Error("MCP App is closed"); };
    const binding = { id: session.id, threadId: session.threadId };
    const initializationTimeout = setTimeout(() => setError(handlers.current.locale === "zh" ? "应用未完成初始化，可关闭后重新打开或使用模块工作台。" : "App initialization timed out; close and reopen it or use the module workbench."), 20_000);
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const theme = () => resolvedMcpTheme(getComputedStyle(document.documentElement).colorScheme, dark.matches);
    const appBridge = new AppBridge(null, { name: "OPL App", version: "1.0.0" }, {
      serverTools: {}, serverResources: {}, openLinks: {}, updateModelContext: { text: {} }, message: { text: {} }
    }, { hostContext: { theme: theme(), locale: handlers.current.locale === "zh" ? "zh-CN" : "en", displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"], containerDimensions: { width: iframe.clientWidth, maxHeight: 1400 } } });
    activeBridge.current = appBridge;
    appBridge.oncalltool = async params => {
      requireActive();
      return host.callMcpAppTool({ ...binding, name: params.name, arguments: params.arguments });
    };
    appBridge.onreadresource = params => { requireActive(); return host.readMcpAppResource({ ...binding, uri: params.uri }); };
    appBridge.onlistresources = async () => ({ resources: session.resources });
    appBridge.onlistresourcetemplates = async () => ({ resourceTemplates: [] });
    appBridge.onupdatemodelcontext = async params => { requireActive(); handlers.current.onContext(session.threadId, modelContextText(session.server, params)); return {}; };
    appBridge.onmessage = async params => {
      requireActive();
      const text = params.content.filter(block => block.type === "text").map(block => block.text).join("\n");
      if (!text || text.length > 16_384) return { isError: true };
      handlers.current.onMessage(session.threadId, text);
      return {};
    };
    appBridge.onopenlink = async ({ url }) => {
      requireActive();
      const local = workspaceArtifactLink(url);
      if (local) {
        if (!host.readThread || !host.readThreadWorkspaceBytes || !host.accessThreadWorkspace || !host.listThreadWorkspace) return { isError: true };
        try {
          const thread = await host.readThread({ threadId: session.threadId });
          requireActive();
          setArtifact({ ...local, path: workspaceArtifactPath(local.path, thread.workspace) });
          setError("");
          return {};
        } catch (reason) { requireActive(); setError(String(reason)); return { isError: true }; }
      }
      const safe = allowedMcpLink(url);
      if (!safe) return { isError: true };
      setLink(safe); return {};
    };
    appBridge.onrequestdisplaymode = async ({ mode }) => { requireActive(); const expanded = mode === "fullscreen"; setExpanded(expanded); return { mode: expanded ? "fullscreen" : "inline" }; };
    appBridge.addEventListener("sizechange", ({ height }) => { if (height && Number.isFinite(height)) setHeight(Math.max(240, Math.min(1400, height))); });
    appBridge.addEventListener("initialized", () => {
      if (disposed) return;
      clearTimeout(initializationTimeout); setReady(true);
      void appBridge.sendToolInput({ arguments: session.arguments }).catch(() => {});
      void appBridge.sendToolResult(session.result).catch(() => {});
    });
    const updateTheme = () => appBridge.setHostContext({ theme: theme() });
    dark.addEventListener("change", updateTheme);
    const themeObserver = new MutationObserver(updateTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-ds-theme-source"] });
    const resize = new ResizeObserver(() => appBridge.setHostContext({ containerDimensions: { width: iframe.clientWidth, maxHeight: 1400 } }));
    resize.observe(iframe);
    void appBridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!)).then(() => {
      if (!disposed) iframe.srcdoc = sandboxDocument(session.resource);
    }).catch(reason => { if (!disposed) setError(String(reason)); });
    return () => {
      disposed = true; activeBridge.current = null; clearTimeout(initializationTimeout); resize.disconnect(); themeObserver.disconnect(); dark.removeEventListener("change", updateTheme);
      void appBridge.teardownResource({}, { timeout: 1000 }).catch(() => {}).finally(() => appBridge.close());
    };
  }, [session.id, host]);
  return <div className={expanded ? "opl-mcp-app-expanded" : "opl-mcp-app-frame"}>
    {!ready && !error ? <p role="status">{locale === "zh" ? "正在加载工作台…" : "Loading workbench…"}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {artifact && host.readThreadWorkspaceBytes && host.accessThreadWorkspace && host.listThreadWorkspace ? <EcosystemFilePreview
      threadId={session.threadId} relativePath={artifact.path} locale={locale}
      startSeconds={artifact.startSeconds} endSeconds={artifact.endSeconds}
      nativeFileAccess={host.platformCapabilities?.nativeWorkspaceFileAccess === true}
      readBytes={(request) => host.readThreadWorkspaceBytes!({ ...request, threadId: session.threadId })}
      listWorkspace={(request) => host.listThreadWorkspace!({ ...request, threadId: session.threadId })}
      accessWorkspace={(request) => host.accessThreadWorkspace!({ ...request, threadId: session.threadId })}
      onClose={() => setArtifact(null)} /> : null}
    {link ? <p><a href={link} target="_blank" rel="noopener noreferrer">{locale === "zh" ? "打开外部链接" : "Open external link"}</a></p> : null}
    {expanded ? <button onClick={() => setExpanded(false)}>{locale === "zh" ? "退出展开" : "Exit expanded view"}</button> : null}
    <iframe ref={frame} title={session.title} sandbox="allow-scripts allow-downloads" referrerPolicy="no-referrer" style={{ display: artifact ? "none" : undefined, width: "100%", height: expanded ? "80vh" : height, border: 0, background: "transparent" }}/>
  </div>;
}

export function McpAppWorkspace(props: McpAppProps) {
  const { bridge, threadId, locale, revision } = props;
  const [apps, setApps] = useState<McpAppDescriptor[]>([]);
  const [loading, setLoading] = useState(Boolean(threadId));
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [catalogError, setCatalogError] = useState("");
  const [selected, setSelected] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [session, setSession] = useState<McpAppSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const active = useRef<{ view: McpAppSession; owner: McpAppsBridge } | null>(null);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const zh = locale === "zh";

  async function release() {
    const previous = active.current;
    if (!previous) return;
    try { await previous.owner.closeMcpApp(previous.view); }
    catch (reason) {
      // A connection reset may already have revoked the ephemeral binding.
      if (!/mcp_app_closed|already closed|closed or belongs/i.test(String(reason))) throw reason;
    }
    if (active.current === previous) active.current = null;
  }
  function transition(request?: McpAppOpen) {
    const ticket = ++generation.current;
    setBusy(true); setError(""); setSession(null);
    pending.current = pending.current.catch(() => {}).then(async () => {
      await release();
      if (!request || ticket !== generation.current) return;
      const view = await bridge.openMcpApp(request);
      active.current = { view, owner: bridge };
      if (ticket !== generation.current) { await release(); return; }
      setSelected(view.miniAppId);
      setSession(view);
    }).catch(reason => { if (ticket === generation.current) setError(String(reason)); })
      .finally(() => { if (ticket === generation.current) setBusy(false); });
  }
  useEffect(() => {
    setApps([]); setSelected(""); setInputs({}); setSession(null); setBusy(false); setError("");
    return () => {
      generation.current++;
      pending.current = pending.current.catch(() => {}).then(release).catch(() => {});
    };
  }, [bridge, threadId]);
  useEffect(() => {
    let live = true;
    setCatalogError(""); setLoading(Boolean(threadId));
    if (threadId) void bridge.listMcpApps({ threadId })
      .then(value => { if (live) setApps(value.apps); })
      .catch(reason => { if (live) setCatalogError(String(reason)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [bridge, threadId, revision, catalogAttempt]);
  useEffect(() => {
    if (!props.launch || props.launch.threadId !== threadId) return;
    transition(props.launch);
  }, [bridge, threadId, props.launch]);
  useEffect(() => {
    if (loading || catalogError) return;
    if (selected && apps.some(app => descriptorId(app) === selected)) return;
    // A completed call may arrive before the catalog. Match its exact resource
    // when the directory arrives without reopening or replacing that call.
    const view = active.current?.view;
    const match = view && apps.find(app => app.server === view.server && app.resourceUri === view.resource.uri);
    const next = match || apps[0];
    setSelected(next ? descriptorId(next) : "");
    setInputs(initialInputs(next));
    if (view && !match) transition();
  }, [apps, loading, catalogError]);
  const current = apps.find(app => descriptorId(app) === selected) ?? apps[0];
  const currentSession = session && current && session.miniAppId === descriptorId(current) ? session : null;
  const requiredInputMissing = missingRequiredInput(current, inputs);
  const sessionLabel = (app: McpAppDescriptor) => session?.miniAppId === descriptorId(app)
    ? (zh ? "已启动" : "Started")
    : busy && descriptorId(app) === selected ? (zh ? "处理中…" : "Opening…") : (zh ? "未启动" : "Not started");
  function select(app: McpAppDescriptor) {
    if (descriptorId(app) === selected) return;
    setSelected(descriptorId(app)); setInputs(initialInputs(app)); transition();
  }
  function open() {
    if (!current || !current.readOnly || requiredInputMissing || !threadId || busy || currentSession) return;
    try {
      const args = Object.fromEntries(Object.entries(inputs).filter(([, value]) => value !== "").map(([name, value]) => {
        const type = current.inputSchema.properties?.[name]?.type;
        try { return [name, type && type !== "string" ? JSON.parse(value) : value]; }
        catch { throw new Error(zh ? `请检查“${current.inputSchema.properties?.[name]?.title || name}”的格式。` : `Check the format of “${current.inputSchema.properties?.[name]?.title || name}”.`); }
      }));
      transition({ threadId, miniAppId: descriptorId(current), server: current.server, tool: launchTool(current), arguments: args });
    } catch (reason) { setError(String(reason)); }
  }
  return <section className="opl-mcp-app-workspace" aria-label={zh ? "应用" : "Apps"}>
    <header className="opl-mcp-app-header">
      <div><h3>{zh ? "当前会话的应用" : "Apps in this conversation"}</h3><p>{zh ? "选择应用，启动后在这里使用。" : "Select an app and start it here."}</p></div>
      <div className="opl-workspace-commandbar">
        {threadId ? <button type="button" disabled={loading} onClick={() => setCatalogAttempt(value => value + 1)}>{zh ? "刷新目录" : "Refresh directory"}</button> : null}
        {props.onManage ? <button type="button" onClick={props.onManage}>{zh ? "管理应用" : "Manage apps"}</button> : null}
      </div>
    </header>
    {!threadId ? <div className="opl-mcp-app-empty"><strong>{zh ? "先打开一个对话" : "Open a conversation first"}</strong><p>{zh ? "应用会使用该对话已有的连接和权限。" : "Apps use that conversation’s connections and permissions."}</p></div> : null}
    {threadId && loading ? <p className="opl-mcp-app-notice" role="status">{zh ? "正在加载可用应用…" : "Loading available apps…"}</p> : null}
    {catalogError ? <div className="opl-mcp-app-error"><p role="alert">{zh ? "应用目录暂时无法读取。" : "The app directory could not be loaded."}</p><details><summary>{zh ? "错误详情" : "Error details"}</summary><p>{catalogError}</p></details><button type="button" onClick={() => setCatalogAttempt(value => value + 1)}>{zh ? "重试目录" : "Retry directory"}</button></div> : null}
    {threadId && !loading && !apps.length && !catalogError ? <div className="opl-mcp-app-empty"><strong>{zh ? "当前会话没有可用的 MiniApp" : "No MiniApps are available in this conversation"}</strong><p>{zh ? "前往应用管理检查安装与连接，再返回会话刷新目录。" : "Check installation and connections in app management, then refresh this directory."}</p>{props.onManage ? <button type="button" onClick={props.onManage}>{zh ? "打开应用管理" : "Open app management"}</button> : null}</div> : null}
    {threadId && current ? <div className="opl-mcp-app-layout">
      <label className="opl-mcp-app-compact-switcher"><span>{zh ? "当前应用" : "Current app"}</span>
        <select aria-label={zh ? "当前应用" : "Current app"} value={descriptorId(current)} onChange={event => { const app = apps.find(entry => descriptorId(entry) === event.target.value); if (app) select(app); }}>
          {apps.map(app => <option key={descriptorId(app)} value={descriptorId(app)}>{app.title} · {sessionLabel(app)}</option>)}
        </select>
      </label>
      <nav className="opl-mcp-app-directory" aria-label={zh ? "应用切换" : "App switcher"}>
        <div className="opl-mcp-app-directory-heading"><strong>{zh ? "可用应用" : "Available apps"}</strong><span>{apps.length}</span></div>
        <div className="opl-mcp-app-directory-items">{apps.map(app => <button key={descriptorId(app)} type="button" aria-current={descriptorId(app) === descriptorId(current) ? "page" : undefined} onClick={() => select(app)}>
          <strong>{app.title}</strong><small data-started={session?.miniAppId === descriptorId(app)}>{sessionLabel(app)}</small>
        </button>)}</div>
      </nav>
      <div className="opl-mcp-app-surface" aria-busy={busy}>
        <header className="opl-mcp-app-surface-header"><div><h3>{current.title}</h3>{!currentSession && current.description ? <p>{current.description}</p> : null}</div><span role="status" data-started={Boolean(currentSession)}>{sessionLabel(current)}</span></header>
        <div className="opl-workspace-commandbar">
          {currentSession ? <button type="button" onClick={() => transition()}>{zh ? "关闭应用" : "Close app"}</button> : <button className="opl-mcp-app-start" type="button" disabled={!current.readOnly || requiredInputMissing || !threadId || busy} onClick={open}>{busy ? (zh ? "处理中…" : "Opening…") : error ? (zh ? "重试启动" : "Retry start") : (zh ? "启动应用" : "Start app")}</button>}
          {!currentSession && !busy ? <span className="opl-mcp-app-notice">{readinessLabel(current, zh)}</span> : null}
        </div>
        {error ? <div className="opl-mcp-app-error"><p role="alert">{zh ? "应用未能启动或关闭，请重试，也可以选择其他应用。" : "The app could not start or close. Retry or select another app."}</p><details><summary>{zh ? "错误详情" : "Error details"}</summary><p>{error}</p></details></div> : null}
        {!currentSession && current.readOnly && Object.keys(current.inputSchema.properties ?? {}).length ? <details className="opl-mcp-app-options" open={requiredInputMissing}><summary>{zh ? "启动选项" : "Start options"}</summary>{Object.entries(current.inputSchema.properties ?? {}).map(([name, field]) => <label key={name}><span>{field.title || name}{current.inputSchema.required?.includes(name) ? (zh ? "（必填）" : " (required)") : ""}</span><input required={current.inputSchema.required?.includes(name)} disabled={busy} value={inputs[name] ?? ""} placeholder={field.description} onChange={event => setInputs(values => ({ ...values, [name]: event.target.value }))}/></label>)}</details> : null}
        {!currentSession && !current.readOnly ? <p className="opl-mcp-app-notice">{zh ? "从会话中的已完成工具结果打开这个应用。" : "Open this app from a completed tool result in the conversation."}</p> : null}
        {!currentSession && requiredInputMissing ? <p className="opl-mcp-app-notice" role="status">{zh ? "请先填写必填项。" : "Complete the required fields first."}</p> : null}
        {currentSession ? <McpAppFrame key={currentSession.id} {...props} session={currentSession}/> : null}
      </div>
    </div> : null}
  </section>;
}
