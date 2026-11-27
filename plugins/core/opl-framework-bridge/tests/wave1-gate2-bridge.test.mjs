import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  OplFrameworkBridge,
  OpldClient,
  OpldRpcError,
  apply,
  createOplPassthrough,
  inject,
  name,
  resolveOplStatePaths,
} from "../lib/index.mjs";

const BRIDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(BRIDGE_DIR, "src");
const DAEMON_BIN = process.env.OPL_DAEMON_BIN || "/Users/gaofeng/workspace/one-person-lab/packages/daemon/bin/opld";

function createIsolatedEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-bridge-gate2-"));
  const home = path.join(root, "home");
  const stateDir = path.join(root, "state");
  const configDir = path.join(root, "config");
  const codexHome = path.join(root, "codex");
  for (const d of [home, path.join(home, ".opl"), stateDir, configDir, codexHome]) {
    fs.mkdirSync(d, { recursive: true });
  }
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    OPL_HOME: path.join(home, ".opl"),
    OPL_STATE_DIR: stateDir,
    OPL_CONFIG_DIR: configDir,
    CODEX_HOME: codexHome,
    OPL_CODEX_MARKETPLACE_DIR: path.join(home, ".opl", "carriers", "codex-marketplace"),
    OPL_DAEMON_BIN: DAEMON_BIN,
    NODE_NO_WARNINGS: "1",
  };
  return { root, home, stateDir, env };
}

function readSandboxPids(stateDir) {
  const pids = new Set();
  for (const name of ["opld.session.json", "opld.lock"]) {
    try {
      const p = path.join(stateDir, "run", name);
      if (fs.existsSync(p)) {
        const pid = JSON.parse(fs.readFileSync(p, "utf8")).pid;
        if (Number.isInteger(pid) && pid > 0) pids.add(pid);
      }
    } catch { /* ignore */ }
  }
  return pids;
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code === "EPERM"; }
}

async function shutdownSandbox(root, stateDir, bridge) {
  const pids = readSandboxPids(stateDir);
  try {
    if (bridge?.client?.connected) await bridge.client.call("daemon.shutdown", {});
  } catch { /* ignore */ }
  try { await bridge?.close(); } catch { /* ignore */ }
  for (const p of readSandboxPids(stateDir)) pids.add(p);
  for (const pid of pids) {
    for (let i = 0; i < 20; i += 1) {
      if (!isPidAlive(pid)) break;
      if (i === 10) try { process.kill(pid, "SIGTERM"); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 50));
    }
    if (isPidAlive(pid)) {
      try { process.kill(pid, "SIGKILL"); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  fs.rmSync(root, { recursive: true, force: true });
}

function writeV2Pkg(dir, { id, version = "0.1.0", intent = "app", extra = {} }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "README.md"), `# ${id}\nVersion ${version}\n`);
  const manifest = {
    schema_version: "opl.package.v2",
    identity: {
      id, version, intent,
      name: { "zh-CN": id, "en-US": id },
      summary: { "zh-CN": `${id} 摘要`, "en-US": `${id} summary` },
      publisher: "One Person Lab",
    },
    ...extra,
  };
  fs.writeFileSync(path.join(dir, "opl-package.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

function packTarGz(srcDir, outTgz, files) {
  const res = spawnSync("tar", ["-czf", outTgz, "-C", srcDir, ...files], {
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  return outTgz;
}

test("Wave 1 Gate 2A: bridge budget, exports, resolveOplStatePaths precedence, on-demand opld & <20ms SLA", async (t) => {
  const srcFiles = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith(".mjs"));
  assert.deepEqual(srcFiles.sort(), ["index.mjs", "opld-client.mjs", "service.mjs"]);
  let totalLines = 0;
  for (const file of srcFiles) {
    const content = fs.readFileSync(path.join(SRC_DIR, file), "utf8");
    totalLines += content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
    assert.doesNotMatch(content, /cordis-profiles|compactFastState|spawn\(["']opl/);
  }
  assert.ok(totalLines < 400, `Expected < 400 total source lines, got ${totalLines}`);
  assert.match(fs.readFileSync(path.join(SRC_DIR, "index.mjs"), "utf8"), /inject = \["oplStudioHostOptions", "oplCodexNative"\]/);
  assert.equal(name, "opl-framework-bridge");
  assert.deepEqual(inject, ["oplStudioHostOptions", "oplCodexNative"]);
  assert.equal(typeof apply, "function");

  assert.equal(resolveOplStatePaths({ HOME: "/h", OPL_STATE_DIR: "/s", OPL_DATA_DIR: "/d" }, "/e").stateDir, path.resolve("/e"));
  assert.equal(resolveOplStatePaths({ HOME: "/h", OPL_STATE_DIR: "/s", OPL_DATA_DIR: "/d" }).stateDir, path.resolve("/s"));
  assert.equal(resolveOplStatePaths({ HOME: "/h", OPL_DATA_DIR: "/d" }).stateDir, path.join(path.resolve("/d"), "opl", "state"));

  const { root, stateDir, env } = createIsolatedEnv();
  const bridge = new OplFrameworkBridge({ env });
  t.after(() => shutdownSandbox(root, stateDir, bridge));

  assert.equal(bridge.hasNativeWeixinChannel(), false);
  const caps = await bridge.start();
  assert.equal(caps.available, true);
  assert.equal(caps.connected, true);
  assert.equal(caps.authorityBoundary, "app_bridge_no_domain_authority");
  assert.equal(bridge.hasNativeWeixinChannel(), false);
  const weixinNullBridge = new OplFrameworkBridge({ env, opl: bridge.opl, client: bridge.client });
  await weixinNullBridge.start(null);
  assert.equal(weixinNullBridge.hasNativeWeixinChannel(), true);

  const sessionPath = path.join(stateDir, "run", "opld.session.json");
  const sockPath = path.join(stateDir, "run", "opld.sock");
  assert.equal(fs.existsSync(sessionPath), true);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(sessionPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(sockPath).mode & 0o777, 0o600);
  }

  for (let i = 0; i < 5; i += 1) await bridge.opl.readState("fast");
  const latencies = [];
  for (let i = 0; i < 100; i += 1) {
    const t0 = performance.now();
    const st = await bridge.opl.readState("fast");
    latencies.push(performance.now() - t0);
    assert.equal(st.profile, "fast");
  }
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p99 = latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.99) - 1)];
  console.log(`Wave 1 Gate 2 readState(fast) 100-call latency: P50=${p50.toFixed(3)}ms, P99=${p99.toFixed(3)}ms`);
  assert.ok(p50 < 20, `Expected P50 < 20ms, got ${p50.toFixed(3)}ms`);
  assert.ok(p99 < 20, `Expected P99 < 20ms, got ${p99.toFixed(3)}ms`);
});

test("Wave 1 Gate 2B: pack.updateAll streams event.pack.progress with reload_mode before RPC return", async (t) => {
  const { root, stateDir, env } = createIsolatedEnv();
  const bridge = new OplFrameworkBridge({ env });
  t.after(() => shutdownSandbox(root, stateDir, bridge));
  await bridge.start();

  const v1Dir = writeV2Pkg(path.join(root, "pkg-v1"), { id: "gate2-bridge-pkg", version: "0.1.0", intent: "app" });
  const v2Dir = writeV2Pkg(path.join(root, "pkg-v2"), {
    id: "gate2-bridge-pkg", version: "0.2.0", intent: "app",
    extra: {
      provides: { contribution_handler: { kind: "cli", argv: ["./handler.mjs"], transport: "stdin_json_stdout_json" } },
      ui: { declarative: { views: [{ id: "main", view_type: "list_detail", slot: "workbench.panel", title: { "zh-CN": "主页", "en-US": "Main" }, data_ref: "main.list" }] } },
    },
  });
  fs.writeFileSync(path.join(v2Dir, "handler.mjs"), "#!/usr/bin/env node\nconsole.log(JSON.stringify({ ok: true }))\n", { mode: 0o755 });
  await bridge.client.call("pack.build", { dir: v1Dir, write_lock: true });
  await bridge.client.call("pack.build", { dir: v2Dir, write_lock: true });
  const archV1 = packTarGz(v1Dir, path.join(root, "pkg-0.1.0.tgz"), ["opl-package.json", "opl-release.lock.json", "README.md"]);
  const archV2 = packTarGz(v2Dir, path.join(root, "pkg-0.2.0.tgz"), ["opl-package.json", "opl-release.lock.json", "README.md", "handler.mjs"]);

  await bridge.client.call("pack.install", { source: archV1, sync_codex: false });

  const events = [];
  let resolved = false;
  const listener = (ev) => events.push({ ...ev, seenBeforeResolve: !resolved });
  bridge.on("event", listener);
  const res = await bridge.client.call("pack.updateAll", {
    updates: [{ package_id: "gate2-bridge-pkg", source: archV2 }],
    sync_codex: false,
  });
  resolved = true;
  assert.ok(res.batch_id);
  const progress = events.filter((e) => e.method === "event.pack.progress" && e.params?.package_id === "gate2-bridge-pkg");
  assert.ok(progress.length >= 1, `Expected event.pack.progress frames, got ${JSON.stringify(events)}`);
  assert.equal(progress.every((e) => e.seenBeforeResolve && e.raw?.id === undefined), true);
  assert.ok(progress.some((e) => ["none", "renderer_reload", "restart_required"].includes(e.params?.reload_mode)));

  bridge.off("event", listener);
  const countAfterOff = events.length;
  await bridge.client.call("pack.updateAll", { updates: [{ package_id: "gate2-bridge-pkg", source: archV2 }], sync_codex: false });
  assert.equal(events.length, countAfterOff);
});

test("Wave 1 Gate 2C: apiVersion major mismatch triggers base_upgrade_required (-32002)", async (t) => {
  const { root, stateDir, env } = createIsolatedEnv();
  const bootBridge = new OplFrameworkBridge({ env });
  t.after(() => shutdownSandbox(root, stateDir, bootBridge));
  await bootBridge.start();

  const badOptBridge = new OplFrameworkBridge({ env, apiVersion: "99.0" });
  t.after(() => badOptBridge.close());
  await assert.rejects(
    () => badOptBridge.start(),
    (err) => err instanceof OpldRpcError && err.code === "base_upgrade_required" && err.rpcCode === -32002 && err.data?.code === "base_upgrade_required",
  );

  const badEnvBridge = new OplFrameworkBridge({ env: { ...env, OPL_BRIDGE_API_VERSION: "1.0" } });
  t.after(() => badEnvBridge.close());
  await assert.rejects(
    () => badEnvBridge.start(),
    (err) => err instanceof OpldRpcError && err.code === "base_upgrade_required" && err.rpcCode === -32002,
  );
});

test("Wave 1 Gate 2D: connectionAccessApproval callable + .approve() & untrusted TRUSTED_HOST_REQUIRED (-32003)", async (t) => {
  const { root, stateDir, env } = createIsolatedEnv();
  const bridge = new OplFrameworkBridge({ env });
  t.after(() => shutdownSandbox(root, stateDir, bridge));
  await bridge.start();

  const relayDir = writeV2Pkg(path.join(root, "opl-relay"), {
    id: "opl-relay", intent: "app",
    extra: {
      provides: {
        connection_providers: [{
          provider_type: "opl-relay.mailbox",
          entrypoint: { kind: "cli", argv: ["./bin/relay"], transport: "stdin_json_stdout_json" },
          capabilities: [{ id: "mailbox.search", title: { "zh-CN": "搜索", "en-US": "Search" }, risk: "read" }],
        }],
      },
    },
  });
  fs.mkdirSync(path.join(relayDir, "bin"), { recursive: true });
  fs.writeFileSync(path.join(relayDir, "bin", "relay"), "#!/usr/bin/env node\nconsole.log('{}')\n", { mode: 0o755 });

  const consumerDir = writeV2Pkg(path.join(root, "consumer-app"), {
    id: "consumer-app", intent: "app",
    extra: {
      permissions: { connections: [{ provider_type: "opl-relay.mailbox", capabilities: ["mailbox.search"], reason: { "zh-CN": "检索", "en-US": "Search" } }] },
    },
  });
  await bridge.client.call("pack.link", { dir: relayDir, sync_codex: false });
  await bridge.client.call("pack.link", { dir: consumerDir, sync_codex: false });
  await bridge.client.call("connect.add", {
    connection_id: "conn-g2", provider_type: "opl-relay.mailbox", display_name: "Relay", secret: "secret-g2",
  });

  const extBridge = new OplFrameworkBridge({ env, clientKind: "external", autoStart: false });
  t.after(() => extBridge.close());
  await extBridge.start();

  const tok = await bridge.client.call("connect.issueConsumerBindToken", {
    consumer_package_id: "consumer-app", session_id: extBridge.client.sessionInfo.session_id,
  });
  const req1 = await extBridge.client.call("connect.requestAccess", {
    consumer_bind_token: tok.token, connection_id: "conn-g2", capability_ids: ["mailbox.search"],
  });

  await assert.rejects(() => extBridge.connectionAccessApproval({ requestId: req1.request_id }), (err) => err.rpcCode === -32003 && err.code === "TRUSTED_HOST_REQUIRED");
  await assert.rejects(() => extBridge.connectionAccessApproval.approve(req1.request_id), (err) => err.rpcCode === -32003 && err.code === "TRUSTED_HOST_REQUIRED");

  const approved1 = await bridge.connectionAccessApproval.approve(req1.request_id);
  assert.equal(approved1.ok, true);
  assert.equal(approved1.stateRefreshRequired, true);

  const req2 = await extBridge.client.call("connect.requestAccess", {
    consumer_bind_token: tok.token, connection_id: "conn-g2", capability_ids: ["mailbox.search"],
  });
  const approved2 = await bridge.connectionAccessApproval({ requestId: req2.request_id });
  assert.equal(approved2.ok, true);
  assert.equal(approved2.stateRefreshRequired, true);
});

test("Wave 1 Gate 2E: createOplPassthrough methods & contribution/update compatibility", async (t) => {
  const { root, stateDir, env } = createIsolatedEnv();
  const boot = new OplFrameworkBridge({ env });
  t.after(() => shutdownSandbox(root, stateDir, boot));
  await boot.start();

  const opl = createOplPassthrough({ env, candidateActionAllowlist: ["codex_install"] });
  t.after(() => opl.close());

  const st = await opl.readState("fast");
  assert.equal(st.profile, "fast");
  assert.equal(st.readback.exitCode, 0);

  const init = await opl.readInitialize();
  assert.equal(init.readback.exitCode, 0);

  const drill = await opl.readFullDrilldown();
  assert.equal(drill.detail, "full");

  const contrib = await opl.readContribution({ ref: "status.overview" });
  assert.equal(contrib.stdoutJson.opl_app_contribution.surface_kind, "opl_app_package_contribution.v1");
  assert.equal(contrib.stdoutJson.opl_app_contribution.package_id, undefined);
  assert.equal(contrib.stdoutJson.opl_app_contribution.response.ok, true);

  const plan = await opl.runManagedUpdate("plan");
  assert.equal(Array.isArray(plan.managed_update.components), true);

  const act = await opl.executeAction({ actionId: "codex_install", dryRun: true });
  assert.equal(act.status, "preview_ready");
  assert.equal(act.authorityBoundary, "app_bridge_no_domain_authority");

  const previewModeRo = createOplPassthrough({ env: { ...env, OPL_STUDIO_READ_ONLY: "1" }, client: opl.client });
  const actPreviewMode = await previewModeRo.executeAction({ actionId: "codex_install", dryRun: false, mode: "preview" });
  assert.equal(actPreviewMode.dryRun, true);
  assert.equal(actPreviewMode.receiptKind, "preview");
  assert.equal(actPreviewMode.status, "preview_ready");

  const missingBinBridge = new OplFrameworkBridge({ env: { ...env, OPL_DAEMON_BIN: path.join(root, "no-such-opld"), OPL_STATE_DIR: path.join(root, "empty-state") } });
  t.after(() => missingBinBridge.close());
  await assert.rejects(() => missingBinBridge.start(), (err) => err.code === "daemon_not_found");
});

test("Wave 1 Gate 2F: zero-sleep daemon.shutdown & SIGKILL recovery + close() mid-connect race", async (t) => {
  const { root, stateDir, env } = createIsolatedEnv();
  const bridge = new OplFrameworkBridge({ env });
  t.after(() => shutdownSandbox(root, stateDir, bridge));
  await bridge.start();
  const sessionFile = path.join(stateDir, "run", "opld.session.json");

  for (let i = 0; i < 5; i += 1) {
    const prevSid = bridge.client.sessionInfo.session_id;
    await bridge.client.call("daemon.shutdown", {});
    const st = await bridge.opl.readState("fast");
    assert.equal(st.profile, "fast");
    assert.notEqual(bridge.client.sessionInfo.session_id, prevSid);
  }

  for (let i = 0; i < 5; i += 1) {
    const prevSid = bridge.client.sessionInfo.session_id;
    const prevPid = JSON.parse(fs.readFileSync(sessionFile, "utf8")).pid;
    process.kill(prevPid, "SIGKILL");
    const st = await bridge.opl.readState("fast");
    assert.equal(st.profile, "fast");
    assert.notEqual(bridge.client.sessionInfo.session_id, prevSid);
  }

  await bridge.close();

  for (let i = 0; i < 5; i += 1) {
    const b1 = new OplFrameworkBridge({ env });
    await b1.start();
    const prevPid = JSON.parse(fs.readFileSync(sessionFile, "utf8")).pid;
    process.kill(prevPid, "SIGKILL");
    await b1.close();
    const b2 = new OplFrameworkBridge({ env });
    await b2.start();
    const st = await b2.opl.readState("fast");
    assert.equal(st.profile, "fast");
    assert.notEqual(JSON.parse(fs.readFileSync(sessionFile, "utf8")).pid, prevPid);
    await b2.client.call("daemon.shutdown", {}).catch(() => {});
    await b2.close();
  }

  const raceClient = new OpldClient({ env });
  const connectP = raceClient.connect();
  await raceClient.close();
  await assert.rejects(() => connectP, (err) => err instanceof OpldRpcError && err.code === "client_closed");
  assert.equal(raceClient.connected, false);

  for (const delayMs of [0, 15]) {
    const cold = createIsolatedEnv();
    const coldClient = new OpldClient({ env: cold.env });
    try {
      const coldConnectP = coldClient.connect();
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      await coldClient.close();
      await assert.rejects(() => coldConnectP, (err) => err instanceof OpldRpcError && err.code === "client_closed");
      assert.equal(coldClient.connected, false);
      for (const pid of readSandboxPids(cold.stateDir)) {
        assert.equal(isPidAlive(pid), false, `Cold raceClient leaked opld PID ${pid}`);
      }
    } finally {
      await shutdownSandbox(cold.root, cold.stateDir, null);
    }
  }
});

test("Wave 1 Gate 2G: readDomainDetailView envelope & auth input validation", async (t) => {
  const { root, stateDir, env } = createIsolatedEnv();
  const bridge = new OplFrameworkBridge({ env });
  t.after(() => shutdownSandbox(root, stateDir, bridge));
  await bridge.start();

  const detailPkgDir = writeV2Pkg(path.join(root, "detail-pkg"), {
    id: "detail-pkg", intent: "app",
    extra: {
      provides: { contribution_handler: { kind: "cli", argv: ["./handler.mjs"], transport: "stdin_json_stdout_json" } },
      ui: { declarative: { views: [{ id: "roadmap", view_type: "list_detail", slot: "workbench.panel", title: { "zh-CN": "路线图", "en-US": "Roadmap" }, data_ref: "roadmap.list" }] } },
    },
  });
  fs.writeFileSync(path.join(detailPkgDir, "handler.mjs"), "#!/usr/bin/env node\nconsole.log(JSON.stringify({ ok: true }))\n", { mode: 0o755 });
  await bridge.client.call("pack.link", { dir: detailPkgDir, sync_codex: false });

  const avail = await bridge.opl.readDomainDetailView({ itemId: "detail-pkg", viewId: "roadmap" });
  assert.equal(avail.exitCode, 0);
  assert.equal(avail.stdoutJson.schema_version, "opl_domain_detail_view.v1");
  assert.equal(avail.stdoutJson.surface_kind, "opl_domain_detail_view");
  assert.equal(avail.stdoutJson.item_id, "detail-pkg");
  assert.equal(avail.stdoutJson.view_id, "roadmap");
  assert.equal(avail.stdoutJson.view_kind, "list_detail");
  assert.equal(avail.stdoutJson.availability, "available");
  assert.equal(avail.stdoutJson.not_modified, false);
  assert.equal(Number.isInteger(avail.stdoutJson.revision) && avail.stdoutJson.revision >= 0, true);
  assert.notEqual(avail.stdoutJson.payload, null);

  const notMod = await bridge.opl.readDomainDetailView({ itemId: "detail-pkg", viewId: "roadmap", ifRevision: avail.stdoutJson.revision });
  assert.equal(notMod.stdoutJson.not_modified, true);
  assert.equal(notMod.stdoutJson.payload, null);

  const missing = await bridge.opl.readDomainDetailView({ itemId: "unknown-pkg", viewId: "roadmap" });
  assert.equal(missing.stdoutJson.schema_version, "opl_domain_detail_view.v1");
  assert.equal(missing.stdoutJson.surface_kind, "opl_domain_detail_view");
  assert.equal(missing.stdoutJson.view_kind, "unknown");
  assert.equal(missing.stdoutJson.availability, "missing");
  assert.equal(missing.stdoutJson.not_modified, false);
  assert.equal(missing.stdoutJson.payload, null);

  for (const bad of [null, undefined, 123, "str", [], {}, { email: "   ", password: "pw" }, { email: "alice@opl.dev", password: "   " }, { email: "alice@opl.dev", password: 123 }]) {
    assert.deepEqual(await bridge.gatewayAccountLogin(bad), { ok: false, errorCode: "invalid_request", stateRefreshRequired: false });
  }
  for (const bad of [null, undefined, 123, "str", [], {}, { apiKey: "" }, { apiKey: "   \t\n  " }, { apiKey: 999 }]) {
    assert.deepEqual(await bridge.codexApiKeyConfiguration(bad), { ok: false, errorCode: "invalid_request", stateRefreshRequired: false });
  }
  const listedEmpty = await bridge.client.call("connect.list", {});
  assert.equal(listedEmpty.connections.length, 0);

  assert.deepEqual(await bridge.gatewayAccountLogin({ email: "alice@opl.dev", password: "pw-secret-1" }), { ok: true, stateRefreshRequired: true });
  assert.deepEqual(await bridge.codexApiKeyConfiguration({ apiKey: "sk-valid-key" }), { ok: true, stateRefreshRequired: true });
  const listedAfter = await bridge.client.call("connect.list", {});
  assert.deepEqual(listedAfter.connections.map((c) => c.provider_type).sort(), ["openai_codex", "opl_gateway"]);

  const noRpcClient = { on() {}, off() {}, close: async () => {}, async call(method) { throw new Error(`unexpected RPC call: ${method}`); } };
  const preRpcBridge = new OplFrameworkBridge({ env, client: noRpcClient });
  for (const invokeBad of [
    () => preRpcBridge.opl.readContribution({ packageId: "", ref: "x" }),
    () => preRpcBridge.opl.readContribution({ packageId: "   ", ref: "x" }),
    () => preRpcBridge.opl.readContribution({ packageId: null, ref: "x" }),
    () => preRpcBridge.opl.readContribution({ packageId: 123, ref: "x" }),
    () => preRpcBridge.opl.readContribution({ ref: "   " }),
    () => preRpcBridge.opl.readDomainDetailView({ itemId: "   ", viewId: "v1" }),
    () => preRpcBridge.opl.readDomainDetailView({ itemId: "detail-pkg", viewId: "   " }),
    () => preRpcBridge.opl.executeAction({ actionId: "   " }),
    () => preRpcBridge.connectionAccessApproval({ requestId: "bad;id" }),
    () => preRpcBridge.connectionAccessApproval.approve("bad;id"),
    () => preRpcBridge.connectionAccessApproval({ requestId: "bad\nid" }),
    () => preRpcBridge.connectionAccessApproval({ requestId: " req" }),
    () => preRpcBridge.connectionAccessApproval({ requestId: "" }),
    () => preRpcBridge.connectionAccessApproval({ requestId: null }),
    () => bridge.opl.readContribution({ packageId: "", ref: "x" }),
    () => bridge.opl.readContribution({ packageId: "   ", ref: "x" }),
    () => bridge.opl.readContribution({ packageId: null, ref: "x" }),
    () => bridge.connectionAccessApproval({ requestId: "bad;id" }),
    () => bridge.connectionAccessApproval.approve("bad;id"),
    () => bridge.connectionAccessApproval({ requestId: "bad\nid" }),
  ]) {
    await assert.rejects(invokeBad, (err) => err?.code === "invalid_request");
  }
  assert.doesNotMatch(fs.readFileSync(path.join(SRC_DIR, "service.mjs"), "utf8"), /connect\.register/);
});
