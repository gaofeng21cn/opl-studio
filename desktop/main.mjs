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
import { captureOfficialProfileAdmission, startOfficialProfileFirstInstall } from "./official-profile.mjs";
import { createShutdownController } from "./shutdown.mjs";
import { createDesktopTray } from "./tray.mjs";
import { packagedPreviewPlan, runPreviewHandoff, importPendingHandoff } from "./preview-handoff-runner.mjs";
import { commitPreparedTarget } from "./handoff-installer.mjs";
import { atomicJson } from "./preview-handoff.mjs";
import { createDeepLinkDelivery, extractDeepLinkPayloadFromArgv } from "./deep-links.mjs";
import { createWindowsRuntime } from "./windows-runtime.mjs";
import { createWindowsGuestHost } from "./windows-guest-proxy.mjs";
import { importLegacyChannelBindings } from "./legacy-channel-bindings.mjs";
import {
  configureDesktopUpdaterQualification,
  configureDesktopUpdaterQualificationState,
  createDesktopUpdater
} from "./updater.mjs";

const { autoUpdater } = updaterPackage;
const desktopRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(desktopRoot, "..");
const rendererIndex = path.join(repositoryRoot, "dist", "desktop", "index.html");
const packageMetadata = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
const stableIdentity = packageMetadata.oplReleaseChannel === "stable";
const deepLinkPolicy = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "dist", "desktop", "deep-link-policy.json"), "utf8"));
const deepLinks = createDeepLinkDelivery({ policy: deepLinkPolicy, emit: (payload) => sendDesktopRendererEvent("desktop/deep-link", payload) });
if (stableIdentity) {
  deepLinks.acceptArgv(process.argv);
  app.on("open-url", (event, url) => {
    event.preventDefault();
    deepLinks.acceptUrl(url);
    mainWindow?.show();
    mainWindow?.focus();
  });
  app.on("second-instance", (_event, argv, _directory, additionalData) => {
    deepLinks.acceptSecondInstance(argv, additionalData);
    if (!mainWindow && app.isReady()) createWindow();
    mainWindow?.show();
    mainWindow?.focus();
  });
}
if (app.isPackaged && stableIdentity) {
  app.setName("One Person Lab");
  app.setPath("userData", path.join(app.getPath("appData"), "One Person Lab"));
}
const installerIndex = process.argv.indexOf("--opl-install-preview-handoff");
const installingPreviewHandoff = stableIdentity && installerIndex >= 0;
let importedHandoff;
let terminalPreviewBridge = false;
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
  deepLinks.deactivate();
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
  // Recovery updates must remain reachable even if Framework or Host boot fails.
  desktopUpdater = updater;
  const homeDir = app.getPath("home");
  const windowsRuntime = app.isPackaged && stableIdentity && process.platform === "win32"
    ? createWindowsRuntime({
      userDataPath: app.getPath("userData"), resourcesPath: process.resourcesPath,
      resumeExecutable: process.execPath, env: process.env,
      onProgress: (progress) => sendDesktopRendererEvent("desktop/runtime-setup", progress)
    }) : null;
  if (windowsRuntime) await windowsRuntime.ensureReady();
  const officialProfileAdmission = app.isPackaged && stableIdentity && !windowsRuntime && !updaterQualificationEnabled
    ? captureOfficialProfileAdmission({ homeDir, env: process.env }) : null;
  let bootstrapStatus = "available";
  const runtime = windowsRuntime ? null : await ensureStudioDesktopRuntime({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    homeDir,
    identity: stableIdentity ? "stable" : "preview",
    env: process.env
  }).catch(() => {
    bootstrapStatus = "framework_bootstrap_failed";
    return null;
  });
  const activationEnvironment = resolveDesktopRuntimeEnvironment({
    env: runtime?.env ?? process.env,
    homeDir,
    resourcesPath: process.resourcesPath
  });
  activationEnvironment.OPL_APP_PROCESS_INSTANCE_ID = appProcessInstanceId;
  const managedUpdatesEnabled = bootstrapStatus === "available" && app.isPackaged && !updaterQualificationEnabled
    && process.env.OPL_STUDIO_MANAGED_UPDATES !== "0"
    && process.env.OPL_STUDIO_READ_ONLY !== "1" && process.env.OPL_NATIVE_WORKBENCH_READ_ONLY !== "1";
  let activationStatus = "disabled";
  let activatedCodexPath;
  if (managedUpdatesEnabled && !windowsRuntime) {
    try {
      const activation = await createOplPassthrough({ env: activationEnvironment, cwd: homeDir }).runManagedUpdate("activate");
      activationStatus = activation.runtime_activation?.status ?? "unknown";
      const binary = activation.runtime_activation?.codex?.runtime_binary_path;
      if (typeof binary === "string" && path.isAbsolute(binary) && fs.existsSync(binary)) activatedCodexPath = binary;
    } catch (error) {
      activationStatus = error.code ?? "failed";
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
  hostEnvironment.OPL_APP_VERSION ??= packageMetadata.oplReleaseVersion ?? app.getVersion();
  hostEnvironment.OPL_STUDIO_LOG_ROOT = app.getPath("logs");
  hostEnvironment.OPL_STUDIO_DATA_ROOT = app.getPath("userData");
  // A canonical App launch imports both the legacy desktop store and the
  // isolated Studio Preview store before the Codex Host exposes threads.
  if (app.isPackaged && process.env.OPL_STUDIO_SHELL_MIGRATION !== "0") {
    const sourceRoots = [
      path.join(homeDir, "Library", "Application Support", "One Person Lab"),
      path.join(homeDir, "Library", "Application Support", "opl-studio"),
      path.join(homeDir, "Library", "Application Support", "One Person Lab Preview")
    ];
    hostEnvironment.OPL_SHELL_MIGRATION_SOURCE_DIRS = sourceRoots.join(path.delimiter);
  }
  const hostOptions = {
    workspaceRoot: desktopCodexWorkspaceRoot(),
    env: hostEnvironment,
    candidateActionAllowlist: [
      "workspace_root_set", "codex_install", "settings_check_opl_base_update", "settings_apply_opl_base_update",
      "settings_apply_opl_packages", "agent_package_update", "agent_package_repair"
    ],
    channelBindingFile: path.join(app.getPath("userData"), "channel-transport-bindings.json"),
    platform: {
      accessWorkspacePath: async ({ path: filePath, action }) => {
        if (action === "reveal") {
          shell.showItemInFolder(filePath);
          return;
        }
        const failure = await shell.openPath(filePath);
        if (failure) throw new Error(failure);
      },
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
        frameworkBootstrapStatus: bootstrapStatus,
        frameworkActivationStatus: activationStatus,
        application: { systemInfo: { logDir: app.getPath("logs"), platform: process.platform, arch: process.arch } },
        setLogDirectorySupported: true
      }),
      setLogDirectory: (request) => appLogDirectory.setLogDirectory(request)
    },
    nativeUpdater: updater
  };
  core = windowsRuntime ? await createWindowsGuestHost({
    ...hostOptions, windowsRuntime, resourcesPath: process.resourcesPath,
    userDataPath: app.getPath("userData"), version: hostEnvironment.OPL_APP_VERSION,
    instanceId: appProcessInstanceId
  }) : await createOplHostCore(hostOptions);

  core.on("event", (event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send("opl:event", event);
    }
  });
  if (officialProfileAdmission && bootstrapStatus === "available") {
    const officialOptions = {
      admission: officialProfileAdmission, resourcesPath: process.resourcesPath,
      env: hostEnvironment,
      logEvent: (event) => console.warn("[OPL:official-profile] " + JSON.stringify(event))
    };
    core.applyOfficialProfileWhenReady = (initialize) => startOfficialProfileFirstInstall({
      ...officialOptions, readInitialize: async () => initialize, readinessTimeoutMs: 0
    });
    // The renderer may not have mounted yet when the desktop Host starts. A
    // pre-renderer readInitialize call can wait forever on that UI-owned
    // surface, so use the already authoritative Framework state read to gate
    // the background first-install action.
    void startOfficialProfileFirstInstall({ ...officialOptions, readInitialize: () => core.invoke("readState", { profile: "fast" }) });
  }
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
  if (installingPreviewHandoff) {
    const transactionRoot = process.argv[installerIndex + 1];
    const sourcePid = Number(process.argv[installerIndex + 2]);
    const allowedRoot = path.join(app.getPath("appData"), "opl-studio", "handoff");
    if (!transactionRoot || path.dirname(fs.realpathSync(transactionRoot)) !== fs.realpathSync(allowedRoot)
      || !/^[0-9a-f]{64}$/.test(path.basename(transactionRoot)) || !Number.isSafeInteger(sourcePid) || sourcePid < 1) throw new Error("invalid_preview_install_request");
    const deadline = Date.now() + 120_000;
    while (true) {
      try { process.kill(sourcePid, 0); }
      catch (error) { if (error.code === "ESRCH") break; throw error; }
      if (Date.now() >= deadline) throw new Error("preview_exit_timeout");
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    // Acquiring the preserved userData singleton also excludes a legacy App writer.
    while (!app.requestSingleInstanceLock()) {
      const choice = await dialog.showMessageBox({ type: "info", title: "One Person Lab", message: "请退出正在运行的 One Person Lab，升级会保留当前任务与数据。", detail: "Quit the running One Person Lab app, then continue the upgrade.", buttons: ["继续 / Continue", "稍后 / Later"], cancelId: 1 });
      if (choice.response === 1) { app.exit(0); return; }
    }
    const installed = commitPreparedTarget({ transactionRoot, selfBundle:path.resolve(process.execPath,"../../.."), targetUserDataRoot:app.getPath("userData") });
    app.releaseSingleInstanceLock();
    const launchError = await shell.openPath(installed.appPath);
    if (launchError) throw new Error(`handoff_target_launch_failed: ${launchError}`);
    app.exit(0); return;
  }
  if (app.isPackaged && !app.requestSingleInstanceLock({ deepLinkPayload: extractDeepLinkPayloadFromArgv(process.argv, deepLinkPolicy) })) { app.exit(0); return; }
  if (app.isPackaged && stableIdentity) app.setAsDefaultProtocolClient("opl");
  const previewPlan = !stableIdentity && process.platform === "darwin" ? packagedPreviewPlan(process.resourcesPath, app.isPackaged) : null;
  if (previewPlan) {
    terminalPreviewBridge = true;
    const progress = new BrowserWindow({ width:620,height:300,webPreferences:{ sandbox:true,nodeIntegration:false,contextIsolation:true } });
    await progress.loadFile(path.join(desktopRoot,"migration.html"));
    try {
      await runPreviewHandoff({ app,plan:previewPlan });
      app.exit(0);
    } catch (error) {
      await dialog.showMessageBox(progress,{ type:"error",title:"One Person Lab",message:"自动升级未完成，原应用和数据已保留。重新打开 Preview 可自动重试。",detail:String(error.message),buttons:["关闭 / Close"] });
      app.exit(1);
    }
    return;
  }
  if (stableIdentity) {
    importLegacyChannelBindings({ userDataRoot: app.getPath("userData") });
    importedHandoff = await importPendingHandoff({ app });
  }
  const appLogDirectory = createAppLogDirectoryController({ electronApp: app });
  await appLogDirectory.restore();
  createWindow();
  ipcMain.handle("opl:invoke", async (event, request) => {
    if (quittingApplication) throw new Error("Application is closing");
    if (!trustedRendererUrl(event.senderFrame.url)) {
      throw new Error("Untrusted renderer cannot invoke the OPL host");
    }
    if (request?.method === "readPendingDeepLinks") return deepLinks.takePending();
    const updateOperation = {
      readNativeAppUpdateStatus: "status", checkNativeAppUpdate: "check",
      applyNativeAppUpdate: "apply", restartNativeApp: "restart"
    }[request?.method];
    if (updateOperation && desktopUpdater) return desktopUpdater.perform(updateOperation);
    const retry = request?.method === "retryDesktopHost";
    const activeHost = await desktopHost(appLogDirectory, { retry });
    if (retry) return { status: "ready" };
    const result = await activeHost.core.invoke(request?.method, request?.payload ?? {});
    if (request?.method === "readInitialize") void activeHost.core.applyOfficialProfileWhenReady?.(result);
    return result;
  });
  void desktopHost(appLogDirectory).then(async (activeHost) => {
    if (importedHandoff) {
      // Read real owners after storage import; failure keeps the source and backup.
      const state = await activeHost.core.invoke("readState", { profile:"fast" });
      const threads = await activeHost.core.invoke("listThreads", {});
      if ((state?.readback?.exitCode ?? state?.readback?.status) !== 0
        || !state?.app_state?.app_state?.surface_kind || !Array.isArray(threads?.data)
        || threads?.migration?.complete === false || activeHost.core.codex.capabilities().available !== true) {
        throw new Error("handoff_owner_readback_incomplete");
      }
      atomicJson(path.join(app.getPath("userData"),"handoff",`${importedHandoff.digest}.owner-readback.json`), {
        schema:"opl_shell_handoff_owner_readback.v1", digest:importedHandoff.digest,
        version:app.getVersion(), frameworkRead:true, canonicalThreadDirectoryRead:true,
        sharedStateCopied:false, sourceRetained:true
      });
    }
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
}).catch(error => {
  dialog.showErrorBox("One Person Lab", `应用启动未完成，原有数据已保留。\n${error.message}`);
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  quittingApplication = true;
  if (installingUpdate || terminalPreviewBridge || installingPreviewHandoff) return;
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
