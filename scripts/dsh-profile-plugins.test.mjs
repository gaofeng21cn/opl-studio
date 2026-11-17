import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { checkRegistryUpdates, discoverPublishablePackages, ensureProfileNpmrc, inspectProfile, packSourcePlugins, resolveRegistryVersions, updateRegistryPlugins } from "./dsh-profile-plugins.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const pnpmAvailable = spawnSync("pnpm", ["--version"], { encoding: "utf8" }).status === 0;

test("native DSH profile update boots Superagent and removal restores the bundled plugin", { skip: !pnpmAvailable }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "opl-profile-update-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const home = path.join(temp, "home");
  const anchor = path.join(root, "package.json");
  const baseline = createHash("sha256").update(await fs.readFile(anchor)).digest("hex");
  const run = (operation, packages) => {
    const result = spawnSync(process.execPath, [path.join(root, "scripts/dsh-profile-plugins.mjs"), operation,
      ...packages.flatMap(name => ["--package", name]), "--home", home,
      "--install-anchor", anchor, "--cache-root", path.join(temp, "cache")], { encoding: "utf8", timeout: 60000 });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const installed = run("update-source", ["opl-superagent"]);
  assert.equal(installed.application, "restart-required");
  assert.deepEqual(installed.overrides.map(entry => entry.name), ["@one-person-lab/opl-superagent"]);
  const profileManifest = JSON.parse(await fs.readFile(path.join(home, "profiles/opl-studio/package.json")));
  assert.deepEqual(Object.keys(profileManifest.dependencies), ["@one-person-lab/opl-superagent"]);
  const { bootOplStudioHost } = await import("../src/host/dsh/host.mjs");
  const transport = { initialized: false, on() {}, off() {}, createChannelCallbackAdapter: () => null,
    async listModels() { return { data: [{ id: "fixture", displayName: "Fixture" }] }; }, async start() { this.initialized = true; }, async stop() { this.initialized = false; } };
  const host = await bootOplStudioHost({ dshHome: home, workspaceRoot: temp, transport,
    webHost: "127.0.0.1", webPort: 0,
    opl: Object.fromEntries(["readState", "readInitialize", "readFullDrilldown", "readDomainDetailView", "readContribution", "executeAction"].map(name => [name, async () => ({})])) });
  try {
    const selected = host.context.pluginPackages.packageOf("@one-person-lab/opl-superagent",
      pathToFileURL(path.join(home, "profiles/opl-studio/package.json")).href);
    assert.ok(selected.dir.startsWith(home), selected.dir);
    const graph = host.core.readClientModuleGraph();
    assert.ok(graph.entries.some(entry => entry.id === "@one-person-lab/opl-superagent"),
      "the official client graph must discover a dsh.client package resolved from the native profile");
    assert.equal(host.context.oplSuperagent.read().executor, "codex");
    await host.context.oplSuperagent.start();
    const response = await fetch(new URL("/orchestrator/api/state", host.context.oplSuperagent.read().url), { headers: { "x-orchestrator-request": "1" } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).setup.problem.code, "repositoryUnset");
  } finally { await host.core.close(); }
  run("remove", ["@one-person-lab/opl-superagent"]);
  assert.deepEqual((await inspectProfile({ installAnchor: anchor, home })).overrides, []);
  assert.equal(createHash("sha256").update(await fs.readFile(anchor)).digest("hex"), baseline);
});

test("source plugin selection discovers publishable client packages and rejects unknown/duplicate packages", async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "opl-plugin-selection-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  assert.ok(discoverPublishablePackages({ sourceRoot: root }).includes("@one-person-lab/opl-studio-client"));
  assert.throws(() => packSourcePlugins(["../outside"], temp));
  assert.throws(() => packSourcePlugins(["opl-superagent", "@one-person-lab/opl-superagent"], temp));
  assert.throws(() => packSourcePlugins([], temp));
  assert.deepEqual(await fs.readdir(temp), []);
});

test("registry authentication survives a later update without a new token", async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "opl-registry-npmrc-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const npmrcPath = path.join(temp, ".npmrc");
  await fs.writeFile(npmrcPath, "registry=https://registry.npmjs.org/\n", { mode: 0o644 });
  ensureProfileNpmrc(temp, "test-token-value");
  ensureProfileNpmrc(temp);
  const npmrc = await fs.readFile(npmrcPath, "utf8");
  assert.ok(npmrc.includes("registry=https://registry.npmjs.org/"));
  assert.ok(npmrc.includes("@one-person-lab:registry=https://npm.pkg.github.com"));
  assert.ok(npmrc.includes("//npm.pkg.github.com/:_authToken=test-token-value"));
  assert.equal((await fs.stat(npmrcPath)).mode & 0o777, 0o600);
});

test("registry resolution uses the selected carrier cohort and skips newer incompatible versions", async () => {
  const name = "@one-person-lab/opl-superagent";
  const queries = [];
  const view = async (_dir, spec) => {
    queries.push(spec);
    const answer = spec === name ? ["0.1.0", "0.1.2", "0.1.1", "0.2.0"] : {
      name, version: spec.split("@").at(-1),
      engines: { dsh: spec.endsWith("0.1.2") ? ">=9.0.0" : "0.2.2-rc.3" }
    };
    return { exitCode: 0, timedOut: false, stdout: JSON.stringify(answer), stderr: "" };
  };
  const result = await resolveRegistryVersions([name], root, path.join(root, "package.json"), view);
  assert.deepEqual(result[name], { available: true, version: "0.1.1" });
  assert.deepEqual(queries, [name, name + "@0.1.2", name + "@0.1.1"]);
});

test("registry lookup failures remain failures instead of a successful no-update result", async () => {
  const name = "@one-person-lab/opl-superagent";
  const failure = async () => ({ exitCode: 1, timedOut: true, stdout: "", stderr: "" });
  const result = await resolveRegistryVersions([name], root, path.join(root, "package.json"), failure);
  assert.deepEqual(result[name], { available: false, reason: "timeout" });
  const malformed = async () => ({ exitCode: 0, timedOut: false, stdout: "invalid json", stderr: "" });
  assert.equal((await resolveRegistryVersions([name], root, path.join(root, "package.json"), malformed))[name].reason, "invalid_registry_response");
});

test("current and unavailable registry checks never create an unnecessary profile override", async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "opl-update-check-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const name = "@one-person-lab/opl-superagent";
  const installAnchor = path.join(root, "package.json");
  const currentVersion = JSON.parse(await fs.readFile(path.join(root, "plugins/opl-superagent/package.json"))).version;
  const view = async (_dir, spec) => ({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify(spec === name
    ? [currentVersion] : { name, version: currentVersion, engines: { dsh: "0.2.2-rc.3" } }) });
  let installs = 0;
  const run = async () => { installs += 1; throw new Error("No install expected"); };
  const current = await updateRegistryPlugins({ installAnchor, home, names: [name], view, run });
  assert.equal(current.application, "current");
  const failed = await updateRegistryPlugins({ installAnchor, home, names: [name], run,
    view: async () => ({ exitCode: 1, timedOut: true, stdout: "", stderr: "" }) });
  assert.equal(failed.application, "update-check-failed");
  assert.equal(failed.failures[name], "timeout");
  assert.equal(installs, 0);
  assert.deepEqual((await inspectProfile({ installAnchor, home })).overrides, []);
});

test("registry update projection preserves each failed check while reporting compatible siblings", async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "opl-update-partial-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const good = "@one-person-lab/opl-superagent", bad = "@one-person-lab/opl-team-bots";
  const projection = await checkRegistryUpdates({ installAnchor: path.join(root, "package.json"), home, names: [good, bad],
    view: async (_dir, spec) => spec === bad ? { exitCode: 1, timedOut: true, stdout: "", stderr: "" }
      : { exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify(spec === good ? ["0.1.1"]
        : { name: good, version: "0.1.1", engines: { dsh: "0.2.2-rc.3" } }) } });
  assert.equal(projection.plugins[good].state, "update_available");
  assert.equal(projection.plugins[bad].state, "unavailable");
  assert.equal(projection.plugins[bad].reason, "timeout");
});
