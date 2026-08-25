import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import updaterPackage from "electron-updater";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createOplHostCore } from "../scripts/webui-host/host-core.mjs";
import { captureDesktopAccessibility } from "./accessibility-qualification.mjs";
import { createAppLogDirectoryController } from "./app-log-directory.mjs";
import { resolveDesktopRuntimeEnvironment } from "./process-environment.mjs";
import { createShutdownController } from "./shutdown.mjs";
import { createDesktopTray } from "./tray.mjs";
import {
  configureDesktopUpdaterQualification,
  configureDesktopUpdaterQualificationState,
  createDesktopUpdater
} from "./updater.mjs";

const { autoUpdater } = updaterPackage;
const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(desktopRoot, "..");
const rendererIndex = path.join(repositoryRoot, "dist", "desktop", "index.html");
let hostCore;
let mainWindow;
let desktopTray;
let desktopUpdater;
let installingUpdate = false;
let quittingApplication = false;
let updaterQualificationEnabled = false;
let startupUpdateCheckStarted = false;
const nativeAccessibilityQualificationEnabled = process.env.OPL_DESKTOP_NATIVE_ACCESSIBILITY_QUALIFICATION === "1";
if (nativeAccessibilityQualificationEnabled) {
  app.commandLine.appendSwitch("force-renderer-accessibility");
  if (process.platform === "win32") {
    app.commandLine.appendSwitch("enable-features", "UiaProvider");
  }
}
configureDesktopUpdaterQualificationState({
  electronApp: app,
  stateRoot: process.env.OPL_DESKTOP_UPDATE_QUALIFICATION_STATE_ROOT
});
const shutdown = createShutdownController({
  close: async () => {
    desktopTray?.destroy();
    desktopTray = null;
    ipcMain.removeHandler("opl:invoke");
    await hostCore?.close();
  },
  quit: () => app.quit()
});

function trustedRendererUrl(url) {
  try {
    const candidate = new URL(url);
    candidate.hash = "";
    candidate.search = "";
    return candidate.href === pathToFileURL(rendererIndex).href;
  } catch {
    return false;
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "One Person Lab",
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" } : {}),
    webPreferences: {
      preload: path.join(desktopRoot, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow = window;
  window.once("ready-to-show", async () => {
    window.show();
    if (typeof process.send === "function") {
      let accessibilityQualification = null;
      if (process.env.OPL_DESKTOP_ACCESSIBILITY_QUALIFICATION === "1") {
        try {
          accessibilityQualification = await captureDesktopAccessibility(window.webContents);
        } catch (error) {
          accessibilityQualification = {
            schema: "opl_desktop_chromium_ax_tree_smoke.v1",
            status: "failed",
            detail: error instanceof Error ? error.message : String(error)
          };
        }
      }
      process.send({
        type: "opl-desktop-ready",
        version: app.getVersion(),
        visible: window.isVisible(),
        windowCount: BrowserWindow.getAllWindows().length,
        accessibilityQualification
      });
    }
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!trustedRendererUrl(url)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.on("close", (event) => {
    if (desktopTray && !quittingApplication && !installingUpdate) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.webContents.once("did-finish-load", () => {
    if (!desktopUpdater) return;
    sendDesktopRendererEvent("desktop/native-app-update", desktopUpdater.snapshot());
    if (!startupUpdateCheckStarted && desktopUpdater.snapshot().supported && !updaterQualificationEnabled) {
      startupUpdateCheckStarted = true;
      void desktopUpdater.perform("check").catch(() => undefined);
    }
  });
  void window.loadFile(rendererIndex);
  return window;
}

function sendDesktopRendererEvent(method, params = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("opl:event", { method, params });
}

function restartApplication() {
  quittingApplication = true;
  app.relaunch();
  app.quit();
}

function quitApplication() {
  quittingApplication = true;
  app.quit();
}

function desktopCodexWorkspaceRoot() {
  return process.env.OPL_NATIVE_WORKBENCH_CODEX_CWD
    ?? process.env.OPL_STUDIO_CODEX_CWD
    ?? app.getPath("home");
}

async function createDesktopHost(appLogDirectory) {
  const updateConfigAvailable = fs.existsSync(path.join(process.resourcesPath, "app-update.yml"));
  updaterQualificationEnabled = configureDesktopUpdaterQualification({
    autoUpdater,
    feedUrl: process.env.OPL_DESKTOP_UPDATE_QUALIFICATION_FEED_URL
  });
  let core;
  const updater = createDesktopUpdater({
    autoUpdater,
    isPackaged: app.isPackaged,
    updateConfigAvailable,
    currentVersion: app.getVersion(),
    onStateChange: (state) => sendDesktopRendererEvent("desktop/native-app-update", state),
    beforeRestart: async () => {
      await core?.close();
      ipcMain.removeHandler("opl:invoke");
      installingUpdate = true;
    }
  });
  const hostEnvironment = resolveDesktopRuntimeEnvironment({
    env: process.env,
    homeDir: app.getPath("home"),
    resourcesPath: process.resourcesPath
  });
  hostEnvironment.OPL_APP_VERSION ??= app.getVersion();
  core = await createOplHostCore({
    workspaceRoot: desktopCodexWorkspaceRoot(),
    env: hostEnvironment,
    candidateActionAllowlist: ["workspace_root_set", "codex_install"],
    channelBindingFile: path.join(app.getPath("userData"), "channel-transport-bindings.json"),
    platform: {
      pickFiles: async () => {
        const result = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"] });
        return result.canceled ? [] : result.filePaths.map((filePath) => ({
          kind: /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(filePath) ? "image" : "file",
          name: path.basename(filePath),
          path: filePath
        }));
      },
      pickDirectory: async () => {
        const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
        const directory = result.filePaths[0];
        return result.canceled || !directory
          ? []
          : [{ kind: "folder", name: path.basename(directory), path: directory }];
      }
    },
    carrierDiagnostics: {
      read: async () => ({
        schema: "opl_app_carrier_diagnostics.v1",
        owner: "one-person-lab-app_desktop_host",
        carrier: "electron_desktop",
        status: "available",
        application: { systemInfo: { logDir: app.getPath("logs") } },
        setLogDirectorySupported: true
      }),
      setLogDirectory: (request) => appLogDirectory.setLogDirectory(request)
    },
    nativeUpdater: updater
  });

  ipcMain.handle("opl:invoke", async (event, request) => {
    if (!trustedRendererUrl(event.senderFrame.url)) {
      throw new Error("Untrusted renderer cannot invoke the OPL host");
    }
    return core.invoke(request?.method, request?.payload ?? {});
  });
  core.on("event", (event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send("opl:event", event);
    }
  });
  return { core, desktopUpdater: updater };
}

app.whenReady().then(async () => {
  if (nativeAccessibilityQualificationEnabled) {
    app.setAccessibilitySupportEnabled(true);
  }
  const appLogDirectory = createAppLogDirectoryController({ electronApp: app });
  await appLogDirectory.restore();
  const desktopHost = await createDesktopHost(appLogDirectory);
  hostCore = desktopHost.core;
  desktopUpdater = desktopHost.desktopUpdater;
  createWindow();
  desktopTray = await createDesktopTray({
    electron: { app, dialog, Menu, nativeImage, Tray },
    repositoryRoot,
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
    invokeHost: (method, payload) => hostCore.invoke(method, payload),
    checkForUpdates: () => desktopHost.desktopUpdater.perform("check"),
    getWindow: () => mainWindow,
    sendRendererEvent: sendDesktopRendererEvent,
    restart: restartApplication,
    quit: quitApplication
  });
  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  quittingApplication = true;
  if (installingUpdate) return;
  if (!shutdown.exitAllowed) void shutdown.request(event);
});

if (typeof process.send === "function") {
  process.on("message", async (message) => {
    if (message?.type === "opl-desktop-smoke-quit") app.quit();
    if (message?.type === "opl-desktop-update-qualification" && updaterQualificationEnabled) {
      const methods = {
        status: "readNativeAppUpdateStatus",
        check: "checkNativeAppUpdate",
        apply: "applyNativeAppUpdate",
        restart: "restartNativeApp"
      };
      const method = methods[message.operation];
      if (!method) return;
      try {
        const result = await hostCore.invoke(method);
        process.send?.({ type: "opl-desktop-update-qualification-result", operation: message.operation, result });
      } catch (error) {
        process.send?.({
          type: "opl-desktop-update-qualification-result",
          operation: message.operation,
          error: error?.message ?? String(error)
        });
      }
    }
  });
}
