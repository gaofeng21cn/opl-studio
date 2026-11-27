import React, { act } from "react";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { Ajv2020 } from "ajv/dist/2020.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import {
  PluginErrorBoundary,
  readOplSettingsGroupMeta,
  type OplSettingsGroupSlotRegistry
} from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { customModelAccessFixture } from "../../scripts/model-policy-fixture.ts";

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

const studioRoot = path.resolve(import.meta.dir, "../..");
const appRepoRoot = process.env.OPL_APP_REPO_ROOT || path.resolve(studioRoot, "../one-person-lab-app");

const { DeclarativeSettingsForm } = await import("../../plugins/core/opl-studio-client/src/client/composition/DeclarativeSettingsForm");
const { readSettingsFormResult, readUiContributionsProjection } = await import("../../plugins/core/opl-studio-client/src/client/composition/contributionProjection");
const { exampleTier2ClientPlugin } = await import("../../templates/plugin-devkit/tier2-dsh-client-plugin/src/client/plugin");

let createRoot: typeof import("react-dom/client").createRoot;
let browser: Window;
let root: ReturnType<typeof createRoot>;
const domKeys = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLTextAreaElement",
  "Element",
  "Node",
  "Event",
  "MutationObserver",
  "ResizeObserver",
  "getComputedStyle",
  "IS_REACT_ACT_ENVIRONMENT"
] as const;
let originals: Map<string, PropertyDescriptor | undefined>;

beforeEach(async () => {
  browser = new Window({ url: "http://127.0.0.1/" });
  originals = new Map(domKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of domKeys) {
    const value = key === "IS_REACT_ACT_ENVIRONMENT"
      ? true
      : key === "window"
        ? browser
        : key === "ResizeObserver"
          ? (browser as unknown as { ResizeObserver?: unknown }).ResizeObserver ?? class { observe() {} disconnect() {} }
          : (browser as unknown as Record<string, unknown>)[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
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

function walkSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkSourceFiles(full));
    else if (entry.isFile() && /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

test("first-party UI plugins and DevKit Tier 2 template contain zero relative vendor/ imports or rogue top-level settings nav", () => {
  const clientRoots = [
    path.join(studioRoot, "plugins/extensions/opl-team-bots/src/client"),
    path.join(studioRoot, "plugins/extensions/opl-superagent/src/client"),
    path.join(studioRoot, "plugins/core/opl-mcp-apps/src/client"),
    path.join(studioRoot, "plugins/extensions/opl-materials-space/src/client"),
    path.join(studioRoot, "plugins/extensions/opl-runtime-status/src/client"),
    path.join(studioRoot, "plugins/extensions/opl-flow-workbench/src/client"),
    path.join(studioRoot, "templates/plugin-devkit/tier2-dsh-client-plugin/src/client")
  ];
  for (const dir of clientRoots) {
    for (const file of walkSourceFiles(dir)) {
      const code = readFileSync(file, "utf8");
      expect(code).not.toMatch(/from\s+["'][^"']*vendor\//);
      expect(code).not.toMatch(/import\s*\(\s*["'][^"']*vendor\//);
      expect(code).not.toMatch(/slots\.register\([^)]*settings\.(?!group\.)/);
    }
  }
});

test("plugin panels enforce PluginErrorBoundary isolation and support lightweight view reload fallback", async () => {
  const requiredBoundaryFiles = [
    "plugins/extensions/opl-team-bots/src/client/plugin.tsx",
    "plugins/extensions/opl-superagent/src/client/plugin.tsx",
    "plugins/core/opl-mcp-apps/src/client/McpAppWorkspace.tsx",
    "plugins/core/opl-mcp-apps/src/client/McpTaskWorkbench.tsx",
    "plugins/extensions/opl-materials-space/src/client/MaterialsSpacePanel.tsx",
    "plugins/extensions/opl-runtime-status/src/client/RuntimeStatusPanel.tsx",
    "plugins/extensions/opl-flow-workbench/src/client/OplFlowWorkbenchPanel.tsx",
    "templates/plugin-devkit/tier2-dsh-client-plugin/src/client/plugin.tsx"
  ];
  for (const relPath of requiredBoundaryFiles) {
    const code = readFileSync(path.join(studioRoot, relPath), "utf8");
    expect(code).toContain("PluginErrorBoundary");
    expect(code).toContain("<PluginErrorBoundary");
  }

  let reloaded = false;
  function BrokenPanel(): React.ReactElement {
    throw new Error("simulated plugin crash");
  }
  const origError = console.error;
  console.error = () => {};
  try {
    await act(async () => {
      root.render(
        <PluginErrorBoundary pluginId="fixture-plugin" pluginLabel="Fixture Plugin" locale="zh" onReloadView={() => { reloaded = true; }}>
          <BrokenPanel />
        </PluginErrorBoundary>
      );
    });
  } finally {
    console.error = origError;
  }

  const fallback = document.querySelector('[data-testid="opl-plugin-error-boundary-fallback"]');
  expect(fallback?.textContent).toContain("Fixture Plugin");
  const reloadViewBtn = Array.from(document.querySelectorAll("button")).find((btn) => btn.textContent?.includes("刷新界面"));
  expect(reloadViewBtn).toBeTruthy();
  await act(async () => {
    reloadViewBtn?.click();
  });
  expect(reloaded).toBe(true);
});

test("DevKit Tier 1 template conforms to opl-app-contributions.schema.json and renders via DeclarativeSettingsForm", async () => {
  const schemaPath = process.env.OPL_DEVKIT_CONTRIBUTIONS_SCHEMA
    || path.join(appRepoRoot, "contracts/opl-app-contributions.schema.json");
  const manifestPath = path.join(studioRoot, "templates/plugin-devkit/tier1-settings-form/app-contributions.example.json");
  const dataPath = path.join(studioRoot, "templates/plugin-devkit/tier1-settings-form/settings-form-data.example.json");

  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const formData = JSON.parse(readFileSync(dataPath, "utf8"));

  const validator = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
  const validateManifest = validator.compile(schema);
  const validateForm = validator.compile({ $ref: `${schema.$id}#/$defs/settings_form_result` });
  validateManifest(manifest);
  expect(validateManifest.errors).toBeNull();
  validateForm(formData);
  expect(validateForm.errors).toBeNull();

  expect(manifest.views[0].view_type).toBe("settings_form");
  expect(manifest.ui[0].slot).toBe("settings.section");

  const projection = readUiContributionsProjection({
    ui_contributions: {
      surface_kind: "opl_app_ui_contributions_projection.v1",
      entries: [
        {
          contribution_key: `example-tier1:${manifest.ui[0].contribution_id}`,
          contribution_id: manifest.ui[0].contribution_id,
          package_id: "example-tier1",
          slot: manifest.ui[0].slot,
          contribution_kind: manifest.ui[0].contribution_kind,
          trust_tier: manifest.ui[0].trust_tier,
          scope: manifest.ui[0].scope,
          sort_order: manifest.ui[0].sort_order,
          view: manifest.views[0],
          commands: manifest.commands,
          badges: []
        }
      ]
    }
  });
  expect(projection.entries).toHaveLength(1);
  const parsedForm = readSettingsFormResult(formData);
  expect(parsedForm?.fields).toHaveLength(formData.fields.length);

  await act(async () => {
    root.render(
      <DeclarativeSettingsForm
        entry={projection.entries[0]!}
        result={parsedForm!}
        owner={{
          locale: "zh",
          actionAvailable: true,
          refreshRevision: 0,
          readData: async () => formData,
          onAction: async () => ({ status: "succeeded" })
        }}
        onSaved={() => {}}
      />
    );
  });

  const formEl = document.querySelector('[data-testid="opl-settings-form-example-tier1:example-tier1-settings"]');
  expect(formEl).toBeTruthy();
  expect(formEl?.textContent).toContain("启用示例扩展");
  expect(formEl?.textContent).toContain("保存配置");
});

test("Tier 2 settings slots declare bilingual titles and search keywords, and register cleanly in DSH slot registry", () => {
  const tier2SlotOwners = [
    "plugins/extensions/opl-team-bots/src/client/plugin.tsx",
    "plugins/extensions/opl-superagent/src/client/plugin.tsx",
    "plugins/core/opl-studio-client/src/client/composition/billionContextSettingsSlot.tsx",
    "templates/plugin-devkit/tier2-dsh-client-plugin/src/client/plugin.tsx"
  ];
  for (const relPath of tier2SlotOwners) {
    const code = readFileSync(path.join(studioRoot, relPath), "utf8");
    expect(code).toContain("registerOplSettingsGroup");
    expect(code).toContain("titleI18n:");
    expect(code).toContain("searchKeywords:");
  }

  const registered: Array<{ def: Record<string, unknown>; component: unknown }> = [];
  const fakeSlots = {
    register(def: Record<string, unknown>, component: unknown) {
      registered.push({ def, component });
      return () => {};
    }
  } as unknown as OplSettingsGroupSlotRegistry;
  const fakeCtx = { get: () => fakeSlots } as unknown as Context;
  exampleTier2ClientPlugin.apply(fakeCtx);
  expect(registered).toHaveLength(1);
  expect(registered[0]?.def.name).toBe("settings.group.capabilities");
  const meta = readOplSettingsGroupMeta([{ component: registered[0]!.component, options: registered[0]!.def }])[0];
  expect(meta?.titleI18n?.zh).toBe("示例扩展设置");
  expect(meta?.titleI18n?.en).toBe("Example extension settings");
  expect(meta?.searchKeywords).toContain("devkit");
});

test("CSS surfaces and PluginErrorBoundary obey theme CSS custom properties without hardcoded top-level hex colors", () => {
  const css = readFileSync(path.join(studioRoot, "plugins/core/opl-mcp-apps/src/client/mcp-apps.css"), "utf8");
  const boundary = readFileSync(path.join(studioRoot, "packages/opl-plugin-ui-kit/src/PluginErrorBoundary.tsx"), "utf8");
  expect(css).toContain("var(--dsw-");
  expect(boundary).toContain("var(--dsw-");
  expect(css).not.toMatch(/background(?:-color)?\s*:\s*#(?:fff|ffffff|000|000000)\b/i);
  expect(boundary).not.toMatch(/#(?:fff|ffffff|000|000000)\b/i);
});

test("public @gaofeng21cn/opl-plugin-ui-kit package and DevKit Tier 2 template maintain clean public SDK boundaries", () => {
  const manifest = JSON.parse(readFileSync(path.join(studioRoot, "packages/opl-plugin-ui-kit/package.json"), "utf8"));
  expect(manifest.name).toBe("@gaofeng21cn/opl-plugin-ui-kit");
  expect(manifest.private).toBe(false);
  expect(manifest.publishConfig?.registry).toBe("https://npm.pkg.github.com");
  expect(manifest.publishConfig?.access).toBe("public");
  expect(manifest.repository?.directory).toBe("packages/opl-plugin-ui-kit");
  expect(manifest.exports?.["."]).toBeTruthy();

  for (const file of walkSourceFiles(path.join(studioRoot, "packages/opl-plugin-ui-kit/src"))) {
    const code = readFileSync(file, "utf8");
    expect(code).not.toContain("vendor/");
    expect(code).not.toContain("@gaofeng21cn/opl-host-contracts");
    expect(code).not.toContain("@deepseek-ai/dsh-client-ui-slots");
  }

  const devkitPkg = JSON.parse(readFileSync(path.join(studioRoot, "templates/plugin-devkit/tier2-dsh-client-plugin/package.json"), "utf8"));
  expect(devkitPkg.dependencies?.["@gaofeng21cn/opl-plugin-ui-kit"]).toBeTruthy();
  const devkitEntry = readFileSync(path.join(studioRoot, "templates/plugin-devkit/tier2-dsh-client-plugin/src/client/plugin.tsx"), "utf8");
  expect(devkitEntry).toContain('from "@gaofeng21cn/opl-plugin-ui-kit"');
  expect(devkitEntry).not.toContain("@gaofeng21cn/opl-dsh-adapters");
});
