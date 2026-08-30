import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const suffix = `${process.pid}-${Date.now()}`;
const qualificationPlatform = process.env.OPL_OCI_LIFECYCLE_PLATFORM || null;
const requireNativeArchitecture = process.env.OPL_OCI_REQUIRE_NATIVE_ARCHITECTURE === "true";
const platformLabel = qualificationPlatform?.replaceAll("/", "-") ?? "native";
const imageA = `opl-studio-oci-lifecycle-a-${platformLabel}:${suffix}`;
const imageB = `opl-studio-oci-lifecycle-b-${platformLabel}:${suffix}`;
const project = `opl-oci-${suffix}`.toLowerCase();
const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "opl-oci-state-"));
const sourceCompose = path.join(root, "docker-compose.distribution.yaml");

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

function manager(action, ...args) {
  const output = execFileSync(process.execPath, [
    "scripts/oci/manage.mjs",
    action,
    "--state-dir", stateDirectory,
    ...args
  ], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(output);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
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

function containerId() {
  return docker(
    "ps",
    "--filter", `label=com.docker.compose.project=${project}`,
    "--filter", "label=com.docker.compose.service=one-person-lab",
    "--format", "{{.ID}}"
  );
}

const port = await freePort();
const volumeNames = [`${project}_opl-data`, `${project}_opl-projects`];
const revisionA = "a".repeat(40);
const revisionB = "b".repeat(40);

if (requireNativeArchitecture) {
  assert.ok(qualificationPlatform, "native architecture qualification requires an explicit platform");
  const expectedNodeArchitecture = { amd64: "x64", arm64: "arm64" }[qualificationPlatform.split("/")[1]];
  assert.equal(process.arch, expectedNodeArchitecture, `${qualificationPlatform} lifecycle must run on native hardware`);
}

try {
  for (const [image, revision] of [[imageA, revisionA], [imageB, revisionB]]) {
    const buildArgs = qualificationPlatform ? [
      "buildx", "build",
      "--platform", qualificationPlatform,
      "--load",
      "--provenance=false",
      "--sbom=false"
    ] : ["build"];
    const build = spawnSync("docker", [
      ...buildArgs,
      "--build-arg", `OPL_SOURCE_REVISION=${revision}`,
      "--tag", image,
      "."
    ], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, BUILDKIT_PROGRESS: "plain" },
      maxBuffer: 32 * 1024 * 1024,
      timeout: 20 * 60_000
    });
    if (build.status !== 0) {
      const output = `${build.stdout ?? ""}\n${build.stderr ?? ""}`;
      throw new Error(`docker build failed for ${image} with ${build.status}:\n${output.slice(-12_000)}`);
    }
  }
  const imageAId = docker("image", "inspect", imageA, "--format", "{{.Id}}");
  const imageBId = docker("image", "inspect", imageB, "--format", "{{.Id}}");
  assert.notEqual(imageAId, imageBId);
  if (qualificationPlatform) {
    const expectedArchitecture = qualificationPlatform.split("/")[1];
    assert.equal(docker("image", "inspect", imageA, "--format", "{{.Architecture}}"), expectedArchitecture);
    assert.equal(docker("image", "inspect", imageB, "--format", "{{.Architecture}}"), expectedArchitecture);
  }

  const baseArgs = [
    "--allow-local-image",
    "--project-name", project,
    "--port", String(port)
  ];
  const installed = manager("install", "--image", imageA, ...baseArgs);
  assert.equal(installed.status, "oci_installed");
  assert.equal(installed.current.immutableRef, imageAId);
  assert.equal((await waitFor(`http://127.0.0.1:${port}/healthz`, 30_000)).status, 200);
  let container = containerId();
  docker("exec", container, "node", "-e", "require('fs').writeFileSync('/projects/oci-lifecycle-marker','persistent')");

  const updated = manager("update", "--image", imageB, ...baseArgs);
  assert.equal(updated.status, "oci_updated");
  assert.equal(updated.current.immutableRef, imageBId);
  container = containerId();
  assert.equal(docker("inspect", container, "--format", "{{.Image}}"), imageBId);
  assert.equal(docker("exec", container, "cat", "/projects/oci-lifecycle-marker"), "persistent");

  const rolledBack = manager("rollback", ...baseArgs);
  assert.equal(rolledBack.status, "oci_rolled_back");
  container = containerId();
  assert.equal(docker("inspect", container, "--format", "{{.Image}}"), imageAId);
  assert.equal(docker("exec", container, "cat", "/projects/oci-lifecycle-marker"), "persistent");
  assert.equal(manager("recreate", ...baseArgs).status, "oci_recreated");
  assert.equal(manager("start", ...baseArgs).status, "oci_started");

  container = containerId();
  assert.equal(docker("inspect", container, "--format", "{{.Config.User}}"), "1000:1000");
  assert.equal(docker("inspect", container, "--format", "{{.HostConfig.ReadonlyRootfs}}"), "true");
  assert.match(docker("inspect", container, "--format", "{{json .HostConfig.SecurityOpt}}"), /no-new-privileges/);
  assert.match(docker("inspect", container, "--format", "{{json .HostConfig.CapDrop}}"), /ALL/);
  assert.equal(docker("inspect", container, "--format", "{{.HostConfig.PidsLimit}}"), "512");
  assert.match(docker("port", container, "3000/tcp"), /^127\.0\.0\.1:/);

  const preserved = manager("uninstall", ...baseArgs);
  assert.equal(preserved.dataPreserved, true);
  for (const volume of volumeNames) assert.ok(docker("volume", "inspect", volume));

  manager("install", "--image", imageA, ...baseArgs);
  container = containerId();
  assert.equal(docker("exec", container, "cat", "/projects/oci-lifecycle-marker"), "persistent");
  const purged = manager("uninstall", "--purge-data", ...baseArgs);
  assert.equal(purged.dataPreserved, false);
  for (const volume of volumeNames) {
    const inspect = spawnSync("docker", ["volume", "inspect", volume], { stdio: "ignore" });
    assert.notEqual(inspect.status, 0, `${volume} should be removed`);
  }

  console.log(JSON.stringify({
    status: "oci_lifecycle_smoke_passed",
    carrier: "shared_node_host_and_renderer",
    platform: qualificationPlatform ?? `${process.platform}/${process.arch}`,
    installedImage: imageAId,
    updatedImage: imageBId,
    lifecycle: ["install", "start", "update", "recreate", "rollback", "uninstall"],
    persistence: "survived_update_rollback_and_preserving_uninstall",
    security: {
      runtimeUser: "1000:1000",
      readOnlyRoot: true,
      noNewPrivileges: true,
      droppedCapabilities: "ALL",
      pidsLimit: 512,
      publishedAddress: "127.0.0.1"
    },
    publicImagePublished: false,
    hostedArchitectureQualified:
      process.env.CI === "true" && qualificationPlatform !== null && requireNativeArchitecture,
    runnerArchitecture: process.arch
  }, null, 2));
} finally {
  spawnSync("docker", [
    "compose", "--project-name", project,
    "--file", sourceCompose,
    "down", "--volumes", "--remove-orphans"
  ], {
    cwd: root,
    env: { ...process.env, OPL_APP_IMAGE: imageA, OPL_APP_PORT: String(port) },
    stdio: "ignore"
  });
  spawnSync("docker", ["image", "rm", "--force", imageA, imageB], { stdio: "ignore" });
}
