import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const manifestPath = path.join(root, "src", "composition", "deepseekHarnessSourceManifest.json");
export const packageJsonPath = path.join(root, "package.json");
export const packageLockPath = path.join(root, "package-lock.json");
export const profilePath = path.join(root, "contracts", "opl-studio-profile.json");
export const expectedUpstreamRepo = "https://github.com/deepseek-ai/deepseek-harness";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function parsePackageSpec(spec) {
  if (typeof spec !== "string") throw new Error(`invalid package spec: ${String(spec)}`);
  const at = spec.lastIndexOf("@");
  if (at <= 0 || at === spec.length - 1) throw new Error(`invalid package spec: ${spec}`);
  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateManifest(manifest) {
  const upstream = manifest?.upstream;
  assert(upstream?.repo === expectedUpstreamRepo, "DSH manifest upstream repo is not DeepSeek Harness");
  assert(typeof upstream.ref === "string" && /^[0-9a-f]{40}$/.test(upstream.ref), "DSH manifest ref must be a 40-character commit SHA");
  assert(typeof upstream.source_package_version === "string" && upstream.source_package_version.trim(), "DSH manifest source package version is missing");
  const cohort = manifest?.application_host?.package_cohort;
  assert(Array.isArray(cohort) && cohort.length > 0, "DSH manifest package cohort is missing");
  const parsed = cohort.map(parsePackageSpec);
  assert(new Set(parsed.map(({ name }) => name)).size === parsed.length, "DSH manifest package cohort contains duplicate packages");
  assert(manifest.application_host.role === "deepseek_harness_cordis_application_host", "DSH manifest role is invalid");
  assert(Array.isArray(manifest.snapshot?.package_roots) && manifest.snapshot.package_roots.length > 0, "DSH manifest package roots are missing");
  assert(Number.isInteger(manifest.snapshot?.file_count) && manifest.snapshot.file_count >= 0, "DSH manifest file count is invalid");
  return { upstream, cohort, parsed };
}

function assertPackageAlignment(packageJson, packageLock, cohort) {
  const dependencySources = [
    ["package.json", packageJson?.dependencies ?? {}],
    ["package-lock.json", packageLock?.packages?.[""]?.dependencies ?? {}]
  ];
  for (const { name, version } of cohort) {
    for (const [source, dependencies] of dependencySources) {
      assert(dependencies?.[name] === version, `${source} DSH dependency ${name} must be ${version}`);
    }
  }
}

export function readDshBinding({ repositoryRoot = root, validatePackages = true, validateProfile = true } = {}) {
  const resolvedRoot = path.resolve(repositoryRoot);
  const manifest = readJson(path.join(resolvedRoot, "src", "composition", "deepseekHarnessSourceManifest.json"));
  const { upstream, cohort, parsed } = validateManifest(manifest);
  const packageJson = readJson(path.join(resolvedRoot, "package.json"));
  const packageLock = readJson(path.join(resolvedRoot, "package-lock.json"));
  if (validatePackages) assertPackageAlignment(packageJson, packageLock, parsed);

  const profile = readJson(path.join(resolvedRoot, "contracts", "opl-studio-profile.json"));
  if (validateProfile) {
    assert(profile?.application_host?.upstream_ref === upstream.ref, "Studio profile DSH ref drifted from the source manifest");
    assert(profile?.application_host?.upstream_version === upstream.source_package_version, "Studio profile DSH version drifted from the source manifest");
  }

  return {
    root: resolvedRoot,
    manifest,
    packageJson,
    packageLock,
    profile,
    repo: upstream.repo,
    ref: upstream.ref,
    version: upstream.source_package_version,
    branch: upstream.branch_at_intake ?? null,
    packageCohort: cohort,
    packageSpecs: parsed,
    packageRoots: manifest.snapshot.package_roots,
    fileCount: manifest.snapshot.file_count,
    validation: manifest.application_host.upgrade_validation ?? []
  };
}

export function dshPackageNames(binding) {
  return binding.packageSpecs
    .filter(({ name }) => name.startsWith("@deepseek-ai/dsh-"))
    .map(({ name }) => name);
}

export function upgradeWriteSet() {
  return [
    "src/composition/deepseekHarnessSourceManifest.json",
    "src/vendor/deepseek-harness/**",
    "package.json",
    "package-lock.json",
    "contracts/opl-studio-profile.json",
    "src/candidateContractEvidence.json",
    "src/workbench/codexWorkbenchStyles.ts",
    "THIRD_PARTY_NOTICES.md",
    "README.md",
    "docs/verification.md"
  ];
}
