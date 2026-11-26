import { customModelAccessFixture } from "../../scripts/model-policy-fixture.ts";
import { expect, test } from "bun:test";

(globalThis as typeof globalThis & { __OPL_CODEX_MODEL_POLICY__?: unknown }).__OPL_CODEX_MODEL_POLICY__ = {
  source: "test-fixture",
  defaultModel: "codex-fixture",
  defaultReasoningEffort: "high",
  visibleModels: [{ id: "codex-fixture", label_zh: "Fixture", label_en: "Fixture" }],
  reasoningEfforts: ["high"],
  autoLabel: { zh: "自动（推荐）", en: "Auto (recommended)" },
  knownModelReasoningEffortOverrides: { "codex-fixture": "high" },
  acceptUnknownCatalogDefault: true,
  customModelAccess: customModelAccessFixture,
  useHighestSupportedReasoningForUnknown: true
};

const {
  ADDITIONAL_CONVERSATION_INSTRUCTIONS_KEY,
  SETTINGS_STORAGE_KEY,
  migrateStorageValue,
  readAdditionalConversationInstructions,
  readSettings,
  writeAdditionalConversationInstructions
} = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel.ts");

function memoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values
  };
}

test("migrates Native Workbench settings once into OPL Studio storage", () => {
  const storage = memoryStorage({
    "opl.nativeWorkbench.settings.v1": JSON.stringify({ locale: "en", runtimeProfile: "full" })
  });
  const settings = readSettings(storage);

  expect(settings.locale).toBe("en");
  expect(settings.runtimeProfile).toBe("full");
  expect(storage.values.has("opl.nativeWorkbench.settings.v1")).toBe(false);
  expect(storage.values.has(SETTINGS_STORAGE_KEY)).toBe(true);
});

test("preserves an existing OPL Studio value over a stale legacy value", () => {
  const storage = memoryStorage({
    "opl.studio.uiMetadata.v2": "current",
    "opl.nativeWorkbench.uiMetadata.v2": "legacy"
  });
  expect(migrateStorageValue(
    storage,
    "opl.studio.uiMetadata.v2",
    "opl.nativeWorkbench.uiMetadata.v2"
  )).toBe("current");
  expect(storage.values.get("opl.nativeWorkbench.uiMetadata.v2")).toBe("legacy");
});

test("preserves the directly reused DSH dark appearance preference", () => {
  const storage = memoryStorage({
    [SETTINGS_STORAGE_KEY]: JSON.stringify({ theme: "dark" })
  });

  expect(readSettings(storage).theme).toBe("dark");
});

test("stores only bounded new-conversation instructions under the App session-context key", () => {
  const storage = memoryStorage({});
  expect(writeAdditionalConversationInstructions("  Keep results concise.  ", storage)).toBe("Keep results concise.");
  expect(storage.values.get(ADDITIONAL_CONVERSATION_INSTRUCTIONS_KEY)).toBe("Keep results concise.");
  expect(readAdditionalConversationInstructions(storage)).toBe("Keep results concise.");
  expect(() => writeAdditionalConversationInstructions("x".repeat(65_537), storage)).toThrow(/64 KiB/);
  expect(storage.values.get(ADDITIONAL_CONVERSATION_INSTRUCTIONS_KEY)).toBe("Keep results concise.");
});
