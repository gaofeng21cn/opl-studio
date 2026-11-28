import { useCallback, useEffect, useRef, useState } from "react";
import { AppBridge, PostMessageTransport, type McpUiStyles } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { OplStudioShellService } from "@gaofeng21cn/opl-host-contracts";
import { Button, PluginErrorBoundary, useOplStudioShellSnapshot } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import {
  dispatchOplFlowMcpToolCall,
  executeOplFlowHostNavigation,
  formatDashboardToolResult,
  parseOplFlowHostNavigationIntent,
  readOplFlowDashboard,
  readOplFlowUiResource,
  resolveStudioWindowBridge,
  sandboxOplFlowDocument,
  type OplFlowDashboardEnvelope,
  type OplFlowHostNavigationIntent,
  type OplFlowUiResource,
  type StudioWindowBridge
} from "./oplFlowBridge";
import "./opl-flow-workbench.css";

export type OplFlowWorkbenchPanelProps = {
  shell: Pick<
    OplStudioShellService,
    "getSnapshot" | "subscribe" | "executeAction" | "openPrimaryView" | "openThread" | "startConversationInWorkspace"
  >;
  bridge?: StudioWindowBridge;
};

type LoadedHostState = {
  resource: OplFlowUiResource;
  initialDashboard: OplFlowDashboardEnvelope;
  generation: number;
};

function resolveTheme(): "light" | "dark" {
  if (typeof window === "undefined" || typeof document === "undefined") return "light";
  const scheme = getComputedStyle(document.documentElement).colorScheme;
  if (scheme.includes("dark") && !scheme.includes("light")) return "dark";
  if (document.documentElement.dataset.theme === "dark" || document.body.hasAttribute("data-ds-dark-theme")) {
    return "dark";
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function collectHostStyles() {
  if (typeof document === "undefined") return { variables: {} as unknown as McpUiStyles };
  const rootStyle = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  const token = (name: string) => body.getPropertyValue(name).trim() || rootStyle.getPropertyValue(name).trim() || undefined;
  const contentFontSize = token("--opl-content-font-size") || token("--dsh-content-font-size") || token("--dsw-font-s-14-font-size");
  return {
    variables: {
      "--font-sans": body.fontFamily,
      "--font-mono": token("--ds-font-family-code") || "monospace",
      "--color-background-primary": token("--dsw-alias-bg-base"),
      "--color-background-secondary": token("--dsw-alias-bg-layer-1"),
      "--color-background-tertiary": token("--dsw-alias-bg-module-platform"),
      "--color-text-primary": token("--dsw-alias-label-primary"),
      "--color-text-secondary": token("--dsw-alias-label-secondary"),
      "--color-text-inverse": token("--dsw-alias-label-primary-foreground"),
      "--color-text-info": token("--dsw-alias-state-business-primary"),
      "--color-accent-primary": token("--dsw-alias-state-business-primary"),
      "--color-text-danger": token("--dsw-alias-state-error-primary"),
      "--color-text-warning": token("--dsw-alias-state-warn-label"),
      "--color-text-success": token("--dsw-alias-state-success-primary"),
      "--color-border-primary": token("--dsw-alias-border-l2"),
      "--color-ring-primary": token("--dsw-alias-state-business-primary"),
      "--border-radius-sm": token("--dsw-radius-sm"),
      "--border-radius-md": token("--dsw-radius-md"),
      "--border-radius-lg": token("--dsw-radius-lg"),
      "--font-text-md-size": contentFontSize,
      "--opl-content-font-size": contentFontSize,
      "--font-text-md-line-height": token("--dsw-font-s-14-line-height")
    } as unknown as McpUiStyles
  };
}

function intentKey(intent: OplFlowHostNavigationIntent): string {
  return [
    intent.jump_mode,
    intent.thread_id ?? "",
    intent.session_id ?? "",
    intent.workspace_path ?? "",
    intent.bead_id ?? ""
  ].join("|");
}

export function OplFlowWorkbenchInner({ shell, bridge: explicitBridge }: OplFlowWorkbenchPanelProps) {
  const snapshot = useOplStudioShellSnapshot(shell as OplStudioShellService);
  const zh = snapshot.locale === "zh";
  const localeTag = zh ? "zh-CN" : "en";
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const activeBridgeRef = useRef<AppBridge | null>(null);
  const lastNavRef = useRef<{ key: string; at: number } | null>(null);

  const [loaded, setLoaded] = useState<LoadedHostState | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  const shellRef = useRef(shell);
  shellRef.current = shell;
  const bridgeRef = useRef(explicitBridge);
  bridgeRef.current = explicitBridge;
  const localeTagRef = useRef(localeTag);
  localeTagRef.current = localeTag;

  const handleHostNavigation = useCallback(async (raw: unknown) => {
    const intent = parseOplFlowHostNavigationIntent(raw);
    if (!intent) return;
    const key = intentKey(intent);
    const now = Date.now();
    if (lastNavRef.current && lastNavRef.current.key === key && now - lastNavRef.current.at < 400) {
      return;
    }
    lastNavRef.current = { key, at: now };
    try {
      await executeOplFlowHostNavigation(intent, shellRef.current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setReady(false);
    setError(null);
    const bridge = bridgeRef.current ?? resolveStudioWindowBridge();
    void Promise.all([readOplFlowUiResource(bridge), readOplFlowDashboard(bridge)])
      .then(([resource, initialDashboard]) => {
        if (!active) return;
        setLoaded((prev) => ({
          resource,
          initialDashboard,
          generation: (prev?.generation ?? 0) + 1
        }));
      })
      .catch((reason) => {
        if (!active) return;
        setLoaded(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [explicitBridge, reloadCount]);

  useEffect(() => {
    activeBridgeRef.current?.setHostContext({ locale: localeTag });
  }, [localeTag]);

  useEffect(() => {
    if (!loaded || !frameRef.current) return;
    const iframe = frameRef.current;
    let disposed = false;
    const requireActive = () => {
      if (disposed) throw new Error("OPL Flow MCP App host is closed");
    };

    const appBridge = new AppBridge(
      null,
      { name: "OPL Studio", version: "1.0.0" },
      {
        serverTools: {},
        updateModelContext: { text: {}, structuredContent: {} }
      },
      {
        hostContext: {
          theme: resolveTheme(),
          styles: collectHostStyles(),
          locale: localeTagRef.current,
          displayMode: "inline",
          availableDisplayModes: ["inline"],
          containerDimensions: {
            width: iframe.clientWidth || 960,
            maxHeight: iframe.clientHeight || 900
          }
        }
      }
    );
    activeBridgeRef.current = appBridge;

    appBridge.oncalltool = async (params) => {
      requireActive();
      const bridge = bridgeRef.current ?? resolveStudioWindowBridge();
      return dispatchOplFlowMcpToolCall(params.name, params.arguments as Record<string, unknown> | undefined, {
        bridge,
        shell: shellRef.current
      });
    };

    appBridge.onupdatemodelcontext = async (params) => {
      requireActive();
      const nav = (params.structuredContent as Record<string, unknown> | undefined)?.host_navigation_intent;
      if (nav) {
        void handleHostNavigation(nav);
      }
      return {};
    };

    appBridge.addEventListener("initialized", () => {
      if (disposed) return;
      setReady(true);
      void appBridge.sendToolInput({ arguments: { host_carrier: "codex" } }).catch(() => {});
      void appBridge.sendToolResult(formatDashboardToolResult(loaded.initialDashboard)).catch(() => {});
    });

    const onWindowMessage = (event: MessageEvent) => {
      if (disposed || !iframe.contentWindow || event.source !== iframe.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (data && data.type === "opl_flow.host_navigate") {
        void handleHostNavigation(data);
      }
    };
    window.addEventListener("message", onWindowMessage);

    const darkMedia = window.matchMedia?.("(prefers-color-scheme: dark)");
    const updateAppearance = () => {
      if (disposed) return;
      appBridge.setHostContext({ theme: resolveTheme(), styles: collectHostStyles() });
    };
    darkMedia?.addEventListener?.("change", updateAppearance);

    const appearanceObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(updateAppearance)
        : null;
    if (appearanceObserver) {
      const attrs = {
        attributes: true,
        attributeFilter: ["style", "class", "data-theme", "data-font-size", "data-ds-theme-source", "data-ds-dark-theme"]
      };
      appearanceObserver.observe(document.documentElement, attrs);
      appearanceObserver.observe(document.body, attrs);
    }

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (disposed) return;
            appBridge.setHostContext({
              containerDimensions: {
                width: iframe.clientWidth || 960,
                maxHeight: iframe.clientHeight || 900
              }
            });
          })
        : null;
    resizeObserver?.observe(iframe);

    const contentWindow = iframe.contentWindow;
    if (contentWindow) {
      void appBridge
        .connect(new PostMessageTransport(contentWindow, contentWindow))
        .then(() => {
          if (!disposed) {
            iframe.srcdoc = sandboxOplFlowDocument(loaded.resource);
          }
        })
        .catch((reason) => {
          if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
        });
    } else {
      iframe.srcdoc = sandboxOplFlowDocument(loaded.resource);
    }

    return () => {
      disposed = true;
      activeBridgeRef.current = null;
      window.removeEventListener("message", onWindowMessage);
      darkMedia?.removeEventListener?.("change", updateAppearance);
      appearanceObserver?.disconnect();
      resizeObserver?.disconnect();
      void appBridge.teardownResource({}, { timeout: 500 }).catch(() => {}).finally(() => appBridge.close());
    };
  }, [loaded, handleHostNavigation]);

  return (
    <section
      className="opl-flow-host-shell"
      data-testid="opl-flow-workbench"
      aria-label={zh ? "OPL Flow 总控工作台" : "OPL Flow Control Tower"}
    >
      {error ? (
        <div className="opl-flow-host-state" role="alert" data-testid="opl-flow-host-error">
          <p>{error}</p>
          <Button
            variant="outline"
            type="button"
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {zh ? "重新加载" : "Reload"}
          </Button>
        </div>
      ) : null}
      {!error && (loading || !ready) ? (
        <p className="opl-flow-host-loading" role="status" data-testid="opl-flow-host-loading">
          {zh ? "正在加载 OPL Flow 规范决策看板…" : "Loading canonical OPL Flow decision dashboard…"}
        </p>
      ) : null}
      {loaded ? (
        <iframe
          ref={frameRef}
          className="opl-flow-host-frame"
          data-testid="opl-flow-mcp-app-frame"
          title={zh ? "OPL Flow 决策看板" : "OPL Flow Decision Dashboard"}
          sandbox="allow-scripts allow-downloads"
          referrerPolicy="no-referrer"
        />
      ) : null}
    </section>
  );
}

export function OplFlowWorkbenchPanel(props: OplFlowWorkbenchPanelProps) {
  const snapshot = useOplStudioShellSnapshot(props.shell as OplStudioShellService);
  const [resetKey, setResetKey] = useState(0);
  return (
    <PluginErrorBoundary
      pluginId="opl-flow-workbench"
      pluginLabel={snapshot.locale === "zh" ? "OPL Flow 总控" : "OPL Flow"}
      locale={snapshot.locale}
      resetKey={resetKey}
      onReloadView={() => setResetKey((n) => n + 1)}
    >
      <OplFlowWorkbenchInner {...props} />
    </PluginErrorBoundary>
  );
}
