/**
 * Minimal browser-side MCP App host bridge helper following the Tier 3 contract:
 * - Applies host theme, CSS variables, and `--opl-content-font-size` dynamically.
 * - Requests host-guided authorization when protected resources require credentials.
 */
export type McpHostContextPayload = {
  theme?: "light" | "dark";
  locale?: string;
  displayMode?: "inline" | "fullscreen";
  styles?: {
    variables?: Record<string, string | undefined>;
  };
};

export type McpAuthorizationRequest = {
  package_id?: string;
  resource_id?: string;
  reason?: string;
};

export function applyMcpHostContext(payload: McpHostContextPayload, root: HTMLElement = document.documentElement): void {
  if (payload.theme === "light" || payload.theme === "dark") {
    root.dataset.theme = payload.theme;
    root.style.colorScheme = payload.theme;
  }
  if (payload.locale) {
    root.lang = payload.locale;
  }
  if (payload.displayMode) {
    root.dataset.displayMode = payload.displayMode;
  }
  const variables = payload.styles?.variables ?? {};
  for (const [name, value] of Object.entries(variables)) {
    if (name.startsWith("--") && typeof value === "string" && value.trim()) {
      root.style.setProperty(name, value);
    }
  }
}

export function attachMcpHostListener(onUpdate: (payload: McpHostContextPayload) => void): () => void {
  const listener = (event: MessageEvent<unknown>) => {
    const data = event.data as { method?: string; params?: McpHostContextPayload } | null;
    if (data?.method === "ui/notifications/host-context-changed" && data.params) {
      applyMcpHostContext(data.params);
      onUpdate(data.params);
    }
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

export function requestHostAuthorization(request: McpAuthorizationRequest, requestId: string | number = Date.now()): void {
  window.parent.postMessage(
    {
      jsonrpc: "2.0",
      id: requestId,
      method: "opl/request-authorization",
      params: {
        authorization_required: true,
        ...request
      }
    },
    "*"
  );
}
