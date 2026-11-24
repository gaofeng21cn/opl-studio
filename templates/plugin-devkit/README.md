# OPL App Plugin DevKit (Three-Tier Standard)

OPL App organizes extension UI & settings into three standardized tiers so plugins compose uniformly without reinventing navigation shells, settings pages, theme tokens, or error isolation.

## Tier Selection Guide

1. **Tier 1 — Declarative Contribution (`tier1-settings-form/`)**
   - Best for plugins that need structured configuration fields (`boolean`, `enum`, `string`, `number`, `directory`, `secret_ref`) or read/command projections.
   - Zero frontend code required: OPL App renders `settings_form` inside the matching `settings_destination` (`models`, `resources`, `workspace`, `capabilities`, `services`, `preferences`) using native validation, effect timing badges (`immediate` / `next_task` / `restart_required`), secret masking, and settings search indexing.
   - See `tier1-settings-form/app-contributions.example.json` (manifest matching `opl-app-contributions.schema.json`), `tier1-settings-form/settings-form-data.example.json` (domain read payload matching `#/$defs/settings_form_result`), and `tier1-settings-form/contribution-cli.mjs` (executable `opl-package-app-contribution-cli.v1` stdin/stdout JSON pilot backing real reads, HTTPS validation, and persisted saves).

2. **Tier 2 — DSH Client Plugin (`tier2-dsh-client-plugin/`)**
   - Best for rich interactive panels or custom controls inside DSH slots.
   - Import UI primitives, settings group helpers, localization, and `PluginErrorBoundary` **exclusively** from `@gaofeng21cn/opl-plugin-ui-kit` (never import `vendor/` relative paths or private host packages).
   - Register settings groups through `registerOplSettingsGroup` targeting a closed `settings.group.<destination>` slot with bilingual `titleI18n` and `searchKeywords`.
   - Wrap panel roots in `<PluginErrorBoundary>` so isolated render failures never break core conversation.

3. **Tier 3 — MCP App Interactive View (`tier3-mcp-app/`)**
   - Best for third-party or sandboxed HTML tools rendered inside `ui://` iframes.
   - Consume host theme, CSS variables, and `--opl-content-font-size` via `ui/notifications/host-context-changed` (no hardcoded `#fff`/`#000` light/dark surfaces).
   - Emit structured authorization requests (`authorization_required` / `opl/request-authorization`) so the host routes users directly to Libraries & Connections authorization and retries seamlessly.

## Automated Conformance Gate

Run the repository conformance gate before publishing any plugin update:

```bash
npm run test:ownership
npm run test:dsh-plugins
npm run test:ui-contributions
```
