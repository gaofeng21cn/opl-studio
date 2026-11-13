import type {
  AgentPackageLifecycleRef,
  ManagedUpdateComponentRef,
  ManagedUpdateProjection,
  PackageLifecycleActionKind,
  PackageLifecycleActionRef,
  WorkbenchActionRef,
  WorkbenchModel
} from "./workbenchModel";

export type SettingsActionRequest = {
  key: string;
  actionId: string;
  label: string;
  targetLocation?: string;
  targetEffect?: string;
  payload: Record<string, unknown>;
  confirmationRequired: boolean;
  previewOnly?: boolean;
  dryRunSupported?: boolean;
};

export type SettingsActionAvailability = "ready" | "payload_required" | "unavailable";

export type SettingsActionIntent = SettingsActionRequest & {
  transport: "app_action";
  availability: SettingsActionAvailability;
  requiredPayloadFields: string[];
  dryRunSupported: boolean;
  mutates?: string;
  dangerLevel?: string;
  owner?: string;
  semantic?: string;
  sourceRef: string;
};

export type GatewayActionKind = "refresh" | "disconnect" | "repair" | "complete_setup" | "use_for_model_access";

export type GatewayActionViewModel = SettingsActionIntent & {
  kind: GatewayActionKind;
};

export type SettingsHostActionIntent = {
  transport: "managed_update_host" | "native_app_updater";
  key: string;
  label: string;
  operation: "status" | "check" | "plan" | "apply" | "repair" | "rollback" | "restart";
  componentIds: ("opl_app" | "opl_base" | "opl_packages")[];
  confirmationRequired: boolean;
  availability: SettingsActionAvailability;
  sourceRef: string;
};

export type SettingsExecutableIntent = SettingsActionIntent | SettingsHostActionIntent;

export type AgentLifecycleActionViewModel = SettingsActionIntent & {
  kind: PackageLifecycleActionKind;
  packageId: string;
  semantic: string;
};

export type AgentLifecycleViewModel = {
  packageId: string;
  label: string;
  status: string;
  installed: boolean | null;
  actions: AgentLifecycleActionViewModel[];
};

export type ManagedUpdateComponentViewModel = {
  componentId: "opl_app" | "opl_base" | "opl_packages";
  component?: ManagedUpdateComponentRef;
  actions: SettingsExecutableIntent[];
};

export type SettingsActionViewModel = {
  gatewayActions: GatewayActionViewModel[];
  agentLifecycle: AgentLifecycleViewModel[];
  managedUpdates: ManagedUpdateComponentViewModel[];
  additionalMaintenanceActions: SettingsExecutableIntent[];
};

export type ProjectedGatewayAction = {
  semantic: GatewayActionKind;
  action: WorkbenchActionRef;
  payload?: Record<string, unknown>;
};

export type SettingsActionProjectionInput = {
  gatewayActions?: ProjectedGatewayAction[];
  managedUpdateActions?: SettingsHostActionIntent[];
  additionalMaintenanceActions?: SettingsExecutableIntent[];
};

const managedComponentIds = ["opl_app", "opl_base", "opl_packages"] as const;
type ManagedComponentId = (typeof managedComponentIds)[number];
const gatewayActionSemantics: GatewayActionKind[] = [
  "complete_setup",
  "refresh",
  "repair",
  "use_for_model_access",
  "disconnect"
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readAppState(value: unknown): Record<string, unknown> | null {
  const root = asRecord(value);
  const first = asRecord(root?.app_state) ?? root;
  return asRecord(first?.app_state) ?? first;
}

function readActionCatalog(appState: Record<string, unknown>): Map<string, WorkbenchActionRef> {
  const actions = Array.isArray(appState.actions) ? appState.actions : [];
  return new Map(actions.flatMap((value): [string, WorkbenchActionRef][] => {
    const action = asRecord(value);
    const id = asString(action?.action_id);
    if (!id) return [];
    const payloadFields = Array.isArray(action?.payload_fields)
      ? action.payload_fields.flatMap((field) => asString(field) ?? [])
      : [];
    return [[id, {
      id,
      label: asString(action?.label) ?? id,
      route: asString(action?.route) ?? `opl app action execute --action ${id}`,
      payloadFields,
      mutates: asString(action?.mutates) ?? "unknown",
      dryRunSupported: action?.dry_run_supported === true,
      confirmationRequired: action?.confirmation_required === true,
      ...(asString(action?.danger_level) ? { dangerLevel: asString(action?.danger_level) as string } : {}),
      ...(asString(action?.owner) ? { owner: asString(action?.owner) as string } : {}),
      ...(asString(action?.delegated_surface) ? { delegatedSurface: asString(action?.delegated_surface) as string } : {})
    }]];
  }));
}

export function readGatewayActionsFromState(state: unknown): ProjectedGatewayAction[] {
  const appState = readAppState(state);
  const gateway = asRecord(asRecord(asRecord(appState?.settings_control_center)?.app_settings_read_model)?.opl_gateway_account);
  const actions = asRecord(gateway?.actions);
  if (!appState || !actions) return [];
  const catalog = readActionCatalog(appState);
  return gatewayActionSemantics.flatMap((semantic): ProjectedGatewayAction[] => {
    const actionId = asString(actions[semantic]);
    const action = actionId ? catalog.get(actionId) : undefined;
    return action ? [{ semantic, action }] : [];
  });
}

export function actionPayloadComplete(payload: Record<string, unknown>, requiredFields: string[]): boolean {
  return requiredFields.every((field) => {
    const alternatives = field.split(/\s+or\s+/i).map((item) => item.trim()).filter(Boolean);
    return alternatives.some((key) => payload[key] !== undefined && payload[key] !== null && payload[key] !== "");
  });
}

function actionAvailability(
  payload: Record<string, unknown>,
  requiredFields: string[],
  explicitlyAvailable = true
): SettingsActionAvailability {
  if (!explicitlyAvailable) return "unavailable";
  return actionPayloadComplete(payload, requiredFields) ? "ready" : "payload_required";
}

function gatewayIntent(projected: ProjectedGatewayAction): GatewayActionViewModel {
  const payload = projected.payload ?? {};
  const action = projected.action;
  return {
    transport: "app_action",
    key: `gateway:${action.id}`,
    actionId: action.id,
    label: action.label,
    payload,
    confirmationRequired: action.confirmationRequired,
    availability: actionAvailability(payload, action.payloadFields),
    requiredPayloadFields: action.payloadFields,
    dryRunSupported: action.dryRunSupported,
    mutates: action.mutates,
    dangerLevel: action.dangerLevel,
    owner: action.owner,
    semantic: projected.semantic,
    sourceRef: action.route,
    kind: projected.semantic
  };
}

function packageIntent(
  owner: AgentPackageLifecycleRef,
  action: PackageLifecycleActionRef
): AgentLifecycleActionViewModel {
  return {
    transport: "app_action",
    key: `${owner.packageId}:${action.actionId}`,
    actionId: action.actionId,
    label: action.label,
    payload: action.payload,
    confirmationRequired: action.confirmationRequired,
    availability: actionAvailability(action.payload, action.requiredPayloadFields, action.status === "available"),
    requiredPayloadFields: action.requiredPayloadFields,
    dryRunSupported: action.dryRunSupported,
    owner: action.owner,
    semantic: action.semantic,
    sourceRef: action.sourceRef,
    kind: action.kind,
    packageId: owner.packageId
  };
}

function uniqueIntents<Intent extends SettingsExecutableIntent>(intents: Intent[]): Intent[] {
  const seen = new Set<string>();
  return intents.filter((intent) => {
    const identity = `${intent.transport}:${intent.key}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function buildSettingsActionViewModel(
  model: Pick<WorkbenchModel, "packageLifecycle">,
  managedUpdate: ManagedUpdateProjection | null,
  projection: SettingsActionProjectionInput = {}
): SettingsActionViewModel {
  const gatewayActions = (projection.gatewayActions ?? [])
    .map(gatewayIntent);

  const agentLifecycle = model.packageLifecycle
    .filter((item) => item.packageId !== "missing_bridge")
    .map((item) => ({
      packageId: item.packageId,
      label: item.label,
      status: item.status,
      installed: item.installed,
      actions: item.actions.map((action) => packageIntent(item, action))
    }));

  const managedActions = new Map<ManagedComponentId, SettingsHostActionIntent[]>(
    managedComponentIds.map((componentId) => [componentId, []])
  );
  for (const intent of projection.managedUpdateActions ?? []) {
    for (const componentId of intent.componentIds) managedActions.get(componentId)?.push(intent);
  }

  return {
    gatewayActions,
    agentLifecycle,
    managedUpdates: managedComponentIds.map((componentId) => ({
      componentId,
      component: managedUpdate?.components.find((component) => component.componentId === componentId),
      actions: uniqueIntents(managedActions.get(componentId) ?? [])
    })),
    additionalMaintenanceActions: uniqueIntents(projection.additionalMaintenanceActions ?? [])
  };
}
