import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const workbenchStyleSources = [
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleFoundation.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleStartup.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleContributions.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleNavigation.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleConversation.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleComposer.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleSettingsCore.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleSettingsCapabilities.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleSettingsActions.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleRuntime.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleThreads.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleDsh.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleRuntimeOverview.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleResponsive.ts",
  "plugins/opl-studio-client/src/client/workbench/codexWorkbenchStyleSettingsIntegration.ts",
];

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
  const styles = workbenchStyleSources.map(read).join("\n");
  const settingsModalCss = read(
    "vendor/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.module.css",
  );
  const modalCss = read(
    "vendor/deepseek-harness/packages/client/ui-primitives/src/Modal.module.css",
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
  const dialog = read("plugins/opl-studio-client/src/client/workbench/settings/SettingsActionDialog.tsx");
  assert.match(dialog, /createPortal\(/, "dialog must use createPortal");
  assert.match(dialog, /document\.body\)/, "dialog must portal to document.body");
});
