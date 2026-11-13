import { useEffect, useRef, useState } from "react";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { McpAppDescriptor, McpAppSession, McpAppsBridge, McpAppOpen } from "../../../../src/bridge/mcpApps";
import type { OplBridge } from "../../../../src/bridge/oplBridge";
import { EcosystemFilePreview } from "../../../../src/integrations/deepseek-harness/EcosystemFilePreview";
import { allowedMcpLink, modelContextText, resolvedMcpTheme, sandboxDocument, workspaceArtifactLink, workspaceArtifactPath, type WorkspaceArtifact, readMcpNavigation, rememberMcpNavigation, resolveMcpNavigation } from "./mcpAppHost";

export type McpAppProps = {
  bridge: McpAppsBridge & Partial<Pick<OplBridge, "readThread" | "listThreadWorkspace" | "readThreadWorkspaceBytes" | "accessThreadWorkspace" | "platformCapabilities">>; launch?: McpAppOpen; threadId?: string; locale: "zh" | "en"; revision?: number;
  preferredEntry?: { resourceUri: string; arguments: Record<string, string> };
  onPreferredEntryConsumed?: (entry: NonNullable<McpAppProps["preferredEntry"]>) => void;
  onManage?: () => void;
  onConversation?: () => void;
  onModules?: () => void;
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
  return zh ? "可打开" : "Ready to open";
}

export function McpAppFrame({ session, bridge: host, locale, onContext, onMessage, onNavigate, onNavigation, fillHeight = false }: McpAppProps & { session: McpAppSession; fillHeight?: boolean; onNavigate?: (url: string) => void; onNavigation?: (value: unknown) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const activeBridge = useRef<AppBridge | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(580);
  const [expanded, setExpanded] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<WorkspaceArtifact | null>(null);
  const handlers = useRef({ onContext, onMessage, locale, onNavigate, onNavigation });
  handlers.current = { onContext, onMessage, locale, onNavigate, onNavigation };
  useEffect(() => { activeBridge.current?.setHostContext({ displayMode: expanded ? "fullscreen" : "inline" }); }, [expanded]);
  useEffect(() => { activeBridge.current?.setHostContext({ locale: locale === "zh" ? "zh-CN" : "en" }); }, [locale]);
  useEffect(() => {
    const iframe = frame.current!;
    let disposed = false;
    const requireActive = () => { if (disposed) throw new Error("MCP App is closed"); };
    const binding = { id: session.id, threadId: session.threadId };
    const initializationTimeout = setTimeout(() => setError(handlers.current.locale === "zh" ? "界面加载超时，请关闭后重新打开。" : "The UI took too long to load. Close it and open it again."), 20_000);
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const theme = () => resolvedMcpTheme(getComputedStyle(document.documentElement).colorScheme, dark.matches);
    const appBridge = new AppBridge(null, { name: "OPL App", version: "1.0.0" }, {
      serverTools: {}, serverResources: {}, openLinks: {}, updateModelContext: { text: {} }, message: { text: {} }
    }, { hostContext: { theme: theme(), locale: handlers.current.locale === "zh" ? "zh-CN" : "en", displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"], containerDimensions: { width: iframe.clientWidth, maxHeight: fillHeight ? iframe.clientHeight : 1400 } } });
    activeBridge.current = appBridge;
    appBridge.oncalltool = async params => {
      requireActive();
      return host.callMcpAppTool({ ...binding, name: params.name, arguments: params.arguments });
    };
    appBridge.onreadresource = params => { requireActive(); return host.readMcpAppResource({ ...binding, uri: params.uri }); };
    appBridge.onlistresources = async () => ({ resources: session.resources });
    appBridge.onlistresourcetemplates = async () => ({ resourceTemplates: [] });
    appBridge.onupdatemodelcontext = async params => { requireActive(); if (params.structuredContent?.navigation) handlers.current.onNavigation?.(params.structuredContent.navigation); handlers.current.onContext(session.threadId, modelContextText(session.server, params)); return {}; };
    appBridge.onmessage = async params => {
      requireActive();
      const text = params.content.filter(block => block.type === "text").map(block => block.text).join("\n");
      if (!text || text.length > 16_384) return { isError: true };
      handlers.current.onMessage(session.threadId, text);
      return {};
    };
    appBridge.onopenlink = async ({ url }) => {
      requireActive();
      if (url.startsWith("ui://") && handlers.current.onNavigate) {
        try { handlers.current.onNavigate(url); return {}; }
        catch (reason) { setError(String(reason)); return { isError: true }; }
      }
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
    appBridge.addEventListener("sizechange", ({ height }) => { if (!fillHeight && height && Number.isFinite(height)) setHeight(Math.max(240, Math.min(1400, height))); });
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
    const resize = new ResizeObserver(() => appBridge.setHostContext({ containerDimensions: { width: iframe.clientWidth, maxHeight: fillHeight ? iframe.clientHeight : 1400 } }));
    resize.observe(iframe);
    void appBridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!)).then(() => {
      if (!disposed) iframe.srcdoc = sandboxDocument(session.resource);
    }).catch(reason => { if (!disposed) setError(String(reason)); });
    return () => {
      disposed = true; activeBridge.current = null; clearTimeout(initializationTimeout); resize.disconnect(); themeObserver.disconnect(); dark.removeEventListener("change", updateTheme);
      void appBridge.teardownResource({}, { timeout: 1000 }).catch(() => {}).finally(() => appBridge.close());
    };
  }, [session.id, host, fillHeight]);
  return <div className={`${expanded ? "opl-mcp-app-expanded" : "opl-mcp-app-frame"}${fillHeight ? " opl-mcp-app-fill" : ""}`}>
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
    <iframe ref={frame} title={session.title} sandbox="allow-scripts allow-downloads" referrerPolicy="no-referrer" style={{ display: artifact ? "none" : undefined, width: "100%", height: fillHeight ? "100%" : expanded ? "80vh" : height, border: 0, background: "transparent" }}/>
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
  const [returnTo, setReturnTo] = useState<McpAppOpen | null>(null);
  function inputsFor(app: McpAppDescriptor | undefined) {
    const recent = app && threadId ? readMcpNavigation(threadId, app) : {};
    return { ...initialInputs(app), ...Object.fromEntries(Object.entries(recent).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])) };
  }
  const [error, setError] = useState("");
  const generation = useRef(0);
  const active = useRef<{ view: McpAppSession; owner: McpAppsBridge } | null>(null);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const consumedEntry = useRef<McpAppProps["preferredEntry"]>(undefined);
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
    setApps([]); setSelected(""); setInputs({}); setReturnTo(null); setSession(null); setBusy(false); setError("");
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
    const entry = props.preferredEntry;
    if (threadId && apps.length && entry && entry !== consumedEntry.current && !props.launch) {
      consumedEntry.current = entry;
      try {
        const target = resolveMcpNavigation(`${entry.resourceUri}#${encodeURIComponent(JSON.stringify(entry.arguments))}`, apps);
        setSelected(descriptorId(target.app));
        const values = { ...initialInputs(target.app), ...Object.fromEntries(Object.entries(target.arguments).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])) };
        setInputs(values);
        if (target.app.readiness === "ready" && !missingRequiredInput(target.app, values)) {
          transition({ threadId, server: target.app.server, tool: launchTool(target.app), miniAppId: descriptorId(target.app), arguments: target.arguments });
        }
      } catch (reason) { setError(String(reason)); }
      props.onPreferredEntryConsumed?.(entry);
      return;
    }
    if (selected && apps.some(app => descriptorId(app) === selected)) return;
    // A completed call may arrive before the catalog. Match its exact resource
    // when the directory arrives without reopening or replacing that call.
    const view = active.current?.view;
    const match = view && apps.find(app => app.server === view.server && app.resourceUri === view.resource.uri);
    const next = match || apps[0];
    setSelected(next ? descriptorId(next) : "");
    setInputs(inputsFor(next));
    if (view && !match) transition();
  }, [apps, loading, catalogError, props.preferredEntry, props.launch, threadId]);
  const current = apps.find(app => descriptorId(app) === selected) ?? apps[0];
  const currentSession = session && current && session.miniAppId === descriptorId(current) ? session : null;
  const requiredInputMissing = missingRequiredInput(current, inputs);
  const sessionLabel = (app: McpAppDescriptor) => session?.miniAppId === descriptorId(app)
    ? (zh ? "界面已打开" : "UI open")
    : busy && descriptorId(app) === selected ? (zh ? "处理中…" : "Opening…") : (zh ? "界面未打开" : "UI closed");
  function select(app: McpAppDescriptor) {
    if (descriptorId(app) === selected) return;
    setSelected(descriptorId(app)); setInputs(inputsFor(app)); setReturnTo(null); transition();
  }
  function navigate(url: string) {
    if (!threadId || !session) return;
    const target = resolveMcpNavigation(url, apps);
    const args = Object.keys(target.arguments).length ? target.arguments : readMcpNavigation(threadId, target.app);
    if (target.app.inputSchema.required?.some(key => args[key] === undefined)) throw new Error(zh ? "专用界面需要补充输入，请从应用列表打开。" : "Select this app in the directory to complete its required inputs.");
    const previousNavigation = current ? readMcpNavigation(threadId, current) : {};
    setReturnTo({ threadId, server: session.server, tool: session.tool, miniAppId: session.miniAppId,
      arguments: Object.keys(previousNavigation).length ? previousNavigation : session.arguments });
    setSelected(descriptorId(target.app)); setInputs(inputsFor(target.app));
    transition({ threadId, server: target.app.server, tool: launchTool(target.app), miniAppId: descriptorId(target.app), arguments: args });
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
      {returnTo ? <button type="button" disabled={busy} onClick={() => { const target = returnTo; setReturnTo(null); transition(target); }}>{zh ? "返回上一界面" : "Back to previous app"}</button> : null}
      <label className="opl-mcp-app-switcher"><span>{zh ? "应用" : "App"}</span>
        <select aria-label={zh ? "当前应用" : "Current app"} disabled={!apps.length} value={current ? descriptorId(current) : ""} onChange={event => { const app = apps.find(entry => descriptorId(entry) === event.target.value); if (app) select(app); }}>
          {!apps.length ? <option value="">{zh ? "选择应用" : "Choose an app"}</option> : apps.map(app => <option key={descriptorId(app)} value={descriptorId(app)}>{app.title}</option>)}
        </select>
      </label>
      {current ? <>
        <span className="opl-mcp-app-session-state" role="status" data-started={Boolean(currentSession)}>{sessionLabel(current)}</span>
        {currentSession ? <button type="button" onClick={() => { setInputs(inputsFor(current)); transition(); }}>{zh ? "关闭界面" : "Close UI"}</button> : <button className="opl-mcp-app-start" type="button" disabled={!current.readOnly || requiredInputMissing || !threadId || busy} onClick={open}>{busy ? (zh ? "处理中…" : "Opening…") : error ? (zh ? "重新打开" : "Retry opening") : (zh ? "打开界面" : "Open UI")}</button>}
      </> : null}
      <details className="opl-mcp-app-menu">
        <summary>{zh ? "更多" : "More"}</summary>
        <div onClick={event => { if ((event.target as HTMLElement).closest("button")) event.currentTarget.closest("details")?.removeAttribute("open"); }}>
          {threadId ? <button type="button" disabled={loading} onClick={() => setCatalogAttempt(value => value + 1)}>{zh ? "刷新目录" : "Refresh directory"}</button> : null}
          {props.onManage ? <button type="button" onClick={props.onManage}>{zh ? "软件中心" : "Software Center"}</button> : null}
          {props.onModules ? <button type="button" onClick={props.onModules}>{zh ? "模块视图" : "Module views"}</button> : null}
          <p>{zh ? "关闭或切换仅收起界面，后台任务继续运行。安装、更新和启停请到软件中心。" : "Closing or switching only closes the UI. Background tasks continue. Install, update, and enable apps in Software Center."}</p>
        </div>
      </details>
      {props.onConversation ? <button type="button" onClick={props.onConversation}>{zh ? "返回对话" : "Back to chat"}</button> : null}
    </header>
    {!threadId ? <div className="opl-mcp-app-empty"><strong>{zh ? "先打开一个对话" : "Open a conversation first"}</strong><p>{zh ? "应用会使用该对话已有的连接和权限。回到对话后，从左侧选择已有对话，再打开工作台。" : "Apps use that conversation’s connections and permissions."}</p>{props.onConversation ? <button type="button" onClick={props.onConversation}>{zh ? "选择对话" : "Choose a conversation"}</button> : null}</div> : null}
    {threadId && loading ? <p className="opl-mcp-app-notice" role="status">{zh ? "正在加载可用应用…" : "Loading available apps…"}</p> : null}
    {catalogError ? <div className="opl-mcp-app-error"><p role="alert">{catalogError.includes("mcp_app_thread_busy") ? (zh ? "此对话的连接正在由另一窗口使用。请选择其他对话，或在另一窗口释放连接后重试。" : "This conversation's connection is in use by another window. Choose another conversation or retry after that window releases it.") : (zh ? "应用连接未就绪，请重新连接目录；也可到软件中心检查连接。" : "App connections are not ready. Retry the directory or check Software Center.")}</p><details><summary>{zh ? "错误详情" : "Error details"}</summary><p>{catalogError}</p></details><button type="button" onClick={() => setCatalogAttempt(value => value + 1)}>{zh ? "重试目录" : "Retry directory"}</button>{props.onConversation ? <button type="button" onClick={props.onConversation}>{zh ? "选择对话" : "Choose a conversation"}</button> : null}</div> : null}
    {threadId && !loading && !apps.length && !catalogError ? <div className="opl-mcp-app-empty"><strong>{zh ? "当前会话没有可用的 MiniApp" : "No MiniApps are available in this conversation"}</strong><p>{zh ? "前往软件中心检查安装与连接，再返回会话刷新目录。" : "Check installation and connections in Software Center, then refresh this directory."}</p>{props.onManage ? <button type="button" onClick={props.onManage}>{zh ? "打开软件中心" : "Open Software Center"}</button> : null}</div> : null}
    {threadId && current ? <div className="opl-mcp-app-surface" aria-busy={busy}>
        {!currentSession ? <div className="opl-mcp-app-launch">
          <h3>{current.title}</h3>
          {current.description ? <p>{current.description}</p> : null}
          <p className="opl-mcp-app-notice">{readinessLabel(current, zh)}</p>
        </div> : null}
        {error ? <div className="opl-mcp-app-error">{current.readOnly && threadId && !current.inputSchema.required?.length ? <button type="button" disabled={busy} onClick={() => { rememberMcpNavigation(threadId, current, {}); setInputs(initialInputs(current)); transition({threadId, server: current.server, tool: launchTool(current), miniAppId: descriptorId(current), arguments: {}}); }}>{zh ? "从首页打开" : "Open from home"}</button> : null}<p role="alert">{zh ? "界面未能打开或关闭，请重试，也可以选择其他应用。" : "The UI could not open or close. Retry or select another app."}</p><details><summary>{zh ? "错误详情" : "Error details"}</summary><p>{error}</p></details></div> : null}
        {!currentSession && current.readOnly && Object.keys(current.inputSchema.properties ?? {}).length ? <details className="opl-mcp-app-options" open={requiredInputMissing}><summary>{zh ? "打开选项" : "Open options"}</summary>{Object.entries(current.inputSchema.properties ?? {}).map(([name, field]) => <label key={name}><span>{field.title || name}{current.inputSchema.required?.includes(name) ? (zh ? "（必填）" : " (required)") : ""}</span><input required={current.inputSchema.required?.includes(name)} disabled={busy} value={inputs[name] ?? ""} placeholder={field.description} onChange={event => setInputs(values => ({ ...values, [name]: event.target.value }))}/></label>)}</details> : null}
        {!currentSession && !current.readOnly ? <p className="opl-mcp-app-notice">{zh ? "从会话中的已完成工具结果打开这个应用。" : "Open this app from a completed tool result in the conversation."}</p> : null}
        {!currentSession && requiredInputMissing ? <p className="opl-mcp-app-notice" role="status">{zh ? "请先填写必填项。" : "Complete the required fields first."}</p> : null}
        {currentSession ? <McpAppFrame key={currentSession.id} {...props} session={currentSession} fillHeight onNavigate={navigate} onNavigation={value => { if (current && threadId) rememberMcpNavigation(threadId, current, value); }}/> : null}
    </div> : null}
  </section>;
}
