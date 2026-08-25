export type CodexThreadRuntimeStatus =
  | { type: "notLoaded" }
  | { type: "idle" }
  | { type: "systemError" }
  | { type: "active"; activeFlags: string[] };

export type CodexThreadState = "unloaded" | "idle" | "running" | "system_error";

export type CodexTurn = Record<string, unknown> & {
  id: string;
  status: "completed" | "interrupted" | "failed" | "inProgress";
};

export type CodexThread = Record<string, unknown> & {
  id: string;
  sessionId: string;
  projectKey: string | null;
  canonicalProjectId?: string;
  isTemporaryWorkspace: boolean;
  status: CodexThreadRuntimeStatus;
  state: CodexThreadState;
  summary: string;
  workspace: string;
  archived: boolean;
  parentThreadId: string | null;
  agentRole?: string;
  agentNickname?: string;
  sourceKind?: string;
  createdAt: number;
  updatedAt: number;
  turns: CodexTurn[];
  activeTurnId?: string;
};

export type ThreadListRequest = {
  projectKey?: string;
  archived?: boolean;
  workspace?: string | string[];
  limit?: number;
  searchTerm?: string;
};

export type ThreadListResult = { data: CodexThread[]; nextCursor: null };
export type ThreadReadRequest = { threadId: string; includeTurns?: boolean };
export type ThreadResumeRequest = { threadId: string };
export type ThreadForkRequest = { threadId: string; throughTurnId?: string };
export type ThreadRenameRequest = { threadId: string; name: string };
export type ThreadDeleteRequest = { threadId: string; confirmed?: boolean; confirmationId?: string };
export type ThreadSteerRequest = {
  threadId: string;
  expectedTurnId: string;
  prompt: string;
  turnAgentSelection?: {
    package_id: string;
    shortcut_id: string;
    codex_visible_entry: string;
    required_skill_ids: string[];
  };
  inputs?: Array<
    | { type: "localImage"; path: string; detail?: "auto" | "low" | "high" | "original" | null }
    | { type: "skill"; name: string; path: string }
    | { type: "mention"; name: string; path: string }
  >;
};
export type ThreadSteerResult = {
  executor: "codex_app_server";
  transport: "stdio_json_rpc";
  threadId: string;
  expectedTurnId: string;
  turnId: string;
  accepted: true;
};
export type ThreadInterruptRequest = {
  threadId: string;
  turnId: string;
};
export type ThreadInterruptResult = {
  executor: "codex_app_server";
  transport: "stdio_json_rpc";
  threadId: string;
  turnId: string;
  accepted: true;
};
export type SetArchivedRequest = {
  threadId: string;
  archived: boolean;
  confirmed?: boolean;
  confirmationId?: string;
};

export interface CodexThreadAdapterBridge {
  listThreads(request?: ThreadListRequest): Promise<ThreadListResult>;
  readThread(request: ThreadReadRequest): Promise<CodexThread>;
  resumeThread(request: ThreadResumeRequest): Promise<CodexThread>;
  forkThread(request: ThreadForkRequest): Promise<CodexThread>;
  renameThread(request: ThreadRenameRequest): Promise<CodexThread>;
  deleteThread(request: ThreadDeleteRequest): Promise<{ threadId: string; deleted: boolean }>;
  setArchived(request: SetArchivedRequest): Promise<{ threadId: string; archived: boolean }>;
}
