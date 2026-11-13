import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createHeadlessInstaller } from "../../scripts/headless/installer.mjs";
import { createHeadlessServiceManager } from "../../scripts/headless/service-manager.mjs";

async function sourceFixture(version = "1.0.0") {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-headless-source-"));
  await mkdir(path.join(root, "dist", "webui"), { recursive: true });
  await mkdir(path.join(root, "scripts", "headless"), { recursive: true });
  await mkdir(path.join(root, "src", "host"), { recursive: true });
  const manifest = { name: "headless-fixture", version, type: "module", dependencies: { "host-plugin": "file:plugins/host-plugin" } };
  await writeFile(path.join(root, "package.json"), JSON.stringify(manifest), "utf8");
  await mkdir(path.join(root, "plugins", "host-plugin", "lib"), { recursive: true });
  await writeFile(path.join(root, "plugins", "host-plugin", "package.json"), JSON.stringify({ name: "host-plugin", version: "1.0.0", type: "module", main: "lib/index.mjs" }), "utf8");
  await writeFile(path.join(root, "plugins", "host-plugin", "lib", "index.mjs"), "export const ready = true;\n", "utf8");
  await writeFile(path.join(root, "package-lock.json"), JSON.stringify({ name: manifest.name, version, lockfileVersion: 3, requires: true,
    packages: { "": manifest, "plugins/host-plugin": { version: "1.0.0" }, "node_modules/host-plugin": { resolved: "plugins/host-plugin", link: true } } }), "utf8");
  await mkdir(path.join(root, "desktop"), { recursive: true });
  for (const file of ["official-profile.mjs", "node-host-runtime.mjs", "node-host-policy.json"]) await writeFile(path.join(root, "desktop", file), file.endsWith(".json") ? "{}" : "export {};\n", "utf8");
  await writeFile(path.join(root, "src", "host", "packaged-host-smoke.mjs"), "import { ready } from 'host-plugin'; import '../../desktop/official-profile.mjs'; if (!ready) throw Error('missing plugin'); console.log('OPL_PACKAGED_HOST_READY');\n", "utf8");
  await writeFile(path.join(root, "dist", "webui", "index.html"), '<div id="root"></div>', "utf8");
  for (const file of ["run.mjs", "service-manager.mjs", "update-runner.mjs", "installer.mjs"]) {
    await writeFile(path.join(root, "scripts", "headless", file), `export const file = ${JSON.stringify(file)};\n`, "utf8");
  }
  await writeFile(path.join(root, "scripts", "install-headless.mjs"), "export {};\n", "utf8");
  await writeFile(path.join(root, "src", "host", "http-host.mjs"), "export {};\n", "utf8");
  return root;
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("default Headless service and updater retain the installing Node's stable entrypoint", async context => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opl-headless-node-entrypoint-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  await mkdir(bin);
  const entrypoint = path.join(bin, path.basename(process.execPath));
  await symlink(process.execPath, entrypoint);
  for (const platform of ["darwin", "linux"]) {
    const installRoot = path.join(root, platform);
    const files = [];
    let serviceOptions;
    const installer = createHeadlessInstaller({
      platform, homeDirectory: root, installRoot, env: { PATH: bin },
      installPayload: async () => {
        await mkdir(installRoot);
        await writeFile(path.join(installRoot, "installation.json"), JSON.stringify({ version: "1.0.0" }));
        return { version: "1.0.0" };
      },
      createServiceManager: options => {
        serviceOptions = options;
        return createHeadlessServiceManager({ ...options, uid: 1001,
          execute: async () => ({ exitCode: 0, stdout: "active", stderr: "" }),
          fileSystem: { mkdir: async () => {}, rm: async () => {}, writeFile: async (_file, text) => files.push(text) }
        });
      },
      fetch: async url => url.endsWith("/readyz")
        ? response(200, { status: "ready", appServerAvailable: true })
        : response(200, { readback: { exitCode: 0 }, app_state: {} })
    });
    await installer.run("install");
    assert.equal(serviceOptions.nodeExecutable, entrypoint);
    assert.equal(serviceOptions.serviceEnvironment.OPL_NATIVE_APP_UPDATE_EXECUTABLE, entrypoint);
    assert.ok(files[0].includes(entrypoint));
    assert.ok(!files[0].includes(process.execPath));
  }
  const upgraded = path.join(root, "upgraded-node");
  await writeFile(upgraded, "#!/bin/sh\nprintf upgraded", { mode: 0o755 });
  await rm(entrypoint);
  await symlink(upgraded, entrypoint);
  assert.equal(execFileSync(entrypoint, [], { encoding: "utf8" }), "upgraded");
});

test("installer binds the installed runtime, fixed updater argv, and fresh host/App-state readback", async () => {
  const sourceRoot = await sourceFixture();
  const installRoot = await mkdtemp(path.join(os.tmpdir(), "opl-headless-install-"));
  const serviceActions = [];
  const serviceOptions = [];
  const fetches = [];
  const installer = createHeadlessInstaller({
    platform: "darwin",
    homeDirectory: "/Users/opl",
    sourceRoot,
    installRoot,
    nodeExecutable: "/opt/homebrew/bin/node",
    env: {
      PATH: "/opt/homebrew/bin:/usr/bin:/bin",
      CODEX_HOME: "/Users/opl/.codex",
      OPL_APP_OPL_BIN: "/Users/opl/framework/bin/opl",
      OPL_APP_REPO_ROOT: "/Users/opl/app-product",
      OPL_CODEX_BIN: "/Users/opl/.local/bin/codex",
      OPL_HEADLESS_HOST: "127.0.0.1",
      OPL_HEADLESS_PORT: "4180",
      OPL_HEADLESS_WORKSPACE_ROOT: "/Users/opl/Projects"
    },
    createServiceManager: (options) => {
      serviceOptions.push(options);
      return {
        run: async (action) => {
          serviceActions.push(action);
          return { action, scope: "user", native: { exitCode: 0 } };
        }
      };
    },
    fetch: async (url) => {
      fetches.push(url);
      if (url.endsWith("/readyz")) return response(200, { status: "ready", appServerAvailable: true });
      return response(200, { readback: { exitCode: 0 }, app_state: { schema: "opl_app_state.v1" } });
    },
    sleep: async () => {}
  });

  const result = await installer.run("install");
  assert.equal(result.status, "installed");
  assert.equal(result.version, "1.0.0");
  assert.equal(result.readback.ready.status, "ready");
  assert.equal(result.readback.appState.readback.exitCode, 0);
  assert.deepEqual(serviceActions, ["install"]);
  assert.deepEqual(fetches, [
    "http://127.0.0.1:4180/readyz",
    "http://127.0.0.1:4180/api/opl/state?profile=fast"
  ]);

  const options = serviceOptions[0];
  const current = path.join(installRoot, "current");
  const updater = path.join(current, "scripts", "headless", "update-runner.mjs");
  assert.equal(options.headlessEntry, path.join(current, "scripts", "headless", "run.mjs"));
  assert.equal(options.serviceEnvironment.OPL_WEBUI_ROOT, path.join(current, "dist", "webui"));
  assert.equal(options.serviceEnvironment.OPL_NATIVE_APP_UPDATE_CARRIER, "standalone_headless_webui");
  assert.equal(options.serviceEnvironment.OPL_NATIVE_APP_UPDATE_EXECUTABLE, "/opt/homebrew/bin/node");
  assert.equal(options.serviceEnvironment.CODEX_HOME, "/Users/opl/.codex");
  assert.equal(options.serviceEnvironment.OPL_APP_OPL_BIN, "/Users/opl/framework/bin/opl");
  assert.equal(options.serviceEnvironment.OPL_APP_REPO_ROOT, "/Users/opl/app-product");
  assert.equal(options.serviceEnvironment.OPL_APP_STATE_TIMEOUT_MS, "20000");
  assert.equal(options.serviceEnvironment.OPL_CODEX_BIN, "/Users/opl/.local/bin/codex");
  assert.deepEqual(JSON.parse(options.serviceEnvironment.OPL_NATIVE_APP_UPDATE_CHECK_ARGS_JSON), [
    updater,
    "check",
    "--install-root",
    installRoot
  ]);
  assert.equal(options.serviceEnvironment.OPL_STUDIO_CODEX_CWD, "/Users/opl/Projects");
  assert.equal(JSON.parse(await readFile(path.join(installRoot, "installation.json"), "utf8")).version, "1.0.0");
});

test("installer restarts applied updates and rollbacks, then uninstalls its payload", async () => {
  const sourceRoot = await sourceFixture();
  const installRoot = await mkdtemp(path.join(os.tmpdir(), "opl-headless-install-"));
  const serviceActions = [];
  const updateOperations = [];
  const installer = createHeadlessInstaller({
    platform: "linux",
    sourceRoot,
    installRoot,
    nodeExecutable: "/usr/bin/node",
    env: { PATH: "/usr/bin:/bin", OPL_HEADLESS_PORT: "4181" },
    createServiceManager: () => ({
      run: async (action) => {
        serviceActions.push(action);
        return { action, scope: "user", native: { exitCode: 0 } };
      }
    }),
    createUpdateRunner: () => ({
      perform: async (operation) => {
        updateOperations.push(operation);
        return {
          schema: "opl_native_app_updater.v1",
          supported: true,
          state: operation === "rollback" ? "rolled_back" : "applied",
          currentVersion: operation === "rollback" ? "1.1.0" : "1.0.0",
          targetVersion: operation === "rollback" ? "1.0.0" : "1.1.0",
          restartRequired: true
        };
      }
    }),
    fetch: async (url) => url.endsWith("/readyz")
      ? response(200, { status: "ready", appServerAvailable: true })
      : response(200, { readback: { exitCode: 0 }, app_state: {} }),
    sleep: async () => {}
  });

  await installer.run("install");
  await installer.run("status");
  await installer.run("stop");
  await installer.run("start");
  await installer.run("restart");
  assert.equal((await installer.run("update")).version, "1.1.0");
  assert.equal((await installer.run("rollback")).version, "1.0.0");
  assert.deepEqual(updateOperations, ["apply", "rollback"]);
  assert.deepEqual(serviceActions, ["install", "status", "stop", "start", "restart", "restart", "restart"]);
  await installer.run("uninstall");
  assert.equal(serviceActions.at(-1), "uninstall");
  await assert.rejects(readFile(path.join(installRoot, "installation.json"), "utf8"), /ENOENT/);
});

test("installer does not claim an unqualified platform", async () => {
  const sourceRoot = await sourceFixture();
  const installer = createHeadlessInstaller({ platform: "win32", sourceRoot });
  await assert.rejects(installer.run("install"), /not qualified for Windows/);
});

test("installer rejects remote binding until the HTTP bridge has authentication", async () => {
  const sourceRoot = await sourceFixture();
  assert.throws(
    () => createHeadlessInstaller({
      platform: "darwin",
      sourceRoot,
      env: { OPL_HEADLESS_HOST: "0.0.0.0" }
    }),
    /requires a loopback host/
  );
});
