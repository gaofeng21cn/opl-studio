import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const policy = JSON.parse(fs.readFileSync(fileURLToPath(new URL("./node-host-policy.json", import.meta.url)), "utf8"));

export function assertPatchedHostNode(version) {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? "")?.slice(1).map(Number);
  const minimum = parts && policy.minimum_patched_versions[parts[0]];
  const floor = minimum?.split(".").map(Number);
  if (!parts || (!floor && parts[0] <= 26) || (floor && (parts[1] < floor[1] || (parts[1] === floor[1] && parts[2] < floor[2])))) {
    throw Object.assign(new Error(`Desktop Host requires a Framework-selected Node with the October 2026 TLS fixes; received ${version ?? "unknown"}`),
      { code: "node_host_security_update_required" });
  }
}

export function readHostNodeIdentity(command = process.execPath, version = process.versions.node, source = "framework_runtime") {
  assertPatchedHostNode(version);
  const executable = fs.realpathSync(command);
  return { command: executable, version, source, sha256: crypto.createHash("sha256").update(fs.readFileSync(executable)).digest("hex") };
}

// Framework selects/installs Node. This adapter admits its existing binary or
// the system Node already accepted by Framework; it never installs a runtime.
export function resolveHostNode({ nodeExecutable, env = process.env, probe = spawnSync } = {}) {
  const candidates = nodeExecutable ? [nodeExecutable]
    : (env.PATH ?? "").split(path.delimiter).filter(Boolean).map(directory => path.join(directory, process.platform === "win32" ? "node.exe" : "node"));
  for (const command of [...new Set(candidates)]) {
    try { fs.accessSync(command, fs.constants.X_OK); } catch { continue; }
    const result = probe(command, ["-p", "JSON.stringify({node:process.versions.node,electron:process.versions.electron??null})"], {
      env: { ...env, NODE_OPTIONS: "", NODE_PATH: "", ELECTRON_RUN_AS_NODE: "" }, encoding: "utf8", timeout: 10000
    });
    let identity;
    try { identity = JSON.parse(result.stdout); } catch { continue; }
    if (result.status !== 0 || identity.electron) continue;
    return readHostNodeIdentity(command, identity.node, nodeExecutable ? "framework_runtime" : "framework_system_node");
  }
  throw Object.assign(new Error("Desktop Host requires the standalone Node selected by Framework; Electron cannot provide this runtime"), { code: "node_host_runtime_unavailable" });
}
