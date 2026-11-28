import type { RunwayHealth } from "@gaofeng21cn/opl-host-contracts";
import type {
  DomainDetailViewAvailability,
  DomainDetailViewDescriptor,
  WorkItemRuntimeItem,
  WorkItemRuntimeProjection,
  WorkItemRuntimeStage
} from "@gaofeng21cn/opl-host-contracts";
import type { AgentPackageLocalizedText } from "./workbenchModel-package-contracts";

export type {
  DomainDetailViewAvailability,
  DomainDetailViewDescriptor,
  WorkItemRuntimeItem,
  WorkItemRuntimeProjection,
  WorkItemRuntimeStage
};

export type RuntimeMaintenanceActionRef = {
  actionId: string;
  label: string;
  state?: string;
  payload: Record<string, unknown>;
  requiredPayloadFields: string[];
  confirmationRequired: boolean;
  dryRunSupported: boolean;
  mutates: string;
  dangerLevel?: string;
};

export type ManagedUpdateDependencyVersion = string | Record<string, string | null> | null;

export type ManagedUpdateComponentRef = {
  componentId: "opl_app" | "opl_base" | "opl_packages" | string;
  lifecycleOwner: string;
  label: string;
  state: string;
  channel?: string;
  installedVersion?: string;
  latestVersion?: string;
  currentness?: string;
  autoApplyMode?: string;
  autoApplyEligible: boolean | null;
  backgroundSafe: boolean | null;
  summary?: string;
  guidance?: string;
  runtimeDependencies?: ManagedRuntimeDependencyRef[];
  packageStates?: ManagedPackageStateRef[];
};

export type ManagedRuntimeDependencyRef = {
  dependencyId: string;
  dependencyKind: string;
  installed: boolean | null;
  version: ManagedUpdateDependencyVersion;
  latestVersion: ManagedUpdateDependencyVersion;
  currentness: string;
  status: string;
  ownership: string | null;
  updatePolicy: string;
  updateMode: string;
  activationPolicy: string;
  binaryPath: string | null;
  note: string | null;
};

export type ManagedPackageStateRef = {
  packageId: string;
  label: string;
  state: string;
  updateMode: string;
  autoApplyEligible: boolean | null;
  backgroundUpdateReason: string | null;
  backgroundSafe: boolean | null;
  packageVersion: string | null;
  sourcePath: string | null;
  carrierKind: string | null;
  carrierIdentity: string | null;
  carrierStatus: string | null;
};

export type ManagedUpdateProjection = {
  operation: string;
  channel?: string;
  components: ManagedUpdateComponentRef[];
};

export type RuntimeOverviewRef = {
  runway: RunwayHealth;
  carriers: {
    total: number;
    present: number;
    healthy: number;
    items: {
      packageId: string;
      label: string;
      description?: string;
      status: string;
      sourceOrigin?: string;
      syncStatus?: string;
      dirty: boolean | null;
    }[];
  };
  maintenanceActions: RuntimeMaintenanceActionRef[];
  recommendedActionId?: string;
};
