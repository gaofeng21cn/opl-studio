import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const build = spawnSync("docker", ["build", "--tag", image, "."], { stdio: "inherit", timeout: 20 * 60_000 });
  assert.equal(build.status, 0, `docker build failed with ${build.status}`);
  assert.equal(docker("image", "inspect", image, "--format", "{{.Config.User}}"), "node");

  docker("volume", "create", dataVolume);
  docker("volume", "create", projectsVolume);
  docker(
    "run", "--detach", "--name", container,
    "--publish", "127.0.0.1::3000",
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
  const renderer = await fetch(baseUrl);
  assert.equal(renderer.status, 200);
  assert.match(await renderer.text(), /<div id="root"><\/div>/);
  const appStateResponse = await fetch(`${baseUrl}/api/opl/state?profile=fast`);
  assert.equal(appStateResponse.status, 200);
  const appState = await appStateResponse.json();
  assert.equal(appState.readback.exitCode, 0);
  assert.equal(typeof appState.app_state, "object");
  assert.notEqual(appState.app_state, null);
  assert.equal(docker("exec", container, "id", "-u"), "1000");
  assert.equal(docker("exec", container, "cat", "/proc/1/comm"), "node");
  assert.equal(docker("inspect", container, "--format", "{{.HostConfig.ReadonlyRootfs}}"), "true");
  assert.match(docker("inspect", container, "--format", "{{json .HostConfig.SecurityOpt}}"), /no-new-privileges/);
  assert.match(docker("inspect", container, "--format", "{{json .HostConfig.CapDrop}}"), /ALL/);
  const oplVersion = docker("exec", container, "opl", "--version");
  const codexVersion = docker("exec", container, "codex", "--version");
  assert.ok(oplVersion, "opl --version returned no output");
  assert.ok(codexVersion, "codex --version returned no output");

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
