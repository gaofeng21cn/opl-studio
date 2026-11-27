import React, { act } from "react";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { Context } from "@deepseek-ai/cordis";
import type {
  OplActionReceipt,
  OplActionRequest,
  OplStudioShellService,
  WorkItemRuntimeItem,
  WorkItemRuntimeProjection
} from "@gaofeng21cn/opl-host-contracts";
import { OPL_STUDIO_SHELL_SERVICE } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { SlotRegistry } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/registry.ts";
import { readWorkItemRuntimeProjection } from "../../plugins/core/opl-studio-client/src/client/workbench/workbenchModel-primitives";
import { createStudioShellStore } from "../../plugins/core/opl-studio-client/src/client/composition/studioShellStore";
import { runtimeStatusClientPlugin } from "../../plugins/extensions/opl-runtime-status/src/client/plugin";
import { RuntimeStatusPanel, RuntimeStatusSlotPanel } from "../../plugins/extensions/opl-runtime-status/src/client/RuntimeStatusPanel";

let createRoot: typeof import("react-dom/client").createRoot;
let browser: Window;
let root: ReturnType<typeof createRoot>;

const keys = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLDialogElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "Element",
  "Node",
  "Event",
  "MutationObserver",
  "ResizeObserver",
  "getComputedStyle",
  "IS_REACT_ACT_ENVIRONMENT"
] as const;
let originals: Map<string, PropertyDescriptor | undefined>;

function buildWorkItem(overrides: Partial<WorkItemRuntimeItem> = {}): WorkItemRuntimeItem {
  return {
    id: overrides.id ?? "mas:dm::study-1",
    agentId: overrides.agentId ?? "mas",
    agentDisplayName: overrides.agentDisplayName ?? "Med Auto Science",
    projectId: overrides.projectId ?? "mas:dm",
    projectDisplayName: overrides.projectDisplayName ?? "DM-CVD-Mortality-Risk",
    workspacePath: overrides.workspacePath ?? "/tmp/dm-study",
    workItemId: overrides.workItemId ?? "study-1",
    title: overrides.title ?? "Study 1",
    status: overrides.status ?? "automatically_advancing",
    statusLabel: overrides.statusLabel ?? "自动推进中",
    executionState: overrides.executionState ?? "running",
    activeSessionCount: overrides.activeSessionCount ?? 1,
    attentionKind: overrides.attentionKind ?? "none",
    telemetryState: overrides.telemetryState ?? "observed",
    archived: overrides.archived ?? false,
    visibilityGeneration: overrides.visibilityGeneration ?? 3,
    currentStageId: overrides.currentStageId ?? "analysis",
    currentStageName: overrides.currentStageName ?? "数据分析",
    attemptId: overrides.attemptId ?? "attempt-007",
    stages: overrides.stages ?? [
      {
        stageId: "design",
        displayName: "Study design",
        displayNameI18n: { zh: "研究设计", en: "Study design" },
        state: "completed",
        elapsedSeconds: 12,
        totalTokens: 1200
      },
      {
        stageId: "analysis",
        displayName: "Data analysis",
        displayNameI18n: { zh: "数据分析", en: "Data analysis" },
        state: "running",
        elapsedSeconds: 45,
        totalTokens: 3400
      },
      {
        stageId: "report",
        displayName: "Manuscript",
        displayNameI18n: { zh: "论文撰稿", en: "Manuscript" },
        state: "pending",
        elapsedSeconds: null,
        totalTokens: null
      }
    ],
    domainDetailViews: overrides.domainDetailViews ?? [
      {
        viewId: "study_brief",
        viewKind: "brief",
        title: "研究概览",
        availability: "available"
      }
    ],
    ...overrides
  };
}

function buildProjection(items: WorkItemRuntimeItem[]): WorkItemRuntimeProjection {
  return {
    schemaVersion: "work-item-projection.v2",
    generatedAt: "2026-11-23T12:00:00Z",
    summary: {
      agentCount: 1,
      projectCount: new Set(items.map((item) => item.projectId)).size,
      workItemCount: items.length,
      archivedWorkItemCount: items.filter((item) => item.archived).length,
      runningCount: items.filter((item) => item.status === "automatically_advancing").length,
      activeSessionCount: items.reduce((acc, item) => acc + item.activeSessionCount, 0),
      userAttentionCount: items.filter((item) => item.status === "awaiting_user_decision").length,
      systemAttentionCount: items.filter((item) => item.status === "system_attention").length,
      telemetryObservedCount: items.length,
      telemetryMissingCount: 0
    },
    agents: [{ id: "mas", label: "Med Auto Science" }],
    projects: items.map((item) => ({
      id: item.projectId,
      agentId: item.agentId,
      label: item.projectDisplayName,
      workspacePath: item.workspacePath
    })),
    items
  };
}

beforeEach(async () => {
  browser = new Window({ url: "http://127.0.0.1/" });
  originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value =
      key === "IS_REACT_ACT_ENVIRONMENT"
        ? true
        : key === "window"
          ? browser
          : key === "ResizeObserver"
            ? (browser as any).ResizeObserver ?? class { observe() {} disconnect() {} }
            : (browser as any)[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const dialogProto = (globalThis.HTMLDialogElement as typeof HTMLDialogElement | undefined)?.prototype as any;
  if (dialogProto) {
    if (typeof dialogProto.showModal !== "function") {
      dialogProto.showModal = function showModal() {
        this.setAttribute("open", "");
        this.open = true;
      };
    }
    if (typeof dialogProto.close !== "function") {
      dialogProto.close = function close(value?: string) {
        if (value !== undefined) this.returnValue = value;
        this.removeAttribute("open");
        this.open = false;
        this.dispatchEvent(new window.Event("close"));
      };
    }
  }
  ({ createRoot } = await import("react-dom/client"));
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  browser.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test("runtimeStatusClientPlugin registers sidebar panel & main slot and isolates render errors via PluginErrorBoundary", async () => {
  const ctx = new Context();
  const registry = new SlotRegistry(ctx);
  registry.register(
    { name: "root", registrant: "test-host", children: { main: { kind: "keyed", scope: "root" } } },
    () => null
  );
  registry.registerFactory(
    { name: "sidebar.panel.icon", scope: "root", children: { "sidebar.panellist": { kind: "list", scope: "root" } } },
    () => null
  );
  const store = createStudioShellStore();
  ctx.provide(OPL_STUDIO_SHELL_SERVICE, store);

  runtimeStatusClientPlugin.apply(ctx);

  const sidebarEntries = registry.entries("sidebar.panellist");
  expect(sidebarEntries.some((entry) => entry.options.id === "runtime" && entry.options.order === 20)).toBe(true);
  const mainEntry = registry.entries("main").find((entry) => entry.options.key === "runtime");
  expect((mainEntry as any)?.registrant).toBe("opl-runtime-status");

  const malformedSnapshot = {
    locale: "zh" as const,
    stateStatus: "ready" as const,
    snapshotSource: "live" as const,
    workItemRuntime: {
      // Intentionally malformed items field to trigger render error inside boundary.
      items: null as any,
      agents: [],
      projects: [],
      schemaVersion: "work-item-projection.v2",
      summary: {} as any
    }
  };
  const ThrowingShell = {
    ...store,
    getSnapshot() {
      return malformedSnapshot;
    }
  } as OplStudioShellService;

  const consoleErrors: unknown[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => consoleErrors.push(args);
  try {
    await act(async () => {
      root.render(<RuntimeStatusSlotPanel shell={ThrowingShell} />);
    });
  } finally {
    console.error = origError;
  }

  const fallback = document.body.querySelector("[data-testid='opl-plugin-error-boundary-fallback']");
  expect(fallback).not.toBeNull();
  expect(fallback?.getAttribute("data-plugin-id")).toBe("@gaofeng21cn/opl-runtime-status");
  expect(document.body.textContent).toContain("该扩展界面加载异常");
});

test("Active Runs Spotlight appears only while running items exist and steppers keep unique IDs across projects", async () => {
  const itemA = buildWorkItem({
    id: "mas:dm::shared-name",
    projectId: "mas:dm",
    projectDisplayName: "DM-CVD-Mortality-Risk",
    workItemId: "shared-name",
    title: "DM Study",
    status: "automatically_advancing",
    attemptId: "attempt-dm-1"
  });
  const itemB = buildWorkItem({
    id: "mas:obesity::shared-name",
    projectId: "mas:obesity",
    projectDisplayName: "Obesity",
    workItemId: "shared-name",
    title: "Obesity Study",
    status: "paused",
    executionState: "idle",
    activeSessionCount: 0,
    attemptId: "attempt-ob-2"
  });

  await act(async () => {
    root.render(
      <RuntimeStatusPanel
        locale="zh"
        projection={buildProjection([itemA, itemB])}
        stateStatus="ready"
        snapshotSource="live"
        autoRefresh={false}
        onRefresh={() => {}}
        onOpenMaintenance={() => {}}
      />
    );
  });

  const spotlight = document.body.querySelector("[data-testid='opl-runtime-active-spotlight']");
  expect(spotlight).not.toBeNull();
  expect(spotlight?.textContent).toContain("DM Study");

  const stageButtons = Array.from(document.body.querySelectorAll<HTMLButtonElement>(".runtime-stage-button"));
  expect(stageButtons).toHaveLength(2);
  const controlId0 = stageButtons[0]?.getAttribute("aria-controls");
  const controlId1 = stageButtons[1]?.getAttribute("aria-controls");
  expect(controlId0).toBeTruthy();
  expect(controlId1).toBeTruthy();
  expect(controlId0).not.toBe(controlId1);

  await act(async () => {
    stageButtons[0]?.click();
  });
  const popover = document.getElementById(controlId0!);
  expect(popover).not.toBeNull();
  expect(popover?.textContent).toContain("attempt-dm-1");

  // Idle-only projection hides Active Runs Spotlight
  const idleProjection = buildProjection([{ ...itemB, status: "delivered_auto_paused", packageStatus: "milestone_delivered" }]);
  await act(async () => {
    root.render(
      <RuntimeStatusPanel
        locale="zh"
        projection={idleProjection}
        stateStatus="ready"
        snapshotSource="live"
        autoRefresh={false}
        onRefresh={() => {}}
        onOpenMaintenance={() => {}}
      />
    );
  });
  expect(document.body.querySelector("[data-testid='opl-runtime-active-spotlight']")).toBeNull();
});

test("ArchiveConfirmDialog uses native <dialog>, sends payload.confirmed + expected_generation, and handles generation conflict", async () => {
  const item = buildWorkItem({ archived: false, visibilityGeneration: 7 });
  let projection = buildProjection([item]);
  const executedRequests: OplActionRequest[] = [];
  let conflictMode = true;
  let refreshCount = 0;

  const MockShell = () => {
    const [, setTick] = React.useState(0);
    return (
      <RuntimeStatusPanel
        locale="zh"
        projection={projection}
        stateStatus="ready"
        snapshotSource="live"
        autoRefresh={false}
        onRefresh={async () => {
          refreshCount += 1;
          projection = buildProjection([{ ...item, archived: executedRequests.length > 1, visibilityGeneration: 7 + executedRequests.length }]);
          setTick((v) => v + 1);
          return { workItemRuntime: projection };
        }}
        onOpenMaintenance={() => {}}
        onExecuteAction={async (req): Promise<OplActionReceipt> => {
          executedRequests.push(req);
          if (conflictMode) {
            conflictMode = false;
            return {
              actionId: req.actionId,
              dryRun: false,
              confirmationRequired: false,
              canExecute: true,
              receiptKind: "execute",
              authorityBoundary: "app_bridge_no_domain_authority",
              requestedMode: "execute",
              status: "error",
              command: "opl",
              commandArgs: [],
              exitCode: 1,
              stdout: "",
              stderr: "work_item_control_generation_conflict: stale generation 7",
              timedOut: false
            };
          }
          return {
            actionId: req.actionId,
            dryRun: false,
            confirmationRequired: false,
            canExecute: true,
            receiptKind: "execute",
            authorityBoundary: "app_bridge_no_domain_authority",
            requestedMode: "execute",
            status: "executed",
            command: "opl",
            commandArgs: [],
            exitCode: 0,
            stdout: "{}",
            stderr: "",
            timedOut: false
          };
        }}
      />
    );
  };

  await act(async () => {
    root.render(<MockShell />);
  });

  const archiveButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>(".runtime-row-inline-actions button")).find((btn) =>
    btn.textContent?.includes("归档")
  );
  expect(archiveButton).toBeTruthy();

  await act(async () => {
    archiveButton?.click();
  });

  const dialog = document.body.querySelector<HTMLDialogElement>("[data-testid='opl-runtime-archive-dialog']");
  expect(dialog).not.toBeNull();
  expect(dialog?.getAttribute("role")).toBeNull();
  expect(dialog?.getAttribute("aria-modal")).toBeNull();

  const confirmBtn = Array.from(dialog!.querySelectorAll<HTMLButtonElement>("button")).find((btn) =>
    btn.textContent?.includes("确认归档")
  );
  expect(confirmBtn).toBeTruthy();

  await act(async () => {
    confirmBtn?.click();
  });

  expect(executedRequests[0]).toEqual({
    actionId: "work_item_visibility_set",
    mode: "execute",
    payload: {
      confirmed: true,
      agent_id: "mas",
      project_id: "mas:dm",
      work_item_id: "study-1",
      visibility_state: "archived",
      expected_generation: 7
    }
  });
  expect(refreshCount).toBe(1);
  expect(dialog?.textContent).toContain("状态已被其他操作更新");

  // Retry succeeds and readback reflects archived state
  const retryConfirmBtn = Array.from(dialog!.querySelectorAll<HTMLButtonElement>("button")).find((btn) =>
    btn.textContent?.includes("确认归档")
  );
  await act(async () => {
    retryConfirmBtn?.click();
  });

  expect(executedRequests[1]?.payload?.expected_generation).toBe(8);
  expect(refreshCount).toBe(2);
  expect(document.body.textContent).toContain("已归档「Study 1」");
});

test("archive confirmation requires a unique matching owner row, including visibility", async () => {
  const item = buildWorkItem();
  const readbacks = [
    undefined,
    buildProjection([]),
    buildProjection([{ ...item, archived: true, agentId: "other" }]),
    buildProjection([{ ...item, archived: true }, { ...item, archived: false }]),
    buildProjection([{ ...item, archived: false }]),
  ];
  let actions = 0;
  let refreshes = 0;
  await act(async () => {
    root.render(<RuntimeStatusPanel locale="en" projection={buildProjection([item])} stateStatus="ready"
      snapshotSource="live" autoRefresh={false} onOpenMaintenance={() => {}}
      onRefresh={async () => readbacks[refreshes++]}
      onExecuteAction={async (request) => {
        actions++;
        return {
          actionId: request.actionId, dryRun: false, confirmationRequired: false, canExecute: true,
          receiptKind: "execute", authorityBoundary: "app_bridge_no_domain_authority", requestedMode: "execute",
          status: "executed", command: "opl", commandArgs: [], exitCode: 0, stdout: "", stderr: "", timedOut: false
        };
      }} />);
  });
  for (let attempt = 0; attempt < readbacks.length; attempt++) {
    await act(async () => document.querySelector<HTMLButtonElement>(".runtime-row-inline-actions button")!.click());
    await act(async () => document.querySelector<HTMLButtonElement>("dialog .runtime-btn-primary")!.click());
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(document.querySelector(".runtime-action-notice")?.textContent).toContain("Refresh");
    expect(document.body.textContent).not.toContain('Archived "Study 1"');
    expect(actions).toBe(attempt + 1);
    expect(refreshes).toBe(actions);
  }
});

test("restore reconciles a lost receipt with a single read of the same work item", async () => {
  const item = buildWorkItem({ archived: true });
  let actions = 0;
  let reads = 0;
  await act(async () => {
    root.render(<RuntimeStatusPanel locale="en" projection={buildProjection([item])} stateStatus="ready"
      snapshotSource="live" autoRefresh={false} onOpenMaintenance={() => {}}
      onRefresh={async () => {
        reads++;
        return { workItemRuntime: buildProjection([{ ...item, archived: reads === 1 ? undefined : false }]) };
      }}
      onExecuteAction={async () => {
        actions++;
        throw new Error("Owner response connection closed");
      }} />);
  });
  const library = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.includes("Archive") && button.textContent.includes("(1)"));
  expect(library).toBeTruthy();
  await act(async () => library!.click());

  const requestRestore = async () => {
    await act(async () => document.querySelector<HTMLButtonElement>(".runtime-row-inline-actions button")!.click());
    await act(async () => document.querySelector<HTMLButtonElement>("dialog .runtime-btn-primary")!.click());
  };
  await requestRestore();
  expect(document.querySelector(".runtime-action-notice")?.textContent).toContain("unconfirmed");
  expect(actions).toBe(1);
  expect(reads).toBe(1);

  await requestRestore();
  expect(document.querySelector(".runtime-action-notice")?.textContent).toContain('Restored "Study 1"');
  expect(actions).toBe(2);
  expect(reads).toBe(2);
});

test("the work-item projection preserves missing and unknown visibility", () => {
  const identity = { agent_id: "mas", project_id: "dm", work_item_id: "study", work_item_display_name: "Study" };
  const states = [undefined, "unknown", "visible", "archived"];
  const result = readWorkItemRuntimeProjection({
    schema_version: "work-item-projection.v2",
    items: states.map((state, index) => ({ item_id: String(index), identity, lifecycle: {},
      ...(state === undefined ? {} : { visibility: { state } }) })),
  });
  expect(result?.items.map((item) => item.archived)).toEqual([undefined, undefined, false, true]);
});

test("Clicking a work item opens local WorkItemDetailDrawer without an active thread and jumps to Materials Space", async () => {
  const item = buildWorkItem({ canonicalThreadIds: [] });
  const materialJumps: WorkItemRuntimeItem[] = [];

  await act(async () => {
    root.render(
      <RuntimeStatusPanel
        locale="zh"
        projection={buildProjection([item])}
        stateStatus="ready"
        snapshotSource="live"
        autoRefresh={false}
        onRefresh={() => {}}
        onOpenMaintenance={() => {}}
        onOpenMaterials={(target) => materialJumps.push(target)}
      />
    );
  });

  const openDetailBtn = document.body.querySelector<HTMLButtonElement>(".runtime-work-open-button");
  expect(openDetailBtn).not.toBeNull();

  await act(async () => {
    openDetailBtn?.click();
  });

  const detail = document.body.querySelector("[data-testid='opl-runtime-work-item-detail']");
  expect(detail).not.toBeNull();
  expect(detail?.textContent).toContain("Study 1");
  expect(detail?.textContent).toContain("研究概览");
  expect(detail?.textContent).not.toContain("先打开一个对话");

  const jumpBtn = Array.from(detail!.querySelectorAll<HTMLButtonElement>("button")).find((btn) =>
    btn.textContent?.includes("在资料空间查看交付材料")
  );
  expect(jumpBtn).toBeTruthy();

  await act(async () => {
    jumpBtn?.click();
  });

  expect(materialJumps).toHaveLength(1);
  expect(materialJumps[0]?.projectId).toBe("mas:dm");
});
