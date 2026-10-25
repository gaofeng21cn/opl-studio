import { EventEmitter } from "node:events";
import { createGuestRpc } from "./windows-guest-rpc.mjs";

const nativeMethods = new Set(["beginWindowDrag", "pickFiles", "pickDirectory", "classifyInputPaths", "releaseInputs", "notifyCompletion", "accessWorkspacePath"]);

// The same private stdio protocol backs the Windows guest and local Node Host.
export async function createGuestCoreProxy({ child, initialize, platform = {}, nativeUpdater, carrierDiagnostics,
  projectHostPath = value => value, projectGuestPath = value => value, closeChild = async () => {}, onProgress = () => {}, validateInitialize = () => {} }) {
  const core = new EventEmitter();
  let closing;
  let capabilities, codexCapabilities;
  const rpc = createGuestRpc({ input: child.stdout, output: child.stdin,
    onEvent: event => {
      if (event?.method === "host/availability" && typeof event.params?.available === "boolean") {
        if (capabilities) capabilities.appServerAvailable = event.params.available;
        if (codexCapabilities) codexCapabilities.available = event.params.available;
        if (core.transport) core.transport.initialized = event.params.available;
      }
      core.emit("event", event);
    },
    onRequest: async (method, request = {}) => {
      if (method !== "native") throw new Error("Unknown native Host request");
      if (request.method === "updater") {
        if (!["status", "check", "apply", "restart"].includes(request.payload?.operation)) throw new Error("Unknown native updater operation");
        return nativeUpdater.perform(request.payload.operation, request.payload.value);
      }
      if (request.method === "diagnostics.read") return carrierDiagnostics?.read();
      if (request.method === "diagnostics.openLogDirectory") return carrierDiagnostics?.openLogDirectory?.();
      if (request.method === "diagnostics.setLogDirectory") return carrierDiagnostics?.setLogDirectory(request.payload);
      const name = request.method?.startsWith("platform.") ? request.method.slice(9) : "";
      if (!nativeMethods.has(name) || typeof platform[name] !== "function") throw new Error("Native platform capability unavailable");
      let input = request.payload;
      if (name === "accessWorkspacePath") input = { ...input, path: await projectGuestPath(input.path) };
      const result = await platform[name](input);
      if (["pickFiles", "pickDirectory", "classifyInputPaths"].includes(name) && Array.isArray(result)) {
        return Promise.all(result.map(async item => ({ ...item, path: await projectHostPath(item.path) })));
      }
      return result;
    }
  });
  child.stderr.on("data", () => {}); // Guest diagnostics may contain user paths; never echo them into release logs.
  const disconnected = () => {
    if (capabilities) capabilities.appServerAvailable = false;
    if (codexCapabilities) codexCapabilities.available = false;
    if (core.transport) core.transport.initialized = false;
    rpc.close();
    core.emit("event", { method: "host/availability", params: { available: false, code: "guest_host_closed" } });
  };
  child.once("error", disconnected);
  child.once("close", disconnected);
  let initialized;
  const started = Date.now();
  onProgress({ stage: "validating_routes", elapsedSeconds: 0 });
  const progress = setInterval(() => onProgress({ stage: "validating_routes", elapsedSeconds: Math.floor((Date.now() - started) / 1000), heartbeat: true }), 15000);
  try {
    initialized = await rpc.request("initialize", initialize);
    await validateInitialize(initialized);
    onProgress({ stage: "ready", elapsedSeconds: Math.floor((Date.now() - started) / 1000) });
  } catch (cause) {
    child.stdin.end();
    await closeChild();
    throw cause;
  } finally { clearInterval(progress); }
  capabilities = initialized.capabilities;
  codexCapabilities = initialized.codex;
  // Domain owners retain their own execution deadlines. A private transport
  // deadline must not release their idle lease while a write is still running.
  core.invoke = async (method, payload = {}) => {
    // The updater belongs to the parent. Routing it through a draining guest
    // would deadlock when beforeRestart closes that same guest.
    const updateOperation = { readNativeAppUpdateStatus: "status", checkNativeAppUpdate: "check",
      applyNativeAppUpdate: "apply", restartNativeApp: "restart" }[method];
    if (updateOperation && nativeUpdater) return nativeUpdater.perform(updateOperation, payload);
    const result = await rpc.request("invoke", { method, payload }, { timeoutMs: 0 });
    return method === "readState" && core.updateMaintenance
      ? { ...result, managedUpdateMaintenance: core.updateMaintenance.snapshot() } : result;
  };
  core.capabilities = () => ({ ...capabilities });
  core.opl = {
    runManagedUpdate: operation => rpc.request("managedUpdate", { operation }, { timeoutMs: 0 }),
    runStartupMaintenance: () => rpc.request("startupMaintenance", {}, { timeoutMs: 0 })
  };
  core.transport = {
    initialized: initialized.capabilities.appServerAvailable,
    async runWhenIdle(operation) {
      const admission = await rpc.request("leaseAcquire");
      if (admission.status !== "held") return admission;
      try { return { status: "completed", result: await operation() }; }
      finally { if (!closing) await rpc.request("leaseRelease"); }
    }
  };
  core.codex = { transport: core.transport, capabilities: () => ({ ...codexCapabilities }),
    reloadConfiguration: options => rpc.request("reloadConfiguration", options, { timeoutMs: 0 }) };
  core.close = () => closing ??= (async () => {
    await core.updateMaintenance?.close();
    try { await rpc.request("close", {}, { timeoutMs: 0 }); } finally { child.stdin.end(); }
    await closeChild();
  })();
  return core;
}
