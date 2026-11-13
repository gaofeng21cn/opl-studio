import { expect, test } from "bun:test";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Window } from "happy-dom";
import { deriveWorkbenchModelFromState } from "../../src/workbench/workbenchModel";
import { softwareAttentionItems, softwareCanStart } from "../../src/workbench/softwareExperience";
import { DshPluginManagerOwner } from "../../src/composition/dshPluginManagerOwner";
import { McpAppWorkspace } from "../../plugins/opl-mcp-apps/src/client/McpAppWorkspace";
import { KnowledgeSourcesSection } from "../../src/workbench/KnowledgeSourcesSection";
import { readKnowledgeSourcesProjection } from "../../src/workbench/knowledgeSources";
import { compactPackageRows } from "../../src/host/opl-passthrough-parts/contributions-packages.mjs";


Object.assign(globalThis, { __OPL_CODEX_MODEL_POLICY__: {
  source: "test-fixture", defaultModel: "codex-fixture", defaultReasoningEffort: "high", visibleModels: [{ id: "codex-fixture" }], reasoningEfforts: ["high"],
  autoLabel: { zh: "自动（推荐）", en: "Auto (recommended)" }, knownModelReasoningEffortOverrides: {}, acceptUnknownCatalogDefault: true, useHighestSupportedReasoningForUnknown: true,
} });
const { settingsDefaults } = await import("../../src/workbench/settingsModel");

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
  const keys = ["window", "document", "HTMLElement", "Node"] as const;
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  keys.forEach(key => Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? browser : browser[key] }));
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try { await run(container, element => flushSync(() => root.render(element))); }
  finally { flushSync(() => root.unmount()); await new Promise(resolve => setTimeout(resolve, 0)); keys.forEach((key, index) => { const original = originals[index]; if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); }); await browser.happyDOM.close(); }
}

test("Start using navigates without dispatching a lifecycle or business action", async () => {
  await withDom(async (container, render) => {
    const used: string[] = [], actions: unknown[] = [];
    render(createElement(DshPluginManagerOwner, { kind: "all", model: model(), settings: { ...settingsDefaults, locale: "en" }, actionBusyKey: null, onAction: action => actions.push(action), onUseSoftware: id => used.push(id) }));
    const row = container.querySelector('[data-plugin-owner-package="example-1"]')!;
    const start = [...row.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Start using")!;
    expect(start).toBeTruthy(); flushSync(() => start.click());
    expect(used).toEqual(["example-1"]); expect(actions).toEqual([]);
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
    flushSync(() => button("Connect library").click());
    flushSync(() => button("Choose folder").click()); await new Promise(resolve => setTimeout(resolve, 0));
    flushSync(() => container.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
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
    render(createElement(McpAppWorkspace, props as any)); await new Promise(resolve => setTimeout(resolve, 30));
    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe("requested");
    expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("software");
    expect(opened).toEqual([]);
    flushSync(() => {
      const picker = container.querySelector<HTMLSelectElement>('select[aria-label="Current app"]')!;
      picker.value = "first";
      picker.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    render(createElement(McpAppWorkspace, { ...props, revision: 1 } as any)); await new Promise(resolve => setTimeout(resolve, 30));
    expect(container.querySelector<HTMLSelectElement>("select")?.value).toBe("first");
  });
});

test("ready software opens its declared read-only launcher once and reports failure in the work surface", async () => {
  await withDom(async (container, render) => {
    const opened: any[] = [];
    const app = { miniAppId: "requested", server: "fixture", tool: "open", title: "Requested", description: "", resourceUri: "ui://fixture/requested", readOnly: true, readiness: "ready", inputSchema: { properties: { package_id: { type: "string" } } } };
    render(createElement(McpAppWorkspace, { bridge: { listMcpApps: async () => ({ apps: [app] }), openMcpApp: async (request: any) => { opened.push(request); throw new Error("launcher unavailable"); }, closeMcpApp: async () => {} },
      threadId: "thread", locale: "en", preferredEntry: { resourceUri: app.resourceUri, arguments: { package_id: "software" } }, onContext() {}, onMessage() {} } as any));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(opened).toEqual([{ threadId: "thread", server: "fixture", tool: "open", miniAppId: "requested", arguments: { package_id: "software" } }]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not open");
    expect(container.textContent).toContain("launcher unavailable");
  });
});
