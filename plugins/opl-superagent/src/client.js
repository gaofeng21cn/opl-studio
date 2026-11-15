window.__ModuleLoader__.load({
  id: "@one-person-lab/opl-superagent",
  factory: () => {
    const plugin = globalThis.__OPL_SUPERAGENT_CLIENT__;
    if (!plugin) throw new Error("OPL Superagent client was not included in this renderer.");
    return plugin;
  }
});
