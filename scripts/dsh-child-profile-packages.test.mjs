import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { bootOplStudioHost } from "../src/host/dsh/host.mjs";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const registryMode = process.env.OPL_PLUGIN_COMPOSITION_MODE === "registry";

async function pack(directory, destination) {
  const result = await execute("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", destination], { cwd: directory });
  const rows = JSON.parse(result.stdout);
  const item = Array.isArray(rows) ? rows[0] : Object.values(rows)[0];
  assert.ok(item.files.some(file => file.path === "lib/index.mjs"), directory);
  assert.ok(!item.files.some(file => file.path.startsWith("src/")), directory);
  return path.join(destination, item.filename);
}

async function oldCodexAgentsPackage(source, destination) {
  const directory = path.join(destination, "old-codex-agents");
  await fs.mkdir(directory, { recursive: true });
  await Promise.all(["package.json", "LICENSE", "cordis.patch.yml"].map(async file => {
    try { await fs.copyFile(path.join(source, file), path.join(directory, file)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }));
  await fs.cp(path.join(source, "lib"), path.join(directory, "lib"), { recursive: true });
  const manifestPath = path.join(directory, "package.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  delete manifest.dependencies;
  delete manifest.peerDependencies;
  delete manifest.peerDependenciesMeta;
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return pack(directory, directory);
}

async function createProfile({ temp, codexAgentsTarball, superagentTarball }) {
  const home = path.join(temp, "home");
  const profile = path.join(home, "profiles/opl-studio");
  await fs.mkdir(profile, { recursive: true });
  const profileManifest = {
    name: "isolated-opl-profile", private: true, type: "module",
    dependencies: {
      "@gaofeng21cn/opl-codex-agents": `file:${codexAgentsTarball}`,
      "@gaofeng21cn/opl-superagent": `file:${superagentTarball}`
    }
  };
  await fs.writeFile(path.join(profile, "package.json"), JSON.stringify(profileManifest, null, 2) + "\n");
  // Match the official profile layout. DSH's resolver supplies declared
  // carrier peers; this profile contains only the packed public OPL overrides.
  // The private Superagent engine stays with the carrier and is never fetched.
  await fs.writeFile(path.join(profile, "pnpm-workspace.yaml"), [
    "packages:", "  - .", "nodeLinker: hoisted", "autoInstallPeers: false", "strictPeerDependencies: false", ""
  ].join("\n"));
  // setup-node and `npm test` can inject npm_config_* (including the registry
  // and peer policy). Use only fixture-owned npm config for this subprocess.
  const config = path.join(temp, "empty-npmrc");
  await fs.writeFile(config, "");
  await fs.writeFile(path.join(profile, ".npmrc"), [
    "registry=https://registry.npmjs.org/", "node-linker=hoisted",
    "auto-install-peers=false", "strict-peer-dependencies=false", ""
  ].join("\n"));
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => !name.toLowerCase().startsWith("npm_config_")));
  env.npm_config_userconfig = config;
  env.npm_config_globalconfig = config;
  const pnpmBin = process.env.PNPM_BIN ?? "pnpm";
  await execute(pnpmBin, ["install", "--ignore-scripts", "--no-frozen-lockfile", "--reporter=append-only"], {
    cwd: profile,
    env,
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024
  });
  const modulePath = await fs.realpath(path.join(profile, "node_modules/@gaofeng21cn/opl-superagent/lib/index.mjs"));
  assert.ok(modulePath.startsWith(await fs.realpath(temp)) && !modulePath.startsWith(root), modulePath);
  return { home, profile, modulePath };
}

async function bootProfile(home, workspaceRoot) {
  const transport = new EventEmitter();
  Object.assign(transport, {
    initialized: false,
    createChannelCallbackAdapter: () => null,
    async listModels() { return { data: [{ id: "codex-profile-fixture", isDefault: true }] }; },
    async start() { this.initialized = true; },
    async stop() { this.initialized = false; }
  });
  return bootOplStudioHost({
    dshHome: home, workspaceRoot, transport, webHost: "127.0.0.1", webPort: 0,
    opl: Object.fromEntries(["readState", "readInitialize", "readFullDrilldown", "readDomainDetailView", "readContribution", "executeAction"]
      .map(name => [name, async () => ({})]))
  });
}

test("Superagent child profile boots with the packed Codex Agents dependency closure", { timeout: 180000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "opl-child-profile-packages-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const agentDir = registryMode
    ? path.join(root, "node_modules/@gaofeng21cn/opl-codex-agents")
    : path.join(root, "plugins/opl-codex-agents");
  const superagentDir = registryMode
    ? path.join(root, "node_modules/@gaofeng21cn/opl-superagent")
    : path.join(root, "plugins/opl-superagent");
  if (registryMode) {
    for (const directory of [agentDir, superagentDir]) {
      assert.equal((await fs.lstat(directory)).isSymbolicLink(), false, "registry composition must use installed package bytes");
    }
  }
  const [codexAgentsTarball, superagentTarball] = await Promise.all([
    pack(agentDir, temp), pack(superagentDir, temp)
  ]);
  const oldTarball = await oldCodexAgentsPackage(agentDir, temp);

  const failed = await createProfile({ temp: path.join(temp, "before"), codexAgentsTarball: oldTarball, superagentTarball });
  const oldHost = await bootProfile(failed.home, temp);
  try {
    const error = await oldHost.context.oplSuperagent.start().then(() => null, error => error);
    assert.ok(error, "the package without its DSH runtime peers must fail to load in the child profile");
    assert.match(error.diagnostic, /ERR_MODULE_NOT_FOUND[\s\S]*@deepseek-ai\/dsh-llm/);
  } finally { await oldHost.core.close(); }

  const installed = await createProfile({ temp: path.join(temp, "after"), codexAgentsTarball, superagentTarball });
  const host = await bootProfile(installed.home, temp);
  const service = host.context.oplSuperagent;
  try {
    await service.start();
    assert.equal(service.read().state, "running");
    assert.equal(service.read().executor, "codex");
    const response = await fetch(new URL("/orchestrator/api/state", service.read().url), { headers: { "x-orchestrator-request": "1" } });
    assert.equal(response.status, 200, `${await response.clone().text()}\n${service.diagnostic ?? ""}`);
    assert.equal((await response.json()).setup.problem.code, "repositoryUnset");
    assert.equal((await service.stop()).state, "stopped");
    assert.equal(service.read().url, null);
  } catch (error) {
    assert.fail(`${error.message}\n${error.diagnostic ?? ""}`);
  } finally { await host.core.close(); }
});
