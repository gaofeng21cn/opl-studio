import { customModelAccessFixture } from "../../scripts/model-policy-fixture.ts";
import { describe, expect, test } from "bun:test";

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
  buildDomainDetailViewCommandArgs,
  createBrowserBridge,
  createPlaceholderDomainDetailViewReadback,
  normalizeDomainDetailViewReadback
} = await import("../../plugins/opl-studio-client/src/client/bridge/oplBridge.ts");

const request = {
  itemId: "project:one:study-one",
  viewId: "research-roadmap",
  ifRevision: 6
};

const availableEnvelope = {
  schema_version: "opl_domain_detail_view.v1",
  surface_kind: "opl_domain_detail_view",
  item_id: request.itemId,
  view_id: request.viewId,
  view_kind: "research-roadmap",
  availability: "available",
  revision: 7,
  generation: 7,
  not_modified: false,
  digest: "sha256:test",
  payload_schema_ref: "contracts/schemas/v2/research-roadmap.json",
  payload_schema: "research-roadmap.v2",
  payload: { revision: 7, current_focus: { node_id: "route-authoring" } },
  conditions: [{
    type: "DomainDetailViewAvailable",
    status: "True",
    reason: "domain_detail_source_available",
    message: "domain detail source available",
    owner: "framework"
  }]
};

describe("domain detail bridge", () => {
  test("builds the independent item/view read command", () => {
    expect(buildDomainDetailViewCommandArgs(request)).toEqual([
      "opl", "app", "view", "read", "--item-id", request.itemId,
      "--view-id", request.viewId, "--if-revision", "6", "--json"
    ]);
  });

  test("normalizes an owner envelope without interpreting its payload", () => {
    const readback = normalizeDomainDetailViewReadback({
      stdout: JSON.stringify(availableEnvelope),
      command: "opl app view read",
      exitCode: 0,
      stderr: "",
      timedOut: false
    }, request);
    expect(readback.availability).toBe("available");
    expect(readback.viewKind).toBe("research-roadmap");
    expect(readback.revision).toBe(7);
    expect(readback.payload).toEqual(availableEnvelope.payload);
    expect(readback.conditions[0]?.owner).toBe("framework");
    expect(readback.readback.commandArgs).toEqual(buildDomainDetailViewCommandArgs(request));
    expect(readback.payloadSchemaRef).toBe(availableEnvelope.payload_schema_ref);
  });

  test("retains the transport envelope for unchanged reads", () => {
    const readback = normalizeDomainDetailViewReadback({
      stdoutJson: { ...availableEnvelope, not_modified: true, payload: null },
      readback: { command: "opl app view read", exitCode: 0, stdout: "", stderr: "", timedOut: false }
    }, request);
    expect(readback.notModified).toBe(true);
    expect(readback.payload).toBeNull();
    expect(readback.availability).toBe("available");
  });

  test("downgrades command failures, malformed envelopes, and identity drift locally", () => {
    expect(normalizeDomainDetailViewReadback({
      command: "opl app view read",
      exitCode: 2,
      stdout: "",
      stderr: "source missing",
      timedOut: false
    }, request).availability).toBe("read_error");
    expect(normalizeDomainDetailViewReadback({ stdoutJson: { ...availableEnvelope, item_id: "other" } }, request).availability).toBe("invalid");
    expect(normalizeDomainDetailViewReadback({ stdoutJson: { ...availableEnvelope, generation: 8 } }, request).availability).toBe("invalid");
  });

  test("browser bridge keeps a missing native method as a view-local read error", async () => {
    delete (globalThis as typeof globalThis & { window?: unknown }).window;
    const readback = await createBrowserBridge().readDomainDetailView(request);
    expect(readback).toEqual(createPlaceholderDomainDetailViewReadback(request));
    expect(readback.availability).toBe("read_error");
    expect(readback.readback.commandArgs).toEqual(buildDomainDetailViewCommandArgs(request));
  });
});
