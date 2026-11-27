import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { OplCodexNative } from "../../plugins/core/opl-codex-native/src/service.mjs";
import { sharedAppsMcpArgs } from "../../plugins/core/opl-codex-native/src/shared-apps-mcp.mjs";
import { CodexAppServerTransport } from "../../plugins/core/opl-codex-native/src/app-server-transport.mjs";

test("a running native Host finds a new managed Codex for the catalog and app server", { skip: process.platform === "win32" }, async t => {
  const home = await mkdtemp(path.join(await realpath(os.tmpdir()), "studio-managed-codex-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const fixture = new URL("./fixtures/fake-app-server.mjs", import.meta.url).href;
  for (const custom of [false, true]) {
    const root = custom ? path.join(home, "custom") : path.join(home, "Library", "Application Support", "OPL", "runtime");
    const runtimeBin = path.join(root, "current", "bin");
    const pathBin = path.join(root, "external");
    const log = path.join(root, "calls.jsonl");
    const env = { HOME: home, PATH: pathBin, ...(custom ? { OPL_RUNTIME_ROOT: root } : {}) };
    const host = new OplCodexNative({ env, workspaceRoot: home, channelBindingFile: path.join(home, "bindings.json") });
    try {
      await host.start();
      assert.equal(host.capabilities().available, false);
      for (const directory of [runtimeBin, pathBin]) {
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, "codex"), `#!${process.execPath}
const { appendFileSync } = require("node:fs");
const mode = process.argv[2];
appendFileSync(${JSON.stringify(log)}, JSON.stringify([__filename, mode]) + "\\n");
if (mode === "mcp") process.stdout.write("[]");
else if (mode === "app-server") import(${JSON.stringify(fixture)});
`, { mode: 0o755 });
        await host.start();
        assert.equal(host.capabilities().available, true);
        assert.deepEqual((await readFile(log, "utf8")).trim().split("\n").slice(-2).map(line => JSON.parse(line)), [
          [path.join(directory, "codex"), "mcp"], [path.join(directory, "codex"), "app-server"],
        ]);
        await host.transport.stop();
      }
    } finally {
      await host.close();
    }
  }
});

test("uses scoped Codex overrides for clean workbenches and honors user MCP transports", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "studio-catalog-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const command = path.join(dir, "codex");
  await writeFile(command, `#!${process.execPath}
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["mcp","list","--json"])) process.exit(2);
process.stdout.write(process.env.TEST_CATALOG);`, { mode: 0o755 });
  const configured = { name: "opl-apps", enabled: true, transport: {
    type: "stdio", command: "/installed/bin/opl", args: ["connect", "mcp-app-stdio"], env: { OPL_DATA_DIR: "/chosen/data" }
  }};
  const probe = (catalog, options = {}) => sharedAppsMcpArgs({
    command, cwd: dir, stateDir: dir,
    env: { TEST_CATALOG: JSON.stringify(catalog), OPL_APP_OPL_BIN: "/bundled/bin/opl",
      OPL_STATE_DIR: "/env/state", ...options }
  });
  assert.deepEqual(await probe([{ name: "another-server" }]), [
    "-c", 'mcp_servers.opl-apps.command="/bundled/bin/opl"',
    "-c", 'mcp_servers.opl-apps.args=["connect","mcp-app-stdio"]',
    "-c", `mcp_servers.opl-apps.env.OPL_STATE_DIR=${JSON.stringify(dir)}`
  ]);
  assert.deepEqual(await probe([configured]), []);
  assert.deepEqual(await probe([configured], { OPL_NATIVE_WORKBENCH_READ_ONLY: "1" }), [
    "-c", 'mcp_servers.opl-apps.args=["connect","mcp-app-stdio","--read-only"]'
  ]);
  const nodeTransport = { ...configured.transport, command: "/installed/bin/node",
    args: ["/installed/bin/opl", "connect", "mcp-app-stdio"] };
  assert.deepEqual(await probe([{ ...configured, transport: nodeTransport }], { OPL_STUDIO_READ_ONLY: "1" }), [
    "-c", 'mcp_servers.opl-apps.args=["/installed/bin/opl","connect","mcp-app-stdio","--read-only"]'
  ]);
  for (const entry of [
    { ...configured, enabled: false },
    { ...configured, transport: { type: "streamable_http", url: "http://localhost/custom" } },
    { ...configured, transport: { ...configured.transport, args: ["custom"] } }
  ]) assert.deepEqual(await probe([entry], { OPL_STUDIO_READ_ONLY: "1" }), []);
  assert.deepEqual(await probe([], { TEST_CATALOG: "invalid" }), []);
});

test("closing during optional MCP discovery cancels the pending app server spawn", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const transport = new CodexAppServerTransport({ command: "missing-codex", extraLaunchArgs: () => pending });
  const start = transport.start();
  await transport.close();
  release([]);
  await assert.rejects(start, error => error.code === "app_server_stopping");
  assert.equal(transport.process, null);
});
