import { Activity } from "lucide-react";
import type { Context } from "@deepseek-ai/cordis";
import type { OplStudioShellService } from "@gaofeng21cn/opl-host-contracts";
import { OPL_STUDIO_SHELL_SERVICE } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { RuntimeStatusSlotPanel } from "./RuntimeStatusPanel";
import "./runtime-status.css";

export const runtimeStatusClientPlugin = {
  name: "opl-runtime-status-client",
  inject: ["slots", OPL_STUDIO_SHELL_SERVICE],
  apply(ctx: Context) {
    const slots = ctx.get("slots") as any;
    const shell = ctx.get(OPL_STUDIO_SHELL_SERVICE) as OplStudioShellService;
    const resolveTaskWorkbench = () => {
      try {
        return (ctx.get("oplMcpAppsClient") as { TaskWorkbench?: any } | undefined)?.TaskWorkbench;
      } catch {
        return undefined;
      }
    };

    slots.register(
      {
        name: "sidebar.panellist",
        id: "runtime",
        order: 20,
        label: (locale: string) => (locale === "zh" ? "运行状态" : "Runtime status"),
        labelI18n: { zh: "运行状态", en: "Runtime status" },
        registrant: "opl-runtime-status"
      },
      ({ size }: { size: number }) => <Activity size={size} />
    );

    slots.register(
      {
        name: "main",
        key: "runtime",
        registrant: "opl-runtime-status"
      },
      () => (
        <RuntimeStatusSlotPanel
          shell={shell}
          TaskWorkbenchComponent={resolveTaskWorkbench()}
        />
      )
    );
  }
};

export default runtimeStatusClientPlugin;
