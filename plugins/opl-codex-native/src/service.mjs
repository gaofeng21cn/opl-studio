import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { CHANNEL_CALLBACK_SCHEMA, CodexAppServerTransport } from "./app-server-transport.mjs";
import { ChannelBindingStore } from "@gaofeng21cn/opl-host-kit/channel-bindings";
import { CodexThreadAdapter } from "./thread-adapter.mjs";
import {
  applyPendingContextOperation,
  clearPendingContextOperation,
  hasContextUpdate,
  manageContextPlugin,
  readContextPlugin,
  readPendingContextOperation,
  setContextPluginEnabled,
  stageContextPluginOperation
} from "./billion-context.mjs";
import { ThreadAdapterError } from "@gaofeng21cn/opl-host-contracts/thread-error";

const defaultWorkspaceRoot = process.env.OPL_NATIVE_WORKBENCH_CODEX_CWD
  ?? process.env.OPL_STUDIO_CODEX_CWD
  ?? process.cwd();

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
    env = process.env
  } = {}) {
    super();
    const channelBindingStore = new ChannelBindingStore({
      filePath: channelBindingFile ?? defaultChannelBindingFile(env)
    });
    const connection = dshToolMcp?.codexConnection?.();
    const childEnv = connection
      ? { ...env, [connection.bearerTokenEnvVar]: connection.bearerToken }
      : env;
    const baseArgs = env.CODEX_APP_SERVER_ARGS?.split(" ").filter(Boolean)
      ?? ["app-server"];
    this.transport = transport ?? new CodexAppServerTransport({
      cwd: workspaceRoot,
      env: childEnv,
      args: codexArgsWithDshToolMcp(baseArgs, connection),
      channelBindingStore,
      ...(canonicalThreadHost ? { host: canonicalThreadHost } : {})
    });
    this.transport.channelBindingStore ??= channelBindingStore;
    this.contextProfile = { dshProfileDir, dshInstallAnchor, dshHome };
    this.billionContextAdmitted = billionContextAdmitted;
    this.hasExplicitTransport = Boolean(transport);
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

  async start() {
    if (this.pendingContextOperationOnBoot) {
      const stagedOutcome = await applyPendingContextOperation(this.contextProfile);
      this.pendingContextOperationOnBoot = null;
      if (stagedOutcome.error) this.contextError = true;
      this.#prepareContextLauncher();
    }
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
      clearPendingContextOperation(this.contextProfile.dshProfileDir);
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

  async reloadConfiguration({ maintenanceHeld = false } = {}) {
    if (!maintenanceHeld && typeof this.transport.runWhenIdle === "function") {
      const result = await this.transport.runWhenIdle(() => this.reloadConfiguration({ maintenanceHeld: true }));
      if (result.status === "deferred") {
        throw Object.assign(new Error("Codex configuration reload is waiting for active tasks"), { code: "app_server_busy" });
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
        await this.transport.start();
        this.appServerError = null;
      } catch (error) {
        this.appServerError = {
          code: error.code ?? "app_server_unavailable",
          message: error.message ?? String(error)
        };
        throw error;
      }
      return this.capabilities();
    })().finally(() => {
      this.reloadPromise = null;
    });
    return this.reloadPromise;
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
