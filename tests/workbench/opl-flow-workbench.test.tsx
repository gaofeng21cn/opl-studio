import React, { act } from "react";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Window } from "happy-dom";
import { Context } from "@deepseek-ai/cordis";
import type { OplActionReceipt, OplActionRequest, OplStudioShellService } from "@gaofeng21cn/opl-host-contracts";
import { OPL_STUDIO_SHELL_SERVICE } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { SlotRegistry } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/registry.ts";
import { oplFlowWorkbenchClientPlugin } from "../../plugins/extensions/opl-flow-workbench/src/client/plugin";
import { OplFlowWorkbenchPanel } from "../../plugins/extensions/opl-flow-workbench/src/client/OplFlowWorkbenchPanel";
import {
  OPL_FLOW_NAVIGATION_SCHEMA,
  OPL_FLOW_RESOURCE_URI,
  OPL_FLOW_UI_RESOURCE_REF,
  dispatchOplFlowMcpToolCall,
  executeOplFlowHostNavigation,
  isOplFlowPackageEnabled,
  parseOplFlowHostNavigationIntent,
  sandboxOplFlowDocument,
  type StudioWindowBridge
} from "../../plugins/extensions/opl-flow-workbench/src/client/oplFlowBridge";

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
  "MessageEvent",
  "MutationObserver",
  "ResizeObserver",
  "getComputedStyle",
  "IS_REACT_ACT_ENVIRONMENT"
] as const;
let originals: Map<string, PropertyDescriptor | undefined>;
let prevOplStudio: unknown;

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
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
            fetched_at: "2026-11-28T10:00:00Z",
            service: {
              installed: true,
              running: true,
              bridge: "auto",
              platform: "darwin",
              label: "dev.one-person-lab.opl-flow-router.demo"
            },
            counts: {
              needs_action: 1,
              safe_to_archive: 1,
              active_objectives: 1,
              active_sessions: 2,
              running_sessions: 1,
              blocked: 0,
              backlog: 1,
              pending_events: 0,
              total_objectives: 3
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
                }
              ],
              safe_to_archive: [],
              active_objectives: [],
              blocked: [],
              backlog: [],
              pending_events: []
            },
            active_sessions: {
              sessions: [],
              active_workspace_occupants: []
            },
            items: []
          }
        }
      }
    }
  };
}

function makeUiResourceEnvelope() {
  const siblingHtml = path.resolve(import.meta.dir, "../../../opl-flow/decision-dashboard/index.html");
  const html = existsSync(siblingHtml)
    ? readFileSync(siblingHtml, "utf8")
    : "<!doctype html><html><body><div id='app'>Canonical OPL Flow MCP App</div></body></html>";
  return {
    opl_app_contribution: {
      response: {
        ok: true,
        result: {
          ok: true,
          state: "ready",
          data: {
            uri: OPL_FLOW_RESOURCE_URI,
            mimeType: "text/html;profile=mcp-app",
            version: "0.1.98",
            text: html,
            _meta: {
              ui: {
                prefersBorder: true,
                csp: { connectDomains: [], resourceDomains: [] }
              }
            }
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
  setReadOnly: (blocked: boolean) => void;
} {
  const listeners = new Set<() => void>();
  const executed: OplActionRequest[] = [];
  const openedThreads: string[] = [];
  const openedViews: string[] = [];
  const startedWorkspaces: string[] = [];
  let readOnly = false;
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
      if (readOnly) {
        return {
          actionId: request.actionId,
          status: "blocked_read_only",
          blockedReason: "Read-only host blocks control-tower mutations",
          dryRun: false
        } as unknown as OplActionReceipt;
      }
      return {
        actionId: request.actionId,
        status: "executed",
        dryRun: false,
        stdoutJson: {
          opl_app_contribution: {
            response: {
              ok: true,
              result: { ok: true, result: { message: "Action ok" } }
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
    startConversationInWorkspace: async (workspacePath) => {
      startedWorkspaces.push(workspacePath);
    }
  } as unknown as OplStudioShellService;

  return {
    shell,
    emit: () => {
      for (const listener of listeners) listener();
    },
    executed,
    openedThreads,
    openedViews,
    startedWorkspaces,
    setReadOnly: (blocked) => {
      readOnly = blocked;
    }
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
            ? (browser as unknown as { ResizeObserver?: unknown }).ResizeObserver ?? class { observe() {} disconnect() {} }
            : (browser as unknown as Record<string, unknown>)[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  prevOplStudio = (browser as unknown as { oplStudio?: unknown }).oplStudio;
  ({ createRoot } = await import("react-dom/client"));
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  (browser as unknown as { oplStudio?: unknown }).oplStudio = prevOplStudio;
  browser.close();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test("isOplFlowPackageEnabled relies exclusively on v2 agent_packages and ui_contributions projections", () => {
  expect(isOplFlowPackageEnabled(null)).toBe(false);
  expect(isOplFlowPackageEnabled({ app_state: { agent_packages: { directory: { entries: [] } } } })).toBe(false);
  expect(
    isOplFlowPackageEnabled({
      app_state: {
        agent_packages: {
          directory: {
            entries: [{ package_id: "opl-flow", installed: true, enabled: false }]
          }
        }
      }
    })
  ).toBe(false);
  expect(
    isOplFlowPackageEnabled({
      app_state: {
        agent_packages: {
          directory: {
            entries: [{ package_id: "opl-flow", installed: true, enabled: true }]
          }
        }
      }
    })
  ).toBe(true);
  expect(
    isOplFlowPackageEnabled({
      app_state: {
        modules: {
          items: [{ id: "opl-flow", installed: true, enabled: true }]
        }
      }
    })
  ).toBe(false);
});

test("oplFlowWorkbenchClientPlugin conditionally mounts sidebar order 34 and main slot only when enabled", async () => {
  let enabled = false;
  (browser as unknown as { oplStudio?: StudioWindowBridge }).oplStudio = {
    readState: async () => ({
      app_state: {
        agent_packages: {
          directory: {
            entries: enabled ? [{ package_id: "opl-flow", installed: true, enabled: true }] : []
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

  await ctx.plugin(oplFlowWorkbenchClientPlugin);
  await flushAsync();
  expect(registry.entries("sidebar.panellist").some((item) => item.options.id === "opl-flow")).toBe(false);
  expect(registry.entries("main").some((item) => item.options.key === "opl-flow")).toBe(false);

  enabled = true;
  emit();
  await flushAsync();
  const sidebarEntry = registry.entries("sidebar.panellist").find((item) => item.options.id === "opl-flow");
  expect(sidebarEntry).toBeDefined();
  expect(sidebarEntry?.options.order).toBe(34);
  expect(registry.entries("main").some((item) => item.options.key === "opl-flow")).toBe(true);

  enabled = false;
  emit();
  await flushAsync();
  expect(registry.entries("sidebar.panellist").some((item) => item.options.id === "opl-flow")).toBe(false);
  expect(registry.entries("main").some((item) => item.options.key === "opl-flow")).toBe(false);
  await ctx.fiber.dispose();
});

test("OplFlowWorkbenchPanel mounts canonical MCP App HTML in a sandboxed iframe and bridges host navigation intents", async () => {
  const { shell, openedThreads, openedViews, startedWorkspaces } = makeShellStub();
  const readCalls: Array<{ packageId: string; ref: string; input?: Record<string, unknown> }> = [];
  const bridge: StudioWindowBridge = {
    readContribution: async (req) => {
      readCalls.push(req);
      if (req.ref === OPL_FLOW_UI_RESOURCE_REF) {
        return makeUiResourceEnvelope();
      }
      if (req.ref === "opl-flow.decision.v1#dashboard") {
        return makeDashboardEnvelope();
      }
      throw new Error(`Unexpected ref: ${req.ref}`);
    }
  };

  await act(async () => {
    root.render(<OplFlowWorkbenchPanel shell={shell} bridge={bridge} />);
  });
  await act(async () => {
    await flushAsync();
  });

  expect(readCalls.some((c) => c.packageId === "opl-flow" && c.ref === OPL_FLOW_UI_RESOURCE_REF)).toBe(true);
  expect(
    readCalls.some(
      (c) =>
        c.packageId === "opl-flow"
        && c.ref === "opl-flow.decision.v1#dashboard"
        && c.input?.host_carrier === "codex"
        && c.input?.include_local_navigation === true
    )
  ).toBe(true);

  const iframe = document.querySelector('[data-testid="opl-flow-mcp-app-frame"]') as HTMLIFrameElement | null;
  expect(iframe).toBeTruthy();
  expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts allow-downloads");
  expect(iframe?.srcdoc).toContain("Content-Security-Policy");
  expect(iframe?.srcdoc).toContain("default-src 'none'");

  // Verify host navigation postMessage with matching iframe source triggers native jump and deduplicates duplicates.
  const dispatchNav = async (payload: Record<string, unknown>, source: unknown) => {
    const evt = new browser.MessageEvent("message", { data: payload, source: source as Window });
    await act(async () => {
      browser.dispatchEvent(evt);
      await flushAsync();
    });
  };

  // Untrusted source must be ignored.
  await dispatchNav(
    {
      type: "opl_flow.host_navigate",
      schema: OPL_FLOW_NAVIGATION_SCHEMA,
      jump_mode: "native_switch",
      thread_id: "thread-spoofed"
    },
    null
  );
  expect(openedThreads).toEqual([]);

  // Trusted iframe source routes native_switch once (deduped within short window).
  const frameWindow = iframe?.contentWindow;
  expect(frameWindow).toBeTruthy();
  await dispatchNav(
    {
      type: "opl_flow.host_navigate",
      schema: OPL_FLOW_NAVIGATION_SCHEMA,
      jump_mode: "native_switch",
      execution_carrier: "codex",
      bead_id: "opl-101",
      thread_id: "thread-codex-101"
    },
    frameWindow
  );
  await dispatchNav(
    {
      type: "opl_flow.host_navigate",
      schema: OPL_FLOW_NAVIGATION_SCHEMA,
      jump_mode: "native_switch",
      execution_carrier: "codex",
      bead_id: "opl-101",
      thread_id: "thread-codex-101"
    },
    frameWindow
  );
  expect(openedThreads).toEqual(["thread-codex-101"]);
  expect(openedViews).toEqual(["chat"]);

  // launch_new opens a new workspace conversation.
  await dispatchNav(
    {
      type: "opl_flow.host_navigate",
      schema: OPL_FLOW_NAVIGATION_SCHEMA,
      jump_mode: "launch_new",
      workspace_path: "/tmp/ws-done"
    },
    frameWindow
  );
  expect(startedWorkspaces).toEqual(["/tmp/ws-done"]);
  expect(openedViews).toEqual(["chat", "chat"]);

  // external_focus_only never triggers misrouted jumps.
  await dispatchNav(
    {
      type: "opl_flow.host_navigate",
      schema: OPL_FLOW_NAVIGATION_SCHEMA,
      jump_mode: "external_focus_only",
      session_id: "agy-conv-102",
      workspace_path: "/tmp/ws-agy"
    },
    frameWindow
  );
  expect(openedThreads).toEqual(["thread-codex-101"]);
  expect(startedWorkspaces).toEqual(["/tmp/ws-done"]);
});

test("dispatchOplFlowMcpToolCall routes all five canonical MCP App tools and enforces read-only guard", async () => {
  const { shell, executed, setReadOnly } = makeShellStub();
  const bridge: StudioWindowBridge = {
    readContribution: async (req) => {
      if (req.ref === "opl-flow.decision.v1#dashboard") return makeDashboardEnvelope();
      throw new Error(`Unexpected ref: ${req.ref}`);
    }
  };

  const dash = await dispatchOplFlowMcpToolCall("open_opl_flow_dashboard", {}, { bridge, shell });
  expect(dash.isError).toBeUndefined();
  expect((dash.structuredContent as Record<string, unknown>).presentation).toEqual({
    mode: "mcp-app",
    resource_uri: OPL_FLOW_RESOURCE_URI
  });

  const sendRes = await dispatchOplFlowMcpToolCall(
    "opl_flow_send",
    { message: "Proceed with release", executor: "dsh", now: true },
    { bridge, shell }
  );
  expect(sendRes.isError).toBeUndefined();
  expect(executed[0]).toMatchObject({
    actionId: "package_contribution_execute",
    payload: {
      package_id: "opl-flow",
      ref: "opl-flow.decision.v1#send",
      input: { message: "Proceed with release", executor: "dsh", now: true },
      confirmed: true
    }
  });

  await dispatchOplFlowMcpToolCall(
    "opl_flow_approve_archive",
    { bead_id: "opl-103", approved_by: "owner", confirmed: true },
    { bridge, shell }
  );
  expect(executed[1]?.payload).toMatchObject({ ref: "opl-flow.decision.v1#approve" });

  await dispatchOplFlowMcpToolCall("opl_flow_router_tick", { bridge: "auto" }, { bridge, shell });
  expect(executed[2]?.payload).toMatchObject({ ref: "opl-flow.decision.v1#tick" });

  await dispatchOplFlowMcpToolCall(
    "opl_flow_router_service",
    { action: "up", bridge: "auto", confirmed: true },
    { bridge, shell }
  );
  expect(executed[3]?.payload).toMatchObject({ ref: "opl-flow.decision.v1#service" });

  setReadOnly(true);
  const blocked = await dispatchOplFlowMcpToolCall("opl_flow_router_tick", {}, { bridge, shell });
  expect(blocked.isError).toBe(true);
  expect(blocked.content[0]?.text).toContain("Read-only host");

  const unknown = await dispatchOplFlowMcpToolCall("opl_flow_unknown_tool", {}, { bridge, shell });
  expect(unknown.isError).toBe(true);
});

test("sandboxOplFlowDocument and host navigation parser reject malformed inputs", async () => {
  const doc = sandboxOplFlowDocument({ text: "<html></html>" });
  expect(doc).toContain("connect-src 'none'");
  expect(parseOplFlowHostNavigationIntent({ schema: "wrong", jump_mode: "native_switch" })).toBeNull();
  const { shell, openedThreads, startedWorkspaces } = makeShellStub();
  const handled = await executeOplFlowHostNavigation(
    {
      schema: OPL_FLOW_NAVIGATION_SCHEMA,
      jump_mode: "external_focus_only",
      thread_id: "thread-ignored",
      workspace_path: "/tmp/ignored"
    },
    shell
  );
  expect(handled).toBe(false);
  expect(openedThreads).toEqual([]);
  expect(startedWorkspaces).toEqual([]);
});

test("OplFlowWorkbenchPanel surfaces actionable upgrade guidance when legacy opl-flow lacks ui_resource", async () => {
  const { shell } = makeShellStub();
  const bridge: StudioWindowBridge = {
    readContribution: async (req) => {
      if (req.ref === OPL_FLOW_UI_RESOURCE_REF) {
        return {
          exitCode: 1,
          stderr: "请求未指定已声明的看板视图或动作。",
          stdoutJson: {
            opl_app_contribution: {
              package_id: "opl-flow",
              operation: "read",
              ref: OPL_FLOW_UI_RESOURCE_REF,
              response: {
                ok: false,
                state: "error",
                error: {
                  code: "invalid_request",
                  message: "请求未指定已声明的看板视图或动作。"
                }
              }
            }
          }
        };
      }
      if (req.ref === "opl-flow.decision.v1#dashboard") {
        return makeDashboardEnvelope();
      }
      throw new Error(`Unexpected ref: ${req.ref}`);
    }
  };

  await act(async () => {
    root.render(<OplFlowWorkbenchPanel shell={shell} bridge={bridge} />);
  });
  await act(async () => {
    await flushAsync();
  });

  const alert = document.querySelector('[data-testid="opl-flow-host-error"]');
  expect(alert?.textContent).toContain("Update OPL Flow in Software Center");
  expect(alert?.textContent).not.toContain("请求未指定已声明的看板视图或动作");
});

test("OplFlowWorkbenchPanel syncs locale changes without remounting the MCP App iframe", async () => {
  const stub = makeShellStub();
  const mutableSnapshot = stub.shell.getSnapshot() as { locale: "zh" | "en" };
  let uiReadCount = 0;
  const bridge: StudioWindowBridge = {
    readContribution: async (req) => {
      if (req.ref === OPL_FLOW_UI_RESOURCE_REF) {
        uiReadCount += 1;
        return makeUiResourceEnvelope();
      }
      if (req.ref === "opl-flow.decision.v1#dashboard") {
        return makeDashboardEnvelope();
      }
      throw new Error(`Unexpected ref: ${req.ref}`);
    }
  };

  await act(async () => {
    root.render(<OplFlowWorkbenchPanel shell={stub.shell} bridge={bridge} />);
  });
  await act(async () => {
    await flushAsync();
  });

  const iframeBefore = document.querySelector('[data-testid="opl-flow-mcp-app-frame"]') as HTMLIFrameElement | null;
  expect(iframeBefore).toBeTruthy();
  expect(uiReadCount).toBe(1);

  mutableSnapshot.locale = "en";
  await act(async () => {
    stub.emit();
    await flushAsync();
  });

  const iframeAfter = document.querySelector('[data-testid="opl-flow-mcp-app-frame"]') as HTMLIFrameElement | null;
  expect(iframeAfter).toBe(iframeBefore);
  expect(uiReadCount).toBe(1);
});
