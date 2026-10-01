import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import test from "node:test";
import { startWindowsGuestHost } from "./windows-guest-host.mjs";
import { createWindowsGuestHost, verifyGuestPayloadFiles } from "./windows-guest-proxy.mjs";

function fixture({ verifyPayload = () => {} } = {}) {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
  const requests = [], nativeCalls = [], progress = [];
  let bootOptions, busy = false, closed = 0, spawned = false;
  const realCore = Object.assign(new EventEmitter(), {
    capabilities: () => ({ appServerAvailable: true }),
    codex: { capabilities: () => ({ available: true }), reloadConfiguration: async value => ({ reloaded: true, ...value }) },
    transport: { async runWhenIdle(operation) {
      if (busy) return { status: "deferred", reasonCode: "app_server_busy" };
      busy = true;
      try { return { status: "completed", result: await operation() }; } finally { busy = false; }
    } },
    opl: { runManagedUpdate: async operation => ({ operation }), runStartupMaintenance: async () => ({ system_action: { status: "completed" } }) },
    async invoke(method, payload) {
      requests.push({ method, payload });
      if (method === "pickFiles") return bootOptions.platform.pickFiles();
      if (method === "accessThreadWorkspace") return bootOptions.platform.accessWorkspacePath({ path: "/home/opl/code/report.pdf", action: "open" });
      if (method === "readNativeAppUpdateStatus") return bootOptions.nativeUpdater.perform("status");
      if (method === "bytes") return { data: Buffer.from([0, 1, 255]) };
      return { method, payload };
    },
    async close() { closed++; }
  });
  const originalEnv = { ...process.env };
  const worker = startWindowsGuestHost({ input: child.stdin, output: child.stdout, platform: "linux", arch: "x64",
    createCore: async options => { bootOptions = options; return realCore; } });
  const runtime = {
    ensureReady: async () => ({ identity: {
      schema: "opl_linux_runtime_inspection.v1", protocol_version: 1, logical_distribution: "OPL-Linux",
      physical_distribution: "OPL-Linux", guest_user: "opl", architecture: "x86_64", wsl2: true,
      codex_home: "/home/opl/.codex", workspace_root: "/home/opl/code", native_windows_executor_fallback_allowed: false,
      guest_install_id: "owned", distribution_generation: 1, active_operation_count: 0,
      codex_path: "/opt/opl/carrier/store/sha256/example/codex", codex_realpath: "/opt/opl/carrier/store/sha256/example/codex",
      codex_command_path: "/usr/local/bin/codex", framework_path: "/home/opl/.opl/one-person-lab/bin/opl", framework_ref: "a".repeat(40),
      ...Object.fromEntries(["carrier_activation_digest", "bootstrap_digest", "codex_digest", "codex_command_digest", "framework_digest"].map(key => [key, `sha256:${"b".repeat(64)}`]))
    } }),
    projectHostPath: async target => `/mnt/c/${target.replaceAll("\\", "/").replace(/^C:\//, "")}`,
    projectGuestPath: async target => `\\\\wsl.localhost\\OPL-Linux${target.replaceAll("/", "\\")}`,
    stageGuestHost: async (_source, digest) => `/home/opl/.opl/studio-host/${digest}/opl-wsl-host/desktop/windows-guest-host.mjs`,
    spawnGuestHost: entry => { assert.match(entry, /^\/home\/opl\/\.opl\/studio-host\/[0-9a-f]{64}\/opl-wsl-host\/desktop\/windows-guest-host\.mjs$/); spawned = true; return child; },
    close: async () => { child.emit("close", 0); }
  };
  const proxy = () => createWindowsGuestHost({ windowsRuntime: runtime, resourcesPath: "C:\\App\\resources", userDataPath: "C:\\UserData",
    version: "26.9.24", instanceId: "instance", canonicalThreadHost: "NATIVE-WINDOWS", verifyPayload, readFile: () => JSON.stringify({ schema: "opl_studio_windows_guest_host.v1", platform: "linux", arch: "x64",
      entry: "desktop/windows-guest-host.mjs", shell_ref: "a".repeat(40), package_lock_sha256: "b".repeat(64) }),
    platform: {
      pickFiles: async () => [{ kind: "file", name: "a b.pdf", path: "C:\\files\\a b.pdf" }],
      accessWorkspacePath: async value => { nativeCalls.push(value); return { opened: true }; }
    }, nativeUpdater: { perform: async operation => ({ operation }) },
    onProgress: value => progress.push(value),
    carrierDiagnostics: { read: async () => ({ platform: "win32" }) }
  });
  return { proxy, requests, nativeCalls, progress, realCore, spawned: () => spawned, bootOptions: () => bootOptions, closed: () => closed,
    async cleanup() {
      (await worker).rpc.close();
      for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
      Object.assign(process.env, originalEnv);
    }
  };
}

test("guest stdio proxy retains Linux Framework/Codex ownership and forwards events, files and native services", async context => {
  const fx = fixture(); context.after(() => fx.cleanup());
  const proxy = await fx.proxy();
  assert.equal(fx.progress.at(-1).stage, "ready");
  assert.equal(fx.bootOptions().env.CODEX_HOME, "/home/opl/.codex");
  assert.equal(fx.bootOptions().workspaceRoot, "/home/opl/code");
  assert.equal(fx.bootOptions().env.OPL_CODEX_BIN, "/usr/local/bin/codex");
  assert.equal(fx.bootOptions().canonicalThreadHost, "NATIVE-WINDOWS");
  assert.equal(fx.bootOptions().channelBindingFile, "/mnt/c/UserData/channel-transport-bindings.json");
  assert.equal(fx.bootOptions().env.OPL_AIONUI_DATA_DIR, "/mnt/c/UserData");
  assert.equal(fx.bootOptions().env.OPL_APP_HOST_KIND, "desktop");
  assert.equal(fx.bootOptions().env.OPL_FRAMEWORK_PACKAGE_ROOT, "/home/opl/.opl/one-person-lab");
  assert.equal(fx.bootOptions().env.OPL_FRAMEWORK_UPDATE_TARGET_ROOT, fx.bootOptions().env.OPL_FRAMEWORK_PACKAGE_ROOT);
  const files = await proxy.invoke("pickFiles");
  assert.equal(files[0].path, "/mnt/c/files/a b.pdf");
  await proxy.invoke("accessThreadWorkspace");
  assert.deepEqual(fx.nativeCalls, [{ path: "\\\\wsl.localhost\\OPL-Linux\\home\\opl\\code\\report.pdf", action: "open" }]);
  assert.deepEqual(await proxy.invoke("readNativeAppUpdateStatus"), { operation: "status" });
  assert.deepEqual(await proxy.invoke("bytes"), { data: Buffer.from([0, 1, 255]) });
  const received = new Promise(resolve => proxy.once("event", resolve));
  fx.realCore.emit("event", { method: "codex/thread", params: { id: "guest-thread" } });
  assert.deepEqual(await received, { method: "codex/thread", params: { id: "guest-thread" } });
  assert.deepEqual(await proxy.opl.runManagedUpdate("check"), { operation: "check" });
  assert.deepEqual(await proxy.opl.runStartupMaintenance(), { system_action: { status: "completed" } });
  const unavailable = new Promise(resolve => proxy.once("event", resolve));
  fx.realCore.emit("event", { method: "host/availability", params: { available: false } });
  await unavailable;
  assert.equal(proxy.codex.capabilities().available, false);
  assert.equal(proxy.transport.initialized, false);
  await proxy.close();
  assert.ok(fx.closed() >= 1);
});

test("guest idle lease reserves admission through parent callback and permits updater shutdown without deadlock", async context => {
  const fx = fixture(); context.after(() => fx.cleanup());
  const proxy = await fx.proxy();
  let release, entered;
  const inside = new Promise(resolve => { entered = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const first = proxy.transport.runWhenIdle(async () => { entered(); await hold; return "done"; });
  await inside;
  assert.deepEqual(await proxy.transport.runWhenIdle(async () => "must-not-run"), { status: "deferred", reasonCode: "app_server_busy" });
  release();
  assert.deepEqual(await first, { status: "completed", result: "done" });
  assert.deepEqual(await proxy.transport.runWhenIdle(() => proxy.close()), { status: "completed", result: undefined });
});

test("guest payload admission validates exact files and bytes before launching Linux code", async context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-wsl-payload-test-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "package-lock.json"), "fixture");
  const digest = crypto.createHash("sha256").update("fixture").digest("hex");
  const manifest = { package_lock_sha256: digest, files: [{ path: "package-lock.json", sha256: digest }] };
  await verifyGuestPayloadFiles(root, manifest);
  fs.writeFileSync(path.join(root, "unexpected.js"), "unexpected");
  await assert.rejects(verifyGuestPayloadFiles(root, manifest), /bytes differ/);
  fs.unlinkSync(path.join(root, "unexpected.js"));
  fs.writeFileSync(path.join(root, "package-lock.json"), "tampered");
  await assert.rejects(verifyGuestPayloadFiles(root, manifest), /bytes differ/);
});


test("guest launch waits for asynchronous payload admission", async context => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const fx = fixture({ verifyPayload: () => gate }); context.after(() => fx.cleanup());
  const waiting = fx.proxy();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fx.spawned(), false);
  release();
  const proxy = await waiting;
  assert.equal(fx.spawned(), true);
  await proxy.close();
});
