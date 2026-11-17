declare module "virtual:opl-settings-search" {
  import type { Context } from "@deepseek-ai/cordis";
  const plugin: { apply(context: Context): void; inject?: string[] };
  export default plugin;
}
