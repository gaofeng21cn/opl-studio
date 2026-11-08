import { useEffect, useRef, useState } from "react";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { McpAppDescriptor, McpAppSession, McpAppsBridge, McpAppOpen } from "../../../../src/bridge/mcpApps";
import type { OplBridge } from "../../../../src/bridge/oplBridge";
import { EcosystemFilePreview } from "../../../../src/integrations/deepseek-harness/EcosystemFilePreview";
import { allowedMcpLink, modelContextText, resolvedMcpTheme, sandboxDocument, workspaceArtifactLink, workspaceArtifactPath, type WorkspaceArtifact } from "./mcpAppHost";

export type McpAppProps = {
  bridge: McpAppsBridge & Partial<Pick<OplBridge, "readThread" | "listThreadWorkspace" | "readThreadWorkspaceBytes" | "accessThreadWorkspace" | "platformCapabilities">>; launch?: McpAppOpen; threadId?: string; locale: "zh" | "en"; revision?: number;
  onContext(threadId: string, context: string): void;
  onMessage(threadId: string, text: string): void;
};

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
  const [selected, setSelected] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [session, setSession] = useState<McpAppSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const zh = locale === "zh";
  useEffect(() => {
    let active = true;
    setError("");
    void bridge.listMcpApps({ threadId }).then(value => { if (active) setApps(value.apps); }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [bridge, threadId, revision]);
  useEffect(() => () => { generation.current++; }, [threadId]);
  useEffect(() => {
    setSession(null); setSelected(""); setInputs({}); setBusy(false);
  }, [threadId]);
  useEffect(() => () => { if (session) void bridge.closeMcpApp({ id: session.id, threadId: session.threadId }).catch(() => {}); }, [session, bridge]);
  useEffect(() => {
    if (!props.launch || props.launch.threadId !== threadId) return;
    const ticket = ++generation.current;
    setBusy(true); setError(""); setSession(null); setSelected(`${props.launch.server}:${props.launch.tool}`); setInputs({});
    void bridge.openMcpApp(props.launch).then(async view => {
      if (ticket === generation.current) setSession(view);
      else await bridge.closeMcpApp(view);
    }).catch(reason => { if (ticket === generation.current) setError(String(reason)); })
      .finally(() => { if (ticket === generation.current) setBusy(false); });
  }, [bridge, threadId, props.launch]);
  const current = apps.find(app => `${app.server}:${app.tool}` === selected) ?? apps[0];
  async function open() {
    if (!current || !threadId || busy) return;
    const ticket = ++generation.current;
    setBusy(true); setError(""); setSession(null);
    try {
      const args = Object.fromEntries(Object.entries(inputs).filter(([, value]) => value !== "").map(([name, value]) => {
        const type = current!.inputSchema.properties?.[name]?.type;
        return [name, type && type !== "string" ? JSON.parse(value) : value];
      }));
      const result = await bridge.openMcpApp({ threadId, server: current.server, tool: current.tool, arguments: args });
      if (ticket !== generation.current) { await bridge.closeMcpApp(result); return; }
      setSession(result);
    } catch (reason) { if (ticket === generation.current) setError(String(reason)); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  return <section aria-label={zh ? "MCP 应用" : "MCP Apps"}>
    <div className="opl-workspace-commandbar"><select aria-label={zh ? "选择 MCP 应用" : "Select MCP App"} value={current ? `${current.server}:${current.tool}` : ""} onChange={event => { generation.current++; setSelected(event.target.value); setInputs({}); setSession(null); setBusy(false); }}>
      {apps.map(app => <option key={`${app.server}:${app.tool}`} value={`${app.server}:${app.tool}`}>{app.title} · {app.server}</option>)}
    </select><button disabled={!current?.readOnly || !threadId || busy} onClick={() => void open()}>{busy ? (zh ? "正在打开…" : "Opening…") : (zh ? "打开应用" : "Open app")}</button>
    {session ? <button onClick={() => setSession(null)}>{zh ? "关闭应用" : "Close app"}</button> : null}</div>
    {!threadId ? <p>{zh ? "先打开一个对话，应用将使用该对话的连接和权限。" : "Open a conversation to use its connections and permissions."}</p> : null}
    {!apps.length && !error ? <p>{zh ? "当前连接中没有声明界面的 MCP 应用。" : "No MCP App views are declared by the current connections."}</p> : null}
    {current ? <details><summary>{zh ? "打开参数" : "Open options"}</summary>{Object.entries(current.inputSchema.properties ?? {}).map(([name, field]) => <label key={name} style={{ display: "block" }}>{field.title || name}{current.inputSchema.required?.includes(name) ? " *" : ""}<input value={inputs[name] ?? ""} placeholder={field.description} onChange={event => setInputs(values => ({ ...values, [name]: event.target.value }))}/></label>)}</details> : null}
    {error ? <p role="alert">{error}</p> : null}
    {session ? <McpAppFrame key={session.id} {...props} session={session}/> : null}
  </section>;
}
