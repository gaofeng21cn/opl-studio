import React, { act } from "react";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { customModelAccessFixture } from "../../scripts/model-policy-fixture.ts";
import type { StudioContextValue } from "../../plugins/core/opl-studio-client/src/client/composition/slotHost/studioContext";

Object.assign(globalThis, {
  __OPL_CODEX_MODEL_POLICY__: {
    source: "test App policy",
    defaultModel: "test-model",
    defaultReasoningEffort: "high",
    visibleModels: [{ id: "test-model" }],
    reasoningEfforts: ["high"],
    autoLabel: { zh: "自动（推荐）", en: "Auto (recommended)" },
    knownModelReasoningEffortOverrides: {},
    acceptUnknownCatalogDefault: true,
    customModelAccess: customModelAccessFixture,
    useHighestSupportedReasoningForUnknown: true
  }
});

const { StudioContext } = await import("../../plugins/core/opl-studio-client/src/client/composition/slotHost/studioContext");
const { SettingsTriggerSlot, settingsTriggerPresentation } = await import("../../plugins/core/opl-studio-client/src/client/composition/slotHost/shellSettingsSlots");

let createRoot: typeof import("react-dom/client").createRoot;
let browser: Window;
let root: ReturnType<typeof createRoot>;
let container: HTMLElement;

const keys = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "IS_REACT_ACT_ENVIRONMENT"
] as const;
let originals: Map<string, PropertyDescriptor | undefined>;

beforeEach(async () => {
  browser = new Window({ url: "http://127.0.0.1/" });
  originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value = key === "IS_REACT_ACT_ENVIRONMENT" ? true : key === "window" ? browser : (browser as any)[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  ({ createRoot } = await import("react-dom/client"));
  container = document.createElement("div");
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

test("settingsTriggerPresentation prioritizes Gateway displayName and builds tooltip", () => {
  expect(settingsTriggerPresentation("zh", { displayName: "高峰", email: "gf@fenggaolab.org", status: "connected" })).toEqual({
    connected: true,
    label: "高峰",
    tooltip: "高峰 (gf@fenggaolab.org)"
  });
  expect(settingsTriggerPresentation("zh", { displayName: "高峰", status: "connected" })).toEqual({
    connected: true,
    label: "高峰",
    tooltip: "高峰"
  });
  expect(settingsTriggerPresentation("zh", { displayName: "gf@fenggaolab.org", email: "gf@fenggaolab.org", status: "connected" })).toEqual({
    connected: true,
    label: "gf@fenggaolab.org",
    tooltip: "gf@fenggaolab.org"
  });
  expect(settingsTriggerPresentation("zh", undefined)).toEqual({
    connected: false,
    label: "设置",
    tooltip: "设置"
  });
  expect(settingsTriggerPresentation("en", undefined)).toEqual({
    connected: false,
    label: "Settings",
    tooltip: "Settings"
  });
});

test("SettingsTriggerSlot renders Gateway displayName when connected and falls back cleanly", async () => {
  const renderSlot = async (studio: Partial<StudioContextValue>, wide: boolean) => {
    await act(async () => {
      root.render(
        <StudioContext.Provider value={{ locale: "zh", ...studio } as StudioContextValue}>
          <SettingsTriggerSlot wide={wide} />
        </StudioContext.Provider>
      );
    });
  };

  await renderSlot({ gatewayAccount: { displayName: "高峰", email: "gf@fenggaolab.org", status: "connected" } }, true);
  expect(container.textContent).toBe("高峰");
  expect(container.querySelector("span")?.className).toBe("");
  expect(container.querySelector("svg")?.getAttribute("class")).toContain("lucide-user-round");

  await renderSlot({ gatewayAccount: { displayName: "高峰", email: "gf@fenggaolab.org", status: "connected" } }, false);
  expect(container.querySelector("span")?.className).toBe("visually-hidden");

  await renderSlot({ gatewayAccount: undefined, locale: "zh" }, true);
  expect(container.textContent).toBe("设置");
  expect(container.querySelector("svg")?.getAttribute("class")).toContain("lucide-settings");

  await renderSlot({ gatewayAccount: undefined, locale: "en" }, true);
  expect(container.textContent).toBe("Settings");
});
