import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendDshPluginActivity,
  buildDshPluginCatalog,
  readDisabledOptionalPluginIds,
  readDisabledPluginPatches,
  readDshPluginActivity,
  setOptionalPluginEnabled
} from "../../packages/host-kit/dsh-plugin-catalog.mjs";
import {
  clearPendingContextOperation,
  readPendingContextOperation
} from "../../plugins/opl-codex-native/src/billion-context.mjs";
import { classifyAndRefreshDshPluginUpdate } from "../../plugins/opl-host-core/src/service.mjs";

test("optional plugin preferences persist native DSH patches and reject core plugins", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-dsh-catalog-test-"));
  const profileDir = path.join(root, "profile");
  fs.mkdirSync(profileDir, { recursive: true });
  try {
    await setOptionalPluginEnabled(profileDir, "opl-team-bots", false);
    assert.deepEqual(readDisabledOptionalPluginIds(profileDir), ["opl-team-bots"]);
    assert.deepEqual(readDisabledPluginPatches(profileDir), [{ id: "opl-team-bots", disabled: true }]);

    // Tampered core plugin IDs in preferences file are filtered out.
    fs.writeFileSync(
      path.join(profileDir, "opl-plugin-preferences.json"),
      JSON.stringify({ schema: "opl_dsh_plugin_preferences.v1", disabledPlugins: ["opl-host-core", "opl-team-bots"] })
    );
    assert.deepEqual(readDisabledOptionalPluginIds(profileDir), ["opl-team-bots"]);

    await assert.rejects(
      setOptionalPluginEnabled(profileDir, "opl-host-core", false),
      /Optional DSH plugin expected/
    );

    const catalog = buildDshPluginCatalog({
      dshProfileDir: profileDir,
      disabledAtBoot: [],
      billionContext: {
        enabled: true,
        installed: true,
        version: "0.3.0",
        availableVersion: "0.3.1",
        updateAvailable: true,
        activeVersion: "0.3.0",
        active: true,
        startupFailed: false,
        pendingOperation: "update",
        pendingVersion: "0.3.1"
      }
    });
    assert.equal(catalog.restartRequired, true);
    const teamBots = catalog.entries.find(e => e.pluginId === "opl-team-bots");
    assert.equal(teamBots?.enabled, false);
    assert.equal(teamBots?.active, true);
    assert.equal(teamBots?.pendingRestart, true);
    const billion = catalog.entries.find(e => e.pluginId === "billion-context");
    assert.equal(billion?.pendingOperation, "update");
    assert.equal(billion?.pendingVersion, "0.3.1");
    assert.ok(catalog.entries.some(e => e.pluginId === "opl-host-core" && e.tier === "core_runtime"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("DSH plugin activity keeps newest 50 records atomically", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-dsh-activity-test-"));
  const profileDir = path.join(root, "profile");
  fs.mkdirSync(profileDir, { recursive: true });
  try {
    for (let i = 0; i < 55; i += 1) {
      await appendDshPluginActivity(profileDir, {
        pluginId: "opl-team-bots",
        action: i % 2 === 0 ? "disable" : "enable",
        status: "staged_restart",
        detail: `step-${i}`
      });
    }
    const records = readDshPluginActivity(profileDir);
    assert.equal(records.length, 50);
    assert.equal(records[0]?.detail, "step-54");
    assert.equal(records[49]?.detail, "step-5");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("billion-context staged pending operation tolerates corrupt files and clears cleanly", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-bc-pending-test-"));
  const profileDir = path.join(root, "profile");
  fs.mkdirSync(profileDir, { recursive: true });
  try {
    assert.equal(readPendingContextOperation(profileDir), null);
    fs.writeFileSync(path.join(profileDir, "billion-context-pending.json"), "{bad json");
    assert.equal(readPendingContextOperation(profileDir), null);

    fs.writeFileSync(
      path.join(profileDir, "billion-context-pending.json"),
      JSON.stringify({ schema: "opl_billion_context_pending.v1", operation: "update", targetVersion: "0.4.0" })
    );
    assert.deepEqual(readPendingContextOperation(profileDir)?.targetVersion, "0.4.0");
    clearPendingContextOperation(profileDir);
    assert.equal(readPendingContextOperation(profileDir), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("classifyAndRefreshDshPluginUpdate honestly separates renderer_reload from restart_required", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-dsh-reload-mode-"));
  const profileDir = path.join(root, "profile");
  const carrierDir = path.join(root, "carrier");
  const rebuiltCalls = [];
  try {
    assert.equal(
      await classifyAndRefreshDshPluginUpdate({
        installed: { "@gaofeng21cn/opl-studio-client": "0.1.6" },
        dshProfileDir: profileDir,
        clientModules: {
          clientPath: () => path.join(profileDir, "node_modules/@gaofeng21cn/opl-studio-client/lib/client.js"),
          rebuilt: async (pkg) => {
            rebuiltCalls.push(pkg);
            return "rev-0.1.6";
          }
        }
      }),
      "renderer_reload"
    );
    assert.deepEqual(rebuiltCalls, ["@gaofeng21cn/opl-studio-client"]);

    const outsideRebuiltCalls = [];
    assert.equal(
      await classifyAndRefreshDshPluginUpdate({
        installed: { "@gaofeng21cn/opl-studio-client": "0.1.6" },
        dshProfileDir: profileDir,
        clientModules: {
          clientPath: () => path.join(carrierDir, "node_modules/@gaofeng21cn/opl-studio-client/lib/client.js"),
          rebuilt: async (pkg) => {
            outsideRebuiltCalls.push(pkg);
            return "rev-bad";
          }
        }
      }),
      "restart_required"
    );
    assert.deepEqual(outsideRebuiltCalls, []);

    assert.equal(
      await classifyAndRefreshDshPluginUpdate({
        installed: {
          "@gaofeng21cn/opl-studio-client": "0.1.6",
          "@gaofeng21cn/opl-host-core": "0.1.5"
        },
        dshProfileDir: profileDir,
        clientModules: {
          clientPath: () => path.join(profileDir, "node_modules/@gaofeng21cn/opl-studio-client/lib/client.js"),
          rebuilt: async () => "rev-0.1.6"
        }
      }),
      "restart_required"
    );

    assert.equal(
      await classifyAndRefreshDshPluginUpdate({
        installed: { "@gaofeng21cn/opl-studio-client": "0.1.6" },
        dshProfileDir: profileDir,
        clientModules: {
          clientPath: () => path.join(profileDir, "node_modules/@gaofeng21cn/opl-studio-client/lib/client.js"),
          rebuilt: async () => {
            throw new Error("rebuild failed");
          }
        }
      }),
      "restart_required"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
