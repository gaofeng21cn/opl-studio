import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import React, { act } from "react";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { Context } from "@deepseek-ai/cordis";
import { OPL_STUDIO_SHELL_SERVICE } from "@gaofeng21cn/opl-dsh-adapters/ui-kit";
import { SlotRegistry } from "../../vendor/deepseek-harness/packages/client/ui-renderer/src/client/registry.ts";
import { createStudioShellStore } from "../../plugins/core/opl-studio-client/src/client/composition/studioShellStore";
import { createMaterialsSpaceService } from "../../plugins/extensions/opl-materials-space/src/materials-service.mjs";
import { materialsSpaceClientPlugin } from "../../plugins/extensions/opl-materials-space/src/client/plugin";
import {
  MaterialsSpacePanel,
  MaterialsSpaceSlotPanel,
  type MaterialsSpaceBridge
} from "../../plugins/extensions/opl-materials-space/src/client/MaterialsSpacePanel";
import type { MaterialSpaceCatalog } from "@gaofeng21cn/opl-host-contracts";

let createRoot: typeof import("react-dom/client").createRoot;
let browser: Window;
let root: ReturnType<typeof createRoot>;

const domKeys = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
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
let domOriginals: Map<string, PropertyDescriptor | undefined>;

beforeEach(async () => {
  browser = new Window({ url: "http://127.0.0.1/" });
  domOriginals = new Map(domKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of domKeys) {
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
  ({ createRoot } = await import("react-dom/client"));
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  browser.close();
  for (const [key, descriptor] of domOriginals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test("createMaterialsSpaceService discovers projects, curates deliverables while excluding runtime/control/controller internals, and enforces filesystem containment", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opl-materials-test-"));
  try {
    const masDir = path.join(tempRoot, "DM-CVD-Mortality-Risk");
    const castDir = path.join(tempRoot, "科普视频");
    const outsideSecret = path.join(tempRoot, "outside-secret.txt");
    await fs.writeFile(outsideSecret, "TOP_SECRET", "utf8");

    // MAS directory structure with internal state folders + real deliverables
    await fs.mkdir(path.join(masDir, "studies/study-1/deliveries"), { recursive: true });
    await fs.mkdir(path.join(masDir, "runtime"), { recursive: true });
    await fs.mkdir(path.join(masDir, "control"), { recursive: true });
    await fs.mkdir(path.join(masDir, "controller"), { recursive: true });
    await fs.mkdir(path.join(masDir, "controller_decisions"), { recursive: true });
    await fs.mkdir(path.join(masDir, ".codex"), { recursive: true });
    await fs.writeFile(path.join(masDir, "STUDY_STATUS.md"), "# Status\nAll milestones ready.", "utf8");
    await fs.writeFile(path.join(masDir, "studies/study-1/deliveries/manuscript.md"), "# Manuscript\nResult table included.", "utf8");
    await fs.writeFile(path.join(masDir, "studies/study-1/deliveries/table.csv"), "group,value\nA,12.5\nB,8.4\n", "utf8");
    await fs.writeFile(path.join(masDir, "studies/study-1/deliveries/report.html"), "<h1>HTML Report</h1>", "utf8");
    await fs.writeFile(path.join(masDir, "runtime/state.json"), '{"internal":true}', "utf8");
    await fs.writeFile(path.join(masDir, "control/lock.json"), '{"locked":true}', "utf8");
    await fs.writeFile(path.join(masDir, "controller/decisions.json"), '{"step":1}', "utf8");
    await fs.writeFile(path.join(masDir, "controller_decisions/d1.md"), "# Internal controller", "utf8");
    await fs.writeFile(path.join(masDir, ".codex/internal.txt"), "internal", "utf8");
    await fs.symlink(outsideSecret, path.join(masDir, "studies/study-1/deliveries/escape-link.md"));

    // Med Auto Cast directory (agent missing from agent_catalog)
    await fs.mkdir(path.join(castDir, "productions"), { recursive: true });
    await fs.writeFile(path.join(castDir, "README.md"), "# 科普视频项目", "utf8");
    await fs.writeFile(path.join(castDir, "productions/video-preview.html"), "<p>Video</p>", "utf8");

    const service = createMaterialsSpaceService({
      readAppState: async () => ({
        app_state: {
          operator: {
            workbench: {
              work_item_projection_v2: {
                agent_catalog: [{ agent_id: "mas", display_name: "Med Auto Science" }],
                project_catalog: [
                  { project_id: "mas:dm", agent_id: "mas", display_name: "DM-CVD-Mortality-Risk", workspace_path: masDir, binding_status: "active" },
                  { project_id: "med-autocast:video", agent_id: "med-autocast", agent_display_name: "Med Auto Cast", display_name: "科普视频", workspace_path: castDir, binding_status: "active" },
                  { project_id: "mas:missing", agent_id: "mas", display_name: "Missing-Dir", workspace_path: path.join(tempRoot, "nonexistent"), binding_status: "inactive" }
                ],
                items: [
                  {
                    item_id: "mas:dm::study-1",
                    identity: {
                      agent_id: "mas",
                      project_id: "mas:dm",
                      work_item_id: "study-1",
                      work_item_root: "studies/study-1",
                      work_item_display_name: "DM Mortality Study"
                    },
                    lifecycle: { primary_state: "delivered_auto_paused", package_status: "milestone_delivered" }
                  }
                ]
              }
            }
          }
        }
      })
    });

    const catalog = await service.listSpaces({ refresh: true });
    expect(catalog.agents.map((a) => a.id).sort()).toEqual(["mas", "med-autocast"]);
    expect(catalog.projects.find((p) => p.projectId === "mas:dm")?.exists).toBe(true);
    expect(catalog.projects.find((p) => p.projectId === "mas:missing")?.exists).toBe(false);

    const deliverables = await service.scanDeliverables({ projectId: "mas:dm" });
    const paths = deliverables.entries.map((entry) => entry.relativePath);
    expect(paths).toContain("studies/study-1/deliveries/manuscript.md");
    expect(paths).toContain("studies/study-1/deliveries/table.csv");
    expect(paths).toContain("studies/study-1/deliveries/report.html");
    expect(paths).toContain("STUDY_STATUS.md");
    for (const excluded of ["runtime/state.json", "control/lock.json", "controller/decisions.json", "controller_decisions/d1.md", ".codex/internal.txt", "studies/study-1/deliveries/escape-link.md"]) {
      expect(paths).not.toContain(excluded);
    }
    const studyEntry = deliverables.entries.find((e) => e.relativePath === "studies/study-1/deliveries/manuscript.md");
    expect(studyEntry?.workItemId).toBe("study-1");
    expect(studyEntry?.category).toBe("document");

    const listing = await service.listWorkspace({ projectId: "mas:dm", relativePath: "studies/study-1/deliveries" });
    expect(listing.entries.some((e) => e.name === "table.csv")).toBe(true);

    const searched = await service.searchWorkspace({ projectId: "mas:dm", query: "manuscript" });
    expect(searched.entries.some((e) => e.relativePath === "studies/study-1/deliveries/manuscript.md")).toBe(true);

    const readOk = await service.readBytes({ projectId: "mas:dm", relativePath: "studies/study-1/deliveries/table.csv" });
    expect(Buffer.from(readOk.data, "base64").toString("utf8")).toContain("group,value");
    await expect(
      service.readBytes({
        projectId: "mas:dm",
        relativePath: "studies/study-1/deliveries/table.csv",
        ifMatch: '"mismatch-etag"'
      })
    ).rejects.toMatchObject({ code: "workspace_file_changed" });

    await expect(service.listWorkspace({ projectId: "unknown:id" })).rejects.toMatchObject({ httpStatus: 404 });
    await expect(service.readBytes({ projectId: "mas:dm", relativePath: "../outside-secret.txt" })).rejects.toThrow();
    await expect(service.readBytes({ projectId: "mas:dm", relativePath: "studies/study-1/deliveries/escape-link.md" })).rejects.toThrow();
    const dl = await service.download({ projectId: "mas:dm", relativePath: "STUDY_STATUS.md" });
    try {
      expect(dl.name).toBe("STUDY_STATUS.md");
    } finally {
      dl.stream?.destroy?.();
      await dl.close?.();
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("materialsSpaceClientPlugin registers sidebar/main slots, isolates crashes, and renders deliverables, CSV, Markdown, HTML preview, and semantic breadcrumbs", async () => {
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

  materialsSpaceClientPlugin.apply(ctx);

  expect(registry.entries("sidebar.panellist").some((entry) => entry.options.id === "materials" && entry.options.order === 25)).toBe(true);
  expect((registry.entries("main").find((entry) => entry.options.key === "materials") as any)?.registrant).toBe("opl-materials-space");

  const catalog: MaterialSpaceCatalog = {
    schema: "opl_materials_space_catalog.v1",
    generatedAt: "2026-11-23T12:00:00Z",
    agents: [{ id: "mas", displayName: "Med Auto Science", projectCount: 1 }],
    projects: [{
      projectId: "mas:dm",
      agentId: "mas",
      agentDisplayName: "Med Auto Science",
      displayName: "DM-CVD-Mortality-Risk",
      workspacePath: "/tmp/dm",
      bindingStatus: "active",
      exists: true,
      workItems: [{ workItemId: "study-1", title: "Study 1", status: "delivered_auto_paused", relativeRoot: "studies/study-1" }]
    }]
  };

  const files = new Map<string, string>([
    ["studies/study-1/deliveries/summary.md", "# Deliverable Heading\nSummary text"],
    ["studies/study-1/deliveries/results.csv", "col1,col2\nalpha,42\nbeta,99\n"],
    ["studies/study-1/deliveries/report.html", "<div>HTML View</div>"]
  ]);

  const bridge: MaterialsSpaceBridge = {
    nativeFileAccess: false,
    async listMaterialSpaces() {
      return catalog;
    },
    async scanProjectDeliverables() {
      return {
        schema: "opl_project_deliverables_scan.v1",
        projectId: "mas:dm",
        workspacePath: "/tmp/dm",
        entries: [
          {
            relativePath: "studies/study-1/deliveries/summary.md",
            name: "summary.md",
            extension: ".md",
            category: "document",
            group: "Study 1",
            workItemId: "study-1",
            workItemTitle: "Study 1",
            sizeBytes: 34,
            modifiedAt: "2026-11-23T11:55:00Z",
            previewable: true
          },
          {
            relativePath: "studies/study-1/deliveries/results.csv",
            name: "results.csv",
            extension: ".csv",
            category: "data",
            group: "Study 1",
            workItemId: "study-1",
            workItemTitle: "Study 1",
            sizeBytes: 28,
            modifiedAt: "2026-11-23T11:50:00Z",
            previewable: true
          },
          {
            relativePath: "studies/study-1/deliveries/report.html",
            name: "report.html",
            extension: ".html",
            category: "document",
            group: "Study 1",
            workItemId: "study-1",
            workItemTitle: "Study 1",
            sizeBytes: 22,
            modifiedAt: "2026-11-23T11:45:00Z",
            previewable: true
          }
        ],
        totalCount: 3,
        truncated: false,
        scannedAt: "2026-11-23T12:00:00Z"
      };
    },
    async listProjectWorkspace({ relativePath = "" }) {
      if (!relativePath) {
        return {
          schema: "opl_project_workspace_listing.v1",
          projectId: "mas:dm",
          relativePath: "",
          entries: [{ name: "studies", relativePath: "studies", kind: "directory" }],
          truncated: false
        };
      }
      return {
        schema: "opl_project_workspace_listing.v1",
        projectId: "mas:dm",
        relativePath,
        entries: [{ name: "summary.md", relativePath: `${relativePath}/summary.md`, kind: "file", sizeBytes: 34 }],
        truncated: false
      };
    },
    async searchProjectWorkspace({ query }) {
      return {
        schema: "opl_project_workspace_search.v1",
        projectId: "mas:dm",
        query,
        entries: [{ name: "summary.md", relativePath: "studies/study-1/deliveries/summary.md", kind: "file", sizeBytes: 34 }],
        truncated: false
      };
    },
    async readProjectWorkspaceBytes({ relativePath }) {
      const content = files.get(relativePath) ?? "";
      return {
        relativePath,
        etag: `"${relativePath}"`,
        sizeBytes: Buffer.byteLength(content),
        totalBytes: Buffer.byteLength(content),
        offset: 0,
        eof: true,
        data: Buffer.from(content, "utf8").toString("base64")
      };
    },
    async accessProjectWorkspace() {
      return { accepted: true };
    }
  };

  await act(async () => {
    root.render(
      <MaterialsSpacePanel
        locale="zh"
        bridge={bridge}
        panelFocus={{ agentId: "mas", projectId: "mas:dm", workItemId: "study-1" }}
      />
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

  // Auto-selected Markdown deliverable renders
  expect(document.body.textContent).toContain("Deliverable Heading");
  expect(document.body.textContent).toContain("summary.md");

  // Click CSV deliverable and verify table preview
  const csvRow = Array.from(document.body.querySelectorAll<HTMLButtonElement>(".materials-entry-row")).find((btn) =>
    btn.textContent?.includes("results.csv")
  );
  await act(async () => {
    csvRow?.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(document.body.querySelector("table")).not.toBeNull();
  expect(document.body.textContent).toContain("alpha");

  // Click HTML deliverable and verify sandboxed iframe
  const htmlRow = Array.from(document.body.querySelectorAll<HTMLButtonElement>(".materials-entry-row")).find((btn) =>
    btn.textContent?.includes("report.html")
  );
  await act(async () => {
    htmlRow?.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  const iframe = document.body.querySelector<HTMLIFrameElement>("iframe[sandbox='']");
  expect(iframe).not.toBeNull();

  // Switch to All Files tab and inspect semantic breadcrumbs (<nav aria-label><ol><li><a aria-current="page">)
  const tabs = Array.from(document.body.querySelectorAll<HTMLButtonElement>("[role='tab']"));
  expect(tabs).toHaveLength(2);
  await act(async () => {
    tabs[1]?.click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  const breadcrumbNav = document.body.querySelector("nav.materials-breadcrumbs");
  expect(breadcrumbNav).not.toBeNull();
  expect(breadcrumbNav?.querySelector("ol > li > a[aria-current='page']")).not.toBeNull();

  // Verify PluginErrorBoundary catches missing bridge cleanly
  const consoleErrors: unknown[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => consoleErrors.push(args);
  try {
    await act(async () => {
      root.render(<MaterialsSpaceSlotPanel shell={store} />);
    });
  } finally {
    console.error = origError;
  }
  const fallback = document.body.querySelector("[data-testid='opl-plugin-error-boundary-fallback']");
  expect(fallback).not.toBeNull();
  expect(fallback?.getAttribute("data-plugin-id")).toBe("@gaofeng21cn/opl-materials-space");
});
