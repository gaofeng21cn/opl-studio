import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { createGuestRpc } from "./windows-guest-rpc.mjs";

const nativeMethods = new Set(["beginWindowDrag", "pickFiles", "pickDirectory", "classifyInputPaths", "releaseInputs", "notifyCompletion", "accessWorkspacePath"]);

export async function verifyGuestPayloadFiles(root, manifest, { paths } = {}) {
  const declared = manifest.files;
  if (!Array.isArray(declared) || declared.length === 0 || !declared.every(entry => typeof entry.path === "string"
    && !entry.path.startsWith("/") && !entry.path.split("/").some(part => !part || part === "." || part === "..")
    && !/[\r\n\0]/.test(entry.path) && /^[0-9a-f]{64}$/.test(entry.sha256))) {
    throw new Error("Windows guest Host payload integrity manifest is missing");
  }
  const actual = [];
  const add = async name => {
    const stat = await fs.promises.lstat(path.join(root, name));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Windows guest Host payload contains a symbolic link or special file");
    actual.push({ path: name, sha256: crypto.createHash("sha256").update(await fs.promises.readFile(path.join(root, name))).digest("hex") });
  };
  const visit = async relative => {
    for (const item of await fs.promises.readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (item.isSymbolicLink()) throw new Error("Windows guest Host payload contains a symbolic link");
      if (item.isDirectory()) await visit(name);
      else if (item.isFile() && name !== "manifest.json") await add(name);
      else if (name !== "manifest.json") throw new Error("Windows guest Host payload contains an unsupported file");
    }
  };
  // Launch checks the archive and the code that admits it. The complete Host
  // closure is verified after extraction on ext4, rather than rereading unused
  // NTFS copies. Bootstrap separately checks every source it executes or copies.
  if (paths) {
    if (paths.some(name => !declared.some(entry => entry.path === name))) throw new Error("Windows guest Host payload admission path is missing");
    for (const name of paths) await add(name);
  } else await visit("");
  actual.sort((a, b) => a.path.localeCompare(b.path));
  const expected = paths ? declared.filter(entry => paths.includes(entry.path)) : declared;
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort((a, b) => a.path.localeCompare(b.path)))) {
    throw new Error("Windows guest Host payload bytes differ from the packaged manifest");
  }
  const lock = actual.find(entry => entry.path === "package-lock.json");
  if (lock && lock.sha256 !== manifest.package_lock_sha256) throw new Error("Windows guest Host payload lock digest mismatch");
}

export async function createWindowsGuestHost({ windowsRuntime, resourcesPath, userDataPath, env = process.env,
  version, instanceId, canonicalThreadHost = os.hostname(), platform = {}, nativeUpdater, carrierDiagnostics, candidateActionAllowlist = [],
  readFile = fs.readFileSync, verifyPayload = verifyGuestPayloadFiles, onProgress = () => {} } = {}) {
  const runtime = await windowsRuntime.ensureReady();
  const hostRoot = path.join(resourcesPath, "opl-wsl-host");
  const manifestBytes = readFile(path.join(hostRoot, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schema !== "opl_studio_windows_guest_host.v1" || manifest.platform !== "linux" || manifest.arch !== "x64"
    || manifest.entry !== "desktop/windows-guest-host.mjs" || !/^[0-9a-f]{40}$/.test(manifest.shell_ref)
    || !/^[0-9a-f]{64}$/.test(manifest.package_lock_sha256)) throw new Error("Packaged Windows guest Host manifest is invalid");
  await verifyPayload(hostRoot, manifest, { paths: ["guest-host.tar.gz", "desktop/windows-guest-stage.mjs", "package-lock.json"] });
  const guestRoot = await windowsRuntime.projectHostPath(hostRoot);
  const guestDataRoot = await windowsRuntime.projectHostPath(userDataPath);
  const entry = await windowsRuntime.stageGuestHost(guestRoot, crypto.createHash("sha256").update(manifestBytes).digest("hex"));
  const child = windowsRuntime.spawnGuestHost(entry, { env });
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
  const started = Date.now();
  onProgress({ stage: "validating_routes", elapsedSeconds: 0 });
  const progress = setInterval(() => onProgress({ stage: "validating_routes", elapsedSeconds: Math.floor((Date.now() - started) / 1000), heartbeat: true }), 15000);
  try {
    initialized = await rpc.request("initialize", { version, instanceId, canonicalThreadHost,
      identity: runtime.identity, guestDataRoot,
      channelBindingFile: `${guestDataRoot}/channel-transport-bindings.json`, candidateActionAllowlist });
    onProgress({ stage: "ready", elapsedSeconds: Math.floor((Date.now() - started) / 1000) });
  } catch (cause) {
    child.stdin.end();
    await windowsRuntime.close();
    throw cause;
  } finally { clearInterval(progress); }
  capabilities = initialized.capabilities;
  codexCapabilities = initialized.codex;
  core.invoke = (method, payload = {}) => rpc.request("invoke", { method, payload });
  core.capabilities = () => ({ ...capabilities });
  core.opl = {
    runManagedUpdate: operation => rpc.request("managedUpdate", { operation }),
    runStartupMaintenance: () => rpc.request("startupMaintenance")
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
    reloadConfiguration: options => rpc.request("reloadConfiguration", options) };
  core.close = () => closing ??= (async () => {
    await core.updateMaintenance?.close();
    try { await rpc.request("close"); } finally { child.stdin.end(); }
    await windowsRuntime.close();
  })();
  return core;
}
