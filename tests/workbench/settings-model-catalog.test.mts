import { customModelAccessFixture } from "../../scripts/model-policy-fixture.ts";
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
    customModelAccess: customModelAccessFixture,
    useHighestSupportedReasoningForUnknown: true
  }
});

const { readSettings, settingsDefaults, writeSettings } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");
const { ModelsSettingsPage } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/pages/ModelsSettingsPage.tsx");
const { OverviewSettingsPage } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/pages/OverviewSettingsPage.tsx");
const { navigationCopy } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/navigation.tsx");
const { resolveCodexModelOptions, resolveCodexSelection } = await import("../../plugins/core/opl-studio-client/src/client/workbench/modelPolicy.ts");

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

test("new, legacy and malformed settings keep custom access off until an explicit boolean opt-in", () => {
  const storage = memoryStorage();
  expect(readSettings(storage).customModelAccessEnabled).toBe(false);
  storage.setItem("opl.nativeWorkbench.settings.v1", JSON.stringify({ modelAccess: "custom-local" }));
  expect(readSettings(storage).customModelAccessEnabled).toBe(false);
  expect(readSettings(storage).modelAccess).toBe("custom-local");
  writeSettings({ customModelAccessEnabled: true }, storage);
  expect(readSettings(storage).customModelAccessEnabled).toBe(true);
  writeSettings({ customModelAccessEnabled: false }, storage);
  expect(readSettings(storage).modelAccess).toBe("custom-local");
  storage.setItem("opl.studio.settings.v1", JSON.stringify({ customModelAccessEnabled: "true", modelAccess: "custom-local" }));
  expect(readSettings(storage).customModelAccessEnabled).toBe(false);
});

test("advanced setting persists across reload and disabling it removes only the custom send route", () => {
  const storage = memoryStorage();
  const catalog = [
    { id: "test-model", supportedReasoningEfforts: ["low", "high"] },
    { id: "custom-local", model: "custom-wire", supportedReasoningEfforts: ["high"] }
  ];
  writeSettings({ customModelAccessEnabled: true, modelAccess: "custom-local" }, storage);
  let settings = readSettings(storage);
  expect(resolveCodexSelection(resolveCodexModelOptions(catalog, settings.customModelAccessEnabled), settings.modelAccess, settings.reasoningLevel).model?.wireModel).toBe("custom-wire");
  writeSettings({ customModelAccessEnabled: false }, storage);
  settings = readSettings(storage);
  expect(settings.modelAccess).toBe("custom-local");
  const options = resolveCodexModelOptions(catalog, settings.customModelAccessEnabled);
  expect(resolveCodexSelection(options, settings.modelAccess, settings.reasoningLevel).model).toBeUndefined();
  expect(resolveCodexSelection(options, "__auto", settings.reasoningLevel).model?.id).toBe("test-model");
});

test("model Settings pages use live-catalog display labels", async () => {
  // Given a deliberately fixed custom model after opt-in.
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
  const settings = { ...settingsDefaults, locale: "en" as const, modelAccess: "custom-local", customModelAccessEnabled: true };
  try {
    // When rendering the model and overview pages.
    flushSync(() => root.render(createElement(Fragment, null,
      createElement(ModelsSettingsPage, {
        onSettingChange() {}, setPermissionAcknowledged() {}, setPermissionConfirmation() {},
        zh: false, unavailableFixedModel: false, settings, displayedModelId: "custom-local",
        renderSettingControl: () => createElement("span", null, "Custom Local"), modelAccessState: null, projection: undefined,
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
    expect(container.textContent).toContain("Custom Local");
    expect(container.textContent).toContain("Current model");
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

test("custom access is a collapsed Models disclosure after defaults and toggles without changing model selection", async () => {
  const { createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const { Window } = await import("happy-dom");
  const { searchableSettings } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settings/navigation.tsx");
  const browser = new Window({ url: "http://localhost/" });
  const keys = ["window", "document", "HTMLElement", "Node"] as const;
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  keys.forEach(key => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "window" ? browser : browser[key] }));
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Element);
  const storage = memoryStorage();
  const writes: boolean[] = [];
  let enabled = false;
  const billionContext = {
    readBillionContext: async () => ({ enabled, installed: true, version: "0.1.216", availableVersion: null, activeVersion: null, active: false, startupFailed: false }),
    setBillionContext: async (request: { enabled: boolean }) => {
      enabled = request.enabled;
      writes.push(enabled);
      return { enabled, installed: true, version: "0.1.216", availableVersion: null, activeVersion: null, active: false, startupFailed: false };
    }
  };
  const render = (locale: "zh" | "en") => {
    const settings = readSettings(storage);
    flushSync(() => root.render(createElement(ModelsSettingsPage, {
      key: locale, settings: { ...settings, locale }, zh: locale === "zh", unavailableFixedModel: false,
      displayedModelId: "test-model", modelOptions: [], renderSettingControl: () => null,
      onSettingChange(key, value) { writeSettings({ [key]: value }, storage); render(locale); },
      setPermissionAcknowledged() {}, setPermissionConfirmation() {},
      modelAccessState: null, projection: undefined, navigate() {}, billionContext
    })));
  };
  try {
    for (const locale of ["zh", "en"] as const) {
      writeSettings({ customModelAccessEnabled: false }, storage);
      render(locale);
      const disclosure = container.querySelector<HTMLDetailsElement>("#advanced-model-options")!;
      expect(disclosure.open).toBe(false);
      expect(disclosure.previousElementSibling?.querySelector("h2")?.textContent).toBe(locale === "zh" ? "默认模型" : "Default model");
      expect(disclosure.nextElementSibling?.querySelector("h2")?.textContent).toBe(locale === "zh" ? "执行权限" : "Execution permissions");
      expect(disclosure.firstElementChild?.tagName).toBe("SUMMARY");
      disclosure.open = true;
      const control = disclosure.querySelector<HTMLButtonElement>('[role="switch"]')!;
      expect(control.getAttribute("aria-checked")).toBe("false");
      expect(control.getAttribute("aria-label")).toBe(customModelAccessFixture.label[locale]);
      expect(disclosure.textContent).toContain(customModelAccessFixture.description[locale]);
      flushSync(() => control.click());
      expect(readSettings(storage).customModelAccessEnabled).toBe(true);
      expect(readSettings(storage).modelAccess).toBe("__auto");
      expect(disclosure.open).toBe(true);
      expect(disclosure.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
    }
    await new Promise(resolve => setImmediate(resolve));
    const context = container.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Billion Context"]')!;
    expect(context.disabled).toBe(false);
    expect(context.getAttribute("aria-checked")).toBe("false");
    flushSync(() => context.click());
    await new Promise(resolve => setImmediate(resolve));
    expect(writes).toEqual([true]);
    expect(context.getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toContain("Restart pending");
    const target = searchableSettings.find(entry => entry.labels.includes("Enable custom models"));
    expect(target?.destination).toBe("models");
    expect(target?.labels).toContain("启用自定义模型");
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
