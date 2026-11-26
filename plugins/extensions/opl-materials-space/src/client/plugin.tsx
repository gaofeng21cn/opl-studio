import { FolderKanban } from "lucide-react";
import type { Context } from "@deepseek-ai/cordis";
import type { OplStudioShellService } from "@gaofeng21cn/opl-host-contracts";
import { OPL_STUDIO_SHELL_SERVICE } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { MaterialsSpaceSlotPanel } from "./MaterialsSpacePanel";
import "./materials-space.css";

export const materialsSpaceClientPlugin = {
  name: "opl-materials-space-client",
  inject: ["slots", OPL_STUDIO_SHELL_SERVICE],
  apply(ctx: Context) {
    const slots = ctx.get("slots") as any;
    const shell = ctx.get(OPL_STUDIO_SHELL_SERVICE) as OplStudioShellService;

    slots.register(
      {
        name: "sidebar.panellist",
        id: "materials",
        order: 25,
        label: (locale: string) => (locale === "zh" ? "资料空间" : "Materials Space"),
        labelI18n: { zh: "资料空间", en: "Materials Space" },
        registrant: "opl-materials-space"
      },
      ({ size }: { size: number }) => <FolderKanban size={size} />
    );

    slots.register(
      {
        name: "main",
        key: "materials",
        registrant: "opl-materials-space"
      },
      () => <MaterialsSpaceSlotPanel shell={shell} />
    );
  }
};

export default materialsSpaceClientPlugin;
