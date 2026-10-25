// Run the unpacked shared Host with standalone Node, before signing.
// This checks npm peer closure and profile loading without a real task or owner.
import assert from "node:assert/strict";
import { readHostNodeIdentity } from "../../desktop/node-host-runtime.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bootOplStudioHost } from "./dsh/host.mjs";

assert.equal(process.versions.electron, undefined, "Host must run in standalone Node");
const nodeIdentity = readHostNodeIdentity();
process.stdout.write(`OPL_NODE_HOST_RUNTIME ${JSON.stringify({ version: nodeIdentity.version, sha256: nodeIdentity.sha256 })}\n`);
const directory = await mkdtemp(path.join(os.tmpdir(), "opl-packaged-host-"));
let core;
try {
  const transport = {
    initialized: false,
    on() {},
    createChannelCallbackAdapter: () => null,
    async start() { this.initialized = true; },
    async stop() { this.initialized = false; }
  };
  const result = await bootOplStudioHost({
    dshHome: directory,
    workspaceRoot: directory,
    transport,
    opl: Object.fromEntries([
      "readState", "readInitialize", "readFullDrilldown", "readDomainDetailView",
      "readContribution", "executeAction"
    ].map((name) => [name, async () => ({})])),
    webHost: "127.0.0.1",
    webPort: 0
  });
  core = result.core;
  assert.ok(result.context.get("tools"), "packaged DSH tools did not load");
  assert.ok(result.context.get("oplDshToolMcp"), "packaged MCP bridge did not load");
  assert.equal(transport.initialized, true);
  process.stdout.write("OPL_PACKAGED_HOST_READY\n");
} finally {
  await core?.close();
  await rm(directory, { recursive: true, force: true });
}
