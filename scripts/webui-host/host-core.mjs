import { EventEmitter } from "node:events";
import { createNativeAppUpdaterFromEnvironment } from "./native-app-updater.mjs";
import { OplCodexNative } from "./opl-codex-native.mjs";
import { OplFrameworkBridge } from "./opl-framework-bridge.mjs";
import { ThreadAdapterError } from "./thread-adapter.mjs";
import { createThreadWorkspaceService } from "./thread-workspace-service.mjs";

function unavailablePlatformCapability(capability) {
  return async () => {
    throw new ThreadAdapterError(
      "desktop_capability_unavailable",
      `${capability} is unavailable in this host`,
      { capability },
      501
    );
  };
}

function defaultPlatformServices() {
  return {
    beginWindowDrag: async () => ({ accepted: false, reasonCode: "host_window_drag_unavailable" }),
    pickFiles: unavailablePlatformCapability("pickFiles"),
    pickDirectory: unavailablePlatformCapability("pickDirectory")
  };
}

function defaultNativeUpdater() {
  return createNativeAppUpdaterFromEnvironment();
}

function unavailableCarrierDiagnostics(reasonCode = "carrier_log_directory_unavailable") {
  return {
    schema: "opl_app_carrier_diagnostics.v1",
    owner: "one-person-lab-app_native_host",
    carrier: "standalone_headless_webui",
    status: "unavailable",
    setLogDirectorySupported: false,
    reasonCode
  };
}

function unsupportedLogDirectoryUpdate(reasonCode = "desktop_host_required") {
  return {
    schema: "opl_app_log_directory_update.v1",
    owner: "one-person-lab-app_native_host",
    carrier: "standalone_headless_webui",
    action: "application.setLogDirectory",
    status: "unsupported",
    success: false,
    reasonCode
  };
}

function dockerCarrierConfirmed(env) {
  return env.HOME === "/data"
    && env.OPL_DATA_DIR === "/data"
    && env.OPL_WORKSPACE_ROOT === "/projects";
}

function defaultCarrierDiagnostics(env) {
  if (dockerCarrierConfirmed(env)) {
    return {
      read: async () => ({
        schema: "opl_app_carrier_diagnostics.v1",
        owner: "one-person-lab-app_native_host",
        carrier: "docker_webui",
        status: "available",
        application: { systemInfo: { logDir: "/data/logs" } },
        setLogDirectorySupported: false,
        reasonCode: "docker_log_directory_is_read_only"
      }),
      setLogDirectory: async () => unsupportedLogDirectoryUpdate("docker_log_directory_is_read_only")
    };
  }
  return {
    read: async () => unavailableCarrierDiagnostics(),
    setLogDirectory: async () => unsupportedLogDirectoryUpdate()
  };
}

export class OplHostCore extends EventEmitter {
  constructor({
    codex,
    framework,
    managedByDsh = false,
    platform = defaultPlatformServices(),
    nativeUpdater = defaultNativeUpdater(),
    carrierDiagnostics,
    threadWorkspace,
    env = process.env
  } = {}, legacyOptions) {
    super();
    const options = legacyOptions ?? arguments[0] ?? {};
    this.codex = codex ?? new OplCodexNative(options);
    this.framework = framework ?? new OplFrameworkBridge({ ...options, codex: this.codex });
    this.transport = this.codex.transport;
    this.threads = this.codex.threads;
    this.threadWorkspace = threadWorkspace ?? createThreadWorkspaceService({ threads: this.threads });
    this.opl = this.framework.opl;
    this.gatewayAccountLogin = this.framework.gatewayAccountLogin;
    this.codexApiKeyConfiguration = this.framework.codexApiKeyConfiguration;
    this.managedByDsh = managedByDsh;
    this.hostContext = null;
    this.platform = { ...defaultPlatformServices(), ...platform };
    this.nativeUpdater = nativeUpdater;
    this.carrierDiagnostics = carrierDiagnostics ?? defaultCarrierDiagnostics(env);
    this.closePromise = null;
    this.codex.on("event", (event) => this.emit("event", event));
  }

  async start() {
    await this.codex.start();
    await this.framework.start();
    return this.capabilities();
  }

  attachHostContext(context) {
    this.hostContext = context;
  }

  readHostPluginInventory() {
    const inventory = this.hostContext?.get("pluginInventory");
    if (!inventory || typeof inventory.list !== "function") {
      throw new ThreadAdapterError(
        "host_plugin_inventory_unavailable",
        "DSH Host plugin inventory is unavailable",
        {},
        503
      );
    }
    return inventory.list();
  }

  capabilities() {
    return {
      localHost: true,
      applicationHost: "deepseek_harness",
      dshProfile: "opl-studio",
      appServerAvailable: this.codex.capabilities().available,
      threadAdapter: this.codex.capabilities().threadAdapter,
      appServerError: this.codex.capabilities().appServerError,
      oplPassthrough: this.framework.capabilities()
    };
  }

  async invoke(method, payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ThreadAdapterError("invalid_request", "Host payload must be an object", {}, 400);
    }

    switch (method) {
      case "beginWindowDrag": return this.platform.beginWindowDrag();
      case "readHostPluginInventory": return this.readHostPluginInventory();
      case "readState": {
        const state = await this.opl.readState(payload.profile ?? "fast");
        let carrierDiagnostics;
        try {
          carrierDiagnostics = await this.carrierDiagnostics.read();
        } catch {
          carrierDiagnostics = unavailableCarrierDiagnostics("carrier_diagnostics_read_failed");
        }
        return { ...state, carrierDiagnostics };
      }
      case "readInitialize": return this.opl.readInitialize();
      case "readFullDrilldown": return this.opl.readFullDrilldown();
      case "readDomainDetailView": return this.opl.readDomainDetailView(payload);
      case "readContribution": return this.opl.readContribution(payload);
      case "executeAction": return this.opl.executeAction(payload);
      case "readCodexModels": return this.transport.listModels();
      case "readCodexCapabilities": return this.transport.listCapabilities(payload.threadId);
      case "readCodexPermissionProfiles": return this.transport.listPermissionProfiles();
      case "pickFiles": return this.platform.pickFiles(payload);
      case "pickDirectory": return this.platform.pickDirectory(payload);
      case "listThreadWorkspace": return this.threadWorkspace.list(payload);
      case "readThreadWorkspaceFile": return this.threadWorkspace.read(payload);
      case "searchThreadWorkspace": return this.threadWorkspace.search(payload);
      case "setLogDirectory": return this.carrierDiagnostics.setLogDirectory?.(payload)
        ?? unsupportedLogDirectoryUpdate();
      case "sendMessage": return this.transport.sendMessage(payload);
      case "listPendingServerRequests": return this.transport.listPendingServerRequests();
      case "respondToServerRequest": return this.transport.respondToServerRequest(payload?.id, payload?.response ?? {});
      case "steerTurn": return this.transport.steerMessage(payload);
      case "interruptTurn": return this.transport.interruptMessage(payload);
      case "loginGatewayAccount": return this.gatewayAccountLogin(payload);
      case "configureCodexApiKey": return this.codexApiKeyConfiguration(payload);
      case "readNativeAppUpdateStatus": return this.nativeUpdater.perform("status", payload);
      case "checkNativeAppUpdate": return this.nativeUpdater.perform("check", payload);
      case "applyNativeAppUpdate": return this.nativeUpdater.perform("apply", payload);
      case "restartNativeApp": return this.nativeUpdater.perform("restart", payload);
      case "listThreads": return this.threads.listThreads(payload);
      case "readThread": return this.threads.readThread(payload);
      case "resumeThread": return this.threads.resumeThread(payload);
      case "forkThread": return this.threads.forkThread(payload);
      case "renameThread": return this.threads.renameThread(payload);
      case "deleteThread": return this.threads.deleteThread(payload);
      case "setArchived": return this.threads.setArchived(payload);
      default:
        throw new ThreadAdapterError(
          "host_method_not_found",
          `Unknown host method: ${String(method)}`,
          { method },
          404
        );
    }
  }

  async close() {
    this.closePromise ??= (async () => {
      if (this.managedByDsh && this.hostContext) {
        await this.framework.close();
        await this.codex.close();
        await this.hostContext.fiber.dispose();
        return;
      }
      await this.framework.close();
      await this.codex.close();
    })();
    return this.closePromise;
  }
}

export async function createOplHostCore(options = {}) {
  const { bootOplStudioHost } = await import("./dsh/host.mjs");
  return (await bootOplStudioHost(options)).core;
}
