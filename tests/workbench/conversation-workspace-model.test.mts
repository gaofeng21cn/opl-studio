import { expect, test } from "bun:test";
import type { WorkbenchProjectGroup, WorkbenchThreadItem } from "../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel";
import {
  buildConversationWorkspaceItems,
  createConversationWorkspaceView,
  firstSendCwd,
  pickConversationDirectory,
  resetConversationWorkspace,
  selectConversationWorkspace
} from "../../plugins/core/opl-studio-client/src/client/composition/conversationWorkspace";

function thread(id: string, workspace: string): WorkbenchThreadItem {
  return {
    id, title: id, workspace, status: "completed", preview: "", archived: false,
    isTemporaryWorkspace: false, currentWorkspace: false
  };
}

function project(id: string, workspace: string, threads: readonly WorkbenchThreadItem[] = []): WorkbenchProjectGroup {
  return { id, label: id === "project-a" ? "Alpha" : id, workspace, projectless: false, threads: [...threads] };
}

const alpha = project("project-a", "/work/alpha", [thread("thread-a", "/work/alpha")]);
const beta = project("project-b", "/work/beta", [thread("thread-b", "/work/beta")]);

for (const workspaceId of ["project-a", "/work/alpha"]) {
  test(`selection resolves an existing project by ${workspaceId === "project-a" ? "id" : "path"}`, () => {
    // Given an existing thread-backed project.
    // When its workspace is selected for a blank conversation.
    const selection = selectConversationWorkspace(workspaceId, [alpha, beta]);

    // Then the project owns the selection and no synthetic path remains pending.
    expect(selection).toEqual({ selectedProjectId: "project-a" });
  });
}

test("selection stores an unknown native path as pending", () => {
  // Given no project at the picked path.
  // When the native result is adopted.
  const selection = selectConversationWorkspace("/work/new", [alpha]);

  // Then only the next blank conversation carries that pending path.
  expect(selection).toEqual({ pendingWorkspacePath: "/work/new" });
});

test("navigation reset clears pending state while retaining the destination project", () => {
  // Given a destination project chosen by new/open navigation.
  // When the pending selection is reset.
  const selection = resetConversationWorkspace("project-b");

  // Then only the durable project selection remains.
  expect(selection).toEqual({ selectedProjectId: "project-b" });
});

test("native adoption returns the existing project view for a known path", () => {
  // Given a native path already represented by a project.
  // When the official picker asks for its adopted Workspace view.
  const view = createConversationWorkspaceView("/work/alpha", [alpha]);

  // Then the official onPick flow resolves the existing project id and label.
  expect(view).toMatchObject({ workspaceId: "project-a", path: "/work/alpha", title: "Alpha" });
});

test("native adoption creates only a projection for a new pending path", () => {
  // Given a native path with no thread-backed project.
  // When the official picker asks for its adopted Workspace view.
  const view = createConversationWorkspaceView("/work/gamma", [alpha]);

  // Then the path is identified by its basename without registering a project.
  expect(view).toMatchObject({ workspaceId: "/work/gamma", path: "/work/gamma", title: "gamma" });
});

test("blank chip resolves the selected existing project to the synthetic current session", () => {
  // Given a blank new task whose selected project already exists.
  // When conversation Workspace rows are projected.
  const items = buildConversationWorkspaceItems({
    projects: [alpha, beta], selectedProjectId: "project-a", workspacePath: "/work/alpha",
    projectTitle: "Alpha", sessionId: "opl-current"
  });

  // Then the chip's owning row has the real title and contains the blank session.
  expect(items.find(item => item.workspaceId === "project-a")).toMatchObject({
    title: "Alpha", sessionIds: ["thread-a", "opl-current"]
  });
});

test("blank chip resolves a newly picked pending path without affecting existing rows", () => {
  // Given a blank new task with a path absent from the thread directory.
  // When conversation Workspace rows are projected.
  const items = buildConversationWorkspaceItems({
    projects: [alpha], pendingWorkspacePath: "/work/gamma", workspacePath: "/work/gamma",
    projectTitle: "gamma", sessionId: "opl-current"
  });

  // Then a projection-only pending row owns the blank session and real rows stay unchanged.
  expect(items[0]).toMatchObject({ workspaceId: "/work/gamma", title: "gamma", sessionIds: ["opl-current"] });
  expect(items.find(item => item.workspaceId === "project-a")?.sessionIds).toEqual(["thread-a"]);
});

test("existing thread maps only its canonical membership and ignores pending state", () => {
  // Given an existing thread and stale pending input that must not leak into it.
  // When conversation Workspace rows are projected.
  const items = buildConversationWorkspaceItems({
    projects: [alpha, beta], currentThreadId: "thread-b", pendingWorkspacePath: "/work/gamma",
    workspacePath: "/work/beta", projectTitle: "Beta", sessionId: "opl-current"
  });

  // Then only the current canonical thread maps to the synthetic session and no pending row appears.
  expect(items.find(item => item.workspaceId === "project-b")?.sessionIds).toEqual(["opl-current"]);
  expect(items.some(item => item.workspaceId === "/work/gamma")).toBe(false);
});

test("first send prefers the pending path over the selected fallback", () => {
  // Given a new thread with distinct pending and fallback paths.
  // When its cwd is derived.
  const cwd = firstSendCwd({ pendingWorkspacePath: "/work/pending", selectedWorkspace: "/work/fallback" });

  // Then the native pending path wins.
  expect(cwd).toBe("/work/pending");
});

test("existing thread sends no cwd override", () => {
  // Given an existing canonical thread and a stale pending path.
  // When its cwd is derived.
  const cwd = firstSendCwd({ threadId: "thread-a", pendingWorkspacePath: "/work/pending", selectedWorkspace: "/work/fallback" });

  // Then thread-owned cwd remains authoritative.
  expect(cwd).toBeUndefined();
});

test("unsupported carriers never invoke browser directory picking", async () => {
  // Given a WebUI-like carrier without workspaceRootSelection.
  let calls = 0;

  // When the adapter is asked to pick.
  const path = await pickConversationDirectory({
    supported: false,
    pick: async () => { calls += 1; return [{ kind: "folder", path: "/work/upload" }]; }
  });

  // Then no implicit browser upload picker runs and no path is adopted.
  expect(path).toBeNull();
  expect(calls).toBe(0);
});

test("supported native picking returns the chosen folder", async () => {
  // Given a native chooser returning one folder.
  // When the adapter picks it.
  const path = await pickConversationDirectory({
    supported: true,
    pick: async () => [{ kind: "folder", path: "/work/native" }]
  });

  // Then the native absolute path reaches the official flow.
  expect(path).toBe("/work/native");
});
