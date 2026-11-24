#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { resolveAppRepoRoot } from "../resolve-app-repo-root.mjs";

const defaultStudioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const shaPattern = /^[0-9a-f]{40}$/;

export function resolveCandidateFrameworkRef(studioRoot = defaultStudioRoot, env = process.env) {
  const explicit = env.OPL_STANDARD_PAYLOAD_FRAMEWORK_REF?.trim();
  if (explicit) return explicit;
  const evidencePath = path.join(studioRoot, "src", "candidateContractEvidence.json");
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  return evidence.candidate_runtime_qualification?.external_cohort?.framework_commit ?? "";
}

export function materializeFrameworkBootstrap({
  studioRoot = defaultStudioRoot,
  targetRoot = studioRoot,
  appRoot = resolveAppRepoRoot(studioRoot),
  frameworkRef = resolveCandidateFrameworkRef(studioRoot),
  env = process.env
} = {}) {
  if (!shaPattern.test(frameworkRef ?? "")) {
    throw new Error("candidate Framework ref must be an exact lowercase 40-character Git SHA");
  }
  const materializer = path.join(appRoot, "scripts", "prepare-standard-release-payload.ts");
  if (!fs.existsSync(materializer)) {
    throw new Error(`App Standard bootstrap materializer is missing: ${materializer}`);
  }
  const resolvedTarget = path.resolve(targetRoot);
  const prepared = spawnSync(process.execPath, [
    "--experimental-strip-types",
    materializer,
    "studio",
    "--target-root",
    resolvedTarget,
    "--framework-ref",
    frameworkRef
  ], {
    cwd: studioRoot,
    env,
    encoding: "utf8"
  });
  if (prepared.status !== 0) {
    const detail = (prepared.stderr || prepared.stdout || "").trim();
    throw new Error(`candidate Framework bootstrap materialization failed${detail ? `: ${detail}` : ""}`);
  }

  const bootstrapDir = path.join(resolvedTarget, "resources", "opl-framework-bootstrap");
  const manifestPath = path.join(bootstrapDir, "manifest.json");
  const installerPath = path.join(bootstrapDir, "opl-install.sh");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.framework_ref !== frameworkRef) {
    throw new Error(`candidate Framework bootstrap ref mismatch: expected ${frameworkRef}, got ${manifest.framework_ref}`);
  }
  const installerBytes = fs.readFileSync(installerPath);
  const actualSha256 = crypto.createHash("sha256").update(installerBytes).digest("hex");
  if (
    manifest.installer_path !== "resources/opl-framework-bootstrap/opl-install.sh"
    || manifest.installer_sha256 !== actualSha256
    || manifest.installer_size_bytes !== installerBytes.length
  ) {
    throw new Error("materialized Framework bootstrap installer does not match its manifest");
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    allowPositionals: false,
    options: {
      "target-root": { type: "string" },
      "framework-ref": { type: "string" },
      "app-root": { type: "string" }
    }
  });
  const manifest = materializeFrameworkBootstrap({
    ...(values["target-root"] ? { targetRoot: path.resolve(values["target-root"]) } : {}),
    ...(values["framework-ref"] ? { frameworkRef: values["framework-ref"] } : {}),
    ...(values["app-root"] ? { appRoot: path.resolve(values["app-root"]) } : {})
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
