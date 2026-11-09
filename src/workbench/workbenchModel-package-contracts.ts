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
  version?: string;
  versionKind?: "installed" | "available";
  currentness: string;
  sourceMode: string;
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
