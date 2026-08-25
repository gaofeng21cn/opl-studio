import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readDshBinding } from "./dsh-upstream.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = path.join(root, "src", "vendor", "deepseek-harness");
const manifestPath = path.join(root, "src", "composition", "deepseekHarnessSourceManifest.json");

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
  return readDshBinding({ repositoryRoot: root }).manifest;
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
  if (head !== manifest.upstream.ref) fail(`DeepSeek Harness source HEAD ${head} does not match ${manifest.upstream.ref}`);
  for (const entry of manifest.files) {
    const upstreamPath = entry.path === "LICENSE" ? "LICENSE" : entry.path;
    const sourcePath = path.join(sourceRoot, upstreamPath);
    if (!fs.existsSync(sourcePath)) fail(`DeepSeek Harness source file missing: ${upstreamPath}`);
    if (sha256(sourcePath) !== entry.sha256) fail(`DeepSeek Harness source parity mismatch: ${upstreamPath}`);
  }
}

function sync(sourceRoot) {
  if (!sourceRoot) fail("sync requires --source <deepseek-harness checkout>");
  const binding = readDshBinding({ repositoryRoot: root, validatePackages: false, validateProfile: false });
  const currentManifest = binding.manifest;
  const resolvedSource = path.resolve(sourceRoot);
  const head = runGit(resolvedSource, ["rev-parse", "HEAD"]);
  if (head !== binding.ref) fail(`DeepSeek Harness source HEAD ${head} does not match ${binding.ref}`);

  fs.rmSync(vendorRoot, { recursive: true, force: true });
  for (const packageRoot of binding.packageRoots) {
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
      repo: binding.repo,
      ref: binding.ref,
      branch_at_intake: currentManifest.upstream.branch_at_intake,
      source_package_version: binding.version,
      license: "MIT"
    },
    application_host: {
      role: "deepseek_harness_cordis_application_host",
      profile: "opl-studio",
      profile_source: "scripts/webui-host/dsh/cordis.yml",
      web_overlay: "scripts/webui-host/dsh/web.patch.yml",
      package_cohort: binding.packageCohort,
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
      package_roots: binding.packageRoots,
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
  console.log(JSON.stringify({ status: "deepseek_harness_gui_synced", ref: binding.ref, files: files.length }, null, 2));
}

function check() {
  const manifest = expectedInventory();
  verifyLocal(manifest);
  const sourceRoot = sourceArgument();
  if (sourceRoot) verifyAgainstSource(path.resolve(sourceRoot), manifest);
  console.log(JSON.stringify({ status: "deepseek_harness_gui_byte_parity_verified", ref: manifest.upstream.ref, files: manifest.files.length }, null, 2));
}

const command = process.argv[2];
if (command === "sync") sync(sourceArgument());
else if (command === "check") check();
else fail("usage: deepseek-harness-gui-vendor.mjs <sync|check> [--source <checkout>]");
