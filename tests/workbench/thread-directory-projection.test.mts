import { describe, expect, test } from "bun:test";
import { deriveThreadDirectory } from "../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel";

describe("Codex thread directory projection", () => {
  test("keeps canonical projects while flattening temporary and managed scratch workspaces", () => {
    const groups = deriveThreadDirectory({
      data: [
        {
          id: "canonical",
          title: "Canonical project",
          workspace: "/Users/test/Documents/Codex/codex-temp-canonical",
          canonicalProjectId: "/Users/test/workspace/one-person-lab",
          isTemporaryWorkspace: true,
          updatedAt: 6
        },
        {
          id: "temporary",
          title: "Temporary conversation",
          workspace: "/Users/test/Documents/Codex/codex-temp-temporary",
          isTemporaryWorkspace: true,
          updatedAt: 5
        },
        {
          id: "managed-scratch",
          title: "Managed scratch conversation",
          workspace: "/Users/test/Library/Application Support/One Person Lab/opl-data/conversations/users/system/2026/08/09/codex-temp-managed",
          updatedAt: 4
        },
        {
          id: "codex-scratch",
          title: "Codex scratch conversation",
          workspace: "/Users/test/Documents/Codex/scratch",
          updatedAt: 3.5
        },
        {
          id: "projectless",
          title: "No workspace conversation",
          workspace: "",
          updatedAt: 3
        },
        {
          id: "normal-workspace",
          title: "Normal workspace",
          workspace: "/Users/test/workspace/opl-studio",
          updatedAt: 2
        }
      ]
    });

    expect(groups.map((group) => group.id)).toEqual([
      "project:/Users/test/workspace/one-person-lab",
      "workspace:/Users/test/workspace/opl-studio",
      "projectless"
    ]);
    expect(groups[0].label).toBe("one-person-lab");
    expect(groups[0].threads.map((thread) => thread.id)).toEqual(["canonical"]);
    expect(groups[1].label).toBe("opl-studio");
    expect(groups[2].workspace).toBeUndefined();
    expect(groups[2].threads.map((thread) => thread.id)).toEqual([
      "temporary",
      "managed-scratch",
      "codex-scratch",
      "projectless"
    ]);
  });
});
