export type ManagedCompanionAction = {
  actionId: string;
  label: string;
  confirmationRequired: boolean;
  dangerLevel?: string;
};

export type ManagedCompanionViewModel = {
  surfaceKind: string;
  providerId: string;
  productName: string;
  version?: string;
  status: string;
  ready: boolean;
  installed: boolean;
  registered: boolean;
  enabled: boolean;
  permission: string;
  healthRef?: string;
  actions: ManagedCompanionAction[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function appStateRecord(value: unknown): Record<string, unknown> | null {
  const root = asRecord(value);
  const first = asRecord(root?.app_state) ?? root;
  return asRecord(first?.app_state) ?? first;
}

function isManagedCompanionSurface(value: string): boolean {
  return /^opl_managed_[a-z0-9_]+_projection$/.test(value);
}

export function readManagedCompanions(value: unknown): ManagedCompanionViewModel[] {
  const appState = appStateRecord(value);
  if (!appState || !Array.isArray(appState.managed_companions)) return [];

  const actionCatalog = new Map(
    (Array.isArray(appState.actions) ? appState.actions : []).flatMap((value): [string, Record<string, unknown>][] => {
      const action = asRecord(value);
      const actionId = asString(action?.action_id);
      return action && actionId ? [[actionId, action]] : [];
    })
  );

  const companions = appState.managed_companions.flatMap((value): ManagedCompanionViewModel[] => {
    const companion = asRecord(value);
    const surfaceKind = asString(companion?.surface_kind);
    const providerId = asString(companion?.provider_id);
    const productName = asString(companion?.product_name);
    if (!companion || !surfaceKind || !isManagedCompanionSurface(surfaceKind) || !providerId || !productName) return [];

    const actions = (Array.isArray(companion.available_actions) ? companion.available_actions : [])
      .flatMap((value): ManagedCompanionAction[] => {
        const actionId = asString(value);
        const action = actionId ? actionCatalog.get(actionId) : undefined;
        if (
          !actionId
          || !action
          || asString(action.surface) !== "opl app action execute"
          || asString(action.submit_via) !== "opl app action execute"
          || action.can_submit_to_safe_action_shell !== true
          || action.route_requires_domain_or_app_payload !== false
          || !Array.isArray(action.payload_fields)
          || action.payload_fields.length !== 0
        ) return [];
        const dangerLevel = asString(action.danger_level);
        return [{
          actionId,
          label: asString(action.label) ?? actionId,
          confirmationRequired: action.confirmation_required === true,
          ...(dangerLevel ? { dangerLevel } : {})
        }];
      });

    const version = asString(companion.version);
    const healthRef = asString(companion.health_ref);
    return [{
      surfaceKind,
      providerId,
      productName,
      ...(version ? { version } : {}),
      status: asString(companion.status) ?? "unknown",
      ready: companion.ready === true,
      installed: companion.installed === true,
      registered: companion.registered === true,
      enabled: companion.enabled === true,
      permission: asString(companion.permission) ?? "unknown",
      ...(healthRef ? { healthRef } : {}),
      actions
    }];
  });

  return [...new Map(companions.map((companion) => [companion.providerId, companion])).values()];
}
