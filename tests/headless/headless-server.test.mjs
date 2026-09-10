import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { closeWithin, resolveHeadlessConfig, startHeadlessHost } from "../../scripts/headless/server.mjs";
import { createWebUiHost } from "../../scripts/webui-host/http-host.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = path.join(root, "scripts", "webui-host", "fixtures", "fake-app-server.mjs");

async function webRoot() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opl-headless-web-"));
  await writeFile(path.join(directory, "index.html"), '<div id="root"></div>', "utf8");
  return directory;
}

test("headless config validates bind, port, shutdown bound, and renderer root", () => {
  const config = resolveHeadlessConfig({
    OPL_HEADLESS_HOST: "0.0.0.0",
    OPL_HEADLESS_PORT: "8123",
    OPL_HEADLESS_SHUTDOWN_TIMEOUT_MS: "900",
    OPL_WEBUI_ROOT: "/tmp/opl-renderer"
  });
  assert.deepEqual(config, {
    address: "0.0.0.0",
    port: 8123,
    shutdownTimeoutMs: 900,
    webRoot: "/tmp/opl-renderer"
  });
  assert.throws(() => resolveHeadlessConfig({ OPL_HEADLESS_PORT: "70000" }), /OPL_HEADLESS_PORT/);
  assert.throws(() => resolveHeadlessConfig({ OPL_HEADLESS_SHUTDOWN_TIMEOUT_MS: "0" }), /SHUTDOWN_TIMEOUT/);
});

test("standalone host serves health and readiness from the shared host core", async (t) => {
  const directory = await webRoot();
  const project = await mkdtemp(path.join(os.tmpdir(), "opl-headless-health-project-"));
  const service = await startHeadlessHost({
    config: { address: "127.0.0.1", port: 0, shutdownTimeoutMs: 500, webRoot: directory },
    createHost: (options) => createWebUiHost({
      ...options,
      workspaceRoot: project,
      env: {
        ...process.env,
        OPL_DATA_DIR: project,
        OPL_STUDIO_AION_MIGRATION: "0",
        CODEX_APP_SERVER_COMMAND: process.execPath,
        CODEX_APP_SERVER_ARGS: fixture
      },
      opl: {
        readState: async () => ({}),
        readInitialize: async () => ({}),
        readFullDrilldown: async () => ({}),
        readDomainDetailView: async () => ({}),
        readContribution: async () => ({}),
        executeAction: async () => ({})
      }
    })
  });
  t.after(() => service.host.close());

  const baseUrl = `http://127.0.0.1:${service.port}`;
  const health = await fetch(`${baseUrl}/healthz`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");
  const readiness = await fetch(`${baseUrl}/readyz`);
  assert.equal(readiness.status, 200);
  assert.equal((await readiness.json()).status, "ready");
});

test("bounded close reports a stalled shutdown", async () => {
  const result = await closeWithin({ close: () => new Promise(() => {}) }, 20);
  assert.deepEqual(result, { timedOut: true });
});

test("standalone Node command starts the shared renderer and exits cleanly on SIGTERM", async (t) => {
  const directory = await webRoot();
  const project = await mkdtemp(path.join(os.tmpdir(), "opl-headless-project-"));
  await mkdir(path.join(project, "codex"));
  const child = spawn(process.execPath, ["scripts/headless/run.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      OPL_WEBUI_ROOT: directory,
      OPL_HEADLESS_HOST: "127.0.0.1",
      OPL_HEADLESS_PORT: "0",
      OPL_HEADLESS_SHUTDOWN_TIMEOUT_MS: "2000",
      OPL_STUDIO_CODEX_CWD: project,
      OPL_DATA_DIR: project,
      // This process-lifecycle fixture must not scan or migrate the user's
      // installed AionUI history while waiting for its listening receipt.
      OPL_STUDIO_AION_MIGRATION: "0",
      DSH_HOME: path.join(project, "dsh-home"),
      CODEX_APP_SERVER_COMMAND: process.execPath,
      CODEX_APP_SERVER_ARGS: fixture
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });

  const lines = readline.createInterface({ input: child.stdout });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
  const listening = await new Promise((resolve, reject) => {
    // Cold profile/module initialization runs in a separate Node process. Keep
    // a bounded startup budget with room for concurrent package qualification.
    const timeout = setTimeout(() => reject(new Error(`headless runner did not listen within 15s: ${stderr}`)), 15_000);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`headless runner exited early: ${code}: ${stderr}`));
    });
    lines.on("line", (line) => {
      const value = JSON.parse(line);
      if (value.status === "headless_server_listening") {
        clearTimeout(timeout);
        resolve(value);
      }
    });
  });
  assert.equal(listening.renderer, "shared_webui");
  assert.equal(listening.appServerAvailable, true);
  assert.equal((await fetch(`http://127.0.0.1:${listening.port}/readyz`)).status, 200);

  child.kill("SIGTERM");
  const exit = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("headless runner did not stop")), 4_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
  assert.deepEqual(exit, { code: 0, signal: null });
});
