import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";

const root = fileURLToPath(new URL("../..", import.meta.url));
const prefix = "/w/workspace_0123456789abcdef0123456789abcdef/";
const incomplete = { setup_flow: { is_first_run: false, ready_to_launch: false, blocking_items: ["codex_config"] } };
const ready = { setup_flow: { is_first_run: true, ready_to_launch: true } };

async function until(condition, message) {
  const deadline = Date.now() + 5_000;
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(condition(), message);
}

test("first-run navigation consumes only a fresh login or an explicit setup request", async t => {
  const output = await mkdtemp(path.join(os.tmpdir(), "opl-first-run-navigation-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  const build = spawnSync(process.execPath, [
    path.join(root, "scripts/vite-build-renderer-entry.mjs"),
    path.join(root, "tests/renderer/history-startup-isolation.fixture.tsx"), output, "iife"
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(build.status, 0, build.stderr);
  const source = await readFile(path.join(output, "history-startup-isolation.fixture.js"), "utf8");

  function mount(t, route, readFast) {
    const browser = new Window({ url: `http://localhost${prefix}${route}` });
    t.after(() => browser.happyDOM.close());
    browser.structuredClone = structuredClone;
    browser.document.write(`<!doctype html><html><head><base href="${prefix}"></head><body><div id="root"></div></body></html>`);
    let fastReads = 0;
    let detailedReads = 0;
    browser.oplStudio = {
      listThreads: async () => ({ data: [] }),
      readCodexModels: async () => ({ data: [] }),
      readState: async profile => {
        assert.equal(profile, "fast");
        fastReads++;
        return { app_state: { system_initialize: await readFast() }, readback: { exitCode: 0 } };
      },
      readInitialize: async () => {
        detailedReads++;
        return { system_initialize: incomplete, readback: { exitCode: 0 } };
      }
    };
    browser.eval(source);
    return {
      browser,
      get surface() { return browser.historyStartupSurface; },
      get fastReads() { return fastReads; },
      get detailedReads() { return detailedReads; },
      get route() { return browser.location.pathname + browser.location.search; }
    };
  }

  await t.test("known incomplete login replaces the URL, dismissal survives reload, and explicit setup can reopen it", async t => {
    const login = mount(t, "?postLoginSetupCheck=1", () => incomplete);
    await until(() => login.surface?.firstRunVisible && login.route === prefix + "first-run", "fresh login opens setup");
    login.surface.completeFirstRun();
    await until(() => !login.surface.firstRunVisible && login.route === prefix + "guid", "dismissal consumes the intent");

    const reload = mount(t, "guid", () => incomplete);
    await until(() => reload.fastReads && reload.surface?.initializationStatus === "ready", "ordinary startup readback");
    assert.equal(reload.surface.firstRunVisible, false);
    assert.equal(reload.detailedReads, 0);
    reload.surface.updatePrompt("draft during ordinary startup");
    await until(() => reload.surface.prompt === "draft during ordinary startup", "the conversation accepts a draft");
    reload.surface.openFirstRun();
    await until(() => reload.surface.firstRunVisible && reload.route === prefix + "first-run", "explicit setup opens");
    reload.surface.completeFirstRun();
    await until(() => !reload.surface.firstRunVisible && reload.route === prefix + "guid", "return to the workbench");
    assert.equal(reload.surface.prompt, "draft during ordinary startup");

    const direct = mount(t, "first-run", () => incomplete);
    await until(() => direct.surface?.firstRunVisible, "a direct authenticated setup visit opens the panel");
  });

  for (const reason of ["timeout", "user input"]) {
    await t.test(`an incomplete startup read after ${reason} leaves the workbench open`, async t => {
      let finish;
      const app = mount(t, "?postLoginSetupCheck=1", () => new Promise(resolve => { finish = resolve; }));
      await until(() => finish && app.route === prefix + "guid", "wait for the pending fast snapshot");
      if (reason === "timeout") {
        const now = app.browser.Date.now();
        app.browser.Date.now = () => now + 20_001;
      } else {
        app.browser.document.dispatchEvent(new app.browser.KeyboardEvent("keydown", { key: "x", bubbles: true }));
      }
      finish(incomplete);
      await until(() => app.surface.initializationStatus === "ready", "the late snapshot still updates setup status");
      assert.equal(app.surface.firstRunVisible, false);
      assert.equal(app.route, prefix + "guid");
    });
  }

  for (const [name, readFast] of [
    ["ready", () => ready],
    ["missing readiness", () => ({})],
    ["failed read", () => { throw new Error("fixture fast read unavailable"); }]
  ]) {
    await t.test(`fresh login with ${name} stays in the ordinary workbench`, async t => {
      const app = mount(t, "?postLoginSetupCheck=1", readFast);
      await until(() => app.fastReads && app.surface && app.route === prefix + "guid", "login intent consumed");
      assert.equal(app.surface.firstRunVisible, false);
      assert.equal(app.detailedReads, 0);
    });
  }
});
