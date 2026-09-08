import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceFilesTree, createWorkspaceTreeListing } from "../../src/integrations/deepseek-harness/WorkspaceFilesTree";
import type { ThreadWorkspaceListing } from "../../src/bridge/oplBridge";

// Build with scripts/bun-build-renderer-entry.ts, serve #root plus the generated
// CSS/module, and pass workspace-files-tree.mount-check.js to Playwright run-code.
const calls: string[] = [];
const opened: string[] = [];
let releaseSlow: (() => void) | undefined;
async function listWorkspace({ threadId, relativePath = "" }: { threadId: string; relativePath?: string }): Promise<ThreadWorkspaceListing> {
  calls.push(`${threadId}:${relativePath}`);
  if (relativePath === "slow") await new Promise<void>((resolve) => { releaseSlow = resolve; });
  if (relativePath === "missing") throw Object.assign(new Error("Directory disappeared"), { code: "workspace_path_not_found" });
  const entries = relativePath ? [{ name: "报告 #?.pdf", kind: "file" as const, relativePath: `${relativePath}/报告 #?.pdf`, sizeBytes: 20 }] : [
    { name: "file10.txt", kind: "file" as const, relativePath: "file10.txt" },
    { name: "escape", kind: "symlink" as const, relativePath: "escape" },
    { name: "nested", kind: "directory" as const, relativePath: "nested" },
    { name: "file2.txt", kind: "file" as const, relativePath: "file2.txt" },
    { name: "missing", kind: "directory" as const, relativePath: "missing" },
    { name: "slow", kind: "directory" as const, relativePath: "slow" }
  ];
  return { schema: "opl_thread_workspace_listing.v1", threadId, relativePath, entries, truncated: relativePath === "nested" };
}

Object.assign(window, { treeEvidence: { calls, opened, release: () => releaseSlow?.(), relativeListing: createWorkspaceTreeListing("/workspace", listWorkspace) } });

function Fixture() {
  const [threadId, setThreadId] = useState("thread-one");
  return <main>
    <button onClick={() => setThreadId("thread-two")}>Switch task</button>
    <WorkspaceFilesTree threadId={threadId} workspace="/workspace" locale="zh" listWorkspace={listWorkspace} onOpenFile={(path) => opened.push(path)} />
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
