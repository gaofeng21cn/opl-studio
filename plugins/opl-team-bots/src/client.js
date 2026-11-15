window.__ModuleLoader__.load({
  id: "@one-person-lab/opl-team-bots",
  factory: () => {
    const plugin = globalThis.__OPL_TEAM_BOTS_CLIENT__;
    if (!plugin) throw new Error("OPL Team/Bot client was not included in this renderer.");
    return plugin;
  }
});
