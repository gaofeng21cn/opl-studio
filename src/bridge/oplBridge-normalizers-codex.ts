import { asBoolean, asNumber, asRecord, asString } from "./oplBridge-primitives";
import type {
  CodexCapabilityCatalog,
  CodexInstalledCapability,
  CodexMessageRequest,
  CodexMessageResponse,
  CodexModelCatalog,
  CodexPermissionProfileCatalog,
  CodexPickedInput
} from "./oplBridge-types-codex-workspace";

export function normalizeCodexModelCatalog(value: unknown): CodexModelCatalog {
  const record = asRecord(value);
  const data = Array.isArray(record?.data) ? record.data : Array.isArray(record?.models) ? record.models : [];
  const models = data.flatMap((item) => {
    const model = asRecord(item);
    const id = asString(model?.id) ?? asString(model?.model);
    if (!id) return [];
    const reasoning = Array.isArray(model?.supportedReasoningEfforts)
      ? model.supportedReasoningEfforts.flatMap((option) => {
        if (typeof option === "string") return option ? [option] : [];
        const effort = asString(asRecord(option)?.reasoningEffort);
        return effort ? [effort] : [];
      })
      : [];
    return [{
      id,
      model: asString(model?.model) ?? id,
      displayName: asString(model?.displayName) ?? id,
      isDefault: asBoolean(model?.isDefault) ?? false,
      hidden: asBoolean(model?.hidden) ?? false,
      defaultReasoningEffort: asString(model?.defaultReasoningEffort) ?? reasoning.at(-1) ?? "medium",
      supportedReasoningEfforts: reasoning
    }];
  });
  return {
    source: models.length ? "codex_app_server_model_list" : "bridge_unavailable",
    models,
    simulated: models.length ? undefined : true
  };
}



export function normalizeSendMessageResponse(value: unknown, request: CodexMessageRequest): CodexMessageResponse {
  const record = asRecord(value);
  const threadId = asString(record?.threadId) ?? request.threadId;
  const turnId = asString(record?.turnId) ?? (threadId ? `${threadId}:simulated-turn` : "simulated-turn");
  const completed = asRecord(record?.completed) ?? {
    turn: {
      id: turnId,
      status: "preview_only"
    }
  };
  return {
    executor: "codex_app_server",
    transport: "stdio_json_rpc",
    threadId,
    turnId,
    finalMessage: asString(record?.finalMessage) ?? "Preview-only browser placeholder reply. Native bridge unavailable.",
    eventCount: asNumber(record?.eventCount) ?? 0,
    completed,
    cwd: asString(record?.cwd),
    simulated: asBoolean(record?.simulated) ?? !record
  };
}



function normalizeInstalledCapability(value: unknown): CodexInstalledCapability | null {
  const record = asRecord(value);
  const id = asString(record?.id);
  if (!record || !id) return null;
  const interfaceRecord = asRecord(record.interface);
  return {
    id,
    name: asString(record.name) ?? asString(record.runtimeName) ?? asString(interfaceRecord?.displayName) ?? id,
    description: asString(record.description) ?? asString(interfaceRecord?.shortDescription) ?? "",
    enabled: asBoolean(record.enabled) ?? asBoolean(record.isEnabled) ?? false,
    callable: asBoolean(record.callable) ?? (asBoolean(record.installed) === true && asBoolean(record.enabled) === true)
  };
}

export function normalizeCodexCapabilityCatalog(value: unknown): CodexCapabilityCatalog {
  const record = asRecord(value);
  const skills = Array.isArray(record?.skills) ? record.skills.flatMap((value) => {
    const skill = asRecord(value);
    const name = asString(skill?.name);
    const path = asString(skill?.path);
    return name && path ? [{
      name,
      path,
      description: asString(skill?.description) ?? asString(skill?.shortDescription) ?? "",
      enabled: asBoolean(skill?.enabled) ?? true,
      scope: asString(skill?.scope) ?? "unknown"
    }] : [];
  }) : [];
  const plugins = Array.isArray(record?.plugins)
    ? record.plugins.flatMap((value) => normalizeInstalledCapability(value) ?? [])
    : [];
  const apps = Array.isArray(record?.apps)
    ? record.apps.flatMap((value) => normalizeInstalledCapability(value) ?? [])
    : [];
  const uniqueBy = <Item,>(items: Item[], key: (item: Item) => string): Item[] => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const identity = key(item).trim().toLowerCase();
      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  };
  return {
    source: record ? "codex_app_server" : "bridge_unavailable",
    skills: uniqueBy(skills, (item) => item.name),
    plugins: uniqueBy(plugins, (item) => item.id),
    apps: uniqueBy(apps, (item) => item.id),
    errors: Array.isArray(record?.errors) ? record.errors.map(String) : [],
    simulated: asBoolean(record?.simulated) ?? !record
  };
}

export function normalizeCodexPermissionProfileCatalog(value: unknown): CodexPermissionProfileCatalog {
  const record = asRecord(value);
  const values = Array.isArray(record?.data)
    ? record.data
    : Array.isArray(record?.profiles)
      ? record.profiles
      : [];
  const profiles = values.flatMap((value) => {
    const profile = asRecord(value);
    const id = asString(profile?.id);
    return id ? [{
      id,
      description: asString(profile?.description) ?? "",
      allowed: asBoolean(profile?.allowed) ?? true,
      ...(asString(profile?.approvalPolicy) ? { approvalPolicy: asString(profile?.approvalPolicy) } : {}),
      ...(asString(profile?.sandbox) ? { sandbox: asString(profile?.sandbox) } : {})
    }] : [];
  });
  return {
    source: record ? "codex_app_server" : "bridge_unavailable",
    profiles,
    simulated: asBoolean(record?.simulated) ?? !record
  };
}

export function normalizePickedInputs(value: unknown): CodexPickedInput[] {
  const record = asRecord(value);
  const items = Array.isArray(value) ? value : Array.isArray(record?.items) ? record.items : [];
  return items.flatMap((value) => {
    const item = asRecord(value);
    const name = asString(item?.name);
    const path = asString(item?.path);
    const kind = asString(item?.kind);
    return name && path && (kind === "file" || kind === "folder" || kind === "image")
      ? [{
          name,
          path,
          kind,
          ...(asString(item?.cleanupToken) ? { cleanupToken: asString(item?.cleanupToken) } : {}),
          ...(asString(item?.previewUrl) ? { previewUrl: asString(item?.previewUrl) } : {})
        } as CodexPickedInput]
      : [];
  });
}
