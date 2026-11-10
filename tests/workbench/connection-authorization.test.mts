import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Window } from "happy-dom";
import type { SettingsActionRequest } from "../../src/workbench/settingsActions";
import { deriveWorkbenchModelFromState } from "../../src/workbench/workbenchModel";
import { ResourcesSettingsPage } from "../../src/workbench/settings/pages/ResourcesSettingsPage";
import { ConnectionsSection } from "../../src/workbench/settings/ConnectionsSection";

Object.assign(globalThis, { __OPL_CODEX_MODEL_POLICY__: {
  source: "test-fixture", defaultModel: "codex-fixture", defaultReasoningEffort: "high", visibleModels: [{ id: "codex-fixture" }], reasoningEfforts: ["high"],
  autoLabel: { zh: "自动（推荐）", en: "Auto (recommended)" }, knownModelReasoningEffortOverrides: {}, acceptUnknownCatalogDefault: true, useHighestSupportedReasoningForUnknown: true,
} });

test("connection authorization projection maps owner fields and excludes credential and invocation bodies", () => {
  const model = deriveWorkbenchModelFromState({ app_state: {
    actions: [
      { action_id: "connection_access_request_deny", label: "Deny", payload_fields: ["request_id"], confirmation_required: false },
      { action_id: "connection_grant_revoke", label: "Revoke", payload_fields: ["grant_id"], confirmation_required: true },
      { action_id: "connection_relay_import", label: "Import", payload_fields: ["mailbox_ref"], confirmation_required: true },
      { action_id: "connection_access_request_approve", label: "Must not become generic" }
    ],
    settings_control_center: { app_settings_read_model: { connections: { authorization: {
      surface_kind: "opl_connection_authorization_projection.v1",
      connections: [{ connection_id: "mail-main", name: "Work mailbox", connection_type: "email", status: "connected", security_revision: 3, account_label: "gaofeng@example.test", credential_handle: "credential-ref", endpoint: "https://mail.invalid" }],
      requests: [{ request_id: "request-1", status: "requested", consumer_package_id: "opl-relay", consumer_display_name: "OPL Relay", consumer_manifest_sha256: "manifest-digest", consumer_content_digest: "content-digest", connection_id: "mail-main", connection_display_name: "Work mailbox", connection_security_revision: 3, capability_ids: ["mail.read"], created_at: "2026-11-08T00:00:00Z", access_token: "must-not-leak" }],
      grants: [{ grant_id: "grant-1", request_id: "request-1", status: "granted", consumer_package_id: "opl-relay", consumer_display_name: "OPL Relay", connection_id: "mail-main", connection_display_name: "Work mailbox", capability_ids: ["mail.read"], created_at: "2026-11-08T00:00:00Z", refresh_token: "must-not-leak" }],
      invocations: [{ invocation_id: "invocation-1", consumer_package_id: "opl-relay", consumer_display_name: "OPL Relay", connection_id: "mail-main", connection_display_name: "Work mailbox", capability_id: "mail.read", started_at: "2026-11-08T00:01:00Z", finished_at: "2026-11-08T00:01:01Z", disposition: "completed", arguments: { query: "private" }, result: { body: "private" }, error: "private" }],
      available_connections: [{ mailbox_ref: "mail-ref", display_name: "Relay account", account_label: "gaofeng@example.test", refresh_token: "must-not-leak" }]
    } } } }
  } });

  const projection = model.settingsProjection?.connectionAuthorization;
  expect(projection?.connections[0]).toMatchObject({ id: "mail-main", displayName: "Work mailbox", providerType: "email", status: "connected", securityRevision: 3 });
  expect(projection?.requests[0]).toMatchObject({
    requestId: "request-1", status: "requested", consumer: { packageId: "opl-relay", displayName: "OPL Relay" },
    connection: { id: "mail-main", displayName: "Work mailbox", securityRevision: 3 }, capabilities: [{ id: "mail.read", label: "mail.read" }]
  });
  expect(projection?.grants[0]).toMatchObject({ grantId: "grant-1", status: "granted", consumer: { packageId: "opl-relay" } });
  expect(projection?.invocations[0]).toMatchObject({ invocationId: "invocation-1", capabilityId: "mail.read", capabilityLabel: "mail.read", disposition: "completed" });
  expect(projection?.availableRelayConnections[0]).toMatchObject({ mailboxRef: "mail-ref", displayName: "Relay account" });
  expect(JSON.stringify(projection)).not.toMatch(/credential-ref|mail\.invalid|must-not-leak|private/);
  expect(model.settingsProjection?.connectionActions.map((action) => action.actionId)).toEqual([
    "connection_access_request_deny", "connection_grant_revoke", "connection_relay_import"
  ]);
});

test("authorization requests fail closed when owner identity or connection binding is incomplete", () => {
  const model = deriveWorkbenchModelFromState({ app_state: { settings_control_center: { app_settings_read_model: { connections: { authorization: {
    surface_kind: "opl_connection_authorization_projection.v1",
    requests: [{ request_id: "request-without-consumer", status: "requested", connection_id: "mail-main" }, { request_id: "request-without-connection", status: "requested", consumer_package_id: "consumer" }]
  } } } } } });
  expect(model.settingsProjection?.connectionAuthorization?.requests).toEqual([]);
});

test("Resources renders pending capabilities, approval, scoped revoke and bounded invocation summaries", () => {
  const state = { app_state: {
    actions: [
      { action_id: "connection_access_request_deny", label: "Deny", payload_fields: ["request_id"] },
      { action_id: "connection_grant_revoke", label: "Revoke", payload_fields: ["grant_id"] },
      { action_id: "connection_relay_import", label: "Import", payload_fields: ["mailbox_ref"] }
    ],
    settings_control_center: { app_settings_read_model: { connections: { authorization: {
      surface_kind: "opl_connection_authorization_projection.v1",
      requests: [{ request_id: "request-1", status: "requested", consumer_package_id: "opl-relay", consumer_display_name: "OPL Relay", connection_id: "mail-main", connection_display_name: "Work mailbox", capability_ids: ["mail.read"], created_at: "2026-11-08T00:00:00Z" }],
      grants: [{ grant_id: "grant-1", request_id: "request-1", status: "granted", consumer_package_id: "research-agent", consumer_display_name: "Research Agent", connection_id: "mail-main", connection_display_name: "Work mailbox", capability_ids: ["mail.read"], created_at: "2026-11-08T00:00:00Z" }],
      invocations: [{ invocation_id: "invocation-1", consumer_package_id: "opl-relay", consumer_display_name: "OPL Relay", connection_id: "mail-main", connection_display_name: "Work mailbox", capability_id: "mail.read", started_at: "2026-11-08T00:01:00Z", disposition: "completed", arguments: { query: "private" } }]
    } } } }
  } };
  const model = deriveWorkbenchModelFromState(state);
  const props = {
    projection: model.settingsProjection!, actionBusyKey: null, dockerDiagnostic: null,
    settings: { locale: "en" } as never, zh: false, capabilityCatalog: { apps: [] } as never,
    capabilityStatus: "ready", refreshRevision: 0, contributions: null, onAction: () => undefined,
    onApproveConnectionAccess: async () => true
  } as never;
  const markup = renderToStaticMarkup(createElement(ResourcesSettingsPage, props));

  expect(markup).toContain("OPL Relay");
  expect(markup).toContain("mail.read");
  expect(markup).toContain("Approve");
  expect(markup).toContain("Revoke");
  expect(markup).toContain("Recent use");
  expect(markup).not.toContain("private");

  const unavailableBridgeMarkup = renderToStaticMarkup(createElement(ResourcesSettingsPage, { ...props, onApproveConnectionAccess: undefined }));
  expect(unavailableBridgeMarkup).not.toContain("Approve");
  expect(unavailableBridgeMarkup).toContain("Deny");
});

test("shared connections explain access and unresolved execution states without exposing protocol values", () => {
  const request = {
    request_id: "request-1", status: "requested", consumer_package_id: "research-agent",
    consumer_display_name: "Research Agent", connection_id: "mail-main", connection_display_name: "Work mailbox",
    capabilities: [{ capability_id: "mail.read", label: "查看邮件", risk: "read" }, { capability_id: "mail.send", label: "发送邮件", risk: "external_write" }]
  };
  const model = deriveWorkbenchModelFromState({ app_state: {
    settings_control_center: { app_settings_read_model: { connections: { authorization: {
      surface_kind: "opl_connection_authorization_projection.v1",
      requests: [request],
      grants: [
        { ...request, grant_id: "grant-1", status: "granted" },
        { ...request, grant_id: "grant-2", status: "granted", stale_reason: "connection_revision_changed" }
      ],
      invocations: [{ invocation_id: "invocation-1", consumer_package_id: "research-agent", consumer_display_name: "Research Agent", connection_id: "mail-main", connection_display_name: "Work mailbox", capability_id: "mail.send", disposition: "unknown_after_dispatch" }]
    } } } }
  } });
  const markup = renderToStaticMarkup(createElement(ConnectionsSection, {
    projection: model.settingsProjection, locale: "zh", actionBusyKey: null, onAction: () => undefined
  }));

  expect(markup).toContain("等待授权");
  expect(markup).toContain("已授权");
  expect(markup).toContain("需要重新授权");
  expect(markup).toContain("执行结果待核对");
  expect(markup).toContain("查看邮件 (读取)");
  expect(markup).toContain("发送邮件 (对外操作)");
  expect(markup).not.toMatch(/unknown_after_dispatch|external_write|connection_revision_changed|>requested<|>granted<|>stale</);
});

test("connection management preserves UUID revisions and offers only owner-backed account choices", () => {
  const state = { app_state: {
    actions: [
      { action_id: "connection_test", label: "Test", payload_fields: ["connection_id"] },
      { action_id: "connection_update", label: "Update", payload_fields: ["connection_id"], confirmation_required: true },
      { action_id: "connection_delete", label: "Delete", payload_fields: ["connection_id"], confirmation_required: true },
      { action_id: "connection_relay_import", label: "Import", payload_fields: ["mailbox_ref"], confirmation_required: true }
    ],
    settings_control_center: { app_settings_read_model: { connections: { default_connection_id: "default", authorization: {
      surface_kind: "opl_connection_authorization_projection.v1",
      connections: [
        { connection_id: "mail", display_name: "Work mail", security_revision: "8d7bb4f0-d39a-4eb6-b88e-15fbd403a047", disabled: true },
        { connection_id: "default", display_name: "Default service", status: "connected" }
      ],
      available_connections: [{ mailbox_ref: "relay-mailbox://opaque", display_name: "Work mail", account_label: "user@example.test" }],
      available_connections_status: "available"
    } } } }
  } };
  const model = deriveWorkbenchModelFromState(state);
  const projection = model.settingsProjection!;
  expect(projection.connectionAuthorization?.connections[0].securityRevision).toBe("8d7bb4f0-d39a-4eb6-b88e-15fbd403a047");
  expect(projection.connectionAuthorization?.defaultConnectionId).toBe("default");
  expect(projection.connectionActions.map(action => action.actionId)).toContain("connection_test");
  expect(projection.connectionActions.find(action => action.actionId === "connection_update")?.confirmationRequired).toBe(true);
  const render = (source: typeof projection) => renderToStaticMarkup(createElement(ConnectionsSection, { projection: source, locale: "en", actionBusyKey: null, onAction: () => undefined }));
  const markup = render(projection);
  expect(markup).toContain("Check configuration");
  expect(markup).toContain("Enable sharing");
  expect(markup).toContain("Disable sharing");
  expect(markup.match(/>Remove sharing</g)).toHaveLength(1);
  expect(markup).toContain("<select");
  expect(markup).toContain("Work mail · user@example.test");
  expect(markup).not.toContain("<input");
  const unavailable = render({ ...projection, connectionAuthorization: { ...projection.connectionAuthorization!, availableRelayConnectionsStatus: "unavailable" } });
  expect(unavailable).toContain("The Relay mailbox list is unavailable");
  expect(unavailable).not.toContain("<select");
  expect(unavailable).not.toContain("<input");
  const empty = render({ ...projection, connectionAuthorization: { ...projection.connectionAuthorization!, availableRelayConnections: [] } });
  expect(empty).toContain("No mailboxes are available to add");
});

test("connection controls dispatch scoped owner actions and reject stale mailbox choices", async () => {
  const browser = new Window({ url: "http://localhost/" });
  const globals = ["window", "document", "HTMLElement", "Node"] as const;
  const originals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "window" ? browser : browser[key] });
  const container = browser.document.createElement("div");
  browser.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  try {
    const actions: SettingsActionRequest[] = [];
    const projection = deriveWorkbenchModelFromState({ app_state: {
      actions: ["connection_test", "connection_update", "connection_delete", "connection_relay_import"].map(action_id => ({
        action_id, label: action_id, payload_fields: [action_id === "connection_relay_import" ? "mailbox_ref" : "connection_id"], confirmation_required: action_id !== "connection_test"
      })),
      settings_control_center: { app_settings_read_model: { connections: { authorization: {
        surface_kind: "opl_connection_authorization_projection.v1",
        connections: [{ connection_id: "mail", display_name: "Work mail", status: "connected", disabled: false }],
        available_connections_status: "available",
        available_connections: [{ mailbox_ref: "relay-mailbox://opaque", display_name: "Work mail" }]
      } } } }
    } }).settingsProjection!;
    const render = () => flushSync(() => root.render(createElement(ConnectionsSection, { projection, locale: "en", actionBusyKey: null, onAction: action => { actions.push(action); } })));
    render();
    const button = (label: string) => {
      const found = Array.from(container.querySelectorAll("button")).find(item => item.textContent === label);
      expect(found).toBeDefined();
      return found!;
    };
    button("Check configuration").click();
    button("Disable sharing").click();
    button("Remove sharing").click();
    expect(actions.map(action => [action.actionId, action.payload, action.confirmationRequired])).toEqual([
      ["connection_test", { connection_id: "mail" }, false],
      ["connection_update", { connection_id: "mail", disabled: true }, true],
      ["connection_delete", { connection_id: "mail" }, true]
    ]);
    expect(button("Add").disabled).toBe(true);
    const select = container.querySelector("select")!;
    flushSync(() => { select.value = "relay-mailbox://opaque"; select.dispatchEvent(new browser.Event("change", { bubbles: true })); });
    button("Add").click();
    expect(actions.at(-1)).toMatchObject({ actionId: "connection_relay_import", payload: { mailbox_ref: "relay-mailbox://opaque" }, confirmationRequired: true });
    projection.connectionAuthorization!.availableRelayConnections = [];
    render();
    expect(button("Add").disabled).toBe(true);
    button("Add").click();
    expect(actions).toHaveLength(4);
  } finally {
    flushSync(() => root.unmount());
    await new Promise(resolve => setImmediate(resolve));
    browser.close();
    for (const key of globals) {
      const previous = originals.get(key);
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
