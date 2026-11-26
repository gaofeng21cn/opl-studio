import {
  assert,
  assertRendererTestIds,
  root,
  deliverySurfaceTestIds,
  read,
  readJson,
  readRendererSource,
  validateNonLiveDeliveryEvidence
} from "./opl-studio-gates.mjs";
import { buildRenderer } from "./build-renderer.mjs";
import * as Mermaid from "mermaid";

const rendererSource = readRendererSource();
const webTransport = read("src/bridge/webTransport.ts");
const evidence = readJson("src/candidateContractEvidence.json");
validateNonLiveDeliveryEvidence(evidence);
const webuiOutDir = `${root}/dist/webui`;
buildRenderer({ outDir: webuiOutDir, htmlName: "index.html", jsName: "renderer.js" });

const mermaidApi = Mermaid.default ?? Mermaid;
assert(typeof mermaidApi.initialize === "function", "Mermaid initialize API must resolve through namespace/default interop");
assert(typeof mermaidApi.render === "function", "Mermaid render API must resolve through namespace/default interop");
assert(
  rendererSource.includes("mermaidModule.default ?? mermaidModule"),
  "Mermaid preview must preserve namespace/default interop",
);

for (const value of ["window.oplStudio", "/api/opl-events", "EventSource"]) {
  assert(webTransport.includes(value), `missing WebUI transport marker ${value}`);
}
for (const marker of [
  "/api/threads/list",
  "/api/threads/read",
  "/api/threads/resume",
  "/api/threads/fork",
  "/api/threads/archive",
  "/api/threads/unarchive"
]) {
  assert(webTransport.includes(marker), `missing standard WebUI thread route ${marker}`);
  assert(
    webTransport.indexOf(marker) < webTransport.indexOf("window.oplStudio = surface"),
    `thread route must be installed before renderer startup: ${marker}`
  );
}
for (const retired of ["coordinationBridge", "/api/coordination/", "prepareCoordination", "waitCoordination"]) {
  assert(!webTransport.includes(retired), `retired private thread marker must stay absent from WebUI transport: ${retired}`);
}
const webuiRendererTestIds = [
  ...evidence.page_state_matrix_mapping.runtime_testids,
  ...deliverySurfaceTestIds(evidence)
].filter((testId) => testId.startsWith("opl-"));
assertRendererTestIds(rendererSource, webuiRendererTestIds, "WebUI renderer");
const html = read("dist/webui/index.html");
const bundle = read("dist/webui/renderer.js");
const studioClientRoot = "plugins/core/opl-studio-client";
const studioClient = JSON.parse(read(studioClientRoot + "/package.json"));
const studioClientBundle = process.env.OPL_DSH_REGISTRY_PLUGINS === "1"
  ? "node_modules/" + studioClient.name + "/" + studioClient.exports["./client"]
  : studioClientRoot + "/" + studioClient.exports["./client"];
assert(read(studioClientBundle).includes("opl-studio-root"), "DSH Studio client bundle must own the Workspace mount");
for (const marker of ['<div id="root"></div>', './renderer.js']) {
  assert(html.includes(marker), `missing WebUI HTML marker ${marker}`);
}
assert(!html.includes("branding/opl-app-logo.png"), "WebUI HTML must keep product identity text-only");
for (const marker of ["window.oplStudio", "/api/opl-events"]) {
  assert(bundle.includes(marker), `missing WebUI renderer marker ${marker}`);
}

console.log(JSON.stringify({
  status: "webui_smoke_passed",
  shared_renderer: true,
  bridge_shape: "window.oplStudio",
  covered_testids: webuiRendererTestIds.length,
  active_shell_adopted: false
}, null, 2));
