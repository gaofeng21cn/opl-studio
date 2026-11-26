import { execFile } from "node:child_process";
import path from "node:path";

const operations = ["status", "check", "apply", "restart"];
const carriers = new Map([
  ["standalone_headless_webui", "native"],
  ["docker_webui", "web"]
]);
const resultStates = new Set([
  "idle",
  "checking",
  "not-available",
  "not_available",
  "available",
  "downloading",
  "downloaded",
  "applying",
  "applied",
  "installing",
  "restart_scheduled",
  "recreating",
  "recreated",
  "busy",
  "cancelled",
  "error",
  "unsupported"
]);

function defaultExecute(executable, args, options) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, {
      ...options,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      shell: false
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function unsupportedUpdater(reasonCode = "native_host_required") {
  return {
    perform: async (operation) => unsupportedNativeAppUpdate(operation, reasonCode)
  };
}

function parseArguments(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} must be configured`);
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError(`${name} must be a JSON array`);
  }
  if (
    !Array.isArray(parsed)
    || parsed.length > 32
    || parsed.some((argument) => typeof argument !== "string" || argument.length > 4096)
  ) {
    throw new TypeError(`${name} must be a JSON array of at most 32 string arguments`);
  }
  return parsed;
}

function normalizedCommands(commands) {
  const normalized = {};
  for (const operation of operations) {
    const command = commands?.[operation];
    if (!command || !path.isAbsolute(command.executable)) {
      throw new TypeError(`${operation} must use an absolute executable path`);
    }
    if (!Array.isArray(command.args) || command.args.some((argument) => typeof argument !== "string")) {
      throw new TypeError(`${operation} args must be a string array`);
    }
    normalized[operation] = Object.freeze({
      executable: command.executable,
      args: Object.freeze([...command.args])
    });
  }
  return Object.freeze(normalized);
}

function normalizeRunnerResult(stdout, { carrier, host, operation, currentVersion }) {
  let result;
  try {
    result = JSON.parse(String(stdout).trim());
  } catch {
    throw new TypeError("carrier updater returned invalid JSON");
  }
  if (
    !result
    || typeof result !== "object"
    || Array.isArray(result)
    || result.schema !== "opl_native_app_updater.v1"
    || !resultStates.has(result.state)
  ) {
    throw new TypeError("carrier updater returned an invalid opl_native_app_updater.v1 result");
  }
  const normalized = {
    schema: "opl_native_app_updater.v1",
    owner: "one-person-lab-app_native_host",
    host,
    carrierAdapter: carrier,
    operation,
    supported: result.supported !== false,
    state: result.state,
    restartRequired: result.restartRequired === true
  };
  for (const field of ["currentVersion", "targetVersion", "reasonCode", "errorCode", "message"]) {
    if (typeof result[field] === "string" && result[field]) normalized[field] = result[field];
  }
  if (!normalized.currentVersion && currentVersion) normalized.currentVersion = currentVersion;
  if (typeof result.progressPercent === "number" && Number.isFinite(result.progressPercent)) {
    normalized.progressPercent = result.progressPercent;
  }
  if (typeof result.accepted === "boolean") normalized.accepted = result.accepted;
  if (result.ownerFallback === "one-person-lab-app") normalized.ownerFallback = result.ownerFallback;
  return normalized;
}

export function unsupportedNativeAppUpdate(operation, reasonCode = "native_host_required") {
  return {
    schema: "opl_native_app_updater.v1",
    owner: "one-person-lab-app_native_host",
    host: "web",
    operation,
    supported: false,
    state: "unsupported",
    restartRequired: false,
    reasonCode,
    ownerFallback: "one-person-lab-app"
  };
}

export function createNativeAppUpdater({
  carrier,
  commands,
  currentVersion,
  execute = defaultExecute,
  timeoutMs = 120_000
}) {
  const host = carriers.get(carrier);
  if (!host) throw new TypeError(`Unsupported native App update carrier: ${String(carrier)}`);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new TypeError("Native App updater timeout must be from 1000 through 600000 milliseconds");
  }
  const commandPlans = normalizedCommands(commands);

  return {
    async perform(operation) {
      const command = commandPlans[operation];
      if (!command) {
        return {
          ...unsupportedNativeAppUpdate(operation, "unsupported_update_operation"),
          host,
          carrierAdapter: carrier
        };
      }
      try {
        const { stdout } = await execute(command.executable, [...command.args], {
          timeout: timeoutMs,
          windowsHide: true
        });
        return normalizeRunnerResult(stdout, { carrier, host, operation, currentVersion });
      } catch (error) {
        return {
          schema: "opl_native_app_updater.v1",
          owner: "one-person-lab-app_native_host",
          host,
          carrierAdapter: carrier,
          operation,
          supported: true,
          state: "error",
          currentVersion,
          restartRequired: false,
          accepted: false,
          errorCode: error instanceof TypeError
            ? "carrier_update_result_invalid"
            : "carrier_update_command_failed"
        };
      }
    }
  };
}

export function createNativeAppUpdaterFromEnvironment({ env = process.env, execute = defaultExecute } = {}) {
  const carrier = env.OPL_NATIVE_APP_UPDATE_CARRIER?.trim();
  const executable = env.OPL_NATIVE_APP_UPDATE_EXECUTABLE?.trim();
  const configured = carrier || executable || operations.some((operation) => (
    env[`OPL_NATIVE_APP_UPDATE_${operation.toUpperCase()}_ARGS_JSON`] !== undefined
  ));
  if (!configured) return unsupportedUpdater();

  try {
    const commands = Object.fromEntries(operations.map((operation) => [operation, {
      executable,
      args: parseArguments(
        env[`OPL_NATIVE_APP_UPDATE_${operation.toUpperCase()}_ARGS_JSON`],
        `OPL_NATIVE_APP_UPDATE_${operation.toUpperCase()}_ARGS_JSON`
      )
    }]));
    const timeoutValue = env.OPL_NATIVE_APP_UPDATE_TIMEOUT_MS?.trim();
    return createNativeAppUpdater({
      carrier,
      commands,
      currentVersion: env.OPL_NATIVE_APP_UPDATE_CURRENT_VERSION?.trim() || undefined,
      execute,
      timeoutMs: timeoutValue ? Number(timeoutValue) : 120_000
    });
  } catch {
    return unsupportedUpdater("carrier_update_config_invalid");
  }
}
