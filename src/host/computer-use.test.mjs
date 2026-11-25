import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { initProfile } from "@deepseek-ai/dsh-app-boot";
import {
  codexArgsWithComputerUse,
  ensureCuaMcpProfile,
  readComputerUseSettings,
  readSavedAppPermissions,
  resolveBundledCuaHelper,
  resolveDshCliEntry,
  retrySavedAppPermission,
  revokeSavedAppPermission,
  writeComputerUseSettings
} from "../../plugins/opl-codex-native/src/computer-use.mjs";
import { OplCodexNative } from "../../plugins/opl-codex-native/src/service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const installAnchor = path.join(root, "package.json");

test("computer-use settings default to macOS elicit and validate consentMode writes", async (t) => {
  const dshHome = await mkdtemp(path.join(os.tmpdir(), "opl-cua-settings-"));
  t.after(() => rm(dshHome, { recursive: true, force: true }));

  assert.deepEqual(readComputerUseSettings(dshHome, "darwin"), { enabled: true, consentMode: "elicit" });
  assert.deepEqual(readComputerUseSettings(dshHome, "linux"), { enabled: false, consentMode: "elicit" });

  await writeComputerUseSettings(dshHome, { enabled: true, consentMode: "allow" }, "darwin");
  assert.deepEqual(readComputerUseSettings(dshHome, "darwin"), { enabled: true, consentMode: "allow" });

  await assert.rejects(
    writeComputerUseSettings(dshHome, { consentMode: "invalid" }, "darwin"),
    (err) => err?.code === "invalid_request"
  );
});

test("codexArgsWithComputerUse dynamically injects required=false MCP overrides per consentMode", () => {
  const base = ["app-server", "-c", "mcp_servers.opl_studio_dsh.required=true"];
  assert.deepEqual(
    codexArgsWithComputerUse(base, {
      enabled: false,
      consentMode: "elicit",
      command: "/node",
      cuaHome: "/cua",
      workspace: "/ws",
      dshCliEntry: "/dsh/bin.js"
    }),
    base
  );

  const elicitArgs = codexArgsWithComputerUse(base, {
    enabled: true,
    consentMode: "elicit",
    command: "/node",
    cuaHome: "/cua",
    workspace: "/ws",
    dshCliEntry: "/dsh/bin.js"
  });
  assert.ok(elicitArgs.includes('mcp_servers.dsh_cua.required=false'));
  assert.ok(elicitArgs.includes('mcp_servers.dsh_cua.env.DSH_CUA_CONSENT="elicit"'));
  assert.ok(elicitArgs.includes('mcp_servers.dsh_cua.env.ELECTRON_RUN_AS_NODE="1"'));
  assert.ok(!elicitArgs.some((arg) => arg.includes("approval_mode=")));

  const allowArgs = codexArgsWithComputerUse(base, {
    enabled: true,
    consentMode: "allow",
    command: "/node",
    cuaHome: "/cua",
    workspace: "/ws",
    dshCliEntry: "/dsh/bin.js"
  });
  assert.ok(allowArgs.includes('mcp_servers.dsh_cua.env.DSH_CUA_CONSENT="allow"'));
  assert.ok(allowArgs.includes('mcp_servers.dsh_cua.tools.cua_run_code.approval_mode="approve"'));
});

test("saved CUA app permission store reads, revokes, and retries under dsh-storage-json envelope", async (t) => {
  const dshHome = await mkdtemp(path.join(os.tmpdir(), "opl-cua-store-"));
  t.after(() => rm(dshHome, { recursive: true, force: true }));

  const { cuaHome, profileDir, storages } = ensureCuaMcpProfile(dshHome);
  const realProfileDir = await realpath(profileDir);
  const unitName = `cua_permissions_${createHash("sha256").update(realProfileDir).digest("hex")}`;
  const unitPath = path.join(storages, `${unitName}.json`);

  const allowedId = "a".repeat(64);
  const blockedId = "b".repeat(64);
  await writeFile(unitPath, JSON.stringify({
    unit: { name: unitName, version: 1 },
    global: {
      migrated: true,
      applications: {
        [allowedId]: {
          revoked: 0,
          always: { id: allowedId, name: "Notes", executablePath: "/System/Applications/Notes.app" },
          sessions: {
            s1: { identity: { id: allowedId, name: "Notes" }, decision: "allow", revision: 1 }
          }
        },
        [blockedId]: {
          revoked: 0,
          sessions: {
            s2: { identity: { id: blockedId, name: "Terminal", executablePath: "/System/Applications/Utilities/Terminal.app" }, decision: "deny", revision: 2 }
          }
        }
      }
    },
    tables: {}
  }, null, 2));

  const initial = await readSavedAppPermissions(dshHome);
  assert.deepEqual(initial.allowedApps.map((item) => item.id), [allowedId]);
  assert.deepEqual(initial.blockedApps.map((item) => item.id), [blockedId]);

  await revokeSavedAppPermission(dshHome, allowedId);
  const afterRevoke = await readSavedAppPermissions(dshHome);
  assert.deepEqual(afterRevoke.allowedApps, []);
  assert.deepEqual(afterRevoke.blockedApps.map((item) => item.id), [allowedId, blockedId]);
  const storedAfterRevoke = JSON.parse(await readFile(unitPath, "utf8"));
  assert.equal(storedAfterRevoke.global.applications[allowedId].revoked, 1);
  assert.equal("always" in storedAfterRevoke.global.applications[allowedId], false);
  assert.equal(storedAfterRevoke.global.applications[allowedId].sessions.s1.decision, "deny");

  await retrySavedAppPermission(dshHome, blockedId);
  const afterRetry = await readSavedAppPermissions(dshHome);
  assert.deepEqual(afterRetry.blockedApps.map((item) => item.id), [allowedId]);
  const storedAfterRetry = JSON.parse(await readFile(unitPath, "utf8"));
  assert.equal(storedAfterRetry.global.applications[blockedId].sessions.s2.decision, "ask");
  assert.equal(storedAfterRetry.global.applications[blockedId].sessions.s2.revision, 3);
  assert.equal(cuaHome, path.join(dshHome, "opl-cua-mcp"));
});

test("OplCodexNative wires native CUA controls, preserves Billion Context across reloads, and handles busy turns", { skip: process.platform !== "darwin" }, async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opl-cua-service-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const dshHome = path.join(tempRoot, "dsh-home");
  const dshProfileDir = path.join(dshHome, "profiles", "opl-studio");
  initProfile(dshProfileDir, ["billion-context"]);
  const profilePkgPath = path.join(dshProfileDir, "package.json");
  const profilePkg = JSON.parse(await readFile(profilePkgPath, "utf8"));
  profilePkg.dependencies = { ...(profilePkg.dependencies ?? {}), "billion-context": "1.0.0" };
  await writeFile(profilePkgPath, JSON.stringify(profilePkg, null, 2));

  const bcDir = path.join(dshProfileDir, "node_modules", "billion-context");
  await mkdir(path.join(bcDir, "dist"), { recursive: true });
  const bcBin = path.join(bcDir, "dist", "index.js");
  await writeFile(bcBin, "export {};\n");
  await writeFile(path.join(bcDir, "package.json"), JSON.stringify({
    name: "billion-context",
    version: "1.0.0",
    main: "./dist/index.js",
    dsh: { bundle: { patch: [] } }
  }));

  const helper = resolveBundledCuaHelper({ installAnchor });
  const dshCli = resolveDshCliEntry({ installAnchor });
  assert.ok(helper && fs.existsSync(helper.helperPath));
  assert.ok(dshCli && fs.existsSync(dshCli));

  const calls = [];
  let accessibility = false;
  const service = new OplCodexNative({
    workspaceRoot: tempRoot,
    dshHome,
    dshProfileDir,
    dshInstallAnchor: installAnchor,
    billionContextAdmitted: true,
    platform: "darwin",
    nativeCuaControl: {
      async inspectPermissions() {
        calls.push({ method: "permissionStatus" });
        return { platform: "darwin", accessibility, screenRecording: true };
      },
      async requestPermission(_helperPath, params) {
        calls.push({ method: "requestPermission", params });
        accessibility = true;
        return { granted: true };
      },
      async openSettings(_helperPath, params) {
        calls.push({ method: "openPermissionSettings", params });
        return { opened: true };
      }
    }
  });

  // Billion Context wraps [bcBin, "codex", ...codexArgs] on construction.
  assert.equal(service.contextLaunch !== null, true);
  assert.equal(service.transport.args[0], bcBin);
  assert.equal(service.transport.args[1], "codex");
  assert.ok(service.transport.args.includes('mcp_servers.dsh_cua.env.DSH_CUA_CONSENT="elicit"'));

  const initial = await service.readComputerUse();
  assert.equal(initial.supported, true);
  assert.equal(initial.available, true);
  assert.equal(initial.enabled, true);
  assert.equal(initial.consentMode, "elicit");
  assert.equal(initial.permissions.status, "permission_required");
  assert.equal(initial.permissions.accessibility, false);

  await service.performComputerUseAction({ action: "open_settings", permission: "accessibility", locale: "zh" });
  const requested = await service.performComputerUseAction({ action: "request_permission", permission: "accessibility", locale: "zh" });
  assert.equal(requested.permissions.status, "ready");
  assert.equal(requested.permissions.accessibility, true);
  assert.equal(calls.some((item) => item.method === "openPermissionSettings" && item.params.settingsMessage.includes("辅助功能")), true);

  // Simulate an active turn preventing immediate reload when toggling unattended allow.
  service.transport.initialized = true;
  service.transport.runWhenIdle = async () => ({ status: "deferred" });
  const deferredState = await service.setComputerUse({ enabled: true, consentMode: "allow" });
  assert.equal(deferredState.consentMode, "allow");
  assert.equal(deferredState.restartPending, true);
  assert.equal(service.contextLaunch, null);
  assert.ok(service.transport.args.includes('mcp_servers.dsh_cua.env.DSH_CUA_CONSENT="allow"'));
  assert.ok(service.transport.args.includes('mcp_servers.dsh_cua.tools.cua_run_code.approval_mode="approve"'));

  // Simulate reload completing when idle and verifying Billion Context re-wraps updated args cleanly.
  service.transport.start = async () => { service.transport.initialized = true; };
  service.transport.stop = async () => { service.transport.initialized = false; };
  await service.start();
  assert.equal(service.contextLaunch !== null, true);
  assert.equal(service.transport.args[0], bcBin);
  assert.ok(service.transport.args.includes('mcp_servers.dsh_cua.tools.cua_run_code.approval_mode="approve"'));

  service.transport.runWhenIdle = async (fn) => ({ status: "ran", result: await fn() });
  const disabledState = await service.setComputerUse({ enabled: false });
  assert.equal(disabledState.enabled, false);
  assert.equal(disabledState.active, false);
  assert.equal(disabledState.restartPending, false);
  assert.equal(service.transport.args[0], bcBin);
  assert.ok(!service.transport.args.some((arg) => arg.includes("mcp_servers.dsh_cua")));
});

test("OplCodexNative isolates CUA profile initialization failures without blocking plain Codex startup", { skip: process.platform !== "darwin" }, async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opl-cua-fault-isolation-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const dshHome = path.join(tempRoot, "dsh-home");
  await mkdir(dshHome, { recursive: true });
  // Place an obstructing regular file at opl-cua-mcp so ensureCuaMcpProfile throws on mkdirSync.
  await writeFile(path.join(dshHome, "opl-cua-mcp"), "not-a-directory\n");

  const service = new OplCodexNative({
    workspaceRoot: tempRoot,
    dshHome,
    dshInstallAnchor: installAnchor,
    platform: "darwin"
  });

  assert.equal(service.configuredComputerUseEnabled, false);
  assert.ok(service.computerUseError);
  assert.ok(!service.transport.args.some((arg) => arg.includes("mcp_servers.dsh_cua")));
  const state = await service.readComputerUse();
  assert.equal(state.active, false);
  assert.equal(state.unavailableReason, service.computerUseError.code);
});

test("OplCodexNative automatically reloads Computer Use once an active turn finishes", { skip: process.platform !== "darwin" }, async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opl-cua-auto-reload-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const dshHome = path.join(tempRoot, "dsh-home");
  await writeComputerUseSettings(dshHome, { enabled: true, consentMode: "allow" }, "darwin");

  const service = new OplCodexNative({
    workspaceRoot: tempRoot,
    dshHome,
    dshInstallAnchor: installAnchor,
    platform: "darwin"
  });
  let starts = 0;
  let stops = 0;
  service.transport.start = async () => {
    starts += 1;
    service.transport.initialized = true;
  };
  service.transport.stop = async () => {
    stops += 1;
    service.transport.initialized = false;
  };

  await service.start();
  assert.equal(starts, 1);
  assert.equal((await service.readComputerUse()).active, true);
  assert.equal((await service.readComputerUse()).activeConsentMode, "allow");

  // Simulate an active Codex turn holding the transport busy.
  let releaseTurn;
  const turnPromise = service.transport.withActivity(() => new Promise((resolve) => {
    releaseTurn = resolve;
  }));

  const whileBusy = await service.setComputerUse({ enabled: false });
  assert.equal(whileBusy.enabled, false);
  assert.equal(whileBusy.active, true);
  assert.equal(whileBusy.activeConsentMode, "allow");
  assert.equal(whileBusy.restartPending, true);
  assert.equal(starts, 1);

  // Finishing the turn triggers automatic idle reload without any explicit reload call.
  releaseTurn();
  await turnPromise;
  await service.pendingComputerUseReloadPromise;

  assert.equal(stops, 1);
  assert.equal(starts, 2);
  const afterIdle = await service.readComputerUse();
  assert.equal(afterIdle.enabled, false);
  assert.equal(afterIdle.active, false);
  assert.equal(afterIdle.activeConsentMode, null);
  assert.equal(afterIdle.restartPending, false);
  assert.ok(!service.transport.args.some((arg) => arg.includes("mcp_servers.dsh_cua")));
});

test("OplCodexNative resolves mid-start concurrent setComputerUse toggles without retaining stale allow flags", { skip: process.platform !== "darwin" }, async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opl-cua-concurrent-start-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const dshHome = path.join(tempRoot, "dsh-home");
  await writeComputerUseSettings(dshHome, { enabled: true, consentMode: "elicit" }, "darwin");

  const service = new OplCodexNative({
    workspaceRoot: tempRoot,
    dshHome,
    dshInstallAnchor: installAnchor,
    platform: "darwin"
  });

  const observedStarts = [];
  let releaseFirstReloadStart;
  let startCount = 0;
  service.transport.start = async () => {
    startCount += 1;
    observedStarts.push([...service.transport.args]);
    if (startCount === 2) {
      await new Promise((resolve) => {
        releaseFirstReloadStart = resolve;
      });
    }
    service.transport.initialized = true;
  };
  service.transport.stop = async () => {
    service.transport.initialized = false;
  };

  const events = [];
  service.on("event", (event) => {
    if (event?.method === "host/computer-use-changed") events.push(event.params);
  });

  await service.start();
  const enableAllowPromise = service.setComputerUse({ enabled: true, consentMode: "allow" });
  while (!releaseFirstReloadStart) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  // User disables Computer Use while the first reload process is still initializing.
  const midDisable = await service.setComputerUse({ enabled: false });
  assert.equal(midDisable.enabled, false);
  assert.equal(midDisable.active, false);
  assert.equal(midDisable.restartPending, true);

  releaseFirstReloadStart();
  const firstResult = await enableAllowPromise;
  assert.equal(firstResult.enabled, false);

  await service.pendingComputerUseReloadPromise;
  const finalState = await service.readComputerUse();
  assert.equal(startCount, 3);
  assert.equal(finalState.enabled, false);
  assert.equal(finalState.active, false);
  assert.equal(finalState.activeConsentMode, null);
  assert.equal(finalState.restartPending, false);
  // The intermediate start (allow) must accurately report active: true, activeConsentMode: "allow", restartPending: true,
  // before the automatic follow-up reload turns Computer Use off.
  assert.ok(events.some((params) =>
    params.active === true && params.activeConsentMode === "allow" && params.restartPending === true));
  const lastEvent = events.at(-1);
  assert.deepEqual(lastEvent, { active: false, activeConsentMode: null, restartPending: false });
  assert.ok(observedStarts[1].some((arg) => arg.includes('DSH_CUA_CONSENT="allow"')));
  assert.ok(!observedStarts[2].some((arg) => arg.includes("mcp_servers.dsh_cua")));
});

test("OplCodexNative stops retrying persistent reload failures and leaves plain Codex activity unblocked", { skip: process.platform !== "darwin" }, async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opl-cua-reload-fail-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const dshHome = path.join(tempRoot, "dsh-home");
  await writeComputerUseSettings(dshHome, { enabled: true, consentMode: "elicit" }, "darwin");

  const service = new OplCodexNative({
    workspaceRoot: tempRoot,
    dshHome,
    dshInstallAnchor: installAnchor,
    platform: "darwin"
  });

  let startCalls = 0;
  service.transport.start = async () => {
    startCalls += 1;
    if (startCalls === 1) {
      service.transport.initialized = true;
      return;
    }
    throw Object.assign(new Error("codex spawn failed"), { code: "app_server_unavailable" });
  };
  service.transport.stop = async () => {
    service.transport.initialized = false;
  };

  await service.start();
  let releaseTurn;
  const turnPromise = service.transport.withActivity(() => new Promise((resolve) => {
    releaseTurn = resolve;
  }));

  const events = [];
  service.on("event", (event) => events.push(event));

  const whileBusy = await service.setComputerUse({ enabled: false });
  assert.equal(whileBusy.restartPending, true);

  releaseTurn();
  await turnPromise;
  await service.pendingComputerUseReloadPromise;
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(startCalls, 2);
  assert.equal(service.pendingComputerUseReloadPromise, null);
  assert.equal(service.appServerError?.code, "app_server_unavailable");
  const afterFailure = await service.readComputerUse();
  assert.equal(afterFailure.restartPending, false);
  assert.equal(afterFailure.active, false);
  assert.equal(events.some((e) => e.method === "host/computer-use-changed" && e.params?.restartPending === false), true);
  // Plain Codex activity does not hang on maintenance after reload failure.
  const ran = await service.transport.withActivity(async () => "ok");
  assert.equal(ran, "ok");
});
