import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHANNEL_CALLBACK_SCHEMA, CodexAppServerTransport } from "./app-server-transport.mjs";
import { ChannelBindingStore } from "./channel-bindings.mjs";
import { CodexThreadAdapter } from "./thread-adapter.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultWorkspaceRoot = process.env.OPL_NATIVE_WORKBENCH_CODEX_CWD
  ?? process.env.OPL_STUDIO_CODEX_CWD
  ?? repositoryRoot;

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
      ?? ["app-server", "--stdio"];
    this.transport = transport ?? new CodexAppServerTransport({
      cwd: workspaceRoot,
      env: childEnv,
      args: codexArgsWithDshToolMcp(baseArgs, connection),
      channelBindingStore
    });
    this.transport.channelBindingStore ??= channelBindingStore;
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

  async start() {
    try {
      await this.transport.start();
      this.appServerError = null;
    } catch (error) {
      this.appServerError = {
        code: error.code ?? "app_server_unavailable",
        message: error.message ?? String(error)
      };
    }
    return this.capabilities();
  }

  async reloadConfiguration() {
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
    this.closePromise ??= this.transport.stop();
    return this.closePromise;
  }
}
