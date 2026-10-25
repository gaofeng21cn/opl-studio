import {
  assert,
  assertNoFalseReadyFields,
  assertRendererTestIds,
  assertSourceMarkers,
  deliverySurfaceMarkers,
  deliverySurfaceTestIds,
  read,
  readJson,
  readRendererSource,
  rendererSourcePaths,
  validateNonLiveDeliveryEvidence
} from "./opl-studio-gates.mjs";

const app = read("src/workbench/App.tsx");
const rendererSource = readRendererSource();
const model = read("src/workbench/workbenchModel.ts");
const primitiveSource = read("src/ui/workbenchPrimitives.tsx");
const moduleRegistry = read("src/renderers/moduleRegistry.ts");
const settingsModel = read("src/workbench/settingsModel.ts");
const evidenceSource = read("src/candidateContractEvidence.json");
const desktopBuild = read("scripts/build-desktop.mjs");
const desktopMain = read("desktop/main.mjs");
const desktopPreload = read("desktop/preload.cjs");
const rendererEntry = read("src/main.tsx");
const rendererShell = read("src/renderer-shell.html");
const evidence = readJson("src/candidateContractEvidence.json");

function assertFunctionalMvpVisualMarkers(evidence) {
  const requirements = evidence.source_marker_requirements;
  assert(requirements, "missing source_marker_requirements");
  for (const group of Object.keys(requirements)) {
    for (const requirement of requirements[group] ?? []) {
      const source = read(requirement.file);
      for (const marker of requirement.contains) {
        assert(source.includes(marker), `missing ${group} marker ${marker} in ${requirement.file}`);
      }
    }
  }
  for (const field of evidence.functional_mvp_closeout?.not_ready ?? []) {
    assert(evidence.false_ready_boundary?.[field] === false, `${field} must stay false for functional MVP visual smoke`);
  }
}

validateNonLiveDeliveryEvidence(evidence);
assertFunctionalMvpVisualMarkers(evidence);
assertRendererTestIds(rendererSource, deliverySurfaceTestIds(evidence), "visual source");
assertSourceMarkers(rendererSource, deliverySurfaceMarkers(evidence), "visual layout");
for (const marker of [
  "opl-artifact-preview-card",
  "opl-action-receipt-summary",
  "opl-settings-section",
  "opl-composer-run-state"
]) {
  assert(rendererSource.includes(marker), `missing polished MVP visual marker ${marker}`);
}
for (const marker of ["buildRenderer", "dist", "desktop", "index.html", "renderer.js"]) {
  assert(desktopBuild.includes(marker), `missing desktop renderer convergence marker ${marker}`);
}
for (const marker of ["Boolean(window.oplStudio)", "installWebTransport", 'document.getElementById("root")']) {
  assert(rendererEntry.includes(marker), `missing shared renderer entry marker ${marker}`);
}
assert(desktopMain.includes("createLocalNodeHost") && desktopMain.includes('ipcMain.handle("opl:invoke"'), "desktop host must adapt the shared host core through IPC");
assert(desktopPreload.includes('contextBridge.exposeInMainWorld("oplStudio"'), "desktop preload must expose the shared bridge ABI");
for (const marker of ['<div id="root"></div>']) {
  assert(rendererShell.includes(marker), `missing renderer shell marker ${marker}`);
}
assert(!rendererShell.includes("branding/opl-app-logo.png"), "renderer shell must keep product identity text-only");
assertNoFalseReadyFields({
  "src/workbench/App.tsx": app,
  "src/workbench/workbenchModel.ts": model,
  "src/workbench/settingsModel.ts": settingsModel,
  "src/ui/workbenchPrimitives.tsx": primitiveSource,
  "src/renderers/moduleRegistry.ts": moduleRegistry,
  "src/candidateContractEvidence.json": evidenceSource,
  "src/main.tsx": rendererEntry,
  "scripts/build-desktop.mjs": desktopBuild,
  "desktop/main.mjs": desktopMain,
  "desktop/preload.cjs": desktopPreload
});

console.log(JSON.stringify({
  status: "source_visual_smoke_passed",
  source_visual_gate: true,
  inspected_sources: rendererSourcePaths,
  settings_persistence: "localStorage_candidate_only",
  active_shell_adopted: false,
  release_ready: false,
  live_evidence: false
}, null, 2));
