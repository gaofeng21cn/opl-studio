import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAppRepoRoot } from "../resolve-app-repo-root.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const exactCommit = /^[a-f0-9]{40}$/;

function snapshot(repository, localRepo, revision, directory) {
  fs.mkdirSync(directory, { recursive: true });
  // The local clone may predate the Dockerfile pin.
  if (localRepo && fs.existsSync(path.join(localRepo, ".git"))
    && spawnSync("git", ["-C", localRepo, "cat-file", "-e", `${revision}^{commit}`]).status === 0) {
    const tar = `${directory}.tar`;
    execFileSync("git", ["-C", localRepo, "archive", "--format=tar", "--output", tar, revision]);
    execFileSync("tar", ["-xf", tar, "-C", directory]);
    fs.unlinkSync(tar);
    return;
  }
  execFileSync("git", ["init", "--quiet", directory]);
  execFileSync("git", ["-C", directory, "fetch", "--quiet", "--depth", "1", repository, revision]);
  execFileSync("git", ["-C", directory, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);
}

function dockerfileArgument(dockerfile, name) {
  const declaration = dockerfile.split("\n").find(line => line.startsWith(`ARG ${name}=`));
  if (!declaration) throw new Error(`Dockerfile is missing the ${name} default`);
  return declaration.slice(`ARG ${name}=`.length);
}

function resolveRevision(ref, localRepo) {
  if (exactCommit.test(ref)) return ref;
  return execFileSync("git", ["-C", localRepo, "rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], { encoding: "utf8" }).trim();
}

export function resolveDockerBuildInputs() {
  const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
  const commonGitDir = execFileSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
  const siblingRoot = path.resolve(commonGitDir, "../..");
  let appRepo = process.env.OPL_APP_REPO_ROOT;
  if (!appRepo) {
    try {
      appRepo = resolveAppRepoRoot(root);
    } catch {
      // A standalone Studio checkout obtains the pinned source from the build repository.
      appRepo = path.join(siblingRoot, "one-person-lab-app");
    }
  }
  const frameworkRepo = process.env.OPL_FRAMEWORK_REPO_ROOT ?? path.join(siblingRoot, "one-person-lab");
  const appRef = resolveRevision(process.env.OPL_APP_REF ?? dockerfileArgument(dockerfile, "OPL_APP_REF"), appRepo);
  const frameworkRef = resolveRevision(process.env.OPL_FRAMEWORK_REF ?? dockerfileArgument(dockerfile, "OPL_FRAMEWORK_REF"), frameworkRepo);
  const sourceRevision = resolveRevision("HEAD", root);
  const dockerArch = execFileSync("docker", ["info", "--format", "{{.Architecture}}"], { encoding: "utf8" }).trim();
  const architecture = { aarch64: "arm64", arm64: "arm64", amd64: "x64", x86_64: "x64" }[dockerArch];
  assert.ok(architecture, `unsupported Docker architecture: ${dockerArch}`);
  const platform = architecture === "x64" ? "linux/amd64" : "linux/arm64";
  let codexSpec = process.env.OPL_CODEX_NPM_SPEC;
  if (!codexSpec) {
    const staging = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "opl-studio-docker-inputs-")));
    try {
      const appRoot = path.join(staging, "app");
      const frameworkRoot = path.join(staging, "framework");
      const output = path.join(staging, "resolution");
      snapshot(process.env.OPL_APP_REPOSITORY ?? dockerfileArgument(dockerfile, "OPL_APP_REPOSITORY"), appRepo, appRef, appRoot);
      snapshot(process.env.OPL_FRAMEWORK_REPOSITORY ?? dockerfileArgument(dockerfile, "OPL_FRAMEWORK_REPOSITORY"), frameworkRepo, frameworkRef, frameworkRoot);
      execFileSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
        cwd: frameworkRoot, stdio: "inherit", timeout: 5 * 60_000
      });
      execFileSync(process.execPath, [
        path.join(appRoot, "scripts", "resolve-build-dependencies.ts"),
        "--app-root", appRoot,
        "--framework-root", frameworkRoot,
        "--platform", "linux",
        "--arch", architecture,
        "--dependency", "codex-cli",
        "--output", output
      ], { cwd: appRoot, stdio: "inherit", timeout: 5 * 60_000 });
      const manifest = JSON.parse(fs.readFileSync(path.join(output, "qualification-input-manifest.json"), "utf8"));
      const codex = manifest.runtime_payloads?.codex_cli;
      assert.equal(manifest.schema, "opl_app_release_qualification_input_manifest.v1");
      assert.match(codex?.npm_integrity ?? "", /^sha512-/);
      assert.match(codex?.tarball_sha256 ?? "", /^[a-f0-9]{64}$/);
      codexSpec = `@openai/codex@${codex?.version}`;
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }
  const match = /^@openai\/codex@(\d+\.\d+\.\d+)$/.exec(codexSpec);
  assert.ok(match, "OPL_CODEX_NPM_SPEC must be an exact @openai/codex version");
  return { appRef, frameworkRef, sourceRevision, platform, codexVersion: match[1], codexSpec };
}

export function buildLocalDockerImage(image, inputs) {
  const repositoryArgs = ["OPL_APP_REPOSITORY", "OPL_FRAMEWORK_REPOSITORY"]
    .filter(name => process.env[name])
    .flatMap(name => ["--build-arg", name]);
  execFileSync("docker", [
    "build", "--platform", inputs.platform, "--tag", image,
    ...repositoryArgs,
    "--build-arg", `OPL_APP_REF=${inputs.appRef}`,
    "--build-arg", `OPL_FRAMEWORK_REF=${inputs.frameworkRef}`,
    "--build-arg", `OPL_SOURCE_REVISION=${inputs.sourceRevision}`,
    "--build-arg", `OPL_CODEX_NPM_SPEC=${inputs.codexSpec}`, "."
  ], { cwd: root, stdio: "inherit", timeout: 20 * 60_000 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildLocalDockerImage(process.env.OPL_APP_IMAGE ?? "one-person-lab-app:headless-candidate", resolveDockerBuildInputs());
}
