import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { createGuestCoreProxy } from "./guest-core-proxy.mjs";
import { resolveHostNode } from "./node-host-runtime.mjs";

export async function createLocalNodeHost({ nodeExecutable, hostRoot, spawnChild = spawn, hostLogPath, ...options } = {}) {
  const env = options.env ?? process.env;
  const nodeIdentity = resolveHostNode({ nodeExecutable, env });
  const sourceRoot = hostRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..").replace(/app\.asar(?=[/\\]|$)/, "app.asar.unpacked");
  const entry = path.join(sourceRoot, "desktop", "local-node-guest-host.mjs");
  const childEnv = { ...env, PATH: [path.dirname(nodeIdentity.command), env.PATH].filter(Boolean).join(path.delimiter), NODE_OPTIONS: "", NODE_PATH: "", ELECTRON_RUN_AS_NODE: "" };
  const child = spawnChild(nodeIdentity.command, [entry], {
    env: childEnv,
    stdio: ["pipe", "pipe", "pipe"], windowsHide: true
  });
  let verified;
  const { platform, nativeUpdater, carrierDiagnostics, ...serializable } = options;
  let closed;
  const closeChild = () => closed ??= new Promise(resolve => {
    if (child.exitCode !== null && child.exitCode !== undefined) { resolve(); return; }
    child.once("close", () => { clearTimeout(timer); resolve(); });
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, 5000);
    timer.unref();
  });
  const onHostFailure = failure => {
    if (!hostLogPath) return;
    // A local, bounded diagnostic survives the failed process; secret values stay out of it.
    let diagnostic = failure.diagnostic.replace(/(?:gh[pousr]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{12,})/g, "[REDACTED]")
      .replace(/((?:api[-_]?key|token|password|secret|authorization)["']?\s*[:=]\s*)[^\s,}]+/gi, "$1[REDACTED]");
    for (const [key, value] of Object.entries(env)) if (/TOKEN|KEY|PASSWORD|SECRET|AUTH/i.test(key) && typeof value === "string" && value.length > 5) diagnostic = diagnostic.split(value).join("[REDACTED]");
    try {
      fs.mkdirSync(path.dirname(hostLogPath), { recursive: true });
      fs.writeFileSync(hostLogPath, JSON.stringify({ at: new Date().toISOString(), code: failure.code, exitCode: failure.exitCode, signal: failure.signal, diagnostic }) + "\n", { mode: 0o600 });
    } catch {}
  };
  const core = await createGuestCoreProxy({ child, platform, nativeUpdater, carrierDiagnostics, onHostFailure,
    initialize: { options: { ...serializable, env: childEnv }, nodeIdentity }, closeChild,
    validateInitialize(result) {
      const actual = result.nodeHostIdentity;
      if (actual?.version !== nodeIdentity.version || actual?.sha256 !== nodeIdentity.sha256) throw new Error("Node Host executable readback mismatch");
      verified = { ...nodeIdentity };
    }
  });
  core.nodeHostIdentity = verified;
  return core;
}
