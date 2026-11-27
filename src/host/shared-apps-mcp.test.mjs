import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sharedAppsMcpArgs } from "../../plugins/core/opl-codex-native/src/shared-apps-mcp.mjs";
import { CodexAppServerTransport } from "../../plugins/core/opl-codex-native/src/app-server-transport.mjs";

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
