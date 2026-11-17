import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Window } from "happy-dom";

const root = fileURLToPath(new URL("../..", import.meta.url));

test("built renderer reaches the native plugin boot before any product policy exists", async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "opl-boot-policy-"));
  const browser = new Window({ url: "file:///opl/index.html" });
  try {
    const build = spawnSync(process.execPath, [
      path.join(root, "scripts/vite-build-renderer-entry.mjs"),
      path.join(root, "src/main.tsx"), output, "esm"
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(build.status, 0, build.stderr);
    browser.document.write('<!doctype html><html><head></head><body><div id="root"></div></body></html>');
    let bootRequests = 0;
    const failures = [];
    browser.console.error = error => failures.push(error);
    browser.oplStudio = {
      readClientModuleBoot() {
        bootRequests += 1;
        return Promise.reject(new Error("profile fixture unavailable"));
      }
    };
    assert.equal(browser.__OPL_CODEX_MODEL_POLICY__, undefined);
    browser.eval(await fs.readFile(path.join(output, "main.js"), "utf8"));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(bootRequests, 1);
    assert.equal(browser.document.documentElement.dataset.oplHost, "desktop");
    assert.equal(browser.__OPL_CODEX_MODEL_POLICY__, undefined);
    assert.equal(browser.document.getElementById("root").textContent,
      "OPL client boot failed: profile fixture unavailable");
    assert.equal(failures.length, 1);
    assert.match(String(failures[0]), /profile fixture unavailable/);
  } finally {
    await browser.happyDOM.close();
    await fs.rm(output, { recursive: true, force: true });
  }
});
