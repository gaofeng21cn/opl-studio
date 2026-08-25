import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  dshPackageNames,
  expectedUpstreamRepo,
  readDshBinding,
  upgradeWriteSet
} from "./dsh-upstream.mjs";

function fail(message) {
  throw new Error(message);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function runGit(sourceRoot, args) {
  const result = spawnSync("git", ["-C", sourceRoot, ...args], { encoding: "utf8" });
  if (result.status !== 0) fail(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function sourceState(sourceRoot) {
  const resolved = path.resolve(sourceRoot);
  if (!fs.existsSync(path.join(resolved, ".git")) && !fs.existsSync(path.join(resolved, "HEAD"))) {
    fail(`DSH source checkout is not a Git worktree: ${resolved}`);
  }
  const remoteUrls = runGit(resolved, ["remote"])
    .split("\n")
    .filter(Boolean)
    .map((remote) => runGit(resolved, ["remote", "get-url", remote]));
  const normalizedExpected = expectedUpstreamRepo.replace(/\.git$/, "").replace(/\/$/, "");
  const matchesUpstream = remoteUrls.some((url) => {
    const normalized = url
      .trim()
      .replace(/^git@github\.com:/, "https://github.com/")
      .replace(/\.git$/, "")
      .replace(/\/$/, "");
    return normalized === normalizedExpected;
  });
  if (!matchesUpstream) fail(`DSH source checkout has no ${expectedUpstreamRepo} remote`);
  return {
    root: resolved,
    head: runGit(resolved, ["rev-parse", "HEAD"]),
    dirty: Boolean(runGit(resolved, ["status", "--porcelain"])),
    remote: remoteUrls.find((url) => url.includes("deepseek-harness")) ?? null
  };
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function status() {
  const binding = readDshBinding();
  print({
    status: "dsh_binding_ready",
    writes: false,
    upstream: {
      repo: binding.repo,
      ref: binding.ref,
      version: binding.version,
      branch: binding.branch
    },
    package_cohort: binding.packageCohort,
    vendored_gui: {
      root: "src/vendor/deepseek-harness",
      package_roots: binding.packageRoots,
      file_count: binding.fileCount
    },
    upgrade_validation: binding.validation,
    next_action: "npm run dsh:preflight -- --source <clean-deepseek-harness-checkout>"
  });
}

function preflight() {
  const sourceArgument = argument("--source");
  if (!sourceArgument) fail("preflight requires --source <deepseek-harness checkout>");
  const binding = readDshBinding();
  const source = sourceState(sourceArgument);
  const targetVersion = argument("--version") ?? binding.version;
  const targetBranch = argument("--branch") ?? null;
  const currentDshNames = dshPackageNames(binding);
  const warnings = [];
  if (source.dirty) warnings.push("source_checkout_dirty");
  if (source.head === binding.ref) warnings.push("source_is_current_ref");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(targetVersion)) fail(`invalid target DSH version: ${targetVersion}`);
  if (targetBranch !== null && !targetBranch.trim()) fail("--branch must not be empty");

  print({
    status: warnings.includes("source_is_current_ref") ? "same_ref" : "upgrade_preflight_ready",
    writes: false,
    current: {
      repo: binding.repo,
      ref: binding.ref,
      version: binding.version,
      package_cohort: binding.packageCohort
    },
    target: {
      source_root: source.root,
      ref: source.head,
      version: targetVersion,
      branch: targetBranch,
      remote: source.remote,
      dsh_package_names: currentDshNames,
      package_update_policy: "replace_versions_for_current_dsh_package_names_only"
    },
    warnings,
    write_set: upgradeWriteSet(),
    required_validation: binding.validation,
    required_manual_acceptance: [
      "review DSH profile and overlay API compatibility",
      "review excluded Session/LLM/Agent/Credential authority boundary",
      "run the listed source gates",
      "rebuild and live-accept the isolated Preview app"
    ],
    apply: "not_available_in_preflight; update the target cohort explicitly, then run npm run vendor:dsh-gui and the listed validation commands"
  });
}

const command = process.argv[2] ?? "status";
try {
  if (command === "status") status();
  else if (command === "preflight") preflight();
  else fail("usage: dsh-upgrade.mjs <status|preflight> [--source <checkout>] [--version <version>] [--branch <name>]");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
