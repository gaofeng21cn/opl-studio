/** Page-only DSH type closure; these declarations do not load its Host or apply(). */
import type {} from "@deepseek-ai/dsh-plugin-manager/remote";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/remote";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type { PluginManagerLocaleKey } from "@gaofeng21cn/opl-dsh-adapters/dsh-locales";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    pluginManager: PluginManagerLocaleKey;
  }
}
