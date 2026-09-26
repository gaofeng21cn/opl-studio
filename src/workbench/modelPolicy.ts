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
  defaultReasoningEffort?: string;
  supportedReasoningEfforts: string[];
};

export type ResolvedCodexModelOption = ModelOption & {
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

export const codexModelPolicy = {
  source: policy.source,
  defaultModel: injectedDefaultModel,
  defaultReasoningEffort: injectedDefaultReasoningEffort,
  knownModelReasoningEffortOverrides,
  acceptUnknownCatalogDefault: policy.acceptUnknownCatalogDefault,
  useHighestSupportedReasoningForUnknown: policy.useHighestSupportedReasoningForUnknown,
  modelOptions,
  reasoningOptions,
  autoLabel
};

function catalogModelGroup(
  catalog: CodexCatalogCapability[],
  modelId: CodexModelId
): CodexCatalogCapability[] {
  const aliases = new Set([modelId]);
  let previousSize = -1;
  while (aliases.size !== previousSize) {
    previousSize = aliases.size;
    for (const item of catalog) {
      const itemAliases = [item.id, item.model].filter(isModelId);
      if (!itemAliases.some((alias) => aliases.has(alias))) continue;
      for (const alias of itemAliases) aliases.add(alias);
    }
  }
  return catalog.filter((item) => [item.id, item.model]
    .filter(isModelId)
    .some((alias) => aliases.has(alias)));
}

export function resolveCodexModelOptions(catalog: CodexCatalogCapability[]): ResolvedCodexModelOption[] {
  const knownGroups = codexModelPolicy.modelOptions.map((option) => ({
    option,
    runtimes: catalogModelGroup(catalog, option.id)
  }));
  const knownOptions = knownGroups.map(({ option, runtimes }) => {
    const catalogDefault = runtimes.find((item) => item.isDefault === true);
    const runtime = catalogDefault
      ?? runtimes.find((item) => item.id === option.id || item.model === option.id)
      ?? runtimes[0];
    const supportedReasoningEfforts = [...new Set(runtimes
      .flatMap((item) => item.supportedReasoningEfforts)
      .filter(isReasoningEffort))];
    const isAppDefault = option.id === codexModelPolicy.defaultModel;
    const configuredReasoningEffort = codexModelPolicy.knownModelReasoningEffortOverrides[option.id]
      ?? (isAppDefault ? codexModelPolicy.defaultReasoningEffort : undefined);
    return {
      ...option,
      available: isAppDefault || supportedReasoningEfforts.length > 0,
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

  const unknownCatalogDefault = catalog.find((item) =>
    item.isDefault === true
    && !knownGroups.some(({ runtimes }) => runtimes.includes(item))
  );
  if (!unknownCatalogDefault || !codexModelPolicy.acceptUnknownCatalogDefault) return knownOptions;

  const supportedReasoningEfforts = unknownCatalogDefault.supportedReasoningEfforts.filter(isReasoningEffort);
  const defaultReasoningEffort = codexModelPolicy.useHighestSupportedReasoningForUnknown
    ? supportedReasoningEfforts.at(-1)
    : undefined;
  const label = unknownCatalogDefault.displayName?.trim() || unknownCatalogDefault.id;
  return [...knownOptions, {
    id: unknownCatalogDefault.id,
    label_zh: label,
    label_en: label,
    available: true,
    known: false,
    isCatalogDefault: true,
    defaultReasoningEffort:
      defaultReasoningEffort
      ?? (isReasoningEffort(unknownCatalogDefault.defaultReasoningEffort)
        ? unknownCatalogDefault.defaultReasoningEffort
        : codexModelPolicy.defaultReasoningEffort),
    supportedReasoningEfforts: supportedReasoningEfforts.length
      ? supportedReasoningEfforts
      : [codexModelPolicy.defaultReasoningEffort]
  }];
}

export function resolveCodexSelection(
  options: ResolvedCodexModelOption[],
  selection: CodexModelSelection,
  requestedReasoning: CodexReasoningEffort
) {
  // OPL Auto is product-owned. Codex's provider-local `isDefault` may point at
  // a local/custom model (for example deepseek-flash), but that must not
  // replace the OPL App default Astra policy for ordinary OPL sessions.
  const defaultModel = options.find((option) => option.id === codexModelPolicy.defaultModel)
    ?? options.find((option) => option.available)
    ?? options[0]!;
  const requestedModel = options.find((option) => option.id === selection);
  const effectiveSelection = selection;
  const model = selection === "__auto"
    ? defaultModel
    : requestedModel?.available ? requestedModel : undefined;
  if (!model) {
    return {
      model: undefined,
      reasoningEffort: codexModelPolicy.defaultReasoningEffort,
      reasoningOptions: [codexModelPolicy.defaultReasoningEffort],
      effectiveSelection
    };
  }
  const reasoningOptions = selection === "__auto"
    ? model.known ? [...codexModelPolicy.reasoningOptions] : model.supportedReasoningEfforts
    : model.supportedReasoningEfforts;
  const reasoningEffort = selection === "__auto"
    ? model.known
      ? codexModelPolicy.knownModelReasoningEffortOverrides[model.id] ?? codexModelPolicy.defaultReasoningEffort
      : model.defaultReasoningEffort
    : reasoningOptions.includes(requestedReasoning)
      ? requestedReasoning
      : reasoningOptions.at(-1) ?? model.defaultReasoningEffort;
  return { model, reasoningEffort, reasoningOptions, effectiveSelection };
}

export function modelLabel(model: CodexModelId, locale: WorkbenchLocale): string {
  const option = codexModelPolicy.modelOptions.find((item) => item.id === model);
  return locale === "zh" ? option?.label_zh ?? model : option?.label_en ?? model;
}

export function autoModelLabel(locale: WorkbenchLocale): string {
  return codexModelPolicy.autoLabel[locale];
}

export function conversationModelLabel(
  selection: CodexModelSelection,
  resolvedModel: CodexModelId | undefined,
  locale: WorkbenchLocale
): string {
  return selection === "__auto"
    ? autoModelLabel(locale)
    : modelLabel(selection, locale);
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
