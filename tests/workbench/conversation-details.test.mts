import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveThreadMessages } from "../../src/workbench/workbenchModel";
import { ConversationMessages } from "../../src/workbench/ConversationMessages";

test("only protocol-typed details collapse; failures and final prose stay visible", () => {
  const source = { turns: [{ id: "turn-1", items: [
    { id: "user", type: "userMessage", content: [{ type: "text", text: "Keep the answer visible" }] },
    { id: "progress", type: "agentMessage", phase: "commentary", text: "Checking the current implementation" },
    { id: "tool", type: "commandExecution", status: "completed", aggregatedOutput: "ordinary output mentions error" },
    { id: "failed", type: "commandExecution", status: "completed", exitCode: 1, aggregatedOutput: "Cannot open input\nlong stack trace" },
    { id: "mcp", type: "mcpToolCall", status: "failed", error: { message: "Tool unavailable" } },
    { id: "final", type: "agentMessage", phase: "final_answer", text: "Final **answer**" },
    { id: "legacy", role: "assistant", text: "An older answer without phase metadata" },
    { id: "system", role: "system", text: "Action required" }
  ] }] };
  const original = structuredClone(source);
  const messages = deriveThreadMessages(source);
  expect(messages.find(item => item.id === "tool")?.failureSummary).toBeUndefined();
  expect(messages.find(item => item.id === "failed")?.failureSummary).toBe("Cannot open input");
  expect(messages.find(item => item.id === "mcp")?.failureSummary).toBe("Tool unavailable");
  const rendered: string[] = [];
  const html = renderToStaticMarkup(createElement(ConversationMessages, {
    threadId: "thread-1", activeTurnId: "turn-1", running: true, locale: "en",
    messages, start: 0, end: messages.length, events: ["item/completed"],
    renderContent(message) { rendered.push(message.id); return createElement("p", null, message.text); }
  }));
  expect(rendered).toEqual(["user", "final", "legacy", "system"]);
  expect(html).toContain("Checking the current implementation");
  expect(html).toContain("Cannot open input");
  expect(html).not.toContain("long stack trace");
  expect(html).toContain("Final **answer**");
  expect(html).toContain("Action required");
  expect(html).toContain('aria-expanded="false"');
  expect(source).toEqual(original);
  expect(messages.find(item => item.id === "failed")?.text).toContain("long stack trace");
});

test("historical commentary is never presented as the current turn's progress", () => {
  const messages = deriveThreadMessages({ turns: [{ id: "old", items: [
    { id: "progress", type: "agentMessage", phase: "commentary", text: "Old progress" }
  ] }] });
  const html = renderToStaticMarkup(createElement(ConversationMessages, {
    threadId: "thread-1", activeTurnId: "new", running: true, locale: "en",
    messages, start: 0, end: 1, events: [], renderContent: message => message.text
  }));
  expect(html).toContain("Working");
  expect(html).not.toContain("Old progress");
});
