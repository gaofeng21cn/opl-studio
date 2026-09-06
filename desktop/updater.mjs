import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const baseState = (currentVersion) => ({
  schema: "opl_native_app_updater.v1",
  owner: "one-person-lab-app_desktop_host",
  host: "electron",
  supported: true,
  state: "idle",
  currentVersion,
  restartRequired: false
});

function pathIsInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function configureDesktopUpdaterQualificationState({
  electronApp,
  stateRoot,
  tempRoot = os.tmpdir()
}) {
  if (!stateRoot) return false;
  if (!path.isAbsolute(stateRoot)) {
    throw new Error("Desktop updater qualification state must use an absolute system-temp path");
  }
  const requestedTempRoot = path.resolve(tempRoot);
  const requestedStateRoot = path.resolve(stateRoot);
  if (!pathIsInside(requestedTempRoot, requestedStateRoot)) {
    throw new Error("Desktop updater qualification state must stay inside the system temp directory");
  }
  fs.mkdirSync(requestedStateRoot, { recursive: true });
  const realTempRoot = fs.realpathSync.native(tempRoot);
  const realStateRoot = fs.realpathSync.native(requestedStateRoot);
  if (!pathIsInside(realTempRoot, realStateRoot)) {
    throw new Error("Desktop updater qualification state resolves outside the system temp directory");
  }
  for (const name of ["userData", "sessionData", "logs", "crashDumps"]) {
    const directory = path.join(realStateRoot, name);
    fs.mkdirSync(directory, { recursive: true });
    electronApp.setPath(name, directory);
  }
  return true;
}

export function configureDesktopUpdaterQualification({ autoUpdater, feedUrl }) {
  if (!feedUrl) return false;
  const url = new URL(feedUrl);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "http:" || !loopback || url.username || url.password) {
    throw new Error("Desktop updater qualification requires a credential-free loopback HTTP feed");
  }
  autoUpdater.setFeedURL({ provider: "generic", url: url.href });
  autoUpdater.autoRunAppAfterInstall = false;
  return true;
}

export function createDesktopUpdater({
  autoUpdater,
  isPackaged,
  updateConfigAvailable = true,
  currentVersion,
  automatic = true,
  onStateChange = () => undefined,
  beforeRestart = async () => undefined
}) {
  const supported = isPackaged && updateConfigAvailable;
  let state = supported
    ? baseState(currentVersion)
    : {
        ...baseState(currentVersion),
        supported: false,
        state: "unsupported",
        reasonCode: isPackaged ? "desktop_update_config_unavailable" : "desktop_updater_requires_packaged_app"
      };

  const update = (next) => {
    state = { ...state, ...next };
    onStateChange({ ...state });
  };

  if (supported) {
    // Installation is requested after the Host has finished its normal shutdown.
    autoUpdater.autoDownload = automatic;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on("checking-for-update", () => update({ state: "checking", operation: "check" }));
    autoUpdater.on("update-not-available", (info) => update({
      state: "not_available",
      operation: "check",
      targetVersion: info?.version,
      restartRequired: false
    }));
    autoUpdater.on("update-available", (info) => update({
      state: "available",
      operation: "check",
      targetVersion: info?.version,
      restartRequired: false
    }));
    autoUpdater.on("download-progress", (progress) => update({
      state: "downloading",
      operation: "apply",
      progressPercent: progress?.percent
    }));
    autoUpdater.on("update-downloaded", (info) => update({
      state: "downloaded",
      operation: "apply",
      targetVersion: info?.version ?? state.targetVersion,
      restartRequired: true
    }));
    autoUpdater.on("error", (error) => update({
      state: "error",
      errorCode: "desktop_updater_error",
      message: error?.message ?? String(error)
    }));
  }

  return {
    snapshot(operation = "status") {
      return { ...state, operation };
    },
    async perform(operation) {
      if (operation === "status") return this.snapshot(operation);
      if (!supported) return this.snapshot(operation);
      if (operation === "check") {
        if (["checking", "downloading", "downloaded", "installing"].includes(state.state)) return this.snapshot(operation);
        update({ state: "checking", operation });
        try {
          await autoUpdater.checkForUpdates();
        } catch (error) {
          update({ state: "error", errorCode: "desktop_updater_error", message: error?.message ?? String(error) });
          throw error;
        }
        return this.snapshot(operation);
      }
      if (operation === "apply") {
        if (state.state !== "available") {
          return { ...this.snapshot(operation), accepted: false, reasonCode: "update_not_available" };
        }
        update({ state: "downloading", operation });
        await autoUpdater.downloadUpdate();
        return { ...this.snapshot(operation), accepted: state.state === "downloaded" };
      }
      if (operation === "restart" || operation === "installOnQuit") {
        if (state.state !== "downloaded") {
          return { ...this.snapshot(operation), accepted: false, reasonCode: "downloaded_update_required" };
        }
        try {
          if (await beforeRestart({ quitting: operation === "installOnQuit" }) === false) {
            return { ...this.snapshot(operation), accepted: false, reasonCode: "app_server_busy" };
          }
        } catch {
          update({
            state: "error",
            operation,
            restartRequired: true,
            errorCode: "desktop_restart_preparation_failed"
          });
          return { ...this.snapshot(operation), accepted: false };
        }
        update({ state: "installing", operation, restartRequired: true, errorCode: undefined });
        autoUpdater.autoRunAppAfterInstall = operation !== "installOnQuit";
        setImmediate(() => autoUpdater.quitAndInstall(true, operation !== "installOnQuit"));
        return { ...this.snapshot(operation), accepted: true };
      }
      return { ...this.snapshot(operation), accepted: false, reasonCode: "unsupported_update_operation" };
    }
  };
}
