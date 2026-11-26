import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { once } from "node:events";
import { runInNewContext } from "node:vm";
import { Window } from "happy-dom";
import { createRequire } from "node:module";
import { parse } from "@babel/parser";
import { readPluginInventory } from "@deepseek-ai/dsh-host-plugin-inventory";
import { ThreadAdapterError } from "../plugins/core/opl-codex-native/src/thread-adapter.mjs";
import { createClientRuntimePolicy } from "./client-runtime-policy.mjs";
import { resolveAppRepoRoot } from "./resolve-app-repo-root.mjs";
import { listDshSourcePackages } from "../packages/host-kit/src/dsh-source-packages.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function* importSpecifiers(node) {
  if (!node || typeof node !== "object") return;
  const specifier = node.source ?? node.argument
    ?? (node.type === "CallExpression" && node.callee.name === "require" ? node.arguments[0] : undefined);
  if (specifier?.type === "StringLiteral"
      && (/^(Import|Export|TSImportType)/.test(node.type) || node.type === "CallExpression")) {
    yield specifier.value;
  }
  for (const child of Object.values(node)) yield* importSpecifiers(child);
}

test("plugin sources use public workspace package boundaries", async () => {
  const violations = [];
  for (const { id, group, directory } of listDshSourcePackages(root)) {
    const sourceRoot = path.join(directory, "src");
    const files = await fs.readdir(sourceRoot, { withFileTypes: true, recursive: true });
    for (const file of files) {
      if (!file.isFile() || !/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file.name)) continue;
      const filename = path.join(file.parentPath, file.name);
      const source = parse(await fs.readFile(filename, "utf8"), { sourceType: "unambiguous",
        sourceFilename: filename, createImportExpressions: true,
        plugins: [["typescript", { dts: /\.d\.[cm]?ts$/.test(file.name) }],
          ...(file.name.endsWith("x") ? ["jsx"] : [])] });
      for (const specifier of new Set(importSpecifiers(source.program))) {
        if (!specifier.startsWith(".")) continue;
        const target = path.relative(root, path.resolve(path.dirname(filename), specifier)).split(path.sep);
        if (target[0] === "src" || target[0] === "scripts" || target[0] === "packages"
            || (target.length === 1 && target[0] === "package.json")
            || (target[0] === "vendor" && (target[1] === "deepseek-harness" || path.relative(sourceRoot, filename).split(path.sep)[0] === "client"))
            || (target[0] === "plugins" && (target[1] !== group || target[2] !== id))) {
          violations.push(`${path.relative(root, filename)} -> ${specifier}`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

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
        if (manifest.devDependencies[name]?.startsWith("file:packages/")) continue;
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
    const publicServices = {
      "@gaofeng21cn/opl-codex-native": "OplCodexNative",
      "@gaofeng21cn/opl-framework-bridge": "OplFrameworkBridge",
      "@gaofeng21cn/opl-mcp-apps": "McpAppHost"
    };
    for (const [name, entrypoint] of entrypoints) {
      const module = await import(entrypoint);
      assert.equal(typeof module.apply, "function", name);
      if (publicServices[name]) assert.equal(typeof module[publicServices[name]], "function", name);
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
        __OPL_CODEX_MODEL_POLICY__: { source: "stale-renderer-policy" },
        __OPL_SIDEBAR_DEFAULT_PINS__: ["stale-renderer-panel"],
        __OPL_CLIENT_COMPOSITION_POLICY__: { source: "stale-renderer-policy" },
        __OPL_DEEP_LINK_POLICY__: { source: "stale-renderer-policy" }
      };
      const require = createRequire(path.join(staging, "package.json"));
      const frameworkBridge = await import(pathToFileURL(require.resolve("@gaofeng21cn/opl-framework-bridge")));
      assert.equal(typeof frameworkBridge.createOplPassthrough, "function", "the carrier consumes the Framework bridge package export");
      const seedModule = { exports: {} };
      runInNewContext(await fs.readFile(path.join(staging, "platform/platform-seed.js"), "utf8"), { ...sandbox, module: seedModule, exports: seedModule.exports, require });
      const staticModules = new Map(seedModule.exports.getStaticModules().map(entry => [entry.id, entry]));
      const resolvedModules = new Map();
      const resolveStatic = specifier => {
        if (resolvedModules.has(specifier)) return resolvedModules.get(specifier);
        const entry = staticModules.get(specifier);
        assert.ok(entry, `missing static platform module ${specifier}`);
        const exportsObject = entry.factory(resolveStatic);
        resolvedModules.set(specifier, exportsObject);
        return exportsObject;
      };
      const registrations = new Map();
      browser.__ModuleLoader__ = { load: registration => registrations.set(registration.id, registration) };
      for (const id of ["opl-studio-client", "opl-mcp-apps", "opl-runtime-status", "opl-materials-space", "opl-superagent", "opl-team-bots"]) {
        const name = `@gaofeng21cn/${id}`;
        const clientPath = require.resolve(`${name}/client`);
        runInNewContext(await fs.readFile(clientPath, "utf8"), sandbox, { filename: clientPath });
        const registration = registrations.get(name);
        assert.ok(registration, name);
        const client = registration.factory(specifier => {
          assert.ok(staticModules.has(specifier), `${name} requested non-platform module ${specifier}`);
          return resolveStatic(specifier);
        });
        assert.equal(typeof (client.default ?? client).apply, "function", name);
        if (id === "opl-studio-client") {
          const expected = createClientRuntimePolicy(resolveAppRepoRoot(root));
          for (const [key, value] of Object.entries(expected)) {
            assert.equal(JSON.stringify(sandbox[key]), JSON.stringify(value), `${key} must travel with the packed product client`);
          }
          assert.notEqual(sandbox.__OPL_CODEX_MODEL_POLICY__.source, "stale-renderer-policy");
        }
      }
    } finally { await browser.happyDOM.close(); }
    await fs.cp(path.join(root, "packages/host-kit"), path.join(staging, "packages/host-kit"), {
      recursive: true,
      filter: (source) => {
        if (statSync(source).isDirectory()) return path.basename(source) !== "node_modules";
        return source.endsWith(".mjs");
      }
    });
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
    const superagentEntry = await fetch(superagent.url, { redirect: "manual" });
    const superagentCookie = superagentEntry.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const setupResponse = await fetch(new URL("/orchestrator/api/state", superagent.url), { headers: { "x-orchestrator-request": "1", cookie: superagentCookie } });
    assert.equal(setupResponse.status, 200);
    assert.equal((await setupResponse.json()).setup.problem.code, "repositoryUnset");
    const superagentPage = await fetch(new URL("/", superagent.url), { headers: { cookie: superagentCookie } });
    const superagentHtml = await superagentPage.text();
    assert.ok(superagentHtml.includes("__OPL_CODEX_WORKBENCH_INITIAL_PANEL__"));
    assert.ok(!superagentHtml.includes('"id":"ui-settings-models"'), "Codex profile must not mount a second model sign-in flow");
    await host.context.oplSuperagent.stop();
    const inventory = await readPluginInventory(host.context);
    const own = inventory.entries.filter((entry) => entry.moduleName.startsWith("@gaofeng21cn/"));
    assert.equal(own.length, 11);
    assert.equal(typeof host.context.get("oplWeixinChannel")?.connect, "function");
    assert.ok(host.context.oplRuntimeStatus);
    assert.equal(typeof host.context.oplMaterialsSpace?.listSpaces, "function");
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
  const source = await fs.readFile(path.join(root, "packages/host-contracts/thread-error.mjs"), "utf8");
  const copy = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  const error = new copy.ThreadAdapterError("invalid_workspace_path", "denied", {}, 400);
  assert.ok(error instanceof ThreadAdapterError);
  assert.equal(error.httpStatus, 400);
  assert.equal(Object.assign(new Error("untyped"), { name: "ThreadAdapterError", httpStatus: 400 }) instanceof ThreadAdapterError, false);
});

test("public @gaofeng21cn/opl-plugin-ui-kit packs clean dist bundle and declarations without private refs", async () => {
  const pkgDir = path.join(root, "packages/opl-plugin-ui-kit");
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "opl-ui-kit-pack-"));
  try {
    const packed = JSON.parse(spawnSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", staging], {
      cwd: pkgDir, encoding: "utf8"
    }).stdout);
    const entry = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
    assert.equal(entry.name, "@gaofeng21cn/opl-plugin-ui-kit");
    const tarball = path.join(staging, entry.filename);
    const list = spawnSync("tar", ["-tzf", tarball], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
    assert.ok(list.includes("package/dist/index.js"), "tarball must include built dist/index.js");
    assert.ok(list.includes("package/dist/index.d.ts"), "tarball must include dist/index.d.ts");
    assert.ok(list.includes("package/README.md"), "tarball must include README.md");
    assert.ok(list.includes("package/LICENSE"), "tarball must include LICENSE");
    const js = spawnSync("tar", ["-xOf", tarball, "package/dist/index.js"], { encoding: "utf8" }).stdout;
    const dts = spawnSync("tar", ["-xOf", tarball, "package/dist/index.d.ts"], { encoding: "utf8" }).stdout;
    for (const marker of ["vendor/", "@gaofeng21cn/opl-host-contracts", "@deepseek-ai/dsh-client-ui-slots"]) {
      assert.equal(js.includes(marker), false, `dist/index.js must not reference ${marker}`);
      assert.equal(dts.includes(marker), false, `dist/index.d.ts must not reference ${marker}`);
    }
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
});
