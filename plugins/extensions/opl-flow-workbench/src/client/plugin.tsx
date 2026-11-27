import { Workflow } from "lucide-react";
import type { Context } from "@deepseek-ai/cordis";
import type { OplStudioShellService } from "@gaofeng21cn/opl-host-contracts";
import { OPL_STUDIO_SHELL_SERVICE } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { OplFlowWorkbenchPanel } from "./OplFlowWorkbenchPanel";
import { isOplFlowPackageEnabled, resolveStudioWindowBridge } from "./oplFlowBridge";

export const oplFlowWorkbenchClientPlugin = {
  name: "opl-flow-workbench-client",
  inject: ["slots", OPL_STUDIO_SHELL_SERVICE],
  apply(ctx: Context) {
    const slots = ctx.get("slots") as {
      register(spec: Record<string, unknown>, component: unknown): (() => void) | void;
    };
    const shell = ctx.get(OPL_STUDIO_SHELL_SERVICE) as OplStudioShellService;

    let active = true;
    let mounted = false;
    let checking = false;
    let recheckQueued = false;
    let disposeSidebar: (() => void) | void;
    let disposeMain: (() => void) | void;

    const mountSlots = () => {
      if (mounted) return;
      mounted = true;
      disposeSidebar = slots.register(
        {
          name: "sidebar.panellist",
          id: "opl-flow",
          order: 34,
          label: (locale: string) => (locale === "zh" ? "OPL Flow 总控" : "OPL Flow"),
          labelI18n: { zh: "OPL Flow 总控", en: "OPL Flow" },
          registrant: "opl-flow-workbench"
        },
        ({ size }: { size: number }) => <Workflow size={size} aria-hidden="true" />
      );
      disposeMain = slots.register(
        {
          name: "main",
          key: "opl-flow",
          registrant: "opl-flow-workbench"
        },
        () => <OplFlowWorkbenchPanel shell={shell} />
      );
    };

    const unmountSlots = () => {
      if (!mounted) return;
      mounted = false;
      try {
        disposeSidebar?.();
      } finally {
        disposeSidebar = undefined;
      }
      try {
        disposeMain?.();
      } finally {
        disposeMain = undefined;
      }
    };

    const syncAvailability = async () => {
      if (!active) return;
      if (checking) {
        recheckQueued = true;
        return;
      }
      checking = true;
      try {
        const readState = resolveStudioWindowBridge()?.readState;
        if (!readState) {
          unmountSlots();
          return;
        }
        const stateReadback = await readState("fast");
        if (!active) return;
        if (isOplFlowPackageEnabled(stateReadback)) {
          mountSlots();
        } else {
          unmountSlots();
        }
      } catch {
        // Leave unregistered silently when host state is temporarily unavailable.
      } finally {
        checking = false;
        if (active && recheckQueued) {
          recheckQueued = false;
          void syncAvailability();
        }
      }
    };

    const unsubscribe = shell.subscribe(() => {
      void syncAvailability();
    });
    void syncAvailability();

    ctx.effect(() => () => {
      active = false;
      unsubscribe();
      unmountSlots();
    });
  }
};

export default oplFlowWorkbenchClientPlugin;
