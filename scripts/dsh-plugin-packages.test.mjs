import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { once } from "node:events";
import { runInNewContext } from "node:vm";
import { Window } from "happy-dom";
import { createRequire } from "node:module";
import { readPluginInventory } from "@deepseek-ai/dsh-host-plugin-inventory";
import { ThreadAdapterError } from "../src/host/thread-adapter.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("packed DSH packages boot outside the checkout and retain native inventory metadata", async () => {
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "opl-dsh-packages-"));
  let core;
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    await fs.writeFile(path.join(staging, "package.json"), JSON.stringify(manifest));
    const registryComposition = process.env.OPL_PLUGIN_COMPOSITION_MODE === "registry";
    // Mirror the installed dependency graph, including CLI/plugin transitive packages.
    // Local delivery plugins below are replaced by their packed bytes.
    for (const entry of await fs.readdir(path.join(root, "node_modules"), { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const names = entry.name.startsWith("@")
        ? (await fs.readdir(path.join(root, "node_modules", entry.name))).map(name => `${entry.name}/${name}`)
        : [entry.name];
      for (const name of names) {
        if (!registryComposition && manifest.dependencies[name]?.startsWith("file:plugins/")) continue;
        const destination = path.join(staging, "node_modules", name);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.symlink(await fs.realpath(path.join(root, "node_modules", name)), destination, "dir");
      }
    }
    const entrypoints = [];
    for (const [name, source] of Object.entries(manifest.dependencies)) {
      const destination = path.join(staging, "node_modules", name);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      if (registryComposition || !source.startsWith("file:plugins/")) {
        continue;
      }
      const packed = spawnSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", staging], {
        cwd: path.join(root, source.slice(5)), encoding: "utf8"
      });
      assert.equal(packed.status, 0, packed.stderr);
      const packedResult = JSON.parse(packed.stdout);
      const receipt = Array.isArray(packedResult) ? packedResult[0] : Object.values(packedResult)[0];
      assert.ok(receipt, name);
      assert.ok(receipt.files.some((file) => file.path === "LICENSE"), name);
      assert.ok(!receipt.files.some((file) => file.path.startsWith("src/")), name);
      await fs.mkdir(destination, { recursive: true });
      const unpack = spawnSync("tar", ["-xzf", path.join(staging, receipt.filename), "--strip-components=1", "-C", destination]);
      assert.equal(unpack.status, 0, String(unpack.stderr));
      entrypoints.push([name, pathToFileURL(path.join(destination, JSON.parse(await fs.readFile(path.join(destination, "package.json"), "utf8")).main))]);
    }
    for (const [name, entrypoint] of entrypoints) {
      assert.equal(typeof (await import(entrypoint)).apply, "function", name);
    }
    // Materialize the shipped factory bytes outside the checkout. A source
    // import, a non-platform require, or a former static-renderer global fails
    // here even though the package's Host half can boot successfully.
    const seedEntry = path.join(staging, "platform-seed.js");
    await fs.writeFile(seedEntry, 'export { getStaticModules } from "@deepseek-ai/dsh-client-web";\n');
    const seedBuild = spawnSync(process.execPath, [path.join(root, "scripts/vite-build-renderer-entry.mjs"), seedEntry, path.join(staging, "platform"), "cjs"], { cwd: root, encoding: "utf8" });
    assert.equal(seedBuild.status, 0, seedBuild.stderr);
    const browser = new Window({ url: "http://127.0.0.1/" });
    browser.document.write("<!doctype html><html><head></head><body></body></html>");
    try {
      const sandbox = {
        window: browser, document: browser.document, navigator: browser.navigator, location: browser.location,
        console, URL, Blob, TextEncoder, TextDecoder, AbortController, crypto: globalThis.crypto,
        setTimeout, clearTimeout, setInterval, clearInterval, performance, structuredClone,
        __OPL_CODEX_MODEL_POLICY__: {
          source: "one-person-lab-app/contracts/app-product-profile.json#codex.auto_model_policy",
          defaultModel: "fixture", defaultReasoningEffort: "high", visibleModels: [{ id: "fixture" }],
          reasoningEfforts: ["high"], autoLabel: { zh: "Auto", en: "Auto" }, knownModelReasoningEffortOverrides: {},
          acceptUnknownCatalogDefault: true, useHighestSupportedReasoningForUnknown: true,
          customModelAccess: { defaultEnabled: false, label: { zh: "自定义模型", en: "Custom models" }, description: { zh: "高级设置", en: "Advanced settings" } }
        }
      };
      const require = createRequire(path.join(staging, "package.json"));
      const seedModule = { exports: {} };
      runInNewContext(await fs.readFile(path.join(staging, "platform/platform-seed.js"), "utf8"), { ...sandbox, module: seedModule, exports: seedModule.exports, require });
      const modules = seedModule.exports.getStaticModules();
      const registrations = new Map();
      browser.__ModuleLoader__ = { load: registration => registrations.set(registration.id, registration) };
      for (const id of ["opl-studio-client", "opl-mcp-apps", "opl-superagent", "opl-team-bots"]) {
        const name = `@one-person-lab/${id}`;
        const clientPath = require.resolve(`${name}/client`);
        runInNewContext(await fs.readFile(clientPath, "utf8"), sandbox, { filename: clientPath });
        const registration = registrations.get(name);
        assert.ok(registration, name);
        const client = registration.factory(specifier => {
          assert.ok(Object.hasOwn(modules, specifier), `${name} requested non-platform module ${specifier}`);
          return modules[specifier];
        });
        assert.equal(typeof (client.default ?? client).apply, "function", name);
      }
    } finally { await browser.happyDOM.close(); }
    await fs.cp(path.join(root, "src/host/dsh"), path.join(staging, "src/host/dsh"), { recursive: true });
    const { bootOplStudioHost } = await import(pathToFileURL(path.join(staging, "src/host/dsh/host.mjs")));
    const transport = {
      initialized: false, on() {}, off() {}, createChannelCallbackAdapter: () => null,
      async listModels() { return { data: [{ id: "fixture", displayName: "Fixture" }] }; },
      async start() { this.initialized = true; }, async stop() { this.initialized = false; }
    };
    const host = await bootOplStudioHost({
      dshHome: path.join(staging, "profile"), workspaceRoot: staging,
      env: { ...process.env }, transport,
      opl: Object.fromEntries(["readState", "readInitialize", "readFullDrilldown", "readDomainDetailView", "readContribution", "executeAction"].map((name) => [name, async () => ({})])),
      webHost: "127.0.0.1", webPort: 0
    });
    core = host.core;
    await host.context.oplSuperagent.start();
    const superagent = host.context.oplSuperagent.read();
    assert.equal(superagent.state, "running");
    assert.equal(superagent.executor, "codex");
    const setupResponse = await fetch(new URL("/orchestrator/api/state", superagent.url), { headers: { "x-orchestrator-request": "1" } });
    assert.equal(setupResponse.status, 200);
    assert.equal((await setupResponse.json()).setup.problem.code, "repositoryUnset");
    const superagentEntry = await fetch(superagent.url, { redirect: "manual" });
    const superagentCookie = superagentEntry.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const superagentPage = await fetch(new URL("/", superagent.url), { headers: { cookie: superagentCookie } });
    const superagentHtml = await superagentPage.text();
    assert.ok(superagentHtml.includes("__OPL_CODEX_WORKBENCH_INITIAL_PANEL__"));
    assert.ok(!superagentHtml.includes('"id":"ui-settings-models"'), "Codex profile must not mount a second model sign-in flow");
    await host.context.oplSuperagent.stop();
    const inventory = await readPluginInventory(host.context);
    const own = inventory.entries.filter((entry) => entry.moduleName.startsWith("@one-person-lab/"));
    assert.equal(own.length, 8);
    assert.equal(host.context.get("agents"), undefined);
    await host.context.oplTeamBots.start();
    const collaboration = host.context.oplTeamBots.read();
    assert.equal(collaboration.state, "running");
    assert.equal(new URL(collaboration.url).hostname, "127.0.0.1");
    const entry = await fetch(collaboration.url, { redirect: "manual" });
    assert.equal(entry.status, 303);
    const cookie = entry.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const page = await fetch(new URL("/", collaboration.url), { headers: { cookie } });
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes("__DSH_BOOT__"));
    const workbench = host.context.oplTeamBots;
    const child = workbench.child;
    const exited = once(child, "exit");
    child.disconnect();
    await exited;
    assert.equal(workbench.read().state, "error", "a lost parent channel shuts down the official profile");
    assert.equal(transport.initialized, true, "the borrowed Codex owner stays alive");
    await workbench.start();
    assert.equal(workbench.read().state, "running");
    assert.equal(core.mcpApps, host.context.oplMcpApps);
    for (const entry of own) {
      assert.equal(entry.fiberPhase, "active", entry.moduleName);
      assert.ok(entry.meta?.description, entry.moduleName);
    }
    assert.equal(transport.initialized, true);
    await core.close();
    assert.equal(transport.initialized, false);
  } finally {
    await core?.close();
    await fs.rm(staging, { recursive: true, force: true });
  }
});

test("typed HTTP errors preserve the shared ABI across isolated plugin bundles", async () => {
  const source = await fs.readFile(path.join(root, "src/host/thread-adapter.mjs"), "utf8");
  const copy = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  const error = new copy.ThreadAdapterError("invalid_workspace_path", "denied", {}, 400);
  assert.ok(error instanceof ThreadAdapterError);
  assert.equal(error.httpStatus, 400);
  assert.equal(Object.assign(new Error("untyped"), { name: "ThreadAdapterError", httpStatus: 400 }) instanceof ThreadAdapterError, false);
});
