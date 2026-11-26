import { customModelAccessFixture } from "../../scripts/model-policy-fixture.ts";
import { expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";
import { deriveWorkbenchModelFromState } from "../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel";
import { softwareAttentionItems, softwareCanStart } from "../../plugins/core/opl-studio-client/src/client/workbench/softwareExperience";
import { DshPluginManagerOwner } from "../../plugins/core/opl-studio-client/src/client/composition/dshPluginManagerOwner";
import { McpAppWorkspace } from "../../plugins/core/opl-mcp-apps/src/client/McpAppWorkspace";
import { KnowledgeSourcesSection } from "../../plugins/core/opl-studio-client/src/client/workbench/KnowledgeSourcesSection";
import { readKnowledgeSourcesProjection } from "../../plugins/core/opl-studio-client/src/client/workbench/knowledgeSources";
import { compactPackageRows, compactSoftwareSources } from "../../plugins/core/opl-framework-bridge/src/opl-passthrough/contributions-packages.mjs";
import { SoftwareSourcesPage } from "../../plugins/core/opl-studio-client/src/client/workbench/SoftwareSourcesPage";
import { readSoftwareSourcesProjection } from "../../plugins/core/opl-studio-client/src/client/workbench/softwareSources";


Object.assign(globalThis, { __OPL_CODEX_MODEL_POLICY__: {
  source: "test-fixture", defaultModel: "codex-fixture", defaultReasoningEffort: "high", visibleModels: [{ id: "codex-fixture" }], reasoningEfforts: ["high"],
  autoLabel: { zh: "自动（推荐）", en: "Auto (recommended)" }, knownModelReasoningEffortOverrides: {}, acceptUnknownCatalogDefault: true, customModelAccess: customModelAccessFixture, useHighestSupportedReasoningForUnknown: true,
} });
const { settingsDefaults } = await import("../../plugins/core/opl-studio-client/src/client/workbench/settingsModel");

function model() {
  return deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: compactPackageRows([1, 2, 3].map(id => ({
    package_id: `example-${id}`, display_name: `Example ${id}`, catalog_scope: "software", catalog_origin: "opl", installed: true, app_enabled: true,
    presence: { callable: true }, miniapp_entry: { resource_uri: "ui://example/app", arguments: { package_id: `example-${id}`, secret: "must-not-cross" } },
    package_access: { visibility: "authorized_only", status: "expired", source_ref: "registry:private", download_allowed: false },
  }))) } } } });
}

test("one source recovery covers its affected products without hiding an independent installation conflict", () => {
  const state = model();
  state.softwareSources = { status: "attention_required", entries: [{ sourceId: "private", displayName: "Private source", sourceKind: "registry", sourceRef: "registry:private", visibility: "authorized_only", status: "expired", enabled: true, credentialHandlePresent: true, availableActions: [] }] };
  const issues = softwareAttentionItems(state, "en");
  expect(issues).toHaveLength(1);
  expect(issues[0]?.products).toEqual(["Example 1", "Example 2", "Example 3"]);
  state.packageLifecycle.find(item => item.packageId === "example-2")!.activeInstallationStatus = "conflict";
  expect(softwareAttentionItems(state, "en").map(item => item.id)).toEqual(["source:private", "package:example-2"]);
  state.packageLifecycle.find(item => item.packageId === "example-3")!.readiness.callable = false;
  expect(softwareAttentionItems(state, "en").map(item => item.id)).toEqual(["source:private", "package:example-2", "package:example-3"]);
});

test("unknown source checks and unused resources do not become user failures", () => {
  const state = model();
  for (const item of state.packageLifecycle) { item.access = undefined; item.currentness = "update_available"; }
  state.softwareSources = { status: "unknown", entries: [{ sourceId: "unknown", displayName: "Unknown", sourceKind: "registry", sourceRef: "registry:unknown", visibility: "public", status: "unknown", enabled: true, credentialHandlePresent: true, availableActions: [] }] };
  state.applicationManagement = { sharedResources: [{ resourceId: "unused", resourceKind: "connection", label: "Unused", status: "attention", sourceRefs: [], consumerPackageIds: [], relationKind: "optional" }] };
  expect(softwareAttentionItems(state, "en")).toEqual([]);
});

test("external software attention issues surface with the same priority as OPL software", () => {
  const state = deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries: compactPackageRows([{
    package_id: "external-pkg", display_name: "External Pkg", catalog_scope: "software", catalog_origin: "external",
    installed: true, app_enabled: true, presence: { callable: false }, readiness: { callable: false, reason: "hosted_agent_source_unavailable" }
  }]) } } } });
  const issues = softwareAttentionItems(state, "en");
  expect(issues.map(item => item.packageId)).toEqual(["external-pkg"]);
  expect(issues[0]?.title).toBe("External Pkg");
  expect(issues[0]?.productIds).toEqual(["external-pkg"]);
});

test("use entry survives the bridge and local use does not require download authorization", () => {
  const item = model().packageLifecycle.find(item => item.packageId === "example-1")!;
  expect(item.miniAppEntry).toEqual({ resourceUri: "ui://example/app", arguments: { package_id: "example-1" } });
  expect(softwareCanStart(item)).toBe(true);
  expect(softwareCanStart({ ...item, appEnabled: false })).toBe(false);
  expect(softwareCanStart({ ...item, readiness: { ...item.readiness, launchAllowed: false } })).toBe(false);
  expect(softwareCanStart({ ...item, activeInstallationStatus: "conflict" })).toBe(false);
});

async function withDom(run: (container: HTMLElement, render: (element: any) => void) => Promise<void>) {
  const browser = new Window();
  const keys = ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  keys.forEach(key => Object.defineProperty(globalThis, key, { configurable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : key === "window" ? browser : browser[key] }));
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try { await run(container, element => act(() => root.render(element))); }
  finally {
    // Flush React's scheduled effects before removing the DOM they still use.
    await act(async () => root.unmount());
    await browser.happyDOM.close();
    keys.forEach((key, index) => { const original = originals[index]; if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); });
  }
}

test("Start using navigates without dispatching a lifecycle or business action", async () => {
  await withDom(async (container, render) => {
    const used: string[] = [], actions: unknown[] = [];
    render(createElement(DshPluginManagerOwner, { kind: "all", model: model(), settings: { ...settingsDefaults, locale: "en" }, actionBusyKey: null, onAction: action => actions.push(action), onUseSoftware: id => used.push(id) }));
    const row = container.querySelector('[data-plugin-owner-package="example-1"]')!;
    const start = [...row.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Start using")!;
    expect(start).toBeTruthy(); act(() => start.click());
    expect(used).toEqual(["example-1"]); expect(actions).toEqual([]);
  });
});

test("product types group different delivery carriers and keep restricted software browseable", async () => {
  await withDom(async (container, render) => {
    const entries = compactPackageRows([
      { package_id: "catalog-extension", display_name: "Catalog Extension", software_type: "extension", catalog_source: { manager: "opl_packages" } },
      { package_id: "codex-extension", display_name: "Codex Extension", software_type: "capability", catalog_origin: "external", catalog_source: { manager: "codex_plugin_manager" } },
      { package_id: "private-app", display_name: "Restricted app", description: "Published summary", software_type: "application",
        package_access: { visibility: "authorized_only", status: "signed_out", discover_allowed: false, download_allowed: false },
        selection_status: "package_install_source_unavailable" },
      { package_id: "chat-channel", display_name: "Chat Channel", software_type: "channel" },
      { package_id: "runtime-helper", display_name: "Runtime Helper", software_type: "dependency" }
    ].map(entry => ({ catalog_scope: "software", catalog_origin: "opl", installed: false, ...entry })));
    const dsh = {
      pluginId: "bundled-extension", packageName: "@example/bundled-extension", tier: "optional_product", origin: "opl", intentCategory: "extension",
      installed: true, enabled: true, active: true, version: "1.0.0",
      labelI18n: { zh: "Bundled Extension", en: "Bundled Extension" }, descriptionI18n: { zh: "", en: "" }, permissionsI18n: { zh: [], en: [] },
      activeVersion: "1.0.0", availableVersion: null, updateAvailable: false, canInstall: false, canUninstall: false, canToggle: false,
    };
    Object.assign(window, { oplStudio: { readDshPluginCatalog: async () => ({ entries: [dsh], activity: [] }) } });
    const actions: unknown[] = [], tabs: string[] = [];
    render(createElement(DshPluginManagerOwner, { kind: "all", model: deriveWorkbenchModelFromState({ app_state: { agent_packages: { directory: { entries } } } }),
      settings: { ...settingsDefaults, locale: "en" }, actionBusyKey: null, onAction: action => actions.push(action), onTabChange: tab => tabs.push(tab) }));
    await act(async () => {});
    const row = (id: string) => container.querySelector(`[data-plugin-owner-package="${id}"]`);
    for (const id of ["catalog-extension", "codex-extension", "bundled-extension"]) {
      expect(row(id)?.closest("[data-plugin-owner-group]")?.getAttribute("data-plugin-owner-group")).toBe("extension");
      expect(row(id)?.querySelector('[data-label="Type"]')?.textContent).toBe("Extension");
    }
    expect(row("chat-channel")?.closest('[data-plugin-owner-group="channel"]')).toBeTruthy();
    expect(row("runtime-helper")).toBeNull();
    const restricted = row("private-app")!;
    expect(restricted.closest('[data-plugin-owner-group="application"]')).toBeTruthy();
    expect(restricted.textContent).toContain("Published summary");
    expect(restricted.textContent).toContain("Authorization required to install");
    expect([...restricted.querySelectorAll("button")].some(button => button.textContent === "Install")).toBe(false);
    act(() => [...restricted.querySelectorAll("button")].find(button => button.textContent === "Manage sources")!.click());
    expect(tabs).toEqual(["sources"]);
    expect(actions).toEqual([]);
    act(() => container.querySelector<HTMLButtonElement>("#opl-catalog-scope-components")!.click());
    expect(row("runtime-helper")?.closest('[data-plugin-owner-group="runtime-components"]')).toBeTruthy();
    expect(row("private-app")).toBeNull();
  });
});

test("software sources refresh the catalog without running Homebrew or an access check", async () => {
  const cache = { cached: true, stale: true, fetched_at: "2026-11-24T00:00:00Z", etag: "internal-value" };
  const projection = readSoftwareSourcesProjection(compactSoftwareSources({
    surface_kind: "opl_software_sources_projection.v1", status: "available", entries: [
      { source_id: "public-registry:opl", display_name: "OPL Catalog", source_kind: "registry", provider_id: "public_registry", visibility: "public", status: "public",
        catalog_cache: cache, verified_at: "2026-11-25T00:00:00Z", available_actions: [
          { action_id: "source_check" }, { action_id: "source_refresh", payload_fields: ["source_id"] }, { action_id: "source_list" }
        ] }
    ]
  }));
  expect(projection?.entries[0]?.catalogCache).toEqual({ cached: true, stale: true, fetchedAt: cache.fetched_at });
  await withDom(async (container, render) => {
    const requests: unknown[] = [];
    render(createElement(SoftwareSourcesPage, { projection, locale: "en", actionBusyKey: null, onAction: request => requests.push(request), onRefresh() {} }));
    const row = container.querySelector('[data-source-id="public-registry:opl"]')!;
    expect(row.textContent).toContain("Using the last synchronized catalog");
    expect(row.textContent).toContain("Last synchronized");
    const buttons = [...row.querySelectorAll("button")];
    expect(buttons.map(button => button.textContent)).toEqual(["Update catalog"]);
    act(() => buttons[0]!.click());
    expect(requests).toEqual([{ key: "source:public-registry:opl:source_refresh", actionId: "source_refresh", label: "Update catalog",
      payload: { source_id: "public-registry:opl" }, confirmationRequired: false, dryRunSupported: false }]);
  });
});

test("native folder selection and owner scope defaults complete a first connection without typing IDs", async () => {
  await withDom(async (container, render) => {
    const actions: any[] = [];
    const projection = readKnowledgeSourcesProjection({ surface_kind: "opl_knowledge_sources_projection.v1", status: "not_configured",
      contexts: [{ context_id: "profile", label: "Personal", selected: true, revision: "r1", available_scope_ids: [], scope_options: [{ id: "personal", label: "Personal knowledge" }], default_scope_ids: ["personal"] }],
      available_consumers: [{ domain_id: "example", package_id: "example-1", label: "Example 1" }],
      available_actions: [{ action_id: "knowledge_source_connect", confirmation_required: true }] })!;
    render(createElement(KnowledgeSourcesSection, { projection, locale: "en", actionBusyKey: null, selectedPackageId: "example-1", onAction: action => actions.push(action), onRefresh() {}, onPickDirectory: async () => "/test/Notes" }));
    const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === text)!;
    act(() => button("Connect library").click());
    act(() => button("Choose folder").click()); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    act(() => container.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    expect(actions).toHaveLength(1);
    expect(actions[0].payload).toMatchObject({ context_id: "profile", expected_revision: "r1", vault_path: "/test/Notes", scope_ids: ["personal"], consumer_domain_ids: ["example"], write_domain_ids: [] });
    expect(actions[0].confirmationRequired).toBe(true);
  });
});


test("software selection reaches the requested MiniApp and refresh preserves a later user selection", async () => {
  await withDom(async (container, render) => {
    const opened: any[] = [];
    const apps = ["first", "requested"].map(id => ({ miniAppId: id, server: "fixture", tool: "open", title: id,
      description: "", resourceUri: `ui://fixture/${id}`, readOnly: true, readiness: "input_required" as const,
      inputSchema: { properties: { package_id: { type: "string" }, revision: { type: "string" } }, required: ["revision"] } }));
    const entry = { resourceUri: "ui://fixture/requested", arguments: { package_id: "software", unknown: "omit" } };
    const props = { bridge: { listMcpApps: async () => ({ apps }), openMcpApp: async (request: any) => { opened.push(request); throw new Error("fixture"); }, closeMcpApp: async () => {}, callMcpAppTool: async () => ({}), readMcpAppResource: async () => ({}) },
      threadId: "thread", locale: "en" as const, preferredEntry: entry, onContext() {}, onMessage() {} };
    render(createElement(McpAppWorkspace, props as any)); await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe("requested");
    expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("software");
    expect(opened).toEqual([]);
    act(() => {
      const picker = container.querySelector<HTMLSelectElement>('select[aria-label="Current app"]')!;
      picker.value = "first";
      picker.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    render(createElement(McpAppWorkspace, { ...props, revision: 1 } as any)); await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe("first");
  });
});

test("ready software opens its declared read-only launcher once and reports failure in the work surface", async () => {
  await withDom(async (container, render) => {
    const opened: any[] = [];
    const app = { miniAppId: "requested", server: "fixture", tool: "open", title: "Requested", description: "", resourceUri: "ui://fixture/requested", readOnly: true, readiness: "ready", inputSchema: { properties: { package_id: { type: "string" } } } };
    render(createElement(McpAppWorkspace, { bridge: { listMcpApps: async () => ({ apps: [app] }), openMcpApp: async (request: any) => { opened.push(request); throw new Error("launcher unavailable"); }, closeMcpApp: async () => {} },
      threadId: "thread", locale: "en", preferredEntry: { resourceUri: app.resourceUri, arguments: { package_id: "software" } }, onContext() {}, onMessage() {} } as any));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(opened).toEqual([{ threadId: "thread", server: "fixture", tool: "open", miniAppId: "requested", arguments: { package_id: "software" } }]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not open");
    expect(container.textContent).toContain("launcher unavailable");
  });
});

test('an active Package task replaces repeat installation controls with its current stage', async () => {
  await withDom(async (container, render) => {
    const state = model();
    const item = state.packageLifecycle.find(item => item.packageId === 'example-1')!;
    item.access = undefined;
    item.installed = false;
    const actions: unknown[] = [];
    render(createElement(DshPluginManagerOwner, { kind: 'all', model: state, settings: { ...settingsDefaults, locale: 'zh' }, actionBusyKey: null, onAction: action => actions.push(action),
      packageOperations: [{ operation_id: 'active', package_id: item.packageId, action_id: 'agent_package_install', status: 'running', stage: 'downloading', can_cancel: true }] }));
    const row = container.querySelector('[data-plugin-owner-package="example-1"]')!;
    expect(row.textContent).toContain('正在下载');
    const pending = [...row.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '进行中');
    expect(pending?.disabled).toBe(true);
    pending?.click();
    expect(actions).toEqual([]);
  });
});

test('background Package tasks are discovered outside Software Center and completion requests fresh state', async () => {
  const { usePackageOperations } = await import('../../plugins/core/opl-studio-client/src/client/workbench/usePackageOperations');
  await withDom(async (_container, render) => {
    let reads = 0, completed = 0;
    const bridge = { executeAction: async (request: any) => {
      expect(request).toEqual({ actionId: 'package_operation_status', payload: {}, dryRun: true });
      reads++;
      return { stdoutJson: { app_action_execution: { result: { operations: [{ operation_id: 'restored', package_id: 'example-1', action_id: 'agent_package_install', status: reads === 1 ? 'running' : 'completed', stage: reads === 1 ? 'checking' : 'completed', can_cancel: false }] } } } };
    } };
    function Probe() { usePackageOperations(bridge as any, () => { completed++; }, false); return null; }
    render(createElement(Probe));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(completed).toBe(1);
  });
});
