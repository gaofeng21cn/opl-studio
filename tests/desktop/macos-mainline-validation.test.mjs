import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import YAML from "yaml";

const workflowUrl = new URL("../../.github/workflows/non-release-validation.yml", import.meta.url);
const macosReleaseWorkflowUrl = new URL("../../.github/workflows/macos-desktop-release-qualification.yml", import.meta.url);
const additionalWorkflowUrl = new URL("../../.github/workflows/additional-carrier-qualification.yml", import.meta.url);
const packageUrl = new URL("../../package.json", import.meta.url);

test("default validation is source-only and does not build a release carrier", async () => {
  const workflow = YAML.parse(await readFile(workflowUrl, "utf8"));
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  assert.ok(Object.hasOwn(workflow.on, "pull_request"));
  assert.ok(Object.hasOwn(workflow.on, "workflow_dispatch"));
  assert.deepEqual(Object.keys(workflow.jobs), ["source-validation"]);
  const job = workflow.jobs["source-validation"];
  assert.equal(job["runs-on"], "ubuntu-24.04");
  assert.match(JSON.stringify(job), /npm run test:source/);
  assert.match(JSON.stringify(job), /candidateContractEvidence\.json/);
  assert.match(JSON.stringify(job), /gaofeng21cn\/one-person-lab-app/);
  assert.doesNotMatch(JSON.stringify(job), /electron-builder|smoke:desktop-live|smoke:docker|headless:install|dist:mac/i);

  const packageJson = JSON.parse(await readFile(packageUrl, "utf8"));
  assert.doesNotMatch(packageJson.scripts["test:source"], /validate:state-model|\bopl\s+app\s+state\b/);
});

test("macOS arm64 Desktop has an independent manual release qualification", async () => {
  const source = await readFile(macosReleaseWorkflowUrl, "utf8");
  const workflow = YAML.parse(source);
  assert.ok(workflow.on.workflow_dispatch !== undefined);
  assert.equal(workflow.on.push, undefined);
  assert.equal(workflow.on.pull_request, undefined);
  assert.deepEqual(Object.keys(workflow.jobs), ["macos-arm64-desktop"]);
  const job = workflow.jobs["macos-arm64-desktop"];
  assert.equal(job["runs-on"], "macos-15");
  assert.equal(job.env.OPL_APP_REPO_ROOT, "${{ github.workspace }}/app-product");
  assert.match(JSON.stringify(job), /candidateContractEvidence\.json/);
  assert.match(JSON.stringify(job), /gaofeng21cn\/one-person-lab-app/);
  assert.match(JSON.stringify(job), /electron-builder --mac --arm64/);
  assert.match(JSON.stringify(job), /smoke:desktop-live/);
});

test("additional carriers remain independent manual qualifications outside default CI", async () => {
  const source = await readFile(additionalWorkflowUrl, "utf8");
  const workflow = YAML.parse(source);
  assert.ok(workflow.on.workflow_dispatch !== undefined);
  assert.equal(workflow.on.schedule, undefined);
  assert.equal(workflow.on.push, undefined);
  assert.equal(workflow.on.pull_request, undefined);
  assert.deepEqual(Object.keys(workflow.jobs), [
    "desktop-distribution",
    "headless-installed-macos",
    "headless-installed-linux",
    "oci-distribution"
  ]);
  assert.match(source, /ubuntu-24\.04-arm/);
  assert.doesNotMatch(source, /setup-qemu-action|\bQEMU\b/i);
});
