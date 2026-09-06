import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  configureDesktopUpdaterQualification,
  configureDesktopUpdaterQualificationState,
  createDesktopUpdater
} from "./updater.mjs";

class FakeAutoUpdater extends EventEmitter {
  setFeedURL(value) {
    this.feed = value;
  }

  async checkForUpdates() {
    this.emit("update-available", { version: "1.1.0" });
  }

  async downloadUpdate() {
    this.emit("download-progress", { percent: 50 });
    this.emit("update-downloaded", { version: "1.1.0" });
  }

  quitAndInstall() {
    this.quitAndInstallCalled = true;
  }
}

test("desktop updater qualification isolates Electron state inside system temp", () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opl-desktop-updater-state-test-"));
  const configured = new Map();
  try {
    assert.equal(configureDesktopUpdaterQualificationState({
      electronApp: { setPath: (name, value) => configured.set(name, value) },
      stateRoot
    }), true);
    assert.deepEqual([...configured.keys()], ["userData", "sessionData", "logs", "crashDumps"]);
    const realStateRoot = fs.realpathSync.native(stateRoot);
    for (const directory of configured.values()) {
      assert.equal(directory.startsWith(`${realStateRoot}${path.sep}`), true);
      assert.equal(fs.statSync(directory).isDirectory(), true);
    }
    assert.throws(
      () => configureDesktopUpdaterQualificationState({ electronApp: { setPath() {} }, stateRoot: process.cwd() }),
      /system temp directory/
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("desktop updater qualification accepts only an explicit loopback feed", () => {
  const autoUpdater = new FakeAutoUpdater();
  assert.equal(configureDesktopUpdaterQualification({
    autoUpdater,
    feedUrl: "http://127.0.0.1:41781/releases/"
  }), true);
  assert.deepEqual(autoUpdater.feed, {
    provider: "generic",
    url: "http://127.0.0.1:41781/releases/"
  });
  assert.equal(autoUpdater.autoRunAppAfterInstall, false);
  assert.throws(
    () => configureDesktopUpdaterQualification({ autoUpdater, feedUrl: "https://updates.example.com/" }),
    /loopback HTTP/
  );
});

test("desktop updater preserves check, download, clean restart, and running-version readback", async () => {
  const lifecycle = [];
  const states = [];
  const autoUpdater = new FakeAutoUpdater();
  autoUpdater.quitAndInstall = () => lifecycle.push("quit-and-install");
  const updater = createDesktopUpdater({
    autoUpdater,
    isPackaged: true,
    currentVersion: "1.0.0",
    automatic: false,
    onStateChange: (state) => states.push(state),
    beforeRestart: async () => lifecycle.push("host-closed")
  });
  assert.equal((await updater.perform("check")).state, "available");
  const applied = await updater.perform("apply");
  assert.equal(applied.state, "downloaded");
  assert.equal(applied.restartRequired, true);
  const restarted = await updater.perform("restart");
  assert.equal(restarted.state, "installing");
  assert.equal(restarted.accepted, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(lifecycle, ["host-closed", "quit-and-install"]);
  assert.deepEqual(states.map((state) => state.state), [
    "checking",
    "available",
    "downloading",
    "downloading",
    "downloaded",
    "installing"
  ]);
  assert.equal(states.every((state) => state.currentVersion === "1.0.0"), true);

  const relaunched = createDesktopUpdater({
    autoUpdater: new FakeAutoUpdater(),
    isPackaged: true,
    currentVersion: "1.1.0"
  });
  assert.equal((await relaunched.perform("status")).currentVersion, "1.1.0");
});

test("desktop updater does not install when host shutdown preparation fails", async () => {
  const autoUpdater = new FakeAutoUpdater();
  const updater = createDesktopUpdater({
    autoUpdater,
    isPackaged: true,
    currentVersion: "1.0.0",
    beforeRestart: async () => { throw new Error("host close failed"); }
  });
  await updater.perform("check");
  await updater.perform("apply");
  const result = await updater.perform("restart");
  assert.equal(result.state, "error");
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, "desktop_restart_preparation_failed");
  assert.equal(autoUpdater.quitAndInstallCalled, undefined);
});

test("unpackaged desktop reports a truthful unsupported updater", async () => {
  const updater = createDesktopUpdater({ autoUpdater: new FakeAutoUpdater(), isPackaged: false, currentVersion: "0.1.0" });
  const result = await updater.perform("check");
  assert.equal(result.supported, false);
  assert.equal(result.reasonCode, "desktop_updater_requires_packaged_app");
});

test("desktop defaults to silent download and installs only after normal Host shutdown", async () => {
  const autoUpdater = new FakeAutoUpdater();
  const calls = [];
  autoUpdater.quitAndInstall = (...args) => calls.push(args);
  const updater = createDesktopUpdater({
    autoUpdater, isPackaged: true, currentVersion: "1.0.0",
    beforeRestart: async ({ quitting }) => { calls.push(quitting); return quitting; }
  });
  assert.equal(autoUpdater.autoDownload, true);
  assert.equal(autoUpdater.autoInstallOnAppQuit, false);
  autoUpdater.emit("update-downloaded", { version: "1.1.0" });
  assert.equal((await updater.perform("restart")).reasonCode, "app_server_busy");
  assert.equal(updater.snapshot().state, "downloaded");
  assert.equal((await updater.perform("installOnQuit")).accepted, true);
  assert.equal(autoUpdater.autoRunAppAfterInstall, false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [false, true, [true, false]]);
});

test("directory package stays truthful until release update metadata is present", async () => {
  const updater = createDesktopUpdater({
    autoUpdater: new FakeAutoUpdater(),
    isPackaged: true,
    updateConfigAvailable: false,
    currentVersion: "0.1.0"
  });
  const result = await updater.perform("check");
  assert.equal(result.supported, false);
  assert.equal(result.reasonCode, "desktop_update_config_unavailable");
});
