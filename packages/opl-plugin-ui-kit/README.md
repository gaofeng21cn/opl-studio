# @gaofeng21cn/opl-plugin-ui-kit

Public UI primitives, settings group slot helpers, locale/shell hooks, and error boundary isolation for **Tier 2** OPL App DSH client plugins.

## Installation (GitHub Packages)

```bash
npm install @gaofeng21cn/opl-plugin-ui-kit --registry https://npm.pkg.github.com
```

Peer dependencies:

- `react` (`>=19.0.0`)
- `@deepseek-ai/dsh-client-ui-primitives` (`0.2.2-rc.3 || >=0.2.2`)

## Usage

Import UI primitives, `PluginErrorBoundary`, `SettingsGroup` / `SettingRow` / `StatusPill` / `EmptyState`, `registerOplSettingsGroup`, and `useOplLocale` / `useOplStudioShellSnapshot` directly from `@gaofeng21cn/opl-plugin-ui-kit` (never import private `vendor/` or host internal modules):

```tsx
import {
  Button,
  PluginErrorBoundary,
  SettingRow,
  SettingsGroup,
  registerOplSettingsGroup,
  useOplLocale,
  type OplSettingsGroupOwner,
  type OplSettingsGroupSlotRegistry
} from "@gaofeng21cn/opl-plugin-ui-kit";
```

## UI Standards

- Wrap panel roots in `<PluginErrorBoundary>` so isolated render failures never disrupt core conversation.
- Target existing `settings.group.<destination>` slots (`models`, `resources`, `workspace`, `capabilities`, `services`, `preferences`) with bilingual `titleI18n` and `searchKeywords` instead of inventing top-level settings navigation entries.
- Use host `--dsw-*` CSS custom properties instead of hardcoded light/dark colors.
