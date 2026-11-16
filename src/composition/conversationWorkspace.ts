import { brandString } from "@deepseek-ai/dsh-brand";
import type {
  WorkspaceView,
  WorkspaceId as WorkspaceIdBrand
} from "@deepseek-ai/dsh-api-workspace-controller/client";
import type { SessionId as SessionIdBrand } from "@deepseek-ai/dsh-session/types";
import type { CodexPickedInput } from "../bridge/oplBridge-types-codex-workspace";
import type { WorkbenchProjectGroup } from "../workbench/workbenchModel";

export type ConversationWorkspaceSelection = {
  selectedProjectId?: string;
  pendingWorkspacePath?: string;
};

const SessionId = (id: string) => brandString<SessionIdBrand>(id);
const WorkspaceId = (id: string) => brandString<WorkspaceIdBrand>(id);

const projectionTimestamp = "1970-01-01T00:00:00.000Z";

export function directoryLabel(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return (normalized || path).split(/[\\/]/).at(-1) || path;
}

function projectForWorkspace(workspaceId: string, projects: readonly WorkbenchProjectGroup[]) {
  return projects.find(project => !project.projectless
    && (project.id === workspaceId || (project.workspace ?? project.label) === workspaceId));
}

export function selectConversationWorkspace(workspaceId: string, projects: readonly WorkbenchProjectGroup[]): ConversationWorkspaceSelection {
  const normalized = workspaceId.trim();
  const project = projectForWorkspace(normalized, projects);
  return project ? { selectedProjectId: project.id } : { pendingWorkspacePath: normalized };
}

export function resetConversationWorkspace(selectedProjectId?: string): ConversationWorkspaceSelection {
  return selectedProjectId ? { selectedProjectId } : {};
}

export function createConversationWorkspaceView(path: string, projects: readonly WorkbenchProjectGroup[]): WorkspaceView | null {
  const normalized = path.trim();
  if (!normalized) return null;
  const selection = selectConversationWorkspace(normalized, projects);
  const project = selection.selectedProjectId
    ? projectForWorkspace(selection.selectedProjectId, projects)
    : undefined;
  const workspacePath = project?.workspace ?? selection.pendingWorkspacePath ?? normalized;
  return {
    workspaceId: WorkspaceId(project?.id ?? workspacePath),
    path: workspacePath,
    title: project?.label ?? directoryLabel(workspacePath),
    sessionIds: [],
    createdAt: projectionTimestamp,
    updatedAt: projectionTimestamp
  };
}

export function firstSendCwd(input: {
  threadId?: string;
  pendingWorkspacePath?: string;
  selectedWorkspace?: string;
}): string | undefined {
  return input.threadId ? undefined : input.pendingWorkspacePath ?? input.selectedWorkspace;
}

export function buildConversationWorkspaceItems(input: {
  projects: readonly WorkbenchProjectGroup[];
  currentThreadId?: string;
  selectedProjectId?: string;
  pendingWorkspacePath?: string;
  workspacePath: string;
  projectTitle: string;
  sessionId: string;
}): WorkspaceView[] {
  const projects = input.projects.filter(project => !project.projectless);
  const currentProject = projects.find(project => project.id === input.selectedProjectId)
    ?? projects.find(project => (project.workspace ?? project.label) === input.workspacePath);
  const items: WorkspaceView[] = projects.map(project => ({
    workspaceId: WorkspaceId(project.id),
    path: project.workspace ?? project.label,
    title: project.label,
    sessionIds: [
      ...project.threads.map(thread => SessionId(thread.id === input.currentThreadId ? input.sessionId : thread.id)),
      ...(!input.currentThreadId && project.id === currentProject?.id ? [SessionId(input.sessionId)] : [])
    ],
    createdAt: projectionTimestamp,
    updatedAt: projectionTimestamp
  }));
  if (!input.currentThreadId && input.pendingWorkspacePath
    && !items.some(item => item.workspaceId === input.pendingWorkspacePath || item.path === input.pendingWorkspacePath)) {
    items.unshift({
      workspaceId: WorkspaceId(input.pendingWorkspacePath),
      path: input.pendingWorkspacePath,
      title: directoryLabel(input.pendingWorkspacePath),
      sessionIds: [SessionId(input.sessionId)],
      createdAt: projectionTimestamp,
      updatedAt: projectionTimestamp
    });
  }
  if (items.length === 0) {
    items.push({
      workspaceId: WorkspaceId("opl-workspace"),
      path: input.workspacePath,
      title: input.projectTitle,
      sessionIds: [SessionId(input.sessionId)],
      createdAt: projectionTimestamp,
      updatedAt: projectionTimestamp
    });
  }
  return items;
}

export async function pickConversationDirectory(input: {
  supported: boolean;
  pick(): Promise<CodexPickedInput[]>;
}): Promise<string | null> {
  if (!input.supported) return null;
  const selected = await input.pick();
  return selected.find(item => item.kind === "folder")?.path ?? null;
}
