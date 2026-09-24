import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { createGuestRpc } from "./windows-guest-rpc.mjs";

const nativeMethods = new Set(["beginWindowDrag", "pickFiles", "pickDirectory", "classifyInputPaths", "releaseInputs", "notifyCompletion", "accessWorkspacePath"]);

export function verifyGuestPayloadFiles(root, manifest) {
  const actual = [];
  const visit = relative => {
    for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (item.isSymbolicLink()) throw new Error("Windows guest Host payload contains a symbolic link");
      if (item.isDirectory()) visit(name);
      else if (item.isFile() && name !== "manifest.json") actual.push({ path: name,
        sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, name))).digest("hex") });
      else if (name !== "manifest.json") throw new Error("Windows guest Host payload contains an unsupported file");
    }
  };
  visit(""); actual.sort((a, b) => a.path.localeCompare(b.path));
  const declared = manifest.files;
  if (!Array.isArray(declared) || declared.length === 0 || !declared.every(entry => typeof entry.path === "string" && /^[0-9a-f]{64}$/.test(entry.sha256))) {
    throw new Error("Windows guest Host payload integrity manifest is missing");
  }
  if (JSON.stringify(actual) !== JSON.stringify([...declared].sort((a, b) => a.path.localeCompare(b.path)))) {
    throw new Error("Windows guest Host payload bytes differ from the packaged manifest");
  }
  if (actual.find(entry => entry.path === "package-lock.json")?.sha256 !== manifest.package_lock_sha256) {
    throw new Error("Windows guest Host payload lock digest mismatch");
  }
}

export async function createWindowsGuestHost({ windowsRuntime, resourcesPath, userDataPath, env = process.env,
  version, instanceId, canonicalThreadHost = os.hostname(), platform = {}, nativeUpdater, carrierDiagnostics, candidateActionAllowlist = [],
  readFile = fs.readFileSync, verifyPayload = verifyGuestPayloadFiles } = {}) {
  const runtime = await windowsRuntime.ensureReady();
  const hostRoot = path.join(resourcesPath, "opl-wsl-host");
  const manifest = JSON.parse(readFile(path.join(hostRoot, "manifest.json"), "utf8"));
  if (manifest.schema !== "opl_studio_windows_guest_host.v1" || manifest.platform !== "linux" || manifest.arch !== "x64"
    || manifest.entry !== "desktop/windows-guest-host.mjs" || !/^[0-9a-f]{40}$/.test(manifest.shell_ref)
    || !/^[0-9a-f]{64}$/.test(manifest.package_lock_sha256)) throw new Error("Packaged Windows guest Host manifest is invalid");
  verifyPayload(hostRoot, manifest);
  const guestRoot = await windowsRuntime.projectHostPath(hostRoot);
  const guestDataRoot = await windowsRuntime.projectHostPath(userDataPath);
  const child = windowsRuntime.spawnGuestHost(`${guestRoot}/desktop/windows-guest-host.mjs`, { env });
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
      if (request.method === "diagnostics.setLogDirectory") return carrierDiagnostics?.setLogDirectory(request.payload);
      const name = request.method?.startsWith("platform.") ? request.method.slice(9) : "";
      if (!nativeMethods.has(name) || typeof platform[name] !== "function") throw new Error("Native platform capability unavailable");
      let input = request.payload;
      if (name === "accessWorkspacePath") input = { ...input, path: await windowsRuntime.projectGuestPath(input.path) };
      const result = await platform[name](input);
      if (["pickFiles", "pickDirectory", "classifyInputPaths"].includes(name) && Array.isArray(result)) {
        return Promise.all(result.map(async item => ({ ...item, path: await windowsRuntime.projectHostPath(item.path) })));
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
  try {
    initialized = await rpc.request("initialize", { version, instanceId, canonicalThreadHost,
      identity: runtime.identity, guestDataRoot,
      channelBindingFile: `${guestDataRoot}/channel-transport-bindings.json`, candidateActionAllowlist });
  } catch (cause) {
    child.stdin.end();
    await windowsRuntime.close();
    throw cause;
  }
  capabilities = initialized.capabilities;
  codexCapabilities = initialized.codex;
  core.invoke = (method, payload = {}) => rpc.request("invoke", { method, payload });
  core.capabilities = () => ({ ...capabilities });
  core.opl = { runManagedUpdate: operation => rpc.request("managedUpdate", { operation }) };
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
    reloadConfiguration: options => rpc.request("reloadConfiguration", options) };
  core.close = () => closing ??= (async () => {
    await core.updateMaintenance?.close();
    try { await rpc.request("close"); } finally { child.stdin.end(); }
    await windowsRuntime.close();
  })();
  return core;
}
