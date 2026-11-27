import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLocalDockerImage, resolveDockerBuildInputs } from "../../scripts/oci/resolve-build-inputs.mjs";

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
  const inputs = resolveDockerBuildInputs();
  buildLocalDockerImage(image, inputs);
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
  assert.equal(seed.components.find(component => component.id === "codex_cli")?.source_fingerprint, inputs.codexSpec);

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
