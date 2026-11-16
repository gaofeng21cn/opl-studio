import { expect, test } from "bun:test";

Object.assign(globalThis, {
  __OPL_CODEX_MODEL_POLICY__: {
    source: "settings-live-catalog-test",
    defaultModel: "test-model",
    defaultReasoningEffort: "high",
    visibleModels: [{ id: "test-model", label_zh: "测试模型", label_en: "Test model" }],
    reasoningEfforts: ["low", "high"],
    autoLabel: { zh: "自动", en: "Auto" },
    knownModelReasoningEffortOverrides: {},
    acceptUnknownCatalogDefault: false,
    useHighestSupportedReasoningForUnknown: true
  }
});

const { readSettings, settingsDefaults, writeSettings } = await import("../../src/workbench/settingsModel.ts");
const { ModelsSettingsPage } = await import("../../src/workbench/settings/pages/ModelsSettingsPage.tsx");
const { OverviewSettingsPage } = await import("../../src/workbench/settings/pages/OverviewSettingsPage.tsx");
const { navigationCopy } = await import("../../src/workbench/settings/navigation.tsx");

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values
  };
}

test("fixed live-catalog selections persist as trimmed model ids", () => {
  // Given empty Settings storage.
  const storage = memoryStorage();
  // When writing an explicit catalog-only selection with surrounding whitespace.
  writeSettings({ modelAccess: "  custom-local  " }, storage);
  // Then the exact visible model id survives storage and readback.
  expect(readSettings(storage).modelAccess).toBe("custom-local");
  expect(JSON.parse(storage.values.get("opl.studio.settings.v1") ?? "{}").modelAccess).toBe("custom-local");
});

test("model Settings pages use live-catalog display labels", async () => {
  // Given an Auto resolution to a visible catalog-only model.
  const { createElement, Fragment } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const { Window } = await import("happy-dom");
  const browser = new Window({ url: "http://localhost/" });
  const keys = ["window", "document", "HTMLElement", "Node"] as const;
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  keys.forEach(key => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "window" ? browser : browser[key] }));
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Element);
  const modelOptions = [{
    id: "custom-local",
    label_zh: "本地自定义",
    label_en: "Custom Local",
    available: true,
    known: false,
    isCatalogDefault: false,
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: ["high"]
  }];
  const settings = { ...settingsDefaults, locale: "en" as const };
  try {
    // When rendering the model and overview pages.
    flushSync(() => root.render(createElement(Fragment, null,
      createElement(ModelsSettingsPage, {
        onSettingChange() {}, setPermissionAcknowledged() {}, setPermissionConfirmation() {},
        zh: false, unavailableFixedModel: false, settings, displayedModelId: "custom-local",
        renderSettingControl: () => null, modelAccessState: null, projection: undefined,
        navigate() {}, modelOptions
      }),
      createElement(OverviewSettingsPage, {
        zh: false, issueList: null, gateway: undefined, gatewayUnavailableDetail: undefined,
        navigate() {}, displayedModelId: "custom-local", settings, projection: undefined,
        statePlaceholder: "--", initializationDetail: "", initializationPresentationStatus: "unknown",
        initializationStatus: "idle", onRefreshInitialization() {}, copy: navigationCopy.en.destinations,
        onOpenSchedules: undefined, modelOptions
      })
    )));
    // Then both pages present the catalog label instead of the raw id.
    expect(container.textContent).toContain("Auto selects Custom Local");
    expect(container.textContent).toContain("Account & model");
    expect(container.textContent).not.toContain("Auto selects custom-local");
    expect([...container.querySelectorAll("button")].some(button => button.textContent === "Custom Local")).toBe(true);
  } finally {
    flushSync(() => root.unmount());
    await new Promise(resolve => setImmediate(resolve));
    browser.close();
    keys.forEach(key => {
      const original = originals.get(key);
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
