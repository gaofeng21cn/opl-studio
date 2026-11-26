import { test } from "node:test";
import assert from "node:assert/strict";
import { createSidebarPanelPins } from "../../plugins/core/opl-studio-client/src/client/composition/slotHost/sidebarPreferences";

test("explicit pin choices survive remounts, new panels, removal and return", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const first = createSidebarPanelPins(["applications", "runtime", "teams"], ["applications", "runtime"], storage);
  assert.deepEqual(first.unpinned.getSnapshot(), ["teams"]);
  first.setPinned("runtime", false);
  first.setPinned("teams", true);
  const next = createSidebarPanelPins(["applications", "runtime", "teams", "new-plugin"], ["applications", "runtime"], storage);
  assert.deepEqual(next.unpinned.getSnapshot(), ["runtime", "new-plugin"]);
  const returned = createSidebarPanelPins(["applications", "runtime", "teams"], ["applications"], storage);
  assert.equal(returned.unpinned.getSnapshot().includes("teams"), false);
  for (const id of ["applications", "runtime", "teams"]) returned.setPinned(id, true);
  assert.deepEqual(returned.unpinned.getSnapshot(), []);
  returned.setPinned("runtime", false);
  assert.deepEqual(returned.unpinned.getSnapshot(), ["runtime"]);
});

test("unavailable or corrupt preference storage preserves usable defaults", () => {
  const storage = { getItem: () => "invalid json", setItem: () => { throw Error("unavailable"); } };
  const pins = createSidebarPanelPins(["runtime", "superagent"], ["runtime"], storage);
  assert.deepEqual(pins.unpinned.getSnapshot(), ["superagent"]);
  assert.doesNotThrow(() => pins.setPinned("superagent", true));
  assert.deepEqual(pins.unpinned.getSnapshot(), []);
});
