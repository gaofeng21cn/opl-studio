import path from "node:path";

export function shouldCreateDesktopTray({
  platform = process.platform,
  ipcConnected = typeof process.send === "function",
  force = process.env.OPL_DESKTOP_TRAY_QUALIFICATION === "1"
} = {}) {
  return platform === "darwin" && (!ipcConnected || force);
}

function threadLabel(thread, index) {
  for (const candidate of [thread?.name, thread?.title, thread?.preview]) {
    if (typeof candidate === "string" && candidate.trim()) return truncateMenuTitle(candidate);
  }
  return `Task ${index + 1}`;
}

export const MAX_RECENT_THREAD_TITLE_LENGTH = 48;

export function truncateMenuTitle(value, maxLength = MAX_RECENT_THREAD_TITLE_LENGTH) {
  const title = typeof value === "string" ? value.trim() : "";
  const characters = Array.from(title);
  if (characters.length <= maxLength) return title;
  if (maxLength <= 1) return "…".slice(0, maxLength);
  return `${characters.slice(0, maxLength - 1).join("")}…`;
}

function threadId(thread) {
  for (const candidate of [thread?.id, thread?.threadId, thread?.thread_id]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function runningThread(thread) {
  const value = typeof thread?.status === "string"
    ? thread.status
    : typeof thread?.status?.type === "string"
      ? thread.status.type
      : "";
  return /running|active|in_progress/i.test(value);
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function readProjectedRunningCount(value) {
  let cursor = objectRecord(value);
  for (let depth = 0; cursor && depth < 3; depth += 1) {
    const projection = objectRecord(objectRecord(objectRecord(cursor.operator)?.workbench)?.work_item_projection_v2);
    const count = projection?.summary && Number(projection.summary.running_count);
    if (Number.isFinite(count) && count >= 0) return Math.trunc(count);
    cursor = objectRecord(cursor.app_state);
  }
  return null;
}

export function buildDesktopTrayMenu({
  locale = "zh",
  recentThreads = [],
  runningCount = 0,
  actions
}) {
  const zh = locale === "zh";
  const recentItems = recentThreads.slice(0, 8).flatMap((thread, index) => {
    const id = threadId(thread);
    return id ? [{ label: threadLabel(thread, index), click: () => actions.openThread(id) }] : [];
  });
  const menu = [
    { label: zh ? "显示 One Person Lab" : "Show One Person Lab", click: actions.showWindow },
    { label: zh ? "隐藏到状态栏" : "Hide to menu bar", click: actions.hideWindow },
    { type: "separator" },
    { label: zh ? "新建任务" : "New task", accelerator: "CommandOrControl+N", click: actions.newTask },
    { label: zh ? "运行状态" : "Run status", click: actions.openRuntime }
  ];
  if (recentItems.length) {
    menu.push({ type: "separator" });
    menu.push({ label: zh ? "最近任务" : "Recent tasks", enabled: false });
    menu.push(...recentItems);
  }
  menu.push(
    { type: "separator" },
    { label: zh ? `运行中任务：${runningCount}` : `Running tasks: ${runningCount}`, enabled: false },
    { label: zh ? "检查更新" : "Check for updates", click: actions.checkForUpdates },
    { label: zh ? "关于 One Person Lab" : "About One Person Lab", click: actions.showAbout },
    { label: zh ? "重新启动" : "Restart", click: actions.restart },
    { type: "separator" },
    { label: zh ? "退出 One Person Lab" : "Quit One Person Lab", click: actions.quit }
  );
  return menu;
}

export function updateMessage(result, locale) {
  const zh = locale === "zh";
  const pluginUpdates = Number(result?.pluginUpdatesCount ?? 0);
  const softwareUpdates = Number(result?.softwareUpdatesCount ?? 0);
  const hasComponentUpdates = pluginUpdates > 0 || softwareUpdates > 0;
  if (result?.restartRequired) {
    return zh
      ? "更新或扩展组件已在后台准备就绪，重启 One Person Lab 即可生效。"
      : "Updates or extension components are ready. Restart One Person Lab to apply them.";
  }
  const desktopVersion = result?.targetVersion ?? result?.availableVersion ?? result?.latestVersion;
  if (result?.supported && (result.state === "available" || result.state === "downloaded")) {
    return zh
      ? `发现新版本${desktopVersion ? ` ${desktopVersion}` : ""}${hasComponentUpdates ? `（另有 ${pluginUpdates + softwareUpdates} 项软件与扩展更新）` : ""}，可在“软件中心 > 更新”中安装。`
      : `An update${desktopVersion ? ` (${desktopVersion})` : ""} is available in Software Center > Updates.`;
  }
  if (hasComponentUpdates) {
    return zh
      ? `发现 ${pluginUpdates + softwareUpdates} 项插件或软件更新，可在“软件中心 > 更新”中一键更新。`
      : `${pluginUpdates + softwareUpdates} plugin or software update(s) are available in Software Center > Updates.`;
  }
  if (/error|failed/.test(String(result?.state))) {
    const detail = result?.message ?? result?.errorMessage ?? result?.errorCode ?? result?.reasonCode ?? result?.state;
    return zh ? `检查更新失败：${detail}` : `Update check failed: ${detail}`;
  }
  if (result?.pluginCheckOk && result.state === "unsupported") {
    return zh ? "当前扩展组件与已安装软件均为最新版本。" : "Extensions and installed software are up to date.";
  }
  if (!result?.supported) {
    return zh
      ? "当前安装方式不支持应用包在线更新；扩展插件与软件仍会在“软件中心 > 更新”自动检查与更新。"
      : "App shell online updates are not enabled for this installation; plugins and software still update in Software Center > Updates.";
  }
  return zh ? "当前应用、扩展组件与已安装软件均为最新版本。" : "One Person Lab, extensions, and installed software are up to date.";
}

export async function createDesktopTray({
  electron,
  repositoryRoot,
  resourcesPath = process.resourcesPath,
  isPackaged = false,
  invokeHost,
  checkForUpdates,
  getWindow,
  sendRendererEvent,
  restart,
  quit,
  locale = "zh",
  platform = process.platform,
  enabled = shouldCreateDesktopTray()
}) {
  if (!enabled) return null;
  const { Tray, Menu, nativeImage, dialog, app } = electron;
  const iconPath = isPackaged
    ? path.join(resourcesPath, "branding", "trayTemplate.png")
    : path.join(repositoryRoot, "resources", "opl-branding", "trayTemplate.png");
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty?.()) throw new Error(`OPL tray icon is unavailable: ${iconPath}`);
  image.setTemplateImage?.(true);
  const tray = new Tray(image);
  tray.setToolTip("One Person Lab");
  let destroyed = false;

  const showWindow = () => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    if (platform === "darwin") app.dock?.show?.();
    if (window.isMinimized?.()) window.restore?.();
    window.show();
    window.focus();
  };
  const hideWindow = () => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    window.hide();
    if (platform === "darwin") app.dock?.hide?.();
  };
  const navigate = (view) => {
    showWindow();
    sendRendererEvent("desktop/navigate", { view });
  };
  const showDialog = (options) => {
    const window = getWindow();
    return window && !window.isDestroyed()
      ? dialog.showMessageBox(window, options)
      : dialog.showMessageBox(options);
  };
  const actions = {
    showWindow,
    hideWindow,
    newTask: () => {
      showWindow();
      sendRendererEvent("desktop/new-task", {});
    },
    openRuntime: () => navigate("runtime"),
    openThread: (id) => {
      showWindow();
      sendRendererEvent("desktop/open-thread", { threadId: id });
    },
    checkForUpdates: async () => {
      let result;
      try {
        result = await checkForUpdates();
      } catch (error) {
        result = { supported: false, state: "error", message: error instanceof Error ? error.message : String(error) };
      }
      if (result?.schema === "opl_native_app_updater.v1") {
        sendRendererEvent("desktop/native-app-update", result);
      }
      const hasUpdates = Boolean(
        result?.restartRequired
        || (result?.supported && (result?.state === "available" || result?.state === "downloaded"))
        || Number(result?.pluginUpdatesCount ?? 0) > 0
        || Number(result?.softwareUpdatesCount ?? 0) > 0
      );
      const isError = /error|failed/.test(String(result?.state));
      const choice = await showDialog({
        type: hasUpdates ? "info" : isError ? "error" : "none",
        title: locale === "zh" ? "One Person Lab 更新" : "One Person Lab update",
        message: updateMessage(result, locale),
        ...(hasUpdates ? {
          buttons: locale === "zh" ? ["打开软件中心更新", "稍后"] : ["Open Software Center", "Later"],
          defaultId: 0,
          cancelId: 1
        } : {})
      });
      if (hasUpdates && choice?.response === 0) {
        showWindow();
        sendRendererEvent("desktop/deep-link", { action: "navigate", params: { route: "/apps?section=updates" } });
      }
    },
    showAbout: () => showDialog({
      type: "info",
      title: locale === "zh" ? "关于 One Person Lab" : "About One Person Lab",
      message: "One Person Lab",
      detail: `${locale === "zh" ? "版本" : "Version"} ${app.getVersion()}`
    }),
    restart,
    quit
  };

  const refresh = async () => {
    const [threadsResult, stateResult] = await Promise.allSettled([
      invokeHost("listThreads", { archived: false, limit: 8 }),
      invokeHost("readState", { profile: "fast" })
    ]);
    const recentThreads = threadsResult.status === "fulfilled" && Array.isArray(threadsResult.value?.data)
      ? threadsResult.value.data
      : [];
    const projectedRunningCount = stateResult.status === "fulfilled"
      ? readProjectedRunningCount(stateResult.value)
      : null;
    const menu = Menu.buildFromTemplate(buildDesktopTrayMenu({
      locale,
      recentThreads,
      runningCount: projectedRunningCount ?? recentThreads.filter(runningThread).length,
      actions
    }));
    if (!destroyed) tray.setContextMenu(menu);
    return menu;
  };

  await refresh();
  tray.on("click", showWindow);
  tray.on("right-click", () => { void refresh(); });
  return {
    tray,
    refresh,
    showWindow,
    hideWindow,
    destroy() {
      destroyed = true;
      tray.destroy();
    }
  };
}
