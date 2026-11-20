import { generateSoftwareArtwork } from "./software-artwork.mjs";
import { createCodexModelPolicy, readAppProductProfile as readProductProfile } from "./client-runtime-policy.mjs";
import fs from "node:fs";
import { buildDshPlugins } from "./build-dsh-plugins.mjs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveAppRepoRoot } from "./resolve-app-repo-root.mjs";
import { createDeepLinkPolicy } from "../desktop/deep-links.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(root, "src", "renderer-shell.html");
const appRepoRoot = resolveAppRepoRoot(root);
generateSoftwareArtwork(root, appRepoRoot);
const appProductProfilePath = path.join(appRepoRoot, "contracts", "app-product-profile.json");
export { createClientCompositionPolicy, createCodexModelPolicy } from "./client-runtime-policy.mjs";
export function readAppProductProfile(profilePath = appProductProfilePath) { return readProductProfile(profilePath); }
export function readCodexModelPolicy(profilePath = appProductProfilePath) {
  return createCodexModelPolicy(readAppProductProfile(profilePath));
}

export function buildRenderer({
  outDir = path.join(root, "dist"),
  htmlName = "index.html",
  jsName = "renderer.js",
  format = "esm",
  scriptType = "module"
} = {}) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const registryPlugins = process.env.OPL_DSH_REGISTRY_PLUGINS === "1";
  if (registryPlugins) {
    // Published Host and client plugins (including opl-studio-client) are
    // already installed at the receipt-selected versions. Only the private
    // upstream engine remains a source input to this carrier build.
    buildDshPlugins(["opl-superagent-engine"]);
    console.log("registry-plugins mode: preserved published Host/client bytes; built the private upstream engine");
  } else {
    buildDshPlugins();
  }
  const deepLinkPolicy = createDeepLinkPolicy(
    JSON.parse(fs.readFileSync(path.join(appRepoRoot, "contracts/app-gui-product-contract.json"), "utf8")),
    JSON.parse(fs.readFileSync(path.join(appRepoRoot, "contracts/app-settings-control-plane.json"), "utf8"))
  );
  fs.writeFileSync(path.join(outDir, "deep-link-policy.json"), `${JSON.stringify(deepLinkPolicy, null, 2)}\n`);

  const jsPath = path.join(outDir, jsName);
  const cssName = jsName.replace(/\.[^.]+$/, ".css");
  const cssPath = path.join(outDir, cssName);
  const build = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts", "vite-build-renderer-entry.mjs"),
      path.join(root, "src", "main.tsx"),
      outDir,
      format
    ],
    { encoding: "utf8", cwd: root }
  );
  if (build.status !== 0) {
    throw new Error(`renderer build failed\n${build.stdout}\n${build.stderr}`);
  }
  const emittedJsPath = path.join(outDir, "main.js");
  const emittedCssPath = path.join(outDir, "main.css");
  if (!fs.existsSync(emittedJsPath)) {
    throw new Error(`renderer build produced no JavaScript entry at ${emittedJsPath}`);
  }
  fs.renameSync(emittedJsPath, jsPath);
  const hasStylesheet = fs.existsSync(emittedCssPath);
  if (hasStylesheet) fs.renameSync(emittedCssPath, cssPath);

  const html = fs.readFileSync(templatePath, "utf8")
    .replace("</head>", hasStylesheet ? `  <link rel="stylesheet" href="./${cssName}" />\n</head>` : "</head>")
    .replace(
    "</body>",
    scriptType === "module"
      ? `  <script type="module" src="./${jsName}"></script>\n</body>`
      : `  <script src="./${jsName}"></script>\n</body>`
    );
  fs.writeFileSync(path.join(outDir, htmlName), html);
  const metadata = {
    status: "source_renderer_build_passed",
    renderer: "plugins/opl-studio-client/src/client/workbench/App.tsx",
    entry: "src/main.tsx",
    html: htmlName,
    script: jsName,
    format,
    scriptType,
    stylesheet: hasStylesheet ? cssName : null
  };
  fs.writeFileSync(path.join(outDir, "renderer-build.json"), JSON.stringify(metadata, null, 2));
  return metadata;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(buildRenderer(), null, 2));
}
