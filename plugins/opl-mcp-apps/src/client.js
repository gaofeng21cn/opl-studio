window.__ModuleLoader__.load({
  id: "@one-person-lab/opl-mcp-apps",
  factory: () => {
    const plugin = globalThis.__OPL_MCP_APPS_CLIENT__;
    if (!plugin || typeof plugin.apply !== "function") throw new Error("opl-mcp-apps: client implementation unavailable");
    return plugin;
  }
});
