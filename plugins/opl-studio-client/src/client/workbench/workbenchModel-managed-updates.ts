import type {
  ManagedFlowDependencyRef,
  ManagedPackageStateRef,
  ManagedRuntimeDependencyRef,
  ManagedUpdateComponentRef,
  ManagedUpdateDependencyVersion,
  ManagedUpdateProjection
} from "./workbenchModel-contracts";
import {
  asOptionalBoolean,
  asRecord,
  asRecordArray,
  asString
} from "./workbenchModel-primitives";

function readManagedUpdateDependencyVersion(value: unknown): ManagedUpdateDependencyVersion {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  const record = asRecord(value);
  if (!record || Object.values(record).some((item) => item !== null && typeof item !== "string")) return null;
  return Object.fromEntries(Object.entries(record)) as Record<string, string | null>;
}

function readManagedUpdateFlowDependency(value: Record<string, unknown>): ManagedFlowDependencyRef | null {
  const dependencyId = asString(value.dependency_id);
  const dependencyKind = asString(value.dependency_kind);
  if (!dependencyId || !dependencyKind) return null;
  return {
    dependencyId,
    dependencyKind,
    activation: asString(value.activation) ?? "unknown",
    offlineBundle: asString(value.offline_bundle) ?? "none",
    onlineInstallDefault: asOptionalBoolean(value.online_install_default),
    source: asString(value.source),
    sourcePath: asString(value.source_path),
    owner: asString(value.owner),
    bundleId: asString(value.bundle_id),
    versionRequirement: asString(value.version_requirement),
    installSource: asString(value.install_source),
    relationship: asString(value.relationship) ?? "required",
    lifecycleOwner: asString(value.lifecycle_owner) ?? "unknown",
    updateMode: asString(value.update_mode) ?? "unknown",
    installed: asOptionalBoolean(value.installed),
    observedStatus: asString(value.observed_status),
    status: asString(value.status) ?? "unknown",
    currentness: asString(value.currentness) ?? "unknown",
    version: readManagedUpdateDependencyVersion(value.version),
    latestVersion: readManagedUpdateDependencyVersion(value.latest_version),
    ownership: asString(value.ownership)
  };
}

function readManagedUpdateRuntimeDependency(value: Record<string, unknown>): ManagedRuntimeDependencyRef | null {
  const dependencyId = asString(value.dependency_id);
  const dependencyKind = asString(value.dependency_kind);
  if (!dependencyId || !dependencyKind) return null;
  return {
    dependencyId,
    dependencyKind,
    installed: asOptionalBoolean(value.installed),
    version: readManagedUpdateDependencyVersion(value.version),
    latestVersion: readManagedUpdateDependencyVersion(value.latest_version),
    currentness: asString(value.currentness) ?? "unknown",
    status: asString(value.status) ?? "unknown",
    ownership: asString(value.ownership),
    updatePolicy: asString(value.update_policy) ?? "unknown",
    updateMode: asString(value.update_mode) ?? "unknown",
    activationPolicy: asString(value.activation_policy) ?? "unknown",
    binaryPath: asString(value.binary_path),
    note: asString(value.note) ?? asString(value.guidance)
  };
}

function readManagedUpdatePackageState(value: Record<string, unknown>): ManagedPackageStateRef | null {
  const packageId = asString(value.package_id);
  if (!packageId) return null;
  const backgroundUpdate = asRecord(value.background_update);
  const owner = asRecord(value.installed_owner_descriptor);
  const carrier = asRecord(value.native_carrier);
  const readiness = asRecord(carrier?.readiness);
  const backgroundEligible = asOptionalBoolean(backgroundUpdate?.eligible);
  const backgroundReason = asString(backgroundUpdate?.reason);
  return {
    packageId,
    label: asString(value.label) ?? packageId,
    state: asString(value.state) ?? "unknown",
    updateMode: asString(backgroundUpdate?.mode)
      ?? asString(backgroundUpdate?.update_mode)
      ?? (backgroundEligible === true ? "silent_managed" : "unknown"),
    autoApplyEligible: backgroundEligible,
    backgroundUpdateReason: backgroundReason,
    backgroundSafe: asOptionalBoolean(backgroundUpdate?.app_background_safe),
    packageVersion: asString(owner?.package_version),
    sourcePath: asString(owner?.source_path),
    carrierKind: asString(carrier?.kind),
    carrierIdentity: asString(carrier?.identity) ?? asString(carrier?.plugin_id),
    carrierStatus: asString(carrier?.status)
      ?? asString(readiness?.physical_status)
      ?? asString(readiness?.callability)
  };
}
export function readManagedUpdateProjection(value: unknown): ManagedUpdateProjection | null {
  const root = asRecord(value);
  const outerAppState = asRecord(root?.app_state);
  const appState = asRecord(outerAppState?.app_state) ?? outerAppState;
  const execution = asRecord(root?.app_action_execution);
  const result = asRecord(execution?.result) ?? asRecord(root?.result);
  const managedUpdate = asRecord(result?.managed_update)
    ?? asRecord(execution?.managed_update)
    ?? asRecord(root?.managed_update)
    ?? asRecord(appState?.managed_update);
  if (!managedUpdate) return null;
  const components = asRecordArray(managedUpdate.components).flatMap((component): ManagedUpdateComponentRef[] => {
    const componentId = asString(component.component_id);
    if (!componentId) return [];
    const current = asRecord(component.current);
    const dependencyCatalog = asRecord(current?.dependency_catalog);
    const autoApply = asRecord(component.auto_apply);
    const plan = asRecord(component.plan);
    const flowDependencies = dependencyCatalog && Array.isArray(dependencyCatalog.flow_dependencies)
      ? asRecordArray(dependencyCatalog.flow_dependencies).flatMap((dependency) => {
        const projection = readManagedUpdateFlowDependency(dependency);
        return projection ? [projection] : [];
      })
      : undefined;
    const runtimeDependencies = dependencyCatalog && Array.isArray(dependencyCatalog.dependencies)
      ? asRecordArray(dependencyCatalog.dependencies).flatMap((dependency) => {
        const projection = readManagedUpdateRuntimeDependency(dependency);
        return projection ? [projection] : [];
      })
      : undefined;
    const packageStates = Array.isArray(current?.package_states)
      ? asRecordArray(current.package_states).flatMap((packageState) => {
        const projection = readManagedUpdatePackageState(packageState);
        return projection ? [projection] : [];
      })
      : undefined;
    return [{
      componentId,
      lifecycleOwner: asString(component.lifecycle_owner) ?? componentId,
      label: asString(component.label) ?? componentId,
      state: asString(component.state) ?? "unknown",
      ...(asString(component.channel) ?? asString(managedUpdate.update_channel)
        ? { channel: (asString(component.channel) ?? asString(managedUpdate.update_channel)) as string }
        : {}),
      ...(asString(current?.installed_version) ? { installedVersion: asString(current?.installed_version) as string } : {}),
      ...(asString(current?.latest_version) ? { latestVersion: asString(current?.latest_version) as string } : {}),
      ...(asString(current?.currentness) ? { currentness: asString(current?.currentness) as string } : {}),
      ...(asString(autoApply?.mode) ? { autoApplyMode: asString(autoApply?.mode) as string } : {}),
      autoApplyEligible: asOptionalBoolean(autoApply?.eligible),
      backgroundSafe: asOptionalBoolean(autoApply?.app_background_safe),
      ...(asString(plan?.summary) ? { summary: asString(plan?.summary) as string } : {}),
      ...(asString(current?.manual_guidance) ? { guidance: asString(current?.manual_guidance) as string } : {}),
      ...(flowDependencies ? { flowDependencies } : {}),
      ...(runtimeDependencies ? { runtimeDependencies } : {}),
      ...(packageStates ? { packageStates } : {})
    }];
  });
  return {
    operation: asString(managedUpdate.operation) ?? "status",
    ...(asString(managedUpdate.update_channel) ? { channel: asString(managedUpdate.update_channel) as string } : {}),
    components
  };
}

export function mergeManagedUpdateProjections(
  current: ManagedUpdateProjection | null,
  incoming: ManagedUpdateProjection
): ManagedUpdateProjection {
  const components = new Map((current?.components ?? []).map((component) => [component.componentId, component]));
  for (const component of incoming.components) components.set(component.componentId, component);
  return {
    operation: incoming.operation,
    ...(incoming.channel ?? current?.channel ? { channel: (incoming.channel ?? current?.channel) as string } : {}),
    components: Array.from(components.values())
  };
}
