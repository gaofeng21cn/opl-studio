#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveAppRepoRoot } from "./resolve-app-repo-root.mjs";
import { materializeFrameworkBootstrap } from "./desktop/materialize-framework-bootstrap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolveAppRepoRoot(root);
const registryPath = path.join(appRoot, "contracts", "app-shell-candidates.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function run(command, label) {
  const result = spawnSync(command, {
    cwd: root,
    env: process.env,
    shell: true,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${command}`);
  }
}

function gitOutput(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function assertTrackedSourceClean(phase) {
  const trackedChanges = gitOutput(["status", "--porcelain", "--untracked-files=no"]);
  if (trackedChanges) {
    throw new Error(`candidate carrier evidence requires committed Studio source ${phase}`);
  }
}

function resolveDesktopAppPath() {
  if (process.platform !== "darwin") {
    throw new Error("candidate carrier evidence currently requires the macOS Electron .app qualification host");
  }
  const relativePath = process.arch === "arm64"
    ? "out/mac-arm64/One Person Lab Preview.app"
    : "out/mac/One Person Lab Preview.app";
  if (!fs.existsSync(path.join(root, relativePath))) {
    throw new Error(`Electron candidate app is missing: ${relativePath}`);
  }
  return relativePath;
}

function assertArtifact(relativePath, label) {
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(absolutePath)) {
    throw new Error(`${label} is missing: ${relativePath}`);
  }
}

function buildManifest(contract, sourceCommit, artifactPaths) {
  const carriers = Object.fromEntries(contract.required_entries.map((carrierId) => {
    const expected = contract.entries[carrierId];
    const artifactPath = artifactPaths[carrierId];
    if (!expected || !artifactPath) {
      throw new Error(`unsupported carrier evidence entry: ${carrierId}`);
    }
    return [carrierId, {
      carrier_id: carrierId,
      source_implementation: { status: "implemented", refs: expected.source_refs },
      package_build: {
        status: "passed_local_candidate_build",
        artifact_kind: expected.package_artifact_kind,
        artifact_path: artifactPath
      },
      local_qualification: {
        status: "passed_local_candidate_qualification",
        commands: expected.qualification_commands
      },
      user_service_manager_source: expected.user_service_manager_source,
      distribution_wiring: {
        status: expected.distribution_wiring_status,
        current_aionui_release_evidence_reused: false
      },
      update_adapter_source: expected.update_adapter_source,
      update_wiring: { status: expected.update_wiring_status },
      release: expected.release,
      ...(carrierId === "docker_webui" ? {
        multi_arch_qualification: expected.multi_arch_qualification,
        signature_verification: expected.signature_verification
      } : {})
    }];
  }));

  return {
    schema: contract.schema,
    candidate_id: "opl-studio",
    source_commit: sourceCommit,
    candidate_only: true,
    release_authority: false,
    product_profile_owner: contract.product_profile_owner,
    default_release_shell_unchanged: true,
    active_shell_adopted: false,
    runtime_authority_transfer: false,
    domain_truth_owned: false,
    shared_renderer: contract.shared_renderer,
    shared_host_core: contract.shared_host_core,
    bridge_abi: contract.bridge_abi,
    carriers
  };
}

function main() {
  const registry = readJson(registryPath);
  const candidate = registry.candidates?.find((entry) => entry.id === "opl-studio");
  const contract = candidate?.carrier_evidence_contract;
  if (!contract) {
    throw new Error(`App contract is missing the opl-studio carrier evidence contract: ${registryPath}`);
  }
  if (JSON.stringify(contract.required_entries) !== JSON.stringify([
    "electron_desktop",
    "standalone_headless_webui",
    "docker_webui"
  ])) {
    throw new Error("App contract carrier evidence entries changed; update the Studio packager explicitly");
  }

  assertTrackedSourceClean("before qualification");
  const sourceCommit = gitOutput(["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error("Studio source commit must be an exact lowercase Git SHA");
  }
  const evidence = readJson(path.join(root, "src", "candidateContractEvidence.json"));
  const frameworkRef = process.env.OPL_STANDARD_PAYLOAD_FRAMEWORK_REF
    ?? evidence.candidate_runtime_qualification?.external_cohort?.framework_commit;
  // Materialize gitignored bootstrap resources from the single canonical App installer.
  materializeFrameworkBootstrap({ studioRoot: root, targetRoot: root, appRoot, frameworkRef });
  assertTrackedSourceClean("after Framework bootstrap materialization");

  const manifestPath = path.resolve(root, contract.manifest_path);
  const standaloneArtifact = "out/standalone-headless-webui.tgz";
  const dockerArtifact = "out/docker-local-smoke.json";
  for (const relativePath of [contract.manifest_path, standaloneArtifact, dockerArtifact]) {
    fs.rmSync(path.resolve(root, relativePath), { force: true });
  }

  for (const carrierId of contract.required_entries) {
    for (const command of contract.entries[carrierId].qualification_commands) {
      run(command, `${carrierId} qualification`);
    }
    if (carrierId === "standalone_headless_webui") {
      fs.mkdirSync(path.dirname(path.join(root, standaloneArtifact)), { recursive: true });
      run(`tar -C ${JSON.stringify(root)} -czf ${JSON.stringify(path.join(root, standaloneArtifact))} dist/webui`, "standalone WebUI archive");
    }
  }

  const artifactPaths = {
    electron_desktop: resolveDesktopAppPath(),
    standalone_headless_webui: standaloneArtifact,
    docker_webui: dockerArtifact
  };
  for (const [carrierId, artifactPath] of Object.entries(artifactPaths)) {
    assertArtifact(artifactPath, `${carrierId} candidate artifact`);
  }

  assertTrackedSourceClean("after qualification");
  if (gitOutput(["rev-parse", "HEAD"]) !== sourceCommit) throw new Error("candidate source changed during qualification");
  if (gitOutput(["rev-parse", "HEAD"]) !== sourceCommit) {
    throw new Error("Studio source commit changed during candidate carrier qualification");
  }

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(buildManifest(contract, sourceCommit, artifactPaths), null, 2)}\n`,
    "utf8"
  );
  console.log(JSON.stringify({
    status: "opl_studio_candidate_carriers_packaged",
    source_commit: sourceCommit,
    app_contract_root: appRoot,
    manifest: path.relative(root, manifestPath),
    carriers: artifactPaths,
    candidate_only: true,
    release_authority: false
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
