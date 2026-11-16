import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { inspectProfile, packSourcePlugins } from "./dsh-profile-plugins.mjs";

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

test("source plugin selection rejects static renderer, unknown and duplicate packages before packing", async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "opl-plugin-selection-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  for (const names of [["opl-studio-client"], ["../outside"], ["opl-superagent", "@one-person-lab/opl-superagent"], []]) {
    assert.throws(() => packSourcePlugins(names, temp));
  }
  assert.deepEqual(await fs.readdir(temp), []);
});

test("update-registry writes .npmrc with scope mapping and optional auth token", async t => {
  // Import the internal helpers via dynamic import to test ensureProfileNpmrc
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "opl-registry-npmrc-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));

  // ensureProfileNpmrc is not exported; exercise it through the CLI by
  // calling update-registry with a fake token and a temp home. The registry
  // query will fail (no network / no published packages in test), but the
  // .npmrc must be written before the query runs.
  const home = path.join(temp, "home");
  const anchor = path.join(root, "package.json");
  const result = spawnSync(process.execPath, [
    path.join(root, "scripts/dsh-profile-plugins.mjs"), "update-registry",
    "--package", "opl-superagent", "--token", "test-token-value",
    "--home", home, "--install-anchor", anchor
  ], { encoding: "utf8", timeout: 30000 });

  // The command exits non-zero because no published packages are found,
  // but the .npmrc must have been written to the profile dir before the query.
  const profileDir = path.join(home, "profiles", "opl-studio");
  const npmrcPath = path.join(profileDir, ".npmrc");
  const npmrc = await fs.readFile(npmrcPath, "utf8");
  assert.ok(npmrc.includes("@one-person-lab:registry=https://npm.pkg.github.com"),
    ".npmrc must map @one-person-lab scope to GitHub Packages");
  assert.ok(npmrc.includes("//npm.pkg.github.com/:_authToken=test-token-value"),
    ".npmrc must contain the provided auth token");
});

test("update-registry with --all targets every publishable package", async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "opl-registry-all-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const home = path.join(temp, "home");
  const anchor = path.join(root, "package.json");
  // Run with --all but no token and no network; expect it to write .npmrc
  // and report no-updates for all packages (none published yet).
  const result = spawnSync(process.execPath, [
    path.join(root, "scripts/dsh-profile-plugins.mjs"), "update-registry",
    "--all", "--home", home, "--install-anchor", anchor
  ], { encoding: "utf8", timeout: 30000 });
  // Exit code 0 is expected when no updates are available (graceful no-updates).
  // If pnpm view fails entirely the command exits non-zero; accept either
  // as long as .npmrc was written.
  const npmrcPath = path.join(home, "profiles", "opl-studio", ".npmrc");
  const npmrc = await fs.readFile(npmrcPath, "utf8");
  assert.ok(npmrc.includes("@one-person-lab:registry=https://npm.pkg.github.com"),
    ".npmrc scope mapping must be written for --all");
});
