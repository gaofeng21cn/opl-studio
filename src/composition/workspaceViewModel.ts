import type { OplUiContribution, OplUiContributionCommand } from "./contributionProjection";

export const WORKSPACE_VIEW_TYPES = new Set(["list_detail", "timeline", "approval_diff", "activity_log"]);

export function workspaceEntries(entries: readonly OplUiContribution[]): OplUiContribution[] {
  return entries.filter(entry => entry.slot === "settings.section" && entry.scope === "root"
    && entry.contributionKind === "view" && entry.view && WORKSPACE_VIEW_TYPES.has(entry.view.viewType));
}

export function workspaceGroups(entries: readonly OplUiContribution[]) {
  const groups = new Map<string, OplUiContribution[]>();
  for (const entry of workspaceEntries(entries)) {
    const family = entry.view!.dataRef.split(".")[0];
    const key = ["personal", "communications", "knowledge"].includes(family) ? family : "other";
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups].map(([key, entries]) => ({ key, entries }));
}

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export type WorkspaceField = {
  type: "string" | "string_list" | "object" | "boolean" | "integer" | "number";
  required: boolean;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  options?: { value: string; label: Record<string, string> }[];
};
export type WorkspaceCommandInput = { fields: Record<string, WorkspaceField>; defaults: Record<string, unknown> };
export type WorkspaceCollection = {
  items: Record<string, unknown>[];
  commandInputs: Record<string, WorkspaceCommandInput>;
  collectionActions: Record<string, unknown>[];
  readInput: WorkspaceCommandInput;
  pagination?: { offset: number; limit: number; total: number; hasMore: boolean };
  state: "ready" | "input_required" | "unavailable";
  reason: string;
};

function readFields(value: unknown): Record<string, WorkspaceField> {
  const fields: Record<string, WorkspaceField> = {};
  for (const [name, raw] of Object.entries(record(value) ?? {})) {
    const candidate = record(raw);
    if (!candidate) continue;
    const type = candidate.type === "string[]" ? "string_list" : candidate.type;
    if (!["string", "string_list", "object", "boolean", "integer", "number"].includes(String(type))) continue;
    const options = Array.isArray(candidate.options) ? candidate.options.flatMap(raw => {
      const option = record(raw);
      return typeof option?.value === "string" ? [{value: option.value, label: record(option.label_i18n) as Record<string, string> ?? {}}] : [];
    }) : undefined;
    fields[name] = {type: type as WorkspaceField["type"], required: candidate.required === true,
      ...(Array.isArray(candidate.enum) ? {enum: candidate.enum.filter((item): item is string => typeof item === "string")} : {}),
      ...(typeof candidate.minimum === "number" ? {minimum: candidate.minimum} : {}),
      ...(typeof candidate.maximum === "number" ? {maximum: candidate.maximum} : {}),
      ...(options?.length ? {options} : {})};
  }
  return fields;
}

function schemaDefaults(value: unknown): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record(value) ?? {}).flatMap(([name, raw]) => {
    const field = record(raw);
    return field && field.default !== undefined ? [[name, field.default]] : [];
  }));
}

export function workspaceReadInput(spec: WorkspaceCommandInput, input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => {
    const field = spec.fields[key];
    return field && value !== undefined && !(field.type === "string" && !field.required && value === "");
  }));
}

export function readWorkspaceCollection(value: unknown): WorkspaceCollection | null {
  const root = record(value);
  if (!root) return null;
  const envelope = record(root.result) ?? root;
  const data = record(envelope.data) ?? (Array.isArray(envelope.items) ? envelope : null);
  const readInput = {fields: readFields(envelope.input_schema), defaults: {...schemaDefaults(envelope.input_schema), ...record(envelope.input_defaults)}};
  const unavailable = envelope.state && envelope.state !== "ready";
  if (!unavailable && (!data || !Array.isArray(data.items))) return null;
  const commandInputs: Record<string, WorkspaceCommandInput> = {};
  const inputs = record(data?.command_inputs) ?? record(envelope.command_inputs) ?? {};
  for (const [ref, raw] of Object.entries(inputs)) {
    const spec = record(raw);
    const schema = record(spec?.input_schema);
    if (!schema) continue;
    commandInputs[ref] = { fields: readFields(schema), defaults: {...schemaDefaults(schema), ...record(spec?.defaults)} };
  }
  const page = record(data?.pagination);
  const pagination = page && [page.offset, page.limit, page.total].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)
    ? {offset: Number(page.offset), limit: Number(page.limit), total: Number(page.total), hasMore: page.has_more === true} : undefined;
  return {items: (Array.isArray(data?.items) ? data.items : []).map(record).filter((item): item is Record<string, unknown> => item !== null), commandInputs,
    collectionActions: (Array.isArray(data?.collection_actions) ? data.collection_actions : []).map(record).filter((item): item is Record<string, unknown> => item !== null),
    readInput, ...(pagination ? {pagination} : {}), state: envelope.state === "input_required" ? "input_required" : unavailable ? "unavailable" : "ready",
    reason: unavailable ? String(envelope.reason ?? envelope.state) : ""};
}

export function itemIdentity(item: Record<string, unknown>, index: number): string {
  return String(item.id ?? item.proposal_id ?? item.item_id ?? item.memory_id ?? item.entity_id ?? item.context_id ?? item.draft_ref ?? item.source_ref ?? index);
}

export function itemTitle(item: Record<string, unknown>, index: number, locale: "zh" | "en" = "en"): string {
  const labels = record(item.label_i18n) ?? record(item.title_i18n);
  const localized = labels?.[locale === "zh" ? "zh-CN" : "en-US"];
  if (typeof localized === "string" && localized.trim()) return localized;
  return String(item.title ?? item.display_name ?? item.name ?? item.summary ?? itemIdentity(item, index));
}

export function itemSummary(item: Record<string, unknown>, locale: "zh" | "en"): string {
  const localized = record(item.summary_i18n)?.[locale === "zh" ? "zh-CN" : "en-US"];
  return typeof localized === "string" && localized.trim() ? localized : String(item.summary ?? "");
}

export function declaredItemActions(item: Record<string, unknown>, commands: readonly OplUiContributionCommand[]) {
  const actions = Array.isArray(item.actions) ? item.actions : [];
  return actions.flatMap(value => {
    const action = record(value);
    const command = commands.find(candidate => candidate.actionRef === action?.action_ref);
    const input = record(action?.input);
    const labels = record(action?.label_i18n);
    const actionLabel = Object.fromEntries(Object.entries(labels ?? {}).filter(([, text]) => typeof text === "string")) as Record<string, string>;
    return command && input ? [{ command, input, ...(Object.keys(actionLabel).length ? {label: actionLabel} : {}) }] : [];
  });
}

export function parseWorkspaceInput(fields: Record<string, WorkspaceField>, values: Record<string, string | boolean>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) {
    const raw = values[name];
    if (field.type === "string_list" && raw === "") {
      if (field.required) input[name] = [];
      continue;
    }
    if (raw === undefined || raw === "") {
      if (field.required) throw new Error(`${name}: required`);
      continue;
    }
    if (field.type === "boolean") {
      if (typeof raw !== "boolean") throw new Error(`${name}: invalid boolean`);
      input[name] = raw;
    } else if (field.type === "object") {
      const parsed: unknown = JSON.parse(String(raw));
      if (!record(parsed)) throw new Error(`${name}: expected object`);
      input[name] = parsed;
    } else if (field.type === "string_list") {
      input[name] = String(raw).split("\n").map(line => line.trim()).filter(Boolean);
    } else if (field.type === "number" || field.type === "integer") {
      const number = Number(raw);
      if (!Number.isFinite(number) || (field.type === "integer" && !Number.isInteger(number))) throw new Error(`${name}: invalid number`);
      if ((field.minimum !== undefined && number < field.minimum) || (field.maximum !== undefined && number > field.maximum)) throw new Error(`${name}: out of range`);
      input[name] = number;
    } else {
      const text = String(raw);
      if (field.enum && !field.enum.includes(text)) throw new Error(`${name}: invalid option`);
      if (!text.trim()) throw new Error(`${name}: required`);
      input[name] = text;
    }
  }
  return input;
}
