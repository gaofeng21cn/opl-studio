window.__ModuleLoader__.load({
  id: "@gaofeng21cn/opl-codex-agents",
  factory: () => ({
    name: "opl-codex-workbench-navigation",
    inject: ["slots", "layout"],
    apply(ctx) {
      const panel = globalThis.__OPL_CODEX_WORKBENCH_INITIAL_PANEL__;
      if (!panel) return;
      let selected = false;
      const select = () => {
        if (selected || !ctx.slots.entries("main").some(entry => entry.options.key === panel)) return;
        selected = true;
        ctx.layout.selectPanel(panel);
      };
      ctx.effect(() => {
        const unsubscribe = ctx.slots.subscribe("main", select);
        select();
        return unsubscribe;
      }, "official workbench initial panel");
    }
  })
});
