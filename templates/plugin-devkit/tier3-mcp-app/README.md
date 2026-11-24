# Tier 3 — MCP App Interactive View Contract

Sandboxed `ui://` HTML tools communicate with OPL App via MCP Apps JSON-RPC (`ui/notifications/host-context-changed`, tool calls, and host-routed authorization).

## Requirements

1. **Follow Host Theme & Font Scale**: Apply `--color-background-*`, `--color-text-*`, `--color-border-primary`, `--font-sans`, and `--opl-content-font-size` received from `ui/notifications/host-context-changed`. Never hardcode opaque `#ffffff` or `#000000` light/dark backgrounds.
2. **Respect Host Locale & Display Mode**: Handle `locale` (`zh-CN` / `en`) and `displayMode` (`inline` / `fullscreen`) updates dynamically.
3. **Structured Authorization Round-Trip**: When an external resource or connection requires authorization, emit `opl/request-authorization` (or return `authorization_required` structured tool payload) so OPL App routes directly to **Settings -> Resources & Connections** and retries once authorized.

See `app-bridge-example.ts` for a standalone browser TypeScript reference.
