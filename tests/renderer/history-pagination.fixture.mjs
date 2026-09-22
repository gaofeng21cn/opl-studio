import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWebUiHost } from "../../scripts/webui-host/http-host.mjs";
import { CodexAppServerTransport } from "../../scripts/webui-host/app-server-transport.mjs";

// Build the shared WebUI first. This fixture never launches the real Codex/OPL CLIs.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-history-browser-"));
const transport = new CodexAppServerTransport({
  command: process.execPath,
  args: [new URL("../../scripts/webui-host/fixtures/fake-app-server.mjs", import.meta.url).pathname],
  cwd: root,
  env: { ...process.env, FAKE_WORKSPACE: root, FAKE_APP_SERVER_HISTORY_PAGES: "1" },
  requestTimeoutMs: 5000,
  turnTimeoutMs: 10000
});
const state = JSON.parse(fs.readFileSync(new URL("../fixtures/studio-vm-fixture/state.json", import.meta.url), "utf8"));
const opl = {
  readState: async () => ({ app_state: state }),
  readInitialize: async () => ({ system_initialize: { setup_flow: { is_first_run: false, ready_to_launch: true } } }),
  readFullDrilldown: async () => ({ detail: "full", drilldown: {} }),
  executeAction: async () => ({ status: "preview_ready" })
};
const host = await createWebUiHost({
  transport, opl, webHost: "127.0.0.1", webPort: Number(process.env.OPL_HISTORY_TEST_PORT ?? 43183),
  env: { ...process.env, OPL_DATA_DIR: root, OPL_STUDIO_AION_MIGRATION: "0" },
  dshHome: path.join(root, "dsh")
});
console.log(JSON.stringify({ url: host.url, synthetic: true }));
let stopping;
const stop = () => stopping ??= host.close().finally(() => { fs.rmSync(root, { recursive: true, force: true }); process.exit(0); });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
