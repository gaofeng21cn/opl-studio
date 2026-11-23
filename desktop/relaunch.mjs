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
