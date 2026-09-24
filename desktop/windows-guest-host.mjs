import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGuestRpc } from "./windows-guest-rpc.mjs";
import { validateWindowsRuntimeIdentity } from "./windows-runtime.mjs";
import { captureOfficialProfileAdmission, startOfficialProfileFirstInstall } from "./official-profile.mjs";

export async function startWindowsGuestHost({ input = process.stdin, output = process.stdout, createCore,
  platform = process.platform, arch = process.arch } = {}) {
  if (platform !== "linux" || arch !== "x64") throw new Error("Windows guest Host requires Linux x64");
  let core, booting, closing, lease, profileOptions;
  const native = (method, payload) => rpc.request("native", { method, payload });
  const rpc = createGuestRpc({ input, output, onRequest: async (method, payload = {}) => {
    if (method === "initialize") {
      if (booting) return booting;
      booting = (async () => {
        const identity = validateWindowsRuntimeIdentity(payload.identity);
        if (typeof payload.canonicalThreadHost !== "string" || !payload.canonicalThreadHost.trim()
          || /[\r\n\0]/.test(payload.canonicalThreadHost)) throw new Error("Canonical Windows thread host is missing");
        if (typeof payload.guestDataRoot !== "string" || !payload.guestDataRoot.startsWith("/mnt/")
          || /[\r\n\0]/.test(payload.guestDataRoot)) throw new Error("Guest App data projection is invalid");
        const env = { ...process.env, HOME: "/home/opl", CODEX_HOME: "/home/opl/.codex",
          OPL_WORKSPACE_ROOT: "/home/opl/code", OPL_STUDIO_CODEX_CWD: "/home/opl/code",
          OPL_APP_OPL_BIN: identity.framework_path, OPL_CODEX_BIN: identity.codex_command_path,
          OPL_AIONUI_DATA_DIR: payload.guestDataRoot,
          OPL_APP_VERSION: String(payload.version ?? "unknown"), OPL_APP_PROCESS_INSTANCE_ID: String(payload.instanceId ?? ""),
          OPL_STUDIO_READ_ONLY: "0", PATH: "/home/opl/.opl/one-person-lab/bin:/home/opl/.npm-global/bin:/home/opl/.local/bin:/usr/local/bin:/usr/bin:/bin" };
        // Set process HOME as well: Framework profile imports read process.env.
        Object.assign(process.env, env);
        if (!createCore) ({ createOplHostCore: createCore } = await import("../scripts/webui-host/host-core.mjs"));
        core = await createCore({ env, workspaceRoot: "/home/opl/code", canonicalThreadHost: payload.canonicalThreadHost,
          channelBindingFile: payload.channelBindingFile,
          candidateActionAllowlist: payload.candidateActionAllowlist ?? [],
          platform: Object.fromEntries(["beginWindowDrag", "pickFiles", "pickDirectory", "classifyInputPaths", "releaseInputs", "notifyCompletion", "accessWorkspacePath"]
            .map(name => [name, value => native(`platform.${name}`, value)])),
          nativeUpdater: { perform: (operation, value) => native("updater", { operation, value }) },
          carrierDiagnostics: { read: () => native("diagnostics.read"), setLogDirectory: value => native("diagnostics.setLogDirectory", value) }
        });
        const admission = captureOfficialProfileAdmission({ homeDir: "/home/opl", env });
        profileOptions = { admission, resourcesPath: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../resources"),
          env, nodeCommand: "/usr/local/bin/node", readinessTimeoutMs: 0, readInitialize: () => core.invoke("readInitialize"),
          logEvent: result => rpc.emit({ method: "host/official-profile", params: { status: result.status } }) };
        core.on("event", value => rpc.emit(value));
        return { capabilities: core.capabilities(), codex: core.codex.capabilities() };
      })();
      return booting;
    }
    if (!core) throw Object.assign(new Error("Guest Host has not initialized"), { code: "guest_host_not_ready" });
    if (method === "invoke") {
      const result = await core.invoke(payload.method, payload.payload ?? {});
      if (payload.method === "readInitialize" && profileOptions?.admission.eligible) {
        void startOfficialProfileFirstInstall({ ...profileOptions, readInitialize: async () => result });
      }
      return result;
    }
    if (method === "managedUpdate") return core.opl.runManagedUpdate(payload.operation);
    if (method === "reloadConfiguration") return core.codex.reloadConfiguration(payload);
    if (method === "leaseRelease") { lease?.(); lease = undefined; return { released: true }; }
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
      lease?.(); lease = undefined;
      closing ??= core.close(); await closing;
      return { closed: true };
    }
    throw Object.assign(new Error("Unknown guest Host request"), { code: "guest_method_not_found" });
  } });
  rpc.events.on("close", () => { lease?.(); if (core) void core.close().catch(() => {}); });
  return { rpc, close: async () => { lease?.(); if (core) await core.close(); rpc.close(); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Reserve stdout exclusively for the private RPC pipe.
  for (const name of ["log", "info", "debug"]) console[name] = (...args) => console.error(...args);
  const host = await startWindowsGuestHost();
  process.stdin.once("end", () => { void host.close().finally(() => process.exit(0)); });
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { void host.close().finally(() => process.exit(0)); });
}
