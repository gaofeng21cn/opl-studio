window.__ModuleLoader__.load({
  id: "@one-person-lab/opl-studio-client",
  factory: () => {
    const plugin = globalThis.__OPL_STUDIO_CLIENT__;
    if (!plugin || typeof plugin.apply !== "function") {
      throw new Error("opl-studio-client: static renderer did not publish the OPL client plugin");
    }
    return plugin;
  }
});
