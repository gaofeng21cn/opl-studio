import { sharedAppsMcpArgs } from "./shared-apps-mcp.mjs";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { CHANNEL_CALLBACK_SCHEMA, CodexAppServerTransport } from "./app-server-transport.mjs";
import { ChannelBindingStore } from "@gaofeng21cn/opl-host-kit/channel-bindings";
import { CodexThreadAdapter } from "./thread-adapter.mjs";
import {
  applyPendingContextOperation,
  cancelPendingContextOperation,
  clearPendingContextOperation,
  hasContextUpdate,
  manageContextPlugin,
  readContextPlugin,
  readPendingContextOperation,
  setContextPluginEnabled,
  stageContextPluginOperation
} from "./billion-context.mjs";
import {
  codexArgsWithComputerUse,
  ensureCuaMcpProfile,
  inspectNativePermissions,
  openNativePermissionSettings,
  readComputerUseSettings,
  readSavedAppPermissions,
  requestNativePermission,
  resolveBundledCuaHelper,
  resolveCuaHome,
  resolveCuaWorkspace,
  resolveDshCliEntry,
  retrySavedAppPermission,
  revokeSavedAppPermission,
  writeComputerUseSettings
} from "./computer-use.mjs";
import { ThreadAdapterError } from "@gaofeng21cn/opl-host-contracts/thread-error";

const defaultWorkspaceRoot = process.env.OPL_NATIVE_WORKBENCH_CODEX_CWD
  ?? process.env.OPL_STUDIO_CODEX_CWD
  ?? process.cwd();

export { codexArgsWithComputerUse };

export function codexArgsWithDshToolMcp(baseArgs, connection) {
  if (!connection) return [...baseArgs];
  const name = "opl_studio_dsh";
  return [
    ...baseArgs,
    "-c", `mcp_servers.${name}.url=${JSON.stringify(connection.url)}`,
    "-c", `mcp_servers.${name}.bearer_token_env_var=${JSON.stringify(connection.bearerTokenEnvVar)}`,
    "-c", `mcp_servers.${name}.required=true`,
    "-c", `mcp_servers.${name}.default_tools_approval_mode=\"auto\"`
  ];
}

function defaultChannelBindingFile(env) {
  return env.OPL_STUDIO_CHANNEL_BINDINGS_FILE
    ?? path.join(env.OPL_DATA_DIR ?? os.homedir(), ".opl-studio", "channel-transport-bindings.json");
}

function codexLaunchEnvironment(env) {
  if (env.OPL_CODEX_BIN || env.CODEX_APP_SERVER_COMMAND) return env;
  const home = env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir();
  const runtimeRoot = env.OPL_RUNTIME_ROOT?.trim() || path.join(home, "Library", "Application Support", "OPL", "runtime");
  const managedBin = path.resolve(runtimeRoot, "current", "bin");
  const pathKey = process.platform === "win32" ? Object.keys(env).find(key => key.toUpperCase() === "PATH") ?? "PATH" : "PATH";
  const searchPath = env[pathKey] ?? (process.platform === "win32" ? process.env.PATH ?? "" : "/usr/bin:/bin");
  if (searchPath.split(path.delimiter).includes(managedBin)) return env;
  // Keep external commands first. A later first-run install creates this directory while the Host stays open.
  return { ...env, [pathKey]: searchPath + path.delimiter + managedBin };
}

export class OplCodexNative extends EventEmitter {
  constructor({
    workspaceRoot = defaultWorkspaceRoot,
    transport,
    channelBindingFile,
    dshToolMcp,
    canonicalThreadHost,
    billionContextAdmitted = false,
    dshProfileDir,
    dshInstallAnchor,
    dshHome,
    stateDir,
    env = process.env,
    platform = process.platform,
    arch = process.arch,
    nodeExecutable = process.execPath,
    nativeCuaControl
  } = {}) {
    super();
    const channelBindingStore = new ChannelBindingStore({
      filePath: channelBindingFile ?? defaultChannelBindingFile(env)
    });
    const connection = dshToolMcp?.codexConnection?.();
    const launchEnv = codexLaunchEnvironment(env);
    const childEnv = connection
      ? { ...launchEnv, [connection.bearerTokenEnvVar]: connection.bearerToken }
      : launchEnv;
    const baseArgs = env.CODEX_APP_SERVER_ARGS?.split(" ").filter(Boolean)
      ?? ["app-server"];
    this.baseCodexArgs = [...baseArgs];
    this.dshToolMcpConnection = connection ?? null;
    this.contextProfile = { dshProfileDir, dshInstallAnchor, dshHome };
    this.billionContextAdmitted = billionContextAdmitted;
    this.hasExplicitTransport = Boolean(transport);
    this.computerUseOptions = {
      platform,
      arch,
      nodeExecutable,
      nativeControl: nativeCuaControl
    };
    this.computerUseRestartPending = false;
    this.computerUseConfigRevision = 0;
    this.appliedComputerUseRevision = 0;
    this.pendingComputerUseReloadPromise = null;
    this.computerUseActive = false;
    this.computerUseActiveConsentMode = null;
    this.computerUseError = null;
    this.computerUseTransportLaunch = null;
    this.transportStarting = false;
    this.computerUseWriteChain = Promise.resolve();
    this.transport = transport ?? new CodexAppServerTransport({
      cwd: workspaceRoot,
      env: childEnv,
      args: this.#buildCodexArgs(),
      // Explicit app-server arguments can select a non-Codex protocol fixture
      // or a caller-managed configuration.
      extraLaunchArgs: !env.CODEX_APP_SERVER_ARGS ? () => sharedAppsMcpArgs({
        command: env.OPL_CODEX_BIN ?? env.CODEX_APP_SERVER_COMMAND ?? "codex",
        cwd: workspaceRoot, env: launchEnv, stateDir
      }) : undefined,
      prepareLaunch: () => this.#prepareTransportLaunch(),
      channelBindingStore,
      ...(canonicalThreadHost ? { host: canonicalThreadHost } : {})
    });
    this.transport.channelBindingStore ??= channelBindingStore;
    this.contextLaunch = null;
    this.contextError = false;
    this.contextVersion = null;
    this.contextAvailable = null;
    this.pendingContextOperationOnBoot = !transport && dshProfileDir ? readPendingContextOperation(dshProfileDir) : null;
    if (!this.pendingContextOperationOnBoot && !transport && dshProfileDir) {
      this.#prepareContextLauncher();
    }
    this.threads = new CodexThreadAdapter(this.transport);
    this.channelCallbackAdapter = typeof this.transport.createChannelCallbackAdapter === "function"
      ? this.transport.createChannelCallbackAdapter()
      : null;
    this.appServerError = null;
    this.closePromise = null;
    this.reloadPromise = null;

    this.threads.on("event", (event) => this.emit("event", event));
    this.transport.on("availability", (availability) => {
      this.appServerError = availability.available === true
        ? null
        : {
            code: "app_server_unavailable",
            message: `Codex App Server became unavailable (${availability.signal ?? availability.code ?? "unknown"})`
          };
      if (availability.available === false) {
        this.computerUseActive = false;
        this.computerUseActiveConsentMode = null;
        this.emit("event", {
          method: "host/computer-use-changed",
          params: {
            active: false,
            activeConsentMode: null,
            restartPending: this.computerUseRestartPending
          }
        });
      } else if (availability.available === true && !this.transportStarting) {
        this.#recordComputerUseLaunch(this.computerUseTransportLaunch ?? this.#configuredComputerUseLaunch());
      }
      this.emit("event", { method: "host/availability", params: availability });
    });
    this.transport.on("serverRequest", (request) => {
      this.emit("event", { method: "codex/server-request", params: request });
    });
    this.transport.on("serverRequestsCleared", (detail) => {
      this.emit("event", { method: "codex/server-requests-cleared", params: detail });
    });
  }

  #prepareContextLauncher() {
    if (this.hasExplicitTransport || !this.contextProfile.dshProfileDir || this.contextLaunch) return;
    try {
      const { enabled, entry, version } = readContextPlugin(this.contextProfile);
      if (enabled && (!this.billionContextAdmitted || !entry)) this.contextError = true;
      if (enabled && this.billionContextAdmitted && entry) {
        const { command, args, env: nativeEnv } = this.transport;
        const launcherEnv = {
          ...nativeEnv,
          BILI_CLIENT_BIN: command,
          ACP_AUTO_UPDATE: "0",
          BILI_ADVISORY_CHECK: "0"
        };
        this.contextLaunch = { command, args, env: nativeEnv };
        this.contextVersion = version;
        Object.assign(this.transport, { command: process.execPath, args: [entry, "codex", ...args], env: launcherEnv });
      }
    } catch {
      this.contextError = true;
    }
  }

  #computerUseRuntimeConfig() {
    const { dshHome, dshInstallAnchor } = this.contextProfile;
    const { platform, arch, nodeExecutable } = this.computerUseOptions;
    const supported = platform === "darwin";
    const settings = readComputerUseSettings(dshHome, platform);
    const dshCliEntry = dshHome ? resolveDshCliEntry({ installAnchor: dshInstallAnchor }) : null;
    const helper = dshHome ? resolveBundledCuaHelper({ installAnchor: dshInstallAnchor, platform, arch }) : null;
    const available = supported && Boolean(dshHome && dshCliEntry && helper);
    const cuaHome = resolveCuaHome(dshHome);
    const workspace = resolveCuaWorkspace(dshHome);
    return {
      supported,
      available,
      enabled: settings.enabled,
      consentMode: settings.consentMode,
      command: nodeExecutable,
      cuaHome,
      workspace,
      dshCliEntry,
      helper,
      unavailableReason: !supported
        ? "unsupported_platform"
        : !dshHome
          ? "dsh_home_unavailable"
          : !dshCliEntry
            ? "dsh_cli_unavailable"
            : !helper
              ? "cua_helper_unavailable"
              : null
    };
  }

  #buildCodexArgs() {
    this.configuredComputerUseRevision = this.computerUseConfigRevision;
    const withToolMcp = codexArgsWithDshToolMcp(this.baseCodexArgs, this.dshToolMcpConnection);
    if (this.hasExplicitTransport) {
      this.configuredComputerUseEnabled = false;
      this.configuredComputerUseConsentMode = null;
      return withToolMcp;
    }
    const config = this.#computerUseRuntimeConfig();
    if (!config.available || !config.enabled) {
      this.configuredComputerUseEnabled = false;
      this.configuredComputerUseConsentMode = null;
      this.computerUseError = null;
      return withToolMcp;
    }
    try {
      ensureCuaMcpProfile(this.contextProfile.dshHome);
    } catch (error) {
      // Keep plain Codex App Server startup unblocked if CUA profile materialization fails.
      this.computerUseError = {
        code: error?.code ?? "cua_profile_init_failed",
        message: error?.message ?? String(error)
      };
      this.configuredComputerUseEnabled = false;
      this.configuredComputerUseConsentMode = null;
      return withToolMcp;
    }
    this.computerUseError = null;
    this.configuredComputerUseEnabled = true;
    this.configuredComputerUseConsentMode = config.consentMode;
    return codexArgsWithComputerUse(withToolMcp, {
      enabled: true,
      consentMode: config.consentMode,
      command: config.command,
      cuaHome: config.cuaHome,
      workspace: config.workspace,
      dshCliEntry: config.dshCliEntry
    });
  }

  #applyCodexArgs() {
    if (this.hasExplicitTransport) return;
    if (this.contextLaunch) {
      Object.assign(this.transport, {
        command: this.contextLaunch.command,
        env: this.contextLaunch.env
      });
      this.contextLaunch = null;
    }
    this.transport.args = this.#buildCodexArgs();
  }

  #configuredComputerUseLaunch() {
    return {
      revision: this.configuredComputerUseRevision ?? this.computerUseConfigRevision,
      enabled: Boolean(!this.hasExplicitTransport && this.configuredComputerUseEnabled),
      consentMode: this.configuredComputerUseConsentMode
    };
  }

  #prepareTransportLaunch() {
    if (this.configuredComputerUseRevision !== this.computerUseConfigRevision) {
      const useContextLauncher = this.contextLaunch !== null;
      this.#applyCodexArgs();
      if (useContextLauncher) this.#prepareContextLauncher();
    }
    const launch = this.#configuredComputerUseLaunch();
    this.computerUseTransportLaunch = launch;
    return () => launch.revision === this.computerUseConfigRevision;
  }

  #recordComputerUseLaunch(launch) {
    this.computerUseActive = launch.enabled;
    this.computerUseActiveConsentMode = launch.enabled ? launch.consentMode : null;
    this.appliedComputerUseRevision = launch.revision;
    this.computerUseRestartPending = this.appliedComputerUseRevision !== this.computerUseConfigRevision;
    this.emit("event", {
      method: "host/computer-use-changed",
      params: {
        active: this.computerUseActive,
        activeConsentMode: this.computerUseActiveConsentMode,
        restartPending: this.computerUseRestartPending
      }
    });
  }

  async #startTransport() {
    if (this.configuredComputerUseRevision !== this.computerUseConfigRevision) {
      this.#applyCodexArgs();
    }
    this.#prepareContextLauncher();
    const launch = this.#configuredComputerUseLaunch();
    this.transportStarting = true;
    try {
      try {
        await this.transport.start();
      } catch (error) {
        if (!this.contextLaunch) throw error;
        await this.transport.stop();
        Object.assign(this.transport, this.contextLaunch);
        this.contextLaunch = null;
        this.contextError = true;
        await this.transport.start();
      }
      this.appServerError = null;
      this.#recordComputerUseLaunch(this.computerUseTransportLaunch ?? launch);
    } catch (error) {
      this.computerUseActive = false;
      this.computerUseActiveConsentMode = null;
      throw error;
    } finally {
      this.transportStarting = false;
    }
  }

  async start() {
    if (this.pendingContextOperationOnBoot) {
      const stagedOutcome = await applyPendingContextOperation(this.contextProfile);
      this.pendingContextOperationOnBoot = null;
      if (stagedOutcome.error) this.contextError = true;
    }
    try {
      await this.#startTransport();
      if (
        this.computerUseRestartPending
        && !this.closePromise
        && !this.transport?.disposed
        && this.appliedComputerUseRevision !== this.computerUseConfigRevision
      ) {
        this.#scheduleComputerUseReload();
      }
    } catch (error) {
      this.appServerError = {
        code: error.code ?? "app_server_unavailable",
        message: error.message ?? String(error)
      };
    }
    return this.capabilities();
  }

  readBillionContext() {
    const { enabled, version, entry } = readContextPlugin(this.contextProfile);
    const pending = readPendingContextOperation(this.contextProfile.dshProfileDir);
    return {
      enabled,
      installed: Boolean(entry),
      version,
      availableVersion: this.contextAvailable ?? pending?.targetVersion ?? null,
      updateAvailable: hasContextUpdate(this.contextAvailable, version),
      activeVersion: this.contextLaunch && this.transport.initialized ? this.contextVersion : null,
      active: this.contextLaunch !== null && this.transport.initialized === true,
      startupFailed: this.contextError,
      pendingOperation: pending?.operation ?? null,
      pendingVersion: pending?.targetVersion ?? null
    };
  }

  async setBillionContext({ enabled }) {
    if (typeof enabled !== "boolean") {
      throw new ThreadAdapterError("invalid_request", "Expected a boolean Billion Context preference", {}, 400);
    }
    await setContextPluginEnabled(this.contextProfile, enabled);
    return this.readBillionContext();
  }

  async manageBillionContext({ operation }) {
    if (!["check", "install", "update", "remove", "cancel_pending"].includes(operation))
      throw new ThreadAdapterError("invalid_request", "Unknown Billion Context package operation", {}, 400);
    if (operation === "cancel_pending") {
      await cancelPendingContextOperation(this.contextProfile);
      return this.readBillionContext();
    }
    const { version } = this.readBillionContext();
    if ((operation === "update" || operation === "remove") && !version) return this.readBillionContext();
    if (operation === "install" && version) return this.readBillionContext();
    if (this.contextPackageOperation)
      throw new ThreadAdapterError("dsh_plugin_busy", "A Billion Context package operation is running", {}, 409);
    if (this.contextLaunch && (operation === "update" || operation === "remove")) {
      this.contextPackageOperation = stageContextPluginOperation(this.contextProfile, operation, version);
      try {
        const result = await this.contextPackageOperation;
        if (result?.availableVersion !== undefined) {
          this.contextAvailable = result.availableVersion;
        }
      } finally {
        this.contextPackageOperation = null;
      }
      return this.readBillionContext();
    }
    this.contextPackageOperation = manageContextPlugin(this.contextProfile, operation, version);
    try {
      this.contextAvailable = await this.contextPackageOperation;
    } finally {
      this.contextPackageOperation = null;
    }
    return this.readBillionContext();
  }

  async readComputerUse() {
    const config = this.#computerUseRuntimeConfig();
    const { dshHome } = this.contextProfile;
    const { platform, nativeControl } = this.computerUseOptions;
    const [permissions, saved] = await Promise.all([
      inspectNativePermissions({ helper: config.helper, platform, nativeControl }),
      dshHome
        ? readSavedAppPermissions(dshHome).catch(() => ({ allowedApps: [], blockedApps: [] }))
        : Promise.resolve({ allowedApps: [], blockedApps: [] })
    ]);
    return {
      supported: config.supported,
      available: config.available,
      enabled: config.enabled,
      active: this.computerUseActive && this.transport.initialized === true,
      consentMode: config.consentMode,
      activeConsentMode: this.computerUseActive && this.transport.initialized === true ? this.computerUseActiveConsentMode : null,
      restartPending: this.computerUseRestartPending,
      platform,
      permissions,
      allowedApps: saved.allowedApps,
      blockedApps: saved.blockedApps,
      unavailableReason: config.unavailableReason ?? this.computerUseError?.code ?? null
    };
  }

  #scheduleComputerUseReload() {
    if (this.pendingComputerUseReloadPromise || this.closePromise) return;
    if (typeof this.transport?.scheduleWhenIdle !== "function") return;
    let attemptedRevision = null;
    let reloadFailed = false;
    this.pendingComputerUseReloadPromise = this.transport.scheduleWhenIdle(async () => {
      if (!this.computerUseRestartPending || this.closePromise) return;
      attemptedRevision = this.computerUseConfigRevision;
      this.#applyCodexArgs();
      await this.reloadConfiguration({ maintenanceHeld: true });
    }).catch((error) => {
      reloadFailed = true;
      if (!this.closePromise) {
        this.appServerError = {
          code: error?.code ?? "app_server_unavailable",
          message: error?.message ?? String(error)
        };
        if (!this.transport?.initialized) {
          this.computerUseActive = false;
          this.computerUseActiveConsentMode = null;
        }
        if (attemptedRevision === null || this.computerUseConfigRevision === attemptedRevision) {
          this.computerUseRestartPending = false;
        }
        this.emit("event", {
          method: "host/computer-use-changed",
          params: {
            active: this.computerUseActive && this.transport?.initialized === true,
            activeConsentMode: this.computerUseActive && this.transport?.initialized === true ? this.computerUseActiveConsentMode : null,
            restartPending: this.computerUseRestartPending
          }
        });
      }
    }).finally(() => {
      this.pendingComputerUseReloadPromise = null;
      const hasNewerRevision = attemptedRevision !== null && this.computerUseConfigRevision !== attemptedRevision;
      if (
        this.computerUseRestartPending
        && !this.closePromise
        && !this.transport?.disposed
        && this.appliedComputerUseRevision !== this.computerUseConfigRevision
        && (!reloadFailed || hasNewerRevision)
      ) {
        this.#scheduleComputerUseReload();
      }
    });
  }

  async setComputerUse({ enabled, consentMode } = {}) {
    if (enabled !== undefined && typeof enabled !== "boolean") {
      throw new ThreadAdapterError("invalid_request", "Expected a boolean Computer Use enabled value", {}, 400);
    }
    if (consentMode !== undefined && consentMode !== "elicit" && consentMode !== "allow") {
      throw new ThreadAdapterError("invalid_request", `Unsupported Computer Use consent mode: ${String(consentMode)}`, {}, 400);
    }
    const writeStep = this.computerUseWriteChain.then(async () => {
      const prev = readComputerUseSettings(this.contextProfile.dshHome, this.computerUseOptions.platform);
      const next = await writeComputerUseSettings(
        this.contextProfile.dshHome,
        { enabled, consentMode },
        this.computerUseOptions.platform
      );
      const changed = prev.enabled !== next.enabled || prev.consentMode !== next.consentMode;
      if (changed) {
        this.computerUseConfigRevision += 1;
      }
      return { changed, targetRevision: this.computerUseConfigRevision };
    });
    this.computerUseWriteChain = writeStep.catch(() => undefined);
    const { changed, targetRevision } = await writeStep;

    if (changed) {
      if (this.transportStarting || this.transport.startPromise || this.reloadPromise) {
        this.computerUseRestartPending = true;
        this.emit("event", {
          method: "host/computer-use-changed",
          params: {
            active: this.computerUseActive && this.transport?.initialized === true,
            activeConsentMode: this.computerUseActive && this.transport?.initialized === true ? this.computerUseActiveConsentMode : null,
            restartPending: true
          }
        });
        return this.readComputerUse();
      }
      this.#applyCodexArgs();
      if (this.transport.initialized) {
        try {
          await this.reloadConfiguration();
          if (this.computerUseRestartPending) {
            this.#scheduleComputerUseReload();
          }
        } catch (error) {
          if (error?.code === "app_server_busy") {
            this.computerUseRestartPending = true;
            this.#scheduleComputerUseReload();
          } else {
            if (this.computerUseConfigRevision !== targetRevision && !this.transportStarting && !this.reloadPromise) {
              this.#applyCodexArgs();
            }
            throw error;
          }
        }
      } else {
        this.computerUseRestartPending = false;
      }
    }
    return this.readComputerUse();
  }

  async performComputerUseAction({ action, permission, appId, locale = "en" } = {}) {
    const config = this.#computerUseRuntimeConfig();
    const { nativeControl } = this.computerUseOptions;
    const { dshHome } = this.contextProfile;
    switch (action) {
      case "recheck":
        break;
      case "request_permission":
        await requestNativePermission({ helper: config.helper, permission, locale, nativeControl });
        break;
      case "open_settings":
        await openNativePermissionSettings({ helper: config.helper, permission, locale, nativeControl });
        break;
      case "revoke_app":
        await revokeSavedAppPermission(dshHome, appId);
        break;
      case "retry_app":
        await retrySavedAppPermission(dshHome, appId);
        break;
      default:
        throw new ThreadAdapterError("invalid_request", `Unknown Computer Use action: ${String(action)}`, {}, 400);
    }
    return this.readComputerUse();
  }

  async reloadConfiguration({ maintenanceHeld = false } = {}) {
    if (!maintenanceHeld && typeof this.transport.runWhenIdle === "function") {
      const result = await this.transport.runWhenIdle(() => this.reloadConfiguration({ maintenanceHeld: true }));
      if (result.status === "deferred") {
        throw Object.assign(new Error("Codex configuration reload is waiting for active tasks"), { code: "app_server_busy" });
      }
      if (
        this.computerUseRestartPending
        && !this.closePromise
        && !this.transport?.disposed
        && this.appliedComputerUseRevision !== this.computerUseConfigRevision
        && !this.pendingComputerUseReloadPromise
      ) {
        this.#scheduleComputerUseReload();
      }
      return result.result;
    }
    if (this.closePromise) {
      throw Object.assign(new Error("Codex App Server is closing"), {
        code: "app_server_unavailable"
      });
    }
    this.reloadPromise ??= (async () => {
      await this.transport.stop();
      try {
        await this.#startTransport();
      } catch (error) {
        this.appServerError = {
          code: error.code ?? "app_server_unavailable",
          message: error.message ?? String(error)
        };
        if (this.computerUseRestartPending && !this.transport?.initialized) {
          this.computerUseActive = false;
          this.computerUseActiveConsentMode = null;
        }
        throw error;
      }
      return this.capabilities();
    })().finally(() => {
      this.reloadPromise = null;
    });
    const outcome = await this.reloadPromise;
    if (
      maintenanceHeld
      && this.computerUseRestartPending
      && !this.closePromise
      && !this.transport?.disposed
      && this.appliedComputerUseRevision !== this.computerUseConfigRevision
      && !this.pendingComputerUseReloadPromise
    ) {
      this.#scheduleComputerUseReload();
    }
    return outcome;
  }

  capabilities() {
    return {
      available: this.transport.initialized === true && this.appServerError === null,
      threadAdapter: this.threads.capabilities(),
      appServerError: this.appServerError,
      channelCallbackSchema: this.channelCallbackAdapter ? CHANNEL_CALLBACK_SCHEMA : null
    };
  }

  async close() {
    this.closePromise ??= this.transport.close?.() ?? this.transport.stop();
    return this.closePromise;
  }
}
