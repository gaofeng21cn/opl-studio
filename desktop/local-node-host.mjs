import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createGuestCoreProxy } from "./guest-core-proxy.mjs";
import { resolveHostNode } from "./node-host-runtime.mjs";

export async function createLocalNodeHost({ nodeExecutable, hostRoot, spawnChild = spawn, ...options } = {}) {
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
  const core = await createGuestCoreProxy({ child, platform, nativeUpdater, carrierDiagnostics,
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
