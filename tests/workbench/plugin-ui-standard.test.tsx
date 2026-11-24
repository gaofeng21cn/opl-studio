import React, { act } from "react";
let createRoot: typeof import("react-dom/client").createRoot;
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { Context } from "@deepseek-ai/cordis";
import {
  PluginErrorBoundary,
  readOplSettingsGroupMeta,
  registerOplSettingsGroup,
  SettingsGroup,
  SettingRow
} from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { SlotRegistry } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/registry.ts";
import { createSlotRenderer } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/scoped-slots.tsx";
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

const {
  readSettingsFormResult,
  readUiContributionsProjection,
  settingsEntriesForNativeAppSurface
} = await import("../../plugins/opl-studio-client/src/client/composition/contributionProjection");
type OplContributionSlotOwner = import("../../plugins/opl-studio-client/src/client/composition/contributionProjection").OplContributionSlotOwner;
const { ProjectedContribution } = await import("../../plugins/opl-studio-client/src/client/composition/contributionComponents");
const { settingsSearchTargets } = await import("../../plugins/opl-studio-client/src/client/composition/slotHost/shellSettingsSlots");
const { CapabilitiesSettingsPage } = await import("../../plugins/opl-studio-client/src/client/workbench/settings/pages/CapabilitiesSettingsPage");
const { CodexThreadScope } = await import("../../plugins/opl-studio-client/src/client/composition/codexThreadScope");
const { McpAppWorkspace } = await import("../../plugins/opl-mcp-apps/src/client/McpAppWorkspace");

let browser: Window;
let root: ReturnType<typeof createRoot>;
const keys = [
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
  originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value = key === "IS_REACT_ACT_ENVIRONMENT"
      ? true
      : key === "window"
        ? browser
        : key === "ResizeObserver"
          ? (browser as any).ResizeObserver ?? class { observe() {} disconnect() {} }
          : (browser as any)[key];
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

test("Tier 1 settings_form validates after blur/submit, masks secrets, preserves failed drafts, and indexes into settings search", async () => {
  const entries = readUiContributionsProjection({
    ui_contributions: {
      surface_kind: "opl_app_ui_contributions_projection.v1",
      entries: [
        {
          contribution_key: "sample-ext:prefs",
          contribution_id: "prefs",
          package_id: "sample-ext",
          slot: "settings.section",
          contribution_kind: "view",
          trust_tier: "declarative",
          scope: "root",
          sort_order: 10,
          view: {
            view_id: "prefs-view",
            view_type: "settings_form",
            settings_destination: "capabilities",
            title_i18n: { "zh-CN": "扩展配置表单", "en-US": "Extension Form" },
            data_ref: "sample.prefs.v1#state"
          },
          commands: [
            {
              command_id: "save",
              label_i18n: { "zh-CN": "保存配置", "en-US": "Save" },
              action_ref: "sample.prefs.v1#save",
              confirmation_required: false
            }
          ],
          badges: []
        }
      ]
    }
  }).entries;

  expect(settingsEntriesForNativeAppSurface(entries, "capabilities")).toHaveLength(1);
  expect(settingsSearchTargets("zh", entries).some(item => item.destination === "capabilities" && item.label === "扩展配置表单")).toBe(true);

  const sanitized = readSettingsFormResult({
    schema_version: "opl-app-settings-form.v1",
    fields: [{ field_id: "api_key", field_type: "secret_ref", label_i18n: { "zh-CN": "密钥" }, effect_timing: "immediate", secret_configured: true }],
    values: { api_key: "should-never-echo" }
  });
  expect(sanitized?.values.api_key).toBeUndefined();

  let readCount = 0;
  let nextOutcome: "failed" | "succeeded" = "failed";
  const submittedPayloads: unknown[] = [];
  const formSpec = {
    schema_version: "opl-app-settings-form.v1",
    submit_command_id: "save",
    fields: [
      { field_id: "enabled", field_type: "boolean", label_i18n: { "zh-CN": "启用扩展" }, effect_timing: "immediate" },
      {
        field_id: "mode",
        field_type: "enum",
        label_i18n: { "zh-CN": "工作模式" },
        effect_timing: "next_task",
        options: [
          { value: "fast", label_i18n: { "zh-CN": "快速" } },
          { value: "accurate", label_i18n: { "zh-CN": "精确" } }
        ]
      },
      {
        field_id: "region",
        field_type: "enum",
        label_i18n: { "zh-CN": "区域节点" },
        effect_timing: "immediate",
        options: ["us", "eu", "ap", "cn", "jp", "sg"].map(value => ({ value, label_i18n: { "zh-CN": value } }))
      },
      { field_id: "endpoint", field_type: "string", label_i18n: { "zh-CN": "服务地址" }, effect_timing: "restart_required", required: true },
      { field_id: "workers", field_type: "number", label_i18n: { "zh-CN": "并发数" }, effect_timing: "immediate", min: 1, max: 4 },
      { field_id: "cache_dir", field_type: "directory", label_i18n: { "zh-CN": "缓存目录" }, effect_timing: "restart_required" },
      { field_id: "token", field_type: "secret_ref", label_i18n: { "zh-CN": "访问令牌" }, effect_timing: "immediate", secret_configured: true }
    ],
    values: {
      enabled: true,
      mode: "fast",
      region: "us",
      endpoint: "",
      workers: 2,
      cache_dir: "/tmp/init"
    }
  };

  const owner: OplContributionSlotOwner = {
    locale: "zh",
    actionAvailable: true,
    refreshRevision: 0,
    pickDirectory: async () => "/tmp/picked-cache",
    readData: async () => {
      readCount += 1;
      return formSpec;
    },
    onAction: async (_entry, _command, input) => {
      submittedPayloads.push(input);
      if (nextOutcome === "failed") return { status: "failed", message: "后端校验拒绝" };
      return { status: "succeeded" };
    }
  };

  await act(async () => {
    root.render(<ProjectedContribution entry={entries[0]!} owner={owner} />);
  });

  const form = document.querySelector<HTMLFormElement>('[data-testid="opl-settings-form-sample-ext:prefs"]')!;
  expect(form).toBeTruthy();
  expect(form.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  expect(form.querySelectorAll("select")).toHaveLength(1);
  expect(form.textContent).toContain("即时生效");
  expect(form.textContent).toContain("下个任务生效");
  expect(form.textContent).toContain("重启后生效");
  expect(form.textContent).toContain("已配置");

  // No validation error appears before user interaction or submit.
  expect(form.querySelector("[data-error]")).toBeNull();

  // Submitting with empty required string blocks action, shows accessible error, and focuses invalid input.
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(submittedPayloads).toHaveLength(0);
  const endpointInput = form.querySelector<HTMLInputElement>('[data-field-id="endpoint"] input')!;
  expect(endpointInput.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(endpointInput);
  expect(form.querySelector("[data-error]")?.textContent).toContain("服务地址");

  // Fill directory via native picker & valid endpoint.
  const pickBtn = [...form.querySelectorAll("button")].find(btn => btn.textContent?.includes("选择目录"))!;
  await act(async () => { pickBtn.click(); });
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(endpointInput, "https://api.example.invalid");
    endpointInput.dispatchEvent(new Event("input", { bubbles: true }));
    endpointInput.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // Failed save leaves draft intact and does not fabricate success or trigger extra read.
  const readsBeforeSubmit = readCount;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(submittedPayloads).toHaveLength(1);
  expect(readCount).toBe(readsBeforeSubmit);
  expect(endpointInput.value).toBe("https://api.example.invalid");
  expect(form.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain("后端校验拒绝");

  // Successful save triggers fresh owner readback and announces restart timing.
  nextOutcome = "succeeded";
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(submittedPayloads).toHaveLength(2);
  expect((submittedPayloads[1] as { values: Record<string, unknown> }).values.cache_dir).toBe("/tmp/picked-cache");
  expect(readCount).toBe(readsBeforeSubmit + 1);
  expect(form.querySelector('[role="status"][aria-live="polite"]')?.textContent).toContain("重启应用后生效");
});

test("Tier 2 PluginErrorBoundary isolates crashing plugins and settings.group cards feed settings search & capabilities", async () => {
  let shouldThrow = true;
  let softwareCenterClicks = 0;
  function CrashingPlugin() {
    if (shouldThrow) throw new Error("boom_render_failure");
    return <div data-testid="recovered-plugin">正常渲染</div>;
  }

  await act(async () => {
    root.render(
      <div>
        <div data-testid="sibling-chat">核心对话区正常</div>
        <PluginErrorBoundary
          pluginId="@test/broken"
          pluginLabel="测试异常插件"
          locale="zh"
          onOpenSoftwareCenter={() => { softwareCenterClicks += 1; }}
        >
          <CrashingPlugin />
        </PluginErrorBoundary>
      </div>
    );
  });

  expect(document.querySelector('[data-testid="sibling-chat"]')?.textContent).toBe("核心对话区正常");
  const fallback = document.querySelector('[data-testid="opl-plugin-error-boundary-fallback"]')!;
  expect(fallback.getAttribute("data-plugin-id")).toBe("@test/broken");
  expect(fallback.textContent).toContain("已隔离不影响核心对话");

  const scBtn = [...fallback.querySelectorAll("button")].find(b => b.textContent?.includes("软件中心"))!;
  await act(async () => { scBtn.click(); });
  expect(softwareCenterClicks).toBe(1);

  shouldThrow = false;
  const reloadBtn = [...fallback.querySelectorAll("button")].find(b => b.textContent?.includes("重新加载"))!;
  await act(async () => { reloadBtn.click(); });
  expect(document.querySelector('[data-testid="recovered-plugin"]')?.textContent).toBe("正常渲染");

  const ctx = new Context();
  new SlotRegistry(ctx);
  const core = ctx.get("slots") as SlotRegistry;
  core.installScope("session", new CodexThreadScope(ctx));
  core.install(createSlotRenderer());
  core.register(
    {
      name: "root",
      registrant: "test",
      children: { "settings.group.capabilities": { kind: "list", scope: "root" } }
    } as any,
    (({ renderSlot }: { renderSlot: (key: string, owner: unknown) => React.ReactNode }) => (
      <CapabilitiesSettingsPage
        model={{ packageLifecycle: [], managedCompanions: [] } as any}
        capabilityCatalog={{ plugins: [], skills: [], mcpServers: [], apps: [] } as any}
        capabilityStatus="ready"
        capabilityError=""
        settings={{ locale: "zh", developerDetails: false } as any}
        onRefreshCapabilities={() => {}}
        navigate={() => {}}
        actionBusyKey={null}
        onAction={() => {}}
        renderSettingsGroupSlot={destination => renderSlot(`settings.group.${destination}`, { locale: "zh" })}
      />
    )) as any
  );

  registerOplSettingsGroup(
    core,
    {
      id: "demo-group",
      destination: "capabilities",
      packageId: "@test/demo-plugin",
      order: 10,
      registrant: "demo-plugin",
      titleI18n: { zh: "演示能力组", en: "Demo capability group" },
      searchKeywords: "demo keyword"
    },
    () => (
      <SettingsGroup title="演示能力组" packageId="@test/demo-plugin">
        <SettingRow label="开关"><span>已开启</span></SettingRow>
      </SettingsGroup>
    )
  );

  const meta = readOplSettingsGroupMeta(core.entries("settings.group.capabilities" as any));
  expect(meta).toHaveLength(1);
  const search = settingsSearchTargets("zh", [], meta);
  expect(search.some(item => item.destination === "capabilities" && item.label === "演示能力组")).toBe(true);

  await act(async () => {
    root.render(<>{core.renderSlot("root", {})}</>);
  });
  expect(document.body.textContent).toContain("演示能力组");

  await act(async () => { root.render(null); });
  await ctx.fiber.dispose();
  expect(readOplSettingsGroupMeta(core.entries("settings.group.capabilities" as any))).toHaveLength(0);
});

test("plugins/opl-team-bots, plugins/opl-superagent, and plugins/opl-mcp-apps have zero relative vendor/ imports", () => {
  const studioRoot = path.resolve(import.meta.dirname, "../..");
  for (const relPath of [
    "plugins/opl-team-bots/src/client/plugin.tsx",
    "plugins/opl-superagent/src/client/plugin.tsx",
    "plugins/opl-mcp-apps/src/client/McpAppWorkspace.tsx",
    "plugins/opl-mcp-apps/src/client/McpTaskWorkbench.tsx",
    "plugins/opl-mcp-apps/src/client/mcpAppHost.ts"
  ]) {
    const source = readFileSync(path.join(studioRoot, relPath), "utf8");
    expect(source).not.toMatch(/vendor\/deepseek-harness/);
  }
});

test("Tier 3 McpAppWorkspace surfaces authorization banner and jumps to resources settings before retry", async () => {
  let openAttempts = 0;
  let resourceJump: unknown = null;
  const authError = new Error(JSON.stringify({
    code: "library_access_required",
    package_id: "opl-docs",
    resource_id: "lib-42",
    message: "Missing access grant"
  }));
  const descriptor = {
    miniAppId: "mcp:docs:ui://docs/home",
    server: "docs",
    tool: "open_docs",
    title: "Docs App",
    description: "Docs",
    resourceUri: "ui://docs/home",
    inputSchema: {},
    readOnly: true,
    readiness: "ready" as const
  };

  await act(async () => {
    root.render(
      <McpAppWorkspace
        threadId="thread-1"
        locale="zh"
        onOpenResourceSettings={focus => { resourceJump = focus; }}
        onContext={() => {}}
        onMessage={() => {}}
        bridge={{
          listMcpApps: async () => ({ apps: [descriptor] }),
          openMcpApp: async () => {
            openAttempts += 1;
            throw authError;
          },
          callMcpAppTool: async () => ({}),
          readMcpAppResource: async () => ({}),
          closeMcpApp: async () => ({ closed: true })
        }}
      />
    );
  });

  const openBtn = [...document.querySelectorAll("button")].find(btn => btn.textContent === "打开界面")!;
  await act(async () => { openBtn.click(); });
  expect(openAttempts).toBe(1);

  const authBanner = document.querySelector('[data-testid="opl-mcp-auth-required"]')!;
  expect(authBanner).toBeTruthy();
  const authorizeBtn = [...authBanner.querySelectorAll("button")].find(btn => btn.textContent === "前往资料与连接授权")!;
  await act(async () => { authorizeBtn.click(); });
  expect(resourceJump).toEqual({ section: "libraries", packageId: "opl-docs", resourceId: "lib-42" });

  const retryBtn = [...authBanner.querySelectorAll("button")].find(btn => btn.textContent === "重试")!;
  await act(async () => { retryBtn.click(); });
  expect(openAttempts).toBe(2);
});

test("E2E Tier 1 settings_form template spawns real contribution-cli.mjs, validates, persists, and indexes search", async () => {
  const studioRoot = path.resolve(import.meta.dirname, "../..");
  const cliPath = path.join(studioRoot, "templates/plugin-devkit/tier1-settings-form/contribution-cli.mjs");
  const contributions = JSON.parse(readFileSync(path.join(studioRoot, "templates/plugin-devkit/tier1-settings-form/app-contributions.example.json"), "utf8"));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "opl-devkit-tier1-e2e-"));
  const stateFile = path.join(stateDir, "settings.json");

  const runCliBridge = (request: Record<string, unknown>) => {
    const res = spawnSync(process.execPath, [cliPath], {
      input: JSON.stringify({ schema_version: "opl-package-app-contribution-request.v1", ...request }),
      encoding: "utf8",
      env: { ...process.env, OPL_TIER1_SETTINGS_FILE: stateFile }
    });
    expect(res.status).toBe(0);
    return JSON.parse(res.stdout.trim());
  };

  try {
    const view = contributions.views[0];
    const placement = contributions.ui[0];
    const entries = readUiContributionsProjection({
      ui_contributions: {
        surface_kind: "opl_app_ui_contributions_projection.v1",
        entries: [{
          contribution_key: `example-tier1:${placement.contribution_id}`,
          contribution_id: placement.contribution_id,
          package_id: "example-tier1",
          slot: placement.slot,
          contribution_kind: placement.contribution_kind,
          trust_tier: placement.trust_tier,
          scope: placement.scope,
          sort_order: placement.sort_order,
          view,
          commands: contributions.commands,
          badges: []
        }]
      }
    }).entries;

    expect(settingsEntriesForNativeAppSurface(entries, "capabilities")).toHaveLength(1);
    expect(settingsSearchTargets("zh", entries).some(t => t.destination === "capabilities" && t.label === "示例扩展配置")).toBe(true);

    const owner: OplContributionSlotOwner = {
      locale: "zh",
      actionAvailable: true,
      refreshRevision: 0,
      readData: async (entry) => {
        const resp = runCliBridge({ package_id: entry.packageId, ref: entry.view!.dataRef, operation: "read", input: {} });
        expect(resp.ok).toBe(true);
        return resp.result;
      },
      onAction: async (entry, command, input) => {
        const resp = runCliBridge({ package_id: entry.packageId, ref: command.actionRef, operation: "execute", input });
        return resp.ok ? { status: "succeeded" } : { status: "failed", message: resp.error?.message };
      }
    };

    await act(async () => {
      root.render(<ProjectedContribution entry={entries[0]!} owner={owner} />);
    });
    // Wait for async readData Promise resolution inside DeclarativeSettingsForm
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });

    const form = document.querySelector<HTMLFormElement>('[data-testid="opl-settings-form-example-tier1:example-tier1-settings"]')!;
    expect(form).toBeTruthy();
    const endpointInput = form.querySelector<HTMLInputElement>('[data-field-id="endpoint"] input')!;
    const concurrencyInput = form.querySelector<HTMLInputElement>('[data-field-id="concurrency"] input')!;
    expect(endpointInput.value).toBe("https://api.example.invalid");
    expect(concurrencyInput.value).toBe("2");

    // 1. Invalid endpoint rejected by real contribution-cli.mjs without persisting
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(endpointInput, "http://insecure.invalid");
      endpointInput.dispatchEvent(new Event("input", { bubbles: true }));
      endpointInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(form.querySelector('[role="status"]')?.textContent).toContain("https://");

    // 2. Valid edit persists to disk via real contribution-cli.mjs and reloads cleanly
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(endpointInput, "https://pilot.saved.example");
      endpointInput.dispatchEvent(new Event("input", { bubbles: true }));
      endpointInput.dispatchEvent(new Event("change", { bubbles: true }));
      setter.call(concurrencyInput, "6");
      concurrencyInput.dispatchEvent(new Event("input", { bubbles: true }));
      concurrencyInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });

    const persisted = JSON.parse(readFileSync(stateFile, "utf8"));
    expect(persisted.endpoint).toBe("https://pilot.saved.example");
    expect(persisted.concurrency).toBe(6);

    // Fresh mount reloads saved values directly from disk via CLI
    await act(async () => { root.render(null); });
    await act(async () => {
      root.render(<ProjectedContribution entry={entries[0]!} owner={{ ...owner, refreshRevision: 1 }} />);
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    const reloadedForm = document.querySelector<HTMLFormElement>('[data-testid="opl-settings-form-example-tier1:example-tier1-settings"]')!;
    expect(reloadedForm.querySelector<HTMLInputElement>('[data-field-id="endpoint"] input')!.value).toBe("https://pilot.saved.example");
    expect(reloadedForm.querySelector<HTMLInputElement>('[data-field-id="concurrency"] input')!.value).toBe("6");
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});
