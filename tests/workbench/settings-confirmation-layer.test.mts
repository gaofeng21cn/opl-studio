import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function zIndexOf(source: string, selector: string) {
  const index = source.indexOf(selector);
  assert.notEqual(index, -1, `missing selector ${selector}`);
  const block = source.slice(index, source.indexOf("}", index));
  const match = block.match(/z-index:\s*(\d+)/);
  assert.ok(match, `selector ${selector} must declare a z-index`);
  return Number(match![1]);
}

// The settings confirmation dialog is mounted in the root shell overlay, a
// sibling of the settings modal (SettingsRoot / DSH Modal). If its backdrop sits
// at or below the modal's layer it is painted behind the open settings panel, so
// the user must close settings before the confirm step is even visible.
test("settings confirmation dialog layers above the settings modal", () => {
  const styles = read("src/workbench/codexWorkbenchStyles.ts");
  const settingsModalCss = read(
    "src/vendor/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.module.css",
  );
  const modalCss = read(
    "src/vendor/deepseek-harness/packages/client/ui-primitives/src/Modal.module.css",
  );

  const confirmationZ = zIndexOf(styles, ".settings-action-dialog-backdrop");
  const settingsOverlayZ = zIndexOf(settingsModalCss, ".overlay");
  const modalRootZ = zIndexOf(modalCss, ".root");

  assert.ok(
    confirmationZ > settingsOverlayZ,
    `confirmation backdrop (${confirmationZ}) must sit above the settings overlay (${settingsOverlayZ})`,
  );
  assert.ok(
    confirmationZ > modalRootZ,
    `confirmation backdrop (${confirmationZ}) must sit above the modal primitive (${modalRootZ})`,
  );
});

// The confirmation dialog must escape the shell overlay stacking context. The
// DSH AppFrame renders `shell.overlay` inside `.overlayLayer` (position:
// absolute; z-index: 20), so any z-index set on a descendant is trapped beneath
// the settings modal (body-level z-index 1000). The dialog therefore portals to
// document.body, exactly like the settings modal itself.
test("settings confirmation dialog portals out of the shell overlay layer", () => {
  const dialog = read("src/workbench/settings/SettingsActionDialog.tsx");
  assert.match(dialog, /createPortal\(/, "dialog must use createPortal");
  assert.match(dialog, /document\.body\)/, "dialog must portal to document.body");
});
