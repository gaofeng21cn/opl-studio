import React, { act } from "react";
let createRoot: typeof import("react-dom/client").createRoot;
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { LinkCompanionSection } from "../../plugins/core/opl-studio-client/src/client/workbench/settings/LinkCompanionSection";
import type { LinkDeviceReadback, LinkInternetStatus } from "../../packages/host-contracts/src/platform-events";

let browser: Window;
let root: ReturnType<typeof createRoot>;
let originalWindow: PropertyDescriptor | undefined;
let originalDocument: PropertyDescriptor | undefined;
let originalActEnvironment: PropertyDescriptor | undefined;

beforeEach(async () => {
  browser = new Window({ url: "http://localhost/" });
  originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  originalActEnvironment = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: browser });
  Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: browser.document });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, writable: true, value: true });
  ({ createRoot } = await import("react-dom/client"));
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  browser.close();
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
  if (originalActEnvironment) Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", originalActEnvironment);
  else Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
});

test("automatically recovers an interrupted Link connection without requiring Reconnect", async () => {
  let reconnects = 0;
  const readback = {
    schema: "opl_link_studio_wire.v2" as const,
    host: { id: "host-1", name: "Test Mac" },
    devices: [],
    internet: { status: "error" as const, reasonCode: "carrier_closed" }
  };
  const bridge = {
    readDevices: async () => readback,
    enableInternet: async () => ({ status: "ready" as const }),
    disableInternet: async () => ({ status: "disabled" as const, enabled: false }),
    reconnectInternet: async () => { reconnects += 1; return { status: "ready" as const }; },
    createPairing: async () => { throw new Error("not used"); },
    revokeDevice: async () => ({ id: "", revoked: true })
  };
  (browser as any).oplStudio = { linkCompanion: bridge };
  await act(async () => root.render(<LinkCompanionSection locale="zh" />));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(reconnects).toBe(1);
  expect(document.body.textContent).toContain("手机访问已就绪");
  expect(document.body.textContent).not.toContain("连接需要处理");
});

function button(label: string) {
  const element = [...document.querySelectorAll("button")].find(candidate => candidate.textContent === label);
  if (!element) throw new Error(`Missing button: ${label}`);
  return element;
}

test("shows replacement and allows manual reconnect without competing for the Host identity", async () => {
  const internet: LinkInternetStatus = { status: "error", enabled: true, reasonCode: "CONNECTION_REPLACED" };
  let reconnects = 0;
  (browser as any).oplStudio = { linkCompanion: {
    readDevices: async () => ({ schema: "opl_link_studio_wire.v2", devices: [], internet }),
    reconnectInternet: async () => { reconnects++; return { status: "ready", enabled: true }; }
  } };
  await act(async () => root.render(<LinkCompanionSection locale="zh" />));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(document.body.textContent).toContain("电脑连接已被替换");
  expect(reconnects).toBe(0);
  await act(async () => button("立即重连").click());
  expect(reconnects).toBe(1);
  expect(document.body.textContent).toContain("手机访问已就绪");
});

test("allows explicit opt-out and clears the backup QR code", async () => {
  let internet: LinkInternetStatus = { status: "ready", enabled: true };
  const bridge = {
    readDevices: async () => ({ schema: "opl_link_studio_wire.v2", devices: [], internet }),
    enableInternet: async () => internet = { status: "ready", enabled: true },
    disableInternet: async () => internet = { status: "disabled", enabled: false },
    reconnectInternet: async () => internet,
    createPairing: async () => ({
      schema: "opl_link_studio_wire.v2",
      code: "test-pairing",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      pairingURL: "opllink://pair?code=test-pairing"
    })
  };
  (browser as any).oplStudio = { linkCompanion: bridge };
  await act(async () => root.render(<LinkCompanionSection locale="zh" />));
  expect(document.body.textContent).toContain("登录同一个 OPL 账号");
  await act(async () => button("生成连接码").click());
  expect(document.querySelector(".opl-link-pairing")).not.toBeNull();
  await act(async () => button("关闭手机访问").click());
  expect(internet.enabled).toBe(false);
  expect(document.body.textContent).toContain("手机访问已关闭");
  expect(document.querySelector(".opl-link-pairing")).toBeNull();
  await act(async () => button("开启手机访问").click());
  expect(internet.enabled).toBe(true);
  expect(document.body.textContent).toContain("手机访问已就绪");
});

test("turns off phone access through the action channel on an older desktop preload", async () => {
  let internet: LinkInternetStatus = { status: "ready", enabled: true };
  const requests: unknown[] = [];
  (browser as any).oplStudio = {
    linkCompanion: { readDevices: async () => ({ schema: "opl_link_studio_wire.v2", devices: [], internet }) },
    executeAction: async (request: unknown) => {
      requests.push(request);
      internet = { status: "disabled", enabled: false };
      return { status: "executed" };
    }
  };
  await act(async () => root.render(<LinkCompanionSection locale="zh" />));
  await act(async () => button("关闭手机访问").click());
  expect(requests).toEqual([{ actionId: "link_disable_internet", mode: "execute", dryRun: false, payload: { confirmed: true } }]);
  expect(document.body.textContent).toContain("手机访问已关闭");
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

test("keeps explicit opt-out after an earlier recovery and status read complete", async () => {
  const active: LinkDeviceReadback = {
    schema: "opl_link_studio_wire.v2", devices: [],
    internet: { status: "error", enabled: true }
  };
  const disabled: LinkInternetStatus = { status: "disabled", enabled: false };
  const staleRead = Promise.withResolvers<LinkDeviceReadback>();
  const recovery = Promise.withResolvers<LinkInternetStatus>();
  const reconnectStarted = Promise.withResolvers<void>();
  let reads = 0;
  let reconnects = 0;
  const bridge = {
    readDevices: async () => ++reads === 1 ? active : staleRead.promise,
    disableInternet: async () => disabled,
    reconnectInternet: () => {
      reconnects++;
      reconnectStarted.resolve();
      return recovery.promise;
    }
  };
  (browser as any).oplStudio = { linkCompanion: bridge };
  await act(async () => root.render(<LinkCompanionSection locale="zh" />));
  await act(async () => reconnectStarted.promise);
  await act(async () => { browser.document.dispatchEvent(new browser.Event("visibilitychange")); });
  expect(reads).toBe(2);
  await act(async () => button("关闭手机访问").click());
  await act(async () => {
    staleRead.resolve(active);
    recovery.resolve({ status: "ready", enabled: true });
  });
  expect(reconnects).toBe(1);
  expect(document.body.textContent).toContain("手机访问已关闭");
  expect(button("开启手机访问").disabled).toBe(false);
});
