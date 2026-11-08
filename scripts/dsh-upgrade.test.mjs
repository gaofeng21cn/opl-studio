import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { assertReplayTarget, executeReplay, readUpgradeTarget, upgradeVerificationSteps, verifyInstalledCohort, verifyProfileSchemas } from "./dsh-upgrade.mjs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readDshBinding, parsePackageSpec, root } from "./dsh-upstream.mjs";

test("DSH binding status is sourced from the manifest and does not write", () => {
  const result = spawnSync(process.execPath, ["scripts/dsh-upgrade.mjs", "status"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  const binding = readDshBinding({ repositoryRoot: root });
  assert.equal(output.status, "dsh_binding_ready");
  assert.equal(output.writes, false);
  assert.equal(output.upstream.ref, binding.ref);
  assert.equal(output.upstream.version, binding.version);
  assert.deepEqual(output.package_cohort, binding.packageCohort);
  assert.equal(output.vendored_gui.file_count, binding.fileCount);
});

test("DSH package specs preserve scoped package names", () => {
  assert.deepEqual(parsePackageSpec("@deepseek-ai/dsh-tools@0.1.1-rc.2"), {
    name: "@deepseek-ai/dsh-tools",
    version: "0.1.1-rc.2"
  });
});

test("DSH binding rejects omitted runtime dependencies and version drift", (t) => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "opl-dsh-binding-"));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  mkdirSync(path.join(fixtureRoot, "src/composition"), { recursive: true });
  mkdirSync(path.join(fixtureRoot, "contracts"), { recursive: true });
  const binding = readDshBinding();
  const name = "@deepseek-ai/dsh-client-ui-dockkit";
  const write = (file, value) => writeFileSync(path.join(fixtureRoot, file), JSON.stringify(value));
  write("contracts/opl-studio-profile.json", binding.profile);
  write("package.json", binding.packageJson);
  write("package-lock.json", binding.packageLock);
  const manifest = structuredClone(binding.manifest);
  manifest.application_host.package_cohort = manifest.application_host.package_cohort.filter(spec => parsePackageSpec(spec).name !== name);
  write("src/composition/deepseekHarnessSourceManifest.json", manifest);
  assert.throws(() => readDshBinding({ repositoryRoot: fixtureRoot }), /dsh-client-ui-dockkit is missing from the package cohort/);

  write("src/composition/deepseekHarnessSourceManifest.json", binding.manifest);
  const lock = structuredClone(binding.packageLock);
  lock.packages[""].dependencies[name] = "0.1.3-alpha.2";
  write("package-lock.json", lock);
  assert.throws(() => readDshBinding({ repositoryRoot: fixtureRoot }), /package-lock.json DSH dependency @deepseek-ai\/dsh-client-ui-dockkit must be/);
  write("package-lock.json", binding.packageLock);
  const resolvedLock = structuredClone(binding.packageLock);
  resolvedLock.packages[`node_modules/${name}`].version = "0.1.3-alpha.2";
  write("package-lock.json", resolvedLock);
  assert.throws(() => readDshBinding({ repositoryRoot: fixtureRoot }), /resolved DSH dependency/);
  write("package-lock.json", binding.packageLock);
  assert.equal(readDshBinding({ repositoryRoot: fixtureRoot }).version, binding.version);
});

test("DSH preflight refuses a missing source checkout instead of writing", () => {
  const result = spawnSync(process.execPath, ["scripts/dsh-upgrade.mjs", "preflight"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires --source/);
});

test("DSH preflight refuses a non-DeepSeek Git worktree", () => {
  const result = spawnSync(process.execPath, ["scripts/dsh-upgrade.mjs", "preflight", "--source", root], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /has no https:\/\/github\.com\/deepseek-ai\/deepseek-harness remote/);
});

function upgradeFixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "opl-dsh-upgrade-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source");
  mkdirSync(source);
  const write = (file, value) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
  };
  const git = (...args) => {
    const result = spawnSync("git", ["-C", source, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-q");
  git("remote", "add", "origin", "https://github.com/deepseek-ai/deepseek-harness.git");
  const packageSpecs = [
    { name: "@deepseek-ai/dsh-app-boot", version: "0.2.1-rc.2" },
    { name: "@deepseek-ai/cordis", version: "4.0.5" }
  ];
  for (const [index, spec] of packageSpecs.entries()) {
    write(path.join(source, index ? "vendor/cordis/package.json" : "packages/boot/app-boot/package.json"), spec);
    write(path.join(directory, "node_modules", spec.name, "package.json"), spec);
  }
  write(path.join(source, "packages/client/ui-layout/src/index.ts"), "export {};\n");
  write(path.join(source, "LICENSE"), "MIT\n");
  git("add", ".");
  git("-c", "user.name=DSH test", "-c", "user.email=dsh-test@example.invalid", "commit", "-qm", "Fixture");
  const binding = { ...readDshBinding(), root: directory, ref: git("rev-parse", "HEAD"), version: "0.2.1-rc.2", packageSpecs,
    packageCohort: packageSpecs.map(({ name, version }) => `${name}@${version}`),
    packageRoots: ["packages/client/ui-layout/src"], packageJson: { scripts: readDshBinding().packageJson.scripts, dependencies: {} } };
  return { directory, source, binding, write, git };
}

test("upgrade target derives independent package versions and rejects a claimed version or tag mismatch", t => {
  const { source, binding } = upgradeFixture(t);
  const target = readUpgradeTarget(binding, source);
  assert.equal(target.version, "0.2.1-rc.2");
  assert.deepEqual(target.package_cohort, ["@deepseek-ai/dsh-app-boot@0.2.1-rc.2", "@deepseek-ai/cordis@4.0.5"]);
  assert.throws(() => readUpgradeTarget(binding, source, { version: "0.2.2-rc.1" }), /not 0.2.2-rc.1/);
  assert.throws(() => readUpgradeTarget(binding, source, { branch: "missing-tag" }));
  assertReplayTarget(binding, target);
  assert.throws(() => assertReplayTarget({ ...binding, ref: "0".repeat(40) }, target), /differs from the pinned binding/);
  assert.throws(() => assertReplayTarget({ ...binding, packageCohort: ["@deepseek-ai/dsh-app-boot@0.2.1-rc.2"] }, target), /differs from the pinned binding/);
});

test("upgrade source must be clean and contain every pinned package and GUI root", t => {
  const { source, binding, write, git } = upgradeFixture(t);
  write(path.join(source, "unreviewed.txt"), "dirty");
  assert.throws(() => readUpgradeTarget(binding, source), /must be clean/);
  rmSync(path.join(source, "unreviewed.txt"));
  rmSync(path.join(source, "vendor/cordis/package.json"));
  git("add", ".");
  git("-c", "user.name=DSH test", "-c", "user.email=dsh-test@example.invalid", "commit", "-qm", "Remove package");
  assert.throws(() => readUpgradeTarget(binding, source), /missing cohort package @deepseek-ai\/cordis/);
});

test("verification rejects installed version drift and official plugin incompatibility before executing gates", async t => {
  const { directory, binding, write } = upgradeFixture(t);
  const file = path.join(directory, "node_modules/@deepseek-ai/dsh-app-boot/package.json");
  write(file, { name: "@deepseek-ai/dsh-app-boot", version: "0.2.1-alpha.1" });
  await assert.rejects(verifyInstalledCohort(binding), /must match the pinned/);
  write(file, binding.packageSpecs[0]);
  binding.packageJson.dependencies["@one-person-lab/test-plugin"] = "file:plugins/test-plugin";
  write(path.join(directory, "plugins/test-plugin/package.json"), { name: "@one-person-lab/test-plugin", version: "1.0.0", engines: { dsh: "0.2.1-alpha.1" } });
  await assert.rejects(executeReplay(binding, undefined, { run() { assert.fail("incompatible plugins must not reach a gate"); } }), /is incompatible/);
  write(path.join(directory, "plugins/test-plugin/package.json"), { name: "@one-person-lab/test-plugin", version: "1.0.0", engines: { dsh: binding.version } });
  await verifyInstalledCohort(binding);
});

test("replay runs the existing vendor and compatibility gates and stops on the first failed step", async t => {
  const { binding, source } = upgradeFixture(t);
  const target = readUpgradeTarget(binding, source);
  const commands = [];
  const result = await executeReplay(binding, target, { replay: true, run(step) { commands.push(step.args[1]); }, async checkSchema() { commands.push("native-profile-schema"); return []; } });
  assert.equal(result.replayed, true);
  assert.equal(commands[0], "vendor:dsh-gui");
  assert.ok(commands.indexOf("build:plugins") < commands.indexOf("native-profile-schema"));
  assert.ok(commands.indexOf("native-profile-schema") < commands.indexOf("test:dsh-plugins"));
  assert.ok(commands.includes("test:client-cordis"));
  assert.ok(commands.includes("test:webui-host"));
  assert.equal(commands.at(-1), "validate:candidate");
  const failed = [];
  await assert.rejects(executeReplay(binding, target, { run(step) { failed.push(step.args[1]); if (step.args[1] === "test:dsh-plugins") throw new Error("host lifecycle failure"); }, async checkSchema() { return []; } }), /host lifecycle failure/);
  assert.equal(failed.at(-1), "test:dsh-plugins");
  assert.throws(() => upgradeVerificationSteps({ ...binding, validation: ["npm run dist:desktop"] }), /Unsupported DSH source validation/);
});

test("native DSH schema generation checks both actual Host profiles without a parallel schema", async () => {
  const schemas = await verifyProfileSchemas(readDshBinding());
  assert.deepEqual(schemas.map(item => item.carrier), ["desktop", "web"]);
  assert.ok(schemas.every(item => !item.diagnostics.some(row => row.level === "error")));
});
