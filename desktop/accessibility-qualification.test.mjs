import assert from "node:assert/strict";
import test from "node:test";
import {
  captureDesktopAccessibility,
  summarizeAccessibilityTree
} from "./accessibility-qualification.mjs";

function node(role, name, overrides = {}) {
  return {
    ignored: false,
    role: { value: role },
    name: { value: name },
    ...overrides
  };
}

test("accessibility qualification requires the One Person Lab document and named controls", () => {
  const receipt = summarizeAccessibilityTree([
    node("RootWebArea", "One Person Lab"),
    node("button", "New task"),
    node("textbox", "Message"),
    node("combobox", "Model")
  ]);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.interactiveNodeCount, 3);
  assert.equal(receipt.unnamedInteractiveCount, 0);

  const unnamed = summarizeAccessibilityTree([
    node("RootWebArea", "One Person Lab"),
    node("button", "")
  ]);
  assert.equal(unnamed.status, "failed");
  assert.deepEqual(unnamed.unnamedInteractiveRoles, ["button"]);
});

test("accessibility capture detaches Chromium debugging after success and failure", async () => {
  let attached = false;
  const commands = [];
  const debug = {
    isAttached: () => attached,
    attach: () => { attached = true; },
    detach: () => { attached = false; },
    sendCommand: async (command) => {
      commands.push(command);
      return command === "Accessibility.getFullAXTree"
        ? { nodes: [node("RootWebArea", "One Person Lab"), node("button", "New task")] }
        : {};
    }
  };
  assert.equal((await captureDesktopAccessibility({ debugger: debug })).status, "passed");
  assert.deepEqual(commands, ["Accessibility.enable", "Accessibility.getFullAXTree"]);
  assert.equal(attached, false);

  debug.sendCommand = async (command) => command === "Accessibility.getFullAXTree"
    ? { nodes: [node("RootWebArea", "One Person Lab"), node("button", "")] }
    : {};
  await assert.rejects(
    captureDesktopAccessibility({ debugger: debug }, { timeoutMs: 0 }),
    /Chromium AX tree smoke failed/
  );
  assert.equal(attached, false);
});

test("accessibility capture waits for the startup gate to expose named controls", async () => {
  let attached = false;
  let treeReads = 0;
  const debug = {
    isAttached: () => attached,
    attach: () => { attached = true; },
    detach: () => { attached = false; },
    sendCommand: async (command) => {
      if (command !== "Accessibility.getFullAXTree") return {};
      treeReads += 1;
      return treeReads === 1
        ? { nodes: [node("RootWebArea", "One Person Lab")] }
        : { nodes: [node("RootWebArea", "One Person Lab"), node("button", "Enter with limits")] };
    }
  };

  const receipt = await captureDesktopAccessibility({ debugger: debug }, { timeoutMs: 50, intervalMs: 1 });
  assert.equal(receipt.status, "passed");
  assert.equal(treeReads, 2);
  assert.equal(attached, false);
});
