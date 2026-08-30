import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import YAML from "yaml";

test("OCI carrier runs only the Node headless host with persistent non-root defaults", async () => {
  const [dockerfile, compose, distribution, workflow, buildPlan] = await Promise.all([
    readFile(new URL("../../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../../compose.yaml", import.meta.url), "utf8"),
    readFile(new URL("../../docker-compose.distribution.yaml", import.meta.url), "utf8"),
    readFile(new URL("../../.github/workflows/additional-carrier-qualification.yml", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/oci/build-plan.mjs", import.meta.url), "utf8")
  ]);
  assert.match(dockerfile, /node:22-bookworm-slim@sha256:[a-f0-9]{64}/);
  assert.match(dockerfile, /ARG OPL_FRAMEWORK_REF=a277b2baf611e3352bdc5c81d95cd1aa20a118af/);
  assert.match(dockerfile, /ARG OPL_APP_REF=757d941d152f00a73377c3e9910ade7a92716adb/);
  assert.match(dockerfile, /npm pack --workspaces --ignore-scripts/);
  assert.match(dockerfile, /npm install --global --prefix \/opt\/opl-framework --omit=dev \/tmp\/one-person-lab-\*\.tgz \/tmp\/opl-framework-\*\.tgz/);
  const productionDependencies = dockerfile.slice(
    dockerfile.indexOf("FROM ${NODE_IMAGE} AS production-dependencies"),
    dockerfile.indexOf("FROM ${NODE_IMAGE} AS runtime")
  );
  assert.match(productionDependencies, /COPY packages \.\/packages/);
  assert.match(productionDependencies, /npm ci --omit=dev/);
  assert.match(compose, /OPL_FRAMEWORK_REF:-a277b2baf611e3352bdc5c81d95cd1aa20a118af/);
  assert.match(compose, /OPL_APP_REF:-757d941d152f00a73377c3e9910ade7a92716adb/);
  const runtime = dockerfile.slice(dockerfile.indexOf("FROM ${NODE_IMAGE} AS runtime"));
  assert.match(runtime, /org\.opencontainers\.image\.revision="\$\{OPL_SOURCE_REVISION\}"/);
  assert.match(runtime, /COPY --from=production-dependencies --chown=node:node \/app\/package\.json \.\/package\.json/);
  assert.match(runtime, /COPY --from=production-dependencies --chown=node:node \/app\/node_modules \.\/node_modules/);
  assert.match(runtime, /COPY --from=production-dependencies --chown=node:node \/app\/packages \.\/packages/);
  assert.doesNotMatch(runtime, /org\.opencontainers\.image\.licenses/);
  assert.match(runtime, /USER node/);
  assert.match(runtime, /VOLUME \["\/data", "\/projects"\]/);
  assert.match(runtime, /HEALTHCHECK[\s\S]*\/healthz/);
  assert.match(runtime, /CMD \["node", "scripts\/headless\/run\.mjs"\]/);
  assert.doesNotMatch(runtime, /electron|aionui|aioncore/i);
  assert.match(compose, /127\.0\.0\.1:\$\{OPL_APP_PORT:-4178\}/);
  assert.match(compose, /opl-data:\/data/);
  assert.match(compose, /opl-projects:\/projects/);
  for (const value of [compose, distribution]) {
    assert.match(value, /read_only: true/);
    assert.match(value, /no-new-privileges:true/);
    assert.match(value, /cap_drop:\s*\n\s*- ALL/);
    assert.match(value, /pids_limit: 512/);
    assert.match(value, /\/tmp:rw,noexec,nosuid,nodev,size=256m/);
    assert.doesNotMatch(value, /0\.0\.0\.0:\$\{OPL_APP_PORT/);
  }
  assert.match(distribution, /image: \$\{OPL_APP_IMAGE:\?immutable OPL_APP_IMAGE is required\}/);
  assert.match(distribution, /pull_policy: never/);
  assert.doesNotMatch(distribution, /\bbuild:/);
  assert.match(workflow, /name: OCI native \$\{\{ matrix\.architecture \}\} build and lifecycle/);
  assert.match(workflow, /plan:oci:multiarch/);
  assert.match(buildPlan, /type=oci/);
  const parsedWorkflow = YAML.parse(workflow);
  const ociJob = parsedWorkflow.jobs["oci-distribution"];
  assert.equal(ociJob["runs-on"], "${{ matrix.runner }}");
  assert.deepEqual(ociJob.strategy.matrix.include, [
    { architecture: "amd64", platform: "linux/amd64", runner: "ubuntu-24.04" },
    { architecture: "arm64", platform: "linux/arm64", runner: "ubuntu-24.04-arm" }
  ]);
  assert.equal(ociJob.env.OPL_OCI_REQUIRE_NATIVE_ARCHITECTURE, "true");
  assert.doesNotMatch(JSON.stringify(ociJob), /setup-qemu-action|\bQEMU\b/i);
  assert.doesNotMatch(workflow, /docker\/login-action/);
});
