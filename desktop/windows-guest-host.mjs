import path from "node:path";
import { fileURLToPath } from "node:url";
import { nativeHostOptions, startGuestHostCore } from "./guest-host-core.mjs";
import { validateWindowsRuntimeIdentity } from "./windows-runtime.mjs";
import { captureOfficialProfileAdmission, startOfficialProfileFirstInstall } from "./official-profile.mjs";

export async function startWindowsGuestHost({ input = process.stdin, output = process.stdout, createCore,
  platform = process.platform, arch = process.arch } = {}) {
  if (platform !== "linux" || arch !== "x64") throw new Error("Windows guest Host requires Linux x64");
  let profileOptions;
  return startGuestHostCore({ input, output,
    createCore: async options => {
      if (!createCore) ({ createOplHostCore: createCore } = await import("../src/host/create-host.mjs"));
      return createCore(options);
    },
    prepare: async (payload, native, emit) => {
        const identity = validateWindowsRuntimeIdentity(payload.identity);
        if (typeof payload.canonicalThreadHost !== "string" || !payload.canonicalThreadHost.trim()
          || /[\r\n\0]/.test(payload.canonicalThreadHost)) throw new Error("Canonical Windows thread host is missing");
        if (typeof payload.guestDataRoot !== "string" || !payload.guestDataRoot.startsWith("/mnt/")
          || /[\r\n\0]/.test(payload.guestDataRoot)) throw new Error("Guest App data projection is invalid");
        const env = { ...process.env, HOME: "/home/opl", CODEX_HOME: "/home/opl/.codex",
          OPL_WORKSPACE_ROOT: "/home/opl/code", OPL_STUDIO_CODEX_CWD: "/home/opl/code",
          OPL_APP_OPL_BIN: identity.framework_path, OPL_CODEX_BIN: identity.codex_command_path,
          OPL_FRAMEWORK_PACKAGE_ROOT: path.dirname(path.dirname(identity.framework_path)),
          OPL_FRAMEWORK_UPDATE_TARGET_ROOT: path.dirname(path.dirname(identity.framework_path)),
          OPL_OFFICIAL_PROFILE_RESOURCES: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../resources"),
          OPL_DATA_DIR: payload.guestDataRoot,
          OPL_APP_VERSION: String(payload.version ?? "unknown"), OPL_APP_PROCESS_INSTANCE_ID: String(payload.instanceId ?? ""),
          OPL_APP_HOST_KIND: "desktop", OPL_STUDIO_READ_ONLY: "0", PATH: "/home/opl/.opl/one-person-lab/bin:/home/opl/.npm-global/bin:/home/opl/.local/bin:/usr/local/bin:/usr/bin:/bin" };
        // Set process HOME as well: Framework profile imports read process.env.
        Object.assign(process.env, env);
        const options = { env, workspaceRoot: "/home/opl/code", canonicalThreadHost: payload.canonicalThreadHost,
          channelBindingFile: payload.channelBindingFile,
          candidateActionAllowlist: payload.candidateActionAllowlist ?? [],
          ...nativeHostOptions(native)
        };
        const admission = captureOfficialProfileAdmission({ homeDir: "/home/opl", env });
        profileOptions = { admission, resourcesPath: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../resources"),
          env, nodeCommand: "/usr/local/bin/node", readinessTimeoutMs: 0, logEvent: result => emit({ method: "host/official-profile", params: { status: result.status } }) };

      return { options, afterInvoke(method, result) {
        if (method === "readInitialize" && profileOptions?.admission.eligible) {
          void startOfficialProfileFirstInstall({ ...profileOptions, readInitialize: async () => result });
        }
      } };
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Reserve stdout exclusively for the private RPC pipe.
  for (const name of ["log", "info", "debug"]) console[name] = (...args) => console.error(...args);
  const host = await startWindowsGuestHost();
  process.stdin.once("end", () => { void host.close().finally(() => process.exit(0)); });
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { void host.close().finally(() => process.exit(0)); });
}
