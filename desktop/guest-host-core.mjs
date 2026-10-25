import { createGuestRpc } from "./windows-guest-rpc.mjs";

export function nativeHostOptions(native) {
  return {
    platform: Object.fromEntries(["beginWindowDrag", "pickFiles", "pickDirectory", "classifyInputPaths", "releaseInputs", "notifyCompletion", "accessWorkspacePath"]
      .map(name => [name, value => native(`platform.${name}`, value)])),
    nativeUpdater: { perform: (operation, value) => native("updater", { operation, value }) },
    carrierDiagnostics: { read: () => native("diagnostics.read"), openLogDirectory: () => native("diagnostics.openLogDirectory"),
      setLogDirectory: value => native("diagnostics.setLogDirectory", value) }
  };
}

// One Host and one admission lease. The parent retains native desktop services.
export function startGuestHostCore({ input = process.stdin, output = process.stdout, createCore, prepare }) {
  let core, booting, closing, lease, afterInvoke;
  let activeOperations = 0, releaseRequested = false, drain;
  const releaseLease = () => {
    if (activeOperations !== 0) return false;
    lease?.(); lease = undefined; releaseRequested = false;
    return true;
  };
  const runOwnerOperation = async operation => {
    activeOperations++;
    try { return await operation(); }
    finally {
      activeOperations--;
      if (activeOperations === 0) {
        if (releaseRequested) releaseLease();
        drain?.(); drain = undefined;
      }
    }
  };
  const close = () => closing ??= (async () => {
    releaseRequested = true;
    if (activeOperations) await new Promise(resolve => { drain = resolve; });
    releaseLease();
    await booting?.catch(() => {});
    await core?.close();
  })();
  const native = (method, payload) => rpc.request("native", { method, payload });
  const rpc = createGuestRpc({ input, output, onRequest: async (method, payload = {}) => {
    if (method === "initialize") {
      booting ??= (async () => {
        const prepared = await prepare(payload, native, value => rpc.emit(value));
        core = await createCore(prepared.options);
        afterInvoke = prepared.afterInvoke;
        core.on("event", value => rpc.emit(value));
        return { capabilities: core.capabilities(), codex: core.codex.capabilities(), ...prepared.readback };
      })();
      return booting;
    }
    if (!core) throw Object.assign(new Error("Guest Host has not initialized"), { code: "guest_host_not_ready" });
    if (closing && method !== "close") throw Object.assign(new Error("Guest Host is closing"), { code: "guest_host_closing" });
    if (method === "invoke") {
      return runOwnerOperation(async () => {
        const result = await core.invoke(payload.method, payload.payload ?? {});
        await afterInvoke?.(payload.method, result, core);
        return result;
      });
    }
    if (method === "managedUpdate") return runOwnerOperation(() => core.opl.runManagedUpdate(payload.operation));
    if (method === "startupMaintenance") return runOwnerOperation(() => core.opl.runStartupMaintenance());
    if (method === "reloadConfiguration") return runOwnerOperation(() => core.codex.reloadConfiguration(payload));
    if (method === "leaseRelease") { releaseRequested = true; return { released: releaseLease(), reasonCode: activeOperations ? "owner_operation_pending" : undefined }; }
    if (method === "leaseAcquire") {
      if (lease) return { status: "deferred", reasonCode: "app_server_busy" };
      return new Promise((resolve, reject) => {
        const operation = core.transport.runWhenIdle(async () => {
          const held = new Promise(release => { lease = release; });
          resolve({ status: "held" });
          await held;
        });
        void operation.then(result => { if (result.status === "deferred") resolve(result); }, reject);
      });
    }
    if (method === "close") {
      await close();
      return { closed: true };
    }
    throw Object.assign(new Error("Unknown guest Host request"), { code: "guest_method_not_found" });
  } });
  rpc.events.on("close", () => { void close().catch(() => {}); });
  return { rpc, close: async () => { await close(); rpc.close(); } };
}
