export type PackageLifecycleActionKind = "install" | "update" | "repair" | "uninstall" | "preferences" | "other";

export type PackageLifecycleActionRef = {
  kind: PackageLifecycleActionKind;
  semantic: string;
  surface?: string;
  label: string;
  status: "available" | "unavailable";
  actionId: string;
  actionRef: string;
  route?: string;
  payload: Record<string, unknown>;
  requiredPayloadFields: string[];
  confirmationRequired: boolean;
  dryRunSupported: boolean;
  owner?: string;
  delegatedSurface?: string;
  sourceRef: string;
  reason: string;
};

export type PackageLifecycleDisplayRef = {
  label: string;
  ref: string;
  summary: string;
};

export type PackageLifecycleStatusAxis = {
  label: string;
  value: string;
  source: "canonical_agent_packages" | "legacy_modules_fallback" | "missing_bridge";
};

export type PackageLifecycleSearchMetadata = {
  query: string;
  tags: string[];
  filters: PackageLifecycleDisplayRef[];
};

export type PackageLifecycleDetailRef = {
  label: string;
  value: string;
  source: PackageLifecycleStatusAxis["source"];
  ref?: string;
  summary: string;
};

export type AgentPackageLocalizedText = {
  zh?: string;
  en?: string;
};

export type AgentPackageRouteRef = {
  routeKind: string;
  executor: string;
  codexVisibleEntry: string;
};

export type AgentPackageShortcutRef = {
  shortcutId: string;
  labelI18n: AgentPackageLocalizedText;
  defaultVisible: boolean | null;
  userConfigurable: boolean | null;
  visible: boolean;
  sortOrder: number;
  route?: AgentPackageRouteRef;
};

export type AgentPackageReadinessRef = {
  status: string;
  operationalReady: boolean | null;
  launchAllowed: boolean | null;
  verificationDeferred: boolean | null;
  reason?: string;
  detailSurface?: string;
  statusReadError?: string;
  present: boolean | null;
  callable: boolean | null;
  selectionStatus: "available" | "unavailable" | "checking";
  selectable: boolean;
};

export type AgentPackageDependencyRef = {
  packageId: string;
  required: boolean | null;
  present: boolean | null;
  callable: boolean | null;
  status: string;
  reasons: string[];
};

export type AgentPackageAccessRef = {
  visibility: "public" | "authorized_only" | "unknown";
  status: "public" | "authorized" | "signed_out" | "forbidden" | "expired" | "revoked" | "unknown";
  providerId?: string;
  sourceRef?: string;
  accessPolicyRef?: string;
  verifiedAt?: string;
  securityRevision?: string;
  reason?: string;
  discoverAllowed: boolean | null;
  downloadAllowed: boolean | null;
};

/** Framework-owned software source refs. Values are display metadata only; credential values never cross this boundary. */
export type SoftwareSourceActionRef = {
  actionId: "source_list" | "source_check" | "source_configure" | "source_disconnect" | string;
  label: string;
  delegatedSurface?: string;
  payload: Record<string, unknown>;
  payloadFields: string[];
  status: "available" | "unavailable";
  mutates?: string;
  dryRunSupported: boolean;
  confirmationRequired: boolean;
  dangerLevel?: string;
  impact?: string;
  followUpActionIds: string[];
  verifyActionId?: string;
  reason?: string;
};

export type SoftwareSourceRef = {
  sourceId: string;
  displayName: string;
  sourceKind: "registry" | "tap" | string;
  sourceRef: string;
  visibility: "public" | "authorized_only" | "unknown";
  providerId?: string;
  status: "public" | "authorized" | "signed_out" | "forbidden" | "expired" | "revoked" | "unknown";
  enabled: boolean | null;
  credentialHandlePresent: boolean;
  verifiedAt?: string;
  entryCount?: number;
  availableActions: SoftwareSourceActionRef[];
};

export type SoftwareSourcesProjection = {
  status: "available" | "attention_required" | "unknown";
  entries: SoftwareSourceRef[];
  authorityBoundary?: {
    owner?: string;
    credentialValuesExposed?: boolean;
  };
};

export type AgentPackageLifecycleRef = {
  id: string;
  packageId: string;
  label: string;
  description: string;
  publisher: string;
  packageRole: string;
  roleGroup: "agent" | "workflow" | "supporting" | "other";
  official: boolean;
  displayNameI18n: AgentPackageLocalizedText;
  descriptionI18n: AgentPackageLocalizedText;
  sessionRoutingSummaryI18n: AgentPackageLocalizedText;
  requiredSkillIds: string[];
  optionalSkillRefs: string[];
  dependencies: AgentPackageDependencyRef[];
  /** Owner-projected reverse dependency refs used before disabling or removing a package. */
  requiredByPackageIds?: string[];
  installed: boolean | null;
  activated: boolean | null;
  appEnabled: boolean;
  readiness: AgentPackageReadinessRef;
  /** The version currently materialized on this carrier, when known. */
  installedVersion?: string;
  /** The version selected by the owner catalog for installation/update, when known. */
  availableVersion?: string;
  /**
   * Legacy display field retained for consumers that only need one version.
   * New UI should prefer installedVersion and availableVersion.
   */
  version?: string;
  versionKind?: "installed" | "available";
  currentness: string;
  sourceMode: string;
  /** Registry access is independent of local install and business runtime grants. */
  access?: AgentPackageAccessRef;
  installable?: boolean | null;
  automaticUpdate: boolean | null;
  homeShortcuts: AgentPackageShortcutRef[];
  recommendedActionId?: string;
  status: string;
  summary: string;
  sourceRef: string;
  sourceExplanation: string;
  searchMetadata: PackageLifecycleSearchMetadata;
  refs: PackageLifecycleDisplayRef[];
  details: PackageLifecycleDetailRef[];
  statusAxes: PackageLifecycleStatusAxis[];
  actions: PackageLifecycleActionRef[];
  authorityBoundary: string;
};

export type AgentPackageSelectionIntent = {
  kind: "agent_package_selection";
  selectionId: string;
  packageId: string;
  label: string;
  description: string;
  publisher: string;
  displayNameI18n: AgentPackageLocalizedText;
  descriptionI18n: AgentPackageLocalizedText;
  sessionRoutingSummaryI18n: AgentPackageLocalizedText;
  requiredSkillIds: string[];
  optionalSkillRefs: string[];
  readiness: AgentPackageReadinessRef;
  route?: AgentPackageRouteRef & { shortcutId: string };
  actions: PackageLifecycleActionRef[];
  recommendedActionId?: string;
  sourceRef: string;
};
