import type { ConnectionAuthorizationProjection } from "./workbenchModel-connection-contracts";
import type { RuntimeMaintenanceActionRef } from "./workbenchModel-runtime-contracts";

export type WorkbenchGatewayAccount = {
  displayName: string;
  status: string;
  email?: string;
  accountStatus?: string;
  balance?: {
    amount: number;
    currency: string;
  };
  usage?: {
    todayTokens?: number;
    totalTokens?: number;
    todayCost?: number;
    totalCost?: number;
    currency?: string;
    timezone?: string;
  };
  managedKey?: {
    name?: string;
    status?: string;
  };
  availableGroups?: Array<{
    id: string;
    label: string;
  }>;
  installation?: {
    deviceLabel?: string;
    shortId?: string;
  };
  freshness?: {
    observedAt?: string;
    stale: boolean;
    lastErrorCode?: string;
  };
  sourceRef: string;
};

export type WorkbenchSettingsProjection = {
  sourceRef: string;
  gatewayConnectionMode: "none" | "manual_key" | "account";
  codex: {
    installed: boolean | null;
    version?: string;
    versionStatus?: string;
    binaryPath?: string;
    model?: string;
    reasoningEffort?: string;
    providerName?: string;
    providerBaseUrl?: string;
    modelAccessSource?: string;
    accessStatus?: string;
    configPath?: string;
    apiKeyPresent: boolean | null;
    updateAvailable: boolean | null;
  };
  statusSummary: {
    runtimeSourceHealth?: string;
    agentPackageHealth?: string;
    temporalProvider?: string;
    releaseChannel?: string;
    issueCount?: number;
  };
  localEnvironment: {
    stateDir?: string;
    runtimeSourcesRoot?: string;
    logsDir?: string;
    releaseChannel?: string;
    temporalProvider?: string;
  };
  workspace: {
    selectedPath?: string;
    exists: boolean | null;
    writable: boolean | null;
    healthStatus?: string;
    personalizationSourceCount: number;
  };
  externalConnections: {
    id: string;
    name: string;
    type?: string;
    endpoint?: string;
    status?: string;
    lastTestedAt?: string;
  }[];
  connectionAuthorization?: ConnectionAuthorizationProjection;
  connectionActions: {
    actionId: string;
    label: string;
    payloadFields: string[];
    confirmationRequired: boolean;
    dryRunSupported: boolean;
  }[];
  dockerWebui: {
    status?: string;
    runtimeStatus?: string;
    recoveryStatus?: string;
    actions: RuntimeMaintenanceActionRef[];
  };
  personalization: {
    userAgents?: {
      status: string;
      path?: string;
      content?: string;
      sha256?: string;
      sizeBytes?: number;
      maxEditableBytes?: number;
      source?: string;
    };
    oplFlowDefaultUserAgents?: {
      status: string;
      content?: string;
      sha256?: string;
      sourcePath?: string;
      packageVersion?: string;
      source?: string;
      reason?: string;
    };
  };
  storage: {
    agentPackageStore: {
      status?: string;
      bytes?: number;
      reclaimableBytes?: number;
      reasonCode?: string;
      observedAt?: string;
      stale: boolean | null;
      ownerRoute?: string;
      inventoryAction?: RuntimeMaintenanceActionRef;
      projectedAction?: {
        kind?: string;
        status?: string;
        route?: string;
        actionId?: string;
        dryRunRequired: boolean | null;
      };
    };
    webuiDataVolume: {
      status?: string;
      bytes?: number;
      reclaimableBytes?: number;
      reasonCode?: string;
      observedAt?: string;
      stale: boolean | null;
      ownerRoute?: string;
      inventoryAction?: RuntimeMaintenanceActionRef;
      projectedAction?: {
        kind?: string;
        status?: string;
        route?: string;
        actionId?: string;
        dryRunRequired: boolean | null;
      };
    };
  };
};
