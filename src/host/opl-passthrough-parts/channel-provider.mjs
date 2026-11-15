function validateChannelCallbackAdapter(adapter) {
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
    throw Object.assign(new Error("channel callback adapter must be an object"), { code: "invalid_request" });
  }
  for (const method of ["startThread", "resumeThread", "startTurn", "subscribeTurn"]) {
    if (typeof adapter[method] !== "function") {
      throw Object.assign(new Error(`channel callback adapter is missing ${method}`), { code: "invalid_request" });
    }
  }
  return adapter;
}

function validateChannelProviderHost(host) {
  if (!host || typeof host !== "object" || Array.isArray(host)) {
    throw Object.assign(new Error("channel callback registrar must return a Host handle"), { code: "invalid_request" });
  }
  for (const method of ["appStatePatch", "readChannelAccess", "executeChannelAccessAction", "dispose"]) {
    if (typeof host[method] !== "function") {
      throw Object.assign(new Error(`channel provider Host is missing ${method}`), { code: "invalid_request" });
    }
  }
  return host;
}

function channelAccessEntries(host) {
  if (!host) return [];
  const patch = host.appStatePatch();
  const entries = patch?.ui_contributions?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => entry?.view?.view_type === "channel_access");
}

function channelAccessEntry(host, packageId, ref, operation) {
  return channelAccessEntries(host).find((entry) => {
    if (
      entry?.package_id !== packageId
      || entry?.action_boundary !== "opl.connect.channel-provider-host"
    ) return false;
    if (operation === "read") return entry.view?.data_ref === ref;
    return Array.isArray(entry.commands)
      && entry.commands.some((command) => command?.action_ref === ref);
  });
}

function mergeChannelProviderState(value, host) {
  if (!host || !value?.app_state || typeof value.app_state !== "object") return value;
  const patch = host.appStatePatch();
  const hostProjection = patch?.ui_contributions;
  const transportBindings = patch?.transport_bindings;
  const hasHostProjection = hostProjection && typeof hostProjection === "object";
  const hasTransportBindings = transportBindings && typeof transportBindings === "object";
  if (!hasHostProjection && !hasTransportBindings) return value;
  let appState = {
    ...value.app_state,
    ...(hasTransportBindings ? { transport_bindings: transportBindings } : {})
  };
  if (hasHostProjection) {
    const currentProjection = value.app_state.ui_contributions;
    const currentEntries = Array.isArray(currentProjection?.entries) ? currentProjection.entries : [];
    const hostEntries = Array.isArray(hostProjection.entries) ? hostProjection.entries : [];
    const entries = [
      ...currentEntries.filter((entry) => entry?.view?.view_type !== "channel_access"),
      ...hostEntries
    ];
    appState = {
      ...appState,
      ui_contributions: {
        ...(currentProjection && typeof currentProjection === "object" ? currentProjection : {}),
        ...hostProjection,
        contribution_count: entries.length,
        entries
      }
    };
  }
  return {
    ...value,
    app_state: appState
  };
}

function hostActionReceipt(request, result) {
  return {
    actionId: request.actionId,
    dryRun: false,
    confirmationRequired: false,
    canExecute: true,
    receiptKind: "execute",
    authorityBoundary: "app_bridge_no_domain_authority",
    requestedMode: "execute",
    status: "executed",
    command: "opl.connect.channel-provider-host",
    commandArgs: [],
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
    payload: request.payload?.input && Object.hasOwn(request.payload.input, "verify_code")
      ? { ...request.payload, input: { ...request.payload.input, verify_code: "[redacted]" } }
      : request.payload,
    stdoutJson: result
  };
}

export {
  channelAccessEntry,
  hostActionReceipt,
  mergeChannelProviderState,
  validateChannelCallbackAdapter,
  validateChannelProviderHost
};
