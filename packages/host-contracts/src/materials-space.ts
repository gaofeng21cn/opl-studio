export type MaterialSpaceAgent = {
  id: string;
  displayName: string;
  shortLabel?: string;
  domainId?: string;
  projectCount: number;
};

export type MaterialSpaceWorkItemSummary = {
  itemId: string;
  workItemId: string;
  title: string;
  kind?: string;
  status: string;
  workItemRoot?: string;
  relativeRoot?: string;
  currentStageName?: string;
  updatedAt?: string;
};

export type MaterialSpaceProject = {
  projectId: string;
  agentId: string;
  agentDisplayName: string;
  domainId?: string;
  displayName: string;
  workspacePath: string;
  bindingStatus?: string;
  exists: boolean;
  workspaceKind?: string;
  workItems: MaterialSpaceWorkItemSummary[];
  deliverableCount?: number;
  latestModifiedAt?: string;
};

export type MaterialSpaceCatalog = {
  schema: "opl_materials_space_catalog.v1";
  generatedAt: string;
  agents: MaterialSpaceAgent[];
  projects: MaterialSpaceProject[];
};

export type DeliverableCategory = "document" | "media" | "data" | "archive" | "code" | "other";

export type MaterialDeliverableEntry = {
  relativePath: string;
  name: string;
  extension: string;
  category: DeliverableCategory;
  group: string;
  workItemId?: string;
  workItemTitle?: string;
  sizeBytes: number;
  modifiedAt?: string;
  previewable: boolean;
};

export type ProjectDeliverablesScan = {
  schema: "opl_project_deliverables_scan.v1";
  projectId: string;
  workspacePath: string;
  entries: MaterialDeliverableEntry[];
  totalCount: number;
  truncated: boolean;
  scannedAt: string;
};

export type ProjectWorkspaceEntry = {
  name: string;
  relativePath: string;
  kind: "file" | "directory" | "symlink";
  sizeBytes?: number;
  modifiedAt?: string;
};

export type ProjectWorkspaceListing = {
  schema: "opl_project_workspace_listing.v1";
  projectId: string;
  relativePath: string;
  entries: ProjectWorkspaceEntry[];
  truncated: boolean;
};

export type ProjectWorkspaceSearch = {
  schema: "opl_project_workspace_search.v1";
  projectId: string;
  query: string;
  entries: ProjectWorkspaceEntry[];
  truncated: boolean;
};

export type ProjectWorkspaceAccessRequest = {
  projectId: string;
  relativePath?: string;
  action: "open" | "reveal" | "download";
};
