import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import YAML from "yaml";

test("Preview OCI workflow publishes only signed native amd64/arm64 Preview tags", async () => {
  const source = await readFile(new URL("../../.github/workflows/studio-webui-preview.yml", import.meta.url), "utf8");
  const workflow = YAML.parse(source);
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.permissions.packages, "write");
  assert.equal(workflow.permissions["id-token"], "write");
  const sourceGate = workflow.jobs["source-gate"];
  const resolver = sourceGate.steps.find((step) => step.id === "oci-inputs");
  assert.equal(resolver.uses, "./.github/actions/resolve-oci-inputs");
  const action = YAML.parse(await readFile(new URL(`../../${resolver.uses}/action.yml`, import.meta.url), "utf8"));
  assert.equal(action.outputs.app_ref.value, "${{ steps.pinned-cohort.outputs.app_ref }}");
  assert.equal(action.outputs.framework_ref.value, "${{ steps.pinned-cohort.outputs.framework_ref }}");
  assert.equal(action.outputs.codex_npm_spec.value, "${{ steps.codex.outputs.spec }}");
  const cohortCheckouts = action.runs.steps.filter((step) => step.name?.startsWith("Check out pinned "));
  assert.deepEqual(cohortCheckouts.map((step) => ({
    repository: step.with.repository,
    ref: step.with.ref,
    path: step.with.path
  })), [
    { repository: "gaofeng21cn/one-person-lab", ref: "${{ steps.pinned-cohort.outputs.framework_ref }}", path: ".cohort/framework" },
    { repository: "gaofeng21cn/one-person-lab-app", ref: "${{ steps.pinned-cohort.outputs.app_ref }}", path: ".cohort/app" }
  ]);
  const sourceValidation = sourceGate.steps.find((step) => step.name === "Install and validate source");
  assert.match(sourceValidation.run, /validate:client-conformance -- --pinned-cohort/);
  assert.deepEqual(sourceValidation.env, {
    OPL_FRAMEWORK_REPO: "${{ github.workspace }}/.cohort/framework",
    OPL_APP_REPO: "${{ github.workspace }}/.cohort/app"
  });
  const build = workflow.jobs["build-child"];
  assert.equal(build.needs, "source-gate");
  const buildArguments = build.steps.find((step) => step.uses?.startsWith("docker/build-push-action@")).with["build-args"];
  for (const [key, argument] of [
    ["app_ref", "OPL_APP_REF"],
    ["framework_ref", "OPL_FRAMEWORK_REF"],
    ["codex_npm_spec", "OPL_CODEX_NPM_SPEC"]
  ]) {
    assert.equal(sourceGate.outputs[key], `\${{ steps.oci-inputs.outputs.${key} }}`);
    assert.ok(buildArguments.trim().split("\n").includes(`${argument}=\${{ needs.source-gate.outputs.${key} }}`));
  }
  assert.deepEqual(build.strategy.matrix.include, [
    { architecture: "amd64", platform: "linux/amd64", runner: "ubuntu-24.04" },
    { architecture: "arm64", platform: "linux/arm64", runner: "ubuntu-24.04-arm" }
  ]);
  assert.doesNotMatch(JSON.stringify(build), /setup-qemu-action|QEMU/i);
  assert.match(source, /push-by-digest=true/);
  assert.match(source, /docker buildx prune --all --force/);
  assert.match(source, /amd64-build/);
  assert.match(source, /amd64-child/);
  assert.match(source, /digests\/\$\{\{ matrix\.architecture \}\}-\*/);
  assert.match(source, /vnd\.docker\.reference\.digest/);
  assert.match(source, /Immutable OCI tag/);
  assert.match(source, /sbom: true/);
  assert.match(source, /provenance: mode=max/);
  assert.match(source, /cosign sign --yes/);
  assert.match(source, /cosign verify/);
  assert.match(source, /Verify anonymous exact-digest access/);
  assert.match(source, /imagetools inspect "\$IMAGE@\$child_digest" --raw/);
  assert.doesNotMatch(source, /\/user\/packages\/container\/opl-studio-webui/);
  assert.match(source, /Anonymous native smoke/);
  assert.match(source, /docker logout ghcr\.io/);
  assert.match(source, /docker pull "\$OPL_CLOUD_SMOKE_IMAGE"/);
  assert.match(source, /opl-studio-cloud-workspace-image-handoff\.json/);
  assert.deepEqual(workflow.jobs["finalize-preview"].needs, ["source-gate", "publish-index", "anonymous-smoke"]);
  assert.match(source, /Move Preview aliases only after native anonymous acceptance/);
  assert.match(source, /for tag in preview latest/);
  assert.match(source, /--tag "\$IMAGE:\$tag"/);
  assert.doesNotMatch(source, /\$IMAGE:stable\b/);
});

test("Latest alias workflow promotes only the signed current Preview digest", async () => {
  const source = await readFile(new URL("../../.github/workflows/studio-webui-latest.yml", import.meta.url), "utf8");
  const workflow = YAML.parse(source);
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.permissions.packages, "write");
  assert.equal(workflow.concurrency.group, "opl-studio-webui-preview");
  assert.match(source, /cosign verify/);
  assert.match(source, /studio-webui-preview\.yml@refs\/heads\/main/);
  assert.match(source, /--tag "\$IMAGE:latest"/);
  assert.doesNotMatch(source, /\$IMAGE:stable\b/);
});
