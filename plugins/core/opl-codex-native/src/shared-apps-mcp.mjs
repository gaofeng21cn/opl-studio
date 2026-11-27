import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const server = "mcp_servers.opl-apps";
const stdioArgs = ["connect", "mcp-app-stdio"];

// Codex owns the effective configuration, including disabled, HTTP and managed
// servers. Inspect it with the same binary, working directory and home as the
// app server. Keep Studio's defaults scoped to this process.
export async function sharedAppsMcpArgs({ command, cwd, env, stateDir }) {
  let servers;
  try {
    const { stdout } = await execFileAsync(command, ["mcp", "list", "--json"], {
      cwd, env, timeout: 3000, maxBuffer: 4 * 1024 * 1024
    });
    servers = JSON.parse(stdout);
  } catch {
    // An unavailable optional catalog must not delay ordinary conversations
    // beyond the probe or overwrite an unknown user configuration.
    return [];
  }
  if (!Array.isArray(servers)) return [];
  const existing = servers.find(entry => entry?.name === "opl-apps");
  const transport = existing?.transport;
  if (existing && (!existing.enabled || transport?.type !== "stdio"
    || !["opl", "opl.exe", "opl.cmd"].includes(path.basename(transport.command || ""))
    || JSON.stringify(transport.args) !== JSON.stringify(stdioArgs))) return [];

  const overrides = [];
  const set = (field, value) => overrides.push("-c", `${server}.${field}=${JSON.stringify(value)}`);
  const readOnly = env.OPL_STUDIO_READ_ONLY === "1" || env.OPL_NATIVE_WORKBENCH_READ_ONLY === "1";
  if (!existing) set("command", env.OPL_APP_OPL_BIN || env.OPL_COMMAND || "opl");
  if (!existing || readOnly) set("args", readOnly ? [...stdioArgs, "--read-only"] : stdioArgs);

  const declared = new Set([...Object.keys(transport?.env ?? {}), ...(transport?.env_vars ?? [])]);
  if (!declared.has("OPL_STATE_DIR") && !declared.has("OPL_DATA_DIR")) {
    const explicit = stateDir?.trim() || env.OPL_STATE_DIR?.trim();
    if (explicit) set("env.OPL_STATE_DIR", path.resolve(explicit));
    else if (env.OPL_DATA_DIR?.trim()) set("env.OPL_DATA_DIR", path.resolve(env.OPL_DATA_DIR.trim()));
    else if (process.platform === "linux" && env.XDG_STATE_HOME && !declared.has("XDG_STATE_HOME")) {
      set("env.XDG_STATE_HOME", env.XDG_STATE_HOME);
    }
  }
  return overrides;
}
