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
  if (!host) return value;
  const nativeChannel = Boolean(host.replacedPackageIds?.length);
  if ((!value?.app_state || typeof value.app_state !== "object") && !nativeChannel) return value;
  const current = value?.app_state ?? {
    surface_kind: "opl_app_state.v1",
    schema_version: "opl_app_state.v1"
  };
  const patch = host.appStatePatch();
  const hostProjection = patch?.ui_contributions;
  const transportBindings = patch?.transport_bindings;
  const hasHostProjection = hostProjection && typeof hostProjection === "object";
  const hasTransportBindings = transportBindings && typeof transportBindings === "object";
  if (!hasHostProjection && !hasTransportBindings) return value;
  let appState = {
    ...current,
    ...(hasTransportBindings ? { transport_bindings: transportBindings } : {})
  };
  if (hasHostProjection) {
    const currentProjection = current.ui_contributions;
    const currentEntries = Array.isArray(currentProjection?.entries) ? currentProjection.entries : [];
    const hostEntries = Array.isArray(hostProjection.entries) ? hostProjection.entries : [];
    const entries = [
      ...currentEntries.filter((entry) => entry?.view?.view_type !== "channel_access"
        && !host.replacedPackageIds?.includes(entry?.package_id)),
      ...hostEntries
    ];
    appState = {
      ...appState,
      ...(nativeChannel && hostEntries.some(entry => host.replacedPackageIds.includes(entry.package_id))
        && !current.actions?.some(action => action.action_id === "package_contribution_execute")
        ? { actions: [...(current.actions ?? []), {
          action_id: "package_contribution_execute",
          label: "Run channel action",
          surface: "opl-studio:channel-provider",
          delegated_surface: "opl-studio:channel-provider",
          payload_fields: ["package_id", "ref", "input", "confirmed"],
          dry_run_supported: true,
          confirmation_required: true,
          mutates: "studio_native_channel"
        }] }
        : {}),
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
