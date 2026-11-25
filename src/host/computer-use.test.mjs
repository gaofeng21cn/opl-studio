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
