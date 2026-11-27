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
  readUserExternalDshPlugins,
  reconcileUserExternalPluginsOnBoot,
  setOptionalPluginEnabled,
  validateExternalDshPackageName
} from "../../packages/host-kit/dsh-plugin-catalog.mjs";
import {
  applyPendingExternalPluginRemovalsOnBoot,
  manageExternalNpmDshPlugin
} from "../../packages/host-kit/src/profile-plugin-updates.mjs";
import {
  cancelPendingContextOperation,
  clearPendingContextOperation,
  readPendingContextOperation,
  stageContextPluginOperation
} from "../../plugins/core/opl-codex-native/src/billion-context.mjs";
import { readProfileManifest, initProfile } from "@deepseek-ai/dsh-app-boot";
import { classifyAndRefreshDshPluginUpdate } from "../../plugins/core/opl-host-core/src/service.mjs";
import { bootOplStudioHost } from "./dsh/host.mjs";

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

    assert.equal(
      await classifyAndRefreshDshPluginUpdate({
        installed: { "@gaofeng21cn/opl-runtime-status": "0.1.2" },
        dshProfileDir: profileDir,
        clientModules: {
          clientPath: () => path.join(profileDir, "node_modules/@gaofeng21cn/opl-runtime-status/lib/client.js"),
          rebuilt: async () => "rev-runtime-0.1.2"
        }
      }),
      "renderer_reload"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateExternalDshPackageName and open external npm DSH plugin lifecycle enforce safety and reconcile on boot", async () => {
  assert.equal(validateExternalDshPackageName("  @community/dsh-notes "), "@community/dsh-notes");
  assert.throws(() => validateExternalDshPackageName("@gaofeng21cn/opl-host-core"), /First-party/);
  assert.throws(() => validateExternalDshPackageName("billion-context"), /already managed/);
  assert.throws(() => validateExternalDshPackageName("https://evil.test/pkg.tgz"), /Invalid npm package name/);
  assert.throws(() => validateExternalDshPackageName("--flag"), /Invalid npm package name/);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-open-dsh-plugin-"));
  const home = path.join(root, "home");
  const profileDir = path.join(root, "profile");
  fs.mkdirSync(profileDir, { recursive: true });
  try {
    await assert.rejects(
      manageExternalNpmDshPlugin({
        home,
        dir: profileDir,
        packageName: "plain-npm-lib",
        operation: "install",
        view: async () => ({
          exitCode: 0,
          stdout: JSON.stringify({ name: "plain-npm-lib", version: "1.0.0", engines: { node: ">=20" } })
        })
      }),
      /"dsh" field missing/i
    );

    let remoteVersion = "1.2.0";
    const view = async (_dir, target) => {
      assert.ok(target.startsWith("@community/dsh-notes@"));
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          name: "@community/dsh-notes",
          version: remoteVersion,
          description: "Community notes workbench",
          homepage: "https://example.org/dsh-notes",
          engines: { node: ">=20" },
          dsh: { manifestVersion: 1, title: "Notes Extension", client: "./lib/client.js" }
        })
      };
    };
    const run = async (profileCtx, args) => {
      assert.ok(args.includes("--ignore-scripts"));
      const pkgDir = path.join(profileCtx.dir, "node_modules", "@community", "dsh-notes");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({
        name: "@community/dsh-notes",
        version: remoteVersion,
        dsh: { manifestVersion: 1, client: "./lib/client.js" }
      }));
      return { exitCode: 0, timedOut: false };
    };
    const runRemove = async (profileCtx) => {
      fs.rmSync(path.join(profileCtx.dir, "node_modules", "@community", "dsh-notes"), { recursive: true, force: true });
      return { exitCode: 0, timedOut: false };
    };

    const installed = await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-notes", operation: "install", view, run, runRemove
    });
    assert.equal(installed.version, "1.2.0");
    assert.equal(installed.restartRequired, true);
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-notes"]?.installedVersion, "1.2.0");

    remoteVersion = "1.3.0";
    const checked = await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-notes", operation: "check", view, run, runRemove
    });
    assert.equal(checked.updateAvailable, true);
    assert.equal(checked.availableVersion, "1.3.0");

    const updated = await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-notes", operation: "update", activeAtBoot: true, view, run, runRemove
    });
    assert.equal(updated.version, "1.3.0");

    const catalogBeforeBoot = buildDshPluginCatalog({
      dshProfileDir: profileDir,
      activeExternalPlugins: ["@community/dsh-notes"]
    });
    const entry = catalogBeforeBoot.entries.find(e => e.packageName === "@community/dsh-notes");
    assert.equal(entry?.origin, "external");
    assert.equal(entry?.pendingOperation, "update");
    assert.equal(entry?.pendingVersion, "1.3.0");
    assert.equal(catalogBeforeBoot.restartRequired, true);

    reconcileUserExternalPluginsOnBoot(profileDir);
    const catalogAfterBoot = buildDshPluginCatalog({
      dshProfileDir: profileDir,
      activeExternalPlugins: ["@community/dsh-notes"]
    });
    const settled = catalogAfterBoot.entries.find(e => e.packageName === "@community/dsh-notes");
    assert.equal(settled?.pendingOperation, null);
    assert.equal(settled?.version, "1.3.0");

    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-notes", operation: "remove", activeAtBoot: true, view, run, runRemove
    });
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-notes"]?.pendingOperation, "remove");
    await applyPendingExternalPluginRemovalsOnBoot({ dir: profileDir, home, runRemove });
    reconcileUserExternalPluginsOnBoot(profileDir);
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-notes"], undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("external npm plugin updates preserve disabled choice and staged removals are genuinely reversible", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-open-dsh-reversible-"));
  const home = path.join(root, "home");
  const profileDir = path.join(root, "profile");
  fs.mkdirSync(profileDir, { recursive: true });
  try {
    let remoteVersion = "1.0.0";
    let removedByPnpm = 0;
    const view = async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        name: "@community/dsh-toggle",
        version: remoteVersion,
        engines: { node: ">=20" },
        dsh: { manifestVersion: 1, title: "Toggle Plugin", client: "./lib/client.js" }
      })
    });
    const run = async (profileCtx) => {
      const pkgDir = path.join(profileCtx.dir, "node_modules", "@community", "dsh-toggle");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({
        name: "@community/dsh-toggle",
        version: remoteVersion,
        exports: { ".": "./lib/index.js" },
        dsh: { manifestVersion: 1, client: "./lib/client.js" }
      }));
      const manifestPath = path.join(profileCtx.dir, "package.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest.dependencies = { ...(manifest.dependencies ?? {}), "@community/dsh-toggle": remoteVersion };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      return { exitCode: 0, timedOut: false };
    };
    const runRemove = async (profileCtx) => {
      removedByPnpm += 1;
      fs.rmSync(path.join(profileCtx.dir, "node_modules", "@community", "dsh-toggle"), { recursive: true, force: true });
      const manifestPath = path.join(profileCtx.dir, "package.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest.dependencies) delete manifest.dependencies["@community/dsh-toggle"];
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      return { exitCode: 0, timedOut: false };
    };

    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-toggle", operation: "install", view, run, runRemove
    });
    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-toggle", operation: "disable", activeAtBoot: false, view, run, runRemove
    });
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-toggle"]?.enabled, false);
    assert.equal(readProfileManifest("opl-studio", profileDir).dsh?.profile?.bundles?.includes("@community/dsh-toggle"), false);

    // Background update on disabled plugin must preserve enabled: false and bundles exclusion.
    remoteVersion = "1.1.0";
    const updatedDisabled = await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-toggle", operation: "update", activeAtBoot: false, view, run, runRemove
    });
    assert.equal(updatedDisabled.updated, true);
    assert.equal(updatedDisabled.staged, false);
    assert.equal(updatedDisabled.restartRequired, false);
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-toggle"]?.enabled, false);
    assert.equal(readProfileManifest("opl-studio", profileDir).dsh?.profile?.bundles?.includes("@community/dsh-toggle"), false);

    // Re-enable and simulate loaded at boot; staged update cannot be canceled.
    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-toggle", operation: "enable", activeAtBoot: false, view, run, runRemove
    });
    remoteVersion = "1.2.0";
    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-toggle", operation: "update", activeAtBoot: true, view, run, runRemove
    });
    const updateCatalog = buildDshPluginCatalog({
      dshProfileDir: profileDir,
      activeExternalPlugins: ["@community/dsh-toggle"],
      activeExternalPluginVersions: { "@community/dsh-toggle": "1.1.0" }
    });
    const stagedUpdateEntry = updateCatalog.entries.find(e => e.packageName === "@community/dsh-toggle");
    assert.equal(stagedUpdateEntry?.version, "1.2.0");
    assert.equal(stagedUpdateEntry?.activeVersion, "1.1.0");
    assert.equal(stagedUpdateEntry?.pendingOperation, "update");
    assert.equal(stagedUpdateEntry?.canCancelPending, false);
    await assert.rejects(
      manageExternalNpmDshPlugin({
        home, dir: profileDir, packageName: "@community/dsh-toggle", operation: "cancel_pending", activeAtBoot: true, view, run, runRemove
      }),
      (err) => err?.code === "dsh_plugin_cancel_unsupported"
    );
    reconcileUserExternalPluginsOnBoot(profileDir);

    // Staged removal keeps files intact on disk until boot, and cancel_pending restores prior enabled state.
    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-toggle", operation: "remove", activeAtBoot: true, view, run, runRemove
    });
    assert.equal(removedByPnpm, 0);
    assert.equal(fs.existsSync(path.join(profileDir, "node_modules", "@community", "dsh-toggle", "package.json")), true);
    const removeCatalog = buildDshPluginCatalog({
      dshProfileDir: profileDir,
      activeExternalPlugins: ["@community/dsh-toggle"]
    });
    const stagedRemoveEntry = removeCatalog.entries.find(e => e.packageName === "@community/dsh-toggle");
    assert.equal(stagedRemoveEntry?.pendingOperation, "remove");
    assert.equal(stagedRemoveEntry?.canCancelPending, true);

    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-toggle", operation: "cancel_pending", activeAtBoot: true, view, run, runRemove
    });
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-toggle"]?.pendingOperation, null);
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-toggle"]?.enabled, true);
    assert.equal(readProfileManifest("opl-studio", profileDir).dsh?.profile?.bundles?.includes("@community/dsh-toggle"), true);
    reconcileUserExternalPluginsOnBoot(profileDir);
    assert.equal(fs.existsSync(path.join(profileDir, "node_modules", "@community", "dsh-toggle", "package.json")), true);

    // Uncancelled staged removal is executed on cold boot.
    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-toggle", operation: "remove", activeAtBoot: true, view, run, runRemove
    });
    const bootRemoval = await applyPendingExternalPluginRemovalsOnBoot({ dir: profileDir, home, runRemove });
    assert.deepEqual(bootRemoval, { removed: ["@community/dsh-toggle"], failed: [] });
    assert.equal(removedByPnpm, 1);
    assert.equal(fs.existsSync(path.join(profileDir, "node_modules", "@community", "dsh-toggle")), false);
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-toggle"], undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cancelPendingContextOperation restores billion-context bundle selection after staged removal", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-bc-cancel-remove-"));
  const profileDir = path.join(root, "profile");
  fs.mkdirSync(profileDir, { recursive: true });
  try {
    fs.writeFileSync(path.join(profileDir, "package.json"), JSON.stringify({
      name: "opl-studio-profile",
      private: true,
      dependencies: { "billion-context": "1.0.0" },
      dsh: { profile: { bundles: ["billion-context"] } }
    }, null, 2));
    await stageContextPluginOperation({ dshProfileDir: profileDir }, "remove", "1.0.0");
    assert.equal(readProfileManifest("opl-studio", profileDir).dsh?.profile?.bundles?.includes("billion-context"), false);
    assert.equal(readPendingContextOperation(profileDir)?.operation, "remove");
    await cancelPendingContextOperation({ dshProfileDir: profileDir });
    assert.equal(readPendingContextOperation(profileDir), null);
    assert.equal(readProfileManifest("opl-studio", profileDir).dsh?.profile?.bundles?.includes("billion-context"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("external npm plugin update respects disable or staged removal made while download is in flight", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-open-dsh-toctou-"));
  const home = path.join(root, "home");
  const profileDir = path.join(root, "profile");
  fs.mkdirSync(profileDir, { recursive: true });
  try {
    let remoteVersion = "1.0.0";
    let onDownloadStart = null;
    const view = async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        name: "@community/dsh-race",
        version: remoteVersion,
        engines: { node: ">=20" },
        dsh: { manifestVersion: 1, title: "Race Plugin", client: "./lib/client.js" }
      })
    });
    const run = async (profileCtx) => {
      if (onDownloadStart) await onDownloadStart();
      const pkgDir = path.join(profileCtx.dir, "node_modules", "@community", "dsh-race");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({
        name: "@community/dsh-race",
        version: remoteVersion,
        dsh: { manifestVersion: 1, client: "./lib/client.js" }
      }));
      return { exitCode: 0, timedOut: false };
    };
    const runRemove = async () => ({ exitCode: 0, timedOut: false });

    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-race", operation: "install", view, run, runRemove
    });

    // Case 1: user disables the plugin while 1.1.0 is downloading.
    remoteVersion = "1.1.0";
    onDownloadStart = async () => {
      await manageExternalNpmDshPlugin({
        home, dir: profileDir, packageName: "@community/dsh-race", operation: "disable", activeAtBoot: false, view, run, runRemove
      });
    };
    const updateAfterDisable = await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-race", operation: "update", activeAtBoot: false, view, run, runRemove
    });
    assert.equal(updateAfterDisable.updated, true);
    assert.equal(updateAfterDisable.staged, false);
    assert.equal(updateAfterDisable.restartRequired, false);
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-race"]?.enabled, false);
    assert.equal(readProfileManifest("opl-studio", profileDir).dsh?.profile?.bundles?.includes("@community/dsh-race"), false);

    // Case 2: user stages removal while 1.2.0 is downloading.
    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-race", operation: "enable", activeAtBoot: false, view, run, runRemove
    });
    remoteVersion = "1.2.0";
    onDownloadStart = async () => {
      await manageExternalNpmDshPlugin({
        home, dir: profileDir, packageName: "@community/dsh-race", operation: "remove", activeAtBoot: true, view, run, runRemove
      });
    };
    const updateAfterRemove = await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-race", operation: "update", activeAtBoot: true, view, run, runRemove
    });
    assert.equal(updateAfterRemove.updated, false);
    assert.equal(updateAfterRemove.restartRequired, true);
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-race"]?.pendingOperation, "remove");
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-race"]?.previousEnabled, true);
    assert.equal(readProfileManifest("opl-studio", profileDir).dsh?.profile?.bundles?.includes("@community/dsh-race"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("repeated staged removal preserves original enabled state on cancel for external plugins and billion-context", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-repeat-stage-remove-"));
  const home = path.join(root, "home");
  const profileDir = path.join(root, "profile");
  fs.mkdirSync(profileDir, { recursive: true });
  try {
    const view = async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        name: "@community/dsh-repeat",
        version: "1.0.0",
        engines: { node: ">=20" },
        dsh: { manifestVersion: 1, title: "Repeat Plugin", client: "./lib/client.js" }
      })
    });
    const run = async (profileCtx) => {
      const pkgDir = path.join(profileCtx.dir, "node_modules", "@community", "dsh-repeat");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({
        name: "@community/dsh-repeat",
        version: "1.0.0",
        dsh: { manifestVersion: 1, client: "./lib/client.js" }
      }));
      return { exitCode: 0, timedOut: false };
    };
    const runRemove = async () => ({ exitCode: 0, timedOut: false });

    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-repeat", operation: "install", view, run, runRemove
    });
    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-repeat", operation: "remove", activeAtBoot: true, view, run, runRemove
    });
    // Repeat remove before reboot must not clobber previousEnabled: true with false.
    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-repeat", operation: "remove", activeAtBoot: true, view, run, runRemove
    });
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-repeat"]?.previousEnabled, true);
    await manageExternalNpmDshPlugin({
      home, dir: profileDir, packageName: "@community/dsh-repeat", operation: "cancel_pending", activeAtBoot: true, view, run, runRemove
    });
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-repeat"]?.enabled, true);
    assert.equal(readProfileManifest("opl-studio", profileDir).dsh?.profile?.bundles?.includes("@community/dsh-repeat"), true);

    // Same invariant for billion-context repeated staged remove.
    const manifestPath = path.join(profileDir, "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.dependencies = { ...(manifest.dependencies ?? {}), "billion-context": "1.0.0" };
    manifest.dsh.profile.bundles.push("billion-context");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await stageContextPluginOperation({ dshProfileDir: profileDir }, "remove", "1.0.0");
    await stageContextPluginOperation({ dshProfileDir: profileDir }, "remove", "1.0.0");
    assert.equal(readPendingContextOperation(profileDir)?.previousEnabled, true);
    await cancelPendingContextOperation({ dshProfileDir: profileDir });
    assert.equal(readProfileManifest("opl-studio", profileDir).dsh?.profile?.bundles?.includes("billion-context"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("bootOplStudioHost continues cleanly when staged external plugin directory cleanup hits EACCES/EPERM", { skip: process.getuid?.() === 0 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-boot-eacces-cleanup-"));
  const dshHome = path.join(root, "dsh-home");
  const profileDir = path.join(dshHome, "profiles", "opl-studio");
  const nodeModulesDir = path.join(profileDir, "node_modules");
  const scopeDir = path.join(nodeModulesDir, "@community");
  const pkgDir = path.join(scopeDir, "dsh-locked");
  t.after(() => {
    try { fs.chmodSync(scopeDir, 0o755); } catch {}
    try { fs.chmodSync(pkgDir, 0o755); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  });

  initProfile(profileDir, []);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({
    name: "@community/dsh-locked",
    version: "1.0.0",
    dsh: { manifestVersion: 1, client: "./index.js" }
  }));
  fs.writeFileSync(path.join(pkgDir, "index.js"), "export function apply() {}\n");

  const manifestPath = path.join(profileDir, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.dependencies = { ...(manifest.dependencies ?? {}), "@community/dsh-locked": "1.0.0" };
  manifest.dsh = { profile: { bundles: ["@community/dsh-locked"] } };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  await manageExternalNpmDshPlugin({
    home: dshHome,
    dir: profileDir,
    packageName: "@community/dsh-locked",
    operation: "remove",
    activeAtBoot: true
  });

  // Fail the official pnpm removal before it edits dependencies, and the
  // fallback filesystem cleanup after the bundle has been detached.
  const operationLogRoot = path.join(profileDir, ".plugin-manager");
  fs.writeFileSync(operationLogRoot, "fixture blocks creation of pnpm logs");
  fs.chmodSync(scopeDir, 0o555);
  const fakeTransport = {
    initialized: true,
    on() {},
    once() {},
    removeListener() {},
    off() {},
    capabilities() { return { available: true }; },
    createChannelCallbackAdapter() { return null; },
    async start() {},
    async stop() {},
    async close() {},
    async listThreads() { return { data: [], nextCursor: null }; },
    async listModels() { return { data: [], nextCursor: null }; },
    async listCapabilities() { return { skills: [], plugins: [], apps: [], errors: [] }; }
  };
  const emptyOpl = () => ({
    readState: async () => ({}),
    readInitialize: async () => ({}),
    readFullDrilldown: async () => ({}),
    executeAction: async () => ({}),
    capabilities: () => ({ available: true })
  });

  const { core } = await bootOplStudioHost({ dshHome, transport: fakeTransport, opl: emptyOpl(), webPort: 0 });
  try {
    const updatedManifest = readProfileManifest("opl-studio", profileDir);
    assert.equal(updatedManifest.dependencies?.["@community/dsh-locked"], "1.0.0");
    assert.equal(updatedManifest.dsh?.profile?.bundles?.includes("@community/dsh-locked"), false);
    assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-locked"]?.pendingOperation, "remove");

    fs.chmodSync(scopeDir, 0o755);
    const next = await bootOplStudioHost({ dshHome, transport: fakeTransport, opl: emptyOpl(), webPort: 0 });
    try {
      assert.equal(fs.existsSync(pkgDir), false);
      assert.equal(Object.hasOwn(readProfileManifest("opl-studio", profileDir).dependencies ?? {}, "@community/dsh-locked"), false);
      assert.equal(readUserExternalDshPlugins(profileDir)["@community/dsh-locked"], undefined);
    } finally {
      await next.core.close();
    }
  } finally {
    await core.close();
  }
});
