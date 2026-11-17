import { asBoolean, asNumber, asRecord, asString, createCommandReadback, parseJsonValue } from "./oplBridge-primitives";
import { buildDomainDetailViewCommand, buildDomainDetailViewCommandArgs } from "./oplBridge-commands";
import { normalizeCommandReadback } from "./oplBridge-normalizers-state";
import type {
  OplContributionReadRequest,
  OplContributionReadback,
  OplDomainDetailViewAvailability,
  OplDomainDetailViewCondition,
  OplDomainDetailViewReadRequest,
  OplDomainDetailViewReadback
} from "@gaofeng21cn/opl-host-contracts";

export function normalizeContributionReadback(
  value: unknown,
  request: OplContributionReadRequest
): OplContributionReadback {
  const raw = asRecord(value) ?? {};
  const readback = createCommandReadback(
    asString(raw.command) ?? "opl app contribution read",
    Array.isArray(raw.commandArgs) ? raw.commandArgs.map(String) : [],
    asNumber(raw.exitCode) ?? 0,
    asString(raw.stdout) ?? "",
    asString(raw.stderr) ?? "",
    asBoolean(raw.timedOut) ?? false
  );
  if (readback.timedOut || readback.exitCode !== 0) {
    throw new Error(readback.stderr || "OPL contribution read failed");
  }
  const root = asRecord(raw.parsed)
    ?? asRecord(raw.stdoutJson)
    ?? asRecord(parseJsonValue(readback.stdout))
    ?? raw;
  const envelope = asRecord(root.opl_app_contribution);
  const response = asRecord(envelope?.response);
  if (
    envelope?.surface_kind !== "opl_app_package_contribution.v1"
    || envelope.package_id !== request.packageId
    || envelope.ref !== request.ref
    || envelope.operation !== "read"
    || response?.schema_version !== "opl-package-app-contribution-response.v1"
    || response.ok !== true
    || response.ref !== request.ref
    || response.operation !== "read"
    || !("result" in response)
  ) {
    throw new Error("OPL contribution read returned a stale or malformed response");
  }
  return { packageId: request.packageId, ref: request.ref, result: response.result, readback };
}

const domainDetailViewAvailabilities: OplDomainDetailViewAvailability[] = [
  "available",
  "missing",
  "stale",
  "invalid",
  "read_error"
];

function isDomainDetailViewAvailability(value: unknown): value is OplDomainDetailViewAvailability {
  return typeof value === "string" && domainDetailViewAvailabilities.includes(value as OplDomainDetailViewAvailability);
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function domainDetailCondition(
  availability: OplDomainDetailViewAvailability,
  reason: string,
  message: string
): OplDomainDetailViewCondition {
  return {
    type: "DomainDetailViewAvailable",
    status: availability === "available" ? "True" : availability === "missing" ? "Unknown" : "False",
    reason,
    message
  };
}

function normalizeDomainDetailCondition(value: unknown): OplDomainDetailViewCondition | undefined {
  const record = asRecord(value);
  const type = asString(record?.type);
  const status = asString(record?.status);
  const reason = asString(record?.reason);
  const message = asString(record?.message);
  if (!type || !status || !reason || !message) return undefined;
  return {
    ...record,
    type,
    status,
    reason,
    message
  };
}

function domainDetailViewEnvelope(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  return asRecord(record.opl_domain_detail_view) ?? record;
}

export function createPlaceholderDomainDetailViewReadback(
  request: OplDomainDetailViewReadRequest,
  reason = "bridge_unavailable_placeholder"
): OplDomainDetailViewReadback {
  const commandArgs = buildDomainDetailViewCommandArgs(request);
  const message = reason === "bridge_unavailable_placeholder"
    ? "Domain detail view bridge is unavailable in this host"
    : reason;
  const readback = createCommandReadback(
    buildDomainDetailViewCommand(request),
    commandArgs,
    -1,
    "",
    message,
    false
  );
  return {
    schemaVersion: "opl_domain_detail_view.v1",
    surfaceKind: "opl_domain_detail_view",
    itemId: request.itemId,
    viewId: request.viewId,
    viewKind: "",
    availability: "read_error",
    revision: 0,
    notModified: false,
    payload: null,
    conditions: [domainDetailCondition("read_error", reason, message)],
    readback
  };
}

export function normalizeDomainDetailViewReadback(
  value: unknown,
  request: OplDomainDetailViewReadRequest
): OplDomainDetailViewReadback {
  const commandArgs = buildDomainDetailViewCommandArgs(request);
  const fallbackReadback = createCommandReadback(buildDomainDetailViewCommand(request), commandArgs);
  const raw = asRecord(value) ?? {};
  const readback = raw.readback
    ? normalizeCommandReadback(raw.readback, fallbackReadback.command, fallbackReadback.commandArgs)
    : normalizeCommandReadback(raw, fallbackReadback.command, fallbackReadback.commandArgs);
  if (readback.timedOut || readback.exitCode !== 0) {
    const message = readback.stderr || "OPL domain detail view read failed";
    return {
      ...createPlaceholderDomainDetailViewReadback(request, message),
      readback
    };
  }

  const parsed = asRecord(raw.parsed)
    ?? asRecord(raw.stdoutJson)
    ?? asRecord(parseJsonValue(readback.stdout));
  const envelope = domainDetailViewEnvelope(parsed ?? raw);
  const invalid = (reason: string, message: string): OplDomainDetailViewReadback => ({
    schemaVersion: "opl_domain_detail_view.v1",
    surfaceKind: "opl_domain_detail_view",
    itemId: asString(envelope?.item_id) ?? request.itemId,
    viewId: asString(envelope?.view_id) ?? request.viewId,
    viewKind: asString(envelope?.view_kind) ?? "",
    availability: "invalid",
    revision: nonNegativeInteger(envelope?.revision) ?? 0,
    notModified: false,
    payload: null,
    conditions: [domainDetailCondition("invalid", reason, message)],
    readback
  });

  if (!envelope
    || envelope.schema_version !== "opl_domain_detail_view.v1"
    || envelope.surface_kind !== "opl_domain_detail_view") {
    return invalid("domain_detail_view_envelope_invalid", "OPL domain detail view response is malformed");
  }
  const itemId = asString(envelope.item_id);
  const viewId = asString(envelope.view_id);
  const viewKind = asString(envelope.view_kind);
  const availability = envelope.availability;
  const revision = nonNegativeInteger(envelope.revision);
  const notModified = asBoolean(envelope.not_modified);
  if (!itemId || !viewId || !viewKind || itemId !== request.itemId || viewId !== request.viewId) {
    return invalid("domain_detail_view_identity_mismatch", "OPL domain detail view response does not match the requested view");
  }
  if (!isDomainDetailViewAvailability(availability)
    || revision === undefined
    || notModified === undefined) {
    return invalid("domain_detail_view_shape_invalid", "OPL domain detail view response has invalid transport fields");
  }
  const generation = envelope.generation === undefined ? undefined : nonNegativeInteger(envelope.generation);
  if (envelope.generation !== undefined && generation === undefined) {
    return invalid("domain_detail_view_generation_invalid", "OPL domain detail view generation is invalid");
  }
  if (generation !== undefined && generation !== revision) {
    return invalid("domain_detail_view_generation_mismatch", "OPL domain detail view generation does not match revision");
  }
  const payload = envelope.payload === undefined ? null : envelope.payload;
  if (notModified && payload !== null) {
    return invalid("domain_detail_view_not_modified_payload", "Unchanged domain detail view responses must not include a payload");
  }
  if (availability === "available" && !notModified && payload === null) {
    return invalid("domain_detail_view_payload_missing", "Available domain detail view response is missing its payload");
  }
  const conditions = Array.isArray(envelope.conditions)
    ? envelope.conditions.flatMap((condition) => normalizeDomainDetailCondition(condition) ?? [])
    : [];
  const normalizedConditions = conditions.length
    ? conditions
    : [domainDetailCondition(availability, `domain_detail_view_${availability}`, `Domain detail view is ${availability}`)];
  return {
    schemaVersion: "opl_domain_detail_view.v1",
    surfaceKind: "opl_domain_detail_view",
    itemId,
    viewId,
    viewKind,
    availability,
    revision,
    notModified,
    payload: availability === "available" ? payload : null,
    conditions: normalizedConditions,
    ...(asString(envelope.digest) ? { digest: asString(envelope.digest) } : {}),
    ...(generation !== undefined ? { generation } : {}),
    ...(asString(envelope.payload_schema_ref) ? { payloadSchemaRef: asString(envelope.payload_schema_ref) } : {}),
    ...(asString(envelope.payload_schema) ? { payloadSchema: asString(envelope.payload_schema) } : {}),
    readback
  };
}
