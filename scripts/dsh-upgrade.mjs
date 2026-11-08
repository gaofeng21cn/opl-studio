import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expectedUpstreamRepo, readDshBinding, upgradeWriteSet } from "./dsh-upstream.mjs";

function fail(message) { throw new Error(message); }
function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
function runGit(sourceRoot, args) {
  const result = spawnSync("git", ["-C", sourceRoot, ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) fail(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}
function normalizedRemote(value) {
  return value.trim().replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "").replace(/\/$/, "");
}

// Resolve the existing cohort from the target's own npm manifests. Cordis and
// its plugins have independent versions; a DSH version cannot replace them.
export function readUpgradeTarget(binding, sourceRoot, { version, branch } = {}) {
  if (!sourceRoot) fail("DSH upgrade requires --source <deepseek-harness checkout>");
  const source = path.resolve(sourceRoot);
  const remotes = runGit(source, ["remote"]).split("\n").filter(Boolean)
    .map(remote => runGit(source, ["remote", "get-url", remote]));
  if (!remotes.some(remote => normalizedRemote(remote) === expectedUpstreamRepo)) {
    fail(`DSH source checkout has no ${expectedUpstreamRepo} remote`);
  }
  if (runGit(source, ["status", "--porcelain"])) fail("DSH source checkout must be clean");
  const ref = runGit(source, ["rev-parse", "HEAD"]);
  if (branch !== undefined && (!branch.trim() || runGit(source, ["rev-parse", "--verify", `${branch}^{commit}`]) !== ref)) {
    fail("DSH target branch/tag must resolve to the source HEAD");
  }
  const wanted = new Set(binding.packageSpecs.map(({ name }) => name));
  const packages = new Map();
  const files = runGit(source, ["ls-files", "-z"]).split("\0")
    .filter(file => /^(packages|vendor)\/.*\/package\.json$/.test(file));
  for (const file of files) {
    const manifest = JSON.parse(fs.readFileSync(path.join(source, file), "utf8"));
    if (!wanted.has(manifest.name)) continue;
    if (packages.has(manifest.name)) fail(`DSH target contains duplicate package ${manifest.name}`);
    if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
      fail(`DSH target package ${manifest.name} has no exact version`);
    }
    packages.set(manifest.name, manifest.version);
  }
  const packageCohort = binding.packageSpecs.map(({ name }) => {
    if (!packages.has(name)) fail(`DSH target is missing cohort package ${name}`);
    return `${name}@${packages.get(name)}`;
  });
  const targetVersion = packages.get("@deepseek-ai/dsh-app-boot");
  if (!targetVersion) fail("DSH cohort must include @deepseek-ai/dsh-app-boot");
  if (version !== undefined && version !== targetVersion) fail(`DSH target version is ${targetVersion}, not ${version}`);
  for (const packageRoot of binding.packageRoots) {
    if (!fs.statSync(path.join(source, packageRoot), { throwIfNoEntry: false })?.isDirectory()) {
      fail(`DSH target is missing GUI source root ${packageRoot}`);
    }
  }
  if (!fs.statSync(path.join(source, "LICENSE"), { throwIfNoEntry: false })?.isFile()) fail("DSH target LICENSE is missing");
  return { source_root: source, ref, version: targetVersion, branch: branch ?? null, repo: expectedUpstreamRepo, package_cohort: packageCohort };
}

export function assertReplayTarget(binding, target) {
  if (target.ref !== binding.ref || target.version !== binding.version || JSON.stringify(target.package_cohort) !== JSON.stringify(binding.packageCohort)) {
    fail("DSH replay target differs from the pinned binding; review preflight, update the manifest/profile and exact npm cohort, then install that lockfile before replay");
  }
}

export async function verifyInstalledCohort(binding) {
  for (const { name, version } of binding.packageSpecs) {
    const installed = JSON.parse(fs.readFileSync(path.join(binding.root, "node_modules", name, "package.json"), "utf8"));
    if (installed.name !== name || installed.version !== version) fail(`Installed ${name} must match the pinned ${version}; install the reviewed lockfile first`);
  }
  const { evaluatePluginCompatibility } = await import("@deepseek-ai/dsh-app-boot");
  // Use the official reader and its SemVer behavior, including prereleases.
  for (const [name, spec] of Object.entries(binding.packageJson.dependencies ?? {})) {
    if (!spec.startsWith("file:plugins/")) continue;
    const manifest = JSON.parse(fs.readFileSync(path.join(binding.root, spec.slice(5), "package.json"), "utf8"));
    const mismatch = evaluatePluginCompatibility(manifest, {}, binding.version);
    if (mismatch) fail(`DSH plugin ${name} is incompatible with ${binding.version}: ${JSON.stringify(mismatch.requirements)}`);
  }
}

export async function verifyProfileSchemas(binding) {
  const { generateConfigSchema, initProfile, loadProfile, resolveProfileDir, loadOverlayPatches } = await import("@deepseek-ai/dsh-app-boot");
  const { entryListSchema, applyEntryPatches } = await import("@deepseek-ai/cordis-plugin-include");
  const { default: yaml } = await import("js-yaml");
  const { Ajv2020 } = await import("ajv/dist/2020.js");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "opl-dsh-upgrade-schema-"));
  try {
    const anchor = path.join(binding.root, "package.json");
    const host = binding.manifest.application_host;
    initProfile(resolveProfileDir(host.profile, home), []);
    const profile = loadProfile(host.profile, host.profile, anchor, home);
    const entries = yaml.load(fs.readFileSync(path.join(binding.root, host.profile_source), "utf8"), { schema: entryListSchema });
    const webPatches = loadOverlayPatches(host.profile, path.join(binding.root, host.web_overlay));
    const results = [];
    for (const [carrier, layers] of [["desktop", [[{ insert: entries }]]], ["web", [[{ insert: entries }], webPatches]]]) {
      const schema = await generateConfigSchema(profile, layers, anchor);
      const diagnostics = schema["x-cordis"].diagnostics;
      if (diagnostics.some(item => item.level === "error")) fail(`DSH ${carrier} profile schema failed: ${JSON.stringify(diagnostics)}`);
      const composed = layers.reduce((current, patches) => applyEntryPatches(current, patches, message => fail(`DSH ${carrier} profile patch failed: ${message}`)), []);
      const validator = new Ajv2020({ strict: false, validateFormats: false });
      if (!validator.validate(schema, composed)) fail(`DSH ${carrier} profile config failed: ${JSON.stringify(validator.errors)}`);
      // Native transforms cannot be expressed fully in JSON Schema. Preserve
      // those diagnostics; the real Host boot/lifecycle gate follows.
      results.push({ carrier, complete: schema["x-cordis"].complete, diagnostics });
    }
    return results;
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
}

// These are existing source/compatibility gates. No packaging, installation or
// publication command is accepted through the source manifest.
export function upgradeVerificationSteps(binding, sourceRoot) {
  const allowed = new Set(["verify:dsh-gui", "typecheck", "test:webui-host", "test:headless", "validate:candidate"]);
  const declared = binding.validation.map(command => {
    const match = /^npm run ([a-z:-]+)$/.exec(command);
    if (!match || !allowed.has(match[1])) fail(`Unsupported DSH source validation command: ${command}`);
    return match[1];
  });
  const scripts = [...new Set(["verify:dsh-gui", "build:plugins", "test:dsh-plugins", "test:client-cordis", ...declared])];
  for (const script of scripts) if (!binding.packageJson.scripts?.[script]) fail(`Missing DSH verification script: ${script}`);
  return scripts.map(script => ({ command: "npm", args: ["run", script, ...(script === "verify:dsh-gui" && sourceRoot ? ["--", "--source", sourceRoot] : [])] }));
}

export async function executeReplay(binding, target, { replay = false, run = runStep, checkSchema = verifyProfileSchemas } = {}) {
  if (target) assertReplayTarget(binding, target);
  await verifyInstalledCohort(binding);
  const steps = upgradeVerificationSteps(binding, target?.source_root);
  if (replay) {
    if (!target) fail("DSH replay requires a verified source checkout");
    run({ command: "npm", args: ["run", "vendor:dsh-gui", "--", "--source", target.source_root] }, binding.root);
  }
  let schemas;
  for (const step of steps) {
    run(step, binding.root);
    if (step.args[1] === "build:plugins") schemas = await checkSchema(binding);
  }
  return { status: "dsh_compatibility_verified", replayed: replay, upstream: { ref: binding.ref, version: binding.version }, schemas, checks: steps.map(step => step.args[1]) };
}
function runStep({ command, args }, cwd) {
  process.stderr.write(`DSH compatibility: ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, { cwd, stdio: ["inherit", 2, 2] });
  if (result.error || result.status !== 0) fail(`DSH compatibility step failed: ${command} ${args.join(" ")}${result.error ? ` (${result.error.message})` : ""}`);
}
function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

async function main() {
  const command = process.argv[2] ?? "status";
  const binding = readDshBinding();
  if (command === "status") {
    print({ status: "dsh_binding_ready", writes: false,
      upstream: { repo: binding.repo, ref: binding.ref, version: binding.version, branch: binding.branch },
      package_cohort: binding.packageCohort,
      vendored_gui: { root: "src/vendor/deepseek-harness", package_roots: binding.packageRoots, file_count: binding.fileCount },
      upgrade_validation: upgradeVerificationSteps(binding).map(step => `${step.command} ${step.args.join(" ")}`),
      next_action: "npm run dsh:preflight -- --source <clean-deepseek-harness-checkout>" });
    return;
  }
  if (!["preflight", "replay", "verify"].includes(command)) fail("usage: dsh-upgrade.mjs <status|preflight|replay|verify> [--source <checkout>] [--version <version>] [--branch <name>]");
  const source = argument("--source");
  const target = command !== "verify" || source ? readUpgradeTarget(binding, source, { version: argument("--version"), branch: argument("--branch") }) : undefined;
  if (command === "preflight") {
    print({ status: target.ref === binding.ref ? "same_ref" : "upgrade_preflight_ready", writes: false,
      current: { repo: binding.repo, ref: binding.ref, version: binding.version, package_cohort: binding.packageCohort }, target,
      write_set: upgradeWriteSet(), required_validation: upgradeVerificationSteps(binding, target.source_root),
      next_action: "Review and pin this exact source/cohort in the existing manifest, profile, package.json and lockfile; run npm ci, then node scripts/dsh-upgrade.mjs replay --source <same-checkout>",
      required_manual_acceptance: ["review profile and overlay API changes and replace superseded adapters", "preserve the Codex and Framework state owners", "complete App-owned carrier build and live acceptance before release"] });
    return;
  }
  print(await executeReplay(binding, target, { replay: command === "replay" }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.message ?? error}\n`); process.exitCode = 1; });
}
