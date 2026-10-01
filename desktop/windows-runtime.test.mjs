import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { buildWindowsRuntimeCommand, createWindowsRuntime, readWindowsRuntimeReceipt, validateWindowsRuntimeIdentity } from "./windows-runtime.mjs";

function identity(overrides = {}) {
  return { schema: "opl_linux_runtime_inspection.v1", protocol_version: 1, logical_distribution: "OPL-Linux",
    physical_distribution: "OPL-Linux", distribution_generation: 1, guest_install_id: "owned-guest", architecture: "x86_64",
    guest_user: "opl", codex_home: "/home/opl/.codex", workspace_root: "/home/opl/code", wsl2: true,
    native_windows_executor_fallback_allowed: false, active_operation_count: 0,
    codex_path: "/opt/opl/carrier/store/sha256/example/codex", codex_realpath: "/opt/opl/carrier/store/sha256/example/codex",
    codex_command_path: "/usr/local/bin/codex", framework_path: "/home/opl/.opl/one-person-lab/bin/opl", framework_ref: "a".repeat(40),
    ...Object.fromEntries(["carrier_activation_digest", "bootstrap_digest", "codex_digest", "codex_command_digest", "framework_digest"].map(key => [key, `sha256:${"b".repeat(64)}`])), ...overrides };
}
function receiptReader(value = identity()) {
  const bytes = Buffer.from(JSON.stringify({ schema: "opl_windows_wsl2_provisioning_receipt.v1", status: "ready", distribution: "OPL-Linux", identity: value }));
  return file => file.endsWith(".sha256") ? crypto.createHash("sha256").update(bytes).digest("hex") : bytes;
}
function fakeSpawn(fresh = identity()) {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true });
    calls.push({ command, args, options, child });
    if (!args.includes("codex-app-server")) queueMicrotask(() => {
      if (args.includes("/opt/opl/bootstrap/opl-runtime-inspect")) child.stdout.write(Buffer.from(JSON.stringify(fresh), "utf16le"));
      if (args.includes("opl-cli")) child.stdout.write('{"app_state":{"status":"ready"}}');
      child.emit("close", 0);
    });
    return child;
  };
  return { calls, spawnImpl };
}

test("Windows existing-runtime admission binds the retained receipt to a fresh WSL owner identity", async () => {
  const fake = fakeSpawn();
  const runtime = createWindowsRuntime({ platform: "win32", userDataPath: "C:\\AppData\\One Person Lab", readFile: receiptReader(), spawnImpl: fake.spawnImpl, env: { SystemRoot: "C:\\Windows" } });
  assert.equal((await runtime.ensureReady()).workspaceRoot, "/home/opl/code");
  assert.deepEqual(fake.calls[0].args, ["--distribution", "OPL-Linux", "--user", "opl", "--exec", "/opt/opl/bootstrap/opl-runtime-inspect", "--json"]);
  assert.equal(fake.calls[0].command, "C:\\Windows\\System32\\wsl.exe");
  assert.equal(fake.calls[0].options.shell, false);
  const changed = fakeSpawn(identity({ guest_install_id: "foreign" }));
  await assert.rejects(createWindowsRuntime({ platform: "win32", userDataPath: "fixture", readFile: receiptReader(), spawnImpl: changed.spawnImpl }).ensureReady(), { code: "wsl_foreign_distribution" });
  assert.throws(() => readWindowsRuntimeReceipt("fixture", file => file.endsWith(".sha256") ? "0".repeat(64) : receiptReader()(file)), { code: "wsl_receipt_digest_mismatch" });
});

test("Windows runtime rejects native fallbacks, wrong data owners, digest drift and untyped commands", () => {
  for (const change of [{ codex_home: "C:\\Users\\user\\.codex" }, { native_windows_executor_fallback_allowed: true },
    { wsl2: false }, { physical_distribution: "Ubuntu" }, { codex_command_digest: `sha256:${"f".repeat(64)}` }]) {
    assert.throws(() => validateWindowsRuntimeIdentity(identity(change)));
  }
  assert.throws(() => buildWindowsRuntimeCommand("bash", ["-c", "arbitrary"], "valid"), { code: "wsl_execution_request_invalid" });
  assert.throws(() => buildWindowsRuntimeCommand("opl-cli", [], "invalid;token"), { code: "wsl_execution_request_invalid" });
  const argumentsWithSpaces = ["app", "action", "execute", "--payload", '{"path":"/home/opl/a b"}'];
  assert.deepEqual(buildWindowsRuntimeCommand("opl-cli", argumentsWithSpaces, "safe-token").slice(-argumentsWithSpaces.length), argumentsWithSpaces);
});

test("Windows Codex and Framework reuse one guest and cancellation targets its exact operation", async () => {
  const fake = fakeSpawn();
  const runtime = createWindowsRuntime({ platform: "win32", userDataPath: "fixture", readFile: receiptReader(), spawnImpl: fake.spawnImpl });
  await runtime.ensureReady();
  const codex = runtime.spawnCodex("ignored-native-codex", ["app-server", "--stdio"], { env: { OPL_APP_PROCESS_INSTANCE_ID: "one-process" } });
  const result = await runtime.runOpl("ignored-native-opl", ["app", "state", "--json"]);
  assert.equal(JSON.parse(result.stdout).app_state.status, "ready");
  assert.equal(result.exitCode, 0);
  codex.kill("SIGTERM");
  await runtime.close();
  const execs = fake.calls.filter(call => call.args.includes("/opt/opl/bootstrap/opl-runtime-exec"));
  const controls = fake.calls.filter(call => call.args.includes("/opt/opl/bootstrap/opl-runtime-control"));
  assert.equal(execs.length, 2);
  assert.equal(controls.length, 2);
  for (const execution of execs) {
    const token = execution.args[execution.args.indexOf("--operation-token") + 1];
    assert.equal(controls.filter(call => call.args.includes(token)).length, 1);
    assert.equal(execution.options.shell, false);
  }
  assert.equal(execs[0].options.env.WSLENV, "OPL_APP_PROCESS_INSTANCE_ID");
  assert.equal(fake.calls.some(call => call.args.includes("--shutdown") || call.args.includes("--unregister")), false);
  assert.throws(() => runtime.spawnOpl("opl", ["app", "state"]), { code: "wsl_runtime_not_ready" });
});
