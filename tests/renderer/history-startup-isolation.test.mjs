import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Window } from "happy-dom";

const root = fileURLToPath(new URL("../..", import.meta.url));

test("history read failures stay local while the live Codex path allows a new session", async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "opl-history-startup-"));
  const browser = new Window({ url: "http://localhost/" });
  try {
    const built = spawnSync(process.execPath, [path.join(root, "scripts/vite-build-renderer-entry.mjs"),
      path.join(root, "tests/renderer/history-startup-isolation.fixture.tsx"), output, "iife"], {
      cwd: root, encoding: "utf8", timeout: 120_000,
      env: process.env
    });
    assert.equal(built.status, 0, built.stderr);
    browser.document.write('<!doctype html><html><head></head><body><div id="root"></div></body></html>');
    browser.structuredClone = structuredClone;
    let sentPrompt;
    browser.oplStudio = {
      readInitialize: async () => ({
        system_initialize: { setup_flow: { is_first_run: false, ready_to_launch: true } },
        readback: { exitCode: 0, timedOut: false }
      }),
      listThreads: () => Promise.reject(new Error("thread/list fixture unavailable")),
      readCodexModels: async () => ({ data: [] }),
      readState: async () => ({
        app_state: { system_initialize: { setup_flow: { ready_to_launch: true } } },
        readback: { exitCode: 0 }
      }),
      sendMessage: request => { sentPrompt = request.prompt; return new Promise(() => {}); },
    };
    browser.eval(await fs.readFile(path.join(output, "history-startup-isolation.fixture.js"), "utf8"));
    const deadline = Date.now() + 10_000;
    while (browser.document.querySelector('[data-history-status="error"][data-codex-status="ready"]') === null && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const surface = browser.historyStartupSurface;
    assert.equal(surface.threadDirectoryStatus, "error");
    assert.match(surface.threadDirectoryError, /thread\/list fixture unavailable/);
    assert.equal(surface.codexConnectionStatus, "ready");
    assert.equal(surface.initializationStatus, "ready");
    assert.equal(browser.document.querySelector("button").disabled, false);
    assert.equal(browser.document.querySelector('[data-testid="opl-codex-recovery"]'), null);
    surface.updatePrompt("Start a new task despite the unavailable history index");
    while (!browser.historyStartupSurface.prompt && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    browser.historyStartupSurface.submitPrompt();
    while (!sentPrompt && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(sentPrompt, "Start a new task despite the unavailable history index");

    browser.oplStudio.readCodexModels = () => Promise.reject(new Error("model/list fixture unavailable"));
    browser.historyStartupSurface.retryCodexConnection();
    while (browser.historyStartupSurface.codexConnectionStatus !== "error" && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(browser.historyStartupSurface.codexConnectionStatus, "error");
    assert.equal(browser.document.querySelector("button").disabled, true);
    assert.match(browser.document.querySelector('[data-testid="opl-codex-recovery"]').textContent, /model\/list fixture unavailable/);
  } finally {
    await browser.happyDOM.close();
    await fs.rm(output, { recursive: true, force: true });
  }
});
