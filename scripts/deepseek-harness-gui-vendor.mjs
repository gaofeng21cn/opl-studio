import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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

function applyPatches(directory, manifest, { reverse = false } = {}) {
  const patches = manifest.compatibility_patches ?? [];
  for (const patch of reverse ? [...patches].reverse() : patches) {
    if (patch.upstream_ref !== manifest.upstream.ref) fail(`DSH compatibility patch ref drift: ${patch.path}`);
    const patchPath = path.resolve(root, patch.path);
    if (!patchPath.startsWith(path.join(root, "src/integrations/deepseek-harness/patches/"))) fail("DSH compatibility patch must have a canonical integration owner");
    if (sha256(patchPath) !== patch.sha256) fail(`DSH compatibility patch hash mismatch: ${patch.path}`);
    const args = ["apply", "--whitespace=error", ...(reverse ? ["--reverse"] : []), patchPath];
    const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" });
    if (result.status !== 0) fail(`DSH compatibility patch failed: ${patch.path}: ${result.stderr.trim()}`);
  }
}

function verifyPatchProvenance(manifest) {
  const patches = manifest.compatibility_patches ?? [];
  if (patches.length === 0) return;
  const restored = fs.mkdtempSync(path.join(os.tmpdir(), "opl-dsh-vendor-provenance-"));
  try {
    fs.cpSync(vendorRoot, restored, { recursive: true });
    applyPatches(restored, manifest, { reverse: true });
    const actual = filesUnder(restored).map(file => relativeTo(restored, file));
    if (JSON.stringify(actual) !== JSON.stringify(manifest.files.map(entry => entry.path).sort())) fail("DSH patch changed the source inventory");
    for (const entry of manifest.files) {
      if (sha256(path.join(restored, entry.path)) !== (entry.upstream_sha256 ?? entry.sha256)) fail(`DSH patch provenance mismatch: ${entry.path}`);
    }
  } finally { fs.rmSync(restored, { recursive: true, force: true }); }
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
  verifyPatchProvenance(manifest);
}

function verifyAgainstSource(sourceRoot, manifest) {
  const head = runGit(sourceRoot, ["rev-parse", "HEAD"]);
  if (head !== manifest.upstream.ref) fail(`DeepSeek Harness source HEAD ${head} does not match ${manifest.upstream.ref}`);
  for (const entry of manifest.files) {
    const upstreamPath = entry.path === "LICENSE" ? "LICENSE" : entry.path;
    const sourcePath = path.join(sourceRoot, upstreamPath);
    if (!fs.existsSync(sourcePath)) fail(`DeepSeek Harness source file missing: ${upstreamPath}`);
    if (sha256(sourcePath) !== (entry.upstream_sha256 ?? entry.sha256)) fail(`DeepSeek Harness source parity mismatch: ${upstreamPath}`);
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

  const upstreamHashes = new Map(filesUnder(vendorRoot).map(filePath => [relativeTo(vendorRoot, filePath), sha256(filePath)]));
  applyPatches(vendorRoot, currentManifest);
  const files = filesUnder(vendorRoot).map((filePath) => {
    const relativePath = relativeTo(vendorRoot, filePath);
    const digest = sha256(filePath);
    const upstreamDigest = upstreamHashes.get(relativePath);
    if (!upstreamDigest) fail(`DSH patch introduced an unowned source file: ${relativePath}`);
    return { path: relativePath, sha256: digest, ...(digest === upstreamDigest ? {} : { upstream_sha256: upstreamDigest }) };
  });
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
      profile_source: "src/host/dsh/cordis.yml",
      web_overlay: "src/host/dsh/web.patch.yml",
      package_cohort: binding.packageCohort,
      loaded_dsh_services: [
        "system-prompt_without_harness_identity_or_runtime_context",
        "tools_native_registry",
        "host_webserver",
        "host_plugin_inventory",
        "frontend_static_primitive_behind_studio_auth_routes",
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
      byte_identical: !(currentManifest.compatibility_patches?.length),
      byte_identical_to_pinned_ref: !(currentManifest.compatibility_patches?.length),
      provenance: "pinned_upstream_plus_reviewed_compatibility_patches",
      package_roots: binding.packageRoots,
      file_count: files.length
    },
    compatibility_patches: currentManifest.compatibility_patches ?? [],
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
  console.log(JSON.stringify({ status: "deepseek_harness_gui_provenance_verified", ref: manifest.upstream.ref, files: manifest.files.length }, null, 2));
}

const command = process.argv[2];
if (command === "sync") sync(sourceArgument());
else if (command === "check") check();
else fail("usage: deepseek-harness-gui-vendor.mjs <sync|check> [--source <checkout>]");
