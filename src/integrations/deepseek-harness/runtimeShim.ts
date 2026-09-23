export function workspaceTitleOf(cwd: string): string {
  return cwd.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
}

function isWindowsStylePath(value: string): boolean {
  return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
}

export function abbreviateHomePath(path: string, home?: string): string {
  if (!home || isWindowsStylePath(path) || isWindowsStylePath(home)) return path;
  const root = home.replace(/\/+$/, "");
  if (!root || root === "/") return path;
  if (path.replace(/\/+$/, "") === root) return "~";
  return path.startsWith(`${root}/`) ? `~${path.slice(root.length)}` : path;
}

export type SessionId = string;
export type WorkspaceId = string;
export type PendingInteractionStatus = "approval" | "plan-review" | "question";

export type SessionSummary = {
  id: SessionId;
  title?: string;
  displayTitle: string;
  cwd?: string;
  agentPreset?: string;
  parentId?: SessionId;
  origin?: "subagent";
  running: boolean;
  pendingInteraction?: PendingInteractionStatus;
  completed?: boolean;
  blank: boolean;
  updatedAt: number;
};

export type SessionListState = {
  ids: SessionId[];
  byId: Record<SessionId, SessionSummary>;
  current: SessionId | undefined;
  phase: "idle" | "loading" | "ready" | "error";
  subagentsByParent: Readonly<Record<SessionId, unknown>>;
  jobsBySession: Readonly<Record<SessionId, readonly unknown[]>>;
  currentAddress: undefined;
};

export type WorkspaceListState = {
  phase: "idle" | "loading" | "ready" | "error";
  items: WorkspaceView[];
  archivedSessionIds: readonly SessionId[];
  pinnedSessionIds: readonly SessionId[];
};

export type SubagentDescendantSummary = { runningCount: number };

export function indexSubagentDescendants(
  byId: Record<SessionId, SessionSummary>
): ReadonlyMap<SessionId, SubagentDescendantSummary> {
  const result = new Map<SessionId, SubagentDescendantSummary>();
  for (const session of Object.values(byId)) {
    if (session.origin !== "subagent" || !session.parentId || !session.running) continue;
    result.set(session.parentId, { runningCount: (result.get(session.parentId)?.runningCount ?? 0) + 1 });
  }
  return result;
}

export type WorkspaceView = {
  workspaceId: WorkspaceId;
  path: string;
  title: string;
  sessionIds: SessionId[];
  createdAt: string;
  updatedAt: string;
};

export type SessionSearchResultItem = { sessionId: SessionId; snippet?: string };

export type ModelSelection = { provider: string; model: string; reasoningEffort?: string };
export type ModelReasoningEffort = { id: string; name: string; description?: string };
export type ModelReasoning = { efforts: ModelReasoningEffort[]; defaultEffort?: string };
export type ModelCatalogModel = { id: string; name: string; description?: string; reasoning?: ModelReasoning };
export type ModelProviderGroup = { id: string; name: string; models: ModelCatalogModel[] };
export type ModelCatalogFailure = { id: string; name: string; message: string };

type Listener = () => void;

export interface SnapshotStore<T> {
  getSnapshot(): T;
  subscribe(listener: Listener): () => void;
  set(value: T): void;
  update(mutator: (draft: T) => void): void;
}

export function createSnapshotStore<T>(initial: T): SnapshotStore<T> {
  let snapshot = initial;
  const listeners = new Set<Listener>();
  const publish = () => listeners.forEach((listener) => listener());
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(value) {
      snapshot = value;
      publish();
    },
    update(mutator) {
      const clone = structuredClone(snapshot);
      mutator(clone);
      snapshot = clone;
      publish();
    }
  };
}

type StoreSpec<T, A extends Record<string, (draft: T, ...args: any[]) => void>> = {
  init(): T;
  persist?: string;
  actions: A;
};

export function defineStore<T, A extends Record<string, (draft: T, ...args: any[]) => void>>(spec: StoreSpec<T, A>) {
  return {
    spec,
    create: () => {
      const store = createSnapshotStore(spec.init());
      const actions = Object.fromEntries(Object.entries(spec.actions).map(([key, action]) => [key, (...args: unknown[]) => {
        store.update((draft) => action(draft, ...args));
      }])) as { [K in keyof A]: A[K] extends (draft: T, ...args: infer P) => void ? (...args: P) => void : never };
      return { ...store, actions, clearPersisted() {} };
    }
  };
}
