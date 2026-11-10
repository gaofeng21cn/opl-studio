import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Window } from "happy-dom";
import { readKnowledgeSourcesProjection, knowledgeSourceNeedsAttention, knowledgeSourceStatus, type KnowledgeSourcesProjection } from "../../src/workbench/knowledgeSources";
import { KnowledgeSourcesSection } from "../../src/workbench/KnowledgeSourcesSection";
import { ApplicationManagementPage } from "../../src/workbench/ApplicationManagementPage";
import { deriveWorkbenchModelFromState, initialWorkbenchModel, type WorkbenchModel } from "../../src/workbench/workbenchModel";
import type { SettingsActionRequest } from "../../src/workbench/settingsActions";

Object.assign(globalThis, { __OPL_CODEX_MODEL_POLICY__: {
  source: "test-fixture", defaultModel: "codex-fixture", defaultReasoningEffort: "high", visibleModels: [{ id: "codex-fixture" }], reasoningEfforts: ["high"],
  autoLabel: { zh: "自动（推荐）", en: "Auto (recommended)" }, knownModelReasoningEffortOverrides: {}, acceptUnknownCatalogDefault: true, useHighestSupportedReasoningForUnknown: true,
} });
const { settingsDefaults } = await import("../../src/workbench/settingsModel");

function ownerProjection() {
  return {
    surface_kind: "opl_knowledge_sources_projection.v1", status: "available",
    contexts: [{ context_id: "personal", label: "Personal workspace", selected: true, revision: "context-revision-7", available_scope_ids: ["personal.policy", "personal.projects"] }],
    items: [{
      resource_id: "knowledge:personal:notes", source_id: "notes", context_id: "personal", label: "Personal Obsidian library", status: "ready",
      scope_ids: ["personal.policy", "personal.projects"], consumer_domain_ids: ["persona"], consumer_package_ids: ["opl-persona"], write_domain_ids: [], source_writable: false, revision_identity: "source-revision-11",
      authorization: { status: "authorized" }, revision: { status: "current" }, freshness: { status: "fresh", observed_at: "2026-11-10T02:00:00Z" }, readiness: { status: "ready" },
      access_editable: true, scope_expansion_allowed: false, available_scope_ids: ["personal.policy", "personal.projects"],
      action_ids: ["knowledge_source_check", "knowledge_source_configure", "knowledge_source_disconnect"]
    }],
    available_consumers: [{ domain_id: "persona", label: "OPL Persona", package_id: "opl-persona" }, { domain_id: "capital", label: "Capital Compass", package_id: "opl-capital-compass" }],
    available_actions: [
      { action_id: "knowledge_source_check", label: "Check", payload_fields: ["resource_id"], confirmation_required: false },
      { action_id: "knowledge_source_connect", label: "Connect", payload_fields: ["context_id", "vault_path", "registry_path", "source_id", "label", "scope_ids", "consumer_domain_ids", "write_domain_ids", "expected_revision"], confirmation_required: true },
      { action_id: "knowledge_source_configure", label: "Configure", payload_fields: ["resource_id", "scope_ids", "consumer_domain_ids", "write_domain_ids", "expected_revision"], confirmation_required: true },
      { action_id: "knowledge_source_disconnect", label: "Disconnect", payload_fields: ["resource_id", "expected_revision"], confirmation_required: true }
    ]
  };
}

function projection(): KnowledgeSourcesProjection {
  return readKnowledgeSourcesProjection(ownerProjection())!;
}

test("knowledge projection accepts only references and preserves unknown state", () => {
  const input = ownerProjection();
  Object.assign(input, { private_notes: "private note content", credential: "secret-token", registry_path: "/secret/registry.json" });
  Object.assign(input.contexts[0]!, { vault_path: "/secret/vault" });
  Object.assign(input.items[0]!, { body: "private note content", vault_path: "/secret/vault", credential_handle: "secret-token" });
  Object.assign(input.available_actions[2]!, { default_payload: { resource_id: "knowledge:personal:notes", expected_revision: "source-revision-11", vault_path: "/secret/vault", body: "private note content", token: "secret-token", scope_ids: ["personal.policy"] } });
  const parsed = readKnowledgeSourcesProjection(input)!;
  expect(parsed.contexts[0]).toMatchObject({ contextId: "personal", revision: "context-revision-7" });
  expect(parsed.entries[0]).toMatchObject({ revisionIdentity: "source-revision-11", accessEditable: true, scopeExpansionAllowed: false, availableScopeIds: ["personal.policy", "personal.projects"] });
  expect(parsed.actions[2]!.payload).toEqual({ resource_id: "knowledge:personal:notes", expected_revision: "source-revision-11", scope_ids: ["personal.policy"] });
  expect(JSON.stringify(parsed)).not.toMatch(new RegExp("secret-token|private note content|/secret/|vault_path|credential_handle"));
  expect(readKnowledgeSourcesProjection({ surface_kind: "other_projection", status: "available" })).toBeUndefined();
  const unknown = readKnowledgeSourcesProjection({ surface_kind: input.surface_kind, status: "unexpected", items: [{ resource_id: "r", source_id: "s", context_id: "c" }, { source_id: "missing-context" }] })!;
  expect(unknown.status).toBe("unknown");
  expect(unknown.entries).toHaveLength(1);
  expect(knowledgeSourceStatus(unknown.entries[0]!)).toBe("unknown");
  expect(knowledgeSourceNeedsAttention({ ...parsed.entries[0]!, freshnessStatus: "stale" })).toBe(true);
});

test("expired history is visible in knowledge details without making a ready source unhealthy", () => {
  const input = ownerProjection();
  Object.assign(input.items[0]!, { knowledge_health: {
    current_count: 6, review_due_count: 2, inactive_count: 0, unavailable_count: 0, checked_count: 8, truncated: false,
    body: "private-marker", issues: [{ knowledge_id: "finance.dated-state", status: "review_due", reason: "knowledge_review_overdue", body: "private-marker", path: "/private-marker/note.md" }]
  } });
  const parsed = readKnowledgeSourcesProjection(input)!;
  expect(parsed.entries[0]!.knowledgeHealth).toMatchObject({ currentCount: 6, reviewDueCount: 2, checkedCount: 8, truncated: false });
  expect(knowledgeSourceNeedsAttention(parsed.entries[0]!)).toBe(false);
  expect(knowledgeSourceStatus(parsed.entries[0]!)).toBe("ready");
  expect(JSON.stringify(parsed)).not.toContain("private-marker");
  const markup = renderToStaticMarkup(createElement(KnowledgeSourcesSection, { projection: parsed, locale: "zh", actionBusyKey: null, onAction() {}, onRefresh() {} }));
  expect(markup).toContain("6条可用 · 2条过期记录已排除");
  expect(markup).toContain("finance.dated-state");
  expect(markup).toContain("已过复核期限，已排除");
  expect(markup).not.toContain("延期");
  const incomplete = readKnowledgeSourcesProjection({ ...input, items: [{ ...input.items[0], knowledge_health: { current_count: 6 } }] })!;
  expect(incomplete.entries[0]!.knowledgeHealth).toBeUndefined();
});

test("unreadable or changed knowledge and partial checks retain distinct explanations", () => {
  const input = ownerProjection();
  Object.assign(input.items[0]!, { status: "attention", readiness: { status: "attention" }, knowledge_health: {
    current_count: 98, review_due_count: 0, inactive_count: 4, unavailable_count: 2, checked_count: 100, truncated: true,
    issues: [{ knowledge_id: "finance.changed", status: "unavailable", reason: "knowledge_source_body_requires_review" }, { knowledge_id: "finance.missing", status: "unavailable", reason: "knowledge_source_body_unavailable" }]
  } });
  const parsed = readKnowledgeSourcesProjection(input)!;
  expect(knowledgeSourceNeedsAttention(parsed.entries[0]!)).toBe(true);
  const markup = renderToStaticMarkup(createElement(KnowledgeSourcesSection, { projection: parsed, locale: "zh", actionBusyKey: null, onAction() {}, onRefresh() {} }));
  expect(markup).toContain("98条可用 · 4条停用或已替代记录已排除 · 2条暂不可用");
  expect(markup).toContain("本次已检查100条，尚未覆盖全部记录。");
  expect(markup).toContain("原文有变更，需要复核");
  expect(markup).toContain("原文暂不可读取");
  expect(markup).not.toContain("过期记录");
});

function applicationMarkup(model: WorkbenchModel, stateStatus: "loading" | "ready" | "error") {
  return renderToStaticMarkup(createElement(ApplicationManagementPage, {
    model, stateStatus, stateError: stateStatus === "error" ? "State service is unavailable" : null,
    settings: { ...settingsDefaults, locale: "en" }, managedUpdate: null, nativeAppUpdate: null,
    actionViewModel: { gatewayActions: [], agentLifecycle: [], managedUpdates: [], additionalMaintenanceActions: [] },
    actionBusyKey: null, onAction() {}, onRefresh() {}
  }));
}

test("application management does not invent zero entries or health before a catalog read", () => {
  for (const status of ["loading", "error"] as const) {
    const markup = applicationMarkup(initialWorkbenchModel, status);
    expect(markup).toContain("App catalog has not been read");
    expect(markup).not.toContain("No known issues");
    expect(markup).not.toMatch(new RegExp("<strong>0</strong> (catalog entries|installable|installed)"));
    expect(markup).toContain(status === "loading" ? "Reading apps and shared resources" : "Could not read the current state");
    if (status === "error") expect(markup).toContain(">Retry</button>");
  }
});

test("shared resource staleness contributes once to application attention", () => {
  const model = deriveWorkbenchModelFromState({ app_state: { agent_packages: { surface_kind: "opl_app_agent_packages_projection", directory: { entries: [] } } } });
  model.knowledgeSources = projection();
  model.knowledgeSources.entries[0]!.freshnessStatus = "stale";
  model.applicationManagement = { sharedResources: [{
    resourceId: "knowledge:personal:notes", resourceKind: "knowledge_source", label: "Personal Obsidian library", status: "ready", sourceRefs: [], consumerPackageIds: ["opl-persona"], relationKind: "configured", freshness: { status: "stale" }
  }] };
  const markup = applicationMarkup(model, "ready");
  expect(markup).toMatch(new RegExp("<strong>1</strong> shared resources need attention"));
  expect(markup).not.toContain("No known issues");
  expect(markup).not.toMatch(new RegExp("<strong>2</strong> shared resources need attention"));
  const failedRead = applicationMarkup({ ...model, stateGeneratedAt: "2026-11-10T02:00:00Z" }, "error");
  expect(failedRead).toContain("Last read:");
  expect(failedRead).not.toContain("No known issues");
});

async function withKnowledgeForm(run: (surface: { container: HTMLElement; browser: Window; actions: SettingsActionRequest[]; render: (value: KnowledgeSourcesProjection) => void; button: (label: string) => HTMLButtonElement }) => void) {
  const browser = new Window({ url: "http://localhost/" });
  const globals = ["window", "document", "HTMLElement", "Node"] as const;
  const originals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "window" ? browser : browser[key] });
  const container = browser.document.createElement("div");
  browser.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  const actions: SettingsActionRequest[] = [];
  const render = (value: KnowledgeSourcesProjection) => flushSync(() => root.render(createElement(KnowledgeSourcesSection, { projection: value, locale: "en", actionBusyKey: null, onAction: action => { actions.push(action); }, onRefresh() {} })));
  const button = (label: string) => {
    const found = Array.from(container.querySelectorAll("button")).find(item => item.textContent === label);
    expect(found).toBeDefined();
    return found as unknown as HTMLButtonElement;
  };
  try { run({ container: container as unknown as HTMLElement, browser, actions, render, button }); }
  finally {
    flushSync(() => root.unmount());
    await new Promise(resolve => setTimeout(resolve, 0));
    browser.close();
    for (const key of globals) {
      const previous = originals.get(key);
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test("knowledge access form dispatches the bound revision and selected reader writer scopes", async () => {
  await withKnowledgeForm(({ container, browser, actions, render, button }) => {
    render(projection());
    flushSync(() => button("Manage access").click());
    const sourceRows = Array.from(container.querySelectorAll(".opl-resource-consumers > div"));
    const persona = sourceRows[0]!.querySelectorAll<HTMLInputElement>("input");
    const capital = sourceRows[1]!.querySelectorAll<HTMLInputElement>("input");
    expect(persona[1]!.disabled).toBe(false);
    expect(capital[1]!.disabled).toBe(true);
    flushSync(() => persona[1]!.click());
    flushSync(() => capital[0]!.click());
    flushSync(() => capital[1]!.click());
    flushSync(() => persona[0]!.click());
    expect(persona[1]!.disabled).toBe(true);
    expect(persona[1]!.checked).toBe(false);
    const scope = container.querySelector<HTMLSelectElement>("select[multiple]")!;
    expect(Array.from(scope.options, option => option.value)).toEqual(["personal.policy", "personal.projects"]);
    expect(container.querySelector("form input:not([type=checkbox])")).toBeNull();
    flushSync(() => {
      for (const option of scope.options) option.selected = option.value === "personal.projects";
      scope.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event);
    });
    flushSync(() => container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event));
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ actionId: "knowledge_source_configure", confirmationRequired: true, payload: {
      resource_id: "knowledge:personal:notes", expected_revision: "source-revision-11", scope_ids: ["personal.projects"], consumer_domain_ids: ["capital"], write_domain_ids: ["capital"]
    } });
    expect(Object.keys(actions[0]!.payload).sort()).toEqual(["consumer_domain_ids", "expected_revision", "resource_id", "scope_ids", "write_domain_ids"]);
  });
});

test("granular grants cannot be flattened and disconnect stays source scoped", async () => {
  await withKnowledgeForm(({ container, actions, render, button }) => {
    const source = projection();
    source.entries[0]!.accessEditable = false;
    source.entries[0]!.accessEditReason = "knowledge_source_granular_grants_require_owner";
    render(source);
    expect(container.textContent).toContain("project-specific access");
    expect(container.textContent).not.toContain("knowledge_source_granular_grants_require_owner");
    expect(Array.from(container.querySelectorAll("button")).some(item => item.textContent === "Manage access")).toBe(false);
    expect(container.querySelector("form")).toBeNull();
    button("Disconnect").click();
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ actionId: "knowledge_source_disconnect", confirmationRequired: true, payload: { resource_id: "knowledge:personal:notes", expected_revision: "source-revision-11" } });
  });
});

test("connecting a library uses the selected context revision and an explicit location", async () => {
  await withKnowledgeForm(({ container, browser, actions, render, button }) => {
    const source = projection();
    source.entries = [];
    source.status = "not_configured";
    render(source);
    flushSync(() => button("Connect library").click());
    const location = container.querySelector<HTMLInputElement>("input[autocomplete='off']")!;
    // React may initialize before this temporary DOM and use its keyboard input fallback.
    Object.assign(location, { attachEvent() {}, detachEvent() {} });
    flushSync(() => location.focus());
    flushSync(() => {
      const setter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!;
      setter.call(location, "/Users/test/Documents/Notes");
      location.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
      location.dispatchEvent(new browser.KeyboardEvent("keyup", { key: "s", bubbles: true }) as unknown as Event);
    });
    const readers = container.querySelectorAll<HTMLInputElement>(".opl-resource-consumers > div:first-child input");
    flushSync(() => readers[0]!.click());
    flushSync(() => readers[1]!.click());
    flushSync(() => container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event));
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ actionId: "knowledge_source_connect", confirmationRequired: true, payload: {
      context_id: "personal", expected_revision: "context-revision-7", vault_path: "/Users/test/Documents/Notes", scope_ids: ["personal.policy", "personal.projects"], consumer_domain_ids: ["persona"], write_domain_ids: ["persona"]
    } });
  });
});
