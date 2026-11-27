/**
 * Clean restart helper for packaged Desktop installs. When an Electron installer
 * update is already downloaded it delegates to quitAndInstall; otherwise (DSH
 * plugin updates, Framework pending generation, Billion Context toggles) it
 * closes the active Host cleanly under its idle lease and relaunches the app.
 */
export async function performDesktopRestart({
  desktopUpdater,
  hostCore,
  prepareShutdown,
  relaunchApp,
  quitApp
}) {
  if (desktopUpdater?.snapshot().state === "downloaded") {
    return desktopUpdater.perform("restart");
  }
  const base = {
    ...(desktopUpdater?.snapshot("restart") ?? {
      schema: "opl_native_app_updater.v1",
      owner: "one-person-lab-app_desktop_host",
      host: "electron"
    }),
    operation: "restart",
    supported: true,
    restartRequired: true
  };
  try {
    if (hostCore?.transport?.runWhenIdle) {
      const lease = await hostCore.transport.runWhenIdle(prepareShutdown);
      if (lease.status === "deferred") {
        return {
          ...base,
          accepted: false,
          reasonCode: lease.reasonCode ?? "app_server_busy"
        };
      }
    } else {
      await prepareShutdown();
    }
  } catch (error) {
    return {
      ...base,
      state: "error",
      accepted: false,
      errorCode: "desktop_restart_preparation_failed",
      message: error instanceof Error ? error.message : String(error)
    };
  }
  setImmediate(() => {
    relaunchApp();
    quitApp();
  });
  return {
    ...base,
    state: "restart_scheduled",
    accepted: true
  };
}

export function scheduleRendererReload(target, maintenance) {
  if (!target || target.isDestroyed()) return { accepted: false, mode: "renderer_reload" };
  const acknowledge = maintenance?.captureRendererUpdateAcknowledgement?.();
  setImmediate(() => {
    if (target.isDestroyed()) return;
    const cleanup = () => {
      target.off("did-finish-load", onLoaded);
      target.off("did-fail-load", onFailed);
      target.off("destroyed", cleanup);
    };
    const onLoaded = () => { cleanup(); acknowledge?.(); };
    const onFailed = (_event, _code, _description, _url, isMainFrame) => { if (isMainFrame) cleanup(); };
    if (acknowledge) {
      target.once("did-finish-load", onLoaded);
      target.on("did-fail-load", onFailed);
      target.once("destroyed", cleanup);
    }
    if (typeof target.reloadIgnoringCache === "function") target.reloadIgnoringCache();
    else target.reload();
  });
  return { accepted: true, mode: "renderer_reload" };
}
