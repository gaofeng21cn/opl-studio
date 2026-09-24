import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createWindowsProvisioner } from "./windows-provisioning.mjs";

function scenario(context, { foreign = false, featureMissing = false, restart = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-wsl-provision-test-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const userDataPath = path.join(root, "data"), resourcesPath = path.join(root, "resources");
  fs.mkdirSync(path.join(resourcesPath, "opl-wsl-host"), { recursive: true });
  fs.writeFileSync(path.join(resourcesPath, "opl-wsl-host/manifest.json"), JSON.stringify({ bootstrap: { framework_ref: "a".repeat(40) } }));
  let installed = foreign, enabled = !featureMissing;
  const calls = [], progress = [];
  const identity = { schema: "opl_studio_linux_runtime_inspection.v1", protocol_version: 1,
    logical_distribution: "OPL-Linux", physical_distribution: "OPL-Linux", distribution_generation: 1, guest_install_id: "fresh",
    architecture: "x86_64", guest_user: "opl", wsl2: true, codex_home: "/home/opl/.codex", workspace_root: "/home/opl/code",
    native_windows_executor_fallback_allowed: false, active_operation_count: 0,
    codex_path: "/opt/opl/studio-runtime/codex-root/vendor/x86_64-unknown-linux-musl/bin/codex",
    codex_realpath: "/opt/opl/studio-runtime/codex-root/vendor/x86_64-unknown-linux-musl/bin/codex", codex_command_path: "/usr/local/bin/codex",
    framework_path: "/home/opl/.opl/one-person-lab/bin/opl", framework_ref: "a".repeat(40),
    ...Object.fromEntries(["carrier_activation_digest", "bootstrap_digest", "codex_digest", "codex_command_digest", "framework_digest"].map(key => [key, `sha256:${"b".repeat(64)}`])) };
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill() {} });
    queueMicrotask(() => {
      let code = 0, out = "";
      const script = args.at(-1);
      if (args.includes("--status")) code = enabled ? 0 : 1;
      else if (script.includes("-Verb RunAs")) { enabled = !restart; }
      else if (script.includes("CurrentVersion\\Lxss")) {
        if (!installed) code = 3;
        else out = JSON.stringify({ name: "OPL-Linux", basePath: foreign ? "C:\\Foreign" : path.win32.join(userDataPath, "wsl/OPL-Linux"), version: 2 });
      }
      else if (args.includes("--install")) installed = true;
      else if (args.includes("/usr/bin/wslpath")) out = "/mnt/c/opl-wsl-host";
      else if (args.includes("/opt/opl/studio-bootstrap/inspect.mjs")) out = JSON.stringify(identity);
      child.stdout.end(out); child.emit("close", code);
    });
    return child;
  };
  return { calls, progress, userDataPath, provisioner: createWindowsProvisioner({ userDataPath, resourcesPath, platform: "win32", spawnImpl,
    resumeExecutable: "C:\\Apps\\One Person Lab.exe", onProgress: value => progress.push(value), verifyPayload: () => {} }) };
}

test("Windows first install provisions only its owned WSL2 namespace and writes a fresh inspection receipt", async context => {
  const fx = scenario(context);
  const identity = await fx.provisioner.ensureReady();
  assert.equal(identity.schema, "opl_studio_linux_runtime_inspection.v1");
  const install = fx.calls.find(call => call.args.includes("--install"));
  assert.deepEqual(install.args.slice(0, 4), ["--install", "Ubuntu-24.04", "--name", "OPL-Linux"]);
  assert.equal(fx.calls.every(call => call.options.shell === false), true);
  assert.equal(fx.calls.some(call => call.args.includes("--shutdown") || call.args.includes("--unregister") || call.args.includes("--set-default")), false);
  assert.equal(fx.progress.at(-1).stage, "ready");
  assert.equal(JSON.parse(fs.readFileSync(path.join(fx.userDataPath, "installer/receipts/windows-wsl2-ready.json"), "utf8")).identity.guest_install_id, "fresh");
});

test("Windows first install refuses a same-name foreign distribution without running guest bootstrap", async context => {
  const fx = scenario(context, { foreign: true });
  await assert.rejects(fx.provisioner.ensureReady(), { code: "wsl_foreign_distribution" });
  assert.equal(fx.calls.some(call => call.args.includes("/bin/bash")), false);
});

test("Windows feature enablement preserves UAC and an explicit restart-resume state", async context => {
  const fx = scenario(context, { featureMissing: true, restart: true });
  await assert.rejects(fx.provisioner.ensureReady(), { code: "wsl_restart_required", restartRequired: true });
  assert.ok(fx.calls.some(call => call.args.at(-1).includes("-Verb RunAs")));
  assert.ok(fx.calls.some(call => call.args.at(-1).includes("RunOnce")));
  assert.equal(fx.calls.some(call => call.args.includes("--install")), false);
});
