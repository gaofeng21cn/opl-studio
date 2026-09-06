import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray } from "electron";
import updaterPackage from "electron-updater";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createOplHostCore } from "../scripts/webui-host/host-core.mjs";
import { createOplPassthrough } from "../scripts/webui-host/opl-passthrough.mjs";
import { createManagedUpdateMaintenance } from "../scripts/webui-host/managed-update-maintenance.mjs";
import { captureDesktopAccessibility } from "./accessibility-qualification.mjs";
import { createAppLogDirectoryController } from "./app-log-directory.mjs";
import { resolveDesktopRuntimeEnvironment } from "./process-environment.mjs";
import { ensureStudioDesktopRuntime } from "./runtime-bootstrap.mjs";
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
let desktopHostPromise;
let installingUpdate = false;
let quittingApplication = false;
let updaterQualificationEnabled = false;
let updaterQualificationAutomatic = false;
const appProcessInstanceId = randomUUID();
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
  quit: async () => {
    if (desktopUpdater?.snapshot().state === "downloaded" && (!updaterQualificationEnabled || updaterQualificationAutomatic)) {
      const installed = await desktopUpdater.perform("installOnQuit");
      if (installed.accepted) return;
    }
    app.quit();
  }
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
  updaterQualificationAutomatic = updaterQualificationEnabled && process.env.OPL_DESKTOP_UPDATE_QUALIFICATION_AUTOMATIC === "1";
  let core;
  const updater = createDesktopUpdater({
    autoUpdater,
    isPackaged: app.isPackaged,
    updateConfigAvailable,
    currentVersion: app.getVersion(),
    automatic: !updaterQualificationEnabled || updaterQualificationAutomatic,
    onStateChange: (state) => {
      sendDesktopRendererEvent("desktop/native-app-update", state);
      if (updaterQualificationEnabled) process.send?.({ type: "opl-desktop-update-state", state });
    },
    beforeRestart: async ({ quitting }) => {
      const prepare = async () => {
        quittingApplication = true;
        await core?.close();
        ipcMain.removeHandler("opl:invoke");
        installingUpdate = true;
      };
      if (quitting || !core) {
        await prepare();
        return true;
      }
      return (await core.transport.runWhenIdle(prepare)).status === "completed";
    }
  });
  const homeDir = app.getPath("home");
  const runtime = await ensureStudioDesktopRuntime({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    homeDir,
    env: process.env
  });
  const activationEnvironment = resolveDesktopRuntimeEnvironment({
    env: runtime?.env ?? process.env,
    homeDir,
    resourcesPath: process.resourcesPath
  });
  activationEnvironment.OPL_APP_PROCESS_INSTANCE_ID = appProcessInstanceId;
  const managedUpdatesEnabled = app.isPackaged && !updaterQualificationEnabled
    && process.env.OPL_STUDIO_MANAGED_UPDATES !== "0"
    && process.env.OPL_STUDIO_READ_ONLY !== "1" && process.env.OPL_NATIVE_WORKBENCH_READ_ONLY !== "1";
  let activationStatus = "disabled";
  let activatedCodexPath;
  if (managedUpdatesEnabled) {
    try {
      const activation = await createOplPassthrough({ env: activationEnvironment, cwd: homeDir }).runManagedUpdate("activate");
      activationStatus = activation.runtime_activation?.status ?? "unknown";
      const binary = activation.runtime_activation?.codex?.runtime_binary_path;
      if (typeof binary === "string" && path.isAbsolute(binary) && fs.existsSync(binary)) activatedCodexPath = binary;
    } catch {
      activationStatus = "failed";
    }
  }
  const hostEnvironment = resolveDesktopRuntimeEnvironment({
    env: {
      ...(runtime?.env ?? process.env), OPL_APP_PROCESS_INSTANCE_ID: appProcessInstanceId,
      ...(!process.env.OPL_CODEX_BIN && !process.env.CODEX_APP_SERVER_COMMAND && activatedCodexPath
        ? { OPL_CODEX_BIN: activatedCodexPath } : {})
    },
    homeDir,
    resourcesPath: process.resourcesPath
  });
  hostEnvironment.OPL_APP_VERSION ??= app.getVersion();
  core = await createOplHostCore({
    workspaceRoot: desktopCodexWorkspaceRoot(),
    env: hostEnvironment,
    candidateActionAllowlist: [
      "workspace_root_set", "codex_install", "settings_check_opl_base_update", "settings_apply_opl_base_update",
      "settings_apply_opl_packages", "agent_package_update", "agent_package_repair"
    ],
    channelBindingFile: path.join(app.getPath("userData"), "channel-transport-bindings.json"),
    platform: {
      pickFiles: async () => {
        const result = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"] });
        return result.canceled ? [] : result.filePaths.map((filePath) => ({
          kind: /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(filePath) ? "image" : "file",
          name: path.basename(filePath),
          path: filePath,
          previewUrl: pathToFileURL(filePath).href
        }));
      },
      pickDirectory: async () => {
        const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
        const directory = result.filePaths[0];
        return result.canceled || !directory
          ? []
          : [{ kind: "folder", name: path.basename(directory), path: directory }];
      },
      classifyInputPaths: async ({ paths = [] } = {}) => {
        const inputs = [];
        for (const filePath of paths) {
          if (typeof filePath !== "string" || !path.isAbsolute(filePath)) continue;
          const metadata = await fs.promises.stat(filePath);
          inputs.push({
            kind: metadata.isDirectory() ? "folder" : /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(filePath) ? "image" : "file",
            name: path.basename(filePath),
            path: filePath,
            ...(metadata.isFile() ? { previewUrl: pathToFileURL(filePath).href } : {})
          });
        }
        return inputs;
      },
      releaseInputs: async () => undefined,
      notifyCompletion: async ({ threadId, title, body } = {}) => {
        if (!Notification.isSupported() || (mainWindow?.isVisible() && mainWindow.isFocused())) return;
        const notification = new Notification({ title: title || "One Person Lab", body: body || "Task completed" });
        notification.on("click", () => {
          if (!mainWindow || mainWindow.isDestroyed()) createWindow();
          mainWindow?.show();
          mainWindow?.focus();
          if (threadId) sendDesktopRendererEvent("desktop/open-thread", { threadId });
        });
        notification.show();
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

  core.on("event", (event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send("opl:event", event);
    }
  });
  if (managedUpdatesEnabled) {
    core.updateMaintenance = createManagedUpdateMaintenance({
      opl: core.opl,
      codex: core.codex,
      stateFile: path.join(app.getPath("userData"), "managed-update-maintenance.json"),
      checkAppUpdate: () => updater.perform("check"),
      onStateChange: (state) => core.emit("event", {
        method: "host/managed-update", params: { ...state, activationStatus }
      })
    });
    await core.updateMaintenance.start();
  } else if (updater.snapshot().supported && !updaterQualificationEnabled) {
    void updater.perform("check").catch(() => undefined);
  }
  return { core, desktopUpdater: updater };
}

async function desktopHost(appLogDirectory, { retry = false } = {}) {
  if (retry && desktopHostPromise) {
    const previous = desktopHostPromise;
    desktopHostPromise = undefined;
    try {
      const active = await previous;
      await active.core.close();
    } catch {
      // A failed bootstrap has no live Host to dispose.
    }
    hostCore = undefined;
    desktopUpdater = undefined;
  }
  desktopHostPromise ??= createDesktopHost(appLogDirectory).then((desktopHost) => {
    hostCore = desktopHost.core;
    desktopUpdater = desktopHost.desktopUpdater;
    return desktopHost;
  });
  return await desktopHostPromise;
}

app.whenReady().then(async () => {
  if (nativeAccessibilityQualificationEnabled) {
    app.setAccessibilitySupportEnabled(true);
  }
  const appLogDirectory = createAppLogDirectoryController({ electronApp: app });
  await appLogDirectory.restore();
  createWindow();
  ipcMain.handle("opl:invoke", async (event, request) => {
    if (quittingApplication) throw new Error("Application is closing");
    if (!trustedRendererUrl(event.senderFrame.url)) {
      throw new Error("Untrusted renderer cannot invoke the OPL host");
    }
    const retry = request?.method === "retryDesktopHost";
    const activeHost = await desktopHost(appLogDirectory, { retry });
    return retry
      ? { status: "ready" }
      : activeHost.core.invoke(request?.method, request?.payload ?? {});
  });
  void desktopHost(appLogDirectory).then(async (activeHost) => {
    desktopTray = await createDesktopTray({
      electron: { app, dialog, Menu, nativeImage, Tray },
      repositoryRoot,
      resourcesPath: process.resourcesPath,
      isPackaged: app.isPackaged,
      invokeHost: (method, payload) => activeHost.core.invoke(method, payload),
      checkForUpdates: () => activeHost.desktopUpdater.perform("check"),
      getWindow: () => mainWindow,
      sendRendererEvent: sendDesktopRendererEvent,
      restart: restartApplication,
      quit: quitApplication
    });
  }).catch(() => undefined);
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
