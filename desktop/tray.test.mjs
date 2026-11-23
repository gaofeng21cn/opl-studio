import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  buildDesktopTrayMenu,
  createDesktopTray,
  MAX_RECENT_THREAD_TITLE_LENGTH,
  readProjectedRunningCount,
  shouldCreateDesktopTray,
  truncateMenuTitle
} from "./tray.mjs";

test("macOS ordinary desktop enables the tray while IPC smoke launches stay isolated", () => {
  assert.equal(shouldCreateDesktopTray({ platform: "darwin", ipcConnected: false }), true);
  assert.equal(shouldCreateDesktopTray({ platform: "darwin", ipcConnected: true }), false);
  assert.equal(shouldCreateDesktopTray({ platform: "darwin", ipcConnected: true, force: true }), true);
  assert.equal(shouldCreateDesktopTray({ platform: "win32", ipcConnected: false }), false);
});

test("tray reads the bounded Host work-item projection for a global running count", () => {
  assert.equal(readProjectedRunningCount({
    app_state: {
      app_state: {
        operator: { workbench: { work_item_projection_v2: { summary: { running_count: 4.9 } } } }
      }
    }
  }), 4);
  assert.equal(readProjectedRunningCount({ app_state: { operator: { workbench: {} } } }), null);
});

test("tray menu exposes real window, runtime, recent-thread, update, restart, and quit actions", () => {
  const calls = [];
  const actions = {
    showWindow: () => calls.push("show"),
    hideWindow: () => calls.push("hide"),
    newTask: () => calls.push("new"),
    openRuntime: () => calls.push("runtime"),
    openThread: (id) => calls.push(`thread:${id}`),
    checkForUpdates: () => calls.push("update"),
    showAbout: () => calls.push("about"),
    restart: () => calls.push("restart"),
    quit: () => calls.push("quit")
  };
  const template = buildDesktopTrayMenu({
    locale: "zh",
    runningCount: 2,
    recentThreads: [{ id: "thread-1", name: "研究任务" }],
    actions
  });
  const byLabel = new Map(template.filter((item) => item.label).map((item) => [item.label, item]));
  assert.equal(byLabel.get("运行中任务：2")?.enabled, false);
  assert.equal(byLabel.get("最近任务")?.enabled, false);
  assert.equal(template.find((item) => item.label === "研究任务")?.label, "研究任务");
  byLabel.get("显示 One Person Lab")?.click();
  byLabel.get("运行状态")?.click();
  template.find((item) => item.label === "研究任务")?.click();
  byLabel.get("检查更新")?.click();
  byLabel.get("重新启动")?.click();
  byLabel.get("退出 One Person Lab")?.click();
  assert.deepEqual(calls, ["show", "runtime", "thread:thread-1", "update", "restart", "quit"]);
});

test("recent thread labels stay bounded without changing the thread target", () => {
  const longTitle = `ACTIVE | OPL Studio | ${"更新投影与完整 App 集成 ".repeat(12)}`;
  const opened = [];
  const template = buildDesktopTrayMenu({
    locale: "zh",
    recentThreads: [{ id: "thread-long", title: longTitle }],
    actions: {
      showWindow: () => undefined,
      hideWindow: () => undefined,
      newTask: () => undefined,
      openRuntime: () => undefined,
      openThread: (id) => opened.push(id),
      checkForUpdates: () => undefined,
      showAbout: () => undefined,
      restart: () => undefined,
      quit: () => undefined
    }
  });
  const item = template.find((entry) => entry.label?.endsWith("…"));
  assert.ok(item);
  assert.equal(Array.from(item.label).length, MAX_RECENT_THREAD_TITLE_LENGTH);
  assert.equal(truncateMenuTitle(longTitle), item.label);
  item.click();
  assert.deepEqual(opened, ["thread-long"]);
});

test("tray controller reads recent threads and routes menu actions through existing host and renderer callers", async () => {
  class FakeTray extends EventEmitter {
    constructor(image) {
      super();
      this.image = image;
    }
    setToolTip(value) { this.tooltip = value; }
    setContextMenu(value) { this.menu = value; }
    destroy() { this.destroyed = true; }
  }
  const builtTemplates = [];
  const image = { empty: false, isEmpty() { return this.empty; }, setTemplateImage(value) { this.template = value; } };
  const windowCalls = [];
  const window = {
    isDestroyed: () => false,
    isMinimized: () => false,
    show: () => windowCalls.push("show"),
    hide: () => windowCalls.push("hide"),
    restore: () => windowCalls.push("restore"),
    focus: () => windowCalls.push("focus")
  };
  const rendererEvents = [];
  const controller = await createDesktopTray({
    electron: {
      Tray: FakeTray,
      Menu: { buildFromTemplate: (template) => { builtTemplates.push(template); return { template }; } },
      nativeImage: { createFromPath: () => image },
      dialog: { showMessageBox: async () => ({ response: 0 }) },
      app: { getVersion: () => "0.1.0", dock: { show() { windowCalls.push("dock-show"); }, hide() { windowCalls.push("dock-hide"); } } }
    },
    repositoryRoot: "/workspace",
    resourcesPath: "/resources",
    isPackaged: true,
    invokeHost: async (method, payload) => {
      if (method === "listThreads") {
        assert.deepEqual(payload, { archived: false, limit: 8 });
        return { data: [{ id: "thread-1", name: "Recent", status: "running" }] };
      }
      assert.equal(method, "readState");
      assert.deepEqual(payload, { profile: "fast" });
      return { app_state: { operator: { workbench: { work_item_projection_v2: { summary: { running_count: 3 } } } } } };
    },
    checkForUpdates: async () => ({ supported: true, state: "not_available" }),
    getWindow: () => window,
    sendRendererEvent: (method, params) => rendererEvents.push({ method, params }),
    restart: () => undefined,
    quit: () => undefined,
    platform: "darwin",
    enabled: true
  });

  assert.ok(controller);
  assert.equal(image.template, true);
  assert.equal(controller.tray.tooltip, "One Person Lab");
  const template = builtTemplates.at(-1);
  assert.equal(template.find((item) => item.label === "运行中任务：3")?.enabled, false);
  assert.equal(template.find((item) => item.label === "最近任务")?.enabled, false);
  template.find((item) => item.label === "运行状态")?.click();
  template.find((item) => item.label === "Recent")?.click();
  assert.deepEqual(rendererEvents, [
    { method: "desktop/navigate", params: { view: "runtime" } },
    { method: "desktop/open-thread", params: { threadId: "thread-1" } }
  ]);
  assert.deepEqual(windowCalls, ["dock-show", "show", "focus", "dock-show", "show", "focus"]);
  controller.destroy();
  assert.equal(controller.tray.destroyed, true);
});

test("tray checkForUpdates reports combined plugin updates, catches errors cleanly, and navigates to Software Center updates", async () => {
  class FakeTray extends EventEmitter {
    setToolTip() {}
    setContextMenu(value) { this.menu = value; }
    destroy() {}
  }
  const dialogs = [];
  const events = [];
  let responseChoice = 0;
  let updateResult = {
    schema: "opl_native_app_updater.v1",
    supported: true,
    state: "available",
    targetVersion: "26.11.24",
    pluginUpdatesCount: 2,
    restartRequired: false
  };
  const controller = await createDesktopTray({
    electron: {
      Tray: FakeTray,
      Menu: { buildFromTemplate: (template) => ({ template }) },
      nativeImage: { createFromPath: () => ({ isEmpty: () => false, setTemplateImage() {} }) },
      dialog: {
        showMessageBox: async (_window, options) => {
          dialogs.push(options ?? _window);
          return { response: responseChoice };
        }
      },
      app: { getVersion: () => "26.11.23", dock: { show() {}, hide() {} } }
    },
    repositoryRoot: "/workspace",
    resourcesPath: "/resources",
    isPackaged: true,
    invokeHost: async (method) => method === "listThreads" ? { data: [] } : { app_state: {} },
    checkForUpdates: async () => updateResult,
    getWindow: () => ({ isDestroyed: () => false, isMinimized: () => false, show() {}, focus() {} }),
    sendRendererEvent: (method, params) => events.push({ method, params }),
    restart: () => undefined,
    quit: () => undefined,
    platform: "darwin",
    enabled: true
  });
  const checkItem = controller.tray.menu.template.find((item) => item.label === "检查更新");
  const aboutItem = controller.tray.menu.template.find((item) => item.label === "关于 One Person Lab");
  await aboutItem.click();
  assert.equal(dialogs.at(-1).detail, "版本 26.11.23");
  await checkItem.click();
  assert.match(dialogs.at(-1).message, /26\.11\.24.*软件中心 > 更新/);
  assert.deepEqual(events.at(-1), { method: "desktop/deep-link", params: { action: "navigate", params: { route: "/apps?section=updates" } } });

  updateResult = Promise.reject(new Error("offline"));
  responseChoice = 1;
  await checkItem.click();
  assert.match(dialogs.at(-1).message, /检查更新失败：offline/);
  controller.destroy();
});
