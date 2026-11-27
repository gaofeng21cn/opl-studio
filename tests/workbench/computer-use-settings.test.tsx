import React, { act } from "react";
let createRoot: typeof import("react-dom/client").createRoot;
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { ComputerUseActionRequest, ComputerUseState } from "@gaofeng21cn/opl-host-contracts";
import { ComputerUseSettingsSection } from "../../plugins/core/opl-studio-client/src/client/composition/computerUseSettingsSlot";

let browser: Window;
let root: ReturnType<typeof createRoot>;
const keys = ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Node", "Event", "IS_REACT_ACT_ENVIRONMENT"];
let originals: Map<string, PropertyDescriptor | undefined>;

beforeEach(async () => {
  browser = new Window({ url: "http://localhost/" });
  originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : key === "window" ? browser : (browser as any)[key]
    });
  }
  ({ createRoot } = await import("react-dom/client"));
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  browser.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test("ComputerUseSettingsSection defaults to elicit, warns on unattended allow, shows restartPending, and dispatches TCC & app actions", async () => {
  const initialState: ComputerUseState = {
    supported: true,
    available: true,
    enabled: true,
    active: true,
    consentMode: "elicit",
    activeConsentMode: "elicit",
    restartPending: false,
    platform: "darwin",
    permissions: {
      status: "permission_required",
      accessibility: false,
      screenRecording: true,
      helperAppPath: "/Applications/One Person Lab.app/Contents/Resources/DSH Computer Use.app",
      helperBundle: "test-bundle",
      error: null
    },
    allowedApps: [{ id: "a".repeat(64), name: "Notes", executablePath: "/System/Applications/Notes.app" }],
    blockedApps: [{ id: "b".repeat(64), name: "Terminal" }],
    unavailableReason: null
  };

  let current = structuredClone(initialState);
  const updates: Array<{ enabled?: boolean; consentMode?: "elicit" | "allow" }> = [];
  const actions: ComputerUseActionRequest[] = [];

  const bridge = {
    async readComputerUse() {
      return structuredClone(current);
    },
    async setComputerUse(patch: { enabled?: boolean; consentMode?: "elicit" | "allow" }) {
      updates.push(patch);
      current = {
        ...current,
        ...patch,
        restartPending: true
      };
      return structuredClone(current);
    },
    async performComputerUseAction(request: ComputerUseActionRequest) {
      actions.push(request);
      if (request.action === "request_permission") {
        current = {
          ...current,
          permissions: { ...current.permissions, accessibility: true, status: "ready" }
        };
      }
      if (request.action === "revoke_app") {
        current = { ...current, allowedApps: [] };
      }
      return structuredClone(current);
    }
  };

  await act(async () => {
    root.render(<ComputerUseSettingsSection zh={true} locale="zh" bridge={bridge} />);
  });
  await act(async () => {});

  const select = document.querySelector('[data-testid="opl-computer-use-consent-select"]') as HTMLSelectElement | null;
  expect(select).not.toBeNull();
  expect(select?.value).toBe("elicit");
  expect(document.querySelector('[data-testid="opl-cua-unattended-warning"]')).toBeNull();
  expect(document.querySelector('[data-testid="opl-cua-restart-pending"]')).toBeNull();
  expect(document.body.textContent).toContain("Notes");
  expect(document.body.textContent).toContain("Terminal");

  await act(async () => {
    if (!select) throw new Error("missing consent select");
    const descriptor = Object.getOwnPropertyDescriptor(browser.HTMLSelectElement.prototype, "value");
    descriptor?.set?.call(select, "allow");
    select.dispatchEvent(new browser.Event("change", { bubbles: true }));
  });
  await act(async () => {});

  expect(updates).toEqual([{ consentMode: "allow" }]);
  expect(document.querySelector('[data-testid="opl-cua-unattended-warning"]')).not.toBeNull();
  expect(document.querySelector('[data-testid="opl-cua-restart-pending"]')).not.toBeNull();

  const requestBtn = [...document.querySelectorAll("button")].find((btn) => btn.textContent?.includes("请求授权"));
  expect(requestBtn).toBeDefined();
  await act(async () => {
    requestBtn?.click();
  });
  await act(async () => {});

  const revokeBtn = [...document.querySelectorAll("button")].find((btn) => btn.textContent?.includes("撤销"));
  expect(revokeBtn).toBeDefined();
  await act(async () => {
    revokeBtn?.click();
  });
  await act(async () => {});

  expect(actions.map((item) => item.action)).toEqual(["request_permission", "revoke_app"]);
  expect(actions[0]?.permission).toBe("accessibility");
  expect(actions[1]?.appId).toBe("a".repeat(64));
  expect(document.body.textContent).not.toContain("Notes");
});

test("ComputerUseSettingsSection surfaces runtime init errors and active-turn disable details", async () => {
  const initFailedState: ComputerUseState = {
    supported: true,
    available: true,
    enabled: true,
    active: false,
    consentMode: "elicit",
    activeConsentMode: null,
    restartPending: false,
    platform: "darwin",
    permissions: {
      status: "ready",
      accessibility: true,
      screenRecording: true,
      helperAppPath: "/Applications/One Person Lab.app/Contents/Resources/DSH Computer Use.app",
      helperBundle: "test-bundle",
      error: null
    },
    allowedApps: [],
    blockedApps: [],
    unavailableReason: "EEXIST"
  };

  let state = initFailedState;
  const bridge = {
    async readComputerUse() {
      return structuredClone(state);
    },
    async setComputerUse() {
      return structuredClone(state);
    },
    async performComputerUseAction() {
      return structuredClone(state);
    }
  };

  await act(async () => {
    root.render(<ComputerUseSettingsSection zh={true} locale="zh" bridge={bridge} />);
  });
  await act(async () => {});

  const runtimeError = document.querySelector('[data-testid="opl-cua-runtime-error"]');
  expect(runtimeError).not.toBeNull();
  expect(runtimeError?.textContent).toContain("EEXIST");
  expect(document.body.textContent).toContain("初始化异常 · 不可用");

  state = {
    ...initFailedState,
    enabled: false,
    active: true,
    activeConsentMode: "allow",
    restartPending: true,
    unavailableReason: null
  };
  await act(async () => {
    root.render(<ComputerUseSettingsSection zh={true} locale="zh" bridge={{ ...bridge }} />);
  });
  await act(async () => {});

  const pendingBanner = document.querySelector('[data-testid="opl-cua-restart-pending"]');
  expect(pendingBanner).not.toBeNull();
  expect(pendingBanner?.textContent).toContain("allow");
  expect(pendingBanner?.textContent).toContain("自动重载");
});

test("ComputerUseSettingsSection refreshes live state when host/computer-use-changed arrives", async () => {
  let state: ComputerUseState = {
    supported: true,
    available: true,
    enabled: false,
    active: true,
    consentMode: "elicit",
    activeConsentMode: "allow",
    restartPending: true,
    platform: "darwin",
    permissions: {
      status: "ready",
      accessibility: true,
      screenRecording: true,
      helperAppPath: "/Applications/One Person Lab.app/Contents/Resources/DSH Computer Use.app",
      helperBundle: "test-bundle",
      error: null
    },
    allowedApps: [],
    blockedApps: [],
    unavailableReason: null
  };
  let listener: ((event: { method?: string; params?: Record<string, unknown> }) => void) | null = null;
  let unsubscribed = false;

  const bridge = {
    async readComputerUse() {
      return structuredClone(state);
    },
    async setComputerUse() {
      return structuredClone(state);
    },
    async performComputerUseAction() {
      return structuredClone(state);
    },
    subscribeEvents(onEvent: (event: { method?: string; params?: Record<string, unknown> }) => void) {
      listener = onEvent;
      return () => {
        unsubscribed = true;
      };
    }
  };

  await act(async () => {
    root.render(<ComputerUseSettingsSection zh={true} locale="zh" bridge={bridge} />);
  });
  await act(async () => {});

  expect(document.querySelector('[data-testid="opl-cua-restart-pending"]')).not.toBeNull();

  state = {
    ...state,
    active: false,
    activeConsentMode: null,
    restartPending: false
  };
  await act(async () => {
    listener?.({ method: "host/computer-use-changed", params: { active: false, restartPending: false } });
  });
  await act(async () => {});

  expect(document.querySelector('[data-testid="opl-cua-restart-pending"]')).toBeNull();
  await act(async () => root.unmount());
  expect(unsubscribed).toBe(true);
});

test("ComputerUseSettingsSection keeps a saved change when the event-triggered refresh fails", async () => {
  const initialState: ComputerUseState = {
    supported: true,
    available: true,
    enabled: true,
    active: true,
    consentMode: "allow",
    activeConsentMode: "allow",
    restartPending: false,
    platform: "darwin",
    permissions: {
      status: "ready",
      accessibility: true,
      screenRecording: true,
      helperAppPath: null,
      helperBundle: null,
      error: null
    },
    allowedApps: [],
    blockedApps: [],
    unavailableReason: null
  };
  let readCount = 0;
  let onEvent: ((event: { method: string }) => void) | undefined;
  const bridge = {
    async readComputerUse() {
      readCount += 1;
      if (readCount > 1) throw new Error("Connection lost during refresh");
      return initialState;
    },
    async setComputerUse(patch: { enabled?: boolean }) {
      expect(patch.enabled).toBe(false);
      onEvent?.({ method: "host/computer-use-changed" });
      return {
        ...initialState,
        enabled: false,
        active: false,
        activeConsentMode: null,
        restartPending: false
      };
    },
    subscribeEvents(listener: (event: { method: string }) => void) {
      onEvent = listener;
      return () => { onEvent = undefined; };
    }
  };
  await act(async () => {
    root.render(<ComputerUseSettingsSection zh={true} locale="zh" bridge={bridge} />);
  });
  const toggle = document.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  await act(async () => toggle.click());
  expect(readCount).toBe(2);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
});
