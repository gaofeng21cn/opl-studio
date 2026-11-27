import { asRecord, asString, type OplContributionInput } from "./contributionWireValues.ts";

export type { OplContributionInput } from "./contributionWireValues.ts";
export {
  readChannelAccessResult,
  type OplChannelAccessAction,
  type OplChannelAccessConnection,
  type OplChannelAccessPairing,
  type OplChannelAccessResult,
  type OplChannelAccessUser
} from "./channelAccessProjection.ts";
export {
  OPL_REMOTE_COMPANION_ACCESS_SCHEMA_VERSION,
  OPL_REMOTE_COMPANION_ACCESS_STATUSES,
  readRemoteCompanionAccessResult,
  type OplRemoteCompanionAccessAction,
  type OplRemoteCompanionAccessDevice,
  type OplRemoteCompanionAccessPairing,
  type OplRemoteCompanionAccessResult,
  type OplRemoteCompanionAccessStatus
} from "./remoteCompanionAccessProjection.ts";

export const OPL_UI_CONTRIBUTION_SLOTS = [
  "composer.palette",
  "runtime.detail",
  "settings.section"
] as const;

export type OplUiContributionSlot = (typeof OPL_UI_CONTRIBUTION_SLOTS)[number];
export type OplStudioLocale = "zh" | "en";

export type OplUiLocalizedText = Record<string, string>;

export type OplUiContributionCommand = {
  commandId: string;
  label: OplUiLocalizedText;
  actionRef: string;
  confirmationRequired: boolean;
};

export type OplUiContributionBadge = {
  badgeId: string;
  label: OplUiLocalizedText;
  dataRef: string;
  tone: string;
};

export type OplUiContributionView = {
  viewId: string;
  viewType: string;
  settingsDestination?: OplSettingsContributionDestination;
  title: OplUiLocalizedText;
  dataRef: string;
  emptyState?: OplUiLocalizedText;
};

export type OplUiContribution = {
  contributionKey: string;
  contributionId: string;
  packageId: string;
  slot: OplUiContributionSlot;
  contributionKind: string;
  trustTier: string;
  scope: string;
  sortOrder: number;
  actionBoundary?: string;
  view?: OplUiContributionView;
  commands: OplUiContributionCommand[];
  badges: OplUiContributionBadge[];
};

export type OplUiContributionsProjection = {
  surfaceKind: "opl_app_ui_contributions_projection.v1" | "unavailable";
  entries: OplUiContribution[];
};

/**
 * Settings contributions are placed by their declared view semantics. The
 * client does not inspect package IDs or recreate package-specific policy.
 */
export const OPL_SETTINGS_CONTRIBUTION_DESTINATIONS = [
  "models",
  "resources",
  "workspace",
  "capabilities",
  "services",
  "preferences"
] as const;

export type OplSettingsContributionDestination = (typeof OPL_SETTINGS_CONTRIBUTION_DESTINATIONS)[number];

export type OplSettingsContributionGroup = {
  packageId: string;
  entries: OplUiContribution[];
};

export const OPL_SETTINGS_FORM_SCHEMA_VERSION = "opl-app-settings-form.v1";

export type OplSettingsFormFieldType =
  | "boolean"
  | "enum"
  | "string"
  | "number"
  | "directory"
  | "secret_ref";

export type OplSettingsFormEffectTiming =
  | "immediate"
  | "next_task"
  | "restart_required";

export type OplSettingsFormFieldOption = {
  value: string;
  label: OplUiLocalizedText;
};

export type OplSettingsFormField = {
  fieldId: string;
  fieldType: OplSettingsFormFieldType;
  label: OplUiLocalizedText;
  description?: OplUiLocalizedText;
  placeholder?: OplUiLocalizedText;
  effectTiming: OplSettingsFormEffectTiming;
  required?: boolean;
  readonly?: boolean;
  multiline?: boolean;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  options?: OplSettingsFormFieldOption[];
  secretConfigured?: boolean;
};

export type OplSettingsFormScalar = boolean | string | number | null;

export type OplSettingsFormResult = {
  schemaVersion: typeof OPL_SETTINGS_FORM_SCHEMA_VERSION;
  status?: "ready" | "restart_pending" | "attention" | "unavailable";
  statusMessage?: OplUiLocalizedText;
  submitCommandId?: string;
  fields: OplSettingsFormField[];
  values: Record<string, OplSettingsFormScalar>;
};

const SETTINGS_FORM_FIELD_TYPES = new Set<OplSettingsFormFieldType>([
  "boolean",
  "enum",
  "string",
  "number",
  "directory",
  "secret_ref"
]);

const SETTINGS_FORM_EFFECT_TIMINGS = new Set<OplSettingsFormEffectTiming>([
  "immediate",
  "next_task",
  "restart_required"
]);

export function readSettingsFormResult(value: unknown): OplSettingsFormResult | null {
  const record = asRecord(value);
  if (!record || record.schema_version !== OPL_SETTINGS_FORM_SCHEMA_VERSION || !Array.isArray(record.fields)) {
    return null;
  }
  const fields: OplSettingsFormField[] = [];
  for (const item of record.fields.slice(0, 64)) {
    const field = asRecord(item);
    const fieldId = asString(field?.field_id);
    const fieldType = asString(field?.field_type);
    const effectTiming = asString(field?.effect_timing);
    if (
      !fieldId
      || !fieldType
      || !SETTINGS_FORM_FIELD_TYPES.has(fieldType as OplSettingsFormFieldType)
      || !effectTiming
      || !SETTINGS_FORM_EFFECT_TIMINGS.has(effectTiming as OplSettingsFormEffectTiming)
    ) {
      continue;
    }
    const label = localizedText(field?.label_i18n);
    if (!Object.keys(label).length) continue;
    const description = localizedText(field?.description_i18n);
    const placeholder = localizedText(field?.placeholder_i18n);
    const options = Array.isArray(field?.options)
      ? field.options.slice(0, 64).flatMap((opt): OplSettingsFormFieldOption[] => {
          const option = asRecord(opt);
          const optionValue = asString(option?.value);
          const optionLabel = localizedText(option?.label_i18n);
          return optionValue && Object.keys(optionLabel).length
            ? [{ value: optionValue, label: optionLabel }]
            : [];
        })
      : undefined;
    fields.push({
      fieldId,
      fieldType: fieldType as OplSettingsFormFieldType,
      label,
      ...(Object.keys(description).length ? { description } : {}),
      ...(Object.keys(placeholder).length ? { placeholder } : {}),
      effectTiming: effectTiming as OplSettingsFormEffectTiming,
      ...(field?.required === true ? { required: true } : {}),
      ...(field?.readonly === true ? { readonly: true } : {}),
      ...(field?.multiline === true ? { multiline: true } : {}),
      ...(typeof field?.min === "number" && Number.isFinite(field.min) ? { min: field.min } : {}),
      ...(typeof field?.max === "number" && Number.isFinite(field.max) ? { max: field.max } : {}),
      ...(typeof field?.step === "number" && Number.isFinite(field.step) && field.step > 0 ? { step: field.step } : {}),
      ...(typeof field?.max_length === "number" && Number.isInteger(field.max_length) && field.max_length > 0 ? { maxLength: field.max_length } : {}),
      ...(options?.length ? { options } : {}),
      ...(typeof field?.secret_configured === "boolean" ? { secretConfigured: field.secret_configured } : {})
    });
  }
  const secretIds = new Set(fields.filter(field => field.fieldType === "secret_ref").map(field => field.fieldId));
  const rawValues = asRecord(record.values) ?? {};
  const values: Record<string, OplSettingsFormScalar> = {};
  for (const [key, item] of Object.entries(rawValues).slice(0, 64)) {
    if (secretIds.has(key)) continue;
    if (item === null || typeof item === "boolean" || typeof item === "string" || (typeof item === "number" && Number.isFinite(item))) {
      values[key] = item;
    }
  }
  const statusRaw = asString(record.status);
  const status = statusRaw && ["ready", "restart_pending", "attention", "unavailable"].includes(statusRaw)
    ? statusRaw as OplSettingsFormResult["status"]
    : undefined;
  const statusMessage = localizedText(record.status_message_i18n);
  const submitCommandId = asString(record.submit_command_id) ?? undefined;
  return {
    schemaVersion: OPL_SETTINGS_FORM_SCHEMA_VERSION,
    ...(status ? { status } : {}),
    ...(Object.keys(statusMessage).length ? { statusMessage } : {}),
    ...(submitCommandId ? { submitCommandId } : {}),
    fields,
    values
  };
}

export function settingsContributionDestination(
  entry: Pick<OplUiContribution, "view">
): OplSettingsContributionDestination | null {
  switch (entry.view?.viewType) {
    case "channel_access":
    case "remote_companion_access":
      return "resources";
    case "service_status":
      return "services";
    case "settings_form":
      return entry.view.settingsDestination ?? null;
    case "activity_log":
      // An activity log is a technical read model, not an App-admitted Settings
      // destination. Keep it available to other typed renderers without
      // turning every package's activity view into a service panel.
      return null;
    default:
      return null;
  }
}

/** Installation and catalog roles do not decide user-facing configuration placement. */
export function settingsEntriesForDestination(entries: readonly OplUiContribution[], destination: OplSettingsContributionDestination, developerDetails = false): OplUiContribution[] {
  return entries.filter(entry => entry.slot === "settings.section"
    && (settingsContributionDestination(entry) === destination
      || (developerDetails && destination === "services" && entry.view?.viewType === "activity_log")));
}

/**
 * The desktop App owns the native OPL Link companion surface. Keep the older
 * remote_companion_access projection available to typed consumers and history,
 * but do not mount it beside the native surface in ordinary Settings.
 */
export function settingsEntriesForNativeAppSurface(
  entries: readonly OplUiContribution[],
  destination: OplSettingsContributionDestination,
  developerDetails = false
): OplUiContribution[] {
  return settingsEntriesForDestination(entries, destination, developerDetails)
    .filter((entry) => !(destination === "resources" && entry.view?.viewType === "remote_companion_access"));
}

/** Keeps Package identity as grouping metadata without making it a navigation source. */
export function groupSettingsContributions(entries: readonly OplUiContribution[]): OplSettingsContributionGroup[] {
  const groups = new Map<string, OplUiContribution[]>();
  for (const entry of entries) {
    const group = groups.get(entry.packageId);
    if (group) group.push(entry);
    else groups.set(entry.packageId, [entry]);
  }
  return [...groups.entries()].map(([packageId, group]) => ({ packageId, entries: group }));
}

export const emptyUiContributionsProjection: OplUiContributionsProjection = {
  surfaceKind: "unavailable",
  entries: []
};

export type OplContributionActionOutcome = { status: "succeeded" | "cancelled" | "failed" | "pending"; message?: string; retryable?: boolean; presentation?: { mode: "browser"; url: string } };
export type OplContributionAction = (
  entry: OplUiContribution,
  command: OplUiContributionCommand,
  input?: OplContributionInput,
  preview?: Record<string, unknown>
) => void | Promise<OplContributionActionOutcome>;
export type OplContributionActionRequest = {
  actionId: "package_contribution_execute";
  payload: {
    package_id: string;
    ref: string;
    input: Record<string, unknown>;
    confirmed: boolean;
  };
  dryRun: false;
};
export type OplRuntimeDetailIdentity = {
  agentId: string;
  domainId: string;
  workItemId: string;
  domainWorkItemId: string;
  workItemScopeId: string;
  identityState: "resolved";
};
export type OplContributionSlotOwner = {
  locale: OplStudioLocale;
  actionAvailable: boolean;
  developerDetails?: boolean;
  openSoftwareCenter?(): void;
  pickDirectory?: () => Promise<string | undefined>;
  runtimeDetailIdentity?: OplRuntimeDetailIdentity;
  openRuntimeWorkbench?(viewId?: string): void;
  readData(entry: OplUiContribution, input?: OplContributionInput): Promise<unknown>;
  refreshRevision: number;
  onAction: OplContributionAction;
};

export function createOplContributionReadInput(
  entry: OplUiContribution,
  identity?: OplRuntimeDetailIdentity
) {
  if (entry.slot !== "runtime.detail" || !identity) return undefined;
  return {
    work_item_identity: {
      agent_id: identity.agentId,
      domain_id: identity.domainId,
      work_item_id: identity.workItemId,
      domain_work_item_id: identity.domainWorkItemId,
      work_item_scope_id: identity.workItemScopeId,
      identity_state: identity.identityState
    }
  };
}

// Bind the domain operation to the selection shown when its command was clicked.
// The confirmation can outlive that selection.
export function captureContributionActionInput(
  entry: OplUiContribution,
  input: OplContributionInput,
  identity?: OplRuntimeDetailIdentity
): OplContributionInput | null {
  if (entry.slot !== "runtime.detail" || entry.scope !== "work_item") return input;
  if (!identity || entry.packageId !== identity.agentId) return null;
  const selected = createOplContributionReadInput(entry, identity)?.work_item_identity;
  if (!selected) return null;
  if ("work_item_identity" in input) {
    const supplied = asRecord(input.work_item_identity);
    if (!supplied) return null;
    const target: Record<string, unknown> = selected;
    if (Object.entries(supplied).some(([key, value]) => !Object.hasOwn(target, key) || target[key] !== value)) return null;
  }
  return { ...input, work_item_identity: selected };
}

export type RenderOplContributionSlot = (
  slot: OplUiContributionSlot,
  owner: OplContributionSlotOwner,
  options?: { only?: string }
) => import("react").ReactNode;

export function createOplContributionActionRequest(
  entry: OplUiContribution,
  command: OplUiContributionCommand,
  confirmed: boolean,
  input: OplContributionInput = {}
): OplContributionActionRequest {
  return {
    actionId: "package_contribution_execute",
    payload: {
      package_id: entry.packageId,
      ref: command.actionRef,
      input,
      confirmed
    },
    dryRun: false
  };
}

export function contributionActionOutcome(
  value: unknown, entry: OplUiContribution, command: OplUiContributionCommand
): OplContributionActionOutcome {
  const root = asRecord(value);
  const execution = asRecord(root?.app_action_execution);
  const result = execution ? asRecord(execution.result) : root;
  const envelope = asRecord(result?.opl_app_contribution);
  const response = asRecord(envelope?.response);
  if ((execution && (execution.action_id !== "package_contribution_execute" || execution.dry_run !== false))
    || envelope?.surface_kind !== "opl_app_package_contribution.v1" || envelope.package_id !== entry.packageId
    || envelope.ref !== command.actionRef || envelope.operation !== "execute"
    || response?.schema_version !== "opl-package-app-contribution-response.v1" || response.ref !== command.actionRef
    || response.operation !== "execute" || response.ok !== true || !asRecord(response.result)) {
    return {status: "failed", retryable: false};
  }
  const ownerResult = asRecord(response.result)!;
  if (["queued", "running", "pending", "unknown"].includes(String(ownerResult.execution_status))) return {status: "pending", retryable: false};
  if (ownerResult.ok === false || ["error", "failed", "unsupported", "blocked"].includes(String(ownerResult.status))) return {status: "failed"};
  const presentation = asRecord(ownerResult.presentation);
  if (presentation?.mode === "browser" && typeof presentation.url === "string") {
    try {
      const url = new URL(presentation.url);
      if (!url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) {
        return {status: "succeeded", presentation: {mode: "browser", url: url.href}};
      }
    } catch {}
  }
  return {status: "succeeded"};
}

function localizedText(value: unknown): OplUiLocalizedText {
  const record = asRecord(value);
  if (!record) return {};
  return Object.fromEntries(Object.entries(record).flatMap(([locale, text]) => {
    const normalized = asString(text);
    return normalized ? [[locale, normalized]] : [];
  }));
}

function parseCommand(value: unknown): OplUiContributionCommand | null {
  const command = asRecord(value);
  const commandId = asString(command?.command_id);
  const actionRef = asString(command?.action_ref);
  if (!commandId || !actionRef) return null;
  return {
    commandId,
    label: localizedText(command?.label_i18n),
    actionRef,
    confirmationRequired: command?.confirmation_required === true
  };
}

function parseBadge(value: unknown): OplUiContributionBadge | null {
  const badge = asRecord(value);
  const badgeId = asString(badge?.badge_id);
  const dataRef = asString(badge?.data_ref);
  if (!badgeId || !dataRef) return null;
  return {
    badgeId,
    label: localizedText(badge?.label_i18n),
    dataRef,
    tone: asString(badge?.tone) ?? "neutral"
  };
}

function parseView(value: unknown): OplUiContributionView | undefined {
  const view = asRecord(value);
  const viewId = asString(view?.view_id);
  const viewType = asString(view?.view_type);
  const dataRef = asString(view?.data_ref);
  if (!viewId || !viewType || !dataRef) return undefined;
  const rawDest = asString(view?.settings_destination);
  const settingsDestination = rawDest && OPL_SETTINGS_CONTRIBUTION_DESTINATIONS.includes(rawDest as OplSettingsContributionDestination)
    ? rawDest as OplSettingsContributionDestination
    : undefined;
  const emptyState = localizedText(view?.empty_state_i18n);
  return {
    viewId,
    viewType,
    ...(settingsDestination ? { settingsDestination } : {}),
    title: localizedText(view?.title_i18n),
    dataRef,
    ...(Object.keys(emptyState).length ? { emptyState } : {})
  };
}

function parseEntry(value: unknown): OplUiContribution | null {
  const entry = asRecord(value);
  const contributionKey = asString(entry?.contribution_key);
  const contributionId = asString(entry?.contribution_id);
  const packageId = asString(entry?.package_id);
  const slot = asString(entry?.slot);
  if (
    !contributionKey
    || !contributionId
    || !packageId
    || contributionKey !== `${packageId}:${contributionId}`
    || !slot
    || !OPL_UI_CONTRIBUTION_SLOTS.includes(slot as OplUiContributionSlot)
  ) return null;

  const view = parseView(entry?.view);
  const actionBoundary = asString(entry?.action_boundary);
  return {
    contributionKey,
    contributionId,
    packageId,
    slot: slot as OplUiContributionSlot,
    contributionKind: asString(entry?.contribution_kind) ?? "unknown",
    trustTier: asString(entry?.trust_tier) ?? "unknown",
    scope: asString(entry?.scope) ?? "root",
    sortOrder: typeof entry?.sort_order === "number" && Number.isFinite(entry.sort_order)
      ? entry.sort_order
      : 0,
    ...(actionBoundary ? { actionBoundary } : {}),
    ...(view ? { view } : {}),
    commands: Array.isArray(entry?.commands)
      ? entry.commands.map(parseCommand).filter((command): command is OplUiContributionCommand => command !== null)
      : [],
    badges: Array.isArray(entry?.badges)
      ? entry.badges.map(parseBadge).filter((badge): badge is OplUiContributionBadge => badge !== null)
      : []
  };
}

export function readUiContributionsProjection(state: unknown): OplUiContributionsProjection {
  const root = asRecord(state);
  const appState = asRecord(root?.app_state) ?? root;
  const projection = asRecord(appState?.ui_contributions);
  if (projection?.surface_kind !== "opl_app_ui_contributions_projection.v1") {
    return emptyUiContributionsProjection;
  }

  const packages = asRecord(appState?.agent_packages);
  const directory = asRecord(packages?.directory);
  const statusPackages = asRecord(asRecord(packages?.status_index)?.packages);
  const appEnabled = new Map<string, boolean>();
  for (const [packageId, value] of Object.entries(statusPackages ?? {})) {
    const row = asRecord(value);
    if (typeof row?.app_enabled === "boolean") appEnabled.set(packageId, row.app_enabled);
  }
  for (const value of Array.isArray(directory?.entries) ? directory.entries : []) {
    const row = asRecord(value);
    const packageId = asString(row?.package_id);
    if (packageId && typeof row?.app_enabled === "boolean") appEnabled.set(packageId, row.app_enabled);
  }
  const entries = Array.isArray(projection.entries)
    ? projection.entries.map(parseEntry).filter((entry): entry is OplUiContribution => entry !== null && appEnabled.get(entry.packageId) !== false)
    : [];
  return {
    surfaceKind: "opl_app_ui_contributions_projection.v1",
    entries: entries.sort((left, right) => (
      left.sortOrder - right.sortOrder
      || left.packageId.localeCompare(right.packageId)
      || left.contributionId.localeCompare(right.contributionId)
    ))
  };
}

export function contributionLabel(text: OplUiLocalizedText, locale: OplStudioLocale, fallback: string): string {
  const preferred = locale === "zh"
    ? ["zh-CN", "zh", "en-US", "en"]
    : ["en-US", "en", "zh-CN", "zh"];
  return preferred.map((key) => text[key]).find(Boolean)
    ?? Object.values(text).find(Boolean)
    ?? fallback;
}
