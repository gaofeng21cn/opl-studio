export type CodexModelId = string;
export type CodexModelSelection = "__auto" | CodexModelId;
export type CodexReasoningEffort = string;
export type WorkbenchLocale = "zh" | "en";

type ModelOption = {
  id: CodexModelId;
  label_zh: string;
  label_en: string;
};

type CodexCatalogCapability = {
  id: string;
  model?: string;
  displayName?: string;
  isDefault?: boolean;
  hidden?: boolean;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts: string[];
};

export type ResolvedCodexModelOption = ModelOption & {
  /**
   * The executable model name advertised by the live catalog. A catalog row
   * may use a display/identity id that differs from the wire model name.
   */
  wireModel: CodexModelId;
  available: boolean;
  known: boolean;
  isCatalogDefault: boolean;
  defaultReasoningEffort: CodexReasoningEffort;
  supportedReasoningEfforts: CodexReasoningEffort[];
};

type InjectedModelPolicy = {
  source?: string;
  defaultModel?: string;
  defaultReasoningEffort?: string;
  visibleModels?: Array<{ id?: string; label_zh?: string; label_en?: string }>;
  reasoningEfforts?: string[];
  autoLabel?: { zh?: string; en?: string };
  knownModelReasoningEffortOverrides?: Record<string, string>;
  acceptUnknownCatalogDefault?: boolean;
  useHighestSupportedReasoningForUnknown?: boolean;
  customModelAccess?: {
    defaultEnabled: false;
    label: { zh: string; en: string };
    description: { zh: string; en: string };
  };
};

declare global {
  var __OPL_CODEX_MODEL_POLICY__: InjectedModelPolicy | undefined;
}

function isModelId(value: unknown): value is CodexModelId {
  return typeof value === "string" && value.trim().length > 0;
}

function isReasoningEffort(value: unknown): value is CodexReasoningEffort {
  return typeof value === "string" && value.trim().length > 0;
}

function injectedPolicy(): InjectedModelPolicy | undefined {
  return globalThis.__OPL_CODEX_MODEL_POLICY__;
}

function invalidPolicy(field: string): never {
  throw new Error(`invalid App-owned Codex model policy injection: ${field}`);
}

function requiredInjectedPolicy(): InjectedModelPolicy {
  return injectedPolicy() ?? invalidPolicy("policy is missing");
}

function normalizedModelOptions(policy: InjectedModelPolicy): ModelOption[] {
  if (!policy?.visibleModels?.length || !policy.visibleModels.every((option) => isModelId(option?.id))) {
    return invalidPolicy("visibleModels must be a non-empty model list");
  }
  if (new Set(policy.visibleModels.map((option) => option.id)).size !== policy.visibleModels.length) {
    return invalidPolicy("visibleModels must contain unique ids");
  }
  return policy.visibleModels.map((option) => ({
    id: option.id as CodexModelId,
    label_zh: typeof option.label_zh === "string" && option.label_zh.trim() ? option.label_zh : option.id as string,
    label_en: typeof option.label_en === "string" && option.label_en.trim() ? option.label_en : option.id as string
  }));
}

function normalizedReasoningOptions(policy: InjectedModelPolicy): CodexReasoningEffort[] {
  if (!policy?.reasoningEfforts?.length || !policy.reasoningEfforts.every(isReasoningEffort)) {
    return invalidPolicy("reasoningEfforts must be a non-empty effort list");
  }
  return [...policy.reasoningEfforts] as CodexReasoningEffort[];
}

const policy = requiredInjectedPolicy();
const modelOptions = normalizedModelOptions(policy);
const reasoningOptions = normalizedReasoningOptions(policy);
const autoLabel = {
  zh: isReasoningEffort(policy.autoLabel?.zh) ? policy.autoLabel.zh : invalidPolicy("autoLabel.zh must be a non-empty string"),
  en: isReasoningEffort(policy.autoLabel?.en) ? policy.autoLabel.en : invalidPolicy("autoLabel.en must be a non-empty string")
};
const injectedDefaultModel = policy?.defaultModel;
const injectedDefaultReasoningEffort = policy?.defaultReasoningEffort;
if (!isModelId(injectedDefaultModel) || !modelOptions.some((option) => option.id === injectedDefaultModel)) {
  invalidPolicy("defaultModel must reference visibleModels");
}
if (!isReasoningEffort(injectedDefaultReasoningEffort) || !reasoningOptions.includes(injectedDefaultReasoningEffort)) {
  invalidPolicy("defaultReasoningEffort must reference reasoningEfforts");
}
if (typeof policy.source !== "string" || !policy.source.trim()) {
  invalidPolicy("source must identify the App authority");
}
if (typeof policy.acceptUnknownCatalogDefault !== "boolean") {
  invalidPolicy("acceptUnknownCatalogDefault must be boolean");
}
if (typeof policy.useHighestSupportedReasoningForUnknown !== "boolean") {
  invalidPolicy("useHighestSupportedReasoningForUnknown must be boolean");
}
if (!policy.knownModelReasoningEffortOverrides || typeof policy.knownModelReasoningEffortOverrides !== "object") {
  invalidPolicy("knownModelReasoningEffortOverrides must be an object");
}
if (!Object.entries(policy.knownModelReasoningEffortOverrides)
  .every(([model, effort]) => isModelId(model) && isReasoningEffort(effort))) {
  invalidPolicy("knownModelReasoningEffortOverrides must map model ids to reasoning efforts");
}
const knownModelReasoningEffortOverrides = Object.fromEntries(
  Object.entries(policy.knownModelReasoningEffortOverrides)
);
const customModelAccess = policy.customModelAccess;
if (!customModelAccess || customModelAccess.defaultEnabled !== false
  || !isModelId(customModelAccess.label?.zh) || !isModelId(customModelAccess.label?.en)
  || !isModelId(customModelAccess.description?.zh) || !isModelId(customModelAccess.description?.en)) {
  invalidPolicy("customModelAccess must declare default-off access and localized labels");
}

export const codexModelPolicy = {
  source: policy.source,
  defaultModel: injectedDefaultModel,
  defaultReasoningEffort: injectedDefaultReasoningEffort,
  knownModelReasoningEffortOverrides,
  acceptUnknownCatalogDefault: policy.acceptUnknownCatalogDefault,
  useHighestSupportedReasoningForUnknown: policy.useHighestSupportedReasoningForUnknown,
  customModelAccess: customModelAccess!,
  modelOptions,
  reasoningOptions,
  autoLabel
};

function catalogAliases(item: CodexCatalogCapability): CodexModelId[] {
  return [item.id, item.model].filter(isModelId);
}

function catalogModelGroup(
  catalog: CodexCatalogCapability[],
  modelId: CodexModelId
): CodexCatalogCapability[] {
  const aliases = new Set([modelId]);
  let previousSize = -1;
  while (aliases.size !== previousSize) {
    previousSize = aliases.size;
    for (const item of catalog) {
      const itemAliases = catalogAliases(item);
      if (!itemAliases.some((alias) => aliases.has(alias))) continue;
      for (const alias of itemAliases) aliases.add(alias);
    }
  }
  return catalog.filter((item) => catalogAliases(item).some((alias) => aliases.has(alias)));
}

function supportedReasoningEffortsOf(catalog: CodexCatalogCapability[]): CodexReasoningEffort[] {
  return [...new Set(catalog
    .flatMap((item) => item.supportedReasoningEfforts)
    .filter(isReasoningEffort))];
}

function automaticModel(options: ResolvedCodexModelOption[]): ResolvedCodexModelOption | undefined {
  // `catalog_without_default_policy: first_available_known_model_otherwise_unavailable`.
  // The App default keeps its route only while the live catalog advertises it.
  const appDefault = options.find((option) =>
    option.id === codexModelPolicy.defaultModel && option.available
  );
  if (appDefault) return appDefault;
  return options.find((option) => option.known && option.available);
}

export function resolveCodexModelOptions(
  catalogInput: CodexCatalogCapability[],
  customModelAccessEnabled: boolean = codexModelPolicy.customModelAccess.defaultEnabled
): ResolvedCodexModelOption[] {
  // Discovery success is decided by the raw response. A response that only
  // contains hidden models is still a successful discovery, but contributes no
  // selectable route; only a truly empty response keeps the App fallback.
  const catalogAvailable = catalogInput.length > 0;
  // `catalog_hidden_model_policy: exclude_hidden_models_from_auto_and_fixed_options`.
  // Hidden rows are removed before grouping, aliasing, capability projection,
  // claiming and unknown-option construction so they cannot leak any metadata.
  const catalog = catalogInput.filter((item) => item.hidden !== true);
  const knownGroups = codexModelPolicy.modelOptions.map((option) => ({
    option,
    runtimes: catalogModelGroup(catalog, option.id)
  }));
  const knownOptions = knownGroups.map(({ option, runtimes }) => {
    const catalogDefault = runtimes.find((item) => item.isDefault === true);
    const runtime = catalogDefault
      ?? runtimes.find((item) => item.id === option.id || item.model === option.id)
      ?? runtimes[0];
    const supportedReasoningEfforts = supportedReasoningEffortsOf(runtimes);
    const isAppDefault = option.id === codexModelPolicy.defaultModel;
    const configuredReasoningEffort = codexModelPolicy.knownModelReasoningEffortOverrides[option.id]
      ?? (isAppDefault ? codexModelPolicy.defaultReasoningEffort : undefined);
    return {
      ...option,
      wireModel: runtime?.model ?? runtime?.id ?? option.id,
      // An empty catalog means discovery is unavailable, so the App default
      // stays the offline fallback. A non-empty catalog is authoritative for
      // availability and may omit the App default entirely.
      available: catalogAvailable ? runtimes.length > 0 : isAppDefault,
      known: true,
      isCatalogDefault: Boolean(catalogDefault),
      defaultReasoningEffort: configuredReasoningEffort
        ? configuredReasoningEffort
        : isReasoningEffort(runtime?.defaultReasoningEffort)
        && supportedReasoningEfforts.includes(runtime.defaultReasoningEffort)
          ? runtime.defaultReasoningEffort
          : supportedReasoningEfforts.at(-1) ?? codexModelPolicy.defaultReasoningEffort,
      supportedReasoningEfforts: isAppDefault
        ? [...codexModelPolicy.reasoningOptions]
        : supportedReasoningEfforts.length
          ? supportedReasoningEfforts
          : [codexModelPolicy.defaultReasoningEffort]
    };
  });

  // Custom catalog membership grants a fixed choice only after explicit opt-in.
  // Auto always resolves independently from App-admitted known models.
  if (!customModelAccessEnabled) return knownOptions;
  // Aliases already claimed by a known group are not repeated.
  const claimedIds = new Set<string>();
  for (const { option, runtimes } of knownGroups) {
    claimedIds.add(option.id);
    for (const item of runtimes) {
      for (const alias of catalogAliases(item)) claimedIds.add(alias);
    }
  }
  const unclaimed = catalog.filter((item) =>
    !catalogAliases(item).some((alias) => claimedIds.has(alias))
  );
  const catalogOptions: ResolvedCodexModelOption[] = [];
  const consumed = new Set<CodexCatalogCapability>();
  for (const item of unclaimed) {
    if (consumed.has(item)) continue;
    const seedId = catalogAliases(item)[0];
    if (!seedId) continue;
    const group = catalogModelGroup(unclaimed, seedId);
    for (const member of group) consumed.add(member);
    const representative = group.find((member) => member.isDefault === true) ?? group[0]!;
    const id = catalogAliases(representative)[0];
    if (!id) continue;
    const supportedReasoningEfforts = supportedReasoningEffortsOf(group);
    const label = representative.displayName?.trim() || id;
    const advertisedDefault = isReasoningEffort(representative.defaultReasoningEffort)
      ? representative.defaultReasoningEffort
      : undefined;
    // `unknown_model_reasoning_effort_policy: highest_supported_reasoning_effort_from_catalog`
    // makes the last advertised effort win for models outside the App frontier.
    const defaultReasoningEffort = codexModelPolicy.useHighestSupportedReasoningForUnknown
      ? supportedReasoningEfforts.at(-1) ?? codexModelPolicy.defaultReasoningEffort
      : advertisedDefault && supportedReasoningEfforts.includes(advertisedDefault)
        ? advertisedDefault
        : codexModelPolicy.defaultReasoningEffort;
    catalogOptions.push({
      id,
      wireModel: representative.model ?? representative.id ?? id,
      label_zh: label,
      label_en: label,
      available: true,
      known: false,
      isCatalogDefault: group.some((member) => member.isDefault === true),
      defaultReasoningEffort,
      supportedReasoningEfforts: supportedReasoningEfforts.length
        ? supportedReasoningEfforts
        : [codexModelPolicy.defaultReasoningEffort]
    });
  }
  return [...knownOptions, ...catalogOptions];
}

export function resolveCodexSelection(
  options: ResolvedCodexModelOption[],
  selection: CodexModelSelection,
  requestedReasoning: CodexReasoningEffort
) {
  const requestedModel = options.find((option) => option.id === selection);
  const effectiveSelection = selection;
  const model = selection === "__auto"
    ? automaticModel(options)
    : requestedModel?.available ? requestedModel : undefined;
  if (!model) {
    return {
      model: undefined,
      reasoningEffort: codexModelPolicy.defaultReasoningEffort,
      reasoningOptions: [codexModelPolicy.defaultReasoningEffort],
      effectiveSelection
    };
  }
  const autoUsesAppDefault = model.id === codexModelPolicy.defaultModel;
  const reasoningOptions = selection === "__auto"
    ? autoUsesAppDefault ? [...codexModelPolicy.reasoningOptions] : model.supportedReasoningEfforts
    : model.supportedReasoningEfforts;
  const autoReasoningEffort = autoUsesAppDefault
    ? codexModelPolicy.knownModelReasoningEffortOverrides[model.id] ?? codexModelPolicy.defaultReasoningEffort
    : model.defaultReasoningEffort;
  const reasoningEffort = selection === "__auto"
    ? reasoningOptions.includes(autoReasoningEffort)
      ? autoReasoningEffort
      : reasoningOptions.at(-1) ?? autoReasoningEffort
    : reasoningOptions.includes(requestedReasoning)
      ? requestedReasoning
      : reasoningOptions.at(-1) ?? model.defaultReasoningEffort;
  return { model, reasoningEffort, reasoningOptions, effectiveSelection };
}

export function modelLabel(
  model: CodexModelId,
  locale: WorkbenchLocale,
  options?: readonly ResolvedCodexModelOption[]
): string {
  const resolved = options?.find((item) => item.id === model);
  if (resolved) return locale === "zh" ? resolved.label_zh : resolved.label_en;
  const option = codexModelPolicy.modelOptions.find((item) => item.id === model);
  return locale === "zh" ? option?.label_zh ?? model : option?.label_en ?? model;
}

export function autoModelLabel(locale: WorkbenchLocale): string {
  return codexModelPolicy.autoLabel[locale];
}

export function conversationModelLabel(
  selection: CodexModelSelection,
  resolvedModel: CodexModelId | undefined,
  locale: WorkbenchLocale,
  options?: readonly ResolvedCodexModelOption[]
): string {
  return selection === "__auto"
    ? autoModelLabel(locale)
    : modelLabel(selection, locale, options);
}

export function reasoningLabel(effort: CodexReasoningEffort, locale: WorkbenchLocale, compact = false): string {
  const labels = {
    zh: {
      low: compact ? "低" : "推理低",
      medium: compact ? "中" : "推理中",
      high: compact ? "高" : "推理高",
      xhigh: compact ? "超高" : "推理超高",
      max: compact ? "最大" : "推理最大",
      ultra: compact ? "极高" : "推理极高"
    },
    en: {
      low: compact ? "Low" : "Low reasoning",
      medium: compact ? "Medium" : "Medium reasoning",
      high: compact ? "High" : "High reasoning",
      xhigh: compact ? "Extra high" : "Extra high reasoning",
      max: compact ? "Max" : "Maximum reasoning",
      ultra: compact ? "Ultra" : "Ultra reasoning"
    }
  } as const;
  return labels[locale][effort as keyof (typeof labels)[typeof locale]] ?? effort;
}
