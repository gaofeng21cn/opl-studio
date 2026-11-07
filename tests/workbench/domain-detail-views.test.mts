import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DomainDetailViews } from "../../src/workbench/domainDetailViews";
import { McpAppsClientContext } from "../../plugins/opl-mcp-apps/src/client/plugin";

test("task detail delegates exact item and view to the DSH MCP Apps client", () => {
  let received: any;
  const client = { Workspace: () => null, TaskWorkbench: (props: any) => { received = props; return createElement("p", null, "shared workbench"); } };
  const html = renderToStaticMarkup(createElement(McpAppsClientContext.Provider, { value: client },
    createElement(DomainDetailViews, { item: { id: "canonical:item" } as any, locale: "zh", initialViewId: "research-roadmap", mcpApps: { bridge: {} as any, threadId: "thread", onContext() {}, onMessage() {} } })));
  expect(html).toContain("shared workbench");
  expect(received.itemId).toBe("canonical:item");
  expect(received.viewId).toBe("research-roadmap");
  expect(received.threadId).toBe("thread");
});
