import React, { act } from "react";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { Context } from "@deepseek-ai/cordis";
import type { OplActionReceipt, OplActionRequest, OplStudioShellService } from "@gaofeng21cn/opl-host-contracts";
import { OPL_STUDIO_SHELL_SERVICE } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { SlotRegistry } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/registry.ts";
import { oplFlowWorkbenchClientPlugin } from "../../plugins/extensions/opl-flow-workbench/src/client/plugin";
import { OplFlowWorkbenchPanel } from "../../plugins/extensions/opl-flow-workbench/src/client/OplFlowWorkbenchPanel";
import { isOplFlowPackageEnabled, type StudioWindowBridge } from "../../plugins/extensions/opl-flow-workbench/src/client/oplFlowBridge";

let createRoot: typeof import("react-dom/client").createRoot;
let browser: Window;
let root: ReturnType<typeof createRoot>;

const keys = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLTextAreaElement",
  "Element",
  "Node",
  "Event",
  "MutationObserver",
  "ResizeObserver",
  "getComputedStyle",
  "IS_REACT_ACT_ENVIRONMENT"
] as const;
let originals: Map<string, PropertyDescriptor | undefined>;
let prevOplStudio: unknown;

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeDashboardEnvelope() {
  return {
    opl_app_contribution: {
      response: {
        ok: true,
        result: {
          ok: true,
          state: "ready",
          data: {
            schema: "opl-flow.decision.v1",
            instance_name: "gaofeng-mini-m5pro",
            fetched_at: "2026-11-27T10:00:00Z",
            service: {
              installed: true,
              running: true,
              bridge: "auto",
              platform: "darwin",
              label: "dev.one-person-lab.opl-flow-router.demo"
            },
            counts: {
              needs_action: 2,
              safe_to_archive: 1,
              active_objectives: 1,
              active_sessions: 2,
              blocked: 0,
              backlog: 1,
              pending_events: 0,
              total_objectives: 4
            },
            inbox: {
              needs_action: [
                {
                  bead_id: "opl-101",
                  title: "Codex native task ready for continuation",
                  status: "open",
                  execution_mode: "active",
                  execution_carrier: "codex",
                  workspace_path: "/tmp/ws-codex",
                  thread_id: "thread-codex-101",
                  jump_mode: "native_switch",
                  next_action: "Switch to native thread"
                },
                {
                  bead_id: "opl-102",
                  title: "AntiGravity long-running verification",
                  status: "in_progress",
                  execution_mode: "active",
                  execution_carrier: "antigravity",
                  workspace_path: "/tmp/ws-agy",
                  session_id: "agy-conv-102",
                  jump_mode: "external_focus_only",
                  first_blocker: "Held in AntiGravity window"
                }
              ],
              safe_to_archive: [
                {
                  bead_id: "opl-103",
                  title: "Completed PR cleanup",
                  execution_carrier: "codex",
                  workspace_path: "/tmp/ws-done",
                  jump_mode: "launch_new",
                  user_approval_required: true
                }
              ],
              active_objectives: [
                {
                  bead_id: "opl-101",
                  title: "Codex native task ready for continuation",
                  execution_carrier: "codex",
                  workspace_path: "/tmp/ws-codex",
                  thread_id: "thread-codex-101",
                  jump_mode: "native_switch"
                }
              ],
              blocked: [],
              backlog: [
                {
                  bead_id: "opl-104",
                  title: "Backlog item",
                  execution_mode: "backlog",
                  jump_mode: "launch_new"
                }
              ],
              pending_events: []
            },
            active_sessions: {
              sessions: [
                {
                  session_ref: "codex:thread-codex-101",
                  carrier: "codex",
                  surface: "codex",
                  model_label: "gpt-5.4",
                  title: "Codex thread 101",
                  workspace_label: "ws-codex",
                  workspace_path: "/tmp/ws-codex",
                  thread_id: "thread-codex-101",
                  jump_mode: "native_switch",
                  status: "active",
                  bound_bead_id: "opl-101"
                },
                {
                  session_ref: "dsh:sess-202",
                  carrier: "dsh",
                  surface: "opl-dsh",
                  model_label: "deepseek-chat",
                  title: "DSH session 202",
                  workspace_label: "ws-dsh",
                  workspace_path: "/tmp/ws-dsh",
                  session_id: "sess-202",
                  jump_mode: "external_focus_only",
                  status: "busy"
                }
              ],
              active_workspace_occupants: [
                {
                  workspace_label: "ws-codex",
                  workspace_path: "/tmp/ws-codex",
                  carrier: "codex",
                  session_ref: "codex:thread-codex-101",
                  bound_bead_id: "opl-101"
                }
              ]
            },
            items: []
          }
        }
      }
    }
  };
}

function makeShellStub(): {
  shell: OplStudioShellService;
  emit: () => void;
  executed: OplActionRequest[];
  openedThreads: string[];
  openedViews: string[];
  startedWorkspaces: string[];
} {
  const listeners = new Set<() => void>();
  const executed: OplActionRequest[] = [];
  const openedThreads: string[] = [];
  const openedViews: string[] = [];
  const startedWorkspaces: string[] = [];
  const snapshot = {
    locale: "zh" as const,
    primaryView: "opl-flow" as const,
    selectedWorkItemId: null,
    activeThreadId: null
  } as ReturnType<OplStudioShellService["getSnapshot"]>;
  const shell: OplStudioShellService = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refreshState: async () => {},
    executeAction: async (request): Promise<OplActionReceipt> => {
      executed.push(request);
      return {
        actionId: request.actionId,
        status: "executed",
        dryRun: false,
        stdoutJson: {
          opl_app_contribution: {
            response: {
              ok: true,
              result: { ok: true, message: "Action ok" }
            }
          }
        }
      } as unknown as OplActionReceipt;
    },
    openMaintenance: () => {},
    openPrimaryView: (view) => {
      openedViews.push(String(view));
    },
    openThread: async (threadId) => {
      openedThreads.push(threadId);
    },
    selectWorkItem: () => {},
    startConversationInWorkspace: (workspacePath) => {
      startedWorkspaces.push(workspacePath);
    }
  };
  return {
    shell,
    emit: () => {
      for (const l of listeners) l();
    },
    executed,
    openedThreads,
    openedViews,
    startedWorkspaces
  };
}

beforeEach(async () => {
  browser = new Window({ url: "http://127.0.0.1/" });
  originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) {
    const value = key === "IS_REACT_ACT_ENVIRONMENT"
      ? true
      : key === "window"
        ? browser
        : key === "ResizeObserver"
          ? ((browser as unknown as { ResizeObserver?: unknown }).ResizeObserver ?? class { observe() {} disconnect() {} })
          : (browser as unknown as Record<string, unknown>)[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  prevOplStudio = (window as unknown as { oplStudio?: unknown }).oplStudio;
  ({ createRoot } = await import("react-dom/client"));
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  if ((globalThis as unknown as { window?: { oplStudio?: unknown } }).window) {
    (globalThis as unknown as { window: { oplStudio?: unknown } }).window.oplStudio = prevOplStudio;
  }
  await act(async () => root.unmount());
  browser.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test("isOplFlowPackageEnabled accurately distinguishes installed+enabled vs disabled vs absent in real opld projection", () => {
  expect(isOplFlowPackageEnabled(null)).toBe(false);
  expect(
    isOplFlowPackageEnabled({
      app_state: {
        agent_packages: {
          status_index: { packages: { "opl-flow": { installed: true, app_enabled: false } } }
        },
        ui_contributions: { entries: [{ package_id: "opl-flow" }] }
      }
    })
  ).toBe(false);
  expect(
    isOplFlowPackageEnabled({
      app_state: {
        agent_packages: {
          status_index: { packages: { "opl-flow": { installed: true, app_enabled: true } } }
        }
      }
    })
  ).toBe(true);
  expect(
    isOplFlowPackageEnabled({
      app_state: {
        agent_packages: {
          directory: { entries: [{ package_id: "opl-flow", installed: true, app_enabled: true }] }
        }
      }
    })
  ).toBe(true);
});

test("oplFlowWorkbenchClientPlugin stays zero-presence until opl-flow is enabled, and unmounts on disable", async () => {
  let enabled = false;
  (window as unknown as { oplStudio?: StudioWindowBridge }).oplStudio = {
    readState: async () => ({
      app_state: {
        agent_packages: {
          status_index: {
            packages: enabled ? { "opl-flow": { installed: true, app_enabled: true } } : {}
          }
        }
      }
    })
  };

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
  const { shell, emit } = makeShellStub();
  ctx.provide(OPL_STUDIO_SHELL_SERVICE, shell);

  oplFlowWorkbenchClientPlugin.apply(ctx);
  await act(async () => {
    await flushAsync();
  });
  expect(registry.entries("sidebar.panellist").some((e) => e.options.id === "opl-flow")).toBe(false);

  enabled = true;
  await act(async () => {
    emit();
    await flushAsync();
  });
  const mountedSidebar = registry.entries("sidebar.panellist").find((e) => e.options.id === "opl-flow");
  expect(mountedSidebar).toBeDefined();
  expect(mountedSidebar?.options.order).toBe(34);
  expect(registry.entries("main").some((e) => e.options.key === "opl-flow")).toBe(true);

  enabled = false;
  await act(async () => {
    emit();
    await flushAsync();
  });
  expect(registry.entries("sidebar.panellist").some((e) => e.options.id === "opl-flow")).toBe(false);
  expect(registry.entries("main").some((e) => e.options.key === "opl-flow")).toBe(false);
  await ctx.fiber.dispose();
});

test("OplFlowWorkbenchPanel reads dashboard with local nav, enforces jump_mode without faking cross-app switch, and executes control actions", async () => {
  const readCalls: Array<{ packageId: string; ref: string; input?: Record<string, unknown> }> = [];
  const bridge: StudioWindowBridge = {
    readContribution: async (req) => {
      readCalls.push(req);
      return makeDashboardEnvelope();
    }
  };
  const { shell, executed, openedThreads, startedWorkspaces } = makeShellStub();

  await act(async () => {
    root.render(<OplFlowWorkbenchPanel shell={shell} bridge={bridge} />);
    await flushAsync();
  });

  expect(readCalls).toHaveLength(1);
  expect(readCalls[0]).toEqual({
    packageId: "opl-flow",
    ref: "opl-flow.decision.v1#dashboard",
    input: { include_local_navigation: true, host_carrier: "codex" }
  });
  expect(document.body.textContent).toContain("OPL Flow 总控");
  expect(document.body.textContent).toContain("Codex native task ready for continuation");
  expect(document.body.textContent).toContain("当前由 AntiGravity 持有");

  // Click "切换原生会话" (native_switch -> openThread)
  const buttons = Array.from(document.querySelectorAll("button"));
  const switchBtn = buttons.find((b) => b.textContent?.includes("切换原生会话"));
  expect(switchBtn).toBeDefined();
  await act(async () => {
    switchBtn!.click();
    await flushAsync();
  });
  expect(openedThreads).toEqual(["thread-codex-101"]);

  // Click "在此工作区新建 Codex 会话" for AntiGravity-held item (external_focus_only)
  const newCodexBtn = buttons.find((b) => b.textContent?.includes("在此工作区新建 Codex 会话"));
  expect(newCodexBtn).toBeDefined();
  await act(async () => {
    newCodexBtn!.click();
    await flushAsync();
  });
  expect(startedWorkspaces).toEqual(["/tmp/ws-agy"]);

  // Dispatch router tick action
  const tickBtn = buttons.find((b) => b.textContent?.includes("立即评估 (Tick)"));
  expect(tickBtn).toBeDefined();
  await act(async () => {
    tickBtn!.click();
    await flushAsync();
  });
  expect(executed).toHaveLength(1);
  expect(executed[0]).toEqual({
    actionId: "package_contribution_execute",
    payload: {
      package_id: "opl-flow",
      ref: "opl-flow.decision.v1#tick",
      input: { dry_run: false },
      confirmed: true
    },
    dryRun: false
  });

  // Dispatch service toggle action
  const stopBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("停止路由"));
  expect(stopBtn).toBeDefined();
  await act(async () => {
    stopBtn!.click();
    await flushAsync();
  });
  expect(executed[1]).toEqual({
    actionId: "package_contribution_execute",
    payload: {
      package_id: "opl-flow",
      ref: "opl-flow.decision.v1#service",
      input: { action: "down", bridge: "auto", confirmed: true },
      confirmed: true
    },
    dryRun: false
  });

  // Switch to safe_to_archive tab and approve with two-step confirmation
  const archiveTab = Array.from(document.querySelectorAll('[role="tab"]')).find((el) => el.textContent?.includes("待批归档")) as HTMLButtonElement | undefined;
  expect(archiveTab).toBeDefined();
  await act(async () => {
    archiveTab!.click();
    await flushAsync();
  });
  const approveBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("批准归档"));
  expect(approveBtn).toBeDefined();
  await act(async () => {
    approveBtn!.click();
    await flushAsync();
  });
  const confirmApproveBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("确认归档"));
  expect(confirmApproveBtn).toBeDefined();
  await act(async () => {
    confirmApproveBtn!.click();
    await flushAsync();
  });
  expect(executed[2]).toEqual({
    actionId: "package_contribution_execute",
    payload: {
      package_id: "opl-flow",
      ref: "opl-flow.decision.v1#approve",
      input: { bead_id: "opl-103", approved_by: "owner", confirmed: true },
      confirmed: true
    },
    dryRun: false
  });
});
