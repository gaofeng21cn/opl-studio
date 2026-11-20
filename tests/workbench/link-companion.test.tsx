import React, { act } from "react";
let createRoot: typeof import("react-dom/client").createRoot;
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { LinkCompanionSection } from "../../plugins/opl-studio-client/src/client/workbench/settings/LinkCompanionSection";

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
