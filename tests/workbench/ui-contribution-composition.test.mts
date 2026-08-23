import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  OPL_UI_CONTRIBUTION_SLOTS,
  createOplContributionActionRequest,
  createOplContributionReadInput,
  groupSettingsContributions,
  readChannelAccessResult,
  readRemoteCompanionAccessResult,
  readUiContributionsProjection,
  settingsContributionDestination,
  type OplUiContributionsProjection
} from "../../src/composition/contributionProjection.ts";

(globalThis as typeof globalThis & { __OPL_CODEX_MODEL_POLICY__?: unknown }).__OPL_CODEX_MODEL_POLICY__ = {
  source: "test-fixture",
  defaultModel: "codex-fixture",
  defaultReasoningEffort: "high",
  visibleModels: [{ id: "codex-fixture", label_zh: "Fixture", label_en: "Fixture" }],
  reasoningEfforts: ["high"],
  autoLabel: { zh: "自动（推荐）", en: "Auto (recommended)" },
  knownModelReasoningEffortOverrides: { "codex-fixture": "high" },
  acceptUnknownCatalogDefault: true,
  useHighestSupportedReasoningForUnknown: true
};

const { normalizeContributionReadback } = await import("../../src/bridge/oplBridge.ts");
const { OplStudioDshSlotHost } = await import("../../src/composition/dshSlotHost.tsx");
const { buildServiceStatusSummary } = await import("../../src/composition/contributionComponents.tsx");
const { resolveCodexModelOptions } = await import("../../src/workbench/modelPolicy.ts");

const projectionState = {
  app_state: {
    ui_contributions: {
      surface_kind: "opl_app_ui_contributions_projection.v1",
      entries: [{
        contribution_key: "mas:research-roadmap",
        contribution_id: "research-roadmap",
        package_id: "mas",
        slot: "runtime.detail",
        contribution_kind: "view",
        trust_tier: "declarative",
        scope: "work_item",
        sort_order: 20,
        action_boundary: "opl app action execute --json",
        view: {
          view_id: "roadmap",
          view_type: "task_board",
          title_i18n: { "en-US": "Research roadmap", "zh-CN": "研究路线图" },
          data_ref: "mas.research-roadmap.v1#current",
          command_ids: ["refresh"],
          badge_ids: ["health"]
        },
        commands: [{
          command_id: "refresh",
          label_i18n: { "en-US": "Refresh" },
          action_ref: "mas.research-roadmap.v1#refresh",
          confirmation_required: false
        }],
        badges: [{
          badge_id: "health",
          label_i18n: { "en-US": "Ready" },
          data_ref: "mas.research-roadmap.v1#health",
          tone: "success"
        }]
      }, {
        contribution_key: "mag:grant-actions",
        contribution_id: "grant-actions",
        package_id: "mag",
        slot: "composer.palette",
        contribution_kind: "command_group",
        trust_tier: "trusted_first_party_renderer",
        scope: "root",
        sort_order: 10,
        plugin_discovery: "forbidden",
        plugin_install: "forbidden",
        registry: "forbidden",
        currentness: "forbidden",
        release_operation: "forbidden",
        task_truth: "forbidden",
        package_truth: "forbidden",
        product_truth: "forbidden",
        commands: [{
          command_id: "start",
          label_i18n: { "en-US": "Start grant" },
          action_ref: "mag.grant.v1#start",
          confirmation_required: true
        }],
        badges: []
      }, {
        contribution_key: "forged:identity",
        contribution_id: "grant-actions",
        package_id: "mag",
        slot: "settings.section",
        contribution_kind: "command_group",
        trust_tier: "declarative",
        scope: "root",
        sort_order: 15,
        commands: [],
        badges: []
      }, {
        contribution_key: "hostile:overlay",
        contribution_id: "overlay",
        package_id: "hostile",
        slot: "shell.overlay",
        contribution_kind: "command_group",
        trust_tier: "trusted_first_party_renderer",
        scope: "root",
        sort_order: 0,
        component: "arbitrary-component",
        commands: [{
          command_id: "execute",
          label_i18n: { "en-US": "Execute" },
          action_ref: "hostile.overlay.v1#execute",
          confirmation_required: false,
          handler: "arbitrary-handler"
        }],
        badges: []
      }]
    }
  }
};

describe("OPL Studio DSH contribution composition", () => {
  test("routes settings contributions by declared view semantics", () => {
    expect(settingsContributionDestination({ view: { viewId: "wechat", viewType: "channel_access", title: {}, dataRef: "wechat#state" } })).toBe("resources");
    expect(settingsContributionDestination({ view: { viewId: "opl-link", viewType: "remote_companion_access", title: {}, dataRef: "opl-link#state" } })).toBe("resources");
    expect(settingsContributionDestination({ view: { viewId: "local-service", viewType: "service_status", title: {}, dataRef: "local-service#state" } })).toBe("services");
    expect(settingsContributionDestination({ view: { viewId: "fleet", viewType: "activity_log", title: {}, dataRef: "fleet#state" } })).toBeNull();
    expect(settingsContributionDestination({ view: { viewId: "capability", viewType: "table", title: {}, dataRef: "capability#state" } })).toBe("capabilities");
  });

  test("shows service status in Services while hiding technical activity logs", () => {
    const projection = readUiContributionsProjection({
      ui_contributions: {
        surface_kind: "opl_app_ui_contributions_projection.v1",
        entries: [
          {
            contribution_key: "opl-fleet-agent:fleet.agent.telemetry-settings",
            contribution_id: "fleet.agent.telemetry-settings",
            package_id: "opl-fleet-agent",
            slot: "settings.section",
            contribution_kind: "view",
            trust_tier: "declarative",
            scope: "root",
            sort_order: 300,
            view: { view_id: "fleet.agent.telemetry", view_type: "service_status", title_i18n: { "en-US": "Local Fleet Agent telemetry" }, data_ref: "fleet.agent.telemetry.v1#local" },
            commands: [],
            badges: []
          },
          {
            contribution_key: "opl-fleet-agent:fleet.agent.doctor-settings",
            contribution_id: "fleet.agent.doctor-settings",
            package_id: "opl-fleet-agent",
            slot: "settings.section",
            contribution_kind: "view",
            trust_tier: "declarative",
            scope: "root",
            sort_order: 310,
            view: { view_id: "fleet.agent.doctor", view_type: "service_status", title_i18n: { "en-US": "Local Fleet Agent doctor" }, data_ref: "fleet.agent.doctor.v1#current" },
            commands: [],
            badges: []
          },
          {
            contribution_key: "legacy-fleet-agent:activity",
            contribution_id: "activity",
            package_id: "legacy-fleet-agent",
            slot: "settings.section",
            contribution_kind: "view",
            trust_tier: "declarative",
            scope: "root",
            sort_order: 320,
            view: { view_id: "fleet.activity", view_type: "activity_log", title_i18n: { "en-US": "Fleet activity" }, data_ref: "fleet.activity#current" },
            commands: [],
            badges: []
          },
          {
            contribution_key: "opl-channel-weixin:access",
            contribution_id: "access",
            package_id: "opl-channel-weixin",
            slot: "settings.section",
            contribution_kind: "view",
            trust_tier: "declarative",
            scope: "root",
            sort_order: 30,
            view: { view_id: "weixin.access", view_type: "channel_access", title_i18n: { "en-US": "WeChat" }, data_ref: "weixin.access#current" },
            commands: [],
            badges: []
          },
          {
            contribution_key: "generic-package:overview",
            contribution_id: "overview",
            package_id: "generic-package",
            slot: "settings.section",
            contribution_kind: "view",
            trust_tier: "declarative",
            scope: "root",
            sort_order: 40,
            view: { view_id: "generic.overview", view_type: "task_board", title_i18n: { "en-US": "Overview" }, data_ref: "generic.overview#current" },
            commands: [],
            badges: []
          },
          {
            contribution_key: "generic-package:details",
            contribution_id: "details",
            package_id: "generic-package",
            slot: "settings.section",
            contribution_kind: "view",
            trust_tier: "declarative",
            scope: "root",
            sort_order: 50,
            view: { view_id: "generic.details", view_type: "artifact_view", title_i18n: { "en-US": "Details" }, data_ref: "generic.details#current" },
            commands: [],
            badges: []
          }
        ]
      }
    });
    const fleetEntries = projection.entries.filter((entry) => entry.packageId === "opl-fleet-agent");
    expect(fleetEntries).toHaveLength(2);
    expect(fleetEntries.every((entry) => settingsContributionDestination(entry) === "services")).toBe(true);

    const activityEntry = projection.entries.find((entry) => entry.packageId === "legacy-fleet-agent");
    expect(activityEntry && settingsContributionDestination(activityEntry)).toBeNull();

    const weixinEntry = projection.entries.find((entry) => entry.packageId === "opl-channel-weixin");
    expect(weixinEntry && settingsContributionDestination(weixinEntry)).toBe("resources");

    const groups = groupSettingsContributions(projection.entries.filter((entry) => settingsContributionDestination(entry) === "capabilities"));
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ packageId: "generic-package" });
    expect(groups[0]?.entries.map((entry) => entry.contributionId)).toEqual(["overview", "details"]);
  });

  test("summarizes service status without exposing operational payload fields by default", () => {
    const summary = buildServiceStatusSummary({
      freshness: { state: "fresh", last_observed_at: "2026-08-19T02:43:36.431Z" },
      native_carrier: { availability: "available", status: "ready" },
      node: { display_name: "Local development Mac", platform: "macOS" },
      observed_at: "2026-08-19T02:43:38.533Z",
      payload: {
        collection_status: "available",
        doctor_state: "healthy",
        host_cpu_percent: 61.0465,
        checks: [
          { check_id: "provider", state: "pass" },
          { check_id: "collection", state: "pass" },
          { check_id: "optional-source", state: "unavailable" }
        ]
      }
    }, "zh");
    expect(summary).toMatchObject({ state: "done", statusLabel: "运行正常" });
    expect(summary.fields).toEqual(expect.arrayContaining([
      { id: "native-carrier", label: "本机载体", value: "可用 · 已就绪" },
      { id: "freshness", label: "新鲜度", value: "最新" },
      { id: "node", label: "本机", value: "Local development Mac · macOS" },
      { id: "collection", label: "数据采集", value: "可用" },
      { id: "doctor", label: "诊断", value: "正常" },
      { id: "checks", label: "检查结果", value: "2 项通过，1 项暂不可用" }
    ]));
    expect(JSON.stringify(summary)).not.toContain("host_cpu_percent");
    expect(JSON.stringify(summary)).not.toContain("check_id");
    expect(JSON.stringify(summary)).not.toContain("active_conversation_count");
  });

  test("registers each static list-slot occupant with a stable id", () => {
    const host = new OplStudioDshSlotHost();
    expect(host.core.entries("shell.overlay")).toHaveLength(1);
    expect(host.core.snapshot("shell.overlay")[0]?.occupants[0]?.id).toBe("opl-studio-overlay");
    expect(host.core.entries("conversation.input.dock")).toHaveLength(1);
    expect(host.core.snapshot("conversation.input.dock")[0]?.occupants[0]).toMatchObject({
      id: "queue",
      order: 20,
      registrant: "dsh-ui-conversation"
    });
  });

  test("normalizes Framework projection without importing executable plugin fields", () => {
    const projection = readUiContributionsProjection(projectionState);
    expect(OPL_UI_CONTRIBUTION_SLOTS).toEqual(["composer.palette", "runtime.detail", "settings.section"]);
    expect(projection.surfaceKind).toBe("opl_app_ui_contributions_projection.v1");
    expect(projection.entries.map((entry) => entry.contributionKey)).toEqual([
      "mag:grant-actions",
      "mas:research-roadmap"
    ]);
    expect(projection.entries[1]?.view?.dataRef).toBe("mas.research-roadmap.v1#current");
    expect(projection.entries[1]?.actionBoundary).toBe("opl app action execute --json");
    expect(projection.entries[1]?.commands[0]?.actionRef).toBe("mas.research-roadmap.v1#refresh");
    expect(Object.keys(projection.entries[1]?.commands[0] ?? {}).sort()).toEqual([
      "actionRef",
      "commandId",
      "confirmationRequired",
      "label"
    ]);
    expect(projection.entries.some((entry) => entry.contributionKey === "hostile:overlay")).toBe(false);
    expect(projection.entries.some((entry) => entry.contributionKey === "forged:identity")).toBe(false);
    expect(JSON.stringify(projection)).not.toMatch(/component|handler|javascript|html|url|plugin|registry|currentness|release_operation|task_truth|package_truth|product_truth/i);
  });

  test("uses DSH registration and disposer lifecycle for projection changes", () => {
    const host = new OplStudioDshSlotHost();
    const projection = readUiContributionsProjection(projectionState);
    host.replaceHostDerivedProjection(projection);

    expect(host.core.entries("runtime.detail")).toHaveLength(1);
    expect(host.core.entries("composer.palette")).toHaveLength(1);
    expect(host.core.snapshot("runtime.detail")[0]?.occupants[0]?.registrant).toBe("mas");

    host.replaceHostDerivedProjection({
      surfaceKind: "opl_app_ui_contributions_projection.v1",
      entries: projection.entries.filter((entry) => entry.slot === "runtime.detail")
    });
    expect(host.core.entries("composer.palette")).toHaveLength(0);
    expect(host.core.entries("runtime.detail")).toHaveLength(1);

    host.clearProjection();
    expect(host.core.entries("runtime.detail")).toHaveLength(0);
  });

  test("contains a failed contribution at its DSH entry boundary", () => {
    const host = new OplStudioDshSlotHost();
    host.replaceHostDerivedProjection(readUiContributionsProjection(projectionState));
    const entry = host.core.entries("runtime.detail")[0];
    expect(entry).toBeDefined();

    host.core.reportEntryError("runtime.detail", entry!, new Error("fixture crash"), { abdicate: true });
    expect(host.core.entries("runtime.detail")).toHaveLength(1);
    expect(host.core.entriesOfSlot("runtime.detail")).toHaveLength(0);
    expect(host.core.entriesOfSlot("composer.palette")).toHaveLength(1);
    host.clearProjection();
  });

  test("keeps malformed or absent projections unavailable", () => {
    const unavailable: OplUiContributionsProjection = readUiContributionsProjection({ app_state: {} });
    expect(unavailable).toEqual({ surfaceKind: "unavailable", entries: [] });
  });

  test("validates channel_access results and preserves only scoped contribution action input", () => {
    const result = readChannelAccessResult({
      schema_version: "opl-app-channel-access.v1",
      status: "available",
      channel_id: "weixin",
      connection: {
        state: "qr_ready",
        qr_challenge: { payload: "data:image/png;base64,fixture", expires_at_ms: 2_000 }
      },
      actions: [{ command_id: "disconnect", input: { channel_id: "weixin" } }],
      pending_pairings: [{
        pairing_id: "pairing-1",
        display_name: "Researcher",
        requested_at_ms: 1_000,
        expires_at_ms: 3_000,
        actions: [{ command_id: "approve", input: { channel_id: "weixin", pairing_id: "pairing-1" } }]
      }],
      authorized_users: [{
        user_id: "user-1",
        display_name: "Editor",
        authorized_at_ms: 900,
        actions: [{ command_id: "revoke", input: { channel_id: "weixin", user_id: "user-1" } }]
      }],
      refresh_after_ms: 1_000
    });
    expect(result?.channelId).toBe("weixin");
    expect(result?.pendingPairings[0]?.actions[0]?.input).toEqual({ channel_id: "weixin", pairing_id: "pairing-1" });
    expect(result?.authorizedUsers[0]?.actions[0]?.input).toEqual({ channel_id: "weixin", user_id: "user-1" });

    const projection = readUiContributionsProjection(projectionState);
    const entry = projection.entries[0]!;
    const command = entry.commands[0]!;
    expect(createOplContributionActionRequest(entry, command, true, { channel_id: "weixin" }).payload).toEqual({
      package_id: entry.packageId,
      ref: command.actionRef,
      input: { channel_id: "weixin" },
      confirmed: true
    });
    expect(createOplContributionReadInput(projection.entries.find((candidate) => candidate.slot === "runtime.detail")!, {
      agentId: "mas",
      domainId: "medautoscience",
      workItemId: "002-dm-china-us-mortality-attribution",
      domainWorkItemId: "002-dm-china-us-mortality-attribution",
      workItemScopeId: "project:test:002-dm-china-us-mortality-attribution",
      identityState: "resolved"
    })).toEqual({
      work_item_identity: {
        agent_id: "mas",
        domain_id: "medautoscience",
        work_item_id: "002-dm-china-us-mortality-attribution",
        domain_work_item_id: "002-dm-china-us-mortality-attribution",
        work_item_scope_id: "project:test:002-dm-china-us-mortality-attribution",
        identity_state: "resolved"
      }
    });
    expect(readChannelAccessResult({
      schema_version: "opl-app-channel-access.v1",
      status: "available",
      channel_id: "weixin",
      connection: { state: "connected" },
      actions: [{ command_id: "disconnect", input: { channel_id: "weixin", secret: "forbidden" } }],
      pending_pairings: [],
      authorized_users: []
    })).toBeNull();
    expect(readChannelAccessResult({
      schema_version: "opl-app-channel-access.v1",
      status: "available",
      channel_id: "weixin",
      connection: { state: "connected" },
      actions: [],
      pending_pairings: [{
        pairing_id: "pairing-1",
        requested_at_ms: 1_000,
        expires_at_ms: 3_000,
        actions: [{ command_id: "approve", input: { channel_id: "weixin", user_id: "wrong-scope" } }]
      }],
      authorized_users: []
    })).toBeNull();
    expect(readChannelAccessResult({
      schema_version: "opl-app-channel-access.v1",
      status: "unavailable",
      channel_id: "weixin",
      unavailable_reason: "producer_absent",
      refresh_after_ms: 1_000
    })).toBeNull();
  });

  test("parses the closed remote_companion_access result contract and keeps invalid states local", () => {
    const actions = [
      { command_id: "pair.start", input: { invitation_code: "invite-once", display_name: "Desktop" } },
      { command_id: "pair.refresh", input: { pairing_id: "pair-001" } },
      { command_id: "pair.confirm", input: { pairing_id: "pair-001", authentication_digits: "123456" } },
      { command_id: "pair.cancel", input: { pairing_id: "pair-001" } },
      { command_id: "device.rename", input: { device_id: "ios-001", display_name: "Phone" } },
      { command_id: "pair.revoke", input: { pairing_id: "pair-001" } }
    ];
    const qrReady = readRemoteCompanionAccessResult({
      schema_version: "opl-app-remote-companion-access.v1",
      status: "qr_ready",
      pairing: {
        pairing_id: "pair-001",
        expires_at: "2026-08-19T12:00:00Z",
        manual_code: "0123456789AB",
        qr_payload: "opllink://pair?payload=temporary"
      },
      actions,
      refresh_after_ms: 1_000
    });
    expect(qrReady).toMatchObject({
      schemaVersion: "opl-app-remote-companion-access.v1",
      status: "qr_ready",
      pairing: { pairingId: "pair-001", manualCode: "0123456789AB", qrPayload: "opllink://pair?payload=temporary" }
    });
    expect(qrReady?.actions.map((action) => action.commandId)).toEqual([
      "pair.start",
      "pair.refresh",
      "pair.confirm",
      "pair.cancel",
      "device.rename",
      "pair.revoke"
    ]);

    const active = readRemoteCompanionAccessResult({
      schema_version: "opl-app-remote-companion-access.v1",
      status: "active",
      pairing: { pairing_id: "pair-001", expires_at: "2026-08-19T12:00:00Z" },
      devices: [{
        device_id: "desktop-001",
        device_type: "desktop",
        display_name: "Desktop",
        authorization_state: "authorized",
        last_activity_at: "2026-08-19T11:59:00Z"
      }],
      actions
    });
    expect(active?.devices?.[0]).toMatchObject({ deviceId: "desktop-001", authorizationState: "authorized" });

    expect(readRemoteCompanionAccessResult({
      schema_version: "opl-app-remote-companion-access.v1",
      status: "qr_ready",
      pairing: {
        pairing_id: "pair-001",
        expires_at: "2026-08-19T12:00:00Z",
        manual_code: "0123456789AB",
        qr_payload: "qr",
        authentication_digits: "123456"
      },
      actions
    })).toBeNull();
    expect(readRemoteCompanionAccessResult({
      schema_version: "opl-app-remote-companion-access.v1",
      status: "active",
      pairing: { pairing_id: "pair-001", expires_at: "2026-08-19T12:00:00Z" },
      devices: [{
        device_id: "desktop-001",
        device_type: "desktop",
        display_name: "Desktop",
        authorization_state: "authorized",
        last_activity_at: null,
        claim_secret: "forbidden"
      }],
      actions: []
    })).toBeNull();
  });

  test("collapses alias-linked catalog rows into one App-owned model option", () => {
    const options = resolveCodexModelOptions([{
      id: "codex-fixture",
      model: "codex-fixture-canonical",
      displayName: "Legacy alias",
      isDefault: false,
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["high"]
    }, {
      id: "codex-fixture-canonical",
      model: "codex-fixture-current",
      displayName: "Current catalog default",
      isDefault: true,
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["high"]
    }]);

    expect(options.map((option) => option.id)).toEqual(["codex-fixture"]);
    expect(options[0]).toMatchObject({ known: true, isCatalogDefault: true, available: true });
  });

  test("accepts only the current Framework contribution read identity", () => {
    const request = { packageId: "mas", ref: "mas.research-roadmap.v1#current" };
    const response = {
      command: "opl app contribution read",
      exitCode: 0,
      stdout: JSON.stringify({
        opl_app_contribution: {
          surface_kind: "opl_app_package_contribution.v1",
          package_id: request.packageId,
          ref: request.ref,
          operation: "read",
          response: {
            schema_version: "opl-package-app-contribution-response.v1",
            ok: true,
            ref: request.ref,
            operation: "read",
            result: { hypotheses: ["Current hypothesis"], roadmap: ["Validate"] }
          }
        }
      })
    };
    expect(normalizeContributionReadback(response, request).result).toEqual({
      hypotheses: ["Current hypothesis"],
      roadmap: ["Validate"]
    });
    expect(() => normalizeContributionReadback(response, { ...request, ref: "mas.research-roadmap.v1#stale" })).toThrow(/stale or malformed/);
  });

  test("renders non-image channel payloads with the maintained QR component", () => {
    const source = readFileSync(
      new URL("../../src/composition/contributionComponents.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(/import \{ QRCodeSVG \} from "qrcode\.react"/);
    expect(source).toMatch(/<QRCodeSVG/);
    expect(source).toMatch(/value=\{qr\.payload\}/);
    expect(source).not.toMatch(/<code>\{qr\.payload\}<\/code>/);
  });

  test("keeps remote pairing material in transient component state and routes actions through the owner bridge", () => {
    const source = readFileSync(
      new URL("../../src/composition/contributionComponents.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(/viewType === "remote_companion_access"/);
    expect(source).toMatch(/readRemoteCompanionAccessResult/);
    expect(source).toMatch(/owner\.onAction\(entry, command, input\)/);
    expect(source).toMatch(/useState\(""\)/);
    expect(source).toMatch(/<QRCodeSVG\s+value=\{qrPayload\}/);
    expect(source).not.toMatch(/localStorage/);
    expect(source).not.toMatch(/console\.(log|warn|error)/);
    expect(source).toMatch(/function remoteCompanionActionKey/);

    const appSource = readFileSync(new URL("../../src/workbench/App.tsx", import.meta.url), "utf8");
    expect(appSource).toMatch(/function contributionReceiptForDisplay/);
    expect(appSource).toMatch(/setLastDryRun\(formatReceipt\(contributionReceiptForDisplay\(entry, receipt\)\)\)/);
  });
});
