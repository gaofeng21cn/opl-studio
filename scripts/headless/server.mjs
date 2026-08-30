import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWebUiHost } from "../webui-host/http-host.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function integer(value, fallback, { minimum, maximum, name }) {
  const normalized = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return normalized;
}

export function resolveHeadlessConfig(env = process.env) {
  const address = (env.OPL_HEADLESS_HOST ?? env.HOST ?? "127.0.0.1").trim();
  if (!address) throw new Error("OPL_HEADLESS_HOST must not be empty");
  return {
    address,
    port: integer(env.OPL_HEADLESS_PORT ?? env.PORT, 3000, {
      minimum: 0,
      maximum: 65_535,
      name: "OPL_HEADLESS_PORT"
    }),
    shutdownTimeoutMs: integer(env.OPL_HEADLESS_SHUTDOWN_TIMEOUT_MS, 8_000, {
      minimum: 100,
      maximum: 30_000,
      name: "OPL_HEADLESS_SHUTDOWN_TIMEOUT_MS"
    }),
    webRoot: path.resolve(env.OPL_WEBUI_ROOT?.trim() || path.join(repositoryRoot, "dist", "webui"))
  };
}

export async function startHeadlessHost({
  config = resolveHeadlessConfig(),
  createHost = createWebUiHost,
  env = process.env
} = {}) {
  await access(path.join(config.webRoot, "index.html"));
  const host = await createHost({
    webRoot: config.webRoot,
    webHost: config.address,
    webPort: config.port,
    channelBindingFile: env.OPL_STUDIO_CHANNEL_BINDINGS_FILE
      ?? path.join(env.OPL_DATA_DIR ?? os.homedir(), ".opl-studio", "channel-transport-bindings.json")
  });
  return {
    host,
    config,
    address: host.host,
    port: host.port
  };
}

export async function closeWithin(host, timeoutMs) {
  let timer;
  const outcome = await Promise.race([
    Promise.resolve().then(() => host.close()).then(() => ({ timedOut: false })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    })
  ]);
  clearTimeout(timer);
  return outcome;
}
