import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCandidateFrameworkRef } from "../../scripts/desktop/materialize-framework-bootstrap.mjs";
import { resolveAppRepoRoot } from "../../scripts/resolve-app-repo-root.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const receiptPath = path.join(root, "out", "docker-local-smoke.json");

const suffix = `${process.pid}-${Date.now()}`;
const image = `opl-studio-headless-smoke:${suffix}`;
const container = `opl-studio-headless-${suffix}`;
const dataVolume = `opl-studio-data-${suffix}`;
const projectsVolume = `opl-studio-projects-${suffix}`;

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

function revision(repo, ref) {
  const commit = execFileSync("git", ["-C", repo, "rev-parse", "--verify", `${ref}^{commit}`], { encoding: "utf8" }).trim();
  assert.match(commit, /^[a-f0-9]{40}$/);
  return commit;
}

function snapshot(repo, ref, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const tar = `${directory}.tar`;
  execFileSync("git", ["-C", repo, "archive", "--format=tar", "--output", tar, ref]);
  execFileSync("tar", ["-xf", tar, "-C", directory]);
  fs.unlinkSync(tar);
}

function resolveBuildInputs() {
  const appRepo = resolveAppRepoRoot(root);
  const studioGitDir = execFileSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
  const frameworkRepo = process.env.OPL_FRAMEWORK_REPO_ROOT ?? path.resolve(studioGitDir, "../..", "one-person-lab");
  const appRef = revision(appRepo, process.env.OPL_APP_REF ?? "HEAD");
  const frameworkRef = revision(frameworkRepo, process.env.OPL_FRAMEWORK_REF ?? resolveCandidateFrameworkRef(root));
  const sourceRevision = revision(root, "HEAD");
  const dockerArch = docker("info", "--format", "{{.Architecture}}");
  const architecture = { aarch64: "arm64", arm64: "arm64", amd64: "x64", x86_64: "x64" }[dockerArch];
  assert.ok(architecture, `unsupported Docker architecture: ${dockerArch}`);

  const staging = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "opl-studio-docker-inputs-")));
  try {
    const appRoot = path.join(staging, "app");
    const frameworkRoot = path.join(staging, "framework");
    const output = path.join(staging, "resolution");
    snapshot(appRepo, appRef, appRoot);
    snapshot(frameworkRepo, frameworkRef, frameworkRoot);
    execFileSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: frameworkRoot, stdio: "inherit", timeout: 5 * 60_000
    });
    const resolver = path.join(appRoot, "scripts", "resolve-build-dependencies.ts");
    const resolved = spawnSync(process.execPath, [
      resolver,
      "--app-root", appRoot,
      "--framework-root", frameworkRoot,
      "--platform", "linux",
      "--arch", architecture,
      "--dependency", "codex-cli",
      "--output", output
    ], { cwd: appRoot, encoding: "utf8", timeout: 5 * 60_000 });
    if (resolved.status !== 0) {
      throw new Error(`App dependency resolver failed: ${resolved.stderr || resolved.error?.message}`);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(output, "qualification-input-manifest.json"), "utf8"));
    const codex = manifest.runtime_payloads?.codex_cli;
    assert.equal(manifest.schema, "opl_app_release_qualification_input_manifest.v1");
    assert.match(codex?.version ?? "", /^\d+\.\d+\.\d+$/);
    assert.match(codex?.npm_integrity ?? "", /^sha512-/);
    assert.match(codex?.tarball_sha256 ?? "", /^[a-f0-9]{64}$/);
    return {
      appRef, frameworkRef, sourceRevision, codexVersion: codex.version,
      platform: architecture === "x64" ? "linux/amd64" : "linux/arm64"
    };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error(`${url} did not become available`);
}

try {
  const inputs = resolveBuildInputs();
  const codexSpec = `@openai/codex@${inputs.codexVersion}`;
  const build = spawnSync("docker", [
    "build", "--platform", inputs.platform, "--tag", image,
    "--build-arg", `OPL_APP_REF=${inputs.appRef}`,
    "--build-arg", `OPL_FRAMEWORK_REF=${inputs.frameworkRef}`,
    "--build-arg", `OPL_SOURCE_REVISION=${inputs.sourceRevision}`,
    "--build-arg", `OPL_CODEX_NPM_SPEC=${codexSpec}`, "."
  ], { cwd: root, stdio: "inherit", timeout: 20 * 60_000 });
  assert.equal(build.status, 0, `docker build failed with ${build.status}`);
  assert.equal(docker("image", "inspect", image, "--format", "{{.Config.User}}"), "node");

  const password = randomBytes(32).toString("base64url");
  docker("volume", "create", dataVolume);
  docker("volume", "create", projectsVolume);
  docker(
    "run", "--detach", "--name", container,
    "--publish", "127.0.0.1::3000",
    "--env", "OPL_WEBUI_DEPLOYMENT_MODE=local",
    "--env", "OPL_WEBUI_AUTH_MODE=password",
    "--env", `OPL_WEBUI_PASSWORD=${password}`,
    "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=256m",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--pids-limit", "512",
    "--user", "1000:1000",
    "--mount", `type=volume,src=${dataVolume},dst=/data`,
    "--mount", `type=volume,src=${projectsVolume},dst=/projects`,
    image
  );
  const port = docker("port", container, "3000/tcp").match(/:(\d+)$/)?.[1];
  assert.ok(port, "Docker did not publish the headless port");
  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await waitFor(`${baseUrl}/healthz`, 30_000);
  assert.equal((await health.json()).status, "ok");
  const readiness = await waitFor(`${baseUrl}/readyz`, 30_000);
  assert.equal((await readiness.json()).status, "ready");
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "opl", password })
  });
  assert.equal(login.status, 200, "the Docker WebUI login must succeed");
  const cookie = login.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
  assert.ok(cookie, "the Docker WebUI did not issue an authenticated session");
  const headers = { cookie };
  const renderer = await fetch(baseUrl, { headers });
  assert.equal(renderer.status, 200);
  assert.match(await renderer.text(), /<div id="root"><\/div>/);
  const appStateResponse = await fetch(`${baseUrl}/api/opl/state?profile=fast`, { headers });
  assert.equal(appStateResponse.status, 200);
  const appState = await appStateResponse.json();
  assert.equal(appState.readback.exitCode, 0);
  assert.equal(typeof appState.app_state, "object");
  assert.notEqual(appState.app_state, null);
  assert.equal(docker("exec", container, "id", "-u"), "1000");
  assert.equal(path.basename(docker("exec", container, "readlink", "/proc/1/exe")), "node");
  assert.equal(docker("inspect", container, "--format", "{{.HostConfig.ReadonlyRootfs}}"), "true");
  assert.match(docker("inspect", container, "--format", "{{json .HostConfig.SecurityOpt}}"), /no-new-privileges/);
  assert.match(docker("inspect", container, "--format", "{{json .HostConfig.CapDrop}}"), /ALL/);
  const oplVersion = docker("exec", container, "opl", "--version");
  const codexVersion = docker("exec", container, "codex", "--version");
  assert.ok(oplVersion, "opl --version returned no output");
  assert.equal(codexVersion, `codex-cli ${inputs.codexVersion}`);
  const imageManifest = JSON.parse(docker("exec", container, "cat", "/opt/opl/image-manifest.json"));
  const seed = JSON.parse(docker("exec", container, "cat", "/opt/opl/seed/metadata.json"));
  assert.equal(imageManifest.app_source_commit, inputs.appRef);
  assert.equal(imageManifest.webui_package?.source_commit, inputs.sourceRevision);
  assert.equal(seed.components.find(component => component.id === "opl_framework")?.source_fingerprint, inputs.frameworkRef);
  assert.equal(seed.components.find(component => component.id === "codex_cli")?.source_fingerprint, codexSpec);

  docker("stop", "--time", "10", container);
  const receipt = {
    status: "headless_docker_smoke_passed",
    image,
    health: "ok",
    readiness: "ready",
    renderer: "shared_webui",
    frameworkStateExitCode: appState.readback.exitCode,
    oplVersion,
    codexVersion,
    sourceRevision: inputs.sourceRevision,
    appRef: inputs.appRef,
    frameworkRef: inputs.frameworkRef,
    runtimeUser: 1000,
    pid1: "node",
    persistentMounts: ["/data", "/projects"]
  };
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
  spawnSync("docker", ["volume", "rm", "--force", dataVolume, projectsVolume], { stdio: "ignore" });
  spawnSync("docker", ["image", "rm", "--force", image], { stdio: "ignore" });
}
