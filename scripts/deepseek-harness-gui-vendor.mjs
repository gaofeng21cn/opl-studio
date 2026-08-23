import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = path.join(root, "src", "vendor", "deepseek-harness");
const manifestPath = path.join(root, "src", "composition", "deepseekHarnessSourceManifest.json");
const upstreamRepo = "https://github.com/deepseek-ai/deepseek-harness";
const upstreamRef = "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e";
const applicationHostPackages = [
  "@deepseek-ai/cordis@4.0.1",
  "@deepseek-ai/cordis-plugin-group@1.0.1",
  "@deepseek-ai/cordis-plugin-include@1.0.6",
  "@deepseek-ai/cordis-plugin-loader@1.0.2",
  "@deepseek-ai/dsh-app-boot@0.1.1-rc.2",
  "@deepseek-ai/dsh-brand@0.1.1-rc.2",
  "@deepseek-ai/dsh-client-modules@0.1.1-rc.2",
  "@deepseek-ai/dsh-client-ui-primitives@0.1.1-rc.2",
  "@deepseek-ai/dsh-client-ui-slots@0.1.1-rc.2",
  "@deepseek-ai/dsh-client-web@0.1.1-rc.2",
  "@deepseek-ai/dsh-home-paths@0.1.1-rc.2",
  "@deepseek-ai/dsh-host-frontend-static@0.1.1-rc.2",
  "@deepseek-ai/dsh-host-plugin-inventory@0.1.1-rc.2",
  "@deepseek-ai/dsh-host-webserver@0.1.1-rc.2",
  "@deepseek-ai/dsh-invariants@0.1.1-rc.2",
  "@deepseek-ai/dsh-launch-environment@0.1.1-rc.2",
  "@deepseek-ai/dsh-scope@0.1.1-rc.2",
  "@deepseek-ai/dsh-system-prompt@0.1.1-rc.2",
  "@deepseek-ai/dsh-tools@0.1.1-rc.2",
  "@deepseek-ai/dsh-typert-protocol@0.1.1-rc.2"
];
const packageRoots = [
  "packages/client/ui-layout/src",
  "packages/client/ui-sidebar/src",
  "packages/client/ui-conversation/src",
  "packages/client/ui-input-trigger/src",
  "packages/client/ui-model-selection/src",
  "packages/client/ui-agent-preset/src",
  "packages/client/ui-workspace/src",
  "packages/client/ui-settings-general/src",
  "packages/client/ui-theme/src",
  "packages/client/ui-primitives/src",
  "packages/client/ui-renderer/src"
];

function fail(message) {
  throw new Error(message);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(absolute) : [absolute];
    })
    .sort();
}

function relativeTo(base, filePath) {
  return path.relative(base, filePath).split(path.sep).join("/");
}

function runGit(sourceRoot, args) {
  const result = spawnSync("git", ["-C", sourceRoot, ...args], { encoding: "utf8" });
  if (result.status !== 0) fail(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function sourceArgument() {
  const index = process.argv.indexOf("--source");
  return index === -1 ? undefined : process.argv[index + 1];
}

function expectedInventory() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.upstream.repo !== upstreamRepo || manifest.upstream.ref !== upstreamRef) {
    fail("DeepSeek Harness manifest does not match the pinned upstream identity");
  }
  return manifest;
}

function verifyLocal(manifest) {
  const expected = new Map(manifest.files.map((entry) => [entry.path, entry.sha256]));
  const actualPaths = filesUnder(vendorRoot)
    .map((filePath) => relativeTo(vendorRoot, filePath));
  const expectedPaths = [...expected.keys()].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    const missing = expectedPaths.filter((filePath) => !actualPaths.includes(filePath));
    const extra = actualPaths.filter((filePath) => !expected.has(filePath));
    fail(`DeepSeek Harness vendor inventory mismatch; missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`);
  }
  for (const [relativePath, digest] of expected) {
    const actual = sha256(path.join(vendorRoot, relativePath));
    if (actual !== digest) fail(`DeepSeek Harness vendor byte mismatch: ${relativePath}`);
  }
}

function verifyAgainstSource(sourceRoot, manifest) {
  const head = runGit(sourceRoot, ["rev-parse", "HEAD"]);
  if (head !== upstreamRef) fail(`DeepSeek Harness source HEAD ${head} does not match ${upstreamRef}`);
  for (const entry of manifest.files) {
    const upstreamPath = entry.path === "LICENSE" ? "LICENSE" : entry.path;
    const sourcePath = path.join(sourceRoot, upstreamPath);
    if (!fs.existsSync(sourcePath)) fail(`DeepSeek Harness source file missing: ${upstreamPath}`);
    if (sha256(sourcePath) !== entry.sha256) fail(`DeepSeek Harness source parity mismatch: ${upstreamPath}`);
  }
}

function sync(sourceRoot) {
  if (!sourceRoot) fail("sync requires --source <deepseek-harness checkout>");
  const resolvedSource = path.resolve(sourceRoot);
  const head = runGit(resolvedSource, ["rev-parse", "HEAD"]);
  if (head !== upstreamRef) fail(`DeepSeek Harness source HEAD ${head} does not match ${upstreamRef}`);

  fs.rmSync(vendorRoot, { recursive: true, force: true });
  for (const packageRoot of packageRoots) {
    const source = path.join(resolvedSource, packageRoot);
    if (!fs.existsSync(source)) fail(`DeepSeek Harness package source missing: ${packageRoot}`);
    fs.cpSync(source, path.join(vendorRoot, packageRoot), { recursive: true, force: true, preserveTimestamps: false });
  }
  fs.copyFileSync(path.join(resolvedSource, "LICENSE"), path.join(vendorRoot, "LICENSE"));

  const files = filesUnder(vendorRoot).map((filePath) => ({
    path: relativeTo(vendorRoot, filePath),
    sha256: sha256(filePath)
  }));
  const manifest = {
    schema_version: 1,
    upstream: {
      repo: upstreamRepo,
      ref: upstreamRef,
      branch_at_intake: "dsh-v0.1.1-rc.2",
      source_package_version: "0.1.1-rc.2",
      license: "MIT"
    },
    application_host: {
      role: "deepseek_harness_cordis_application_host",
      profile: "opl-studio",
      profile_source: "scripts/webui-host/dsh/cordis.yml",
      web_overlay: "scripts/webui-host/dsh/web.patch.yml",
      package_cohort: applicationHostPackages,
      loaded_dsh_services: [
        "system-prompt_without_harness_identity_or_runtime_context",
        "tools_native_registry",
        "host_webserver",
        "host_plugin_inventory",
        "frontend_static_web_only",
        "client_modules_web_only"
      ],
      excluded_upstream_profiles: ["dsh-base"],
      excluded_upstream_authorities: [
        "dsh_session",
        "dsh_llm_provider_routing",
        "dsh_agent_loop",
        "dsh_credentials"
      ],
      upgrade_validation: [
        "npm run verify:dsh-gui",
        "npm run typecheck",
        "npm run test:webui-host",
        "npm run test:headless",
        "npm run validate:candidate"
      ]
    },
    snapshot: {
      local_root: "src/vendor/deepseek-harness",
      byte_identical: true,
      byte_identical_to_pinned_ref: true,
      package_roots: packageRoots,
      file_count: files.length
    },
    opl_delta_roots: [
      "src/composition",
      "src/integrations/deepseek-harness",
      "scripts/build-renderer.mjs",
      "scripts/deepseek-harness-gui-vendor.mjs"
    ],
    excluded_upstream_authority_imports: [
      "dsh_session",
      "dsh_llm_provider_routing",
      "dsh_agent_loop",
      "dsh_credentials"
    ],
    files
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  verifyLocal(manifest);
  verifyAgainstSource(resolvedSource, manifest);
  console.log(JSON.stringify({ status: "deepseek_harness_gui_synced", ref: upstreamRef, files: files.length }, null, 2));
}

function check() {
  const manifest = expectedInventory();
  verifyLocal(manifest);
  const sourceRoot = sourceArgument();
  if (sourceRoot) verifyAgainstSource(path.resolve(sourceRoot), manifest);
  console.log(JSON.stringify({ status: "deepseek_harness_gui_byte_parity_verified", ref: upstreamRef, files: manifest.files.length }, null, 2));
}

const command = process.argv[2];
if (command === "sync") sync(sourceArgument());
else if (command === "check") check();
else fail("usage: deepseek-harness-gui-vendor.mjs <sync|check> [--source <checkout>]");
