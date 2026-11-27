import path from "node:path";
import { checkRegistryUpdates, manageExternalNpmDshPlugin, updateRegistryPlugins } from "@gaofeng21cn/opl-host-kit/profile-plugin-updates";
import { clearProfileBootRecovery, readProfileBootRecovery } from "@gaofeng21cn/opl-host-kit/profile-boot-recovery";
import {
  appendDshPluginActivity,
  buildDshPluginCatalog,
  externalPluginEntryFromBillionContext,
  findDshPluginDescriptor,
  readUserExternalDshPlugins,
  setOptionalPluginEnabled,
  validateExternalDshPackageName
} from "@gaofeng21cn/opl-host-kit/dsh-plugin-catalog";
import { createSettingsSearchLog } from "./settings-search-log.mjs";
import { EventEmitter } from "node:events";
import { createNativeAppUpdaterFromEnvironment } from "./native-app-updater.mjs";
import { ThreadAdapterError } from "@gaofeng21cn/opl-host-contracts/thread-error";
import { createLinkCompanion } from "./link-companion.mjs";
import { createLinkInternet, readLinkGatewayAccount } from "./link-internet.mjs";
import { createThreadWorkspaceService } from "./thread-workspace-service.mjs";
import { Peer } from "@deepseek-ai/dsh-client-connection";

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
    pickDirectory: unavailablePlatformCapability("pickDirectory"),
    classifyInputPaths: unavailablePlatformCapability("classifyInputPaths"),
    releaseInputs: async () => undefined,
    notifyCompletion: async () => undefined,
    accessWorkspacePath: unavailablePlatformCapability("accessWorkspacePath")
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

export const CLIENT_ONLY_DSH_PACKAGES = new Set([
  "@gaofeng21cn/opl-studio-client",
  "@gaofeng21cn/opl-runtime-status"
]);

/**
 * Reports whether an update batch can safely apply via lightweight renderer reload.
 * First-time carrier-to-profile overrides still resolve outside `dshProfileDir/node_modules`
 * until the host process restarts, so those and any server/mixed updates honestly require restart.
 */
export async function classifyAndRefreshDshPluginUpdate({ installed, dshProfileDir, clientModules }) {
  const installedNames = Object.keys(installed ?? {});
  if (installedNames.length === 0) return "restart_required";
  if (installedNames.some((pkg) => !CLIENT_ONLY_DSH_PACKAGES.has(pkg))) return "restart_required";
  if (typeof dshProfileDir !== "string" || !dshProfileDir.trim()) return "restart_required";
  if (!clientModules || typeof clientModules.clientPath !== "function" || typeof clientModules.rebuilt !== "function") {
    return "restart_required";
  }
  const profileNodeModules = path.resolve(dshProfileDir, "node_modules");
  for (const pkg of installedNames) {
    const resolved = clientModules.clientPath(pkg);
    if (typeof resolved !== "string" || !resolved) return "restart_required";
    const rel = path.relative(profileNodeModules, path.resolve(resolved));
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return "restart_required";
    try {
      const rev = await clientModules.rebuilt(pkg);
      if (!rev) return "restart_required";
    } catch {
      return "restart_required";
    }
  }
  return "renderer_reload";
}

export class OplHostCore extends EventEmitter {
  constructor({
    codex,
    framework,
    mcpApps,
    managedByDsh = false,
    platform = defaultPlatformServices(),
    nativeUpdater = defaultNativeUpdater(),
    carrierDiagnostics,
    threadWorkspace,
    connectionAccessApproval,
    env = process.env
  } = {}) {
    super();
    const options = arguments[0] ?? {};
    if (!codex || !framework || !mcpApps) {
      throw new TypeError("OPL Host Core requires the Codex, Framework and MCP Apps services from its Cordis profile");
    }
    this.codex = codex;
    this.framework = framework;
    this.transport = this.codex.transport;
    this.mcpApps = mcpApps;
    this.threads = this.codex.threads;
    this.threadWorkspace = threadWorkspace ?? createThreadWorkspaceService({ threads: this.threads });
    this.opl = this.framework.opl;
    this.gatewayAccountLogin = this.framework.gatewayAccountLogin;
    this.codexApiKeyConfiguration = this.framework.codexApiKeyConfiguration;
    this.connectionAccessApproval = connectionAccessApproval ?? this.framework.connectionAccessApproval
      ?? (async () => ({ ok: false, errorCode: "connection_authorization_approval_unavailable" }));
    this.managedByDsh = managedByDsh;
    this.hostContext = null;
    this.platform = { ...defaultPlatformServices(), ...platform };
    this.nativeUpdater = nativeUpdater;
    this.carrierDiagnostics = carrierDiagnostics ?? defaultCarrierDiagnostics(env);
    this.settingsSearchLog = options.dshHome
      ? createSettingsSearchLog({ dshHome: options.dshHome, allowOpen: options.settingsSearchLogOpenAllowed === true })
      : async () => ({ status: 503, body: JSON.stringify({ ok: false, reason: "dsh-home-unavailable" }) });
    this.linkOptions = { env, webAuth: options.webAuth, stagedInputs: options.stagedInputs };
    this.linkInternetFactory = options.linkInternetFactory ?? createLinkInternet;
    this.readLinkAccount = options.readLinkAccount ?? (options.linkInternetFactory || env.NODE_TEST_CONTEXT
      ? undefined
      : () => readLinkGatewayAccount(env));
    this.closePromise = null;
    this.manualUpdateOperations = new Set();
    this.externalPluginAdapters = new Map([
      ["billion-context", {
        readEntry: async () => {
          try {
            return externalPluginEntryFromBillionContext(this.codex.readBillionContext());
          } catch {
            return externalPluginEntryFromBillionContext(undefined);
          }
        },
        execute: async (operation) => {
          const result = operation === "enable" || operation === "disable"
            ? await this.codex.setBillionContext({ enabled: operation === "enable" })
            : await this.codex.manageBillionContext({ operation });
          const staged = Boolean(result.pendingOperation) || result.active !== result.enabled;
          return {
            staged,
            targetVersion: result.pendingVersion ?? result.version ?? null,
            installed: Boolean(result.installed),
            updateAvailable: Boolean(result.updateAvailable)
          };
        }
      }]
    ]);
    this.codex.on("event", (event) => this.emit("event", event));
  }

  async start() {
    await this.codex.start();
    const studioWeixin = this.hostContext?.get("oplWeixinChannel");
    const disabledAtBoot = this.hostContext?.get("oplStudioHostOptions")?.dshDisabledAtBoot ?? [];
    // A disabled native plugin keeps channel ownership so that the old Framework
    // Package cannot silently resume polling after a disable/restart.
    await this.framework.start(studioWeixin ?? (disabledAtBoot.includes("opl-channel-weixin") ? null : undefined));
    const webServer = this.hostContext?.get("webServer");
    if (webServer) {
      this.linkInternet = await this.linkInternetFactory({
        env: this.linkOptions.env, handle: (...args) => this.linkCompanion.handleAuthenticatedPeer(...args),
        readAccount: this.readLinkAccount,
        onAccountChanged: options => this.linkCompanion.clearRemoteDevices(options)
      });
      this.linkCompanion = await createLinkCompanion({ hostCore: this, ...this.linkOptions, internet: this.linkInternet });
      this.disposeLinkRoutes = this.linkCompanion.register(webServer);
      this.linkInternet.startAccountLifecycle?.();
    }
    return this.capabilities();
  }

  attachHostContext(context) {
    this.hostContext = context;
  }

  get materialsSpace() {
    const service = this.hostContext?.get("oplMaterialsSpace");
    if (!service) throw new ThreadAdapterError("materials_space_unavailable", "Materials Space service is unavailable in this host", {}, 503);
    return service;
  }

  async executeAction(payload) {
    if (this.closePromise) throw new Error("Application is closing");
    if (payload?.actionId === "link_disable_internet") {
      // Older desktop preloads only expose the generic action channel.
      if (payload.mode !== "execute" || payload.dryRun !== false || payload.payload?.confirmed !== true) {
        throw new ThreadAdapterError("invalid_request", "Turning off phone access requires explicit execution", {}, 400);
      }
      await this.invoke("disableLinkInternet");
      return {
        actionId: payload.actionId, dryRun: false, confirmationRequired: false, canExecute: true,
        receiptKind: "execute", requestedMode: "execute", authorityBoundary: "app_bridge_no_domain_authority",
        status: "executed", command: "", commandArgs: [], exitCode: 0, stdout: "", stderr: "", timedOut: false
      };
    }
    const updateActions = ["settings_apply_opl_base_update", "settings_apply_opl_packages", "agent_package_install", "agent_package_update", "agent_package_repair", "agent_package_uninstall", "agent_package_preferences_set", "install_from_manifest_url", "official_profile_restore"];
    if (payload?.dryRun === false && updateActions.includes(payload?.actionId) && this.transport.runWhenIdle) {
      const operation = this.transport.runWhenIdle(async () => {
        const receipt = await this.opl.executeAction(payload);
        if (payload.actionId !== "settings_apply_opl_base_update" && receipt.status === "executed" && receipt.exitCode === 0) {
          await this.codex.reloadConfiguration({ maintenanceHeld: true });
        }
        return receipt;
      });
      this.manualUpdateOperations.add(operation);
      let lease;
      try { lease = await operation; }
      finally { this.manualUpdateOperations.delete(operation); }
      if (lease.status === "completed") {
        if (lease.result?.status === "executed") this.emit("event", { method: "host/app-state-changed", params: { actionId: payload.actionId } });
        return lease.result;
      }
      return { actionId: payload.actionId, dryRun: false, status: "error", receiptKind: "execute", canExecute: false,
        confirmationRequired: false, command: "", commandArgs: [], timedOut: false,
        reasonCode: "app_server_busy", exitCode: -1, stderr: "app_server_busy", stdout: "" };
    }
    const receipt = await this.opl.executeAction(payload);
    if (
      payload?.actionId === "gateway_account_use_for_model_access"
      && payload?.dryRun === false
      && receipt?.status === "executed"
      && receipt?.exitCode === 0
    ) {
      await this.#reloadCodexConfiguration({ deferredReasonCode: "gateway_model_access_refresh_deferred" });
    }
    if (payload?.dryRun === false && payload.actionId === "gateway_account_disconnect") {
      this.linkInternet?.synchronizeAccount?.({ reset: true }).catch(() => {});
    }
    if (payload?.dryRun === false && receipt?.status === "executed") this.emit("event", { method: "host/app-state-changed", params: { actionId: payload.actionId } });
    return receipt;
  }

  async configureCodexApiKey(payload) {
    const result = await this.codexApiKeyConfiguration(payload);
    if (result?.ok === true) await this.#reloadCodexConfiguration({ deferredReasonCode: "codex_configuration_refresh_deferred" });
    return result;
  }

  // The Framework credential write already succeeded through its atomic merge.
  // Reloading the live app-server is a separate, deferrable step: if a turn or
  // request is in flight the server is busy, so we must not surface that as a
  // failed save. Wait for the quiescent transition and then reload, and keep a
  // busy signal as a deferrable event rather than an error the renderer reads as
  // "the key was not stored".
  async #reloadCodexConfiguration({ deferredReasonCode }) {
    const reportFailure = (error) => this.emit("event", {
      method: "host/codex-configuration-refresh-failed",
      params: { reasonCode: error?.code ?? "codex_configuration_refresh_failed" }
    });
    try {
      if (typeof this.transport?.scheduleWhenIdle === "function") {
        const reload = () => this.codex.reloadConfiguration({ maintenanceHeld: true });
        // Acquire the immediate lease before yielding so another turn cannot
        // turn an apparently idle save into an unbounded wait.
        const immediate = await this.transport.runWhenIdle(reload);
        if (immediate.status === "deferred") {
          this.emit("event", { method: "host/codex-configuration-refresh-deferred", params: { reasonCode: deferredReasonCode } });
          void this.transport.scheduleWhenIdle(reload).catch(reportFailure);
        }
      } else {
        await this.codex.reloadConfiguration();
      }
    } catch (error) {
      // A reload failure cannot reverse the already committed credential write.
      reportFailure(error);
    }
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

  readClientModuleGraph() {
    const modules = this.hostContext?.get("clientModules");
    if (!modules || typeof modules.graph !== "function") {
      throw new ThreadAdapterError(
        "client_module_registry_unavailable",
        "DSH client module registry is unavailable",
        {},
        503
      );
    }
    return modules.graph();
  }

  async readClientModuleBoot() {
    const webServer = this.hostContext?.get("webServer");
    if (!webServer || typeof webServer.collectIndexInjections !== "function") {
      throw new ThreadAdapterError("client_module_registry_unavailable", "DSH client module boot injections are unavailable", {}, 503);
    }
    const peer = new Peer(this.hostContext, { principal: { kind: "owner" }, interactions: "none" });
    try { return webServer.collectIndexInjections(peer); }
    finally { await peer.dispose(); }
  }

  async readClientModuleBundle(payload = {}) {
    const modules = this.hostContext?.get("clientModules");
    const resource = typeof payload?.url === "string" ? payload.url : "";
    if (!modules || typeof modules.fetchBundle !== "function") {
      throw new ThreadAdapterError("client_module_registry_unavailable", "DSH client module registry is unavailable", {}, 503);
    }
    const url = new URL(resource || "/", "http://opl-client-modules.local");
    if (!resource.startsWith("/plugins/") || url.origin !== "http://opl-client-modules.local" || !url.pathname.startsWith("/plugins/")) {
      throw new ThreadAdapterError("invalid_request", "A DSH client module resource path is required", {}, 400);
    }
    if (payload.method !== undefined && !["GET", "HEAD"].includes(payload.method)) {
      throw new ThreadAdapterError("invalid_request", "A DSH client resource supports GET or HEAD only", {}, 400);
    }
    const response = await modules.fetchBundle(new Request(url.href, {
      method: payload.method ?? "GET",
      headers: typeof payload.ifNoneMatch === "string" ? { "if-none-match": payload.ifNoneMatch } : {}
    }));
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()).toString("base64")
    };
  }

  async updateDshPlugins(payload = {}) {
    const options = this.hostContext?.get("oplStudioHostOptions");
    if (!options?.dshHome || !options?.dshInstallAnchor) {
      throw new ThreadAdapterError("dsh_profile_unavailable", "The active DSH profile is unavailable", {}, 503);
    }
    const names = Array.isArray(payload.packages) ? payload.packages : undefined;
    const result = await updateRegistryPlugins({
      home: options.dshHome,
      installAnchor: options.dshInstallAnchor,
      names,
      all: payload.all === true,
      token: undefined,
      cwd: path.dirname(options.dshInstallAnchor)
    });
    const installedCount = Object.keys(result.installed ?? {}).length;
    const reloadMode = installedCount > 0
      ? await classifyAndRefreshDshPluginUpdate({
          installed: result.installed,
          dshProfileDir: options.dshProfileDir,
          clientModules: this.hostContext?.get("clientModules")
        })
      : undefined;
    if (result.application === "restart-required" || installedCount > 0) {
      if (Object.keys(result.failures ?? {}).length === 0) {
        clearProfileBootRecovery(options.dshProfileDir);
        this.profileBootRecovery = null;
      }
      this.emit("event", {
        method: "host/dsh-plugins-updated",
        params: { installed: result.installed ?? {}, reloadMode: reloadMode ?? "restart_required" }
      });
    }
    const now = new Date().toISOString();
    for (const [packageName, targetVersion] of Object.entries(result.installed ?? {})) {
      await appendDshPluginActivity(options.dshProfileDir, {
        packageName,
        action: "update",
        status: reloadMode === "renderer_reload" ? "completed" : "staged_restart",
        startedAt: now,
        finishedAt: now,
        targetVersion,
        restartRequired: reloadMode !== "renderer_reload"
      });
    }
    for (const [packageName, detail] of Object.entries(result.failures ?? {})) {
      await appendDshPluginActivity(options.dshProfileDir, {
        packageName,
        action: "update",
        status: "failed",
        startedAt: now,
        finishedAt: now,
        detail
      });
    }
    const baseResult = reloadMode === "renderer_reload"
      ? { ...result, application: "renderer-reload", reloadMode }
      : (reloadMode ? { ...result, reloadMode } : result);
    return baseResult;
  }

  async readDshPluginCatalog(payload = {}) {
    const options = this.hostContext?.get("oplStudioHostOptions");
    if (!options?.dshHome || !options?.dshInstallAnchor) {
      throw new ThreadAdapterError("dsh_profile_unavailable", "The active DSH profile is unavailable", {}, 503);
    }
    if (payload?.includeUpdates === true) {
      try {
        const projection = await checkRegistryUpdates({
          home: options.dshHome,
          installAnchor: options.dshInstallAnchor,
          cwd: path.dirname(options.dshInstallAnchor)
        });
        const profileBootRecovery = this.profileBootRecovery ?? readProfileBootRecovery(options.dshProfileDir);
        this.latestDshPluginUpdates = profileBootRecovery ? { ...projection, profileBootRecovery } : projection;
      } catch {
        // Keep catalog read usable offline when feed checks fail.
      }
    }
    const externalEntries = await Promise.all(
      [...this.externalPluginAdapters.values()].map(adapter => adapter.readEntry().catch(() => null))
    );
    return buildDshPluginCatalog({
      dshProfileDir: options.dshProfileDir,
      dshInstallAnchor: options.dshInstallAnchor,
      disabledAtBoot: options.dshDisabledAtBoot,
      activeExternalPlugins: options.dshActiveExternalPlugins,
      activeExternalPluginVersions: options.dshActiveExternalPluginVersions,
      nativeWeixin: this.framework.hasNativeWeixinChannel?.() === true,
      externalEntries: externalEntries.filter(Boolean),
      updateProjection: this.latestDshPluginUpdates
    });
  }

  async syncAllDshPluginUpdates() {
    const options = this.hostContext?.get("oplStudioHostOptions");
    if (!options?.dshHome || !options?.dshInstallAnchor || !options?.dshProfileDir) {
      throw new ThreadAdapterError("dsh_profile_unavailable", "The active DSH profile is unavailable", {}, 503);
    }
    const primary = await this.updateDshPlugins({ all: true });
    const externalStaged = [];
    const activeExternal = new Set(options.dshActiveExternalPlugins ?? []);
    const now = new Date().toISOString();

    for (const [pluginId, adapter] of this.externalPluginAdapters.entries()) {
      try {
        const state = await adapter.readEntry();
        if (!state?.installed) continue;
        await adapter.execute("check").catch(() => undefined);
        const latest = await adapter.readEntry();
        if (latest?.updateAvailable && !latest.pendingOperation) {
          const outcome = await adapter.execute("update");
          if (outcome?.staged || outcome?.targetVersion) {
            externalStaged.push(pluginId);
            await appendDshPluginActivity(options.dshProfileDir, {
              pluginId,
              action: "update",
              status: "staged_restart",
              startedAt: now,
              finishedAt: new Date().toISOString(),
              targetVersion: outcome.targetVersion,
              restartRequired: true
            });
          }
        }
      } catch {
        // Keep background maintenance resilient if a single third-party source is unreachable.
      }
    }

    const userExternal = readUserExternalDshPlugins(options.dshProfileDir);
    for (const record of Object.values(userExternal)) {
      if (record.pendingOperation === "remove") continue;
      try {
        const check = await manageExternalNpmDshPlugin({
          home: options.dshHome,
          installAnchor: options.dshInstallAnchor,
          dir: options.dshProfileDir,
          packageName: record.packageName,
          operation: "check",
          activeAtBoot: activeExternal.has(record.packageName)
        });
        if (check.updateAvailable) {
          const outcome = await manageExternalNpmDshPlugin({
            home: options.dshHome,
            installAnchor: options.dshInstallAnchor,
            dir: options.dshProfileDir,
            packageName: record.packageName,
            operation: "update",
            activeAtBoot: activeExternal.has(record.packageName)
          });
          if (outcome.staged) {
            externalStaged.push(record.packageName);
            await appendDshPluginActivity(options.dshProfileDir, {
              pluginId: record.packageName,
              packageName: record.packageName,
              labelI18n: record.labelI18n,
              action: "update",
              status: "staged_restart",
              startedAt: now,
              finishedAt: new Date().toISOString(),
              targetVersion: outcome.version,
              restartRequired: true
            });
          } else if (outcome.updated) {
            await appendDshPluginActivity(options.dshProfileDir, {
              pluginId: record.packageName,
              packageName: record.packageName,
              labelI18n: record.labelI18n,
              action: "update",
              status: "completed",
              startedAt: now,
              finishedAt: new Date().toISOString(),
              targetVersion: outcome.version,
              restartRequired: false
            });
          }
        }
      } catch {
        // Keep community npm plugin check failures isolated.
      }
    }

    if (externalStaged.length === 0) return primary;
    return {
      ...primary,
      externalStaged,
      application: "restart-required",
      reloadMode: "restart_required"
    };
  }

  async manageDshPlugin(payload = {}) {
    const options = this.hostContext?.get("oplStudioHostOptions");
    if (!options?.dshHome || !options?.dshInstallAnchor || !options?.dshProfileDir) {
      throw new ThreadAdapterError("dsh_profile_unavailable", "The active DSH profile is unavailable", {}, 503);
    }
    const { pluginId, packageName, operation } = payload;
    const allowedOps = ["install", "update", "remove", "enable", "disable", "check", "cancel_pending"];
    if (!allowedOps.includes(operation)) {
      throw new ThreadAdapterError("invalid_request", `Unsupported DSH plugin operation: ${String(operation)}`, { operation }, 400);
    }
    const startedAt = new Date().toISOString();
    const descriptor = findDshPluginDescriptor(pluginId ?? packageName);

    if (descriptor?.tier === "core_runtime") {
      if (operation === "update") {
        await this.updateDshPlugins({ packages: [descriptor.packageName] });
        return this.readDshPluginCatalog({ includeUpdates: true });
      }
      throw new ThreadAdapterError("dsh_plugin_core_required", "Core DSH runtime plugins cannot be disabled or removed", { pluginId: descriptor.pluginId }, 409);
    }

    const adapterId = descriptor?.pluginId ?? pluginId;
    const adapter = adapterId ? this.externalPluginAdapters.get(adapterId) : undefined;
    if (adapter) {
      try {
        const result = await adapter.execute(operation);
        if (operation !== "check") {
          await appendDshPluginActivity(options.dshProfileDir, {
            pluginId: descriptor?.pluginId ?? adapterId,
            packageName: descriptor?.packageName ?? adapterId,
            labelI18n: descriptor?.labelI18n,
            action: operation,
            status: result?.staged ? "staged_restart" : "completed",
            startedAt,
            finishedAt: new Date().toISOString(),
            targetVersion: result?.targetVersion,
            restartRequired: Boolean(result?.staged)
          });
        }
      } catch (error) {
        await appendDshPluginActivity(options.dshProfileDir, {
          pluginId: descriptor?.pluginId ?? adapterId,
          packageName: descriptor?.packageName ?? adapterId,
          labelI18n: descriptor?.labelI18n,
          action: operation,
          status: "failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          detail: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
      return this.readDshPluginCatalog();
    }

    if (descriptor) {
      if (operation === "enable" || operation === "disable") {
        await setOptionalPluginEnabled(options.dshProfileDir, descriptor.pluginId, operation === "enable");
        const disabledAtBoot = new Set(options.dshDisabledAtBoot ?? []);
        const wasActive = !disabledAtBoot.has(descriptor.pluginId);
        const nextEnabled = operation === "enable";
        const restartRequired = nextEnabled !== wasActive;
        await appendDshPluginActivity(options.dshProfileDir, {
          pluginId: descriptor.pluginId,
          packageName: descriptor.packageName,
          action: operation,
          status: restartRequired ? "staged_restart" : "completed",
          startedAt,
          finishedAt: new Date().toISOString(),
          restartRequired
        });
        return this.readDshPluginCatalog();
      }
      if (operation === "update") {
        await this.updateDshPlugins({ packages: [descriptor.packageName] });
        return this.readDshPluginCatalog({ includeUpdates: true });
      }
      if (operation === "check") {
        return this.readDshPluginCatalog({ includeUpdates: true });
      }
      throw new ThreadAdapterError("dsh_plugin_operation_unsupported", "Bundled optional plugin does not support install or uninstall", { pluginId: descriptor.pluginId, operation }, 409);
    }

    let validatedPkg;
    try {
      validatedPkg = validateExternalDshPackageName(packageName ?? pluginId);
    } catch (error) {
      throw new ThreadAdapterError("invalid_request", error instanceof Error ? error.message : `Unknown DSH plugin: ${String(pluginId)}`, { pluginId, packageName }, 400);
    }
    const activeExternal = new Set(options.dshActiveExternalPlugins ?? []);
    try {
      const result = await manageExternalNpmDshPlugin({
        home: options.dshHome,
        installAnchor: options.dshInstallAnchor,
        dir: options.dshProfileDir,
        packageName: validatedPkg,
        operation,
        activeAtBoot: activeExternal.has(validatedPkg)
      });
      if (operation !== "check") {
        const record = readUserExternalDshPlugins(options.dshProfileDir)[validatedPkg];
        await appendDshPluginActivity(options.dshProfileDir, {
          pluginId: validatedPkg,
          packageName: validatedPkg,
          labelI18n: record?.labelI18n ?? { zh: validatedPkg, en: validatedPkg },
          action: operation,
          status: result.restartRequired ? "staged_restart" : "completed",
          startedAt,
          finishedAt: new Date().toISOString(),
          targetVersion: result.version,
          restartRequired: Boolean(result.restartRequired)
        });
      }
      return this.readDshPluginCatalog();
    } catch (error) {
      await appendDshPluginActivity(options.dshProfileDir, {
        pluginId: validatedPkg,
        packageName: validatedPkg,
        action: operation,
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        detail: error instanceof Error ? error.message : String(error)
      });
      if (error instanceof ThreadAdapterError) throw error;
      throw new ThreadAdapterError(error?.code ?? "dsh_plugin_operation_failed", error instanceof Error ? error.message : String(error), { pluginId: validatedPkg, operation }, 409);
    }
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
      case "readLinkDevices": return this.linkCompanion?.readDevices() ?? { schema: "opl_link_studio_wire.v2", devices: [], unavailable: true };
      case "enableLinkInternet": {
        if (!this.linkInternet) throw new ThreadAdapterError("link_host_unavailable", "OPL Link is unavailable in this host", {}, 503);
        return this.linkInternet.enable();
      }
      case "disableLinkInternet": {
        if (!this.linkInternet) throw new ThreadAdapterError("link_host_unavailable", "OPL Link is unavailable in this host", {}, 503);
        return this.linkInternet.disable();
      }
      case "reconnectLinkInternet": {
        if (!this.linkInternet) throw new ThreadAdapterError("link_host_unavailable", "OPL Link is unavailable in this host", {}, 503);
        return this.linkInternet.reconnect();
      }
      case "createLinkPairing": {
        if (!this.linkCompanion) throw new ThreadAdapterError("link_host_unavailable", "OPL Link is unavailable in this host", {}, 503);
        return this.linkCompanion.createPairing(payload);
      }
      case "revokeLinkDevice": {
        if (!this.linkCompanion) throw new ThreadAdapterError("link_host_unavailable", "OPL Link is unavailable in this host", {}, 503);
        return this.linkCompanion.revokeDevice(payload);
      }
      case "requestSettingsSearchLog": return this.settingsSearchLog(payload);
      case "beginWindowDrag": return this.platform.beginWindowDrag();
      case "readHostPluginInventory": return this.readHostPluginInventory();
      case "readClientModuleGraph": return this.readClientModuleGraph();
      case "readClientModuleBoot": return this.readClientModuleBoot();
      case "readClientModuleBundle": return this.readClientModuleBundle(payload);
      case "readDshPluginUpdates": {
        const options = this.hostContext?.get("oplStudioHostOptions");
        if (!options?.dshHome || !options?.dshInstallAnchor) throw new ThreadAdapterError("dsh_profile_unavailable", "The active DSH profile is unavailable", {}, 503);
        const projection = await checkRegistryUpdates({ home: options.dshHome, installAnchor: options.dshInstallAnchor, cwd: path.dirname(options.dshInstallAnchor) });
        const profileBootRecovery = this.profileBootRecovery ?? readProfileBootRecovery(options.dshProfileDir);
        const withRecovery = profileBootRecovery ? { ...projection, profileBootRecovery } : projection;
        this.latestDshPluginUpdates = withRecovery;
        return withRecovery;
      }
      case "updateDshPlugins": return this.updateDshPlugins(payload);
      case "syncAllDshPluginUpdates": return this.syncAllDshPluginUpdates();
      case "readDshPluginCatalog": return this.readDshPluginCatalog(payload);
      case "manageDshPlugin": return this.manageDshPlugin(payload);
      case "readSuperagent": return this.hostContext.get("oplSuperagent").read();
      case "executeSuperagent": {
        const service = this.hostContext.get("oplSuperagent");
        if (payload.operation === "start") return service.start();
        if (payload.operation === "stop") return service.stop();
        throw new ThreadAdapterError("invalid_request", "Unknown Superagent operation", {}, 400);
      }
      case "readTeamBots": return this.hostContext.get("oplTeamBots").read();
      case "executeTeamBot": return this.hostContext.get("oplTeamBots").execute(payload);
      case "readState": {
        const state = await this.opl.readState(payload.profile ?? "fast");
        let carrierDiagnostics;
        try {
          carrierDiagnostics = await this.carrierDiagnostics.read();
        } catch {
          carrierDiagnostics = unavailableCarrierDiagnostics("carrier_diagnostics_read_failed");
        }
        return {
          ...state, carrierDiagnostics,
          ...(this.updateMaintenance ? { managedUpdateMaintenance: this.updateMaintenance.snapshot() } : {})
        };
      }
      case "readInitialize": return this.opl.readInitialize();
      case "readFullDrilldown": return this.opl.readFullDrilldown();
      case "readDomainDetailView": return this.opl.readDomainDetailView(payload);
      case "readContribution": return this.opl.readContribution(payload);
      case "executeAction": return this.executeAction(payload);
      case "listMcpApps": return this.mcpApps.list(payload);
      case "openMcpApp": return this.mcpApps.open(payload);
      case "callMcpAppTool": return this.mcpApps.call(payload);
      case "readMcpAppResource": return this.mcpApps.read(payload);
      case "closeMcpApp": return this.mcpApps.close(payload);
      case "readCodexModels": return this.transport.listModels();
      case "readBillionContext": return this.codex.readBillionContext();
      case "setBillionContext": return this.codex.setBillionContext(payload);
      case "manageBillionContext": return this.codex.manageBillionContext(payload);
      case "readComputerUse": return this.codex.readComputerUse();
      case "setComputerUse": return this.codex.setComputerUse(payload);
      case "performComputerUseAction": return this.codex.performComputerUseAction(payload);
      case "readCodexCapabilities": return this.transport.listCapabilities(payload.threadId);
      case "readCodexPermissionProfiles": return this.transport.listPermissionProfiles();
      case "pickFiles": return this.platform.pickFiles(payload);
      case "pickDirectory": return this.platform.pickDirectory(payload);
      case "revealLocalPath": {
        if (typeof payload?.path !== "string" || !path.isAbsolute(payload.path) || payload.path.includes("\0")) throw new Error("An absolute local path is required");
        await this.platform.accessWorkspacePath({ path: payload.path, action: "reveal" });
        return;
      }
      case "classifyInputPaths": return this.platform.classifyInputPaths(payload);
      case "releaseInputs": return this.platform.releaseInputs(payload);
      case "notifyCompletion": return this.platform.notifyCompletion(payload);
      case "listThreadWorkspace": return this.threadWorkspace.list(payload);
      case "readThreadWorkspaceFile": return this.threadWorkspace.read(payload);
      case "readThreadWorkspaceGit": return this.threadWorkspace.git(payload);
      case "readThreadWorkspaceBytes": return this.threadWorkspace.readBytes(payload);
      case "searchThreadWorkspace": return this.threadWorkspace.search(payload);
      case "accessThreadWorkspace": {
        if (!["open", "reveal"].includes(payload?.action)) throw new ThreadAdapterError("invalid_workspace_action", "Desktop file action must be open or reveal", {}, 400);
        const resolved = await this.threadWorkspace.resolveAccess(payload);
        await this.platform.accessWorkspacePath({ path: resolved.target, action: payload.action });
        return { accepted: true };
      }
      case "listMaterialSpaces": return this.materialsSpace.listSpaces(payload);
      case "scanProjectDeliverables": return this.materialsSpace.scanDeliverables(payload);
      case "listProjectWorkspace": return this.materialsSpace.listWorkspace(payload);
      case "searchProjectWorkspace": return this.materialsSpace.searchWorkspace(payload);
      case "readProjectWorkspaceBytes": return this.materialsSpace.readBytes(payload);
      case "accessProjectWorkspace": {
        if (!["open", "reveal"].includes(payload?.action)) throw new ThreadAdapterError("invalid_workspace_action", "Desktop file action must be open or reveal", {}, 400);
        const resolved = await this.materialsSpace.resolveAccess(payload);
        await this.platform.accessWorkspacePath({ path: resolved.target, action: payload.action });
        return { accepted: true };
      }
      case "openLogDirectory": return this.carrierDiagnostics.openLogDirectory?.()
        ?? Promise.reject(new ThreadAdapterError("desktop_capability_unavailable", "Log folder access is unavailable", {}, 501));
      case "setLogDirectory": return this.carrierDiagnostics.setLogDirectory?.(payload)
        ?? unsupportedLogDirectoryUpdate();
      case "sendMessage": return this.transport.sendMessage(payload);
      case "listPendingServerRequests": return this.transport.listPendingServerRequests();
      case "respondToServerRequest": return this.transport.respondToServerRequest(payload?.id, payload?.response ?? {});
      case "steerTurn": return this.transport.steerMessage(payload);
      case "interruptTurn": return this.transport.interruptMessage(payload);
      case "loginGatewayAccount": {
        const result = await this.gatewayAccountLogin(payload);
        if (result?.ok || result?.stateRefreshRequired) this.linkInternet?.synchronizeAccount?.().catch(() => {});
        return result;
      }
      case "configureCodexApiKey": return this.configureCodexApiKey(payload);
      case "approveConnectionAccess": return this.connectionAccessApproval(payload);
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
    if (!this.managedByDsh) this.mcpApps.dispose();
    this.closePromise ??= (async () => {
      this.disposeLinkRoutes?.();
      await this.linkInternet?.close();
      await this.linkCompanion?.close();
      await this.updateMaintenance?.close();
      await Promise.allSettled([...this.manualUpdateOperations]);
      if (this.managedByDsh && this.hostContext) {
        await this.framework.close();
        await this.hostContext.get("oplTeamBots")?.dispose();
        await this.hostContext.get("oplSuperagent")?.stop();
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

