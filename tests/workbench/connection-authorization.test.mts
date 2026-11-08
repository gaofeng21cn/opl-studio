import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveWorkbenchModelFromState } from "../../src/workbench/workbenchModel";
import { ResourcesSettingsPage } from "../../src/workbench/settings/pages/ResourcesSettingsPage";

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
