import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { inc } from "semver";
import { initProfile, loadOptionalPatches } from "@deepseek-ai/dsh-app-boot";
import { runPluginCommand } from "@deepseek-ai/dsh-plugin-manager/operations";
import { checkRegistryUpdates, discoverPublishablePackages, ensureProfileNpmrc, inspectProfile, packSourcePlugins, resolveBundledPnpm, resolveRegistryVersions, updateRegistryPlugins } from "./dsh-profile-plugins.mjs";
import { mergePublicFeedIndex } from "./publish-dsh-plugin-feed.mjs";

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
  const dir = path.join(home, "profiles/opl-studio");
  const legacyDir = path.join(temp, "legacy");
  await fs.mkdir(legacyDir);
  await fs.writeFile(path.join(legacyDir, "package.json"), JSON.stringify({ name: "@one-person-lab/opl-superagent", version: "0.1.0" }));
  initProfile(dir, []);
  const legacy = await runPluginCommand({ profile: "opl-studio", dir, installAnchor: anchor, home, cwd: temp }, ["add", legacyDir],
    { execution: "service", activateNewBundles: false, outputBytes: 16384 });
  assert.equal(legacy.exitCode, 0, legacy.output);
  await fs.writeFile(path.join(dir, "cordis.patch.yml"), '- id: opl-superagent\n  name: "@one-person-lab/opl-superagent"\n  disabled: false\n  config:\n    migratedSetting: "retained"\n- id: untouched\n  name: third-party-plugin\n  disabled: true\n');
  const installed = run("update-source", ["opl-superagent"]);
  assert.equal(installed.application, "restart-required");
  assert.deepEqual(installed.removedLegacyOverrides, ["@one-person-lab/opl-superagent"]);
  const migratedPatch = loadOptionalPatches("opl-studio", path.join(dir, "cordis.patch.yml"));
  assert.deepEqual(migratedPatch[0], { id: "opl-superagent", name: "@gaofeng21cn/opl-superagent", disabled: false, config: { migratedSetting: "retained" } });
  assert.deepEqual(migratedPatch[1], { id: "untouched", name: "third-party-plugin", disabled: true });
  assert.deepEqual(installed.overrides.map(entry => entry.name), ["@gaofeng21cn/opl-superagent"]);
  const profileManifest = JSON.parse(await fs.readFile(path.join(home, "profiles/opl-studio/package.json")));
  assert.deepEqual(Object.keys(profileManifest.dependencies), ["@gaofeng21cn/opl-superagent"]);
  const { bootOplStudioHost } = await import("../src/host/dsh/host.mjs");
  const transport = { initialized: false, on() {}, off() {}, createChannelCallbackAdapter: () => null,
    async listModels() { return { data: [{ id: "fixture", displayName: "Fixture" }] }; }, async start() { this.initialized = true; }, async stop() { this.initialized = false; } };
  const host = await bootOplStudioHost({ dshHome: home, workspaceRoot: temp, transport,
    webHost: "127.0.0.1", webPort: 0,
    opl: Object.fromEntries(["readState", "readInitialize", "readFullDrilldown", "readDomainDetailView", "readContribution", "executeAction"].map(name => [name, async () => ({})])) });
  try {
    const selected = host.context.pluginPackages.packageOf("@gaofeng21cn/opl-superagent",
      pathToFileURL(path.join(home, "profiles/opl-studio/package.json")).href);
    assert.ok(selected.dir.startsWith(home), selected.dir);
    const graph = host.core.readClientModuleGraph();
    assert.ok(graph.entries.some(entry => entry.id === "@gaofeng21cn/opl-superagent"),
      "the official client graph must discover a dsh.client package resolved from the native profile");
    assert.ok(!graph.entries.some(entry => entry.id.startsWith("@one-person-lab/")));
    assert.equal(host.context.oplSuperagent.read().executor, "codex");
    await host.context.oplSuperagent.start();
    const superagentUrl = host.context.oplSuperagent.read().url;
    const superagentEntry = await fetch(superagentUrl, { redirect: "manual" });
    const cookie = superagentEntry.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const response = await fetch(new URL("/orchestrator/api/state", superagentUrl), { headers: { "x-orchestrator-request": "1", cookie } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).setup.problem.code, "repositoryUnset");
  } finally { await host.core.close(); }
  run("remove", ["@gaofeng21cn/opl-superagent"]);
  assert.deepEqual((await inspectProfile({ installAnchor: anchor, home })).overrides, []);
  assert.equal(createHash("sha256").update(await fs.readFile(anchor)).digest("hex"), baseline);
});

test("source plugin selection discovers publishable client packages and rejects unknown/duplicate packages", async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "opl-plugin-selection-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  assert.ok(discoverPublishablePackages({ sourceRoot: root }).includes("@gaofeng21cn/opl-studio-client"));
  assert.throws(() => packSourcePlugins(["../outside"], temp));
  assert.throws(() => packSourcePlugins(["opl-superagent", "@gaofeng21cn/opl-superagent"], temp));
  assert.throws(() => packSourcePlugins([], temp));
  assert.deepEqual(await fs.readdir(temp), []);
});

test("registry authentication survives a later update without a new token", async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "opl-registry-npmrc-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const npmrcPath = path.join(temp, ".npmrc");
  await fs.writeFile(npmrcPath, "registry=https://registry.npmjs.org/\n@one-person-lab:registry=https://npm.pkg.github.com\n", { mode: 0o644 });
  ensureProfileNpmrc(temp, "test-token-value");
  ensureProfileNpmrc(temp);
  const npmrc = await fs.readFile(npmrcPath, "utf8");
  assert.ok(npmrc.includes("registry=https://registry.npmjs.org/"));
  assert.ok(npmrc.includes("@gaofeng21cn:registry=https://npm.pkg.github.com"));
  assert.ok(!npmrc.includes("@one-person-lab:registry="));
  assert.ok(npmrc.includes("//npm.pkg.github.com/:_authToken=test-token-value"));
  assert.equal((await fs.stat(npmrcPath)).mode & 0o777, 0o600);
});

test("registry resolution uses the selected carrier cohort and skips newer incompatible versions", async () => {
  const name = "@gaofeng21cn/opl-superagent";
  const currentVersion = JSON.parse(await fs.readFile(path.join(root, "plugins/opl-superagent/package.json"))).version;
  const incompatibleVersion = inc(currentVersion, "patch");
  const queries = [];
  const view = async (_dir, spec) => {
    queries.push(spec);
    const answer = spec === name ? ["0.1.0", incompatibleVersion, currentVersion, "0.2.0"] : {
      name, version: spec.split("@").at(-1),
      engines: { dsh: spec.endsWith(incompatibleVersion) ? ">=9.0.0" : "0.2.3-alpha.2" }
    };
    return { exitCode: 0, timedOut: false, stdout: JSON.stringify(answer), stderr: "" };
  };
  const result = await resolveRegistryVersions([name], root, path.join(root, "package.json"), view);
  assert.deepEqual(result[name], { available: true, version: currentVersion });
  assert.deepEqual(queries, [name, `${name}@${incompatibleVersion}`, `${name}@${currentVersion}`]);
});

test("registry lookup failures remain failures instead of a successful no-update result", async () => {
  const name = "@gaofeng21cn/opl-superagent";
  const failure = async () => ({ exitCode: 1, timedOut: true, stdout: "", stderr: "" });
  const result = await resolveRegistryVersions([name], root, path.join(root, "package.json"), failure);
  assert.deepEqual(result[name], { available: false, reason: "timeout" });
  const malformed = async () => ({ exitCode: 0, timedOut: false, stdout: "invalid json", stderr: "" });
  assert.equal((await resolveRegistryVersions([name], root, path.join(root, "package.json"), malformed))[name].reason, "invalid_registry_response");
});

test("current and unavailable registry checks never create an unnecessary profile override", async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "opl-update-check-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const name = "@gaofeng21cn/opl-superagent";
  const installAnchor = path.join(root, "package.json");
  const currentVersion = JSON.parse(await fs.readFile(path.join(root, "plugins/opl-superagent/package.json"))).version;
  const view = async (_dir, spec) => ({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify(spec === name
    ? [currentVersion] : { name, version: currentVersion, engines: { dsh: "0.2.3-alpha.2" } }) });
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
  const good = "@gaofeng21cn/opl-superagent", bad = "@gaofeng21cn/opl-team-bots";
  const availableVersion = inc(JSON.parse(await fs.readFile(path.join(root, "plugins/opl-superagent/package.json"))).version, "patch");
  const projection = await checkRegistryUpdates({ installAnchor: path.join(root, "package.json"), home, names: [good, bad],
    view: async (_dir, spec) => spec === bad ? { exitCode: 1, timedOut: true, stdout: "", stderr: "" }
      : { exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify(spec === good ? [availableVersion]
        : { name: good, version: availableVersion, engines: { dsh: "0.2.3-alpha.2" } }) } });
  assert.equal(projection.plugins[good].state, "update_available");
  assert.equal(projection.plugins[bad].state, "unavailable");
  assert.equal(projection.plugins[bad].reason, "timeout");
});

test("registry updates use the profile scope route without overriding npm's default registry", async t => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "opl-update-registry-routing-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const name = "@gaofeng21cn/opl-superagent";
  const installAnchor = path.join(root, "package.json");
  const currentVersion = JSON.parse(await fs.readFile(path.join(root, "plugins/opl-superagent/package.json"))).version;
  const nextVersion = inc(currentVersion, "patch");
  let managerArgs;
  let managerContext;
  await assert.rejects(updateRegistryPlugins({ installAnchor, home, names: [name],
    view: async (_dir, spec) => ({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify(spec === name
      ? [currentVersion, nextVersion] : { name, version: nextVersion, engines: { dsh: "0.2.3-alpha.2" } }) }),
    run: async (context, args) => { managerContext = context; managerArgs = args; return { exitCode: 1, timedOut: false, logPath: "fixture" }; }
  }), /Native DSH package operation failed/);
  assert.deepEqual(managerArgs, ["add", "--save-exact", `${name}@${nextVersion}`]);
  assert.equal(managerContext.profile, "opl-studio");
  assert.equal(managerContext.installAnchor, installAnchor);
  assert.equal(managerContext.cwd, process.cwd());
  assert.ok(managerContext.dir.startsWith(home));
});

test("public DSH plugin feed works without GitHub tokens, rejects tampered tarballs, and uses bundled pnpm", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "opl-public-feed-update-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const home = path.join(temp, "dsh-home");
  const carrierDir = path.join(temp, "carrier");
  const bundledPnpmBin = path.join(carrierDir, "node_modules", "pnpm", "bin", "pnpm.mjs");
  await fs.mkdir(path.dirname(bundledPnpmBin), { recursive: true });
  await fs.writeFile(bundledPnpmBin, "// fixture bundled pnpm\n");
  const superagentManifest = JSON.parse(await fs.readFile(path.join(root, "plugins/opl-superagent/package.json"), "utf8"));
  const bootManifest = JSON.parse(await fs.readFile(path.join(root, "node_modules/@deepseek-ai/dsh-app-boot/package.json"), "utf8"));
  await fs.mkdir(path.join(carrierDir, "node_modules", "@gaofeng21cn", "opl-superagent"), { recursive: true });
  await fs.writeFile(path.join(carrierDir, "node_modules", "@gaofeng21cn", "opl-superagent", "package.json"), JSON.stringify(superagentManifest));
  await fs.mkdir(path.join(carrierDir, "node_modules", "@deepseek-ai", "dsh-app-boot"), { recursive: true });
  await fs.writeFile(path.join(carrierDir, "node_modules", "@deepseek-ai", "dsh-app-boot", "package.json"), JSON.stringify(bootManifest));
  const installAnchor = path.join(carrierDir, "package.json");
  await fs.writeFile(installAnchor, JSON.stringify({
    name: "opl-studio-carrier-fixture",
    version: "1.0.0",
    dependencies: { "@gaofeng21cn/opl-superagent": superagentManifest.version }
  }));

  const name = "@gaofeng21cn/opl-superagent";
  const bundled = resolveBundledPnpm(installAnchor);
  assert.equal(bundled.command, process.execPath);
  assert.equal(bundled.args?.[0], bundledPnpmBin);

  const nextVersion = inc(superagentManifest.version, "patch");
  const validBytes = Buffer.from("valid-plugin-tarball");
  const integrity = "sha512-" + createHash("sha512").update(validBytes).digest("base64");
  const feedUrl = "http://127.0.0.1:49999/dsh-plugin-index.json";
  const tarballUrl = `http://127.0.0.1:49999/opl-superagent-${nextVersion}.tgz`;
  const mergedFeed = mergePublicFeedIndex(null, [{
    dirName: "opl-superagent",
    name,
    version: nextVersion,
    engines: { dsh: "0.2.3-alpha.2" },
    peerDependencies: {},
    assetName: `opl-superagent-${nextVersion}.tgz`,
    integrity
  }]);
  assert.equal(mergedFeed.schema, "opl_dsh_plugin_public_feed.v1");
  mergedFeed.plugins[name][0].tarballUrl = tarballUrl;

  let tampered = false;
  const fetchImpl = async (url) => {
    if (String(url) === feedUrl) return new Response(JSON.stringify(mergedFeed), { status: 200 });
    if (String(url) === tarballUrl) return new Response(tampered ? Buffer.from("tampered") : validBytes, { status: 200 });
    return new Response("not found", { status: 404 });
  };

  const checked = await checkRegistryUpdates({ installAnchor, home, names: [name], feedUrl, fetchImpl });
  assert.equal(checked.source, "public_feed");
  assert.equal(checked.plugins[name].state, "update_available");
  assert.equal(checked.plugins[name].available, nextVersion);

  tampered = true;
  const tamperedResult = await updateRegistryPlugins({
    installAnchor,
    home,
    names: [name],
    feedUrl,
    fetchImpl,
    run: async () => assert.fail("tampered tarball must not invoke pnpm")
  });
  assert.equal(tamperedResult.application, "update-check-failed");
  assert.equal(tamperedResult.failures[name], "integrity_mismatch");

  tampered = false;
  let capturedArgs;
  let capturedOptions;
  await assert.rejects(updateRegistryPlugins({
    installAnchor,
    home,
    names: [name],
    feedUrl,
    fetchImpl,
    run: async (_ctx, args, options) => {
      capturedArgs = args;
      capturedOptions = options;
      return { exitCode: 1, timedOut: false, logPath: "fixture" };
    }
  }), /Native DSH package operation failed/);
  assert.equal(capturedArgs[0], "add");
  assert.ok(capturedArgs[1].endsWith(".tgz"));
  assert.equal(capturedOptions.command, bundled.command);
  assert.deepEqual(capturedOptions.args, bundled.args);
});
