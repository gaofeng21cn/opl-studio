import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function inspectStudioGuest({ root = "/", env = process.env } = {}) {
  const at = value => path.join(root, value);
  const identity = JSON.parse(fs.readFileSync(at("etc/opl-studio/identity.json"), "utf8"));
  if (identity.schema !== "opl_studio_linux_runtime_identity.v1") throw new Error("Studio guest identity missing");
  const codex = fs.realpathSync(at("usr/local/bin/codex"));
  const framework = fs.realpathSync(at("home/opl/.opl/one-person-lab/bin/opl"));
  const node = fs.realpathSync(at("usr/local/bin/node"));
  const codexPath = "/opt/opl/studio-runtime/codex-root/vendor/x86_64-unknown-linux-musl/bin/codex";
  if (codex !== at(codexPath) || node !== at("opt/opl/studio-runtime/node/bin/node")) throw new Error("Studio guest runtime executable owner mismatch");
  const digest = file => `sha256:${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
  const processes = fs.existsSync(at("proc")) ? fs.readdirSync(at("proc")).filter(pid => /^[0-9]+$/.test(pid)) : [];
  const activeOperations = processes.filter(pid => {
    try {
      const processRoot = at(`proc/${pid}`);
      if (fs.statSync(processRoot).uid !== process.getuid()) return false;
      const executable = fs.realpathSync(path.join(processRoot, "exe"));
      const args = fs.readFileSync(path.join(processRoot, "cmdline"), "utf8").split("\0");
      return (executable === codex && args.includes("app-server"))
        || (executable === node && args.some(arg => arg.endsWith("/desktop/windows-guest-host.mjs")));
    } catch { return false; }
  }).length;
  return {
    schema: "opl_studio_linux_runtime_inspection.v1", protocol_version: 1,
    logical_distribution: "OPL-Linux", physical_distribution: "OPL-Linux", distribution_generation: identity.distribution_generation,
    guest_install_id: identity.guest_install_id, architecture: "x86_64", guest_user: "opl", wsl2: Boolean(env.WSL_INTEROP),
    codex_home: "/home/opl/.codex", workspace_root: "/home/opl/code", native_windows_executor_fallback_allowed: false,
    active_operation_count: activeOperations, codex_path: codexPath, codex_realpath: codexPath,
    codex_command_path: "/usr/local/bin/codex", codex_digest: digest(codex), codex_command_digest: digest(codex),
    framework_path: root === "/" ? framework : `/${path.relative(root, framework)}`, framework_digest: digest(framework),
    framework_ref: identity.framework_ref, carrier_activation_digest: digest(node),
    bootstrap_digest: digest(at("opt/opl/studio-bootstrap/inspect.mjs"))
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== "--json") throw new Error("Studio guest inspection requires --json");
  process.stdout.write(`${JSON.stringify(inspectStudioGuest())}\n`);
}
